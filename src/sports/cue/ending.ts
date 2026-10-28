/**
 * Cue sports — does a tap end a frame or the match? The controls ask first
 * (askConfirm) before any tap that closes a frame: the last black, a foul on
 * it, a concession, an award, a quick frame score, TIME in a timed game.
 *
 * The answer comes from the engine itself: the tap is applied to the current
 * state (the reducers are pure) and a new frame record means it ends one, so
 * the question can never disagree with what the tap does. PURE (no React
 * Native); never throws. Both engines share the frame-record shape read here.
 */
import type { ConfirmCopy } from '../../core/matchSafety.ts';

type Side = 'home' | 'away';

export interface Ending {
  /** 'match' when the tap also ends the match */
  kind: 'frame' | 'match';
  /** the frame it closes */
  frame: number;
  winner: Side | 'draw';
  /** the frame's score as recorded (home, away) */
  score: [number, number];
  /** frames won after the tap */
  frames: { home: number; away: number };
  /** how the frame ends (the engine's `how`: black, foul, respot, concede, award, quick, target, time…) */
  how: string;
  conceded?: Side;
  reason?: string;
}

interface FrameLike { n?: unknown; score?: unknown; winner?: unknown; how?: unknown; conceded?: unknown; reason?: unknown }
interface CueLike { frames?: unknown; framesWon?: unknown; ended?: unknown }

const isSide = (v: unknown): v is Side => v === 'home' || v === 'away';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** What `a` would end, applied to `s` (null: nothing, or the tap is refused). */
export function endingOf<S>(reduce: (s: S, a: never) => S, s: S, a: unknown): Ending | null {
  try {
    if (!s || typeof s !== 'object' || !a || typeof a !== 'object') return null;
    const prev = s as unknown as CueLike;
    const next = reduce(s, a as never) as unknown as CueLike;
    if (!next || next === prev || !Array.isArray(prev.frames) || !Array.isArray(next.frames) || next.frames.length <= prev.frames.length) return null;
    const rec = next.frames[next.frames.length - 1] as FrameLike;
    const sc = rec?.score;
    if (!rec || !Array.isArray(sc) || !isNum(sc[0]) || !isNum(sc[1])) return null;
    const won = next.framesWon as { home?: unknown; away?: unknown } | undefined;
    const winner = isSide(rec.winner) || rec.winner === 'draw' ? rec.winner : null;
    if (!winner) return null;
    return {
      kind: next.ended === true ? 'match' : 'frame',
      frame: isNum(rec.n) ? rec.n : prev.frames.length + 1,
      winner,
      score: [sc[0], sc[1]],
      frames: { home: isNum(won?.home) ? won.home : 0, away: isNum(won?.away) ? won.away : 0 },
      how: typeof rec.how === 'string' ? rec.how : '',
      ...(isSide(rec.conceded) ? { conceded: rec.conceded } : {}),
      ...(typeof rec.reason === 'string' ? { reason: rec.reason } : {}),
    };
  } catch {
    return null;
  }
}

const REASON_WORD: Record<string, string> = { miss: 'foul and a miss', conduct: 'conduct', time: 'time', other: 'referee\'s decision' };

/** The confirm sheet's words for an ending. `unit` = what the sport calls a
 *  frame ("frame"; a single billiards game: "game"). Names are for the
 *  screen only: nothing here is stored. */
export function endingCopy(e: Ending, names: { home: string; away: string }, unit: 'frame' | 'game'): ConfirmCopy {
  const name = (s: Side) => (s === 'home' ? names.home : names.away);
  const [h, a] = e.score;
  const match = e.kind === 'match';
  const what = `${unit} ${e.frame}`;
  let line: string;
  if (e.winner === 'draw') {
    line = `${cap(what)} ends level, ${h}–${a}: a draw`;
  } else {
    const w = e.winner;
    const ws = w === 'home' ? h : a;
    const ls = w === 'home' ? a : h;
    if (e.how === 'concede' && e.conceded) line = `${name(e.conceded)} concedes ${what} at ${names.home} ${h}–${a} ${names.away}: ${name(w)} wins it`;
    else if (e.how === 'award') line = `${cap(what)} is awarded to ${name(w)}${e.reason && REASON_WORD[e.reason] ? ` (${REASON_WORD[e.reason]})` : ''}`;
    else line = `${name(w)} wins ${what}, ${ws}–${ls}`;
  }
  const fh = e.frames.home;
  const fa = e.frames.away;
  let tail: string;
  if (!match) tail = `. ${cap(unit)}s: ${names.home} ${fh}, ${names.away} ${fa}.`;
  else if (e.winner === 'draw') tail = '. The match is drawn.';
  else if (fh + fa <= 1) tail = ', and the match.';
  else tail = `, and the match ${Math.max(fh, fa)}–${Math.min(fh, fa)}.`;
  return {
    title: match ? 'End the match?' : `End ${what}?`,
    message: `${line}${tail}`,
    yesLabel: match ? 'Yes, end match' : `Yes, end ${unit}`,
    noLabel: 'No, keep scoring',
    tone: match ? 'danger' : 'caution',
  };
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
