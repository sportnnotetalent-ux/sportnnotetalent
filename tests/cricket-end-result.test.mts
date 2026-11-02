/**
 * Expert audit C1 / fix 1 (docs/security/breaks/cricket-end-result.md): ending a
 * match with the chase unfinished asks how it ended — `END { v: 2, how }` =
 * No result · Draw (timed game) · Award to a side. Legacy `END` (no `v`)
 * replays exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, outcome, endResult, chaseAlive, drawWord, type CricketState } from '../src/sports/cricket/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { cricketTickerDetail } from '../src/sports/cricket/ticker.ts';
import { resultText } from '../src/sports/cricket/shareCard.ts';
import { cricketMatchRecords } from '../src/sports/cricket/records.ts';
import { sideResults } from '../src/data/appearances.ts';
import { teamStandings } from '../src/data/standings.ts';
import { stateResult, savedWinner, manualResultLine } from '../src/core/matchResult.ts';
import type { Match } from '../src/core/types.ts';

const ball = (s: CricketState, runs: number): CricketState =>
  reducer(s, { type: 'RUNS', side: s.battingSide, payload: { runs, strikerId: s.strikerId, bowlerId: s.bowlerId } } as ScoreAction);
function crease(s: CricketState, a: string, b: string, bw: string): CricketState {
  s = reducer(s, { type: 'SET_STRIKER', payload: { id: a, v: 2 } });
  s = reducer(s, { type: 'SET_NONSTRIKER', payload: { id: b, v: 2 } });
  return reducer(s, { type: 'SET_BOWLER', payload: { id: bw, v: 2 } });
}
/** Home bats first (scores `first`), away chases and has scored `chase` — alive. */
export function chasing(overs = 20, first = 6, chase = 2): CricketState {
  let s = crease(init({ overs, playersPerSide: 11 }), 'h1', 'h2', 'a9');
  for (let i = 0; i < first; i++) s = ball(s, 1);
  s = reducer(s, { type: 'END_INNINGS' });
  s = crease(s, 'a1', 'a2', 'h9');
  for (let i = 0; i < chase; i++) s = ball(s, 1);
  return s;
}
const end = (s: CricketState, p?: Record<string, unknown>) => reducer(s, { type: 'END', ...(p ? { payload: p } : {}) } as ScoreAction);

describe('E1 — an unfinished chase no longer goes to the defending side', () => {
  test('the chase is alive', () => assert.equal(chaseAlive(chasing()), true));
  test('No result', () => {
    const s = end(chasing(), { v: 2, how: 'nr' });
    assert.equal(s.ended, true);
    assert.deepEqual(outcome(s), { winner: null, text: 'No result' });
    assert.deepEqual(endResult(s), { kind: 'no_result' });
  });
  test('Award to a side, with and without a reason', () => {
    assert.deepEqual(outcome(end(chasing(), { v: 2, how: 'award', side: 'away' })), { winner: 'away', text: 'Awarded the match' });
    const s = end(chasing(), { v: 2, how: 'award', side: 'home', reason: '  Refused to play  ' });
    assert.deepEqual(outcome(s), { winner: 'home', text: 'Awarded the match — Refused to play' });
    assert.deepEqual(endResult(s), { kind: 'awarded', winner: 'home', reason: 'Refused to play' });
  });
});

describe('E2 / E3 — a timed game can be drawn, and says Draw', () => {
  test('Draw in a Test', () => {
    const s = end(chasing(999), { v: 2, how: 'draw' });
    assert.deepEqual(outcome(s), { winner: null, text: 'Match drawn' });
    assert.deepEqual(endResult(s), { kind: 'draw' });
  });
  test('the hand-closed level result is "Draw" in a timed game, "Tie" in limited overs', () => {
    assert.equal(drawWord(init({ overs: 999 })), 'Draw');
    assert.equal(drawWord(init({ overs: 100 })), 'Draw');
    assert.equal(drawWord(init({ overs: 20 })), 'Tie');
  });
});

describe('E4 — legacy END replays exactly as before', () => {
  test('mid-chase bare END still reads the old margin, and the state only gains ended', () => {
    const before = chasing();
    const s = end(before);
    assert.deepEqual(s, { ...before, ended: true });
    assert.deepEqual(outcome(s), { winner: 'home', text: 'Won by 4 runs' });
    assert.equal(endResult(s), undefined);
  });
});

describe('E5 — bad payloads change nothing', () => {
  const s0 = chasing();
  for (const p of [
    { v: 2 }, { v: 2, how: 'win' }, { v: 2, how: 'award' }, { v: 2, how: 'award', side: 'both' },
    { v: 2, how: 'draw' }, // a limited-overs game can't be drawn
    { v: 2, how: 'nr', reason: 42 }, { v: 3, how: 'nr' },
  ]) {
    test(JSON.stringify(p), () => {
      const s = end(s0, p);
      if (p.how === 'nr' && p.v === 2) { assert.deepEqual(endResult(s), { kind: 'no_result' }); return; } // a non-string reason is dropped
      assert.equal(s, s0);
    });
  }
  test('a long reason is cut to 120 characters', () => {
    const s = end(s0, { v: 2, how: 'award', side: 'away', reason: 'x'.repeat(500) });
    assert.equal(endResult(s)?.reason?.length, 120);
  });
});

describe('E6 — never replaces a decided result', () => {
  test('after the target is reached', () => {
    let s = chasing(20, 2, 0);
    for (let i = 0; i < 3; i++) s = ball(s, 1);
    assert.equal(s.ended, true);
    assert.equal(chaseAlive(s), false);
    assert.equal(end(s, { v: 2, how: 'nr' }), s);
  });
  test('a pending tie / a Super Over', () => {
    const tie = { ...chasing(), pendingTie: true } as CricketState;
    assert.equal(end(tie, { v: 2, how: 'nr' }), tie);
    const so = { ...chasing(), superOver: { round: 1, battingFirst: 'home', history: [], state: { ...init({ overs: 1 }), isSuperOver: true } } } as CricketState;
    assert.deepEqual(end(so, { v: 2, how: 'nr' }), so);
  });
  test('innings 1 is not a chase', () => {
    assert.equal(chaseAlive(crease(init({ overs: 20 }), 'h1', 'h2', 'a9')), false);
  });
});

const team = (id: string) => ({ id, name: id.toUpperCase() } as Match['homeTeam']);
const asMatch = (id: string, s: CricketState): Match => {
  const r = endResult(s);
  const res = { winner: outcome(s).winner ?? ('draw' as const), home: s.scores.home.runs, away: s.scores.away.runs, ...r };
  const result = stateResult(res);
  return {
    id, sport: 'cricket', status: 'completed', startsAt: '', homeTeam: team('h'), awayTeam: team('a'), state: s,
    score: { home: res.home, away: res.away },
    winner: result ? (result.winner ?? (result.kind === 'draw' ? 'draw' : undefined)) : res.winner,
    ...(result ? { result } : {}),
  } as Match;
};

describe('E7 / E8 / E12 — standings and the saved winner', () => {
  test('no result: NR points, played, nothing to for / against; saved winner empty', () => {
    const s = end(chasing(), { v: 2, how: 'nr' });
    const m = asMatch('m1', s);
    assert.equal(m.result?.kind, 'no_result');
    assert.equal(savedWinner({ winner: 'draw', kind: 'no_result' }), null);
    const rows = teamStandings([m], 'cricket');
    for (const r of rows) { assert.equal(r.played, 1); assert.equal(r.nr, 1); assert.equal(r.points, 1); assert.equal(r.for, 0); assert.equal(r.drawn, 0); }
  });
  test('draw: draw points, runs and overs out of NRR', () => {
    const rows = teamStandings([asMatch('m1', end(chasing(999), { v: 2, how: 'draw' }))], 'cricket');
    for (const r of rows) { assert.equal(r.drawn, 1); assert.equal(r.points, 1); assert.equal(r.for, 0); assert.equal(r.forUnits, 0); }
  });
  test('award: a win for the side named', () => {
    const rows = teamStandings([asMatch('m1', end(chasing(), { v: 2, how: 'award', side: 'away' }))], 'cricket');
    const a = rows.find((r) => r.teamId === 'a')!, h = rows.find((r) => r.teamId === 'h')!;
    assert.equal(a.won, 1); assert.equal(h.lost, 1); assert.equal(a.points, 2);
    assert.equal(savedWinner({ winner: 'away', kind: 'awarded' }), 'away');
  });
  test('a plain result keeps its winner; no state kind → no synthesized result', () => {
    assert.equal(stateResult({ winner: 'home', home: 1, away: 0 }), undefined);
    assert.equal(savedWinner({ winner: 'draw', home: 1, away: 1 }), 'draw');
    assert.equal(savedWinner(null), null);
  });
});

describe('E9 — players W / D / L / T / NR', () => {
  const sr = (s: CricketState) => { const m = asMatch('x', s); return sideResults({ sport: 'cricket', status: 'completed', winner: m.winner ?? null, result: m.result ?? null }); };
  test('draw → D, no result → NR, award → W / L', () => {
    assert.deepEqual(sr(end(chasing(999), { v: 2, how: 'draw' })), { home: 'D', away: 'D' });
    assert.deepEqual(sr(end(chasing(), { v: 2, how: 'nr' })), { home: 'NR', away: 'NR' });
    assert.deepEqual(sr(end(chasing(), { v: 2, how: 'award', side: 'home' })), { home: 'W', away: 'L' });
  });
});

describe('E10 — the result text everywhere', () => {
  const names = { home: 'Lions', away: 'Tigers' };
  test('ticker, share, records, the hand-closed line', () => {
    const nr = end(chasing(), { v: 2, how: 'nr' });
    const aw = end(chasing(), { v: 2, how: 'award', side: 'away', reason: 'Bad light' });
    assert.equal(cricketTickerDetail(nr, names).status, 'No result');
    assert.equal(cricketTickerDetail(aw, names).status, 'Tigers awarded the match — Bad light');
    assert.equal(resultText(nr, { homeName: 'Lions', awayName: 'Tigers' }), '🤝 No result');
    assert.equal(resultText(aw, { homeName: 'Lions', awayName: 'Tigers' }), '🏆 Tigers awarded the match — Bad light');
    for (const s of [nr, aw, end(chasing(999), { v: 2, how: 'draw' })]) {
      const recs = cricketMatchRecords(s)?.items ?? [];
      assert.ok(!recs.some((i) => i.type === 'marginRuns' || i.type === 'marginWkts'));
    }
    assert.equal(manualResultLine(stateResult({ winner: 'away', home: 6, away: 2, kind: 'awarded', reason: 'Bad light' })!, 'Lions', 'Tigers'), 'Tigers awarded the match — Bad light');
  });
});

describe('E11 — undo reopens the chase', () => {
  test('replaying the log without the END: live, no result', () => {
    const s = chasing();
    const after = end(s, { v: 2, how: 'nr' });
    assert.equal(after.ended, true);
    assert.equal(s.ended, false);
    assert.equal(endResult(s), undefined);
    assert.equal(chaseAlive(s), true);
  });
});
