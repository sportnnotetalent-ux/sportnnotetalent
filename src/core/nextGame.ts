/** "What's next" for a team or player page (UI audit step 6): a game in play
 *  first, else the soonest scheduled one still ahead. Pure. */
export function nextGame<T extends { status: string; startsAt?: string | null }>(games: readonly T[], now: number = Date.now()): T | null {
  const live = games.find((g) => g.status === 'live');
  if (live) return live;
  const ahead = games
    .filter((g) => g.status === 'scheduled' && g.startsAt && Date.parse(g.startsAt) >= now - 3 * 3600_000)
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
  return ahead[0] ?? null;
}
