/** SD-15 — chess's stat schema (see ../statSchema.ts). PURE. One line per
 *  game: `games` + the outcome key (so the results are 'core': a line without
 *  `losses` is 0 losses, never "not tracked" — SD-24). */
import type { SportStatSchema } from '../statSchema.ts';
import type { StatLine } from '../../core/types';
import { dpFor } from '../../data/chessRatings.ts';

/** Round 2 — TPR from summed figures: ARO (the opponents' average, rounded
 *  half up, C.07 art. 10.1) + dp(p) (B.02 table 8.1a, p = points ÷ games);
 *  undefined with no rated game. */
export function tprOf(games: number, oppSum: number, pts: number): number | undefined {
  if (!(games > 0)) return undefined;
  return Math.floor(oppSum / games + 0.5) + dpFor(pts / games);
}

/** SD-36 (CH-05) — how a game was won, as a key on the WINNER's line (new
 *  results only: older lines carry none, so the rows say over how many wins
 *  the method was recorded). A forfeit has its own `forfeitWins`. */
export const WIN_METHOD_KEYS = ['winsMate', 'winsResign', 'winsTime', 'winsOther'] as const;
export function winMethodKey(method?: string | null): typeof WIN_METHOD_KEYS[number] | undefined {
  switch (method) {
    case 'checkmate': return 'winsMate';
    case 'resignation': return 'winsResign';
    case 'time': return 'winsTime';
    case 'illegal-move': case 'adjudication': case 'arbiter': return 'winsOther';
    default: return undefined;
  }
}

/** The profile credit for ONE player when a result is recorded (both players
 *  get one): a game + the outcome (+ how it was won on the winner's line);
 *  SD-117c a forfeit is no game — a forfeit win / loss instead; SD-67 a double
 *  forfeit is a forfeit loss for each. SD-119: carries the player's own `side`,
 *  so their line's opponent is the OTHER player whoever won (a draw included). */
export function chessResultCredit(
  side: 'home' | 'away',
  p: { id: string; fullName: string } | undefined,
  winner: 'home' | 'away' | 'draw',
  method: string | null | undefined,
  dff: boolean,
): { playerId: string; playerName: string; stat: string; by: number; extra?: Record<string, number>; side: 'home' | 'away' } | undefined {
  if (!p) return undefined;
  const base = { playerId: p.id, playerName: p.fullName, by: 1, side };
  if (dff) return { ...base, stat: 'forfeitLosses' };
  if (method === 'forfeit' && winner !== 'draw') return { ...base, stat: winner === side ? 'forfeitWins' : 'forfeitLosses' };
  const outcome = winner === 'draw' ? 'draws' : winner === side ? 'wins' : 'losses';
  const how = winner === side ? winMethodKey(method) : undefined;
  return { ...base, stat: 'games', extra: { [outcome]: 1, ...(how ? { [how]: 1 } : {}) } };
}

const n = (l: StatLine, k: string) => Number(l.stats?.[k] ?? 0) || 0;
/** a won game whose method was recorded */
const winHow = (l: StatLine) => WIN_METHOD_KEYS.some((k) => n(l, k) > 0);
/** a game won over the board (the wins the method could be recorded for) */
const wonOtb = (l: StatLine) => n(l, 'wins') > 0;

export const chessStats: SportStatSchema<'chess'> = {
  sport: 'chess',
  /** SD-25 — career split chips (line context) */
  splits: ['colour', 'timeControl', 'tournament', 'season', 'opponent'],
  /** SD-137a — tournament / hub leaderboard + awards chips (classical / rapid / blitz) */
  leaderSplits: ['timeControl'],
  filters: { winHow, wonOtb },
  stats: [
    // SD-27: the rating weights are the game score (win 1, draw ½)
    { key: 'wins', label: 'Wins', short: 'wins', one: 'win', leaderLabel: 'Most wins', group: 'results', weight: 1, matchSummary: true, coverage: 'core',
      tieBreak: [{ key: 'score', better: 'higher' }] },
    { key: 'draws', label: 'Draws', short: 'draws', one: 'draw', group: 'results', weight: 0.5, matchSummary: true, coverage: 'core' },
    { key: 'games', label: 'Games', short: 'games', one: 'game', group: 'results', matchSummary: true, coverage: 'core' },
    { key: 'losses', label: 'Losses', short: 'losses', one: 'loss', group: 'results', matchSummary: true, coverage: 'core' },
    // SD-24 (CH-05) — score (W + ½D) and score %; by colour / time control
    // through the SD-25 split chips
    { key: 'score', label: 'Score', short: 'score', source: 'derived', group: 'results', format: { unit: 'points' }, agg: { kind: 'sum', keys: ['wins', 'wins', 'draws'], scale: 0.5 },
      tieBreak: [{ key: 'wins', better: 'higher' }] },
    { key: 'scorePct', label: 'Score %', source: 'derived', group: 'results', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: ['wins', 'wins', 'draws'], den: ['games', 'games'], scale: 100, dp: 0, qualifier: { games: 3, unit: { label: 'games', one: 'game' } } },
      leaderLabel: 'Best score %', tieBreak: [{ key: 'score', better: 'higher' }, { key: 'wins', better: 'higher' }] },
    // SD-117c — a forfeit is not a game played: it credits these instead of
    // games + wins / losses ('keyed': only lines that had one carry the key)
    { key: 'forfeitWins', label: 'Forfeit wins', short: 'forfeit wins', one: 'forfeit win', group: 'results', coverage: 'keyed' },
    { key: 'forfeitLosses', label: 'Forfeit losses', short: 'forfeit losses', one: 'forfeit loss', group: 'results', coverage: 'keyed' },
    // SD-36 (CH-05) — wins by method: summed over the wins that recorded one
    // (`winHow`), with a coverage note over all wins (`coverOf: wonOtb`)
    { key: 'winsMate', label: 'By checkmate', short: 'wins by checkmate', one: 'win by checkmate', group: 'how', coverage: 'core', agg: { kind: 'sum', over: 'winHow' }, coverOf: 'wonOtb' },
    { key: 'winsResign', label: 'By resignation', short: 'wins by resignation', one: 'win by resignation', group: 'how', coverage: 'core', agg: { kind: 'sum', over: 'winHow' }, coverOf: 'wonOtb' },
    { key: 'winsTime', label: 'On time', short: 'wins on time', one: 'win on time', group: 'how', coverage: 'core', agg: { kind: 'sum', over: 'winHow' }, coverOf: 'wonOtb' },
    { key: 'winsOther', label: 'Other', short: 'other wins', one: 'other win', group: 'how', coverage: 'core', agg: { kind: 'sum', over: 'winHow' }, coverOf: 'wonOtb' },
    // Deep wave — the game record (chess/totals.ts statTotals: 'keyed', only
    // on games that have them; an older line reads "not tracked", never 0)
    { key: 'lenGames', label: 'Games with a length', short: 'games with a length', one: 'game with a length', group: 'game', coverage: 'keyed' },
    { key: 'lenMoves', label: 'Moves played (game length)', short: 'moves', one: 'move', group: 'game', coverage: 'keyed' },
    { key: 'avgLength', label: 'Average game length (moves)', source: 'derived', coverage: 'keyed', group: 'game', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'rate', num: 'lenMoves', den: 'lenGames', dp: 1 } },
    { key: 'mvGames', label: 'Games with moves recorded', short: 'games with moves', one: 'game with moves', group: 'game', coverage: 'keyed' },
    { key: 'checksGiven', label: 'Checks given', short: 'checks', one: 'check', group: 'game', coverage: 'keyed' },
    { key: 'captures', label: 'Captures', short: 'captures', one: 'capture', group: 'game', coverage: 'keyed' },
    { key: 'matWon', label: 'Material captured (points)', short: 'material captured', group: 'game', format: { unit: 'points' }, coverage: 'keyed' },
    { key: 'castled', label: 'Games castled', short: 'games castled', one: 'game castled', group: 'game', coverage: 'keyed' },
    { key: 'promotions', label: 'Promotions', short: 'promotions', one: 'promotion', group: 'game', coverage: 'keyed' },
    { key: 'castledPct', label: 'Castled %', source: 'derived', coverage: 'keyed', group: 'game', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'castled', den: 'mvGames', scale: 100, dp: 0 } },
    { key: 'checksPerGame', label: 'Checks per game', source: 'derived', coverage: 'keyed', group: 'game', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'rate', num: 'checksGiven', den: 'mvGames', dp: 1 } },
    { key: 'matPerGame', label: 'Material captured per game', source: 'derived', coverage: 'keyed', group: 'game', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'rate', num: 'matWon', den: 'mvGames', dp: 1 } },
    { key: 'clkMoves', label: 'Moves timed', short: 'moves timed', one: 'move timed', group: 'game', coverage: 'keyed' },
    { key: 'thinkSecs', label: 'Thinking time (seconds)', short: 'seconds thinking', group: 'game', coverage: 'keyed' },
    { key: 'avgThink', label: 'Average time per move (s)', source: 'derived', coverage: 'keyed', group: 'game', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'rate', num: 'thinkSecs', den: 'clkMoves', dp: 1 } },
    // Round 2 — the tournament performance rating (FIDE C.07 art. 10.2 / B.02
    // 8.1: TPR = ARO + dp(p)) as a leader. The keys are NOT stored: the
    // tournament page adds them to its lines from the ratings players entered
    // (data/chessRatings.ts withChessPerformance — played games against a
    // rated opponent on the event's list), so a line without them is "not
    // tracked" and the category shows only where ratings exist. Unofficial.
    { key: 'tprGames', label: 'Games against rated opponents', short: 'rated games', one: 'rated game', group: 'perf', coverage: 'keyed' },
    { key: 'tprOppSum', label: 'Opponents\' ratings (sum)', short: 'opponent ratings', group: 'perf', coverage: 'keyed' },
    { key: 'tprPts', label: 'Points against rated opponents', short: 'points v rated', group: 'perf', format: { unit: 'points' }, coverage: 'keyed' },
    { key: 'tpr', label: 'Performance rating (TPR)', leaderLabel: 'Performance rating (TPR, unofficial)', source: 'derived', coverage: 'keyed', group: 'perf', format: { unit: 'count' },
      agg: { kind: 'formula', keys: ['tprGames', 'tprOppSum', 'tprPts'], den: 'tprGames', compute: (t) => tprOf(t.tprGames, t.tprOppSum, t.tprPts),
        qualifier: { den: 5, unit: { label: 'rated games', one: 'rated game' } } } },
  ],
  sections: [
    { id: 'results', title: 'Results', rows: [{ stat: 'games' }, { stat: 'score' }, { stat: 'scorePct' }, { stat: 'wins' }, { stat: 'draws' }, { stat: 'losses' }, { stat: 'forfeitWins' }, { stat: 'forfeitLosses' }] },
    // SD-36 — shown once any win recorded how it ended
    { id: 'how', title: 'Wins by method', rows: [{ stat: 'winsMate' }, { stat: 'winsResign' }, { stat: 'winsTime' }, { stat: 'winsOther', label: 'Other (illegal, arbiter)' }] },
    // Deep wave — shown once a game recorded its length / moves / clocks
    { id: 'game', title: 'Game record', rows: [
      { stat: 'avgLength' }, { stat: 'mvGames' }, { stat: 'checksPerGame' }, { stat: 'matPerGame' }, { stat: 'castledPct' },
      { stat: 'promotions', hideZero: true }, { stat: 'avgThink' },
    ] },
  ],
  careerView: 'sections',
  // the result is the row's pill; the row shows colour · time control instead
  history: [],
  // SD-27 (CH-12): score (1 / ½ / 0), score % (min games), wins — not "most draws".
  // Round 2 — the performance rating (TPR, min 5 rated games) where ratings exist.
  leaders: ['score', 'scorePct', 'wins', 'tpr'],
  // the Player of the Tournament: most points, then most wins (FIDE's WIN)
  mvp: {
    stat: 'score', tieBreak: [{ key: 'wins', better: 'higher' }],
    howRanked: 'Most points in this tournament\'s games (1 for a win, ½ for a draw). Ties: more wins, then by name. The standings\' own tie-breaks (Buchholz, Sonneborn-Berger…) aren\'t applied here, so check the table when players are level. You choose the winner.',
  },
  headline: ['wins', 'draws', 'games'],
  // one result per game — no in-game role award; a tournament "Most wins" slot
  awards: [
    // retired by SD-27 (the score decides chess); kept for published awards' icon
    { stat: 'wins', icon: '♟️', label: 'Most wins', match: false, tournament: false },
    { stat: 'scorePct', icon: '📈', label: 'Best score %', match: false,
      howRanked: 'Score %: points (1 for a win, ½ for a draw) ÷ games played. Players need at least {min} to rank. Ties: the higher score, then more wins, then by name. You choose the winner.' },
  ],
};
