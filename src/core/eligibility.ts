/**
 * Who may be added to a match. The rule:
 *  • Under-18 → the parent/guardian must be fully verified — proof document
 *    approved by support, plus verified mobile AND email.
 *  • 18+      → the player's own mobile AND email must be verified.
 * A player with no date of birth can't be assessed, so they're not eligible.
 */
import { ageOf } from './age.ts';
import type { Player } from './types.ts';

export interface Eligibility {
  ok: boolean;
  reason?: string;
}

export function matchEligibility(p: Player): Eligibility {
  const age = ageOf(p);
  if (age === undefined) return { ok: false, reason: 'Date of birth not set' };

  if (age < 18) {
    const g = p.guardian;
    // For someone else's child the guardian's details are private — only a
    // `present` flag comes back (players_view), which is enough to assess.
    if (!g?.name && !g?.present) return { ok: false, reason: 'No parent/guardian added' };
    if (p.verification?.status !== 'approved') return { ok: false, reason: 'Guardian/age proof not verified' };
    if (!g.phoneVerified) return { ok: false, reason: 'Guardian mobile not verified' };
    if (!g.emailVerified) return { ok: false, reason: 'Guardian email not verified' };
    return { ok: true };
  }

  // 18+
  if (!p.phoneVerified) return { ok: false, reason: 'Mobile not verified' };
  if (!p.emailVerified) return { ok: false, reason: 'Email not verified' };
  return { ok: true };
}

// ⚠️ TESTING ONLY — MUST be set back to `false` before go-live. ⚠️
// While true, unverified players (no verified mobile / no DOB / guardian not verified)
// may still be picked into a squad and placed on the pitch, so the squad / lineup /
// formation flows can be tested without every tester completing verification. This
// DELIBERATELY relaxes the child-safeguarding gate — it must NOT ship to production.
// `matchEligibility()` still returns the true assessment (screens show the real
// reason as a warning); only the *enforcement* is relaxed, via `canFieldPlayer()`.
// Flip this one constant to false to fully re-arm the gate everywhere.
export const TESTING_ALLOW_UNVERIFIED = true;

/** Verification fast lanes, Phase 3: what a tournament's organiser requires
 *  (tournaments.age_verification). Friendlies are 'none'. */
export type AgeRequirement = 'none' | 'confirmed' | 'verified';

export const AGE_REQUIREMENT_LABEL: Record<AgeRequirement, string> = {
  none: 'Not required',
  confirmed: 'Age confirmed — by a parent, their school / club, or a document',
  verified: 'Age verified — by their school / club or a document',
};

/** Does this player's verified age meet the requirement? */
export function meetsAgeRequirement(p: Pick<Player, 'ageVerifiedBy' | 'verification'>, req: AgeRequirement | undefined): boolean {
  if (!req || req === 'none') return true;
  const by = p.ageVerifiedBy ?? (p.verification?.status === 'approved' ? 'document' : undefined);
  if (req === 'confirmed') return !!by;
  return by === 'school' || by === 'document';
}

/** Why a player can't be picked for this tournament (undefined = they can). */
export function ageRequirementReason(p: Pick<Player, 'ageVerifiedBy' | 'verification'>, req: AgeRequirement | undefined): string | undefined {
  if (meetsAgeRequirement(p, req)) return undefined;
  return req === 'verified'
    ? 'Age not verified — this tournament needs their school / club or a document to verify it'
    : 'Age not confirmed — this tournament needs a parent, their school / club, or a document to confirm it';
}

/** Whether a player may be fielded (picked into a squad / placed on the pitch).
 *  In production this is exactly `matchEligibility(p).ok`; during the testing phase
 *  the override above lets unverified players through. Enforcement points call this;
 *  informational labels keep calling `matchEligibility` so the real reason still shows.
 *  A tournament's own age requirement (`req`) is always enforced — the organiser
 *  chose it — even while the testing override is on. */
export function canFieldPlayer(p: Player, req?: AgeRequirement): boolean {
  return (TESTING_ALLOW_UNVERIFIED || matchEligibility(p).ok) && meetsAgeRequirement(p, req);
}
