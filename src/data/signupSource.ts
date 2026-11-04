/** Sign-up source (founder 2026-11-04, docs/security/breaks/signup-source.md):
 *  remember the link a signed-out visitor opened (core/signupSource.ts rules)
 *  and send it once after sign-in — the server keeps it only for an account made
 *  in the last 48 hours (record_signup_source), so an existing user's link is
 *  simply dropped. */
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { landingToKeep, landingToSend, sourceFromUrl } from '../core/signupSource';

const KEY = 'sn.signup.landing';
let writing: Promise<void> = Promise.resolve();

async function readSaved(): Promise<unknown> {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function forget() { try { await AsyncStorage.removeItem(KEY); } catch { /* ignore */ } }

/** A link opened: keep it if it's the first fresh one. */
export function rememberLanding(url: string | null | undefined): Promise<void> {
  const src = url ? sourceFromUrl(url) : null;
  if (!src) return writing;
  writing = writing.then(async () => {
    const keep = landingToKeep(await readSaved(), src, Date.now());
    if (keep) { try { await AsyncStorage.setItem(KEY, JSON.stringify(keep)); } catch { /* private mode */ } }
  });
  return writing;
}

/** Boot: the link the app opened with, and (native) links opened while running
 *  — only while signed out. Returns an unsubscribe. */
export function watchLandings(signedIn: () => boolean): () => void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && !signedIn()) void rememberLanding(window.location.href);
    return () => undefined;
  }
  void Linking.getInitialURL().then((u) => { if (!signedIn()) return rememberLanding(u); }).catch(() => undefined);
  const sub = Linking.addEventListener('url', ({ url }) => { if (!signedIn()) void rememberLanding(url); });
  return () => sub.remove();
}

let sending = false;
/** Signed in: send the remembered link once, then forget it. Safe on every sign-in. */
export async function sendSignupSource(): Promise<void> {
  if (sending) return;
  sending = true;
  try {
    await writing;
    const landing = landingToSend(await readSaved(), Date.now());
    if (!landing) { await forget(); return; }
    if (!isSupabaseConfigured || !supabase) { await forget(); return; }
    const { error } = await supabase.rpc('record_signup_source', { p_kind: landing.kind, p_ref: landing.ref ?? null });
    // saved / too late / already, or refused for good: forget. Offline or the
    // database not updated yet: keep it for the next sign-in (30 days at most).
    if (!error || /bad_kind|not_allowed/.test(error.message)) await forget();
  } catch { /* offline: kept for the next sign-in */ } finally {
    sending = false;
  }
}
