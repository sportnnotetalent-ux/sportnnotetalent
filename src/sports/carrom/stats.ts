/** SD-15 — carrom's stat schema (see ../statSchema.ts). PURE. */
import type { SportStatSchema, StatDef } from '../statSchema.ts';
import { HIGH_POINTS, POINTS } from '../sharedStats.ts';

const rec = (key: string, label: string, short: string, one: string): StatDef =>
  ({ key, label, short, one, group: 'record', coverage: 'present' });

export const carromStats: SportStatSchema<'carrom'> = {
  sport: 'carrom',
  /** SD-25 — career split chips (line context) */
  splits: ['discipline', 'tournament', 'season', 'opponent'],
  /** SD-137a — tournament / hub leaderboard + awards chips (singles / doubles) */
  leaderSplits: ['discipline'],
  stats: [
    // SD-27: level totals go to more boards, then more queens (and back)
    { ...POINTS, group: 'scoring', weight: 1, tieBreak: [{ key: 'boards', better: 'higher' }, { key: 'queens', better: 'higher' }] },
    { key: 'boards', label: 'Boards', short: 'boards', one: 'board', group: 'scoring', weight: 1, matchSummary: true, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'queens', label: 'Queens', short: 'queens', one: 'queen', group: 'scoring', weight: 2, matchSummary: true, tieBreak: [{ key: 'points', better: 'higher' }] },
    // SD-37 — the record keys carrom statTotals writes on every line (both
    // doubles partners alike; never credited live). 'present': tracked
    // wherever they're on the line, so older lines stay out of the rates.
    rec('gamesWon', 'Games won', 'games won', 'game won'),
    rec('gamesLost', 'Games lost', 'games lost', 'game lost'),
    rec('boardsPlayed', 'Boards played', 'boards played', 'board played'),
    rec('whiteSlams', 'White slams', 'white slams', 'white slam'),
    rec('blackSlams', 'Black slams', 'black slams', 'black slam'),
    rec('zeroGames', '25-0 games', '25-0 games', '25-0 game'),
    { key: 'pointsPerMatch', label: 'Points per match', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'points', dp: 1, qualifier: { games: 2, unit: { label: 'matches', one: 'match' } } },
      tieBreak: [{ key: 'points', better: 'higher' }] },
    { ...HIGH_POINTS },
    // SD-117c (CR-04) — the break, once the toss is recorded, and the Queen
    // covered by the side that lost the board ('keyed': only matches that
    // tracked them carry the keys; older lines read "not tracked")
    { key: 'boardBreaks', label: 'Boards broken', short: 'boards broken', one: 'board broken', group: 'record', coverage: 'keyed' },
    { key: 'boardBreaksWon', label: 'Won on own break', short: 'won on own break', one: 'won on own break', group: 'record', coverage: 'keyed' },
    { key: 'breakWinPct', label: 'Own-break win %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'boardBreaksWon', den: 'boardBreaks', scale: 100, dp: 0 } },
    { key: 'lostQueens', label: 'Queens covered, board lost', short: 'queens lost', one: 'queen lost', group: 'scoring', coverage: 'keyed' },
    // SD-86 (CR-05) — the career remainder over the SD-37 keys
    { key: 'gamesWL', label: 'Games W-L', source: 'derived', group: 'record', format: { unit: 'figure' }, agg: { kind: 'pair', a: 'gamesWon', b: 'gamesLost' } },
    { key: 'boardPct', label: 'Boards won %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'boards', den: 'boardsPlayed', scale: 100, dp: 0, over: 'recorded' } },
    { key: 'pointsPerBoard', label: 'Points per board won', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'rate', num: 'points', den: 'boards', dp: 1, over: 'recorded' } },
    { key: 'slams', label: 'Slams', short: 'slams', one: 'slam', source: 'derived', group: 'record', agg: { kind: 'sum', keys: ['whiteSlams', 'blackSlams'] } },
    // Deep wave — "Stats to track" (statTotals writes them only for a match
    // that tracked them: 'keyed', an older line reads "not tracked", never 0).
    // Missed covers are singles only; fouls are singles, or — round 2 — a
    // doubles partner's own from the "who" chips.
    { key: 'fouls', label: 'Fouls', short: 'fouls', one: 'foul', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    { key: 'foulStriker', label: 'Fouls: striker pocketed', short: 'striker fouls', one: 'striker foul', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    { key: 'foulTouch', label: 'Fouls: touching', short: 'touching fouls', one: 'touching foul', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    { key: 'foulLine', label: 'Fouls: line / hand', short: 'line fouls', one: 'line foul', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    // Round 2 — "line / hand" split into the ICF / AICF terms (boards recorded
    // from now on; an older line keeps its "line / hand" count)
    { key: 'foulBase', label: 'Fouls: base line', short: 'base-line fouls', one: 'base-line foul', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    { key: 'foulArrow', label: 'Fouls: arrow line', short: 'arrow-line fouls', one: 'arrow-line foul', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    { key: 'foulElbow', label: 'Fouls: elbow crossing', short: 'elbow fouls', one: 'elbow foul', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    { key: 'foulThumb', label: 'Fouls: thumbing', short: 'thumbing fouls', one: 'thumbing foul', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    { key: 'foulOther', label: 'Fouls: other', short: 'other fouls', one: 'other foul', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    { key: 'dues', label: 'Dues', short: 'dues', one: 'due', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    { key: 'foulBoards', label: 'Boards with fouls tracked', short: 'boards tracked', one: 'board tracked', group: 'discipline', coverage: 'keyed' },
    { key: 'foulsPerBoard', label: 'Fouls per board', source: 'derived', group: 'discipline', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'rate', num: 'fouls', den: 'foulBoards', dp: 2, qualifier: { den: 8, unit: { label: 'boards', one: 'board' } } } },
    { key: 'queenMisses', label: 'Queen covers missed', short: 'missed covers', one: 'missed cover', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    { key: 'qMissBoards', label: 'Boards with covers tracked', short: 'boards tracked', one: 'board tracked', group: 'discipline', coverage: 'keyed' },
    { key: 'brkPocketed', label: 'Coins pocketed on the break', short: 'coins on the break', one: 'coin on the break', group: 'record', coverage: 'keyed' },
    { key: 'brkTracked', label: 'Breaks tracked', short: 'breaks tracked', one: 'break tracked', group: 'record', coverage: 'keyed' },
    { key: 'brkAvg', label: 'Coins per break', leaderLabel: 'Most coins per break', source: 'derived', group: 'record', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'rate', num: 'brkPocketed', den: 'brkTracked', dp: 2, qualifier: { den: 8, unit: { label: 'breaks', one: 'break' } } } },
  ],
  // SD-86: rates over lines statTotals wrote (capped points, boards played) —
  // an older line (finisher-only, uncapped) stays out of them
  filters: { recorded: (l) => typeof l.stats?.boardsPlayed === 'number' },
  sections: [
    { id: 'match', title: 'Match play', rows: [{ stat: 'gamesWL' }, { stat: 'boardPct' }, { stat: 'zeroGames' }, { stat: 'boardBreaks' }, { stat: 'breakWinPct' }] },
    { id: 'scoring', title: 'Scoring', rows: [
      { stat: 'points' }, { stat: 'pointsPerMatch' }, { stat: 'pointsPerBoard' }, { stat: 'boards', label: 'Boards won' }, { stat: 'queens' }, { stat: 'lostQueens' },
      { stat: 'whiteSlams' }, { stat: 'blackSlams' }, { stat: 'highPoints', label: 'Best match' },
    ] },
    // Deep wave — shown only once a line tracked them
    { id: 'break', title: 'The break', rows: [{ stat: 'brkAvg' }, { stat: 'brkPocketed' }] },
    { id: 'discipline', title: 'Fouls & dues', rows: [
      { stat: 'fouls' }, { stat: 'foulsPerBoard' }, { stat: 'dues' },
      { stat: 'foulStriker', label: 'Striker pocketed', hideZero: true }, { stat: 'foulTouch', label: 'Touching', hideZero: true },
      { stat: 'foulBase', label: 'Base line', hideZero: true }, { stat: 'foulArrow', label: 'Arrow line', hideZero: true }, { stat: 'foulElbow', label: 'Elbow crossing', hideZero: true },
      { stat: 'foulLine', label: 'Line / hand', hideZero: true }, { stat: 'foulThumb', label: 'Thumbing', hideZero: true }, { stat: 'foulOther', label: 'Other', hideZero: true },
      { stat: 'queenMisses' },
    ] },
  ],
  careerView: 'sections',
  box: [{ columns: ['points', 'boards', 'queens'] }],
  compare: ['points', 'boards', 'queens'],
  // SD-27: boards and points per match (min matches) join points and queens
  leaders: ['points', 'boards', 'queens', 'pointsPerMatch'],
  headline: ['points', 'boards', 'queens'],
  awards: [
    { stat: 'points', icon: '🟤', label: 'Top scorer' },
    { stat: 'queens', icon: '👑', label: 'Queens' },
  ],
};
