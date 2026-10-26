/**
 * Age & guardian verification — shared by verification-submit / -review /
 * -reminders (docs/verification/fast-lanes.md, 2026-10-24).
 *
 * Reviewers = support/admin accounts + people support appointed
 * (verification_reviewers). They are alerted by push (app + web) that opens the
 * review queue, and by an email that NEVER carries the document or a link to it
 * (a child's ID must not sit in an inbox) — they open it in the app.
 */
import { admin, pushToProfiles, sendEmail } from './guard.ts';
import { webPushToProfiles } from './webpush.ts';

export const REVIEW_PATH = 'VerificationReview';

/** Every account that may review verifications. */
export async function reviewerProfileIds(): Promise<string[]> {
  const [{ data: staff }, { data: appointed }] = await Promise.all([
    admin.from('profiles').select('id').in('role', ['support', 'admin']),
    admin.from('verification_reviewers').select('profile_id'),
  ]);
  return [...new Set([
    ...((staff ?? []) as { id: string }[]).map((r) => r.id),
    ...((appointed ?? []) as { profile_id: string }[]).map((r) => r.profile_id),
  ])];
}

/** SportnNote support / admin accounts only. */
export async function supportProfileIds(): Promise<string[]> {
  const { data } = await admin.from('profiles').select('id').in('role', ['support', 'admin']);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/** Is this account a reviewer? (support/admin, or appointed) */
export async function isReviewer(profileId: string): Promise<{ ok: boolean; name: string }> {
  const { data: prof } = await admin.from('profiles').select('full_name, role').eq('id', profileId).maybeSingle();
  const p = prof as { full_name?: string | null; role?: string | null } | null;
  if (!p) return { ok: false, name: '' };
  if (p.role === 'support' || p.role === 'admin') return { ok: true, name: p.full_name ?? 'SportnNote' };
  const { data: r } = await admin.from('verification_reviewers').select('profile_id').eq('profile_id', profileId).maybeSingle();
  return { ok: !!r, name: p.full_name ?? 'SportnNote' };
}

/** Push every reviewer (tap opens the queue) + one email to the support inbox. */
export async function alertReviewers(title: string, body: string, tag: string, opts: { supportOnly?: boolean } = {}): Promise<{ app: number; web: number; email: boolean }> {
  // Organisations are reviewed by SportnNote support only (2026-10-24).
  const ids = opts.supportOnly ? await supportProfileIds() : await reviewerProfileIds();
  const [app, web, email] = await Promise.all([
    pushToProfiles(ids, { title, body, data: { url: `sportnnote://${REVIEW_PATH}` } }),
    webPushToProfiles(ids, { title, body, url: `/${REVIEW_PATH}`, tag }),
    sendEmail(
      Deno.env.get('SUPPORT_EMAIL') ?? 'support@sportnnote.in',
      title,
      `${body}\n\nOpen SportnNote → Settings → Review verifications to see the document and decide.\nThe document is only shown inside the app.`,
    ),
  ]);
  return { app, web, email };
}

/** Whole years from a YYYY-MM-DD date of birth (null when unknown). */
export function ageOn(dob: string | null | undefined, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age -= 1;
  return age;
}

/** "3 h", "2 d" — how long something has waited. */
export function waited(fromMs: number, nowMs: number): string {
  const h = Math.max(0, Math.floor((nowMs - fromMs) / 3_600_000));
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}
