/**
 * SD-15 — snooker's stat schema (see ../statSchema.ts). PURE.
 *
 * Every line key is written by `statTotals` (./totals.ts) from the replayed
 * state; nothing is credited live. Record keys are on every line ('present');
 * the break / potting / foul keys only on a match with a frame scored shot by
 * shot ('keyed'), so a quick-mode match reads "not tracked", never 0.
 * Standards: WST / World Snooker match statistics (highest break, 50+ and
 * century breaks, pot success, safeties, fouls) and the frame record.
 */
import type { SportStatSchema, StatDef } from '../statSchema.ts';
import {
  CENTURIES, CUE_FOULS, CUE_POINTS, FIFTY_PLUS, FOUL_POINTS, FOULS_PER_FRAME, FRAME_PCT, FRAMES_LOST, FRAMES_WL, FRAMES_WON, HIGHEST_BREAK,
  MATCHES_WON, PENALTY_POINTS, POINTS_AGAINST, POINTS_PER_FRAME, SAFETIES, SHOT_FRAMES, VISITS, WIN_PCT,
} from '../cue/stats.ts';

const keyed = { coverage: 'keyed' as const };
const fewer = { format: { unit: 'count' as const, better: 'lower' as const } };

const SNOOKER_ONLY: StatDef[] = [
  { key: 'maximums', label: 'Maximum breaks', short: 'maximums', one: 'maximum', abbr: 'MAX', group: 'breaks', ...keyed },
  { key: 'potted', label: 'Points from pots', short: 'points from pots', one: 'point from pots', group: 'potting', ...keyed },
  { key: 'pots', label: 'Pots', short: 'pots', one: 'pot', group: 'potting', ...keyed },
  { key: 'missedPots', label: 'Missed pots', short: 'missed pots', one: 'missed pot', group: 'potting', ...keyed, ...fewer },
  { key: 'foulMisses', label: 'Fouls and a miss', short: 'fouls and a miss', one: 'foul and a miss', group: 'fouls', ...keyed, ...fewer },
  { key: 'freeBalls', label: 'Free balls received', short: 'free balls', one: 'free ball', group: 'fouls', ...keyed },
  // derived (career / leaderboards)
  {
    key: 'potSuccess', label: 'Pot success', leaderLabel: 'Best pot success', source: 'derived', group: 'potting', format: { unit: 'percent', dp: 0 },
    agg: { kind: 'rate', num: 'pots', den: ['pots', 'missedPots'], scale: 100, dp: 0, qualifier: { den: 50, unit: { label: 'pot attempts', one: 'pot attempt' } } },
    tieBreak: [{ key: 'pots', better: 'higher' }],
  },
  { key: 'pointsPerVisit', label: 'Points per visit', source: 'derived', group: 'potting', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'rate', num: 'potted', den: 'visits', dp: 1 } },
];

export const snookerStats: SportStatSchema<'snooker'> = {
  sport: 'snooker',
  splits: ['tournament', 'season', 'opponent'],
  stats: [
    FRAMES_WON, FRAMES_LOST, CUE_POINTS, POINTS_AGAINST,
    SHOT_FRAMES, HIGHEST_BREAK, FIFTY_PLUS, CENTURIES, VISITS, SAFETIES, CUE_FOULS, FOUL_POINTS, PENALTY_POINTS,
    ...SNOOKER_ONLY,
    MATCHES_WON, WIN_PCT, FRAMES_WL, FRAME_PCT, POINTS_PER_FRAME, FOULS_PER_FRAME,
  ],
  sections: [
    { id: 'match', title: 'Match play', rows: [{ stat: 'framesWL' }, { stat: 'framePct' }] },
    { id: 'breaks', title: 'Breaks', rows: [{ stat: 'highestBreak' }, { stat: 'centuries' }, { stat: 'fiftyPlus' }, { stat: 'maximums', hideZero: true }] },
    { id: 'scoring', title: 'Scoring', rows: [{ stat: 'points', label: 'Points scored' }, { stat: 'pointsPerFrame' }, { stat: 'pointsAgainst' }] },
    { id: 'potting', title: 'Potting', rows: [{ stat: 'potSuccess' }, { stat: 'pots' }, { stat: 'pointsPerVisit' }, { stat: 'safeties' }, { stat: 'visits' }] },
    { id: 'fouls', title: 'Fouls', rows: [
      { stat: 'fouls' }, { stat: 'foulsPerFrame' }, { stat: 'foulPoints' }, { stat: 'penaltyPoints' },
      { stat: 'foulMisses', hideZero: true }, { stat: 'freeBalls', hideZero: true },
    ] },
  ],
  careerView: 'sections',
  history: ['framesWon', 'centuries', 'fiftyPlus'],
  box: [{ columns: ['framesWon', 'points', 'highestBreak', 'fiftyPlus', 'centuries'] }],
  compare: ['framesWon', 'points', 'highestBreak', 'fiftyPlus', 'centuries', 'fouls'],
  leaders: ['matchesWon', 'framesWon', 'highestBreak', 'centuries', 'fiftyPlus', 'potSuccess', 'winPct', 'framePct'],
  mvp: { stat: 'matchesWon', tieBreak: [{ key: 'framePct', better: 'higher' }, { key: 'highestBreak', better: 'higher' }], howRanked: 'Most matches won, then the best frames won %, then the highest break. You choose the winner.' },
  headline: ['framesWon', 'highestBreak', 'centuries'],
  awards: [
    { stat: 'highestBreak', icon: '🎱', label: 'Highest break' },
    { stat: 'centuries', icon: '💯', label: 'Most century breaks', match: false },
  ],
  scoreUnit: 'frames',
};
