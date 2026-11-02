/**
 * Quality mandate step 6 for racket-depth (docs/security/breaks/racket-depth.md):
 * random badminton, table tennis, squash, padel and pickleball matches
 * (singles and doubles, rally and side-out scoring; well over 1,000 rallies and
 * 500 players) with every ending — typed forced errors, points lost by rule,
 * doubles winners with and without a "By:" hitter — and hostile details.
 * Invariants: nothing invalid is stored; without "By:" every credit is exactly
 * the pre-change credit (a frozen copy of the old `detailPlayerCredits`);
 * with it the hitter (when on the winning side) gets the winner; the Stats tab
 * rule / forced-error-type rows add up; every described rally has a sentence;
 * a timeline replay keeps every detail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import type { LiveEvent } from '../src/sports/liveEvents.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import { makeRallyEngine, rallyInputs } from '../src/sports/rallyEngine.ts';
import { pointInputs, replayPoints } from '../src/sports/rallyEdit.ts';
import {
  DEPTH_SPORTS, creditsOf, detailPlayerCredits, errTypeOf, howDef, winnerSide, type DepthSport, type PointDetail,
} from '../src/sports/pointDetail.ts';
import { errorTypeRows, keyStats, racketView } from '../src/sports/racketMatchStats.ts';
import { racketCommentary, racketSentence } from '../src/sports/racketCommentaryModel.ts';

let seed = 1103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
type Side = 'home' | 'away';
type Resolve = (side: Side, p?: { playerId?: string; playerName?: string }) => string | undefined;
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)];
const HOWS = ['winner', 'fe', 'ue', 'rule', 'ace', 'sw', 'sf', 'stroke', 'nolet', 'bogus', '__proto__'];
const TYPES = ['net', 'out', 'tin', 'kitchen', 'foot', 'fault', 'long', 'smash', '__proto__', 'constructor', undefined];
const WINNER_HOWS = new Set(['winner', 'ace', 'sw', 'stroke']);

/** The pre-change credit (frozen copy of detailPlayerCredits before racket-depth). */
function oldCredits(sport: DepthSport, events: LiveEvent[], resolve: Resolve) {
  const out = new Map<string, Record<string, number>>();
  const add = (id: string | undefined, key: string) => { if (!id) return; const m = out.get(id) ?? {}; m[key] = (m[key] ?? 0) + 1; out.set(id, m); };
  for (const e of events) {
    if (!e.pd || !['point', 'ace', 'rally'].includes(e.kind ?? '')) continue;
    const W = winnerSide(e);
    if (W !== 'home' && W !== 'away') continue;
    const winnerId = resolve(W, e.kind === 'rally' ? undefined : { playerId: e.playerId, playerName: e.playerName });
    const loserId = resolve(opp(W), e.pd.err);
    for (const [who, key] of creditsOf(sport, e.pd)) add(who === 'winner' ? winnerId : loserId, key);
  }
  return out;
}
const sorted = (m: Map<string, Record<string, number>>) => Object.fromEntries([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));

const rally = (id: 'tabletennis' | 'squash' | 'pickleball', perSide: number) =>
  makeRallyEngine({ id, icon: '', sideOutValue: id === 'squash' ? 'english' : id === 'pickleball' ? 'sideout' : '__none__', sideOutLabel: 'x', defaults: { playersPerSide: perSide, target: 11, winBy: 2, gamesToWin: 2 } });

type Eng = { reducer: (s: never, a: ScoreAction) => never; init: (c: Record<string, unknown>) => never };
function engineOf(sport: DepthSport, doubles: boolean): { eng: Eng; config: Record<string, unknown> } {
  const pps = doubles ? 2 : 1;
  if (sport === 'badminton') return { eng: badminton as unknown as Eng, config: { playersPerSide: pps, pointDetail: true } };
  if (sport === 'padel') return { eng: padel as unknown as Eng, config: { playersPerSide: pps, pointDetail: true, setsToWin: 1 } };
  const e = rally(sport, pps) as unknown as Eng;
  const config: Record<string, unknown> = { playersPerSide: pps, pointDetail: true };
  if (sport === 'pickleball' && rnd(2)) config.scoring = 'sideout';
  if (sport === 'squash' && rnd(2)) config.scoring = 'english';
  return { eng: e, config };
}

test('racket depth: random matches across the five sports, singles and doubles', () => {
  let rallies = 0, players = 0, byCredits = 0, rules = 0, feTyped = 0, hostile = 0, replays = 0;
  for (let m = 0; m < 250; m++) {
    const sport = DEPTH_SPORTS[m % DEPTH_SPORTS.length];
    const doubles = rnd(2) === 1;
    const roster = { home: doubles ? [`h${m}a`, `h${m}b`] : [`h${m}a`], away: doubles ? [`a${m}a`, `a${m}b`] : [`a${m}a`] };
    players += roster.home.length + roster.away.length;
    const { eng, config } = engineOf(sport, doubles);
    const fs: ScoreAction = { type: 'SET_FIRST_SERVER', payload: { side: rnd(2) ? 'home' : 'away', ...(sport === 'pickleball' ? { alt: true, pos: 2 } : {}) } };
    const s0 = eng.reducer(eng.init(config), fs) as { events: LiveEvent[]; ended?: boolean; sideOut?: boolean; serving?: Side; serverNo?: number };
    let s = s0;
    const n = 20 + rnd(40);
    for (let i = 0; i < n && !s.ended; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      // side-out: the server is credited when the serving side wins (rallyCore `rallyWon`);
      // rally doubles: sometimes a long-press credit
      const credit = s.sideOut && side === s.serving ? roster[side][doubles ? (s.serverNo ?? 1) - 1 : 0]
        : rnd(3) === 0 ? pick(roster[side]) : undefined;
      s = eng.reducer(s as never, { type: 'POINT', side, ...(credit ? { attribution: { playerId: credit, stat: 'points' } } : {}) });
      rallies++;
      // the optional detail card, after the rally
      const roll = rnd(10);
      if (roll < 7) {
        const how = pick(HOWS);
        const pd: Record<string, unknown> = { how };
        if (rnd(2)) pd.stroke = pick(TYPES);
        if (rnd(2)) pd.wing = pick(['fh', 'bh']);
        if (rnd(3) === 0) pd.err = { playerId: pick([...roster.home, ...roster.away]) };
        const r = rnd(6);
        if (r < 3) pd.by = pick([...roster.home, ...roster.away]);
        else if (r === 3) { pd.by = pick([1, '', null, {}, 'x'.repeat(100), '__proto__']); hostile++; }
        s = eng.reducer(s as never, { type: 'POINT_DETAIL', payload: { pd } });
      } else if (roll === 7) {
        s = eng.reducer(s as never, { type: 'POINT_DETAIL', payload: { pd: JSON.parse('{"how":"winner","__proto__":{"by":"zz"}}') } });
        hostile++;
      }
    }
    const events = s.events;
    // 1. nothing invalid is stored
    for (const e of events) {
      const pd = e.pd as PointDetail | undefined;
      if (!pd) continue;
      assert.ok(howDef(sport, pd.how) || ['ace', 'sw', 'sf', 'stroke', 'nolet', 'rule', 'winner', 'fe', 'ue'].includes(pd.how), `${sport} ${pd.how}`);
      if (pd.by !== undefined) {
        assert.equal(typeof pd.by, 'string');
        assert.ok(pd.by.length > 0 && pd.by.length <= 64);
        assert.ok(WINNER_HOWS.has(pd.how), 'a hitter only on a winner-credit how');
        if (doubles && pd.how === 'winner') byCredits++;
      }
      assert.ok(!Object.hasOwn(Object.getPrototypeOf(pd), 'by'));
      const et = errTypeOf(sport, pd);
      if (et) assert.ok(howDef(sport, pd.how)!.strokes!.includes(et));
      if (pd.how === 'fe' && et) feTyped++;
      if (pd.how === 'rule' && howDef(sport, 'rule')) rules++;
    }
    // 2. careers: without "By:" exactly as before; with it, the hitter on the winning side
    const ids = new Set([...roster.home, ...roster.away]);
    const sideOf = (id: string): Side => (roster.home.includes(id) ? 'home' : 'away');
    const resolve: Resolve = (side, p) => {
      if (p?.playerId && ids.has(p.playerId) && sideOf(p.playerId) === side) return p.playerId;
      return roster[side].length === 1 ? roster[side][0] : undefined;
    };
    const stripped = events.map((e) => (e.pd?.by ? { ...e, pd: (({ by: _b, ...rest }) => rest)(e.pd) } : e));
    assert.deepEqual(sorted(detailPlayerCredits(sport, stripped, resolve)), sorted(oldCredits(sport, stripped, resolve)), 'no By: = the old credit');
    assert.deepEqual(sorted(detailPlayerCredits(sport, stripped, resolve)), sorted(oldCredits(sport, events, resolve)), 'the old credit ignores By:');
    // the oracle: the old rule, with the winner replaced by a hitter on the winning side
    const oracle = oldCredits(sport, events.map((e) => {
      const W = winnerSide(e) as Side | undefined;
      const by = e.pd?.by;
      return by && W && resolve(W, { playerId: by }) ? { ...e, kind: e.kind === 'rally' ? 'point' : e.kind, side: W, playerId: by, playerName: undefined } as LiveEvent : e;
    }), resolve);
    assert.deepEqual(sorted(detailPlayerCredits(sport, events, resolve)), sorted(oracle), 'By: credits the hitter');
    // 3. the Stats tab adds up
    const v = racketView(sport, s, roster);
    if (v && v.cov.detail === 'full') {
      const loserCount = (how: string, side: Side) => (sport === 'squash' || sport === 'tabletennis' || sport === 'pickleball' ? rallyInputs(events) : pointInputs(events))
        .filter((p) => p.pd?.how === how && opp(p.side as Side) === side).length;
      const shots = keyStats(v).find((x) => x.id === 'shots')?.rows ?? [];
      const rule = shots.find((r) => r.key === 'rule');
      const hr = loserCount('rule', 'home'), ar = loserCount('rule', 'away');
      if (hr + ar) assert.deepEqual([rule?.hv, rule?.av], [hr, ar]); else assert.equal(rule, undefined);
      const fe = shots.find((r) => r.key === 'fe')!;
      const feRows = errorTypeRows(v).filter((r) => r.key.startsWith('fe-'));
      assert.ok(feRows.reduce((a, r) => a + r.hv, 0) <= fe.hv && feRows.reduce((a, r) => a + r.av, 0) <= fe.av, 'typed forced errors ≤ forced errors');
    }
    // 4. every described rally reads (no throw; a sentence for every how the sport has)
    const inputs = sport === 'squash' || sport === 'tabletennis' || sport === 'pickleball' ? rallyInputs(events) : pointInputs(events);
    for (const p of inputs) {
      if (!p.pd || !howDef(sport, p.pd.how) || p.pen) continue;
      const t = racketSentence(sport, p, { winner: 'W', loser: 'L', server: 'S' });
      assert.ok(t && t.length > 3, `${sport} ${p.pd.how}`);
    }
    racketCommentary(sport, s, { homeName: 'Home', awayName: 'Away', homeRoster: roster.home.map((id) => ({ id, name: id })), awayRoster: roster.away.map((id) => ({ id, name: id })) } as never);
    // 5. a timeline replay keeps every detail (by and types included)
    const again = replayPoints(eng.reducer as never, s0 as never, inputs) as { events: LiveEvent[] };
    const pds = (es: LiveEvent[]) => es.filter((e) => e.pd).map((e) => e.pd);
    assert.deepEqual(pds(again.events), pds(events));
    replays++;
  }
  assert.ok(rallies >= 1000, `rallies ${rallies}`);
  assert.ok(players >= 500, `players ${players}`);
  assert.ok(byCredits > 50 && rules > 50 && feTyped > 50 && hostile > 50 && replays === 250, JSON.stringify({ byCredits, rules, feTyped, hostile, replays }));
});
