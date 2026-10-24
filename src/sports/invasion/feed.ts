/**
 * Deep wave (invasion-goal family: football, hockey, handball) — the live
 * COMMENTARY model. PURE (no React Native), so node tests and every screen
 * build the same feed.
 *
 * Each sport turns its own event log into `FeedItem`s — one plain sentence
 * per moment ("Goal! India 1, Japan 0. Rahul (India) right-footed shot from
 * inside the box. Assisted by Dev."), its stamp (45+2', 23', 31:15), the
 * running score after it and whether it is a key event. Items are derived
 * from the log every time, so an undo, an edit or a removal re-writes the
 * feed (and every later running score) by itself.
 *
 * `feedSections` groups them in the sport's natural unit (half / quarter /
 * period, the shoot-out last), newest first, like a broadcast live-text page.
 */

export type Side = 'home' | 'away';
export interface Score { home: number; away: number }

export interface FeedItem {
  /** stable React key */
  id: string;
  /** the unit it belongs to: half / quarter / period (1-based); the
   *  shoot-out uses SHOOTOUT_PERIOD */
  period: number;
  /** match-time order (ascending = oldest first); ties keep log order */
  t: number;
  /** left-column stamp: "45+2'", "23'", "31:15", "SO 3" */
  stamp: string;
  icon: string;
  /** the commentary sentence */
  text: string;
  side?: Side;
  /** the running score AFTER this moment */
  score: Score;
  /** shown instead of the score (the shoot-out tally: "SO 3–2") */
  scoreText?: string;
  /** a key event — goals, cards, substitutions, penalties, shoot-out kicks;
   *  the "Key events" filter keeps only these */
  major?: boolean;
  tone?: 'goal' | 'red' | 'yellow' | 'chance';
  /** the lead player (tap → profile). IDs-only scoring: by id; the name is
   *  the viewer's (built from a named state, never stored). */
  playerId?: string;
  playerName?: string;
}

export interface FeedSection {
  period: number;
  label: string;
  /** the score at the end of the section (or now, for the one in play) */
  score: Score;
  /** shown instead of `score` (the shoot-out tally) */
  scoreText?: string;
  /** goals scored IN this section */
  goals: Score;
  /** newest first */
  items: FeedItem[];
}

/** The shoot-out's section number (after any extra time). */
export const SHOOTOUT_PERIOD = 99;

export const scoreText = (s: Score, sep = '–'): string => `${s.home}${sep}${s.away}`;

/** Oldest-first order: match time, then log order. */
export const byTime = <T extends { t: number; order: number }>(a: T, b: T) => a.t - b.t || a.order - b.order;

/**
 * Group a match's feed by unit, newest unit and newest item first.
 *  - `majorOnly` keeps the key events (the "Key events" filter);
 *  - `periods` lists units that should show even with no item yet (the one in
 *    play), so "2nd half · 1–0" heads the feed from the restart.
 */
export function feedSections(
  items: FeedItem[],
  labelOf: (period: number) => string,
  opts: { majorOnly?: boolean; periods?: number[] } = {},
): FeedSection[] {
  const asc = [...items].sort((a, b) => a.t - b.t);
  const byPeriod = new Map<number, FeedItem[]>();
  let last: Score = { home: 0, away: 0 };
  const endScore = new Map<number, Score>();
  const startScore = new Map<number, Score>();
  const periods = [...new Set([...asc.map((i) => i.period), ...(opts.periods ?? [])])].sort((a, b) => a - b);
  // running score at each unit's start / end (the full feed, not the filtered one)
  for (const p of periods) {
    startScore.set(p, last);
    for (const it of asc) if (it.period === p && p !== SHOOTOUT_PERIOD) last = it.score;
    endScore.set(p, last);
  }
  for (const it of asc) {
    if (opts.majorOnly && !it.major) continue;
    byPeriod.set(it.period, [...(byPeriod.get(it.period) ?? []), it]);
  }
  const out: FeedSection[] = [];
  for (const p of [...periods].reverse()) {
    const list = byPeriod.get(p) ?? [];
    if (!list.length && !(opts.periods ?? []).includes(p)) continue;
    const end = endScore.get(p)!;
    const start = startScore.get(p)!;
    const so = p === SHOOTOUT_PERIOD;
    const lastSo = so ? [...list].reverse().find((i) => i.scoreText) ?? [...asc].reverse().find((i) => i.period === p && i.scoreText) : undefined;
    out.push({
      period: p,
      label: labelOf(p),
      score: end,
      ...(lastSo?.scoreText ? { scoreText: lastSo.scoreText } : {}),
      goals: so ? { home: 0, away: 0 } : { home: end.home - start.home, away: end.away - start.away },
      items: [...list].reverse(),
    });
  }
  return out;
}

/** How many items the feed holds in total and how many are key events. */
export const feedCounts = (items: FeedItem[]) => ({ all: items.length, major: items.filter((i) => i.major).length });

/* ------------------------------ match facts ------------------------------- */

/** A broadcast-style match summary block: each side's scorers (with minutes /
 *  goal counts) and sendings-off, plus one-line notes (HT score, possession). */
export interface MatchFacts {
  home: string[];
  away: string[];
  notes: string[];
}

export const emptyFacts = (): MatchFacts => ({ home: [], away: [], notes: [] });

/** "Rahul 23', 67' (pen)" — a scorer's goals, in match order. IDs-only
 *  scoring: goals group by the scorer's id (`key`; two players shown with the
 *  same initials stay apart), else by the shown name (older logs). */
export function groupByScorer(goals: { side: Side; who: string; stamp: string; tag?: string; key?: string }[]): Record<Side, string[]> {
  const out: Record<Side, string[]> = { home: [], away: [] };
  const order: Record<Side, string[]> = { home: [], away: [] };
  const by = new Map<string, { who: string; stamps: string[] }>();
  for (const g of goals) {
    const k = `${g.side}|${g.key ? `#${g.key}` : g.who}`;
    if (!by.has(k)) { by.set(k, { who: g.who, stamps: [] }); order[g.side].push(k); }
    by.get(k)!.stamps.push(`${g.stamp}${g.tag ? ` (${g.tag})` : ''}`);
  }
  for (const side of ['home', 'away'] as const) {
    for (const k of order[side]) { const g = by.get(k)!; out[side].push(`${g.who} ${g.stamps.join(', ')}`); }
  }
  return out;
}
