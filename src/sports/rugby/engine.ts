/**
 * Rugby union (World Rugby) — the PURE scoring core (SD-143). No React / React
 * Native, so node tests, corrections (#05 AMEND replays) and the device all
 * derive the same match from the same log. Modelled on handball (SD-102).
 *
 * Rules modelled (World Rugby Laws of the Game; sevens + age-grade variations):
 *  - Law 5 (Time): 2 halves of at most 40 minutes (15s). Sevens: 2 × 7 (a
 *    competition may play 2 × 10 in a final — verify against its rules).
 *    Age-grade halves are shorter (school presets, organiser-editable). The
 *    referee keeps time and stops the watch for stoppages, so the clock runs
 *    PAST 40:00 (the half ends when the ball next goes dead) — shown as
 *    "40:00 +1:12". Events carry the playing second of the match (`sec`, the
 *    sum of the halves as actually played) and of their half (`psec`), so a
 *    sin-bin runs on playing time across half-time.
 *  - Law 8 (Scoring): try 5, penalty try 7 (no conversion attempted),
 *    conversion 2, penalty goal 3, dropped goal 3. The kicker is credited
 *    with conversions / penalty goals / drop goals (made and attempted).
 *  - Law 9 (Foul play): yellow card = a temporary suspension of 10 minutes
 *    playing time (sevens 2 minutes — sevens variation); red card = off for
 *    the rest of the match, the team plays short. A second yellow to the same
 *    player = a red card. World Rugby's 20-minute red card global law trial
 *    (2025): an organiser option — the player is off for good, but the team
 *    may bring on a replacement after 20 minutes (two yellows then = a
 *    20-minute red). The referee can still give a full red.
 *  - Law 3 (Team): replacements (8 in senior 15s, 5 in sevens — organiser
 *    limit; 0 = unlimited), temporary replacements for a head injury
 *    assessment (HIA) or a blood injury, and rolling replacements as an
 *    age-grade option (a replaced player may come back on).
 *  - Knockouts: competition-specific — the organiser picks the decider.
 *    Standard 15s (Rugby World Cup 2023 rules): 2 × 10 min extra time, then
 *    10 min sudden death, then a kicking competition (5 kicks each, then one
 *    each). Standard sevens: sudden-death periods of 5 minutes until a team
 *    scores. In sudden death the first score wins (no conversion).
 *
 * Deep wave — optional "Stats to track" beyond `trackDetail` (penalties by
 * offence & free kicks, turnovers conceded, 22 entries, possession &
 * territory, offloads): `TALLY` events and `POSSESSION` / `TERRITORY`
 * switches; each flag is in the state only when on, so an old match's state
 * (and lines) never change. The sheet (./sheet.ts) and the commentary
 * (./commentary.ts) read them.
 *
 * Round 2 (founder answers): a free kick credits the player who conceded it
 * (optional — `freeKicksConceded`, keyed once a match asked for the player);
 * the possession bar's "Ball dead" switch (`BALL_DEAD`) pauses the possession
 * and territory clocks at stoppages.
 *
 * Every credit a live action writes on a stat line comes from `eventCredits`
 * (the controls build the attribution from it, and `rugbyTotals` sums it over
 * the state), so the absolute statTotals equal the live increments (SD-19).
 */
import type { ScoreAction, LiveSettings, FormatField, Attribution } from '../types';
import { aggPriorFromConfig, aggregateText, levelForDecider, type AggPrior } from '../aggregate.ts';
// Perf F-15 — the format presets / options live in the light meta module.
import { RUGBY_PRESETS, TRACK_FIELDS } from './meta.ts';
export { RUGBY_PRESETS, TRACK_FIELDS };

export type Side = 'home' | 'away';
export type Variant = '15s' | '10s' | '7s';
export type KickKind = 'conv' | 'pen' | 'drop';
export type CardKind = 'yellow' | 'red';
/** what a level match does at full time (resolved — 'standard' is read from the variant) */
export type Decider = 'none' | 'et' | 'etKicks' | 'sd' | 'kicks';
export type PeriodKind = 'reg' | 'et' | 'sd';
/** optional detail (off by default, `trackDetail`) */
export type DetailKey = 'tackle' | 'missedTackle' | 'carry' | 'lineBreak' | 'turnoverWon' | 'penaltyConceded';
export type SetPiece = 'lineout' | 'scrum';

export const DETAIL_KEYS: DetailKey[] = ['tackle', 'missedTackle', 'carry', 'lineBreak', 'turnoverWon', 'penaltyConceded'];
export const DETAIL_STAT: Record<DetailKey, string> = {
  tackle: 'tackles', missedTackle: 'missedTackles', carry: 'carries', lineBreak: 'lineBreaks', turnoverWon: 'turnoversWon', penaltyConceded: 'penaltiesGivenAway',
};
export const DETAIL_LABEL: Record<DetailKey, string> = {
  tackle: 'Tackle', missedTackle: 'Missed tackle', carry: 'Carry', lineBreak: 'Line break', turnoverWon: 'Turnover won', penaltyConceded: 'Penalty conceded',
};
/** Deep wave — the optional "Stats to track" (off by default; the organiser or
 *  the scorer switches each on). Separate from `trackDetail`, so an old match
 *  that tracked detail never gains a new key. Each capture is one `TALLY`
 *  action (`payload.kind`); possession and territory are `POSSESSION` /
 *  `TERRITORY` switches kept in `ball` (not events — there are dozens). */
export type TallyKind = 'penalty' | 'freeKick' | 'turnover' | 'entry' | 'offload';
export const TALLY_KINDS: TallyKind[] = ['penalty', 'freeKick', 'turnover', 'entry', 'offload'];
export const TALLY_LABEL: Record<TallyKind, string> = {
  penalty: 'Penalty conceded', freeKick: 'Free kick conceded', turnover: 'Turnover conceded', entry: '22 entry', offload: 'Offload',
};
/** the stat-line key a tally credits to its player (22 entries are the team's).
 *  Round 2 (founder): a free kick credits the player who conceded it — optional,
 *  like a penalty; older one-tap free kicks were the team's. */
export const TALLY_KEY: Partial<Record<TallyKind, string>> = { penalty: 'penaltiesGivenAway', freeKick: 'freeKicksConceded', turnover: 'turnoversConceded', offload: 'offloads' };
/** every player key a tally can write */
export const TALLY_KEYS = ['penaltiesGivenAway', 'freeKicksConceded', 'turnoversConceded', 'offloads'] as const;
export type TrackFlag = 'trackPenalties' | 'trackTurnovers' | 'trackEntries' | 'trackPossession' | 'trackOffloads';
export const TRACK_FLAGS: TrackFlag[] = ['trackPenalties', 'trackTurnovers', 'trackEntries', 'trackPossession', 'trackOffloads'];
/** the tallies each toggle switches on (possession / territory are switches, not tallies) */
export const TRACK_KINDS: Record<TrackFlag, TallyKind[]> = {
  trackPenalties: ['penalty', 'freeKick'], trackTurnovers: ['turnover'], trackEntries: ['entry'], trackPossession: [], trackOffloads: ['offload'],
};
/** the player keys a toggle owns on every stat line once it's on */
export const FLAG_KEYS: Record<TrackFlag, string[]> = {
  trackPenalties: ['penaltiesGivenAway'], trackTurnovers: ['turnoversConceded'], trackEntries: [], trackPossession: [], trackOffloads: ['offloads'],
};
/** World Rugby penalty offences, grouped as match statistics report them (Opta). */
export type Infringement = 'offside' | 'breakdown' | 'notReleasing' | 'foulPlay' | 'scrum' | 'lineout' | 'obstruction' | 'other';
export const INFRINGEMENTS: Infringement[] = ['offside', 'breakdown', 'notReleasing', 'foulPlay', 'scrum', 'lineout', 'obstruction', 'other'];
export const INFRINGEMENT_LABEL: Record<Infringement, string> = {
  offside: 'Offside', breakdown: 'Ruck / breakdown', notReleasing: 'Not releasing', foulPlay: 'High tackle / foul play',
  scrum: 'Scrum', lineout: 'Lineout / maul', obstruction: 'Obstruction', other: 'Other',
};
/** how a team gave the ball away (turnover conceded) */
export type TurnoverCause = 'knockOn' | 'forwardPass' | 'handling' | 'breakdown' | 'kickOut' | 'other';
export const TURNOVER_CAUSES: TurnoverCause[] = ['knockOn', 'forwardPass', 'handling', 'breakdown', 'kickOut', 'other'];
export const CAUSE_LABEL: Record<TurnoverCause, string> = {
  knockOn: 'Knock-on', forwardPass: 'Forward pass', handling: 'Handling error', breakdown: 'Lost at ruck / maul', kickOut: 'Kicked out on the full', other: 'Other',
};
/** a possession / territory switch on the playing clock (`side` = who has the
 *  ball / whose territory: play in the OTHER side's half). Round 2: a `dead`
 *  possession mark = the "Ball dead" switch — from `sec` neither side's
 *  possession or territory clock runs until the next possession tap (`side`
 *  keeps who had it, so "Ball live" resumes with them). */
export interface BallMark { kind: 'poss' | 'terr'; side: Side; sec: number; period: number; dead?: true }

export const KICK_LABEL: Record<KickKind, string> = { conv: 'Conversion', pen: 'Penalty goal', drop: 'Drop goal' };
export const KICK_POINTS: Record<KickKind, number> = { conv: 2, pen: 3, drop: 3 };
export const TRY_POINTS = 5;
export const PENALTY_TRY_POINTS = 7;

export interface Who { id?: string; name?: string }

export interface RugbyEvent {
  /** stable id from the action (`payload.uid`) */
  id: string;
  type: 'try' | 'pentry' | 'kick' | 'card' | 'sub' | 'detail' | 'setpiece' | 'tally';
  side: Side;
  /** playing seconds since the kick-off (the halves as actually played) */
  sec: number;
  /** playing seconds into its period (past the nominal length = time added) */
  psec: number;
  period: number;
  /** try scorer / kicker / carded player / sub off / detail player */
  playerId?: string;
  /** @deprecated legacy, read-only — IDs-only logs (docs/privacy/ids-only-scoring.md) keep the id; the name is looked up when shown (invasion/names.ts) */
  playerName?: string;
  /** try assist / sub on */
  secondId?: string;
  /** @deprecated legacy, read-only — IDs-only logs (docs/privacy/ids-only-scoring.md) keep the id; the name is looked up when shown (invasion/names.ts) */
  secondName?: string;
  kick?: KickKind;
  made?: boolean;
  card?: CardKind;
  /** a red under the 20-minute red card trial (replaceable after 20') */
  red20?: boolean;
  /** a red for a second yellow */
  second?: boolean;
  /** a team official's card (name) */
  official?: string;
  /** sub: a temporary replacement (HIA / blood) */
  temp?: 'hia' | 'blood';
  /** sub: the temporarily replaced player coming back on */
  back?: boolean;
  detail?: DetailKey;
  piece?: SetPiece;
  won?: boolean;
  /** deep wave — an optional tally (`side` = the team that conceded the
   *  penalty / free kick / turnover, entered the 22, made the offload) */
  tally?: TallyKind;
  /** a penalty's offence (optional — skipped = not recorded) */
  infringement?: Infringement;
  /** a turnover's cause (optional) */
  cause?: TurnoverCause;
  /** round 2 — a free kick recorded with the player asked (named or "Team (no
   *  name)"): free kicks are credited to players in a match once one was asked.
   *  An older one-tap free kick never has it, so its match never shows a false 0. */
  asked?: boolean;
}

export interface Kick { scored: boolean; playerId?: string; /** @deprecated legacy, read-only */ playerName?: string }
/** IDs-only scoring: new stamps carry ids only (`name` = an older stamp's, read-only). */
export interface XiStamp { players?: { id: string; name?: string }[] }

export interface RugbyState {
  home: number;
  away: number;
  period: number;
  /** the periods so far / planned: 2 halves, then extra time / sudden death */
  plan: PeriodKind[];
  periodMinutes: number;
  etMinutes: number;
  sdMinutes: number;
  clock: { ms: number; since?: number };
  /** actual playing seconds of each finished period */
  played: number[];
  ended: boolean;
  events: RugbyEvent[];
  seq: number;
  variant: Variant;
  playersPerSide: number;
  decider: Decider;
  sinBinMinutes: number;
  /** 20-minute red card (World Rugby global law trial) offered to the scorer */
  red20: boolean;
  /** replacements allowed per team (0 = no limit) */
  maxSubs: number;
  /** rolling replacements (age-grade): a replaced player may come back on */
  rolling: boolean;
  /** optional detail: tackles, carries, line breaks, set pieces… */
  trackDetail: boolean;
  /** deep wave — "Stats to track" (absent = off; old matches never have them) */
  trackPenalties?: boolean;
  trackTurnovers?: boolean;
  trackEntries?: boolean;
  trackPossession?: boolean;
  trackOffloads?: boolean;
  /** deep wave — possession / territory switches (absent until the first one) */
  ball?: BallMark[];
  /** the kicking competition (`first` = the scorer's pick after the toss;
   *  `sdFirst` = who kicks first in sudden death, picked after 5 each) */
  shootout: { home: Kick[]; away: Kick[]; first: Side; sdFirst?: Side } | null;
  shootoutWinner?: Side;
  agg?: AggPrior;
  xi?: { home?: XiStamp; away?: XiStamp };
}

/* --------------------------------- format ---------------------------------- */

// The format presets live in ./meta.ts (perf F-15: light, for the format
// pickers); imported and re-exported at the top of this file.

const bool = (v: unknown, d: boolean) => (v === undefined || v === null || v === '' ? d : v === true || v === 'true' || v === 1);
const num = (v: unknown, d: number, min = 0) => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? d : Math.max(min, n); };

export const variantOf = (config?: Record<string, unknown>): Variant => {
  const v = config?.variant;
  if (v === '7s' || v === '10s' || v === '15s') return v;
  const n = Number(config?.playersPerSide);
  return n === 7 ? '7s' : n === 10 ? '10s' : '15s';
};
/** 'standard' (the knockout default) → the variant's rule: sevens / tens
 *  sudden-death periods, 15s extra time + sudden death + kicks. */
export function resolveDecider(d: unknown, variant: Variant): Decider {
  if (d === 'standard') return variant === '15s' ? 'et' : 'sd';
  return d === 'et' || d === 'etKicks' || d === 'sd' || d === 'kicks' ? d : 'none';
}

export const init = (config?: Record<string, unknown>): RugbyState => {
  const variant = variantOf(config);
  const p7 = variant === '7s';
  const p10 = variant === '10s';
  return {
    home: 0, away: 0, period: 1, plan: ['reg', 'reg'],
    periodMinutes: num(config?.periodMinutes, p7 ? 7 : p10 ? 10 : 40, 1),
    etMinutes: num(config?.etMinutes, p7 || p10 ? 5 : 10, 1),
    sdMinutes: num(config?.sdMinutes, p7 || p10 ? 5 : 10, 1),
    clock: { ms: 0 }, played: [], ended: false, events: [], seq: 0,
    variant,
    playersPerSide: num(config?.playersPerSide, p7 ? 7 : p10 ? 10 : 15, 1),
    decider: resolveDecider(config?.decider, variant),
    sinBinMinutes: num(config?.sinBinMinutes, p7 || p10 ? 2 : 10, 1),
    red20: bool(config?.red20, false),
    maxSubs: num(config?.maxSubs, p7 || p10 ? 5 : 8),
    rolling: bool(config?.rolling, false),
    trackDetail: bool(config?.trackDetail, false),
    ...Object.fromEntries(TRACK_FLAGS.filter((f) => bool(config?.[f], false)).map((f) => [f, true])),
    shootout: null,
    ...(aggPriorFromConfig(config) ? { agg: aggPriorFromConfig(config) } : {}),
  };
};

/* ---------------------------------- clock ---------------------------------- */

/** Nominal length (seconds) of period `p`. */
export function periodLen(s: Pick<RugbyState, 'plan' | 'periodMinutes' | 'etMinutes' | 'sdMinutes'>, p: number): number {
  const k = s.plan[p - 1] ?? 'reg';
  return (k === 'reg' ? s.periodMinutes : k === 'et' ? s.etMinutes : s.sdMinutes) * 60;
}
/** Nominal match time before period `p` (what the scoreboard clock shows at its start). */
export function nominalOffset(s: Pick<RugbyState, 'plan' | 'periodMinutes' | 'etMinutes' | 'sdMinutes'>, p: number): number {
  let t = 0;
  for (let i = 1; i < p; i++) t += periodLen(s, i);
  return t;
}
/** Playing seconds before period `p`: the finished periods as played (nominal after). */
export function playedOffset(s: RugbyState, p = s.period): number {
  let t = 0;
  for (let i = 1; i < p; i++) t += s.played[i - 1] ?? periodLen(s, i);
  return t;
}
/** Seconds played in the current period at `now` (NOT capped — time added runs on). */
export function periodSec(s: RugbyState, now = 0): number {
  const ms = s.clock.ms + (s.clock.since && now ? Math.max(0, now - s.clock.since) : 0);
  return Math.floor(ms / 1000);
}
export const matchSec = (s: RugbyState, now = 0): number => playedOffset(s) + periodSec(s, now);
export const running = (s: RugbyState): boolean => !!s.clock.since && !s.ended;
export const periodStarted = (s: RugbyState): boolean => s.clock.ms > 0 || !!s.clock.since;
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/** The scoreboard clock for period `p` at `psec`: "23:15", or "40:00 +1:12" in time added. */
export function clockAt(s: Pick<RugbyState, 'plan' | 'periodMinutes' | 'etMinutes' | 'sdMinutes'>, p: number, psec: number): string {
  const len = periodLen(s, p);
  const off = nominalOffset(s, p);
  if (psec <= len) return mmss(off + psec);
  const over = psec - len;
  return `${mmss(off + len)} +${Math.floor(over / 60)}:${String(Math.floor(over % 60)).padStart(2, '0')}`;
}
export const clockFace = (s: RugbyState, now = 0): string => clockAt(s, s.period, periodSec(s, now));
/** The minute as rugby reports it: "23'", "40+2'". */
export function minuteText(s: Pick<RugbyState, 'plan' | 'periodMinutes' | 'etMinutes' | 'sdMinutes'>, p: number, psec: number): string {
  const len = periodLen(s, p);
  const off = nominalOffset(s, p);
  if (psec <= len) return `${Math.max(1, Math.ceil((off + psec) / 60))}'`;
  return `${(off + len) / 60}+${Math.max(1, Math.ceil((psec - len) / 60))}'`;
}
export const totalPeriods = (s: Pick<RugbyState, 'plan'>): number => s.plan.length;
export const isExtraTime = (s: Pick<RugbyState, 'plan'>, p: number): boolean => (s.plan[p - 1] ?? 'reg') !== 'reg';
export const isSuddenDeath = (s: Pick<RugbyState, 'plan'>, p: number): boolean => s.plan[p - 1] === 'sd';
/** "H1" / "H2" / "ET1" / "ET2" / "SD" (sevens: "SD1", "SD2"…). */
export function periodName(s: Pick<RugbyState, 'plan'>, p: number): string {
  const k = s.plan[p - 1] ?? 'reg';
  const nth = s.plan.slice(0, p).filter((x) => x === k).length;
  if (k === 'reg') return `H${nth}`;
  if (k === 'et') return `ET${nth}`;
  return s.plan.filter((x) => x === 'sd').length > 1 ? `SD${nth}` : 'SD';
}
export function periodLong(s: Pick<RugbyState, 'plan'>, p: number): string {
  const k = s.plan[p - 1] ?? 'reg';
  const nth = s.plan.slice(0, p).filter((x) => x === k).length;
  if (k === 'reg') return nth === 1 ? '1st half' : '2nd half';
  if (k === 'et') return `Extra time · ${nth === 1 ? '1st' : '2nd'} half`;
  return `Sudden death${s.plan.filter((x) => x === 'sd').length > 1 ? ` ${nth}` : ''} · first score wins`;
}

const stopAt = (s: RugbyState, at: number): RugbyState['clock'] =>
  s.clock.since ? { ms: s.clock.ms + Math.max(0, at - s.clock.since) } : s.clock;

/** The periods a level match goes on to at the end of the current last period. */
export function nextPlan(s: Pick<RugbyState, 'plan' | 'decider'>): PeriodKind[] {
  const last = s.plan[s.plan.length - 1];
  if (last === 'reg') {
    if (s.decider === 'et' || s.decider === 'etKicks') return ['et', 'et'];
    if (s.decider === 'sd') return ['sd'];
    return [];
  }
  if (last === 'et') return s.decider === 'et' ? ['sd'] : [];
  if (last === 'sd') return s.decider === 'sd' ? ['sd'] : [];
  return [];
}
/** Does a level match need a kicking competition after the last period? */
export const kicksAfter = (d: Decider): boolean => d === 'et' || d === 'etKicks' || d === 'kicks';

/* --------------------------------- points ---------------------------------- */

export function pointsOf(e: Pick<RugbyEvent, 'type' | 'kick' | 'made'>): number {
  if (e.type === 'try') return TRY_POINTS;
  if (e.type === 'pentry') return PENALTY_TRY_POINTS;
  if (e.type === 'kick' && e.made) return KICK_POINTS[e.kick ?? 'pen'];
  return 0;
}
/** Tries per side (penalty tries included — Law 8). */
export function triesOf(s: Pick<RugbyState, 'events'>): { home: number; away: number } {
  const t = { home: 0, away: 0 };
  for (const e of s.events) if (e.type === 'try' || e.type === 'pentry') t[e.side] += 1;
  return t;
}

/* --------------------------------- credits --------------------------------- */

/** Every key a live rugby action credits (statTotals owns all of them). */
export const LIVE_KEYS = [
  'points', 'tries', 'tryAssists', 'conversions', 'conversionAttempts', 'penGoals', 'penGoalAttempts', 'dropGoals', 'dropGoalAttempts',
  'yellowCards', 'redCards', 'soTaken', 'soGoals',
] as const;
export const DETAIL_STATS = DETAIL_KEYS.map((k) => DETAIL_STAT[k]);
const MADE: Record<KickKind, [string, string]> = { conv: ['conversions', 'conversionAttempts'], pen: ['penGoals', 'penGoalAttempts'], drop: ['dropGoals', 'dropGoalAttempts'] };

type Credit = { playerId: string; playerName?: string; stats: Record<string, number> };

/** The stat-line credits one event writes: [primary player, second player]. */
export function eventCredits(e: Pick<RugbyEvent, 'type' | 'playerId' | 'playerName' | 'secondId' | 'secondName' | 'kick' | 'made' | 'card' | 'second' | 'official' | 'detail'> & { tally?: TallyKind }): { first?: Credit; second?: Credit } {
  const p = (stats: Record<string, number>) => (e.playerId && !e.official ? { playerId: e.playerId, playerName: e.playerName, stats } : undefined);
  const q = (stats: Record<string, number>) => (e.secondId ? { playerId: e.secondId, playerName: e.secondName, stats } : undefined);
  switch (e.type) {
    case 'try':
      return { first: p({ points: TRY_POINTS, tries: 1 }), second: q({ tryAssists: 1 }) };
    case 'kick': {
      const [m, a] = MADE[e.kick ?? 'pen'];
      return { first: p(e.made ? { points: KICK_POINTS[e.kick ?? 'pen'], [m]: 1, [a]: 1 } : { [a]: 1 }) };
    }
    case 'card':
      if (e.card === 'yellow') return { first: p({ yellowCards: 1 }) };
      return { first: p(e.second ? { redCards: 1, yellowCards: 1 } : { redCards: 1 }) };
    case 'detail':
      return e.detail ? { first: p({ [DETAIL_STAT[e.detail]]: 1 }) } : {};
    case 'tally': {
      // deep wave: a penalty / turnover conceded or an offload credits its player (round 2: a free kick too); 22 entries are the team's
      const key = e.tally ? TALLY_KEY[e.tally] : undefined;
      return key ? { first: p({ [key]: 1 }) } : {};
    }
    default:
      return {};
  }
}

/** Credits → the action's `attribution` / `attribution2` (sign −1 reverses). */
export function creditAttribution(c: Credit | undefined, sign = 1, tracked?: string[]): Attribution | undefined {
  if (!c) return undefined;
  const entries = Object.entries(c.stats);
  if (!entries.length) return undefined;
  const [[stat, by], ...rest] = entries;
  return {
    playerId: c.playerId, stat, by: by * sign, // IDs-only scoring: never the name
    ...(rest.length ? { extra: Object.fromEntries(rest.map(([k, v]) => [k, v * sign])) } : {}),
    ...(tracked ? { tracked } : {}),
  };
}

const second = (a: ScoreAction): Attribution | undefined =>
  a.attribution2 ?? (a.payload?._attr2 as Attribution | undefined);

/** IDs-only scoring: the same player — by id; by name only when one side of
 *  the comparison has no id (an older log's name-only card). */
const samePlayer = (e: RugbyEvent, who: Who): boolean => (e.playerId && who.id ? e.playerId === who.id : !!who.name && e.playerName === who.name);
/** Yellow cards a player has had this match (the next one is a red). */
export const yellowsOf = (s: RugbyState, side: Side, who: Who): number =>
  s.events.filter((e) => e.type === 'card' && e.card === 'yellow' && e.side === side && !e.official && samePlayer(e, who)).length;
/** Permanent replacements a side has used (temporary HIA / blood ones and returns don't count). */
export const subsUsed = (s: RugbyState, side: Side): number =>
  s.events.filter((e) => e.type === 'sub' && e.side === side && !e.temp && !e.back && (e.playerId || e.playerName)).length;
/** Temporary replacements still open: the player off (HIA / blood) and who replaced them. */
export function openTemps(s: RugbyState, side: Side): { off: Who; on: Who; temp: 'hia' | 'blood'; sec: number; id: string }[] {
  const open: { off: Who; on: Who; temp: 'hia' | 'blood'; sec: number; id: string }[] = [];
  for (const e of s.events) {
    if (e.type !== 'sub' || e.side !== side) continue;
    if (e.temp) open.push({ off: { id: e.playerId, name: e.playerName }, on: { id: e.secondId, name: e.secondName }, temp: e.temp, sec: e.sec, id: e.id });
    else if (e.back) {
      const i = open.findIndex((o) => (o.off.id && o.off.id === e.secondId) || (!o.off.id && o.off.name === e.secondName));
      if (i >= 0) open.splice(i, 1);
    }
  }
  return open;
}

/* ---------------------------- kicking competition --------------------------- */

/** 5 kicks each alternately, decided as soon as a side can't catch up; then
 *  one each until a side leads after equal kicks (RWC 2023 rules). */
export function decideShootout(h: Kick[], a: Kick[]): Side | undefined {
  const hs = h.filter((k) => k.scored).length;
  const as = a.filter((k) => k.scored).length;
  if (h.length <= 5 && a.length <= 5) {
    if (hs > as + Math.max(0, 5 - a.length)) return 'home';
    if (as > hs + Math.max(0, 5 - h.length)) return 'away';
  }
  if (h.length === a.length && h.length >= 5 && hs !== as) return hs > as ? 'home' : 'away';
  return undefined;
}
export function nextKicker(so: NonNullable<RugbyState['shootout']>): Side {
  const n = so.home.length + so.away.length;
  const lead: Side = n >= 10 && so.sdFirst ? so.sdFirst : so.first;
  const other: Side = lead === 'home' ? 'away' : 'home';
  const behind: Side | undefined = so.home.length < so.away.length ? 'home' : so.away.length < so.home.length ? 'away' : undefined;
  return behind ?? (n % 2 === 0 ? lead : other);
}
export const needsSdPick = (s: Pick<RugbyState, 'shootout' | 'shootoutWinner'>): boolean =>
  !!s.shootout && !s.shootoutWinner && !s.shootout.sdFirst && s.shootout.home.length === 5 && s.shootout.away.length === 5;
export const soScore = (s: Pick<RugbyState, 'shootout'>) => ({
  home: s.shootout?.home.filter((k) => k.scored).length ?? 0,
  away: s.shootout?.away.filter((k) => k.scored).length ?? 0,
});

/* --------------------------------- reducer --------------------------------- */

const SO_ACTIONS = new Set(['START_SHOOTOUT', 'SO', 'SO_ORDER', 'XI', 'STAT_ADJUST', 'REMOVE_EVENT', 'END']);
const kickOf = (v: unknown): KickKind => (v === 'conv' || v === 'drop' ? v : 'pen');

/** A score in sudden death ends the match at once (no conversion). */
const sdEnd = (st: RugbyState, at: number, edit: boolean): RugbyState =>
  !edit && isSuddenDeath(st, st.period) && st.home !== st.away ? { ...st, ended: true, clock: stopAt(st, at), played: [...st.played.slice(0, st.period - 1), periodSec(st, at)] } : st;

export const reducer = (s: RugbyState, a: ScoreAction): RugbyState => {
  if (s.ended && !SO_ACTIONS.has(a.type)) return s;
  const at = Number(a.payload?.at ?? 0);
  const psec = typeof a.payload?.psec === 'number' ? Math.max(0, a.payload.psec as number) : periodSec(s, at);
  const period = typeof a.payload?.period === 'number' ? (a.payload.period as number) : s.period;
  const sec = typeof a.payload?.sec === 'number' ? Math.max(0, a.payload.sec as number) : playedOffset(s, period) + psec;
  const uid = typeof a.payload?.uid === 'string' && a.payload.uid ? (a.payload.uid as string) : `e${s.seq + 1}`;
  const side = a.side === 'home' || a.side === 'away' ? a.side : undefined;
  const p1 = a.attribution;
  const p2 = second(a);
  const edit = !!a.payload?.edit;
  const push = (st: RugbyState, e: Omit<RugbyEvent, 'id' | 'sec' | 'psec' | 'period'>): RugbyState =>
    ({ ...st, seq: st.seq + 1, events: [...st.events, { id: uid, sec, psec, period, ...e } as RugbyEvent] });
  const pid = p1?.playerId ?? (typeof a.payload?.playerId === 'string' ? (a.payload.playerId as string) : undefined);
  const pname = p1?.playerName ?? (typeof a.payload?.playerName === 'string' ? (a.payload.playerName as string) : undefined);
  const who1 = pid ? { playerId: pid, ...(pname ? { playerName: pname } : {}) } : pname ? { playerName: pname } : {};
  const who2 = p2?.playerId ? { secondId: p2.playerId, ...(p2.playerName ? { secondName: p2.playerName } : {}) } : {};
  const score = (st: RugbyState, sd: Side, pts: number) => ({ ...st, [sd]: st[sd] + pts }) as RugbyState;
  switch (a.type) {
    case 'CLOCK': {
      if (a.payload?.run) return s.clock.since ? s : { ...s, clock: { ms: s.clock.ms, since: at || 1 } };
      return { ...s, clock: stopAt(s, at) };
    }
    case 'SET_CLOCK': {
      const v = Math.max(0, Math.min(periodLen(s, s.period) + 1800, Number(a.payload?.periodSec ?? 0)));
      return { ...s, clock: { ms: v * 1000, ...(s.clock.since ? { since: at || s.clock.since } : {}) } };
    }
    case 'XI': {
      const team = a.payload?.team;
      if (team !== 'home' && team !== 'away') return s;
      const players = Array.isArray(a.payload?.players)
        ? (a.payload!.players as { id?: string; name?: string }[]).filter((x) => x?.id).map((x) => ({ id: String(x.id), ...(x.name !== undefined ? { name: String(x.name ?? '') } : {}) }))
        : undefined;
      return { ...s, xi: { ...s.xi, [team]: players ? { players } : {} } };
    }
    case 'TRY': {
      if (!side) return s;
      return sdEnd(push(score(s, side, TRY_POINTS), { type: 'try', side, ...who1, ...who2 }), at, edit);
    }
    case 'PENALTY_TRY': {
      if (!side) return s;
      return sdEnd(push(score(s, side, PENALTY_TRY_POINTS), { type: 'pentry', side }), at, edit);
    }
    case 'KICK': {
      if (!side) return s;
      const kick = kickOf(a.payload?.kick);
      const made = a.payload?.made === true;
      const next = push(made ? score(s, side, KICK_POINTS[kick]) : s, { type: 'kick', side, kick, made, ...who1 });
      return made ? sdEnd(next, at, edit) : next;
    }
    case 'CARD': {
      if (!side) return s;
      const card: CardKind = a.payload?.card === 'red' ? 'red' : 'yellow';
      const official = typeof a.payload?.official === 'string' ? (a.payload.official as string) || 'Team official' : undefined;
      return push(s, {
        type: 'card', side, card, ...(official ? { official, playerName: official } : who1),
        ...(card === 'red' && a.payload?.red20 === true ? { red20: true } : {}),
        ...(card === 'red' && a.payload?.second === true && !official ? { second: true } : {}),
      });
    }
    case 'SUB': {
      if (!side) return s;
      const off = { id: a.payload?.offId as string | undefined, name: a.payload?.offName as string | undefined };
      const on = { id: a.payload?.onId as string | undefined, name: a.payload?.onName as string | undefined };
      if (!off.name && !on.name && !off.id && !on.id) return s;
      const temp = a.payload?.temp === 'hia' || a.payload?.temp === 'blood' ? a.payload.temp : undefined;
      return push(s, {
        type: 'sub', side,
        ...(off.id ? { playerId: off.id } : {}), ...(off.name ? { playerName: off.name } : {}),
        ...(on.id ? { secondId: on.id } : {}), ...(on.name ? { secondName: on.name } : {}),
        ...(temp ? { temp } : {}), ...(a.payload?.back === true ? { back: true } : {}),
      });
    }
    case 'DETAIL': {
      const d = a.payload?.detail as DetailKey;
      if (!side || !DETAIL_KEYS.includes(d)) return s;
      return push(s, { type: 'detail', side, detail: d, ...who1 });
    }
    case 'SET_PIECE': {
      // a lineout / scrum on the side's own throw / feed: won or lost
      const piece = a.payload?.piece === 'scrum' ? 'scrum' : 'lineout';
      if (!side) return s;
      return push(s, { type: 'setpiece', side, piece, won: a.payload?.won !== false });
    }
    case 'TALLY': {
      // deep wave: an optional tally (penalty / free kick / turnover conceded, 22 entry, offload)
      const kind = a.payload?.kind as TallyKind;
      if (!side || !TALLY_KINDS.includes(kind)) return s;
      const inf = a.payload?.infringement as Infringement;
      const cause = a.payload?.cause as TurnoverCause;
      return push(s, {
        type: 'tally', side, tally: kind, ...(TALLY_KEY[kind] ? who1 : {}),
        ...(kind === 'penalty' && INFRINGEMENTS.includes(inf) ? { infringement: inf } : {}),
        ...(kind === 'turnover' && TURNOVER_CAUSES.includes(cause) ? { cause } : {}),
        ...(kind === 'freeKick' && a.payload?.asked === true ? { asked: true } : {}),
      });
    }
    case 'POSSESSION':
    case 'TERRITORY': {
      // deep wave: who has the ball / whose territory from now on (a tap on the side already set changes nothing —
      // round 2: unless the ball is dead, when any possession tap brings it back to life)
      if (!side) return s;
      const kind = a.type === 'POSSESSION' ? 'poss' : 'terr';
      const cur = currentBall(s, kind);
      if (cur === side && !(kind === 'poss' && ballDead(s))) return s;
      return { ...s, ball: [...(s.ball ?? []), { kind, side, sec, period }] };
    }
    case 'BALL_DEAD': {
      // round 2: the possession bar's "Ball dead" switch — `dead: false` = "Ball live" (back with the side that had it)
      const cur = currentBall(s, 'poss');
      if (!cur) return s;
      const dead = a.payload?.dead !== false;
      if (dead === ballDead(s)) return s;
      return { ...s, ball: [...(s.ball ?? []), { kind: 'poss', side: cur, sec, period, ...(dead ? { dead: true as const } : {}) }] };
    }
    case 'REMOVE_EVENT': {
      const id = String(a.payload?.id ?? '');
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      const next = { ...s, events: s.events.filter((e) => e !== ev) };
      const pts = pointsOf(ev);
      return pts ? ({ ...next, [ev.side]: Math.max(0, next[ev.side] - pts) } as RugbyState) : next;
    }
    case 'END_PERIOD': {
      const clock = stopAt(s, at);
      const len = clock.ms > 0 ? Math.floor(clock.ms / 1000) : periodLen(s, s.period);
      const played = [...s.played.slice(0, s.period - 1), len];
      if (s.period < s.plan.length) return { ...s, played, period: s.period + 1, clock: { ms: 0 } };
      const more = levelForDecider(s) ? nextPlan(s) : [];
      if (more.length) return { ...s, played, plan: [...s.plan, ...more], period: s.period + 1, clock: { ms: 0 } };
      return { ...s, played, clock: { ms: len * 1000 }, ended: true };
    }
    case 'END':
      return s.ended ? s : { ...s, ended: true, clock: stopAt(s, at) };
    case 'START_SHOOTOUT': {
      if (!s.ended || !levelForDecider(s) || s.shootout || !kicksAfter(s.decider)) return s;
      return { ...s, shootout: { home: [], away: [], first: a.payload?.first === 'away' ? 'away' : 'home' } };
    }
    case 'SO_ORDER': {
      const f = a.payload?.first;
      if (!needsSdPick(s) || (f !== 'home' && f !== 'away')) return s;
      return { ...s, shootout: { ...s.shootout!, sdFirst: f } };
    }
    case 'SO': {
      if (!s.shootout || s.shootoutWinner || !side) return s;
      const kick: Kick = { scored: a.payload?.scored === true, ...(p1?.playerId ? { playerId: p1.playerId } : {}), ...(p1?.playerName ? { playerName: p1.playerName } : {}) };
      const so = { ...s.shootout, [side]: [...s.shootout[side], kick] };
      return { ...s, shootout: so, shootoutWinner: decideShootout(so.home, so.away) };
    }
    case 'STAT_ADJUST':
    default:
      return s;
  }
};

/* ----------------------------- derived figures ----------------------------- */

export const levelAtEnd = (s: RugbyState): boolean => levelForDecider(s);
export const aggLine = (s: RugbyState): string | undefined => aggregateText(s);

export const isComplete = (s: RugbyState): boolean =>
  s.ended && (!levelForDecider(s) || !kicksAfter(s.decider) || s.shootoutWinner != null);

export function result(s: RugbyState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!isComplete(s)) return null;
  const byPoints = s.home > s.away ? 'home' : s.away > s.home ? 'away' : undefined;
  const winner = s.agg ? (s.shootoutWinner ?? byPoints ?? 'draw') : (byPoints ?? s.shootoutWinner ?? 'draw');
  return { winner, home: s.home, away: s.away };
}

/** A side's team figures (comparison panel) over a period scope. */
export interface RugbyTeamFigures {
  points: number; tries: number; penaltyTries: number;
  conversions: number; conversionAttempts: number; penGoals: number; penGoalAttempts: number; dropGoals: number; dropGoalAttempts: number;
  yellowCards: number; redCards: number;
  lineoutsWon: number; lineoutsLost: number; scrumsWon: number; scrumsLost: number;
  detail: Record<string, number>;
  /** deep wave — the optional tallies (count per kind) */
  tally: Record<TallyKind, number>;
}
export function teamFigures(s: RugbyState, side: Side, scope: 'all' | number = 'all'): RugbyTeamFigures {
  const f: RugbyTeamFigures = {
    points: 0, tries: 0, penaltyTries: 0, conversions: 0, conversionAttempts: 0, penGoals: 0, penGoalAttempts: 0, dropGoals: 0, dropGoalAttempts: 0,
    yellowCards: 0, redCards: 0, lineoutsWon: 0, lineoutsLost: 0, scrumsWon: 0, scrumsLost: 0, detail: {},
    tally: { penalty: 0, freeKick: 0, turnover: 0, entry: 0, offload: 0 },
  };
  for (const e of s.events) {
    if (e.side !== side || (scope !== 'all' && e.period !== scope)) continue;
    f.points += pointsOf(e);
    if (e.type === 'try') f.tries++;
    else if (e.type === 'pentry') { f.tries++; f.penaltyTries++; }
    else if (e.type === 'kick') {
      const [m, att] = MADE[e.kick ?? 'pen'] as [keyof RugbyTeamFigures, keyof RugbyTeamFigures];
      (f[att] as number)++;
      if (e.made) (f[m] as number)++;
    } else if (e.type === 'card' && !e.official) {
      if (e.card === 'yellow') f.yellowCards++;
      else { f.redCards++; if (e.second) f.yellowCards++; }
    } else if (e.type === 'setpiece') {
      if (e.piece === 'scrum') { if (e.won) f.scrumsWon++; else f.scrumsLost++; } else if (e.won) f.lineoutsWon++; else f.lineoutsLost++;
    } else if (e.type === 'detail' && e.detail) f.detail[DETAIL_STAT[e.detail]] = (f.detail[DETAIL_STAT[e.detail]] ?? 0) + 1;
    else if (e.type === 'tally' && e.tally) f.tally[e.tally]++;
  }
  return f;
}

/* ------------------------- deep wave: what's tracked ------------------------- */

/** The optional detail (tackles, carries…) — the toggle on, or any recorded
 *  (the rule the stat lines have always used). */
export const detailTracked = (s: Pick<RugbyState, 'trackDetail' | 'events'>): boolean =>
  s.trackDetail || s.events.some((e) => e.type === 'detail');
/** Is this "Stats to track" item tracked in the match — its toggle on, or any recorded? */
export const tallyTracked = (s: Pick<RugbyState, TrackFlag | 'events' | 'ball'>, f: TrackFlag): boolean =>
  s[f] === true
  || s.events.some((e) => e.type === 'tally' && !!e.tally && TRACK_KINDS[f].includes(e.tally))
  || (f === 'trackPossession' && !!s.ball?.length);
/** Penalties conceded are counted — from the detail button or the penalty toggle. */
export const penaltiesTracked = (s: RugbyState): boolean => detailTracked(s) || tallyTracked(s, 'trackPenalties');
/** Round 2 — free kicks are credited to players in this match: one was
 *  recorded with the player asked (or names a player). Old one-tap free kicks
 *  never were, so their matches never carry the key. */
export const freeKicksAsked = (s: Pick<RugbyState, 'events'>): boolean =>
  s.events.some((e) => e.type === 'tally' && e.tally === 'freeKick' && (e.asked === true || !!e.playerId || !!e.playerName));
/** The tracked player keys of the toggles (every line reads 0 for them). */
export const trackedTallyKeys = (s: RugbyState): string[] => [...new Set([
  ...TRACK_FLAGS.filter((f) => tallyTracked(s, f)).flatMap((f) => FLAG_KEYS[f]),
  ...(freeKicksAsked(s) ? ['freeKicksConceded'] : []),
])];

/** The switches of one kind in time order (a backfilled tap at its own time). */
const marksOf = (s: Pick<RugbyState, 'ball'>, kind: 'poss' | 'terr'): BallMark[] =>
  (s.ball ?? []).map((m, i) => ({ m, i })).filter((x) => x.m.kind === kind).sort((x, y) => x.m.sec - y.m.sec || x.i - y.i).map((x) => x.m);
/** Who has the ball (`poss`) / whose territory it is (`terr`) right now (after
 *  a "Ball dead": who had it — `ballDead` says it's dead). */
export function currentBall(s: Pick<RugbyState, 'ball'>, kind: 'poss' | 'terr'): Side | undefined {
  const marks = marksOf(s, kind);
  return marks[marks.length - 1]?.side;
}
/** Round 2 — is the ball dead now (the "Ball dead" switch on, no tap since)? */
export const ballDead = (s: Pick<RugbyState, 'ball'>): boolean => {
  const marks = marksOf(s, 'poss');
  return marks[marks.length - 1]?.dead === true;
};
/** Round 2 — the "ball dead" spans [from, to) in playing seconds up to `end`:
 *  each runs from a "Ball dead" to the next possession tap. */
export function deadSpans(s: Pick<RugbyState, 'ball'>, end: number): [number, number][] {
  const marks = marksOf(s, 'poss');
  const out: [number, number][] = [];
  marks.forEach((m, i) => {
    if (!m.dead) return;
    const to = Math.min(marks[i + 1]?.sec ?? end, end);
    if (to > m.sec) out.push([m.sec, to]);
  });
  return out;
}

/** Playing seconds each side had the ball (`poss`) or the territory (`terr`)
 *  over a scope, from the scorer's switches: time-weighted on the PLAYING clock
 *  (the referee's watch — stoppages don't count, half-time is no time), each
 *  switch holding until the next one (across half-time too). Round 2: while
 *  the "Ball dead" switch is on, neither clock runs (possession and territory
 *  are ball-in-play measures). `from` = the playing second of the first switch
 *  in the scope. PURE. */
export function ballTime(s: RugbyState, kind: 'poss' | 'terr', scope: 'all' | number = 'all', nowSec?: number): { home: number; away: number; from?: number } {
  const end = Math.max(nowSec ?? matchSec(s), 0);
  const marks = marksOf(s, kind);
  const dead = kind === 'terr' ? deadSpans(s, end) : [];
  const w0 = scope === 'all' ? 0 : playedOffset(s, scope);
  const w1 = scope === 'all' || scope >= s.period ? Infinity : playedOffset(s, scope + 1);
  const out: { home: number; away: number; from?: number } = { home: 0, away: 0 };
  marks.forEach((m, i) => {
    const from = Math.max(m.sec, w0);
    const to = Math.min(marks[i + 1]?.sec ?? end, end, w1);
    if (to <= from) return;
    if (out.from === undefined) out.from = from;
    // a dead possession mark runs nobody's clock; territory loses the dead spans inside its interval
    const live = m.dead ? 0 : to - from - dead.reduce((t, [a, b]) => t + Math.max(0, Math.min(b, to) - Math.max(a, from)), 0);
    if (live > 0) out[m.side] += live;
  });
  return out;
}

/** SD-20 — the line under the score: the kicking competition ("Kicks 4–3"). */
export function rugbyScoreLine(s: RugbyState, perspective?: Side): string {
  if (!s?.shootout) return '';
  const so = soScore(s);
  return perspective === 'away' ? `Kicks ${so.away}–${so.home}` : `Kicks ${so.home}–${so.away}`;
}

/** SD-17 standings units: tries per side (the try bonus and the tries tie-breaks). */
export const rugbyStandingsUnits = (s: RugbyState) => (s && Array.isArray(s.events) ? { tries: triesOf(s) } : null);

/* --------------------------- live settings (#14) --------------------------- */

export const RUGBY_LIVE_SETTINGS: LiveSettings<RugbyState> = {
  title: '⚙️ Match settings',
  hint: 'Applies to this match only.',
  mode: 'config',
  fields: [
    { key: 'periodMinutes', label: 'Half length', type: 'number', default: 40, min: 1, max: 40, step: 1, hint: 'min / half' },
    { key: 'sinBinMinutes', label: 'Sin-bin', type: 'number', default: 10, min: 1, max: 10, step: 1, hint: 'minutes' },
    { key: 'trackDetail', label: 'Tackles, carries, set pieces', type: 'toggle', default: false, group: 'Stats to track' },
    ...TRACK_FIELDS,
  ] as FormatField[],
  read: (s) => ({
    periodMinutes: s.periodMinutes, sinBinMinutes: s.sinBinMinutes, trackDetail: s.trackDetail,
    ...Object.fromEntries(TRACK_FLAGS.map((f) => [f, s[f] === true])),
  }),
  defaults: { periodMinutes: 40, sinBinMinutes: 10, trackDetail: false, ...Object.fromEntries(TRACK_FLAGS.map((f) => [f, false])) },
};
