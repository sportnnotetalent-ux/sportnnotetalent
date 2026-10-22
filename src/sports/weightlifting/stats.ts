/** SD-97 — weightlifting's stat schema (see ../statSchema.ts). PURE. Results
 *  come from the results engine; a finished session writes one stat line per
 *  lifter (data/results/weightlifting.ts `liftLines`): comps, place, the best
 *  snatch / C&J / total in kg (`m_wl_snatch`, `m_wl_cj`, `m_wl_total`), good
 *  lifts and attempts (make rate), no-total sessions, bodyweight, Sinclair,
 *  medals and position points. The profile renders the lifting career. */
import type { StatLine } from '../../core/types';
import type { MeasuredEventDef, SportStatSchema, StatDef } from '../statSchema.ts';

const kg = { unit: 'mass' as const, dp: 0, better: 'higher' as const };
const LIFTS = [
  { key: 'wl_snatch', label: 'Snatch' },
  { key: 'wl_cj', label: 'Clean & jerk' },
  { key: 'wl_total', label: 'Total' },
];

const markStats: StatDef[] = LIFTS.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: kg }));
const pbStats: StatDef[] = LIFTS.map((e) => ({
  key: `pb_${e.key}`, label: `Best ${e.label.toLowerCase()}`, leaderLabel: `Best ${e.label.toLowerCase()}`, source: 'derived', group: 'bests', format: kg,
  agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'higher' }], render: (s) => `${s[`m_${e.key}`] ?? 0} kg` },
}));

export const weightliftingStats: SportStatSchema<'weightlifting'> = {
  sport: 'weightlifting',
  events: [
    { key: 'wl.snatch', label: 'Snatch', format: kg, attempts: 3 },
    { key: 'wl.cj', label: 'Clean & jerk', format: kg, attempts: 3 },
    { key: 'wl.total', label: 'Total', format: kg },
  ] satisfies MeasuredEventDef[],
  filters: Object.fromEntries(LIFTS.map((e) => [`m_${e.key}`, (l: StatLine) => l.stats?.[`m_${e.key}`] != null])),
  stats: [
    { key: 'comps', label: 'Competitions', short: 'competitions', one: 'competition', group: 'lifting' },
    { key: 'made', label: 'Good lifts', short: 'good lifts', one: 'good lift', group: 'lifting' },
    { key: 'attempted', label: 'Attempts', short: 'attempts', one: 'attempt', group: 'lifting' },
    { key: 'makeRate', label: 'Make rate', short: 'make %', source: 'derived', group: 'lifting', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'made', den: 'attempted', scale: 100, dp: 0, qualifier: { den: 6 } } },
    { key: 'bombOut', label: 'No total', short: 'no total', group: 'lifting', format: { unit: 'count', better: 'lower' } },
    // Deep wave: per-lift make rates and openers — only on sessions that wrote them (never a false 0)
    { key: 'snMade', label: 'Good snatches', short: 'good snatches', one: 'good snatch', group: 'lifting', coverage: 'keyed' },
    { key: 'snAtt', label: 'Snatch attempts', short: 'snatch attempts', one: 'snatch attempt', group: 'lifting', coverage: 'keyed' },
    { key: 'cjMade', label: 'Good clean & jerks', short: 'good C&Js', one: 'good C&J', group: 'lifting', coverage: 'keyed' },
    { key: 'cjAtt', label: 'Clean & jerk attempts', short: 'C&J attempts', one: 'C&J attempt', group: 'lifting', coverage: 'keyed' },
    { key: 'o1Made', label: 'Openers made', short: 'openers made', one: 'opener made', group: 'lifting', coverage: 'keyed' },
    { key: 'o1Att', label: 'Openers', short: 'openers', one: 'opener', group: 'lifting', coverage: 'keyed' },
    { key: 'snRate', label: 'Snatch make rate', short: 'snatch make %', source: 'derived', group: 'lifting', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'snMade', den: 'snAtt', scale: 100, dp: 0, qualifier: { den: 3 } } },
    { key: 'cjRate', label: 'Clean & jerk make rate', short: 'C&J make %', source: 'derived', group: 'lifting', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'cjMade', den: 'cjAtt', scale: 100, dp: 0, qualifier: { den: 3 } } },
    { key: 'o1Rate', label: 'Openers made', short: 'openers %', source: 'derived', group: 'lifting', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'o1Made', den: 'o1Att', scale: 100, dp: 0, qualifier: { den: 4 } } },
    { key: 'golds', label: 'Golds', short: 'golds', one: 'gold', group: 'medals', weight: 3 },
    { key: 'silvers', label: 'Silvers', short: 'silvers', one: 'silver', group: 'medals', weight: 2 },
    { key: 'bronzes', label: 'Bronzes', short: 'bronzes', one: 'bronze', group: 'medals', weight: 1 },
    { key: 'liftGolds', label: 'Snatch / C&J golds', short: 'lift golds', one: 'lift gold', group: 'medals' },
    { key: 'liftSilvers', label: 'Snatch / C&J silvers', short: 'lift silvers', one: 'lift silver', group: 'medals' },
    { key: 'liftBronzes', label: 'Snatch / C&J bronzes', short: 'lift bronzes', one: 'lift bronze', group: 'medals' },
    { key: 'posPoints', label: 'Position points', short: 'position pts', one: 'position pt', group: 'medals', format: { unit: 'points', dp: 1 } },
    { key: 'place', label: 'Place', short: 'place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'mark', label: 'Mark', short: 'mark', group: 'line', format: kg, agg: { kind: 'max' } }, // the total (shared key / label with athletics)
    { key: 'bw', label: 'Bodyweight', short: 'bodyweight', group: 'line', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'min' } },
    { key: 'sinclair', label: 'Sinclair total', short: 'Sinclair', group: 'line', format: { unit: 'points', dp: 2 }, agg: { kind: 'max' } },
    { key: 'dq', label: 'Disqualified', short: 'DQ', group: 'line', format: { unit: 'count', better: 'lower' } },
    ...markStats,
    ...pbStats,
  ],
  sections: [
    { id: 'bests', title: 'Personal bests', rows: pbStats.map((s) => ({ stat: s.key, hideZero: true })) },
    { id: 'lifting', title: 'Lifting', rows: [{ stat: 'comps' }, { stat: 'made' }, { stat: 'attempted' }, { stat: 'makeRate' }, { stat: 'snRate', hideZero: true }, { stat: 'cjRate', hideZero: true }, { stat: 'o1Rate', hideZero: true }, { stat: 'bombOut', hideZero: true }] },
    { id: 'medals', title: 'Medals', rows: [{ stat: 'golds' }, { stat: 'silvers' }, { stat: 'bronzes' }] },
  ],
  careerView: 'measured',
  history: ['golds', 'silvers', 'bronzes'],
  leaders: ['posPoints', 'golds', 'pb_wl_total', 'pb_wl_snatch', 'pb_wl_cj', 'makeRate'],
  mvp: { stat: 'posPoints', tieBreak: [{ key: 'golds', better: 'higher' }, { key: 'silvers', better: 'higher' }], howRanked: 'Position points from each bodyweight category (8-7-6-5-4-3-2-1 by default; snatch and C&J too when the meet awards them), then golds, then silvers. You choose the winner.' },
  headline: ['comps', 'golds', 'made'],
  awards: [
    { stat: 'posPoints', icon: '🏅', label: 'Best lifter', tournamentLabel: 'Best lifter (points)', match: false },
    { stat: 'golds', icon: '🥇', label: 'Most golds', match: false },
  ],
};
