/**
 * Quick tournament (MVP, founder 2026-10-31): name, sport, the teams pasted
 * from a list, a format → the fixtures. Pure, so it's tested in node
 * (tests/quick-tournament.test.mts); the screen is QuickTournamentScreen.
 */

export type QuickFormat = 'league' | 'knockout' | 'groups';
export const MAX_ENTRANTS = 64;
export const NAME_MAX = 40;

// "1. Lions", "2) Tigers", "- Panthers", "• Cheetahs", "3 - Hawks"
const LEAD = /^\s*(?:\d+\s*[.)\-:]\s*|\d+\s+-\s*|[-*•·]\s*)/;

/** A pasted list (one per line, or one line separated by commas) → clean,
 *  unique names in the order given. */
export function parseEntrantList(text: string): string[] {
  const raw = text.includes('\n') ? text.split(/\r?\n/) : text.split(',');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw) {
    const name = line.replace(LEAD, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === MAX_ENTRANTS) break;
  }
  return out;
}

/** Up to 5 sides play everyone; more play a knockout. */
export function suggestFormat(count: number): QuickFormat | null {
  if (count < 2) return null;
  return count <= 5 ? 'league' : 'knockout';
}

/** Groups of about 4 (at least 2 groups), the top 2 of each into a knockout. */
export const groupCount = (n: number): number => Math.max(2, Math.round(n / 4));

export function matchCount(f: QuickFormat, n: number): number {
  if (n < 2) return 0;
  if (f === 'league') return (n * (n - 1)) / 2;
  if (f === 'knockout') return n - 1;
  const g = groupCount(n);
  let groupGames = 0;
  for (let i = 0; i < g; i++) {
    const size = Math.floor(n / g) + (i < n % g ? 1 : 0);
    groupGames += (size * (size - 1)) / 2;
  }
  return groupGames + (2 * g - 1);
}

export const structureFor = (f: QuickFormat): 'league' | 'knockout' | 'league_knockout' =>
  f === 'groups' ? 'league_knockout' : f;

export function quickName(sportName: string, d: Date): string {
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${sportName} Cup · ${month} ${d.getUTCFullYear()}`;
}
