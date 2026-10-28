/**
 * "Join me on SportnNote" (2026-10-23): remember who invited this device (the
 * GetApp screen saves it), and once the friend has an account, follow the
 * inviter and tell them their friend joined (edge fn invite-joined — a new
 * user shares nothing with the inviter yet, so push-send would refuse it).
 * Rules in core/referralRules.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { track } from '../core/telemetry';
import { isInviterId, referralToApply, type SavedReferral } from '../core/referralRules';
import { followStore } from './followStore';
import { getMyPlayerId, getPlayer, setFollow } from './repos';
import { askConfirm } from '../components/ConfirmSheet';

const KEY = 'sn.referral.pending';

/** The GetApp screen: remember the inviter on this device (the newest wins). */
export async function savePendingReferral(from: string): Promise<void> {
  if (!isInviterId(from)) return;
  const saved: SavedReferral = { from, at: Date.now() };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* private mode: nothing to remember */ }
}

let applying = false;

/** Signed in: follow the saved inviter (once) and let them know. Returns the
 *  inviter's player id when it acted. Safe to call on every sign-in. */
export async function applyPendingReferral(profileId: string): Promise<string | null> {
  if (applying) return null;
  applying = true;
  try {
    let raw: string | null = null;
    try { raw = await AsyncStorage.getItem(KEY); } catch { return null; }
    if (!raw) return null;
    let saved: unknown = null;
    try { saved = JSON.parse(raw); } catch { /* corrupt: dropped below */ }
    const me = await getMyPlayerId(profileId);
    // no player yet (sign-up still finishing): keep it for the next try
    if (!me && referralToApply(saved, Date.now())) return null;
    const from = referralToApply(saved, Date.now(), me);
    try { await AsyncStorage.removeItem(KEY); } catch { /* ignore */ }
    if (!from) return null;

    // Security W4 (CL-22): ask first — a shared /get/ link mustn't make anyone
    // follow (and notify) its sender without saying so
    if (!followStore.has('player', from)) {
      const name = (await getPlayer(from).catch(() => null))?.fullName || 'the friend who invited you';
      const ok = await askConfirm({
        title: `Follow ${name}?`,
        message: 'You opened their invite. Following shows their matches and results on your Home, and lets them know you joined.',
        yesLabel: 'Yes, follow', noLabel: 'Not now', tone: 'caution',
      });
      if (!ok) return null;
    }

    if (!followStore.has('player', from)) {
      followStore.toggle('player', from);
      try {
        await setFollow('player', from, true, profileId);
      } catch {
        followStore.toggle('player', from); // refused (e.g. an under-18 inviter's privacy): leave it
      }
    }
    if (isSupabaseConfigured && supabase) {
      // a push sender, like push-send: never region-pinned (it calls global push services)
      void Promise.resolve(supabase.functions.invoke('invite-joined', { body: { inviterPlayerId: from } })).catch(() => undefined);
    }
    track('onboarding_step', { step: 'joined_from_invite' });
    return from;
  } finally {
    applying = false;
  }
}
