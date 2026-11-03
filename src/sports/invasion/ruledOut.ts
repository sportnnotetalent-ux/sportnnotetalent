/**
 * Invasion batch 6 (docs/sport-expert/invasion.md fix 15): a goal / try ruled
 * out — after a video referral (FIH), a coach's challenge / video review
 * (IIHF / NHL), the TMO (World Rugby) or the Bunker (NRL) — in hockey, ice
 * hockey, rugby union and rugby league, as football has had since the deep
 * wave. Behind a "Stats to track" toggle (`trackRuledOut`, off by default:
 * school matches have no video). A timeline row only: the score never moved,
 * nobody is credited. The scorer logs the score only once it stands; a goal
 * already on the board is taken off with Undo / the timeline. PURE.
 *
 * Action: `RULED_OUT { side, payload: { reason?, review? } }` → an event of
 * type `ruledout` (`side` = the team whose goal / try it was). Only a known
 * reason for the sport and `review === true` are kept (a hostile value is
 * dropped). New logs only: an old match never has the toggle or the row.
 */
import type { FormatField, ScoreAction } from '../types';

export type RuledOutSport = 'hockey' | 'ice_hockey' | 'rugby' | 'rugby_league';
type Side = 'home' | 'away';

/** Why it was ruled out, per sport (the laws' usual reasons). */
export const RULED_OUT_REASONS: Record<RuledOutSport, readonly string[]> = {
  hockey: ['outside', 'foul', 'dangerous', 'other'],
  ice_hockey: ['offside', 'interference', 'kicked', 'highStick', 'other'],
  rugby: ['forwardPass', 'knockOn', 'obstruction', 'heldUp', 'foulPlay', 'other'],
  rugby_league: ['forwardPass', 'knockOn', 'obstruction', 'offside', 'heldUp', 'other'],
};
/** chip label */
export const RULED_OUT_LABEL: Record<string, string> = {
  outside: 'Outside the circle', foul: 'Foul', dangerous: 'Dangerous ball', other: 'Other',
  offside: 'Offside', interference: 'Goalie interference', kicked: 'Kicked in', highStick: 'High stick',
  forwardPass: 'Forward pass', knockOn: 'Knock-on', obstruction: 'Obstruction', heldUp: 'Held up', foulPlay: 'Foul play',
};
/** "… ruled out — {phrase}" */
const PHRASE: Record<string, string> = {
  outside: 'struck from outside the circle', foul: 'a foul', dangerous: 'a dangerous ball', other: '',
  offside: 'offside', interference: 'goalie interference', kicked: 'kicked in', highStick: 'a high stick',
  forwardPass: 'a forward pass', knockOn: 'a knock-on', obstruction: 'obstruction', heldUp: 'held up over the line', foulPlay: 'foul play',
};
/** The video review each sport's laws use. */
export const RULED_OUT_REVIEW: Record<RuledOutSport, string> = {
  hockey: 'video referral', ice_hockey: "coach's challenge / video review", rugby: 'TMO', rugby_league: 'Bunker',
};
export const RULED_OUT_WHAT: Record<RuledOutSport, 'goal' | 'try'> = { hockey: 'goal', ice_hockey: 'goal', rugby: 'try', rugby_league: 'try' };

/** The "Stats to track" toggle (format + live settings: Info lists it). */
export const ruledOutField = (sport: RuledOutSport): FormatField => ({
  key: 'trackRuledOut', label: `${RULED_OUT_WHAT[sport] === 'goal' ? 'Goals' : 'Tries'} ruled out`, type: 'toggle', default: false, group: 'Stats to track',
  hint: `a ${RULED_OUT_WHAT[sport]} disallowed (${RULED_OUT_REVIEW[sport]} or not) — the score never moves`,
});

/** The new keys an action may carry, validated (a hostile value is dropped). */
export function readRuledOut(sport: RuledOutSport, payload: Record<string, unknown> | undefined): { reason?: string; review?: true } {
  const r = payload?.reason;
  return {
    ...(typeof r === 'string' && RULED_OUT_REASONS[sport].includes(r) ? { reason: r } : {}),
    ...(payload?.review === true ? { review: true as const } : {}),
  };
}

/** The action the "Ruled out" button dispatches (the controls add the clock). */
export const ruledOutAction = (sport: RuledOutSport, side: Side, o: { reason?: string; review?: boolean } = {}): ScoreAction =>
  ({ type: 'RULED_OUT', side, payload: readRuledOut(sport, { reason: o.reason, review: o.review === true }) });

/** Is the toggle on in this config (state keys only when on)? */
export const ruledOutConfig = (config?: Record<string, unknown>): { trackRuledOut?: true } => (config?.trackRuledOut === true ? { trackRuledOut: true } : {});

/** Tracked in the match: the toggle, or any logged (a match that switched it off keeps what it logged). */
export const ruledOutTracked = (flag: boolean | undefined, events: readonly { type: string }[]): boolean =>
  flag === true || events.some((e) => e.type === 'ruledout');

/** Timeline row words. */
export function ruledOutRow(sport: RuledOutSport, e: { reason?: string; review?: boolean }): { icon: string; label: string; detail?: string } {
  const what = RULED_OUT_WHAT[sport] === 'goal' ? 'Goal' : 'Try';
  const bits = [e.reason ? RULED_OUT_LABEL[e.reason] : '', e.review ? RULED_OUT_REVIEW[sport] : ''].filter(Boolean);
  return { icon: '❎', label: `${what} ruled out`, ...(bits.length ? { detail: bits.join(' · ') } : {}) };
}

/** Commentary sentence ("Try ruled out for Lions after the TMO — a forward pass. No score."). */
export function ruledOutText(sport: RuledOutSport, team: string, e: { reason?: string; review?: boolean }): string {
  const why = e.reason ? PHRASE[e.reason] : '';
  const rev = e.review ? ` after the ${RULED_OUT_REVIEW[sport]}` : '';
  return `${RULED_OUT_WHAT[sport] === 'goal' ? 'Goal' : 'Try'} ruled out for ${team}${rev}${why ? ` — ${why}` : ''}. No score.`;
}
