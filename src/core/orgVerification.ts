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
  | 'cin' | 'llpin' | 'gstin' | 'udyam' | 'ngo_darpan' | 'society_reg' | 'trust_reg' | 'coop_reg'
  // more educational institutions (2026-10-27)
  | 'iti'
  // Phase 3 — other markets (2026-10-27): UK, US, Singapore, Malaysia, Australia, the Gulf
  | 'urn' | 'uk_school_ref' | 'ukprn' | 'companies_house' | 'uk_charity'
  | 'nces' | 'ipeds' | 'ein' | 'us_state_entity'
  | 'uen' | 'sg_moe'
  | 'ssm' | 'my_moe' | 'my_ros'
  | 'abn' | 'acara' | 'teqsa' | 'au_assoc'
  | 'gulf_school' | 'trade_licence'
  | 'other_reg';

export interface OfficialIdRule {
  label: string;
  hint: string;
  placeholder: string;
  pattern: RegExp;
  /** a public register the reviewer searches */
  lookup?: { label: string; url: string };
  /** the register's page for this exact number, where the register allows it */
  record?: (value: string) => string | undefined;
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
    record: (v) => `https://saras.cbse.gov.in/SARAS/AffiliatedList/AfflicationDetails/${encodeURIComponent(v)}`,
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
    hint: 'C- for a college, U- for a university, S- for a standalone institution (polytechnic, nursing, teacher training …).',
    lookup: { label: 'AISHE', url: 'https://aishe.gov.in/' },
  },
  iti: {
    label: 'ITI code (NCVT MIS)', placeholder: 'e.g. GU29000014', pattern: /^[A-Z]{2}\d{8}$/,
    hint: '10 characters, as shown on the NCVT MIS portal and on trainees’ results.',
    lookup: { label: 'NCVT MIS', url: 'https://www.ncvtmis.gov.in/' },
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
  // ---- Phase 3: other markets ----
  urn: {
    label: 'School URN', placeholder: 'e.g. 100000', pattern: /^\d{6}$/,
    hint: '6 digits — the Unique Reference Number on Get Information about Schools (England).',
    lookup: { label: 'Get Information about Schools', url: 'https://get-information-schools.service.gov.uk/' },
    record: (v) => `https://get-information-schools.service.gov.uk/Establishments/Establishment/Details/${encodeURIComponent(v)}`,
  },
  uk_school_ref: {
    label: 'School reference number', placeholder: 'e.g. 5244439', pattern: /^[A-Z0-9/-]{4,12}$/,
    hint: 'Scotland: the SEED code. Wales: the LA / establishment number. Northern Ireland: the DE reference number.',
  },
  ukprn: {
    label: 'UKPRN', placeholder: 'e.g. 10007783', pattern: /^1\d{7}$/,
    hint: '8 digits starting with 1 — the UK Provider Reference Number for colleges and universities.',
    lookup: { label: 'UK Register of Learning Providers', url: 'https://www.ukrlp.co.uk/' },
  },
  companies_house: {
    label: 'Companies House number', placeholder: 'e.g. 01234567 or SC123456', pattern: /^(\d{8}|[A-Z]{2}\d{6})$/,
    hint: '8 characters, on the certificate of incorporation (England & Wales numbers start with 0; Scotland SC, Northern Ireland NI, LLPs OC).',
    lookup: { label: 'Companies House', url: 'https://find-and-update.company-information.service.gov.uk/' },
    record: (v) => `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(v)}`,
  },
  uk_charity: {
    label: 'Registered charity number', placeholder: 'e.g. 1123456 or SC012345', pattern: /^(\d{6,7}|SC\d{6}|NIC\d{6})$/,
    hint: 'England & Wales: 6–7 digits. Scotland (OSCR): SC + 6 digits. Northern Ireland: NIC + 6 digits.',
    lookup: { label: 'the charity register', url: 'https://register-of-charities.charitycommission.gov.uk/' },
    record: (v) => (/^\d{6,7}$/.test(v) ? `https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/${v}`
      : /^SC\d{6}$/.test(v) ? `https://www.oscr.org.uk/about-charities/search-the-register/charity-details?number=${v}` : undefined),
  },
  nces: {
    label: 'NCES school ID', placeholder: 'e.g. 062271003230', pattern: /^(\d{12}|[A-Z0-9]{8})$/,
    hint: 'Public schools: the 12-digit NCES ID. Private schools: the 8-character PSS ID.',
    lookup: { label: 'NCES school search', url: 'https://nces.ed.gov/ccd/schoolsearch/' },
    record: (v) => (/^\d{12}$/.test(v) ? `https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=${v}`
      : `https://nces.ed.gov/surveys/pss/privateschoolsearch/school_detail.asp?ID=${encodeURIComponent(v)}`),
  },
  ipeds: {
    label: 'IPEDS unit ID', placeholder: 'e.g. 166027', pattern: /^\d{6}$/,
    hint: '6 digits — the college’s ID on College Navigator (IPEDS).',
    lookup: { label: 'College Navigator', url: 'https://nces.ed.gov/collegenavigator/' },
    record: (v) => `https://nces.ed.gov/collegenavigator/?id=${v}`,
  },
  ein: {
    label: 'EIN', placeholder: 'e.g. 12-3456789', pattern: /^\d{2}-\d{7}$/,
    hint: '9 digits — the Employer Identification Number on the IRS letter (or the 501(c)(3) letter).',
    lookup: { label: 'IRS Tax Exempt Organization Search', url: 'https://apps.irs.gov/app/eos/' },
  },
  us_state_entity: {
    label: 'State entity number', placeholder: 'As on the state’s register', pattern: /^[A-Z0-9-]{3,20}$/,
    hint: 'The business or non-profit entity number from your Secretary of State.',
  },
  uen: {
    label: 'UEN', placeholder: 'e.g. 201912345K or T08SS0001A', pattern: /^(\d{8}[A-Z]|\d{9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$/,
    hint: 'The Unique Entity Number — on the ACRA BizFile, or the Registry of Societies certificate.',
    lookup: { label: 'UEN search', url: 'https://www.uen.gov.sg/' },
  },
  sg_moe: {
    label: 'MOE school code', placeholder: 'e.g. 7001', pattern: /^\d{4}$/,
    hint: '4 digits — the school’s code with the Ministry of Education.',
    lookup: { label: 'MOE SchoolFinder', url: 'https://www.moe.gov.sg/schoolfinder' },
  },
  ssm: {
    label: 'SSM registration number', placeholder: 'e.g. 201901012345', pattern: /^(\d{12}|\d{1,7}-?[A-Z])$/,
    hint: 'The 12-digit SSM number (or the older one like 123456-A) on the registration certificate.',
    lookup: { label: 'SSM e-Info', url: 'https://www.ssm-einfo.my/' },
  },
  my_moe: {
    label: 'MOE school code', placeholder: 'e.g. WBA0001', pattern: /^[A-Z]{3}\d{4}$/,
    hint: '3 letters + 4 digits — the school’s Kementerian Pendidikan code.',
    lookup: { label: 'Kementerian Pendidikan Malaysia', url: 'https://www.moe.gov.my/' },
  },
  my_ros: {
    label: 'ROS registration number', placeholder: 'e.g. PPM-001-10-01011980', pattern: /^[A-Z0-9/-]{4,30}$/,
    hint: 'From the Registry of Societies (Jabatan Pendaftaran Pertubuhan) certificate.',
    lookup: { label: 'Registry of Societies', url: 'https://www.ros.gov.my/' },
  },
  abn: {
    label: 'ABN', placeholder: 'e.g. 51 824 753 556', pattern: /^\d{11}$/,
    hint: '11 digits — the Australian Business Number.',
    lookup: { label: 'ABN Lookup', url: 'https://abr.business.gov.au/' },
    record: (v) => `https://abr.business.gov.au/ABN/View?abn=${v}`,
  },
  acara: {
    label: 'ACARA school ID', placeholder: 'e.g. 45678', pattern: /^\d{5,6}$/,
    hint: 'The school’s ID on My School (ACARA).',
    lookup: { label: 'My School', url: 'https://www.myschool.edu.au/' },
    record: (v) => `https://www.myschool.edu.au/school/${v}`,
  },
  teqsa: {
    label: 'TEQSA provider ID', placeholder: 'e.g. PRV12345', pattern: /^PRV\d{5}$/,
    hint: 'PRV + 5 digits — on the National Register of higher education providers.',
    lookup: { label: 'TEQSA National Register', url: 'https://www.teqsa.gov.au/national-register' },
  },
  au_assoc: {
    label: 'Incorporated association number', placeholder: 'e.g. A0012345B', pattern: /^[A-Z0-9/-]{3,20}$/,
    hint: 'From your state’s register of incorporated associations.',
  },
  gulf_school: {
    label: 'Education regulator licence / school ID', placeholder: 'As on the licence', pattern: /^[A-Z0-9/.-]{3,30}$/,
    hint: 'From KHDA, ADEK, SPEA, the Ministry of Education (MOE / MOEHE) or the CAA.',
  },
  trade_licence: {
    label: 'Trade / commercial licence number', placeholder: 'As on the licence', pattern: /^[A-Z0-9/.-]{3,30}$/,
    hint: 'From the commercial or trade licence (e.g. the Department of Economy & Tourism, a free zone, or the Ministry of Commerce).',
  },
  other_reg: {
    label: 'Registration number', placeholder: 'As on the certificate', pattern: /^[A-Z0-9/().&-]{3,40}$/,
    hint: 'If none of the others fits: the number from the official register that lists you. Support checks it against your document.',
  },
};

/** Numbers issued by a local registrar: the same number can exist in another
 *  state or district, so they never block another community from verifying
 *  (support still sees a match). Mirrors org_local_id_types() in SQL. */
export const LOCAL_ID_TYPES: readonly OfficialIdType[] = [
  'state_board', 'society_reg', 'trust_reg', 'coop_reg',
  // Phase 3: numbers a state, emirate or local register issues, and the catch-all
  'uk_school_ref', 'us_state_entity', 'my_ros', 'au_assoc', 'gulf_school', 'trade_licence', 'other_reg',
];

/** Same as norm_official_id() in SQL: UDISE+ keeps digits only; others upper-cased
 *  with no spaces, and the usual separators put back (LLPIN, Udyam, NGO Darpan). */
export function normOfficialId(type: OfficialIdType, value: string): string {
  if (type === 'udise' || type === 'urn' || type === 'ukprn' || type === 'ipeds' || type === 'abn' || type === 'acara' || type === 'sg_moe') return (value ?? '').replace(/\D/g, '');
  if (type === 'ein') return (value ?? '').replace(/\D/g, '').replace(/^(\d{2})(\d{7})$/, '$1-$2');
  const v = (value ?? '').trim().replace(/\s+/g, '').toUpperCase();
  if (type === 'llpin') return v.replace(/^([A-Z]{3})-?(\d{4})$/, '$1-$2');
  if (type === 'udyam') return v.replace(/^UDYAM-?([A-Z]{2})-?(\d{2})-?(\d{7})$/, 'UDYAM-$1-$2-$3');
  if (type === 'ngo_darpan') return v.replace(/^([A-Z]{2})[/-](\d{4})[/-](\d{7})$/, '$1/$2/$3');
  // a Companies House number typed without its leading zeros
  if (type === 'companies_house') return /^\d{1,7}$/.test(v) ? v.padStart(8, '0') : v;
  return v;
}

/** Australian Business Number checksum: subtract 1 from the first digit, weight
 *  10, 1, 3, 5 … 19, and the sum is a multiple of 89. Mirrors abn_ok() in SQL. */
export function abnOk(abn: string): boolean {
  if (!/^\d{11}$/.test(abn)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = [...abn].reduce((n, d, i) => n + (Number(d) - (i === 0 ? 1 : 0)) * w[i], 0);
  return sum % 89 === 0;
}

export const validOfficialId = (type: OfficialIdType, value: string): boolean => {
  const v = normOfficialId(type, value);
  return OFFICIAL_ID_RULES[type].pattern.test(v) && (type !== 'abn' || abnOk(v));
};

/** Short names for choosing which ID you have (chips on a narrow phone). */
export const ID_SHORT: Record<OfficialIdType, string> = {
  udise: 'UDISE+', cbse: 'CBSE', cisce: 'CISCE (ICSE / ISC)', state_board: 'State board', ib: 'IB', cambridge: 'Cambridge',
  nios: 'NIOS', aishe: 'AISHE', cin: 'Company (CIN)', llpin: 'LLP', gstin: 'GST', udyam: 'Udyam', ngo_darpan: 'NGO Darpan',
  society_reg: 'Society', trust_reg: 'Trust', coop_reg: 'Co-operative', iti: 'ITI code',
  urn: 'URN', uk_school_ref: 'Scotland / Wales / NI', ukprn: 'UKPRN', companies_house: 'Companies House', uk_charity: 'Charity',
  nces: 'NCES', ipeds: 'IPEDS', ein: 'EIN', us_state_entity: 'State entity',
  uen: 'UEN', sg_moe: 'MOE code', ssm: 'SSM', my_moe: 'MOE code', my_ros: 'ROS',
  abn: 'ABN', acara: 'ACARA', teqsa: 'TEQSA', au_assoc: 'Inc. association',
  gulf_school: 'Regulator licence', trade_licence: 'Trade licence', other_reg: 'Other register',
};

/** The board codes a school can add next to its UDISE+ code. */
export const BOARD_ID_TYPES: readonly OfficialIdType[] = ['cbse', 'cisce', 'state_board', 'ib', 'cambridge', 'nios'];
export const BOARD_LABEL: Partial<Record<OfficialIdType, string>> = {
  cbse: 'CBSE', cisce: 'CISCE (ICSE / ISC)', state_board: 'State board', ib: 'IB', cambridge: 'Cambridge', nios: 'NIOS',
};

/** Community types: a registered organisation, or an informal group (no verification). */
export const REGISTERED_TYPES = [
  'School', 'Junior / PU college', 'College', 'University', 'Polytechnic / institute', 'ITI',
  'Sports club', 'Sports academy', 'Sports association', 'Company', 'Hospital chain', 'NGO', 'Housing society',
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
  'Junior / PU college': {
    noun: 'college', requiredAnyOf: ['udise'], optional: ['state_board'],
    docKinds: ['Intermediate / PU board affiliation letter', 'State recognition certificate', 'Other official recognition'],
    head: 'Principal / Head', emailExample: 'principal@college.edu.in',
  },
  College: {
    noun: 'college', requiredAnyOf: ['aishe'], optional: [],
    docKinds: ['University affiliation letter', 'Recognition letter (UGC, AICTE or state)', 'Other official recognition'],
    head: 'Principal / Head', emailExample: 'principal@college.ac.in',
  },
  University: {
    noun: 'university', requiredAnyOf: ['aishe'], optional: [],
    docKinds: ['UGC recognition letter', 'Act / government notification establishing it', 'Other official recognition'],
    head: 'Vice-Chancellor / Registrar', emailExample: 'registrar@university.ac.in',
  },
  'Polytechnic / institute': {
    noun: 'institute', requiredAnyOf: ['aishe'], optional: [],
    docKinds: ['AICTE / regulator approval letter (NCTE, INC …)', 'State board / university affiliation letter', 'Other official recognition'],
    head: 'Principal / Director', emailExample: 'principal@institute.ac.in',
  },
  ITI: {
    noun: 'ITI', requiredAnyOf: ['iti'], optional: [],
    docKinds: ['DGT / NCVT affiliation letter', 'State (SCVT) affiliation letter', 'Other official recognition'],
    head: 'Principal', emailExample: 'principal@iti.gov.in',
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

/* ---------------------- Phase 3: other markets (2026-10-27) ---------------------- */

/** The school systems we support outside India (core/markets.ts MarketId). */
export type IntlMarket = 'gulf-british' | 'gulf-indian' | 'uk' | 'sg' | 'my' | 'au' | 'us';
export const INTL_MARKETS: readonly IntlMarket[] = ['gulf-british', 'gulf-indian', 'uk', 'sg', 'my', 'au', 'us'];

/** What a market accepts for each kind of organisation — every list ends with
 *  the catch-all register number where a type may have none of the others. */
interface MarketIds {
  edu: OfficialIdType[]; eduOptional: OfficialIdType[]; higher: OfficialIdType[];
  bodies: OfficialIdType[]; company: OfficialIdType[]; hospital: OfficialIdType[]; ngo: OfficialIdType[]; housing: OfficialIdType[];
  docs: { edu: string[]; higher: string[]; org: string[] };
}
const GULF_DOCS = {
  edu: ['KHDA / ADEK / SPEA / Ministry of Education licence', 'Board affiliation letter (CBSE, Cambridge, IB …)', 'Other official recognition'],
  higher: ['CAA / Ministry licence', 'Other official recognition'],
  org: ['Trade / commercial licence', 'Other official registration'],
};
const GULF_ORGS = {
  higher: ['gulf_school', 'trade_licence', 'other_reg'] as OfficialIdType[], bodies: ['trade_licence', 'other_reg'] as OfficialIdType[],
  company: ['trade_licence', 'other_reg'] as OfficialIdType[], hospital: ['trade_licence', 'other_reg'] as OfficialIdType[],
  ngo: ['trade_licence', 'other_reg'] as OfficialIdType[], housing: ['other_reg'] as OfficialIdType[],
};
export const MARKET_IDS: Record<IntlMarket, MarketIds> = {
  uk: {
    edu: ['urn', 'uk_school_ref', 'other_reg'], eduOptional: ['ib', 'cambridge'], higher: ['ukprn', 'other_reg'],
    bodies: ['companies_house', 'uk_charity', 'other_reg'], company: ['companies_house'], hospital: ['companies_house', 'uk_charity'],
    ngo: ['uk_charity', 'companies_house', 'other_reg'], housing: ['companies_house', 'other_reg'],
    docs: {
      edu: ['DfE / Ofsted / ISI registration (or the Scottish, Welsh or NI equivalent)', 'Exam board centre letter (Cambridge, IB …)', 'Other official recognition'],
      higher: ['OfS / UKRLP registration', 'Other official recognition'],
      org: ['Companies House certificate', 'Charity registration', 'Other official registration'],
    },
  },
  us: {
    edu: ['nces', 'other_reg'], eduOptional: ['ib', 'cambridge'], higher: ['ipeds', 'other_reg'],
    bodies: ['ein', 'us_state_entity', 'other_reg'], company: ['ein', 'us_state_entity'], hospital: ['ein', 'us_state_entity'],
    ngo: ['ein', 'us_state_entity'], housing: ['us_state_entity', 'ein', 'other_reg'],
    docs: {
      edu: ['State licence or registration', 'Accreditation letter (e.g. Cognia, WASC)', 'Other official recognition'],
      higher: ['Accreditation letter', 'State authorization', 'Other official recognition'],
      org: ['Certificate of incorporation / formation', 'IRS EIN or 501(c)(3) letter', 'Other official registration'],
    },
  },
  sg: {
    edu: ['sg_moe', 'uen', 'other_reg'], eduOptional: ['ib', 'cambridge'], higher: ['uen', 'other_reg'],
    bodies: ['uen', 'other_reg'], company: ['uen'], hospital: ['uen'], ngo: ['uen', 'other_reg'], housing: ['uen', 'other_reg'],
    docs: {
      edu: ['MOE registration letter', 'ACRA / UEN registration', 'Other official recognition'],
      higher: ['CPE / MOE registration', 'Other official recognition'],
      org: ['ACRA BizFile / UEN certificate', 'Registry of Societies certificate', 'Other official registration'],
    },
  },
  my: {
    edu: ['my_moe', 'ssm', 'other_reg'], eduOptional: ['ib', 'cambridge'], higher: ['ssm', 'other_reg'],
    bodies: ['my_ros', 'ssm', 'other_reg'], company: ['ssm'], hospital: ['ssm'], ngo: ['my_ros', 'ssm', 'other_reg'], housing: ['my_ros', 'other_reg'],
    docs: {
      edu: ['MOE registration certificate', 'SSM registration', 'Other official recognition'],
      higher: ['MOHE / MQA registration', 'Other official recognition'],
      org: ['SSM certificate', 'Registry of Societies certificate', 'Other official registration'],
    },
  },
  au: {
    edu: ['acara', 'abn', 'other_reg'], eduOptional: ['ib', 'cambridge'], higher: ['teqsa', 'abn', 'other_reg'],
    bodies: ['abn', 'au_assoc', 'other_reg'], company: ['abn'], hospital: ['abn'], ngo: ['abn', 'au_assoc'], housing: ['au_assoc', 'abn', 'other_reg'],
    docs: {
      edu: ['State registration / accreditation letter', 'ABN registration', 'Other official recognition'],
      higher: ['TEQSA / ASQA registration', 'Other official recognition'],
      org: ['ABN registration', 'Incorporated association certificate', 'Other official registration'],
    },
  },
  'gulf-indian': { edu: ['cbse', 'gulf_school', 'other_reg'], eduOptional: ['cambridge', 'ib'], ...GULF_ORGS, docs: GULF_DOCS },
  'gulf-british': { edu: ['gulf_school', 'other_reg'], eduOptional: ['cambridge', 'ib'], ...GULF_ORGS, docs: GULF_DOCS },
};

const isIntl = (m?: string | null): m is IntlMarket => (INTL_MARKETS as readonly string[]).includes(m ?? '');

/** Which group of a market's IDs an organisation type takes. */
function marketGroup(type: VerifiableType): 'edu' | 'higher' | 'bodies' | 'company' | 'hospital' | 'ngo' | 'housing' {
  switch (type) {
    case 'School': case 'Junior / PU college': return 'edu';
    case 'College': case 'University': case 'Polytechnic / institute': case 'ITI': return 'higher';
    case 'Sports club': case 'Sports academy': case 'Sports association': return 'bodies';
    case 'Company': return 'company';
    case 'Hospital chain': return 'hospital';
    case 'NGO': return 'ngo';
    default: return 'housing';
  }
}

/** The verification set-up for a type in its community's market (India: ORG_VERIFY).
 *  Mirrors org_required_id_types_for() / org_id_requirements in SQL. */
export function orgVerifyConfig(type: VerifiableType, market?: string | null): OrgVerifyConfig {
  const base = ORG_VERIFY[type];
  if (!isIntl(market)) return base;
  const m = MARKET_IDS[market];
  const g = marketGroup(type);
  const docs = g === 'edu' ? m.docs.edu : g === 'higher' ? m.docs.higher : m.docs.org;
  return {
    ...base,
    requiredAnyOf: m[g],
    optional: g === 'edu' ? m.eduOptional : [],
    docKinds: docs,
    emailExample: g === 'edu' || g === 'higher' ? 'office@yourschool.org' : g === 'company' || g === 'hospital' ? 'admin@yourcompany.com' : 'secretary@yourclub.org',
  };
}

/** The country an organisation's IDs are recorded under (org_official_ids.country). */
export function idCountry(market?: string | null): string {
  switch (market) {
    case 'uk': return 'GB';
    case 'us': return 'US';
    case 'sg': return 'SG';
    case 'my': return 'MY';
    case 'au': return 'AU';
    case 'gulf-british': case 'gulf-indian': return 'AE';
    default: return 'IN';
  }
}

/** Educational institutions: "recognition" documents, a Principal / Head-style
 *  signatory, and member dates of birth from student records. Mirrors
 *  EDUCATION_TYPES in core/org.ts and the SQL lists. */
export const EDUCATION_VERIFY_TYPES: readonly VerifiableType[] = ['School', 'Junior / PU college', 'College', 'University', 'Polytechnic / institute', 'ITI'];
export const isEducation = (type?: string): boolean => (EDUCATION_VERIFY_TYPES as readonly string[]).includes(type ?? '');

/** Phase 1 names, kept for older callers. */
export const REQUIRED_ID: Pick<Record<VerifiableType, OfficialIdType>, 'School' | 'College'> = { School: 'udise', College: 'aishe' };
export const DOC_KINDS: Record<VerifiableType, readonly string[]> = Object.fromEntries(
  REGISTERED_TYPES.map((t) => [t, ORG_VERIFY[t].docKinds]),
) as Record<VerifiableType, readonly string[]>;

/** Verified organisations of these types may confirm members' dates of birth
 *  (they keep members' records for sport). Mirrors org_dob_access_or_raise(). */
export const DOB_CONFIRM_TYPES: readonly VerifiableType[] = [...EDUCATION_VERIFY_TYPES, 'Sports club', 'Sports academy', 'Sports association'];
export const canConfirmDobs = (type?: string): boolean => (DOB_CONFIRM_TYPES as readonly string[]).includes(type ?? '');
export const UNREGISTERED_TYPES = ['Friends group', 'Neighbourhood group', 'Office team', 'Alumni group'] as const;
/** Types only a registered organisation may use (server rule in guard_org_verification). */
export const OFFICIAL_ONLY_TYPES: readonly string[] = ['School', 'Junior / PU college', 'College', 'University', 'Polytechnic / institute', 'ITI'];

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
  if (!doc) todo.push(cfg && !isEducation(type) ? 'Upload a registration document' : 'Upload a recognition document');
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
  const headName = isEducation(type) ? 'The Head' : `The ${head}`;
  return [
    {
      key: 'id',
      label: searchable
        ? 'Found the official ID in the public register — the name and city match'
        : 'The registration number, name and place match the certificate (this register has no public search)',
    },
    { key: 'doc', label: `The document is a genuine ${isEducation(type) ? 'recognition' : 'registration'} document for this ${noun}, with the same name` },
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
