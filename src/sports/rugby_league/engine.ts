/**
 * Rugby league (International Rugby League Laws of the Game; NRL / Super
 * League competition rules) — the PURE scoring core. No React / React Native,
 * so node tests, corrections (#05 AMEND replays) and the device all derive the
 * same match from the same log. A separate sport from rugby union
 * (../rugby/*): nothing here imports union, so a union change can't break
 * league.
 *
 * Rules modelled:
 *  - Time: 2 halves of 40 minutes (13s); junior / school halves are shorter
 *    (presets, organiser-editable); Rugby League Nines 2 × 9. The clock counts
 *    up and runs PAST 40:00 — after the siren play goes on until the ball is
 *    next dead (a try "on the siren", then its conversion). Events carry the
 *    playing second of the match (`sec`) and of their half (`psec`), so a
 *    sin bin runs on playing time across half-time.
 *  - Scoring: try 4, conversion 2, penalty goal 2, field goal (drop goal) 1.
 *    Organiser options: the NRL two-point field goal from 40 m or more (the
 *    scorer picks 1 or 2 for a successful one), and a Nines "bonus try zone"
 *    (a try under the posts = 5). A PENALTY TRY is 4 points and — unlike
 *    union — the conversion is still taken, from in front of the posts.
 *  - Golden point extra time (organiser's decider): none (a draw stands) /
 *    2 × 5 minutes then a draw stands (NRL / Super League regular season) /
 *    until someone scores (finals: 5-minute periods, ends changed). In golden
 *    point the first score of any kind wins at once (a try: no conversion).
 *    Option: golden TRY (Nines) — only a try ends extra time.
 *  - Sin bin: 10 minutes on the playing clock (Nines 3 — verify), the team
 *    plays a player short. Send-off: off for good, not replaced. "On report":
 *    no in-match effect (the judiciary decides) — listed for discipline only.
 *  - Interchanges: 8 per team (NRL; organiser option, 0 = unlimited); an
 *    interchanged player may come back on. HIA / blood bin interchanges are
 *    temporary and don't count (verify per competition).
 *  - Six-tackle sets (optional "Stats to track", off by default): the side in
 *    possession, the tackle count (one tap per tackle), and how each set ends
 *    — a kick, an error, a penalty against the side with the ball, a handover
 *    on the 6th tackle (automatic), a six again / penalty to the side with the
 *    ball (a fresh set), or a score. Kept in `setLog` (not events — there are
 *    hundreds); `walkSets` derives every set from it.
 *
 * Every credit a live action writes on a stat line comes from `eventCredits`
 * (the controls build the attribution from it, and `leagueTotals` sums it over
 * the state), so the absolute statTotals equal the live increments (SD-19).
 */
import type { ScoreAction, LiveSettings, FormatField, Attribution } from '../types';
// Perf F-15 — the format presets / options live in the light meta module.
import { LEAGUE_PRESETS, TRACK_FIELDS } from './meta.ts';
export { LEAGUE_PRESETS, TRACK_FIELDS };

export type Side = 'home' | 'away';
export type Variant = '13s' | '9s';
export type KickKind = 'conv' | 'pen' | 'fg';
/** sin bin (timed), send-off (for good), on report (no in-match effect) */
export type Sanction = 'sinBin' | 'sendOff' | 'report';
/** what a level match does at full time */
export type Decider = 'none' | 'gp' | 'gpFinal';
export type PeriodKind = 'reg' | 'gp';

/** Optional player detail (each group behind its own "Stats to track" toggle). */
export type DetailKey = 'tackle' | 'missedTackle' | 'run' | 'lineBreak' | 'offload' | 'error' | 'penalty';
export const DETAIL_KEYS: DetailKey[] = ['tackle', 'missedTackle', 'run', 'lineBreak', 'offload', 'error', 'penalty'];
/** the stat-line key each detail credits (union's keys where the meaning and labels are identical) */
export const DETAIL_STAT: Record<DetailKey, string> = {
  tackle: 'tackles', missedTackle: 'missedTackles', run: 'carries', lineBreak: 'lineBreaks', offload: 'offloads',
  error: 'handlingErrors', penalty: 'penaltiesGivenAway',
};
export const DETAIL_LABEL: Record<DetailKey, string> = {
  tackle: 'Tackle', missedTackle: 'Missed tackle', run: 'Run', lineBreak: 'Line break', offload: 'Offload', error: 'Error', penalty: 'Penalty conceded',
};
/** details that may be the team's (no player: they land on the Team row) */
export const TEAM_DETAIL: DetailKey[] = ['error', 'penalty'];

/** The "Stats to track" toggles (off by default; present in the state only when on). */
export type TrackFlag = 'trackSets' | 'trackDefence' | 'trackAttack' | 'trackErrors';
export const TRACK_FLAGS: TrackFlag[] = ['trackSets', 'trackDefence', 'trackAttack', 'trackErrors'];
/** the detail kinds each toggle switches on (sets are the tackle-count panel, not details) */
export const FLAG_DETAILS: Record<TrackFlag, DetailKey[]> = {
  trackSets: [], trackDefence: ['tackle', 'missedTackle'], trackAttack: ['run', 'lineBreak', 'offload'], trackErrors: ['error', 'penalty'],
};

export const KICK_LABEL: Record<KickKind, string> = { conv: 'Conversion', pen: 'Penalty goal', fg: 'Field goal' };
export const TRY_POINTS = 4;
export const BONUS_TRY_POINTS = 5;
export const PENALTY_TRY_POINTS = 4;
export const KICK_POINTS: Record<KickKind, number> = { conv: 2, pen: 2, fg: 1 };

export interface Who { id?: string; name?: string }

export interface LeagueEvent {
  /** stable id from the action (`payload.uid`) */
  id: string;
  type: 'try' | 'pentry' | 'kick' | 'sanction' | 'sub' | 'detail';
  side: Side;
  /** playing seconds since the kick-off (the halves as actually played) */
  sec: number;
  /** playing seconds into its period (past the nominal length = after the siren) */
  psec: number;
  period: number;
  /** try scorer / kicker / sanctioned player / player off / detail player */
  playerId?: string;
  /** @deprecated legacy, read-only — IDs-only logs (docs/privacy/ids-only-scoring.md) keep the id; the name is looked up when shown (invasion/names.ts) */
  playerName?: string;
  /** try assist / player on */
  secondId?: string;
  /** @deprecated legacy, read-only — IDs-only logs (docs/privacy/ids-only-scoring.md) keep the id; the name is looked up when shown (invasion/names.ts) */
  secondName?: string;
  kick?: KickKind;
  made?: boolean;
  /** a two-point field goal (40 m or more — organiser option) */
  two?: boolean;
  /** a try in the bonus zone (5 points — organiser option) */
  bonus?: boolean;
  sanction?: Sanction;
  /** sub: a temporary interchange (HIA / blood bin — doesn't count) */
  temp?: 'hia' | 'blood';
  /** sub: the temporarily replaced player coming back on */
  back?: boolean;
  detail?: DetailKey;
}

/* ------------------------------ six-tackle sets ------------------------------ */

/** How a set ended. Complete: a kick, a fresh set (six again / penalty to the
 *  side with the ball), a score, a kick at goal from a penalty. Incomplete: an
 *  error, a penalty against the side with the ball, a handover on the last
 *  tackle. Not counted either way: an untagged change of possession ('other')
 *  and a set still running at the end of a half ('period'). */
export type SetEnd = 'kick' | 'error' | 'penalty' | 'sixth' | 'restart' | 'score' | 'goal' | 'other' | 'period';
export const COMPLETE_ENDS: SetEnd[] = ['kick', 'restart', 'score', 'goal'];
export const INCOMPLETE_ENDS: SetEnd[] = ['error', 'penalty', 'sixth'];
export const SET_END_LABEL: Record<SetEnd, string> = {
  kick: 'Kick', error: 'Error', penalty: 'Penalty against', sixth: 'Handover on the last tackle', restart: 'Six again',
  score: 'Score', goal: 'Kick at goal', other: 'Ball changed hands', period: 'End of the half',
};
/** the endings the scorer taps (the rest come from scores, the tackle count and the clock) */
export const TAP_ENDS: SetEnd[] = ['kick', 'error', 'penalty', 'restart'];

/** One mark in the set log (in the order the scorer tapped them). */
export interface SetMark {
  k: 'ball' | 'tackle' | 'end';
  /** 'ball': who has it now */
  side?: Side;
  sec: number;
  period: number;
  how?: SetEnd;
  /** an ending a score / kick at goal wrote (the event id — removed with it) */
  ref?: string;
  /** the detail event (error / penalty: who) the same tap wrote */
  det?: string;
}
/** One set: who had the ball, from / to (playing seconds), tackles, how it ended. */
export interface LeagueSet {
  side: Side; period: number; from: number; to?: number; tackles: number; end?: SetEnd;
  /** the detail event (who erred / conceded) the ending tap wrote */
  det?: string;
}

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Every set from the log, and the one still running. PURE. A set with no
 *  tackle that ends without a play (an untagged change of possession, a kick
 *  at goal straight after a penalty, the end of a half) is dropped — no set
 *  was played. */
export function walkSets(s: Pick<LeagueState, 'setLog' | 'setTackles'>): { sets: LeagueSet[]; open: LeagueSet | null } {
  const sets: LeagueSet[] = [];
  const max = Math.max(1, s.setTackles || 6);
  let open: LeagueSet | null = null;
  const close = (how: SetEnd, at: number, det?: string) => {
    if (!open) return;
    const played = open.tackles > 0 || !(how === 'other' || how === 'goal' || how === 'period');
    if (played) sets.push({ ...open, to: Math.max(open.from, at), end: how, ...(det ? { det } : {}) });
    open = null;
  };
  const start = (side: Side, m: SetMark) => { open = { side, period: m.period, from: m.sec, tackles: 0 }; };
  for (const m of s.setLog ?? []) {
    const cur = open as LeagueSet | null;
    if (cur && m.period !== cur.period) close('period', m.sec);
    if (m.k === 'ball') {
      if (!m.side || (open as LeagueSet | null)?.side === m.side) continue;
      close('other', m.sec);
      start(m.side, m);
    } else if (m.k === 'tackle') {
      const o = open as LeagueSet | null;
      if (!o) continue;
      o.tackles += 1;
      if (o.tackles >= max) { close('sixth', m.sec); start(other(o.side), m); }
    } else {
      const o = open as LeagueSet | null;
      if (!o) continue;
      const how = m.how ?? 'other';
      close(how, m.sec, m.det);
      if (m.ref) continue; // a score / kick at goal: the restart follows (the scorer taps who has the ball)
      if (how === 'kick' || how === 'error' || how === 'penalty') start(other(o.side), m);
      else if (how === 'restart') start(o.side, m);
    }
  }
  return { sets, open: open as LeagueSet | null };
}
/** The set running now (null = nobody has the ball yet / after a score). */
export const currentSet = (s: Pick<LeagueState, 'setLog' | 'setTackles'>): LeagueSet | null => walkSets(s).open;

/* --------------------------------- state ----------------------------------- */

/** IDs-only scoring: new stamps carry ids only (`name` = an older stamp's, read-only). */
export interface XiStamp { players?: { id: string; name?: string }[] }

export interface LeagueState {
  home: number;
  away: number;
  period: number;
  /** the periods so far / planned: 2 halves, then golden point periods */
  plan: PeriodKind[];
  periodMinutes: number;
  /** golden point period length (5) */
  gpMinutes: number;
  clock: { ms: number; since?: number };
  /** actual playing seconds of each finished period */
  played: number[];
  ended: boolean;
  events: LeagueEvent[];
  seq: number;
  variant: Variant;
  playersPerSide: number;
  decider: Decider;
  /** Nines: only a try ends golden point extra time */
  goldenTry: boolean;
  sinBinMinutes: number;
  /** interchanges allowed per team (0 = unlimited) */
  maxInterchanges: number;
  /** NRL two-point field goal from 40 m (the scorer picks 1 or 2) */
  fg2: boolean;
  /** Nines bonus try zone: a try under the posts is worth 5 */
  bonusTry: boolean;
  /** tackles in a set (6 — the laws) */
  setTackles: number;
  /** "Stats to track" (absent = off) */
  trackSets?: boolean;
  trackDefence?: boolean;
  trackAttack?: boolean;
  trackErrors?: boolean;
  /** the six-tackle set log (absent until the first possession tap) */
  setLog?: SetMark[];
  xi?: { home?: XiStamp; away?: XiStamp };
}

/* --------------------------------- format ---------------------------------- */

// The format presets live in ./meta.ts (perf F-15: light, for the format
// pickers); imported and re-exported at the top of this file.

const bool = (v: unknown, d: boolean) => (v === undefined || v === null || v === '' ? d : v === true || v === 'true' || v === 1);
const num = (v: unknown, d: number, min = 0) => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? d : Math.max(min, n); };

export const variantOf = (config?: Record<string, unknown>): Variant => {
  const v = config?.variant;
  if (v === '9s' || v === '13s') return v;
  return Number(config?.playersPerSide) === 9 ? '9s' : '13s';
};
export const deciderOf = (d: unknown): Decider => (d === 'gp' || d === 'gpFinal' ? d : 'none');

export const init = (config?: Record<string, unknown>): LeagueState => {
  const variant = variantOf(config);
  const n9 = variant === '9s';
  return {
    home: 0, away: 0, period: 1, plan: ['reg', 'reg'],
    periodMinutes: num(config?.periodMinutes, n9 ? 9 : 40, 1),
    gpMinutes: num(config?.gpMinutes, 5, 1),
    clock: { ms: 0 }, played: [], ended: false, events: [], seq: 0,
    variant,
    playersPerSide: num(config?.playersPerSide, n9 ? 9 : 13, 1),
    decider: deciderOf(config?.decider),
    goldenTry: bool(config?.goldenTry, false),
    sinBinMinutes: num(config?.sinBinMinutes, n9 ? 3 : 10, 1),
    maxInterchanges: num(config?.maxInterchanges, n9 ? 0 : 8),
    fg2: bool(config?.fg2, false),
    bonusTry: bool(config?.bonusTry, false),
    setTackles: Math.round(num(config?.setTackles, 6, 3)),
    ...Object.fromEntries(TRACK_FLAGS.filter((f) => bool(config?.[f], false)).map((f) => [f, true])),
  };
};

/* ---------------------------------- clock ---------------------------------- */

type Plan = Pick<LeagueState, 'plan' | 'periodMinutes' | 'gpMinutes'>;
/** Nominal length (seconds) of period `p`. */
export function periodLen(s: Plan, p: number): number {
  return ((s.plan[p - 1] ?? 'reg') === 'reg' ? s.periodMinutes : s.gpMinutes) * 60;
}
/** Nominal match time before period `p` (what the scoreboard clock shows at its start). */
export function nominalOffset(s: Plan, p: number): number {
  let t = 0;
  for (let i = 1; i < p; i++) t += periodLen(s, i);
  return t;
}
/** Playing seconds before period `p`: the finished periods as played (nominal after). */
export function playedOffset(s: LeagueState, p = s.period): number {
  let t = 0;
  for (let i = 1; i < p; i++) t += s.played[i - 1] ?? periodLen(s, i);
  return t;
}
/** Seconds played in the current period at `now` (NOT capped — play runs on after the siren). */
export function periodSec(s: LeagueState, now = 0): number {
  const ms = s.clock.ms + (s.clock.since && now ? Math.max(0, now - s.clock.since) : 0);
  return Math.floor(ms / 1000);
}
export const matchSec = (s: LeagueState, now = 0): number => playedOffset(s) + periodSec(s, now);
export const running = (s: LeagueState): boolean => !!s.clock.since && !s.ended;
export const periodStarted = (s: LeagueState): boolean => s.clock.ms > 0 || !!s.clock.since;
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/** The scoreboard clock for period `p` at `psec`: "23:15", or "40:00 +0:12" after the siren. */
export function clockAt(s: Plan, p: number, psec: number): string {
  const len = periodLen(s, p);
  const off = nominalOffset(s, p);
  if (psec <= len) return mmss(off + psec);
  const over = psec - len;
  return `${mmss(off + len)} +${Math.floor(over / 60)}:${String(Math.floor(over % 60)).padStart(2, '0')}`;
}
export const clockFace = (s: LeagueState, now = 0): string => clockAt(s, s.period, periodSec(s, now));
/** The minute as league reports it: "23'", "80'", golden point "83'", after the siren "40+1'". */
export function minuteText(s: Plan, p: number, psec: number): string {
  const len = periodLen(s, p);
  const off = nominalOffset(s, p);
  if (psec <= len) return `${Math.max(1, Math.ceil((off + psec) / 60))}'`;
  return `${(off + len) / 60}+${Math.max(1, Math.ceil((psec - len) / 60))}'`;
}
export const totalPeriods = (s: Pick<LeagueState, 'plan'>): number => s.plan.length;
export const isGoldenPoint = (s: Pick<LeagueState, 'plan'>, p: number): boolean => s.plan[p - 1] === 'gp';
/** "H1" / "H2" / "GP1" / "GP2" … */
export function periodName(s: Pick<LeagueState, 'plan'>, p: number): string {
  const k = s.plan[p - 1] ?? 'reg';
  const nth = s.plan.slice(0, p).filter((x) => x === k).length;
  return k === 'reg' ? `H${nth}` : `GP${nth}`;
}
export function periodLong(s: Pick<LeagueState, 'plan' | 'goldenTry'>, p: number): string {
  const k = s.plan[p - 1] ?? 'reg';
  const nth = s.plan.slice(0, p).filter((x) => x === k).length;
  if (k === 'reg') return nth === 1 ? '1st half' : '2nd half';
  return `Golden ${s.goldenTry ? 'try' : 'point'} · ${nth === 1 ? '1st' : nth === 2 ? '2nd' : `period ${nth}`}${s.goldenTry ? ' · first try wins' : ' · first score wins'}`;
}

const stopAt = (s: LeagueState, at: number): LeagueState['clock'] =>
  s.clock.since ? { ms: s.clock.ms + Math.max(0, at - s.clock.since) } : s.clock;

/** The periods a level match goes on to at the end of the current last period:
 *  golden point 2 × 5 (then a draw stands), or — finals — more 5-minute
 *  periods until someone scores. */
export function nextPlan(s: Pick<LeagueState, 'plan' | 'decider'>): PeriodKind[] {
  const last = s.plan[s.plan.length - 1];
  if (s.decider === 'none') return [];
  if (last === 'reg') return ['gp', 'gp'];
  return s.decider === 'gpFinal' ? ['gp'] : [];
}

/* --------------------------------- points ---------------------------------- */

export function pointsOf(e: Pick<LeagueEvent, 'type' | 'kick' | 'made' | 'two' | 'bonus'>): number {
  if (e.type === 'try') return e.bonus ? BONUS_TRY_POINTS : TRY_POINTS;
  if (e.type === 'pentry') return PENALTY_TRY_POINTS;
  if (e.type === 'kick' && e.made) return e.kick === 'fg' && e.two ? 2 : KICK_POINTS[e.kick ?? 'pen'];
  return 0;
}
/** Tries per side (penalty tries included). */
export function triesOf(s: Pick<LeagueState, 'events'>): { home: number; away: number } {
  const t = { home: 0, away: 0 };
  for (const e of s.events) if (e.type === 'try' || e.type === 'pentry') t[e.side] += 1;
  return t;
}

/* --------------------------------- credits --------------------------------- */

/** Every key a live league action credits (statTotals owns all of them). */
export const LIVE_KEYS = [
  'points', 'tries', 'tryAssists', 'conversions', 'conversionAttempts', 'penGoals', 'penGoalAttempts', 'dropFieldGoals', 'dropFieldGoalAttempts',
  'sinBins', 'sendOffs',
] as const;
export const DETAIL_STATS = DETAIL_KEYS.map((k) => DETAIL_STAT[k]);
const MADE: Record<KickKind, [string, string]> = { conv: ['conversions', 'conversionAttempts'], pen: ['penGoals', 'penGoalAttempts'], fg: ['dropFieldGoals', 'dropFieldGoalAttempts'] };

type Credit = { playerId: string; playerName?: string; stats: Record<string, number> };
type CreditInput = Pick<LeagueEvent, 'type' | 'playerId' | 'playerName' | 'secondId' | 'secondName' | 'kick' | 'made' | 'two' | 'bonus' | 'sanction' | 'detail'>;

/** The stat-line credits one event writes: [primary player, second player]. */
export function eventCredits(e: Partial<CreditInput> & Pick<LeagueEvent, 'type'>): { first?: Credit; second?: Credit } {
  const p = (stats: Record<string, number>) => (e.playerId ? { playerId: e.playerId, playerName: e.playerName, stats } : undefined);
  const q = (stats: Record<string, number>) => (e.secondId ? { playerId: e.secondId, playerName: e.secondName, stats } : undefined);
  switch (e.type) {
    case 'try':
      return { first: p({ points: e.bonus ? BONUS_TRY_POINTS : TRY_POINTS, tries: 1 }), second: q({ tryAssists: 1 }) };
    case 'kick': {
      const k = e.kick ?? 'pen';
      const [m, a] = MADE[k];
      return { first: p(e.made ? { points: pointsOf({ type: 'kick', kick: k, made: true, two: e.two }), [m]: 1, [a]: 1 } : { [a]: 1 }) };
    }
    case 'sanction':
      return e.sanction === 'sinBin' ? { first: p({ sinBins: 1 }) } : e.sanction === 'sendOff' ? { first: p({ sendOffs: 1 }) } : {};
    case 'detail':
      return e.detail ? { first: p({ [DETAIL_STAT[e.detail]]: 1 }) } : {};
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
 *  the comparison has no id (an older log's name-only sanction). */
const samePlayer = (e: LeagueEvent, who: Who): boolean => (e.playerId && who.id ? e.playerId === who.id : !!who.name && e.playerName === who.name);
/** Sin bins a player has had this match (shown on the picker — a second one is the referee's call, not automatic). */
export const sinBinsOf = (s: LeagueState, side: Side, who: Who): number =>
  s.events.filter((e) => e.type === 'sanction' && e.sanction === 'sinBin' && e.side === side && samePlayer(e, who)).length;
/** Interchanges a side has used (HIA / blood bin ones and their returns don't count). */
export const interchangesUsed = (s: LeagueState, side: Side): number =>
  s.events.filter((e) => e.type === 'sub' && e.side === side && !e.temp && !e.back && (e.playerId || e.playerName)).length;
/** Temporary interchanges still open: the player off (HIA / blood) and who replaced them. */
export function openTemps(s: LeagueState, side: Side): { off: Who; on: Who; temp: 'hia' | 'blood'; sec: number; id: string }[] {
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

/* --------------------------------- reducer --------------------------------- */

const END_ACTIONS = new Set(['XI', 'STAT_ADJUST', 'REMOVE_EVENT', 'END']);
const kickOf = (v: unknown): KickKind => (v === 'conv' || v === 'fg' ? v : 'pen');
const isTry = (t: LeagueEvent['type']) => t === 'try' || t === 'pentry';

/** Golden point: a score that breaks the tie ends the match at once (golden
 *  try: only a try does). */
function gpEnd(st: LeagueState, e: LeagueEvent, at: number, edit: boolean): LeagueState {
  if (edit || !isGoldenPoint(st, st.period) || st.home === st.away) return st;
  if (st.goldenTry && !isTry(e.type)) return st;
  return { ...st, ended: true, clock: stopAt(st, at), played: [...st.played.slice(0, st.period - 1), periodSec(st, at)] };
}

/** The set ending a score / kick at goal writes (when a set is running). */
function scoreEnd(open: LeagueSet, e: LeagueEvent): SetEnd {
  const own = open.side === e.side;
  if (e.type === 'kick' && e.kick === 'pen') return own ? 'goal' : 'penalty';
  if (e.type === 'kick' && e.kick === 'fg') return own ? (e.made ? 'score' : 'kick') : 'other';
  return own ? 'score' : 'other';
}

export const reducer = (s: LeagueState, a: ScoreAction): LeagueState => {
  if (s.ended && !END_ACTIONS.has(a.type)) return s;
  const at = Number(a.payload?.at ?? 0);
  const psec = typeof a.payload?.psec === 'number' ? Math.max(0, a.payload.psec as number) : periodSec(s, at);
  const period = typeof a.payload?.period === 'number' ? (a.payload.period as number) : s.period;
  const sec = typeof a.payload?.sec === 'number' ? Math.max(0, a.payload.sec as number) : playedOffset(s, period) + psec;
  const uid = typeof a.payload?.uid === 'string' && a.payload.uid ? (a.payload.uid as string) : `e${s.seq + 1}`;
  const side = a.side === 'home' || a.side === 'away' ? a.side : undefined;
  const p1 = a.attribution;
  const p2 = second(a);
  const edit = !!a.payload?.edit;
  const pid = p1?.playerId ?? (typeof a.payload?.playerId === 'string' ? (a.payload.playerId as string) : undefined);
  const pname = p1?.playerName ?? (typeof a.payload?.playerName === 'string' ? (a.payload.playerName as string) : undefined);
  const who1 = pid ? { playerId: pid, ...(pname ? { playerName: pname } : {}) } : pname ? { playerName: pname } : {};
  const who2 = p2?.playerId ? { secondId: p2.playerId, ...(p2.playerName ? { secondName: p2.playerName } : {}) } : {};
  const mark = (st: LeagueState, m: Omit<SetMark, 'sec' | 'period'>): LeagueState => ({ ...st, setLog: [...(st.setLog ?? []), { ...m, sec, period } as SetMark] });
  /** push an event; a live score / kick at goal also ends the set running */
  const push = (st: LeagueState, e: Omit<LeagueEvent, 'id' | 'sec' | 'psec' | 'period'>): LeagueState => {
    const ev = { id: uid, sec, psec, period, ...e } as LeagueEvent;
    let next: LeagueState = { ...st, seq: st.seq + 1, events: [...st.events, ev] };
    const open = !edit && (ev.type === 'try' || ev.type === 'pentry' || (ev.type === 'kick' && ev.kick !== 'conv')) && st.setLog ? currentSet(st) : null;
    if (open) next = mark(next, { k: 'end', how: scoreEnd(open, ev), ref: ev.id });
    return next;
  };
  const score = (st: LeagueState, sd: Side, pts: number) => ({ ...st, [sd]: st[sd] + pts }) as LeagueState;
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
      const bonus = s.bonusTry && a.payload?.bonus === true;
      const e = { type: 'try' as const, side, ...who1, ...who2, ...(bonus ? { bonus: true } : {}) };
      const next = push(score(s, side, bonus ? BONUS_TRY_POINTS : TRY_POINTS), e);
      return gpEnd(next, next.events[next.events.length - 1], at, edit);
    }
    case 'PENALTY_TRY': {
      // 4 points to the team; the conversion follows from in front of the posts
      if (!side) return s;
      const next = push(score(s, side, PENALTY_TRY_POINTS), { type: 'pentry', side });
      return gpEnd(next, next.events[next.events.length - 1], at, edit);
    }
    case 'KICK': {
      if (!side) return s;
      const kick = kickOf(a.payload?.kick);
      const made = a.payload?.made === true;
      const two = kick === 'fg' && made && s.fg2 && a.payload?.two === true;
      const ev = { type: 'kick' as const, side, kick, made, ...(two ? { two: true } : {}), ...who1 };
      const next = push(made ? score(s, side, pointsOf(ev)) : s, ev);
      return made ? gpEnd(next, next.events[next.events.length - 1], at, edit) : next;
    }
    case 'SANCTION': {
      if (!side) return s;
      const k = a.payload?.sanction;
      const sanction: Sanction = k === 'sendOff' || k === 'report' ? k : 'sinBin';
      return push(s, { type: 'sanction', side, sanction, ...who1 });
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
    case 'SET_BALL': {
      // six-tackle sets: who has the ball now (a tap on the side already in possession changes nothing)
      if (!side || currentSet(s)?.side === side) return s;
      return mark(s, { k: 'ball', side });
    }
    case 'TACKLE': {
      if (!s.setLog || !currentSet(s)) return s;
      return mark(s, { k: 'tackle' });
    }
    case 'SET_END': {
      const how = a.payload?.how as SetEnd;
      const open = s.setLog ? currentSet(s) : null;
      if (!open || !TAP_ENDS.includes(how)) return s;
      // with "Errors & penalties" tracked, the same tap credits the player (or the team)
      const d = a.payload?.detail;
      if ((how === 'error' && d === 'error') || (how === 'penalty' && d === 'penalty')) {
        const ended = mark(s, { k: 'end', how, det: uid });
        return { ...ended, seq: ended.seq + 1, events: [...ended.events, { id: uid, sec, psec, period, type: 'detail', side: open.side, detail: d, ...who1 } as LeagueEvent] };
      }
      return mark(s, { k: 'end', how });
    }
    case 'REMOVE_EVENT': {
      const id = String(a.payload?.id ?? '');
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      const next: LeagueState = {
        ...s, events: s.events.filter((e) => e !== ev),
        ...(s.setLog?.some((m) => m.ref === id) ? { setLog: s.setLog.filter((m) => m.ref !== id) } : {}),
      };
      const pts = pointsOf(ev);
      return pts ? ({ ...next, [ev.side]: Math.max(0, next[ev.side] - pts) } as LeagueState) : next;
    }
    case 'END_PERIOD': {
      const clock = stopAt(s, at);
      const len = clock.ms > 0 ? Math.floor(clock.ms / 1000) : periodLen(s, s.period);
      const played = [...s.played.slice(0, s.period - 1), len];
      // a set still running at the end of a half ends with it
      const base: LeagueState = s.setLog && currentSet(s)
        ? { ...s, setLog: [...s.setLog, { k: 'end', how: 'period', sec: playedOffset(s) + len, period: s.period }] } : s;
      if (s.period < s.plan.length) return { ...base, played, period: s.period + 1, clock: { ms: 0 } };
      const more = s.home === s.away ? nextPlan(s) : [];
      if (more.length) return { ...base, played, plan: [...s.plan, ...more], period: s.period + 1, clock: { ms: 0 } };
      return { ...base, played, clock: { ms: len * 1000 }, ended: true };
    }
    case 'END':
      return s.ended ? s : { ...s, ended: true, clock: stopAt(s, at) };
    case 'STAT_ADJUST':
    default:
      return s;
  }
};

/* ----------------------------- derived figures ----------------------------- */

export const levelAtEnd = (s: LeagueState): boolean => s.home === s.away;
export const isComplete = (s: LeagueState): boolean => s.ended;

export function result(s: LeagueState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!isComplete(s)) return null;
  return { winner: s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw', home: s.home, away: s.away };
}

/** A side's team figures over a period scope. */
export interface LeagueTeamFigures {
  points: number; tries: number; penaltyTries: number; bonusTries: number;
  conversions: number; conversionAttempts: number; penGoals: number; penGoalAttempts: number;
  fieldGoals: number; fieldGoalAttempts: number; twoPointFieldGoals: number;
  sinBins: number; sendOffs: number; onReport: number; interchanges: number;
  detail: Record<string, number>;
}
export function teamFigures(s: LeagueState, side: Side, scope: 'all' | number = 'all'): LeagueTeamFigures {
  const f: LeagueTeamFigures = {
    points: 0, tries: 0, penaltyTries: 0, bonusTries: 0, conversions: 0, conversionAttempts: 0, penGoals: 0, penGoalAttempts: 0,
    fieldGoals: 0, fieldGoalAttempts: 0, twoPointFieldGoals: 0, sinBins: 0, sendOffs: 0, onReport: 0, interchanges: 0, detail: {},
  };
  for (const e of s.events) {
    if (e.side !== side || (scope !== 'all' && e.period !== scope)) continue;
    f.points += pointsOf(e);
    if (e.type === 'try') { f.tries++; if (e.bonus) f.bonusTries++; }
    else if (e.type === 'pentry') { f.tries++; f.penaltyTries++; }
    else if (e.type === 'kick') {
      if (e.kick === 'conv') { f.conversionAttempts++; if (e.made) f.conversions++; }
      else if (e.kick === 'fg') { f.fieldGoalAttempts++; if (e.made) { f.fieldGoals++; if (e.two) f.twoPointFieldGoals++; } }
      else { f.penGoalAttempts++; if (e.made) f.penGoals++; }
    } else if (e.type === 'sanction') {
      if (e.sanction === 'sinBin') f.sinBins++; else if (e.sanction === 'sendOff') f.sendOffs++; else f.onReport++;
    } else if (e.type === 'sub') { if (!e.temp && !e.back && (e.playerId || e.playerName)) f.interchanges++; }
    else if (e.type === 'detail' && e.detail) f.detail[DETAIL_STAT[e.detail]] = (f.detail[DETAIL_STAT[e.detail]] ?? 0) + 1;
  }
  return f;
}

/* ---------------------------- what's tracked ---------------------------- */

/** Is this "Stats to track" item tracked in the match — its toggle on, or any recorded? */
export function tracked(s: Pick<LeagueState, TrackFlag | 'events' | 'setLog'>, f: TrackFlag): boolean {
  if (s[f] === true) return true;
  if (f === 'trackSets') return !!s.setLog?.length;
  return s.events.some((e) => e.type === 'detail' && !!e.detail && FLAG_DETAILS[f].includes(e.detail));
}
/** The detail kinds tracked in the match. */
export const trackedDetails = (s: LeagueState): DetailKey[] => TRACK_FLAGS.filter((f) => tracked(s, f)).flatMap((f) => FLAG_DETAILS[f]);
/** The tracked detail keys (every line reads 0 for them; untracked: absent — never a false 0). */
export const trackedDetailKeys = (s: LeagueState): string[] => trackedDetails(s).map((d) => DETAIL_STAT[d]);

/** SD-17 standings units: tries per side (a tries tie-break, if an organiser adds one). */
export const leagueStandingsUnits = (s: LeagueState) => (s && Array.isArray(s.events) ? { tries: triesOf(s) } : null);

/* --------------------------- live settings (#14) --------------------------- */

export const LEAGUE_LIVE_SETTINGS: LiveSettings<LeagueState> = {
  title: '⚙️ Match settings',
  hint: 'Applies to this match only.',
  mode: 'config',
  fields: [
    { key: 'periodMinutes', label: 'Half length', type: 'number', default: 40, min: 1, max: 40, step: 1, hint: 'min / half' },
    { key: 'sinBinMinutes', label: 'Sin bin', type: 'number', default: 10, min: 1, max: 10, step: 1, hint: 'minutes' },
    ...TRACK_FIELDS,
  ] as FormatField[],
  read: (s) => ({
    periodMinutes: s.periodMinutes, sinBinMinutes: s.sinBinMinutes,
    ...Object.fromEntries(TRACK_FLAGS.map((f) => [f, s[f] === true])),
  }),
  defaults: { periodMinutes: 40, sinBinMinutes: 10, ...Object.fromEntries(TRACK_FLAGS.map((f) => [f, false])) },
};
