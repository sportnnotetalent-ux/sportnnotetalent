/** Rugby league's stat schema (see ../statSchema.ts). PURE.
 *
 *  Keys shared with another sport keep that sport's labels exactly
 *  (tests/stat-schema.test.mts) — reused only where the meaning is identical:
 *   - union's points, tries, tryAssists, conversions(+Attempts),
 *     penGoals(+Attempts), the optional tackles / missedTackles / carries /
 *     lineBreaks / offloads / penaltiesGivenAway, and the derived
 *     goalKickPct / conversionPct / tackleSuccessPct / per-game / bests;
 *   - football's `sinBins` ("Sin-bins": a temporary suspension on the clock).
 *  New keys: `dropFieldGoals` / `dropFieldGoalAttempts` ("Field goals (drop
 *  goals)": 1 point, or 2 from 40 m — union's `dropGoals` is labelled "Drop
 *  goals"), `sendOffs` (league says "sent off", there are no cards in the
 *  NRL), `handlingErrors` ("Errors" — volleyball's `errors` are a different
 *  thing). Team-only: `sets`, `completedSets` (six-tackle sets).
 *  Every line key is absolute — `statTotals` (./totals.ts) owns the whole
 *  line; the detail keys are keyed (only matches that tracked them). */
import type { Qualifier, SportStatSchema } from '../statSchema.ts';
import { POINTS } from '../sharedStats.ts';

/** House minimums: 2 matches for a per-match figure, 10 goal kicks for a kicking %. */
const q2: Qualifier = { games: 2, unit: { label: 'matches', one: 'match' } };
const q10: Qualifier = { den: 10, unit: { label: 'kicks at goal', one: 'kick at goal' } };

export const rugbyLeagueStats: SportStatSchema<'rugby_league'> = {
  sport: 'rugby_league',
  splits: ['format', 'tournament', 'season', 'opponent'],
  /** 13s, Nines and junior halves are different games */
  leaderSplits: ['format'],
  stats: [
    { ...POINTS, group: 'scoring', weight: 1, tieBreak: [{ key: 'tries', better: 'higher' }] },
    { key: 'tries', label: 'Tries', short: 'tries', one: 'try', abbr: 'T', group: 'scoring', weight: 3,
      tieBreak: [{ key: 'tryAssists', better: 'higher' }] },
    { key: 'tryAssists', label: 'Try assists', short: 'try assists', one: 'try assist', abbr: 'TA', group: 'scoring', weight: 1.5 },
    { key: 'conversions', label: 'Conversions', short: 'conversions', one: 'conversion', abbr: 'C', group: 'kicking' },
    { key: 'conversionAttempts', label: 'Conversion attempts', short: 'conversion attempts', one: 'conversion attempt', group: 'kicking' },
    { key: 'penGoals', label: 'Penalty goals', short: 'penalty goals', one: 'penalty goal', abbr: 'PG', group: 'kicking' },
    { key: 'penGoalAttempts', label: 'Penalty goal attempts', short: 'penalty goal attempts', one: 'penalty goal attempt', group: 'kicking' },
    { key: 'dropFieldGoals', label: 'Field goals (drop goals)', short: 'field goals', one: 'field goal', abbr: 'FG', group: 'kicking', weight: 1 },
    { key: 'dropFieldGoalAttempts', label: 'Field goal attempts', short: 'field goal attempts', one: 'field goal attempt', group: 'kicking' },
    { key: 'sinBins', label: 'Sin-bins', short: 'sin-bins', one: 'sin-bin', group: 'discipline', weight: -1, abbr: 'SB', suspension: { minutes: 10 } },
    { key: 'sendOffs', label: 'Send-offs', short: 'send-offs', one: 'send-off', group: 'discipline', weight: -4, abbr: 'SO', suspension: { permanent: true } },
    { key: 'minutes', label: 'Minutes', short: 'mins', group: 'playing', format: { unit: 'minutes' }, coverage: 'present', abbr: 'MIN' },
    // optional detail (off by default; keyed — never a 0 for a match that didn't track it)
    { key: 'tackles', label: 'Tackles', short: 'tackles', one: 'tackle', group: 'defence', weight: 0.1, coverage: 'keyed', abbr: 'TK' },
    { key: 'missedTackles', label: 'Missed tackles', short: 'missed tackles', one: 'missed tackle', group: 'defence', coverage: 'keyed', abbr: 'MT', format: { unit: 'count', better: 'lower' } },
    { key: 'carries', label: 'Carries', short: 'carries', one: 'carry', group: 'attack', weight: 0.1, coverage: 'keyed', abbr: 'CA' },
    { key: 'lineBreaks', label: 'Line breaks', short: 'line breaks', one: 'line break', group: 'attack', weight: 1, coverage: 'keyed', abbr: 'LB' },
    { key: 'offloads', label: 'Offloads', short: 'offloads', one: 'offload', group: 'attack', weight: 0.5, coverage: 'keyed', abbr: 'OL' },
    { key: 'handlingErrors', label: 'Errors', short: 'errors', one: 'error', group: 'discipline', weight: -0.5, coverage: 'keyed', abbr: 'ERR', format: { unit: 'count', better: 'lower' } },
    { key: 'penaltiesGivenAway', label: 'Penalties conceded', short: 'penalties conceded', one: 'penalty conceded', group: 'discipline', weight: -0.5, coverage: 'keyed', abbr: 'PC', format: { unit: 'count', better: 'lower' } },
    // career rates and bests
    { key: 'pointsPerGame', label: 'Points per game', short: 'points per game', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'perGame', key: 'points', dp: 1, qualifier: q2 }, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'triesPerGame', label: 'Tries per game', short: 'tries per game', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'perGame', key: 'tries', dp: 2, qualifier: q2 }, tieBreak: [{ key: 'tries', better: 'higher' }] },
    { key: 'conversionPct', label: 'Conversion %', source: 'derived', group: 'kicking', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'conversions', den: 'conversionAttempts', scale: 100, dp: 0, qualifier: { den: 5, unit: { label: 'conversion attempts', one: 'conversion attempt' } } },
      tieBreak: [{ key: 'conversions', better: 'higher' }] },
    { key: 'goalKickPct', label: 'Goal-kicking %', source: 'derived', group: 'kicking', format: { unit: 'percent', dp: 0 }, abbr: 'GK%',
      agg: { kind: 'rate', num: ['conversions', 'penGoals'], den: ['conversionAttempts', 'penGoalAttempts'], scale: 100, dp: 0, qualifier: q10 },
      tieBreak: [{ key: 'penGoals', better: 'higher' }] },
    { key: 'tackleSuccessPct', label: 'Tackle success %', source: 'derived', group: 'defence', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'tackles', den: ['tackles', 'missedTackles'], scale: 100, dp: 0, qualifier: { den: 20, unit: { label: 'tackles', one: 'tackle' } } } },
    { key: 'mostTries', label: 'Most tries in a match', short: 'most tries', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'tries' } },
    { key: 'mostPoints', label: 'Most points in a match', short: 'most points', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'points' } },
    // team-level match figures (the comparison panel), never on a player line
    { key: 'penaltyTries', label: 'Penalty tries', short: 'penalty tries', one: 'penalty try', source: 'team' },
    { key: 'sets', label: 'Sets', short: 'sets', one: 'set', source: 'team' },
    { key: 'completedSets', label: 'Completed sets', short: 'completed sets', one: 'completed set', source: 'team' },
  ],
  sections: [
    { id: 'scoring', title: 'Scoring', rows: [{ stat: 'points' }, { stat: 'pointsPerGame' }, { stat: 'tries' }, { stat: 'triesPerGame' }, { stat: 'tryAssists' }] },
    { id: 'kicking', title: 'Goal kicking', rows: [
      { stat: 'conversions' }, { stat: 'conversionAttempts' }, { stat: 'conversionPct' },
      { stat: 'penGoals' }, { stat: 'penGoalAttempts' }, { stat: 'goalKickPct' },
      { stat: 'dropFieldGoals', hideZero: true }, { stat: 'dropFieldGoalAttempts', hideZero: true },
    ] },
    { id: 'attack', title: 'Attack', rows: [{ stat: 'carries' }, { stat: 'lineBreaks' }, { stat: 'offloads' }] },
    { id: 'defence', title: 'Defence', rows: [{ stat: 'tackles' }, { stat: 'missedTackles' }, { stat: 'tackleSuccessPct' }] },
    { id: 'playing', title: 'Playing time', rows: [{ stat: 'minutes' }] },
    { id: 'bests', title: 'Bests', rows: [{ stat: 'mostTries', label: 'Most tries (match)', hideZero: true }, { stat: 'mostPoints', label: 'Most points (match)', hideZero: true }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'handlingErrors' }, { stat: 'penaltiesGivenAway' }, { stat: 'sinBins' }, { stat: 'sendOffs' }] },
  ],
  careerView: 'sections',
  history: ['points', 'tries', 'conversions', 'penGoals'],
  box: [{ columns: [
    { key: 'minutes', abbr: 'MIN', overallOnly: true },
    { key: 'tries', abbr: 'T' },
    { key: 'conv', abbr: 'C', label: 'Conversions made-attempted', pair: ['conversions', 'conversionAttempts'] },
    { key: 'pens', abbr: 'PG', label: 'Penalty goals made-attempted', pair: ['penGoals', 'penGoalAttempts'] },
    { key: 'fgs', abbr: 'FG', label: 'Field goals made-attempted', pair: ['dropFieldGoals', 'dropFieldGoalAttempts'] },
    { key: 'points', abbr: 'PTS', emphasis: true },
    { key: 'tryAssists', abbr: 'TA' },
    { key: 'carries', abbr: 'CA' },
    { key: 'lineBreaks', abbr: 'LB' },
    { key: 'offloads', abbr: 'OL' },
    { key: 'tackles', abbr: 'TK' },
    { key: 'missedTackles', abbr: 'MT' },
    { key: 'handlingErrors', abbr: 'ERR' },
    { key: 'penaltiesGivenAway', abbr: 'PC' },
    { key: 'sinBins', abbr: 'SB', label: 'Sin-bins' },
    { key: 'sendOffs', abbr: 'SO', label: 'Send-offs' },
  ] }],
  compare: [
    'tries', 'penaltyTries', 'conversions', 'conversionAttempts', 'penGoals', 'penGoalAttempts', 'dropFieldGoals',
    'sets', 'completedSets', 'carries', 'lineBreaks', 'offloads', 'tackles', 'missedTackles', 'handlingErrors', 'penaltiesGivenAway',
    'sinBins', 'sendOffs',
  ],
  leaders: ['points', 'tries', 'tryAssists', 'conversions', 'penGoals', 'goalKickPct', 'dropFieldGoals', 'pointsPerGame', 'lineBreaks', 'tackles', 'offloads', 'carries'],
  headline: ['points', 'tries', 'conversions', 'tryAssists'],
  awards: [
    { stat: 'tries', icon: '🏉', label: 'Top try scorer', tieBreak: [{ key: 'tryAssists', better: 'higher' }] },
    { stat: 'points', icon: '🎯', label: 'Top points scorer', tieBreak: [{ key: 'tries', better: 'higher' }] },
  ],
  scoreUnit: 'points',
};
