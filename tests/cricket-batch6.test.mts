/**
 * Cricket batch 6 (docs/security/breaks/cricket-batch6.md, the P2 rows of the
 * expert audit docs/sport-expert/cricket.md): free-hit policing in the reducer
 * (R6), last man stands (R8), the powerplay after a rain cut and the ODI P2 / P3
 * bands (C11, R7), the bouncer count without the pitch map (C9), "c sub (X)"
 * from the format's substitutes (C6), ball type in the career split (C7), and
 * the Law polish of fix 13 (Run out — backing up, one short, beamer count).
 * Old logs replay byte-identically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  init, reducer, noBatterLeft, lastManAlone, allOutAt, canFallOnFreeHit, DISMISSAL_NAME, WICKET_LABEL, composeDismissal,
  type CricketState,
} from '../src/sports/cricket/engine.ts';
import {
  rulesFromConfig, rulesToConfig, patchRules, describeRulesChange, rulesChip, isStandard, STANDARD_RULES, CRICKET_LIVE_SETTINGS, LOCAL_RULE_FIELDS,
} from '../src/sports/cricket/rules.ts';
import { powerplayBalls, powerplayBands, powerplayNow, phasePlan, phasePPBalls } from '../src/sports/cricket/phases.ts';
import { bouncerStatus, bouncerChipOnly, beamerCount, beamerWarning } from '../src/sports/cricket/bouncers.ts';
import { deliveryOrdinals, recStamp } from '../src/sports/cricket/detail.ts';
import { cricketCommentary, type ComNote } from '../src/sports/cricket/commentary.ts';
import { teamBatting } from '../src/sports/cricket/matchStats.ts';
import { replayCricket, editBall, applyOps, editDropsBall } from '../src/sports/cricket/editOvers.ts';
import { cricketVoice } from '../src/sports/voiceParsers.ts';
import { matchCaptures } from '../src/sports/matchRules.ts';
import { lineContext } from '../src/data/lineContext.ts';
import { cricketMatchRecords } from '../src/sports/cricket/records.ts';
import { CRICKET_LEGACY_LOGS } from './cricketLegacyLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { NameOf } from '../src/core/playerNames.ts';

const UP: NameOf = (id, legacy) => (id ? id.toUpperCase() : legacy ?? 'Player');
const NAMES = { home: 'Home XI', away: 'Away XI' };
const fp = (s: unknown) => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 24);

function live(cfg: Record<string, unknown> = {}) {
  const log: ScoreAction[] = [];
  let s = [
    { type: 'SET_CAPTAIN', payload: { side: 'home', id: 'h1' } },
    { type: 'SET_CAPTAIN', payload: { side: 'away', id: 'a1' } },
    { type: 'SET_KEEPER', payload: { side: 'home', id: 'h2' } },
    { type: 'SET_KEEPER', payload: { side: 'away', id: 'a2' } },
  ].reduce(reducer, init({ overs: 20, ...cfg }));
  const api = {
    get s() { return s; },
    log,
    do(a: ScoreAction) { const prev = s; log.push(a); s = reducer(s, a); return { prev, next: s }; },
    crease(st: string, ns: string, bw: string) {
      api.do({ type: 'SET_STRIKER', payload: { id: st, v: 2 } });
      api.do({ type: 'SET_NONSTRIKER', payload: { id: ns, v: 2 } });
      api.do({ type: 'SET_BOWLER', payload: { id: bw, v: 2 } });
    },
    bowler(id: string) { api.do({ type: 'SET_BOWLER', payload: { id, v: 2 } }); },
    ball(type: string, payload: Record<string, unknown> = {}) {
      return api.do({ type, side: s.battingSide, payload: { strikerId: s.strikerId, bowlerId: s.bowlerId, ...payload } });
    },
    runs(...rs: number[]) { for (const r of rs) api.ball('RUNS', { runs: r, ...(r === 4 || r === 6 ? { boundary: true } : {}) }); },
    detail(patch: Record<string, unknown>) {
      const l = s.log ?? [];
      const ords = deliveryOrdinals(l);
      let i = l.length - 1;
      while (i >= 0 && !ords[i]) i--;
      const r = l[i];
      return api.do({ type: 'BALL_DETAIL', payload: { v: 2, inn: r.inn, side: r.side, d: ords[i], at: recStamp(r, s.ballsPerOver), batterId: r.strikerId, bowlerId: r.bowlerId, ...patch } });
    },
  };
  return api;
}
const notes = (s: CricketState): string[] => {
  const c = cricketCommentary(s, NAMES, UP);
  const out: string[] = [];
  for (const inn of c.innings) {
    for (const n of inn.pre) out.push(n.text);
    for (const o of inn.overs) for (const it of o.items) out.push(it.kind === 'note' ? (it as ComNote).text : it.text);
  }
  return out;
};

/* ───────────────────────── R6 — free-hit policing ───────────────────────── */

describe('R6 — free hit policed in the reducer (B6-1, B6-2, B6-3)', () => {
  const onFreeHit = () => {
    const m = live();
    m.crease('h1', 'h2', 'a9');
    m.ball('EXTRA', { kind: 'No ball' });
    assert.equal(m.s.freeHit, true);
    return m;
  };

  test('a v:2 bowled / caught / lbw / stumped / hit wicket on a free hit is refused', () => {
    for (const kind of ['bowled', 'caught', 'lbw', 'stumped', 'hitwicket']) {
      const m = onFreeHit();
      const { prev, next } = m.ball('WICKET', { kind, fielderId: 'a7', newBatId: 'h3', v: 2 });
      assert.equal(next, prev, `${kind} refused`);
    }
  });

  test('a run out / hit twice / obstructing on a free hit still counts (v:2)', () => {
    for (const kind of ['runout', 'hittwice', 'obstruct']) {
      const m = onFreeHit();
      m.ball('WICKET', { kind, fielderId: 'a7', newBatId: 'h3', v: 2 });
      assert.equal(m.s.scores.home.wickets, 1, kind);
      assert.equal(m.s.freeHit, false, 'the free hit is used up');
    }
    assert.equal(canFallOnFreeHit('runout'), true);
    assert.equal(canFallOnFreeHit('caught'), false);
    assert.equal(canFallOnFreeHit('retired'), true);
  });

  test('a stumped / hit wicket off a wide that is itself a free hit is refused (v:2)', () => {
    const m = onFreeHit();
    const { prev, next } = m.ball('EXTRA', { kind: 'Wide', wicket: 'stumped', newBatId: 'h3', v: 2 });
    assert.equal(next, prev);
    m.ball('EXTRA', { kind: 'Wide', wicket: 'runout', fielderId: 'a7', newBatId: 'h3', v: 2 });
    assert.equal(m.s.scores.home.wickets, 1);
  });

  test('legacy (no v) wickets on a free hit still count — old logs replay as before', () => {
    const m = onFreeHit();
    m.ball('WICKET', { kind: 'caught', fielderId: 'a7', newBatId: 'h3' });
    assert.equal(m.s.scores.home.wickets, 1);
    for (const L of CRICKET_LEGACY_LOGS) assert.equal(fp(L.actions.reduce(reducer, init(L.config))), L.fp, L.name);
  });

  test('voice "caught" sends v:2, so it is refused on a free hit', () => {
    const m = onFreeHit();
    const acts = cricketVoice('caught', { state: m.s } as never)!;
    assert.equal(acts[0].payload?.v, 2);
    const { prev, next } = m.do(acts[0]);
    assert.equal(next, prev);
    const m2 = live(); m2.crease('h1', 'h2', 'a9');
    m2.do(cricketVoice('caught', { state: m2.s } as never)![0]);
    assert.equal(m2.s.scores.home.wickets, 1, 'not a free hit: counts');
  });

  test('the over editor refuses an edit that puts a later v:2 wicket on a free hit', () => {
    const m = live({ overs: 2 });
    m.crease('h1', 'h2', 'a9');
    m.ball('EXTRA', { kind: 'Wide' });
    m.ball('WICKET', { kind: 'bowled', newBatId: 'h3', v: 2 });
    m.runs(1, 1);
    const recs: MatchEventRecord[] = m.log.map((a, i) => ({ seq: i + 1, type: a.type, payload: a.payload, side: a.side } as MatchEventRecord));
    const wideRec = recs.find((r) => r.type === 'EXTRA')!;
    const edited = editBall(wideRec, { extraKind: 'noball' });
    assert.ok(!('error' in edited));
    const ops = [{ op: 'replace' as const, seq: wideRec.seq, action: edited as ScoreAction }];
    const msg = editDropsBall(recs, ops, { overs: 2 });
    assert.ok(msg && /free hit/i.test(msg), String(msg));
    assert.equal(replayCricket(applyOps(recs, ops), { overs: 2 }).scores.home.wickets, 0, 'what the guard prevents');
    // a harmless edit passes
    const ok = editBall(wideRec, { extraRuns: 1 });
    assert.equal(editDropsBall(recs, [{ op: 'replace', seq: wideRec.seq, action: ok as ScoreAction }], { overs: 2 }), null);
  });
});

/* ───────────────────────── R8 — last man stands ───────────────────────── */

describe('R8 — last man stands (B6-4 … B6-7)', () => {
  /** 3-a-side: 2 wickets normally all out. */
  const box = (lms = true) => {
    const m = live({ overs: 5, playersPerSide: 3, ...(lms ? { lastManStands: true } : {}) });
    m.crease('h1', 'h2', 'a9');
    return m;
  };

  test('rule plumbing: off by default, present only when on, junk = off', () => {
    assert.equal('lastManStands' in rulesFromConfig({}), false);
    assert.equal(rulesFromConfig({ lastManStands: true }).lastManStands, true);
    assert.equal(rulesFromConfig({ lastManStands: 1 }).lastManStands, true);
    for (const junk of ['yes', 2, {}, [], null, 'false', 0]) assert.equal('lastManStands' in rulesFromConfig({ lastManStands: junk }), false, String(junk));
    assert.equal(rulesToConfig(rulesFromConfig({ lastManStands: true })).lastManStands, true);
    assert.equal(isStandard(rulesFromConfig({ lastManStands: true })), false);
    assert.match(rulesChip(rulesFromConfig({ lastManStands: true })), /last man stands/);
    assert.match(describeRulesChange(STANDARD_RULES, patchRules(STANDARD_RULES, { lastManStands: true })), /Last man stands/);
    assert.deepEqual(rulesFromConfig({}), STANDARD_RULES);
  });

  test('Info: a rule line (not a stats capture), "Off" by default', () => {
    const f = LOCAL_RULE_FIELDS.find((x) => x.key === 'lastManStands');
    assert.ok(f);
    assert.notEqual(f!.type, 'toggle');
    const off = matchCaptures(CRICKET_LIVE_SETTINGS as never, init({ overs: 5 }));
    assert.equal(off.rules.find((r) => r.key === 'lastManStands')?.value, 'Off');
    assert.equal(off.captures.some((c) => c.key === 'lastManStands'), false);
    const on = matchCaptures(CRICKET_LIVE_SETTINGS as never, init({ overs: 5, lastManStands: true }));
    assert.match(on.rules.find((r) => r.key === 'lastManStands')!.value, /^On/);
  });

  test('without the rule: players − 1 wickets is all out (unchanged)', () => {
    const m = box(false);
    m.ball('WICKET', { kind: 'bowled', newBatId: 'h3' });
    m.ball('WICKET', { kind: 'bowled' });
    assert.equal(m.s.innings, 2);
  });

  test('with it: the last batter bats on alone, keeps the strike, the innings ends at the true all out', () => {
    const m = box();
    assert.equal(allOutAt(m.s), 3);
    m.ball('WICKET', { kind: 'bowled', newBatId: 'h3' });
    m.ball('WICKET', { kind: 'bowled' }); // h3 out: h2 (non-striker) bats alone
    assert.equal(m.s.innings, 1, 'not all out');
    assert.equal(lastManAlone(m.s), true);
    assert.equal(m.s.strikerId, 'h2', 'the survivor takes strike');
    assert.equal(m.s.nonStrikerId, undefined);
    assert.equal(noBatterLeft(m.s, 'home'), false);
    m.runs(1); // odd runs: no rotation
    assert.equal(m.s.strikerId, 'h2');
    m.runs(3, 2, 1); // over ends on the 6th ball: still on strike
    assert.equal(m.s.scores.home.balls, 6);
    assert.equal(m.s.strikerId, 'h2');
    assert.equal(m.s.nonStrikerId, undefined);
    m.bowler('a8');
    m.ball('EXTRA', { kind: 'Wide', runs: 1 }); // odd wides: no rotation either
    assert.equal(m.s.strikerId, 'h2');
    m.ball('WICKET', { kind: 'caught', fielderId: 'a7' });
    assert.equal(m.s.innings, 2, 'all three out');
    assert.equal(m.s.scores.home.wickets, 3);
    assert.equal(noBatterLeft(m.s, 'home'), true);
  });

  test('hostile / edge: v:2 swap alone refused; run out of the empty end = the lone batter; Mankad alone refused', () => {
    const m = box();
    m.ball('WICKET', { kind: 'bowled', newBatId: 'h3' });
    m.ball('WICKET', { kind: 'bowled' });
    const sw = m.do({ type: 'SWAP_STRIKE', payload: { v: 2 } });
    assert.equal(sw.next, sw.prev);
    const mk = m.ball('WICKET', { kind: 'mankad' });
    assert.equal(mk.next, mk.prev);
    m.ball('WICKET', { kind: 'runout', fielderId: 'a7', batterOut: 'nonstriker', runs: 1, end: 'bowler' });
    assert.equal(m.s.innings, 2);
    assert.equal(m.s.batting.h2.out, true, 'the lone batter is the one out');
  });

  test('a chase won by the last man; records do not call players − 1 wickets all out', () => {
    const m = live({ overs: 1, playersPerSide: 2, lastManStands: true });
    m.crease('h1', 'h2', 'a9');
    m.runs(1);
    m.do({ type: 'END_INNINGS' });
    m.crease('a1', 'a2', 'h9');
    m.ball('WICKET', { kind: 'bowled' });
    assert.equal(lastManAlone(m.s), true);
    m.runs(2);
    assert.equal(m.s.ended, true);
    assert.equal(m.s.scores.away.wickets, 1);
    const hi = cricketMatchRecords(m.s)!.items.find((i) => i.type === 'teamHigh' && i.side === 'away')!;
    assert.match(hi.text, /^2\/1 /, 'not "all out" — the last man was still in');
  });

  test('the rule switched off while a batter is alone ends the innings at the next ball', () => {
    const m = box();
    m.ball('WICKET', { kind: 'bowled', newBatId: 'h3' });
    m.ball('WICKET', { kind: 'bowled' });
    m.do({ type: 'SET_RULES', payload: { lastManStands: false } });
    m.runs(1);
    assert.equal(m.s.innings, 2);
  });
});

/* ──────────────────── C11 / R7 — powerplay after a rain cut, ODI bands ──────────────────── */

describe('C11 / R7 — the powerplay follows a rain cut; ODI P2 / P3 (B6-8 … B6-12)', () => {
  const cut = (cfg: Record<string, unknown>, overs: number, v2 = true) => {
    const m = live(cfg);
    m.crease('h1', 'h2', 'a9');
    m.do({ type: 'RAIN', payload: { overs, ...(v2 ? { v: 2 } : {}) } });
    return m;
  };

  test('T20 cut to 10 overs: 3 overs (ICC table, 30% of the balls)', () => {
    const m = cut({ overs: 20, powerplayOvers: 6, dls: true }, 10);
    assert.equal(powerplayBalls(m.s), 18);
    assert.match(powerplayNow(m.s)!.label, /overs 1–3/);
  });

  test('ICC reduced-overs table (T20): 5→1.3, 7→2.1, 13→3.5, 19→5.4', () => {
    for (const [ov, balls] of [[5, 9], [7, 13], [13, 23], [19, 34]] as const) {
      const m = cut({ overs: 20, powerplayOvers: 6, dls: true }, ov);
      assert.equal(powerplayBalls(m.s), balls, `${ov} overs`);
    }
    const m = cut({ overs: 20, powerplayOvers: 6, dls: true }, 13);
    assert.match(powerplayNow(m.s)!.label, /3\.5/);
  });

  test('a cut after the powerplay keeps it as played; a cut mid-powerplay ends it no earlier than the cut', () => {
    const after = live({ overs: 20, powerplayOvers: 6, dls: true });
    after.crease('h1', 'h2', 'a9');
    for (let o = 0; o < 7; o++) { if (!after.s.bowlerId) after.bowler(o % 2 ? 'a8' : 'a9'); after.runs(0, 0, 0, 0, 0, 0); }
    after.do({ type: 'RAIN', payload: { overs: 10, v: 2 } });
    assert.equal(powerplayBalls(after.s), 36);
    assert.equal(phasePlan(after.s, 1)!.pp, 36);
    const mid = live({ overs: 20, powerplayOvers: 6, dls: true });
    mid.crease('h1', 'h2', 'a9');
    mid.runs(0, 0, 0, 0, 0, 0); mid.bowler('a8'); mid.runs(0, 0, 0, 0);
    mid.do({ type: 'RAIN', payload: { overs: 10, v: 2 } }); // 1.4 bowled; the table says 3 overs
    assert.equal(powerplayBalls(mid.s), 18);
    const late = live({ overs: 20, powerplayOvers: 6, dls: true });
    late.crease('h1', 'h2', 'a9');
    for (let o = 0; o < 4; o++) { if (!late.s.bowlerId) late.bowler(o % 2 ? 'a8' : 'a9'); late.runs(0, 0, 0, 0, 0, 0); }
    late.do({ type: 'RAIN', payload: { overs: 10, v: 2 } }); // 4 overs bowled > 3: the powerplay ends at the cut
    assert.equal(powerplayBalls(late.s), 24);
    assert.equal(powerplayNow(late.s), null);
  });

  test('no cut, legacy (no v) rain, The Hundred, a Test: unchanged', () => {
    assert.equal(powerplayBalls(init({ overs: 20, powerplayOvers: 6 })), 36);
    const legacy = cut({ overs: 20, powerplayOvers: 6, dls: true }, 10, false);
    assert.equal(legacy.s.dlsV, undefined);
    assert.equal(powerplayBalls(legacy.s), 36);
    assert.equal(powerplayBalls(init({ overs: 10, ballsPerOver: 10, hundred: true })), 25);
    assert.equal(powerplayBalls(init({ overs: 999, powerplayOvers: 0 })), 0);
    assert.equal(powerplayNow(init({ overs: 999 })), null);
  });

  test('hostile: a powerplay as long as the innings is capped; a cut to 1 over', () => {
    assert.equal(powerplayBalls(init({ overs: 4, powerplayOvers: 10 })), 24);
    const m = cut({ overs: 20, powerplayOvers: 6, dls: true }, 1);
    assert.ok(powerplayBalls(m.s) <= 6 && powerplayBalls(m.s) >= 1);
  });

  test('ODI: P1 overs 1–10 (2 out), P2 11–40 (4), P3 41–50 (5); cut to 30 → 6 / 18 / 6', () => {
    const odi = init({ overs: 50, powerplayOvers: 10 });
    const b = powerplayBands(odi, 1);
    assert.deepEqual(b.map((x) => [x.name, x.from, x.to, x.outside]), [['P1', 0, 60, 2], ['P2', 60, 240, 4], ['P3', 240, 300, 5]]);
    assert.match(powerplayNow(odi)!.label, /POWERPLAY 1 · overs 1–10/);
    const m = cut({ overs: 50, powerplayOvers: 10, dls: true }, 30);
    assert.deepEqual(powerplayBands(m.s, 1).map((x) => [x.name, x.from, x.to]), [['P1', 0, 36], ['P2', 36, 144], ['P3', 144, 180]]);
    // a T20 has one band only
    assert.deepEqual(powerplayBands(init({ overs: 20, powerplayOvers: 6 }), 1).map((x) => x.name), ['P1']);
  });

  test('the strip moves to P2 after over 10 of an ODI', () => {
    const m = live({ overs: 50, powerplayOvers: 10 });
    m.crease('h1', 'h2', 'a9');
    for (let o = 0; o < 10; o++) { if (!m.s.bowlerId) m.bowler(o % 2 ? 'a8' : 'a9'); m.runs(0, 0, 0, 0, 0, 0); }
    const now = powerplayNow(m.s)!;
    assert.equal(now.name, 'P2');
    assert.match(now.label, /overs 11–40/);
    assert.match(now.label, /4/);
  });

  test('the stats "auto" powerplay phase follows the cut; an organiser choice wins', () => {
    const m = cut({ overs: 20, powerplayOvers: 6, dls: true }, 10);
    assert.equal(phasePlan(m.s, 1)!.pp, 18);
    assert.equal(phasePPBalls(m.s, 1), 18);
    const c = cut({ overs: 20, powerplayOvers: 6, dls: true, phasePP: 4 }, 10);
    assert.equal(phasePlan(c.s, 1)!.pp, 24);
  });
});

/* ───────────────────────── C9 — bouncers without the pitch map ───────────────────────── */

describe('C9 — the bouncer count without the pitch map (B6-13, B6-14)', () => {
  test('a limit set + pitch map off → the one-chip Bouncer tag is offered; the slot counts it', () => {
    const m = live({ overs: 20, bouncerMax: 1 });
    m.crease('h1', 'h2', 'a9');
    m.runs(0);
    const rec = m.s.log!.at(-1)!;
    assert.equal(bouncerChipOnly(m.s, rec), true);
    m.detail({ len: 'bouncer' });
    const b = bouncerStatus(m.s)!;
    assert.deepEqual([b.count, b.limit], [1, 1]);
  });

  test('not offered: no limit chosen (standard), "no limit", or the pitch map on (it has its own chips)', () => {
    for (const cfg of [{}, { bouncerMax: 0 }, { bouncerMax: 2, pitchMap: true }]) {
      const m = live({ overs: 20, ...cfg });
      m.crease('h1', 'h2', 'a9');
      m.runs(0);
      assert.equal(bouncerChipOnly(m.s, m.s.log!.at(-1)!), false, JSON.stringify(cfg));
    }
  });

  test('a bouncer tagged without the pitch map is not a pitch map in Stats', () => {
    const m = live({ overs: 20, bouncerMax: 1 });
    m.crease('h1', 'h2', 'a9');
    m.runs(0); m.detail({ len: 'bouncer' });
    m.runs(1);
    assert.equal(teamBatting(m.s, 'home').pitch, null);
  });
});

/* ───────────────────────── C6 — c sub (X) ───────────────────────── */

describe('C6 — substitutes: "c sub (X)" (B6-15, B6-16)', () => {
  test('the format\'s substitutes reach the state only when set', () => {
    assert.equal(init({ overs: 20, substitutes: 2 }).subs, 2);
    assert.equal('subs' in init({ overs: 20 }), false);
    assert.equal('subs' in init({ overs: 20, substitutes: 0 }), false);
    assert.equal(init({ overs: 20, substitutes: 99 }).subs, 5);
    assert.equal('subs' in init({ overs: 20, substitutes: 'x' }), false);
  });

  test('a v:2 sub catch reads "c sub (X) b Y"; the catch is still the fielder\'s; the record says sub', () => {
    const m = live({ substitutes: 1 });
    m.crease('h1', 'h2', 'a9');
    m.ball('WICKET', { kind: 'caught', fielderId: 'a12', sub: true, v: 2, newBatId: 'h3' });
    assert.match(m.s.batting.h1.dismissal!, /^c sub \(.+\) b /);
    assert.equal(m.s.dismissals.at(-1)!.sub, true);
    assert.equal(m.s.dismissals.at(-1)!.fielderId, 'a12');
    m.ball('WICKET', { kind: 'runout', fielderId: 'a12', sub: true, v: 2, newBatId: 'h4', end: 'striker' });
    assert.match(m.s.batting.h3.dismissal!, /^run out \(sub \(.+\)\)$/);
    assert.equal(composeDismissal('caught', 'B', 'F', undefined, undefined, true), 'c sub (F) b B');
  });

  test('hostile: no subs in the format, legacy payload, a bowled, a non-true value → no mark', () => {
    const cases: [Record<string, unknown>, Record<string, unknown>][] = [
      [{}, { kind: 'caught', fielderId: 'a12', sub: true, v: 2 }],
      [{ substitutes: 1 }, { kind: 'caught', fielderId: 'a12', sub: true }],
      [{ substitutes: 1 }, { kind: 'bowled', sub: true, v: 2 }],
      [{ substitutes: 1 }, { kind: 'caught', fielderId: 'a12', sub: 'yes', v: 2 }],
    ];
    for (const [cfg, p] of cases) {
      const m = live(cfg);
      m.crease('h1', 'h2', 'a9');
      m.ball('WICKET', { ...p, newBatId: 'h3' });
      assert.doesNotMatch(m.s.batting.h1.dismissal!, /sub/, JSON.stringify([cfg, p]));
      assert.equal(m.s.dismissals.at(-1)!.sub, undefined);
    }
  });
});

/* ───────────────────────── C7 — ball type in the career split ───────────────────────── */

describe('C7 — ball type feeds the career split (B6-17)', () => {
  test('a tennis-ball match line splits as "Tennis ball"', () => {
    const match = { id: 'm1', sport: 'cricket', format: { ballType: 'tennis' }, homeTeam: { id: 't1', name: 'A', roster: ['p1'] }, awayTeam: { id: 't2', name: 'B', roster: [] }, state: init({ ballType: 'tennis' }) };
    const ctx = lineContext({ playerId: 'p1', sport: 'cricket', matchId: 'm1' } as never, match as never, undefined);
    assert.equal(ctx.ball?.label, 'Tennis ball');
  });
});

/* ───────────────────────── fix 13 — Law polish ───────────────────────── */

describe('fix 13 — Run out (backing up), one short, the beamer count (B6-18 … B6-20)', () => {
  test('the chip reads the Law\'s words; the stored timeline headline is unchanged', () => {
    assert.equal(DISMISSAL_NAME.mankad, 'Run out (backing up)');
    assert.equal(WICKET_LABEL.mankad, 'MANKAD');
  });

  test('one short (v:2): the runs stand as given, the timeline and commentary say "one short"', () => {
    const m = live();
    m.crease('h1', 'h2', 'a9');
    m.ball('RUNS', { runs: 1, short: true, v: 2 });
    assert.equal(m.s.scores.home.runs, 1);
    assert.match(m.s.events.at(-1)!.label, /one short/);
    assert.ok(notes(m.s).some((t) => /one short/.test(t)));
    // legacy / hostile: no v, or a non-true value → a plain run
    const l = live(); l.crease('h1', 'h2', 'a9');
    l.ball('RUNS', { runs: 1, short: true });
    l.ball('RUNS', { runs: 1, short: 'yes', v: 2 });
    assert.ok(l.s.events.every((e) => !/short/.test(e.label)));
    assert.ok(l.s.log!.every((r) => !r.short));
  });

  test('two above-waist no-balls by one bowler → the Law 41.7 prompt', () => {
    const m = live({ extraWhy: true });
    m.crease('h1', 'h2', 'a9');
    m.ball('EXTRA', { kind: 'No ball' }); m.detail({ why: 'height' });
    assert.equal(beamerCount(m.s, 'a9'), 1);
    assert.match(beamerWarning(m.s)!, /first/i);
    m.runs(0);
    m.ball('EXTRA', { kind: 'No ball' }); m.detail({ why: 'height' });
    assert.equal(beamerCount(m.s, 'a9'), 2);
    assert.match(beamerWarning(m.s)!, /41\.7/);
    m.ball('EXTRA', { kind: 'No ball' }); m.detail({ why: 'foot' });
    assert.equal(beamerCount(m.s, 'a9'), 2, 'a front-foot no-ball is not a beamer');
    assert.equal(beamerWarning(live().s), null);
  });
});
