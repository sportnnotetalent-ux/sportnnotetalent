/**
 * Snooker's Stats tab, the PURE half: the CompareTable categories for the
 * match or one frame (WST match statistics: frames, breaks, potting, fouls),
 * the frame-by-frame sheet and the break list. From the engine's derived
 * stats (snookerStats) — a row the scope didn't track (quick frames: no
 * breaks) is left out, never shown as a false 0.
 */
import { countRow, nonEmpty, ofPct, type CompareCategory, type CompareRow } from '../gcc/model.ts';
import { breaks, FOUL_KINDS, type Side, type SnookerState } from './engine.ts';
import { readFrames, statsFor } from './read.ts';
import { FOUL_KIND_LABEL, HOW_LABEL } from './controls.ts';
import { SNOOKER_FOUL_KEY, snookerLongRestCaptured } from './totals.ts';

/** The break list's default floor: 20+. A school or club player's good visit
 *  (about five pots with colours); 50+ and centuries stand out inside it, and
 *  the chips switch to 50+ / 100+. Professional lists start at 50. */
export const BREAK_LIST_MIN = 20;
export const BREAK_LIST_CHIPS = [20, 50, 100];

/** The frames the match has (completed + the one in play), for the unit chips. */
export const snookerFrameNumbers = (s: SnookerState): number[] => readFrames(s).map((f) => f.n);

/** Categories for the whole match (`frame` absent) or one frame. */
export function snookerMatchStats(s: SnookerState, frame?: number): CompareCategory[] {
  const { home: H, away: A } = statsFor(s, frame);
  const detailed = H.detailedFrames > 0;
  // NZG1/NZG2 — long / rest rows only once the MATCH has a tag of that kind
  const lr = snookerLongRestCaptured(s);
  const head: CompareRow[] = frame == null
    ? [countRow('framesWon', 'Frames won', H.framesWon, A.framesWon), countRow('points', 'Frame points', H.points, A.points)]
    : [countRow('points', 'Points', H.points, A.points)];
  const cats: CompareCategory[] = [{ id: frame == null ? 'frames' : 'score', title: frame == null ? 'Frames' : 'Score', rows: head }];
  if (detailed) {
    const ppv = (p: number, v: number) => (v ? (p / v).toFixed(1) : '–');
    cats.push({ id: 'breaks', title: 'Breaks', rows: [
      countRow('highest', 'Highest break', H.highestBreak, A.highestBreak),
      countRow('fiftyPlus', '50+ breaks', H.fiftyPlus, A.fiftyPlus),
      countRow('centuries', 'Century breaks', H.centuries, A.centuries),
      ...(H.maximums || A.maximums ? [countRow('maximums', 'Maximum breaks', H.maximums, A.maximums)] : []),
      // cue batch 6 — every red and every colour in one visit
      ...(H.totalClearances || A.totalClearances ? [countRow('totalClearances', 'Total clearances', H.totalClearances, A.totalClearances)] : []),
      countRow('potted', 'Points from pots', H.potted, A.potted),
      { key: 'ppv', label: 'Points per visit', home: ppv(H.potted, H.visits), away: ppv(A.potted, A.visits), hv: H.visits ? H.potted / H.visits : 0, av: A.visits ? A.potted / A.visits : 0 },
    ] });
    cats.push({ id: 'potting', title: 'Potting', rows: [
      {
        key: 'potSuccess', label: 'Pot success', home: ofPct(H.potStrokes, H.potStrokes + H.missedPots), away: ofPct(A.potStrokes, A.potStrokes + A.missedPots),
        hv: H.potSuccess ?? 0, av: A.potSuccess ?? 0,
      },
      countRow('missedPots', 'Missed pots', H.missedPots, A.missedPots, 'lower'),
      countRow('safeties', 'Safeties', H.safeties, A.safeties),
      // cue batch 5: a safety held when the opponent's next visit scored nothing
      ...(H.safetiesJudged || A.safetiesJudged ? [{
        key: 'safetySuccess', label: 'Safety success', home: ofPct(H.safetiesWon, H.safetiesJudged), away: ofPct(A.safetiesWon, A.safetiesJudged),
        hv: H.safetiesJudged ? H.safetiesWon / H.safetiesJudged : 0, av: A.safetiesJudged ? A.safetiesWon / A.safetiesJudged : 0,
      }] : []),
      // cue batch 6 — long pots and the rest, only when tracked AND tagged (NZG1/NZG2)
      ...(lr.long ? [
        { key: 'longPots', label: 'Long pots', home: ofPct(H.longPots, H.longAttempts), away: ofPct(A.longPots, A.longAttempts),
          hv: H.longAttempts ? H.longPots / H.longAttempts : 0, av: A.longAttempts ? A.longPots / A.longAttempts : 0 },
      ] : []),
      ...(lr.rest ? [countRow('restShots', 'Shots with the rest', H.restShots, A.restShots)] : []),
      countRow('visits', 'Visits to the table', H.visits, A.visits),
    ] });
    const fouls: CompareRow[] = [
      countRow('fouls', 'Fouls', H.fouls, A.fouls, 'lower'),
      countRow('foulPoints', 'Penalty points given away', H.penaltyConceded, A.penaltyConceded, 'lower'),
    ];
    if (H.missesCalled || A.missesCalled) fouls.push(countRow('foulMisses', 'Fouls and a miss', H.missesCalled, A.missesCalled, 'lower'));
    if (H.freeBalls || A.freeBalls) fouls.push(countRow('freeBalls', 'Free balls received', H.freeBalls, A.freeBalls));
    // cue batch 5: one row per foul kind (non-zero only), as billiards
    for (const k of FOUL_KINDS) {
      const h = H.foulsByKind[k] ?? 0, a = A.foulsByKind[k] ?? 0;
      if (h || a) fouls.push(countRow(SNOOKER_FOUL_KEY[k], FOUL_KIND_LABEL[k], h, a, 'lower'));
    }
    cats.push({ id: 'fouls', title: 'Fouls', rows: fouls });
  }
  return nonEmpty(cats);
}

export interface FrameRow {
  n: number;
  breaker: Side | null;
  /** home, away */
  score: [number, number];
  winner: Side | null;
  /** "on the black", "conceded", "score only", "in play" */
  how: string;
  /** each side's best break in the frame (null for a quick frame) */
  high: { home: number; away: number } | null;
  quick: boolean;
  live: boolean;
  reracks: number;
}

/** The frame-by-frame sheet. */
export function frameSheet(s: SnookerState): FrameRow[] {
  return readFrames(s).map((f) => {
    const best = (side: Side) => f.visits.reduce((m, v) => (v.side === side ? Math.max(m, v.pts) : m), 0);
    return {
      n: f.n, breaker: f.breaker, score: f.score, winner: f.winner,
      how: f.live ? 'in play' : HOW_LABEL[f.how ?? ''] ?? '',
      high: f.quick ? null : { home: best('home'), away: best('away') },
      quick: f.quick, live: f.live, reracks: f.reracks,
    };
  });
}

/** Breaks of `min` or more, biggest first (ties: the earlier frame). */
export function breakList(s: SnookerState, min = BREAK_LIST_MIN): Array<{ side: Side; frame: number; pts: number }> {
  return breaks(s, min).map((b, i) => ({ ...b, i })).sort((a, b) => b.pts - a.pts || a.frame - b.frame || a.i - b.i).map(({ side, frame, pts }) => ({ side, frame, pts }));
}
