/**
 * Rugby league's live commentary (the broadcast play-by-play): grouped by
 * half and golden point, newest first, each line the minute as league reports
 * it ("23'", "80'", golden point "83'"), a plain sentence and the running
 * score after every score. With six-tackle sets tracked, the set endings that
 * matter join in (errors, penalties, handovers on the last tackle, six
 * agains — not every kick, there are dozens). Derived from the event and set
 * logs only, so a correction or an undo re-derives it. PURE.
 */
import {
  isGoldenPoint, minuteText, periodLong, periodName, playedOffset, pointsOf, teamFigures, totalPeriods, tracked, walkSets,
  DETAIL_LABEL, type LeagueEvent, type LeagueSet, type LeagueState, type Side,
} from './engine.ts';
import { setFigures } from './sets.ts';
import { groupLines, newestFirst, scoreText, type FeedGroup, type FeedLine } from '../feedGroups.ts';
import { legacyNameOf, withNames, type NameOf } from '../invasion/names.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export interface Names { home: string; away: string }

/** One event as a sentence (no running score — the feed adds it). Tags:
 *  score, disc (discipline), sub, detail. */
export function sentence(s: LeagueState, e: LeagueEvent, names: Names): { text: string; icon: string; key?: boolean; tags: string[] } {
  const team = names[e.side];
  const who = e.playerName ? `${e.playerName} (${team})` : team;
  switch (e.type) {
    case 'try':
      return { icon: '🏉', key: true, tags: ['score'],
        text: `TRY! ${e.playerName ? `${e.playerName} scores for ${team}` : `${team} score`}${e.bonus ? ' in the bonus zone — 5 points' : ''}${e.secondName ? `, assisted by ${e.secondName}` : ''}.` };
    case 'pentry':
      return { icon: '🏉', key: true, tags: ['score'], text: `PENALTY TRY to ${team} — 4 points; the conversion is taken from in front of the posts.` };
    case 'kick': {
      const k = e.kick ?? 'pen';
      if (k === 'conv') {
        const text = e.playerName ? `Conversion by ${e.playerName} ${e.made ? 'is good' : 'misses'}.` : e.made ? `${team} convert.` : `${team} miss the conversion.`;
        return { icon: e.made ? '🎯' : '↗', text, ...(e.made ? { key: true } : {}), tags: ['score'] };
      }
      if (k === 'fg') {
        const what = e.two ? '2-POINT FIELD GOAL' : 'FIELD GOAL';
        const text = e.made
          ? (e.playerName ? `${what}! ${e.playerName} ${e.two ? 'lands one from 40 metres' : 'slots a one-pointer'} for ${team}.` : `${what} to ${team}.`)
          : (e.playerName ? `Field goal attempt by ${who} misses.` : `${team} miss a field goal attempt.`);
        return { icon: e.made ? '🦶' : '↗', text, ...(e.made ? { key: true } : {}), tags: ['score'] };
      }
      const text = e.made
        ? (e.playerName ? `Penalty goal by ${who} is good.` : `Penalty goal to ${team}.`)
        : (e.playerName ? `Penalty goal attempt by ${who} misses.` : `${team} miss a penalty goal attempt.`);
      return { icon: e.made ? '🎯' : '↗', text, ...(e.made ? { key: true } : {}), tags: ['score'] };
    }
    case 'sanction':
      if (e.sanction === 'sinBin') return { icon: '⏱', key: true, tags: ['disc'], text: `Sin bin: ${who} — ${s.sinBinMinutes} minutes, ${team} play a player short.` };
      if (e.sanction === 'sendOff') return { icon: '🟥', key: true, tags: ['disc'], text: `Sent off: ${who} — ${team} play a player short for the rest of the match.` };
      return { icon: '📝', tags: ['disc'], text: `${who} placed on report.` };
    case 'sub': {
      const on = e.secondName ?? 'a replacement';
      const off = e.playerName ?? 'a player';
      if (e.temp === 'hia') return { icon: '🩺', tags: ['sub'], text: `HIA: ${off} off for a head injury assessment, ${on} on for ${team} (doesn't count as an interchange).` };
      if (e.temp === 'blood') return { icon: '🩸', tags: ['sub'], text: `Blood bin for ${team}: ${on} on for ${off} (temporary).` };
      if (e.back) return { icon: '↩', tags: ['sub'], text: `${on} back on for ${team}, ${off} off.` };
      if (!e.playerId && !e.playerName) return { icon: '🔁', tags: ['sub'], text: `${on} comes on for ${team}.` };
      return { icon: '🔁', tags: ['sub'], text: `Interchange for ${team}: ${on} on for ${off}.` };
    }
    case 'detail': {
      const d = e.detail ?? 'tackle';
      if (d === 'error') return { icon: '✋', tags: ['disc'], text: `Error by ${who}.` };
      if (d === 'penalty') return { icon: '⚖', tags: ['disc'], text: `Penalty conceded by ${who}.` };
      return { icon: '📋', tags: ['detail'], text: `${DETAIL_LABEL[d]} by ${who}.` };
    }
  }
}

/** A set ending worth a line (errors, penalties, last-tackle handovers, six
 *  agains), with the player when the same tap named one. */
function setSentence(x: LeagueSet, names: Names, by?: LeagueEvent): { text: string; icon: string; key?: boolean } | null {
  const team = names[x.side];
  const opp = names[other(x.side)];
  const on = x.tackles ? ` on tackle ${x.tackles}` : ' on the first play';
  const who = by?.playerName ? ` (${by.playerName})` : '';
  switch (x.end) {
    case 'error': return { icon: '✋', text: `Error${who} — ${team} lose the ball${on}. ${opp} ball.` };
    case 'penalty': return { icon: '⚖', text: `Penalty against ${team}${who}${on}. ${opp} ball.` };
    case 'sixth': return { icon: '🔄', text: `${team} are tackled on the last — handover to ${opp}.` };
    case 'restart': return { icon: '🔁', text: `Six again — a fresh set for ${team}.` };
    // invasion batch 5: a penalty against the defence (the defender when named)
    case 'penWon': return { icon: '⚖', text: `Penalty to ${team}${by?.playerName ? ` — conceded by ${by.playerName} (${opp})` : ` — conceded by ${opp}`}${on}. ${team} keep the ball, a fresh set.` };
    default: return null;
  }
}

/** The line closing period `p` (half-time, full time, what follows). */
function periodEndText(s: LeagueState, p: number, h: number, a: number, names: Names): string {
  const score = `${names.home} ${scoreText(h, a)} ${names.away}`;
  const final = s.ended && p === s.period;
  const gp = s.goldenTry ? 'golden try' : 'golden point';
  if (final) {
    if (isGoldenPoint(s, p) && h !== a) return `Full time — ${names[h > a ? 'home' : 'away']} win it in ${gp}: ${score}.`;
    return `Full time${s.plan.length > 2 ? ` (after ${gp})` : ''} — ${score}.${h === a ? ' The draw stands.' : ''}`;
  }
  const next = s.plan[p];
  if (!isGoldenPoint(s, p)) {
    if (next === 'reg') return `Half-time — ${score}.`;
    return `End of normal time — ${score}. Level: ${gp} extra time follows.`;
  }
  return `End of ${gp} period ${s.plan.slice(0, p).filter((x) => x === 'gp').length} — ${score}. Still level: ends change, play goes on.`;
}

type Entry = { period: number; sec: number; i: number; line: FeedLine };

/** The commentary feed, newest first. */
export function leagueCommentary(s0: LeagueState, names: Names, nameOf: NameOf = legacyNameOf): FeedGroup[] {
  const s = withNames(s0, nameOf);
  const ordered = s.events.map((e, i) => ({ e, i })).sort((x, y) => x.e.period - y.e.period || x.e.sec - y.e.sec || x.i - y.i);
  const { sets } = walkSets(s);
  const byId = new Map(s.events.map((e) => [e.id, e]));
  const merged = new Set(sets.map((x) => x.det).filter((x): x is string => !!x));
  const score = { home: 0, away: 0 };
  const entries: Entry[] = [];
  for (const { e, i } of ordered) {
    if (merged.has(e.id)) continue; // told with its set ending
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
  sets.forEach((x, k) => {
    const by = x.det ? byId.get(x.det) : undefined;
    const d = setSentence(x, names, by);
    if (!d) return;
    const at = x.to ?? x.from;
    entries.push({
      period: x.period, sec: at, i: -1,
      line: { id: `set${k}`, when: minuteText(s, x.period, at - playedOffset(s, x.period)), icon: d.icon, text: d.text, side: x.side, tags: ['sets', ...(by ? ['disc'] : [])] },
    });
  });
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
  const setsOn = tracked(s, 'trackSets');
  const groups = groupLines(entries, (x) => String(x.period), (first, items) => {
    const p = first.period;
    const f = (sd: Side) => teamFigures(s, sd, p);
    const done = (sd: Side) => { const g = setFigures(s, sd, p); return g.decided ? `${g.completed}/${g.decided}` : '–'; };
    return {
      key: `p${p}`, title: cap(periodLong(s, p)), scope: p,
      sub: `Points ${scoreText(f('home').points, f('away').points)} · Tries ${scoreText(f('home').tries, f('away').tries)}${setsOn ? ` · Completions ${done('home')} – ${done('away')}` : ''}`,
      lines: items.map((x) => x.line),
    };
  });
  return newestFirst(groups);
}

/** Scope chip labels (H1 / H2 / GP1 …). */
export const leagueScopeLabel = (s: LeagueState) => (p: number): string => (p <= totalPeriods(s) ? periodName(s, p) : `P${p}`);

/** The commentary's tag chips. */
export const LEAGUE_FEED_TAGS = [
  { key: 'key', label: 'Key moments' }, { key: 'score', label: 'Scores' }, { key: 'disc', label: 'Discipline' },
  { key: 'sets', label: 'Sets' }, { key: 'detail', label: 'Detail' }, { key: 'sub', label: 'Interchanges' },
];
