/**
 * Deep wave — ice hockey's live commentary (the broadcast play-by-play):
 * grouped by period (then the shoot-out), newest first, each line the elapsed
 * time in the period ("12:34", as game sheets read), a plain sentence and the
 * running score after every goal. Derived from the event log only (game-time
 * order, a backfilled moment at its own time), so a correction or an undo
 * re-derives it. PURE.
 */
import {
  eventWhen, mmss, penaltyBox, periodLong, periodName, periodOffset, soScore, teamFigures, totalPeriods, ejects, isOvertime,
  FO_ZONE_LABEL, PEN_LABEL, type IceEvent, type IceHockeyState, type Side,
} from './engine.ts';
import { andList, groupLines, newestFirst, scoreText, type FeedGroup, type FeedLine } from '../feedGroups.ts';
import { legacyNameOf, withNames, type NameOf } from '../invasion/names.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export interface Names { home: string; away: string }

/** One event as a sentence (no running score — the feed adds it). */
export function sentence(s: IceHockeyState, e: IceEvent, names: Names, coincident?: Set<string>): { text: string; icon: string; key?: boolean; tags: string[] } {
  const team = names[e.side];
  const opp = names[other(e.side)];
  switch (e.type) {
    case 'goal': {
      const base = e.playerName ? `${e.playerName} scores for ${team}` : `${team} score`;
      const how = [e.ps ? 'on a penalty shot' : e.strength === 'pp' ? 'on the power play' : e.strength === 'sh' ? 'short-handed' : '', e.en ? 'into the empty net' : ''].filter(Boolean).join(' ');
      const assists = e.ps ? '' : e.secondName ? `assisted by ${andList([e.secondName, e.thirdName ?? ''])}` : 'unassisted';
      return { icon: '🚨', text: `GOAL! ${base}${how ? ` ${how}` : ''}${assists ? `, ${assists}` : ''}.`, key: true, tags: ['goal'] };
    }
    case 'shot':
      return e.ps
        ? { icon: '🧤', text: `Penalty shot by ${e.playerName ?? team} — stopped by ${e.gkName ?? `the ${opp} goalie`}.`, key: true, tags: ['shot'] }
        : { icon: '🥅', text: `${e.playerName ? `${e.playerName} (${team})` : team} — shot on goal, saved by ${e.gkName ?? `the ${opp} goalie`}.`, tags: ['shot'] };
    case 'miss':
      return { icon: '↗', text: `Penalty shot by ${e.playerName ?? team} misses the net.`, key: true, tags: ['shot'] };
    case 'pen': {
      const k = e.pen ?? 'minor';
      const who = e.playerName ?? (k === 'bench' ? `${team} bench` : team);
      const what = `${PEN_LABEL[k].toLowerCase()}${e.infraction ? ` for ${e.infraction.toLowerCase()}` : ''}`;
      const manpower = k === 'minor' || k === 'bench' || k === 'double' || k === 'major' || k === 'majorGm' || k === 'match';
      const after = coincident?.has(e.id) ? ' Coincident penalties — no power play.'
        : manpower ? ` ${opp} on the power play.` : '';
      const out = ejects(k) ? ` ${e.playerName ?? 'The player'} is out of the game.` : '';
      return { icon: k === 'major' || k === 'majorGm' ? '🟥' : ejects(k) ? '🚫' : '⏱', text: `${who} (${team}) — ${what}.${after}${out}`, key: k !== 'minor' && k !== 'bench' && k !== 'misconduct' ? true : undefined, tags: ['pen'] };
    }
    case 'gk':
      return { icon: '🧤', text: `${e.playerName ?? 'A new goalie'} in goal for ${team}.`, tags: ['play'] };
    case 'pull':
      return { icon: '🥅', text: `${team} pull the goalie for an extra skater.`, key: true, tags: ['play'] };
    case 'back':
      return { icon: '🧤', text: `${team} goalie back in the net.`, tags: ['play'] };
    case 'timeout':
      return { icon: '⏸', text: `Time-out, ${team}.`, tags: ['play'] };
    case 'tally': {
      const who = e.playerName ? `${e.playerName} (${team})` : team;
      switch (e.tally) {
        // round 2: the zone from the winner's view, as NHL play-by-play reads it ("won Off. Zone")
        case 'faceoff': return { icon: '⚪', text: `${who} win${e.playerName ? 's' : ''} the faceoff${e.secondName ? ` against ${e.secondName}` : ''}${e.zone ? ` in the ${FO_ZONE_LABEL[e.zone].toLowerCase()}` : ''}.`, tags: ['faceoff'] };
        case 'hit': return { icon: '💥', text: `Hit by ${who}.`, tags: ['play'] };
        case 'block': return { icon: '🛡', text: `${who} block${e.playerName ? 's' : ''} a ${opp} shot.`, tags: ['shot'] };
        case 'giveaway': return { icon: '🔄', text: `Giveaway — ${who} lose${e.playerName ? 's' : ''} the puck.`, tags: ['play'] };
        case 'takeaway': return { icon: '🔄', text: `Takeaway — ${who} win${e.playerName ? 's' : ''} the puck.`, tags: ['play'] };
        default: return { icon: '↗', text: `${who} shoot${e.playerName ? 's' : ''} wide.`, tags: ['shot'] };
      }
    }
  }
}

type Entry = { period: number; sec: number; i: number; line: FeedLine };

/** The commentary feed, newest first. */
export function iceHockeyCommentary(s0: IceHockeyState, names: Names, nameOf: NameOf = legacyNameOf): FeedGroup[] {
  const s = withNames(s0, nameOf);
  const coincident = new Set(penaltyBox(s).all.filter((p) => p.coincident).map((p) => p.id));
  const ordered = s.events.map((e, i) => ({ e, i })).sort((x, y) => x.e.period - y.e.period || x.e.sec - y.e.sec || x.i - y.i);
  const score = { home: 0, away: 0 };
  const entries: Entry[] = [];
  for (const { e, i } of ordered) {
    const d = sentence(s, e, names, coincident);
    if (e.type === 'goal') score[e.side] += 1;
    entries.push({
      period: e.period, sec: e.sec, i,
      line: {
        id: e.id, when: mmss(e.sec - periodOffset(s, e.period)), icon: d.icon, text: d.text, side: e.side, tags: d.tags,
        ...(d.key ? { key: true } : {}), ...(e.type === 'goal' ? { score: scoreText(score.home, score.away) } : {}),
      },
    });
  }
  // period ends (completed periods), with the score and shots so far
  const last = s.ended ? s.period : s.period - 1;
  for (let p = 1; p <= last; p++) {
    const upto = s.events.filter((e) => e.type === 'goal' && e.period <= p);
    const h = upto.filter((e) => e.side === 'home').length, a = upto.filter((e) => e.side === 'away').length;
    // shots on goal so far (goals + saved shots, as teamFigures counts them)
    const sh = (sd: Side) => s.events.filter((e) => e.period <= p && e.side === sd && (e.type === 'goal' || e.type === 'shot')).length;
    const final = s.ended && p === s.period;
    const ot = isOvertime(s, p);
    const text = final
      ? `Final${ot && h !== a ? ' (OT)' : ''} — ${names.home} ${scoreText(h, a)} ${names.away}. Shots ${scoreText(sh('home'), sh('away'))}.`
      : `End of the ${periodLong(s, p).toLowerCase()} — ${names.home} ${scoreText(h, a)} ${names.away}. Shots ${scoreText(sh('home'), sh('away'))}.`;
    entries.push({ period: p, sec: Infinity, i: Infinity, line: { id: `end${p}`, icon: final ? '🏁' : '⏲', text, key: true, score: scoreText(h, a), tags: ['period'] } });
  }
  entries.sort((x, y) => x.period - y.period || x.sec - y.sec || x.i - y.i);
  const groups = groupLines(entries, (x) => String(x.period), (first, items) => {
    const p = first.period;
    const f = (sd: Side) => teamFigures(s, sd, p);
    return {
      key: `p${p}`, title: cap(periodLong(s, p)), scope: p,
      sub: `Goals ${scoreText(f('home').goals, f('away').goals)} · Shots ${scoreText(f('home').shotsOnGoal, f('away').shotsOnGoal)}`,
      lines: items.map((x) => x.line),
    };
  });
  // the shoot-out: each attempt in the order taken
  if (s.shootout) {
    const so = s.shootout;
    const order: { side: Side; k: number }[] = [];
    const n = Math.max(so.home.length, so.away.length);
    const firsts = (r: number): Side => (r >= s.soRounds && so.sdFirst ? so.sdFirst : so.first);
    for (let r = 0; r < n; r++) {
      const f = firsts(r);
      for (const sd of [f, other(f)]) if (so[sd][r]) order.push({ side: sd, k: r });
    }
    const run = { home: 0, away: 0 };
    const lines: FeedLine[] = order.map(({ side, k }) => {
      const shot = so[side][k];
      if (shot.scored) run[side] += 1;
      const who = shot.playerName ? `${shot.playerName} (${names[side]})` : names[side];
      const verb = shot.scored ? (shot.playerName ? 'scores' : 'score') : (shot.playerName ? 'is stopped' : 'are stopped');
      return {
        id: `so-${side}-${k}`, when: `#${k + 1}`, icon: shot.scored ? '🚨' : '🧤', side, tags: ['goal'],
        text: `${who} ${verb}${k >= s.soRounds ? ' — sudden death' : ''}.`,
        score: scoreText(run.home, run.away),
      };
    });
    if (s.shootoutWinner) {
      const sc = soScore(s);
      lines.push({ id: 'so-end', icon: '🏆', key: true, side: s.shootoutWinner, tags: ['period'], text: `${names[s.shootoutWinner]} win the shoot-out ${scoreText(sc.home, sc.away)}.` });
    }
    if (lines.length) groups.push({ key: 'so', title: 'Shoot-out', sub: `${scoreText(soScore(s).home, soScore(s).away)}`, lines });
  }
  return newestFirst(groups);
}

/** Scope chip labels (P1 / P2 / OT). */
export const iceScopeLabel = (s: IceHockeyState) => (p: number): string => (p <= totalPeriods(s) || p <= s.period ? periodName(s, p) : `P${p}`);

/** The commentary's tag chips. */
export const ICE_FEED_TAGS = [
  { key: 'key', label: 'Key moments' }, { key: 'goal', label: 'Goals' }, { key: 'pen', label: 'Penalties' },
  { key: 'shot', label: 'Shots' }, { key: 'faceoff', label: 'Faceoffs' },
];

/** "P2 12:34" for a line id — kept for callers that want the game-sheet stamp. */
export const whenOf = (s: IceHockeyState, e: IceEvent): string => eventWhen(s, e);
