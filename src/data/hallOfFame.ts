/** School hall of fame — data (migration 20261025130000_hall_of_fame). The
 *  server returns player ids only; names come from players_view (a possible
 *  minor is initials to the public). Demo mode builds it from the demo stores.
 *  Pure parts: core/hallOfFame.ts. */
import { isSupabaseConfigured, supabase } from '../core/supabase';
import { APP_URL } from '../core/hosts';
import { printSheet, type PrintOutcome } from '../core/printSheet';
import { canManageOrg } from '../core/org';
import { hallEntries, hallHtml, type HallCert, type HallEntry, type HallHosted, type HallManual, type HonourKind, type HonourLevel } from '../core/hallOfFame';
import { getSportMeta } from '../sports/sportMeta';
import type { SportId } from '../core/types';
import { getMyCertificates } from './certificates';
import { getMyPlayerId, getOrganization, getPlayerNamesById, getTournaments } from './repos';

const live = () => isSupabaseConfigured && !!supabase;
const demoPublic = new Set<string>();
const demoManual = new Map<string, HallManual[]>(); // orgId → honours

export interface Hall {
  found: boolean;
  org?: { id: string; name: string; type?: string; city?: string; logoUrl?: string; verified: boolean };
  /** published: anyone with the link */
  public: boolean;
  /** an Owner / Admin: publish, add / edit honours */
  canEdit: boolean;
  member: boolean;
  /** false: not published and the viewer isn't a member (header only) */
  visible: boolean;
  entries: HallEntry[];
  hosted: HallHosted[];
  /** names as this viewer may see them */
  names: Map<string, string>;
}

const empty = (): Hall => ({ found: false, public: false, canEdit: false, member: false, visible: false, entries: [], hosted: [], names: new Map() });

export async function getHallOfFame(orgId: string): Promise<Hall> {
  if (!live()) return demoHall(orgId);
  const { data, error } = await supabase!.rpc('org_hall_of_fame', { p_org: orgId });
  if (error) throw new Error('Couldn’t open the hall of fame just now — try again.');
  const d = (data ?? {}) as {
    found?: boolean; org?: Hall['org']; public?: boolean; canEdit?: boolean; member?: boolean; visible?: boolean;
    certs?: HallCert[]; manual?: HallManual[]; hosted?: HallHosted[];
  };
  if (!d.found) return empty();
  const entries = hallEntries(d.certs ?? [], d.manual ?? []);
  return {
    found: true, org: d.org, public: !!d.public, canEdit: !!d.canEdit, member: !!d.member, visible: !!d.visible,
    entries, hosted: d.hosted ?? [], names: await getPlayerNamesById(entries.flatMap((e) => e.playerIds)),
  };
}

async function demoHall(orgId: string): Promise<Hall> {
  const [org, me, certs, tours] = await Promise.all([getOrganization(orgId), getMyPlayerId(), getMyCertificates(), getTournaments()]);
  if (!org) return empty();
  const byTour = new Map(tours.map((t) => [t.id, t]));
  const memberAt = (pid: string, date: string) => org.members.some((m) =>
    m.playerId === pid && (!m.since || m.since <= date) && (!m.until || m.until >= date));
  const rows: HallCert[] = certs
    .filter((c) => !c.revokedAt && c.kind !== 'participation')
    .map((c) => ({ c, date: c.eventDate ?? c.issuedAt.slice(0, 10), t: byTour.get((c as { tournamentId?: string }).tournamentId ?? '') }))
    .filter(({ c, date }) => memberAt(c.playerId, date))
    .map(({ c, date, t }) => ({
      kind: c.kind, title: c.title, detail: c.detail, sport: c.sport, teamName: c.teamName, date,
      tournamentId: t?.id, tournament: t?.name ?? c.tournament, home: !!t && t.hostOrgId === orgId, playerId: c.playerId,
    }));
  const entries = hallEntries(rows, demoManual.get(orgId) ?? []);
  const canEdit = canManageOrg(org, me);
  return {
    found: true,
    org: { id: org.id, name: org.name, type: org.type, city: org.city, logoUrl: org.logoUrl, verified: !!org.verifiedAt },
    public: demoPublic.has(orgId), canEdit, member: org.members.some((m) => m.playerId === me), visible: true,
    entries,
    hosted: tours.filter((t) => t.hostOrgId === orgId).map((t) => ({ id: t.id, name: t.name, sports: t.sports, startDate: t.startDate, endDate: t.endDate })),
    names: await getPlayerNamesById(entries.flatMap((e) => e.playerIds)),
  };
}

const rpcError = (e: { message?: string } | null, fallback: string): Error =>
  new Error(/owners and admins|title|year|60 students/i.test(e?.message ?? '') ? e!.message! : fallback);

export async function setHallPublic(orgId: string, on: boolean): Promise<void> {
  if (!live()) { if (on) demoPublic.add(orgId); else demoPublic.delete(orgId); return; }
  const { error } = await supabase!.rpc('set_hall_public', { p_org: orgId, p_public: on });
  if (error) throw rpcError(error, 'Couldn’t change it — try again.');
}

export interface HonourDraft {
  year: number;
  kind: HonourKind;
  title: string;
  sport?: string;
  level?: HonourLevel;
  teamLabel?: string;
  playerIds: string[];
  note?: string;
}

/** Add (no id) or edit an honour the school records itself. */
export async function saveHonour(orgId: string, draft: HonourDraft, id?: string): Promise<string> {
  const clean = { ...draft, title: draft.title.trim(), teamLabel: draft.teamLabel?.trim() || undefined, note: draft.note?.trim() || undefined };
  if (!live()) {
    const list = demoManual.get(orgId) ?? [];
    const hid = id ?? `h-${Date.now().toString(36)}`;
    const row: HallManual = { id: hid, ...clean };
    demoManual.set(orgId, id ? list.map((h) => (h.id === id ? row : h)) : [row, ...list]);
    return hid;
  }
  const { data, error } = await supabase!.rpc('save_org_honour', { p_org: orgId, p_id: id ?? null, p: clean });
  if (error || !data) throw rpcError(error, 'Couldn’t save it — try again.');
  return String(data);
}

export async function deleteHonour(orgId: string, id: string): Promise<void> {
  if (!live()) { demoManual.set(orgId, (demoManual.get(orgId) ?? []).filter((h) => h.id !== id)); return; }
  const { error } = await supabase!.rpc('delete_org_honour', { p_id: id });
  if (error) throw rpcError(error, 'Couldn’t remove it — try again.');
}

export const sportName = (id: string): string => {
  try { return getSportMeta(id as SportId)?.name ?? id; } catch { return id; }
};

/** The printable honours board (names as this viewer sees them). */
export function printHall(h: Hall, entries: readonly HallEntry[]): Promise<PrintOutcome> {
  return printSheet(hallHtml({
    orgName: h.org?.name ?? 'Hall of fame', orgId: h.org?.id ?? '', appUrl: APP_URL, verified: h.org?.verified, city: h.org?.city,
    entries, hostedCount: h.hosted.length, nameOf: (id) => h.names.get(id), sportName,
  }), { autoPrint: false });
}
