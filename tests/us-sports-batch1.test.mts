/**
 * US sports batch 1 (docs/security/breaks/us-sports-batch1.md):
 *  - basketball: an offensive foul is also a turnover for the fouler (FIBA /
 *    NBA box scores) — new fouls only (`tov: true`), old logs unchanged;
 *  - baseball: quick-mode K looking / K swinging, and the `kLooking` key.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { init as bbInit, reducer as bbReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { foulAction, lineupAction, removeAction, scoreAction, statAction } from '../src/sports/basketball/actions.ts';
import { eventCredits as bbCredits } from '../src/sports/basketball/credits.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import { bbTeamFigures, possessionTags } from '../src/sports/basketball/deep.ts';
import { describePlay } from '../src/sports/basketball/commentary.ts';
import { withRosters } from '../src/sports/racketNames.ts';
import {
  init as bsInit, reducer as bsReducer, buildPlay, buildPitch, eventCredits as bsCredits, LIVE_KEYS, readConfig,
  type BaseballState,
} from '../src/sports/baseball/engine.ts';
import { baseballTotals } from '../src/sports/baseball/totals.ts';
import { paSentence } from '../src/sports/baseball/commentary.ts';
import { teamSplit } from '../src/sports/baseball/situational.ts';
import { baseballSheet } from '../src/sports/baseball/sheet.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';

/* -------------------------------- basketball -------------------------------- */

type Side = 'home' | 'away';
const P = (id: string, fullName: string): Player => ({ id, fullName, sports: [] } as Player);
const ARJUN = P('p-arjun', 'Arjun'), BEN = P('p-ben', 'Ben'), XAVI = P('p-xavi', 'Xavi');
const SQUADS = withRosters(undefined, [ARJUN, BEN], [XAVI]);
const at = (a: ScoreAction, sec: number): ScoreAction => ({ ...a, payload: { ...a.payload, quarter: 1, minute: Math.floor(sec / 60), sec, v: 2 } });
const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(bbReducer, s);
const startBB = () => run(bbInit({ periodMinutes: 10, regPeriods: 4 }), lineupAction('home', [ARJUN, BEN]), lineupAction('away', [XAVI]), { type: 'KICKOFF', payload: { at: 1 } });
/** an offensive foul as an older build dispatched it (no stamp, fouls only) */
const oldOffensive = (side: Side, p: Player, sec: number): ScoreAction =>
  at({ type: 'FOUL', side, payload: { foulType: 'offensive', pid: p.id }, attribution: { playerId: p.id, stat: 'fouls' } }, sec);
/** sum the live attributions the actions carry, per player */
function liveSum(as: ScoreAction[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const a of as) for (const at2 of [a.attribution, a.attribution2]) {
    if (!at2) continue;
    const l = (out[at2.playerId] ??= {});
    l[at2.stat] = (l[at2.stat] ?? 0) + (at2.by ?? 1);
    for (const [k, v] of Object.entries(at2.extra ?? {})) l[k] = (l[k] ?? 0) + (v as number);
  }
  return out;
}

describe('basketball · an offensive foul is a turnover (BB1–BB7)', () => {
  test('BB1: a new offensive foul stamps tov and credits fouls + turnovers', () => {
    const a = foulAction('home', ARJUN, 'offensive');
    assert.equal(a.payload?.tov, true);
    const s = run(startBB(), at(a, 30));
    const e = s.events.at(-1)!;
    assert.equal(e.type, 'foul');
    assert.equal(e.tov, true);
    assert.deepEqual(bbCredits(e, false), { fouls: 1, turnovers: 1 });
    const t = basketballStatTotals(s)['p-arjun'].stats;
    assert.deepEqual([t.fouls, t.turnovers], [1, 1]);
    assert.equal(bbTeamFigures(s, 'home').tov, 1, 'team panel TO');
    assert.equal(bbTeamFigures(s, 'home').pf, 1, 'still a personal foul');
  });
  test('BB1: other foul types are not turnovers', () => {
    for (const ft of ['personal', 'shooting', 'technical', 'unsportsmanlike', 'disqualifying', 'flagrant'] as const) {
      const a = foulAction('home', ARJUN, ft);
      assert.equal(a.payload?.tov, undefined, ft);
      const s = run(startBB(), at(a, 30));
      assert.equal(s.events.at(-1)!.tov, undefined, ft);
      assert.deepEqual(bbCredits(s.events.at(-1)!, false), { fouls: 1 }, ft);
    }
  });
  test('BB2: an old unstamped offensive foul keeps its totals exactly', () => {
    const s = run(startBB(), oldOffensive('home', ARJUN, 30));
    const e = s.events.at(-1)!;
    assert.equal(e.tov, undefined);
    assert.deepEqual(bbCredits(e, false), { fouls: 1 });
    assert.equal(basketballStatTotals(s)['p-arjun'].stats.turnovers, 0);
    assert.equal(bbTeamFigures(s, 'home').tov, 0);
  });
  test('BB3: a tov stamp on a non-offensive foul is ignored', () => {
    const hostile = at({ type: 'FOUL', side: 'home', payload: { foulType: 'personal', pid: ARJUN.id, tov: true } }, 30);
    const s = run(startBB(), hostile);
    assert.equal(s.events.at(-1)!.tov, undefined);
    assert.equal(basketballStatTotals(s)['p-arjun'].stats.turnovers, 0);
    const odd = at({ type: 'FOUL', side: 'home', payload: { foulType: 'offensive', pid: ARJUN.id, tov: 'yes' } }, 31);
    assert.equal(run(startBB(), odd).events.at(-1)!.tov, undefined, 'only the literal true');
  });
  test('BB4: Remove reverses the turnover with the foul; an old foul\'s removal takes none', () => {
    const s = run(startBB(), at(foulAction('home', ARJUN, 'offensive'), 30));
    const r = removeAction(s.events.at(-1)!, ARJUN.id, { halfCourt: false, tracked: false });
    assert.deepEqual({ stat: r.attribution!.stat, by: r.attribution!.by, extra: r.attribution!.extra }, { stat: 'fouls', by: -1, extra: { turnovers: -1 } });
    const gone = bbReducer(s, r);
    assert.equal(gone.events.some((e) => e.type === 'foul'), false);
    const old = run(startBB(), oldOffensive('home', ARJUN, 30));
    const r2 = removeAction(old.events.at(-1)!, ARJUN.id, { halfCourt: false, tracked: false });
    assert.equal(r2.attribution!.extra, undefined);
    assert.equal(r2.attribution!.by, -1);
  });
  test('BB4: Edit (remove + re-enter) leaves one foul and one turnover', () => {
    const s = run(startBB(), at(foulAction('home', ARJUN, 'offensive'), 30));
    const e = s.events.at(-1)!;
    const edited = run(s, removeAction(e, ARJUN.id, { halfCourt: false, tracked: false }), at(foulAction('home', BEN, e.foulType!), 30));
    const t = basketballStatTotals(edited);
    assert.equal(t['p-arjun']?.stats.turnovers ?? 0, 0);
    assert.deepEqual([t['p-ben'].stats.fouls, t['p-ben'].stats.turnovers], [1, 1]);
  });
  test('BB5: the live credit equals statTotals', () => {
    const as = [at(foulAction('home', ARJUN, 'offensive'), 30), at(statAction('home', 'TURNOVER', ARJUN), 40), at(foulAction('away', XAVI, 'personal'), 50)];
    const s = run(startBB(), ...as);
    const live = liveSum(as);
    const t = basketballStatTotals(s);
    assert.deepEqual([live['p-arjun'].fouls, live['p-arjun'].turnovers], [t['p-arjun'].stats.fouls, t['p-arjun'].stats.turnovers]);
    assert.deepEqual([t['p-arjun'].stats.fouls, t['p-arjun'].stats.turnovers], [1, 2]);
    assert.equal(live['p-xavi'].turnovers, undefined);
  });
  test('BB6: commentary says turnover on a stamped offensive foul only', () => {
    const s = run(startBB(), at(foulAction('home', ARJUN, 'offensive'), 30), oldOffensive('home', BEN, 40));
    const [nw, old] = s.events.filter((e) => e.type === 'foul');
    assert.equal(describePlay(s, nw, 'Reds', {}, SQUADS), 'Offensive foul on Arjun · turnover');
    assert.equal(describePlay(s, old, 'Reds', {}, SQUADS), 'Offensive foul on Ben');
  });
  test('BB7: points off turnovers counts the window once', () => {
    const s = run(startBB(), at(foulAction('home', ARJUN, 'offensive'), 30), at(scoreAction('away', 2, XAVI), 40));
    const old = run(startBB(), oldOffensive('home', ARJUN, 30), at(scoreAction('away', 2, XAVI), 40));
    assert.equal(bbTeamFigures(s, 'away').offTo, 2);
    assert.equal(bbTeamFigures(old, 'away').offTo, 2);
    assert.equal([...possessionTags(s).values()].filter((t) => t.offTo).length, 1);
  });
});

/* --------------------------------- baseball --------------------------------- */

const ORDER = (p: string, n = 9) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i + 1}`, name: `${p.toUpperCase()}${i + 1}` }));
function startBS(config?: Record<string, unknown>): BaseballState {
  let s = bsInit(config);
  s = bsReducer(s, { type: 'LINEUP', payload: { team: 'home', order: ORDER('h', readConfig(config).lineupSize), pitcher: { id: 'hp', name: 'HP' } } });
  s = bsReducer(s, { type: 'LINEUP', payload: { team: 'away', order: ORDER('a', readConfig(config).lineupSize), pitcher: { id: 'ap', name: 'AP' } } });
  return s;
}

describe('baseball · K looking / K swinging (BS1–BS7)', () => {
  test('BS1: a quick-mode K looking stores pitch called; the commentary says looking', () => {
    const s0 = startBS();
    const a = buildPlay(s0, 'K', { pitch: 'called' });
    assert.equal(a.payload?.pitch, 'called');
    const s = bsReducer(s0, a);
    const e = s.events.at(-1)!;
    assert.equal(e.pitch, 'called');
    assert.match(paSentence(s, e), /strikes out looking/);
    const sw = bsReducer(s0, buildPlay(s0, 'K', { pitch: 'swinging' }));
    assert.match(paSentence(sw, sw.events.at(-1)!), /strikes out swinging/);
  });
  test('BS2: kLooking is credited to the batter on a called third strike only', () => {
    const s0 = startBS();
    const look = buildPlay(s0, 'K', { pitch: 'called' });
    assert.equal(look.attribution!.stat, 'plateAppearances');
    assert.equal((look.attribution!.extra as Record<string, number>).kLooking, 1);
    const swing = buildPlay(s0, 'K', { pitch: 'swinging' });
    assert.equal((swing.attribution!.extra as Record<string, number>).kLooking, undefined);
    // pitch mode: the third called strike
    let s = s0;
    for (const k of ['called', 'called', 'called'] as const) s = bsReducer(s, buildPitch(s, k));
    const t = baseballTotals(s);
    assert.deepEqual([t.a1.stats.strikeouts, t.a1.stats.kLooking], [1, 1]);
    assert.equal(teamSplit(s, 'away').kl, 1);
  });
  test('BS3: an old K (swinging, or no pitch) reads swinging and gains no kLooking', () => {
    const s0 = startBS();
    const old = buildPlay(s0, 'K');
    assert.equal(old.payload?.pitch, 'swinging', 'the default stays swinging');
    const noPitch: ScoreAction = { ...old, payload: { ...old.payload, pitch: undefined } };
    for (const a of [old, noPitch]) {
      const s = bsReducer(s0, a);
      assert.match(paSentence(s, s.events.at(-1)!), /strikes out swinging/);
      const t = baseballTotals(s);
      assert.deepEqual([t.a1.stats.strikeouts, t.a1.stats.kLooking], [1, undefined]);
    }
  });
  test('BS4: kLooking is a live key declared on the baseball schema, shown on the Stats tab', () => {
    assert.ok((LIVE_KEYS as readonly string[]).includes('kLooking'));
    const sch = STAT_SCHEMAS.baseball!;
    assert.ok(sch.stats.some((d) => d.key === 'kLooking'));
    assert.ok(sch.sections!.find((x) => x.id === 'batting')!.rows.some((r) => r.stat === 'kLooking'));
    let s = startBS();
    s = bsReducer(s, buildPlay(s, 'K', { pitch: 'called' }));
    const rows = baseballSheet(s).sections.flatMap((x) => x.rows);
    assert.ok(rows.some((r) => r.key === 'kl'), 'match Stats tab row');
    const plain = bsReducer(startBS(), buildPlay(startBS(), 'K', { pitch: 'swinging' }));
    assert.equal(baseballSheet(plain).sections.flatMap((x) => x.rows).some((r) => r.key === 'kl'), false, 'only when recorded');
  });
  test('BS5: Remove reverses kLooking (same credits)', () => {
    let s = startBS();
    s = bsReducer(s, buildPlay(s, 'K', { pitch: 'called' }));
    const c = bsCredits(s.events.at(-1)!);
    assert.equal(c.first!.stats.kLooking, 1);
  });
  test('BS6: a hostile pitch on a K never counts as looking', () => {
    const s0 = startBS();
    for (const pitch of ['ball', 'foul', 'inplay', 'CALLED', 'looking', 7]) {
      const a = buildPlay(s0, 'K');
      const s = bsReducer(s0, { ...a, payload: { ...a.payload, pitch } });
      assert.equal(baseballTotals(s).a1.stats.kLooking, undefined, String(pitch));
    }
  });
  test('BS7: the quick pad offers K swinging and K looking, one tap each', () => {
    const src = readFileSync(new URL('../src/sports/baseball/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /label="K swinging"[^\n]*outcome\('K', 'swinging'\)/);
    assert.match(src, /label="K looking"[^\n]*outcome\('K', 'called'\)/);
    assert.doesNotMatch(src, /label="Strikeout"/);
  });
});
