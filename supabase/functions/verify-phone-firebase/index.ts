/**
 * Edge Function: verify-phone-firebase
 * ------------------------------------------------------------------------
 * Marks a phone number verified after the user proved it with a Firebase SMS
 * code (see src/core/firebasePhone.ts). Firebase is only the SMS courier — it
 * never becomes our login. The client sends Firebase's signed ID token; this:
 *   1. checks Google's signature (RS256, Google's public keys), the issuer and
 *      audience (our Firebase project), and that the token is fresh (≤10 min);
 *   2. checks the caller owns the player profile;
 *   3. checks the token's `phone_number` is the number on that profile — the
 *      player's own (channel 'phone') or their guardian's ('guardian_phone');
 *   4. sets phone_verified (or guardian.phoneVerified) with the service role —
 *      the app itself can never set these (migrations 0025/0027).
 * Channel 'claim' (W1-2b, migration 20261028160000_security_wave2b): someone a
 * coach added by phone, who signed up by email, proves the number; the server
 * links that coach-made profile to them (claim_player_by_phone). No playerId.
 * CL-04 (migration 20261028233000_phone_country): the caller's own proven
 * number sets their account's country (apply_verified_phone_country): an
 * under-18's consent route can only get stricter. A guardian's number doesn't.
 *
 * Contract: POST { playerId, channel: 'phone'|'guardian_phone', idToken }
 *           → 200 { verified: boolean, reason? }
 *           POST { channel: 'claim', idToken }
 *           → 200 { verified: true, outcome: 'linked'|'none'|'support' }
 * Deploy:   supabase functions deploy verify-phone-firebase
 * Secrets:  FIREBASE_PROJECT_ID (the Firebase project id, e.g. sportnnote-12345)
 */
import { admin, CORS, json, rateLimit, requireUser, tooMany } from '../_shared/guard.ts';
import { firebaseConfigured, verifiedPhoneFromToken } from '../_shared/firebaseToken.ts';
import { phoneKey } from '../_shared/phone.ts';


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json' } }); // W4 (EF-16)
  if (!firebaseConfigured()) return json({ verified: false, reason: 'SMS verification isn’t configured yet.' }, 503);
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  if (!(await rateLimit('verify-phone-firebase', caller.user.id, 10, 3600))) return tooMany();

  const body = (await req.json().catch(() => ({}))) as { playerId?: unknown; channel?: unknown; idToken?: unknown };
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  const channel = body.channel === 'guardian_phone' ? 'guardian_phone' : body.channel === 'phone' ? 'phone' : body.channel === 'claim' ? 'claim' : null;
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  if (!channel || !idToken || (channel !== 'claim' && !playerId)) return json({ verified: false, reason: 'playerId, channel and idToken are required' }, 400);

  // 1. Google's signature + our project + freshness.
  const verified = await verifiedPhoneFromToken(idToken);
  if (verified instanceof Error) return json({ verified: false, reason: verified.message }, 401);
  // Full E.164 from Google's token (e.g. +447400123456) — compared whole.
  const phone = verified.startsWith('+') ? phoneKey(verified) : '';
  if (!phone) return json({ verified: false, reason: 'That number couldn’t be read — include the country code.' }, 400);

  // W1-2b: link the profile a coach made under this (now proven) number.
  if (channel === 'claim') {
    const { data, error } = await admin.rpc('claim_player_by_phone', { p_profile: caller.user.id, p_phone: phone });
    if (error) return json({ verified: false, reason: 'Couldn’t link just now — try again.' }, 500);
    const outcome = data === 'linked' || data === 'support' ? data : 'none';
    await recordCountry(caller.user.id, phone);
    return json({ verified: true, outcome });
  }

  // 2 + 3. The caller's own profile, and the number on it.
  const { data: player } = await admin.from('players').select('id, profile_id, phone, guardian').eq('id', playerId).single();
  if (!player || player.profile_id !== caller.user.id) return json({ verified: false, reason: 'Not your profile.' }, 403);
  const guardian = (player.guardian ?? null) as Record<string, unknown> | null;
  const onProfile = channel === 'guardian_phone' ? String(guardian?.phone ?? '') : String(player.phone ?? '');
  // The whole number must match: same country code AND national number.
  if (!onProfile || phoneKey(onProfile) !== phone) {
    return json({ verified: false, reason: 'The verified number doesn’t match the one on the profile.' });
  }

  // 4. Set the flag (service role — the client can't).
  const update = channel === 'guardian_phone'
    ? { guardian: { ...(guardian ?? {}), phoneVerified: true } }
    : { phone_verified: true };
  const { error } = await admin.from('players').update(update).eq('id', playerId);
  if (error) return json({ verified: false, reason: 'Couldn’t save — try again.' }, 500);
  if (channel === 'phone') await recordCountry(caller.user.id, phone);
  return json({ verified: true });
});

/** CL-04: the proven number's country on the account (best effort: the number
 *  is verified either way; a failure leaves the sign-up country as it was). */
async function recordCountry(profileId: string, phone: string): Promise<void> {
  try {
    const { error } = await admin.rpc('apply_verified_phone_country', { p_profile: profileId, p_phone: phone });
    if (error) console.error('apply_verified_phone_country', error.message);
  } catch (e) {
    console.error('apply_verified_phone_country', e instanceof Error ? e.message : String(e));
  }
}
