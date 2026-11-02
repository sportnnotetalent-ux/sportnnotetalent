/**
 * Cue & board batch 5 — simulation (quality mandate step 6), 500+ random
 * matches per sport through the controls' builders, plus junk taps:
 *  - pool (600): the foul kinds add up to the fouls on every line; the feed is
 *    bounded and keeps whole racks; a replay (live and from stored JSON) is
 *    identical; an awarded rack's reason is whitelisted; TPA within 0–1;
 *  - snooker (500): safeties judged ≤ safeties, held ≤ judged; foul kinds ≤
 *    fouls; every total finite and ≥ 0; the replay is identical;
 *  - billiards (500): the commentary never prints junk; the break make-up
 *    matches the visit;
 *  - chess (600 results): the credit's method key always fits the outcome; a
 *    hostile method gives none; the default never adds a tap;
 *  - per-game options (600 random formats): the pool options show only in
 *    their own game, in Info and in the editor alike.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import * as M from '../src/sports/pool/match.ts';
import * as PC from '../src/sports/pool/controls.ts';
import { AWARD_REASONS } from '../src/sports/pool/engine.ts';
import { poolFeed } from '../src/sports/pool/feed.ts';
import { poolCompare, poolTpa } from '../src/sports/pool/compare.ts';
import { poolStatTotals } from '../src/sports/pool/totals.ts';
import * as S from '../src/sports/snooker/engine.ts';
import { snookerPanel, foulAction as snFoul } from '../src/sports/snooker/controls.ts';
import { snookerMatchStats } from '../src/sports/snooker/matchStats.ts';
import { snookerStatTotals, SNOOKER_FOUL_KEY } from '../src/sports/snooker/totals.ts';
import * as B from '../src/sports/billiards/engine.ts';
import * as BC from '../src/sports/billiards/controls.ts';
import { billiardsFeed } from '../src/sports/billiards/feed.ts';
import { chessResultCredit, LOSS_METHOD_KEYS, DRAW_METHOD_KEYS, WIN_METHOD_KEYS } from '../src/sports/chess/stats.ts';
import { DECISIVE, DRAWN } from '../src/sports/chess/engine.ts';
import { sentHow, methodFits } from '../src/sports/chess/how.ts';
import { isHidden } from '../src/sports/formatPick.ts';
import { matchRules } from '../src/sports/matchRules.ts';
import { POOL_META } from '../src/sports/pool/meta.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];
const CTX = { players: { home: [{ id: 'h1' }], away: [{ id: 'a1' }] } };
const BAD = /undefined|NaN|Infinity|\[object/;
const POOL_KIND_KEYS = ['foulScratch', 'foulWrongBall', 'foulNoRail', 'foulOffTable', 'foulTouch', 'foulDoubleHit', 'foulPush', 'foulJump', 'foulMoving',
  'foulNoFoot', 'foulPlacement', 'foulSlowPlay', 'foulOutOfTurn', 'foulIllegalBreak', 'foulOther'];
const JUNK: unknown[] = ['__proto__', 'constructor', '<b>x</b>', 5, -1, null, { a: 1 }, ['conduct'], 'CONDUCT', ''];

test('pool: 600 random matches — foul kinds, the whole-match feed, award reasons, TPA, replay', () => {
  const seen = { reasons: 0, racks: 0, rareFouls: 0 };
  for (let m = 0; m < 600; m++) {
    const game = (['eight', 'nine', 'ten'] as const)[rnd(3)];
    const config = { game, raceTo: 1 + rnd(9), playersPerSide: 1 };
    let s = M.poolInit(config);
    const log: ScoreAction[] = [];
    const tap = (a: ScoreAction | null) => { if (!a) return; const n = M.poolReducer(s, a); if (n !== s) { log.push(a); s = n; } };
    for (let i = 0; i < 160 && !s.ended; i++) {
      const p = PC.poolPanel(s) as { kind: string; table?: number[] };
      const r = rnd(20);
      if (p.kind === 'lag') tap(PC.lagAction(s, SIDES[rnd(2)]));
      else if (p.kind === 'break') tap(r < 2 ? PC.rackAction(s, SIDES[rnd(2)], { reason: rnd(2) ? AWARD_REASONS[rnd(4)] : (JUNK[rnd(JUNK.length)] as never) }) : PC.breakAction(s, { pots: r < 8 && p.table?.length ? [p.table[rnd(p.table.length)]] : [] }));
      else if (p.kind === 'choice') tap(PC.chooseAction(s, rnd(2) ? 'play' : 'pass'));
      else if (p.kind === 'shot') {
        if (r < 6) tap(PC.foulAction(s, PC.PLAY_FOULS[rnd(PC.PLAY_FOULS.length)]));
        else if (r < 9) tap(PC.missAction(s));
        else if (r < 12) tap(PC.safetyAction(s, []));
        else if (r === 12) tap(PC.rackAction(s, SIDES[rnd(2)], { reason: rnd(2) ? AWARD_REASONS[rnd(4)] : (JUNK[rnd(JUNK.length)] as never) }));
        else if (r === 13) tap({ type: 'RACK', side: SIDES[rnd(2)], payload: { rack: s.rack?.n, reason: JUNK[rnd(JUNK.length)] } } as ScoreAction);
        else if (p.table?.length) tap(PC.potAction(s, [p.table[0]]));
      } else break;
    }
    const where = `match ${m} (${game})`;
    // P2 — the kinds add up to the fouls (every set, both sides)
    for (const sd of SIDES) {
      const c = M.sideCounts(s, sd);
      assert.equal(POOL_KIND_KEYS.reduce((t, k) => t + (c[k] ?? 0), 0), c.fouls ?? 0, `${where}: ${sd} kinds = fouls`);
      const tpa = poolTpa(c);
      assert.ok(tpa === null || (tpa >= 0 && tpa <= 1), `${where}: TPA ${tpa}`);
    }
    // P7 / P8 — reasons only on awarded racks, only from the list
    seen.racks += s.racks.length;
    for (const sd of SIDES) seen.rareFouls += ['foulTouch', 'foulDoubleHit', 'foulPush', 'foulJump', 'foulMoving', 'foulNoFoot', 'foulPlacement', 'foulSlowPlay'].reduce((t, k) => t + (M.sideCounts(s, sd)[k] ?? 0), 0);
    for (const r of s.racks) {
      if (r.reason !== undefined) {
        seen.reasons++;
        assert.equal(r.how, 'awarded', `${where}: a reason only on an awarded rack`);
        assert.ok((AWARD_REASONS as readonly string[]).includes(r.reason), `${where}: reason ${String(r.reason)}`);
      }
    }
    // P4 / P5 — the feed: bounded, every completed rack kept (well under the cap), racks in order
    const f = M.feedOf(s);
    assert.ok(f.length <= M.FEED_MAX);
    for (let i = 1; i < f.length; i++) assert.ok(f[i].n >= f[i - 1].n, `${where}: racks in order`);
    if (f.length < M.FEED_MAX - M.FEED_PER_RACK) for (const r of s.racks) assert.ok(f.some((e) => e.n === r.n), `${where}: rack ${r.n} kept`);
    // the replay, live and from stored JSON, is identical
    const again = log.reduce<M.PoolMatch>((x, a) => M.poolReducer(x, a), M.poolInit(config));
    assert.deepEqual(again, s, `${where}: replay`);
    if (m % 10 === 0) {
      let j = M.poolInit(config);
      for (const a of log) j = M.poolReducer(JSON.parse(JSON.stringify(j)), a);
      assert.deepEqual(JSON.parse(JSON.stringify(j)), JSON.parse(JSON.stringify(s)), `${where}: JSON replay`);
    }
    // the readers never print junk; totals finite
    const out = JSON.stringify([poolFeed(s, { home: 'H', away: 'A' }), poolCompare(s)]);
    assert.ok(!BAD.test(out), `${where}: reader output`);
    for (const e of Object.values(poolStatTotals(s, CTX as never))) for (const v of Object.values(e.stats)) assert.ok(Number.isFinite(v) && v >= 0);
  }
  // the simulation reached what it tests
  assert.ok(seen.racks > 1000 && seen.reasons > 20 && seen.rareFouls > 500, JSON.stringify(seen));
});

test('snooker: 500 random frames — safety success and foul kinds stay consistent; replay identical', () => {
  const kinds = S.FOUL_KINDS;
  const seen = { judged: 0, held: 0, kinds: 0 };
  for (let m = 0; m < 500; m++) {
    const cfg = { reds: [15, 10, 6][rnd(3)], bestOf: 1 + 2 * rnd(2) };
    let s = S.createInitialState(cfg);
    const log: unknown[] = [];
    const tap = (a: unknown) => { if (!a) return; const n = S.reducer(s, a as never); if (n !== s) { log.push(a); s = n; } };
    for (let i = 0; i < 120 && s.frame && !s.ended; i++) {
      const p = snookerPanel(s);
      if (!p) break;
      if (p.toss?.home) { tap(p.toss[SIDES[rnd(2)]]); continue; }
      if (p.respotLots?.home) { tap(p.respotLots[SIDES[rnd(2)]]); continue; }
      const r = rnd(10);
      const pot = p.balls.find((b) => b.action && b.ball !== 'free');
      if (r < 4 && pot) tap(pot.action);
      else if (r < 6) tap(p.miss);
      else if (r < 8) tap(p.safety);
      else tap(snFoul(s, { kind: rnd(5) ? kinds[rnd(kinds.length)] : undefined }));
    }
    const st = S.snookerStats(s);
    for (const sd of SIDES) {
      const t = st[sd];
      assert.ok(t.safetiesJudged <= t.safeties && t.safetiesWon <= t.safetiesJudged, `match ${m}: safeties ${t.safeties}/${t.safetiesJudged}/${t.safetiesWon}`);
      assert.ok(kinds.reduce((a, k) => a + (t.foulsByKind[k] ?? 0), 0) <= t.fouls);
      seen.judged += t.safetiesJudged; seen.held += t.safetiesWon; seen.kinds += kinds.reduce((a, k) => a + (t.foulsByKind[k] ?? 0), 0);
    }
    const tot = snookerStatTotals(s, CTX as never);
    for (const e of Object.values(tot)) {
      for (const v of Object.values(e.stats)) assert.ok(Number.isFinite(v) && v >= 0);
      if ('fouls' in e.stats) assert.ok(kinds.reduce((a, k) => a + (e.stats[SNOOKER_FOUL_KEY[k]] ?? 0), 0) <= e.stats.fouls);
    }
    assert.ok(!BAD.test(JSON.stringify(snookerMatchStats(s))));
    const again = log.reduce<S.SnookerState>((x, a) => S.reducer(x, a as never), S.createInitialState(cfg));
    assert.deepEqual(again, s, `match ${m}: replay`);
  }
  assert.ok(seen.judged > 200 && seen.held > 50 && seen.held < seen.judged && seen.kinds > 200, JSON.stringify(seen));
});

test('billiards: 500 random games — the commentary shows each break’s make-up, never junk', () => {
  const PARTS: BC.Parts[] = [{ potRed: true }, { cannon: true }, { inOffRed: true }, { potWhite: true }, { inOffWhite: true }, { potRed: true, cannon: true }];
  let madeUp = 0, foulAfter = 0;
  for (let m = 0; m < 500; m++) {
    let s = B.createInitialState({ target: 50 + 50 * rnd(3) });
    const tap = (a: unknown) => { if (!a) return; const n = B.reducer(s, a as never); if (n !== s) s = n; };
    for (let i = 0; i < 80 && !s.ended; i++) {
      const r = rnd(10);
      if (r < 6) tap(BC.strokeAction(s, PARTS[rnd(PARTS.length)]));
      else if (r < 8) tap(BC.missAction(s));
      else if (r < 9) tap(BC.safetyAction(s));
      else tap(BC.foulAction(s, B.FOUL_KINDS[rnd(B.FOUL_KINDS.length)]));
    }
    const g = billiardsFeed(s, { home: 'H', away: 'A' }, 'frame');
    for (const grp of g) for (const it of grp.items) {
      assert.ok(!BAD.test(it.text), `game ${m}: ${it.text}`);
      // a break line names its strokes whenever it has points
      const brk = /break of (\d+)( so far)?/.exec(it.text);
      if (brk && Number(brk[1]) > 0) {
        assert.ok(/break of \d+( so far)? \(\d+ /.test(it.text), `game ${m}: make-up missing in "${it.text}"`);
        madeUp++;
        if (/fouled/.test(it.text)) foulAfter++;
      }
    }
  }
  assert.ok(madeUp > 1000 && foulAfter > 50, `${madeUp} / ${foulAfter}`);
});

test('chess: 600 random results — the method key always fits the outcome; junk gives none', () => {
  const METHODS: unknown[] = [...DECISIVE, ...DRAWN, 'double-forfeit', ...JUNK, undefined];
  for (let i = 0; i < 600; i++) {
    const winner = (['home', 'away', 'draw'] as const)[rnd(3)];
    const dff = winner === 'draw' && rnd(10) === 0;
    const picked = METHODS[rnd(METHODS.length)];
    const none = rnd(6) === 0;
    const sent = sentHow({ winner, picked: picked as never, none, dff });
    if (dff) assert.equal(sent, 'double-forfeit');
    else if (none) assert.equal(sent, undefined);
    else assert.ok(methodFits(winner, sent), `${winner}: ${String(sent)} fits`);
    for (const side of SIDES) {
      const c = chessResultCredit(side, { id: side }, winner, (rnd(4) ? sent : picked) as never, dff);
      assert.ok(c);
      const keys = Object.keys(c!.extra ?? {});
      const how = keys.filter((k) => !['wins', 'draws', 'losses'].includes(k));
      assert.ok(how.length <= 1);
      if (how[0]) {
        const fam = winner === 'draw' ? DRAW_METHOD_KEYS : winner === side ? WIN_METHOD_KEYS : LOSS_METHOD_KEYS;
        assert.ok((fam as readonly string[]).includes(how[0]), `${winner}/${side}: ${how[0]}`);
      }
      for (const v of Object.values(c!.extra ?? {})) assert.equal(v, 1);
    }
  }
});

test('per-game options: 600 random pool formats — each game’s own option only, Info and editor agree', () => {
  const fields = POOL_META.formatFields!;
  const games: unknown[] = ['eight', 'nine', 'ten', undefined, null, 'snooker', 9, '__proto__'];
  for (let i = 0; i < 600; i++) {
    const g = games[rnd(games.length)];
    const fmt: Record<string, unknown> = { ...(g === undefined ? {} : { game: g }), playersPerSide: 1 + rnd(2), tenEarly: rnd(2) === 0, threeBallRule: rnd(2) === 0 };
    const info = new Set(matchRules(fields, fmt).map((r) => r.key));
    const eff = g === undefined || g === null ? 'eight' : g;
    assert.equal(info.has('threeBallRule'), eff === 'nine', `Info three-ball, game ${String(g)}`);
    assert.equal(info.has('tenEarly'), eff === 'ten', `Info 10 early, game ${String(g)}`);
    for (const f of fields) {
      if (!f.hideWhen) continue;
      assert.equal(!isHidden(f, fmt as never, fields), info.has(f.key), `editor and Info agree on ${f.key}, game ${String(g)}`);
    }
  }
});
