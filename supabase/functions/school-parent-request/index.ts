/**
 * Edge Function: school-parent-request  (student lists, 2026-10-27, founder 1A)
 * ------------------------------------------------------------------------
 * A school imports its student list; some rows are children already on
 * SportnNote outside the school (set up by a parent, or added by a club coach).
 * The school never sees those profiles. Instead this function asks the parent
 * — at the address ON FILE for the child, never one the school typed — whether
 * the school may add the child to its students, in the class it gave.
 *
 * The parent opens  <APP_URL>/school-request?c=<CODE>  (or types the code there):
 * no account needed. The page calls school_request_preview / _decide
 * (migration 20261028100000_student_lists.sql). An adult student is asked
 * themselves.
 *
 * Guards: signed-in caller who is an Owner / Admin of a VERIFIED school (checked
 * in org_roster_invite); 20 calls per user an hour; up to 100 requests a call
 * and 500 a school a day; one pending request per child per school (re-imports
 * don't re-email) and none for 180 days after a parent says no; links stripped
 * from the school's text (docs/security/breaks/student-lists.md).
 *
 * Contract: POST { orgId, rows: [{ i, name, dob?, adm?, email?, phone?, standard?, house? }] }
 *        → 200 { invited, emailed }
 * Deploy:   supabase functions deploy school-parent-request
 * Secrets:  RESEND_API_KEY (shared), optional APP_URL (_shared/hosts.ts).
 */
import { admin, clip, CORS, json, rateLimit, requireUser, sendEmail, stripLinks } from '../_shared/guard.ts';
import { APP_URL, SITE_URL } from '../_shared/hosts.ts';

const grouped = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Invite { code: string; email: string; school: string; childFirstName: string; standard?: string; adult?: boolean }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  const uid = caller.user.id;

  let raw: { orgId?: unknown; rows?: unknown };
  try { raw = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const orgId = typeof raw.orgId === 'string' && UUID.test(raw.orgId) ? raw.orgId : null;
  const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, 3000) : null;
  if (!orgId || !rows) return json({ error: 'orgId and rows are required' }, 400);
  if (!rows.length) return json({ invited: 0, emailed: 0 });
  if (!(await rateLimit('school-parent-request', uid, 20, 3600))) {
    return json({ error: 'Too many lists in an hour — try again later.' }, 429);
  }

  const { data, error } = await admin.rpc('org_roster_invite', { p_org: orgId, p_by: uid, p_rows: rows });
  if (error) {
    const msg = error.message ?? '';
    return json({ error: /owners and admins/i.test(msg) ? 'Only the school’s owners and admins can do this.' : 'Couldn’t ask the parents just now — try again.' }, /owners and admins/i.test(msg) ? 403 : 500);
  }
  const invites = (Array.isArray(data) ? data : []) as Invite[];

  let emailed = 0;
  for (const inv of invites) {
    // SL-12: the school's own text never carries a link into an email that looks like ours
    const school = stripLinks(clip(inv.school, 80));
    const first = clip(inv.childFirstName, 40) || (inv.adult ? 'you' : 'your child');
    const cls = inv.standard ? ` (${stripLinks(clip(inv.standard, 40))})` : '';
    const link = `${APP_URL}/school-request?c=${encodeURIComponent(inv.code)}`;
    const subject = inv.adult ? `${school} would like to add you to its students on SportnNote` : `${school} would like to add ${first} to its students on SportnNote`;
    const body = inv.adult
      ? `Hello ${first},\n\n${school} has put its student list on SportnNote, the app for school and club sports, and you are on it${cls}. You already have a SportnNote profile, so instead of making a second one, the school asks you first.\n\n`
      : `Hello,\n\n${school} has put its student list on SportnNote, the app for school and club sports, and ${first} is on it${cls}. ${first} already has a SportnNote profile — set up by you, or by a coach or club with your contact — so instead of making a second one, the school asks you first.\n\n`;
    const sent = await sendEmail(
      inv.email,
      subject,
      body +
      `If you agree, ${inv.adult ? 'you join' : `${first} joins`} the school's students in that class: the school can put ${inv.adult ? 'you' : first} in its teams and events, and can confirm ${inv.adult ? 'your' : `${first}'s`} date of birth from its records. Nothing changes if you say no or ignore this.\n\n` +
      `To agree or say no, open this link (it works for 30 days):\n${link}\n\n` +
      `Or open ${APP_URL}/school-request and enter the code: ${grouped(inv.code)}\n\n` +
      `The school hasn't seen ${inv.adult ? 'your' : `${first}'s`} profile, and won't unless you agree. What we keep and why: ${SITE_URL}/privacy/\n\n` +
      `Didn't expect this? You can ignore it, or tap the link and choose "No".`,
    );
    if (sent) emailed += 1;
  }
  return json({ invited: invites.length, emailed });
});
