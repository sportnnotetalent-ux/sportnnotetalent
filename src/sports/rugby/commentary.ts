/**
 * Deep wave — rugby's live commentary (the broadcast play-by-play): grouped
 * by period (1st half, 2nd half, extra time, sudden death, then the kicking
 * competition), newest first, each line the minute as rugby reports it
 * ("23'", "40+2'"), a plain sentence and the running score after every score.
 * Derived from the event log only (game order, a backfilled moment at its own
 * time), so a correction or an undo re-derives it. PURE.
 */
import {
  isSuddenDeath, kicksAfter, levelAtEnd, minuteText, periodLong, periodName, pointsOf, soScore, teamFigures, totalPeriods,
  DETAIL_LABEL, type Infringement, type RugbyEvent, type RugbyState, type Side, type TurnoverCause,
} from './engine.ts';
import { groupLines, newestFirst, scoreText, type FeedGroup, type FeedLine } from '../feedGroups.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export interface Names { home: string; away: string }

/** A penalty's offence and a turnover's cause as the sentence reads them. */
const OFFENCE_TEXT: Record<Infringement, string> = {
  offside: 'offside', breakdown: 'ruck / breakdown offence', notReleasing: 'not releasing', foulPlay: 'high tackle / foul play',
  scrum: 'scrum offence', lineout: 'lineout / maul offence', obstruction: 'obstruction', other: 'other offence',
};
const CAUSE_TEXT: Record<TurnoverCause, string> = {
  knockOn: 'knock-on', forwardPass: 'forward pass', handling: 'handling error', breakdown: 'lost at the ruck / maul', kickOut: 'kicked out on the full', other: 'other',
};

/** One event as a sentence (no running score — the feed adds it). Tags:
 *  score, card, set (set piece), disc (discipline), detail, sub. */
export function sentence(s: RugbyState, e: RugbyEvent, names: Names): { text: string; icon: string; key?: boolean; tags: string[] } {
  const team = names[e.side];
  const opp = names[other(e.side)];
  const who = e.playerName ? `${e.playerName} (${team})` : team;
  switch (e.type) {
    case 'try':
      return { icon: '🏉', key: true, tags: ['score'],
        text: `TRY! ${e.playerName ? `${e.playerName} scores for ${team}` : `${team} score`}${e.secondName ? `, assisted by ${e.secondName}` : ''}.` };
    case 'pentry':
      return { icon: '🏉', key: true, tags: ['score'], text: `PENALTY TRY to ${team} — 7 points, no conversion.` };
    case 'kick': {
      const k = e.kick ?? 'pen';
      if (k === 'conv') {
        const text = e.playerName ? `Conversion by ${e.playerName} ${e.made ? 'is good' : 'misses'}.` : e.made ? `${team} convert.` : `${team} miss the conversion.`;
        return { icon: e.made ? '🎯' : '↗', text, ...(e.made ? { key: true } : {}), tags: ['score'] };
      }
      if (k === 'drop') {
        const text = e.made
          ? (e.playerName ? `DROP GOAL! ${e.playerName} drops a goal for ${team}.` : `DROP GOAL to ${team}.`)
          : (e.playerName ? `Drop goal attempt by ${who} misses.` : `${team} miss a drop goal attempt.`);
        return { icon: e.made ? '🦶' : '↗', text, ...(e.made ? { key: true } : {}), tags: ['score'] };
      }
      const text = e.made
        ? (e.playerName ? `Penalty goal by ${who} is good.` : `Penalty goal to ${team}.`)
        : (e.playerName ? `Penalty goal attempt by ${who} misses.` : `${team} miss a penalty goal attempt.`);
      return { icon: e.made ? '🎯' : '↗', text, ...(e.made ? { key: true } : {}), tags: ['score'] };
    }
    case 'card': {
      const yellow = e.card === 'yellow';
      if (e.official) return { icon: yellow ? '🟨' : '🟥', key: true, tags: ['card'], text: `${yellow ? 'Yellow' : 'Red'} card to ${e.official} (${team} official).` };
      if (yellow) return { icon: '🟨', key: true, tags: ['card'], text: `Yellow card: ${who} — ${s.sinBinMinutes} minutes in the sin-bin.` };
      const after = e.red20 ? `off for the match; ${team} may bring on a replacement after 20 minutes` : 'sent off';
      const text = e.second ? `Second yellow for ${who} — ${e.red20 ? '20-minute ' : ''}red card, ${after}.`
        : e.red20 ? `20-minute red card: ${who} — ${after}.` : `Red card: ${who} — ${after}.`;
      return { icon: '🟥', key: true, tags: ['card'], text };
    }
    case 'sub': {
      const on = e.secondName ?? 'a replacement';
      const off = e.playerName ?? 'a player';
      if (e.temp === 'hia') return { icon: '🩺', tags: ['sub'], text: `HIA: ${off} off for a head injury assessment, ${on} on for ${team} (temporary).` };
      if (e.temp === 'blood') return { icon: '🩸', tags: ['sub'], text: `Blood replacement for ${team}: ${on} on for ${off} (temporary).` };
      if (e.back) return { icon: '↩', tags: ['sub'], text: `${on} back on for ${team}, ${off} off.` };
      if (!e.playerId && !e.playerName) return { icon: '🔁', tags: ['sub'], text: `${on} comes on for ${team}.` };
      return { icon: '🔁', tags: ['sub'], text: `Replacement for ${team}: ${on} on for ${off}.` };
    }
    case 'detail': {
      const d = e.detail ?? 'tackle';
      return { icon: d === 'penaltyConceded' ? '⚖' : '📋', tags: [d === 'penaltyConceded' ? 'disc' : 'detail'], text: `${DETAIL_LABEL[d]} by ${who}.` };
    }
    case 'setpiece': {
      const piece = e.piece === 'scrum' ? 'scrum' : 'lineout';
      const text = e.won ? `${team} win their ${piece}.`
        : `${team} lose their ${piece} — ${opp} ${piece === 'lineout' ? 'steal it' : 'win it against the feed'}.`;
      return { icon: piece === 'scrum' ? '🤼' : '🙌', tags: ['set'], text };
    }
    case 'tally':
      switch (e.tally) {
        case 'penalty': return { icon: '⚖', tags: ['disc'], text: `Penalty conceded by ${who}${e.infringement ? ` — ${OFFENCE_TEXT[e.infringement]}` : ''}.` };
        case 'freeKick': return { icon: '🏳', tags: ['disc'], text: `Free kick against ${team}${e.playerName ? ` — conceded by ${e.playerName}` : ''}.` };
        case 'turnover': return { icon: '🔄', tags: ['detail'], text: `Turnover conceded by ${who}${e.cause ? ` — ${CAUSE_TEXT[e.cause]}` : ''}.` };
        case 'entry': return { icon: '⏩', tags: ['detail'], text: `${team} get into the ${opp} 22.` };
        default: return { icon: '🤲', tags: ['detail'], text: `Offload by ${who}.` };
      }
  }
}

/** The line closing period `p` (half-time, full time, what follows). */
function periodEndText(s: RugbyState, p: number, h: number, a: number, names: Names): string {
  const score = `${names.home} ${scoreText(h, a)} ${names.away}`;
  const kind = s.plan[p - 1] ?? 'reg';
  const nthOf = s.plan.slice(0, p).filter((x) => x === kind).length;
  const final = s.ended && p === s.period;
  if (final) {
    if (isSuddenDeath(s, p) && h !== a) return `Full time — ${names[h > a ? 'home' : 'away']} win it in sudden death: ${score}.`;
    const aet = s.plan.length > 2 ? ' (after extra time)' : '';
    const kicks = s.shootout || (levelAtEnd(s) && kicksAfter(s.decider)) ? ' Level — a kicking competition decides it.' : '';
    return `Full time${aet} — ${score}.${kicks}`;
  }
  const lastOfKind = s.plan[p] !== kind;
  const next = s.plan[p];
  const follows = !next ? '' : next === 'et' && kind !== 'et' ? ' Extra time follows.' : next === 'sd' ? (kind === 'sd' ? ' Another sudden-death period follows.' : ' Sudden death follows.') : '';
  if (kind === 'reg') return nthOf === 1 && !lastOfKind ? `Half-time — ${score}.` : `End of normal time — ${score}.${follows}`;
  if (kind === 'et') return nthOf === 1 ? `End of the first half of extra time — ${score}.` : `End of extra time — ${score}.${follows}`;
  return `End of sudden death${s.plan.filter((x) => x === 'sd').length > 1 ? ` period ${nthOf}` : ''} — ${score}.${follows}`;
}

type Entry = { period: number; sec: number; i: number; line: FeedLine };

/** The commentary feed, newest first. */
export function rugbyCommentary(s: RugbyState, names: Names): FeedGroup[] {
  const ordered = s.events.map((e, i) => ({ e, i })).sort((x, y) => x.e.period - y.e.period || x.e.sec - y.e.sec || x.i - y.i);
  const score = { home: 0, away: 0 };
  const entries: Entry[] = [];
  for (const { e, i } of ordered) {
    const d = sentence(s, e, names);
    const pts = pointsOf(e);
    if (pts) score[e.side] += pts;
    entries.push({
      period: e.period, sec: e.sec, i,
      line: {
        id: e.id, when: minuteText(s, e.period, e.psec), icon: d.icon, text: d.text, side: e.side, tags: d.tags,
        ...(d.key ? { key: true } : {}), ...(pts ? { score: scoreText(score.home, score.away) } : {}),
      },
    });
  }
  // the end of each completed period: half-time, full time, what follows
  const last = s.ended ? s.period : s.period - 1;
  for (let p = 1; p <= last; p++) {
    const pts = (sd: Side) => s.events.filter((e) => e.side === sd && e.period <= p).reduce((t, e) => t + pointsOf(e), 0);
    const h = pts('home'), a = pts('away');
    const final = s.ended && p === s.period;
    entries.push({
      period: p, sec: Infinity, i: Infinity,
      line: { id: `end${p}`, icon: final ? '🏁' : '⏲', text: periodEndText(s, p, h, a, names), key: true, score: scoreText(h, a), tags: ['period'] },
    });
  }
  entries.sort((x, y) => x.period - y.period || x.sec - y.sec || x.i - y.i);
  const groups = groupLines(entries, (x) => String(x.period), (first, items) => {
    const p = first.period;
    const f = (sd: Side) => teamFigures(s, sd, p);
    return {
      key: `p${p}`, title: cap(periodLong(s, p)), scope: p,
      sub: `Points ${scoreText(f('home').points, f('away').points)} · Tries ${scoreText(f('home').tries, f('away').tries)}`,
      lines: items.map((x) => x.line),
    };
  });
  // the kicking competition: each kick in the order taken (5 each, then one each)
  if (s.shootout) {
    const so = s.shootout;
    const order: { side: Side; k: number }[] = [];
    const n = Math.max(so.home.length, so.away.length);
    for (let r = 0; r < n; r++) {
      const f = r >= 5 && so.sdFirst ? so.sdFirst : so.first;
      for (const sd of [f, other(f)]) if (so[sd][r]) order.push({ side: sd, k: r });
    }
    const run = { home: 0, away: 0 };
    const lines: FeedLine[] = order.map(({ side, k }) => {
      const kick = so[side][k];
      if (kick.scored) run[side] += 1;
      const who = kick.playerName ? `${kick.playerName} (${names[side]})` : names[side];
      return {
        id: `so-${side}-${k}`, when: `#${k + 1}`, icon: kick.scored ? '🎯' : '↗', side, tags: ['score'],
        text: `${who} ${kick.scored ? (kick.playerName ? 'kicks it over' : 'kick it over') : (kick.playerName ? 'misses' : 'miss')}${k >= 5 ? ' — sudden death' : ''}.`,
        score: scoreText(run.home, run.away),
      };
    });
    if (s.shootoutWinner) {
      const sc = soScore(s);
      const w = s.shootoutWinner;
      // the winner's kicks first, as the result reads ("Wolves win … 3–0")
      lines.push({ id: 'so-end', icon: '🏆', key: true, side: w, tags: ['period'], text: `${names[w]} win the kicking competition ${scoreText(sc[w], sc[other(w)])}.` });
    }
    if (lines.length) groups.push({ key: 'so', title: 'Kicking competition', sub: scoreText(soScore(s).home, soScore(s).away), lines });
  }
  return newestFirst(groups);
}

/** Scope chip labels (H1 / H2 / ET1 / SD). */
export const rugbyScopeLabel = (s: RugbyState) => (p: number): string => (p <= totalPeriods(s) ? periodName(s, p) : `P${p}`);

/** The commentary's tag chips. */
export const RUGBY_FEED_TAGS = [
  { key: 'key', label: 'Key moments' }, { key: 'score', label: 'Scores' }, { key: 'card', label: 'Cards' },
  { key: 'set', label: 'Set piece' }, { key: 'disc', label: 'Discipline' }, { key: 'detail', label: 'Detail' }, { key: 'sub', label: 'Replacements' },
];
