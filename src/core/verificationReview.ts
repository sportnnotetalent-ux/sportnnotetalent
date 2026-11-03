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

/** What kind of file it is, for display — never the file's own name (names can
 *  be long, odd, or say something personal). */
export function docKindLabel(name: string | undefined): 'PDF' | 'Photo' | 'File' {
  if (/\.pdf$/i.test(name ?? '')) return 'PDF';
  return isImageDoc(name) ? 'Photo' : 'File';
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

// ── The profile's compact verification card (docs/security/breaks/verification-card.md)

export type VerificationChip = 'Verified' | 'Pending' | 'Rejected' | 'Not started';

export interface VerificationSummary {
  chip: VerificationChip;
  tone: 'ok' | 'wait' | 'bad' | 'none';
  /** ONE short sentence: what happens / what to do next */
  next: string;
  /** the card's primary action — only when the owner must act */
  action: { kind: 'upload' | 'resubmit'; label: string } | null;
}

/** Chip + one-line next step + the action (if any) for a status. An unknown or
 *  missing status reads as "Not started"; a fast lane (school / parent
 *  confirmed the date of birth) counts as verified. */
export function verificationSummary(input: {
  status?: 'pending' | 'approved' | 'rejected';
  confirmedBy?: 'school' | 'parent';
  viewer: 'owner' | 'reviewer';
}): VerificationSummary {
  const owner = input.viewer === 'owner';
  const status = input.status === 'pending' || input.status === 'approved' || input.status === 'rejected' ? input.status : undefined;
  if (status === 'approved') {
    return { chip: 'Verified', tone: 'ok', action: null, next: owner ? 'Your date of birth is verified, nothing more to do.' : 'Date of birth verified from the document.' };
  }
  if (input.confirmedBy === 'school' || input.confirmedBy === 'parent') {
    const school = input.confirmedBy === 'school';
    const next = owner
      ? `${school ? 'Your school / club' : 'Your parent/guardian'} confirmed your date of birth, no document needed.`
      : `${school ? 'Their school / club' : 'Their parent/guardian'} confirmed the date of birth, no document needed.`;
    return { chip: 'Verified', tone: 'ok', action: null, next };
  }
  if (status === 'pending') {
    return { chip: 'Pending', tone: 'wait', action: null, next: owner ? 'We’re checking your document, usually within a few hours.' : 'Waiting for a review, open Details to check the document.' };
  }
  if (status === 'rejected') {
    return owner
      ? { chip: 'Rejected', tone: 'bad', next: 'Upload a clearer photo of a birth certificate, school ID or passport.', action: { kind: 'resubmit', label: '📎 Re-submit proof' } }
      : { chip: 'Rejected', tone: 'bad', next: 'Rejected, they’ve been asked to upload it again.', action: null };
  }
  return owner
    ? { chip: 'Not started', tone: 'none', next: 'Upload a birth certificate, school ID or passport to verify your age.', action: { kind: 'upload', label: '📎 Upload proof' } }
    : { chip: 'Not started', tone: 'none', next: 'No proof of date of birth uploaded yet.', action: null };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "5 Mar 2026" (local date); "—" for a missing or bad timestamp. */
export function fullDate(at: number | undefined): string {
  if (typeof at !== 'number' || !Number.isFinite(at)) return '—';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export interface HistoryRow {
  action: 'submitted' | 'approved' | 'rejected';
  icon: string;
  line: string;
  /** the rejection reason */
  note?: string;
  when: string;
}

/** The verification history as display rows — the kind of file, never its
 *  name; the reason only on a rejection. Oldest → newest, as stored. */
export function historyRows(history: readonly { action: string; at: number; byName?: string; note?: string; docName?: string }[] | undefined): HistoryRow[] {
  return (history ?? []).map((e) => {
    const action = e.action === 'approved' || e.action === 'rejected' ? e.action : 'submitted';
    const by = e.byName?.trim() || 'support';
    const line = action === 'submitted' ? `${e.docName ? docKindLabel(e.docName) : 'Proof'} submitted` : action === 'approved' ? `Approved by ${by}` : `Rejected by ${by}`;
    const note = action === 'rejected' && e.note?.trim() ? e.note.trim() : undefined;
    return { action, icon: action === 'approved' ? '☑️' : action === 'rejected' ? '✗' : '📄', line, note, when: fullDate(e.at) };
  });
}

/** Who may open a player's verification details: the player themself (their
 *  own login, a parent managing the child's login included) or support. */
export function canSeeVerification(input: { playerId: string; myPlayerId: string | null | undefined; viewerIsSupport: boolean }): boolean {
  if (!input.playerId) return false;
  return input.viewerIsSupport || (!!input.myPlayerId && input.myPlayerId === input.playerId);
}
