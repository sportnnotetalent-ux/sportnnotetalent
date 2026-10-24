/** QR-verified certificates: who finished first, second and third in a sport's
 *  knockout (the final, its two legs, the third-place match). A league has no
 *  final — the organiser picks the places. Pure (node tests load it). */
import { knockoutStageRounds, matchLoserId, matchWinnerId, stageChampionId } from './bracket.ts';
import type { Match } from '../core/types.ts';

export type TournamentPlaces = { champion?: string; runnerUp?: string; third?: string };

/** Champion / runner-up / third from a sport's knockout (empty for a league — pick them). */
export function detectPlaces(matches: Match[]): TournamentPlaces {
  const champion = stageChampionId(knockoutStageRounds(matches));
  const finals = matches.filter((m) => m.stage === 'final' && m.status === 'completed');
  const finalists = [...new Set(finals.flatMap((m) => [m.homeTeam?.id, m.awayTeam?.id]).filter((x): x is string => !!x))];
  const runnerUp = champion && finalists.length === 2 ? finalists.find((t) => t !== champion) : (finals.length === 1 ? matchLoserId(finals[0]) : undefined);
  const thirdMatch = matches.find((m) => m.stage === 'third' && m.status === 'completed');
  return { champion: champion ?? (finals.length === 1 ? matchWinnerId(finals[0]) : undefined), runnerUp, third: thirdMatch ? matchWinnerId(thirdMatch) : undefined };
}

