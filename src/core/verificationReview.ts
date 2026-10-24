/** Age & guardian verification review — pure helpers for the reviewer screen
 *  (docs/verification/fast-lanes.md). Node tests load this file. */

/** One tap to explain a rejection; the player sees it with "upload again". */
export const REJECT_REASONS = [
  'The photo is blurry or cut off',
  'The date of birth doesn’t match the profile',
  'The name doesn’t match the profile',
  'Not an accepted type of document',
  'The file didn’t upload — please upload it again',
] as const;

/** Submissions waiting longer than this are flagged (and re-alerted hourly). */
export const REVIEW_TARGET_MS = 12 * 3_600_000;

/** "just now", "45 min", "5 h", "3 d" — how long a submission has waited. */
export function waitedLabel(submittedAt: number | undefined, now: number): string {
  if (!submittedAt) return '—';
  const min = Math.max(0, Math.floor((now - submittedAt) / 60_000));
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

export const isOverdue = (submittedAt: number | undefined, now: number): boolean =>
  !!submittedAt && now - submittedAt >= REVIEW_TARGET_MS;

/** Can the document be shown inline (an image), or must it be opened (PDF…)? */
export function isImageDoc(name: string | undefined): boolean {
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name ?? '');
}

/** "2012-03-05" → "5 Mar 2012" (the reviewer compares it with the document). */
export function readableDob(dob: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? '');
  if (!m) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

/** How many times this player's proof was turned down before. */
export const priorRejections = (history: readonly { action: string }[] | undefined): number =>
  (history ?? []).filter((h) => h.action === 'rejected').length;
