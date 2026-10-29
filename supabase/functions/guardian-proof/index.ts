/**
 * guardian-proof — CL-03 parental proof (docs/security/cl03-parental-proof-design.md).
 *
 * The database records and decides (guardian_proof_submit / decide_guardian_proof,
 * migration 20261029140000); this function only tells people:
 *   POST { action: 'submitted', proofId }  the parent, after submitting →
 *        alerts every reviewer (push + web push + a support email that never
 *        carries the documents).
 *   POST { action: 'decided', proofId }    the reviewer, after deciding →
 *        tells the parent (push, web push, email) and the child (push, web push).
 *
 * Deploy: supabase functions deploy guardian-proof
 */
import { admin, CORS, json, pushToProfiles, rateLimit, requireUser, sendEmail, tooMany } from '../_shared/guard.ts';
import { webPushToProfiles } from '../_shared/webpush.ts';
import { alertReviewers } from '../_shared/verification.ts';
import { decidedMessages, reviewerAlert } from '../_shared/guardianProofText.ts';

type Proof = {
  id: string; child_profile_id: string; guardian_profile_id: string; status: string;
  reason: string | null; reviewed_by: string | null; reviewed_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  if (!(await rateLimit('guardian-proof', caller.user.id, 20, 86400))) return tooMany();

  let body: { action?: unknown; proofId?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const proofId = typeof body.proofId === 'string' ? body.proofId : '';
  if (!proofId) return json({ error: 'proofId is required' }, 400);

  const { data } = await admin.from('guardian_proofs')
    .select('id, child_profile_id, guardian_profile_id, status, reason, reviewed_by, reviewed_at')
    .eq('id', proofId).maybeSingle();
  const g = data as Proof | null;
  if (!g) return json({ error: 'not found' }, 404);

  if (body.action === 'submitted') {
    if (g.guardian_profile_id !== caller.user.id || g.status !== 'pending') return json({ error: 'not yours to send' }, 403);
    // once per proof (PP-23)
    const { data: first } = await admin.from('guardian_proofs').update({ reviewers_alerted_at: new Date().toISOString() })
      .eq('id', g.id).is('reviewers_alerted_at', null).select('id');
    if (!first?.length) return json({ delivered: false, already: true });
    const a = reviewerAlert();
    const sent = await alertReviewers(a.title, a.body, `guardian-${g.id}`);
    return json({ delivered: sent.app + sent.web > 0 || sent.email });
  }

  if (body.action === 'decided') {
    const decidedAt = g.reviewed_at ? Date.parse(g.reviewed_at) : 0;
    if (g.reviewed_by !== caller.user.id || g.status === 'pending' || Date.now() - decidedAt > 10 * 60_000) {
      return json({ error: 'not your decision' }, 403);
    }
    // once per proof (PP-23)
    const { data: first } = await admin.from('guardian_proofs').update({ family_told_at: new Date().toISOString() })
      .eq('id', g.id).is('family_told_at', null).select('id');
    if (!first?.length) return json({ ok: true, already: true });
    const { data: kid } = await admin.from('players').select('full_name').eq('profile_id', g.child_profile_id)
      .order('created_at').limit(1).maybeSingle();
    const m = decidedMessages({ approved: g.status === 'approved', reason: g.reason, childName: (kid as { full_name?: string } | null)?.full_name ?? '' });
    const { data: parentUser } = await admin.auth.admin.getUserById(g.guardian_profile_id);
    const email = parentUser?.user?.email ?? '';
    await Promise.all([
      pushToProfiles([g.guardian_profile_id], { title: m.parent.title, body: m.parent.body, data: { url: 'sportnnote://GuardianProof' } }),
      webPushToProfiles([g.guardian_profile_id], { title: m.parent.title, body: m.parent.body, url: '/GuardianProof', tag: `guardian-${g.id}` }),
      email ? sendEmail(email, m.parent.title, `${m.parent.body}\n\nSportnNote`) : Promise.resolve(false),
      pushToProfiles([g.child_profile_id], { title: m.child.title, body: m.child.body, data: { url: 'sportnnote://Home' } }),
      webPushToProfiles([g.child_profile_id], { title: m.child.title, body: m.child.body, url: '/', tag: `guardian-${g.id}` }),
    ]);
    return json({ ok: true });
  }

  return json({ error: 'unknown action' }, 400);
});
