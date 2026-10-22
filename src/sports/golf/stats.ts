/** SD-15 — golf's stat schema (see ../statSchema.ts). PURE. Match play
 *  credits `holesWon`; a stroke round writes an absolute line (roundStats in
 *  engine.ts). The profile keeps golf's own block (careerView 'custom') until
 *  golf moves onto the results engine (SD-28). */
import type { SportStatSchema } from '../statSchema.ts';
import type { StatLine } from '../../core/types.ts';
import { PUTT_BUCKETS } from './engine.ts';

const opt = { coverage: 'optional' as const, mode: 'perHoleStats' };
/** SD-45 — written only by a card kept with the stats row (D8: a line
 *  without the key reads "not tracked", never 0). */
const keyed = { coverage: 'keyed' as const, mode: 'perHoleStats' };

/** Deep wave — keys written only on lines finished from now on (free from the
 *  strokes), or only when that stat was tracked on the card. */
const keyedFree = { coverage: 'keyed' as const };
const keyedPutts = { coverage: 'keyed' as const, mode: 'putts' };
const keyedFirstPutt = { coverage: 'keyed' as const, mode: 'firstPutt' };
const keyedDrive = { coverage: 'keyed' as const, mode: 'drive' };
/** Round 2 — up and downs (tracked: 'upDown', shots from off the green). */
const keyedUpDown = { coverage: 'keyed' as const, mode: 'upDown' };

/** SD-49 — "68 (−4)": a round's gross with its score to par. */
const toPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `−${Math.abs(n)}`);
const roundText = (s: Record<string, number>) => (typeof s.toPar === 'number' ? `${s.strokes} (${toPar(s.toPar)})` : String(s.strokes));
/** a complete round (every hole, no pickup) of `n` holes */
const completeOf = (n: number) => (l: StatLine) => !!l.stats?.completeRounds && l.stats?.holes === n;

export const golfStats: SportStatSchema<'golf'> = {
  sport: 'golf',
  // SD-49 — low round compares like for like (an 18-hole 72, a 9-hole 36);
  // putts per round only over lines that say how many holes had putts (an
  // older line without `puttHoles` is "not tracked", never 0 putts).
  filters: {
    complete18: completeOf(18),
    complete9: completeOf(9),
    putted: (l) => (Number(l.stats?.puttHoles) || 0) > 0,
    // Deep wave — lines that carry the split (older lines stay out of the rate)
    nines: (l) => typeof l.stats?.outStrokes === 'number',
    puttSplits: (l) => typeof l.stats?.onePutts === 'number',
    conv: (l) => typeof l.stats?.girBirdies === 'number',
  },
  stats: [
    { key: 'holesWon', label: 'Holes won', short: 'holes won', one: 'hole won', group: 'matchPlay', weight: 1, matchSummary: true },
    { key: 'birdies', label: 'Birdies', short: 'birdies', one: 'birdie', group: 'scoring', weight: 3, matchSummary: true },
    { key: 'eagles', label: 'Eagles+', short: 'eagles', one: 'eagle', group: 'scoring', weight: 6, matchSummary: true },
    { key: 'rounds', label: 'Rounds', short: 'rounds', one: 'round', group: 'rounds', matchSummary: true },
    { key: 'holes', label: 'Holes', short: 'holes', one: 'hole', group: 'rounds' },
    { key: 'strokes', label: 'Strokes', short: 'strokes', one: 'stroke', group: 'rounds', format: { unit: 'strokes' } },
    { key: 'stableford', label: 'Stableford', short: 'stableford pts', group: 'rounds', format: { unit: 'points' } },
    { key: 'toPar', label: 'To par', short: 'to par', group: 'rounds', format: { unit: 'strokes' } },
    { key: 'completeRounds', label: 'Complete rounds', short: 'complete rounds', one: 'complete round', group: 'rounds' },
    { key: 'completeStrokes', label: 'Strokes (complete rounds, per 18)', short: 'strokes', group: 'rounds', format: { unit: 'strokes' } },
    { key: 'pars', label: 'Pars', short: 'pars', one: 'par', group: 'scoring' },
    { key: 'bogeys', label: 'Bogeys', short: 'bogeys', one: 'bogey', group: 'scoring', format: { unit: 'count', better: 'lower' } },
    { key: 'doubles', label: 'Double bogeys+', short: 'doubles', one: 'double', group: 'scoring', format: { unit: 'count', better: 'lower' } },
    { key: 'putts', label: 'Putts', short: 'putts', one: 'putt', group: 'shots', format: { unit: 'count', better: 'lower' }, ...opt },
    { key: 'puttHoles', label: 'Holes with putts', short: 'holes with putts', group: 'shots', ...opt },
    { key: 'girHit', label: 'Greens hit', short: 'greens', one: 'green', group: 'shots', ...opt },
    { key: 'girHoles', label: 'Greens tracked', short: 'greens tracked', group: 'shots', ...opt },
    { key: 'firHit', label: 'Fairways hit', short: 'fairways', one: 'fairway', group: 'shots', ...opt },
    { key: 'firHoles', label: 'Fairways tracked', short: 'fairways tracked', group: 'shots', ...opt },
    { key: 'penalties', label: 'Penalty strokes', short: 'penalty strokes', one: 'penalty stroke', group: 'shots', format: { unit: 'count', better: 'lower' }, ...opt },
    // SD-45 — the per-hole stats row (fairway side, greenside bunker; GIR from
    // strokes − putts ≤ par − 2)
    { key: 'firLeft', label: 'Fairways missed left', short: 'missed left', group: 'shots', format: { unit: 'count', better: 'lower' }, ...keyed },
    { key: 'firRight', label: 'Fairways missed right', short: 'missed right', group: 'shots', format: { unit: 'count', better: 'lower' }, ...keyed },
    { key: 'scrambles', label: 'Scrambles', short: 'scrambles', one: 'scramble', group: 'shots', ...keyed },
    { key: 'scrambleHoles', label: 'Greens missed', short: 'greens missed', group: 'shots', ...keyed },
    { key: 'sandSaves', label: 'Sand saves', short: 'sand saves', one: 'sand save', group: 'shots', ...keyed },
    { key: 'sandHoles', label: 'Greenside bunkers', short: 'bunkers', one: 'bunker', group: 'shots', ...keyed },
    { key: 'puttsGir', label: 'Putts on greens hit', short: 'putts on GIR', group: 'shots', format: { unit: 'count', better: 'lower' }, ...keyed },
    { key: 'girPutted', label: 'Greens hit with putts', short: 'greens with putts', group: 'shots', ...keyed },
    // SD-84 — unofficial WHS figures per finished round (written by
    // completeRound only for 18 complete holes on a tee with a Course Rating +
    // Slope; hcpIndex = the index the player entered for that round). Never
    // summed for display — the profile's handicap card reads them per round.
    { key: 'adjGross', label: 'Adjusted gross (net double bogey)', short: 'adjusted gross', group: 'rounds', format: { unit: 'strokes' }, coverage: 'keyed' as const },
    { key: 'differential', label: 'Score differential (unofficial)', short: 'differential', group: 'rounds', format: { unit: 'strokes', dp: 1, better: 'lower' }, coverage: 'keyed' as const },
    { key: 'hcpIndex', label: 'Handicap Index used', short: 'index', group: 'rounds', format: { unit: 'count', dp: 1, better: 'lower' }, coverage: 'keyed' as const },
    // derived figures (the profile's golf block computes these today)
    // SD-49 — the minimum applies on leaderboards / award slots only (careers
    // always show the figure)
    { key: 'scoringAvg', label: 'Scoring avg', leaderLabel: 'Scoring average', source: 'derived', group: 'rounds', format: { unit: 'strokes', dp: 1 },
      agg: { kind: 'rate', num: 'completeStrokes', den: 'completeRounds', dp: 1, qualifier: { den: 2, unit: { label: 'rounds', one: 'round' } } } },
    { key: 'girPct', label: 'Greens (GIR)', leaderLabel: 'Greens in regulation', source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'girHit', den: 'girHoles', scale: 100, dp: 0, qualifier: { den: 18, unit: { label: 'greens tracked', one: 'green tracked' } } } },
    // SD-49 (GF-08) — tournament leaders / award slots from field-event lines
    { key: 'lowRound', label: 'Low round', source: 'derived', group: 'rounds', format: { unit: 'strokes' },
      agg: { kind: 'best', over: 'complete18', by: [{ key: 'strokes', better: 'lower' }], render: roundText } },
    { key: 'lowRound9', label: 'Low round (9 holes)', source: 'derived', group: 'rounds', format: { unit: 'strokes' },
      agg: { kind: 'best', over: 'complete9', by: [{ key: 'strokes', better: 'lower' }], render: roundText } },
    { key: 'puttsPerRound', label: 'Putts per round', leaderLabel: 'Fewest putts per round', source: 'derived', group: 'shots',
      format: { unit: 'count', dp: 1, better: 'lower' },
      agg: { kind: 'rate', over: 'putted', num: 'putts', den: 'puttHoles', scale: 18, dp: 1, qualifier: { den: 18, unit: { label: 'holes putted', one: 'hole putted' } } } },
    { key: 'firPct', label: 'Fairways', source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'firHit', den: 'firHoles', scale: 100, dp: 0 } },
    { key: 'scramblePct', label: 'Scrambling', source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'scrambles', den: 'scrambleHoles', scale: 100, dp: 0 } },
    { key: 'sandSavePct', label: 'Sand saves', source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'sandSaves', den: 'sandHoles', scale: 100, dp: 0 } },
    // Round 2 — a tournament leader (the PGA TOUR's "Putting Average"), so it
    // ranks with a minimum of greens hit (an organiser can change it)
    { key: 'puttsPerGir', label: 'Putts per GIR', leaderLabel: 'Fewest putts per GIR', source: 'derived', group: 'shots', format: { unit: 'count', dp: 2, better: 'lower' },
      agg: { kind: 'rate', num: 'puttsGir', den: 'girPutted', dp: 2, qualifier: { den: 9, unit: { label: 'greens hit', one: 'green hit' } } } },
    // Deep wave — free figures from the strokes (every round finished from now
    // on: 'keyed', an older line reads "not tracked" and stays out of the rates)
    { key: 'holesInOne', label: 'Holes in one', short: 'holes in one', one: 'hole in one', group: 'scoring', ...keyedFree },
    { key: 'albatrosses', label: 'Albatrosses', short: 'albatrosses', one: 'albatross', group: 'scoring', ...keyedFree },
    { key: 'p3Holes', label: 'Par-3 holes played', short: 'par 3s', one: 'par 3', group: 'byPar', ...keyedFree },
    { key: 'p3Strokes', label: 'Strokes on par 3s', short: 'strokes on par 3s', group: 'byPar', format: { unit: 'strokes' }, ...keyedFree },
    { key: 'p4Holes', label: 'Par-4 holes played', short: 'par 4s', one: 'par 4', group: 'byPar', ...keyedFree },
    { key: 'p4Strokes', label: 'Strokes on par 4s', short: 'strokes on par 4s', group: 'byPar', format: { unit: 'strokes' }, ...keyedFree },
    { key: 'p5Holes', label: 'Par-5 holes played', short: 'par 5s', one: 'par 5', group: 'byPar', ...keyedFree },
    { key: 'p5Strokes', label: 'Strokes on par 5s', short: 'strokes on par 5s', group: 'byPar', format: { unit: 'strokes' }, ...keyedFree },
    { key: 'outStrokes', label: 'Front nine strokes (complete 18-hole rounds)', short: 'front nine strokes', group: 'byPar', format: { unit: 'strokes' }, ...keyedFree },
    { key: 'inStrokes', label: 'Back nine strokes (complete 18-hole rounds)', short: 'back nine strokes', group: 'byPar', format: { unit: 'strokes' }, ...keyedFree },
    { key: 'bounceOps', label: 'Holes after a bogey or worse', short: 'bounce-back chances', group: 'byPar', ...keyedFree },
    { key: 'bounceBacks', label: 'Bounce backs', short: 'bounce backs', one: 'bounce back', group: 'byPar', ...keyedFree },
    { key: 'p3Avg', label: 'Par 3 scoring avg', leaderLabel: 'Par 3 scoring average', source: 'derived', coverage: 'keyed', group: 'byPar', format: { unit: 'strokes', dp: 2 },
      agg: { kind: 'rate', num: 'p3Strokes', den: 'p3Holes', dp: 2, qualifier: { den: 8, unit: { label: 'par 3s', one: 'par 3' } } } },
    { key: 'p4Avg', label: 'Par 4 scoring avg', leaderLabel: 'Par 4 scoring average', source: 'derived', coverage: 'keyed', group: 'byPar', format: { unit: 'strokes', dp: 2 },
      agg: { kind: 'rate', num: 'p4Strokes', den: 'p4Holes', dp: 2, qualifier: { den: 20, unit: { label: 'par 4s', one: 'par 4' } } } },
    { key: 'p5Avg', label: 'Par 5 scoring avg', leaderLabel: 'Par 5 scoring average', source: 'derived', coverage: 'keyed', group: 'byPar', format: { unit: 'strokes', dp: 2 },
      agg: { kind: 'rate', num: 'p5Strokes', den: 'p5Holes', dp: 2, qualifier: { den: 8, unit: { label: 'par 5s', one: 'par 5' } } } },
    { key: 'front9Avg', label: 'Front nine scoring avg', source: 'derived', coverage: 'keyed', group: 'byPar', format: { unit: 'strokes', dp: 1 },
      agg: { kind: 'rate', over: 'nines', num: 'outStrokes', den: 'completeRounds', dp: 1 } },
    { key: 'back9Avg', label: 'Back nine scoring avg', source: 'derived', coverage: 'keyed', group: 'byPar', format: { unit: 'strokes', dp: 1 },
      agg: { kind: 'rate', over: 'nines', num: 'inStrokes', den: 'completeRounds', dp: 1 } },
    { key: 'bounceBackPct', label: 'Bounce back', source: 'derived', coverage: 'keyed', group: 'byPar', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'bounceBacks', den: 'bounceOps', scale: 100, dp: 0 } },
    // over every line (birdies / bogeys are on every golf line)
    { key: 'parBreakers', label: 'Birdie or better %', source: 'derived', group: 'byPar', format: { unit: 'percent', dp: 1 },
      agg: { kind: 'rate', num: ['eagles', 'birdies'], den: 'holes', scale: 100, dp: 1 } },
    { key: 'bogeyAvoidance', label: 'Bogey or worse %', source: 'derived', group: 'byPar', format: { unit: 'percent', dp: 1, better: 'lower' },
      agg: { kind: 'rate', num: ['bogeys', 'doubles'], den: 'holes', scale: 100, dp: 1 } },
    // Deep wave — putting splits (rounds with putts entered)
    { key: 'onePutts', label: 'One-putts', short: 'one-putts', one: 'one-putt', group: 'putting', ...keyedPutts },
    { key: 'threePutts', label: 'Three-putts', short: 'three-putts', one: 'three-putt', group: 'putting', format: { unit: 'count', better: 'lower' }, ...keyedPutts },
    { key: 'girBirdies', label: 'Birdies or better on greens hit', short: 'GIR birdies', one: 'GIR birdie', group: 'putting', ...keyedPutts },
    { key: 'onePuttPct', label: 'One-putt %', source: 'derived', coverage: 'keyed', group: 'putting', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', over: 'puttSplits', num: 'onePutts', den: 'puttHoles', scale: 100, dp: 0 } },
    { key: 'threePuttPct', label: 'Three-putt %', source: 'derived', coverage: 'keyed', group: 'putting', format: { unit: 'percent', dp: 1, better: 'lower' },
      agg: { kind: 'rate', over: 'puttSplits', num: 'threePutts', den: 'puttHoles', scale: 100, dp: 1 } },
    { key: 'birdieConversion', label: 'Birdie conversion (on GIR)', source: 'derived', coverage: 'keyed', group: 'putting', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', over: 'conv', num: 'girBirdies', den: 'girHit', scale: 100, dp: 0 } },
    // Deep wave — first-putt length (tracked: 'firstPutt'), PGA TOUR buckets
    ...PUTT_BUCKETS.flatMap((b) => [
      { key: b.key, label: `First putts ${b.long}`, short: `first putts ${b.long}`, group: 'putting', ...keyedFirstPutt },
      { key: `${b.key}Made`, label: `First putts holed ${b.long}`, short: `holed ${b.long}`, group: 'putting', ...keyedFirstPutt },
      { key: `${b.key}Pct`, label: `Putting ${b.long}`, source: 'derived' as const, coverage: 'keyed' as const, group: 'putting', format: { unit: 'percent' as const, dp: 0 },
        agg: { kind: 'rate' as const, num: `${b.key}Made`, den: b.key, scale: 100, dp: 0 } },
    ]),
    // Deep wave — the measured drive (tracked: 'drive'; yards, PGA TOUR / DP World Tour unit)
    { key: 'drives', label: 'Drives measured', short: 'drives measured', one: 'drive measured', group: 'driving', ...keyedDrive },
    { key: 'driveYds', label: 'Measured drive yards', short: 'drive yards', group: 'driving', ...keyedDrive },
    { key: 'longDrive', label: 'Longest drive (yd)', short: 'longest drive', group: 'driving', format: { unit: 'count' }, agg: { kind: 'max' }, ...keyedDrive },
    // Round 2 — a tournament leader; golfLeaderCategories shows it in metres
    // for a metres tournament (stored in yards)
    { key: 'drivingDistance', label: 'Driving distance (yd)', leaderLabel: 'Driving distance (yd)', source: 'derived', coverage: 'keyed', group: 'driving', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'rate', num: 'driveYds', den: 'drives', dp: 1, qualifier: { den: 4, unit: { label: 'drives measured', one: 'drive measured' } } } },
    // Round 2 — up and downs, apart from scrambling (PGA TOUR: 2 shots or
    // fewer to hole out from off the green, whatever the score)
    { key: 'udChances', label: 'Up-and-down chances', short: 'up-and-down chances', one: 'up-and-down chance', group: 'around', ...keyedUpDown },
    { key: 'upDowns', label: 'Up and downs', short: 'up and downs', one: 'up and down', group: 'around', ...keyedUpDown },
    { key: 'upDownPct', label: 'Up and downs', source: 'derived', coverage: 'keyed', group: 'around', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'upDowns', den: 'udChances', scale: 100, dp: 0 } },
  ],
  sections: [
    { id: 'rounds', title: 'Rounds', rows: [{ stat: 'rounds' }, { stat: 'scoringAvg' }] },
    { id: 'scoring', title: 'Scoring', rows: ['eagles', 'birdies', 'pars', 'bogeys', 'doubles'].map((stat) => ({ stat })) },
    { id: 'shots', title: 'Shots', rows: [{ stat: 'putts' }, { stat: 'girPct' }, { stat: 'firPct' }, { stat: 'scramblePct' }, { stat: 'sandSavePct' }, { stat: 'puttsPerGir' }] },
    { id: 'matchPlay', title: 'Match play', rows: [{ stat: 'holesWon' }] },
    // Deep wave — shown on the golf profile by GolfCareerDepth (each row only
    // once a line carries it)
    { id: 'byPar', title: 'Scoring by par and nine', rows: [
      { stat: 'p3Avg' }, { stat: 'p4Avg' }, { stat: 'p5Avg' }, { stat: 'front9Avg' }, { stat: 'back9Avg' },
      { stat: 'parBreakers' }, { stat: 'bogeyAvoidance' }, { stat: 'bounceBackPct' },
      { stat: 'holesInOne', hideZero: true }, { stat: 'albatrosses', hideZero: true },
    ] },
    { id: 'driving', title: 'Off the tee', rows: [{ stat: 'drivingDistance' }, { stat: 'longDrive' }, { stat: 'drives' }] },
    // Round 2 — up and downs (each row only once a line carries it)
    { id: 'around', title: 'Around the green', rows: [{ stat: 'upDownPct' }, { stat: 'udChances' }] },
    { id: 'putting', title: 'Putting', rows: [
      { stat: 'onePuttPct' }, { stat: 'threePuttPct' }, { stat: 'birdieConversion' },
      ...PUTT_BUCKETS.map((b) => ({ stat: `${b.key}Pct` })),
    ] },
  ],
  careerView: 'custom',
  // SD-49 — birdies stays the headline (match play with strokes has them too);
  // the stroke-play categories only rank lines from finished rounds, and
  // `holesWon` only exists in match play (golfLeaders.ts orders / drops them
  // by the tournament's competition)
  // Round 2 — putts per GIR, driving distance and par-3 / 4 / 5 scoring
  // averages join the leaders (each with its minimum)
  leaders: ['birdies', 'lowRound', 'lowRound9', 'scoringAvg', 'eagles', 'puttsPerRound', 'girPct', 'puttsPerGir', 'drivingDistance', 'p3Avg', 'p4Avg', 'p5Avg', 'holesWon'],
  headline: ['rounds', 'birdies', 'eagles'],
  awards: [
    { stat: 'birdies', icon: '🐦', label: 'Most birdies' },
    // tournament slots only — a single round has no "average"
    { stat: 'lowRound', icon: '🎯', label: 'Low round', match: false,
      howRanked: 'The lowest gross score in one complete 18-hole round of this tournament (every hole holed out, no pick-up). Ties go by name. You choose the winner.' },
    { stat: 'scoringAvg', icon: '⛳', label: 'Best scoring average', match: false,
      howRanked: 'Strokes per complete round (18-hole equivalent) over this tournament\'s finished rounds; the lowest wins. Players need at least {min} to rank. Ties go by name. You choose the winner.' },
  ],
};
