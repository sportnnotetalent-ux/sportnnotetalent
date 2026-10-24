/**
 * School & college verification, Phase 1 (docs/verification/org-verification.md,
 * migration 20261025190000_org_verification). Pure — node tests load it.
 *
 * A REGISTERED school / college proves to SportnNote support:
 *   1. its official ID (UDISE+ for schools, AISHE for colleges, plus board codes),
 *   2. one recognition document,
 *   3. that the person asking is authorised (official email code, a letter
 *      signed by the Head + support's call-back, or the Head confirming).
 * The ID rules mirror valid_official_id() / norm_official_id() in the migration.
 */

export type OfficialIdType = 'udise' | 'cbse' | 'cisce' | 'state_board' | 'ib' | 'cambridge' | 'nios' | 'aishe';

export interface OfficialIdRule {
  label: string;
  hint: string;
  placeholder: string;
  pattern: RegExp;
  /** a public register the reviewer searches */
  lookup?: { label: string; url: string };
}

export const OFFICIAL_ID_RULES: Record<OfficialIdType, OfficialIdRule> = {
  udise: {
    label: 'UDISE+ code', placeholder: 'e.g. 36010100101', pattern: /^\d{11}$/,
    hint: '11 digits. It’s on the school’s UDISE+ certificate, or search the school on “Know Your School”.',
    lookup: { label: 'Know Your School (UDISE+)', url: 'https://kys.udiseplus.gov.in/' },
  },
  cbse: {
    label: 'CBSE affiliation number', placeholder: 'e.g. 1930123', pattern: /^\d{4,8}$/,
    hint: 'On the CBSE affiliation letter.',
    lookup: { label: 'CBSE SARAS', url: 'https://saras.cbse.gov.in/' },
  },
  cisce: {
    label: 'CISCE school code', placeholder: 'e.g. KA071', pattern: /^[A-Z0-9]{3,10}$/,
    hint: 'On the CISCE affiliation letter.',
    lookup: { label: 'CISCE', url: 'https://cisce.org/' },
  },
  state_board: {
    label: 'State board school code', placeholder: 'As on the state board’s records', pattern: /^[A-Z0-9/-]{2,20}$/,
    hint: 'The code or index number the state board gave the school.',
  },
  ib: {
    label: 'IB school code', placeholder: 'e.g. 001234', pattern: /^[A-Z0-9-]{3,10}$/,
    hint: 'From the IB authorisation.',
    lookup: { label: 'Find an IB school', url: 'https://www.ibo.org/programmes/find-an-ib-school/' },
  },
  cambridge: {
    label: 'Cambridge centre number', placeholder: 'e.g. IN123', pattern: /^[A-Z0-9]{3,10}$/,
    hint: 'From the Cambridge centre approval.',
    lookup: { label: 'Find a Cambridge school', url: 'https://www.cambridgeinternational.org/why-choose-us/find-a-cambridge-school/' },
  },
  nios: {
    label: 'NIOS accreditation code', placeholder: 'As on the accreditation', pattern: /^[A-Z0-9/-]{3,20}$/,
    hint: 'The Accredited Institution code from NIOS.',
  },
  aishe: {
    label: 'AISHE code', placeholder: 'e.g. C-12345', pattern: /^[CUS]-\d{3,6}$/,
    hint: 'C- for a college, U- for a university, S- for a standalone institution.',
    lookup: { label: 'AISHE', url: 'https://aishe.gov.in/' },
  },
};

/** Same as norm_official_id() in SQL: UDISE+ keeps digits only; others upper-cased, no spaces. */
export function normOfficialId(type: OfficialIdType, value: string): string {
  return type === 'udise' ? (value ?? '').replace(/\D/g, '') : (value ?? '').trim().replace(/\s+/g, '').toUpperCase();
}

export const validOfficialId = (type: OfficialIdType, value: string): boolean =>
  OFFICIAL_ID_RULES[type].pattern.test(normOfficialId(type, value));

/** The board codes a school can add next to its UDISE+ code. */
export const BOARD_ID_TYPES: readonly OfficialIdType[] = ['cbse', 'cisce', 'state_board', 'ib', 'cambridge', 'nios'];
export const BOARD_LABEL: Partial<Record<OfficialIdType, string>> = {
  cbse: 'CBSE', cisce: 'CISCE (ICSE / ISC)', state_board: 'State board', ib: 'IB', cambridge: 'Cambridge', nios: 'NIOS',
};

/** Phase 1 verifies schools and colleges (other registered types: Phase 2). */
export type VerifiableType = 'School' | 'College';
export const verifiableType = (type?: string): type is VerifiableType => type === 'School' || type === 'College';
export const REQUIRED_ID: Record<VerifiableType, OfficialIdType> = { School: 'udise', College: 'aishe' };

export const DOC_KINDS: Record<VerifiableType, readonly string[]> = {
  School: ['Board affiliation letter', 'State recognition (RTE) certificate', 'Government sanction order', 'Other official recognition'],
  College: ['University affiliation letter', 'Recognition letter (UGC, AICTE or state)', 'Other official recognition'],
};

/** Community types: a registered organisation, or an informal group (no verification). */
export const REGISTERED_TYPES = ['School', 'College', 'Company', 'Housing society', 'Hospital chain', 'Sports club', 'NGO'] as const;
export const UNREGISTERED_TYPES = ['Friends group', 'Neighbourhood group', 'Office team', 'Alumni group'] as const;
/** Types only a registered organisation may use (server rule in guard_org_verification). */
export const OFFICIAL_ONLY_TYPES: readonly string[] = ['School', 'College'];

export type Authority = 'email' | 'letter' | 'head';
export const AUTHORITY_OPTIONS: Record<Authority, { title: string; blurb: string }> = {
  email: {
    title: '✉️ Official school email',
    blurb: 'We email a code to an address the school uses officially — the fastest way. Support checks it matches the email or website in the public register.',
  },
  letter: {
    title: '📄 Letter signed by the Head',
    blurb: 'Upload a letter on school letterhead, signed and stamped by the Principal or Head, naming you. Support then calls the school’s published office number to confirm.',
  },
  head: {
    title: '👤 The Head confirms',
    blurb: 'We email the Principal or Head at their official address; they confirm with one tap that you’re authorised.',
  },
};

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'rediffmail.com', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'aol.com', 'zoho.com', 'zohomail.in',
]);
export const emailDomain = (email?: string): string => (email ?? '').split('@')[1]?.trim().toLowerCase() ?? '';
/** A free mailbox is allowed (many schools use one officially) but support must
 *  match the WHOLE address against the register, not just the domain. */
export const isFreeMail = (email?: string): boolean => FREE_MAIL.has(emailDomain(email));

export interface OfficialIdEntry { type: OfficialIdType; value: string; country?: string; locked?: boolean; claimedBy?: string | null }

export interface OrgVerificationState {
  registered: boolean | null;
  type?: string;
  verified: boolean;
  verifiedAt?: string | null;
  requestedAt?: string | null;
  ids: OfficialIdEntry[];
  verification: null | {
    status: 'draft' | 'pending' | 'approved' | 'rejected';
    docKind?: string | null; docName?: string | null; hasDoc: boolean;
    authority?: Authority | null; officialEmail?: string | null; emailVerified: boolean;
    letterName?: string | null; hasLetter: boolean;
    headName?: string | null; headEmail?: string | null; headRequestedAt?: string | null;
    headConfirmedAt?: string | null; headConfirmedName?: string | null; headDeclinedAt?: string | null;
    submittedAt?: string | null; rejectReason?: string | null; reviewedAt?: string | null;
  };
}

/** Where a school / college is in the three steps. */
export function verificationProgress(s: OrgVerificationState): {
  ids: boolean; doc: boolean; authority: boolean; ready: boolean;
  /** what still needs doing, in order */
  todo: string[];
} {
  const type = verifiableType(s.type) ? s.type : undefined;
  const v = s.verification;
  const ids = !!type && s.ids.some((i) => i.type === REQUIRED_ID[type]);
  const doc = !!v?.hasDoc && !!v.docKind;
  const authority = !!v && (
    (v.authority === 'email' && v.emailVerified)
    || (v.authority === 'letter' && v.hasLetter)
    || (v.authority === 'head' && !!v.headRequestedAt && !v.headDeclinedAt));
  const todo: string[] = [];
  if (!ids && type) todo.push(`Add the ${OFFICIAL_ID_RULES[REQUIRED_ID[type]].label}`);
  if (!doc) todo.push('Upload a recognition document');
  if (!authority) todo.push('Show you’re authorised by the school');
  return { ids, doc, authority, ready: ids && doc && authority, todo };
}

/** Support's reasons to send a request back. */
/** Short enough for one chip on a 375 px phone; it's also what the school reads. */
export const SEND_BACK_REASONS = [
  'ID not in the public register',
  'Document unclear or not accepted',
  'Name doesn’t match the register',
  'Couldn’t confirm you’re authorised',
  'School already verified here',
] as const;

/** Support's checklist: every item ticked before Approve. */
export function reviewChecks(authority?: Authority | null): { key: 'id' | 'doc' | 'authority'; label: string }[] {
  return [
    { key: 'id', label: 'Found the official ID in the public register — the name and city match' },
    { key: 'doc', label: 'The document is a genuine recognition document for this school, with the same name' },
    {
      key: 'authority',
      label: authority === 'email'
        ? 'The verified email matches the school’s email or website in the register'
        : authority === 'letter'
          ? 'I called the school’s published office number and they confirmed the letter'
          : authority === 'head'
            ? 'The Head confirmed, and their email matches the one in the register'
            : 'The person is authorised by the school',
    },
  ];
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The authorisation letter template (printed on school letterhead, signed + stamped). */
export function authorisationLetterHtml(p: { orgName: string; personName: string; ids: readonly OfficialIdEntry[] }): string {
  const idLine = p.ids.map((i) => `${OFFICIAL_ID_RULES[i.type].label}: ${esc(i.value)}`).join(' · ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Authorisation letter — ${esc(p.orgName)}</title>
<style>@page{size:A4 portrait;margin:20mm}body{font:12pt/1.6 Georgia,serif;color:#111;max-width:170mm;margin:0 auto;padding:12px}
.bar{position:sticky;top:0;background:#0E1116;color:#fff;padding:10px 16px;font:14px -apple-system,Arial,sans-serif}.bar button{font:inherit;padding:6px 12px;border:0;border-radius:6px;background:#3DDC97;font-weight:700;cursor:pointer}
@media print{.bar{display:none}}.muted{color:#666;font-size:10pt}.line{border-bottom:1px solid #333;display:inline-block;min-width:60mm}</style></head><body>
<div class="bar"><button onclick="window.print()">🖨 Print / Save as PDF</button> Print this on your school’s letterhead</div>
<p class="muted">[Print on school letterhead]</p>
<p>Date: <span class="line">&nbsp;</span></p>
<p>To SportnNote</p>
<p><b>Subject: Authorisation to manage ${esc(p.orgName)} on SportnNote</b></p>
<p>This is to confirm that <b>${esc(p.personName)}</b>, <span class="line">&nbsp;</span> (role at the school), is authorised by <b>${esc(p.orgName)}</b>${idLine ? ` (${idLine})` : ''} to create and manage the school’s community on SportnNote, including its sports events, results and members.</p>
<p>SportnNote may contact the school office at its published phone number to confirm this letter.</p>
<p style="margin-top:28mm">Signature: <span class="line">&nbsp;</span></p>
<p>Name of Principal / Head: <span class="line">&nbsp;</span></p>
<p>School seal / stamp:</p>
</body></html>`;
}
