/**
 * SD-15 — English billiards' stat schema (see ../statSchema.ts). PURE.
 *
 * Every line key is written by `statTotals` (./totals.ts) from the replayed
 * state; nothing is credited live. Record keys on every line ('present'); the
 * break / stroke / foul keys only on a match with a frame scored shot by shot
 * ('keyed'). Standards: the WPBSA / IBSF billiards records — highest break,
 * centuries (100+) and double centuries, and the AVERAGE (points from strokes
 * ÷ visits to the table).
 */
import type { SportStatSchema, StatDef } from '../statSchema.ts';
import {
  CENTURIES, CUE_FOULS, CUE_POINTS, FIFTY_PLUS, FOUL_POINTS, FOULS_PER_FRAME, FRAME_PCT, FRAMES_LOST, FRAMES_WL, FRAMES_WON, HIGHEST_BREAK,
  MATCHES_WON, PENALTY_POINTS, POINTS_AGAINST, POINTS_PER_FRAME, SAFETIES, SHOT_FRAMES, VISITS, WIN_PCT,
} from '../cue/stats.ts';

const keyed = { coverage: 'keyed' as const };
const count = (key: string, label: string, short: string, one: string, group: string): StatDef => ({ key, label, short, one, group, ...keyed });

const BILLIARDS_ONLY: StatDef[] = [
  { ...count('doubleCenturies', 'Double-century breaks', 'double centuries', 'double century', 'breaks'), abbr: '200+' },
  count('scored', 'Points from strokes', 'points from strokes', 'point from strokes', 'scoring'),
  count('scoringStrokes', 'Scoring strokes', 'scoring strokes', 'scoring stroke', 'strokes'),
  count('potRed', 'Red pots', 'red pots', 'red pot', 'strokes'),
  count('inOffRed', 'In-offs from the red', 'in-offs from the red', 'in-off from the red', 'strokes'),
  count('cannons', 'Cannons', 'cannons', 'cannon', 'strokes'),
  count('potWhite', 'White pots', 'white pots', 'white pot', 'strokes'),
  count('inOffWhite', 'In-offs from the white', 'in-offs from the white', 'in-off from the white', 'strokes'),
  { ...count('misses', 'Missed attempts', 'missed attempts', 'missed attempt', 'play'), format: { unit: 'count', better: 'lower' } },
  // derived: the billiards standard average
  {
    key: 'average', label: 'Average', leaderLabel: 'Best average', source: 'derived', group: 'breaks', format: { unit: 'decimal', dp: 1 },
    agg: { kind: 'rate', num: 'scored', den: 'visits', dp: 1, qualifier: { den: 50, unit: { label: 'visits', one: 'visit' } } },
    tieBreak: [{ key: 'highestBreak', better: 'higher' }],
  },
];

export const billiardsStats: SportStatSchema<'billiards'> = {
  sport: 'billiards',
  splits: ['tournament', 'season', 'opponent'],
  stats: [
    FRAMES_WON, FRAMES_LOST, CUE_POINTS, POINTS_AGAINST,
    SHOT_FRAMES, HIGHEST_BREAK, FIFTY_PLUS, CENTURIES, VISITS, SAFETIES, CUE_FOULS, FOUL_POINTS, PENALTY_POINTS,
    ...BILLIARDS_ONLY,
    MATCHES_WON, WIN_PCT, FRAMES_WL, FRAME_PCT, POINTS_PER_FRAME, FOULS_PER_FRAME,
  ],
  sections: [
    { id: 'match', title: 'Match play', rows: [{ stat: 'framesWL' }, { stat: 'framePct' }] },
    { id: 'breaks', title: 'Breaks', rows: [{ stat: 'highestBreak' }, { stat: 'average' }, { stat: 'centuries' }, { stat: 'doubleCenturies', hideZero: true }, { stat: 'fiftyPlus' }] },
    { id: 'scoring', title: 'Scoring', rows: [{ stat: 'points', label: 'Points scored' }, { stat: 'pointsPerFrame' }, { stat: 'pointsAgainst' }] },
    { id: 'strokes', title: 'Strokes', rows: [
      { stat: 'potRed' }, { stat: 'inOffRed' }, { stat: 'cannons' }, { stat: 'potWhite' }, { stat: 'inOffWhite' }, { stat: 'scoringStrokes' },
    ] },
    { id: 'play', title: 'Safety and misses', rows: [{ stat: 'safeties' }, { stat: 'misses' }, { stat: 'visits' }] },
    { id: 'fouls', title: 'Fouls', rows: [{ stat: 'fouls' }, { stat: 'foulsPerFrame' }, { stat: 'foulPoints' }, { stat: 'penaltyPoints' }] },
  ],
  careerView: 'sections',
  history: ['framesWon', 'centuries', 'fiftyPlus'],
  box: [{ columns: ['framesWon', 'points', 'highestBreak', 'fiftyPlus', 'centuries'] }],
  compare: ['framesWon', 'points', 'highestBreak', 'fiftyPlus', 'centuries', 'fouls'],
  leaders: ['matchesWon', 'framesWon', 'highestBreak', 'centuries', 'average', 'winPct', 'framePct'],
  mvp: { stat: 'matchesWon', tieBreak: [{ key: 'framePct', better: 'higher' }, { key: 'highestBreak', better: 'higher' }], howRanked: 'Most matches won, then the best frames won %, then the highest break. You choose the winner.' },
  headline: ['framesWon', 'highestBreak', 'centuries'],
  awards: [
    { stat: 'highestBreak', icon: '⚪', label: 'Highest break' },
    { stat: 'average', icon: '🎯', label: 'Best average', match: false },
  ],
};
