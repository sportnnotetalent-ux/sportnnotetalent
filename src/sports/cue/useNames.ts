/**
 * Cue sports — the side names for this viewer. IDs-only scoring
 * (docs/privacy/ids-only-scoring.md): the match state and events hold sides
 * and numbers only; a one-player side reads as its player, named by id for
 * this viewer (players_view: the circle sees full names, others initials, an
 * open dispute "X"), else the entry's name. Nothing here is ever stored.
 */
import { useMask } from '../../core/disputeMask';
import type { Player } from '../../core/types';
import { withRosters } from '../racketNames';

export function useSideNames(homeName: string, awayName: string, homeRoster: Player[] = [], awayRoster: Player[] = []): { home: string; away: string } {
  const { nameOf } = useMask();
  const who = withRosters(nameOf, homeRoster, awayRoster);
  const side = (roster: Player[], team: string) => (roster.length === 1 ? who(roster[0].id, roster[0].fullName) : team);
  return { home: side(homeRoster, homeName), away: side(awayRoster, awayName) };
}
