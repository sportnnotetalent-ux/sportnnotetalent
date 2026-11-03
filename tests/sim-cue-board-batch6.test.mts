/**
 * Cue & board batch 6 — simulation (quality mandate step 6): 500+ random
 * matches per sport with the new taps, plus junk, checking the invariants:
 *  - pool (600): extensions and the new counters never move the score (the
 *    same log without them replays to the same racks); at most one extension
 *    per side per rack; push choices ≤ the opponent's push-outs; replay (live
 *    and from JSON) identical; readers print no junk; totals finite;
 *  - snooker (500): every visit's make-up adds up to its pots; a total
 *    clearance only with every red; long pots ≤ attempts, none untracked; the
 *    flags never move the score; replay identical;
 *  - billiards (500): the red-to-centre hint follows the run, never moves the
 *    score; foul kinds ≤ fouls on every career line;
 *  - carrom (500): an awarded game is at the target; games won add up; a
 *    board correction keeps every award; junk reasons never stored;
 *  - chess (600): events bounded, the preset follows the illegal moves, an
 *    uneven score only with the arbiter / adjudication, points and credits agree;
 *  - old-style logs (500 per sport): replay is deterministic, live and from JSON.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import * as M from '../src/sports/pool/match.ts';
import * as PC from '../src/sports/pool/controls.ts';
import { poolFeed } from '../src/sports/pool/feed.ts';
import { poolCompare } from '../src/sports/pool/compare.ts';
import { poolStatTotals } from '../src/sports/pool/totals.ts';
import * as S from '../src/sports/snooker/engine.ts';
import * as SC from '../src/sports/snooker/controls.ts';
import { snookerFeed } from '../src/sports/snooker/feed.ts';
import { snookerMatchStats } from '../src/sports/snooker/matchStats.ts';
import { snookerStatTotals } from '../src/sports/snooker/totals.ts';
import * as B from '../src/sports/billiards/engine.ts';
import * as BC from '../src/sports/billiards/controls.ts';
import { billiardsStatTotals, BILLIARDS_FOUL_KEY } from '../src/sports/billiards/totals.ts';
import * as CR from '../src/sports/carrom/engine.ts';
import { carromFeed } from '../src/sports/carrom/feed.ts';
import * as CH from '../src/sports/chess/engine.ts';
import { chessResultCredit } from '../src/sports/chess/stats.ts';
import { chessFeed } from '../src/sports/chess/gameFeed.ts';
import { poolLog, snookerLog, billiardsLog, carromLog, chessLog, replayPool, replaySnooker, replayBilliards, replayCarrom, replayChess } from './cueBoardBatch6Gen.mts';

let seed = 20261106;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];
const CTX = { players: { home: [{ id: 'h1' }], away: [{ id: 'a1' }] } };
const BAD = /undefined|NaN|Infinity|\[object/;
const JUNK: unknown[] = ['__proto__', 'constructor', '<b>x</b>', 5, -1, null, { a: 1 }, ['conduct'], 'CONDUCT', '', 'yes', 1];
const json = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

test('pool: 600 random matches — extensions, ball in hand, push choices, re-racks, not-called pots', () => {
  const seen = { ext: 0, bih: 0, played: 0, passed: 0, rr: 0, nc: 0 };
  for (let m = 0; m < 600; m++) {
    const game = (['eight', 'nine', 'ten'] as const)[rnd(3)];
    const config = { game, raceTo: 1 + rnd(5), playersPerSide: 1, ...(rnd(2) ? { trackShotClock: true } : {}) };
    let s = M.poolInit(config);
    const log: ScoreAction[] = [];
    const tap = (a: ScoreAction | null) => { if (!a) return; const n = M.poolReducer(s, a); if (n !== s) { log.push(a); s = n; } };
    for (let i = 0; i < 160 && !s.ended; i++) {
      const p = PC.poolPanel(s) as { kind: string; table?: number[] };
      const r = rnd(24);
      if (r === 0) { tap(PC.extensionAction(s)); continue; }
      if (r === 1) { tap({ type: 'EXTENSION', side: (SIDES[rnd(2)] ?? JUNK[rnd(JUNK.length)]) as Side, payload: { rack: rnd(2) ? s.rack?.n : JUNK[rnd(JUNK.length)] } } as ScoreAction); continue; }
      if (p.kind === 'lag') tap(PC.lagAction(s, SIDES[rnd(2)]));
      else if (p.kind === 'break') tap(r < 6 && p.table?.length ? PC.breakAction(s, { pots: [p.table[rnd(p.table.length)]] }) : PC.breakAction(s, { pots: [] }));
      else if (p.kind === 'choice') tap(PC.chooseAction(s, rnd(2) ? 'play' : 'pass'));
      else if (p.kind === 'shot') {
        if (r < 6) tap(PC.foulAction(s, PC.PLAY_FOULS[rnd(PC.PLAY_FOULS.length)]));
        else if (r < 9) tap(PC.missAction(s));
        else if (r < 11) tap(PC.safetyAction(s, []));
        else if (r === 11 && game !== 'eight') tap(PC.pushAction(s, {}));
        else if (r === 12) tap(PC.stalemateAction(s));
        else if (r === 13 && p.table?.length) tap(PC.potAction(s, [p.table[0]], { called: false }));
        else if (p.table?.length) tap(PC.potAction(s, [p.table[0]]));
      } else break;
    }
    const where = `match ${m} (${game})`;
    // the score never depends on the extensions: the log without them replays to the same racks
    const plain = M.poolReplay(config, log.filter((a) => a.type !== 'EXTENSION'));
    assert.deepEqual(plain.racks, s.racks, `${where}: racks`);
    assert.deepEqual(plain.current, s.current, `${where}: score`);
    assert.equal(plain.ended, s.ended);
    // at most one extension per side per rack; none untracked
    const ext = M.feedOf(s).filter((e) => e.t === 'EXTENSION');
    const keys = ext.map((e) => `${e.n}:${e.s}`);
    assert.equal(new Set(keys).size, keys.length, `${where}: one per side per rack`);
    if (!config.trackShotClock) assert.equal(ext.length, 0);
    for (const sd of SIDES) {
      const c = M.sideCounts(s, sd), o = M.sideCounts(s, sd === 'home' ? 'away' : 'home');
      assert.ok((c.pushPlayed ?? 0) + (c.pushPassed ?? 0) <= (o.pushOuts ?? 0), `${where}: push choices ≤ the opponent's push-outs`);
      assert.ok((c.notCalled ?? 0) <= (c.potShots ?? 0), `${where}: not called ≤ pots`);
      seen.ext += c.extensions ?? 0; seen.bih += c.ballInHand ?? 0; seen.played += c.pushPlayed ?? 0; seen.passed += c.pushPassed ?? 0;
      seen.rr += c.rerackBreaks ?? 0; seen.nc += c.notCalled ?? 0;
    }
    // replay, live and from stored JSON
    assert.deepEqual(M.poolReplay(config, log), s, `${where}: replay`);
    if (m % 10 === 0) {
      let j = M.poolInit(config);
      for (const a of log) j = M.poolReducer(json(j), a);
      assert.deepEqual(json(j), json(s), `${where}: JSON replay`);
    }
    assert.ok(!BAD.test(JSON.stringify([poolFeed(s, { home: 'H', away: 'A' }), poolCompare(s)])), `${where}: reader output`);
    for (const e of Object.values(poolStatTotals(s, CTX as never))) for (const v of Object.values(e.stats)) assert.ok(Number.isFinite(v) && v >= 0);
  }
  assert.ok(seen.ext > 100 && seen.bih > 1000 && seen.played > 20 && seen.passed > 20 && seen.rr > 20 && seen.nc > 50, JSON.stringify(seen));
});

test('snooker: 500 random matches — make-up, total clearances, long pots / rest', () => {
  const seen = { mk: 0, lp: 0, rs: 0, tc: 0 };
  for (let m = 0; m < 500; m++) {
    const cfg = { reds: [15, 10, 6][rnd(3)], bestOf: 1 + 2 * rnd(2), ...(rnd(2) ? { trackLongRest: true } : {}) };
    let s = S.createInitialState(cfg);
    const log: ScoreAction[] = [];
    const tap = (a: ScoreAction | null) => { if (!a) return; const n = S.reducer(s, a as never); if (n !== s) { log.push(a); s = n; } };
    const tags = () => (rnd(3) === 0 ? { long: rnd(2) === 0, rest: rnd(2) === 0 } : {});
    for (let i = 0; i < 200 && s.frame && !s.ended; i++) {
      const p = SC.snookerPanel(s);
      if (!p) break;
      if (p.toss?.home) { tap(p.toss[SIDES[rnd(2)]]); continue; }
      if (p.respotLots?.home) { tap(p.respotLots[SIDES[rnd(2)]]); continue; }
      const r = rnd(14);
      const pots = p.balls.filter((b) => b.action && b.ball !== 'free');
      if (r < 9 && pots.length) tap(SC.potAction(s, pots[rnd(pots.length)].ball, tags()));
      else if (r < 10) tap(SC.missAction(s, tags()));
      else if (r < 11) tap(p.safety);
      else if (r < 12) tap({ type: 'POT', side: s.frame.striker, payload: { ball: 'red', frame: s.frame.n, long: JUNK[rnd(JUNK.length)], rest: JUNK[rnd(JUNK.length)] } } as ScoreAction);
      else tap(SC.foulAction(s, {}));
    }
    const where = `match ${m}`;
    const reds = s.reds;
    const frames = [...s.frames.map((f) => f.visits ?? []), ...(s.frame ? [[...s.frame.visits, s.frame.visit]] : [])];
    for (const vs of frames) for (const v of vs) {
      const mk = Object.values(v.mk ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      assert.equal(mk, v.pots, `${where}: make-up = pots`);
      if (v.tc) { assert.ok((v.mk?.red ?? 0) >= reds, `${where}: a clearance has every red`); seen.tc++; }
      if (!cfg.trackLongRest) assert.ok(!v.lp && !v.lm && !v.rs, `${where}: untracked`);
      if (mk) seen.mk++;
    }
    const st = S.snookerStats(s);
    for (const sd of SIDES) {
      assert.ok(st[sd].longPots <= st[sd].longAttempts);
      seen.lp += st[sd].longAttempts; seen.rs += st[sd].restShots;
    }
    // the flags never move the score: strip them, replay, same frames and score
    const bare = log.map((a) => ({ ...a, payload: Object.fromEntries(Object.entries(a.payload ?? {}).filter(([k]) => k !== 'long' && k !== 'rest')) }));
    const b2 = S.replay(cfg, bare as never);
    assert.deepEqual(b2.frames.map((f) => f.score), s.frames.map((f) => f.score), `${where}: frame scores`);
    assert.deepEqual(b2.frame?.score, s.frame?.score);
    assert.deepEqual(S.replay(cfg, log as never), s, `${where}: replay`);
    assert.ok(!BAD.test(JSON.stringify([snookerFeed(s, { home: 'H', away: 'A' }), snookerMatchStats(s)])), `${where}: reader output`);
    for (const e of Object.values(snookerStatTotals(s, CTX as never))) for (const v of Object.values(e.stats)) assert.ok(Number.isFinite(v) && v >= 0);
  }
  assert.ok(seen.mk > 2000 && seen.lp > 200 && seen.rs > 200, JSON.stringify(seen));
});

test('billiards: 500 random games — the red-to-centre hint and foul kinds in careers', () => {
  const PARTS: BC.Parts[] = [{ potRed: true }, { potRed: true }, { potRed: true }, { cannon: true }, { inOffRed: true }, { potWhite: true }, { potRed: true, cannon: true }];
  let hints = 0, kinds = 0;
  for (let m = 0; m < 500; m++) {
    const cfg = { target: 100 + 50 * rnd(3) };
    let s = B.createInitialState(cfg);
    let run = 0;
    for (let i = 0; i < 120 && !s.ended; i++) {
      const r = rnd(10);
      const before = s;
      const parts = PARTS[rnd(PARTS.length)];
      const a = r < 7 ? BC.strokeAction(s, parts) : r < 8 ? BC.missAction(s) : r < 9 ? BC.safetyAction(s) : BC.foulAction(s, rnd(4) ? B.FOUL_KINDS[rnd(B.FOUL_KINDS.length)] : undefined);
      if (!a) continue;
      s = B.reducer(s, a as never);
      if (s === before) continue;
      const sameVisit = s.frame && before.frame && s.frame.n === before.frame.n && s.frame.striker === before.frame.striker && r < 7;
      run = sameVisit && parts.potRed && s.frame!.visit.shots > before.frame!.visit.shots ? run + 1 : 0;
      assert.equal(B.redToCentre(s), run >= 3 && run % 3 === 0, `game ${m}: hint at run ${run}`);
      if (B.redToCentre(s)) hints++;
    }
    for (const e of Object.values(billiardsStatTotals(s, CTX as never))) {
      if (!('fouls' in e.stats)) continue;
      const k = Object.values(BILLIARDS_FOUL_KEY).reduce((t, key) => t + (e.stats[key] ?? 0), 0);
      assert.ok(k <= e.stats.fouls, `game ${m}: kinds ≤ fouls`);
      kinds += k;
    }
    assert.doesNotThrow(() => B.redToCentre(json(s)));
  }
  assert.ok(hints > 100 && kinds > 300, `${hints} / ${kinds}`);
});

test('carrom: 500 random matches — board and game awards', () => {
  let boardsAwarded = 0, gamesAwarded = 0;
  for (let m = 0; m < 500; m++) {
    const cfg: Record<string, unknown> = { target: 25, maxBoards: 8, gamesToWin: 1 + rnd(2), ...(rnd(2) ? { foulScore: true } : {}), ...(rnd(3) === 0 ? { preset: 'icf' } : {}) };
    let s = CR.init(cfg);
    const log: ScoreAction[] = [];
    const tap = (a: unknown) => { const n = CR.reducer(s, a as never); if (n !== s) { log.push(a as ScoreAction); s = n; } };
    for (let i = 0; i < 40 && !s.ended; i++) {
      const side = SIDES[rnd(2)];
      const r = rnd(20);
      if (r === 0) tap(CR.awardGameAction(s, side, rnd(2) ? CR.AWARD_REASONS[rnd(5)] : (JUNK[rnd(JUNK.length)] as never)));
      else if (r === 1) tap({ type: 'AWARD_GAME', side, payload: { game: rnd(2) ? s.games.length + 2 : JUNK[rnd(JUNK.length)] } });
      else if (r === 2) tap({ type: 'BOARD', side, payload: { penalty: true, award: 'conduct' } });
      else tap({ type: 'BOARD', side, payload: { coins: rnd(10), queenBy: (['winner', 'loser', 'none'] as const)[rnd(3)], ...(rnd(4) === 0 ? { award: rnd(2) ? CR.AWARD_REASONS[rnd(5)] : JUNK[rnd(JUNK.length)] } : {}) } });
    }
    const where = `match ${m}`;
    for (const b of s.boards) if (b.award !== undefined) { assert.ok((CR.AWARD_REASONS as readonly string[]).includes(b.award), where); assert.ok(!b.penalty); boardsAwarded++; }
    for (const a of s.gameAwards ?? []) {
      const g = s.games[a.game - 1];
      assert.ok(g, `${where}: an awarded game is recorded`);
      assert.equal(g[a.winner === 'home' ? 0 : 1], s.target, `${where}: at the target`);
      assert.ok(g[a.winner === 'home' ? 1 : 0] < s.target);
      if (a.reason !== undefined) assert.ok((CR.AWARD_REASONS as readonly string[]).includes(a.reason));
      gamesAwarded++;
    }
    assert.equal(s.gamesWon.home + s.gamesWon.away, s.games.length, `${where}: games won add up`);
    assert.ok(s.gamesWon.home <= s.gamesToWin && s.gamesWon.away <= s.gamesToWin);
    // a correction of the boards (as they are) keeps every game and award
    const fixed = CR.replayBoards(s, CR.boardInputs(s));
    assert.deepEqual(fixed.games, s.games, `${where}: games after a correction`);
    assert.deepEqual(fixed.gameAwards, s.gameAwards, `${where}: awards after a correction`);
    assert.deepEqual(log.reduce((x, a) => CR.reducer(x, a as never), CR.init(cfg)), s, `${where}: replay`);
    assert.ok(!BAD.test(JSON.stringify(carromFeed(s, { home: 'H', away: 'A' }))), `${where}: feed`);
  }
  assert.ok(boardsAwarded > 300 && gamesAwarded > 100, `${boardsAwarded} / ${gamesAwarded}`);
});

test('chess: 600 random games — arbiter events, the illegal-move preset, uneven scores', () => {
  let uneven = 0, presets = 0, events = 0;
  const METHODS = [...CH.DECISIVE, ...CH.DRAWN];
  for (let g = 0; g < 600; g++) {
    const ko = rnd(5) === 0;
    let s = CH.init({ timeControl: ['rapid', 'blitz', 'classical'][rnd(3)], ...(ko ? { koGames: 2 } : {}), ...(rnd(2) ? { tcBase: 90, tcInc: 30, tcMoves: rnd(2) ? 40 : 0, tcBase2: 30, tcDelay: rnd(3) } : {}) });
    for (let i = 0; i < 1 + rnd(8); i++) {
      const kind = rnd(6) === 0 ? JUNK[rnd(JUNK.length)] : (['illegal', 'drawOffer'] as const)[rnd(2)];
      s = CH.reducer(s, { type: 'ARBITER', payload: { kind, side: rnd(8) === 0 ? JUNK[rnd(JUNK.length)] : SIDES[rnd(2)], ...(rnd(4) === 0 ? { secs: rnd(2) ? rnd(700) : JUNK[rnd(JUNK.length)] } : {}) } } as never);
    }
    const ev = s.events ?? [];
    events += ev.length;
    assert.ok(ev.length <= CH.MAX_EVENTS);
    for (const e of ev) {
      assert.ok(e.k === 'illegal' || e.k === 'drawOffer');
      assert.ok(e.s === 'home' || e.s === 'away');
      if (e.k === 'illegal') assert.ok(Number.isInteger(e.t) && e.t! >= 0 && e.t! <= 600);
    }
    const pre = CH.arbiterPreset(s);
    const two = SIDES.find((sd) => CH.illegalCount(s, sd) >= 2);
    if (two) { assert.deepEqual(pre, { winner: two === 'home' ? 'away' : 'home', method: 'illegal-move' }); presets++; } else assert.equal(pre, null);
    // the result
    const w = (['home', 'away', 'draw'] as const)[rnd(3)];
    const method = rnd(3) === 0 ? (rnd(2) ? 'arbiter' : 'adjudication') : METHODS[rnd(METHODS.length)];
    const wantUneven = rnd(2) === 0;
    const r = CH.reducer(s, { type: 'RESULT', payload: { winner: w, method, ...(wantUneven ? { uneven: rnd(4) ? true : JUNK[rnd(JUNK.length)] } : {}), ...(ko ? { ko: { games: 2 } } : {}) } } as never);
    if (r.uneven) {
      uneven++;
      assert.ok(!ko && w !== 'draw' && (r.method === 'arbiter' || r.method === 'adjudication'));
      const p = CH.points(r);
      assert.equal(p.home + p.away, 0.5);
      assert.equal(p[r.winner as Side], 0.5);
      assert.match(CH.resultString(r), /^(½-0|0-½)$/);
      for (const sd of SIDES) {
        const c = chessResultCredit(sd, { id: sd }, r.winner as Side, r.method, false, true)!;
        assert.deepEqual(c.extra, sd === r.winner ? { draws: 1, drawsOther: 1 } : { losses: 1, lossesOther: 1 });
      }
    } else if (r.ended && !r.ko) {
      const p = CH.points(r);
      assert.ok([0, 1].includes(p.home + p.away), `game ${g}: ${JSON.stringify(p)}`);
    }
    // no event after the result; the feed reads clean
    if (r.ended) assert.equal(CH.reducer(r, { type: 'ARBITER', payload: { kind: 'drawOffer', side: 'home' } } as never), r);
    assert.ok(!BAD.test(JSON.stringify(chessFeed(r, { home: 'H', away: 'A' }))), `game ${g}: feed`);
    assert.ok(!BAD.test(CH.timeControlText(r)));
  }
  assert.ok(uneven > 30 && presets > 50 && events > 1000, `${uneven} / ${presets} / ${events}`);
});

test('old-style logs: 500 per sport replay deterministically, live and from JSON', () => {
  const sports: Array<[string, (k: number) => { cfg: Record<string, unknown>; acts: ScoreAction[] }, (l: { cfg: Record<string, unknown>; acts: ScoreAction[] }) => unknown]> = [
    ['pool', poolLog, replayPool], ['snooker', snookerLog, replaySnooker], ['billiards', billiardsLog, replayBilliards], ['carrom', carromLog, replayCarrom], ['chess', chessLog, replayChess],
  ];
  for (const [name, gen, rep] of sports) {
    for (let i = 0; i < 500; i++) {
      const l = gen(900000 + i);
      const a = rep(l), b = rep(json(l));
      assert.deepEqual(json(a), json(b), `${name} ${i}`);
    }
  }
});
