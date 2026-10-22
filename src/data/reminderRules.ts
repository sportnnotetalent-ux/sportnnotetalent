/**
 * The reminder RULES (pure — no I/O, no React Native), split out of
 * reminders.ts so they're unit-tested (tests/reminder-rules.test.mts).
 *
 * Scope: a device only ever works out ITS OWN viewer's reminders — matches they
 * play in, squads they captain, matches they host (no scorer yet) or score, and
 * players they follow. Other people's reminders come from the server cron
 * (supabase/functions/notify-upcoming), never from someone else's phone: every
 * device used to compute every upcoming match on the platform and push "You're
 * scoring…" / "No scorer yet…" to strangers (or show them locally when the
 * viewer had no player row).
 */
import { tournamentHostPlayerIds } from '../core/org.ts';
import { ageOf } from '../core/age.ts';
import type { Match, MatchSquads, Organization, Player, TeamLeadership, Tournament } from '../core/types';

/** Friendly "starts <x>" label for a reminder body (handles any value). */
export const shortByMinutes = (m: number): string => {
  if (m % 1440 === 0) { const d = m / 1440; return d === 1 ? 'tomorrow' : `in ${d} days`; }
  if (m % 60 === 0) { const h = m / 60; return `in ${h} hour${h > 1 ? 's' : ''}`; }
  if (m > 60) { const h = Math.floor(m / 60); return `in ${h}h ${m % 60}m`; }
  return `in ${m} min`;
};


const HOUR = 3600_000;
const MIN = 60_000;
export interface ReminderWindow { key: string; ms: number; label: string }

/** Turn a set of lead-time minutes into descending reminder windows (activeWindow
 *  expects largest→smallest so exactly one band is live at a time). */
export function windowsFromMinutes(mins: number[]): ReminderWindow[] {
  return [...new Set(mins)]
    .sort((a, b) => b - a)
    .map((m) => ({ key: `${m}m`, ms: m * MIN, label: shortByMinutes(m) }));
}

/** The player ids taking part on one side of a match: the matchday squad
 *  (starters + subs) if it's set, otherwise the team's explicit roster. */
export function playersInSide(m: Match, side: 'home' | 'away', squads?: MatchSquads, rostersByTeam?: Record<string, string[]>): string[] {
  const sq = side === 'home' ? squads?.home : squads?.away;
  if (sq && (sq.starters.length || sq.subs.length)) return [...sq.starters, ...sq.subs];
  const team = side === 'home' ? m.homeTeam : m.awayTeam;
  // Live match reads don't carry the team roster — use the team's own (roster +
  // team_members) when it was gathered, so roster players get "You play" too.
  return team.roster?.length ? team.roster : rostersByTeam?.[team.id] ?? [];
}

const HOST_WINDOWS: ReminderWindow[] = [
  { key: '1d', ms: 24 * HOUR, label: 'tomorrow' },
  { key: '3h', ms: 3 * HOUR, label: 'in 3 hours' },
  { key: '1h', ms: 1 * HOUR, label: 'in 1 hour' },
];
const SCORER_WINDOWS: ReminderWindow[] = [
  { key: '1d', ms: 24 * HOUR, label: 'tomorrow' },
  { key: '1h', ms: 1 * HOUR, label: 'in 1 hour' },
];

/** The single window whose band currently contains `remaining` (ms to kickoff),
 *  so exactly one reminder is active at a time (no late catch-up spam). */
export function activeWindow(remaining: number, windows: ReminderWindow[]): ReminderWindow | null {
  if (remaining <= 0) return null;
  for (let i = 0; i < windows.length; i++) {
    const upper = windows[i].ms;
    const lower = windows[i + 1]?.ms ?? 0;
    if (remaining <= upper && remaining > lower) return windows[i];
  }
  return null;
}

/** Everyone who should be reminded about a match: its own hosts plus its
 *  tournament's hosts — and if the tournament is org-hosted, every member of
 *  that organization (deduped). */
export function hostsFor(m: Match, tournaments: Tournament[], orgs: Organization[]): string[] {
  const tour = tournaments.find((t) => t.id === m.tournamentId);
  const tourHosts = tour ? tournamentHostPlayerIds(tour, orgs) : [];
  return Array.from(new Set([...(m.hostIds ?? []), ...tourHosts]));
}

/** `forViewer`: shown to the viewer even though `playerId` (the deep link) is
 *  someone else — a followed player's reminder. */
export interface DueReminder { key: string; playerId: string; matchId?: string; title: string; body: string; forViewer?: true }

/** Once a player turns 18, their own mobile & email become compulsory (under-18s
 *  rely on their guardian's). Nudge any 18+ player who hasn't verified both —
 *  until they do, they can't add themselves to teams, tournaments or matches. */
export function computeContactReminders(players: Player[], sent: Set<string>): DueReminder[] {
  const due: DueReminder[] = [];
  for (const p of players) {
    const age = ageOf(p);
    if (age === undefined || age < 18) continue; // minors don't need their own contacts
    if (p.phoneVerified && p.emailVerified) continue; // already done
    const key = `adultcontact:${p.id}`;
    if (sent.has(key)) continue;
    due.push({
      key,
      playerId: p.id,
      title: '🎂 You\'re 18 — verify your contact details',
      body: 'Add and verify your own mobile & email. Until both are verified you can\'t add yourself to any team, tournament or match.',
    });
  }
  return due;
}

export function computeDueReminders(
  matches: Match[],
  tournaments: Tournament[],
  orgs: Organization[],
  leadersByTeam: Record<string, TeamLeadership>,
  squadsByMatch: Record<string, MatchSquads>,
  now: number,
  sent: Set<string>,
  /** each player's global default lead times (minutes); a tournament can override */
  globalLeadMinutes: number[] = [],
  /** the signed-in viewer's player id: ONLY their reminders are produced (none
   *  without one) — other people's come from the server cron */
  viewerId?: string | null,
  /** player ids the viewer follows — used to nudge them before a followed player plays */
  followedPlayerIds?: Set<string>,
  /** id → display name, for naming the followed player in follower reminders */
  playerNameById?: Record<string, string>,
  /** teamId → player ids (roster + team_members), for teams with no saved squad */
  rostersByTeam?: Record<string, string[]>,
): DueReminder[] {
  const due: DueReminder[] = [];
  if (!viewerId) return due;
  for (const m of matches) {
    if (m.status === 'completed') continue;
    const start = new Date(m.startsAt).getTime();
    if (!isFinite(start)) continue;
    const remaining = start - now;
    if (remaining <= 0) continue; // already started / past
    const label = `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`;

    // Player reminders: everyone playing gets a heads-up before kickoff, on the
    // schedule the tournament set (or, failing that, each player's own default).
    const tour = tournaments.find((t) => t.id === m.tournamentId);
    const leadMins = tour?.reminderLeadMinutes ?? globalLeadMinutes;
    const playerWindow = leadMins.length ? activeWindow(remaining, windowsFromMinutes(leadMins)) : null;
    if (playerWindow) {
      for (const side of ['home', 'away'] as const) {
        const team = side === 'home' ? m.homeTeam : m.awayTeam;
        for (const pid of playersInSide(m, side, squadsByMatch[m.id], rostersByTeam)) {
          if (pid !== viewerId) continue; // only the viewer's own reminders
          const key = `player:${m.id}:${playerWindow.key}:${pid}`;
          if (sent.has(key)) continue;
          due.push({
            key,
            playerId: pid,
            matchId: m.id,
            title: `⏰ You play ${playerWindow.label} — ${label}`,
            body: `You're in ${team.name} for ${label}. Tap for match details.`,
          });
        }
      }
    }

    // Follower reminders: nudge the viewer before a player they follow takes the
    // field. Uses the viewer's own lead times (they chose when to hear about it).
    if (followedPlayerIds?.size) {
      const followWindow = globalLeadMinutes.length ? activeWindow(remaining, windowsFromMinutes(globalLeadMinutes)) : null;
      if (followWindow) {
        const playing = new Set([
          ...playersInSide(m, 'home', squadsByMatch[m.id], rostersByTeam),
          ...playersInSide(m, 'away', squadsByMatch[m.id], rostersByTeam),
        ]);
        for (const pid of playing) {
          if (pid === viewerId) continue; // your own match is already a player reminder
          if (!followedPlayerIds.has(pid)) continue;
          const key = `follow:${m.id}:${followWindow.key}:${pid}`;
          if (sent.has(key)) continue;
          const name = playerNameById?.[pid] ?? 'A player you follow';
          due.push({
            key,
            playerId: pid, // deep-link to the followed player
            forViewer: true, // addressed to the viewer, about someone else
            matchId: m.id,
            title: `⭐ ${name} plays ${followWindow.label}`,
            body: `${name} is in ${label}. Tap to follow the match live.`,
          });
        }
      }
    }

    // Squad reminders: each team's captain & vice-captain are nudged until their
    // matchday XI is set (independent of the scorer reminders below).
    for (const side of ['home', 'away'] as const) {
      const team = side === 'home' ? m.homeTeam : m.awayTeam;
      const squadSet = ((side === 'home' ? squadsByMatch[m.id]?.home : squadsByMatch[m.id]?.away)?.starters.length ?? 0) > 0;
      if (squadSet) continue;
      const leaders = leadersByTeam[team.id] ?? {};
      // only when the viewer is this team's captain / vice-captain
      const recipients = [leaders.captainId, leaders.viceCaptainId].filter((x): x is string => x === viewerId);
      if (!recipients.length) continue;
      const w = activeWindow(remaining, HOST_WINDOWS);
      if (!w) continue;
      for (const pid of recipients) {
        const key = `squad:${m.id}:${side}:${w.key}:${pid}`;
        if (sent.has(key)) continue;
        due.push({
          key,
          playerId: pid,
          matchId: m.id,
          title: `📋 Squad needed — ${team.name}`,
          body: `Set your matchday squad for ${label} — starts ${w.label}.`,
        });
      }
    }

    const scorers = m.scorerIds?.length ? m.scorerIds : m.scorerId ? [m.scorerId] : [];
    if (!scorers.length) {
      const w = activeWindow(remaining, HOST_WINDOWS);
      if (!w) continue;
      for (const hid of hostsFor(m, tournaments, orgs).filter((h) => h === viewerId)) {
        const key = `host:${m.id}:${w.key}:${hid}`;
        if (sent.has(key)) continue;
        due.push({
          key,
          playerId: hid,
          matchId: m.id,
          title: `⚠️ No scorer yet — ${label}`,
          body: `This match starts ${w.label} and still has no scorer. Tap to assign one.`,
        });
      }
    } else if (scorers.includes(viewerId)) {
      const w = activeWindow(remaining, SCORER_WINDOWS);
      if (!w) continue;
      const key = `scorer:${m.id}:${w.key}:${viewerId}`;
      if (sent.has(key)) continue;
      due.push({
        key,
        playerId: viewerId,
        matchId: m.id,
        title: `🎯 You're scoring ${label}`,
        body: `Your match starts ${w.label}. Get ready to score from your device.`,
      });
    }
  }
  return due;
}

/** A future notification to schedule on-device so it fires even if the app is
 *  closed. `id` is stable so re-syncing replaces rather than duplicates. */
export interface ScheduledReminder { id: string; fireAt: number; title: string; body: string; playerId?: string; matchId?: string }

/**
 * The viewer's *personal* upcoming reminders as absolute fire-times — for
 * OS-level local scheduling (Phase E), so they arrive when the app is backgrounded
 * or closed. Unlike `computeDueReminders` (one active band, polled while open),
 * this emits every future window as its own dated notification.
 *
 * Scope: the reminders that matter to an individual — matches they play in,
 * players they follow, and matches they're scoring. Host/squad nudges stay on the
 * in-app polling path (organizer-facing, transient).
 */
export function computeScheduledReminders(
  matches: Match[],
  tournaments: Tournament[],
  squadsByMatch: Record<string, MatchSquads>,
  now: number,
  viewerId: string | null,
  globalLeadMinutes: number[],
  followedPlayerIds?: Set<string>,
  playerNameById?: Record<string, string>,
  rostersByTeam?: Record<string, string[]>,
): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  if (!viewerId) return out;
  for (const m of matches) {
    if (m.status === 'completed') continue;
    const start = new Date(m.startsAt).getTime();
    if (!isFinite(start) || start <= now) continue;
    const label = `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`;
    const playing = new Set([
      ...playersInSide(m, 'home', squadsByMatch[m.id], rostersByTeam),
      ...playersInSide(m, 'away', squadsByMatch[m.id], rostersByTeam),
    ]);

    // You're playing: reminders on the tournament's schedule, or your own.
    if (playing.has(viewerId)) {
      const mins = tournaments.find((t) => t.id === m.tournamentId)?.reminderLeadMinutes ?? globalLeadMinutes;
      for (const w of windowsFromMinutes(mins)) {
        const fireAt = start - w.ms;
        if (fireAt > now) out.push({ id: `player:${m.id}:${w.key}:${viewerId}`, fireAt, title: `⏰ You play ${w.label} — ${label}`, body: `You're in this match. Tap for details.`, matchId: m.id, playerId: viewerId });
      }
    }

    // Someone you follow is playing: on your own lead times.
    if (followedPlayerIds?.size) {
      for (const pid of playing) {
        if (pid === viewerId || !followedPlayerIds.has(pid)) continue;
        const name = playerNameById?.[pid] ?? 'A player you follow';
        for (const w of windowsFromMinutes(globalLeadMinutes)) {
          const fireAt = start - w.ms;
          if (fireAt > now) out.push({ id: `follow:${m.id}:${w.key}:${pid}`, fireAt, title: `⭐ ${name} plays ${w.label}`, body: `${name} is in ${label}.`, matchId: m.id, playerId: pid });
        }
      }
    }

    // You're the assigned scorer: get-ready nudges a day and an hour before.
    if ((m.scorerIds?.length ? m.scorerIds : m.scorerId ? [m.scorerId] : []).includes(viewerId)) {
      for (const w of windowsFromMinutes([1440, 60])) {
        const fireAt = start - w.ms;
        if (fireAt > now) out.push({ id: `scorer:${m.id}:${w.key}:${viewerId}`, fireAt, title: `🎯 You're scoring ${label}`, body: `Get ready to score — starts ${w.label}.`, matchId: m.id, playerId: viewerId });
      }
    }
  }
  return out;
}
