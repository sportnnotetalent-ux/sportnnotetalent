/**
 * Edge Function: notify-upcoming
 * ------------------------------------------------------------------------
 * Pre-match reminder fan-out (Phase E, server side). The client schedules the
 * signed-in user's own reminders as local notifications, but that only reaches
 * *their* device. This function delivers REMOTE push to everyone who cares about
 * a match that's about to start — even if their app is closed:
 *
 *   • players in the match        → "⏰ You play in 1 hour — RED vs BLU"
 *   • the assigned scorer         → "🎯 You're scoring RED vs BLU"
 *   • followers of a playing player → "⭐ Rohit Sharma plays in 1 hour"
 *
 * …a day / an hour / 15 minutes before kickoff. A `reminder_sends` ledger makes
 * each (match, lead, recipient, kind) fire exactly once regardless of cron cadence.
 *
 * PREP reminders (2026-10-23) — jobs to do before kickoff, a day / 3 hours / an
 * hour before (rules: _shared/prepReminders.ts). Devices don't compute these any
 * more — the server owns them, so nobody gets them twice:
 *   • a side has no matchday squad → its captain, vice-captain, team admins and
 *     staff: "📋 Squad needed — RED"
 *   • the match has no scorer → its hosts (match + tournament hosts, organiser,
 *     hosting org's Owners/Admins/Organizers): "⚠️ No scorer yet — RED vs BLU"
 * A possible minor is never pushed these directly — their linked parent/guardian
 * is, worded about the child. Push only (no email). Ledger kinds 'squad' / 'host'
 * need migration 20261023120000_prep_reminder_kinds; until it runs they're
 * skipped (never re-sent every run).
 *
 * Schedule it every ~5 minutes (Dashboard → Database → Cron, or pg_cron):
 *   select cron.schedule(
 *     'notify-upcoming', '*∕5 * * * *',
 *     $$ select net.http_post(
 *          url     := 'https://<PROJECT_REF>.functions.supabase.co/notify-upcoming',
 *          headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
 *        ) $$
 *   );
 *
 * Only the cron job may call this (migration 0025): it must send either
 * `Authorization: Bearer <SERVICE_ROLE_KEY>` (as in the snippet above) or
 * `x-cron-secret: <CRON_SECRET>`. Anything else is refused.
 *
 * Alert choices (#23): a follower whose follow row has `prefs.reminder = false`
 * gets no "plays in 1 hour" reminders for that player (null prefs = all on).
 *
 * Deploy:  supabase functions deploy notify-upcoming
 * Secrets: optional CRON_SECRET; SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are
 *          injected automatically.
 *
 * EMAIL (2026-10-07): players and scorers also get ONE email per match — at the
 * day-before window, or the hour-before window if the match was scheduled less
 * than a day ahead. Web users (most iPhone pilot users) can't receive push, so
 * email is their reminder. Followers get push only.
 *
 * PREFERENCES: `user_reminder_prefs.lead_minutes` (Settings → reminders). An
 * empty list = reminders off (no push, no email, no prep nudges). Otherwise push
 * fires only for the 1d/1h/15m windows the user kept; email follows the rule
 * above; prep nudges keep their own 1d/3h/1h windows.
 *
 * Testing: POST { "dry": true, "now": "<ISO time>" } returns who WOULD be
 * reminded at that moment, without sending or recording anything.
 *
 * NOTE: mirrors the lead times + copy of src/data/reminders.ts (prep copy as
 * the device's old squad / host nudges).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { safeEqual, sendEmail } from '../_shared/guard.ts';
import { clip, stripLinks } from '../_shared/text.ts';
import { webPushMany } from '../_shared/webpush.ts';
import { allowedPlayerFollows, keepAllowedFollows } from '../_shared/minorFollows.ts';
import { APP_URL } from '../_shared/hosts.ts';
import { emailWhen, emailZone } from '../_shared/localTime.ts';
// PostgREST stops at 1,000 rows without saying so: page every list, chunk long .in() lists.
import { fetchAllChunked, fetchAllPages } from '../_shared/paging.ts';
import {
  PREP_WINDOWS, freshlyDue, isPrepKind, prepAllowed, prepRefs, prepTargets,
  type PrepKind, type PrepLookups, type PrepMatch, type PrepOrgMember, type PrepPlayer, type PrepRef,
} from '../_shared/prepReminders.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/** Tournament names + venue zones (SD-150); before the time_zone migration runs,
 *  fall back to names only. */
async function tournamentsWithZone(ids: string[]): Promise<{ data: { id: string; name: string; time_zone?: string | null }[] | null }> {
  const read = (cols: string) => fetchAllChunked(ids, (part, from, to) => supabase.from('tournaments').select(cols).in('id', part).order('id').range(from, to));
  const withZone = await read('id, name, time_zone');
  if (!withZone.error) return { data: withZone.data as unknown as { id: string; name: string; time_zone: string | null }[] };
  const plain = await read('id, name');
  return { data: (plain.data ?? []) as unknown as { id: string; name: string }[] };
}

/** A select that falls back to fewer columns when a newer one is missing, so a
 *  schema lag can never stop the reminders everyone already gets. */
async function selectIn<T>(table: string, cols: string, fallbackCols: string, col: string, ids: string[], order: string[] = col === 'id' ? ['id'] : [col, 'id']): Promise<T[]> {
  if (!ids.length) return [];
  // chunked (URL length) and paged (PostgREST's 1,000-row cap), in a stable order
  const read = (select: string) => fetchAllChunked([...new Set(ids)], (part, from, to) => {
    let q = supabase.from(table).select(select).in(col, part);
    for (const o of order) q = q.order(o);
    return q.range(from, to);
  });
  const full = await read(cols);
  if (!full.error) return (full.data ?? []) as T[];
  const plain = await read(fallbackCols);
  return (plain.data ?? []) as T[];
}

type TeamRow = { id: string; name: string; short_name: string; roster?: unknown; captain_id?: string | null; vice_captain_id?: string | null; admin_ids?: string[] | null };
type PlayerRow = { id: string; profile_id: string | null; full_name: string; dob?: string | null; guardian_profile_id?: string | null };
const PLAYER_COLS = 'id, profile_id, full_name, dob, guardian_profile_id';
const toPrepPlayer = (p: PlayerRow): PrepPlayer =>
  ({ id: p.id, profileId: p.profile_id ?? null, fullName: p.full_name, dob: p.dob ?? null, guardianProfileId: p.guardian_profile_id ?? null });

const MIN = 60_000;
const LEADS = [
  { key: '1d', ms: 1440 * MIN, minutes: 1440, label: 'tomorrow' },
  { key: '1h', ms: 60 * MIN, minutes: 60, label: 'in 1 hour' },
  { key: '15m', ms: 15 * MIN, minutes: 15, label: 'in 15 min' },
];
const MINUTES_BY_LEAD = new Map(LEADS.map((l) => [l.key, l.minutes]));
// SD-151: APP_URL comes from the secret (default app.sportnnote.in) — _shared/hosts.ts.
// Slack after a lead's exact time in which it still counts as "freshly due", so a
// ~5-min cron never misses a window (and the ledger stops it firing twice).
const DUE_WINDOW_MS = 10 * MIN;

type Kind = 'player' | 'follower' | 'scorer' | PrepKind;
interface Target { profileId: string; kind: Kind; leadKey: string; matchId: string; title: string; body: string; playerId: string }

const idsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

/** Only the scheduler: the service-role bearer, or the optional cron secret. */
function isCron(req: Request): boolean {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (SERVICE_ROLE_KEY && bearer && safeEqual(bearer, SERVICE_ROLE_KEY)) return true;
  const cron = req.headers.get('x-cron-secret') ?? '';
  return !!CRON_SECRET && !!cron && safeEqual(cron, CRON_SECRET);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json' } }); // W4 (EF-16)
  if (!isCron(req)) return new Response('forbidden', { status: 403 });
  const opts = await req.json().catch(() => ({})) as { dry?: boolean; now?: string };
  const dry = opts.dry === true;
  // A simulated clock is only honoured in dry runs.
  const now = dry && opts.now && !Number.isNaN(Date.parse(opts.now)) ? Date.parse(opts.now) : Date.now();
  const nowISO = new Date(now).toISOString();
  const horizonISO = new Date(now + Math.max(LEADS[0].minutes, PREP_WINDOWS[0].minutes) * MIN + DUE_WINDOW_MS).toISOString();

  // 1) Scheduled matches close enough that some lead window is (or just became) due.
  //    Paged: a busy day across every tournament passes 1,000 fixtures.
  const { data: matches } = await fetchAllPages((from, to) => supabase
    .from('matches')
    .select('id, sport, starts_at, venue_name, tournament_id, scorer_id, scorer_ids, host_ids, home_team_id, away_team_id')
    .eq('status', 'scheduled')
    .gt('starts_at', nowISO)
    .lte('starts_at', horizonISO)
    .order('starts_at').order('id').range(from, to));
  if (!matches?.length) return json({ due: 0, sent: 0 });

  // Only the (match, lead) pairs whose fire time has arrived within the slack
  // window — the match-start leads and, separately, the prep windows.
  const dueMatches = matches
    .map((m) => {
      const start = new Date(m.starts_at as string).getTime();
      const leads = freshlyDue(start, now, LEADS, DUE_WINDOW_MS);
      const prep = freshlyDue(start, now, PREP_WINDOWS, DUE_WINDOW_MS);
      return { m, start, leads, prep };
    })
    .filter((x) => x.leads.length || x.prep.length);
  if (!dueMatches.length) return json({ due: 0, sent: 0 });

  // 2) Resolve teams (names) and rosters/squads for the due matches.
  const matchIds = dueMatches.map((x) => x.m.id as string);
  const teamIds = [...new Set(dueMatches.flatMap((x) => [x.m.home_team_id, x.m.away_team_id]).filter(Boolean) as string[])];

  // Prep nudges need each team's leaders + staff and each tournament's hosts.
  const prepDue = dueMatches.filter((x) => x.prep.length);
  const prepTeamIds = [...new Set(prepDue.flatMap((x) => [x.m.home_team_id, x.m.away_team_id]).filter(Boolean) as string[])];
  const prepTourIds = [...new Set(prepDue.map((x) => x.m.tournament_id).filter(Boolean) as string[])];
  // Every id list chunked (URL length) and every chunk paged (row cap).
  const [teams, { data: squads }, { data: members }, staff, prepTours] = await Promise.all([
    selectIn<TeamRow>('teams', 'id, name, short_name, roster, captain_id, vice_captain_id, admin_ids', 'id, name, short_name, roster', 'id', teamIds),
    fetchAllChunked(matchIds, (part, from, to) => supabase.from('match_squads').select('match_id, side, starters, subs').in('match_id', part)
      .order('match_id').order('side').range(from, to)),
    fetchAllChunked(teamIds, (part, from, to) => supabase.from('team_members').select('team_id, player_id').in('team_id', part)
      .order('team_id').order('player_id').range(from, to)),
    selectIn<{ team_id: string; profile_id: string }>('team_staff', 'team_id, profile_id', 'team_id, profile_id', 'team_id', prepTeamIds, ['team_id', 'profile_id']),
    selectIn<{ id: string; host_ids: string[] | null; organizer_id: string | null; host_org_id?: string | null }>(
      'tournaments', 'id, host_ids, organizer_id, host_org_id', 'id, host_ids, organizer_id', 'id', prepTourIds),
  ]);
  const hostOrgIds = [...new Set(prepTours.map((t) => t.host_org_id).filter(Boolean) as string[])];
  const orgMembers = (await selectIn<{ org_id: string; player_id: string; role: string; until: string | null }>(
    'org_members', 'org_id, player_id, role, until', 'org_id, player_id, role, until', 'org_id', hostOrgIds, ['org_id', 'player_id', 'role'],
  )).map((r): PrepOrgMember => ({ orgId: r.org_id, playerId: r.player_id, role: r.role, until: r.until }));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  // A team's players = its explicit roster (where the app keeps membership) plus
  // any team_members rows — team_members alone missed every roster player.
  const rosterByTeam = new Map<string, string[]>();
  for (const t of teams) rosterByTeam.set(t.id, idsOf(t.roster));
  for (const r of members ?? []) {
    const arr = rosterByTeam.get(r.team_id as string) ?? [];
    if (!arr.includes(r.player_id as string)) arr.push(r.player_id as string);
    rosterByTeam.set(r.team_id as string, arr);
  }
  const squadByMatchSide = new Map<string, string[]>();
  const startersSaved = new Set<string>(); // `${match}:${side}` with a saved XI (the squad nudge's "done")
  for (const s of squads ?? []) {
    squadByMatchSide.set(`${s.match_id}:${s.side}`, [...idsOf(s.starters), ...idsOf(s.subs)]);
    if (idsOf(s.starters).length) startersSaved.add(`${s.match_id}:${s.side}`);
  }

  const playersInSide = (matchId: string, teamId: string | null, side: 'home' | 'away'): string[] => {
    const sq = squadByMatchSide.get(`${matchId}:${side}`);
    if (sq?.length) return sq;
    return teamId ? rosterByTeam.get(teamId) ?? [] : [];
  };

  // Scorers are stored as PLAYER ids (scorer_ids, or the legacy single scorer_id).
  const scorerIdsOf = (m: Record<string, unknown>): string[] =>
    ((m.scorer_ids as string[] | null)?.length ? (m.scorer_ids as string[]) : (m.scorer_id ? [m.scorer_id as string] : []));

  // Prep: the lookups that say who to nudge (players / accounts resolved below).
  const staffByTeam = new Map<string, string[]>();
  for (const s of staff) staffByTeam.set(s.team_id, [...(staffByTeam.get(s.team_id) ?? []), s.profile_id]);
  const prepLk: PrepLookups = {
    teams: new Map(teams.map((t) => [t.id, {
      id: t.id, name: t.name, shortName: t.short_name,
      captainId: t.captain_id ?? null, viceCaptainId: t.vice_captain_id ?? null, adminIds: idsOf(t.admin_ids),
      staffProfileIds: staffByTeam.get(t.id) ?? [],
    }])),
    tournaments: new Map(prepTours.map((t) => [t.id, { id: t.id, hostIds: idsOf(t.host_ids), organizerId: t.organizer_id ?? null, hostOrgId: t.host_org_id ?? null }])),
    orgMembers,
    players: new Map(), playerByProfile: new Map(), profileDob: new Map(),
  };
  const toPrepMatch = (m: Record<string, unknown>): PrepMatch => ({
    id: m.id as string, sport: m.sport as string,
    homeTeamId: (m.home_team_id as string | null) ?? null, awayTeamId: (m.away_team_id as string | null) ?? null,
    tournamentId: (m.tournament_id as string | null) ?? null,
    hostIds: idsOf(m.host_ids), scorerIds: scorerIdsOf(m),
    squadSaved: { home: startersSaved.has(`${m.id}:home`), away: startersSaved.has(`${m.id}:away`) },
  });
  const prepMatches = prepDue.map(({ m, prep }) => ({ pm: toPrepMatch(m), windows: prep }));
  const prepRefList: PrepRef[] = prepMatches.flatMap(({ pm }) => { const r = prepRefs(pm, prepLk); return [...r.squad, ...r.host]; });

  // 3) Build the desired notifications (player + scorer + follower) per due (match, lead).
  const allPlayerIds = new Set<string>();
  const perMatch = dueMatches.map(({ m, leads }) => {
    const home = playersInSide(m.id as string, m.home_team_id as string | null, 'home');
    const away = playersInSide(m.id as string, m.away_team_id as string | null, 'away');
    [...home, ...away].forEach((p) => allPlayerIds.add(p));
    // Scorers need a profile lookup too (to push to their account).
    scorerIdsOf(m).forEach((sid) => allPlayerIds.add(sid));
    return { m, leads, playing: new Set([...home, ...away]) };
  });
  // …and every person a prep nudge is about: captains / admins / hosts by PLAYER
  // id, organisers / team staff by PROFILE id.
  const prepPlayerIds = prepRefList.map((r) => r.playerId).filter((x): x is string => !!x && !allPlayerIds.has(x));
  const prepProfileRefs = [...new Set(prepRefList.map((r) => r.profileId).filter(Boolean) as string[])];

  // Player id → { profileId, fullName }; and followers of each player.
  const followQuery = (cols: string) => fetchAllChunked([...allPlayerIds], (part, from, to) =>
    supabase.from('follows').select(cols).eq('target_type', 'player').in('target_id', part)
      .order('target_id').order('follower_id').range(from, to));
  const [players, followsWithPrefs, profilePlayers] = await Promise.all([
    selectIn<PlayerRow>('players', PLAYER_COLS, 'id, profile_id, full_name', 'id', [...new Set([...allPlayerIds, ...prepPlayerIds])]),
    followQuery('follower_id, target_id, prefs'),
    // organisers / team staff are named by PROFILE id → their own player row (DOB, guardian)
    selectIn<PlayerRow>('players', PLAYER_COLS, 'id, profile_id, full_name', 'profile_id', prepProfileRefs),
  ]);
  // Per-follow alert choices (#23). Before the follow_prefs migration the `prefs`
  // column doesn't exist → fall back to the plain select (everyone wants everything).
  const followsAll = (followsWithPrefs.error
    ? (await followQuery('follower_id, target_id')).data
    : followsWithPrefs.data) as { follower_id: string; target_id: string; prefs?: Record<string, boolean> | null }[] | null;
  // protect_minors (L15): match time + venue of an under-18 only to their circle + guardian.
  const follows = followsAll?.length
    ? keepAllowedFollows(followsAll, await allowedPlayerFollows(supabase, [...new Set(followsAll.map((f) => f.target_id))]))
    : followsAll;
  const playerById = new Map(players.map((p) => [p.id, p]));
  const followersByPlayer = new Map<string, string[]>();
  for (const f of (follows ?? []).filter((f) => f.prefs?.reminder !== false)) followersByPlayer.set(f.target_id as string, [...(followersByPlayer.get(f.target_id as string) ?? []), f.follower_id as string]);

  const targets: Target[] = [];
  for (const { m, leads, playing } of perMatch) {
    const homeT = teamById.get(m.home_team_id as string);
    const awayT = teamById.get(m.away_team_id as string);
    const label = `${homeT?.short_name ?? 'Home'} vs ${awayT?.short_name ?? 'Away'}`;
    for (const lead of leads) {
      for (const pid of playing) {
        const player = playerById.get(pid);
        if (!player) continue;
        // player themselves
        if (player.profile_id) {
          targets.push({ profileId: player.profile_id as string, kind: 'player', leadKey: lead.key, matchId: m.id as string, playerId: pid, title: `⏰ You play ${lead.label} — ${label}`, body: `You're in this match. Tap for details.` });
        }
        // their followers
        for (const followerId of followersByPlayer.get(pid) ?? []) {
          if (followerId === player.profile_id) continue; // don't double-notify the player
          targets.push({ profileId: followerId, kind: 'follower', leadKey: lead.key, matchId: m.id as string, playerId: pid, title: `⭐ ${player.full_name} plays ${lead.label}`, body: `${player.full_name} is in ${label}.` });
        }
      }
      // the assigned scorer(s) (skip the 15m lead — matches the client's 1d/1h scorer
      // windows). scorer_ids hold PLAYER ids → map each to its profile to push.
      if (lead.key !== '15m') {
        for (const sid of scorerIdsOf(m)) {
          const sp = playerById.get(sid);
          if (!sp?.profile_id) continue;
          targets.push({ profileId: sp.profile_id as string, kind: 'scorer', leadKey: lead.key, matchId: m.id as string, playerId: sid, title: `🎯 You're scoring ${label}`, body: `Get ready to score — starts ${lead.label}.` });
        }
      }
    }
  }
  // Prep nudges (squad / host): route each person to their account — or, for a
  // possible minor, their guardian's — then word one nudge per account.
  if (prepRefList.length) {
    for (const p of [...players, ...profilePlayers]) {
      prepLk.players.set(p.id, toPrepPlayer(p));
      if (p.profile_id && !prepLk.playerByProfile.has(p.profile_id)) prepLk.playerByProfile.set(p.profile_id, toPrepPlayer(p));
    }
    const accounts = [...new Set([
      ...prepProfileRefs,
      ...prepRefList.map((r) => (r.playerId ? prepLk.players.get(r.playerId)?.profileId : null)).filter(Boolean) as string[],
    ])];
    for (const r of await selectIn<{ id: string; dob: string | null }>('profiles', 'id, dob', 'id', 'id', accounts)) prepLk.profileDob.set(r.id, r.dob ?? null);
    for (const { pm, windows } of prepMatches) targets.push(...prepTargets(pm, windows, prepLk, now));
  }
  if (!targets.length) return json({ due: dueMatches.length, sent: 0 });

  // 4) Drop anything already sent (idempotency across cron runs).
  //    Every row: one missed here is a reminder sent twice.
  const { data: already } = await fetchAllChunked(matchIds, (part, from, to) => supabase
    .from('reminder_sends')
    .select('match_id, lead_key, recipient_id, kind')
    .in('match_id', part)
    .order('match_id').order('lead_key').order('recipient_id').order('kind').range(from, to));
  const sentKey = (t: { match_id?: string; matchId?: string; lead_key?: string; leadKey?: string; recipient_id?: string; profileId?: string; kind: string }) =>
    `${t.match_id ?? t.matchId}:${t.lead_key ?? t.leadKey}:${t.recipient_id ?? t.profileId}:${t.kind}`;
  const alreadySet = new Set((already ?? []).map(sentKey));

  // Reminder preferences + display time zones of everyone involved.
  const everyone = [...new Set(targets.map((t) => t.profileId))];
  const [{ data: prefs }, { data: profs }] = await Promise.all([
    fetchAllChunked(everyone, (part, from, to) => supabase.from('user_reminder_prefs').select('profile_id, lead_minutes').in('profile_id', part)
      .order('profile_id').range(from, to)),
    fetchAllChunked(everyone, (part, from, to) => supabase.from('profiles').select('id, time_zone').in('id', part).order('id').range(from, to)),
  ]);
  const leadsByProfile = new Map((prefs ?? []).map((p) => [p.profile_id as string, (p.lead_minutes as number[] | null) ?? []]));
  // SD-150: the app now writes profiles.time_zone; null = not synced yet (venue → IST fallback below).
  const tzByProfile = new Map((profs ?? []).map((p) => [p.id as string, (p.time_zone as string | null) ?? null]));
  const remindersOff = (pid: string) => leadsByProfile.has(pid) && leadsByProfile.get(pid)!.length === 0;
  const wantsLead = (pid: string, leadKey: string) =>
    !leadsByProfile.has(pid) || leadsByProfile.get(pid)!.includes(MINUTES_BY_LEAD.get(leadKey) ?? -1);

  // One push per (match, lead, recipient): someone can be a player, a scorer AND a
  // follower of a team-mate in the same match — or host it / captain a side.
  // A job still to do (host > squad) beats scorer > player > follower; the ledger
  // still records every kind so none of them fires later.
  const RANK: Record<Kind, number> = { host: 0, squad: 1, scorer: 2, player: 3, follower: 4 };
  const planPush = (list: Target[]) => {
    const groups = new Map<string, Target[]>();
    for (const t of list) {
      if (alreadySet.has(sentKey(t))) continue;
      // Prep nudges: only the master switch; the rest: the windows the user kept.
      if (isPrepKind(t.kind) ? !prepAllowed(leadsByProfile.get(t.profileId)) : !wantsLead(t.profileId, t.leadKey)) continue;
      const k = `${t.matchId}:${t.leadKey}:${t.profileId}`;
      groups.set(k, [...(groups.get(k) ?? []), t]);
    }
    const ledger = new Map<string, Target>();
    for (const g of groups.values()) for (const t of g) ledger.set(sentKey(t), t);
    return { pushTargets: [...groups.values()].map((g) => [...g].sort((a, b) => RANK[a.kind] - RANK[b.kind])[0]), pushLedger: ledger };
  };
  let { pushTargets, pushLedger } = planPush(targets);

  // One email per (match, recipient): players/scorers, at 1d — or 1h if 1d never
  // happened (match scheduled < a day ahead). Scorer wording wins (action needed).
  const emailByKey = new Map<string, Target>();
  for (const t of targets) {
    if ((t.kind !== 'player' && t.kind !== 'scorer') || (t.leadKey !== '1d' && t.leadKey !== '1h') || remindersOff(t.profileId)) continue;
    const k = `${t.matchId}:${t.profileId}`;
    if (alreadySet.has(`${t.matchId}:email:${t.profileId}:player`) || alreadySet.has(`${t.matchId}:email:${t.profileId}:scorer`)) continue;
    const prev = emailByKey.get(k);
    if (!prev || (t.kind === 'scorer' && prev.kind !== 'scorer')) emailByKey.set(k, t);
  }
  const emailTargets = [...emailByKey.values()];

  const matchById = new Map(dueMatches.map(({ m }) => [m.id as string, m]));
  const tournamentIds = [...new Set(emailTargets.map((t) => matchById.get(t.matchId)?.tournament_id).filter(Boolean) as string[])];
  const { data: tours } = tournamentIds.length
    ? await tournamentsWithZone(tournamentIds)
    : { data: [] as { id: string; name: string; time_zone?: string | null }[] };
  const tourName = new Map((tours ?? []).map((t) => [t.id as string, t.name as string]));
  const tourZone = new Map((tours ?? []).map((t) => [t.id as string, (t.time_zone as string | null | undefined) ?? null]));

  const emails = emailTargets.map((t) => {
    const m = matchById.get(t.matchId)!;
    const homeT = teamById.get(m.home_team_id as string);
    const awayT = teamById.get(m.away_team_id as string);
    const vs = `${homeT?.name ?? homeT?.short_name ?? 'Home'} vs ${awayT?.name ?? awayT?.short_name ?? 'Away'}`;
    // SD-150: the recipient's zone and conventions (else the venue's, else IST), zone named.
    const zone = emailZone(tzByProfile.get(t.profileId), m.tournament_id ? tourZone.get(m.tournament_id as string) : null);
    const when = emailWhen(m.starts_at as string, zone);
    const tour = m.tournament_id ? tourName.get(m.tournament_id as string) : undefined;
    const lead = LEADS.find((l) => l.key === t.leadKey)!;
    const subject = t.kind === 'scorer' ? `🎯 You're scoring ${vs} — ${when}` : `⏰ You play ${lead.label}: ${vs} — ${when}`;
    const text = [
      t.kind === 'scorer' ? `You're the scorer for ${vs}.` : `You're playing in ${vs}.`,
      '',
      `When:  ${when}`,
      // Security W4 (EF-17): typed by organisers — no links, a sane length
      m.venue_name ? `Where: ${stripLinks(clip(m.venue_name, 80))}` : '',
      tour ? `Event: ${tour}` : '',
      '',
      t.kind === 'scorer'
        ? `Open SportnNote a few minutes early to start scoring: ${APP_URL}`
        : `See the match in SportnNote: ${APP_URL}`,
      '',
      '—',
      'You get this because you are in this match. To stop reminders: SportnNote → Settings → Match reminders → remove all timers.',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    return { t, subject, text };
  });

  if (dry) {
    return json({
      dry: true, at: new Date(now).toISOString(), due: dueMatches.length,
      push: pushTargets.map((t) => ({ match: t.matchId, lead: t.leadKey, kind: t.kind, to: t.profileId.slice(0, 8), title: t.title })),
      email: emails.map((e) => ({ match: e.t.matchId, lead: e.t.leadKey, kind: e.t.kind, to: e.t.profileId.slice(0, 8), subject: e.subject })),
    });
  }
  if (!pushTargets.length && !emails.length) return json({ due: dueMatches.length, sent: 0 });

  // 5) Record first (so a concurrent run won't re-send), then deliver.
  const ledgerRow = (t: Target) => ({ match_id: t.matchId, lead_key: t.leadKey, recipient_id: t.profileId, kind: t.kind });
  const upsertLedger = (rows: ReturnType<typeof ledgerRow>[]) =>
    supabase.from('reminder_sends').upsert(rows, { onConflict: 'match_id,lead_key,recipient_id,kind', ignoreDuplicates: true });
  // Prep rows first, on their own: before migration 20261023120000 the ledger's
  // kind check refuses 'squad' / 'host' — then drop the prep nudges this run
  // (re-planning, so a reminder they outranked still goes) rather than send them
  // unrecorded, i.e. again on every run.
  const prepRows = [...pushLedger.values()].filter((t) => isPrepKind(t.kind)).map(ledgerRow);
  if (prepRows.length) {
    const { error } = await upsertLedger(prepRows);
    if (error) {
      console.error('prep reminders skipped — run migration 20261023120000_prep_reminder_kinds:', error.message);
      ({ pushTargets, pushLedger } = planPush(targets.filter((t) => !isPrepKind(t.kind))));
    }
  }
  const ledger = [
    ...[...pushLedger.values()].filter((t) => !isPrepKind(t.kind)).map(ledgerRow),
    ...emails.map(({ t }) => ({ match_id: t.matchId, lead_key: 'email', recipient_id: t.profileId, kind: t.kind })),
  ];
  if (ledger.length) await upsertLedger(ledger);

  const recipientIds = [...new Set(pushTargets.map((t) => t.profileId))];
  const { data: tokens } = await fetchAllChunked(recipientIds, (part, from, to) =>
    supabase.from('push_tokens').select('profile_id, token').in('profile_id', part).order('profile_id').order('token').range(from, to));
  const tokensByProfile = new Map<string, string[]>();
  for (const row of tokens ?? []) tokensByProfile.set(row.profile_id as string, [...(tokensByProfile.get(row.profile_id as string) ?? []), row.token as string]);

  const messages = pushTargets.flatMap((t) =>
    (tokensByProfile.get(t.profileId) ?? []).map((to) => ({
      to, sound: 'default', title: t.title, body: t.body,
      data: { matchId: t.matchId, playerId: t.playerId || undefined },
    })),
  );
  if (messages.length) await sendExpoPush(messages);
  // Web push: iPhone Home Screen app + browsers (one notification per match, replaced as it gets closer).
  const webSent = await webPushMany(pushTargets.map((t) => ({ profileId: t.profileId, title: t.title, body: t.body, url: `/m/${t.matchId}`, tag: `m-${t.matchId}` })));

  // Email: the login address of each recipient (auth.users).
  let emailed = 0;
  for (const e of emails) {
    const { data } = await supabase.auth.admin.getUserById(e.t.profileId);
    const user = data?.user;
    if (!user?.email || user.deleted_at) continue;
    const to = user.email;
    if (await sendEmail(to, e.subject, e.text)) emailed++;
  }

  return json({ due: dueMatches.length, targets: targets.length, pushed: messages.length, web: webSent, emailed });
});

/** Expo caps a push request at 100 messages; batch accordingly. */
async function sendExpoPush(messages: unknown[]): Promise<void> {
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
  }
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
