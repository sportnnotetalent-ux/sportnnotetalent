/**
 * MVP PB4 / PD4 — a double-tap guard for score buttons: a second tap within
 * TAP_GUARD_MS of the last one that counted is ignored (a real rally takes
 * seconds). PURE: the caller keeps one guard per set of buttons.
 */
export const TAP_GUARD_MS = 400;

export function tapGuard(ms = TAP_GUARD_MS): (now?: number) => boolean {
  let last = -Infinity;
  return (now = Date.now()) => {
    if (now - last < ms) return false;
    last = now;
    return true;
  };
}
