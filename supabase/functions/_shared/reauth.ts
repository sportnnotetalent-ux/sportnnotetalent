/**
 * Security W3 (CL-18): deleting an account (or a guardian deleting their
 * child's) needs a sign-in in the last 10 minutes — a refreshed session
 * doesn't count, so someone holding an unlocked phone can't do it. PURE.
 */
export const REAUTH_WINDOW_MS = 10 * 60_000;

export function recentSignIn(lastSignInAt: string | null | undefined, now: number, windowMs = REAUTH_WINDOW_MS): boolean {
  const t = lastSignInAt ? Date.parse(lastSignInAt) : NaN;
  return Number.isFinite(t) && now - t <= windowMs && t <= now + 60_000;
}
