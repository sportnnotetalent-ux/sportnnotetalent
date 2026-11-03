/**
 * Deep wave — baseball / softball's live commentary (the broadcast
 * play-by-play, MLB Gameday / WBSC style): grouped by HALF-INNING ("Top 3rd",
 * with "2 runs, 3 hits, 0 errors, 1 left on base"), newest first. Each plate
 * appearance is one sentence from the outcome, where the ball went (the
 * scorer's zone or the fielders' notation) and the runner moves ("Rao singles
 * to left. Iyer scores."), the count and pitches on a walk / strikeout when
 * pitch by pitch is on; runner plays, pitching changes, subs and ejections
 * have their own lines; the running score (visitors first, as baseball reads)
 * follows every run; end-of-half lines ("Middle of the 3rd: …", "End of the
 * 3rd: …") and the final. Derived from the event log only (log order, a
 * correction at its own place), so a correction or an undo re-derives it. PURE.
 * Round 2: a batted-ball type the scorer TAPPED shapes the sentence ("hits a
 * line-drive single", "lines out", "pops out"); a type only implied by the out
 * changes nothing (the outcome already says it), so older games read the same.
 */
import {
  HITS, halfLong, inningOf, isTop, battingSide, lastInning, withAnn, zoneOf, PITCH_TYPE_LABEL, D3_WORDS,
  type Ann, type BaseballEvent, type BaseballState, type BattedBall, type Move, type Side, type Zone,
} from './engine.ts';
import { andList, groupLines, newestFirst, nth, plural, scoreText, type FeedGroup, type FeedLine } from '../feedGroups.ts';
import { withNames } from './names.ts';
import { legacyNameOf, type NameOf } from '../../core/playerNames.ts';

export interface Names { home: string; away: string }

const BASE = ['home', '1st', '2nd', '3rd', 'home'];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** where the ball went, as commentary says it */
const DIR: Record<Zone, string> = {
  LF: 'to left', LC: 'to left-centre', CF: 'to centre', RC: 'to right-centre', RF: 'to right',
  '3B': 'to third', SS: 'to short', '2B': 'to second', '1B': 'to first', P: 'back to the pitcher', C: 'in front of the plate',
};
/** the fielder who first played the ball */
const POS_WORD: Record<number, string> = {
  1: 'pitcher', 2: 'catcher', 3: 'first baseman', 4: 'second baseman', 5: 'third baseman', 6: 'shortstop', 7: 'left fielder', 8: 'centre fielder', 9: 'right fielder', 10: 'short fielder',
};
/** the fielders the ball went on to ("shortstop to second to first") */
const TO_WORD: Record<number, string> = { 1: 'pitcher', 2: 'catcher', 3: 'first', 4: 'second', 5: 'third', 6: 'short', 7: 'left', 8: 'centre', 9: 'right', 10: 'short field' };

const fieldersOf = (f?: string): number[] => (f && !/^E/i.test(f.trim()) ? (f.match(/\d{1,2}/g) ?? []).map(Number).filter((n) => n >= 1 && n <= 10) : []);
/** "shortstop to second to first" */
const chainText = (ns: number[]): string => [POS_WORD[ns[0]], ...ns.slice(1).map((n) => TO_WORD[n])].join(' to ');
const dirOf = (e: BaseballEvent): string => { const z = zoneOf(e); return z ? ` ${DIR[z]}` : ''; };
const onPitch = (e: BaseballEvent): string => (e.ptype ? ` on a ${PITCH_TYPE_LABEL[e.ptype].toLowerCase()}` : '');
const who = (m: Move): string => m.name ?? `the runner on ${BASE[m.from]}`;
/** round 2: a tapped batted-ball type as an adjective ("a line-drive single") */
const BB_ADJ: Record<BattedBall, string> = { GB: 'ground-ball', LD: 'line-drive', FB: 'fly-ball', PU: 'pop-up' };
/** a hit's sentence with a tapped type: "Rao hits a line-drive double to left" */
const typedHit = (b: string, e: BaseballEvent, what: string): string => `${b} hits a ${BB_ADJ[e.btype!]} ${what}${dirOf(e)}${onPitch(e)}`;
/** the verb of an air out / double play by the tapped type */
const AIR_VERB: Record<BattedBall, string> = { GB: 'grounds', LD: 'lines', FB: 'flies', PU: 'pops' };

/** The runner moves of a play as sentences: "Iyer and Rao score. Khan to 3rd. Das out at 2nd." */
export function runnerText(moves: Move[], runs: number, opts: { batter?: boolean } = {}): string {
  const ms = [...moves].filter((m) => (opts.batter ? true : m.from !== 0)).sort((a, b) => b.from - a.from);
  const scorers = ms.filter((m) => m.to === 4).slice(0, Math.max(0, runs));
  const out: string[] = [];
  if (scorers.length) out.push(`${cap(andList(scorers.map(who)))} score${scorers.length === 1 ? 's' : ''}.`);
  for (const m of ms) {
    if (m.to === 4 || m.to === m.from) continue;
    if (m.to === -1) out.push(`${cap(who(m))} out at ${BASE[Math.min(4, m.from + 1)]}.`);
    else out.push(`${cap(who(m))} to ${BASE[m.to]}.`);
  }
  return out.join(' ');
}

/** the base a batter reaches on the outcome by itself */
const NATURAL: Partial<Record<string, number>> = { '1B': 1, '2B': 2, '3B': 3, HR: 4, BB: 1, IBB: 1, HBP: 1, E: 1, FC: 1, CI: 1 };

/** One plate appearance as a sentence (no runner moves). */
export function paSentence(s: BaseballState, e: BaseballEvent, a?: Ann): string {
  const b = e.batter?.name ?? 'The batter';
  const f = e.fielders ? ` (${e.fielders})` : '';
  const ns = fieldersOf(e.fielders);
  // the count before the last pitch and the pitches seen — only when the pitches were tapped
  // (a walk / strikeout entered straight from the outcome pad has none)
  const count = s.cfg.pitches && a && (a.np ?? 0) >= 2 ? ` (${a.balls}-${a.strikes}, ${plural(a.np!, 'pitch', 'pitches')})` : '';
  const rbi = e.rbi ?? 0;
  switch (e.outcome) {
    case '1B': return e.btype ? `${typedHit(b, e, 'single')}.` : `${b} singles${dirOf(e)}${onPitch(e)}.`;
    case '2B': return e.btype ? `${typedHit(b, e, 'double')}.` : `${b} doubles${dirOf(e)}${onPitch(e)}.`;
    case '3B': return e.btype ? `${typedHit(b, e, 'triple')}.` : `${b} triples${dirOf(e)}${onPitch(e)}.`;
    case 'HR': return rbi >= 4 || (a?.runs ?? 0) >= 4
      ? (e.btype ? `${typedHit(b, e, 'grand slam')}!` : `${b} hits a grand slam${dirOf(e)}${onPitch(e)}!`)
      : `${e.btype ? typedHit(b, e, 'home run') : `${b} homers${dirOf(e)}${onPitch(e)}`}${rbi >= 2 ? ` — ${rbi} RBI` : ''}.`;
    case 'BB': return `${b} walks${count}.`;
    case 'IBB': return `${b} is intentionally walked.`;
    case 'HBP': return `${b} is hit by ${e.ptype ? `a ${PITCH_TYPE_LABEL[e.ptype].toLowerCase()}` : 'a pitch'}.`;
    case 'K': return `${b} strikes out ${e.pitch === 'called' ? 'looking' : e.pitch === 'foul' ? 'on a two-strike foul' : 'swinging'}${onPitch(e)}${count}${e.d3 ? ` but reaches first on ${D3_WORDS[e.d3]} (dropped third strike)` : ''}.`;
    // US batch 6
    case 'CI': return `${b} reaches on catcher's interference (E2).`;
    case 'TP': return `${b} ${e.btype ? AIR_VERB[e.btype] : 'grounds'} into a triple play${ns.length >= 2 ? `, ${chainText(ns)}` : dirOf(e)}${f}!`;
    case 'GO':
      if (ns.length >= 2) return `${b} grounds out, ${chainText(ns)}${f}.`;
      if (ns.length === 1) return `${b} grounds out to ${TO_WORD[ns[0]]}, unassisted${f}.`;
      return `${b} grounds out${dirOf(e)}.`;
    case 'FO': {
      const infield = ns.length ? ns[0] <= 6 : (['3B', 'SS', '2B', '1B', 'P', 'C'] as (Zone | undefined)[]).includes(zoneOf(e));
      return `${b} ${e.btype ? AIR_VERB[e.btype] : infield ? 'pops' : 'flies'} out${dirOf(e)}${f}.`;
    }
    case 'LO': return `${b} lines out${dirOf(e)}${f}.`;
    case 'SF': return `${b} hits a sacrifice fly${dirOf(e)}${f}.`;
    case 'SH': return `${b} lays down a sacrifice bunt${ns.length >= 2 ? `, ${chainText(ns)}` : ''}${f}.`;
    case 'DP': return `${b} ${e.btype ? AIR_VERB[e.btype] : 'grounds'} into a double play${ns.length >= 2 ? `, ${chainText(ns)}` : dirOf(e)}${f}.`;
    case 'FC': return `${b} reaches on a fielder's choice${ns.length ? `, ${chainText(ns)}` : dirOf(e)}${f}.`;
    case 'E': {
      const n = /^E(\d{1,2})$/i.exec(e.fielders?.trim() ?? '');
      return `${b} reaches on ${n ? `an error by the ${POS_WORD[Number(n[1])] ?? 'fielder'}` : 'an error'}${f}.`;
    }
    default: return `${b} bats.`;
  }
}

/** A runner play as a sentence. */
export function runnerSentence(e: BaseballEvent, runs: number): string {
  const ms = e.moves ?? [];
  const m = ms[0];
  const rest = (skip: Move | undefined) => runnerText(ms.filter((x) => x !== skip), runs - (skip?.to === 4 ? 1 : 0));
  const tail = (t: string) => (t ? ` ${t}` : '');
  switch (e.kind) {
    case 'SB': return m ? `${cap(who(m))} steals ${m.to === 4 ? 'home' : BASE[m.to]}.${tail(rest(m))}` : 'Stolen base.';
    case 'CS': return m ? `${cap(who(m))} is caught stealing ${BASE[Math.min(4, m.from + 1)]}.${tail(rest(m))}` : 'Caught stealing.';
    case 'PO': return m ? `${cap(who(m))} is picked off ${BASE[m.from]}.${tail(rest(m))}` : 'Picked off.';
    case 'WP': return `Wild pitch.${tail(runnerText(ms, runs))}`;
    case 'PB': return `Passed ball.${tail(runnerText(ms, runs))}`;
    case 'BK': return `Balk.${tail(runnerText(ms, runs))}`;
    case 'OUT': return m ? `${cap(who(m))} is out on the bases.${tail(rest(m))}` : 'Runner out.';
    default: return runnerText(ms, runs) || 'Runners advance.';
  }
}

type Entry = { half: number; line: FeedLine };

const ICON: Partial<Record<string, string>> = { '1B': '⚾', '2B': '⚾', '3B': '⚾', HR: '💥', BB: '🚶', IBB: '🚶', HBP: '🤕', K: 'K', E: '⚠️', DP: '✌️', CI: '⚠️', TP: '✌️' };

/** "Owls 2, Hawks 1" — visitors first, as a line score reads. */
const scoreWords = (names: Names, sc: { home: number; away: number }) => `${names.away} ${sc.away}, ${names.home} ${sc.home}`;
/** the running score after a run: "2–1" (visitors–home) */
const scoreChip = (sc: { home: number; away: number }) => scoreText(sc.away, sc.home);

/** The commentary feed, newest first. IDs-only scoring: the players are
 *  named by id for this viewer (`nameOf` — names.ts `withNames`; with no
 *  lookup an older log reads exactly as before). */
export function baseballCommentary(state: BaseballState, names: Names, nameOf: NameOf = legacyNameOf): FeedGroup[] {
  const s = withNames(withAnn(state), nameOf);
  const g = s.g;
  const entries: Entry[] = [];
  const team = (sd?: Side) => (sd ? names[sd] : '');
  // the half of the last play (a sub after the final out stays with it)
  let lastPlay = -1;
  for (const e of s.events) { const a = g.ann[e.id]; if (a && !a.ignored && (e.type === 'pa' || e.type === 'runner' || e.type === 'pitch')) lastPlay = Math.max(lastPlay, a.half); }
  for (const e of s.events) {
    const ann = g.ann[e.id];
    if (!ann || ann.ignored || e.type === 'pitch' || e.type === 'er') continue;
    const a = g.ended && lastPlay >= 0 && ann.half > lastPlay ? { ...ann, half: lastPlay } : ann;
    const after = { ...a.score };
    if (e.side && (e.type === 'pa' || e.type === 'runner')) after[e.side] += a.runs;
    const scored = (e.type === 'pa' || e.type === 'runner') && a.runs > 0;
    const base = { id: e.id, ...(e.side ? { side: e.side } : {}), ...(scored ? { score: scoreChip(after) } : {}) };
    const when = `${a.outs} out`;
    if (e.type === 'pa') {
      const o = e.outcome;
      const moves = e.moves ?? [];
      const bm = moves.find((m) => m.from === 0);
      // the batter beyond the base his hit / walk gives (taking an extra base, scoring on an error)
      const extra = bm && o && NATURAL[o] !== undefined && bm.to !== -1 && bm.to !== NATURAL[o] && o !== 'HR' ? [bm] : [];
      const runnersOnly = moves.filter((m) => m.from !== 0);
      const rt = runnerText([...runnersOnly, ...extra], a.runs, { batter: true });
      const text = `${paSentence(s, e, a)}${rt ? ` ${rt}` : ''}`;
      const tags = [
        ...(scored ? ['score'] : []), ...(o && HITS.includes(o) ? ['hit'] : []), ...(o === 'K' ? ['k'] : []), ...(o === 'BB' || o === 'IBB' || o === 'HBP' ? ['bb'] : []),
      ];
      entries.push({ half: a.half, line: { ...base, when, icon: (o && ICON[o]) ?? '⚾', text, tags, ...(scored || o === 'HR' ? { key: true } : {}) } });
    } else if (e.type === 'runner') {
      entries.push({ half: a.half, line: { ...base, when, icon: e.kind === 'SB' ? '💨' : e.kind === 'CS' || e.kind === 'PO' || e.kind === 'OUT' ? '✋' : '↗', text: runnerSentence(e, a.runs), tags: ['run', ...(scored ? ['score'] : [])], ...(scored ? { key: true } : {}) } });
    } else if (e.type === 'sub') {
      const on = e.on?.name ?? 'A substitute';
      const off = e.off?.name;
      const text = e.kind === 'p'
        ? `Pitching change for ${team(e.side)}: ${off ? `${on} replaces ${off}` : `${on} takes the mound`}.${a.inh ? ` ${on} inherits ${plural(a.inh, 'runner')}.` : ''}`
        : e.kind === 'ph' ? `Pinch hitter for ${team(e.side)}: ${on}${off ? ` bats for ${off}` : ''}.`
        : e.kind === 'pr' ? `Pinch runner for ${team(e.side)}: ${on}${off ? ` runs for ${off}` : ''}${e.base ? ` at ${BASE[e.base]}` : ''}.`
        : `Defensive change for ${team(e.side)}: ${on}${e.pos ? ` in at ${e.pos}` : ' comes in'}${off ? ` for ${off}` : ''}.`;
      entries.push({ half: a.half, line: { ...base, icon: '🔁', text, tags: e.kind === 'p' ? ['pitching'] : ['change'] } });
    } else if (e.type === 'eject') {
      const whoE = e.official ? `${e.official} (${team(e.side)})` : `${e.on?.name ?? 'A player'} (${team(e.side)})`;
      entries.push({ half: a.half, line: { ...base, icon: '🟥', text: `${whoE} is ejected.`, key: true, tags: ['change'] } });
    }
  }
  // the end of each completed half, and the final
  const lastHalf = g.ended ? lastPlay : -1;
  const cum = (h: number) => {
    const sc = { home: 0, away: 0 };
    g.line.forEach((r, i) => { if (i <= h) sc[battingSide(i)] += r ?? 0; });
    return sc;
  };
  for (let h = 0; h < g.half; h++) {
    if (g.ended && h >= lastHalf) continue;
    const sc = cum(h);
    entries.push({ half: h, line: { id: `end${h}`, icon: '⏲', key: true, tags: ['inning'], score: scoreChip(sc), text: `${isTop(h) ? 'Middle' : 'End'} of the ${nth(inningOf(h))}: ${scoreWords(names, sc)}.` } });
  }
  if (g.ended && lastHalf >= 0) {
    const sc = g.score;
    const inn = lastInning(s);
    const how = g.endReason === 'walkoff' ? ` Walk-off win for ${names.home}!`
      : g.endReason === 'mercy' ? ` Run rule after ${plural(inn, 'inning')}.`
      : g.endReason === 'called' ? ` Called after ${plural(inn, 'inning')}.`
      : g.endReason === 'tie' ? ' A tied game.'
      : '';
    entries.push({ half: lastHalf, line: { id: 'final', icon: '🏁', key: true, tags: ['inning'], score: scoreChip(sc), text: `Final${inn > s.cfg.innings ? `/${inn}` : ''}: ${scoreWords(names, sc)}.${how}` } });
  }
  // the extra-inning tie-break runners (placed, not batted on)
  if (s.cfg.tiebreak !== 'none') {
    for (const h of [...new Set(entries.map((x) => x.half))]) {
      if (inningOf(h) < s.cfg.tbFrom) continue;
      const i = entries.findIndex((x) => x.half === h);
      entries.splice(i, 0, { half: h, line: { id: `tb${h}`, icon: '➕', side: battingSide(h), tags: ['inning'], text: s.cfg.tiebreak === 'r12' ? 'Tie-break: runners start on 1st and 2nd.' : 'Tie-break: a runner starts on 2nd.' } });
    }
  }
  // keep each half's lines together, in game order
  const ordered = entries.map((x, i) => ({ ...x, i })).sort((x, y) => x.half - y.half || x.i - y.i);
  const groups = groupLines(ordered, (x) => String(x.half), (first, items) => {
    const h = first.half;
    const bat = battingSide(h);
    let hits = 0, errors = 0;
    let lob: number | undefined;
    for (const e of s.events) {
      const a = g.ann[e.id];
      if (!a || a.ignored || a.half !== h) continue;
      if (e.type === 'pa' && e.outcome && HITS.includes(e.outcome)) hits++;
      if (e.type === 'pa' && e.outcome === 'E') errors++;
      if (a.lob !== undefined) lob = a.lob;
    }
    const runs = g.line[h] ?? 0;
    return {
      key: `h${h}`, title: halfLong(h), scope: inningOf(h), side: bat,
      sub: `${names[bat]} · ${plural(runs, 'run')}, ${plural(hits, 'hit')}, ${plural(errors, 'error')}${lob !== undefined ? `, ${lob} left on base` : ''}`,
      lines: items.map((x) => x.line),
    };
  });
  return newestFirst(groups);
}

/** Scope chip labels: the inning ("3rd"). */
export const baseballScopeLabel = (n: number): string => nth(n);

/** The commentary's tag chips. */
export const BASEBALL_FEED_TAGS = [
  { key: 'key', label: 'Key moments' }, { key: 'score', label: 'Scoring' }, { key: 'hit', label: 'Hits' }, { key: 'k', label: 'Strikeouts' },
  { key: 'bb', label: 'Walks' }, { key: 'pitching', label: 'Pitching changes' }, { key: 'run', label: 'Running' },
];
