/**
 * Growth plan #7 — "Play again" (docs/security/breaks/play-again.md): the next
 * friendly between the same sides, same rules and venue, created as the
 * tapper's (host + scorer, as any friendly they make), squads copied. Not for
 * tournament matches (they follow their fixtures).
 */
import { playAgainDraft } from './matchHousekeeping';
import { createMatch, createMyPlayer, getMatch, getMatchSquads, getMyPlayerId, setMatchScorer, setMatchSquad } from './repos';
import type { Match, SportFormat } from '../core/types';

export async function playAgain(matchId: string, profileId: string): Promise<Match> {
  const m = await getMatch(matchId);
  if (!m) throw new Error('Match not found.');
  const d = playAgainDraft(m);
  if (!d) throw new Error('Tournament matches follow their fixtures.');
  const me = (await getMyPlayerId(profileId)) ?? (await createMyPlayer(profileId));
  const created = await createMatch({
    sport: d.sport, homeTeamId: d.homeTeamId, awayTeamId: d.awayTeamId, startsAt: new Date().toISOString(),
    venueName: d.venueName, venueMapsUrl: d.venueMapsUrl, hostIds: [me], format: d.format as SportFormat | undefined,
  });
  await setMatchScorer(created.id, me);
  // The same matchday squads (a convenience: the match itself is created either way)
  try {
    const sq = await getMatchSquads(matchId);
    for (const side of ['home', 'away'] as const) {
      if (sq[side].starters.length + sq[side].subs.length > 0) await setMatchSquad(created.id, side, sq[side]);
    }
  } catch { /* squads can be set on the match */ }
  return created;
}
