/**
 * SD-51 — Cricket's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { block, otherSide, type MatchRecordItem, type MatchRecordsBlock, type Side } from '../matchRecords.ts';
import { ordinal, topN } from '../recordHelpers.ts';
import { outcome, oversStr, type CricketState } from './engine.ts';
import { partnerships, hasLog } from './scorecard.ts';

/**
 * Cricket (CK-07): each side's innings total (highest; lowest only for an
 * innings that ran its course — the side batting first, or a chase that fell
 * short), the top 3 partnerships per side (with the wicket and both batters;
 * needs the replayed ball log, so a log-less snapshot has none), the top 3
 * individual innings and bowling figures per side (they link to the match's
 * stat lines), and the margin of victory (runs or wickets). A Super Over is
 * never part of a record; a match a Super Over decided has no margin.
 */
export function cricketMatchRecords(s: CricketState): MatchRecordsBlock | null {
  if (!s || !s.scores || !s.ended) return null;
  const bpo = s.ballsPerOver || 6;
  const items: MatchRecordItem[] = [];
  const chase: Side = s.innings === 2 ? s.battingSide : otherSide(s.battingSide);
  const first = otherSide(chase);
  const allOut = (side: Side) => s.scores[side].wickets >= s.wicketsLimit || !!s.closedNoBatter?.[side];
  const totalText = (side: Side) => {
    const inn = s.scores[side];
    return `${inn.runs}${allOut(side) ? '' : `/${inn.wickets}`} (${oversStr(inn.balls, bpo)} ov)`;
  };
  for (const side of [first, chase] as Side[]) {
    const inn = s.scores[side];
    if (side === chase && s.innings !== 2) continue; // never batted
    if (!inn.balls && !inn.runs) continue;
    items.push({ type: 'teamHigh', value: inn.runs, text: totalText(side), side });
    const ranItsCourse = side === first || s.target === undefined || inn.runs < s.target;
    if (ranItsCourse) items.push({ type: 'teamLow', value: inn.runs, text: totalText(side), side });
  }

  if (hasLog(s)) {
    for (const side of ['home', 'away'] as Side[]) {
      const ps = partnerships(s, side).filter((p) => p.runs > 0).map((p) => ({ p, value: p.runs * 1000 - p.balls }));
      for (const { p } of topN(ps, 3)) {
        items.push({
          type: 'partnership', value: p.runs, text: `${p.runs}${p.unbroken ? '*' : ''} (${p.balls})`, side,
          playerId: p.a.id, playerName: p.a.name, partnerId: p.b.id, partnerName: p.b.name, note: `${ordinal(p.wkt)} wkt`,
        });
      }
    }
  }

  for (const side of ['home', 'away'] as Side[]) {
    const bats = Object.entries(s.batting ?? {}).filter(([, c]) => c.side === side && (c.runs > 0 || c.balls > 0))
      .map(([id, c]) => ({ id, c, value: c.runs * 10 + (c.out ? 0 : 1) }));
    for (const { id, c, value } of topN(bats, 3)) {
      items.push({ type: 'bestInnings', value, text: `${c.runs}${c.out ? '' : '*'} (${c.balls})`, side, playerId: id, playerName: c.name });
    }
    const bowls = Object.entries(s.bowling ?? {}).filter(([, c]) => c.side === side && c.wickets > 0)
      .map(([id, c]) => ({ id, c, value: c.wickets * 1000 - c.runs }));
    for (const { id, c, value } of topN(bowls, 3)) {
      items.push({ type: 'bestBowling', value, text: `${c.wickets}/${c.runs}`, note: `${oversStr(c.balls, bpo)} ov`, side, playerId: id, playerName: c.name });
    }
  }

  if (s.innings === 2 && !s.superOver) {
    const o = outcome(s);
    const m = /^Won by (\d+) (run|wkt)s?(.*)$/.exec(o.text);
    if (o.winner && m) {
      const n = Number(m[1]);
      const tag = m[3] ?? '';
      if (m[2] === 'run') {
        items.push({ type: 'marginRuns', value: n, text: `by ${n} run${n === 1 ? '' : 's'}${tag}`, side: o.winner });
      } else {
        const sched = (s.inn2Overs ?? s.oversLimit) * bpo;
        const left = Math.max(0, sched - s.scores[chase].balls);
        items.push({ type: 'marginWkts', value: n * 1000 + left, text: `by ${n} wkt${n === 1 ? '' : 's'}${left ? ` (${left} ball${left === 1 ? '' : 's'} left)` : ''}${tag}`, side: o.winner });
      }
    }
  }
  return block(items);
}
