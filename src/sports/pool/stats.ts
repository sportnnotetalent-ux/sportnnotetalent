/**
 * SD-15 — pool's stat schema (see ../statSchema.ts). PURE.
 *
 * Every line key is DERIVED: written only by the absolute statTotals
 * (./totals.ts) when the match completes or is corrected — nothing is
 * credited live. Coverage:
 *   'present' — the record keys every pool line carries (racks won / lost /
 *               broken, break-and-runs, run-outs);
 *   'keyed'   — keys a line carries only when its match had them: the
 *               game-specific ones (golden breaks at 9-ball, the 8 at
 *               8-ball, push-outs at 9-/10-ball), sets (a sets match), the
 *               three-foul losses (where that rule is on) and every shot
 *               figure (only once a rack was scored shot by shot). An older
 *               or quick-only line reads "not tracked", never 0.
 * Keys shared with other sports keep their labels: fouls / foulOther
 * (carrom), setsWon / setsLost / matchesWon / winPct (racket), innings
 * (cricket's label; here: visits to the table), breakWinPct (carrom).
 *
 * Not yet (each needs a shared golden list updated, so it is left to the
 * merge): `matchSummary` rows for the per-match rating line (STAT_LABELS in
 * tests/stat-schema.test.mts) and the optional "Golden breaks" / "Best pot
 * success" tournament slots (`onlyIfTracked`, pinned in
 * tests/volleyball-kabaddi-round2.test.mts).
 */
import type { SportStatSchema, StatDef } from '../statSchema.ts';
import { FOULS } from '../sharedStats.ts';

const rec = (key: string, label: string, short: string, one: string, extra: Partial<StatDef> = {}): StatDef =>
  ({ key, label, short, one, group: 'record', coverage: 'present', ...extra });
const keyed = (key: string, label: string, short: string, one: string, group: string, extra: Partial<StatDef> = {}): StatDef =>
  ({ key, label, short, one, group, coverage: 'keyed', ...extra });
const lower = { format: { unit: 'count' as const, better: 'lower' as const } };
const pct = (key: string, label: string, num: string | string[], den: string | string[], group: string, extra: Partial<StatDef> = {}): StatDef =>
  ({ key, label, source: 'derived', group, format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num, den, scale: 100, dp: 0 }, ...extra });
const MATCHES = { games: 3, unit: { label: 'matches', one: 'match' } };

export const poolStats: SportStatSchema<'pool'> = {
  sport: 'pool',
  /** SD-25 — career chips: singles / scotch doubles, tournament, season, opponent */
  splits: ['discipline', 'tournament', 'season', 'opponent'],
  /** SD-137a — singles and scotch doubles rank apart on leaderboards / awards */
  leaderSplits: ['discipline'],
  stats: [
    // the record (every line)
    rec('racksWon', 'Racks won', 'racks won', 'rack won', { weight: 2, leaderLabel: 'Most racks won', tieBreak: [{ key: 'rackPct', better: 'higher' }] }),
    rec('racksLost', 'Racks lost', 'racks lost', 'rack lost'),
    rec('racksBroken', 'Racks broken', 'racks broken', 'rack broken'),
    rec('racksWonOnBreak', 'Won on own break', 'won on own break', 'won on own break'),
    rec('breakAndRuns', 'Break-and-runs', 'break-and-runs', 'break-and-run', { weight: 2, leaderLabel: 'Most break-and-runs', tieBreak: [{ key: 'racksWon', better: 'higher' }] }),
    rec('runOuts', 'Run-outs', 'run-outs', 'run-out', { weight: 1, tieBreak: [{ key: 'racksWon', better: 'higher' }] }),
    keyed('goldenBreaks', 'Golden breaks', 'golden breaks', 'golden break', 'record', { weight: 2, tieBreak: [{ key: 'breakAndRuns', better: 'higher' }] }),
    keyed('setsWon', 'Sets won', 'sets won', 'set won', 'record', { leaderLabel: 'Most sets won' }),
    keyed('setsLost', 'Sets lost', 'sets lost', 'set lost', 'record'),
    keyed('eightLosses', 'Racks lost on the 8', 'racks lost on the 8', 'rack lost on the 8', 'discipline', lower),
    keyed('threeFoulLosses', 'Racks lost on three fouls', 'racks lost on three fouls', 'rack lost on three fouls', 'discipline', lower),
    // shot by shot (only once a rack was scored that way)
    keyed('detailRacks', 'Racks scored shot by shot', 'racks scored shot by shot', 'rack scored shot by shot', 'table'),
    { key: 'innings', label: 'Innings', short: 'innings', group: 'table', coverage: 'keyed', format: { unit: 'count', better: 'lower' } },
    keyed('shotsPlayed', 'Shots played', 'shots played', 'shot played', 'table'),
    keyed('potShots', 'Pots', 'pots', 'pot', 'table'),
    keyed('missShots', 'Misses', 'misses', 'miss', 'table', lower),
    keyed('ballsPotted', 'Balls pocketed', 'balls pocketed', 'ball pocketed', 'table', { weight: 0.25, leaderLabel: 'Most balls pocketed' }),
    keyed('safetyShots', 'Safeties', 'safeties', 'safety', 'table'),
    keyed('pushOuts', 'Push-outs', 'push-outs', 'push-out', 'table'),
    keyed('breakShots', 'Breaks', 'breaks', 'break', 'break'),
    keyed('breakBalls', 'Balls on the break', 'balls on the break', 'ball on the break', 'break'),
    keyed('dryBreaks', 'Dry breaks', 'dry breaks', 'dry break', 'break', lower),
    keyed('breakFouls', 'Break fouls', 'break fouls', 'break foul', 'break', lower),
    keyed('illegalBreaks', 'Illegal breaks', 'illegal breaks', 'illegal break', 'break', lower),
    keyed('eightBreaks', '8 on the break', '8s on the break', '8 on the break', 'break'),
    { ...FOULS, abbr: 'FLS', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed', matchSummary: false },
    keyed('foulScratch', 'Fouls: scratch', 'scratches', 'scratch', 'discipline', lower),
    keyed('foulWrongBall', 'Fouls: wrong ball first', 'wrong-ball fouls', 'wrong-ball foul', 'discipline', lower),
    keyed('foulNoRail', 'Fouls: no rail', 'no-rail fouls', 'no-rail foul', 'discipline', lower),
    keyed('foulOffTable', 'Fouls: ball off the table', 'off-table fouls', 'off-table foul', 'discipline', lower),
    keyed('foulOther', 'Fouls: other', 'other fouls', 'other foul', 'discipline', lower),
    // derived (career / leaderboards; never written)
    { key: 'racksWL', label: 'Racks W-L', source: 'derived', group: 'record', format: { unit: 'figure' }, agg: { kind: 'pair', a: 'racksWon', b: 'racksLost' } },
    pct('rackPct', 'Racks won %', 'racksWon', ['racksWon', 'racksLost'], 'record', { leaderLabel: 'Best racks won %', agg: { kind: 'rate', num: 'racksWon', den: ['racksWon', 'racksLost'], scale: 100, dp: 0, qualifier: MATCHES } }),
    { key: 'setsWL', label: 'Sets W-L', source: 'derived', group: 'record', format: { unit: 'figure' }, agg: { kind: 'pair', a: 'setsWon', b: 'setsLost' } },
    pct('breakWinPct', 'Own-break win %', 'racksWonOnBreak', 'racksBroken', 'record'),
    pct('bnrPct', 'Break-and-run %', 'breakAndRuns', 'racksBroken', 'record'),
    pct('potPct', 'Pot success %', 'potShots', ['potShots', 'missShots'], 'table', {
      leaderLabel: 'Best pot success', agg: { kind: 'rate', num: 'potShots', den: ['potShots', 'missShots'], scale: 100, dp: 0, qualifier: { den: 30, unit: { label: 'pot attempts', one: 'pot attempt' } } },
      tieBreak: [{ key: 'potShots', better: 'higher' }],
    }),
    { key: 'ballsPerBreak', label: 'Balls per break', source: 'derived', group: 'break', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'rate', num: 'breakBalls', den: 'breakShots', dp: 2 } },
    { key: 'inningsPerRack', label: 'Innings per rack', source: 'derived', group: 'table', format: { unit: 'decimal', dp: 2, better: 'lower' }, agg: { kind: 'rate', num: 'innings', den: 'detailRacks', dp: 2 } },
    { key: 'foulsPerRack', label: 'Fouls per rack', source: 'derived', group: 'discipline', format: { unit: 'decimal', dp: 2, better: 'lower' }, agg: { kind: 'rate', num: 'fouls', den: 'detailRacks', dp: 2 } },
    // SD-27 — the match record as leaderboard stats (same labels as the racket sports)
    { key: 'matchesWon', label: 'Matches won', short: 'wins', one: 'win', leaderLabel: 'Most wins', source: 'derived', group: 'record',
      agg: { kind: 'result', count: ['W'] }, tieBreak: [{ key: 'winPct', better: 'higher' }, { key: 'rackPct', better: 'higher' }] },
    { key: 'winPct', label: 'Win %', leaderLabel: 'Best win %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'result', count: ['W'], of: ['W', 'L', 'D', 'T'], scale: 100, dp: 0, qualifier: MATCHES },
      tieBreak: [{ key: 'matchesWon', better: 'higher' }, { key: 'rackPct', better: 'higher' }] },
  ],
  sections: [
    { id: 'match', title: 'Match play', rows: [
      { stat: 'racksWL' }, { stat: 'rackPct' }, { stat: 'setsWL' },
      { stat: 'breakAndRuns' }, { stat: 'runOuts' }, { stat: 'goldenBreaks', hideZero: true },
      { stat: 'racksBroken' }, { stat: 'breakWinPct' }, { stat: 'bnrPct' },
    ] },
    { id: 'break', title: 'The break', rows: [
      { stat: 'breakShots' }, { stat: 'ballsPerBreak' }, { stat: 'breakBalls' }, { stat: 'dryBreaks' },
      { stat: 'breakFouls' }, { stat: 'illegalBreaks', hideZero: true }, { stat: 'eightBreaks', hideZero: true },
    ] },
    { id: 'table', title: 'At the table', rows: [
      { stat: 'potPct' }, { stat: 'ballsPotted' }, { stat: 'potShots' }, { stat: 'missShots' }, { stat: 'safetyShots' },
      { stat: 'pushOuts', hideZero: true }, { stat: 'innings' }, { stat: 'inningsPerRack' }, { stat: 'detailRacks' },
    ] },
    { id: 'fouls', title: 'Fouls', rows: [
      { stat: 'fouls' }, { stat: 'foulsPerRack' },
      { stat: 'foulScratch', label: 'Scratch', hideZero: true }, { stat: 'foulWrongBall', label: 'Wrong ball first', hideZero: true },
      { stat: 'foulNoRail', label: 'No rail', hideZero: true }, { stat: 'foulOffTable', label: 'Ball off the table', hideZero: true },
      { stat: 'foulOther', label: 'Other', hideZero: true },
      { stat: 'threeFoulLosses', hideZero: true }, { stat: 'eightLosses', hideZero: true },
    ] },
  ],
  careerView: 'sections',
  history: ['racksWon', 'breakAndRuns', 'goldenBreaks'],
  // short headers so the per-player table fits a phone (pool polish PP2)
  box: [{ columns: [{ key: 'racksWon', abbr: 'RW' }, { key: 'ballsPotted', abbr: 'BP' }, { key: 'potShots', abbr: 'POT' }, { key: 'missShots', abbr: 'MISS' }, { key: 'safetyShots', abbr: 'SAF' }, 'fouls'] }],
  compare: ['racksWon', 'breakAndRuns', 'ballsPotted', 'potPct', 'safetyShots', 'fouls'],
  leaders: ['matchesWon', 'racksWon', 'winPct', 'rackPct', 'breakAndRuns', 'goldenBreaks', 'runOuts', 'potPct', 'ballsPotted'],
  mvp: { stat: 'matchesWon', tieBreak: [{ key: 'winPct', better: 'higher' }, { key: 'rackPct', better: 'higher' }] },
  headline: ['racksWon', 'breakAndRuns', 'ballsPotted'],
  awards: [
    { stat: 'racksWon', icon: '🎱', label: 'Most racks won' },
    { stat: 'breakAndRuns', icon: '💥', label: 'Most break-and-runs' },
  ],
};
