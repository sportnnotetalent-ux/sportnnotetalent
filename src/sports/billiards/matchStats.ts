/**
 * English billiards' Stats tab, the PURE half: CompareTable categories for
 * the match or one frame (frames, breaks with the billiards average, the
 * strokes, safety and misses, fouls), the frame-by-frame sheet and the break
 * list. From the engine's derived stats; a scope without a shot-by-shot frame
 * shows the score only (never a false 0).
 */
import { countRow, nonEmpty, type CompareCategory, type CompareRow } from '../gcc/model.ts';
import { breaks, FOUL_KINDS, type BilliardsState, type Side } from './engine.ts';
import { readFrames, statsFor } from './read.ts';
import { FOUL_KIND_LABEL, HOW_LABEL } from './controls.ts';

/** The break list's default floor: 25+, about ten scoring strokes (billiards
 *  breaks run longer than snooker's: no clearance cap, 2–3 points a stroke).
 *  The chips switch to 50+ / 100+ (the standard century). */
export const BREAK_LIST_MIN = 25;
export const BREAK_LIST_CHIPS = [25, 50, 100];

export const billiardsFrameNumbers = (s: BilliardsState): number[] => readFrames(s).map((f) => f.n);

export function billiardsMatchStats(s: BilliardsState, frame?: number): CompareCategory[] {
  const { home: H, away: A } = statsFor(s, frame);
  const head: CompareRow[] = frame == null
    ? [countRow('framesWon', 'Frames won', H.framesWon, A.framesWon), countRow('points', 'Points', H.points, A.points)]
    : [countRow('points', 'Points', H.points, A.points)];
  const cats: CompareCategory[] = [{ id: frame == null ? 'frames' : 'score', title: frame == null ? 'Frames' : 'Score', rows: head }];
  if (H.detailedFrames > 0) {
    const avg = (x: number | null) => (x == null ? '–' : x.toFixed(1));
    cats.push({ id: 'breaks', title: 'Breaks', rows: [
      countRow('highest', 'Highest break', H.highestBreak, A.highestBreak),
      { key: 'average', label: 'Average (points per visit)', home: avg(H.average), away: avg(A.average), hv: H.average ?? 0, av: A.average ?? 0 },
      countRow('fiftyPlus', '50+ breaks', H.fiftyPlus, A.fiftyPlus),
      countRow('centuries', 'Century breaks', H.centuries, A.centuries),
      ...(H.doubleCenturies || A.doubleCenturies ? [countRow('doubleCenturies', 'Double-century breaks', H.doubleCenturies, A.doubleCenturies)] : []),
      countRow('scored', 'Points from strokes', H.scored, A.scored),
    ] });
    cats.push({ id: 'strokes', title: 'Strokes', rows: [
      countRow('potRed', 'Red pots', H.potRed, A.potRed),
      countRow('inOffRed', 'In-offs from the red', H.inOffRed, A.inOffRed),
      countRow('cannons', 'Cannons', H.cannons, A.cannons),
      countRow('potWhite', 'White pots', H.potWhite, A.potWhite),
      countRow('inOffWhite', 'In-offs from the white', H.inOffWhite, A.inOffWhite),
    ] });
    cats.push({ id: 'play', title: 'Safety and misses', rows: [
      countRow('safeties', 'Safeties', H.safeties, A.safeties),
      countRow('misses', 'Missed attempts', H.misses, A.misses, 'lower'),
      countRow('visits', 'Visits to the table', H.visits, A.visits),
    ] });
    const fouls: CompareRow[] = [
      countRow('fouls', 'Fouls', H.fouls, A.fouls, 'lower'),
      countRow('foulPoints', 'Penalty points given away', H.penaltyConceded, A.penaltyConceded, 'lower'),
    ];
    for (const k of FOUL_KINDS) {
      const h = H.foulsByKind[k] ?? 0, a = A.foulsByKind[k] ?? 0;
      if (h || a) fouls.push(countRow(`foul-${k}`, FOUL_KIND_LABEL[k], h, a, 'lower'));
    }
    cats.push({ id: 'fouls', title: 'Fouls', rows: fouls });
  }
  return nonEmpty(cats);
}

export interface FrameRow {
  n: number;
  breaker: Side | null;
  score: [number, number];
  raw?: [number, number];
  winner: Side | 'draw' | null;
  how: string;
  high: { home: number; away: number } | null;
  quick: boolean;
  live: boolean;
}

export function frameSheet(s: BilliardsState): FrameRow[] {
  return readFrames(s).map((f) => {
    const best = (side: Side) => f.visits.reduce((m, v) => (v.side === side ? Math.max(m, v.pts) : m), 0);
    return {
      n: f.n, breaker: f.breaker, score: f.score, ...(f.raw ? { raw: f.raw } : {}), winner: f.winner,
      how: f.live ? (f.sudden ? 'sudden death' : 'in play') : HOW_LABEL[f.how ?? ''] ?? '',
      high: f.quick ? null : { home: best('home'), away: best('away') },
      quick: f.quick, live: f.live,
    };
  });
}

export function breakList(s: BilliardsState, min = BREAK_LIST_MIN): Array<{ side: Side; frame: number; pts: number }> {
  return breaks(s, min).map((b, i) => ({ ...b, i })).sort((a, b) => b.pts - a.pts || a.frame - b.frame || a.i - b.i).map(({ side, frame, pts }) => ({ side, frame, pts }));
}
