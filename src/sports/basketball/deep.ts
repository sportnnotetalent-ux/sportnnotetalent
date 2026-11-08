/**
 * Deep wave (court-team family) — basketball's broadcast-depth figures,
 * DERIVED from the event log. PURE (no React Native): the live panel, the
 * play-by-play, the box score rows and `statTotals` all read these, so a
 * correction (remove / edit / undo / AMEND) re-derives everything and an old
 * log replays to exactly what it showed before.
 *
 * Sources: the FIBA box score / FIBA LiveStats team stats (2PM-A, points in
 * the paint, second-chance points, fast-break points, points from turnovers,
 * bench points, fouls drawn) and the NBA.com / ESPN shot chart by zone.
 *
 * Coverage (D8 — never a false 0):
 *  - shot zones: only plays logged with "Shot zones" on carry a `zone`; the
 *    figures count charted shots and say how many of all were charted;
 *  - fast breaks: makes logged with "Fast-break points" on carry `fbt`; the
 *    tag `fb` marks the fast breaks among them; their points include the
 *    made and-one free throw (NBA convention — `fastBreakPlays`);
 *  - fouls drawn: fouls logged with "Fouls drawn" on carry `fdt` (+ who);
 *  - second-chance points: from typed (off / def) rebounds, so only shown once
 *    the match typed one; points off turnovers once a turnover / steal exists.
 */
import type { StatTotalsEntry } from '../types';
import { countsAsTeamFoul, gameSec, periodSeconds, startersOf, type BasketballState } from './engine.ts';
import { isFieldGoal } from './credits.ts';
import { pointsOf, SHOT_ZONES, type BBEvent, type ShotZone } from './events.ts';
import { hasPlayer, playId, samePlayer } from './names.ts';

type Side = 'home' | 'away';
export type BbScope = 'all' | number;
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const inScope = (e: BBEvent, scope: BbScope) => scope === 'all' || e.quarter === scope;

/** A play's moment in its period (seconds): the game clock where stamped,
 *  else its minute. One transitive key, so sorting never contradicts itself. */
const tOf = (e: BBEvent): number => (typeof e.sec === 'number' ? e.sec : (Number(e.minute) || 0) * 60);
/** Plays in game order: period, then the moment, then log order. */
export function gameOrder(events: BBEvent[]): BBEvent[] {
  return [...events].sort((a, b) => a.quarter - b.quarter || tOf(a) - tOf(b) || a.id - b.id);
}

/** Field goals (made + missed) of a game — `halfCourt` = 3×3 / first-to-N. */
const isFgEvent = (e: BBEvent, halfCourt: boolean): boolean =>
  e.type === 'miss' || (e.type === 'score' && isFieldGoal(e.points ?? 0, halfCourt));

/* --------------------------------- coverage --------------------------------- */

export interface BbCoverage {
  /** missed shots tracked (FGA, FG%) */
  shots: boolean;
  /** field goals charted with a zone, of all field goals */
  zones: { charted: number; of: number };
  /** made field goals logged while fast breaks were being tagged, of all */
  fastBreak: { tracked: number; of: number };
  /** fouls logged while fouls drawn were tracked, of all fouls */
  foulsDrawn: { tracked: number; of: number };
  /** a rebound was typed offensive / defensive (second-chance points) */
  reboundsTyped: boolean;
  /** a turnover or steal was logged (points off turnovers) */
  possession: boolean;
}

export function bbCoverage(s: BasketballState): BbCoverage {
  const halfCourt = s.targetPoints > 0;
  const fg = s.events.filter((e) => isFgEvent(e, halfCourt));
  const makes = fg.filter((e) => e.type === 'score');
  const fouls = s.events.filter((e) => e.type === 'foul');
  return {
    shots: s.trackMisses === true || s.events.some((e) => e.type === 'miss' || e.fga === true),
    zones: { charted: fg.filter((e) => !!e.zone).length, of: fg.length },
    fastBreak: { tracked: makes.filter((e) => e.fbt || e.fb).length, of: makes.length },
    foulsDrawn: { tracked: fouls.filter((e) => e.fdt || e.drawn || e.drawnPid).length, of: fouls.length },
    reboundsTyped: s.events.some((e) => e.type === 'rebound' && !!e.reboundType),
    possession: s.events.some((e) => e.type === 'turnover' || e.type === 'steal'),
  };
}
/** Is the feature on for this match? Tracked means captured (no-false-zeros
 *  NZU1–NZU4, the racket rule DD11): at least one play carries it. The toggle
 *  alone, or the `fbt` / `fdt` stamps every play gets while it is on, never
 *  show a row of zeros or write a career key. `c` is kept for callers. */
export const zonesOn = (s: BasketballState, c = bbCoverage(s)): boolean => c.zones.charted > 0;
export const fastBreakOn = (s: BasketballState, _c?: BbCoverage): boolean => s.events.some((e) => e.type === 'score' && e.fb === true && isFieldGoal(e.points ?? 0, s.targetPoints > 0));
export const foulsDrawnOn = (s: BasketballState, _c?: BbCoverage): boolean => s.events.some((e) => e.type === 'foul' && !!(e.drawnPid || e.drawn));

/* ------------------------ paired plays (US batch 5) ------------------------- */

/** A figure a paired steal / block gives the OTHER side: its turnover (a
 *  steal) or its missed field-goal attempt (a block). */
export interface PairedPlay { id: number; side: Side; kind: 'tov' | 'miss'; quarter: number }

/**
 * US batch 5 — FIBA / NBA box scores: every steal is the other side's
 * turnover, every block the other side's missed shot. Only steals / blocks
 * logged since (`pair`) — older ones keep their totals. When the scorer named
 * the ball-handler / shooter (a turnover / miss with `ref` = the steal /
 * block), that play carries the figure and the pairing adds nothing, so it
 * counts once. DERIVED: removing either play re-derives it.
 */
export function pairedPlays(s: BasketballState): PairedPlay[] {
  const linked = new Set<number>();
  for (const e of s.events) if ((e.type === 'turnover' || e.type === 'miss') && typeof e.ref === 'number') linked.add(e.ref);
  const out: PairedPlay[] = [];
  for (const e of s.events) {
    if (!e.pair || (e.type !== 'steal' && e.type !== 'block') || linked.has(e.id)) continue;
    out.push({ id: e.id, side: other(e.side), kind: e.type === 'steal' ? 'tov' : 'miss', quarter: e.quarter });
  }
  return out;
}

/* ------------------------- possessions (derived) ---------------------------- */

/** After a made basket by `side`, does play `e` still belong to that
 *  possession? Its and-one free throw (any free throw of that side), the
 *  assist, the other side's foul that gave the and-one, a time-out or a
 *  substitution do; anything else means the possession is over. */
const sameBasketPossession = (e: BBEvent, side: Side): boolean =>
  ((e.type === 'freethrow' || e.type === 'assist') && e.side === side)
  || (e.type === 'foul' && e.side !== side) || e.type === 'timeout' || e.type === 'sub';

/** Two plays by the same player — by id where both carry one, else by name.
 *  A play with no player (team-credited) is compatible with anyone. */
const sameShooter = (a: BBEvent, b: BBEvent): boolean =>
  !hasPlayer(a) || !hasPlayer(b) || (a.pid && b.pid ? a.pid === b.pid : a.playerName === b.playerName);

/**
 * Court-team round 2 — the and-one free throw of each made field goal,
 * DERIVED from the order of the plays (so an old log pairs up exactly as a
 * new one): the first free throw by the same side — and the same shooter,
 * where both plays name one — that follows the basket in the same
 * possession (`sameBasketPossession`: the foul that gave it, the assist, a
 * time-out or a sub may sit between them) and the same period. An and-one is
 * ONE shot: a free throw that opens a trip of two or more (the same side and
 * shooter back to back) belongs to another foul, not to the basket.
 * Map: basket id → its and-one free throw (made or missed).
 */
export function andOneFreeThrows(s: BasketballState): Map<number, BBEvent> {
  const out = new Map<number, BBEvent>();
  const halfCourt = s.targetPoints > 0;
  const ev = gameOrder(s.events);
  let basket: BBEvent | null = null;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (basket && e.quarter !== basket.quarter) basket = null;
    if (basket && e.type === 'freethrow' && e.side === basket.side && sameShooter(basket, e)) {
      const next = ev[i + 1];
      const trip = !!next && next.type === 'freethrow' && next.side === e.side && next.quarter === e.quarter && samePlayer(next, e);
      if (!trip) out.set(basket.id, e);
      basket = null;
      continue;
    }
    if (basket && !sameBasketPossession(e, basket.side)) basket = null;
    if (e.type === 'score' && isFieldGoal(e.points ?? 0, halfCourt)) basket = e;
  }
  return out;
}

/**
 * Fast-break points by play (event id → points). A basket tagged ⚡ counts
 * its points and — the NBA convention, founder 2026-10-22 — its made and-one
 * free throw too (all the points of the fast-break possession). Derived, so
 * a match whose fast breaks were tagged before this rule recomputes the same
 * way on its next render (and its career line at the next completion or
 * correction).
 */
export function fastBreakPlays(s: BasketballState): Map<number, number> {
  const out = new Map<number, number>();
  const halfCourt = s.targetPoints > 0;
  let ands: Map<number, BBEvent> | undefined;
  for (const e of s.events) {
    if (e.type !== 'score' || !e.fb || !isFieldGoal(e.points ?? 0, halfCourt)) continue;
    out.set(e.id, e.points ?? 0);
    const ft = (ands ??= andOneFreeThrows(s)).get(e.id);
    if (ft?.made) out.set(ft.id, 1);
  }
  return out;
}

export interface PossessionTag { second?: true; offTo?: true }

/**
 * Second-chance points and points off turnovers, from the ORDER of the plays
 * (FIBA / NBA definitions, as a scorer's log can give them):
 *  - an offensive rebound opens a second-chance window for that side;
 *  - a turnover, an offensive foul, or the other side's steal opens a
 *    points-off-turnovers window for the side that won the ball;
 *  - points that side scores while its window is open count; the window
 *    closes when the possession ends: a made field goal (after its and-one
 *    free throw), its own turnover, or any play by the other side that means
 *    they have the ball (a shot, a free throw, a rebound, an assist); a new
 *    period closes everything.
 * Returns the tags of the scoring plays (by event id).
 */
export function possessionTags(s: BasketballState): Map<number, PossessionTag> {
  const out = new Map<number, PossessionTag>();
  let sc: Side | null = null;
  let to: Side | null = null;
  let closeAfter: Side | null = null;
  let q: number | undefined;
  const close = (side: Side) => { if (sc === side) sc = null; if (to === side) to = null; };
  for (const e of gameOrder(s.events)) {
    if (e.quarter !== q) { sc = null; to = null; closeAfter = null; q = e.quarter; }
    // a made basket ends the possession — its and-one free throw (and the
    // foul that gave it, the assist, a time-out or a sub) still belong to it
    if (closeAfter && !sameBasketPossession(e, closeAfter)) {
      close(closeAfter); closeAfter = null;
    }
    const pts = pointsOf(e);
    if (pts > 0) {
      const tag: PossessionTag = { ...(sc === e.side ? { second: true as const } : {}), ...(to === e.side ? { offTo: true as const } : {}) };
      if (tag.second || tag.offTo) out.set(e.id, tag);
    }
    switch (e.type) {
      case 'score':
        close(other(e.side));
        if (pts > 0) closeAfter = e.side;
        break;
      case 'miss': case 'freethrow': case 'assist':
        close(other(e.side));
        break;
      case 'rebound':
        close(other(e.side));
        if (e.reboundType === 'off') sc = e.side;
        break;
      case 'turnover':
        close(e.side); to = other(e.side);
        break;
      case 'steal':
        close(other(e.side)); to = e.side;
        break;
      case 'foul':
        if (e.foulType === 'offensive') { close(e.side); to = other(e.side); }
        break;
      default:
        break; // block (the shot is the miss), timeout, sub, eject
    }
  }
  return out;
}

/* -------------------------------- time leading -------------------------------- */

/** FIBA "time leading": seconds each side led (and was level) on the game
 *  clock. Only on a game-clock match whose scoring plays all carry the clock
 *  second; null otherwise (never a guess). Earlier periods count in full. */
export function timeLeading(s: BasketballState, now = 0): { home: number; away: number; tied: number } | null {
  if (!s.gc) return null;
  const scoring = gameOrder(s.events).filter((e) => pointsOf(e) > 0);
  if (scoring.some((e) => typeof e.sec !== 'number')) return null;
  const out = { home: 0, away: 0, tied: 0 };
  let h = 0, a = 0, i = 0;
  for (let q = 1; q <= s.quarter; q++) {
    const len = periodSeconds(s, q);
    const played = gameSec(s, s.ended ? 0 : now);
    // the period in play runs to the clock now — at least to its last stamped play
    const lastSec = s.events.reduce((m, e) => (e.quarter === q && typeof e.sec === 'number' ? Math.max(m, e.sec) : m), 0);
    const end = q < s.quarter ? len : Math.min(len, Math.max(lastSec, played > 0 ? played : s.ended ? len : 0));
    let t = 0;
    const upTo = (until: number) => {
      const d = Math.max(0, until - t);
      if (h > a) out.home += d; else if (a > h) out.away += d; else out.tied += d;
      t = Math.max(t, until);
    };
    while (i < scoring.length && scoring[i].quarter === q) {
      const e = scoring[i];
      upTo(Math.min(e.sec ?? 0, end));
      if (e.side === 'home') h += pointsOf(e); else a += pointsOf(e);
      i++;
    }
    upTo(end);
  }
  return out;
}

/* ------------------------------- team figures -------------------------------- */

export interface ZoneLine { made: number; att: number; points: number }

export interface BbTeamFigures {
  points: number;
  /** field goals made / attempted (attempts only meaningful when shots tracked) */
  fgm: number; fga: number;
  /** missed field goals logged (EFF subtracts them) */
  fgx: number;
  /** 3-pointers (full court) */
  tpm: number; tpa: number;
  /** full court: 2-pointers; half court: 1-pointers (inside the arc) */
  inM: number; inA: number;
  /** half court: 2-pointers (behind the arc) */
  arcM: number; arcA: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  /** US batch 5: team rebounds (no player — FIBA's "team" box line) */
  teamReb: number;
  ast: number; stl: number; blk: number; tov: number;
  pf: number; teamFouls: number; tech: number; unsport: number; fd: number;
  timeouts: number;
  /** US batch 6: coach / bench technicals (not a player's personal foul) and
   *  jump balls / held balls that gave this side the ball */
  benchTech: number; jump: number;
  /** points by how they were scored */
  fromFt: number; fromIn: number; fromArc: number; from3: number;
  zones: Record<ShotZone, ZoneLine>;
  paint: number; second: number; fastBreak: number; offTo: number;
  /** FIBA efficiency over the side's plays (missed FG as logged) */
  eff: number;
}

const blankZones = (): Record<ShotZone, ZoneLine> =>
  Object.fromEntries(SHOT_ZONES.map((z) => [z, { made: 0, att: 0, points: 0 }])) as Record<ShotZone, ZoneLine>;

/** A side's figures over a scope (a period, or the whole game). Fast-break
 *  points include the made and-one free throw (`fastBreakPlays`). */
export function bbTeamFigures(s: BasketballState, side: Side, scope: BbScope = 'all', tags = possessionTags(s), fbp = fastBreakPlays(s)): BbTeamFigures {
  const halfCourt = s.targetPoints > 0;
  const tracked = bbCoverage(s).shots;
  const f: BbTeamFigures = {
    points: 0, fgm: 0, fga: 0, fgx: 0, tpm: 0, tpa: 0, inM: 0, inA: 0, arcM: 0, arcA: 0, ftm: 0, fta: 0,
    oreb: 0, dreb: 0, reb: 0, teamReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, teamFouls: 0, tech: 0, unsport: 0, fd: 0, timeouts: 0, benchTech: 0, jump: 0,
    fromFt: 0, fromIn: 0, fromArc: 0, from3: 0, zones: blankZones(), paint: 0, second: 0, fastBreak: 0, offTo: 0, eff: 0,
  };
  for (const e of s.events) {
    if (!inScope(e, scope)) continue;
    // fouls drawn: the OTHER side's fouls that name who drew them
    if (e.type === 'foul' && e.side !== side && (e.drawn || e.drawnPid)) f.fd++;
    if (e.side !== side) continue;
    const pts = pointsOf(e);
    f.points += pts;
    const tag = tags.get(e.id);
    if (tag?.second) f.second += pts;
    if (tag?.offTo) f.offTo += pts;
    f.fastBreak += fbp.get(e.id) ?? 0;
    switch (e.type) {
      case 'score': {
        const p = e.points ?? 0;
        if (!isFieldGoal(p, halfCourt)) { f.fromFt += pts; break; } // a full-court legacy "+1"
        f.fgm++; if (tracked) f.fga++;
        const arc = halfCourt ? p === 2 : p === 3;
        if (p === 3) { f.tpm++; if (tracked) f.tpa++; f.from3 += p; }
        if (arc) { f.arcM++; if (tracked) f.arcA++; f.fromArc += p; } else { f.inM++; if (tracked) f.inA++; f.fromIn += p; }
        if (e.zone) { const z = f.zones[e.zone]; z.made++; z.att++; z.points += p; if (e.zone === 'paint') f.paint += p; }
        break;
      }
      case 'miss': {
        const p = e.points ?? 2;
        f.fga++; f.fgx++;
        if (p === 3) f.tpa++;
        if (halfCourt ? p === 2 : p === 3) f.arcA++; else f.inA++;
        if (e.zone) f.zones[e.zone].att++;
        break;
      }
      case 'freethrow': f.fta++; if (e.made) { f.ftm++; f.fromFt += 1; } break;
      case 'rebound': f.reb++; if (e.reboundType === 'off') f.oreb++; else if (e.reboundType === 'def') f.dreb++; if (e.team) f.teamReb++; break;
      case 'assist': f.ast++; break;
      case 'steal': f.stl++; break;
      case 'block': f.blk++; break;
      case 'turnover': f.tov++; break;
      case 'foul':
        // US batch 6: a coach / bench technical is the coach's, not a personal foul
        if (e.bench) { f.tech++; f.benchTech++; break; }
        f.pf++;
        if (e.tov) f.tov++; // US batch 1: a new offensive foul is a turnover too
        if (countsAsTeamFoul(s, e)) f.teamFouls++;
        if (e.foulType === 'technical') f.tech++;
        if (e.foulType === 'unsportsmanlike' || e.foulType === 'disqualifying' || e.foulType === 'flagrant' || e.foulType === 'disruptive') f.unsport++;
        break;
      case 'timeout': f.timeouts++; break;
      case 'jump': f.jump++; break;
      default: break;
    }
  }
  // US batch 5: the other side's paired steals / blocks (no ball-handler / shooter named)
  for (const x of pairedPlays(s)) {
    if (x.side !== side || (scope !== 'all' && x.quarter !== scope)) continue;
    if (x.kind === 'tov') f.tov++;
    else { f.fga++; f.fgx++; }
  }
  f.eff = f.points + f.reb + f.ast + f.stl + f.blk - f.tov - (f.fta - f.ftm) - f.fgx; // missed FG as logged (an untracked game has none)
  return f;
}

/** Bench points of a side over a scope: points by players who did not start
 *  (the five set on court, else the caller's lineup). null = starters unknown. */
export function benchPoints(s: BasketballState, side: Side, scope: BbScope, starters?: { ids?: string[]; names?: string[] }): number | null {
  const five = startersOf(s, side, starters);
  if (!five || (!five.ids?.length && !five.names?.length)) return null;
  const ids = new Set(five.ids ?? []);
  const names = new Set(five.names ?? []);
  let n = 0;
  for (const e of s.events) {
    if (e.side !== side || !inScope(e, scope) || !hasPlayer(e)) continue;
    const pts = pointsOf(e);
    if (!pts) continue;
    const id = playId(s, e);
    if ((id && ids.has(id)) || (e.playerName && names.has(e.playerName))) continue;
    n += pts;
  }
  return n;
}

/* ------------------------- per-player deep keys ----------------------------- */

/** The deep line keys (statTotals-only: never credited live). */
export const BB_TWO_KEYS = ['twosMade', 'twosAtt'] as const;
export const BB_ZONE_KEYS = ['paintMade', 'paintAtt', 'midMade', 'midAtt', 'c3Made', 'c3Att', 'ab3Made', 'ab3Att'] as const;
export const BB_DEEP_KEYS = [...BB_TWO_KEYS, ...BB_ZONE_KEYS, 'foulsDrawn', 'fastBreakPoints'] as const;
const ZONE_KEY: Record<ShotZone, [string, string]> = { paint: ['paintMade', 'paintAtt'], mid: ['midMade', 'midAtt'], c3: ['c3Made', 'c3Att'], ab3: ['ab3Made', 'ab3Att'] };

/** Which deep keys this match owns (each only when it was tracked):
 *  2PM / 2PA in full-court games (2PA when misses were tracked), the zone
 *  keys once a shot was charted (attempts with misses tracked), FD and
 *  fast-break points once tracked. Half-court (3×3) games write no 2P / zone
 *  keys: their 1s and 2s aren't the 5×5 shots a career compares. */
export function bbDeepKeys(s: BasketballState, c = bbCoverage(s)): string[] {
  const full = !(s.targetPoints > 0);
  const out: string[] = [];
  if (full) out.push('twosMade', ...(c.shots ? ['twosAtt'] : []));
  if (full && zonesOn(s, c)) for (const z of SHOT_ZONES) out.push(ZONE_KEY[z][0], ...(c.shots ? [ZONE_KEY[z][1]] : []));
  if (foulsDrawnOn(s, c)) out.push('foulsDrawn');
  if (fastBreakOn(s, c)) out.push('fastBreakPoints');
  return out;
}

/** One play's deep credits: [who (name, id, side), keys]. `fbp` = the
 *  fast-break points by play (the made and-one free throw is credited to its
 *  shooter, as its point is). */
function deepCredits(s: BasketballState, e: BBEvent, keys: Set<string>, fbp: Map<number, number>): { name?: string; pid?: string; side: Side; stats: Record<string, number> }[] {
  const out: { name?: string; pid?: string; side: Side; stats: Record<string, number> }[] = [];
  const add = (name: string | undefined, pid: string | undefined, side: Side, stats: Record<string, number>) => {
    const kept = Object.fromEntries(Object.entries(stats).filter(([k]) => keys.has(k)));
    if (Object.keys(kept).length) out.push({ name, pid, side, stats: kept });
  };
  const halfCourt = s.targetPoints > 0;
  const tracked = keys.has('twosAtt');
  if (e.type === 'score' && isFieldGoal(e.points ?? 0, halfCourt)) {
    const st: Record<string, number> = {};
    if (!halfCourt && e.points === 2) { st.twosMade = 1; if (tracked) st.twosAtt = 1; }
    if (e.zone) { st[ZONE_KEY[e.zone][0]] = 1; st[ZONE_KEY[e.zone][1]] = 1; }
    if (e.fb) st.fastBreakPoints = e.points ?? 0;
    add(e.playerName, e.pid, e.side, st);
  } else if (e.type === 'miss') {
    const st: Record<string, number> = {};
    if (!halfCourt && (e.points ?? 2) === 2) st.twosAtt = 1;
    if (e.zone) st[ZONE_KEY[e.zone][1]] = 1;
    add(e.playerName, e.pid, e.side, st);
  } else if (e.type === 'foul' && (e.drawn || e.drawnPid)) {
    add(e.drawn, e.drawnPid, other(e.side), { foulsDrawn: 1 });
  } else if (e.type === 'freethrow' && fbp.has(e.id)) {
    add(e.playerName, e.pid, e.side, { fastBreakPoints: fbp.get(e.id)! });
  }
  return out;
}

/** The deep keys per player id, for `statTotals` (merged by totals.ts). A
 *  credit whose player can't be resolved to an id is skipped (it never voids
 *  the rest). `zero` = the owned keys (every line gets them, 0 included). */
export function bbDeepTotals(s: BasketballState): { keys: string[]; lines: Record<string, StatTotalsEntry> } {
  const keys = bbDeepKeys(s);
  const lines: Record<string, StatTotalsEntry> = {};
  if (!keys.length) return { keys, lines };
  const set = new Set(keys);
  const fbp = fastBreakPlays(s);
  for (const e of s.events) {
    for (const c of deepCredits(s, e, set, fbp)) {
      const id = c.pid ?? (c.name ? s.ids?.[c.name] : undefined);
      if (!id) continue;
      const line = lines[id] ?? (lines[id] = { side: c.side, stats: {} });
      for (const [k, v] of Object.entries(c.stats)) line.stats[k] = (line.stats[k] ?? 0) + v;
    }
  }
  return { keys, lines };
}

/** A player's key in the box (boxSources): the id, else an older log's name. */
export type BbKeyOf = (pid: string | undefined, name: string | undefined) => string | undefined;
const defaultKey = (s: BasketballState): BbKeyOf => (pid, name) =>
  pid || (name ? s.ids?.[name] ?? `~${name}` : undefined);

/** The deep keys per player (by `keyOf` — the box score's key: the id, else
 *  an older log's name) for the box score rows, over a scope: `zero` fills
 *  every row (a tracked 0, never "–"), `team` = plays logged with no player
 *  (so the totals row adds up). */
export function bbDeepRows(s: BasketballState, scope: BbScope = 'all', keyOf: BbKeyOf = defaultKey(s)): {
  zero: Record<string, number>;
  home: { rows: Map<string, Record<string, number>>; team: Record<string, number> };
  away: { rows: Map<string, Record<string, number>>; team: Record<string, number> };
} {
  const keys = bbDeepKeys(s);
  const zero = Object.fromEntries(keys.map((k) => [k, 0]));
  const out = { zero, home: { rows: new Map<string, Record<string, number>>(), team: {} as Record<string, number> }, away: { rows: new Map<string, Record<string, number>>(), team: {} as Record<string, number> } };
  if (!keys.length) return out;
  const set = new Set(keys);
  const fbp = fastBreakPlays(s);
  for (const e of s.events) {
    if (!inScope(e, scope)) continue;
    for (const c of deepCredits(s, e, set, fbp)) {
      const key = c.pid || c.name ? keyOf(c.pid, c.name) : undefined;
      const bucket = key ? (out[c.side].rows.get(key) ?? out[c.side].rows.set(key, {}).get(key)!) : out[c.side].team;
      for (const [k, v] of Object.entries(c.stats)) bucket[k] = (bucket[k] ?? 0) + v;
    }
  }
  return out;
}

/** "18:24" — seconds as minutes:seconds. */
export const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
