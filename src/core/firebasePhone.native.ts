/**
 * Phone verification by SMS through Firebase — PHONE APP build (the web build
 * uses firebasePhone.ts, which needs a browser reCAPTCHA).
 *
 * The app uses React Native Firebase (native Android sign-in, Play Integrity or
 * a reCAPTCHA fallback page) — from the APK built after 2026-10-25 on. Older
 * APKs don't have the native module: `firebasePhoneAvailable()` is false there,
 * so the option stays hidden and email sign-in works as before (one update
 * channel serves both). Same Firebase project as the web, so the ID token goes
 * to the same phone-login function.
 */
import { TurboModuleRegistry } from 'react-native';
import { toE164 } from './phone';

type RNFBApp = typeof import('@react-native-firebase/app');
type RNFBAuth = typeof import('@react-native-firebase/auth');
type Confirmation = Awaited<ReturnType<RNFBAuth['signInWithPhoneNumber']>>;

let mods: { app: RNFBApp; auth: RNFBAuth } | null | undefined;
/** The native Firebase modules, or null in an APK built without them. */
function native(): { app: RNFBApp; auth: RNFBAuth } | null {
  if (mods !== undefined) return mods;
  mods = null;
  try {
    // Look before requiring: the library throws while loading when its native
    // side is missing (an older APK).
    if (!TurboModuleRegistry.get('NativeRNFBTurboApp') || !TurboModuleRegistry.get('NativeRNFBTurboAuth')) return mods;
    const app = require('@react-native-firebase/app') as RNFBApp;
    app.getApp(); // throws when the native side (google-services.json app) isn't there
    const auth = require('@react-native-firebase/auth') as RNFBAuth;
    mods = { app, auth };
  } catch {
    mods = null;
  }
  return mods;
}

export const firebasePhoneAvailable = (): boolean => native() !== null;

/** A stored or typed number → E.164 (core/phone.ts). */
export { toE164 };

/** Nothing to warm up: the native SDK is ready with the app. */
export function prewarmPhoneSdk(): void {}

/** No reCAPTCHA to pre-render on a phone. */
export function prewarmPhoneCode(): void {}

/** Nothing was pre-rendered. */
export function releasePrewarmedPhoneCode(): void {}

let confirmation: Confirmation | null = null;

function explain(e: unknown): string {
  const code = String((e as { code?: string })?.code ?? '');
  if (code.includes('invalid-phone-number')) return 'That mobile number doesn’t look right — check it and try again.';
  if (code.includes('too-many-requests') || code.includes('quota-exceeded')) return 'Too many tries — wait a little and try again.';
  if (code.includes('invalid-verification-code')) return 'That code isn’t right — check the SMS and try again.';
  if (code.includes('session-expired') || code.includes('code-expired')) return 'That code has expired — tap to get a new one.';
  if (code.includes('network-request-failed')) return 'No connection — check your internet and try again.';
  if (code.includes('app-not-authorized') || code.includes('missing-client-identifier')) return 'SMS sign-in isn’t set up in this version of the app yet — sign in with email for now.';
  return `Couldn’t send the SMS just now — try again later.${code ? ` (${code})` : ''}`;
}

/** Send the SMS code to `phone`. Throws an Error with a user-facing message. */
export async function sendPhoneCode(phone: string): Promise<void> {
  const m = native();
  if (!m) throw new Error('SMS verification isn’t available here.');
  try {
    const e164 = toE164(phone);
    if (!e164) throw Object.assign(new Error('invalid'), { code: 'auth/invalid-phone-number' });
    confirmation = await m.auth.signInWithPhoneNumber(m.auth.getAuth(), e164);
  } catch (e) {
    confirmation = null;
    const code = (e as { code?: string })?.code ?? '';
    if (!/invalid-phone-number|too-many-requests|quota-exceeded|network-request-failed/.test(code)) {
      void import('./telemetry').then((t) => t.reportError(e)).catch(() => undefined);
    }
    throw new Error(explain(e));
  }
}

/** Confirm the SMS code; returns Firebase's signed ID token (carries the
 *  verified phone_number) and signs out of Firebase again. Android may read the
 *  SMS itself and sign in first — then the signed-in user's token is used. */
export async function confirmPhoneCode(code: string): Promise<string> {
  const m = native();
  if (!m) throw new Error('SMS verification isn’t available here.');
  if (!confirmation) throw new Error('Tap Verify to get a code first.');
  const auth = m.auth.getAuth();
  try {
    let user: import('@react-native-firebase/auth').User | null = null;
    try {
      const cred = await confirmation.confirm(code.trim());
      user = cred?.user ?? null;
    } catch (e) {
      // auto-verified already (the code was used by Android) → use that session
      if (!auth.currentUser?.phoneNumber) throw e;
    }
    const current = user ?? auth.currentUser;
    if (!current) throw Object.assign(new Error('no user'), { code: 'auth/session-expired' });
    const token = await m.auth.getIdToken(current);
    await m.auth.signOut(auth);
    confirmation = null;
    return token;
  } catch (e) {
    throw new Error(explain(e));
  }
}

// The same API as the web module (checked at compile time).
type WebApi = typeof import('./firebasePhone');
void ({
  firebasePhoneAvailable, toE164, prewarmPhoneSdk, prewarmPhoneCode, releasePrewarmedPhoneCode, sendPhoneCode, confirmPhoneCode,
} satisfies WebApi);
