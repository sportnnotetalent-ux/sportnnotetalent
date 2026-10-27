/**
 * Pool — the ball sets of each game and the payload readers the engine uses.
 * PURE. WPA Rules of Play (effective 2026-10-21): 8-ball uses fifteen object
 * balls (4, preamble), 9-ball nine (5), 10-ball ten (6).
 */

export type Side = 'home' | 'away';
export type PoolGame = 'eight' | 'nine' | 'ten';

export const isSide = (v: unknown): v is Side => v === 'home' || v === 'away';

/** An object's OWN property (never the prototype chain: a polluted
 *  Object.prototype or an inherited field can't reach the engine). */
export const own = (o: unknown, k: string): unknown =>
  o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? (o as Record<string, unknown>)[k] : undefined;

/** A record of an object's own keys, with no prototype: every later read is an
 *  own read. Not an object → empty (breaks #5). An object whose keys or values
 *  throw when read (a getter, a Proxy) → null: unreadable, so the caller
 *  ignores the action / uses the defaults (breaks #6). */
export function ownRecord(o: unknown): Record<string, unknown> | null {
  const out: Record<string, unknown> = Object.create(null);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  try {
    for (const k of Object.keys(o)) out[k] = (o as Record<string, unknown>)[k];
  } catch {
    return null;
  }
  return out;
}
export const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** The highest-numbered object ball of each game. */
export const TOP: Record<PoolGame, number> = { eight: 15, nine: 9, ten: 10 };
/** The ball that decides the rack (the 8, the 9, the 10). */
export const MONEY: Record<PoolGame, number> = { eight: 8, nine: 9, ten: 10 };
export const GAME_LABEL: Record<PoolGame, string> = { eight: '8-Ball', nine: '9-Ball', ten: '10-Ball' };

/** A known game, or null — a stored value is never used as a raw object key
 *  ("__proto__" would return Object.prototype — breaks #9). */
export const knownGame = (v: unknown): PoolGame | null => (v === 'eight' || v === 'nine' || v === 'ten' ? v : null);
/** "8-Ball", or "Pool" for a value that isn't a game. */
export const gameLabel = (v: unknown): string => { const g = knownGame(v); return g ? GAME_LABEL[g] : 'Pool'; };

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** 8-ball groups (WPA 4, preamble): solids 1–7, stripes 9–15. */
export const SOLIDS: readonly number[] = range(1, 7);
export const STRIPES: readonly number[] = range(9, 15);

/** A full rack of object balls, ascending. */
export const fullRack = (g: PoolGame): number[] => range(1, TOP[g]);

/**
 * A list of ball numbers from a payload, in the order tapped. Absent → [].
 * Every entry must be a whole number from 1 to `top`, each at most once;
 * anything else → null, and the caller ignores the whole tap (a tap is never
 * applied in part).
 */
export function readBalls(v: unknown, top: number): number[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const b of v) {
    if (typeof b !== 'number' || !Number.isInteger(b) || b < 1 || b > top || out.includes(b)) return null;
    out.push(b);
  }
  return out;
}

/** A whole number option: a number or numeric text, clamped; else the default. */
export function readInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** A boolean option: only true / false count; anything else is the default. */
export const readBool = (v: unknown, def: boolean): boolean => (v === true ? true : v === false ? false : def);

/** The game option, from the spellings an organiser or an older format may use. */
export function readGame(v: unknown): PoolGame {
  // text or a number only: never String() an object (its toString may throw — breaks #6)
  if (typeof v !== 'string' && typeof v !== 'number') return 'eight';
  const t = String(v).toLowerCase().replace(/[\s_-]+/g, '').replace(/ball$/, '');
  if (t === '9' || t === 'nine') return 'nine';
  if (t === '10' || t === 'ten') return 'ten';
  return 'eight';
}
