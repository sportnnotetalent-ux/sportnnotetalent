/**
 * Run it again / copy a tournament (2026-10-27) — the reads and writes. The
 * plan (what comes across, the dates, the programme) is pure:
 * tournamentCopyPlan.ts.
 */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { notify } from '../core/notifications';
import type { Tournament, TournamentEntry } from '../core/types';
import { demo } from './demoStore';
import {
  addTournamentTeams, createTournament, getTeamLeaders, getTournamentCategories, getTournamentEntries, getTournaments, setTournamentAgeVerification,
} from './repos';
import { getResultsPhases } from './resultsStore';
import { copyFormats, editionList, shiftProgrammeDays, type CopyPlan, type CopySource, type EditionRow } from './tournamentCopyPlan';

const live = () => isSupabaseConfigured && !!supabase;

/** Everything the copy reads from the source: the tournament, its age groups
 *  and its meet events (the entries are read only for "invite last year's teams"). */
export async function loadCopySource(tournamentId: string): Promise<CopySource & { entries: TournamentEntry[] }> {
  const tournament = (await getTournaments({ includeDeleted: true })).find((t) => t.id === tournamentId);
  if (!tournament) throw new Error('Tournament not found.');
  const [categories, phases, entries] = await Promise.all([
    getTournamentCategories(tournamentId).catch(() => []),
    getResultsPhases({ tournamentId }).catch(() => []),
    getTournamentEntries(tournamentId).catch(() => [] as TournamentEntry[]),
  ]);
  return { tournament, categories, phases, entries };
}

export interface CopyResult {
  id: string;
  /** false = linked editions need the database update (the copy was still made) */
  editionLinked: boolean;
  invited: number;
  /** false = banner, venues and contact save after the database update */
  profileSaved: boolean;
}

/**
 * Create the copy. `invite` (next edition only): last year's teams, invited
 * into the same age group — each captain accepts, as with any invite.
 */
export async function copyTournament(src: CopySource & { entries?: TournamentEntry[] }, plan: CopyPlan, opts: {
  name: string;
  startDate: string;
  endDate: string;
  hostName: string;
  hostOrgId?: string;
  coHostIds?: string[];
  invite?: boolean;
}): Promise<CopyResult> {
  const prev = src.tournament;
  const next = plan.mode === 'next';
  // Dates the organiser changed move the registration deadline with them.
  const shiftDays = Math.round((Date.parse(`${opts.startDate}T00:00:00Z`) - Date.parse(`${plan.startDate}T00:00:00Z`)) / 86_400_000);
  const deadline = plan.fields.registrationDeadline && shiftDays
    ? new Date(Date.parse(plan.fields.registrationDeadline) + shiftDays * 86_400_000).toISOString()
    : plan.fields.registrationDeadline;
  // …and the events' timetable slots.
  const formats = shiftDays ? copyFormats(prev.formats, { records: next, programme: shiftProgrammeDays(plan.programme, shiftDays) }) : plan.fields.formats;
  const created = await createTournament({
    ...plan.fields,
    formats,
    registrationDeadline: deadline,
    name: opts.name.trim(),
    hostName: opts.hostName,
    hostOrgId: opts.hostOrgId,
    coHostIds: opts.coHostIds,
    startDate: opts.startDate,
    endDate: opts.endDate,
    // Registration opens when the organiser is ready, not the moment it's copied.
    isOpen: false,
    categories: plan.categories.length ? plan.categories : undefined,
    ...(next ? { previousEditionId: prev.id } : {}),
  });
  if (plan.ageVerification) {
    try { await setTournamentAgeVerification(created.id, plan.ageVerification); } catch { /* before the age-requirement migration: the organiser sets it again */ }
  }
  let invited = 0;
  if (next && opts.invite && src.entries?.length) invited = await inviteTeams(created.id, created.name, src);
  return { id: created.id, editionLinked: !next || created.editionLinked !== false, invited, profileSaved: created.profileSaved !== false };
}

/** Invite last year's confirmed teams, each into the age group with the same
 *  name, and let every captain know. */
async function inviteTeams(tournamentId: string, name: string, src: CopySource & { entries?: TournamentEntry[] }): Promise<number> {
  const teams = (src.entries ?? []).filter((e) => e.status === 'confirmed');
  if (!teams.length) return 0;
  const newCats = await getTournamentCategories(tournamentId).catch(() => []);
  const labelOf = new Map(src.categories.map((c) => [c.id, c.label]));
  const catFor = (oldId?: string) => (oldId ? newCats.find((c) => c.label === labelOf.get(oldId))?.id : undefined);
  const byCat = new Map<string, string[]>();
  for (const e of teams) {
    const k = catFor(e.categoryId) ?? '';
    byCat.set(k, [...(byCat.get(k) ?? []), e.team.id]);
  }
  for (const [cat, ids] of byCat) await addTournamentTeams(tournamentId, ids, 'invited', cat || undefined);
  for (const e of teams) {
    void getTeamLeaders(e.team.id).then(({ captainId }) => {
      if (captainId) void notify({ title: `📨 You're invited — ${name}`, body: `${e.team.name} played last time. Open the tournament to accept.`, playerId: captainId });
    }).catch(() => {});
  }
  return teams.length;
}

/** Every edition of the series this tournament belongs to (oldest first).
 *  Empty before the editions migration, or when it's a one-off. */
export async function getEditions(t: Pick<Tournament, 'id' | 'name' | 'startDate' | 'deletedAt' | 'previousEditionId' | 'firstEditionId'>): Promise<(EditionRow & { label: string })[]> {
  if (!live()) {
    const root = t.firstEditionId ?? t.id;
    const rows = demo.tournaments.filter((x) => x.id === root || x.firstEditionId === root);
    return rows.length > 1 ? editionList(rows) : [];
  }
  type Row = { id: string; name: string; start_date: string; deleted_at?: string | null; first_edition_id?: string | null };
  const series = (root: string) => supabase!.from('tournaments')
    .select('id, name, start_date, deleted_at, first_edition_id')
    .or(`id.eq.${root},first_edition_id.eq.${root}`)
    .order('start_date', { ascending: true })
    .limit(100);
  // Read as if this is the first edition (most are); a later edition reads its series' first.
  let { data, error } = await series(t.id);
  if (error || !data) return [];
  const root = (data as Row[]).find((r) => r.id === t.id)?.first_edition_id;
  if (root) ({ data, error } = await series(root));
  if (error || !data) return [];
  const rows = (data as Row[]).map((r) => ({ id: r.id, name: r.name, startDate: r.start_date, deletedAt: r.deleted_at ?? null }));
  return rows.length > 1 ? editionList(rows) : [];
}
