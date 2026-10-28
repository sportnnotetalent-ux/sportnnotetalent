/**
 * Pool — the plugin's match state: the engine's `PoolState` (./engine.ts,
 * unchanged rules) plus what the scoring app keeps around it, in the SAME
 * object so every engine reader (summary, result, line score, poolStats)
 * works on it as is. PURE: never mutates, never throws, no clock — a stored
 * log always replays to the same state.
 *
 * What it adds (all optional; an older or hostile snapshot reads as empty):
 *   perSide  1 = singles, 2 = scotch doubles (the format's playersPerSide)
 *   opt      the organiser's raw rule options, so a pinned game rebuilds right
 *   fmt0     the race / sets the match started with (stamped on its first event)
 *   cr       who shot: shot counters per set and side, and per player id in
 *            scotch doubles (`payload.pid`, the id the scorer picked); the ids
 *            seen per side; the scotch-doubles rotation
 *   feed     the shots of the rack in play and the last FEED_RACKS racks
 *            (commentary, undo label), at most FEED_PER_RACK per rack
 *   rat      when each completed rack ended (the scorer's clock, ms; 0 = none)
 *
 * The game pin (break #26): the controls stamp the game on a match's first
 * event; replaying a log whose first event names another game than the
 * format (the organiser switched 8-ball to 9-ball mid-match) plays it as the
 * game it was scored under.
 *
 * IDs-only scoring (docs/privacy/ids-only-scoring.md): player ids only, never
 * names — an id is 1–64 letters, digits, `_ - . :`, starting with a letter or
 * digit (a full name has a space and is never stored). Nothing is credited
 * live: every player figure is derived here and summed by ./totals.ts.
 */
import {
  createInitialState as engineInit, reducer as engineReducer, cnt, FOUL_KINDS,
  type FoulKind, type PendingKind, type PerSide, type PoolState, type Tally,
} from './engine.ts';
import { isSide, knownGame, other, own, ownRecord, readBalls, readInt, TOP, type PoolGame, type Side } from './balls.ts';

export type { Side, PoolGame } from './balls.ts';

/** Stat-line key → count (a shot's figures, a side's, a player's). */
export type Counts = Record<string, number>;

/** One line of the shot feed. Ball numbers, enums, sides and ids only. */
export interface FeedEntry {
  /** the rack it belongs to */
  n: number;
  /** the action type (LAG, BREAK, POT, MISS, SAFETY, FOUL, PUSH, CHOOSE, RACK, STALEMATE) */
  t: string;
  /** who acted: the shooter / breaker / fouler, the chooser, the rack winner, the breaker chosen */
  s?: Side;
  /** scotch doubles: who shot (player id) */
  p?: string;
  /** balls pocketed / driven off the table */
  b?: number[];
  o?: number[];
  /** the foul the engine recorded */
  k?: FoulKind;
  /** CHOOSE: the choice and what it answered */
  c?: 'play' | 'pass' | 'rerack';
  q?: PendingKind;
  /** after it: who is at the table (same rack), ball in hand, the choice now waiting */
  nx?: Side;
  bih?: true;
  pd?: PendingKind;
  /** 8-ball: this shot gave `g` the solids */
  g?: Side;
  /** the rack was re-racked (illegal break, 8 on the break, stalemate) */
  rr?: true;
  /** the rack ended on it */
  end?: true;
  /** the scorer's clock (ms) */
  at?: number;
}

/** Who shot. */
export interface PoolCredit {
  /** per set (index = set − 1), per side: the shot counters */
  ss: PerSide<Counts>[];
  /** scotch doubles: per player id, the side and the match counters */
  by: Array<{ id: string; side: Side; c: Counts }>;
  /** shots each side played with no usable player id (doubles) */
  unk: PerSide<number>;
  /** the player ids seen per side (≤ MAX_IDS_PER_SIDE) */
  ids: PerSide<string[]>;
  /** who took each side's last shot / last break (the scotch-doubles rotation) */
  last: PerSide<string | null>;
  lastBreak: PerSide<string | null>;
}

export interface PoolMatch extends PoolState {
  perSide?: 1 | 2;
  opt?: { threeFoul?: boolean; threeBallRule?: boolean; tenEarly?: boolean };
  fmt0?: { raceTo: number; setsToWin: number };
  cr?: PoolCredit;
  feed?: FeedEntry[];
  rat?: number[];
}

/** A scotch-doubles pair, plus room for a substitute or two. */
export const MAX_IDS_PER_SIDE = 4;
/** Completed racks whose shots the feed keeps (besides the rack in play). */
export const FEED_RACKS = 3;
export const FEED_PER_RACK = 120;

/** The actions that are a shot at the table (the break is counted apart). */
export const SHOT_TYPES: ReadonlySet<string> = new Set(['POT', 'MISS', 'SAFETY', 'FOUL', 'PUSH']);

/** Every key a shot can move (who shot). */
export const SHOT_KEYS = [
  'shotsPlayed', 'potShots', 'missShots', 'safetyShots', 'pushOuts', 'ballsPotted',
  'fouls', 'foulScratch', 'foulWrongBall', 'foulNoRail', 'foulOffTable', 'foulOther',
  'breakShots', 'breakBalls', 'dryBreaks', 'breakFouls', 'illegalBreaks', 'eightBreaks',
] as const;
const SHOT_KEY_SET: ReadonlySet<string> = new Set(SHOT_KEYS);

/** Engine tally field → the stat-line key (who shot). The rest of the tally
 *  (racks, breaks won, break-and-runs, innings…) belongs to the side. */
const TALLY_KEY: ReadonlyArray<[keyof Tally, string]> = [
  ['breaks', 'breakShots'], ['breakPots', 'breakBalls'], ['dryBreaks', 'dryBreaks'], ['breakFouls', 'breakFouls'],
  ['illegalBreaks', 'illegalBreaks'], ['eightOnBreak', 'eightBreaks'], ['potted', 'ballsPotted'], ['fouls', 'fouls'],
  ['safeties', 'safetyShots'], ['pushOuts', 'pushOuts'],
];
const FOUL_KEY: Partial<Record<FoulKind, string>> = { scratch: 'foulScratch', wrongBall: 'foulWrongBall', noRail: 'foulNoRail', offTable: 'foulOffTable' };
/** The line key a foul kind counts under (the rarer kinds: "other"). */
export const foulKeyOf = (k: FoulKind): string => FOUL_KEY[k] ?? 'foulOther';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
/** A player id the state may keep (never a name, never a prototype key). */
export function validPid(v: unknown): string | null {
  return typeof v === 'string' && ID_RE.test(v) ? v : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const zero = (): PerSide<number> => ({ home: 0, away: 0 });

/** Counts from a stored value: known keys, whole numbers ≥ 1 only. */
function cleanCounts(v: unknown): Counts {
  const out: Counts = {};
  if (!isObj(v)) return out;
  for (const k of SHOT_KEYS) { const n = cnt(own(v, k)); if (n) out[k] = n; }
  return out;
}
const addCounts = (a: Counts, b: Counts): Counts => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
};

function emptyCredit(): PoolCredit {
  return { ss: [], by: [], unk: zero(), ids: { home: [], away: [] }, last: { home: null, away: null }, lastBreak: { home: null, away: null } };
}

/** A clean copy of the credit of any snapshot (missing / hostile → empty parts). */
export function creditOf(s: unknown): PoolCredit {
  const c = isObj(s) ? own(s, 'cr') : undefined;
  if (!isObj(c)) return emptyCredit();
  const sides = (v: unknown, f: (x: unknown) => unknown) => ({ home: f(own(v, 'home')), away: f(own(v, 'away')) });
  const ss = (Array.isArray(c.ss) ? c.ss : []).slice(0, 20).map((x) => sides(x, cleanCounts) as PerSide<Counts>);
  const ids = sides(c.ids, (v) => (Array.isArray(v) ? [...new Set(v.map(validPid).filter((x): x is string => !!x))].slice(0, MAX_IDS_PER_SIDE) : [])) as PerSide<string[]>;
  const by: PoolCredit['by'] = [];
  for (const e of Array.isArray(c.by) ? c.by : []) {
    const id = validPid(own(e, 'id'));
    const side = own(e, 'side');
    if (!id || !isSide(side) || by.some((x) => x.id === id) || by.length >= 2 * MAX_IDS_PER_SIDE) continue;
    by.push({ id, side, c: cleanCounts(own(e, 'c')) });
  }
  const pid = (v: unknown) => validPid(v);
  return {
    ss, by, ids,
    unk: { home: cnt(own(c.unk, 'home')), away: cnt(own(c.unk, 'away')) },
    last: sides(c.last, pid) as PerSide<string | null>,
    lastBreak: sides(c.lastBreak, pid) as PerSide<string | null>,
  };
}

const FEED_TYPES: ReadonlySet<string> = new Set(['LAG', 'BREAK', 'POT', 'MISS', 'SAFETY', 'FOUL', 'PUSH', 'CHOOSE', 'RACK', 'STALEMATE']);
const KIND_SET: ReadonlySet<string> = new Set(FOUL_KINDS);
const PENDING: ReadonlySet<string> = new Set(['push', 'wrongPot', 'threeBall', 'illegalBreak', 'eightBreak', 'eightFoul']);
const balls = (v: unknown, top: number): number[] | undefined => {
  const b = readBalls(v, top);
  return b && b.length ? b : undefined;
};

/** The feed of any snapshot, cleaned (missing / hostile → []). */
export function feedOf(s: unknown): FeedEntry[] {
  const f = isObj(s) ? own(s, 'feed') : undefined;
  if (!Array.isArray(f)) return [];
  // balls are read against the game's own set (a 9-ball feed never shows a 14)
  const top = TOP[knownGame(own(s, 'game')) ?? 'eight'];
  const out: FeedEntry[] = [];
  for (const e of f.slice(-(FEED_RACKS + 1) * FEED_PER_RACK)) {
    if (!isObj(e)) continue;
    const n = cnt(e.n), t = e.t;
    if (!n || typeof t !== 'string' || !FEED_TYPES.has(t)) continue;
    const x: FeedEntry = { n, t };
    if (isSide(e.s)) x.s = e.s;
    const p = validPid(e.p); if (p) x.p = p;
    const b = balls(e.b, top); if (b) x.b = b;
    const o = balls(e.o, top); if (o) x.o = o;
    if (typeof e.k === 'string' && KIND_SET.has(e.k)) x.k = e.k as FoulKind;
    if (e.c === 'play' || e.c === 'pass' || e.c === 'rerack') x.c = e.c;
    if (typeof e.q === 'string' && PENDING.has(e.q)) x.q = e.q as PendingKind;
    if (isSide(e.nx)) x.nx = e.nx;
    if (e.bih === true) x.bih = true;
    if (typeof e.pd === 'string' && PENDING.has(e.pd)) x.pd = e.pd as PendingKind;
    if (isSide(e.g)) x.g = e.g;
    if (e.rr === true) x.rr = true;
    if (e.end === true) x.end = true;
    const at = cnt(e.at); if (at) x.at = at;
    out.push(x);
  }
  return out;
}

/** When each completed rack ended (one per rack; 0 = not stamped). */
export function rackTimes(s: unknown): number[] {
  const racks = isObj(s) && Array.isArray(s.racks) ? s.racks.length : 0;
  const r = isObj(s) && Array.isArray(s.rat) ? s.rat : [];
  return Array.from({ length: racks }, (_, i) => cnt(r[i]));
}

/** 1 = singles, 2 = scotch doubles. */
export const perSideOf = (s: unknown): 1 | 2 => (isObj(s) && s.perSide === 2 ? 2 : 1);

/** One side's shot counters: the whole match, or one set (1-based). */
export function sideCounts(s: unknown, side: Side, set?: number): Counts {
  const ss = creditOf(s).ss;
  if (set !== undefined) return { ...(ss[set - 1]?.[side] ?? {}) };
  return ss.reduce<Counts>((t, x) => addCounts(t, x[side]), {});
}

/** One player's shot counters (scotch doubles). */
export function playerCounts(s: unknown, id: string): Counts {
  return { ...(creditOf(s).by.find((x) => x.id === id)?.c ?? {}) };
}

// ------------------------------------------------------------- init ----

/**
 * States this module made (break #29). Their credit, feed and rack times are
 * clean by construction, so the next event reads them as they are; any other
 * state (a stored snapshot, JSON, a foreign object) is cleaned on read. Only
 * the cost differs — the result is the same either way (tested).
 */
const ours = new WeakSet<object>();
const mine = <T extends object>(s: T): T => { ours.add(s); return s; };

/** A fresh match: the engine's state with the plugin's parts. */
export function poolInit(config?: Record<string, unknown>): PoolMatch {
  const c = ownRecord(config) ?? (Object.create(null) as Record<string, unknown>);
  const opt: NonNullable<PoolMatch['opt']> = {};
  for (const k of ['threeFoul', 'threeBallRule', 'tenEarly'] as const) if (typeof c[k] === 'boolean') opt[k] = c[k] as boolean;
  return mine({ ...engineInit(config), perSide: readInt(c.playersPerSide, 1, 1, 2) as 1 | 2, opt, cr: emptyCredit(), feed: [], rat: [] });
}

/** The match rebuilt as another game (the pin), its other options kept. */
function asGame(s: PoolMatch, game: PoolGame): PoolMatch {
  const o = isObj(s.opt) ? s.opt : {};
  return mine({
    ...engineInit({ game, raceTo: s.raceTo, setsToWin: s.setsToWin, breakFormat: s.breakFormat, ...o }),
    perSide: perSideOf(s), opt: { ...o }, cr: emptyCredit(), feed: [], rat: [],
  });
}

// ---------------------------------------------------------- reducer ----

/** The plugin's reducer: the engine's, plus who shot, the pin and the feed.
 *  An action the engine ignores returns the very same state. */
export function poolReducer(s: PoolMatch, a: { type: string; side?: Side; payload?: Record<string, unknown> }): PoolMatch {
  try {
    return reduce(s, a);
  } catch {
    return s;
  }
}

function reduce(s: PoolMatch, a: unknown): PoolMatch {
  if (!isObj(s)) return s;
  const p = ownRecord(own(a, 'payload'));
  let base: PoolMatch = s;
  // the game pin: only the match's first accepted event, only before any rack
  if (p && s.seq === 0 && !s.ended && Array.isArray(s.racks) && !s.racks.length) {
    const g = knownGame(p.game);
    if (g && g !== s.game) base = asGame(s, g);
  }
  // break #8: a LAG that names the breaker already chosen (a duplicate from a
  // second phone, a retry under a new id) changes nothing — not even the feed
  if (own(a, 'type') === 'LAG' && base.firstBreaker && base.rack && base.rack.phase === 'break') {
    const side = own(a, 'side');
    if (isSide(side) && (isSide(p?.breaks) ? p.breaks : side) === base.firstBreaker && base.rack.breaker === base.firstBreaker) return s;
  }
  const next = engineReducer(base, a as never) as PoolMatch;
  if (next === base) return s;
  return withCredit(base, next, a, p ?? (Object.create(null) as Record<string, unknown>));
}

/** The shot's own figures, from the engine's tally before / after it. */
function shotDelta(type: string, before: Tally | undefined, after: Tally | undefined): Counts {
  const d: Counts = {};
  const add = (k: string, n: number) => { if (n > 0) d[k] = (d[k] ?? 0) + n; };
  for (const [f, k] of TALLY_KEY) add(k, cnt(own(after, f)) - cnt(own(before, f)));
  for (const kind of FOUL_KINDS) add(foulKeyOf(kind), cnt(own(own(after, 'foulsBy'), kind)) - cnt(own(own(before, 'foulsBy'), kind)));
  if (SHOT_TYPES.has(type)) add('shotsPlayed', 1);
  if (type === 'MISS') add('missShots', 1);
  // a pot; a 9-ball "safety" that pocketed a ball is scored as a pot (5.5)
  if (type === 'POT' || (type === 'SAFETY' && !d.safetyShots && d.ballsPotted)) add('potShots', 1);
  return d;
}

/** The foul kind a shot recorded (null = none). */
function foulOf(before: Tally | undefined, after: Tally | undefined): FoulKind | null {
  for (const kind of FOUL_KINDS) if (cnt(own(own(after, 'foulsBy'), kind)) > cnt(own(own(before, 'foulsBy'), kind))) return kind;
  return null;
}

function withCredit(base: PoolMatch, next: PoolMatch, a: unknown, p: Record<string, unknown>): PoolMatch {
  const type = own(a, 'type') as string;
  const side = own(a, 'side');
  const r0 = base.rack!;
  const r1 = next.rack;
  const shot = type === 'BREAK' || SHOT_TYPES.has(type);
  const actor: Side | null = type === 'BREAK' ? (r0.breaker ?? (isSide(side) ? side : null)) : shot && isSide(side) ? side : null;
  const perSide = perSideOf(base);
  const trusted = ours.has(base);
  let cr = trusted ? base.cr! : creditOf(base);
  const pid = validPid(p.pid);
  let credited: string | null = null;

  if (actor) {
    const tb = base.tally?.[actor], ta = next.tally?.[actor];
    const d = shotDelta(type, tb, ta);
    const si = Math.max(0, Array.isArray(base.sets) ? base.sets.length : 0);
    const ss = cr.ss.slice();
    while (ss.length <= si) ss.push({ home: {}, away: {} });
    ss[si] = { ...ss[si], [actor]: addCounts(ss[si][actor], d) };
    cr = { ...cr, ss };
    // who shot: an id the side may hold (first seen on this side, under the cap)
    const mine = pid && !cr.ids[other(actor)].includes(pid) && (cr.ids[actor].includes(pid) || cr.ids[actor].length < MAX_IDS_PER_SIDE) ? pid : null;
    if (mine && !cr.ids[actor].includes(mine)) cr = { ...cr, ids: { ...cr.ids, [actor]: [...cr.ids[actor], mine] } };
    if (perSide === 2) {
      if (mine) {
        credited = mine;
        const i = cr.by.findIndex((x) => x.id === mine);
        const by = cr.by.slice();
        if (i < 0) by.push({ id: mine, side: actor, c: d });
        else by[i] = { ...by[i], c: addCounts(by[i].c, d) };
        cr = { ...cr, by, last: { ...cr.last, [actor]: mine }, ...(type === 'BREAK' ? { lastBreak: { ...cr.lastBreak, [actor]: mine } } : {}) };
      } else cr = { ...cr, unk: { ...cr.unk, [actor]: cr.unk[actor] + 1 } };
    }
  }

  // the feed line
  const ended = Array.isArray(next.racks) && Array.isArray(base.racks) && next.racks.length > base.racks.length;
  const e: FeedEntry = { n: r0.n, t: type };
  const who = actor ?? (type === 'LAG' ? next.firstBreaker : type === 'CHOOSE' ? r0.pending?.by : type === 'RACK' ? (isSide(side) ? side : null) : type === 'STALEMATE' ? r0.breaker : null);
  if (isSide(who)) e.s = who;
  if (credited) e.p = credited;
  if (shot) {
    const top = TOP[base.game] ?? 15;
    const b = readBalls(p.pots, top); if (b && b.length) e.b = b;
    const o = readBalls(p.off, top); if (o && o.length) e.o = o;
    const k = actor ? foulOf(base.tally?.[actor], next.tally?.[actor]) : null;
    if (k) e.k = k;
  }
  if (type === 'CHOOSE') {
    if (p.choice === 'play' || p.choice === 'pass' || p.choice === 'rerack') e.c = p.choice;
    if (r0.pending) e.q = r0.pending.kind;
  }
  if (ended) e.end = true;
  else if (r1) {
    if (r1.phase === 'play' && r1.shooter) e.nx = r1.shooter;
    if (r1.bih) e.bih = true;
    if (r1.pending) e.pd = r1.pending.kind;
    if (r0.solids === null && r1.solids !== null) e.g = r1.solids;
    if (r1.reracks > r0.reracks) e.rr = true;
  }
  const at = cnt(p.at);
  if (at) e.at = at;
  const cur = r1 ? r1.n : r0.n;
  const kept = [...(trusted ? base.feed! : feedOf(base)).filter((x) => x.n >= cur - FEED_RACKS), e];
  // at most FEED_PER_RACK lines per rack, the newest kept (break #27: a stored
  // feed may already hold more than that for one rack)
  const perRack = new Map<number, number>();
  const feed: FeedEntry[] = [];
  for (let i = kept.length - 1; i >= 0; i--) {
    const k = (perRack.get(kept[i].n) ?? 0) + 1;
    perRack.set(kept[i].n, k);
    if (k <= FEED_PER_RACK) feed.push(kept[i]);
  }
  feed.reverse();

  const out: PoolMatch = { ...next, perSide, cr, feed };
  const rat = trusted ? base.rat! : rackTimes(base);
  out.rat = ended ? [...rat, at] : rat;
  if (base.seq === 0) out.fmt0 = { raceTo: readInt(p.race, base.raceTo, 1, 99), setsToWin: readInt(p.sets, base.setsToWin, 1, 9) };
  else if (isObj(base.fmt0)) out.fmt0 = trusted ? base.fmt0 : { raceTo: readInt(base.fmt0.raceTo, base.raceTo, 1, 99), setsToWin: readInt(base.fmt0.setsToWin, base.setsToWin, 1, 9) };
  return mine(out);
}

/** Replay a log from a fresh match (tests and tools; the app uses deriveLog). */
export function poolReplay(config: Record<string, unknown> | undefined, actions: readonly unknown[]): PoolMatch {
  const s0 = poolInit(config);
  return Array.isArray(actions) ? actions.reduce<PoolMatch>((s, a) => poolReducer(s, a as never), s0) : s0;
}

/** Is `k` a shot key (who shot)? */
export const isShotKey = (k: string): boolean => SHOT_KEY_SET.has(k);
