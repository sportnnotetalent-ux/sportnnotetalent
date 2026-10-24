/**
 * Edge Function: verification-submit
 * ------------------------------------------------------------------------
 * When a user submits an age/ID proof document, the client (data/repos.ts →
 * submitVerificationDoc) uploads the file to the private `verification-docs`
 * Storage bucket, records a `pending` verification on their player row, then
 * calls this function. It:
 *   1. checks the caller owns the player (or uploaded its document), and
 *   2. alerts every reviewer (support + appointed reviewers): a push that opens
 *      the review queue, and an email to SUPPORT_EMAIL.
 *
 * 2026-10-24 (docs/verification/fast-lanes.md): the email no longer carries a
 * link to the document — a child's ID must not sit in an inbox. Reviewers open
 * it in the app (Settings → Review verifications). If nothing can be delivered
 * the submission still stands (the row is already `pending`), and the hourly
 * verification-reminders job alerts reviewers again after 12 hours.
 *
 * Contract (matches data/repos.ts → submitVerificationDoc):
 *   POST { playerId }
 *     → 200 { delivered: boolean }
 *
 * Abuse guards (migration 0025): signed-in callers only, and only for a player
 * they own (or whose document they uploaded); 10 submissions per user per day.
 *
 * Deploy:  supabase functions deploy verification-submit
 * Secrets: RESEND_API_KEY, SUPPORT_EMAIL (shared with support-escalate).
 *   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rateLimit, requireUser, tooMany } from '../_shared/guard.ts';
import { ageOn, alertReviewers } from '../_shared/verification.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  if (!(await rateLimit('verification-submit', caller.user.id, 10, 86400))) return tooMany();

  let body: { playerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  if (!playerId) return json({ error: 'playerId is required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Read the player + their pending verification (service role bypasses RLS).
  const { data: player, error } = await supabase
    .from('players')
    .select('profile_id, full_name, dob, guardian, verification')
    .eq('id', playerId)
    .single();
  if (error || !player) {
    console.error('verification-submit: player not found', error);
    return json({ delivered: false, error: 'player not found' }, 404);
  }

  const verification = (player.verification ?? {}) as { docPath?: string; docName?: string };
  // Only for your own player, or one whose document you uploaded (the upload
  // path is keyed by the uploader's auth id — see submitVerificationDoc).
  const mine = player.profile_id === caller.user.id
    || (verification.docPath ?? '').startsWith(`${caller.user.id}/`);
  if (!mine) return json({ delivered: false, error: 'not your profile' }, 403);
  if (!verification.docPath) return json({ delivered: false, error: 'no document uploaded' }, 400);

  // No name, date of birth or document in the alert — the reviewer sees them in the app.
  const age = ageOn(player.dob as string | null, new Date());
  const who = age == null ? 'A player' : age < 18 ? 'An under-18 player' : 'A player';
  const sent = await alertReviewers(
    '🛡️ New verification to review',
    `${who} uploaded a proof of date of birth. Open the review queue to check it.`,
    `verification-${playerId}`,
  );
  const delivered = sent.app + sent.web > 0 || sent.email;
  return json({ delivered });
});
