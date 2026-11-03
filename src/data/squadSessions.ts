/**
 * Squad sessions — reads and changes (docs/product/squad-sessions.md).
 * Live: every change is a server function that checks who's asking and the
 * version the phone saw (supabase/migrations/20261105120000_squad_sessions.sql).
 * Demo: the same checks over the local store, using the same pure rules
 * (src/core/squadSession.ts).
 */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import {
  available, cleanRules, pickTurn, shareRest as shareRestPicks, teamRosters,
  type Pick, type SessionRules, type SquadSession,
} from '../core/squadSession';
import type { Match, SportId } from '../core/types';
import { demo, addTeam, addMatch } from './demoStore';
import { getMatch, getMyPlayerId } from './repos';

type Row = {
  id: string; club_id: string | null; sport: string; name: string; starts_at: string; venue_name: string | null;
  status: SquadSession['status']; players: string[] | null; captains: string[] | null; picks: Pick[] | null;
  rules: Partial<SessionRules> | null; team_ids: string[] | null; version: number; created_by: string | null; format?: Record<string, unknown> | null;
};

const fromRow = (r: Row): SquadSession => ({
  id: r.id, clubId: r.club_id ?? undefined, sport: r.sport, name: r.name, startsAt: r.starts_at,
  venueName: r.venue_name ?? undefined, status: r.status, players: r.players ?? [], captains: r.captains ?? [],
  picks: Array.isArray(r.picks) ? r.picks : [], rules: cleanRules(r.rules), teamIds: r.team_ids ?? [],
  version: r.version, createdBy: r.created_by ?? undefined,
  format: r.format && typeof r.format === 'object' && !Array.isArray(r.format) ? r.format : {},
});

/** Plain-words message for a refused change (the codes the server raises). */
export function sessionErrorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? '');
  const map: [RegExp, string][] = [
    [/session_changed/, 'Someone else just changed this session. It has been refreshed — try again.'],
    [/not_your_pick/, 'It’s another captain’s turn to pick.'],
    [/not_available/, 'That player has already been picked.'],
    [/not_in_session/, 'Only players in this session can change it.'],
    [/session_ended/, 'This session has ended.'],
    [/game_open/, 'Finish the current game first.'],
    [/bad_captains/, 'Choose one captain per team, each from the players here.'],
    [/picks_started/, 'Picking has started. Tap “Start picks again” to change captains.'],
    [/players_locked/, 'Players can only change before captains are chosen.'],
    [/teams_locked/, 'The number of teams is fixed once captains are chosen.'],
    [/picks_unfinished/, 'Some players haven’t been picked yet.'],
    [/bad_rules/, 'Those rules aren’t allowed.'],
    [/bad_format/, 'Those game settings can’t be saved.'],
    [/too_many_players/, 'A session can have up to 100 players.'],
    [/too_few_players/, 'A session needs at least 2 players.'],
    [/not_in_club/, 'Only members of this team can start a session for it.'],
    [/sign_in|no_player/, 'Sign in and set up your profile first.'],
    [/squad_session|does not exist|schema cache/, 'Sessions need a database update. Ask the SportnNote team.'],
  ];
  return map.find(([re]) => re.test(m))?.[1] ?? 'Couldn’t save that. Please try again.';
}

/** A changed session from a server function's reply (or its error). */
async function asSession(call: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<SquadSession> {
  const { data, error } = await call;
  if (error) throw new Error(error.message);
  return fromRow(data as Row);
}

/* ------------------------------ demo checks ------------------------------ */

const fail = (code: string): never => { throw new Error(code); };
async function demoLoad(id: string, version: number): Promise<{ s: SquadSession; me: string }> {
  const s = demo.squadSessions.find((x) => x.id === id) ?? fail('not_found');
  const me = await getMyPlayerId();
  if (!me || !s.players.includes(me)) fail('not_in_session');
  if (s.status === 'ended') fail('session_ended');
  if (version !== s.version) fail('session_changed');
  return { s, me: me! };
}
const demoSave = (s: SquadSession): SquadSession => { s.version += 1; return { ...s }; };

/* --------------------------------- reads --------------------------------- */

export async function getSquadSession(id: string): Promise<{ session: SquadSession; games: Match[] } | null> {
  if (!isSupabaseConfigured || !supabase) {
    const s = demo.squadSessions.find((x) => x.id === id);
    if (!s) return null;
    const games = demo.matches.filter((m) => m.sessionId === id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { session: { ...s }, games };
  }
  const [{ data, error }, ids] = await Promise.all([
    supabase.from('squad_sessions').select('*').eq('id', id).maybeSingle(),
    supabase.from('matches').select('id, starts_at').eq('session_id', id).order('starts_at').limit(200),
  ]);
  if (error || !data) return null;
  const games = (await Promise.all(((ids.data ?? []) as { id: string }[]).map((r) => getMatch(r.id)))).filter((m): m is Match => !!m);
  return { session: fromRow(data as Row), games };
}

/** A club's sessions, newest first. */
export async function getClubSessions(clubId: string, limit = 10): Promise<SquadSession[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.squadSessions.filter((s) => s.clubId === clubId).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, limit).map((s) => ({ ...s }));
  }
  const { data, error } = await supabase.from('squad_sessions').select('*').eq('club_id', clubId).order('starts_at', { ascending: false }).limit(limit);
  if (error || !data) return [];
  return (data as Row[]).map(fromRow);
}

/* -------------------------------- changes -------------------------------- */

export async function createSquadSession(input: { sport: SportId; name: string; players: string[]; rules: SessionRules; clubId?: string; venueName?: string; format?: Record<string, unknown> }): Promise<SquadSession> {
  const rules = cleanRules(input.rules);
  if (!isSupabaseConfigured || !supabase) {
    const me = await getMyPlayerId();
    if (!me) fail('no_player');
    const players = [...new Set([...input.players, me!])];
    if (players.length > 100) fail('too_many_players');
    const s: SquadSession = {
      id: `ss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, clubId: input.clubId, sport: input.sport,
      name: input.name.trim(), startsAt: new Date().toISOString(), venueName: input.venueName?.trim() || undefined,
      status: 'setup', players, captains: [], picks: [], rules, teamIds: [], format: input.format ?? {}, version: 1, createdBy: me!,
    };
    demo.squadSessions.push(s);
    return { ...s };
  }
  const made = await asSession(supabase.rpc('squad_session_create', {
    p_sport: input.sport, p_name: input.name.trim(), p_players: input.players, p_rules: rules,
    p_club: input.clubId ?? null, p_venue: input.venueName?.trim() || null,
  }));
  return input.format && Object.keys(input.format).length ? setSessionFormat(made, input.format) : made;
}

export async function setSessionRules(s: SquadSession, rules: SessionRules): Promise<SquadSession> {
  const r = cleanRules(rules);
  if (!isSupabaseConfigured || !supabase) {
    const { s: x } = await demoLoad(s.id, s.version);
    if (x.status !== 'setup' && r.teams !== x.rules.teams) fail('teams_locked');
    x.rules = r;
    return demoSave(x);
  }
  return asSession(supabase.rpc('squad_session_set_rules', { p_id: s.id, p_rules: r, p_version: s.version }));
}

/** Game settings for the session's next games (SS20–SS22). */
export async function setSessionFormat(s: SquadSession, format: Record<string, unknown>): Promise<SquadSession> {
  if (!isSupabaseConfigured || !supabase) {
    const { s: x } = await demoLoad(s.id, s.version);
    x.format = { ...format };
    return demoSave(x);
  }
  return asSession(supabase.rpc('squad_session_set_format', { p_id: s.id, p_format: format, p_version: s.version }));
}

export async function setSessionPlayers(s: SquadSession, players: string[]): Promise<SquadSession> {
  if (!isSupabaseConfigured || !supabase) {
    const { s: x } = await demoLoad(s.id, s.version);
    if (x.status !== 'setup') fail('players_locked');
    const ps = [...new Set(players)];
    if (ps.length < 2) fail('too_few_players');
    x.players = ps;
    return demoSave(x);
  }
  return asSession(supabase.rpc('squad_session_set_players', { p_id: s.id, p_players: players, p_version: s.version }));
}

export async function setSessionCaptains(s: SquadSession, captains: string[]): Promise<SquadSession> {
  if (!isSupabaseConfigured || !supabase) {
    const { s: x } = await demoLoad(s.id, s.version);
    if (x.status !== 'setup' && x.status !== 'picking') fail('teams_made');
    if (x.picks.length) fail('picks_started');
    if (captains.length !== x.rules.teams || new Set(captains).size !== captains.length || !captains.every((c) => x.players.includes(c))) fail('bad_captains');
    x.captains = [...captains];
    x.status = 'picking';
    return demoSave(x);
  }
  return asSession(supabase.rpc('squad_session_set_captains', { p_id: s.id, p_captains: captains, p_version: s.version }));
}

export async function restartPicks(s: SquadSession): Promise<SquadSession> {
  if (!isSupabaseConfigured || !supabase) {
    const { s: x } = await demoLoad(s.id, s.version);
    if (x.status !== 'picking') fail('not_picking');
    x.picks = [];
    return demoSave(x);
  }
  return asSession(supabase.rpc('squad_session_restart_picks', { p_id: s.id, p_version: s.version }));
}

export async function pickPlayer(s: SquadSession, player: string): Promise<SquadSession> {
  if (!isSupabaseConfigured || !supabase) {
    const { s: x, me } = await demoLoad(s.id, s.version);
    if (x.status !== 'picking') fail('not_picking');
    const turn = pickTurn(x.captains, x.picks.length, x.rules.pickOrder);
    // the demo is one phone: it acts as every player, so both modes allow the pick
    if (!turn || !x.players.includes(me)) fail('not_your_pick');
    if (!available(x.players, x.captains, x.picks).includes(player)) fail('not_available');
    x.picks = [...x.picks, { captain: turn!, player }];
    return demoSave(x);
  }
  return asSession(supabase.rpc('squad_session_pick', { p_id: s.id, p_player: player, p_version: s.version }));
}

export async function shareRest(s: SquadSession): Promise<SquadSession> {
  if (!isSupabaseConfigured || !supabase) {
    const { s: x } = await demoLoad(s.id, s.version);
    if (x.status !== 'picking') fail('not_picking');
    x.picks = [...x.picks, ...shareRestPicks(x.players, x.captains, x.picks, x.rules.pickOrder)];
    return demoSave(x);
  }
  return asSession(supabase.rpc('squad_session_share_rest', { p_id: s.id, p_version: s.version }));
}

export async function makeTeams(s: SquadSession): Promise<SquadSession> {
  if (!isSupabaseConfigured || !supabase) {
    const { s: x } = await demoLoad(s.id, s.version);
    if (x.status !== 'picking') fail('not_picking');
    if (available(x.players, x.captains, x.picks).length) fail('picks_unfinished');
    x.teamIds = teamRosters(x.captains, x.picks).map((roster, i) =>
      addTeam({ name: `${x.name} ${i + 1}`, shortName: `${x.name.slice(0, 3)}${i + 1}`, sport: x.sport as SportId, adhoc: true, roster }).id);
    x.status = 'playing';
    return demoSave(x);
  }
  return asSession(supabase.rpc('squad_session_make_teams', { p_id: s.id, p_version: s.version }));
}

/** Start the next game (teams by index). Returns the new match id. */
export async function startNextGame(s: SquadSession, home: number, away: number): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    const { s: x, me } = await demoLoad(s.id, s.version);
    if (x.status !== 'playing') fail('not_playing');
    if (home === away || home < 0 || away < 0 || home >= x.teamIds.length || away >= x.teamIds.length) fail('bad_teams');
    if (demo.matches.some((m) => m.sessionId === x.id && (m.status === 'scheduled' || m.status === 'live'))) fail('game_open');
    const team = (id: string) => demo.teams.find((t) => t.id === id)!;
    const m = addMatch({
      sport: x.sport as SportId, sessionId: x.id, status: 'scheduled', startsAt: new Date().toISOString(),
      venueName: x.venueName, hostIds: [...x.players], scorerIds: [...x.players], scorerId: me,
      homeTeam: team(x.teamIds[home]), awayTeam: team(x.teamIds[away]), format: { ...(x.format ?? {}) }, state: null,
    } as Omit<Match, 'id'>);
    demoSave(x);
    return m.id;
  }
  const { data, error } = await supabase.rpc('squad_session_next_game', { p_id: s.id, p_home: home, p_away: away, p_version: s.version });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function endSession(s: SquadSession): Promise<SquadSession> {
  if (!isSupabaseConfigured || !supabase) {
    const { s: x } = await demoLoad(s.id, s.version);
    x.status = 'ended';
    return demoSave(x);
  }
  return asSession(supabase.rpc('squad_session_end', { p_id: s.id, p_version: s.version }));
}
