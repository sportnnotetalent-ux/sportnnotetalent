/**
 * English billiards' box source (SD-23, see ../boxSources.ts): frames (a
 * single game: "Game 1") as the periods, no per-player table, the side's
 * figures for the comparison. A scope with no shot-by-shot frame lists the
 * break and foul keys as untracked. PURE.
 */
import type { BoxData, BoxScope, MatchBoxSource } from '../boxScore.ts';
import type { BilliardsSideStats, BilliardsState } from './engine.ts';
import { readFrames, statsFor } from './read.ts';

const SHOT_KEYS = ['highestBreak', 'fiftyPlus', 'centuries', 'fouls'];

export function billiardsBox(s: BilliardsState, unit: 'frame' | 'game' = s?.bestOf === 1 ? 'game' : 'frame'): MatchBoxSource {
  const word = unit === 'game' ? 'Game' : 'Frame';
  return {
    periods: readFrames(s).map((f) => ({ value: f.n, label: `${word} ${f.n}` })),
    players: false,
    emptyText: `No ${unit}s yet.`,
    data: (scope: BoxScope): BoxData => {
      const st = statsFor(s, scope === 'all' ? undefined : scope);
      const side = (x: BilliardsSideStats) => ({
        rows: [],
        teamStats: { framesWon: x.framesWon, points: x.points, highestBreak: x.highestBreak, fiftyPlus: x.fiftyPlus, centuries: x.centuries, fouls: x.fouls },
      });
      return { home: side(st.home), away: side(st.away), ...(st.home.detailedFrames > 0 ? {} : { untracked: SHOT_KEYS }) };
    },
  };
}
