/**
 * Wave 4 polish — snooker and carrom detail in the commentary, honest bouncer
 * wording. docs/security/breaks/polish-cue-cricket.md (PQ1–PQ9).
 * Rule (wave 1): a line mentions a detail only when the scorer captured it.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sports/snooker/engine.ts';
import * as SC from '../src/sports/snooker/controls.ts';
import { snookerFeed } from '../src/sports/snooker/feed.ts';
import { snookerUndoLabel } from '../src/sports/snooker/undo.ts';
import { snookerStatTotals } from '../src/sports/snooker/totals.ts';
import { snookerMatchStats } from '../src/sports/snooker/matchStats.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { carromFeed } from '../src/sports/carrom/feed.ts';
import { carromUndoLabel } from '../src/sports/carrom/undoLabel.ts';
import { carromStatTotals } from '../src/sports/carrom/totals.ts';
import { carromMatchStats } from '../src/sports/carrom/matchStats.ts';
import { cleanUndoLabel } from '../src/sports/undoLabel.ts';
import { bouncerWarning, bouncerSlot } from '../src/sports/cricket/bouncers.ts';
import { LOCAL_RULE_FIELDS } from '../src/sports/cricket/rules.ts';
import { SINGLES_CTX } from './cue-script.mts';

type Side = 'home' | 'away';
const NAMES = { home: 'Ravi', away: 'Asha' };

let seed = 0x9013c0e;
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = (n: number) => Math.floor(rand() * n);

/* ------------------------------- snooker -------------------------------- */
type Tags = SC.StrokeTags;
function snooker(config: Record<string, unknown> = { reds: 15, trackLongRest: true }) {
  let s = S.createInitialState(config);
  const labels: (string | null)[] = [];
  const step = (a: SC.Act | null) => {
    assert.ok(a, 'a legal tap');
    const prev = s;
    s = S.reducer(s, a as never);
    labels.push(snookerUndoLabel({ type: (a as { type: string }).type, prev, next: s }));
    return api;
  };
  const api = {
    get s() { return s; },
    labels,
    pot: (b: S.Ball, t: Tags = {}) => step(SC.potAction(s, b, t)),
    miss: (t: Tags = {}) => step(SC.missAction(s, t)),
    safety: () => step(SC.safetyAction(s)),
  };
  return api;
}
const lines = (s: S.SnookerState) => snookerFeed(s, NAMES).flatMap((g) => g.items.map((i) => i.text));
/** a line with the PQ2 tag phrase removed */
const TAG_RE = / · (\d+ long pots?|\d+ missed long pots?|\d+ with the rest)/g;
const untag = (t: string) => t.replace(TAG_RE, '');

describe('PQ1 · snooker: the Undo bar names the shot\'s tags', () => {
  test('a long red, a rest black, a long missed pot with the rest', () => {
    const m = snooker();
    m.pot('red', { long: true }).pot('black', { rest: true }).pot('red').miss({ long: true, rest: true });
    assert.equal(m.labels[0], 'red · long pot · break 1');
    assert.equal(m.labels[1], 'black · with the rest · break 8');
    assert.equal(m.labels[2], 'red · break 9', 'untagged: exactly as before');
    assert.equal(m.labels[3], 'missed long pot · with the rest');
  });
  test('untagged miss reads as before; tracking off ignores the tags', () => {
    const m = snooker();
    m.miss();
    assert.equal(m.labels[0], 'missed pot');
    const off = snooker({ reds: 15 });
    off.pot('red', { long: true }).miss({ rest: true });
    assert.deepEqual(off.labels, ['red · break 1', 'missed pot']);
  });
  test('the frame-ending black keeps its tag', () => {
    const m = snooker({ reds: 6, trackLongRest: true });
    for (let i = 0; i < 6; i++) m.pot('red').pot('black');
    for (const c of ['yellow', 'green', 'brown', 'blue', 'pink'] as S.Ball[]) m.pot(c);
    m.pot('black', { long: true });
    assert.match(m.labels.at(-1)!, /^black · long pot · break /);
  });
});

describe('PQ2/PQ3 · snooker: the visit line counts what was tagged', () => {
  test('a visit with tags says so; the opponent\'s untagged visit does not', () => {
    const m = snooker();
    m.pot('red', { long: true }).pot('black', { rest: true }).pot('red', { long: true }).miss({ long: true });
    m.pot('red').safety();
    const ls = lines(m.s);
    assert.ok(ls.includes('Ravi — break of 9 (2 reds, 1 black), then missed a pot · 2 long pots · 1 missed long pot · 1 with the rest'), ls.join('\n'));
    assert.ok(ls.includes('Asha — break of 1 (1 red), then played safe'));
  });
  test('a live visit with a tag', () => {
    const m = snooker();
    m.pot('red', { rest: true });
    assert.ok(lines(m.s).includes('Ravi at the table — break of 1 so far (1 red) · 1 with the rest'));
  });
  test('no tags: every line identical to the same match scored without tracking', () => {
    const a = snooker(), b = snooker({ reds: 15 });
    for (const m of [a, b]) m.pot('red').pot('black').miss().pot('red').safety().miss();
    assert.deepEqual(lines(a.s), lines(b.s));
    assert.ok(!lines(a.s).some((t) => /long|rest/.test(t)));
  });
});

describe('PQ4 · snooker: junk tag counts in a stored snapshot are not printed', () => {
  test('9e9, -1, 1.5, strings: read as untagged', () => {
    const m = snooker();
    m.pot('red').miss();
    const clean = lines(m.s);
    for (const junk of [9e9, -1, 1.5, '3', NaN, null]) {
      const s = structuredClone(m.s) as S.SnookerState;
      Object.assign(s.frame!.visits[0], { lp: junk, lm: junk, rs: junk });
      assert.deepEqual(lines(s), clean, String(junk));
    }
  });
});

/* -------------------------------- carrom -------------------------------- */
const CTX = { players: { home: [{ id: 'h1', name: 'H1' }], away: [{ id: 'a1', name: 'A1' }] } };
const ALL_ON = { trackFouls: true, trackBreak: true, trackQueenMiss: true };
type CTaps = { brk?: number | null; fouls?: Record<Side, Partial<Record<carrom.FoulType, number>>>; dues?: Record<Side, number>; qMiss?: Record<Side, number> };
function cboard(s: carrom.CarromState, side: Side, coins: number, t: CTaps = {}): { s: carrom.CarromState; label: string | null } {
  const det = carrom.boardDetail(s, {
    doubles: false, breakerKnown: true, brk: t.brk ?? null,
    fouls: t.fouls ?? { home: {}, away: {} }, dues: t.dues ?? { home: 0, away: 0 }, qMiss: t.qMiss ?? { home: 0, away: 0 }, whoLog: { home: {}, away: {} },
  });
  const next = carrom.reducer(s, { type: 'BOARD', side, payload: { coins, queen: false, ...(det ? { det } : {}) }, attribution: { playerId: `${side[0]}1`, points: 1 } } as never);
  return { s: next, label: carromUndoLabel({ type: 'BOARD', prev: s, next }, undefined, NAMES) };
}
const subs = (s: carrom.CarromState) => carromFeed(s, NAMES).flatMap((g) => g.items.map((i) => i.sub ?? ''));

describe('PQ5/PQ7 · carrom: the Undo bar shows the board\'s captured detail', () => {
  test('break, two fouls, a due, a missed cover', () => {
    const s0 = carrom.init(ALL_ON);
    const r = cboard(s0, 'home', 4, { brk: 3, fouls: { home: {}, away: { thumb: 1, striker: 1 } }, dues: { home: 0, away: 1 }, qMiss: { home: 0, away: 1 } });
    assert.equal(r.label, 'board to Ravi +4 · 3 on the break · 2 fouls (striker pocketed, thumbing) · 1 due · Queen cover missed (4-0)');
  });
  test('nothing tapped: exactly as before', () => {
    const s0 = carrom.init(ALL_ON);
    const r = cboard(s0, 'home', 4);
    assert.equal(r.label, 'board to Ravi +4 (4-0)');
  });
  test('after the first foul, an untapped board adds nothing (its 0 shows in the feed only)', () => {
    let s = carrom.init(ALL_ON);
    s = cboard(s, 'home', 4, { fouls: { home: { touch: 2 }, away: {} } }).s;
    const r = cboard(s, 'away', 2);
    assert.equal(r.label, 'board to Asha +2 (4-2)');
    const r0 = cboard(s, 'away', 2, { brk: 0 });
    assert.equal(r0.label, 'board to Asha +2 · 0 on the break (4-2)', 'a tapped 0 on the break was captured');
  });
  test('×n for repeated fouls and covers; the label stays clean', () => {
    const r = cboard(carrom.init(ALL_ON), 'away', 5, { fouls: { home: { thumb: 2 }, away: {} }, dues: { home: 2, away: 0 }, qMiss: { home: 2, away: 1 } });
    assert.equal(r.label, 'board to Asha +5 · 2 fouls (thumbing ×2) · 2 dues · Queen cover missed ×3 (0-5)');
    assert.equal(cleanUndoLabel(r.label), r.label);
  });
});

describe('PQ6 · carrom: the feed says "No fouls" only once fouls were captured', () => {
  const old = (det: carrom.BoardDetail) => [['home', 5], ['away', 3]].reduce(
    (s, [side, coins]) => carrom.reducer(s, { type: 'BOARD', side, payload: { coins, queen: false, det }, attribution: { playerId: `${String(side)[0]}1`, points: 1 } } as never),
    carrom.init(ALL_ON));
  test('an old all-zero foul log: no "No fouls"', () => {
    const s = old({ fouls: { home: {}, away: {} }, dues: { home: 0, away: 0 }, qMiss: { home: 0, away: 0 } });
    assert.ok(!subs(s).some((t) => /No fouls/.test(t)), subs(s).join('\n'));
  });
  test('a captured match: a board with none is a real "No fouls"', () => {
    let s = carrom.init(ALL_ON);
    s = cboard(s, 'home', 4, { fouls: { home: { touch: 1 }, away: {} } }).s;
    s = cboard(s, 'away', 2).s;
    const sb = subs(s);
    assert.ok(sb.some((t) => /No fouls/.test(t)));
    assert.ok(sb.some((t) => /Fouls — Ravi 1 \(touching\)/.test(t)));
  });
});

/* -------------------------------- cricket ------------------------------- */
describe('PQ8 · cricket: the bouncer warning claims only tagged bouncers', () => {
  test('slot, warning and the organiser hint say "tagged"', () => {
    assert.equal(bouncerSlot({ count: 1, limit: 1, over: 1 }), '⚠️ 1/1 bouncer tagged this over — the next is a no-ball');
    assert.equal(bouncerSlot({ count: 2, limit: 1, over: 1 }), '⚠️ 2 bouncers tagged this over — over the limit of 1');
    assert.equal(bouncerWarning({ count: 1, limit: 1, over: 1 }), '⚠️ Bouncer limit reached — 1 bouncer tagged this over (max 1): another is a no-ball');
    assert.equal(bouncerWarning({ count: 3, limit: 2, over: 4 }), '⚠️ 3 bouncers tagged this over — over the limit of 2: that\'s a no-ball');
    const f = LOCAL_RULE_FIELDS.find((x) => x.key === 'bouncerMax')!;
    assert.match(String(f.hint), /bouncers you tag/);
    assert.match(String(f.hint), /no warning doesn.t mean no bouncers/);
  });
  test('below the limit: still nothing (no "0 bouncers")', () => {
    assert.equal(bouncerSlot({ count: 0, limit: 1, over: 1 }), null);
    assert.equal(bouncerWarning({ count: 1, limit: 2, over: 1 }), null);
    assert.equal(bouncerSlot(null), null);
  });
});

/* ------------------------------ simulation ------------------------------ */
const BALLS: S.Ball[] = ['red', 'yellow', 'green', 'brown', 'blue', 'pink', 'black'];
describe('PQ9 · 600-match simulation', () => {
  test('200 snooker matches: a tag is named exactly when captured; scores and stats unchanged', () => {
    let tagged = 0, untagged = 0;
    for (let n = 0; n < 200; n++) {
      const on = n % 4 !== 0;
      const cfg = { reds: [6, 10, 15][n % 3], ...(on ? { trackLongRest: true } : {}) };
      const m = snooker(cfg);
      const plain = snooker({ reds: cfg.reds }); // same taps, no tracking
      for (let k = 0; k < 60 && m.s.frame && !m.s.ended; k++) {
        const t: Tags = rand() < 0.3 ? { ...(rand() < 0.6 ? { long: true } : {}), ...(rand() < 0.4 ? { rest: true } : {}) } : {};
        const p = SC.snookerPanel(m.s);
        const ball = p?.balls.find((b) => b.action && b.ball !== 'free');
        const doPot = ball && rand() < 0.7;
        const before = m.labels.length;
        if (doPot) { m.pot(ball!.ball as S.Ball, t); plain.pot(ball!.ball as S.Ball); }
        else if (rand() < 0.7) { m.miss(t); plain.miss(); }
        else { m.safety(); plain.safety(); }
        const lab = m.labels[before] ?? '';
        const isSafety = lab === 'safety';
        const wantLong = on && !!t.long && !isSafety, wantRest = on && !!t.rest && !isSafety;
        assert.equal(/long/.test(lab), wantLong, `long: ${lab}`);
        assert.equal(/with the rest/.test(lab), wantRest, `rest: ${lab}`);
        if (wantLong || wantRest) tagged++; else untagged++;
        assert.equal(lab.replace(' · long pot', '').replace(' · with the rest', '').replace('missed long pot', 'missed pot'), plain.labels.at(-1));
      }
      // scores identical; the feed with the tag phrase removed = the untracked feed
      assert.deepEqual(m.s.frames.map((f) => f.score), plain.s.frames.map((f) => f.score));
      assert.deepEqual(m.s.frame?.score, plain.s.frame?.score);
      assert.deepEqual(lines(m.s).map(untag), lines(plain.s));
      // a visit line names a tag exactly when its visit carries one
      const all = [...m.s.frames.flatMap((f) => f.visits), ...(m.s.frame ? m.s.frame.visits : [])];
      const anyTag = all.some((v) => (v.lp ?? 0) + (v.lm ?? 0) + (v.rs ?? 0) > 0);
      assert.equal(lines(m.s).some((t) => TAG_RE.test(t)), anyTag);
      TAG_RE.lastIndex = 0;
      // stats: the score-side stats match the untracked match
      const st = snookerStatTotals(m.s, SINGLES_CTX as never), sp = snookerStatTotals(plain.s, SINGLES_CTX as never);
      for (const id of Object.keys(sp)) {
        const { longPots: _a, longAttempts: _b, restShots: _c, ...rest } = st[id].stats;
        assert.deepEqual(rest, sp[id].stats);
      }
      assert.ok(snookerMatchStats(m.s).length >= 1);
    }
    assert.ok(tagged > 300 && untagged > 300, `${tagged} tagged / ${untagged} untagged`);
  });

  test('200 carrom matches: the label names detail exactly when captured; feed / stats unchanged otherwise', () => {
    const FT = carrom.FOUL_TYPES;
    let withDet = 0, without = 0;
    for (let n = 0; n < 200; n++) {
      let s = carrom.init(n % 5 === 0 ? {} : ALL_ON);
      for (let b = 0; b < 12 && !s.ended; b++) {
        const side: Side = rand() < 0.5 ? 'home' : 'away';
        const taps: CTaps = {
          brk: rand() < 0.4 ? rnd(4) : null,
          fouls: { home: rand() < 0.2 ? { [FT[rnd(FT.length)]]: 1 + rnd(2) } : {}, away: rand() < 0.2 ? { [FT[rnd(FT.length)]]: 1 } : {} },
          dues: { home: rand() < 0.1 ? 1 : 0, away: 0 },
          qMiss: { home: rand() < 0.1 ? 1 : 0, away: rand() < 0.1 ? 1 : 0 },
        };
        const prev = s;
        const r = cboard(s, side, 1 + rnd(6), taps);
        s = r.s;
        const det = s.boards.at(-1)?.det;
        const fouls = det?.fouls ? FT.reduce((t, k) => t + (det.fouls!.home?.[k] ?? 0) + (det.fouls!.away?.[k] ?? 0), 0) : 0;
        const dues = (det?.dues?.home ?? 0) + (det?.dues?.away ?? 0);
        const qm = (det?.qMiss?.home ?? 0) + (det?.qMiss?.away ?? 0);
        assert.equal(/on the break/.test(r.label ?? ''), det?.brk != null, r.label ?? '');
        assert.equal(/fouls? \(/.test(r.label ?? ''), fouls > 0, r.label ?? '');
        assert.equal(/\bdues?\b/.test(r.label ?? ''), dues > 0, r.label ?? '');
        assert.equal(/Queen cover missed/.test(r.label ?? ''), qm > 0, r.label ?? '');
        assert.ok(r.label && cleanUndoLabel(r.label) === r.label, `clean: ${r.label}`);
        // the label minus the detail = the label of the same board with no detail
        const bare = carromUndoLabel({ type: 'BOARD', prev, next: { ...s, boards: s.boards.map((x, i) => (i === s.boards.length - 1 ? { ...x, det: undefined } : x)) } }, undefined, NAMES);
        assert.equal(r.label!.replace(/ · (\d+ on the break|\d+ fouls? \([^)]*\)|\d+ dues?|Queen cover missed( ×\d+)?)/g, ''), bare);
        if (det) withDet++; else without++;
      }
      // the feed never says "No fouls" for a match with no captured foul
      if (!carrom.carromFoulsCaptured(s.boards)) assert.ok(!subs(s).some((t) => /No fouls/.test(t)));
      assert.ok(carromMatchStats(s) && carromStatTotals(s, CTX as never));
    }
    assert.ok(withDet > 200 && without > 50, `${withDet} / ${without}`);
  });

  test('200 cricket overs: the warning claims only tagged bouncers', () => {
    for (let n = 0; n < 200; n++) {
      const limit = 1 + rnd(3), count = rnd(5);
      const b = { count, limit, over: 1 + rnd(20) };
      const w = bouncerWarning(b), sl = bouncerSlot(b);
      if (count < limit) { assert.equal(w, null); assert.equal(sl, null); continue; }
      assert.match(w!, /tagged this over/);
      assert.match(sl!, /tagged this over/);
      assert.ok(!/\b0 bouncers?\b/.test(w! + sl!));
    }
  });
});
