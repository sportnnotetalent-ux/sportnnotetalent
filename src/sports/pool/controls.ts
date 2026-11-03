/**
 * Pool — the scorer controls' logic, PURE (no React Native), so node tests
 * cover it: the action builders, what the screen offers in each state, the
 * plain-English labels, what a tap would end (for the confirm sheet), the
 * double-tap guard and the scotch-doubles rotation. index.tsx only draws it.
 *
 * Every action a builder returns goes through `stamp`, which adds what the
 * engine's break list requires (docs/security/breaks/pool-engine.md):
 *   - `rack`: the number of the rack in play, on EVERY action (#12) — a tap
 *     for an earlier rack (a duplicate, a straggler) is ignored;
 *   - the side at the table on every shot (#13) — a duplicate can't pass the
 *     turn twice;
 * and what the app needs:
 *   - on the match's first event, the game / race / sets it is scored under
 *     (the pin, break #26: a later format change can't re-score it);
 *   - `pid`: who shot (scotch doubles; singles: the side's one player) — an
 *     id only, never a name;
 *   - `at`: the scorer's clock, for the commentary.
 * No action carries an `attribution`: nothing is credited live; every player
 * figure is derived from the replayed state (./totals.ts).
 */
import type { ScoreAction } from '../types';
import { awardReasonOf, cnt, onTwoFouls, summary, type AwardReason, type FoulKind, type PendingKind, type RackEnd } from './engine.ts';
import { isSide, knownGame, MONEY, other, SOLIDS, STRIPES, TOP, type PoolGame, type Side } from './balls.ts';
import { creditOf, feedOf, poolReducer, SHOT_TYPES, validPid, type PoolMatch } from './match.ts';

export type { Side };
type Name = (side: Side) => string;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const PENDING: ReadonlySet<string> = new Set(['push', 'wrongPot', 'threeBall', 'illegalBreak', 'eightBreak', 'eightFoul']);

/** The rack in play, read defensively (break #24 / #25): a stored snapshot
 *  may be old or hostile, so every field is checked before the screen uses
 *  it. null = no live rack (the match is over, or the state can't be read). */
export interface LiveRackView {
  game: PoolGame; n: number; phase: 'break' | 'play'; table: number[]; breaker: Side | null; shooter: Side | null;
  pending: { kind: PendingKind; by: Side } | null; bih: boolean; push: boolean; solids: Side | null; reracks: number;
}
export function liveRack(s: unknown): LiveRackView | null {
  if (!isObj(s) || s.ended === true || !isObj(s.rack)) return null;
  const game = knownGame(s.game);
  const r = s.rack;
  const n = cnt(r.n);
  if (!game || !n) return null;
  const top = TOP[game];
  const table = Array.isArray(r.table)
    ? [...new Set(r.table.filter((b): b is number => typeof b === 'number' && Number.isInteger(b) && b >= 1 && b <= top))].sort((a, b) => a - b)
    : [];
  const p = r.pending;
  return {
    game, n, phase: r.phase === 'play' ? 'play' : 'break', table,
    breaker: isSide(r.breaker) ? r.breaker : null, shooter: isSide(r.shooter) ? r.shooter : null,
    pending: isObj(p) && typeof p.kind === 'string' && PENDING.has(p.kind) && isSide(p.by) ? { kind: p.kind as PendingKind, by: p.by } : null,
    bih: r.bih === true, push: r.push === true, solids: isSide(r.solids) ? r.solids : null, reracks: cnt(r.reracks),
  };
}

export interface TapOpts {
  /** who shot (player id) */
  pid?: string | null;
  /** the scorer's clock (ms) */
  at?: number;
}

/** Add the rack in play, the side at the table, the first-event format, who shot, the time. */
export function stamp(s: PoolMatch, a: ScoreAction, o: TapOpts = {}): ScoreAction {
  const r = liveRack(s);
  const payload: Record<string, unknown> = { ...(a.payload ?? {}) };
  if (r) payload.rack = r.n;
  let side = a.side;
  if (r && !side && SHOT_TYPES.has(a.type) && r.shooter) side = r.shooter;
  if (r && s.seq === 0) {
    payload.game = r.game;
    payload.race = cnt(s.raceTo) || 1;
    payload.sets = cnt(s.setsToWin) || 1;
  }
  const pid = validPid(o.pid);
  if (pid) payload.pid = pid;
  if (typeof o.at === 'number' && Number.isSafeInteger(o.at) && o.at > 0) payload.at = o.at;
  return { type: a.type, ...(side ? { side } : {}), payload };
}

const list = (v?: number[]) => (Array.isArray(v) ? [...v] : []);

/** LAG — who breaks rack 1 (the lag winner's choice). */
export const lagAction = (s: PoolMatch, breaker: Side, o?: TapOpts) =>
  stamp(s, { type: 'LAG', side: breaker, payload: { breaks: breaker } }, o);

/** BREAK — the balls that fell; a foul, an illegal break (nothing pocketed, under four
 *  balls to a rail), a 9-ball short break (three-ball rule). `side` only when no breaker is known. */
export function breakAction(s: PoolMatch, d: { pots?: number[]; off?: number[]; foul?: FoulKind; illegal?: boolean; short?: boolean; side?: Side }, o?: TapOpts): ScoreAction {
  const side = s?.rack?.breaker ?? d.side;
  const off = list(d.off);
  return stamp(s, {
    type: 'BREAK', ...(side ? { side } : {}),
    payload: { pots: list(d.pots), ...(off.length ? { off } : {}), ...(d.foul ? { foul: d.foul } : {}), ...(d.illegal ? { illegal: true } : {}), ...(d.short ? { short: true } : {}) },
  }, o);
}

/** POT — balls pocketed with no foul, in the order tapped (the first = the called ball). */
export const potAction = (s: PoolMatch, pots: number[], d: { called?: boolean; calledBall?: number } = {}, o?: TapOpts) =>
  stamp(s, { type: 'POT', payload: { pots: list(pots), ...(d.called === false ? { called: false } : {}), ...(d.calledBall ? { calledBall: d.calledBall } : {}) } }, o);

export const missAction = (s: PoolMatch, o?: TapOpts) => stamp(s, { type: 'MISS', payload: {} }, o);

export const safetyAction = (s: PoolMatch, pots: number[] = [], o?: TapOpts) =>
  stamp(s, { type: 'SAFETY', payload: pots.length ? { pots: list(pots) } : {} }, o);

/** FOUL — `balls` are the balls that fell on it (driven off the table for `offTable`);
 *  `by` = the side that played out of turn (3.12), when it is not the side at the table. */
export function foulAction(s: PoolMatch, kind: FoulKind, d: { pots?: number[]; off?: number[]; balls?: number[]; by?: Side } = {}, o?: TapOpts): ScoreAction {
  const sel = list(d.balls);
  const pots = [...list(d.pots), ...(kind === 'offTable' ? [] : sel)];
  const off = [...list(d.off), ...(kind === 'offTable' ? sel : [])];
  return stamp(s, { type: 'FOUL', ...(d.by ? { side: d.by } : {}), payload: { kind, ...(pots.length ? { pots } : {}), ...(off.length ? { off } : {}) } }, o);
}

export function pushAction(s: PoolMatch, d: { pots?: number[]; off?: number[]; foul?: FoulKind } = {}, o?: TapOpts): ScoreAction {
  const pots = list(d.pots), off = list(d.off);
  return stamp(s, { type: 'PUSH', payload: { ...(pots.length ? { pots } : {}), ...(off.length ? { off } : {}), ...(d.foul ? { foul: d.foul } : {}) } }, o);
}

export const chooseAction = (s: PoolMatch, choice: 'play' | 'pass' | 'rerack', breaker?: Side, o?: TapOpts) =>
  stamp(s, { type: 'CHOOSE', payload: { choice, ...(breaker ? { breaker } : {}) } }, o);

/** RACK — the rack result only (quick mode), or an award mid-rack. */
export function rackAction(s: PoolMatch, winner: Side, f: { bnr?: boolean; golden?: boolean; runOut?: boolean; breaker?: Side | null; reason?: AwardReason | null } = {}, o?: TapOpts): ScoreAction {
  const reason = awardReasonOf(f.reason);
  return stamp(s, {
    type: 'RACK', side: winner,
    payload: { ...(f.breaker ? { breaker: f.breaker } : {}), ...(f.bnr ? { bnr: true } : {}), ...(f.golden ? { golden: true } : {}), ...(f.runOut ? { runOut: true } : {}), ...(reason ? { reason } : {}) },
  }, o);
}

export const stalemateAction = (s: PoolMatch, o?: TapOpts) => stamp(s, { type: 'STALEMATE', payload: {} }, o);

/** Cue batch 6 — can the player at the table take the shot-clock extension
 *  now? Only when the organiser tracks it (Stats to track), during play with
 *  no choice waiting, and once per player per rack (WPA playing regulations). */
export function extensionReady(s: PoolMatch): boolean {
  const r = liveRack(s);
  if (!r || r.phase !== 'play' || r.pending || !r.shooter || !isObj(s.opt) || s.opt.shotClock !== true) return false;
  const used = isObj(s.xr) ? s.xr[r.shooter] : undefined;
  return used !== r.n;
}
/** EXTENSION — the player at the table takes the shot-clock extension (null when it can't be taken). */
export const extensionAction = (s: PoolMatch, o?: TapOpts): ScoreAction | null => {
  const r = liveRack(s);
  return r?.shooter ? stamp(s, { type: 'EXTENSION', side: r.shooter, payload: {} }, o) : null;
};

// ------------------------------------------------- what the screen offers --

export type PoolPanel =
  | { kind: 'over'; winner: Side | null }
  /** who breaks rack 1 */
  | { kind: 'lag'; rack: 1 }
  /** the break shot (breaker null = the scorer names who breaks) */
  | { kind: 'break'; rack: number; breaker: Side | null; balls: number[]; shortRule: boolean; illegalFoul: boolean }
  /** the engine waits for a choice */
  | { kind: 'choice'; rack: number; by: Side; pending: PendingKind }
  /** a shot at the table */
  | {
    kind: 'shot'; rack: number; shooter: Side; table: number[]; bih: boolean; twoFouls: boolean; push: boolean;
    /** 8- and 10-ball are call-shot games (a "not called" chip) */
    callShot: boolean;
    /** 10-ball has no safety call (WPA 6.5) */
    safetyCall: boolean;
    /** 8-ball: who holds the solids (null = open table) */
    solids: Side | null;
    money: number;
    /** 10-ball with the older rule: say when the 10 was the called ball */
    tenCall: boolean;
  };

export function poolPanel(s: PoolMatch): PoolPanel {
  const r = liveRack(s);
  if (!r) return { kind: 'over', winner: isObj(s) && isSide(s.winner) ? s.winner : null };
  const g = r.game;
  if (r.phase === 'break') {
    if (r.n === 1 && !r.breaker && !r.reracks && !(Array.isArray(s.racks) && s.racks.length)) return { kind: 'lag', rack: 1 };
    return { kind: 'break', rack: r.n, breaker: r.breaker, balls: r.table, shortRule: s.threeBallRule === true, illegalFoul: g !== 'eight' };
  }
  if (r.pending) return { kind: 'choice', rack: r.n, by: r.pending.by, pending: r.pending.kind };
  // a rack in play with nobody at the table can only be a broken snapshot: nothing to offer
  if (!r.shooter) return { kind: 'over', winner: null };
  const shooter = r.shooter;
  return {
    kind: 'shot', rack: r.n, shooter, table: r.table, bih: r.bih, twoFouls: onTwoFouls(s) === shooter,
    push: r.push && g !== 'eight', callShot: g !== 'nine', safetyCall: g !== 'ten',
    solids: g === 'eight' ? r.solids : null, money: MONEY[g], tenCall: g === 'ten' && s.tenEarly === true,
  };
}

export interface ChoiceOption { choice: 'play' | 'pass' | 'rerack'; breaker?: Side; label: string }

/** The options of a pending choice, in plain words. */
export function choiceOptions(s: PoolMatch, name: Name): ChoiceOption[] {
  const p = liveRack(s)?.pending;
  if (!p) return [];
  const by = p.by, them = other(by);
  switch (p.kind) {
    case 'push':
    case 'wrongPot':
      return [{ choice: 'play', label: `${name(by)} plays from here` }, { choice: 'pass', label: `${name(by)} hands it back to ${name(them)}` }];
    case 'threeBall':
      return [{ choice: 'play', label: `${name(by)} accepts the table` }, { choice: 'pass', label: `${name(by)} hands it back to ${name(them)} (who may push out)` }];
    case 'illegalBreak':
      return [
        { choice: 'play', label: `${name(by)} accepts the table` },
        { choice: 'rerack', breaker: by, label: `Re-rack: ${name(by)} breaks` },
        { choice: 'rerack', breaker: them, label: `Re-rack: ${name(them)} breaks again` },
      ];
    case 'eightBreak':
      return [{ choice: 'play', label: `Spot the 8: ${name(by)} keeps shooting` }, { choice: 'rerack', label: `${name(by)} breaks again` }];
    case 'eightFoul':
      return [
        { choice: 'play', label: `Spot the 8: ${name(by)} shoots, ball in hand behind the head string` },
        { choice: 'rerack', breaker: by, label: `Re-rack: ${name(by)} breaks` },
        { choice: 'rerack', breaker: them, label: `Re-rack: ${name(them)} breaks` },
      ];
  }
}

/** What the choice is about, in one line. */
export function choiceQuestion(s: PoolMatch, name: Name): string {
  const p = liveRack(s)?.pending;
  if (!p) return '';
  const by = name(p.by);
  switch (p.kind) {
    case 'push': return `${name(other(p.by))} pushed out. ${by} chooses:`;
    case 'wrongPot': return `${name(other(p.by))} pocketed a ball that was not called. ${by} chooses:`;
    case 'threeBall': return `Short break (three-ball rule). ${by} chooses:`;
    case 'illegalBreak': return `Illegal break: nothing went in and fewer than four balls hit a rail. ${by} chooses:`;
    case 'eightBreak': return `The 8 went in on the break. ${by} chooses:`;
    case 'eightFoul': return `The 8 went in on a break foul. ${by} chooses:`;
  }
}

const BREAK_WORD: Record<string, string> = { alternate: 'alternate', winner: 'winner breaks', loser: 'loser breaks' };

/** "Rack 4 · Asha to break (alternate)" — who breaks the rack waiting for its break. */
export function breakLine(s: PoolMatch, name: Name): string {
  const r = liveRack(s);
  if (!r) return '';
  if (!r.breaker) return `Rack ${r.n} · who breaks?`;
  const fmt = s.breakFormat === 'winner' || s.breakFormat === 'loser' ? s.breakFormat : 'alternate';
  return `Rack ${r.n} · ${name(r.breaker)} to break${r.n > 1 ? ` (${BREAK_WORD[fmt]})` : ''}`;
}

// ------------------------------------------------------- foul names --

/** The fouls, in the order the sheet lists them, in plain words. */
export const FOUL_LABEL: Record<FoulKind, string> = {
  scratch: 'Cue ball pocketed or off the table',
  wrongBall: 'Wrong ball hit first',
  noRail: 'No rail after contact',
  offTable: 'Object ball off the table',
  touched: 'Touched a ball',
  doubleHit: 'Double hit',
  pushShot: 'Push shot',
  jump: 'Illegal jump',
  moving: 'Shot while balls were moving',
  noFoot: 'No foot on the floor',
  placement: 'Cue ball placed wrongly',
  slowPlay: 'Slow play (shot clock)',
  outOfTurn: 'Played out of turn',
  illegalBreak: 'Illegal break',
  other: 'Other foul',
};
/** Short names (feed, undo label). */
export const FOUL_SHORT: Record<FoulKind, string> = {
  scratch: 'scratch', wrongBall: 'wrong ball first', noRail: 'no rail', offTable: 'ball off the table', touched: 'touched ball',
  doubleHit: 'double hit', pushShot: 'push shot', jump: 'illegal jump', moving: 'balls moving', noFoot: 'no foot down',
  placement: 'cue ball placement', slowPlay: 'slow play', outOfTurn: 'out of turn', illegalBreak: 'illegal break', other: 'other',
};
/** Cue batch 5: an awarded rack's reason (the chips; the commentary words). */
export const AWARD_REASON_LABEL: Record<AwardReason, string> = { concession: 'Concession', conduct: 'Conduct (3.16)', forfeit: 'Forfeit', other: 'Other' };
export const AWARD_REASON_WORD: Record<AwardReason, string> = { concession: 'conceded', conduct: 'conduct', forfeit: 'forfeit', other: 'other' };
/** The foul chips at the table (the break has its own short list). */
// (no 'outOfTurn': the chips are fouls by the player at the table; playing out
// of turn is the other player's, and has its own button)
export const PLAY_FOULS: FoulKind[] = ['scratch', 'wrongBall', 'noRail', 'offTable', 'touched', 'doubleHit', 'pushShot', 'jump', 'moving', 'noFoot', 'placement', 'slowPlay', 'other'];
export const BREAK_FOULS: FoulKind[] = ['scratch', 'offTable', 'other'];

// --------------------------------------------- what a tap would end --

export interface TapEnd { kind: 'rack' | 'set' | 'match'; rack: number; winner: Side; how: RackEnd; set?: number }

/** Would the engine take this tap, and does it end a rack, a set or the match? */
export function outcomeOf(s: PoolMatch, a: ScoreAction): { accepted: boolean; ends: TapEnd | null } {
  const next = poolReducer(s, a);
  if (next === s) return { accepted: false, ends: null };
  if (!Array.isArray(next.racks) || next.racks.length <= (s.racks?.length ?? 0)) return { accepted: true, ends: null };
  const rec = next.racks[next.racks.length - 1];
  const base = { rack: rec.n, winner: rec.winner, how: rec.how };
  if (next.ended) return { accepted: true, ends: { kind: 'match', ...base, set: rec.set } };
  if (next.sets.length > s.sets.length) return { accepted: true, ends: { kind: 'set', ...base, set: rec.set } };
  return { accepted: true, ends: { kind: 'rack', ...base } };
}

/** How a rack was decided, in a sentence (`W` won it, `L` lost it). */
export function howSentence(how: RackEnd, W: string, L: string, money: number): string {
  switch (how) {
    case 'money': return `${W} pocketed the ${money}`;
    case 'golden': return 'Golden break: the 9 went in on the break';
    case 'eightFoul': return `${L} pocketed the 8 on a foul`;
    case 'eightEarly': return `${L} pocketed the 8 before clearing the group`;
    case 'eightPocket': return `${L} pocketed the 8 in a pocket that was not called`;
    case 'eightOff': return `${L} knocked the 8 off the table`;
    case 'threeFoul': return `${L} fouled three times in a row`;
    case 'awarded': return `No more shots in this rack: it is awarded to ${W}`;
    case 'quick': return 'Rack result only (no shots)';
  }
}

/** The confirm sheet's words for a rack-, set- or match-ending tap, a stalemate,
 *  or an award; null = no need to ask. */
export function confirmFor(s: PoolMatch, a: ScoreAction, name: Name): { title: string; message: string; yesLabel: string } | null {
  const r = liveRack(s);
  if (!r) return null;
  const out = outcomeOf(s, a);
  if (!out.accepted) return null;
  if (a.type === 'STALEMATE') {
    return { title: `Stalemate: re-rack rack ${r.n}?`, message: `${r.breaker ? name(r.breaker) : 'The same player'} breaks again. The shots so far stay in the stats.`, yesLabel: 'Yes, re-rack' };
  }
  const e = out.ends;
  if (!e) return null;
  const W = name(e.winner), L = name(other(e.winner));
  const next = poolReducer(s, a);
  const how = howSentence(e.how, W, L, MONEY[r.game]);
  const sets = setsOf(s.setsToWin);
  const score = next.ended || e.kind === 'set'
    ? (sets > 1 ? `Sets ${next.setsWon.home}–${next.setsWon.away} (${name('home')} first)` : `${Math.max(...lastSet(next))}–${Math.min(...lastSet(next))}`)
    : `${sets > 1 ? `Set ${next.sets.length + 1}: ` : ''}${next.current.home}–${next.current.away} (${name('home')} first)`;
  if (e.kind === 'match') return { title: `${W} wins the match?`, message: `${how}. ${score}. The match ends.`, yesLabel: 'Yes, end the match' };
  if (e.kind === 'set') return { title: `${W} wins set ${e.set}?`, message: `${how}. ${score}.`, yesLabel: 'Yes, end the set' };
  return { title: `Rack ${e.rack} to ${W}?`, message: `${how}. ${score}.`, yesLabel: 'Yes, record it' };
}
const lastSet = (s: PoolMatch): [number, number] => s.sets[s.sets.length - 1] ?? [s.current.home, s.current.away];

// ---------------------------------------------------- the tap guard --

/** How long a second tap on an unchanged screen counts as a double tap (ms). */
export const DOUBLE_TAP_MS = 2000;

/**
 * The double-tap guard. A tap goes through only if
 *   - it answers the state it was asked about (`asked`: a confirm sheet was
 *     open while another phone scored or an Undo replayed — break #3);
 *   - the state has moved since the last tap that went through (a second tap
 *     before the screen redraws is a double tap) — or, with the clock given,
 *     DOUBLE_TAP_MS have passed, so a screen that never redrew can't block the
 *     scorer for good (break #4);
 *   - the engine would take it (an ignored tap is never sent: no junk event).
 * States are compared by identity: Undo replays the log into a new object,
 * so taps after an undo go through.
 */
export function makeTapGuard<S>(reduce: (s: S, a: ScoreAction) => S): (s: S, a: ScoreAction, o?: { asked?: S; now?: number }) => boolean {
  let last: { s: S; now?: number } | null = null;
  return (s, a, o = {}) => {
    if (o.asked !== undefined && o.asked !== s) return false;
    if (last && last.s === s && !(o.now !== undefined && last.now !== undefined && o.now - last.now >= DOUBLE_TAP_MS)) return false;
    if (reduce(s, a) === s) return false;
    last = { s, now: o.now };
    return true;
  };
}

// ------------------------------------------- scotch doubles: who shoots --

/** How scotch-doubles partners take turns: 'shot' = every other shot (world
 *  rules, the default), 'turn' = each plays a full turn at the table. */
export const scotchTurns = (s: PoolMatch): 'shot' | 'turn' =>
  (isObj(s) && isObj(s.opt) && s.opt.turns === 'turn' ? 'turn' : 'shot');

/**
 * Scotch doubles: who shoots. The side's two players (the first two of its
 * roster) and the one to suggest:
 *  - a break: the partner who did not break the side's last break; the side's
 *    first break goes to whoever played first for it (pool-scotch-rotation SR3);
 *  - world rules: the partner who did not take the side's last shot (the break
 *    counts as a shot);
 *  - full turn: the same player while the side's turn goes on (`keeps`), else
 *    the partner of the side's last shooter.
 * The scorer can always tap the other one; the rotation follows who was credited.
 */
export function shooterPick(s: PoolMatch, side: Side, ids: readonly string[]): { ids: string[]; suggested: string | null; keeps: boolean } {
  const two = [...new Set(ids.map(validPid).filter((x): x is string => !!x))].slice(0, 2);
  if (!two.length) return { ids: [], suggested: null, keeps: false };
  const cr = creditOf(s);
  const r = liveRack(s);
  const partner = (x: string | null) => (x && two.length > 1 && two.includes(x) ? two.find((y) => y !== x)! : null);
  if (r?.phase === 'break') {
    const first = cr.ids[side].find((x) => two.includes(x));
    return { ids: two, suggested: partner(cr.lastBreak[side]) ?? (cr.lastBreak[side] ? null : first) ?? two[0], keeps: false };
  }
  const prev = cr.last[side];
  const keeps = scotchTurns(s) === 'turn' && !!r && !!prev && two.includes(prev) && turnGoesOn(s, side, r.n, prev);
  return { ids: two, suggested: keeps ? prev : partner(prev) ?? two[0], keeps };
}

/** Full turn: the side's last line in this rack was `pid`'s shot and the side
 *  stayed at the table (a spotted 8 on the break that the breaker plays on, too). */
function turnGoesOn(s: PoolMatch, side: Side, n: number, pid: string): boolean {
  const f = feedOf(s);
  let i = f.length - 1;
  if (f[i]?.t === 'CHOOSE' && f[i].q === 'eightBreak' && f[i].c === 'play' && f[i].s === side) i -= 1;
  const e = f[i];
  return !!e && e.n === n && e.s === side && e.p === pid && e.nx === side && !e.end && !e.pd && !e.bih
    && (e.t === 'BREAK' || SHOT_TYPES.has(e.t)) && e.t !== 'FOUL' && e.t !== 'PUSH';
}

/**
 * 8-ball, groups decided: the balls tapped are only the other side's group
 * (no 8, none of the shooter's own). Then the scorer is asked what the cue
 * ball hit first: own group (the turn passes) or theirs (a wrong-ball foul).
 * Returns their group's name, or null when there is nothing to ask.
 */
export function otherGroupOnly(s: PoolMatch, picked: readonly number[]): 'solids' | 'stripes' | null {
  const r = liveRack(s);
  if (!r || r.game !== 'eight' || r.phase !== 'play' || !r.solids || !r.shooter || !picked.length) return null;
  const theirs = r.solids === r.shooter ? STRIPES : SOLIDS;
  return picked.every((b) => theirs.includes(b)) ? (theirs === SOLIDS ? 'solids' : 'stripes') : null;
}

// ------------------------------------------------- the board's lines --

/** The scoreboard status line, from the engine ("9-Ball · Set 2 · Rack 5"). */
export const boardStatus = (s: PoolMatch): string => summary(s).statusLine;

const fmtText = (race: number, sets: number) => (sets > 1 ? `best of ${2 * sets - 1} sets · race to ${race}` : `race to ${race}`);
const raceOf = (v: unknown) => { const n = cnt(v); return n >= 1 && n <= 99 ? n : 0; };
const setsOf = (v: unknown) => { const n = cnt(v); return n >= 1 && n <= 9 ? n : 1; };
/** "best of 3 sets · race to 7" / "race to 5" ('' when the snapshot has no race). */
export function bestOfLine(s: PoolMatch): string {
  const race = raceOf(isObj(s) ? s.raceTo : undefined);
  return race ? fmtText(race, setsOf(s.setsToWin)) : '';
}

/** The stats panel's unit chips: the match, then each set (sets matches). */
export function setUnits(s: PoolMatch): { key: string; label: string }[] {
  if (!isObj(s) || setsOf(s.setsToWin) <= 1) return [{ key: 'all', label: 'Match' }];
  const n = Math.min(17, (Array.isArray(s.sets) ? s.sets.length : 0) + (s.ended === true ? 0 : 1));
  return [{ key: 'all', label: 'Match' }, ...Array.from({ length: n }, (_, i) => ({ key: String(i + 1), label: `Set ${i + 1}` }))];
}
