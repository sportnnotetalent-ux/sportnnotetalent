/**
 * SD-115 — name what Undo will remove: "point to Federer (30-15)", "ace · Nadal",
 * "rally to Away · side-out", "first-server pick". Pure: built from the newest
 * logged event's type and the state just before / after it (useLiveMatch
 * `lastStep`), using the timeline events that step added. Null = unknown, and
 * the bar falls back to a plain "Undo".
 */
import type { LiveEvent } from './liveEvents';
import { eventWho, markDetail, whoName, type NameOf } from './racketNames.ts';

type Side = 'home' | 'away';

/** Steps that add no timeline event — named by what they set. */
const QUIET: Record<string, string> = {
  SET_FIRST_SERVER: 'first-server pick',
  SET_START_RIGHT: 'right-court pick',
  SET_SERVE_ORDER: 'serving-order pick',
  FIRST_BREAK: 'break pick', // SD-117c carrom toss
  SET_SERVE: 'serve pick', // SD-58 volleyball toss
  PAUSE: 'clock pause', // MVP K4 (kabaddi)
  RESUME: 'clock restart',
  SET_ROTATION: 'rotation', // SD-58
  SET_DETAIL: 'point-detail setting',
  FAULT: '1st-serve fault', // tennis (founder 2026-11-02)
  FAULT_TYPE: 'fault type', // tennis-endings-depth
  POINT_DETAIL: 'point detail',
  VB_DETAIL: 'rally detail', // SD-81 volleyball attack / reception detail
  EDIT_LOG: 'timeline correction',
  AMEND: 'correction',
  STAT_ADJUST: 'stat correction',
};

const eventsOf = (s: unknown): LiveEvent[] | null => {
  const e = (s as { events?: unknown } | null)?.events;
  return Array.isArray(e) ? (e as LiveEvent[]) : null;
};

export function undoLabel(
  step: { type: string; prev: unknown; next: unknown } | null | undefined,
  /** `player` (IDs-only scoring): a player's name by id — the racket and
   *  volleyball logs keep ids; absent → an older log's stored name */
  names: { home: string; away: string; player?: NameOf },
  /** "30-15" — the live score after the step (plugin summary) */
  scoreOf?: (s: unknown) => string | null,
): string | null {
  if (!step) return null;
  if (QUIET[step.type]) return QUIET[step.type];
  const before = eventsOf(step.prev);
  const after = eventsOf(step.next);
  // SD-71 — a volleyball SUB is a state stamp (no timeline event)
  if (!before || !after || after.length <= before.length) return step.type === 'SUB' ? 'substitution' : null;
  const added = after.slice(before.length);
  const p = added[0];
  const name = (s?: Side) => (s === 'home' ? names.home : s === 'away' ? names.away : '');
  let head: string;
  // SD-53 / SD-54 / SD-63 — "code violation · point penalty · Nadal", "timeout · Home", "let"
  // IDs-only scoring: the player by id (an older log's stored name as the fallback)
  const nameOf: NameOf = names.player ?? ((_id, legacy) => (legacy ?? '').trim() || 'Player');
  const credited = eventWho(p, nameOf);
  // racket-batch6 — "shuttle change · Home", "injury · self-inflicted · Nadal", "expedite system"
  if (p.pen || p.kind === 'conduct' || p.kind === 'timeout' || p.kind === 'let' || p.kind === 'review' || p.kind === 'shuttle' || p.kind === 'injury' || p.kind === 'expedite') {
    const what = (p.label ?? '').trim().replace(/^./, (c) => c.toLowerCase());
    const who = p.pen ? whoName(nameOf, p.pen.playerId, p.pen.playerName) ?? name(p.pen.by)
      : credited ?? (p.kind === 'timeout' ? markDetail(p, nameOf) || name(p.side) : name(p.side));
    head = who && p.kind !== 'let' && p.kind !== 'expedite' ? `${what} · ${who}` : what;
  } else if (p.kind === 'rally') head = `rally to ${name(p.wonBy)}${p.label ? ` · ${p.label.toLowerCase()}` : ''}`;
  else if (p.df) head = `double fault → point to ${name(p.side)}`;
  else if (p.kind === 'ace' || (p.kind === 'point' && p.pd?.how === 'ace')) head = `ace · ${credited ?? name(p.side)}`;
  else if (p.kind === 'point') head = `point to ${credited ?? name(p.side)}`;
  else {
    // Other sports: the timeline label (some events carry none — never print
    // "undefined"; with nothing to name, fall back to the plain "Undo").
    const what = typeof p.label === 'string' && p.label.trim() ? p.label.trim() : null;
    if (!what) return null;
    // IDs-only scoring: an event that names its player by id only (kabaddi)
    // is named for this viewer; an older event's stored name reads as before
    const who = p.playerName || (p.playerId ? whoName(nameOf, p.playerId) : undefined) || (p.side ? name(p.side) : '');
    head = who ? `${what} · ${who}` : what;
  }
  const bad = (t: string) => /\bundefined\b|\bnull\b|\bNaN\b/.test(t);
  if (bad(head)) return null;
  if (added.length > 1) {
    const last = added[added.length - 1].label ?? '';
    const tail = /^Match won/.test(last) ? 'match' : /^Set \d+ won/.test(last) ? 'set'
      : /^Game( \d+ won| home| away)/.test(last) ? 'game' : null;
    if (tail) return `${head} · ${tail}`;
  }
  const sc = scoreOf?.(step.next);
  return sc && !bad(sc) ? `${head} (${sc})` : head;
}

/** Undo labels batch (2026-11-03) — what the bar may print: trimmed text, or
 *  null for nothing / junk (`undefined`, `null`, `NaN`, `[object …]`, an
 *  empty "· " tail). */
export function cleanUndoLabel(t: unknown): string | null {
  if (typeof t !== 'string') return null;
  const v = t.trim();
  if (!v || /\bundefined\b|\bnull\b|\bNaN\b|\[object|·\s*$|^\s*·|·\s*·|\(\s*\)/.test(v)) return null;
  return v;
}

/** The bar's label: the sport's own (when it has one and it names the step),
 *  else the shared `undoLabel`. Either may throw on an odd state: that reads
 *  as null (the bar then says a plain "Undo"). */
export function resolveUndoLabel(own: (() => string | null | undefined) | null | undefined, shared: () => string | null | undefined): string | null {
  if (own) {
    try { const t = cleanUndoLabel(own()); if (t) return t; } catch { /* fall back */ }
  }
  try { return cleanUndoLabel(shared()); } catch { return null; }
}

/** A side's words for a sport's own label: the team / player name the screen
 *  shows, else "Home" / "Away". */
export const sideWord = (side: unknown, sides?: { home?: string; away?: string } | null): string => {
  if (side !== 'home' && side !== 'away') return '';
  const n = typeof sides?.[side] === 'string' ? sides[side]!.trim() : '';
  return n || (side === 'home' ? 'Home' : 'Away');
};

/** "Field goal" → "field goal" (a leading capital only; "7 m", "GK" kept). */
export const lowerFirst = (t: string): string => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

export type UndoStep = { type: string; prev: unknown; next: unknown } | null | undefined;
export type UndoSides = { home?: string; away?: string };
