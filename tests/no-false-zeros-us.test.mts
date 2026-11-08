/**
 * No false zeros in US sports — tracked means captured (wave 1 of
 * docs/sport-expert/defaults-on/PLAN.md; break list NZU1–NZU14 in
 * docs/security/breaks/no-false-zeros-us.md).
 *
 * The racket rule (describe-done DD11): a "Stats to track" figure counts as
 * tracked only once at least one event of that kind was captured. Switched on
 * with nothing captured = nothing shown, nothing written to careers. Where
 * something was captured, the figures are unchanged.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
// basketball
import { init as bbInit, reducer as bbReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { foulAction, scoreAction } from '../src/sports/basketball/actions.ts';
import { bbDeepKeys, bbDeepTotals } from '../src/sports/basketball/deep.ts';
import { basketballPanel } from '../src/sports/basketball/panel.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
// american football
import {
  init as afInit, reducer as afReducer, buildPlay as afBuildPlay, credit as afCredit, deepKeys, eventCredits, tacklesTracked,
  type AFState, type AFEvent, type Side, type Who,
} from '../src/sports/american_football/engine.ts';
import { afTotals } from '../src/sports/american_football/totals.ts';
import { afBox } from '../src/sports/american_football/box.ts';
// baseball
import { init as baInit, reducer as baReducer, buildPlay as baBuildPlay, battedBallOf, type BaseballState, type BattedBall, type Outcome, type Zone } from '../src/sports/baseball/engine.ts';
import { baseballTotals, BATTED_BALL_KEYS } from '../src/sports/baseball/totals.ts';
import { baseballSheet } from '../src/sports/baseball/sheet.ts';

/** seeded PRNG (mulberry32) so the sim is reproducible */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* -------------------------------- basketball -------------------------------- */

type BSide = 'home' | 'away';
const BP = (id: string): Player => ({ id, fullName: id.toUpperCase(), sports: [] } as Player);
const ROSTER: Record<BSide, Player[]> = { home: [1, 2, 3, 4, 5].map((n) => BP(`h${n}`)), away: [1, 2, 3, 4, 5].map((n) => BP(`a${n}`)) };
const bbAt = (q: number, sec: number) => ({ quarter: q, minute: Math.floor(sec / 60), sec, v: 2 });
const stampB = (a: ScoreAction, sec: number): ScoreAction => ({ ...a, payload: { ...a.payload, ...bbAt(1, sec) } });
const KO: ScoreAction = { type: 'KICKOFF', payload: { at: 1 } };
const BB_ON = { periodMinutes: 10, regPeriods: 4, trackMisses: true, trackFastBreak: true, trackFoulsDrawn: true };
/** a make as the controls send it with "Fast-break points" on: always `fbt`, `fb` only when ⚡ tapped */
const make = (side: BSide, p: Player, pts: number, sec: number, fb = false) => stampB(scoreAction(side, pts, p, { fbt: true, ...(fb ? { fb: true } : {}) }), sec);
/** a foul as the controls send it with "Fouls drawn" on: always `fdt`, `drawnBy` only when picked */
const foul = (side: BSide, p: Player, sec: number, drawnBy?: Player) => stampB(foulAction(side, p, 'personal', { fdt: true, ...(drawnBy ? { drawnBy } : {}) }), sec);
const bbRun = (...as: ScoreAction[]) => [KO, ...as].reduce(bbReducer, bbInit(BB_ON));
const panelKeys = (s: BasketballState) => basketballPanel(s, 'all').categories.flatMap((c) => c.rows.map((r) => r.key));
const panelNotes = (s: BasketballState) => basketballPanel(s, 'all').notes ?? [];

describe('NZU1–4, NZU14 · basketball: fast-break points and fouls drawn need a capture', () => {
  test('NZU2 / NZU4: switched on, nothing logged → no row, no key', () => {
    const s = bbRun();
    assert.ok(!panelKeys(s).includes('fastBreak'));
    assert.ok(!panelKeys(s).includes('fd'));
    assert.deepEqual(bbDeepKeys(s).filter((k) => k === 'fastBreakPoints' || k === 'foulsDrawn'), []);
  });
  test('NZU1: makes logged with ⚡ never tapped → no "Fast-break points 0", no career key', () => {
    const s = bbRun(make('home', ROSTER.home[0], 2, 10), make('away', ROSTER.away[0], 3, 20));
    assert.ok(!panelKeys(s).includes('fastBreak'));
    assert.ok(!bbDeepKeys(s).includes('fastBreakPoints'));
    for (const l of Object.values(basketballStatTotals(s))) assert.equal('fastBreakPoints' in l.stats, false);
    assert.ok(!panelNotes(s).some((n) => /Fast breaks/.test(n)), 'NZU14: no coverage note without the row');
  });
  test('NZU3: fouls logged with "who was fouled?" skipped → no "Fouls drawn 0", no career key', () => {
    const s = bbRun(foul('home', ROSTER.home[0], 10), foul('away', ROSTER.away[1], 20));
    assert.ok(!panelKeys(s).includes('fd'));
    assert.ok(!bbDeepKeys(s).includes('foulsDrawn'));
    for (const l of Object.values(basketballStatTotals(s))) assert.equal('foulsDrawn' in l.stats, false);
    assert.ok(!panelNotes(s).some((n) => /Fouls drawn/.test(n)), 'NZU14');
  });
  test('captured: one ⚡ tag and one named foul → the rows and true zeros for everyone else (unchanged)', () => {
    const s = bbRun(make('home', ROSTER.home[0], 2, 10, true), make('away', ROSTER.away[0], 3, 20), foul('away', ROSTER.away[1], 30, ROSTER.home[1]), foul('home', ROSTER.home[2], 40));
    assert.ok(panelKeys(s).includes('fastBreak') && panelKeys(s).includes('fd'));
    const t = basketballStatTotals(s);
    assert.deepEqual([t.h1.stats.fastBreakPoints, t.a1.stats.fastBreakPoints], [2, 0]);
    assert.deepEqual([t.h2.stats.foulsDrawn, t.h1.stats.foulsDrawn], [1, 0]);
  });
  test('NZU13: an old log (toggles on, `fbt` / `fdt` stamped) with a capture replays the same figures', () => {
    const old = bbRun(make('home', ROSTER.home[0], 3, 10, true), foul('away', ROSTER.away[0], 20, ROSTER.home[0]));
    const keys = bbDeepKeys(old);
    assert.ok(keys.includes('fastBreakPoints') && keys.includes('foulsDrawn'));
    assert.deepEqual(bbDeepTotals(old).lines.h1.stats, { fastBreakPoints: 3, foulsDrawn: 1 });
  });
});

/* ----------------------------- american football ----------------------------- */

let u = 0;
const afAt = (period: number, psec: number) => ({ uid: `u${++u}`, period, psec, sec: (period - 1) * 900 + psec });
const W = (id?: string): Who | undefined => (id ? { id, name: id.toUpperCase() } : undefined);
const AF_ON = { preset: 'nfl', variant: 'tackle', rules: 'nfl', mode: 'pbp', trackTackles: true, trackTargets: true, trackDefence: true };
const kick = (rec: Side, spot: number, t: Record<string, unknown>): ScoreAction => ({ type: 'PLAY', side: rec, payload: { play: 'kickoff', newSpot: spot, ...t } });
function afBuilder(cfg: Record<string, unknown>) {
  let s = afInit(cfg);
  const go = (a: ScoreAction) => { s = afReducer(s, a); return s; };
  /** a scrimmage play as the controls send it (`tgt` on a completion, or an incompletion with a named receiver, when Targets is on) */
  const p = (side: Side, inp: Parameters<typeof afBuildPlay>[2], t: Record<string, unknown>) =>
    go(afBuildPlay(s, side, { ...inp, ...(s.trackTargets && (inp.play === 'pass' || (inp.play === 'inc' && inp.p2)) ? { tgt: true } : {}) }, t));
  return { go, p, get s() { return s; } };
}
const tackle = (side: Side, id: string, t: Record<string, unknown>, tfl = false): ScoreAction =>
  ({ type: 'TACKLE', side, payload: { ...t, ...(tfl ? { tfl: true } : {}) }, ...afCredit({ type: 'tackle', playerId: id, playerName: id.toUpperCase(), ...(tfl ? { tfl: true } : {}) }) });
const passDef = (side: Side, id: string, t: Record<string, unknown>): ScoreAction =>
  ({ type: 'PASS_DEF', side, payload: t, ...afCredit({ type: 'pd', playerId: id, playerName: id.toUpperCase() }) });
const allKeys = (s: AFState) => new Set(Object.values(afTotals(s)).flatMap((l) => Object.keys(l.stats)));
const boxKeys = (s: AFState) => { const d = afBox(s).data('all'); return new Set([...d.home.rows, ...d.away.rows].flatMap((r) => Object.keys(r.stats))); };

describe('NZU5–NZU10 · American football: deep columns need a capture', () => {
  test('NZU5–NZU8: every toggle on, every prompt skipped → no PD / TFL / TKL / TGT column, no career key', () => {
    const b = afBuilder(AF_ON);
    b.go(kick('home', 25, afAt(1, 0)));
    b.p('home', { play: 'run', yards: 4, p1: W('h2') }, afAt(1, 20));
    b.p('home', { play: 'inc', p1: W('h1') }, afAt(1, 40));
    b.p('home', { play: 'run', yards: -2, p1: W('h2') }, afAt(1, 60));
    assert.deepEqual(deepKeys(b.s), []);
    assert.equal(tacklesTracked(b.s), false);
    for (const k of ['targets', 'passDef', 'tfl', 'tackles']) {
      assert.equal(allKeys(b.s).has(k), false, `totals ${k}`);
      assert.equal(boxKeys(b.s).has(k), false, `box ${k}`);
    }
  });
  test('NZU5 / NZU8: switched on, no play yet → no keys', () => {
    assert.deepEqual(deepKeys(afInit(AF_ON)), []);
    assert.equal(tacklesTracked(afInit(AF_ON)), false);
  });
  test('NZU9: one pass breakup → PD column, but no TFL column (each kind on its own)', () => {
    const b = afBuilder(AF_ON);
    b.go(kick('home', 25, afAt(1, 0)));
    b.p('home', { play: 'inc', p1: W('h1') }, afAt(1, 20));
    b.go(passDef('away', 'a4', afAt(1, 20)));
    b.p('home', { play: 'run', yards: 3, p1: W('h2') }, afAt(1, 40));
    b.go(tackle('away', 'a5', afAt(1, 40)));
    assert.deepEqual(deepKeys(b.s), ['passDef']);
    const t = afTotals(b.s);
    assert.deepEqual([t.a4.stats.passDef, t.a5.stats.passDef, t.h2.stats.passDef], [1, 0, 0]);
    assert.deepEqual([t.a5.stats.tackles, t.a4.stats.tackles], [1, 0]);
    assert.equal('tfl' in t.a5.stats, false);
    assert.equal('targets' in t.h1.stats, false, 'no completion, no named incompletion');
  });
  test('an interception logged with the toggle on is a pass defended (captured)', () => {
    const b = afBuilder(AF_ON);
    b.go(kick('home', 25, afAt(1, 0)));
    b.p('home', { play: 'int', p1: W('h1'), p2: W('a8'), newSpot: 30 }, afAt(1, 20));
    assert.deepEqual(deepKeys(b.s), ['passDef']);
    assert.equal(afTotals(b.s).a8.stats.passDef, 1);
  });
  test('NZU10: a captured event on a play wiped out by a penalty (`nul`) does not switch a column on', () => {
    const b = afBuilder(AF_ON);
    b.go(kick('home', 25, afAt(1, 0)));
    b.p('home', { play: 'pass', yards: 9, p1: W('h1'), p2: W('h3') }, afAt(1, 20));
    const s: AFState = { ...b.s, events: b.s.events.map((e) => (e.tgt ? { ...e, nul: true } as AFEvent : e)) };
    assert.ok(!deepKeys(s).includes('targets'));
  });
  test('NZU13: the full tracked log keeps its figures (targets, PD, TFL, tackles)', () => {
    const b = afBuilder(AF_ON);
    b.go(kick('home', 25, afAt(1, 0)));
    b.p('home', { play: 'pass', yards: 12, p1: W('h1'), p2: W('h3') }, afAt(1, 20));
    b.go(tackle('away', 'a6', afAt(1, 20)));
    b.p('home', { play: 'inc', p1: W('h1'), p2: W('h4') }, afAt(1, 40));
    b.go(passDef('away', 'a4', afAt(1, 40)));
    b.p('home', { play: 'run', yards: -3, p1: W('h2') }, afAt(1, 60));
    b.go(tackle('away', 'a5', afAt(1, 60), true));
    assert.deepEqual(deepKeys(b.s), ['targets', 'passDef', 'tfl']);
    const t = afTotals(b.s);
    assert.deepEqual([t.h3.stats.targets, t.h4.stats.targets, t.h2.stats.targets], [1, 1, 0]);
    assert.deepEqual([t.a4.stats.passDef, t.a5.stats.tfl, t.a6.stats.tfl, t.a6.stats.tackles], [1, 1, 0, 1]);
  });
});

/* --------------------------------- baseball --------------------------------- */

const ORDER = (p: string) => Array.from({ length: 9 }, (_, i) => ({ id: `${p}${i + 1}`, name: `${p.toUpperCase()}${i + 1}` }));
function baStart(config?: Record<string, unknown>): BaseballState {
  let s = baInit(config);
  s = baReducer(s, { type: 'LINEUP', payload: { team: 'home', order: ORDER('h'), pitcher: { id: 'hp', name: 'HP' } } });
  s = baReducer(s, { type: 'LINEUP', payload: { team: 'away', order: ORDER('a'), pitcher: { id: 'ap', name: 'AP' } } });
  return s;
}
const baPlay = (s: BaseballState, plays: [Outcome, { fielders?: string; zone?: Zone; btype?: BattedBall }?][]) =>
  plays.reduce((x, [o, opts]) => baReducer(x, baBuildPlay(x, o, opts ?? {})), s);
const BA_ON = { pitchTypes: true, sprayZones: true, battedBallTypes: true };

describe('NZU11–NZU12 · baseball: batted-ball career keys need a typed ball; the sheet is clean', () => {
  test('NZU11: toggle on, no ball in play typed (Ks, walks, untapped hits) → no batted-ball keys', () => {
    const s = baPlay(baStart(BA_ON), [['K'], ['BB'], ['1B'], ['K'], ['2B'], ['K']]);
    for (const l of Object.values(baseballTotals(s))) for (const k of BATTED_BALL_KEYS) assert.equal(k in l.stats, false, k);
  });
  test('NZU11 captured: one out fixes a type → every batter / pitcher reads the keys (true zeros, unchanged)', () => {
    const s = baPlay(baStart(BA_ON), [['K'], ['GO', { fielders: '6-3' }], ['1B']]);
    const t = baseballTotals(s);
    assert.deepEqual([t.a2.stats.groundBalls, t.a1.stats.groundBalls, t.a3.stats.lineDrives], [1, 0, 0]);
    assert.equal(t.hp.stats.pitchGroundBalls, 1);
  });
  test('NZU12: the sheet shows no spray / pitch mix / batted section with nothing captured', () => {
    const s = baPlay(baStart(BA_ON), [['K'], ['BB'], ['K']]);
    const keys = baseballSheet(s).sections.map((x) => x.key);
    for (const k of ['spray', 'mix', 'batted']) assert.ok(!keys.includes(k) || baseballSheet(s).sections.find((x) => x.key === k)!.rows.length === 0, k);
    assert.ok(!keys.includes('batted'));
  });
});

/* ------------------------------ 600-user simulation ------------------------------ */

describe('600-user simulation: no key for a kind with zero captures; captured figures unchanged', () => {
  test('200 basketball scorers', () => {
    for (let m = 0; m < 200; m++) {
      const r = rng(1000 + m);
      const pFb = r() < 0.4 ? 0 : r() * 0.5; // 40% of scorers never tap ⚡
      const pFd = r() < 0.4 ? 0 : r() * 0.7; // 40% always skip "who was fouled?"
      const as: ScoreAction[] = [];
      const n = 5 + Math.floor(r() * 40);
      for (let i = 0; i < n; i++) {
        const side: BSide = r() < 0.5 ? 'home' : 'away';
        const opp: BSide = side === 'home' ? 'away' : 'home';
        const p = ROSTER[side][Math.floor(r() * 5)];
        if (r() < 0.7) {
          const pts = r() < 0.3 ? 3 : 2, fb = r() < pFb;
          as.push(make(side, p, pts, 10 + i * 10, fb));
        } else {
          const d = r() < pFd ? ROSTER[opp][Math.floor(r() * 5)] : undefined;
          as.push(foul(side, p, 10 + i * 10, d));
        }
      }
      const s = bbRun(...as);
      // expected, straight from the plays the engine kept (a fouled-out player's later plays may be refused)
      const expFb: Record<string, number> = {}, expFd: Record<string, number> = {};
      for (const e of s.events) {
        if (e.type === 'score' && e.fb && e.pid) expFb[e.pid] = (expFb[e.pid] ?? 0) + (e.points ?? 0);
        if (e.type === 'foul' && e.drawnPid) expFd[e.drawnPid] = (expFd[e.drawnPid] ?? 0) + 1;
      }
      const t = basketballStatTotals(s);
      const keys = panelKeys(s);
      const fbCaptured = Object.keys(expFb).length > 0, fdCaptured = Object.keys(expFd).length > 0;
      assert.equal(keys.includes('fastBreak'), fbCaptured, `m${m} fast-break row`);
      assert.equal(keys.includes('fd'), fdCaptured, `m${m} fouls-drawn row`);
      for (const [id, l] of Object.entries(t)) {
        assert.equal('fastBreakPoints' in l.stats, fbCaptured, `m${m} ${id} fbp key`);
        assert.equal('foulsDrawn' in l.stats, fdCaptured, `m${m} ${id} fd key`);
        if (fbCaptured) assert.equal(l.stats.fastBreakPoints, expFb[id] ?? 0, `m${m} ${id} fbp`);
        if (fdCaptured) assert.equal(l.stats.foulsDrawn, expFd[id] ?? 0, `m${m} ${id} fd`);
      }
    }
  });

  test('200 American football scorers', () => {
    const KEYS = ['targets', 'passDef', 'tfl', 'tackles'] as const;
    for (let m = 0; m < 200; m++) {
      const r = rng(5000 + m);
      const pTk = r() < 0.4 ? 0 : r(), pPd = r() < 0.4 ? 0 : r(), pTgt = r() < 0.3 ? 0 : r();
      const b = afBuilder(AF_ON);
      b.go(kick('home', 25, afAt(1, 0)));
      const n = 3 + Math.floor(r() * 30);
      for (let i = 0; i < n; i++) {
        const off: Side = b.s.drive?.off ?? 'home';
        const def: Side = off === 'home' ? 'away' : 'home';
        const o = (k: number) => `${off[0]}${k}`, d = (k: number) => `${def[0]}${k}`;
        const t = afAt(1, 10 + i * 10);
        const x = r();
        if (x < 0.4) {
          const y = Math.floor(r() * 10) - 3;
          b.p(off, { play: 'run', yards: y, p1: W(o(2)) }, t);
          if (r() < pTk) b.go(tackle(def, d(1 + Math.floor(r() * 6)), t, y < 0));
        } else if (x < 0.6 && r() < pTgt) {
          b.p(off, { play: 'pass', yards: Math.floor(r() * 9) + 1, p1: W(o(1)), p2: W(o(3 + Math.floor(r() * 3))) }, t);
          if (r() < pTk) b.go(tackle(def, d(1 + Math.floor(r() * 6)), t));
        } else {
          b.p(off, { play: 'inc', p1: W(o(1)), ...(r() < pTgt ? { p2: W(o(3)) } : {}) }, t);
          if (r() < pPd) b.go(passDef(def, d(4), t));
        }
      }
      const s = b.s;
      const exp: Record<string, Record<string, number>> = {};
      const captured = new Set<string>();
      for (const e of s.events) {
        const c = eventCredits(e);
        for (const cr of [c.first, c.second]) {
          if (!cr) continue;
          for (const k of KEYS) if (k in cr.stats) { captured.add(k); (exp[cr.playerId] ??= {})[k] = (exp[cr.playerId]?.[k] ?? 0) + cr.stats[k]; }
        }
      }
      const tot = afTotals(s);
      const box = boxKeys(s);
      for (const k of KEYS) {
        assert.equal(box.has(k), captured.has(k), `m${m} box ${k}`);
        for (const [id, l] of Object.entries(tot)) {
          assert.equal(k in l.stats, captured.has(k), `m${m} ${id} ${k} key`);
          if (captured.has(k)) assert.equal(l.stats[k], exp[id]?.[k] ?? 0, `m${m} ${id} ${k}`);
        }
      }
    }
  });

  test('200 baseball scorers', () => {
    const OUTS: Outcome[] = ['K', 'BB', '1B', '2B', 'GO', 'FO', 'LO', 'K', 'BB', '1B'];
    const TYPES: BattedBall[] = ['GB', 'LD', 'FB', 'PU'];
    for (let m = 0; m < 200; m++) {
      const r = rng(9000 + m);
      const pType = r() < 0.4 ? 0 : r();
      const onlyNoContact = r() < 0.3; // Ks / walks / untapped hits only
      const n = 3 + Math.floor(r() * 25);
      const plays: [Outcome, { btype?: BattedBall }?][] = [];
      for (let i = 0; i < n; i++) {
        const o = onlyNoContact ? (['K', 'BB', '1B', '2B'] as Outcome[])[Math.floor(r() * 4)] : OUTS[Math.floor(r() * OUTS.length)];
        plays.push([o, r() < pType && !onlyNoContact ? { btype: TYPES[Math.floor(r() * 4)] } : {}]);
      }
      const s = baPlay(baStart(BA_ON), plays);
      const captured = s.events.some((e) => e.type === 'pa' && !s.g.ann[e.id]?.ignored && !!battedBallOf(e));
      const t = baseballTotals(s);
      for (const [id, l] of Object.entries(t)) {
        const isBatter = 'plateAppearances' in l.stats;
        if (!captured) for (const k of BATTED_BALL_KEYS) assert.equal(k in l.stats, false, `m${m} ${id} ${k}`);
        else if (isBatter) assert.ok(['groundBalls', 'lineDrives', 'flyBalls', 'popups'].every((k) => k in l.stats), `m${m} ${id} batter keys`);
      }
      // the sheet (unchanged): the batted-ball section once a ball was put in play (untyped ones counted honestly)
      assert.equal(baseballSheet(s).sections.some((x) => x.key === 'batted'), s.events.some((e) => e.type === 'pa' && ['1B', '2B', 'GO', 'FO', 'LO'].includes(e.outcome ?? '')), `m${m} sheet`);
    }
  });
});
