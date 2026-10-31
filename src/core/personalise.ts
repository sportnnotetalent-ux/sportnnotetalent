/**
 * Personalised Home (founder 2026-10-31) — the pure rules. On first sign-in a
 * few skippable questions (how they'll use the app, sports, position and
 * handedness per sport, city, location) fill in their profile and tune Home's
 * "Near you". Tested in tests/personalise.test.mts; the server side is
 * migration 20261031120000_personalised_home.sql.
 */
import type { Player, SportDetail, SportId } from './types.ts';
import { SPORT_POSITIONS, SPORT_SIDE_FIELDS } from '../data/sportProfileFields.ts';

export type Use = 'play' | 'organise' | 'score' | 'parent' | 'fan';
export const USES: { id: Use; icon: string; label: string; hint: string }[] = [
  { id: 'play', icon: '🏅', label: 'I play', hint: 'Track my matches and stats' },
  { id: 'organise', icon: '🏆', label: 'I organise', hint: 'Tournaments, leagues, sports days' },
  { id: 'score', icon: '📝', label: 'I score', hint: 'Keep score for matches' },
  { id: 'parent', icon: '👪', label: 'I’m a parent', hint: 'Follow my child’s games' },
  { id: 'fan', icon: '📣', label: 'I follow sport', hint: 'Live scores near me' },
];

export type Step =
  | { kind: 'uses' }
  | { kind: 'sports' }
  | { kind: 'sport'; sport: SportId }
  | { kind: 'city' }
  | { kind: 'location' }
  | { kind: 'done' };

/** Players (or anyone who didn't say) get the position cards. */
export const plays = (uses: readonly Use[]): boolean => uses.length === 0 || uses.includes('play');

/** Does a sport have anything to ask on its card? */
export const hasSportCard = (sport: SportId): boolean =>
  (SPORT_POSITIONS[sport]?.length ?? 0) > 0 || (SPORT_SIDE_FIELDS[sport]?.length ?? 0) > 0;

export function personaliseSteps(o: { uses: readonly Use[]; sports: readonly SportId[]; canAskLocation: boolean }): Step[] {
  const cards: Step[] = plays(o.uses) ? o.sports.filter(hasSportCard).map((sport) => ({ kind: 'sport' as const, sport })) : [];
  return [
    { kind: 'uses' }, { kind: 'sports' }, ...cards, { kind: 'city' },
    ...(o.canAskLocation ? [{ kind: 'location' as const }] : []),
    { kind: 'done' },
  ];
}

export function sportsQuestion(uses: readonly Use[]): string {
  return plays(uses) ? 'Which sports do you play?' : 'Which sports do you follow?';
}

/* ---------- answers → the profile (so nothing is filled in twice) ---------- */

export const MAX_POSITIONS = 3;
export const joinPositions = (list: readonly string[]): string => list.join(', ');
export const splitPositions = (text?: string | null): string[] =>
  (text ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** The profile's sports plus the new ones; nothing is removed. */
export function mergeSports(existing: readonly SportId[], chosen: readonly SportId[]): SportId[] {
  return [...existing, ...chosen.filter((s) => !existing.includes(s))];
}

export type SportAnswer = { positions: string[]; sides: Record<string, string> };

/** Fill in position and sides from the cards; keep everything else (teams,
 *  ratings, handicap) and whatever an unanswered card would have blanked. */
export function mergeSportDetails(
  existing: Player['sportDetails'] | undefined,
  answers: Partial<Record<SportId, SportAnswer>>,
): NonNullable<Player['sportDetails']> {
  const out: NonNullable<Player['sportDetails']> = { ...(existing ?? {}) };
  for (const [sport, a] of Object.entries(answers) as [SportId, SportAnswer][]) {
    const prev: SportDetail = { ...(out[sport] ?? {}) };
    if (a.positions.length) prev.position = joinPositions(a.positions.slice(0, MAX_POSITIONS));
    if (Object.keys(a.sides).length) prev.sides = { ...(prev.sides ?? {}), ...a.sides };
    out[sport] = prev;
  }
  return out;
}

/* ---------- never in the way ---------- */

/** Open the questions by themselves only for a signed-in account that hasn't
 *  answered or skipped, and never over a link someone opened (a match to score,
 *  an invite, a join link): they may be at the ground in a hurry. */
export function shouldAutoOpen(o: { available: boolean; signedIn: boolean; done: boolean; skipped: boolean; deepLinked: boolean }): boolean {
  return o.available && o.signedIn && !o.done && !o.skipped && !o.deepLinked;
}

/** Until it's done, Home shows a small "Finish setting up" card instead. */
export function homeCard(o: { available: boolean; done: boolean }): 'finish' | null {
  return o.available && !o.done ? 'finish' : null;
}

/* ---------- Near you ---------- */

/** ~1 km: all the precision sorting needs, so more never leaves the phone. */
export const roundCoord = (n: number): number => Math.round(n * 100) / 100;

const short = (n: number, unit: number, suffix: string) => `${(Math.round((n / unit) * 10) / 10).toString()}${suffix}`;
/** "340 views" from 25 (founder 2026-10-31); "1.2k", "2.5M" when big. */
export function viewsLabel(n?: number | null): string | null {
  if (!n || n < 25) return null;
  if (n < 1000) return `${n} views`;
  if (n < 1_000_000) return `${short(n, 1000, 'k')} views`;
  return `${short(n, 1_000_000, 'M')} views`;
}

export type NearBasis = 'near' | 'city' | 'none';
export type NearSection = 'live' | 'soon' | 'recent';
const SECTION_WORD: Record<NearSection, string> = { live: 'Live', soon: 'Starting soon', recent: 'Just finished' };

export function nearHeading(o: { basis: NearBasis; city?: string | null; section: NearSection }): string {
  return `${SECTION_WORD[o.section]} ${o.basis === 'city' && o.city ? `in ${o.city}` : 'near you'}`;
}

/** Only with a real location: a city's centre isn't where you are. */
export function distanceLabel(km: number | null | undefined, basis: NearBasis): string | null {
  if (basis !== 'near' || km == null) return null;
  if (km < 1) return 'Under 1 km away';
  return km < 10 ? `${Math.round(km * 10) / 10} km away` : `${Math.round(km)} km away`;
}

/** PH-10: only adults are asked for location (a child's location is extra
 *  personal data, and the stores' family rules are strict); under-18s and
 *  anyone whose age we don't know get matches by city. Takes a date of birth,
 *  or a player (its date of birth, else the server's age for it). */
export function locationAllowed(who: string | { dob?: string; age?: number } | null | undefined, today: Date = new Date()): boolean {
  const dob = typeof who === 'string' ? who : who?.dob;
  if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const [y, m, d] = dob.split('-').map(Number);
    const adultFrom = Date.UTC(y + 18, m - 1, d);
    const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return now >= adultFrom;
  }
  const age = typeof who === 'object' ? who?.age : undefined;
  return typeof age === 'number' && age >= 18;
}
