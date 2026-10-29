/**
 * CL-03 parental proof — the app's pure rules (design:
 * docs/security/cl03-parental-proof-design.md; founder 2026-10-29). An under-18
 * account waits until a parent, signed in to their own account, sends a photo
 * ID and a document showing the relationship, and a reviewer approves it.
 * Tests: tests/guardian-proof.test.mts.
 */

export type ProofStatus = 'pending' | 'approved' | 'rejected';
export type Relationship = 'mother' | 'father' | 'legal_guardian';

export const RELATIONSHIPS: readonly { id: Relationship; label: string }[] = [
  { id: 'mother', label: 'Mother' },
  { id: 'father', label: 'Father' },
  { id: 'legal_guardian', label: 'Legal guardian' },
];

/** Shown to parents after they send (founder 2026-10-29). */
export const REVIEW_PROMISE = 'We’ll check this within 2 days.';

/** What we accept (the reviewer judges; these are the examples parents see). */
export const ID_DOC_EXAMPLES = 'Aadhaar (masked), passport, driving licence, voter ID or PAN card';
export const RELATION_DOC_EXAMPLES = 'your child’s birth certificate naming you, a school record or ID card naming you as parent, your child’s passport, or a court guardianship order';

/** The reviewer's reasons — each tells the parent what to fix. */
export const REJECT_REASONS: readonly string[] = [
  'The photo ID is hard to read — please send a clearer photo.',
  'The name on the ID doesn’t match the name you typed.',
  'The second document doesn’t show you’re the parent or legal guardian.',
  'The date of birth doesn’t match your child’s profile.',
  'The ID has expired — please send a current one.',
];

/** Largest file accepted (the bucket's own limit). */
export const PROOF_DOC_MAX_BYTES = 10 * 1024 * 1024;

type Doc = { name: string; size?: number | null } | null;

/** The form's first problem, in words for the parent — or null when it's ready. */
export function validateProofForm(f: { relationship: string | null; name: string; idDoc: Doc; relationDoc: Doc }): string | null {
  if (!f.relationship || !RELATIONSHIPS.some((r) => r.id === f.relationship)) return 'Choose how you’re related: mother, father or legal guardian.';
  if (!f.name.trim()) return 'Type your name exactly as it is on your photo ID.';
  if (!f.idDoc) return 'Add your photo ID.';
  if (!f.relationDoc) return 'Add the document showing you’re the parent or legal guardian.';
  for (const d of [f.idDoc, f.relationDoc]) {
    if ((d.size ?? 0) > PROOF_DOC_MAX_BYTES) return `“${d.name}” is too large (max 10 MB). A photo or a smaller PDF works.`;
  }
  return null;
}

/** "<parent>/guardian-<child>/<kind>-<time>.<ext>" — the parent's own folder,
 *  which the bucket lets them write and reviewers read. */
export function guardianDocPath(uid: string, childProfileId: string, kind: 'id' | 'relation', fileName: string, now: number): string {
  const raw = fileName.includes('.') ? fileName.split('.').pop()! : '';
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return `${uid}/guardian-${childProfileId}/${kind}-${now}.${ext}`;
}

export type ChildCard = { kind: 'waiting' | 'in_review' | 'rejected' | 'locked'; title: string; body: string };

/** The child's Home card while their account is limited (null otherwise). */
export function childCardState(s: {
  limited: boolean;
  consent: string | null;
  proof: { status: ProofStatus; reason: string | null } | null;
  emailedTo: string | null;
}): ChildCard | null {
  if (!s.limited) return null;
  const meanwhile = 'Until then you can play and be scored, but you’re hidden from search and public lists, and following and messages are off.';
  if (s.consent === 'withdrawn') {
    return { kind: 'locked', title: 'Your account is locked',
      body: 'Your parent or guardian said no. Ask them to approve it, or the account is deleted after 30 days.' };
  }
  if (s.proof?.status === 'pending') {
    return { kind: 'in_review', title: 'Your parent’s documents are being checked', body: `${REVIEW_PROMISE} ${meanwhile}` };
  }
  if (s.proof?.status === 'rejected') {
    return { kind: 'rejected', title: 'Your parent’s documents weren’t accepted',
      body: `${s.proof.reason ? `${s.proof.reason} ` : ''}Ask them to open SportnNote and send new ones.` };
  }
  return { kind: 'waiting', title: 'Waiting for your parent or guardian',
    body: `${s.emailedTo ? `We sent ${s.emailedTo} a link. ` : ''}They approve from their own SportnNote account with a photo ID and a document showing they’re your parent (like your birth certificate). ${meanwhile}` };
}
