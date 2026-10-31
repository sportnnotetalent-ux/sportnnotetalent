/**
 * Claim this device's guest match for the signed-in person (score first, sign
 * up later; docs/security/breaks/guest-scoring.md). Wires the pure, retry-safe
 * claim (core/guestMatch) to the server: the teams and friendly are created
 * with ids chosen up front, the taps go through append_match_event (idempotent
 * by client id), then the board is saved from the same engine replay.
 */
import { claimGuestMatch } from '../core/guestMatch';
import type { SportFormat } from '../core/types';
import { shortFrom, uniqueShort } from '../core/teamShort';
import { newUuid } from '../core/deviceId';
import { liveSummaryOf } from '../core/liveSummary';
import { withMatchRecords } from '../sports/matchRecords';
import { getSport } from '../sports/registry';
import { deriveLog } from './eventLog';
import { guestStore } from './guestStore';
import {
  getMyPlayerId, createMyPlayer, ensureTeamWithId, ensureFriendlyWithId, setMatchScorer, appendMatchEvent,
  updateMatchSnapshot, endMatchManually, claimScoring,
} from './repos';

export async function claimThisDevicesGuestMatch(profileId: string): Promise<string | null> {
  const g = await guestStore.get();
  if (!g) return null;
  const home = shortFrom(g.homeTeamName);
  const away = uniqueShort(g.awayTeamName, [home]);
  return claimGuestMatch(guestStore, {
    myPlayerId: async () => (await getMyPlayerId(profileId)) ?? createMyPlayer(profileId),
    createTeam: (t) => ensureTeamWithId(t),
    createMatch: (m) => ensureFriendlyWithId({ ...m, format: m.format as SportFormat }),
    // the scorer, holding the scoring lock on this device (as opening a match to score does)
    setScorer: async (id, p) => { await setMatchScorer(id, p); await claimScoring(id, { playerId: p }); },
    uploadOne: (id, e) => appendMatchEvent(id, e),
    saveBoard: async (id, gm) => {
      const plugin = getSport(gm.sport);
      const s = deriveLog(plugin, gm.config, gm.events).state;
      const done = plugin.isComplete(s as never);
      await updateMatchSnapshot(id, withMatchRecords(plugin, s as never, done), done, liveSummaryOf(plugin, s as never));
    },
    endManually: async (id, r) => {
      const plugin = getSport(g.sport);
      await endMatchManually(id, r, { state: deriveLog(plugin, g.config, g.events).state });
    },
  }, { home, away }, newUuid);
}
