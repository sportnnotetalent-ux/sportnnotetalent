/** Organisation verification (Phase 1 schools / colleges, Phase 2 every registered type) — data (migration
 *  20261025190000_org_verification; docs/verification/org-verification.md).
 *  Owners / Admins fill the three steps; SportnNote support decides. Demo mode
 *  keeps everything in memory (the email code is 123456). Pure rules:
 *  core/orgVerification.ts. */
import { isSupabaseConfigured, supabase } from '../core/supabase';
import { fnPath } from '../core/functionPath';
import { printSheet, type PrintOutcome } from '../core/printSheet';
import { readDocBytes, type PickedDoc } from '../core/document';
import { notify } from '../core/notifications';
import {
  authorisationLetterHtml, normOfficialId, validOfficialId,
  type Authority, type OfficialIdEntry, type OfficialIdType, type OrgVerificationState,
} from '../core/orgVerification';
import { getOrganization, VERIFICATION_DOC_MAX_BYTES } from './repos';

const live = () => isSupabaseConfigured && !!supabase;
const msg = (e: { message?: string } | null | undefined, fallback: string) => e?.message?.replace(/^.*?:\s*/, '') || fallback;

/* ------------------------------- demo store -------------------------------- */
const demoState = new Map<string, OrgVerificationState>();
const demoRegistered = new Map<string, boolean | null>();
const demoHead = new Map<string, string>(); // code → orgId
async function demoGet(orgId: string): Promise<OrgVerificationState> {
  const org = await getOrganization(orgId);
  const s = demoState.get(orgId) ?? { registered: null, verified: false, ids: [], verification: null };
  return { ...s, type: org?.type, registered: demoRegistered.has(orgId) ? demoRegistered.get(orgId)! : (org?.registered ?? null), verified: !!org?.verifiedAt };
}
function demoVerification(orgId: string): NonNullable<OrgVerificationState['verification']> {
  const s = demoState.get(orgId) ?? { registered: null, verified: false, ids: [], verification: null };
  const v = s.verification ?? { status: 'draft' as const, hasDoc: false, emailVerified: false, hasLetter: false };
  demoState.set(orgId, { ...s, verification: v });
  return v;
}

/* --------------------------------- reads ----------------------------------- */
export async function getOrgVerificationState(orgId: string): Promise<OrgVerificationState> {
  if (!live()) return demoGet(orgId);
  const { data, error } = await supabase!.rpc('org_verification_state', { p_org: orgId });
  if (error || !data) throw new Error(msg(error, 'Couldn’t load the verification — try again.'));
  return data as OrgVerificationState;
}

/** While creating: is this ID already a verified community (and how many others claim it)? */
export async function lookupOfficialId(type: OfficialIdType, value: string): Promise<{ valid: boolean; verified?: { orgId: string; name: string } | null; others?: number }> {
  if (!validOfficialId(type, value)) return { valid: false };
  if (!live()) {
    const v = normOfficialId(type, value);
    for (const [orgId, s] of demoState) {
      if (s.verified && s.ids.some((i) => i.type === type && i.value === v)) return { valid: true, verified: { orgId, name: (await getOrganization(orgId))?.name ?? 'A school' }, others: 0 };
    }
    return { valid: true, verified: null, others: 0 };
  }
  const { data } = await supabase!.rpc('org_id_lookup', { p_type: type, p_value: value });
  return (data ?? { valid: true }) as { valid: boolean; verified?: { orgId: string; name: string } | null; others?: number };
}

/* --------------------------------- writes ---------------------------------- */
/** Registered organisation or informal group (an Owner / Admin). */
export async function setOrgRegistered(orgId: string, registered: boolean): Promise<void> {
  if (!live()) {
    demoRegistered.set(orgId, registered);
    const org = await getOrganization(orgId);
    if (org) org.registered = registered;
    return;
  }
  const { error } = await supabase!.from('organizations').update({ registered }).eq('id', orgId);
  if (error) throw new Error(msg(error, 'Couldn’t save that — try again.'));
}

export async function setOfficialIds(orgId: string, ids: { type: OfficialIdType; value: string }[]): Promise<OrgVerificationState> {
  const clean = ids.map((i) => ({ type: i.type, value: normOfficialId(i.type, i.value) })).filter((i) => i.value);
  const bad = clean.find((i) => !validOfficialId(i.type, i.value));
  if (bad) throw new Error('One of the codes doesn’t look right — check it and try again.');
  if (!live()) {
    const s = await demoGet(orgId);
    demoState.set(orgId, { ...s, ids: clean.map((i): OfficialIdEntry => ({ ...i, country: 'IN', locked: false })) });
    return demoGet(orgId);
  }
  const { data, error } = await supabase!.rpc('set_org_official_ids', { p_org: orgId, p_ids: clean.map((i) => ({ ...i, country: 'IN' })) });
  if (error || !data) throw new Error(msg(error, 'Couldn’t save the codes — try again.'));
  return data as OrgVerificationState;
}

/** Upload the recognition document or the signed letter to the private
 *  verification-docs bucket ("<uploader>/org-<orgId>/…"). Returns its path. */
export async function uploadOrgFile(orgId: string, doc: PickedDoc, kind: 'doc' | 'letter'): Promise<string> {
  if (!live()) return `demo/org-${orgId}/${kind}-${Date.now()}`;
  const { data: auth } = await supabase!.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Please sign in again, then upload it.');
  const ext = (doc.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${uid}/org-${orgId}/${kind}-${Date.now()}.${ext}`;
  let file: Awaited<ReturnType<typeof readDocBytes>>;
  try { file = await readDocBytes(doc); } catch { throw new Error('Couldn’t read that file — please pick it again.'); }
  if (file.bytes.byteLength === 0) throw new Error('Couldn’t read that file — please pick it again.');
  if (file.bytes.byteLength > VERIFICATION_DOC_MAX_BYTES) throw new Error('That file is too large (max 10 MB). A photo or a smaller PDF works.');
  const { error } = await supabase!.storage.from('verification-docs').upload(path, file.bytes, {
    contentType: file.contentType, upsert: true,
  });
  if (error) throw new Error('Couldn’t upload it — check your connection and try again.');
  return path;
}

export interface OrgVerificationPatch {
  docKind?: string; docPath?: string; docName?: string;
  authority?: Authority;
  letterPath?: string; letterName?: string;
  headName?: string; headEmail?: string;
}

export async function saveOrgVerification(orgId: string, patch: OrgVerificationPatch): Promise<OrgVerificationState> {
  if (!live()) {
    const v = demoVerification(orgId);
    if (patch.docKind !== undefined) v.docKind = patch.docKind;
    if (patch.docPath !== undefined) v.hasDoc = !!patch.docPath;
    if (patch.docName !== undefined) v.docName = patch.docName;
    if (patch.authority !== undefined) v.authority = patch.authority;
    if (patch.letterPath !== undefined) v.hasLetter = !!patch.letterPath;
    if (patch.letterName !== undefined) v.letterName = patch.letterName;
    if (patch.headName !== undefined) v.headName = patch.headName;
    if (patch.headEmail !== undefined && patch.headEmail !== v.headEmail) { v.headEmail = patch.headEmail; v.headRequestedAt = null; v.headConfirmedAt = null; v.headDeclinedAt = null; }
    if (v.status === 'rejected') v.status = 'draft';
    return demoGet(orgId);
  }
  const { data, error } = await supabase!.rpc('save_org_verification', { p_org: orgId, p: patch });
  if (error || !data) throw new Error(msg(error, 'Couldn’t save that — try again.'));
  return data as OrgVerificationState;
}

/** Step 3, official email: send a 6-digit code to the address. */
export async function sendOrgEmailCode(orgId: string, email: string): Promise<{ sent: boolean; email?: string; reason?: string }> {
  if (!live()) return { sent: true, email, reason: 'Demo: the code is 123456' };
  const { data, error } = await supabase!.functions.invoke(fnPath('org-verify'), { body: { orgId, action: 'email_code', email: email.trim() } });
  const res = (data ?? {}) as { sent?: boolean; email?: string; reason?: string };
  if (error && !res.reason) return { sent: false, reason: 'Couldn’t send the code — try again.' };
  return { sent: !!res.sent, email: res.email, reason: res.reason };
}

export async function verifyOrgEmailCode(orgId: string, code: string, email?: string): Promise<OrgVerificationState> {
  if (!live()) {
    if (code.replace(/\D/g, '') !== '123456') throw new Error('That code isn’t right — check the email and try again.');
    const v = demoVerification(orgId);
    v.officialEmail = email ?? 'office@example.org'; v.emailVerified = true; v.authority = v.authority ?? 'email';
    return demoGet(orgId);
  }
  const { data, error } = await supabase!.rpc('verify_org_email_code', { p_org: orgId, p_code: code });
  if (error || !data) throw new Error(msg(error, 'That code didn’t work — try again.'));
  return data as OrgVerificationState;
}

/** Step 3, the Head confirms: email them the confirmation link. */
export async function askHeadToConfirm(orgId: string): Promise<{ sent: boolean; email?: string; reason?: string; demoCode?: string }> {
  if (!live()) {
    const code = Array.from({ length: 16 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    demoHead.set(code, orgId);
    const v = demoVerification(orgId);
    v.headRequestedAt = new Date().toISOString(); v.headConfirmedAt = null; v.headDeclinedAt = null;
    return { sent: true, email: v.headEmail ?? undefined, demoCode: code };
  }
  const { data, error } = await supabase!.functions.invoke(fnPath('org-verify'), { body: { orgId, action: 'ask_head' } });
  const res = (data ?? {}) as { sent?: boolean; email?: string; reason?: string };
  if (error && !res.reason) return { sent: false, reason: 'Couldn’t send the email — try again.' };
  return { sent: !!res.sent, email: res.email, reason: res.reason };
}

/** Send the request to SportnNote support (and alert them). */
export async function submitOrgVerification(orgId: string): Promise<OrgVerificationState> {
  if (!live()) {
    const v = demoVerification(orgId);
    v.status = 'pending'; v.submittedAt = new Date().toISOString(); v.rejectReason = null;
    const org = await getOrganization(orgId);
    if (org) org.verificationRequestedAt = v.submittedAt;
    return demoGet(orgId);
  }
  const { data, error } = await supabase!.rpc('submit_org_verification', { p_org: orgId });
  if (error || !data) throw new Error(msg(error, 'Couldn’t send it — try again.'));
  try { await supabase!.functions.invoke(fnPath('verification-submit'), { body: { orgId } }); } catch { /* the reminder job re-alerts */ }
  return data as OrgVerificationState;
}

/** The authorisation letter template, to print on letterhead. */
export async function printAuthorisationLetter(orgId: string, personName: string, ids: readonly OfficialIdEntry[]): Promise<PrintOutcome> {
  const org = await getOrganization(orgId);
  return printSheet(authorisationLetterHtml({ orgName: org?.name ?? 'the organisation', personName, ids, type: org?.type }), { autoPrint: false });
}

/* ------------------------------ the Head's page ----------------------------- */
export interface HeadPreview { orgName: string; type?: string; city?: string; ids: { type: OfficialIdType; value: string }[]; requesterName: string; headName?: string | null }

export async function previewHeadConfirm(code: string): Promise<HeadPreview> {
  const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!live()) {
    const orgId = demoHead.get(c);
    if (!orgId) throw new Error('That link isn’t valid or has expired. Ask the person to send a new one.');
    const s = await demoGet(orgId);
    return { orgName: (await getOrganization(orgId))?.name ?? 'The organisation', type: s.type, ids: s.ids, requesterName: 'Demo admin', headName: s.verification?.headName };
  }
  const { data, error } = await supabase!.rpc('org_head_preview', { p_code: c });
  if (error || !data) throw new Error(msg(error, 'That link isn’t valid or has expired.'));
  return data as HeadPreview;
}

export async function decideHeadConfirm(code: string, approve: boolean, name?: string): Promise<{ confirmed: boolean }> {
  const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!live()) {
    const orgId = demoHead.get(c);
    if (!orgId) throw new Error('That link isn’t valid or has expired.');
    const v = demoVerification(orgId);
    if (approve) { v.headConfirmedAt = new Date().toISOString(); v.headConfirmedName = name ?? null; v.headDeclinedAt = null; }
    else { v.headDeclinedAt = new Date().toISOString(); v.headConfirmedAt = null; }
    demoHead.delete(c);
    return { confirmed: approve };
  }
  const { data, error } = await supabase!.rpc('org_head_decide', { p_code: c, p_approve: approve, p_name: name ?? null });
  if (error) throw new Error(msg(error, 'Couldn’t save your answer — try again.'));
  return (data ?? { confirmed: approve }) as { confirmed: boolean };
}

/* --------------------------------- support ---------------------------------- */
export interface OrgQueueItem {
  orgId: string; name: string; type?: string; city?: string; email?: string; phone?: string;
  registered?: boolean | null; requestedAt?: string; members: number;
  ids: { type: OfficialIdType; value: string; country: string; verifiedElsewhere?: string | null; sameIdElsewhere: number }[];
  verification: null | {
    status: string; docKind?: string | null; docPath?: string | null; docName?: string | null;
    authority?: Authority | null; officialEmail?: string | null; emailVerifiedAt?: string | null;
    letterPath?: string | null; letterName?: string | null;
    headName?: string | null; headEmail?: string | null; headRequestedAt?: string | null;
    headConfirmedAt?: string | null; headConfirmedName?: string | null; headDeclinedAt?: string | null;
    submittedAt?: string | null; submitterName?: string | null; sentBackBefore?: number;
  };
}

/** Support: organisations waiting, oldest first. */
export async function getOrgVerificationQueue(): Promise<OrgQueueItem[]> {
  if (!live()) {
    const out: OrgQueueItem[] = [];
    for (const [orgId, s] of demoState) {
      if (s.verification?.status !== 'pending') continue;
      const org = await getOrganization(orgId);
      const v = s.verification;
      out.push({
        orgId, name: org?.name ?? 'Organisation', type: org?.type, city: org?.city, email: org?.email, phone: org?.phone,
        registered: true, requestedAt: v.submittedAt ?? undefined, members: org?.members.length ?? 0,
        ids: s.ids.map((i) => ({ type: i.type, value: i.value, country: 'IN', sameIdElsewhere: 0 })),
        verification: { ...v, status: v.status, docPath: v.hasDoc ? 'demo' : null, letterPath: v.hasLetter ? 'demo' : null, submitterName: 'Demo admin', sentBackBefore: 0 },
      });
    }
    return out;
  }
  const { data, error } = await supabase!.rpc('org_verification_queue');
  if (error) return [];
  return ((data ?? []) as OrgQueueItem[]).map((o) => ({ ...o, members: Number(o.members ?? 0) }));
}

/** Support: approve, or send back with a reason. The community's Owners and
 *  Admins are told. */
export async function decideOrgVerification(orgId: string, approve: boolean, reason?: string, checks?: Record<string, boolean>): Promise<void> {
  if (!live()) {
    const v = demoVerification(orgId);
    v.status = approve ? 'approved' : 'rejected'; v.rejectReason = approve ? null : reason ?? null;
    const s = demoState.get(orgId)!;
    demoState.set(orgId, { ...s, verified: approve, ids: s.ids.map((i) => ({ ...i, locked: approve })) });
    const org = await getOrganization(orgId);
    if (org) { if (approve) org.verifiedAt = new Date().toISOString(); org.verificationRequestedAt = undefined; }
    return;
  }
  const { error } = await supabase!.rpc('decide_org_verification', { p_org: orgId, p_approve: approve, p_reason: reason ?? null, p_checks: checks ?? null });
  if (error) throw new Error(msg(error, 'Couldn’t save the decision — try again.'));
  const org = await getOrganization(orgId).catch(() => null);
  const admins = (org?.members ?? []).filter((m) => !m.until && (m.role === 'Owner' || m.role === 'Admin'));
  for (const m of admins) {
    void notify({
      playerId: m.playerId,
      title: approve ? `✓ ${org?.name ?? 'Your organisation'} is verified` : `${org?.name ?? 'Your organisation'}’s verification was sent back`,
      body: approve
        ? 'SportnNote checked it. The ✓ shows on your community, and you can now confirm members’ dates of birth.'
        : `Reason: ${reason ?? 'see the community page'}. Fix it and send it again from the community page.`,
    });
  }
}
