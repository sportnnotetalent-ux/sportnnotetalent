/**
 * Deep wave — the carrom match stats panel (broadcast depth, ICF records):
 * scoring, slams, the Queen, the break and — when tracked — fouls by type and
 * dues, per side, for the whole match or one game. PURE: from the state's
 * boards (they replay from the event log). A row the match didn't track is
 * left out (never a false 0); a stat tracked on only some boards says so.
 */
import { boardBreakers, creditedPoints, FOUL_TYPES, FOUL_LABEL, type CarromState, type Side } from './engine.ts';
import { countRow, nonEmpty, ofPct, type CompareCategory, type CompareRow } from '../gcc/model.ts';

/** Per-side totals over a set of boards (indexes into `s.boards`). */
interface SideAgg {
  points: number; boards: number; penaltyPts: number; best: number; coins: number;
  /** Round 2 — points from board-ending fouls (ICF r.102–112, foulScore) */
  endFoulPts: number;
  white: number; black: number;
  queens: number; queens22: number; queenLost: number; qMiss: number;
  broke: number; brokeWon: number; brk: number; brkN: number;
  fouls: Record<string, number>; foulsAll: number; dues: number;
}

const zero = (): SideAgg => ({
  points: 0, boards: 0, penaltyPts: 0, best: 0, coins: 0, endFoulPts: 0, white: 0, black: 0,
  queens: 0, queens22: 0, queenLost: 0, qMiss: 0, broke: 0, brokeWon: 0, brk: 0, brkN: 0,
  fouls: {}, foulsAll: 0, dues: 0,
});

/** The games a match has (for the unit chips): [1, 2, 3]. */
export const carromGames = (s: CarromState): number[] => [...new Set((s?.boards ?? []).map((b) => b.game))];

/** Category rows for the whole match (`game` absent) or one game. */
export function carromMatchStats(s: CarromState, game?: number): CompareCategory[] {
  const boards = s?.boards ?? [];
  const capped = creditedPoints(s);
  const breakers = boardBreakers(s);
  const idx = boards.map((_, i) => i).filter((i) => game == null || boards[i].game === game);
  const agg: Record<Side, SideAgg> = { home: zero(), away: zero() };
  let queenRecorded = 0, slamAny = 0, foulBoards = 0, brkBoards = 0, qMissBoards = 0, tossKnown = 0;
  for (const i of idx) {
    const b = boards[i];
    const w = b.winner;
    const l: Side = w === 'home' ? 'away' : 'home';
    const W = agg[w], L = agg[l];
    W.points += capped[i];
    if (b.endFoul) W.endFoulPts += (b.endFoul.striker ? 1 : 0) + (b.endFoul.improper ? 1 : 0);
    if (b.penalty) { W.penaltyPts += capped[i]; }
    else {
      W.boards += 1;
      W.best = Math.max(W.best, capped[i]);
      // net coins pocketed: the winner holed all 9 of theirs, the loser 9 − left
      W.coins += 9; L.coins += 9 - b.coins;
      if (b.slam === 'white') W.white += 1;
      if (b.slam === 'black') W.black += 1;
      if (b.slam) slamAny += 1;
      if (b.queen) { if (b.points > b.coins) W.queens += 1; else W.queens22 += 1; }
      if (b.queenBy) queenRecorded += 1;
      if (b.queenBy === 'loser') L.queenLost += 1;
    }
    const br = breakers[i];
    if (br) {
      tossKnown += 1;
      agg[br].broke += 1;
      if (br === w) agg[br].brokeWon += 1;
      if (b.det?.brk != null) { agg[br].brk += b.det.brk; agg[br].brkN += 1; }
    }
    if (b.det?.brk != null) brkBoards += 1;
    if (b.det?.fouls) {
      foulBoards += 1;
      for (const sd of ['home', 'away'] as Side[]) {
        for (const t of FOUL_TYPES) {
          const n = b.det.fouls[sd]?.[t] ?? 0;
          if (n) { agg[sd].fouls[t] = (agg[sd].fouls[t] ?? 0) + n; agg[sd].foulsAll += n; }
        }
        agg[sd].dues += b.det.dues?.[sd] ?? 0;
      }
    }
    if (b.det?.qMiss) { qMissBoards += 1; for (const sd of ['home', 'away'] as Side[]) agg[sd].qMiss += b.det.qMiss[sd] ?? 0; }
  }
  const n = idx.length;
  const H = agg.home, A = agg.away;
  const cover = (k: number, what = 'boards') => (k < n ? `tracked on ${k} of ${n} ${what}` : undefined);
  const avg = (pts: number, b: number) => (b ? (pts / b).toFixed(1) : '–');

  const scoring: CompareRow[] = [
    countRow('points', 'Points', H.points, A.points),
    countRow('boards', 'Boards won', H.boards, A.boards),
    { key: 'ppb', label: 'Points per board won', home: avg(H.points - H.penaltyPts, H.boards), away: avg(A.points - A.penaltyPts, A.boards),
      hv: H.boards ? (H.points - H.penaltyPts) / H.boards : 0, av: A.boards ? (A.points - A.penaltyPts) / A.boards : 0 },
    countRow('best', 'Best board', H.best, A.best),
    countRow('coins', 'Coins pocketed', H.coins, A.coins),
  ];
  if (H.penaltyPts || A.penaltyPts) scoring.push(countRow('pen', 'Penalty-board points', H.penaltyPts, A.penaltyPts));
  if (H.endFoulPts || A.endFoulPts) scoring.push(countRow('endFoul', 'Points from the opponent\'s board-ending fouls', H.endFoulPts, A.endFoulPts));
  if (slamAny) {
    scoring.push(countRow('white', 'White slams', H.white, A.white));
    scoring.push(countRow('black', 'Black slams', H.black, A.black));
  }

  const queen: CompareRow[] = [countRow('queens', 'Queens covered (+3)', H.queens, A.queens)];
  if (H.queens22 || A.queens22) queen.push(countRow('q22', 'Queens covered at 22+ (no points)', H.queens22, A.queens22));
  if (queenRecorded) queen.push(countRow('qlost', 'Queen covered, board lost', H.queenLost, A.queenLost, 'lower'));
  if (qMissBoards) queen.push(countRow('qmiss', 'Queen pocketed, cover missed', H.qMiss, A.qMiss, 'lower', cover(qMissBoards)));

  const brk: CompareRow[] = [];
  if (tossKnown) {
    brk.push(countRow('broke', 'Boards broken', H.broke, A.broke));
    brk.push({ key: 'brokeWon', label: 'Won on own break', home: ofPct(H.brokeWon, H.broke), away: ofPct(A.brokeWon, A.broke),
      hv: H.broke ? H.brokeWon / H.broke : 0, av: A.broke ? A.brokeWon / A.broke : 0 });
  }
  if (brkBoards) {
    brk.push(countRow('brk', 'Coins pocketed on the break', H.brk, A.brk, 'higher', cover(brkBoards)));
    brk.push({ key: 'brkAvg', label: 'Coins per break', home: H.brkN ? (H.brk / H.brkN).toFixed(1) : '–', away: A.brkN ? (A.brk / A.brkN).toFixed(1) : '–',
      hv: H.brkN ? H.brk / H.brkN : 0, av: A.brkN ? A.brk / A.brkN : 0 });
  }

  const fouls: CompareRow[] = [];
  if (foulBoards) {
    fouls.push(countRow('fouls', 'Fouls', H.foulsAll, A.foulsAll, 'lower', cover(foulBoards)));
    for (const t of FOUL_TYPES) {
      const h = H.fouls[t] ?? 0, a = A.fouls[t] ?? 0;
      if (h || a) fouls.push(countRow(`foul-${t}`, FOUL_LABEL[t], h, a, 'lower'));
    }
    fouls.push(countRow('dues', 'Dues', H.dues, A.dues, 'lower'));
  }

  return nonEmpty([
    { id: 'scoring', title: 'Scoring', rows: scoring },
    { id: 'queen', title: 'Queen', rows: queen },
    { id: 'break', title: 'Break', rows: brk },
    { id: 'fouls', title: 'Fouls', rows: fouls },
  ]);
}
