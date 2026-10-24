/**
 * Deep wave — the live commentary / play-by-play feed model (ATP "Match
 * Stats → commentary", ESPN / NBA.com play-by-play): rows grouped by the
 * sport's natural unit (quarter, set · game…), NEWEST first, each with the
 * running score after it, the clock where stamped and a plain sentence.
 * A sport builds the groups from its event log (so corrections re-derive
 * them); <PlayFeed> renders them with a unit filter and "Scoring plays".
 * PURE (no React Native).
 */

type Side = 'home' | 'away';

export interface FeedRow {
  /** stable key */
  id: string;
  /** the clock or minute, as the sport reads it ("07:32", "12'") */
  clock?: string;
  side?: Side;
  icon: string;
  /** the sentence ("Asha Rao (GS) scores — fed by Meera (WA)") */
  text: string;
  /** the score AFTER this play */
  score: { home: number; away: number };
  /** the play changed the score */
  scoring?: boolean;
  /** a big moment: a lead change, level again, a disqualification */
  tag?: string;
  /** the player named first (for the profile link). IDs-only scoring: by
   *  `playerId`; `playerName` is the viewer's name (a display copy, never
   *  stored) or an older log's stored one. */
  playerName?: string;
  playerId?: string;
}

export interface FeedGroup {
  /** filter value ("1", "2", "OT") */
  key: string;
  /** "Q2", "Extra time · 1st half" */
  title: string;
  /** the score at the end of the group (or now, while it is in play) */
  score: { home: number; away: number };
  /** the group is being played now */
  live?: boolean;
  /** newest first */
  rows: FeedRow[];
}

/** Keep one group (key) and/or only the scoring plays. Groups left empty drop out. */
export function filterFeed(groups: FeedGroup[], opts: { group?: string; scoringOnly?: boolean } = {}): FeedGroup[] {
  return groups
    .filter((g) => !opts.group || g.key === opts.group)
    .map((g) => (opts.scoringOnly ? { ...g, rows: g.rows.filter((r) => r.scoring) } : g))
    .filter((g) => g.rows.length > 0);
}

/**
 * Lead notes for scoring plays, as box-score services count them (and as
 * gameFlow.ts does): "X take the lead" when a side goes ahead after the OTHER
 * side last led (the first lead of the game is not a change), "Level" when a
 * play ties the score (0-0 excluded). Feed it every score in game order.
 */
export function leadTracker(names: { home: string; away: string }): (home: number, away: number) => string | undefined {
  let leader: Side | null = null;
  return (home, away) => {
    if (home === away) return home > 0 ? `Level at ${home}–${away}` : undefined;
    const ahead: Side = home > away ? 'home' : 'away';
    const change = leader !== null && leader !== ahead;
    leader = ahead;
    return change ? `${names[ahead]} take the lead` : undefined;
  };
}

/** "Q2 · 24–21" — a group's heading line. */
export const groupHeading = (g: Pick<FeedGroup, 'title' | 'score' | 'live'>): string =>
  `${g.title}${g.live ? ' · in play' : ''} · ${g.score.home}–${g.score.away}`;
