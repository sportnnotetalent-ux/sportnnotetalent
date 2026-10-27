/**
 * Student lists (2026-10-27) — the reads and writes behind the school's bulk
 * upload. The plan is pure: data/studentList.ts. Server: migration
 * 20261028100000_student_lists (org_roster_match, org_member_ids) and the
 * edge function school-parent-request. Demo mode answers from the local store.
 */
import { isSupabaseConfigured, supabase } from '../core/supabase';
import { fnPath } from '../core/functionPath';
import type { Organization, Player } from '../core/types';
import { createPlayer, getOrganization, getPlayers, updatePlayer, upsertOrgMembers } from './repos';
import { demo } from './demoStore';
import { MATCH_CHUNK, PARENT_CHUNK, matchLocally, membersAfter, type MatchInput, type RowMatch, type StudentPlan } from './studentList';

const live = () => isSupabaseConfigured && !!supabase;

/** Demo: admission numbers, per school (saved with the rest of the demo). */
const demoAdmission = {
  get: (orgId: string) => demo.orgAdmissionNos[orgId],
  set: (orgId: string, v: Record<string, string>) => { demo.orgAdmissionNos = { ...demo.orgAdmissionNos, [orgId]: v }; },
};

const NEEDS_DB = 'Recognising existing students needs a database update — ask SportnNote support.';
const message = (e: unknown, fallback: string) => {
  const m = (e as { message?: string } | null)?.message ?? '';
  if (/org_roster_match|org_member_ids|does not exist|schema cache/i.test(m)) return NEEDS_DB;
  return m || fallback;
};

/** The school's admission numbers (Owners / Admins only), by player id. */
export async function getAdmissionNos(orgId: string): Promise<Record<string, string>> {
  if (!live()) return { ...(demoAdmission.get(orgId) ?? {}) };
  const { data, error } = await supabase!.from('org_member_ids').select('player_id, admission_no').eq('org_id', orgId);
  if (error) return {};
  return Object.fromEntries(((data ?? []) as { player_id: string; admission_no: string }[]).map((r) => [r.player_id, r.admission_no]));
}

/** Save admission numbers; returns the ones another student already has. */
export async function saveAdmissionNos(orgId: string, items: { playerId: string; admissionNo: string }[]): Promise<string[]> {
  const taken: string[] = [];
  if (!items.length) return taken;
  // SL-20: the numbers being moved are freed first, so two students can swap.
  const moving = items.map((it) => it.playerId);
  if (!live()) {
    const cur = { ...(demoAdmission.get(orgId) ?? {}) };
    for (const pid of moving) delete cur[pid];
    for (const it of items) {
      const owner = Object.entries(cur).find(([pid, a]) => pid !== it.playerId && a.toUpperCase() === it.admissionNo.toUpperCase());
      if (owner) taken.push(it.admissionNo); else cur[it.playerId] = it.admissionNo;
    }
    demoAdmission.set(orgId, cur);
    return taken;
  }
  await supabase!.from('org_member_ids').delete().eq('org_id', orgId).in('player_id', moving);
  // One at a time, so a number already in use stops only its own row.
  for (const it of items) {
    const { error } = await supabase!.from('org_member_ids')
      .upsert({ org_id: orgId, player_id: it.playerId, admission_no: it.admissionNo, updated_at: new Date().toISOString() }, { onConflict: 'org_id,player_id' });
    if (error) taken.push(it.admissionNo);
  }
  return taken;
}

const contactsOf = (p: Player): string[] =>
  [p.guardian?.email, p.guardian?.phone, p.email, p.phone].filter((x): x is string => !!x).map((x) => (x.includes('@') ? x.toLowerCase() : x));

/** Which rows are students the school has, children elsewhere, or new. */
export async function matchStudents(org: Organization, rows: MatchInput[]): Promise<RowMatch[]> {
  if (!rows.length) return [];
  if (!live()) {
    const players = await getPlayers();
    const byId = new Map(players.map((p) => [p.id, p]));
    const memberIds = new Set(org.members.map((m) => m.playerId));
    const members = org.members.flatMap((m) => {
      const p = byId.get(m.playerId);
      return p ? [{ id: p.id, fullName: p.fullName, dob: p.dob, contacts: contactsOf(p), left: !!m.until }] : [];
    });
    const others = players.filter((p) => !memberIds.has(p.id)).map((p) => ({ id: p.id, fullName: p.fullName, dob: p.dob, contacts: contactsOf(p) }));
    return matchLocally(rows, members, others, demoAdmission.get(org.id) ?? {}, { verified: !!org.verifiedAt });
  }
  const out: RowMatch[] = [];
  // SL-07: 500 rows a call keeps a big school's first list inside the time limit.
  for (let k = 0; k < rows.length; k += MATCH_CHUNK) {
    const part = rows.slice(k, k + MATCH_CHUNK).map(({ standard: _s, house: _h, ...r }) => r);
    const { data, error } = await supabase!.rpc('org_roster_match', { p_org: org.id, p_rows: part });
    if (error) throw new Error(message(error, 'Couldn’t check the list — try again.'));
    out.push(...((data ?? []) as RowMatch[]));
  }
  return out;
}

/** Ask the parents of children already on SportnNote outside the school. */
export async function askParents(orgId: string, rows: MatchInput[]): Promise<{ invited: number; emailed: number }> {
  if (!rows.length) return { invited: 0, emailed: 0 };
  if (!live()) return { invited: rows.length, emailed: 0 };
  let invited = 0, emailed = 0;
  // SL-18: 100 children a call, so every email goes out inside the function's time limit.
  for (let k = 0; k < rows.length; k += PARENT_CHUNK) {
    const { data, error } = await supabase!.functions.invoke(fnPath('school-parent-request'), { body: { orgId, rows: rows.slice(k, k + PARENT_CHUNK) } });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
      throw new Error((body as { error?: string } | null)?.error ?? 'Couldn’t ask the parents just now — the rest of the list was saved.');
    }
    invited += (data as { invited?: number })?.invited ?? 0;
    emailed += (data as { emailed?: number })?.emailed ?? 0;
  }
  return { invited, emailed };
}

export interface ApplyResult {
  created: number;
  moved: number;
  updated: number;
  rejoined: number;
  left: number;
  asked: number;
  emailed: number;
  failed: string[];
  admissionTaken: string[];
  parentError?: string;
}

/** Carry out a plan: create the new students, update the school's member list,
 *  save admission numbers, and ask the parents of children found elsewhere. */
export async function applyStudentList(org: Organization, plan: StudentPlan, inputs: MatchInput[], opts: { today: string; markLeft: boolean }): Promise<ApplyResult> {
  const failed: string[] = [];
  const created: { line: number; playerId: string }[] = [];
  for (const p of plan.rows.filter((x) => x.action === 'new')) {
    const r = p.row;
    try {
      const pl = await createPlayer({ fullName: r.fullName, houseName: r.house, jerseyNo: r.jersey, sports: [] });
      // Private details: DOB, gender and the PARENT's contact (never the child's own phone / email)
      const patch: Parameters<typeof updatePlayer>[1] = {};
      if (r.dob) patch.dob = r.dob;
      if (r.gender) patch.gender = r.gender;
      if (r.guardian) patch.guardian = r.guardian;
      if (Object.keys(patch).length) await updatePlayer(pl.id, patch).catch(() => { failed.push(`${r.fullName} (details)`); });
      // SL-09: at the school at once — a failure later can't leave a profile
      // the next try wouldn't find (and create again).
      await upsertOrgMembers(org.id, [{ playerId: pl.id, role: 'Member', since: opts.today,
        ...(p.standard ? { grades: [{ standard: p.standard, since: opts.today }] } : {}),
        ...(p.house ? { houses: [{ house: p.house, since: opts.today }] } : {}) }]);
      created.push({ line: r.line, playerId: pl.id });
    } catch { failed.push(r.fullName); }
  }
  // Re-read the members, then write only the rows this list changes (SL-08:
  // never the whole list — that deleted a member added by someone else meanwhile).
  const fresh = (await getOrganization(org.id)) ?? org;
  const before = new Map(fresh.members.map((m) => [m.playerId, JSON.stringify(m)]));
  const next = membersAfter(fresh.members, plan, created, opts.today, opts.markLeft);
  await upsertOrgMembers(org.id, next.filter((m) => before.get(m.playerId) !== JSON.stringify(m)));

  const ids = new Map(created.map((c) => [c.line, c.playerId]));
  const adm = plan.rows.flatMap((p) => {
    const pid = p.action === 'new' ? ids.get(p.row.line) : ['move', 'update', 'same', 'rejoin'].includes(p.action) ? p.playerId : undefined;
    return pid && p.admissionNo ? [{ playerId: pid, admissionNo: p.admissionNo }] : [];
  });
  const current = await getAdmissionNos(org.id);
  const admissionTaken = await saveAdmissionNos(org.id, adm.filter((a) => (current[a.playerId] ?? '').toUpperCase() !== a.admissionNo.toUpperCase()));

  const parentLines = new Set(plan.rows.filter((p) => p.action === 'parent').map((p) => p.row.line));
  let asked = 0, emailed = 0, parentError: string | undefined;
  try {
    const res = await askParents(org.id, inputs.filter((x) => parentLines.has(x.i)));
    asked = res.invited; emailed = res.emailed;
  } catch (e) { parentError = e instanceof Error ? e.message : 'Couldn’t ask the parents just now.'; }

  const count = (a: string) => plan.rows.filter((p) => p.action === a).length;
  return {
    created: created.length, moved: count('move'), updated: count('update'), rejoined: count('rejoin'),
    left: opts.markLeft ? plan.leavers.length : 0, asked, emailed, failed, admissionTaken, ...(parentError ? { parentError } : {}),
  };
}

/* ------------------------------ the parent's page ------------------------------ */

export interface SchoolRequestPreview {
  school: string;
  schoolVerified?: boolean;
  city?: string;
  childFirstName?: string;
  standard?: string;
  house?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  expiresAt?: string;
  adult?: boolean;
}

/** What a school's emailed request is about (public: no account needed). */
export async function previewSchoolRequest(code: string): Promise<SchoolRequestPreview> {
  if (!live()) {
    if (code.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === 'DEMO') {
      return { school: 'Greenwood High', schoolVerified: true, city: 'Bengaluru', childFirstName: 'Asha', standard: 'Class 7-B', house: 'Red', status: 'pending', expiresAt: new Date(Date.now() + 30 * 864e5).toISOString() };
    }
    throw new Error('That link or code isn’t valid. (Demo: use the code DEMO.)');
  }
  const { data, error } = await supabase!.rpc('school_request_preview', { p_code: code });
  if (error) throw new Error(error.message || 'Something went wrong — check your connection and try again.');
  return data as SchoolRequestPreview;
}

/** The parent's (or adult student's) answer. */
export async function decideSchoolRequest(code: string, approve: boolean): Promise<string> {
  if (!live()) return approve ? 'accepted' : 'rejected';
  const { data, error } = await supabase!.rpc('school_request_decide', { p_code: code, p_approve: approve });
  if (error) throw new Error(error.message || 'Something went wrong — check your connection and try again.');
  return String(data);
}
