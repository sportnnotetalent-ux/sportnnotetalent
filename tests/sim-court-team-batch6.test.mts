/**
 * Court-team batch 6 — seeded simulation (quality mandate step 6;
 * docs/security/breaks/court-team-batch6.md). 600 matches with the new
 * captures (200 handball, 200 volleyball, 200 netball) checked against
 * invariants, plus 180 old-style matches (hostile / absent values included)
 * whose state, totals, stats, commentary and timeline match the fingerprint
 * recorded on the code before this batch (26510a4).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import * as hb from '../src/sports/handball/engine.ts';
import { handballTotals } from '../src/sports/handball/totals.ts';
import { handballDepthFigures, FIELD_SHOT_TYPES, KEEPER_SAVE_KEY } from '../src/sports/handball/depth.ts';
import { handballFeed } from '../src/sports/handball/feed.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { challengeAction, sanctionAction } from '../src/sports/volleyball/actions.ts';
import { volleyballMatchStats } from '../src/sports/volleyball/matchStats.ts';
import { volleyballCommentary } from '../src/sports/volleyball/commentary.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import * as nb from '../src/sports/netball/engine.ts';
import { netballPanel } from '../src/sports/netball/panel.ts';
import { netballTotals } from '../src/sports/netball/totals.ts';
import { netballFeed } from '../src/sports/netball/commentary.ts';
import { oldFingerprint, makeRnd, pick, pid, other, SIDES, type Side } from './courtTeamBatch6Gen.mts';

const NAMES = { home: 'Home', away: 'Away' };
const nameOf = (id?: string | null, n?: string | null) => (id ? id.toUpperCase() : n ?? '');
const strip = <T extends { events: unknown[]; seq: number }>(s: T) => ({ ...s, events: undefined, seq: undefined });

describe('sim · old matches replay identically (R1, HN1, HC2, VC2, NT2)', () => {
  test('180 old-style logs: the same fingerprint as the code before this batch', () => {
    assert.deepEqual(oldFingerprint(), {
      vb: 'a581606437b8f12fb027f6c2e540014a9ab923ff1c410fa0697e7800a26d9b50',
      nb: '0f432372fb1223f7455289e2af2b2ccd7e000742d1bb97f9540dceb05d7e2726',
      hb: 'fcc56601a15d15339d2bc111d527dae0e5cf0af855fdfaec0b4b59ef8e8039e3',
    });
  });
});

/* -------------------------------- handball -------------------------------- */

function hbNewLog(seed: number): ScoreAction[] {
  const rnd = makeRnd(seed);
  const acts: ScoreAction[] = [];
  let u = 0;
  for (const sd of SIDES) acts.push({ type: 'XI', payload: { team: sd, gk: { id: pid(sd, 1) }, players: [1, 2, 3, 4, 5, 6, 7].map((k) => ({ id: pid(sd, k) })) } });
  const n = 40 + rnd(80);
  for (let i = 0; i < n; i++) {
    const at = (a: ScoreAction): ScoreAction => ({ ...a, payload: { uid: `h${++u}`, sec: 15 * (i + 1), period: i < n / 2 ? 1 : 2, ...a.payload } });
    const sd = pick(rnd, SIDES);
    const ks = other(sd);
    const shotType = pick(rnd, ['sixM', 'nineM', 'wing', 'breakthrough', 'fastBreak', 'unknown', 'unknown']);
    const cr = (e: Parameters<typeof hb.eventCredits>[0]) => {
      const c = hb.eventCredits(e);
      return { attribution: hb.creditAttribution(c.first), attribution2: hb.creditAttribution(c.second) };
    };
    const pos = shotType === 'unknown' ? { unsure: true } : { shotType: shotType as hb.ShotType };
    const p = pid(sd, 2 + rnd(6));
    const r = rnd(12);
    if (r < 4) acts.push(at({ type: 'GOAL', side: sd, payload: { shotType }, ...cr({ type: 'goal', ...pos, playerId: p }) }));
    else if (r < 7) {
      const id = `m${i}`;
      acts.push(at({ type: 'MISS', side: sd, payload: { shotType, result: 'saved', uid: id }, ...cr({ type: 'miss', ...pos, playerId: p }) }));
      acts.push(at({ type: 'SAVE', side: ks, payload: { ref: id, shotType }, ...cr({ type: 'save', ...pos, playerId: pid(ks, 1) }) }));
    } else if (r < 8) acts.push(at({ type: 'MISS', side: sd, payload: { shotType, result: 'missed' }, ...cr({ type: 'miss', ...pos, playerId: p }) }));
    else if (r < 9) acts.push(at({ type: 'PASSIVE', side: sd }));
    else if (r < 11) {
      // a 7 m: won by (maybe), caused by (maybe), then the throw
      if (rnd(2)) acts.push(at({ type: 'DRAWN', side: sd, ...cr({ type: 'drawn', playerId: p }) }));
      if (rnd(2)) acts.push(at({ type: 'CAUSED', side: ks, ...cr({ type: 'caused', playerId: pid(ks, 2 + rnd(6)) }) }));
      acts.push(at({ type: 'GOAL', side: sd, payload: { shotType: 'sevenM' }, ...cr({ type: 'goal', shotType: 'sevenM', playerId: p }) }));
    } else acts.push(at(pick(rnd, [{ type: 'PASSIVE' }, { type: 'CAUSED' }, { type: 'GOAL', side: sd, payload: { shotType: 'UNKNOWN' } }] as ScoreAction[])));
  }
  return acts;
}

describe('sim · handball (200 matches)', () => {
  test('Not sure, passive-play and caused-by invariants', () => {
    let unsure = 0, passive = 0, caused = 0;
    for (let i = 1; i <= 200; i++) {
      const acts = hbNewLog(7000 + i);
      const cfg = { trackSevenMDrawn: true };
      const s = acts.reduce(hb.reducer, hb.init(cfg));
      // HP1 / HC1: the new markers never move the score
      const bare = acts.filter((a) => a.type !== 'PASSIVE' && a.type !== 'CAUSED').reduce(hb.reducer, hb.init(cfg));
      assert.deepEqual([s.home, s.away, s.clock], [bare.home, bare.away, bare.clock], `seed ${i}: score`);
      const t = handballTotals(s);
      const tb = handballTotals(bare);
      for (const [id, l] of Object.entries(tb)) {
        const { sevenMCaused: _x, ...rest } = t[id]?.stats ?? {};
        assert.deepEqual(rest, l.stats, `seed ${i}: ${id} line unchanged but sevenMCaused`);
      }
      for (const sd of SIDES) {
        const f = hb.teamFigures(s, sd);
        // HN2: the position rows plus "not recorded" add up
        assert.equal(f.goals, hb.SHOT_TYPES.reduce((a, k) => a + f.byType[k].goals, 0) + (f.unsureGoals ?? 0), `seed ${i}: goals`);
        assert.equal(f.shots, hb.SHOT_TYPES.reduce((a, k) => a + f.byType[k].shots, 0) + (f.unsureShots ?? 0), `seed ${i}: shots`);
        assert.equal(f.goals, s[sd]);
        assert.equal(f.technicalFaults, 0, 'HP1: passive warnings are no technical fault');
        const d = handballDepthFigures(s, sd);
        const nu = s.events.filter((e) => e.side === sd && e.unsure && e.type === 'goal').length;
        if (s.events.some((e) => e.unsure && (e.type === 'goal' || e.type === 'miss'))) assert.equal(d.unsureGoals, nu);
        else assert.equal(d.unsureGoals, undefined);
        const np = s.events.filter((e) => e.side === sd && e.type === 'passive').length;
        assert.equal(d.passiveWarnings, s.events.some((e) => e.type === 'passive') ? np : undefined);
        // HN3: a keeper's saves = position saves + 7 m saves + "Not sure" saves
        const gk = t[pid(sd, 1)]?.stats;
        if (gk) {
          const posSaves = FIELD_SHOT_TYPES.reduce((a, k) => a + (gk[KEEPER_SAVE_KEY[k]] ?? 0), 0);
          const us = s.events.filter((e) => e.type === 'save' && e.side === sd && e.unsure).length;
          assert.equal(gk.saves ?? 0, posSaves + (gk.sevenMSaves ?? 0) + us, `seed ${i}: keeper saves`);
        }
      }
      // HC1: caused-by credits the defender's side only
      const ce = s.events.filter((e) => e.type === 'caused');
      for (const e of ce) assert.equal(t[e.playerId!].side, e.side);
      const sum = Object.values(t).reduce((a, l) => a + (l.stats.sevenMCaused ?? 0), 0);
      assert.equal(sum, ce.length);
      if (!ce.length) for (const l of Object.values(t)) assert.equal('sevenMCaused' in l.stats, false, 'HC2');
      // HN4: no "Not sure" attempt reads as 9 m
      const feed = handballFeed(s, NAMES, nameOf);
      for (const e of s.events) {
        if (!e.unsure) continue;
        const row = feed.find((x) => x.id === `b${e.id}`);
        if (row) assert.doesNotMatch(row.text, /9 m|9 metres/);
      }
      // hostile markers (no side) and an upper-case UNKNOWN never become new events
      assert.ok(s.events.every((e) => (e.type !== 'passive' && e.type !== 'caused') || e.side));
      unsure += s.events.filter((e) => e.unsure).length;
      passive += s.events.filter((e) => e.type === 'passive').length;
      caused += ce.length;
    }
    assert.ok(unsure > 500 && passive > 100 && caused > 100, `coverage ${unsure} ${passive} ${caused}`);
  });
});

/* ------------------------------- volleyball ------------------------------- */

function vbNewLog(seed: number): ScoreAction[] {
  const rnd = makeRnd(seed);
  const acts: ScoreAction[] = [];
  for (let i = 0; i < 200; i++) {
    const sd = pick(rnd, SIDES);
    const r = rnd(14);
    let a: ScoreAction;
    if (r < 8) a = vb.outcomeAction(pick(rnd, ['attack', 'block', 'ace', 'opperror', 'serveerror'] as const), sd, { id: pid(sd, 1 + rnd(6)) });
    else if (r < 11) a = challengeAction(sd, !!rnd(2), pick(rnd, [null, 'inout', 'touch', 'net', 'antenna', 'line', 'zzz']));
    else if (r < 12) a = sanctionAction(sd, pick(rnd, ['warning', 'penalty', 'delayWarning'] as const));
    else if (r < 13) a = pick(rnd, [{ type: 'CHALLENGE', side: sd, payload: { upheld: 'no' } }, { type: 'CHALLENGE', payload: { upheld: true } }] as ScoreAction[]);
    else { acts.push({ type: '__EDIT__' }); continue; }
    acts.push(vb.stampAction(a, 1_700_000_000_000 + i * 15_000));
  }
  return acts;
}

describe('sim · volleyball (200 matches)', () => {
  test('challenge invariants', () => {
    let reviews = 0, edits = 0;
    for (let i = 1; i <= 200; i++) {
      const raw = vbNewLog(8000 + i);
      let s = vb.init({});
      let bare = vb.init({});
      for (const a of raw) {
        if (a.type === '__EDIT__') {
          // VC2: a correction that keeps every point keeps every challenge where it was
          const before = s.events.filter((e) => e.kind === 'review');
          s = vb.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
          bare = vb.reducer(bare, { type: 'EDIT_LOG', payload: { points: pointInputs(bare.events) } });
          assert.deepEqual(s.events.filter((e) => e.kind === 'review').map((e) => [e.side, e.set, e.rev, e.chw]), before.map((e) => [e.side, e.set, e.rev, e.chw]), `seed ${i}: edit`);
          edits++;
          continue;
        }
        s = vb.reducer(s, a);
        if (a.type !== 'CHALLENGE') bare = vb.reducer(bare, a);
      }
      // VC1: challenges never move the score
      assert.deepEqual([s.current, s.setsWon, s.sets, s.ended], [bare.current, bare.setsWon, bare.sets, bare.ended], `seed ${i}: score`);
      const rv = s.events.filter((e) => e.kind === 'review');
      // VC4: at most 2 unsuccessful per side per set
      for (const sd of SIDES) for (let set = 1; set <= s.sets.length + 1; set++) {
        assert.ok(rv.filter((e) => e.side === sd && e.set === set && e.rev === 'rejected').length <= 2, `seed ${i}: limit`);
      }
      // VC3: what is one of the list, or absent
      for (const e of rv) assert.ok(e.chw === undefined || (vb.VB_CHALLENGE_WHAT as readonly string[]).includes(e.chw));
      // VC5: the stats rows count every challenge once
      const flow = volleyballMatchStats(s).cats.find((c) => c.id === 'flow')!;
      const row = flow.rows.find((r) => r.key === 'challenges');
      if (rv.length) {
        assert.deepEqual([row?.h, row?.a], SIDES.map((sd) => rv.filter((e) => e.side === sd).length));
        const up = flow.rows.find((r) => r.key === 'challengesUpheld');
        assert.deepEqual([up?.h, up?.a], SIDES.map((sd) => rv.filter((e) => e.side === sd && e.rev === 'upheld').length));
      } else assert.equal(row, undefined);
      // VC6: one sentence per challenge
      const lines = volleyballCommentary(s, { ...NAMES, nameOf } as never).flatMap((g) => g.entries).filter((e) => /^Video challenge by/.test(e.text));
      assert.equal(lines.length, rv.length, `seed ${i}: commentary`);
      reviews += rv.length;
    }
    assert.ok(reviews > 1000 && edits > 1000, `coverage ${reviews} ${edits}`);
  });
});

/* -------------------------------- netball --------------------------------- */

function nbNewLog(seed: number): ScoreAction[] {
  const rnd = makeRnd(seed);
  const acts: ScoreAction[] = [{ type: 'FIRST_CENTRE', side: pick(rnd, SIDES) }];
  let u = 0;
  const n = 40 + rnd(60);
  for (let i = 0; i < n; i++) {
    const at = (a: ScoreAction): ScoreAction => ({ ...a, payload: { uid: `n${++u}`, sec: 10 * (i + 1), period: 1 + Math.floor((4 * i) / n), ...a.payload } });
    const sd = pick(rnd, SIDES);
    const r = rnd(10);
    if (r < 4) acts.push(at({ type: 'GOAL', side: sd, payload: { pos: pick(rnd, ['GS', 'GA']) }, attribution: { playerId: pid(sd, 1), stat: 'goals', by: 1 } }));
    else if (r < 6) acts.push(at({ type: 'STAT', side: sd, payload: { kind: pick(rnd, ['intercept', 'deflection', 'turnover', 'rebound']) } }));
    else if (r < 8) acts.push(at({ type: 'TOSS_UP', side: sd }));
    else if (r < 9) acts.push(at({ type: 'TOSS_UP', payload: {} }));
    else acts.push(at({ type: 'MISS', side: sd, payload: { pos: 'GS' } }));
  }
  return acts;
}

describe('sim · netball (200 matches)', () => {
  test('toss-up invariants', () => {
    let tossUps = 0;
    for (let i = 1; i <= 200; i++) {
      const acts = nbNewLog(9000 + i);
      const s = acts.reduce(nb.reducer, nb.init({}));
      const bare = acts.filter((a) => a.type !== 'TOSS_UP').reduce(nb.reducer, nb.init({}));
      // NT1: no effect on score, centre passes, clock, totals
      assert.deepEqual(strip(s), strip(bare), `seed ${i}: state`);
      assert.deepEqual(nb.centreInfo(s), nb.centreInfo(bare));
      assert.deepEqual(netballTotals(s), netballTotals(bare));
      const tu = s.events.filter((e) => e.type === 'tossup');
      assert.ok(tu.every((e) => e.side), 'NT2: a side-less toss-up is ignored');
      const rows = netballPanel(s).categories.flatMap((c) => c.rows);
      const row = rows.find((r) => r.key === 'tossUps');
      if (tu.length) assert.deepEqual([row?.h, row?.a], SIDES.map((sd) => tu.filter((e) => e.side === sd).length));
      else assert.equal(row, undefined);
      // the rest of the panel is unchanged
      const rest = (x: typeof rows) => x.filter((r) => r.key !== 'tossUps');
      assert.deepEqual(rest(rows), rest(netballPanel(bare).categories.flatMap((c) => c.rows)));
      const lines = netballFeed(s, NAMES, nameOf).flatMap((g) => g.rows).filter((r) => /^Toss-up won by/.test(r.text));
      assert.equal(lines.length, tu.length);
      tossUps += tu.length;
    }
    assert.ok(tossUps > 1000, `coverage ${tossUps}`);
  });
});
