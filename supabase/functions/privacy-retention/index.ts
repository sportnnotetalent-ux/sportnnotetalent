/**
 * Edge Function: privacy-retention  (SD-152, daily)
 * ------------------------------------------------------------------------
 * Storage limitation (UK GDPR Art 5(1)(e), SG PDPA, APP 11.2, DPDP):
 *
 *   1. ID proofs: 30 days after a verification is approved or rejected, the
 *      uploaded files under `verification-docs/<uploader>/<playerId>/` are
 *      removed and the row keeps only the outcome (status, when, by whom) —
 *      due_verification_docs() / mark_verification_doc_deleted().
 *   2. Child accounts whose parent/guardian said no or withdrew consent, and
 *      didn't confirm again within 30 days, are deleted like "Delete my account"
 *      — due_withdrawn_accounts() + _shared/deleteAccount.ts.
 *
 * Schedule it once a day (Dashboard → Database → Cron, or pg_cron):
 *   select cron.schedule(
 *     'privacy-retention', '30 3 * * *',
 *     $$ select net.http_post(
 *          url     := 'https://<PROJECT_REF>.functions.supabase.co/privacy-retention',
 *          headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
 *        ) $$
 *   );
 *
 * Only the cron job may call it: `Authorization: Bearer <SERVICE_ROLE_KEY>` or
 * `x-cron-secret: <CRON_SECRET>`.
 * Testing: POST { "dry": true } lists what WOULD be removed, without removing.
 *
 * Deploy:  supabase functions deploy privacy-retention
 * Secrets: optional CRON_SECRET, optional RETENTION_GRACE_DAYS (default 30).
 */
import { admin, safeEqual } from '../_shared/guard.ts';
import { deleteAccountFully, DOCS_BUCKET, removePrefix } from '../_shared/deleteAccount.ts';

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const GRACE = Math.max(1, Number(Deno.env.get('RETENTION_GRACE_DAYS') ?? '30') || 30);

function isCron(req: Request): boolean {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (SERVICE_ROLE_KEY && bearer && safeEqual(bearer, SERVICE_ROLE_KEY)) return true;
  const cron = req.headers.get('x-cron-secret') ?? '';
  return !!CRON_SECRET && !!cron && safeEqual(cron, CRON_SECRET);
}

/** "uid/playerId/123.jpg" → "uid/playerId" (every submission for that player). */
export const docFolder = (docPath: string): string | null => {
  const [a, b] = docPath.split('/');
  return a && b ? `${a}/${b}` : null;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json' } }); // W4 (EF-16)
  if (!isCron(req)) return new Response('forbidden', { status: 403 });
  const opts = await req.json().catch(() => ({})) as { dry?: boolean };
  const dry = opts.dry === true;

  const { data: docs, error: dErr } = await admin.rpc('due_verification_docs', { p_grace_days: GRACE });
  if (dErr) console.error('due_verification_docs', dErr);
  const { data: withdrawn, error: wErr } = await admin.rpc('due_withdrawn_accounts', { p_grace_days: GRACE });
  if (wErr) console.error('due_withdrawn_accounts', wErr);
  const dueDocs = (docs ?? []) as { player_id: string; doc_path: string }[];
  const dueAccounts = ((withdrawn ?? []) as { profile_id: string }[]).map((r) => r.profile_id);
  if (dry) return Response.json({ dry: true, graceDays: GRACE, docs: dueDocs.length, accounts: dueAccounts.length });

  let docsDone = 0;
  for (const d of dueDocs) {
    const folder = docFolder(d.doc_path);
    // Keep the row's reference until the files are really gone (retried tomorrow).
    if (folder && !(await removePrefix(DOCS_BUCKET, folder))) continue;
    const { error } = await admin.rpc('mark_verification_doc_deleted', { p_player: d.player_id });
    if (error) console.error('mark_verification_doc_deleted', d.player_id, error);
    else docsDone++;
  }

  // School / college verification documents (migration 20261025190000): the
  // recognition document and any authorisation letter, 30 days after support's
  // decision. Files live under "<uploader>/org-<orgId>/".
  const { data: orgDocs, error: oErr } = await admin.rpc('due_org_verification_docs', { p_grace_days: GRACE });
  if (oErr) console.error('due_org_verification_docs', oErr);
  let orgDocsDone = 0;
  for (const d of (orgDocs ?? []) as { org_id: string; doc_path: string | null; letter_path: string | null }[]) {
    const folders = [...new Set([d.doc_path, d.letter_path].map((p) => (p ? docFolder(p) : null)).filter((f): f is string => !!f))];
    let ok = true;
    for (const f of folders) if (!(await removePrefix(DOCS_BUCKET, f))) ok = false;
    if (!ok) continue;
    const { error } = await admin.rpc('mark_org_docs_deleted', { p_org: d.org_id });
    if (error) console.error('mark_org_docs_deleted', d.org_id, error);
    else orgDocsDone++;
  }

  // Parental proof (CL-03, migration 20261029140000): the parent's photo ID and
  // relationship document, 30 days after the reviewer's decision. The exact two
  // files only — the parent's "<parent>/guardian-<child>/" folder may also hold a
  // newer proof that is still being checked.
  const { data: gDocs, error: gErr } = await admin.rpc('due_guardian_proof_docs', { p_grace_days: GRACE });
  if (gErr) console.error('due_guardian_proof_docs', gErr);
  let guardianDocsDone = 0;
  for (const d of (gDocs ?? []) as { proof_id: string; id_path: string | null; relation_path: string | null }[]) {
    const files = [d.id_path, d.relation_path].filter((f): f is string => !!f);
    if (files.length) {
      const { error } = await admin.storage.from(DOCS_BUCKET).remove(files);
      if (error) { console.error('guardian proof files', d.proof_id, error); continue; } // retried tomorrow
    }
    const { error } = await admin.rpc('mark_guardian_proof_docs_deleted', { p_proof: d.proof_id });
    if (error) console.error('mark_guardian_proof_docs_deleted', d.proof_id, error);
    else guardianDocsDone++;
  }

  let accountsDone = 0;
  for (const uid of dueAccounts) {
    const res = await deleteAccountFully(uid);
    if (res.ok) accountsDone++;
    else console.error('retention delete', uid, res.stage, res.error);
  }
  return Response.json({ docs: docsDone, orgDocs: orgDocsDone, guardianDocs: guardianDocsDone, accounts: accountsDone });
});
