/**
 * PREP reminders (2026-10-23): the two pre-match nudges about getting something
 * done before kickoff. They are about OTHER people's jobs, so only the server
 * cron (notify-upcoming) sends them — devices stopped computing them
 * (src/data/reminderRules.ts):
 *
 *   • squad — a side of a scheduled match has no saved matchday squad (no
 *     starters): its team's captain, vice-captain, team admins (admin_ids) and
 *     claimed staff (team_staff: captain / coach) are nudged. Not for sports
 *     where a side is one person or a pair (NO_SQUAD_SPORTS).
 *   • host — the match has no scorer: its hosts are nudged — the match's
 *     host_ids, its tournament's host_ids and organiser (organizer_id), and for
 *     an org-hosted tournament the org's active Owners / Admins / Organizers
 *     (as can_manage_tournament / core/org.ts tournamentHostPlayerIds).
 *
 * Windows: a day, 3 hours and 1 hour before kickoff (the device nudges' windows),
 * each sent once per (match, window, recipient, kind) via the reminder_sends
 * ledger; they stop as soon as the squad is saved / a scorer is assigned.
 * Preference: the master switch only — "Match reminders → remove all timers"
 * silences them (prepAllowed).
 *
 * Children: a recipient who can't be shown to be 18+ (DOB on the player row,
 * else on their account — the protect_minors rule; no DOB = possible minor) is
 * never pushed directly. The nudge goes to their linked parent/guardian account
 * (players.guardian_profile_id) worded about the child, or to nobody.
 *
 * ID model: captain / vice-captain / admin_ids / host_ids / scorer_ids / org
 * members are PLAYER ids; organizer_id and team_staff.profile_id are PROFILE
 * ids. Pushes, preferences and the ledger are per PROFILE.
 *
 * Pure (no imports, no Deno / Node APIs) so notify-upcoming and the app's node
 * tests (tests/prep-reminders.test.mts) share one copy.
 */

export type PrepKind = 'squad' | 'host';
export const PREP_KINDS: readonly PrepKind[] = ['squad', 'host'];
export const isPrepKind = (k: string): k is PrepKind => (PREP_KINDS as readonly string[]).includes(k);

export interface PrepWindow { key: string; minutes: number; label: string }

/** A day, 3 hours and an hour before kickoff — longest first. */
export const PREP_WINDOWS: PrepWindow[] = [
  { key: '1d', minutes: 1440, label: 'tomorrow' },
  { key: '3h', minutes: 180, label: 'in 3 hours' },
  { key: '1h', minutes: 60, label: 'in 1 hour' },
];

/** The windows whose fire time (kickoff − lead) arrived within the last
 *  `slackMs` — so a ~5-minute cron never misses one, and a match set up after a
 *  window passed doesn't get a late catch-up for it. */
export function freshlyDue<W extends { minutes: number }>(startMs: number, now: number, windows: readonly W[], slackMs: number): W[] {
  return windows.filter((w) => {
    const fireAt = startMs - w.minutes * 60_000;
    return fireAt <= now && now - fireAt <= slackMs;
  });
}

/** Prep nudges follow the master switch only: an empty timer list (reminders
 *  off) silences them; no saved row = defaults = on. Otherwise they keep their
 *  own 1d / 3h / 1h windows — they're about getting a job done before kickoff,
 *  not about when someone wants to hear their match is starting. */
export const prepAllowed = (leadMinutes: readonly number[] | undefined): boolean => !leadMinutes || leadMinutes.length > 0;

/** Sports where a side is one person or a pair (participantKind 'individual' /
 *  'both' in src/sports) — there's no matchday squad to pick. Unknown sports
 *  count as team sports, like the registry's default. */
export const NO_SQUAD_SPORTS: readonly string[] = [
  'tennis', 'badminton', 'padel', 'squash', 'tabletennis', 'pickleball', 'carrom', 'chess', 'golf',
  'athletics', 'swimming', 'weightlifting', 'shooting', 'archery', 'rowing', 'canoe', 'cycling',
];
export const sportHasSquads = (sport: string | null | undefined): boolean => !NO_SQUAD_SPORTS.includes(sport ?? '');

/** 18+ by date of birth ('YYYY-MM-DD…') on `now`'s UTC date. No DOB ⇒ not known. */
export function isKnownAdult(dob: string | null | undefined, now: number): boolean {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return false;
  const today = new Date(now).toISOString().slice(0, 10);
  const cutoff = `${Number(today.slice(0, 4)) - 18}${today.slice(4)}`;
  return dob.slice(0, 10) <= cutoff;
}

export interface PrepPlayer { id: string; profileId: string | null; fullName: string; dob: string | null; guardianProfileId: string | null }
export interface PrepTeam {
  id: string; name: string; shortName: string;
  captainId: string | null; viceCaptainId: string | null; adminIds: string[];
  /** team_staff (PROFILE ids) */
  staffProfileIds: string[];
}
export interface PrepTournament { id: string; hostIds: string[]; organizerId: string | null; hostOrgId: string | null }
export interface PrepOrgMember { orgId: string; playerId: string; role: string; until: string | null }
export interface PrepMatch {
  id: string; sport: string;
  homeTeamId: string | null; awayTeamId: string | null; tournamentId: string | null;
  hostIds: string[]; scorerIds: string[];
  /** a matchday squad with starters is saved for that side */
  squadSaved: { home: boolean; away: boolean };
}
export interface PrepLookups {
  teams: Map<string, PrepTeam>;
  tournaments: Map<string, PrepTournament>;
  /** members of the hosting orgs (any role — filtered here) */
  orgMembers: PrepOrgMember[];
  /** by player id: every player a ref names */
  players: Map<string, PrepPlayer>;
  /** an account's own player row, for refs that name a profile */
  playerByProfile: Map<string, PrepPlayer>;
  /** profiles.dob by profile id (the sign-up DOB) */
  profileDob: Map<string, string | null>;
}

/** Who a nudge is about: a player (→ their account) or an account directly.
 *  `role` words it for a guardian ("Aarav is captain of RED"). */
export interface PrepRef { playerId?: string; profileId?: string; role: string; teamId?: string }

const HOST_ORG_ROLES = ['Owner', 'Admin', 'Organizer'];

/** The people responsible for one side's matchday squad. */
export function squadLeaderRefs(team: PrepTeam): PrepRef[] {
  return [
    ...(team.captainId ? [{ playerId: team.captainId, role: 'captain', teamId: team.id }] : []),
    ...(team.viceCaptainId ? [{ playerId: team.viceCaptainId, role: 'vice-captain', teamId: team.id }] : []),
    ...team.adminIds.map((playerId) => ({ playerId, role: 'an admin', teamId: team.id })),
    ...team.staffProfileIds.map((profileId) => ({ profileId, role: 'on the staff', teamId: team.id })),
  ];
}

/** The people who run a match: its own hosts, its tournament's hosts and
 *  organiser, and the hosting org's active Owners / Admins / Organizers. */
export function hostRefs(m: PrepMatch, tour: PrepTournament | undefined, orgMembers: readonly PrepOrgMember[]): PrepRef[] {
  const refs: PrepRef[] = m.hostIds.map((playerId) => ({ playerId, role: 'host' }));
  if (tour) {
    refs.push(...tour.hostIds.map((playerId) => ({ playerId, role: 'host' })));
    if (tour.organizerId) refs.push({ profileId: tour.organizerId, role: 'host' });
    if (tour.hostOrgId) {
      for (const om of orgMembers) {
        if (om.orgId === tour.hostOrgId && !om.until && HOST_ORG_ROLES.includes(om.role)) refs.push({ playerId: om.playerId, role: 'host' });
      }
    }
  }
  return refs;
}

/** Everyone a match's prep nudges are about, whichever windows are due — so
 *  the caller can load exactly those players and accounts. */
export function prepRefs(m: PrepMatch, lk: Pick<PrepLookups, 'teams' | 'tournaments' | 'orgMembers'>): { squad: PrepRef[]; host: PrepRef[] } {
  const squad: PrepRef[] = [];
  if (sportHasSquads(m.sport)) {
    for (const side of ['home', 'away'] as const) {
      const teamId = side === 'home' ? m.homeTeamId : m.awayTeamId;
      const team = teamId ? lk.teams.get(teamId) : undefined;
      if (team && !m.squadSaved[side]) squad.push(...squadLeaderRefs(team));
    }
  }
  const host = m.scorerIds.length ? [] : hostRefs(m, m.tournamentId ? lk.tournaments.get(m.tournamentId) : undefined, lk.orgMembers);
  return { squad, host };
}

export interface PrepRoute { profileId: string; viaGuardian: boolean; playerId?: string; childName?: string }

/** Which account a nudge about `ref` goes to: their own if they're a known
 *  adult; for a possible minor, their linked parent/guardian's — never the
 *  child's own; null when there's no such account. */
export function routeRef(ref: PrepRef, lk: Pick<PrepLookups, 'players' | 'playerByProfile' | 'profileDob'>, now: number): PrepRoute | null {
  const player = ref.playerId ? lk.players.get(ref.playerId) : ref.profileId ? lk.playerByProfile.get(ref.profileId) : undefined;
  if (ref.playerId && !player) return null;
  const account = player?.profileId ?? ref.profileId ?? null;
  const dob = player?.dob ?? (account ? lk.profileDob.get(account) ?? null : null);
  if (isKnownAdult(dob, now)) return account ? { profileId: account, viaGuardian: false, ...(player ? { playerId: player.id } : {}) } : null;
  const guardian = player?.guardianProfileId;
  if (player && guardian && guardian !== account) return { profileId: guardian, viaGuardian: true, playerId: player.id, childName: player.fullName };
  return null;
}

export interface PrepTarget { profileId: string; kind: PrepKind; leadKey: string; matchId: string; playerId: string; title: string; body: string }

/** One recipient account: the refs that are its own job, and those it hears
 *  about as a child's parent/guardian. */
interface Entry { profileId: string; playerId?: string; own: PrepRef[]; viaChild: { ref: PrepRef; route: PrepRoute }[] }

function byAccount(refs: PrepRef[], lk: PrepLookups, now: number): Entry[] {
  const out = new Map<string, Entry>();
  for (const ref of refs) {
    const route = routeRef(ref, lk, now);
    if (!route) continue;
    const e = out.get(route.profileId) ?? { profileId: route.profileId, own: [], viaChild: [] };
    if (route.viaGuardian) e.viaChild.push({ ref, route });
    else { e.own.push(ref); e.playerId ??= route.playerId; }
    out.set(route.profileId, e);
  }
  return [...out.values()];
}

const teamsOf = (refs: PrepRef[], lk: PrepLookups): PrepTeam[] =>
  [...new Set(refs.map((r) => r.teamId).filter((x): x is string => !!x))].map((id) => lk.teams.get(id)).filter((t): t is PrepTeam => !!t);

/** The prep nudges due for one match in the given windows (from freshlyDue):
 *  one per (window, recipient account, kind). Their own job wins over a
 *  child's — an adult who leads a team hears it as theirs. */
export function prepTargets(m: PrepMatch, windows: readonly PrepWindow[], lk: PrepLookups, now: number): PrepTarget[] {
  if (!windows.length) return [];
  const home = m.homeTeamId ? lk.teams.get(m.homeTeamId) : undefined;
  const away = m.awayTeamId ? lk.teams.get(m.awayTeamId) : undefined;
  const label = `${home?.shortName ?? 'Home'} vs ${away?.shortName ?? 'Away'}`;
  const { squad, host } = prepRefs(m, lk);
  const squadTo = byAccount(squad, lk, now);
  const hostTo = byAccount(host, lk, now);
  const out: PrepTarget[] = [];
  for (const w of windows) {
    for (const e of squadTo) {
      const base = { profileId: e.profileId, kind: 'squad' as const, leadKey: w.key, matchId: m.id };
      if (e.own.length) {
        const teams = teamsOf(e.own, lk);
        if (!teams.length) continue;
        out.push({
          ...base, playerId: e.playerId ?? '',
          title: teams.length > 1 ? `📋 Squads needed — ${label}` : `📋 Squad needed — ${teams[0].name}`,
          body: teams.length > 1
            ? `Set the matchday squads for ${teams[0].name} and ${teams[1].name} — starts ${w.label}.`
            : `Set your matchday squad for ${label} — starts ${w.label}.`,
        });
      } else {
        const { ref, route } = e.viaChild[0];
        const team = ref.teamId ? lk.teams.get(ref.teamId) : undefined;
        if (!team) continue;
        out.push({
          ...base, playerId: route.playerId ?? '',
          title: `📋 Squad needed — ${team.name}`,
          body: `${route.childName} is ${ref.role} of ${team.name}, and its matchday squad for ${label} isn't set yet — starts ${w.label}.`,
        });
      }
    }
    for (const e of hostTo) {
      const child = e.own.length ? null : e.viaChild[0].route;
      out.push({
        profileId: e.profileId, kind: 'host', leadKey: w.key, matchId: m.id, playerId: (child ? child.playerId : e.playerId) ?? '',
        title: `⚠️ No scorer yet — ${label}`,
        body: child
          ? `${child.childName} hosts this match. It starts ${w.label} and still has no scorer.`
          : `This match starts ${w.label} and still has no scorer. Tap to assign one.`,
      });
    }
  }
  return out;
}
