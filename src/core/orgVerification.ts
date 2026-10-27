/**
 * Organisation verification (docs/verification/org-verification.md). Phase 1
 * (migration 20261025190000): schools and colleges. Phase 2 (20261027100000):
 * every registered type — companies, hospital chains, NGOs, sports clubs,
 * academies, associations and housing societies. Pure — node tests load it.
 *
 * A REGISTERED organisation proves to SportnNote support:
 *   1. its official ID (UDISE+ / AISHE / CIN / NGO Darpan / registration number …),
 *   2. one registration or recognition document,
 *   3. that the person asking is authorised (official email code, a letter
 *      signed by the head + support's call-back, or the head confirming).
 * The ID rules mirror valid_official_id() / norm_official_id() in the migrations.
 */

export type OfficialIdType =
  | 'udise' | 'cbse' | 'cisce' | 'state_board' | 'ib' | 'cambridge' | 'nios' | 'aishe'
  // Phase 2
  | 'cin' | 'llpin' | 'gstin' | 'udyam' | 'ngo_darpan' | 'society_reg' | 'trust_reg' | 'coop_reg';

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
  // ---- Phase 2 ----
  cin: {
    label: 'CIN (company number)', placeholder: 'e.g. U92490KA2019PTC123456', pattern: /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/,
    hint: '21 characters, on the Certificate of Incorporation. A Section 8 (not-for-profit) company has one too.',
    lookup: { label: 'MCA master data', url: 'https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html' },
  },
  llpin: {
    label: 'LLPIN', placeholder: 'e.g. AAB-1234', pattern: /^[A-Z]{3}-\d{4}$/,
    hint: 'The LLP’s identification number, on its Certificate of Incorporation.',
    lookup: { label: 'MCA master data', url: 'https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html' },
  },
  gstin: {
    label: 'GSTIN', placeholder: 'e.g. 29ABCDE1234F1Z5', pattern: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    hint: '15 characters, on the GST registration certificate.',
    lookup: { label: 'GST taxpayer search', url: 'https://services.gst.gov.in/services/searchtp' },
  },
  udyam: {
    label: 'Udyam registration number', placeholder: 'e.g. UDYAM-KA-03-0012345', pattern: /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/,
    hint: 'On the Udyam (MSME) registration certificate.',
    lookup: { label: 'Udyam verification', url: 'https://udyamregistration.gov.in/Udyam_Verify.aspx' },
  },
  ngo_darpan: {
    label: 'NGO Darpan ID', placeholder: 'e.g. KA/2019/0123456', pattern: /^[A-Z]{2}[/]\d{4}[/]\d{7}$/,
    hint: 'State / year / 7 digits, from the NGO Darpan portal (NITI Aayog).',
    lookup: { label: 'NGO Darpan', url: 'https://ngodarpan.gov.in/' },
  },
  society_reg: {
    label: 'Society registration number', placeholder: 'As on the registration certificate', pattern: /^[A-Z0-9/().&-]{3,40}$/,
    hint: 'From the registration certificate (Societies Registration Act or your state’s act).',
  },
  trust_reg: {
    label: 'Trust registration number', placeholder: 'As on the trust deed / certificate', pattern: /^[A-Z0-9/().&-]{3,40}$/,
    hint: 'From the trust’s registration certificate or registered deed.',
  },
  coop_reg: {
    label: 'Co-operative society registration number', placeholder: 'As on the registration certificate', pattern: /^[A-Z0-9/().&-]{3,40}$/,
    hint: 'From the co-operative (housing) society’s registration certificate.',
  },
};

/** Numbers issued by a local registrar: the same number can exist in another
 *  state or district, so they never block another community from verifying
 *  (support still sees a match). Mirrors org_local_id_types() in SQL. */
export const LOCAL_ID_TYPES: readonly OfficialIdType[] = ['state_board', 'society_reg', 'trust_reg', 'coop_reg'];

/** Same as norm_official_id() in SQL: UDISE+ keeps digits only; others upper-cased
 *  with no spaces, and the usual separators put back (LLPIN, Udyam, NGO Darpan). */
export function normOfficialId(type: OfficialIdType, value: string): string {
  if (type === 'udise') return (value ?? '').replace(/\D/g, '');
  const v = (value ?? '').trim().replace(/\s+/g, '').toUpperCase();
  if (type === 'llpin') return v.replace(/^([A-Z]{3})-?(\d{4})$/, '$1-$2');
  if (type === 'udyam') return v.replace(/^UDYAM-?([A-Z]{2})-?(\d{2})-?(\d{7})$/, 'UDYAM-$1-$2-$3');
  if (type === 'ngo_darpan') return v.replace(/^([A-Z]{2})[/-](\d{4})[/-](\d{7})$/, '$1/$2/$3');
  return v;
}

export const validOfficialId = (type: OfficialIdType, value: string): boolean =>
  OFFICIAL_ID_RULES[type].pattern.test(normOfficialId(type, value));

/** Short names for choosing which ID you have (chips on a narrow phone). */
export const ID_SHORT: Record<OfficialIdType, string> = {
  udise: 'UDISE+', cbse: 'CBSE', cisce: 'CISCE (ICSE / ISC)', state_board: 'State board', ib: 'IB', cambridge: 'Cambridge',
  nios: 'NIOS', aishe: 'AISHE', cin: 'Company (CIN)', llpin: 'LLP', gstin: 'GST', udyam: 'Udyam', ngo_darpan: 'NGO Darpan',
  society_reg: 'Society', trust_reg: 'Trust', coop_reg: 'Co-operative',
};

/** The board codes a school can add next to its UDISE+ code. */
export const BOARD_ID_TYPES: readonly OfficialIdType[] = ['cbse', 'cisce', 'state_board', 'ib', 'cambridge', 'nios'];
export const BOARD_LABEL: Partial<Record<OfficialIdType, string>> = {
  cbse: 'CBSE', cisce: 'CISCE (ICSE / ISC)', state_board: 'State board', ib: 'IB', cambridge: 'Cambridge', nios: 'NIOS',
};

/** Community types: a registered organisation, or an informal group (no verification). */
export const REGISTERED_TYPES = [
  'School', 'College', 'Sports club', 'Sports academy', 'Sports association', 'Company', 'Hospital chain', 'NGO', 'Housing society',
] as const;
export type VerifiableType = typeof REGISTERED_TYPES[number];
export const verifiableType = (type?: string): type is VerifiableType => (REGISTERED_TYPES as readonly string[]).includes(type ?? '');

export interface OrgVerifyConfig {
  /** "the school", "the club" … in sentences */
  noun: string;
  /** at least one of these (step 1) — mirrors org_required_id_types() in SQL */
  requiredAnyOf: readonly OfficialIdType[];
  /** extra codes that help support (e.g. a school's board, a company's GSTIN) */
  optional: readonly OfficialIdType[];
  /** step 2: one of these documents */
  docKinds: readonly string[];
  /** who signs / confirms for it */
  head: string;
  /** placeholder for the official email */
  emailExample: string;
}

const SOCIETY_DOCS = ['Society / trust registration certificate', 'Certificate of Incorporation'] as const;
export const ORG_VERIFY: Record<VerifiableType, OrgVerifyConfig> = {
  School: {
    noun: 'school', requiredAnyOf: ['udise'], optional: ['cbse', 'cisce', 'state_board', 'ib', 'cambridge', 'nios'],
    docKinds: ['Board affiliation letter', 'State recognition (RTE) certificate', 'Government sanction order', 'Other official recognition'],
    head: 'Principal / Head', emailExample: 'principal@school.edu.in',
  },
  College: {
    noun: 'college', requiredAnyOf: ['aishe'], optional: [],
    docKinds: ['University affiliation letter', 'Recognition letter (UGC, AICTE or state)', 'Other official recognition'],
    head: 'Principal / Head', emailExample: 'principal@college.ac.in',
  },
  'Sports club': {
    noun: 'club', requiredAnyOf: ['society_reg', 'trust_reg', 'cin', 'llpin', 'gstin', 'udyam'], optional: [],
    docKinds: [...SOCIETY_DOCS, 'GST / Udyam registration certificate', 'Affiliation letter from a sports association', 'Other official registration'],
    head: 'President / Secretary', emailExample: 'secretary@yourclub.in',
  },
  'Sports academy': {
    noun: 'academy', requiredAnyOf: ['society_reg', 'trust_reg', 'cin', 'llpin', 'gstin', 'udyam'], optional: [],
    docKinds: [...SOCIETY_DOCS, 'GST / Udyam registration certificate', 'Affiliation letter from a sports association', 'Other official registration'],
    head: 'Director / Owner', emailExample: 'director@youracademy.in',
  },
  'Sports association': {
    noun: 'association', requiredAnyOf: ['society_reg', 'trust_reg', 'cin'], optional: [],
    docKinds: ['Society registration certificate', 'Affiliation letter from the state / national federation', 'Certificate of Incorporation', 'Other official registration'],
    head: 'President / Secretary', emailExample: 'secretary@association.in',
  },
  Company: {
    noun: 'company', requiredAnyOf: ['cin', 'llpin'], optional: ['gstin'],
    docKinds: ['Certificate of Incorporation', 'GST registration certificate', 'Other official registration'],
    head: 'Director / authorised signatory', emailExample: 'hr@company.com',
  },
  'Hospital chain': {
    noun: 'hospital', requiredAnyOf: ['cin', 'llpin', 'trust_reg', 'society_reg'], optional: ['gstin'],
    docKinds: ['Certificate of Incorporation', 'Trust / society registration certificate', 'Clinical establishment registration', 'Other official registration'],
    head: 'Director / authorised signatory', emailExample: 'admin@hospital.in',
  },
  NGO: {
    noun: 'NGO', requiredAnyOf: ['ngo_darpan', 'society_reg', 'trust_reg', 'cin'], optional: [],
    docKinds: ['NGO Darpan registration', 'Society / trust registration certificate', 'Section 8 Certificate of Incorporation', '12A / 80G certificate', 'Other official registration'],
    head: 'President / Secretary', emailExample: 'contact@yourngo.org',
  },
  'Housing society': {
    noun: 'society', requiredAnyOf: ['coop_reg', 'society_reg'], optional: [],
    docKinds: ['Co-operative society registration certificate', 'Society / RWA registration certificate', 'Other official registration'],
    head: 'Chairman / Secretary', emailExample: 'secretary@yoursociety.in',
  },
};

/** Phase 1 names, kept for older callers. */
export const REQUIRED_ID: Pick<Record<VerifiableType, OfficialIdType>, 'School' | 'College'> = { School: 'udise', College: 'aishe' };
export const DOC_KINDS: Record<VerifiableType, readonly string[]> = Object.fromEntries(
  REGISTERED_TYPES.map((t) => [t, ORG_VERIFY[t].docKinds]),
) as Record<VerifiableType, readonly string[]>;

/** Verified organisations of these types may confirm members' dates of birth
 *  (they keep members' records for sport). Mirrors org_dob_access_or_raise(). */
export const DOB_CONFIRM_TYPES: readonly VerifiableType[] = ['School', 'College', 'Sports club', 'Sports academy', 'Sports association'];
export const canConfirmDobs = (type?: string): boolean => (DOB_CONFIRM_TYPES as readonly string[]).includes(type ?? '');
export const UNREGISTERED_TYPES = ['Friends group', 'Neighbourhood group', 'Office team', 'Alumni group'] as const;
/** Types only a registered organisation may use (server rule in guard_org_verification). */
export const OFFICIAL_ONLY_TYPES: readonly string[] = ['School', 'College'];

export type Authority = 'email' | 'letter' | 'head';
/** The three ways to show you're authorised, worded for the organisation type. */
export function authorityOptions(type?: string): Record<Authority, { title: string; blurb: string }> {
  if (!verifiableType(type) || type === 'School') return AUTHORITY_OPTIONS;
  const c = ORG_VERIFY[type];
  return {
    email: {
      title: `✉️ Official ${c.noun} email`,
      blurb: `We email a code to an address the ${c.noun} uses officially — the fastest way. Support checks it matches the ${c.noun}’s website or its public listing.`,
    },
    letter: {
      title: `📄 Letter signed by the ${c.head}`,
      blurb: `Upload a letter on the ${c.noun}’s letterhead, signed (and stamped, if it has a seal) by the ${c.head}, naming you. Support then calls the ${c.noun}’s published number to confirm.`,
    },
    head: {
      title: `👤 The ${c.head} confirms`,
      blurb: `We email the ${c.head} at their official address; they confirm with one tap that you’re authorised.`,
    },
  };
}
/** School wording (Phase 1). */
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

/** Where an organisation is in the three steps. */
export function verificationProgress(s: OrgVerificationState): {
  ids: boolean; doc: boolean; authority: boolean; ready: boolean;
  /** what still needs doing, in order */
  todo: string[];
} {
  const type = verifiableType(s.type) ? s.type : undefined;
  const v = s.verification;
  const cfg = type ? ORG_VERIFY[type] : undefined;
  const ids = !!cfg && s.ids.some((i) => cfg.requiredAnyOf.includes(i.type));
  const doc = !!v?.hasDoc && !!v.docKind;
  const authority = !!v && (
    (v.authority === 'email' && v.emailVerified)
    || (v.authority === 'letter' && v.hasLetter)
    || (v.authority === 'head' && !!v.headRequestedAt && !v.headDeclinedAt));
  const todo: string[] = [];
  if (!ids && cfg) todo.push(cfg.requiredAnyOf.length === 1 ? `Add the ${OFFICIAL_ID_RULES[cfg.requiredAnyOf[0]].label}` : 'Add a registration number');
  if (!doc) todo.push(cfg && type !== 'School' && type !== 'College' ? 'Upload a registration document' : 'Upload a recognition document');
  if (!authority) todo.push(`Show you’re authorised by the ${cfg?.noun ?? 'organisation'}`);
  return { ids, doc, authority, ready: ids && doc && authority, todo };
}

/** Support's reasons to send a request back. */
/** Short enough for one chip on a 375 px phone; it's also what the school reads. */
export const SEND_BACK_REASONS = [
  'ID not in the public register',
  'Document unclear or not accepted',
  'Name doesn’t match the register',
  'Couldn’t confirm you’re authorised',
  'Already verified here',
] as const;

/** Support's checklist: every item ticked before Approve. `idTypes` are the
 *  IDs given: a local registrar's number has no public search to look in. */
export function reviewChecks(
  authority?: Authority | null,
  opts: { type?: string; idTypes?: readonly OfficialIdType[] } = {},
): { key: 'id' | 'doc' | 'authority'; label: string }[] {
  const type = verifiableType(opts.type) ? opts.type : 'School';
  const { noun, head } = ORG_VERIFY[type];
  const searchable = !opts.idTypes || opts.idTypes.some((t) => !!OFFICIAL_ID_RULES[t]?.lookup);
  const headName = type === 'School' || type === 'College' ? 'The Head' : `The ${head}`;
  return [
    {
      key: 'id',
      label: searchable
        ? 'Found the official ID in the public register — the name and city match'
        : 'The registration number, name and place match the certificate (this register has no public search)',
    },
    { key: 'doc', label: `The document is a genuine ${type === 'School' || type === 'College' ? 'recognition' : 'registration'} document for this ${noun}, with the same name` },
    {
      key: 'authority',
      label: authority === 'email'
        ? `The verified email matches the ${noun}’s email or website in the register`
        : authority === 'letter'
          ? `I called the ${noun}’s published office number and they confirmed the letter`
          : authority === 'head'
            ? `${headName} confirmed, and their email matches the one in the register`
            : `The person is authorised by the ${noun}`,
    },
  ];
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The authorisation letter template (printed on letterhead, signed + stamped). */
export function authorisationLetterHtml(p: { orgName: string; personName: string; ids: readonly OfficialIdEntry[]; type?: string }): string {
  const idLine = p.ids.map((i) => `${OFFICIAL_ID_RULES[i.type]?.label ?? i.type}: ${esc(i.value)}`).join(' · ');
  const cfg = ORG_VERIFY[verifiableType(p.type) ? p.type : 'School'];
  const noun = cfg.noun; const head = cfg.head;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Authorisation letter — ${esc(p.orgName)}</title>
<style>@page{size:A4 portrait;margin:20mm}body{font:12pt/1.6 Georgia,serif;color:#111;max-width:170mm;margin:0 auto;padding:12px}
.bar{position:sticky;top:0;background:#0E1116;color:#fff;padding:10px 16px;font:14px -apple-system,Arial,sans-serif}.bar button{font:inherit;padding:6px 12px;border:0;border-radius:6px;background:#3DDC97;font-weight:700;cursor:pointer}
@media print{.bar{display:none}}.muted{color:#666;font-size:10pt}.line{border-bottom:1px solid #333;display:inline-block;min-width:60mm}</style></head><body>
<div class="bar"><button onclick="window.print()">🖨 Print / Save as PDF</button> Print this on your ${esc(noun)}’s letterhead</div>
<p class="muted">[Print on ${esc(noun)} letterhead]</p>
<p>Date: <span class="line">&nbsp;</span></p>
<p>To SportnNote</p>
<p><b>Subject: Authorisation to manage ${esc(p.orgName)} on SportnNote</b></p>
<p>This is to confirm that <b>${esc(p.personName)}</b>, <span class="line">&nbsp;</span> (role at the ${esc(noun)}), is authorised by <b>${esc(p.orgName)}</b>${idLine ? ` (${idLine})` : ''} to create and manage the ${esc(noun)}’s community on SportnNote, including its sports events, results and members.</p>
<p>SportnNote may contact the ${esc(noun)}’s office at its published phone number to confirm this letter.</p>
<p style="margin-top:28mm">Signature: <span class="line">&nbsp;</span></p>
<p>Name and title (${esc(head)}): <span class="line">&nbsp;</span></p>
<p>Seal / stamp (if any):</p>
</body></html>`;
}
