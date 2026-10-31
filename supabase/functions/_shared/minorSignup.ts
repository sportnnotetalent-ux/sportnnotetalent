/**
 * AS-04 — what phone sign-up (phone-login) asks of a minor, the same as email
 * sign-up (AuthScreen). Pure so Node tests can run it.
 *  - A US child under 13 can't sign up themselves. The database already refuses
 *    the account (privacy_on_new_profile: a +1 number counts as US); this gives
 *    the plain reason instead of "couldn't create your account".
 *  - An under-18 needs a guardian's name, EMAIL and consent: the parent's
 *    approval link is emailed (guardian-consent), so a phone alone left the
 *    child's account stuck waiting.
 */
export const US_UNDER_13 =
  'In the US, children under 13 can’t create their own account. A parent or guardian can add them as a player from the parent’s own account instead.';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function minorSignupProblem(
  age: number,
  phone: string,
  guardian: { name?: unknown; email?: unknown; consent?: unknown },
): string | null {
  if (age < 13 && phone.startsWith('+1')) return US_UNDER_13;
  if (age >= 18) return null;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (!text(guardian.name) || !EMAIL.test(text(guardian.email)) || guardian.consent !== true) {
    return 'Under-18 accounts need a parent/guardian’s name, email and consent — we email them a link to approve the account.';
  }
  return null;
}
