/**
 * Cue sports (snooker, English billiards): the stat definitions the two
 * schemas share. A key means the same in every sport that writes it, and the
 * schema test checks that a shared key has the same labels everywhere, so the
 * labels live here once (snooker/stats.ts and billiards/stats.ts spread them).
 * PURE (no React Native).
 *
 * Every key is written by the sport's `statTotals` only (derived from the
 * replayed state; nothing is credited live):
 *  - record keys ('present': on every line the totals write): frames won /
 *    lost, frame points for / against;
 *  - shot-by-shot keys ('keyed': only on a line whose match had at least one
 *    frame scored shot by shot, so a quick-mode match reads "not tracked",
 *    never a false 0): breaks, visits, safeties, fouls.
 */
import type { StatDef } from '../statSchema.ts';
import { FOULS, POINTS } from '../sharedStats.ts';

const keyed = { coverage: 'keyed' as const };
const fewer = { format: { unit: 'count' as const, better: 'lower' as const } };

export const FRAMES_WON: StatDef = { key: 'framesWon', label: 'Frames won', short: 'frames won', one: 'frame won', abbr: 'FW', group: 'record', coverage: 'present' };
export const FRAMES_LOST: StatDef = { key: 'framesLost', label: 'Frames lost', short: 'frames lost', one: 'frame lost', abbr: 'FL', group: 'record', coverage: 'present' };
/** Frame points over every frame (quick frames too). */
export const CUE_POINTS: StatDef = { ...POINTS, group: 'scoring', coverage: 'present' };
export const POINTS_AGAINST: StatDef = { key: 'pointsAgainst', label: 'Points against', short: 'points against', one: 'point against', group: 'scoring', coverage: 'present' };

/** The frames of the match scored shot by shot (the denominator of the
 *  per-frame rates; a quick frame has no breaks). */
export const SHOT_FRAMES: StatDef = { key: 'shotFrames', label: 'Frames scored shot by shot', short: 'frames scored shot by shot', one: 'frame scored shot by shot', group: 'breaks', ...keyed };
/** The best single break: a career / leaderboard MAX, never a sum. */
export const HIGHEST_BREAK: StatDef = {
  key: 'highestBreak', label: 'Highest break', short: 'highest break', abbr: 'HB', group: 'breaks', ...keyed,
  agg: { kind: 'max' }, tieBreak: [{ key: 'centuries', better: 'higher' }, { key: 'fiftyPlus', better: 'higher' }],
};
export const FIFTY_PLUS: StatDef = { key: 'fiftyPlus', label: '50+ breaks', short: '50+ breaks', one: '50+ break', abbr: '50+', group: 'breaks', ...keyed, tieBreak: [{ key: 'highestBreak', better: 'higher' }] };
export const CENTURIES: StatDef = { key: 'centuries', label: 'Century breaks', short: 'centuries', one: 'century', abbr: '100+', group: 'breaks', ...keyed, tieBreak: [{ key: 'highestBreak', better: 'higher' }] };
export const VISITS: StatDef = { key: 'visits', label: 'Visits to the table', short: 'visits', one: 'visit', group: 'play', ...keyed };
export const SAFETIES: StatDef = { key: 'safeties', label: 'Safeties', short: 'safeties', one: 'safety', group: 'play', ...keyed };
export const CUE_FOULS: StatDef = { ...FOULS, abbr: 'FLS', matchSummary: false, group: 'fouls', ...keyed, ...fewer };
export const FOUL_POINTS: StatDef = { key: 'foulPoints', label: 'Penalty points given away', short: 'penalty points given away', one: 'penalty point given away', group: 'fouls', ...keyed, ...fewer };
export const PENALTY_POINTS: StatDef = { key: 'penaltyPoints', label: 'Points from the opponent\'s fouls', short: 'points from fouls', one: 'point from fouls', group: 'fouls', ...keyed };

/** The match record as leaderboard stats (the shared career block shows the
 *  W-L above the sections): the same labels as the racket sports' keys. */
export const MATCHES_WON: StatDef = {
  key: 'matchesWon', label: 'Matches won', short: 'wins', one: 'win', leaderLabel: 'Most wins', source: 'derived', group: 'record',
  agg: { kind: 'result', count: ['W'] }, tieBreak: [{ key: 'winPct', better: 'higher' }, { key: 'framePct', better: 'higher' }],
};
export const WIN_PCT: StatDef = {
  key: 'winPct', label: 'Win %', leaderLabel: 'Best win %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 },
  agg: { kind: 'result', count: ['W'], of: ['W', 'L', 'D', 'T'], scale: 100, dp: 0, qualifier: { games: 3, unit: { label: 'matches', one: 'match' } } },
  tieBreak: [{ key: 'matchesWon', better: 'higher' }, { key: 'framePct', better: 'higher' }],
};
export const FRAMES_WL: StatDef = { key: 'framesWL', label: 'Frames W-L', source: 'derived', group: 'record', format: { unit: 'figure' }, agg: { kind: 'pair', a: 'framesWon', b: 'framesLost' } };
export const FRAME_PCT: StatDef = {
  key: 'framePct', label: 'Frames won %', leaderLabel: 'Best frames won %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 },
  agg: { kind: 'rate', num: 'framesWon', den: ['framesWon', 'framesLost'], scale: 100, dp: 0, qualifier: { den: 6, unit: { label: 'frames', one: 'frame' } } },
  tieBreak: [{ key: 'framesWon', better: 'higher' }],
};
export const POINTS_PER_FRAME: StatDef = {
  key: 'pointsPerFrame', label: 'Points per frame', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 },
  agg: { kind: 'rate', num: 'points', den: ['framesWon', 'framesLost'], dp: 1, qualifier: { den: 6, unit: { label: 'frames', one: 'frame' } } },
};
export const FOULS_PER_FRAME: StatDef = {
  key: 'foulsPerFrame', label: 'Fouls per frame', source: 'derived', group: 'fouls', format: { unit: 'decimal', dp: 1, better: 'lower' },
  agg: { kind: 'rate', num: 'fouls', den: 'shotFrames', dp: 1, qualifier: { den: 6, unit: { label: 'frames', one: 'frame' } } },
};

/** Every shared definition (the schemas spread the ones they use). */
export const CUE_SHARED_STATS: StatDef[] = [
  FRAMES_WON, FRAMES_LOST, CUE_POINTS, POINTS_AGAINST, SHOT_FRAMES, HIGHEST_BREAK, FIFTY_PLUS, CENTURIES, VISITS, SAFETIES,
  CUE_FOULS, FOUL_POINTS, PENALTY_POINTS, MATCHES_WON, WIN_PCT, FRAMES_WL, FRAME_PCT, POINTS_PER_FRAME, FOULS_PER_FRAME,
];

/**
 * Cue batch 5 — foul kinds as career keys (pool and snooker; 'keyed': only on
 * a line whose match was scored shot by shot, so an older line reads "not
 * tracked"). A key two sports share (wrong ball first, off the table, push,
 * jump, touching, other) has one set of labels, here; `foulTouch` and
 * `foulOther` match carrom's.
 */
export const CUE_FOUL_KIND_LABELS: Readonly<Record<string, readonly [label: string, short: string, one: string]>> = {
  foulWrongBall: ['Fouls: wrong ball first', 'wrong-ball fouls', 'wrong-ball foul'],
  foulOffTable: ['Fouls: ball off the table', 'off-table fouls', 'off-table foul'],
  foulOther: ['Fouls: other', 'other fouls', 'other foul'],
  foulTouch: ['Fouls: touching', 'touching fouls', 'touching foul'],
  foulPush: ['Fouls: push stroke', 'push-stroke fouls', 'push-stroke foul'],
  foulJump: ['Fouls: jump shot', 'jump-shot fouls', 'jump-shot foul'],
  // pool only
  foulDoubleHit: ['Fouls: double hit', 'double hits', 'double hit'],
  foulMoving: ['Fouls: balls moving', 'moving-ball fouls', 'moving-ball foul'],
  foulNoFoot: ['Fouls: no foot on the floor', 'no-foot fouls', 'no-foot foul'],
  foulPlacement: ['Fouls: cue ball placement', 'placement fouls', 'placement foul'],
  foulSlowPlay: ['Fouls: slow play', 'slow-play fouls', 'slow-play foul'],
  foulOutOfTurn: ['Fouls: out of turn', 'out-of-turn fouls', 'out-of-turn foul'],
  foulIllegalBreak: ['Fouls: illegal break', 'illegal-break fouls', 'illegal-break foul'],
  // snooker only
  foulInOff: ['Fouls: in-off', 'in-offs', 'in-off'],
  foulNoContact: ['Fouls: missed every ball', 'no-contact fouls', 'no-contact foul'],
  foulPottedWrong: ['Fouls: potted a ball not on', 'wrong-pot fouls', 'wrong-pot foul'],
};
/** One foul-kind StatDef (keyed, fewer is better) in the sport's group. */
export function cueFoulKind(key: string, group: string): StatDef {
  const [label, short, one] = CUE_FOUL_KIND_LABELS[key] ?? [key, key, key];
  return { key, label, short, one, group, ...keyed, ...fewer };
}
