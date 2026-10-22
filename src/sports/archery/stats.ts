/** SD-95 — archery's stat schema (see ../statSchema.ts). PURE. Results come
 *  from the results engine; a closed phase writes one stat line per archer
 *  (data/results/archery.ts `archLines`): the ranking round — competitions,
 *  arrows and points (average arrow), 10s (X included) and X, a complete
 *  round's score (`m_ar_r70`, `m_ar_c50`, `m_ar_r18i` …), the ranking place —
 *  and match play — matches won / lost, set points, the place — with medals and
 *  position points. The profile renders the archery career. */
import type { StatLine } from '../../core/types';
import type { MeasuredEventDef, SportStatSchema, StatDef } from '../statSchema.ts';
import { ARCH_ROUNDS } from '../../data/results/archeryDefs.ts';

const fmt = { unit: 'points' as const, dp: 0, better: 'higher' as const };
const ROUNDS = ARCH_ROUNDS.map((r) => ({ key: `ar_${r.key.slice(5)}`, label: r.label }));

const markStats: StatDef[] = ROUNDS.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: fmt }));
const pbStats: StatDef[] = ROUNDS.map((e) => ({
  key: `pb_${e.key}`, label: `Best ${e.label}`, leaderLabel: `Best ${e.label}`, source: 'derived', group: 'bests', format: fmt,
  agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'higher' }], render: (s) => `${s[`m_${e.key}`] ?? 0}` },
}));

export const archeryStats: SportStatSchema<'archery'> = {
  sport: 'archery',
  events: ARCH_ROUNDS.map((r) => ({ key: r.key, label: r.label, format: fmt })) satisfies MeasuredEventDef[],
  filters: {
    ...Object.fromEntries(ROUNDS.map((e) => [`m_${e.key}`, (l: StatLine) => l.stats?.[`m_${e.key}`] != null])),
    // deep wave: ranking rounds that recorded their ends (older lines have X but no end count)
    hasREnds: (l: StatLine) => l.stats?.rEnds != null,
  },
  stats: [
    { key: 'comps', label: 'Competitions', short: 'competitions', one: 'competition', group: 'archery' },
    { key: 'arrows', label: 'Arrows', short: 'arrows', one: 'arrow', group: 'archery' },
    { key: 'pts', label: 'Points', short: 'points', one: 'point', group: 'archery' },
    { key: 'tens', label: '10s (incl. X)', short: '10s', one: '10', group: 'archery' },
    { key: 'xs', label: 'Inner tens', short: 'inner tens', one: 'inner ten', group: 'archery' },
    { key: 'avgArrow', label: 'Average arrow', short: 'avg arrow', source: 'derived', group: 'archery', format: { unit: 'points', dp: 2 }, agg: { kind: 'rate', num: 'pts', den: 'arrows', dp: 2, qualifier: { den: 36 } } },
    { key: 'tenRate', label: '10 + X rate', short: '10+X %', source: 'derived', group: 'archery', format: { unit: 'percent', dp: 1 }, agg: { kind: 'rate', num: 'tens', den: 'arrows', scale: 100, dp: 1, qualifier: { den: 36 } } },
    { key: 'brackets', label: 'Match-play events', short: 'match-play events', one: 'match-play event', group: 'matches' },
    { key: 'mW', label: 'Matches won', short: 'matches won', one: 'match won', group: 'matches' },
    { key: 'mL', label: 'Matches lost', short: 'matches lost', one: 'match lost', group: 'matches' },
    { key: 'sp', label: 'Set points won', short: 'set points', one: 'set point', group: 'matches' },
    { key: 'spA', label: 'Set points against', short: 'set points against', one: 'set point against', group: 'matches' },
    { key: 'golds', label: 'Golds', short: 'golds', one: 'gold', group: 'medals', weight: 3 },
    { key: 'silvers', label: 'Silvers', short: 'silvers', one: 'silver', group: 'medals', weight: 2 },
    { key: 'bronzes', label: 'Bronzes', short: 'bronzes', one: 'bronze', group: 'medals', weight: 1 },
    { key: 'posPoints', label: 'Position points', short: 'position pts', one: 'position pt', group: 'medals', format: { unit: 'points', dp: 1 } },
    { key: 'place', label: 'Place', short: 'place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'rPlace', label: 'Ranking-round place', short: 'ranking place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'seeded', label: 'Seeded into match play', short: 'seeded', group: 'line' },
    { key: 'dq', label: 'Disqualified', short: 'DQ', group: 'line', format: { unit: 'count', better: 'lower' } },
    // Deep wave: only on lines that wrote them (never a false 0)
    { key: 'rEnds', label: 'Ranking ends', short: 'ranking ends', one: 'ranking end', group: 'archery', coverage: 'keyed' },
    { key: 'n9', label: '9s', short: '9s', one: '9', group: 'archery', coverage: 'keyed' },
    { key: 'bestEnd', label: 'Best end', short: 'best end', group: 'line', coverage: 'keyed', format: { unit: 'points', dp: 0 }, agg: { kind: 'max' } },
    { key: 'xPerEnd', label: 'X per end', short: 'X / end', source: 'derived', group: 'archery', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'rate', num: 'xs', den: 'rEnds', dp: 2, over: 'hasREnds', qualifier: { den: 12 } } },
    { key: 'mArrows', label: 'Match arrows', short: 'match arrows', one: 'match arrow', group: 'matches', coverage: 'keyed' },
    { key: 'mPts', label: 'Match points', short: 'match points', one: 'match point', group: 'matches', coverage: 'keyed' },
    { key: 'mTens', label: 'Match 10s (incl. X)', short: 'match 10s', one: 'match 10', group: 'matches', coverage: 'keyed' },
    { key: 'mXs', label: 'Match X', short: 'match X', group: 'matches', coverage: 'keyed' },
    { key: 'mAvgArrow', label: 'Average arrow in matches', short: 'match avg arrow', source: 'derived', group: 'matches', format: { unit: 'points', dp: 2 }, agg: { kind: 'rate', num: 'mPts', den: 'mArrows', dp: 2, qualifier: { den: 15 } } },
    { key: 'soW', label: 'Shoot-offs won', short: 'shoot-offs won', one: 'shoot-off won', group: 'matches', coverage: 'keyed' },
    { key: 'soL', label: 'Shoot-offs lost', short: 'shoot-offs lost', one: 'shoot-off lost', group: 'matches', coverage: 'keyed' },
    // Round 2: the archer's own arrows in team matches (when the meet credits each arrow) — only on lines that wrote them
    { key: 'tArrows', label: 'Team-match arrows', short: 'team-match arrows', one: 'team-match arrow', group: 'matches', coverage: 'keyed' },
    { key: 'tPts', label: 'Team-match points', short: 'team-match points', one: 'team-match point', group: 'matches', coverage: 'keyed' },
    { key: 'tTens', label: 'Team-match 10s (incl. X)', short: 'team-match 10s', one: 'team-match 10', group: 'matches', coverage: 'keyed' },
    { key: 'tXs', label: 'Team-match X', short: 'team-match X', group: 'matches', coverage: 'keyed' },
    { key: 'tAvgArrow', label: 'Average arrow in team matches', short: 'team avg arrow', source: 'derived', group: 'matches', format: { unit: 'points', dp: 2 }, agg: { kind: 'rate', num: 'tPts', den: 'tArrows', dp: 2, qualifier: { den: 8 } } },
    ...markStats,
    ...pbStats,
  ],
  sections: [
    { id: 'bests', title: 'Personal bests', rows: pbStats.map((s) => ({ stat: s.key, hideZero: true })) },
    { id: 'archery', title: 'Archery', rows: [{ stat: 'comps' }, { stat: 'arrows' }, { stat: 'avgArrow' }, { stat: 'tenRate' }, { stat: 'xPerEnd', hideZero: true }] },
    { id: 'matches', title: 'Match play', rows: [{ stat: 'mW' }, { stat: 'mL' }, { stat: 'sp' }, { stat: 'mAvgArrow', hideZero: true }, { stat: 'tAvgArrow', hideZero: true }] },
    { id: 'medals', title: 'Medals', rows: [{ stat: 'golds' }, { stat: 'silvers' }, { stat: 'bronzes' }] },
  ],
  careerView: 'measured',
  history: ['golds', 'silvers', 'bronzes'],
  leaders: ['posPoints', 'golds', 'mW', 'pb_ar_r70', 'pb_ar_c50', 'avgArrow', 'tenRate'],
  mvp: { stat: 'posPoints', tieBreak: [{ key: 'golds', better: 'higher' }, { key: 'silvers', better: 'higher' }], howRanked: 'Position points from each event (8-7-6-5-4-3-2-1 by default), then golds, then silvers. You choose the winner.' },
  headline: ['comps', 'golds', 'mW'],
  awards: [
    { stat: 'posPoints', icon: '🏅', label: 'Best archer', tournamentLabel: 'Best archer (points)', match: false },
    { stat: 'golds', icon: '🥇', label: 'Most golds', match: false },
  ],
};
