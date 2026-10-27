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
  addTournamentTeams, createTournament, getTeamLeaders, getTournamentCategories, getTournamentEntries, getTournaments, logActivity, setTournamentAgeVerification,
  NeedsDbUpdateError,
} from './repos';
import { getResultsPhases } from './resultsStore';
import { getFieldEntries, getFieldEvents } from './golf';
import { copyFormats, editionList, shiftGolfRoundDays, shiftProgrammeDays, type CopyPlan, type CopySource, type EditionRow } from './tournamentCopyPlan';

const live = () => isSupabaseConfigured && !!supabase;

/** Everything the copy reads from the source: the tournament, its age groups,
 *  its meet events and golf rounds (the entries are read only for "invite last
 *  year's teams", the golfers only for how the groups went off). */
export async function loadCopySource(tournamentId: string): Promise<CopySource & { entries: TournamentEntry[] }> {
  const tournament = (await getTournaments({ includeDeleted: true })).find((t) => t.id === tournamentId);
  if (!tournament) throw new Error('Tournament not found.');
  const [categories, phases, entries, golf] = await Promise.all([
    getTournamentCategories(tournamentId).catch(() => []),
    getResultsPhases({ tournamentId }).catch(() => []),
    getTournamentEntries(tournamentId).catch(() => [] as TournamentEntry[]),
    tournament.sports.includes('golf') ? loadGolfRounds(tournamentId) : Promise.resolve(undefined),
  ]);
  return { tournament, categories, phases, entries, ...(golf ? { golf } : {}) };
}

async function loadGolfRounds(tournamentId: string): Promise<CopySource['golf']> {
  const rounds = await getFieldEvents({ tournamentId, sport: 'golf' }).catch(() => []);
  if (!rounds.length) return undefined;
  const entries = await getFieldEntries(rounds.map((r) => r.id)).catch(() => []);
  return { rounds, entries };
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
  // …and the events' timetable slots and golf tee times.
  const formats = shiftDays
    ? copyFormats(prev.formats, { records: next, programme: shiftProgrammeDays(plan.programme, shiftDays), golfRounds: shiftGolfRoundDays(plan.golfRounds, shiftDays) })
    : plan.fields.formats;
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
    const cur = demo.tournaments.find((x) => x.id === t.id) ?? t; // the current record (links change in place)
    const root = cur.firstEditionId ?? cur.id;
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

/* ------------------------- link an earlier edition ------------------------- */

const missing = (code?: string) => ['PGRST202', '42883', '42703', 'PGRST204', '42P01', 'PGRST205'].includes(code ?? '');

/** Tournaments already followed by a live next edition (they can't be linked
 *  after again — a series is a single line). Empty before the migrations. */
export async function followedTournamentIds(): Promise<Set<string>> {
  if (!live()) return new Set(demo.tournaments.filter((t) => t.previousEditionId && !t.deletedAt).map((t) => t.previousEditionId!));
  const { data, error } = await supabase!.from('tournaments').select('previous_edition_id').not('previous_edition_id', 'is', null).is('deleted_at', null);
  if (error || !data) return new Set();
  return new Set((data as { previous_edition_id: string }[]).map((r) => r.previous_edition_id));
}

/** Link this tournament after an earlier one, or unlink it (`previousId` null).
 *  The server checks the caller runs both, the order, branches and loops
 *  (link_tournament_edition, migration 20261027160000_link_editions). */
export async function linkEdition(tournamentId: string, previousId: string | null, by: { playerId?: string; name?: string; previousName?: string } = {}): Promise<void> {
  if (!live()) linkEditionDemo(tournamentId, previousId);
  else {
    const { error } = await supabase!.rpc('link_tournament_edition', { p_tournament: tournamentId, p_previous: previousId });
    if (error && missing(error.code)) throw new NeedsDbUpdateError();
    if (error) throw new Error(error.message);
  }
  await logActivity({
    scope: 'tournament', refId: tournamentId, action: previousId ? 'edition.linked' : 'edition.unlinked',
    detail: previousId ? `Linked after ${by.previousName ?? 'an earlier edition'}` : 'Unlinked from its earlier edition', byPlayerId: by.playerId, byName: by.name,
  }).catch(() => {});
}

/** Demo mode: the same rules as the server. */
function linkEditionDemo(tournamentId: string, previousId: string | null): void {
  const t = demo.tournaments.find((x) => x.id === tournamentId && !x.deletedAt);
  if (!t) throw new Error('Tournament not found');
  const laterOf = (id: string): string[] => demo.tournaments.filter((x) => x.previousEditionId === id).flatMap((x) => [x.id, ...laterOf(x.id)]);
  const later = laterOf(t.id);
  let root = t.id;
  if (previousId) {
    const prev = demo.tournaments.find((x) => x.id === previousId && !x.deletedAt);
    if (!prev) throw new Error('The earlier edition wasn’t found');
    if (prev.startDate >= t.startDate) throw new Error('The earlier edition has to start before this one');
    if (demo.tournaments.some((x) => x.previousEditionId === prev.id && x.id !== t.id && !x.deletedAt)) throw new Error('That tournament already has a next edition');
    if (later.includes(prev.id)) throw new Error('That tournament is one of this one’s later editions');
    root = prev.firstEditionId ?? prev.id;
    t.previousEditionId = prev.id;
    t.firstEditionId = root;
  } else {
    delete t.previousEditionId;
    delete t.firstEditionId;
  }
  for (const x of demo.tournaments) if (later.includes(x.id)) x.firstEditionId = root;
}

