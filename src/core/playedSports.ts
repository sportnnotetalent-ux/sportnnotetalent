/**
 * Home › "Your sports" (founder 2026-11-04): the sports a user picked at first
 * launch, then every sport they have taken part in — played (on a side's
 * roster), scored or hosted — newest first, so a sport you've played leaves
 * "Try a new sport". Matches you only follow never add a sport. PURE.
 */
import type { Match, SportId } from './types';

type Feed = ReadonlyArray<Pick<Match, 'sport' | 'homeTeam' | 'awayTeam' | 'hostIds' | 'scorerIds'> | null | undefined>;

const has = (ids: unknown, me: string): boolean => Array.isArray(ids) && ids.includes(me);

/** Did `me` take part in the match (a side's roster, a scorer or a host)? */
const tookPart = (m: NonNullable<Feed[number]>, me: string): boolean =>
  has(m.homeTeam?.roster, me) || has(m.awayTeam?.roster, me) || has(m.scorerIds, me) || has(m.hostIds, me);

/** Declared sports first, then the sports played in `feed` (its order), each once. */
export function yourSports(declared: readonly string[] | undefined, feed: Feed, me: string | null | undefined): SportId[] {
  const out: string[] = [...new Set((declared ?? []).filter((s): s is string => typeof s === 'string' && !!s))];
  if (me) {
    for (const m of feed ?? []) {
      if (!m || typeof m.sport !== 'string' || out.includes(m.sport)) continue;
      if (tookPart(m, me)) out.push(m.sport);
    }
  }
  return out as SportId[];
}

/** home-sports.md HS1: of `sports`, the one with the most games `me` took part
 *  in (played, scored or hosted); a tie goes to the first listed; no games → null. */
export function mostPlayedSport(sports: readonly SportId[], feed: Feed, me: string | null | undefined): SportId | null {
  if (!me || !sports.length) return null;
  const n = new Map<string, number>();
  for (const m of feed ?? []) if (m && typeof m.sport === 'string' && tookPart(m, me)) n.set(m.sport, (n.get(m.sport) ?? 0) + 1);
  let best: SportId | null = null, most = 0;
  for (const s of sports) if ((n.get(s) ?? 0) > most) { best = s; most = n.get(s)!; }
  return best;
}
