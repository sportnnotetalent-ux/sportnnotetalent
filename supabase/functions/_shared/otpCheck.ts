/**
 * The contact-code check (verify-contact-otp), pure so Node tests can run it.
 *
 * AS-01 (docs/security/breaks/audit-security-2026-10-31.md): every guess first
 * CLAIMS one attempt — the caller moves attempts n → n+1 only if it is still n
 * (one atomic UPDATE). Guesses sent at the same moment all read the same n, so
 * only one wins the claim; the rest are answered 'busy' without being compared.
 * The 5-guess cap therefore holds however many requests arrive at once.
 * The right code on the 5th try still works, as before.
 */
export const MAX_OTP_ATTEMPTS = 5;

export interface OtpRow { code_hash: string; attempts: number | null; expires_at: string }
export type OtpOutcome = 'ok' | 'none' | 'expired' | 'too_many' | 'mismatch' | 'busy';

export async function checkOtp(
  row: OtpRow | null,
  codeHash: string,
  now: number,
  claim: (attempts: number) => Promise<boolean>,
  onCompare?: () => void,
): Promise<OtpOutcome> {
  if (!row) return 'none';
  if (new Date(row.expires_at).getTime() < now) return 'expired';
  const n = row.attempts ?? 0;
  if (n >= MAX_OTP_ATTEMPTS) return 'too_many';
  if (!(await claim(n))) return 'busy';
  onCompare?.();
  return row.code_hash === codeHash ? 'ok' : 'mismatch';
}
