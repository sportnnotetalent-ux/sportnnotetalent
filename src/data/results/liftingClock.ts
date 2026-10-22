/**
 * Round 2 (precision-strength) — the weightlifting competition clock. A
 * scorer's aid on the entry screen, NEVER a result: nothing here is stored and
 * no decision follows from it (the referees decide). Pure.
 *
 * IWF Technical & Competition Rules (TCRR 2024 edition, 6.6.7 – 6.6.12 and
 * 7.10.5 — see docs/sport-depth/deep-wave/precision-strength-round2.md):
 *  - an attempt has 1 minute from the call — when the speaker has announced
 *    it or the bar is loaded, whichever is later (the official starts the clock);
 *  - a lifter who follows themself — two attempts in a row in the same lift —
 *    has 2 minutes (6.6.8: only while nobody else is called in between);
 *  - signals 30 s after the start and 30 s before the end: on a 2-minute clock
 *    the first is the deadline to declare the next weight (6.6.12), the second
 *    the "final call" — no weight increase after it (6.6.10);
 *  - the clock stops when the bar leaves the platform (7.10.5); if time runs
 *    out first it is a no lift — the app only shows "time", the official
 *    records the decision.
 *
 * The organiser can switch the clock off (rule `wlClock`, Competition rules).
 */
import type { ResultEntry } from './model.ts';

export type ClockLift = 'snatch' | 'cj';

/** IWF: 1 minute an attempt, 2 minutes for consecutive attempts, a warning at 30 s left. */
export const CLOCK_ONE = 60;
export const CLOCK_TWO = 120;
export const CLOCK_WARN = 30;

/**
 * The time allowed for the lifter now called: 2 minutes when the attempt just
 * taken in this lift (the highest attempt number `seq`) was theirs, else 1
 * minute. A lift's first attempt of the session (nothing taken yet) is 1 minute.
 */
export function clockAllowance(entries: ResultEntry[], call: { entryId: string; lift: ClockLift }): { seconds: number; consecutive: boolean } {
  let last: { id: string; seq: number } | null = null;
  for (const e of entries) {
    for (const a of e.result?.lifts?.[call.lift] ?? []) {
      // a declined attempt is not lifted — the next lifter is called as usual
      if (a.seq == null || a.pass || a.good === undefined) continue;
      if (!last || a.seq > last.seq) last = { id: e.id, seq: a.seq };
    }
  }
  const consecutive = !!last && last.id === call.entryId;
  return { seconds: consecutive ? CLOCK_TWO : CLOCK_ONE, consecutive };
}

export type ClockPhase = 'idle' | 'running' | 'warn' | 'over' | 'stopped';
export interface ClockView {
  /** whole seconds left (rounded up while running, so "0:01" shows until time is up) */
  left: number;
  /** "1:00", "0:29" */
  text: string;
  phase: ClockPhase;
  /** what the official should hear / see now ('' when nothing) */
  note: string;
}

/** "1:00", "0:07", "2:00". */
export const clockText = (s: number): string => {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

/**
 * Where the clock stands: idle (not started), running, the 30-second warning,
 * or over. `startedAt` / `now` in ms; `stoppedLeft` = the seconds left when the
 * official stopped it (the bar left the platform — the clock stops).
 */
export function clockView(seconds: number, startedAt: number | null | undefined, now: number, stoppedLeft?: number | null): ClockView {
  if (startedAt == null) return { left: seconds, text: clockText(seconds), phase: 'idle', note: '' };
  const raw = stoppedLeft != null ? stoppedLeft : seconds - (now - startedAt) / 1000;
  const left = Math.max(0, Math.ceil(raw - 1e-9));
  if (stoppedLeft != null && raw > 0) return { left, text: clockText(left), phase: 'stopped', note: 'Clock stopped (the bar left the platform).' };
  if (raw <= 0) return { left: 0, text: clockText(0), phase: 'over', note: 'Time — if the bar has not left the platform, it is a no lift (the referees decide).' };
  if (raw <= CLOCK_WARN) return { left, text: clockText(left), phase: 'warn', note: `${CLOCK_WARN} seconds — final call (no weight increase after it)` };
  // a 2-minute clock: 30 s gone — the next weight should be declared by now (IWF 6.6.12)
  if (seconds - raw >= CLOCK_WARN && seconds > 2 * CLOCK_WARN) return { left, text: clockText(left), phase: 'running', note: '30 seconds gone — the next weight should be declared' };
  return { left, text: clockText(left), phase: 'running', note: '' };
}
