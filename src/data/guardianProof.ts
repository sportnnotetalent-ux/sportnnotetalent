/**
 * CL-03 parental proof — talking to the server (migration
 * 20261029140000_parental_proof.sql, edge function guardian-proof). The parent
 * uploads two files into their own folder of the private verification-docs
 * bucket, then submits; a reviewer decides. Demo mode has no proofs.
 */
import { isSupabaseConfigured, supabase } from '../core/supabase';
import { fnPath } from '../core/functionPath';
import { readDocBytes, type PickedDoc } from '../core/document';
import { guardianDocPath, PROOF_DOC_MAX_BYTES, type ProofStatus, type Relationship } from '../core/guardianProof';

const live = () => isSupabaseConfigured && !!supabase;
const message = (error: unknown) =>
  (error as { message?: string } | null)?.message || 'Something went wrong — check your connection and try again.';

/** Best effort: tell people (the database has already recorded it). */
async function notify(action: 'submitted' | 'decided', proofId: string): Promise<void> {
  try { await supabase!.functions.invoke(fnPath('guardian-proof'), { body: { action, proofId } }); }
  catch (e) { console.warn('guardian-proof notify failed:', e); }
}

/** Which child a link is for (signed in). */
export async function guardianProofChild(code: string): Promise<string> {
  if (!live()) throw new Error('Sign in to a real account to approve.');
  const { data, error } = await supabase!.rpc('guardian_proof_child', { p_code: code });
  if (error) throw new Error(message(error));
  return data as string;
}

async function upload(childProfileId: string, kind: 'id' | 'relation', doc: PickedDoc): Promise<string> {
  const { data: auth } = await supabase!.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Please sign in again, then send the documents.');
  let file: Awaited<ReturnType<typeof readDocBytes>>;
  try { file = await readDocBytes(doc); } catch { throw new Error(`Couldn’t read “${doc.name}” — please pick it again.`); }
  if (file.bytes.byteLength === 0) throw new Error(`Couldn’t read “${doc.name}” — please pick it again.`);
  if (file.bytes.byteLength > PROOF_DOC_MAX_BYTES) throw new Error(`“${doc.name}” is too large (max 10 MB). A photo or a smaller PDF works.`);
  const path = guardianDocPath(uid, childProfileId, kind, doc.name, Date.now());
  const { error } = await supabase!.storage.from('verification-docs').upload(path, file.bytes, { contentType: file.contentType, upsert: false });
  if (error) throw new Error('Couldn’t upload the document — check your connection and try again.');
  return path;
}

/** Upload both files and send them for review. `code` is the link's code; null
 *  when the same parent resends after a rejection. Returns the proof's id. */
export async function submitGuardianProof(o: {
  code: string | null; childProfileId: string; relationship: Relationship; name: string;
  idDoc: PickedDoc; relationDoc: PickedDoc; dobConfirmed: boolean;
}): Promise<string> {
  if (!live()) throw new Error('Sign in to a real account to approve.');
  const idPath = await upload(o.childProfileId, 'id', o.idDoc);
  const relationPath = await upload(o.childProfileId, 'relation', o.relationDoc);
  const { data, error } = await supabase!.rpc('guardian_proof_submit', {
    p_code: o.code, p_child: o.childProfileId, p_relationship: o.relationship, p_name: o.name.trim(),
    p_id_path: idPath, p_relation_path: relationPath, p_dob_confirmed: o.dobConfirmed,
  });
  if (error) throw new Error(message(error));
  await notify('submitted', data as string);
  return data as string;
}

export interface ProofState { id: string; status: ProofStatus; reason: string | null; submittedAt: string; reviewedAt: string | null }

/** The child's own: where their parent's proof stands (null before any). */
export async function myGuardianProofStatus(): Promise<ProofState | null> {
  if (!live()) return null;
  const { data, error } = await supabase!.rpc('my_guardian_proof_status');
  if (error || !data) return null;
  return data as ProofState;
}

export interface MyGuardianProof { id: string; childProfileId: string; childName: string; status: ProofStatus; reason: string | null; submittedAt: string; reviewedAt: string | null }

/** The parent's own submissions, newest first. */
export async function myGuardianProofs(): Promise<MyGuardianProof[]> {
  if (!live()) return [];
  const { data, error } = await supabase!.rpc('my_guardian_proofs');
  if (error || !data) return [];
  return (data as Record<string, string | null>[]).map((r) => ({
    id: r.id!, childProfileId: r.child_profile_id!, childName: r.child_name ?? '', status: r.status as ProofStatus,
    reason: r.reason, submittedAt: r.submitted_at!, reviewedAt: r.reviewed_at,
  }));
}

export interface PendingGuardianProof {
  id: string; childProfileId: string; childName: string; childDob: string | null; relationship: Relationship;
  nameOnId: string; guardianAccountName: string; dobConfirmed: boolean; idPath: string | null; relationPath: string | null;
  submittedAt: string; claimedBy: string | null; claimedByName: string | null; claimedAt: string | null;
}

/** The reviewers' queue (reviewers only). */
export async function pendingGuardianProofs(): Promise<PendingGuardianProof[]> {
  if (!live()) return [];
  const { data, error } = await supabase!.rpc('pending_guardian_proofs');
  if (error) throw new Error(message(error));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, childProfileId: r.child_profile_id as string, childName: (r.child_name as string) ?? '',
    childDob: (r.child_dob as string | null) ?? null, relationship: r.relationship as Relationship, nameOnId: r.name_on_id as string,
    guardianAccountName: (r.guardian_account_name as string) ?? '', dobConfirmed: !!r.dob_confirmed,
    idPath: (r.id_path as string | null) ?? null, relationPath: (r.relation_path as string | null) ?? null,
    submittedAt: r.submitted_at as string, claimedBy: (r.claimed_by as string | null) ?? null,
    claimedByName: (r.claimed_by_name as string | null) ?? null, claimedAt: (r.claimed_at as string | null) ?? null,
  }));
}

/** A reviewer approves, or rejects with a reason; the parent and child are told. */
export async function decideGuardianProof(id: string, approve: boolean, reason?: string): Promise<void> {
  if (!live()) throw new Error('Not available in demo mode.');
  const { error } = await supabase!.rpc('decide_guardian_proof', { p_proof: id, p_approve: approve, p_reason: reason?.trim() || null });
  if (error) throw new Error(message(error));
  await notify('decided', id);
}

/** "I'll check this" — like age and organisation checks. */
export async function claimGuardianProof(id: string, takeOver = false): Promise<void> {
  if (!live()) return;
  const { error } = await supabase!.rpc('claim_support_item', { p_kind: 'guardian', p_ref: id, p_take_over: takeOver });
  if (error) throw new Error(message(error));
}
