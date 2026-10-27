/** Support console (2026-10-27) — the overview, claims and this week's reviews
 *  (support_overview / claim_support_item / release_support_item, migration
 *  20261027170000_support_console). The rules are pure: core/supportConsole.ts. */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import type { ClaimKind, SupportClaim } from '../core/supportConsole';
import { getPendingVerifications } from './repos';
import { getOrgVerificationQueue } from './orgVerification';
import { getMessageReports } from './messages';

const live = () => isSupabaseConfigured && !!supabase;

export interface QueueStat { waiting: number; oldest?: number; overDay: number }
export interface WeekRow { by?: string; name: string; orgs: number; age: number; reports: number }
export interface SupportOverview {
  /** support only (a reviewer sees age proofs) */
  orgs?: QueueStat;
  age: QueueStat;
  reports?: QueueStat;
  claims: SupportClaim[];
  week?: WeekRow[];
}

const DAY = 24 * 3_600_000;
const missing = (code?: string) => ['PGRST202', '42883', '42P01', 'PGRST205'].includes(code ?? '');
const stat = (raw: unknown): QueueStat | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { waiting?: number; oldest?: string | number | null; overDay?: number };
  const oldest = typeof r.oldest === 'number' ? r.oldest : r.oldest ? Date.parse(r.oldest) : undefined;
  return { waiting: Number(r.waiting ?? 0), overDay: Number(r.overDay ?? 0), ...(oldest && !Number.isNaN(oldest) ? { oldest } : {}) };
};
const statOf = (times: (number | undefined)[]): QueueStat => {
  const ts = times.filter((t): t is number => t != null);
  return { waiting: times.length, overDay: ts.filter((t) => Date.now() - t >= DAY).length, ...(ts.length ? { oldest: Math.min(...ts) } : {}) };
};

/* ------------------------------ demo claims ------------------------------ */
const demoClaims = new Map<string, SupportClaim>();
const demoKey = (kind: ClaimKind, ref: string) => `${kind}:${ref}`;

/** 'needs-update' = the console's migration hasn't run yet. */
export async function getSupportOverview(): Promise<SupportOverview | 'needs-update'> {
  if (!live()) {
    const [orgs, age, reports] = await Promise.all([
      getOrgVerificationQueue().catch(() => []),
      getPendingVerifications().catch(() => []),
      getMessageReports('open').catch(() => []),
    ]);
    return {
      orgs: statOf(orgs.map((o) => (o.requestedAt ? Date.parse(o.requestedAt) : undefined))),
      age: statOf(age.map((p) => p.submittedAt)),
      reports: statOf(reports.map((r) => (r.createdAt ? Date.parse(r.createdAt) : undefined))),
      claims: [...demoClaims.values()],
      week: [],
    };
  }
  const { data, error } = await supabase!.rpc('support_overview');
  if (error && missing(error.code)) return 'needs-update';
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    orgs: stat(d.orgs),
    age: stat(d.age) ?? { waiting: 0, overDay: 0 },
    reports: stat(d.reports),
    claims: Array.isArray(d.claims) ? (d.claims as SupportClaim[]).map((c) => ({ ...c, ref: String(c.ref), at: String(c.at) })) : [],
    week: Array.isArray(d.week) ? (d.week as WeekRow[]).map((w) => ({ ...w, orgs: Number(w.orgs), age: Number(w.age), reports: Number(w.reports) })) : undefined,
  };
}

/** "✋ I'll check this". Someone else's fresh claim → an error naming them,
 *  unless `takeOver`. */
export async function claimItem(kind: ClaimKind, ref: string, takeOver = false, me?: { id?: string; name?: string }): Promise<SupportClaim> {
  if (!live()) {
    const cur = demoClaims.get(demoKey(kind, ref));
    if (cur && cur.by !== me?.id && Date.now() - Date.parse(cur.at) < 2 * 3_600_000 && !takeOver) throw new Error(`Being checked by ${cur.byName}`);
    const c: SupportClaim = { kind, ref, by: me?.id ?? 'me', byName: me?.name ?? 'You', at: new Date().toISOString() };
    demoClaims.set(demoKey(kind, ref), c);
    return c;
  }
  const { data, error } = await supabase!.rpc('claim_support_item', { p_kind: kind, p_ref: ref, p_take_over: takeOver });
  if (error) throw new Error(missing(error.code) ? 'Claiming needs a server update first.' : error.message);
  const c = data as SupportClaim;
  return { ...c, ref: String(c.ref), at: String(c.at) };
}

export async function releaseItem(kind: ClaimKind, ref: string): Promise<void> {
  if (!live()) { demoClaims.delete(demoKey(kind, ref)); return; }
  const { error } = await supabase!.rpc('release_support_item', { p_kind: kind, p_ref: ref });
  if (error && !missing(error.code)) throw new Error(error.message);
}

/** Demo mode: a decision releases the claim, as the server does. */
export function releaseDemoClaim(kind: ClaimKind, ref: string): void {
  if (!live()) demoClaims.delete(demoKey(kind, ref));
}
