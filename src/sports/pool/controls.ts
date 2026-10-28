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
 *     (the game pin, break #26; the "re-scored" note);
 *   - `pid`: who shot (scotch doubles; singles: the side's one player) — an
 *     id only, never a name;
 *   - `at`: the scorer's clock, for the commentary.
 * No action carries an `attribution`: nothing is credited live; every player
 * figure is derived from the replayed state (./totals.ts).
 */
import type { ScoreAction } from '../types';
import { onTwoFouls, summary, type FoulKind, type PendingKind, type RackEnd } from './engine.ts';
import { MONEY, other, type Side } from './balls.ts';
import { creditOf, poolReducer, SHOT_TYPES, validPid, type PoolMatch } from './match.ts';

export type { Side };
type Name = (side: Side) => string;

export interface TapOpts {
  /** who shot (player id) */
  pid?: string | null;
  /** the scorer's clock (ms) */
  at?: number;
}

/** Add the rack in play, the side at the table, the first-event format, who shot, the time. */
export function stamp(s: PoolMatch, a: ScoreAction, o: TapOpts = {}): ScoreAction {
  const r = s?.rack;
  const payload: Record<string, unknown> = { ...(a.payload ?? {}) };
  if (r) payload.rack = r.n;
  let side = a.side;
  if (r && !side && SHOT_TYPES.has(a.type) && r.shooter) side = r.shooter;
  if (s && s.seq === 0 && !s.ended) {
    payload.game = s.game;
    payload.race = s.raceTo;
    payload.sets = s.setsToWin;
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
export function rackAction(s: PoolMatch, winner: Side, f: { bnr?: boolean; golden?: boolean; runOut?: boolean; breaker?: Side | null } = {}, o?: TapOpts): ScoreAction {
  return stamp(s, {
    type: 'RACK', side: winner,
    payload: { ...(f.breaker ? { breaker: f.breaker } : {}), ...(f.bnr ? { bnr: true } : {}), ...(f.golden ? { golden: true } : {}), ...(f.runOut ? { runOut: true } : {}) },
  }, o);
}

export const stalemateAction = (s: PoolMatch, o?: TapOpts) => stamp(s, { type: 'STALEMATE', payload: {} }, o);

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
  const r = s?.rack;
  if (!s || s.ended || !r) return { kind: 'over', winner: s?.winner ?? null };
  if (r.phase === 'break') {
    if (r.n === 1 && !r.breaker && !r.reracks && !s.racks.length) return { kind: 'lag', rack: 1 };
    return { kind: 'break', rack: r.n, breaker: r.breaker, balls: [...r.table], shortRule: s.threeBallRule, illegalFoul: s.game !== 'eight' };
  }
  if (r.pending) return { kind: 'choice', rack: r.n, by: r.pending.by, pending: r.pending.kind };
  const shooter = r.shooter ?? 'home';
  return {
    kind: 'shot', rack: r.n, shooter, table: [...r.table], bih: r.bih, twoFouls: onTwoFouls(s) === shooter,
    push: r.push && s.game !== 'eight', callShot: s.game !== 'nine', safetyCall: s.game !== 'ten',
    solids: s.game === 'eight' ? r.solids : null, money: MONEY[s.game], tenCall: s.game === 'ten' && s.tenEarly,
  };
}

export interface ChoiceOption { choice: 'play' | 'pass' | 'rerack'; breaker?: Side; label: string }

/** The options of a pending choice, in plain words. */
export function choiceOptions(s: PoolMatch, name: Name): ChoiceOption[] {
  const p = s?.rack?.pending;
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
  const p = s?.rack?.pending;
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
  const r = s?.rack;
  if (!r) return '';
  if (!r.breaker) return `Rack ${r.n} · who breaks?`;
  return `Rack ${r.n} · ${name(r.breaker)} to break${r.n > 1 ? ` (${BREAK_WORD[s.breakFormat] ?? 'alternate'})` : ''}`;
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
/** The foul chips at the table (the break has its own short list). */
export const PLAY_FOULS: FoulKind[] = ['scratch', 'wrongBall', 'noRail', 'offTable', 'touched', 'doubleHit', 'pushShot', 'jump', 'moving', 'noFoot', 'placement', 'slowPlay', 'outOfTurn', 'other'];
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
  const r = s?.rack;
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
  const how = howSentence(e.how, W, L, MONEY[s.game]);
  const score = next.ended || e.kind === 'set'
    ? (s.setsToWin > 1 ? `Sets ${next.setsWon.home}–${next.setsWon.away} (${name('home')} first)` : `${Math.max(...lastSet(next))}–${Math.min(...lastSet(next))}`)
    : `${s.setsToWin > 1 ? `Set ${next.sets.length + 1}: ` : ''}${next.current.home}–${next.current.away} (${name('home')} first)`;
  if (e.kind === 'match') return { title: `${W} wins the match?`, message: `${how}. ${score}. The match ends.`, yesLabel: 'Yes, end the match' };
  if (e.kind === 'set') return { title: `${W} wins set ${e.set}?`, message: `${how}. ${score}.`, yesLabel: 'Yes, end the set' };
  return { title: `Rack ${e.rack} to ${W}?`, message: `${how}. ${score}.`, yesLabel: 'Yes, record it' };
}
const lastSet = (s: PoolMatch): [number, number] => s.sets[s.sets.length - 1] ?? [s.current.home, s.current.away];

// ---------------------------------------------------- the tap guard --

/**
 * The double-tap guard. A tap goes through only if the engine would take it
 * (an ignored tap is never sent — no junk event, no confusion) and the state
 * has moved since the last tap that went through (a second tap before the
 * screen redraws is a double tap). States are compared by identity: Undo
 * replays the log into a new object, so taps after an undo go through.
 */
export function makeTapGuard<S>(reduce: (s: S, a: ScoreAction) => S): (s: S, a: ScoreAction) => boolean {
  let last: S | null = null;
  return (s, a) => {
    if (last !== null && last === s) return false;
    if (reduce(s, a) === s) return false;
    last = s;
    return true;
  };
}

// ------------------------------------------- scotch doubles: who shoots --

/**
 * Scotch doubles: partners alternate shots. The side's two players (the
 * first two of its roster) and the one to suggest: the partner who did not
 * take the side's last shot — on a break, the partner who did not break the
 * side's last break. The scorer can always tap the other one.
 */
export function shooterPick(s: PoolMatch, side: Side, ids: readonly string[]): { ids: string[]; suggested: string | null } {
  const two = [...new Set(ids.map(validPid).filter((x): x is string => !!x))].slice(0, 2);
  if (!two.length) return { ids: [], suggested: null };
  const cr = creditOf(s);
  const prev = s?.rack?.phase === 'break' ? cr.lastBreak[side] : cr.last[side];
  const suggested = prev && two.length > 1 && two.includes(prev) ? two.find((x) => x !== prev)! : two[0];
  return { ids: two, suggested };
}

// ------------------------------------------------- the board's lines --

/** The scoreboard status line, from the engine ("9-Ball · Set 2 · Rack 5"). */
export const boardStatus = (s: PoolMatch): string => summary(s).statusLine;

const fmtText = (race: number, sets: number) => (sets > 1 ? `best of ${2 * sets - 1} sets · race to ${race}` : `race to ${race}`);
/** "best of 3 sets · race to 7" / "race to 5". */
export const bestOfLine = (s: PoolMatch): string => fmtText(s.raceTo, s.setsToWin);

/** The race or the sets changed after the match started (the log was re-scored). */
export function formatNote(s: PoolMatch): string | null {
  const f = s?.fmt0;
  if (!f || (f.raceTo === s.raceTo && f.setsToWin === s.setsToWin)) return null;
  return `Now ${fmtText(s.raceTo, s.setsToWin).replace(' · ', ', ')}: it was ${fmtText(f.raceTo, f.setsToWin).replace(' · ', ', ')} when the match started. The match was re-scored from rack 1.`;
}

/** The stats panel's unit chips: the match, then each set (sets matches). */
export function setUnits(s: PoolMatch): { key: string; label: string }[] {
  if (!s || s.setsToWin <= 1) return [{ key: 'all', label: 'Match' }];
  const n = (s.sets?.length ?? 0) + (s.ended ? 0 : 1);
  return [{ key: 'all', label: 'Match' }, ...Array.from({ length: n }, (_, i) => ({ key: String(i + 1), label: `Set ${i + 1}` }))];
}
