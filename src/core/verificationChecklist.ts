/** The one checklist on your own profile (verification fast lanes, Phase 3 —
 *  docs/verification/fast-lanes.md): what's done, and the single next step.
 *  Pure (node tests load it); the card (components/VerificationChecklist) acts. */

export type ChecklistAction =
  | 'edit_profile'      // add date of birth / parent details
  | 'send_consent'      // email the parent the consent (+ date of birth) link
  | 'verify_below'      // verify a mobile / email with a code (contact cards below)
  | 'upload_document';  // upload a proof of date of birth (card below)

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** shown when not done */
  hint?: string;
  action?: ChecklistAction;
  /** waiting on someone else (a reviewer, the parent) */
  waiting?: boolean;
}

export interface ChecklistInput {
  age?: number;
  hasDob: boolean;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  guardian?: { added: boolean; phoneVerified?: boolean; emailVerified?: boolean };
  consent?: 'self_declared' | 'pending' | 'confirmed' | 'withdrawn' | null;
  ageVerifiedBy?: 'document' | 'school' | 'parent';
  documentStatus?: 'pending' | 'approved' | 'rejected';
}

const VIA: Record<NonNullable<ChecklistInput['ageVerifiedBy']>, string> = {
  document: 'by document', school: 'by your school / club', parent: 'by your parent',
};

export function checklistItems(i: ChecklistInput): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  out.push({ key: 'dob', label: 'Date of birth', done: i.hasDob, hint: 'Add it — it decides your age groups.', action: 'edit_profile' });
  const minor = i.age === undefined || i.age < 18;
  if (minor && i.hasDob) {
    const g = i.guardian;
    out.push({ key: 'guardian', label: 'Parent / guardian added', done: !!g?.added, hint: 'Add their name, mobile and email.', action: 'edit_profile' });
    const consentDone = i.consent === 'confirmed' || i.consent === 'self_declared';
    out.push({
      key: 'consent', label: 'Parent’s consent', done: consentDone,
      hint: i.consent === 'pending' ? 'Waiting for your parent — send the link again if they didn’t get it.' : 'Send your parent the link — they agree and confirm your date of birth in one step.',
      action: g?.added ? 'send_consent' : 'edit_profile', waiting: i.consent === 'pending',
    });
    out.push({ key: 'g_phone', label: 'Parent’s mobile verified', done: !!g?.phoneVerified, hint: 'Verify it with a code below.', action: 'verify_below' });
    out.push({ key: 'g_email', label: 'Parent’s email verified', done: !!g?.emailVerified, hint: 'Done when your parent opens the consent link.', action: g?.added ? 'send_consent' : 'edit_profile' });
  } else if (!minor) {
    out.push({ key: 'phone', label: 'Your mobile verified', done: !!i.phoneVerified, hint: 'Verify it with a code below.', action: 'verify_below' });
    out.push({ key: 'email', label: 'Your email verified', done: !!i.emailVerified, hint: 'Verify it with a code below.', action: 'verify_below' });
  }
  const docWaiting = i.documentStatus === 'pending';
  out.push({
    key: 'age', label: i.ageVerifiedBy ? `Age verified ${VIA[i.ageVerifiedBy]}` : 'Age verified', done: !!i.ageVerifiedBy,
    hint: docWaiting
      ? 'Your document is with a reviewer — usually within a few hours.'
      : minor
        ? 'Fastest: your parent confirms it with the consent link, or your school confirms it. Or upload a document.'
        : 'Your school / club can confirm it, or upload a document.',
    action: docWaiting ? undefined : minor ? 'send_consent' : 'upload_document',
    waiting: docWaiting,
  });
  return out;
}

/** The first thing to do (skipping what waits on others), or undefined when all done. */
export function nextStep(items: ChecklistItem[]): ChecklistItem | undefined {
  return items.find((x) => !x.done && !x.waiting) ?? items.find((x) => !x.done);
}
