/**
 * Golf match play state + reducer (moved out of index.tsx so it is testable in
 * node; index.tsx re-exports it). The original HOLE / CONCEDE behaviour is
 * unchanged — SD-87 only ADDS keys, so every older event log replays to the
 * same state:
 *   • `firstHole` — set only for a back-nine match (10), so holes read 10–18;
 *   • `strokes`   — the handicap strokes (SET_STROKES; absent = a plain match);
 *   • `scores`    — per-hole gross strokes, only once a HOLE carries
 *                   `{ home, away }`. The winner still comes from `winner`
 *                   (the scorer's screen works it out with `holeWinner`).
 */
import { matchState, type HoleWinner } from './engine.ts';
import { scoreStatKey, type MatchStrokes } from './matchStrokes.ts';

export interface GolfMatchState {
  /** holes in the match (18 or 9) */
  regulation: number;
  /** knockout: an all-square match goes to extra holes */
  extraHoles: boolean;
  holes: HoleWinner[];
  /** a side conceded the match */
  conceded?: 'home' | 'away';
  ended: boolean;
  seq: number;
  /** SD-87 — the first hole's number: 10 on a back-nine match (absent = 1) */
  firstHole?: number;
  /** SD-87 — handicap strokes for the match (absent = none set) */
  strokes?: MatchStrokes;
  /** SD-87 — each hole's gross strokes, when they were entered */
  scores?: ({ home: number; away: number } | null)[];
  /** Deep wave — when each hole was recorded (ms, the scorer's clock;
   *  `payload.at`), for the commentary. Absent on older logs. */
  holeAt?: (number | null)[];
  /** Deep wave — when the match was conceded (ms) */
  concededAt?: number;
}

export const initGolfMatch = (config?: Record<string, unknown>): GolfMatchState => ({
  regulation: String(config?.holes ?? '18') === '18' ? 18 : 9,
  extraHoles: config?.extraHoles === true,
  holes: [],
  ended: false,
  seq: 0,
  ...(String(config?.holes) === 'back9' ? { firstHole: 10 } : {}),
});

const stamp = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

const strokeCount = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 20 ? v : null);

export const golfMatchReducer = (s: GolfMatchState, a: { type: string; side?: 'home' | 'away'; payload?: Record<string, unknown> }): GolfMatchState => {
  if (s.ended) return s;
  if (a.type === 'HOLE') {
    const w = a.payload?.winner as HoleWinner | undefined;
    if (w !== 'home' && w !== 'away' && w !== 'halved') return s;
    const holes = [...s.holes, w];
    const m = matchState(holes, s.regulation, s.extraHoles);
    const next: GolfMatchState = { ...s, holes, ended: m.decided, seq: s.seq + 1 };
    // SD-87 — keep the gross strokes when the hole was scored stroke by stroke
    const home = strokeCount(a.payload?.home), away = strokeCount(a.payload?.away);
    if (home != null && away != null) {
      const scores = [...(s.scores ?? s.holes.map(() => null))];
      scores[holes.length - 1] = { home, away };
      next.scores = scores;
    } else if (s.scores) {
      next.scores = [...s.scores, null];
    }
    // Deep wave — the hole's time stamp (a new optional key: old logs carry none)
    const at = stamp(a.payload?.at);
    if (at != null) {
      const times = [...(s.holeAt ?? s.holes.map(() => null))];
      times[holes.length - 1] = at;
      next.holeAt = times;
    } else if (s.holeAt) {
      next.holeAt = [...s.holeAt, null];
    }
    return next;
  }
  if (a.type === 'CONCEDE' && (a.side === 'home' || a.side === 'away')) {
    const at = stamp(a.payload?.at);
    return { ...s, conceded: a.side, ended: true, seq: s.seq + 1, ...(at != null ? { concededAt: at } : {}) };
  }
  // SD-87 — set (or clear, with no payload) the handicap strokes
  if (a.type === 'SET_STROKES') {
    const ms = a.payload?.strokes as MatchStrokes | undefined;
    if (ms && (!Array.isArray(ms.holes) || !Array.isArray(ms.home) || !Array.isArray(ms.away))) return s;
    const { strokes: _old, ...rest } = s;
    return ms ? { ...rest, strokes: ms, seq: s.seq + 1 } : { ...rest, seq: s.seq + 1 };
  }
  return s;
};

export const golfMatchStateOf = (s: GolfMatchState) => matchState(s.holes, s.regulation, s.extraHoles, s.firstHole ?? 1);

type Side = 'home' | 'away';
/** A hole's profile credit (SD-119: `side` — each player's line names the OTHER player). */
export interface HoleCredit { playerId: string; stat: string; by: number; extra?: Record<string, number>; side: Side }

/**
 * The HOLE action the scorer's buttons (and voice) dispatch — one pure
 * builder, so the controls and the tests build it the same way. IDs-only
 * scoring (docs/privacy/ids-only-scoring.md): match events are public, so
 * each credit names its player by id only (names are looked up when shown).
 *   • no strokes: the hole's winner is credited a hole won;
 *   • SD-87 strokes entered (`strokes` + the hole's `par`): each player's
 *     score on the hole (birdie, par …) is credited too, beside the hole won.
 */
export function holeAction(
  winner: HoleWinner,
  players: { home?: { id: string }; away?: { id: string } },
  o: { strokes?: { home: number; away: number }; par?: number; at?: number } = {},
): { type: 'HOLE'; side?: Side; payload: Record<string, unknown>; attribution?: HoleCredit; attribution2?: HoleCredit } {
  const side = winner === 'halved' ? undefined : winner;
  const at = o.at ? { at: o.at } : {};
  if (!o.strokes || o.par == null) {
    const p = side ? players[side] : undefined;
    return { type: 'HOLE', ...(side ? { side } : {}), payload: { winner, ...at }, ...(p && side ? { attribution: { playerId: p.id, stat: 'holesWon', by: 1, side } } : {}) };
  }
  const strokes = o.strokes;
  const par = o.par;
  const credit = (who: Side): HoleCredit | undefined => {
    const pl = players[who];
    if (!pl) return undefined;
    const key = scoreStatKey(strokes[who], par);
    return winner === who
      ? { playerId: pl.id, stat: 'holesWon', by: 1, extra: { [key]: 1 }, side: who }
      : { playerId: pl.id, stat: key, by: 1, side: who };
  };
  return { type: 'HOLE', ...(side ? { side } : {}), payload: { winner, home: strokes.home, away: strokes.away, ...at }, attribution: credit('home'), attribution2: credit('away') };
}
