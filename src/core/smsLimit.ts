/**
 * SMS spend cap, the app's part (2026-10-27) — docs/ops/sms-spend-cap.md.
 * Every phone code is a paid SMS (Firebase, about $0.07). On top of Firebase's
 * own limits (per IP, per number, 3,000 a day for the project), one device asks
 * for at most 5 codes a day, and at most 3 for the same number. The 60-second
 * resend wait stays as it is.
 *
 * PURE (no React Native) — node tests load it.
 */

export const SMS_PER_DEVICE_PER_DAY = 5;
export const SMS_PER_NUMBER_PER_DAY = 3;
const DAY = 24 * 3_600_000;

export interface SmsSend { at: number; to: string }

/** The sends still inside the last 24 hours. */
export const recentSends = (log: readonly SmsSend[], now: number): SmsSend[] =>
  log.filter((s) => s && typeof s.at === 'number' && now - s.at < DAY && now >= s.at);

const digits = (n: string) => (n ?? '').replace(/\D/g, '');

/** null = this code may be sent; otherwise what to tell the person. */
export function smsRefusal(log: readonly SmsSend[], to: string, now: number, fallback = 'sign in with your email instead'): string | null {
  const recent = recentSends(log, now);
  const same = recent.filter((s) => digits(s.to) === digits(to)).length;
  if (same >= SMS_PER_NUMBER_PER_DAY) return `That’s ${SMS_PER_NUMBER_PER_DAY} codes for this number today. Use the newest one, try again tomorrow, or ${fallback}.`;
  if (recent.length >= SMS_PER_DEVICE_PER_DAY) return `That’s ${SMS_PER_DEVICE_PER_DAY} text codes from this device today. Try again tomorrow, or ${fallback}.`;
  return null;
}
