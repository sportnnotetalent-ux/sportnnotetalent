/**
 * Tennis doubles: who hit the winner (wave 4) — docs/security/breaks/tennis-doubles-hitter.md.
 * Founder rule: in doubles a winner by C & D could have been hit by C or D, so
 * the card asks "By:"; player-wise stats credit the hitter alongside the team
 * stats. New matches only: a point without `by` credits exactly as before.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { init, reducer, type TennisState } from '../src/sports/tennis/engine.ts';
import { applyPointDetail, creditsOf, detailPlayerCredits, hitterFor, pdText, winnerSide, type PointDetail } from '../src/sports/pointDetail.ts';
import { tennisTotals } from '../src/sports/racketTotals.ts';
import { pointSentence, tennisCommentary } from '../src/sports/tennis/commentaryModel.ts';
import { tennisTally, tennisView } from '../src/sports/tennis/matchStats.ts';
import { pointInputs, replayPoints } from '../src/sports/rallyEdit.ts';
import { serveStats } from '../src/sports/serveStats.ts';
import type { LiveEvent } from '../src/sports/liveEvents.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { NameOf } from '../src/sports/racketNames.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const run = (s: TennisState, as: ScoreAction[]) => as.reduce(reducer, s);
const FS = (side: Side): ScoreAction => ({ type: 'SET_FIRST_SERVER', payload: { side } });
const P = (side: Side, playerId?: string): ScoreAction => ({ type: 'POINT', side, ...(playerId ? { attribution: { playerId, stat: 'points' } } : {}) });
const D = (pd: unknown): ScoreAction => ({ type: 'POINT_DETAIL', payload: { pd } });
const lastPd = (s: TennisState) => [...s.events].reverse().find((e) => e.kind === 'point' || e.kind === 'ace')?.pd;
const dbl = () => init({ playersPerSide: 2, pointDetail: true });
const sgl = () => init({ pointDetail: true });
const DOUBLES = { players: { home: [{ id: 'h1', name: 'Asha' }, { id: 'h2', name: 'Bina' }], away: [{ id: 'a1', name: 'Chen' }, { id: 'a2', name: 'Dev' }] } };
const SINGLES = { players: { home: [{ id: 'h1', name: 'Asha' }], away: [{ id: 'a1', name: 'Chen' }] } };
const NAMES: Record<string, string> = { h1: 'Asha', h2: 'Bina', a1: 'Chen', a2: 'Dev' };
const nameOf: NameOf = (id, legacy) => (id && NAMES[id]) || legacy || 'Player';

describe('TH5: the hitter is stored for tennis (new matches), hostile values dropped', () => {
  const ev = (): LiveEvent[] => [{ id: 1, kind: 'point', side: 'home' } as LiveEvent];
  const put = (pd: unknown) => applyPointDetail(ev(), { pd })?.[0].pd; // the tennis engine's call (no sport)
  test('a winner / service winner keeps its hitter', () => {
    assert.deepEqual(put({ how: 'winner', by: 'h2' }), { how: 'winner', by: 'h2' });
    assert.deepEqual(put({ how: 'sw', by: 'h1' }), { how: 'sw', by: 'h1' });
    assert.deepEqual(applyPointDetail(ev(), { pd: { how: 'winner', by: 'h2' } }, 'tennis')?.[0].pd, { how: 'winner', by: 'h2' });
  });
  test('a bad by is dropped', () => {
    for (const by of [1, '', null, {}, ['h1'], 'x'.repeat(65)]) assert.deepEqual(put({ how: 'winner', by }), { how: 'winner' }, String(by));
    assert.deepEqual(put(JSON.parse('{"how":"winner","__proto__":{"by":"h1"}}')), { how: 'winner' });
  });
  test('TH6: an error / lost by rule has no hitter', () => {
    for (const how of ['ue', 'fe', 'rule']) assert.deepEqual(put({ how, by: 'h1' }), { how });
  });
  test('through the tennis reducer', () => {
    const s = run(dbl(), [FS('home'), P('home'), D({ how: 'winner', wing: 'fh', by: 'h2' })]);
    assert.deepEqual(lastPd(s), { how: 'winner', wing: 'fh', by: 'h2' });
  });
});

describe('TH8: changing the hitter', () => {
  test('replace, then clear', () => {
    let s = run(dbl(), [FS('home'), P('away'), D({ how: 'winner', by: 'a1' })]);
    s = run(s, [D({ how: 'winner', by: 'a2' })]);
    assert.equal(lastPd(s)?.by, 'a2');
    s = run(s, [D({ how: 'winner' })]);
    assert.equal(lastPd(s)?.by, undefined);
  });
  test('hitterFor keeps the hitter across winner hows, drops it on an error', () => {
    const ids = ['h1', 'h2'];
    assert.equal(hitterFor('sw', { how: 'winner', by: 'h2' }, undefined, ids), 'h2');
    assert.equal(hitterFor('winner', { how: 'sw', by: 'h1' }, undefined, ids), 'h1');
    assert.equal(hitterFor('ue', { how: 'winner', by: 'h1' }, undefined, ids), undefined);
    assert.equal(hitterFor('winner', { how: 'winner', by: 'zz' }, undefined, ids), undefined, 'not on the winning side');
  });
});

describe('TH9: aces and service winners — the server is the hitter', () => {
  test('a service winner pre-fills the server when known', () => {
    assert.equal(hitterFor('sw', undefined, 'h2', ['h1', 'h2']), 'h2');
    assert.equal(hitterFor('sw', { how: 'winner', by: 'h1' }, 'h2', ['h1', 'h2']), 'h2', 'the server wins over a previous pick');
    assert.equal(hitterFor('sw', undefined, 'a1', ['h1', 'h2']), undefined, 'a server of the other side is never pre-filled');
    assert.equal(hitterFor('sw', undefined, undefined, ['h1', 'h2']), undefined, 'unknown server: nothing');
    assert.equal(hitterFor('winner', undefined, 'h2', ['h1', 'h2']), undefined, 'a winner is not pre-filled');
  });
  test('singles never stores a hitter', () => {
    assert.equal(hitterFor('sw', undefined, 'h1', ['h1']), undefined);
    assert.equal(hitterFor('winner', { how: 'winner', by: 'h1' }, undefined, ['h1']), undefined);
  });
  test('the serve trace names the doubles server (what the card reads)', () => {
    const s = run(dbl(), [FS('home'), P('home')]);
    const tr = serveStats('tennis', s, { home: ['h1', 'h2'], away: ['a1', 'a2'] })!.trace;
    assert.equal(tr[tr.length - 1].serverId, 'h1');
  });
  test('an ace keeps crediting the ace\'s player (no "By:" on an ace)', () => {
    const s = run(dbl(), [FS('home'), { type: 'ACE', side: 'home', attribution: { playerId: 'h1', stat: 'aces' } }]);
    assert.equal(tennisTotals(s, DOUBLES).h1.stats.aces, 1);
    assert.equal(tennisTotals(s, DOUBLES).h2.stats.aces, 0);
  });
});

describe('TH10: career totals credit the named hitter', () => {
  test('a doubles winner by the partner goes to the partner', () => {
    const s = run(dbl(), [FS('home'), P('home'), D({ how: 'winner', wing: 'bh', shot: 'volley', by: 'h2' }), P('away'), D({ how: 'sw', by: 'a1' })]);
    const t = tennisTotals(s, DOUBLES);
    assert.deepEqual([t.h1.stats.winners, t.h2.stats.winners, t.h2.stats.winnersBh, t.h2.stats.winnersVolley], [0, 1, 1, 1]);
    assert.deepEqual([t.a1.stats.serviceWinners, t.a2.stats.serviceWinners], [1, 0]);
  });
  test('the hitter wins over the point\'s tapped player', () => {
    const s = run(dbl(), [FS('home'), P('home', 'h1'), D({ how: 'winner', by: 'h2' })]);
    const t = tennisTotals(s, DOUBLES);
    assert.deepEqual([t.h1.stats.winners, t.h2.stats.winners], [0, 1]);
  });
  test('TH1: without a hitter, exactly as before (nobody named in doubles: side level)', () => {
    const s = run(dbl(), [FS('home'), P('home'), D({ how: 'winner' }), P('home', 'h1'), D({ how: 'winner' })]);
    const t = tennisTotals(s, DOUBLES);
    assert.deepEqual([t.h1.stats.winners, t.h2.stats.winners], [1, 0]);
  });
  test('TH3: a hitter from the losing side falls back to the old credit', () => {
    const s = run(dbl(), [FS('home'), P('home', 'h1'), D({ how: 'winner', by: 'a1' })]);
    const t = tennisTotals(s, DOUBLES);
    assert.deepEqual([t.h1.stats.winners, t.a1.stats.winners], [1, 0]);
  });
  test('TH5: a hitter on no line falls back to the old credit', () => {
    const s = run(dbl(), [FS('home'), P('home', 'h2'), D({ how: 'winner', by: 'ghost' })]);
    const t = tennisTotals(s, DOUBLES);
    assert.deepEqual([t.h1.stats.winners, t.h2.stats.winners, t.ghost], [0, 1, undefined]);
  });
  test('TH2: singles — a forged hitter changes nothing', () => {
    const a = tennisTotals(run(sgl(), [FS('home'), P('home'), D({ how: 'winner', by: 'a1' })]), SINGLES);
    const b = tennisTotals(run(sgl(), [FS('home'), P('home'), D({ how: 'winner' })]), SINGLES);
    assert.deepEqual(a, b);
    assert.equal(a.h1.stats.winners, 1);
  });
  test('TH13: the team Stats tab ignores the hitter', () => {
    const a = run(dbl(), [FS('home'), P('home'), D({ how: 'winner', by: 'h2' })]);
    const b = run(dbl(), [FS('home'), P('home'), D({ how: 'winner' })]);
    assert.deepEqual(tennisTally(tennisView(a)!), tennisTally(tennisView(b)!));
  });
});

describe('TH7: undo', () => {
  test('undoing the point takes the hitter with it', () => {
    const acts = [FS('home'), P('home'), D({ how: 'winner', by: 'h2' })];
    const undone = run(dbl(), acts.slice(0, 1));
    const again = run(undone, [P('home')]);
    assert.equal(lastPd(again), undefined);
    // describe-done DD13: nothing described after the undo, so no winners key at all
    assert.equal(tennisTotals(again, DOUBLES).h2.stats.winners ?? 0, 0);
  });
  test('a timeline replay keeps the hitter', () => {
    const s0 = run(dbl(), [FS('home')]);
    const s = run(s0, [P('home'), D({ how: 'winner', by: 'h2' })]);
    const r = replayPoints(reducer, s0, pointInputs(s.events));
    assert.equal(lastPd(r)?.by, 'h2');
  });
});

describe('TH11 / TH12: commentary, timeline and names by id', () => {
  const who = { winner: 'Pair A', loser: 'Pair B', server: 'Asha' };
  test('the commentary names the hitter', () => {
    assert.equal(pointSentence({ side: 'home', kind: 'point', pd: { how: 'winner', wing: 'fh', by: 'h2' } } as never, who, nameOf), 'Bina wins the point with a Forehand Winner');
    assert.equal(pointSentence({ side: 'home', kind: 'point', pd: { how: 'sw', by: 'h1' } } as never, who, nameOf), 'Asha wins the point with a Service Winner');
  });
  test('without a hitter, as before', () => {
    assert.equal(pointSentence({ side: 'home', kind: 'point', pd: { how: 'winner' } } as never, who, nameOf), 'Pair A wins the point with a Winner');
  });
  test('an unknown hitter id falls back to the side', () => {
    const blank: NameOf = () => 'Player';
    assert.equal(pointSentence({ side: 'home', kind: 'point', pd: { how: 'winner', by: 'zz' } } as never, who, blank), 'Pair A wins the point with a Winner');
  });
  test('the whole commentary reads the hitter', () => {
    const s = run(dbl(), [FS('home'), P('home'), D({ how: 'winner', by: 'h2' })]);
    const rows = tennisCommentary(s, { homeName: 'Pair A', awayName: 'Pair B', homeRoster: DOUBLES.players.home.map((p) => ({ id: p.id, name: p.name })), awayRoster: DOUBLES.players.away.map((p) => ({ id: p.id, name: p.name })) }).flatMap((b) => b.rows);
    assert.ok(rows.some((r) => r.kind === 'point' && r.text === 'Bina wins the point with a Winner'), JSON.stringify(rows));
  });
  test('IDs-only: a masked viewer sees the masked name; the log holds the id only', () => {
    const masked: NameOf = (id) => (id ? `Player ${id.slice(-1)}` : 'Player');
    assert.equal(pdText({ how: 'winner', by: 'h2' }, true, undefined, masked), 'Winner · Player 2');
    assert.equal(pointSentence({ side: 'home', kind: 'point', pd: { how: 'winner', by: 'h2' } } as never, who, masked), 'Player 2 wins the point with a Winner');
    const s = run(dbl(), [FS('home'), P('home'), D({ how: 'winner', by: 'h2', byName: 'Bina' })]);
    assert.deepEqual(lastPd(s), { how: 'winner', by: 'h2' });
  });
});

describe('TH14 / UI: the card asks "By:" in doubles', () => {
  const src = read('src/sports/tennis/PointCapture.tsx');
  test('WINNER_BY is on and the winner row shows for two named players', () => {
    assert.match(src, /const WINNER_BY = true;/);
    assert.match(src, /sel\?\.credit === 'winner' && pd && winnerRoster\.length >= 2/);
    assert.match(src, /active=\{pd\.by === p\.id\}/);
    assert.match(src, /hitterFor\(/);
    assert.match(src, /byHint\(/);
  });
  test('the card header names the hitter first', () => assert.match(src, /pd\?\.by \? whoName\(/));
});

// ------------------------------------------------------------ simulation --

let seed = 4242;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)];
type Resolve = (side: Side, p?: { playerId?: string; playerName?: string }) => string | undefined;
const WINNER_HOWS = new Set(['winner', 'ace', 'sw', 'stroke']);

/** The pre-change credit (a frozen copy of detailPlayerCredits, no hitter). */
function oldCredits(events: LiveEvent[], resolve: Resolve) {
  const out = new Map<string, Record<string, number>>();
  const add = (id: string | undefined, key: string) => { if (!id) return; const m = out.get(id) ?? {}; m[key] = (m[key] ?? 0) + 1; out.set(id, m); };
  for (const e of events) {
    if (!e.pd || !['point', 'ace', 'rally'].includes(e.kind ?? '')) continue;
    const W = winnerSide(e);
    if (W !== 'home' && W !== 'away') continue;
    const winnerId = resolve(W, e.kind === 'rally' ? undefined : { playerId: e.playerId, playerName: e.playerName });
    const loserId = resolve(opp(W), e.pd.err);
    for (const [who, key] of creditsOf('tennis', e.pd)) add(who === 'winner' ? winnerId : loserId, key);
  }
  return out;
}
const sorted = (m: Map<string, Record<string, number>>) => Object.fromEntries([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
const strip = (events: LiveEvent[]) => events.map((e) => (e.pd?.by ? { ...e, pd: (({ by: _b, ...rest }) => rest)(e.pd) } : e));

test('simulation: 600 random tennis matches, singles and doubles, hitters / skips / undos', () => {
  let points = 0, players = 0, hitters = 0, stored = 0, undos = 0, hostile = 0, doublesN = 0;
  for (let m = 0; m < 600; m++) {
    const doubles = rnd(2) === 1;
    if (doubles) doublesN++;
    const roster = { home: doubles ? [`h${m}a`, `h${m}b`] : [`h${m}a`], away: doubles ? [`a${m}a`, `a${m}b`] : [`a${m}a`] };
    players += roster.home.length + roster.away.length;
    const ctx = { players: { home: roster.home.map((id) => ({ id })), away: roster.away.map((id) => ({ id })) } };
    const s0 = run(init({ playersPerSide: doubles ? 2 : 1, pointDetail: true }), [FS(rnd(2) ? 'home' : 'away')]);
    const acts: ScoreAction[] = [];
    let s = s0;
    const n = 15 + rnd(50);
    for (let i = 0; i < n && !s.ended; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const tap = doubles && rnd(3) === 0 ? pick(roster[side]) : undefined;
      const a: ScoreAction[] = [rnd(12) === 0 ? { type: 'ACE', side, ...(tap ? { attribution: { playerId: tap, stat: 'aces' } } : {}) } : P(side, tap)];
      const roll = rnd(10);
      if (roll < 7) {
        const pd: Record<string, unknown> = { how: pick(['winner', 'winner', 'sw', 'ue', 'fe', 'rule', 'ace', 'bogus']) };
        if (rnd(2)) pd.wing = pick(['fh', 'bh']);
        if (rnd(2)) pd.shot = pick(['gs', 'volley', 'return', 'lob']);
        if (rnd(3) === 0) pd.err = { playerId: pick(roster[opp(side)]) };
        const r = rnd(8);
        if (r < 4) { pd.by = pick(roster[side]); hitters++; } // the card's chips: the winning side
        else if (r === 4) pd.by = pick(roster[opp(side)]); // forged: the wrong side
        else if (r === 5) { pd.by = pick([1, '', null, {}, 'x'.repeat(100), 'ghost']); hostile++; }
        a.push(D(pd));
        if (rnd(4) === 0) a.push(D({ ...pd, by: pick(roster[side]) })); // change the hitter
      } // else: skipped
      acts.push(...a);
      s = run(s, a);
      points++;
      if (rnd(10) === 0 && acts.length) { // undo the last action
        acts.pop();
        s = run(s0, acts);
        undos++;
      }
    }
    const events = s.events;
    // nothing invalid is stored
    for (const e of events) {
      const pd = e.pd as PointDetail | undefined;
      if (pd?.by === undefined) continue;
      stored++;
      assert.equal(typeof pd.by, 'string');
      assert.ok(pd.by.length > 0 && pd.by.length <= 64);
      assert.ok(WINNER_HOWS.has(pd.how));
    }
    // old logs replay identically: without the hitter, the old credit; the old function ignores it
    const ids = new Set([...roster.home, ...roster.away]);
    const sideOf = (id: string): Side => (roster.home.includes(id) ? 'home' : 'away');
    const resolve: Resolve = (sd, p) => (p?.playerId && ids.has(p.playerId) && sideOf(p.playerId) === sd ? p.playerId : roster[sd].length === 1 ? roster[sd][0] : undefined);
    assert.deepEqual(sorted(detailPlayerCredits('tennis', strip(events), resolve)), sorted(oldCredits(strip(events), resolve)));
    assert.deepEqual(sorted(oldCredits(events, resolve)), sorted(oldCredits(strip(events), resolve)));
    // careers: the stripped log totals equal the pre-change totals of an old log
    const oldLog = { ...s, events: strip(events) };
    const tNew = tennisTotals(s, ctx), tOld = tennisTotals(oldLog, ctx);
    for (const id of ids) {
      for (const k of ['ptsWon', 'ptsLost', 'aces', 'unforcedErrors', 'forcedErrors', 'ruleLosses']) assert.equal(tNew[id]?.stats[k], tOld[id]?.stats[k], `${id} ${k}`);
    }
    // team totals unchanged
    assert.deepEqual(tennisTally(tennisView(s)!), tennisTally(tennisView(oldLog)!));
    // per-player credits sum to the team's (plus the side-level credits nobody can take)
    const tally = tennisTally(tennisView(s)!);
    for (const sd of ['home', 'away'] as Side[]) {
      for (const [key, team] of [['winners', tally[sd].winners], ['serviceWinners', tally[sd].sw]] as const) {
        const sum = roster[sd].reduce((a, id) => a + (tNew[id]?.stats[key] ?? 0), 0);
        const how = key === 'winners' ? 'winner' : 'sw';
        const unresolved = events.filter((e) => e.pd?.how === how && winnerSide(e) === sd
          && !(e.pd.by && resolve(sd, { playerId: e.pd.by })) && !resolve(sd, { playerId: e.playerId })).length;
        assert.equal(sum + unresolved, team, `${sd} ${key}`);
        if (!doubles) assert.equal(unresolved, 0);
      }
    }
    // the oracle: the hitter on the winning side, else the old credit
    const oracle = oldCredits(events.map((e) => {
      const W = winnerSide(e) as Side | undefined;
      const by = e.pd?.by;
      return by && W && resolve(W, { playerId: by }) ? { ...e, playerId: by, playerName: undefined } as LiveEvent : e;
    }), resolve);
    assert.deepEqual(sorted(detailPlayerCredits('tennis', events, resolve)), sorted(oracle));
    // every described point reads; a timeline replay keeps every hitter
    for (const p of pointInputs(events)) if (p.pd && !p.pen) pointSentence(p, { winner: 'W', loser: 'L', server: 'S' });
    const again = replayPoints(reducer, s0, pointInputs(events));
    const pds = (es: LiveEvent[]) => es.filter((e) => e.pd).map((e) => e.pd);
    assert.deepEqual(pds(again.events), pds(events));
  }
  assert.ok(points >= 10000 && players >= 1500, JSON.stringify({ points, players }));
  assert.ok(stored > 1000 && hitters > 1000 && undos > 500 && hostile > 200 && doublesN > 200, JSON.stringify({ stored, hitters, undos, hostile, doublesN }));
});
