/**
 * Quick game (MVP, founder 2026-10-31): start a friendly in a few taps. The
 * sport is already picked, and a side left empty starts with a plain name.
 * Tests: tests/quick-game.test.mts.
 */

import { entryName, entryShortName } from '../data/participantEntry.ts';

export type ParticipantMode = 'team' | 'individual' | 'pairs';

/** Where the last friendly's sport is remembered on this device. */
export const LAST_SPORT_KEY = 'sn.friendly.lastSport';

const NOUN: Record<ParticipantMode, string> = { team: 'Team', individual: 'Player', pairs: 'Pair' };

export const quickSideName = (mode: ParticipantMode, side: 'home' | 'away'): string => `${NOUN[mode]} ${side === 'home' ? 'A' : 'B'}`;
export const quickSideShort = (side: 'home' | 'away'): string => (side === 'home' ? 'A' : 'B');

/** The sport a new friendly opens with: the last one used here, else the
 *  first from the first-run questions; null leaves the picker empty. */
export function startSport(o: { last: string | null; mine: readonly string[]; known: readonly string[] }): string | null {
  if (o.last && o.known.includes(o.last)) return o.last;
  return o.mine.find((s) => o.known.includes(s)) ?? null;
}

/** MVP QG-01 — a side a quick game made and nobody touched since ("Team A",
 *  "Player B", "Pair A"…): kept out of the team pickers so they don't fill
 *  with copies. A renamed side or a real team is never hidden. */
export const isQuickPlaceholder = (t: { name: string; adhoc?: boolean }): boolean =>
  t.adhoc === true && /^(Team|Player|Pair) [AB]$/.test(t.name.trim());

/* ---- A placeholder side takes its real name (founder 2026-11-03) ----------
 * "Player B" / "Pair A" stayed on every card after the real person or pair was
 * added. docs/security/breaks/placeholder-side-names.md;
 * tests/placeholder-side-names.test.mts. */

/** How many people make each placeholder a real entry: one player, two
 *  partners. A "Team" placeholder keeps its name until the user gives one. */
const ENTRY_SIZE: Record<string, number> = { Player: 1, Pair: 2 };
const placeholderSize = (name: string): number | undefined => ENTRY_SIZE[name.trim().split(' ')[0]];

/** Cheap pre-filter on a name alone (a match read has no `adhoc` / roster):
 *  could this be a "Player X" / "Pair X" placeholder? */
export const looksQuickPlaceholder = (name: string): boolean => /^(Player|Pair) [AB]$/.test((name ?? '').trim());

/** The rename for a placeholder side whose roster is now its real entry: the
 *  entry name the server recognises (participantEntry.entryName — full names
 *  joined " / ", or as players_view masks them; the teams_entry_names trigger
 *  then masks a child's name in the stored copy) and its short code. Null for
 *  a real team, a renamed side, a "Team" placeholder, or an incomplete entry. */
export function placeholderRename(t: { name: string; adhoc?: boolean | null }, names: readonly string[]): { name: string; shortName: string } | null {
  if (!isQuickPlaceholder({ name: t.name, adhoc: t.adhoc === true })) return null;
  const size = placeholderSize(t.name);
  const clean = names.map((n) => (n ?? '').trim().replace(/\s+/g, ' '));
  if (!size || clean.length !== size || clean.some((n) => !n)) return null;
  return { name: entryName(clean), shortName: entryShortName(clean) };
}

/** Old matches (no rename yet): the players a placeholder side's name should be
 *  rebuilt from — its whole roster when that is exactly its entry (one player /
 *  two different partners); undefined otherwise. */
export function placeholderEntryIds(t: { name: string; adhoc?: boolean | null; roster?: readonly string[] | null }): string[] | undefined {
  if (!isQuickPlaceholder({ name: t.name, adhoc: t.adhoc === true })) return undefined;
  const size = placeholderSize(t.name);
  const ids = (t.roster ?? []).map((x) => (typeof x === 'string' ? x.trim() : ''));
  if (!size || ids.length !== size || ids.some((x) => !x) || new Set(ids).size !== ids.length) return undefined;
  return ids;
}

/** The live screen keeps the side names it was opened with (route params).
 *  When a side opened as a placeholder ("Player B" / short "B") now loads under
 *  its real name — renamed, or read through the roster fallback — the params to
 *  set so the title, result card, share text and notifications follow; {} when
 *  nothing changes. A real team's name in the route is never replaced. */
export function placeholderParamsPatch(
  route: { homeName?: string; awayName?: string; homeTeamName?: string; awayTeamName?: string },
  loaded: { home: { name: string; shortName?: string }; away: { name: string; shortName?: string } },
): { homeName?: string; awayName?: string; homeTeamName?: string; awayTeamName?: string } {
  const out: { homeName?: string; awayName?: string; homeTeamName?: string; awayTeamName?: string } = {};
  for (const side of ['home', 'away'] as const) {
    const full = side === 'home' ? route.homeTeamName : route.awayTeamName;
    const t = loaded[side];
    if (!full || !looksQuickPlaceholder(full) || !t.name || looksQuickPlaceholder(t.name) || t.name === full) continue;
    if (side === 'home') { out.homeTeamName = t.name; out.homeName = t.shortName || t.name; }
    else { out.awayTeamName = t.name; out.awayName = t.shortName || t.name; }
  }
  return out;
}
