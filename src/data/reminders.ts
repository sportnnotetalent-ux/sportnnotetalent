/**
 * Reminder engine (this device). When the app opens or returns (and every 5
 * minutes) it checks upcoming matches and fires the SIGNED-IN VIEWER's own
 * reminders whose window has arrived — never anyone else's (the rules and that
 * scope are in reminderRules.ts):
 *
 *  - a match they play in (squad, else the team roster), on the tournament's or
 *    their own lead times; a player they follow is about to play;
 *  - a match they're scoring (a day / 1 h before).
 *
 * Everyone else's reminders reach them from the server cron
 * (supabase/functions/notify-upcoming), so their app doesn't need to be open.
 * So do the PREP nudges — "📋 Squad needed" for captains and "⚠️ No scorer yet"
 * for hosts (2026-10-23): the cron owns them, so this device never shows them
 * (it would duplicate the push).
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getUpcomingMatches, getTournaments, getMatchSquadsMany, getTeamRosters, getPlayers, getMyPlayerId } from './repos';
import { gatherReminderInputsWith, startReminderTicker, type ReminderInputs, type ReminderReads } from './reminderInputs';
import { reminderPrefsStore } from './reminderPrefs';
import { followStore } from './followStore';
import { notify, syncScheduledLocal } from '../core/notifications';
import { useAuth } from '../core/auth';

export {
  windowsFromMinutes, playersInSide, activeWindow, computeContactReminders, computeDueReminders, computeScheduledReminders,
} from './reminderRules';
export type { ReminderWindow, DueReminder, ScheduledReminder } from './reminderRules';
import { activeWindow, playersInSide, windowsFromMinutes, computeContactReminders, computeDueReminders, computeScheduledReminders } from './reminderRules';

// Reminders already delivered this session (keeps each window firing once).
const sent = new Set<string>();

/** The live/demo reads behind gatherReminderInputsWith (reminderInputs.ts). */
const reminderReads: ReminderReads = {
  upcomingMatches: (now) => getUpcomingMatches(now),
  tournaments: () => getTournaments(),
  matchSquads: (ids) => getMatchSquadsMany(ids),
  teamRosters: (ids) => getTeamRosters(ids),
  players: () => getPlayers(),
  // The viewer's followed players (follow keys look like "player:<id>") who
  // still want "Before they play" reminders (#23 alert choices).
  followedPlayerIds: () => new Set(
    followStore.getSnapshot().filter((k) => k.startsWith('player:')).map((k) => k.slice('player:'.length))
      .filter((id) => followStore.wants('player', id, 'reminder')),
  ),
};

/** Fetch everything the reminder computations need, once, so the "due now" (feed)
 *  and "schedule ahead" (OS) passes share the same snapshot. */
function gatherReminderInputs(now: number): Promise<ReminderInputs> {
  return gatherReminderInputsWith(reminderReads, now);
}

/** `inputs`: a snapshot already gathered this tick (shared with syncDeviceReminders). */
export async function runReminderCheck(now: number = Date.now(), viewerId?: string | null, inputs?: ReminderInputs): Promise<number> {
  const g = inputs ?? await gatherReminderInputs(now);
  const due = computeDueReminders(
    g.matches, g.tournaments, g.squadsByMatch, now, sent,
    reminderPrefsStore.get(), viewerId, g.followedPlayerIds, g.playerNameById, g.rostersByTeam,
  );
  // Adult contact-verification nudge (turned 18 without own verified mobile/email)
  // — the viewer's own only.
  if (viewerId) due.push(...computeContactReminders(g.players.filter((p) => p.id === viewerId), sent));
  for (const r of due) {
    sent.add(r.key);
    void notify({ title: r.title, body: r.body, playerId: r.playerId, matchId: r.matchId, ...(r.forViewer ? { self: true } : {}) });
  }
  return due.length;
}

/** Phase E: schedule the viewer's upcoming personal reminders as dated OS
 *  notifications so they arrive even when the app is closed. No-op on web. */
export async function syncDeviceReminders(now: number = Date.now(), viewerId?: string | null, inputs?: ReminderInputs): Promise<number> {
  if (!viewerId) return 0;
  const g = inputs ?? await gatherReminderInputs(now);
  const scheduled = computeScheduledReminders(
    g.matches, g.tournaments, g.squadsByMatch, now, viewerId,
    reminderPrefsStore.get(), g.followedPlayerIds, g.playerNameById, g.rostersByTeam,
  );
  await syncScheduledLocal(scheduled);
  return scheduled.length;
}

// Dev aid: expose the pure windowing logic so it can be inspected in the web
// preview / unit-tested deterministically with a fixed `now`.
(globalThis as unknown as Record<string, unknown>).__sportfolioReminders = {
  computeDueReminders,
  computeScheduledReminders,
  activeWindow,
  windowsFromMinutes,
  playersInSide,
};

/** First check a few seconds after launch, so Home's own reads go first (F-08b). */
export const REMINDER_FIRST_DELAY_MS = 10_000;
/** Then every 5 minutes while the app is open (F-08e, founder-approved Q3 — was 60 s). */
export const REMINDER_INTERVAL_MS = 5 * 60_000;
/** Coming back to the app re-checks, but not more than once a minute. */
export const REMINDER_RESUME_GAP_MS = 60_000;

/** Run the reminder check shortly after the app opens, every 5 minutes, and when
 *  it returns to the foreground, while signed in. Resolves the signed-in player
 *  so player reminders in the shared demo feed are theirs only. Each tick
 *  gathers the data ONCE for both passes (F-08a). */
export function useReminderEngine() {
  const { profile } = useAuth();
  useEffect(() => {
    const viewer = getMyPlayerId(profile?.id).catch(() => null);
    const ticker = startReminderTicker(async () => {
      const viewerId = await viewer;
      const now = Date.now();
      const g = await gatherReminderInputs(now);
      await Promise.all([
        runReminderCheck(now, viewerId, g),       // in-app feed (while open)
        syncDeviceReminders(now, viewerId, g),    // OS notifications ahead of time (native; no-op on web)
      ]);
    }, { firstDelayMs: REMINDER_FIRST_DELAY_MS, intervalMs: REMINDER_INTERVAL_MS, minGapMs: REMINDER_RESUME_GAP_MS });
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') ticker.kick(); });
    return () => { sub.remove(); ticker.stop(); };
  }, [profile?.id]);
}
