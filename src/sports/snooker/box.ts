/**
 * Snooker's box source (SD-23, see ../boxSources.ts): frames as the periods,
 * no per-player table (a side is one player), and the side's figures for the
 * team comparison — frames won, frame points, highest break, 50+ and century
 * breaks, fouls. A scope with no shot-by-shot frame lists the break and foul
 * keys as untracked (hidden, never 0). PURE.
 */
import type { BoxData, BoxScope, MatchBoxSource } from '../boxScore.ts';
import type { SnookerSideStats, SnookerState } from './engine.ts';
import { readFrames, statsFor } from './read.ts';

const SHOT_KEYS = ['highestBreak', 'fiftyPlus', 'centuries', 'fouls'];

export function snookerBox(s: SnookerState): MatchBoxSource {
  const frames = readFrames(s).map((f) => f.n);
  return {
    periods: frames.map((n) => ({ value: n, label: `Frame ${n}` })),
    players: false,
    emptyText: 'No frames yet.',
    data: (scope: BoxScope): BoxData => {
      const st = statsFor(s, scope === 'all' ? undefined : scope);
      const side = (x: SnookerSideStats) => ({
        rows: [],
        teamStats: { framesWon: x.framesWon, points: x.points, highestBreak: x.highestBreak, fiftyPlus: x.fiftyPlus, centuries: x.centuries, fouls: x.fouls },
      });
      return { home: side(st.home), away: side(st.away), ...(st.home.detailedFrames > 0 ? {} : { untracked: SHOT_KEYS }) };
    },
  };
}
