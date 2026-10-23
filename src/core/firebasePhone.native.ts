/**
 * Phone verification by SMS through Firebase — PHONE APP build (the web build
 * uses firebasePhone.ts). Firebase's JS SDK needs an invisible reCAPTCHA, which
 * only exists in a browser, so the app never offers it (`firebasePhoneAvailable`
 * was already false off the web). Perf F-26: this stub keeps the Firebase auth
 * SDK out of the APK's bundle — every function behaves exactly as the web
 * module does where Firebase isn't available.
 */
import { toE164 } from './phone';

export const firebasePhoneAvailable = (): boolean => false;

/** A stored or typed number → E.164 (core/phone.ts). */
export { toE164 };

/** Nothing to warm up without Firebase. */
export function prewarmPhoneSdk(): void {}

/** Nothing to pre-render without Firebase. */
export function prewarmPhoneCode(): void {}

/** Nothing was pre-rendered. */
export function releasePrewarmedPhoneCode(): void {}

/** Not available in the app (the web module's message). */
export async function sendPhoneCode(_phone: string): Promise<void> {
  throw new Error('SMS verification isn’t available here.');
}

/** No code was ever sent here (the web module's message). */
export async function confirmPhoneCode(_code: string): Promise<string> {
  throw new Error('Tap Verify to get a code first.');
}

// The same API as the web module (checked at compile time).
type WebApi = typeof import('./firebasePhone');
void ({
  firebasePhoneAvailable, toE164, prewarmPhoneSdk, prewarmPhoneCode, releasePrewarmedPhoneCode, sendPhoneCode, confirmPhoneCode,
} satisfies WebApi);
