/**
 * verification-review — a reviewer approves or rejects a pending age / guardian
 * proof (docs/verification/fast-lanes.md, 2026-10-24).
 *
 * Body: { playerId: string, decision: 'approved' | 'rejected', reason?: string }
 *
 * Reviewers are support/admin accounts or people support appointed
 * (verification_reviewers). They act only through this function: it writes the
 * decision with the reviewer's identity taken from the server (not the client),
 * appends to the immutable history, stamps reviewedAt (the privacy-retention
 * job deletes the document 30 days after it), and pushes the result to the
 * player and their linked parent/guardian.
 *
 * Guards: signed in, a reviewer, rate limited; only a PENDING submission; never
 * your own (or your ward's) — no one approves themselves.
 *
 * Deploy:  supabase functions deploy verification-review
 */
import { admin, clip, CORS, json, pushToProfiles, rateLimit, requireUser, stripLinks, tooMany } from '../_shared/guard.ts';
import { webPushToProfiles } from '../_shared/webpush.ts';
import { ageOn, isReviewer } from '../_shared/verification.ts';

type Decision = 'approved' | 'rejected';
interface Verification {
  status?: string; note?: string; reviewedAt?: number; reviewedById?: string; reviewedByName?: string;
  history?: { action: string; at: number; byId?: string; byName?: string; note?: string; docName?: string }[];
  [k: string]: unknown;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  if (!(await rateLimit('verification-review', caller.user.id, 300, 3600))) return tooMany();

  const raw = (await req.json().catch(() => ({}))) as { playerId?: unknown; decision?: unknown; reason?: unknown };
  const playerId = typeof raw.playerId === 'string' ? raw.playerId : '';
  const decision = raw.decision === 'approved' || raw.decision === 'rejected' ? (raw.decision as Decision) : null;
  if (!playerId || !decision) return json({ error: 'playerId and decision are required' }, 400);
  const reason = decision === 'rejected' ? stripLinks(clip(raw.reason ?? '', 300)).trim() || undefined : undefined;

  const reviewer = await isReviewer(caller.user.id);
  if (!reviewer.ok) return json({ error: 'Only SportnNote reviewers can approve or reject verification' }, 403);

  const { data: row } = await admin.from('players')
    .select('id, profile_id, guardian_profile_id, full_name, dob, guardian, verification')
    .eq('id', playerId).maybeSingle();
  const p = row as {
    id: string; profile_id: string | null; guardian_profile_id: string | null; full_name: string | null;
    dob: string | null; guardian: { phoneVerified?: boolean; emailVerified?: boolean } | null; verification: Verification | null;
  } | null;
  if (!p) return json({ error: 'Player not found' }, 404);
  if (p.verification?.status !== 'pending') return json({ error: 'This submission has already been decided' }, 409);
  if (p.profile_id === caller.user.id || p.guardian_profile_id === caller.user.id) {
    return json({ error: 'You can\'t review your own (or your child\'s) verification' }, 403);
  }

  // The reviewer's own player row (history names players, as before).
  const { data: mine } = await admin.from('players').select('id').eq('profile_id', caller.user.id)
    .order('created_at', { ascending: true }).limit(1);
  const byId = (mine?.[0] as { id: string } | undefined)?.id ?? caller.user.id;
  const byName = clip(reviewer.name, 80);
  const at = Date.now();
  const v = p.verification ?? {};
  const next: Verification = {
    ...v,
    status: decision,
    note: reason,
    reviewedAt: at,
    reviewedById: byId,
    reviewedByName: byName,
    history: [...(v.history ?? []), { action: decision, at, byId, byName, ...(reason ? { note: reason } : {}) }],
  };
  if (!reason) delete next.note;
  // Service role: not a client request, so the player-row guard lets the decision through.
  const { error } = await admin.from('players').update({ verification: next }).eq('id', p.id)
    .eq('verification->>status', 'pending'); // a second reviewer can't overwrite the first
  if (error) {
    console.error('verification-review update', error);
    return json({ error: 'Could not save the decision' }, 500);
  }

  // Tell the player (and their linked parent/guardian) with the next step.
  const minor = (ageOn(p.dob, new Date()) ?? 99) < 18;
  const guardianDone = !!(p.guardian?.phoneVerified && p.guardian?.emailVerified);
  const title = decision === 'approved' ? '☑️ Verification approved' : '✗ Verification needs attention';
  const body = decision === 'approved'
    ? (minor && !guardianDone
      ? 'Age approved. Next: verify your parent/guardian\'s mobile and email on your profile.'
      : 'Verified ✓ You can be added to teams, tournaments and matches.')
    : `Not approved${reason ? `: ${reason}` : ''}. Please upload a clearer proof of date of birth on your profile.`;
  const to = [p.profile_id, p.guardian_profile_id].filter((x): x is string => !!x);
  await Promise.all([
    pushToProfiles(to, { title, body, data: { url: `sportnnote://p/${p.id}` } }),
    webPushToProfiles(to, { title, body, url: `/p/${p.id}`, tag: `verification-${p.id}` }),
  ]);
  return json({ ok: true, status: decision, reviewedAt: at, reviewedByName: byName });
});
