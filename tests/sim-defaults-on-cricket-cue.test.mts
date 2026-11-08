/**
 * Defaults-on wave 3 simulation (docs/security/breaks/defaults-on-cricket-cue.md):
 * 600 users, each scoring one match in cricket, snooker, pool, carrom or chess.
 * About half are NEW matches (format from today's defaults, the scorer taps the
 * optional captures at random — often never — and sometimes switches them off
 * mid-match), the rest OLD matches (a stored format without the keys, or with
 * them stored off). Invariants:
 *  - the score never depends on what is tracked: the same log with every
 *    optional tag / SET_TRACK removed, under the captures off, scores the same;
 *  - one-tap scoring is never blocked: a tagged shot / ball / board is accepted
 *    exactly when the plain one is;
 *  - no false zeros: a capture nobody tapped writes no career key;
 *  - an old-format match replays deep-equal to the keys stored off, and Info
 *    (matchCaptures) shows every switch Off;
 *  - carrom: once a foul is captured the fouls row is never folded.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FormatField, ScoreAction } from '../src/sports/types.ts';
import { formatDefaults } from '../src/sports/formatPick.ts';
import { matchCaptures } from '../src/sports/matchRules.ts';
import { CRICKET_META } from '../src/sports/cricket/meta.ts';
import { CRICKET_LIVE_SETTINGS } from '../src/sports/cricket/rules.ts';
import { init as cInit, reducer as cReducer, SHOT_TYPES, type CricketState } from '../src/sports/cricket/engine.ts';
import { recStamp, deliveryOrdinals } from '../src/sports/cricket/detail.ts';
import { statTotals, DEEP_TOTAL_KEYS } from '../src/sports/cricket/scorecard.ts';
import * as S from '../src/sports/snooker/engine.ts';
import * as SC from '../src/sports/snooker/controls.ts';
import { SNOOKER_META } from '../src/sports/snooker/meta.ts';
import { snookerStatTotals } from '../src/sports/snooker/totals.ts';
import * as M from '../src/sports/pool/match.ts';
import * as PC from '../src/sports/pool/controls.ts';
import { POOL_META } from '../src/sports/pool/meta.ts';
import { sideKeysFor } from '../src/sports/pool/totals.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { CARROM_META } from '../src/sports/carrom/meta.ts';
import { carromStatTotals, CARROM_FOUL_KEYS } from '../src/sports/carrom/totals.ts';
import * as chess from '../src/sports/chess/engine.ts';
import { CHESS_META } from '../src/sports/chess/meta.ts';
import { SINGLES_CTX } from './cue-script.mts';

let seed = 0x0d0c2026;
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = (n: number) => Math.floor(rand() * n);
const chance = (p: number) => rand() < p;

type Kind = 'new' | 'old' | 'oldOff';
/** coverage: the sim really exercised the optional captures */
const hits = { cricketTags: 0, snookerTags: 0, snookerOff: 0, poolExt: 0, poolSwitch: 0, carromFouls: 0 };
const KINDS: Kind[] = ['new', 'new', 'old', 'oldOff'];
const statsKeys = (fields: readonly FormatField[]) => fields.filter((f) => f.type === 'toggle' && /stat/i.test(f.group ?? '')).map((f) => f.key);
const allOff = (fields: readonly FormatField[]) => Object.fromEntries(statsKeys(fields).map((k) => [k, false]));
function formatOf(kind: Kind, fields: readonly FormatField[], base: Record<string, unknown>): Record<string, unknown> {
  if (kind === 'new') return { ...formatDefaults(fields as FormatField[]), ...base };
  if (kind === 'oldOff') return { ...base, ...allOff(fields) };
  return { ...base };
}
const infoAllOff = (ls: unknown, state: unknown, fields: readonly FormatField[], fmt: Record<string, unknown>, label: string) => {
  const stats = new Set(statsKeys(fields));
  const caps = matchCaptures(ls as never, state, fields, fmt).captures.filter((c) => stats.has(c.key));
  assert.ok(caps.length > 0, `${label} has stats switches`);
  for (const c of caps) assert.equal(c.on, false, `${label} Info ${c.key}`);
};

/* -------------------------------- cricket ------------------------------- */
function cricketUser(u: number, kind: Kind) {
  const overs = 1 + rnd(5);
  const fmt = formatOf(kind, CRICKET_META.formatFields!, { overs, playersPerSide: 11 });
  const OFF = allOff(CRICKET_META.formatFields!);
  const tagger = kind === 'new' && chance(0.5); // half the new-match scorers never tag
  const log: ScoreAction[] = [];
  let s: CricketState = cInit(fmt);
  const go = (a: ScoreAction) => { log.push(a); s = cReducer(s, a); };
  go({ type: 'SET_STRIKER', payload: { id: 'h1', v: 2 } });
  go({ type: 'SET_NONSTRIKER', payload: { id: 'h2', v: 2 } });
  let n = 2;
  for (let g = 0; g < 200 && !s.ended && s.innings === 1; g++) {
    if (!s.bowlerId) go({ type: 'SET_BOWLER', payload: { id: `a${rnd(5)}`, v: 2 } });
    const base = { strikerId: s.strikerId, bowlerId: s.bowlerId };
    const k = rnd(12);
    const before = s;
    if (k < 9) go({ type: 'RUNS', side: s.battingSide, payload: { ...base, runs: [0, 0, 1, 1, 2, 4, 6][rnd(7)] } });
    else if (k < 10) go({ type: 'WICKET', side: s.battingSide, payload: { ...base, kind: 'bowled', newBatId: `h${++n}` } });
    else go({ type: 'EXTRA', side: s.battingSide, payload: { ...base, kind: rnd(2) ? 'Wide' : 'No ball', runs: rnd(2) } });
    assert.notEqual(s, before, `u${u} cricket: a plain ball is never blocked`);
    const l = s.log ?? [];
    const ords = deliveryOrdinals(l);
    const i = l.length - 1;
    if (tagger && i >= 0 && ords[i] && chance(0.3)) {
      hits.cricketTags += 1;
      const r = l[i];
      if (chance(0.5)) go({ type: 'SHOT', side: r.side, payload: { v: 2, inn: r.inn, side: r.side, at: recStamp(r, s.ballsPerOver), batterId: r.strikerId, runs: r.bat, shot: SHOT_TYPES[rnd(SHOT_TYPES.length)] } });
      else go({ type: 'BALL_DETAIL', payload: { v: 2, inn: r.inn, side: r.side, d: ords[i], at: recStamp(r, s.ballsPerOver), batterId: r.strikerId, len: 'good', line: 'off' } });
    }
  }
  // the score never depends on the captures
  const plain = log.filter((a) => a.type !== 'SHOT' && a.type !== 'BALL_DETAIL');
  const bare = plain.reduce(cReducer, cInit({ ...fmt, ...OFF }));
  assert.deepEqual(s.scores, bare.scores, `u${u} cricket scores`);
  assert.equal(s.ended, bare.ended);
  // no false zeros: no bowler type / control / speed tag → no deep key
  for (const e of Object.values(statTotals(s))) for (const k of DEEP_TOTAL_KEYS) assert.equal(e.stats[k], undefined, `u${u} cricket ${k}`);
  if (kind !== 'new') {
    assert.deepEqual(s, log.reduce(cReducer, cInit({ overs, playersPerSide: 11, ...OFF })), `u${u} cricket old replay`);
    infoAllOff(CRICKET_LIVE_SETTINGS, s, CRICKET_META.formatFields!, fmt, `u${u} cricket`);
  } else {
    const caps = Object.fromEntries(matchCaptures(CRICKET_LIVE_SETTINGS as never, s, CRICKET_META.formatFields!, fmt).captures.map((c) => [c.key, c.on]));
    assert.deepEqual([caps.wagonWheel, caps.pitchMap, caps.bowlerType, caps.extraWhy, caps.shotCtrl, caps.ballSpeed], [true, true, true, true, false, false], `u${u} cricket Info`);
  }
}

/* -------------------------------- snooker ------------------------------- */
function snookerUser(u: number, kind: Kind) {
  const fmt = formatOf(kind, SNOOKER_META.formatFields!, { reds: [6, 10, 15][rnd(3)], bestOf: 1 + 2 * rnd(2), scoringMode: 'shot' });
  const tagger = kind === 'new' && chance(0.5);
  const switchOffAt = kind === 'new' && chance(0.3) ? rnd(60) : -1;
  const log: S.SnookerAction[] = [];
  let s = S.createInitialState(fmt);
  let counted = 0;
  for (let g = 0; g < 140 && !s.ended && s.frame; g++) {
    if (g === switchOffAt) { hits.snookerOff += 1; const a = { type: 'SET_TRACK', payload: { trackLongRest: false } }; const n = S.reducer(s, a); assert.equal(n.trackLR, undefined); log.push(a); s = n; continue; }
    const fr = s.frame;
    const ball: S.Ball = fr.on === 'red' ? 'red' : fr.on === 'colour' ? S.COLOURS[rnd(6)] : (fr.on as S.Ball);
    const tags = tagger && chance(0.25) ? { ...(chance(0.6) ? { long: true } : {}), ...(chance(0.4) ? { rest: true } : {}) } : {};
    const potting = chance(0.6);
    const plain = potting ? SC.potAction(s, ball) : SC.missAction(s);
    const tagged = potting ? SC.potAction(s, ball, tags) : SC.missAction(s, tags);
    if (!plain || !tagged) { const sf = SC.safetyAction(s); if (sf) { log.push(sf); s = S.reducer(s, sf); } continue; }
    const p = S.reducer(s, plain), t = S.reducer(s, tagged);
    assert.equal(p === s, t === s, `u${u} snooker: tags never block a shot`);
    assert.deepEqual(t.framesWon, p.framesWon);
    if (s.trackLR === true && Object.keys(tags).length) { counted += 1; hits.snookerTags += 1; }
    log.push(tagged);
    s = t;
  }
  const strip = log.filter((a) => a.type !== 'SET_TRACK').map((a) => ({ ...a, payload: a.payload ? Object.fromEntries(Object.entries(a.payload).filter(([k]) => k !== 'long' && k !== 'rest')) : a.payload }));
  const bare = strip.reduce(S.reducer, S.createInitialState({ ...fmt, trackLongRest: false }));
  assert.deepEqual(bare.framesWon, s.framesWon, `u${u} snooker frames`);
  assert.deepEqual(bare.frame?.score, s.frame?.score, `u${u} snooker score`);
  const tot = snookerStatTotals(s, SINGLES_CTX as never);
  if (counted === 0) for (const e of Object.values(tot)) for (const k of ['longPots', 'longAttempts', 'restShots']) assert.equal(e.stats[k], undefined, `u${u} snooker false zero ${k}`);
  if (kind !== 'new') {
    assert.deepEqual(s, log.reduce(S.reducer, S.createInitialState({ ...fmt, trackLongRest: false })), `u${u} snooker old replay`);
    assert.equal(s.trackLR, undefined);
    infoAllOff(S.SNOOKER_LIVE_SETTINGS, s, SNOOKER_META.formatFields!, fmt, `u${u} snooker`);
  }
}

/* --------------------------------- pool --------------------------------- */
function poolUser(u: number, kind: Kind) {
  const fmt = formatOf(kind, POOL_META.formatFields!, { game: (['eight', 'nine', 'ten'] as const)[rnd(3)], raceTo: 1 + rnd(4) });
  const log: ScoreAction[] = [];
  let s = M.poolInit(fmt);
  const go = (a: ScoreAction) => { const n = M.poolReducer(s, a); if (n !== s) log.push(a); s = n; return n; };
  go(PC.lagAction(s, rnd(2) ? 'home' : 'away'));
  go(PC.breakAction(s, { pots: [] }));
  let taken = 0;
  for (let g = 0; g < 80 && !s.ended; g++) {
    const k = rnd(10);
    if (k === 0) { hits.poolSwitch += 1; go({ type: 'SET_TRACK', payload: { trackShotClock: chance(0.5) } }); }
    else if (k === 1 && PC.extensionReady(s)) { go(PC.extensionAction(s)!); taken += 1; hits.poolExt += 1; }
    else if (k === 2) go(PC.rackAction(s, rnd(2) ? 'home' : 'away'));
    else { const before = s; go(PC.missAction(s)); if (before.rack?.phase === 'play' && !before.rack?.pending) assert.notEqual(s, before, `u${u} pool: a miss is never blocked`); }
  }
  const bare = log.filter((a) => a.type !== 'SET_TRACK' && a.type !== 'EXTENSION').reduce((st, a) => M.poolReducer(st, a), M.poolInit({ ...fmt, trackShotClock: false }));
  assert.deepEqual(bare.current, s.current, `u${u} pool score`);
  assert.equal(bare.racks.length, s.racks.length);
  assert.equal(bare.ended, s.ended);
  const ext = (M.sideCounts(s, 'home').extensions ?? 0) + (M.sideCounts(s, 'away').extensions ?? 0);
  assert.equal(ext, taken, `u${u} pool extensions`);
  if (taken === 0 && s.opt?.shotClock !== true) assert.ok(!sideKeysFor(s.game, s).includes('extensions'), `u${u} pool false zero`);
  if (taken > 0) assert.ok(sideKeysFor(s.game, s).includes('extensions'), `u${u} pool keeps extensions`);
  if (kind !== 'new' && !log.some((a) => a.type === 'SET_TRACK')) {
    assert.deepEqual(s, log.reduce((st, a) => M.poolReducer(st, a), M.poolInit({ ...fmt, trackShotClock: false })), `u${u} pool old replay`);
    infoAllOff(M.POOL_LIVE_SETTINGS, s, POOL_META.formatFields!, fmt, `u${u} pool`);
  }
}

/* -------------------------------- carrom -------------------------------- */
function carromUser(u: number, kind: Kind) {
  const fmt = formatOf(kind, CARROM_META.formatFields!, { preset: 'icf', target: 25, maxBoards: 8, gamesToWin: 2 });
  const OFF = allOff(CARROM_META.formatFields!);
  const tagger = kind === 'new' && chance(0.5);
  let s = carrom.init(fmt);
  const acts: ScoreAction[] = [];
  let fouled = false;
  for (let b = 0; b < 24 && !s.ended; b++) {
    const side = rnd(2) ? 'home' : 'away';
    const fouls = { home: {} as Record<string, number>, away: {} as Record<string, number> };
    const dues = { home: 0, away: 0 };
    if (tagger && chance(0.2)) { fouls[side === 'home' ? 'away' : 'home'].touch = 1; fouled = true; hits.carromFouls += 1; }
    const boardFouls = Object.values(fouls.home).length + Object.values(fouls.away).length;
    // the fold: never folded once a foul is captured or tapped on this board
    if (s.track?.fouls && (carrom.carromFoulsCaptured(s.boards) || boardFouls > 0)) assert.equal(carrom.carromFoulsOpen(s, { opened: false, boardFouls }), true, `u${u} carrom fold`);
    const det = carrom.boardDetail(s, { doubles: false, breakerKnown: false, brk: null, fouls: fouls as never, dues, qMiss: { home: 0, away: 0 }, whoLog: { home: {}, away: {} } });
    const plain = { type: 'BOARD', side, payload: { coins: 1 + rnd(9), queen: chance(0.3) }, attribution: { playerId: `${side[0]}1`, points: 1 } };
    const a = det ? { ...plain, payload: { ...plain.payload, det } } : plain;
    const p = carrom.reducer(s, plain as never), t = carrom.reducer(s, a as never);
    assert.equal(p === s, t === s, `u${u} carrom: detail never blocks a board`);
    acts.push(a as never);
    s = t;
  }
  const bare = acts.reduce((st, a) => carrom.reducer(st, { ...a, payload: { coins: (a.payload as { coins: number }).coins, queen: (a.payload as { queen: boolean }).queen } } as never), carrom.init({ ...fmt, ...OFF }));
  assert.deepEqual(bare.games, s.games, `u${u} carrom games`);
  const t = carromStatTotals(s, { home: ['h1'], away: ['a1'] } as never);
  if (!fouled) for (const e of Object.values(t)) for (const k of CARROM_FOUL_KEYS) assert.equal(e.stats[k], undefined, `u${u} carrom false zero ${k}`);
  if (kind !== 'new') {
    assert.equal(s.track, undefined);
    assert.deepEqual(s, acts.reduce((st, a) => carrom.reducer(st, a as never), carrom.init({ ...fmt, ...OFF })), `u${u} carrom old replay`);
    infoAllOff(carrom.CARROM_LIVE_SETTINGS, s, CARROM_META.formatFields!, fmt, `u${u} carrom`);
  } else assert.deepEqual(s.track, { fouls: true, brk: true, qMiss: true });
}

/* -------------------------------- chess --------------------------------- */
function chessUser(u: number, kind: Kind) {
  const fmt = formatOf(kind, CHESS_META.formatFields!, {});
  const s = chess.init(fmt);
  assert.equal(s.track, undefined, `u${u} chess: moves / clock stay off`);
  infoAllOff(chess.CHESS_LIVE_SETTINGS, s, CHESS_META.formatFields!, fmt, `u${u} chess`);
}

test('sim · 600 users: new defaults on, old matches unchanged, no false zeros, scoring never blocked', () => {
  const users = [cricketUser, snookerUser, poolUser, carromUser, chessUser];
  const seen = new Map<string, number>();
  for (let u = 0; u < 600; u++) {
    const f = users[u % users.length];
    const kind = KINDS[rnd(KINDS.length)];
    f(u, kind);
    seen.set(`${f.name}:${kind}`, (seen.get(`${f.name}:${kind}`) ?? 0) + 1);
  }
  for (const [k, v] of Object.entries(hits)) assert.ok(v > 5, `coverage ${k}: ${v}`);
  for (const f of users) for (const k of ['new', 'old', 'oldOff']) assert.ok((seen.get(`${f.name}:${k}`) ?? 0) > 10, `${f.name}:${k} ${seen.get(`${f.name}:${k}`)}`);
});
