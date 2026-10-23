/**
 * "Join me on SportnNote" (friend invites, 2026-10-23) — the pure rules. A
 * friend opens app.sportnnote.in/get/<inviter's player id>; the inviter is
 * remembered on that device until the friend has an account, then they follow
 * the inviter and the inviter hears they joined (data/referral.ts).
 */

/** How long an opened invite is remembered before sign-up. */
export const REFERRAL_TTL_DAYS = 30;

export interface SavedReferral { from: string; at: number }

/** A player id as the app issues them (a uuid live; "p12" / "local-player-3"
 *  in the demo). Anything else in the link is ignored rather than followed. */
export function isInviterId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id);
}

/** The inviter to act on, or null: the saved invite is fresh, well-formed and
 *  isn't the person themselves. */
export function referralToApply(saved: unknown, now: number, myPlayerId?: string | null): string | null {
  const r = saved as Partial<SavedReferral> | null;
  if (!r || !isInviterId(r.from) || typeof r.at !== 'number') return null;
  if (now - r.at > REFERRAL_TTL_DAYS * 86_400_000 || r.at > now + 60_000) return null;
  if (myPlayerId && r.from === myPlayerId) return null;
  return r.from;
}
