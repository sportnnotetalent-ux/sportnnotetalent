/** Is this sport played by individuals or pairs (so a two-person side is a pair)?
 *  Team sports never make pairs — a two-person game-day football side stays a side. */
import { getSportMeta } from '../sports/sportMeta';
import type { SportId } from '../core/types';

export const isPairSport = (sport: string): boolean => {
  const kind = getSportMeta(sport as SportId)?.participantKind ?? 'team'; // unset = a team sport (sportMeta)
  return kind !== 'team';
};
