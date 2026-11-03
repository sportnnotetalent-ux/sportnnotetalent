/**
 * Ice hockey (IIHF, with NHL / US high-school / youth presets) — the PURE
 * scoring core (SD-145). No React / React Native, so node tests, corrections
 * (#05 AMEND replays) and the device all derive the same match from the same
 * log. Modelled on handball (SD-102) and field hockey (SD-101); field hockey
 * (`hockey`) is a different sport and is untouched.
 *
 * Rules modelled (IIHF Official Rule Book; NHL Official Rules as a preset):
 *  - 3 periods of 20 minutes stop time (youth presets shorter); a STOPPABLE
 *    game clock the scorer starts / stops at every whistle (it stops by itself
 *    on a goal and a penalty unless the organiser turns that off). The face
 *    counts DOWN (20:00 → 0:00); events carry the elapsed game second (`sec`),
 *    so penalties run on playing time and carry over into the next period.
 *  - goals with up to two assists; power-play / short-handed / even-strength
 *    and empty-net flags are worked out from the penalties and the net at the
 *    moment of the goal (the scorer can change them) and stored on the goal.
 *  - shots on goal per team, per shooter and per goalie (saves; goals against
 *    and shots against are derived — save %, GAA); penalty shots.
 *  - penalties: minor 2, bench minor 2, double minor 4, major 5 (with or
 *    without a game misconduct), misconduct 10, game misconduct, match
 *    penalty (5 minutes served by a team-mate, player ejected). At most two
 *    players of a side serve time at once (a third waits: delayed penalty), so
 *    a side never drops below 3 skaters. A power-play goal ends the earliest
 *    running minor of the short-handed side (the current half of a double
 *    minor); majors run in full. Coincident penalties of the same kind at the
 *    same stoppage cancel out (substitutes allowed), except one minor each at
 *    full strength, which is 4 on 4 (IIHF / NHL coincident rules — verify).
 *  - goalie pulled / back (empty net), goalie changes, team time-out.
 *  - overtime (`decider`): 'otso' = one OT of `otMinutes` with `otSkaters` a
 *    side (IIHF round robin 5 min 3 on 3, NHL regular season the same) then a
 *    shoot-out; 'playoff' = OT periods of `poOtMinutes` with `poOtSkaters`
 *    (IIHF play-offs 10 min 3 on 3 (20 in the final) then a shoot-out — verify;
 *    NHL play-offs 20 min 5 on 5 repeated until a goal); 'so' = a shoot-out
 *    straight away; 'none' = a tie stands. Every OT is sudden death.
 *  - shoot-out (IIHF game-winning shots 5 a side, NHL 3), decided early when a
 *    side can't catch up, then one each until decided; the scorer picks who
 *    shoots first, and again for sudden death (SD-139: IIHF reverses the
 *    order, NHL keeps it). The winner is credited one goal in the final score
 *    (IIHF and NHL) — never to a player.
 *
 * Every credit a live action writes on a stat line comes from `eventCredits`
 * (the controls build the attribution from it, and `iceHockeyTotals` sums it
 * over the state), so the absolute statTotals equal the live increments (SD-19).
 */
import type { ScoreAction, LiveSettings, FormatField, Attribution } from '../types';
import { aggPriorFromConfig, aggregateText, levelForDecider, type AggPrior } from '../aggregate.ts';
// Perf F-15 — the format presets / options live in the light meta module.
import { ICE_HOCKEY_PRESETS, TRACK_FIELDS } from './meta.ts';
import { readRuledOut, ruledOutConfig, ruledOutField } from '../invasion/ruledOut.ts';
export { ICE_HOCKEY_PRESETS, TRACK_FIELDS };

export type Side = 'home' | 'away';
export type Strength = 'ev' | 'pp' | 'sh';
export type Decider = 'none' | 'otso' | 'playoff' | 'so';
/** minor 2 · bench minor 2 · double minor 4 · major 5 · major + game
 *  misconduct · misconduct 10 · game misconduct · match penalty */
export type PenKind = 'minor' | 'bench' | 'double' | 'major' | 'majorGm' | 'misconduct' | 'gm' | 'match';
export const PEN_KINDS: PenKind[] = ['minor', 'double', 'major', 'majorGm', 'misconduct', 'gm', 'match', 'bench'];
export const PEN_LABEL: Record<PenKind, string> = {
  minor: 'Minor 2′', bench: 'Bench minor 2′', double: 'Double minor 4′', major: 'Major 5′', majorGm: 'Major 5′ + game misconduct',
  misconduct: 'Misconduct 10′', gm: 'Game misconduct', match: 'Match penalty',
};
/** The common infractions (IIHF / NHL names), for one-tap picking. */
export const INFRACTIONS = [
  'Tripping', 'Hooking', 'Slashing', 'Holding', 'Interference', 'Roughing', 'Cross-checking', 'High-sticking',
  'Boarding', 'Charging', 'Elbowing', 'Too many men', 'Delay of game', 'Unsportsmanlike conduct', 'Fighting', 'Checking to the head',
] as const;
export const STRENGTH_LABEL: Record<Strength, string> = { ev: 'Even strength', pp: 'Power play', sh: 'Short-handed' };

/** Deep wave — the optional "Stats to track" (off by default; the organiser or
 *  the scorer switches them on): faceoffs, hits, blocked shots, giveaways /
 *  takeaways, missed shots. Each is one `TALLY` action (`payload.kind`). */
export type TallyKind = 'faceoff' | 'hit' | 'block' | 'giveaway' | 'takeaway' | 'missed';
export const TALLY_KINDS: TallyKind[] = ['faceoff', 'hit', 'block', 'giveaway', 'takeaway', 'missed'];
export const TALLY_LABEL: Record<TallyKind, string> = {
  faceoff: 'Faceoff won', hit: 'Hit', block: 'Blocked shot', giveaway: 'Giveaway', takeaway: 'Takeaway', missed: 'Missed shot',
};
/** the stat-line key each tally credits (a faceoff also credits the loser `faceoffLosses`) */
export const TALLY_KEY: Record<TallyKind, string> = {
  faceoff: 'faceoffWins', hit: 'checks', block: 'shotBlocks', giveaway: 'giveaways', takeaway: 'takeaways', missed: 'missedShots',
};
/** the toggles (format / live-settings keys) and the tallies each switches on */
export type TrackFlag = 'trackFaceoffs' | 'trackPhysical' | 'trackPuck' | 'trackAttempts';
export const TRACK_FLAGS: TrackFlag[] = ['trackFaceoffs', 'trackPhysical', 'trackPuck', 'trackAttempts'];
export const TRACK_KINDS: Record<TrackFlag, TallyKind[]> = {
  trackFaceoffs: ['faceoff'], trackPhysical: ['hit', 'block'], trackPuck: ['giveaway', 'takeaway'], trackAttempts: ['missed'],
};
export const flagOf = (k: TallyKind): TrackFlag => TRACK_FLAGS.find((f) => TRACK_KINDS[f].includes(k))!;
/** every key a tally can write (faceoff losses included) */
export const TALLY_KEYS = ['faceoffWins', 'faceoffLosses', 'checks', 'shotBlocks', 'giveaways', 'takeaways', 'missedShots'] as const;
/** the keys a toggle owns on every stat line once it's on */
export const FLAG_KEYS: Record<TrackFlag, string[]> = {
  trackFaceoffs: ['faceoffWins', 'faceoffLosses'], trackPhysical: ['checks', 'shotBlocks'], trackPuck: ['giveaways', 'takeaways'], trackAttempts: ['missedShots'],
};

/** Round 2 — the faceoff ZONE (optional, only with Faceoffs tracked: its own
 *  toggle `trackFaceoffZones`). Stored on the faceoff tally from the WINNER's
 *  view: 'oz' = the winner's offensive zone (in the loser's end), 'nz' =
 *  neutral, 'dz' = the winner's defensive zone (in the winner's own end). The
 *  losing centre's zone is the mirror (oz ↔ dz, nz stays) — NHL play-by-play
 *  reads the zone the same way ("won Off. Zone"). */
export type FoZone = 'oz' | 'nz' | 'dz';
export const FO_ZONES: FoZone[] = ['oz', 'nz', 'dz'];
export const FO_ZONE_LABEL: Record<FoZone, string> = { oz: 'Offensive zone', nz: 'Neutral zone', dz: 'Defensive zone' };
export const FO_ZONE_SHORT: Record<FoZone, string> = { oz: 'OZ', nz: 'NZ', dz: 'DZ' };
export const isFoZone = (v: unknown): v is FoZone => v === 'oz' || v === 'nz' || v === 'dz';
/** The same draw from the other side: offensive ↔ defensive, neutral stays. */
export const mirrorZone = (z: FoZone): FoZone => (z === 'oz' ? 'dz' : z === 'dz' ? 'oz' : 'nz');
const ZONE_SUFFIX: Record<FoZone, string> = { oz: 'Oz', nz: 'Nz', dz: 'Dz' };
/** The per-zone key a faceoff credits ('faceoffWinsOz', 'faceoffLossesDz' …). */
export const foZoneKey = (won: boolean, z: FoZone): string => `${won ? 'faceoffWins' : 'faceoffLosses'}${ZONE_SUFFIX[z]}`;
/** every per-zone key (written only when the match tracked zones — keyed) */
export const FO_ZONE_KEYS = ['faceoffWinsOz', 'faceoffWinsNz', 'faceoffWinsDz', 'faceoffLossesOz', 'faceoffLossesNz', 'faceoffLossesDz'] as const;

export interface Who { id?: string; name?: string }

export interface IceEvent {
  /** stable id from the action (`payload.uid`) */
  id: string;
  /** `ruledout` (invasion batch 6): a goal ruled out — a timeline row, only with `trackRuledOut` */
  type: 'goal' | 'shot' | 'miss' | 'pen' | 'gk' | 'pull' | 'back' | 'timeout' | 'tally' | 'ruledout';
  side: Side;
  /** elapsed game seconds since the start of the match (playing time) */
  sec: number;
  period: number;
  /** scorer / shooter / penalised player / new goalie */
  playerId?: string;
  /** @deprecated legacy, read-only — IDs-only logs (docs/privacy/ids-only-scoring.md) keep the id; the name is looked up when shown (invasion/names.ts) */
  playerName?: string;
  /** first assist */
  secondId?: string;
  /** @deprecated legacy, read-only — IDs-only logs (docs/privacy/ids-only-scoring.md) keep the id; the name is looked up when shown (invasion/names.ts) */
  secondName?: string;
  /** second assist (added by ASSIST2) */
  thirdId?: string;
  /** @deprecated legacy, read-only — IDs-only logs (docs/privacy/ids-only-scoring.md) keep the id; the name is looked up when shown (invasion/names.ts) */
  thirdName?: string;
  /** goal: strength at the moment of the goal, empty net, penalty shot */
  strength?: Strength;
  en?: boolean;
  ps?: boolean;
  /** shot (saved): the goalie who saved it (the other side's) */
  gkId?: string;
  /** @deprecated legacy, read-only — IDs-only logs (docs/privacy/ids-only-scoring.md) keep the id; the name is looked up when shown (invasion/names.ts) */
  gkName?: string;
  /** penalty */
  pen?: PenKind;
  infraction?: string;
  /** +/- tracking: skaters on the ice for each side when the goal went in */
  onIce?: { home?: string[]; away?: string[] };
  /** deep wave — an optional tally (`side` = the faceoff winner / hitter /
   *  blocker / the team that gave it away / took it / shot wide; a faceoff's
   *  loser is `second…`, on the other side) */
  tally?: TallyKind;
  /** round 2 — a faceoff's zone from the WINNER's view (zones tracked only) */
  zone?: FoZone;
  /** invasion batch 6: a penalty served by a team-mate (a bench minor, a
   *  goalie's penalty, a match penalty — NHL / IIHF game sheets). No PIM for
   *  him. New logs only. */
  servedId?: string;
  /** @deprecated legacy, read-only (filled by invasion/names.ts) */
  servedName?: string;
  /** invasion batch 6: a ruled-out goal's reason / after a video review */
  reason?: string;
  review?: true;
}

/** Invasion batch 6 (audit fix 14): a miss saved by the goalie or missed
 *  (`outcome`), and the goalie who faced it (`gkId`) — new logs only; an older
 *  attempt carries `scored` (and the shooter) only. */
export interface SoShot {
  scored: boolean; playerId?: string; /** @deprecated legacy, read-only */ playerName?: string;
  outcome?: 'saved' | 'missed';
  gkId?: string; /** @deprecated legacy, read-only */ gkName?: string;
}

export interface XiStamp {
  players?: { id: string; /** @deprecated legacy, read-only */ name?: string }[];
  gk?: { id: string; /** @deprecated legacy, read-only */ name?: string };
}

export interface IceHockeyState {
  /** goals (the shoot-out winner's credited goal is added in `result`) */
  home: number;
  away: number;
  period: number;
  periods: number;
  periodMinutes: number;
  /** skaters a side at full strength (5) */
  skaters: number;
  /** round-robin OT ('otso'): minutes (0 = straight to the shoot-out) and skaters */
  otMinutes: number;
  otSkaters: number;
  /** play-off OT ('playoff'): minutes, skaters, a shoot-out after one OT (IIHF) or repeat (NHL) */
  poOtMinutes: number;
  poOtSkaters: number;
  poShootout: boolean;
  /** shooters a side before sudden death (IIHF 5, NHL 3) */
  soRounds: number;
  /** OT periods started */
  otPeriods: number;
  clock: { ms: number; since?: number };
  played: number[];
  ended: boolean;
  events: IceEvent[];
  seq: number;
  decider: Decider;
  /** the clock stops by itself on a goal and a penalty */
  stopClock: boolean;
  /** PIM for a game misconduct / match penalty: IIHF 20 / 25, NHL 10 / 10 */
  pimScale: 'iihf' | 'nhl';
  /** +/- tracking: who was on the ice at each goal (optional) */
  plusMinus: boolean;
  /** deep wave — "Stats to track" (absent = off; old matches never have them) */
  trackFaceoffs?: boolean;
  trackPhysical?: boolean;
  trackPuck?: boolean;
  trackAttempts?: boolean;
  /** round 2 — faceoff zones (one more tap per draw; only with Faceoffs) */
  trackFaceoffZones?: boolean;
  /** invasion batch 6: the "Goal ruled out" button (absent = off) */
  trackRuledOut?: boolean;
  shootout: { home: SoShot[]; away: SoShot[]; first: Side; sdFirst?: Side } | null;
  shootoutWinner?: Side;
  agg?: AggPrior;
  xi?: { home?: XiStamp; away?: XiStamp };
}

/* --------------------------------- format ---------------------------------- */

// The format presets live in ./meta.ts (perf F-15: light, for the format
// pickers); imported and re-exported at the top of this file.

const bool = (v: unknown, d: boolean) => (v === undefined || v === null || v === '' ? d : v === true || v === 'true' || v === 1);
const num = (v: unknown, d: number, min: number, max: number) => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? d : Math.max(min, Math.min(max, n));
};

export const init = (config?: Record<string, unknown>): IceHockeyState => {
  const d = config?.decider;
  const decider: Decider = d === 'otso' || d === 'playoff' || d === 'so' ? d : 'none';
  return {
    home: 0, away: 0, period: 1, periods: num(config?.periods, 3, 1, 4),
    periodMinutes: num(config?.periodMinutes, 20, 1, 30),
    skaters: num(config?.skaters, 5, 3, 6),
    otMinutes: num(config?.otMinutes, 5, 0, 20),
    otSkaters: num(config?.otSkaters, 3, 3, 5),
    poOtMinutes: num(config?.poOtMinutes, 10, 1, 20),
    poOtSkaters: num(config?.poOtSkaters, 3, 3, 5),
    poShootout: bool(config?.poShootout, true),
    soRounds: num(config?.soRounds, 5, 1, 5),
    otPeriods: 0,
    clock: { ms: 0 }, played: [], ended: false, events: [], seq: 0,
    decider,
    stopClock: bool(config?.stopClock, true),
    pimScale: config?.pimScale === 'nhl' ? 'nhl' : 'iihf',
    plusMinus: bool(config?.plusMinus, false),
    ...Object.fromEntries(TRACK_FLAGS.filter((f) => bool(config?.[f], false)).map((f) => [f, true])),
    ...(bool(config?.trackFaceoffZones, false) ? { trackFaceoffZones: true } : {}),
    ...ruledOutConfig(config),
    shootout: null,
    ...(aggPriorFromConfig(config) ? { agg: aggPriorFromConfig(config) } : {}),
  };
};

/* ---------------------------------- clock ---------------------------------- */

export const isOvertime = (s: Pick<IceHockeyState, 'periods'>, p: number): boolean => p > s.periods;
/** Nominal length (seconds) of period `p`: regulation or the decider's OT. */
export function periodLen(s: Pick<IceHockeyState, 'periods' | 'periodMinutes' | 'decider' | 'otMinutes' | 'poOtMinutes'>, p: number): number {
  if (p <= s.periods) return s.periodMinutes * 60;
  return (s.decider === 'playoff' ? s.poOtMinutes : s.otMinutes) * 60;
}
export function periodOffset(s: IceHockeyState, p = s.period): number {
  let t = 0;
  for (let i = 1; i < p; i++) t += periodLen(s, i);
  return t;
}
export function periodSec(s: IceHockeyState, now = 0): number {
  const ms = s.clock.ms + (s.clock.since && now ? Math.max(0, now - s.clock.since) : 0);
  return Math.min(periodLen(s, s.period), Math.floor(ms / 1000));
}
export const matchSec = (s: IceHockeyState, now = 0): number => periodOffset(s) + periodSec(s, now);
export const running = (s: IceHockeyState): boolean => !!s.clock.since && !s.ended;
export const periodStarted = (s: IceHockeyState): boolean => s.clock.ms > 0 || !!s.clock.since;
export const mmss = (sec: number): string => `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;
/** The clock face: time LEFT in the period, as hockey scoreboards show. */
export const clockFace = (s: IceHockeyState, now = 0): string => mmss(periodLen(s, s.period) - periodSec(s, now));
/** "P1" / "P2" / "P3" / "OT" / "OT2". */
export function periodName(s: Pick<IceHockeyState, 'periods'>, p: number): string {
  if (p <= s.periods) return `P${p}`;
  const k = p - s.periods;
  return k === 1 ? 'OT' : `OT${k}`;
}
export function periodLong(s: Pick<IceHockeyState, 'periods'>, p: number): string {
  if (p <= s.periods) return `${['1st', '2nd', '3rd', '4th'][p - 1] ?? `${p}th`} period`;
  const k = p - s.periods;
  return k === 1 ? 'Overtime' : `Overtime ${k}`;
}
/** Where an event sits: "P2 12:34" (elapsed in the period, as game sheets read). */
export function eventWhen(s: IceHockeyState, e: Pick<IceEvent, 'sec' | 'period'>): string {
  return `${periodName(s, e.period)} ${mmss(e.sec - periodOffset(s, e.period))}`;
}
export const totalPeriods = (s: Pick<IceHockeyState, 'periods' | 'otPeriods'>): number => s.periods + s.otPeriods;

const stopAt = (s: IceHockeyState, at: number): IceHockeyState['clock'] =>
  s.clock.since ? { ms: s.clock.ms + Math.max(0, at - s.clock.since) } : s.clock;

/** Is there another OT period to play after the current one ends level? */
export function nextIsOvertime(s: IceHockeyState): boolean {
  if (!levelForDecider(s)) return false;
  if (s.period < s.periods) return false;
  if (s.decider === 'otso') return s.otPeriods === 0 && s.otMinutes > 0;
  if (s.decider === 'playoff') return s.otPeriods === 0 || !s.poShootout;
  return false;
}
/** Skaters a side in period `p` at full strength (OT may be 3 / 4 on 3 / 4). */
export const baseSkaters = (s: IceHockeyState, p = s.period): number =>
  p <= s.periods ? s.skaters : s.decider === 'playoff' ? s.poOtSkaters : s.otSkaters;

/* ------------------------------ penalty minutes ----------------------------- */

/** PIM a penalty puts on the sheet (IIHF: game misconduct 20, match 25; NHL 10 / 10 — verify). */
export function penMinutes(kind: PenKind, scale: 'iihf' | 'nhl' = 'iihf'): number {
  switch (kind) {
    case 'minor': case 'bench': return 2;
    case 'double': return 4;
    case 'major': return 5;
    case 'majorGm': return 5 + (scale === 'nhl' ? 10 : 20);
    case 'misconduct': return 10;
    case 'gm': return scale === 'nhl' ? 10 : 20;
    case 'match': return scale === 'nhl' ? 10 : 25;
  }
}
/** Time served in the box that leaves the team short (seconds per part). */
export function manpowerParts(kind: PenKind): number[] {
  switch (kind) {
    case 'minor': case 'bench': return [120];
    case 'double': return [120, 120];
    case 'major': case 'majorGm': case 'match': return [300];
    default: return [];
  }
}
/** The player is out of the game (game misconduct, match penalty, major + GM). */
export const ejects = (kind?: PenKind): boolean => kind === 'gm' || kind === 'match' || kind === 'majorGm';

/* --------------------------------- credits --------------------------------- */

const PEN_COUNT_KEY: Partial<Record<PenKind, string>> = {
  minor: 'minors', bench: 'minors', double: 'minors', major: 'majors', majorGm: 'majors', misconduct: 'misconducts', gm: 'gameMisconducts', match: 'matchPenalties',
};
/** Every key a live ice-hockey action credits (statTotals owns all of them). */
export const LIVE_KEYS = [
  'goals', 'assists', 'points', 'shotsOnGoal', 'ppGoals', 'shGoals', 'enGoals', 'saves',
  'penaltyMinutes', 'minors', 'majors', 'misconducts', 'gameMisconducts', 'matchPenalties', 'soTaken', 'soGoals',
] as const;

export type Credit = { playerId: string; playerName?: string; stats: Record<string, number>; side?: Side };

/** The stat-line credits one event writes: [primary, second, third]. A save
 *  is credited to the OTHER side's goalie (`side` on the credit). */
export function eventCredits(
  e: Pick<IceEvent, 'type' | 'side' | 'playerId' | 'playerName' | 'secondId' | 'secondName' | 'thirdId' | 'thirdName' | 'strength' | 'en' | 'ps' | 'gkId' | 'gkName' | 'pen' | 'tally' | 'zone'>,
  scale: 'iihf' | 'nhl' = 'iihf',
): { first?: Credit; second?: Credit; third?: Credit } {
  const p = (stats: Record<string, number>) => (e.playerId ? { playerId: e.playerId, playerName: e.playerName, stats } : undefined);
  switch (e.type) {
    case 'goal': {
      const st: Record<string, number> = { goals: 1, points: 1, shotsOnGoal: 1 };
      if (e.strength === 'pp') st.ppGoals = 1;
      if (e.strength === 'sh') st.shGoals = 1;
      if (e.en) st.enGoals = 1;
      // a penalty-shot goal has no assists
      return {
        first: p(st),
        second: !e.ps && e.secondId ? { playerId: e.secondId, playerName: e.secondName, stats: { assists: 1, points: 1 } } : undefined,
        third: !e.ps && e.thirdId ? { playerId: e.thirdId, playerName: e.thirdName, stats: { assists: 1, points: 1 } } : undefined,
      };
    }
    case 'shot':
      return {
        first: p({ shotsOnGoal: 1 }),
        second: e.gkId ? { playerId: e.gkId, playerName: e.gkName, stats: { saves: 1 }, side: e.side === 'home' ? 'away' : 'home' } : undefined,
      };
    case 'pen': {
      if (!e.pen) return {};
      const key = PEN_COUNT_KEY[e.pen];
      return { first: p({ penaltyMinutes: penMinutes(e.pen, scale), ...(key ? { [key]: 1 } : {}) }) };
    }
    case 'tally': {
      if (!e.tally) return {};
      // round 2: a faceoff's zone credits each centre's own zone (the loser's is the mirror)
      const z = e.tally === 'faceoff' && isFoZone(e.zone) ? e.zone : undefined;
      const loser = e.tally === 'faceoff' && e.secondId
        ? { playerId: e.secondId, playerName: e.secondName, stats: { faceoffLosses: 1, ...(z ? { [foZoneKey(false, mirrorZone(z))]: 1 } : {}) }, side: (e.side === 'home' ? 'away' : 'home') as Side } : undefined;
      return { first: p({ [TALLY_KEY[e.tally]]: 1, ...(z ? { [foZoneKey(true, z)]: 1 } : {}) }), second: loser };
    }
    default:
      return {};
  }
}

/** Credits → an action's `attribution` (sign −1 reverses). */
export function creditAttribution(c: Credit | undefined, sign = 1, tracked?: string[]): Attribution | undefined {
  if (!c) return undefined;
  const entries = Object.entries(c.stats);
  if (!entries.length) return undefined;
  const [[stat, by], ...rest] = entries;
  return {
    playerId: c.playerId, stat, by: by * sign, // IDs-only scoring: never the name
    ...(rest.length ? { extra: Object.fromEntries(rest.map(([k, v]) => [k, v * sign])) } : {}),
    ...(tracked ? { tracked } : {}),
    ...(c.side ? { side: c.side } : {}),
  };
}

/** Screen sweep (S2): the one action a penalty-shot tap logs, as the controls
 *  fire it. Saved = a shot on goal (`ps`) with the save for the goalie in net
 *  when known (`gkId`); missed = a MISS (no shot on goal); scored = a goal
 *  (`ps`, into the empty net when it was). Shooter optional (no squad = the
 *  team's attempt). Same actions as before — no new key. */
export function penaltyShotAction(s: IceHockeyState, side: Side, res: 'scored' | 'saved' | 'missed', shooterId?: string, gkId?: string, tracked?: string[]): ScoreAction {
  if (res === 'missed') return { type: 'MISS', side, payload: shooterId ? { playerId: shooterId } : {} };
  if (res === 'saved') {
    const cr = eventCredits({ type: 'shot', side, playerId: shooterId, gkId }, s.pimScale);
    const attribution = creditAttribution(cr.first, 1, tracked);
    const attribution2 = creditAttribution(cr.second, 1, tracked);
    return { type: 'SHOT', side, payload: { ps: true }, ...(attribution ? { attribution } : {}), ...(attribution2 ? { attribution2 } : {}) };
  }
  const en = netEmpty(s, side === 'home' ? 'away' : 'home');
  const attribution = creditAttribution(eventCredits({ type: 'goal', side, playerId: shooterId, ps: true, en }, s.pimScale).first, 1, tracked);
  return { type: 'GOAL', side, payload: { ps: true, ...(en ? { en: true } : {}) }, ...(attribution ? { attribution } : {}) };
}

/* ------------------------------- penalty box -------------------------------- */

export interface BoxPen {
  id: string;
  side: Side;
  who: Who;
  kind: PenKind;
  infraction?: string;
  /** the manpower parts (seconds) and the one being served */
  parts: number[];
  part: number;
  /** when the current part started (game sec); absent = waiting (delayed) */
  partStart?: number;
  start?: number;
  /** when it ended (game sec) and why */
  end?: number;
  endedBy?: 'time' | 'goal';
  /** cancelled against an equal penalty to the other side (served, no manpower effect) */
  coincident?: boolean;
}

export interface BoxState {
  /** manpower penalties being served now (≤ 2 a side) */
  running: Record<Side, BoxPen[]>;
  /** waiting to start (a third penalty: delayed until one ends) */
  waiting: Record<Side, BoxPen[]>;
  /** every manpower / coincident penalty with its start and end (history) */
  all: BoxPen[];
  /** players serving a misconduct (10′) now, with when it ends */
  misconduct: { side: Side; who: Who; until: number }[];
  /** players out of the game (game misconduct / match / major + GM) */
  ejected: { side: Side; who: Who }[];
}

export const partEnd = (p: BoxPen): number => (p.partStart ?? 0) + p.parts[p.part];
const MINOR_KINDS = new Set<PenKind>(['minor', 'bench', 'double']);
const category = (k: PenKind): 'minor' | 'double' | 'five' => (k === 'double' ? 'double' : k === 'minor' || k === 'bench' ? 'minor' : 'five');

/** Replay the penalties (and power-play goals) up to game second `upTo`:
 *  who is in the box, who waits, who is out of the game. Events after `upTo`
 *  (by log position `uptoIndex`, default all) are ignored. PURE. */
export function penaltyBox(s: IceHockeyState, upTo = Infinity, uptoIndex = s.events.length): BoxState {
  const st: BoxState = { running: { home: [], away: [] }, waiting: { home: [], away: [] }, all: [], misconduct: [], ejected: [] };
  const evs = s.events.slice(0, uptoIndex).map((e, i) => ({ e, i })).filter(({ e }) => (e.type === 'pen' || e.type === 'goal') && e.sec <= upTo)
    .sort((a, b) => a.e.sec - b.e.sec || a.i - b.i).map(({ e }) => e);
  const startNext = (side: Side, at: number) => {
    while (st.running[side].length < 2 && st.waiting[side].length) {
      const p = st.waiting[side].shift()!;
      p.start = at; p.partStart = at;
      st.running[side].push(p);
    }
  };
  /** run the clock forward to `t`: parts end, waiting penalties start */
  const advance = (t: number) => {
    for (;;) {
      let next: { side: Side; p: BoxPen; at: number } | undefined;
      for (const side of ['home', 'away'] as const) for (const p of st.running[side]) {
        const at = partEnd(p);
        if (at <= t && (!next || at < next.at)) next = { side, p, at };
      }
      if (!next) break;
      const { side, p, at } = next;
      if (p.part < p.parts.length - 1) { p.part += 1; p.partStart = at; continue; }
      p.end = at; p.endedBy = 'time';
      st.running[side] = st.running[side].filter((x) => x !== p);
      startNext(side, at);
    }
  };
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    advance(e.sec);
    if (e.type === 'goal') {
      if (e.ps) continue;
      const opp: Side = e.side === 'home' ? 'away' : 'home';
      // the scoring side had more skaters (the other side shorthanded by penalties)
      if (st.running[opp].length <= st.running[e.side].length) continue;
      const minors = st.running[opp].filter((p) => MINOR_KINDS.has(p.kind)).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
      const p = minors[0];
      if (!p) continue;
      if (p.part < p.parts.length - 1) { p.part += 1; p.partStart = e.sec; continue; }
      p.end = e.sec; p.endedBy = 'goal';
      st.running[opp] = st.running[opp].filter((x) => x !== p);
      startNext(opp, e.sec);
      continue;
    }
    // penalties at the same stoppage (same second), both sides together
    const group: IceEvent[] = [e];
    while (i + 1 < evs.length && evs[i + 1].type === 'pen' && evs[i + 1].sec === e.sec) group.push(evs[++i]);
    const fullStrength = !st.running.home.length && !st.running.away.length && !st.waiting.home.length && !st.waiting.away.length;
    const made: BoxPen[] = [];
    for (const g of group) {
      if (!g.pen) continue;
      const who: Who = { id: g.playerId, name: g.playerName ?? (g.pen === 'bench' ? 'Bench' : undefined) };
      if (g.pen === 'misconduct' && (g.playerId || g.playerName)) st.misconduct.push({ side: g.side, who, until: g.sec + 600 });
      if (ejects(g.pen) && (g.playerId || g.playerName)) st.ejected.push({ side: g.side, who });
      const parts = manpowerParts(g.pen);
      if (parts.length) made.push({ id: g.id, side: g.side, who, kind: g.pen, ...(g.infraction ? { infraction: g.infraction } : {}), parts, part: 0 });
    }
    // coincident: equal numbers of the same kind on both sides cancel out —
    // except one minor each at full strength (4 on 4)
    const oneEach = made.length === 2 && made.every((p) => category(p.kind) === 'minor') && made[0].side !== made[1].side;
    if (!(oneEach && fullStrength)) {
      for (const cat of ['minor', 'double', 'five'] as const) {
        const h = made.filter((p) => p.side === 'home' && category(p.kind) === cat);
        const a = made.filter((p) => p.side === 'away' && category(p.kind) === cat);
        const n = Math.min(h.length, a.length);
        for (const p of [...h.slice(0, n), ...a.slice(0, n)]) {
          p.coincident = true; p.start = e.sec; p.partStart = e.sec;
          p.end = e.sec + p.parts.reduce((x, y) => x + y, 0); p.endedBy = 'time';
        }
      }
    }
    for (const p of made) {
      st.all.push(p);
      if (p.coincident) continue;
      st.waiting[p.side].push(p);
      startNext(p.side, e.sec);
    }
  }
  if (Number.isFinite(upTo)) advance(upTo);
  st.misconduct = st.misconduct.filter((m) => m.until > (Number.isFinite(upTo) ? upTo : Infinity));
  return st;
}

/** Skaters on the ice for each side by the penalties (goalies not counted),
 *  mapped for 3-on-3 / 4-on-4 overtime (a penalty adds a skater to the other
 *  side there: 4 on 3, 5 on 3). */
export function skatersOn(s: IceHockeyState, box: BoxState, period = s.period): { home: number; away: number } {
  const base = baseSkaters(s, period);
  const h = box.running.home.length, a = box.running.away.length;
  if (base >= s.skaters) return { home: Math.max(3, base - h), away: Math.max(3, base - a) };
  // d > 0: the away side has more players in the box → home is up
  const d = a - h;
  if (d === 0) return { home: base, away: base };
  const k = Math.abs(d);
  // 3 on 3: 4 on 3, then 5 on 3; 4 on 4: 4 on 3, then 5 on 3
  const up = base === 3 ? Math.min(5, 3 + k) : k >= 2 ? 5 : base;
  return d > 0 ? { home: up, away: 3 } : { home: 3, away: up };
}

/** Is the side's net empty now (goalie pulled, not back)? */
export function netEmpty(s: IceHockeyState, side: Side, uptoIndex = s.events.length): boolean {
  let empty = false;
  for (let i = 0; i < uptoIndex && i < s.events.length; i++) {
    const e = s.events[i];
    if (e.side !== side) continue;
    if (e.type === 'pull') empty = true;
    else if (e.type === 'back' || e.type === 'gk') empty = false;
  }
  return empty;
}

/** The strength a goal by `side` would be scored at, now (the flags the
 *  controls pre-fill): power play / short-handed by the penalties, empty net
 *  when the other side's net is empty. */
export function goalFlagsNow(s: IceHockeyState, side: Side, sec: number): { strength: Strength; en: boolean } {
  const box = penaltyBox(s, sec);
  const on = skatersOn(s, box);
  const opp: Side = side === 'home' ? 'away' : 'home';
  const strength: Strength = on[side] > on[opp] ? 'pp' : on[side] < on[opp] ? 'sh' : 'ev';
  return { strength, en: netEmpty(s, opp) };
}

/** The goalie on duty for a side after the first `uptoIndex` events: the
 *  line-up's goalie, then each goalie change (pulled = undefined). */
export function goalieAt(s: IceHockeyState, side: Side, uptoIndex = s.events.length): Who | undefined {
  let gk: Who | undefined = s.xi?.[side]?.gk ? { id: s.xi[side]!.gk!.id, name: s.xi[side]!.gk!.name } : undefined;
  let pulled = false;
  for (let i = 0; i < uptoIndex && i < s.events.length; i++) {
    const e = s.events[i];
    if (e.side !== side) continue;
    if (e.type === 'gk') { gk = { id: e.playerId, name: e.playerName }; pulled = false; }
    else if (e.type === 'pull') pulled = true;
    else if (e.type === 'back') pulled = false;
  }
  return pulled ? undefined : gk;
}
/** The side's goalie (even while pulled — the one who comes back). */
export function goalieOf(s: IceHockeyState, side: Side): Who | undefined {
  let gk: Who | undefined = s.xi?.[side]?.gk ? { id: s.xi[side]!.gk!.id, name: s.xi[side]!.gk!.name } : undefined;
  for (const e of s.events) if (e.side === side && e.type === 'gk') gk = { id: e.playerId, name: e.playerName };
  return gk;
}

/* --------------------------------- time-out -------------------------------- */

/** One 30-second team time-out a game (IIHF / NHL). */
export function timeoutLeft(s: IceHockeyState, side: Side): number {
  return Math.max(0, 1 - s.events.filter((e) => e.type === 'timeout' && e.side === side).length);
}

/* -------------------------------- shoot-out -------------------------------- */

/** `rounds` shooters each alternately, decided as soon as a side can't catch
 *  up; then one each until a side leads after equal shots. */
export function decideShootout(h: SoShot[], a: SoShot[], rounds = 5): Side | undefined {
  const hs = h.filter((k) => k.scored).length;
  const as = a.filter((k) => k.scored).length;
  if (h.length <= rounds && a.length <= rounds) {
    if (hs > as + Math.max(0, rounds - a.length)) return 'home';
    if (as > hs + Math.max(0, rounds - h.length)) return 'away';
  }
  if (h.length === a.length && h.length >= rounds && hs !== as) return hs > as ? 'home' : 'away';
  return undefined;
}
export function nextShooter(so: NonNullable<IceHockeyState['shootout']>, rounds = 5): Side {
  const n = so.home.length + so.away.length;
  const lead: Side = n >= 2 * rounds && so.sdFirst ? so.sdFirst : so.first;
  const other: Side = lead === 'home' ? 'away' : 'home';
  const behind: Side | undefined = so.home.length < so.away.length ? 'home' : so.away.length < so.home.length ? 'away' : undefined;
  return behind ?? (n % 2 === 0 ? lead : other);
}
export const needsSdPick = (s: Pick<IceHockeyState, 'shootout' | 'shootoutWinner' | 'soRounds'>): boolean =>
  !!s.shootout && !s.shootoutWinner && !s.shootout.sdFirst && s.shootout.home.length === s.soRounds && s.shootout.away.length === s.soRounds;
export const soScore = (s: Pick<IceHockeyState, 'shootout'>) => ({
  home: s.shootout?.home.filter((k) => k.scored).length ?? 0,
  away: s.shootout?.away.filter((k) => k.scored).length ?? 0,
});

/* --------------------------------- reducer --------------------------------- */

/** An id-shaped string (a hostile value is not an id). */
const safeId = (v: unknown): string | undefined => (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(v) ? v : undefined);

/** Invasion batch 6 (audit fix 14): a shoot-out attempt — scored, saved or
 *  missed — with the shooter and the goalie facing it (both optional). The
 *  shooter's soTaken (+ soGoals); the goalie's soShotsFaced (+ soSaves). */
export function soAction(side: Side, outcome: 'scored' | 'saved' | 'missed', shooter?: { id: string } | null, goalie?: { id: string } | null): ScoreAction {
  const scored = outcome === 'scored';
  return {
    type: 'SO', side, payload: { scored, ...(scored ? {} : { outcome }) },
    ...(shooter ? { attribution: { playerId: shooter.id, stat: 'soTaken', ...(scored ? { extra: { soGoals: 1 } } : {}) } } : {}),
    ...(goalie ? { attribution2: { playerId: goalie.id, stat: 'soShotsFaced', ...(outcome === 'saved' ? { extra: { soSaves: 1 } } : {}), side: side === 'home' ? 'away' : 'home' } } : {}),
  };
}

const ENDED_OK = new Set(['START_SHOOTOUT', 'SO', 'SO_ORDER', 'XI', 'STAT_ADJUST', 'REMOVE_EVENT', 'ASSIST2', 'END']);
const strengthOf = (v: unknown): Strength | undefined => (v === 'ev' || v === 'pp' || v === 'sh' ? v : undefined);
const penOf = (v: unknown): PenKind => (PEN_KINDS.includes(v as PenKind) ? (v as PenKind) : 'minor');
const ids = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : undefined);

export const reducer = (s: IceHockeyState, a: ScoreAction): IceHockeyState => {
  if (s.ended && !ENDED_OK.has(a.type)) return s;
  const at = Number(a.payload?.at ?? 0);
  const sec = typeof a.payload?.sec === 'number' ? Math.max(0, a.payload.sec as number) : matchSec(s, at);
  const period = typeof a.payload?.period === 'number' ? (a.payload.period as number) : s.period;
  const uid = typeof a.payload?.uid === 'string' && a.payload.uid ? (a.payload.uid as string) : `e${s.seq + 1}`;
  const side = a.side === 'home' || a.side === 'away' ? a.side : undefined;
  const p1 = a.attribution;
  const p2 = a.attribution2 ?? (a.payload?._attr2 as Attribution | undefined);
  const edit = !!a.payload?.edit;
  const push = (st: IceHockeyState, e: Omit<IceEvent, 'id' | 'sec' | 'period'>): IceHockeyState =>
    ({ ...st, seq: st.seq + 1, events: [...st.events, { id: uid, sec, period, ...e } as IceEvent] });
  const pid = p1?.playerId ?? (typeof a.payload?.playerId === 'string' ? (a.payload.playerId as string) : undefined);
  const pname = p1?.playerName ?? (typeof a.payload?.playerName === 'string' ? (a.payload.playerName as string) : undefined);
  const who1 = pid ? { playerId: pid, ...(pname ? { playerName: pname } : {}) } : pname ? { playerName: pname } : {};
  switch (a.type) {
    case 'CLOCK': {
      if (a.payload?.run) return s.clock.since ? s : { ...s, clock: { ms: s.clock.ms, since: at || 1 } };
      return { ...s, clock: stopAt(s, at) };
    }
    case 'SET_CLOCK': {
      const v = Math.max(0, Math.min(periodLen(s, s.period), Number(a.payload?.periodSec ?? 0)));
      return { ...s, clock: { ms: v * 1000, ...(s.clock.since ? { since: at || s.clock.since } : {}) } };
    }
    case 'XI': {
      const team = a.payload?.team;
      if (team !== 'home' && team !== 'away') return s;
      const players = Array.isArray(a.payload?.players)
        ? (a.payload!.players as { id?: string; name?: string }[]).filter((x) => x?.id).map((x) => ({ id: String(x.id), ...(x.name !== undefined ? { name: String(x.name ?? '') } : {}) }))
        : undefined;
      const gk = a.payload?.gk as { id?: string; name?: string } | undefined;
      const stamp: XiStamp = { ...(players ? { players } : {}), ...(gk?.id ? { gk: { id: String(gk.id), ...(gk.name !== undefined ? { name: String(gk.name ?? '') } : {}) } } : {}) };
      return { ...s, xi: { ...s.xi, [team]: stamp } };
    }
    case 'GOAL': {
      if (!side) return s;
      const ps = a.payload?.ps === true;
      const strength = ps ? undefined : strengthOf(a.payload?.strength) ?? 'ev';
      const onIce = a.payload?.onIce as { home?: unknown; away?: unknown } | undefined;
      const oi = onIce ? { ...(ids(onIce.home) ? { home: ids(onIce.home) } : {}), ...(ids(onIce.away) ? { away: ids(onIce.away) } : {}) } : undefined;
      const scored = { ...s, [side]: s[side] + 1 } as IceHockeyState;
      let next = push(scored, {
        type: 'goal', side, ...who1,
        ...(!ps && p2?.playerId ? { secondId: p2.playerId, ...(p2.playerName ? { secondName: p2.playerName } : {}) } : {}),
        ...(strength ? { strength } : {}), ...(a.payload?.en === true ? { en: true } : {}), ...(ps ? { ps: true } : {}),
        ...(oi && (oi.home || oi.away) ? { onIce: oi } : {}),
      });
      // (no time on the action = a replayed / imported row: the clock is left alone)
      if (s.stopClock && !edit && at) next = { ...next, clock: stopAt(next, at) };
      // sudden death: a goal in overtime ends the match (on aggregate, the tie)
      if (isOvertime(s, period) && !edit && !levelForDecider(next)) next = { ...next, clock: stopAt(next, at), ended: true };
      return next;
    }
    case 'ASSIST2': {
      // the second assist on a goal (its own action: a credit for a third player)
      const ref = String(a.payload?.ref ?? '');
      if (!ref || !p1?.playerId) return s;
      const events = s.events.map((e) => (e.id === ref && e.type === 'goal' && !e.ps ? { ...e, thirdId: p1.playerId, ...(p1.playerName ? { thirdName: p1.playerName } : {}) } : e));
      return { ...s, events };
    }
    case 'SHOT': {
      // a shot on goal the goalie saved (a goal is its own action)
      if (!side) return s;
      const gk = p2?.playerId ? { gkId: p2.playerId, ...(p2.playerName ? { gkName: p2.playerName } : {}) } : {};
      return push(s, { type: 'shot', side, ...who1, ...gk, ...(a.payload?.ps === true ? { ps: true } : {}) });
    }
    case 'MISS': {
      // a penalty shot that missed the net (no shot on goal)
      if (!side) return s;
      return push(s, { type: 'miss', side, ...who1, ps: true });
    }
    case 'PEN': {
      if (!side) return s;
      const pen = penOf(a.payload?.pen);
      const infraction = typeof a.payload?.infraction === 'string' && a.payload.infraction ? (a.payload.infraction as string) : undefined;
      // invasion batch 6: served by a team-mate (an id; never the penalised player himself)
      const served = safeId(a.payload?.servedId);
      const next = push(s, { type: 'pen', side, pen, ...(pen === 'bench' && !pid ? {} : who1), ...(infraction ? { infraction } : {}), ...(served && served !== pid ? { servedId: served } : {}) });
      return s.stopClock && !edit && at ? { ...next, clock: stopAt(next, at) } : next;
    }
    case 'GK': {
      if (!side || !a.payload?.id) return s;
      return push(s, { type: 'gk', side, playerId: String(a.payload.id), ...(a.payload.name !== undefined ? { playerName: String(a.payload.name ?? '') } : {}) });
    }
    case 'PULL': return side ? push(s, { type: 'pull', side }) : s;
    case 'BACK': return side ? push(s, { type: 'back', side }) : s;
    case 'TALLY': {
      // deep wave: an optional tally (faceoff / hit / block / giveaway / takeaway / missed shot)
      const kind = a.payload?.kind as TallyKind;
      if (!side || !TALLY_KINDS.includes(kind)) return s;
      // round 2: a faceoff may carry its zone (winner's view); an unknown zone is ignored
      const zone = kind === 'faceoff' && isFoZone(a.payload?.zone) ? (a.payload!.zone as FoZone) : undefined;
      return push(s, {
        type: 'tally', side, tally: kind, ...who1, ...(kind === 'faceoff' && p2?.playerId ? { secondId: p2.playerId, ...(p2.playerName ? { secondName: p2.playerName } : {}) } : {}),
        ...(zone ? { zone } : {}),
      });
    }
    case 'RULED_OUT':
      // invasion batch 6: a goal ruled out — a timeline row; the score never moved
      return side ? push(s, { type: 'ruledout', side, ...readRuledOut('ice_hockey', a.payload) }) : s;
    case 'TIMEOUT': {
      if (!side) return s;
      const next = push(s, { type: 'timeout', side });
      return edit || !at ? next : { ...next, clock: stopAt(next, at) };
    }
    case 'REMOVE_EVENT': {
      const id = String(a.payload?.id ?? '');
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      const next = { ...s, events: s.events.filter((e) => e !== ev) };
      if (ev.type === 'goal') {
        const out = { ...next, [ev.side]: Math.max(0, next[ev.side] - 1) } as IceHockeyState;
        // an OT winner removed: the match is live again (until the scorer ends it)
        return out.ended && isOvertime(s, ev.period) && !out.shootout && levelForDecider(out) ? { ...out, ended: false } : out;
      }
      return next;
    }
    case 'END_PERIOD': {
      const clock = stopAt(s, at);
      const len = clock.ms > 0 ? Math.min(periodLen(s, s.period), Math.floor(clock.ms / 1000)) : periodLen(s, s.period);
      const played = [...s.played.slice(0, s.period - 1), len];
      if (s.period < s.periods) return { ...s, played, period: s.period + 1, clock: { ms: 0 } };
      if (nextIsOvertime(s)) return { ...s, played, otPeriods: s.otPeriods + 1, period: s.period + 1, clock: { ms: 0 } };
      return { ...s, played, clock: { ms: periodLen(s, s.period) * 1000 }, ended: true };
    }
    case 'END':
      return s.ended ? s : { ...s, ended: true, clock: stopAt(s, at) };
    case 'START_SHOOTOUT': {
      if (!s.ended || !levelForDecider(s) || s.shootout || s.decider === 'none') return s;
      if (s.decider === 'playoff' && !s.poShootout) return s;
      return { ...s, shootout: { home: [], away: [], first: a.payload?.first === 'away' ? 'away' : 'home' } };
    }
    case 'SO_ORDER': {
      const f = a.payload?.first;
      if (!needsSdPick(s) || (f !== 'home' && f !== 'away')) return s;
      return { ...s, shootout: { ...s.shootout!, sdFirst: f } };
    }
    case 'SO': {
      if (!s.shootout || s.shootoutWinner || !side) return s;
      const scored = a.payload?.scored === true;
      // invasion batch 6: saved / missed, and the goalie (credited, so read from attribution2 only)
      const oc = a.payload?.outcome;
      const shot: SoShot = {
        scored, ...(p1?.playerId ? { playerId: p1.playerId } : {}), ...(p1?.playerName ? { playerName: p1.playerName } : {}),
        ...(!scored && (oc === 'saved' || oc === 'missed') ? { outcome: oc } : {}),
        ...(safeId(p2?.playerId) ? { gkId: p2!.playerId } : {}),
      };
      const so = { ...s.shootout, [side]: [...s.shootout[side], shot] };
      return { ...s, shootout: so, shootoutWinner: decideShootout(so.home, so.away, s.soRounds) };
    }
    case 'STAT_ADJUST':
    default:
      return s;
  }
};

/* ----------------------------- derived figures ----------------------------- */

export const levelAtEnd = (s: IceHockeyState): boolean => levelForDecider(s);
export const aggLine = (s: IceHockeyState): string | undefined => aggregateText(s);

export const isComplete = (s: IceHockeyState): boolean =>
  s.ended && (!levelForDecider(s) || s.decider === 'none' || (s.decider === 'playoff' && !s.poShootout) || s.shootoutWinner != null);

/** How the match was decided: regulation, overtime or the shoot-out. */
export function decidedIn(s: IceHockeyState): 'reg' | 'ot' | 'so' | undefined {
  if (!isComplete(s)) return undefined;
  if (s.shootoutWinner) return 'so';
  if (levelForDecider(s)) return undefined; // a tie that stands
  return s.events.some((e) => e.type === 'goal' && isOvertime(s, e.period)) ? 'ot' : 'reg';
}

export function result(s: IceHockeyState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!isComplete(s)) return null;
  const byGoals = s.home > s.away ? 'home' : s.away > s.home ? 'away' : undefined;
  const winner = s.agg ? (s.shootoutWinner ?? byGoals ?? 'draw') : (byGoals ?? s.shootoutWinner ?? 'draw');
  // IIHF / NHL: the shoot-out winner is credited one goal in the final score
  const bonus = s.shootoutWinner && !byGoals ? s.shootoutWinner : undefined;
  return { winner, home: s.home + (bonus === 'home' ? 1 : 0), away: s.away + (bonus === 'away' ? 1 : 0) };
}

/** Team figures (comparison panel) over a period scope. */
export interface IceTeamFigures {
  goals: number; shotsOnGoal: number; saves: number; ppGoals: number; shGoals: number; enGoals: number;
  penalties: number; penaltyMinutes: number; timeouts: number;
  /** power-play chances: the opponent's penalties that put this side up a skater */
  ppChances: number;
}
export function teamFigures(s: IceHockeyState, side: Side, scope: 'all' | number = 'all'): IceTeamFigures {
  const f: IceTeamFigures = { goals: 0, shotsOnGoal: 0, saves: 0, ppGoals: 0, shGoals: 0, enGoals: 0, penalties: 0, penaltyMinutes: 0, timeouts: 0, ppChances: 0 };
  const opp: Side = side === 'home' ? 'away' : 'home';
  for (const e of s.events) {
    if (scope !== 'all' && e.period !== scope) continue;
    if (e.side === side) {
      if (e.type === 'goal') { f.goals++; f.shotsOnGoal++; if (e.strength === 'pp') f.ppGoals++; if (e.strength === 'sh') f.shGoals++; if (e.en) f.enGoals++; }
      else if (e.type === 'shot') f.shotsOnGoal++;
      else if (e.type === 'pen' && e.pen) { f.penalties++; f.penaltyMinutes += penMinutes(e.pen, s.pimScale); }
      else if (e.type === 'timeout') f.timeouts++;
    } else if (e.side === opp && e.type === 'shot') f.saves++;
  }
  // deep wave: an opportunity is a penalty that left this side a skater up at
  // some point (coincident minors at full strength — 4 on 4 — aren't)
  f.ppChances = ppOpportunities(s).filter((p) => p.side === opp && (scope === 'all' || s.events.find((e) => e.id === p.id)?.period === scope)).length;
  return f;
}

/** Deep wave — the manpower penalties that put the OTHER side on a power play
 *  at some point (more skaters by the penalties): a 4-on-4 from coincident
 *  minors isn't one, a double minor that outlasts its 4-on-4 is. Counted per
 *  PENALTY (NHL convention, kept in round 2): a 5-on-3 from two penalties is
 *  two opportunities. PURE. */
export function ppOpportunities(s: IceHockeyState, endSec = Math.max(matchSec(s), ...s.events.map((e) => e.sec), 0)): BoxPen[] {
  const box = penaltyBox(s, endSec);
  const iv = box.all.filter((p) => !p.coincident && p.start != null).map((p) => ({ p, from: p.start!, to: Math.min(endSec, p.end ?? endSec) }));
  const cuts = [...new Set(iv.flatMap((x) => [x.from, x.to]))].sort((a, b) => a - b);
  const adv = new Set<BoxPen>();
  for (let i = 0; i + 1 < cuts.length; i++) {
    const mid = (cuts[i] + cuts[i + 1]) / 2;
    const on = iv.filter((x) => x.from <= mid && mid < x.to);
    const h = on.filter((x) => x.p.side === 'home').length, a = on.filter((x) => x.p.side === 'away').length;
    if (h !== a) for (const x of on) if (x.p.side === (h > a ? 'home' : 'away')) adv.add(x.p);
  }
  return iv.filter((x) => adv.has(x.p)).map((x) => x.p);
}

/** The line under the score: the shoot-out ("SO 3–2"), '' otherwise. */
export function iceHockeyScoreLine(s: IceHockeyState, perspective?: Side): string {
  if (!s?.shootout) return '';
  const so = soScore(s);
  return perspective === 'away' ? `SO ${so.away}–${so.home}` : `SO ${so.home}–${so.away}`;
}

/** Standings units: decided after regulation (OT / shoot-out) → the IIHF
 *  3-2-1-0 / NHL overtime-loss point. */
export function standingsUnits(s: IceHockeyState): { overtime?: boolean; decidedIn?: 'reg' | 'ot' | 'so' } | null {
  const d = decidedIn(s);
  if (!d) return null;
  return { decidedIn: d, ...(d !== 'reg' ? { overtime: true } : {}) };
}

/* --------------------------- live settings (#14) --------------------------- */

/** Is this tally tracked in the match — its toggle on, or any recorded? */
export const tallyTracked = (s: Pick<IceHockeyState, TrackFlag | 'events'>, f: TrackFlag): boolean =>
  s[f] === true || s.events.some((e) => e.type === 'tally' && !!e.tally && TRACK_KINDS[f].includes(e.tally));
/** Round 2 — are faceoff zones tracked: the toggle on with Faceoffs tracked,
 *  or any faceoff recorded with its zone? (Never on an old match.) */
export const zonesTracked = (s: Pick<IceHockeyState, TrackFlag | 'trackFaceoffZones' | 'events'>): boolean =>
  (s.trackFaceoffZones === true && tallyTracked(s, 'trackFaceoffs')) || s.events.some((e) => e.type === 'tally' && e.tally === 'faceoff' && isFoZone(e.zone));

export const ICE_HOCKEY_LIVE_SETTINGS: LiveSettings<IceHockeyState> = {
  title: '⚙️ Match settings',
  hint: 'Applies to this match only.',
  mode: 'config',
  fields: [
    { key: 'periodMinutes', label: 'Period length', type: 'number', default: 20, min: 1, max: 30, step: 1, hint: 'min / period' },
    { key: 'stopClock', label: 'Stop the clock on goals and penalties', type: 'toggle', default: true, group: 'Clock' },
    { key: 'plusMinus', label: 'Track +/- (who was on the ice at each goal)', type: 'toggle', default: false, group: 'Stats' },
    ...TRACK_FIELDS,
    ruledOutField('ice_hockey'),
  ] as FormatField[],
  read: (s) => ({ periodMinutes: s.periodMinutes, stopClock: s.stopClock, plusMinus: s.plusMinus, ...Object.fromEntries(TRACK_FLAGS.map((f) => [f, s[f] === true])), trackFaceoffZones: s.trackFaceoffZones === true, trackRuledOut: s.trackRuledOut === true }),
  defaults: { periodMinutes: 20, stopClock: true, plusMinus: false, ...Object.fromEntries(TRACK_FLAGS.map((f) => [f, false])), trackFaceoffZones: false, trackRuledOut: false },
};
