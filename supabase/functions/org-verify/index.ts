/**
 * Edge Function: org-verify  (organisation verification — Phase 1 schools /
 * colleges, Phase 2 every registered type —
 * docs/verification/org-verification.md, migration 20261025190000)
 * ------------------------------------------------------------------------
 * Emails for step 3 ("show you're authorised by the school"):
 *   POST { orgId, action: 'email_code', email }
 *     → a 6-digit code to an official school address; the admin types it in
 *       the app (verify_org_email_code).
 *   POST { orgId, action: 'ask_head' }
 *     → the Head of School (name + email saved on the request) gets a link to
 *       …/org-confirm?c=CODE to confirm the person asking is authorised.
 *   → 200 { sent: boolean, email?: "a***@school.edu.in", reason? }
 *
 * Guards: signed-in caller who is an Owner / Admin of the community (checked
 * AS the caller: org_is_admin); 5 emails per community per hour.
 * Deploy:  supabase functions deploy org-verify
 * Secrets: RESEND_API_KEY (shared), optional APP_URL (_shared/hosts.ts).
 */
import { admin, clip, CORS, json, rateLimit, requireUser, sendEmail } from '../_shared/guard.ts';
import { APP_URL } from '../_shared/hosts.ts';

const mask = (e: string) => e.replace(/^(.)[^@]*/, '$1***');
const grouped = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');

/** noun + who signs for it, per community type (mirrors ORG_VERIFY in src/core/orgVerification.ts). */
const WORDS: Record<string, { noun: string; head: string }> = {
  School: { noun: 'school', head: 'Principal / Head' },
  College: { noun: 'college', head: 'Principal / Head' },
  'Sports club': { noun: 'club', head: 'President / Secretary' },
  'Sports academy': { noun: 'academy', head: 'Director / Owner' },
  'Sports association': { noun: 'association', head: 'President / Secretary' },
  Company: { noun: 'company', head: 'Director / authorised signatory' },
  'Hospital chain': { noun: 'hospital', head: 'Director / authorised signatory' },
  NGO: { noun: 'NGO', head: 'President / Secretary' },
  'Housing society': { noun: 'society', head: 'Chairman / Secretary' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;

  const body = await req.json().catch(() => ({})) as { orgId?: unknown; action?: unknown; email?: unknown };
  const orgId = typeof body.orgId === 'string' ? body.orgId : '';
  const action = body.action === 'email_code' || body.action === 'ask_head' ? body.action : null;
  if (!orgId || !action) return json({ sent: false, reason: 'orgId and action are required' }, 400);

  const { data: isAdmin } = await caller.asUser.rpc('org_is_admin', { p_org: orgId });
  if (isAdmin !== true) return json({ sent: false, reason: 'Only the community’s owners and admins can do this.' }, 403);
  if (!(await rateLimit('org-verify', orgId, 5, 3600))) {
    return json({ sent: false, reason: 'Already sent 5 emails this hour — try again later.' }, 429);
  }

  let email = '';
  if (action === 'email_code') {
    email = clip(body.email, 200).toLowerCase();
  } else {
    const { data: v } = await admin.from('org_verifications').select('head_email').eq('org_id', orgId).maybeSingle();
    email = String((v as { head_email?: string | null } | null)?.head_email ?? '');
    if (!email) return json({ sent: false, reason: 'Add their name and official email first.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ sent: false, reason: 'That email doesn’t look right.' }, 400);

  const { data, error } = await admin.rpc('create_org_code', {
    p_org: orgId, p_purpose: action === 'email_code' ? 'email' : 'head', p_email: email, p_by: caller.user.id,
  });
  if (error || !data) return json({ sent: false, reason: 'Couldn’t create the code — try again.' }, 400);
  const { code, orgName, requesterName } = data as { code: string; orgName: string; requesterName: string | null };
  const org = clip(orgName, 100) || 'your organisation';
  const who = clip(requesterName ?? '', 80) || 'Someone';
  // The organisation's own words (Phase 2: every registered type) — mirrors ORG_VERIFY in src/core/orgVerification.ts.
  const { data: o } = await admin.from('organizations').select('type').eq('id', orgId).maybeSingle();
  const { noun, head } = WORDS[String((o as { type?: string } | null)?.type ?? '')] ?? { noun: 'organisation', head: 'head' };

  const sent = action === 'email_code'
    ? await sendEmail(
      email,
      `Your SportnNote code for ${org}: ${code}`,
      `Hello,\n\n${who} is verifying ${org} on SportnNote, a school and club sports app, and entered this address as an official ${noun} email.\n\n` +
      `The code is: ${code}\n\nIt works for 30 minutes. Type it into SportnNote to confirm this address belongs to the ${noun}.\n\n` +
      `Didn't expect this? You can ignore it — nothing happens without the code.`,
    )
    : await sendEmail(
      email,
      `Please confirm who manages ${org} on SportnNote`,
      `Hello,\n\n${who} has asked to manage ${org}'s community on SportnNote, a school and club sports app for scores, results and records, and gave your address as the ${head} of the ${noun}.\n\n` +
      `Please confirm whether they are authorised to manage it for the ${noun}:\n${APP_URL}/org-confirm?c=${encodeURIComponent(code)}\n\n` +
      `Or open ${APP_URL}/org-confirm and enter the code: ${grouped(code)}\n\nThe link works for 14 days.\n\n` +
      `If you don't know this person, choose "No, I don't" — SportnNote won't verify the ${noun} without its approval.`,
    );
  return json({ sent, email: mask(email), ...(sent ? {} : { reason: 'The email couldn’t be sent just now — try again later.' }) });
});
