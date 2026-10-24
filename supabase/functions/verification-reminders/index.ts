/**
 * verification-reminders — hourly cron (migration 20261024170000). Re-alerts the
 * reviewers about any age / guardian proof that has waited more than 12 hours,
 * at most once every 12 hours per submission (verification.remindedAt), so a
 * submission never sits unseen again (docs/verification/fast-lanes.md).
 *
 * Only the cron job may call it: `x-cron-secret: <CRON_SECRET>` (or the service
 * role key). POST { "dry": true } reports what it would send.
 *
 * Deploy:  supabase functions deploy verification-reminders
 */
import { admin, safeEqual } from '../_shared/guard.ts';
import { alertReviewers, waited } from '../_shared/verification.ts';

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const WAIT_MS = 12 * 3_600_000;

function isCron(req: Request): boolean {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (SERVICE_ROLE_KEY && bearer && safeEqual(bearer, SERVICE_ROLE_KEY)) return true;
  const cron = req.headers.get('x-cron-secret') ?? '';
  return !!CRON_SECRET && !!cron && safeEqual(cron, CRON_SECRET);
}

Deno.serve(async (req) => {
  if (!isCron(req)) return new Response('forbidden', { status: 403 });
  const dry = ((await req.json().catch(() => ({}))) as { dry?: boolean }).dry === true;
  const now = Date.now();

  const { data, error } = await admin.from('players').select('id, verification').eq('verification->>status', 'pending');
  if (error) {
    console.error('verification-reminders read', error);
    return Response.json({ error: 'read failed' }, { status: 500 });
  }
  const rows = (data ?? []) as { id: string; verification: { submittedAt?: number; remindedAt?: number } & Record<string, unknown> }[];
  const due = rows.filter((r) => {
    const sub = Number(r.verification?.submittedAt ?? 0);
    const last = Number(r.verification?.remindedAt ?? 0);
    return sub > 0 && now - sub >= WAIT_MS && now - last >= WAIT_MS;
  });
  if (!due.length) return Response.json({ pending: rows.length, reminded: 0 });

  const oldest = Math.min(...due.map((r) => Number(r.verification.submittedAt)));
  const title = `⏳ ${due.length} verification${due.length === 1 ? '' : 's'} waiting`;
  const body = `Oldest has waited ${waited(oldest, now)}. Please review today — players can't be confirmed until you do.`;
  if (dry) return Response.json({ dry: true, pending: rows.length, due: due.length, title, body });

  const sent = await alertReviewers(title, body, 'verification-reminder');
  for (const r of due) {
    const { error: e } = await admin.from('players')
      .update({ verification: { ...r.verification, remindedAt: now } })
      // only if it's still the same pending submission (not decided / re-submitted meanwhile)
      .eq('id', r.id).eq('verification->>status', 'pending')
      .eq('verification->>submittedAt', String(r.verification.submittedAt));
    if (e) console.error('verification-reminders stamp', r.id, e);
  }
  return Response.json({ pending: rows.length, reminded: due.length, ...sent });
});
