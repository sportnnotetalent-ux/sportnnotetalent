/**
 * Deep wave (volleyball-kabaddi) — volleyball at FIVB VIS depth.
 *  • "Stats to track" categories (attack / reception / dig / assist): format
 *    keys, SET_DETAIL patches, the inline On/Off chip, coverage per rally;
 *    older SD-81 logs keep their exact shape.
 *  • New optional detail entries: setter (assist), aced receiver, dig.
 *  • statTotals: digs / set assists / reception errors keyed by category,
 *    serve attempts only when every served rally names its server.
 *  • The scorer's clock on events (`at`), kept through an EDIT_LOG.
 *  • Rally-by-rally commentary, broadcast match stats (+ rotation analysis),
 *    the deep box, the Stats-to-track live settings.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as vb from '../src/sports/volleyball/engine.ts';
import {
  detailReducer, detailTally, initDetail, catCoveredAt, detailCats, catTracked, detailTracked, receptionTracked, acedTracked,
  receptionEfficiency, type VbDetailToggle,
} from '../src/sports/volleyball/detail.ts';
import { volleyballStatTotals, volleyballServeAttemptTotals, VOLLEYBALL_DERIVED_KEYS } from '../src/sports/volleyball/totals.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import { volleyballCommentary, rallySentence } from '../src/sports/volleyball/commentary.ts';
import { volleyballMatchStats } from '../src/sports/volleyball/matchStats.ts';
import { VOLLEYBALL_LIVE_SETTINGS } from '../src/sports/volleyball/settings.ts';
import { volleyballDeepBox, VOLLEYBALL_DEEP_BOX } from '../src/sports/volleyball/deepBox.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { planLiveApply } from '../src/sports/liveSettings.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { keyMoments, elapsedStamp, ratioRow, pctRow, rowLeader, rowShares, joinNames } from '../src/sports/netraid/feed.ts';
import { statSchema } from '../src/sports/statSchemas.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const P = (id: string, fullName: string) => ({ id, fullName });
const H = [P('h1', 'Asha'), P('h2', 'Bela'), P('h3', 'Chitra'), P('h4', 'Diya'), P('h5', 'Esha'), P('h6', 'Fara')];
const A = [P('a1', 'Uma'), P('a2', 'Vani'), P('a3', 'Wren'), P('a4', 'Xia'), P('a5', 'Yami'), P('a6', 'Zoya')];
const court = (ps: typeof H) => ps.map((p) => ({ id: p.id, name: p.fullName }));
const play = (acts: ScoreAction[], cfg?: Record<string, unknown>) => acts.reduce(vb.reducer, vb.init(cfg));
const lineup: ScoreAction[] = [
  { type: 'LINEUP', payload: { team: 'home', players: court(H) } },
  { type: 'LINEUP', payload: { team: 'away', players: court(A) } },
];
const det = (kind: string, side: Side, p: { id: string; fullName: string }, q?: string): ScoreAction =>
  ({ type: 'VB_DETAIL', side, payload: { kind, player: { playerId: p.id, playerName: p.fullName }, ...(q ? { q } : {}) } });
const NAMES = { home: 'Italy', away: 'Poland' };
/** IDs-only scoring: the scorer's actions carry ids; the commentary names
 *  players from the squads by id (the live screen passes the viewer's `nameOf`). */
const SQUADS = { ...NAMES, homeRoster: H, awayRoster: A };

describe('deep wave · Stats to track categories', () => {
  test('format keys: none → nothing stamped; legacy detail → SD-81 shape; categories → cats', () => {
    assert.deepEqual(initDetail({}), {});
    assert.deepEqual(initDetail({ detail: true }), { detail: [{ set: 1, at: 0, on: true }] });
    assert.deepEqual(initDetail({ vbDig: true, vbAssist: true }), { detail: [{ set: 1, at: 0, on: true, cats: ['dig', 'assist'] }] });
    // the legacy key + a category switched off over it
    assert.deepEqual(initDetail({ detail: true, vbReception: false, vbDig: true }), { detail: [{ set: 1, at: 0, on: true, cats: ['attack', 'dig'] }] });
    assert.deepEqual(initDetail({ vbDig: false }), {});
    assert.equal('detail' in vb.init({ preset: 'indoor' }), false); // older states keep their shape
  });

  test('an SD-81 log replays to exactly its old shape (no cats)', () => {
    const s = play([...lineup, { type: 'SET_DETAIL', payload: { detail: true } }, vb.outcomeAction('attack', 'home', H[0]), { type: 'SET_DETAIL', payload: { detail: false } }]);
    assert.deepEqual(s.detail, [{ set: 1, at: 0, on: true }, { set: 1, at: 1, on: false }]);
    assert.deepEqual(detailCats(s), []);
  });

  test('a settings patch switches categories from the next rally; coverage per rally', () => {
    let s = play([...lineup, vb.outcomeAction('attack', 'home', H[0])]);
    s = vb.reducer(s, { type: 'SET_DETAIL', payload: { vbDig: true } });
    assert.deepEqual(s.detail, [{ set: 1, at: 1, on: true, cats: ['dig'] }]);
    s = vb.reducer(s, vb.outcomeAction('attack', 'home', H[0]));
    s = vb.reducer(s, { type: 'SET_DETAIL', payload: { vbAttack: true } });
    assert.deepEqual(detailCats(s), ['attack', 'dig']);
    // the same patch twice is a no-op
    assert.equal(vb.reducer(s, { type: 'SET_DETAIL', payload: { vbAttack: true } }), s);
    assert.equal(catCoveredAt(s, 'dig', 1, 0), false);
    assert.equal(catCoveredAt(s, 'dig', 1, 1), true);
    assert.equal(catCoveredAt(s, 'attack', 1, 1), false);
    assert.equal(catCoveredAt(s, 'attack', 1, 2), true);
    // the inline chip: Off, then On brings the chosen categories back
    s = vb.reducer(s, { type: 'SET_DETAIL', payload: { detail: false } });
    assert.deepEqual(detailCats(s), []);
    s = vb.reducer(s, { type: 'SET_DETAIL', payload: { detail: true } });
    assert.deepEqual(detailCats(s), ['attack', 'dig']);
    // no-false-zeros NZC1: switched on with no dig captured isn't tracked (was true)
    assert.equal(catTracked(s, 'dig'), false);
    assert.equal(catTracked(s, 'assist'), false);
  });

  test('live settings: read / defaults; event mode logs SET_DETAIL after the first point', () => {
    const fresh = vb.init({});
    const ls = VOLLEYBALL_LIVE_SETTINGS;
    // batch 5: + the "Who was aced?" category (off on a format without the key)
    assert.deepEqual(ls.read(fresh), { vbAttack: false, vbReception: false, vbDig: false, vbAssist: false, vbAced: false });
    assert.deepEqual(planLiveApply(ls, fresh, 0, ls.read(fresh), { ...ls.read(fresh), vbDig: true }), { kind: 'format', patch: { vbDig: true } });
    const live = play([vb.outcomeAction('attack', 'home')]);
    const plan = planLiveApply(ls, live, 1, ls.read(live), { ...ls.read(live), vbReception: true });
    assert.deepEqual(plan, { kind: 'event', action: { type: 'SET_DETAIL', payload: { vbReception: true } } });
    const after = vb.reducer(live, (plan as { action: ScoreAction }).action);
    assert.deepEqual(ls.read(after), { vbAttack: false, vbReception: true, vbDig: false, vbAssist: false, vbAced: false });
    assert.deepEqual(ls.read(vb.init({ detail: true })), { vbAttack: true, vbReception: true, vbDig: false, vbAssist: false, vbAced: false });
  });
});

describe('deep wave · new detail entries', () => {
  const base = () => play([...lineup, { type: 'SET_DETAIL', payload: { vbAttack: true, vbReception: true, vbDig: true, vbAssist: true } }]);

  test('assist annotates the last Attack point, aced the last Ace; a second tap replaces; wrong point → ignored', () => {
    let s = base();
    s = vb.reducer(s, vb.outcomeAction('attack', 'home', H[0]));
    s = vb.reducer(s, det('assist', 'home', H[1]));
    s = vb.reducer(s, det('assist', 'home', H[2])); // replaces
    assert.deepEqual(s.vd, [{ kind: 'assist', side: 'home', set: 1, at: 1, playerName: 'Chitra', playerId: 'h3' }]);
    // aced needs an Ace as the last point
    assert.equal(vb.reducer(s, det('aced', 'away', A[0])), s);
    s = vb.reducer(s, vb.outcomeAction('ace', 'home', H[3]));
    s = vb.reducer(s, det('aced', 'away', A[0]));
    assert.equal(s.vd!.at(-1)!.kind, 'aced');
    assert.equal(s.vd!.at(-1)!.at, 2);
    // a dig sits on the rally in play
    s = vb.reducer(s, det('dig', 'away', A[4]));
    assert.deepEqual(s.vd!.at(-1), { kind: 'dig', side: 'away', set: 1, at: 2, playerName: 'Yami', playerId: 'a5' });
    // unknown kinds are ignored
    assert.equal(vb.reducer(s, det('toString', 'home', H[0])), s);
  });

  test('tally: digs, set assists, reception errors (counted in receptions), efficiency', () => {
    let s = base();
    s = vb.reducer(s, det('reception', 'away', A[0], 'perfect'));
    s = vb.reducer(s, vb.outcomeAction('attack', 'away', A[1]));
    s = vb.reducer(s, det('assist', 'away', A[2]));
    s = vb.reducer(s, vb.outcomeAction('ace', 'home', H[0]));
    s = vb.reducer(s, det('aced', 'away', A[0]));
    s = vb.reducer(s, det('dig', 'home', H[5]));
    const t = detailTally(s); // IDs-only scoring: keyed "side|player id"
    const uma = t.get('away|a1')!;
    assert.equal(uma.receptions, 2);
    assert.equal(uma.receptionsPerfect, 1);
    assert.equal(uma.receptionErrors, 1);
    assert.equal(receptionEfficiency(uma), 0);
    assert.equal(t.get('away|a3')!.setAssists, 1);
    assert.equal(t.get('home|h6')!.digs, 1);
    assert.equal(t.get('away|a2')!.attackKills, 1); // attack was on for that rally
  });
});

describe('deep wave · statTotals (keyed, absolute)', () => {
  test('digs / set assists / reception errors only for a match that tracked them', () => {
    const plain = play([...lineup, vb.outcomeAction('attack', 'home', H[0])]);
    const t0 = volleyballStatTotals(plain);
    assert.equal('digs' in t0.h1.stats, false);
    assert.equal('setAssists' in t0.h1.stats, false);
    assert.equal('receptionErrors' in t0.h1.stats, false);
    let s = play([...lineup, { type: 'SET_DETAIL', payload: { vbDig: true, vbAssist: true } }, vb.outcomeAction('attack', 'home', H[0])]);
    s = vb.reducer(s, det('assist', 'home', H[1]));
    s = vb.reducer(s, det('dig', 'away', A[2]));
    const t = volleyballStatTotals(s);
    assert.equal(t.h2.stats.setAssists, 1);
    assert.equal(t.a3.stats.digs, 1);
    assert.equal(t.h1.stats.digs, 0); // tracked → a real 0 on every line
    assert.equal('receptionErrors' in t.h1.stats, false); // reception wasn't tracked
    assert.equal('attackAttempts' in t.h1.stats, false); // nor attack attempts
  });

  test('an SD-81 match that graded receptions keeps exactly its old keys (no reception errors)', () => {
    let s = play([...lineup, { type: 'SET_DETAIL', payload: { detail: true } }]);
    s = vb.reducer(s, det('reception', 'home', H[0], 'good'));
    s = vb.reducer(s, vb.outcomeAction('attack', 'home', H[1]));
    assert.equal(receptionTracked(s), true);
    assert.equal(acedTracked(s), false);
    assert.equal(detailTracked(s), true);
    const t = volleyballStatTotals(s);
    assert.equal(t.h1.stats.receptions, 1);
    assert.equal('receptionErrors' in t.h1.stats, false);
    assert.equal('digs' in t.h1.stats, false);
  });

  test('serve attempts: every served rally names its server → per server; otherwise not tracked', () => {
    const rot: ScoreAction[] = [
      ...lineup,
      { type: 'SET_SERVE', payload: { side: 'home' } },
      { type: 'SET_ROTATION', payload: { team: 'home', players: court(H) } },
      { type: 'SET_ROTATION', payload: { team: 'away', players: court(A) } },
    ];
    const s = play([...rot, vb.outcomeAction('attack', 'home', H[1]), vb.outcomeAction('attack', 'away', A[1]), vb.outcomeAction('attack', 'away', A[2])]);
    const t = volleyballStatTotals(s);
    assert.equal(t.h1.stats.serveAttempts, 2); // Asha served rallies 1 and 2
    assert.equal(t.a2.stats.serveAttempts, 1); // side-out: away rotates, Vani (II → I) serves rally 3 (FIVB 7.6.2)
    assert.equal(t.a1.stats.serveAttempts, 0); // Uma (I at the toss) hasn't served yet
    assert.equal(t.h2.stats.serveAttempts, 0);
    // no toss → nothing; one side's order unknown → nothing
    assert.deepEqual(volleyballServeAttemptTotals(play([...lineup, vb.outcomeAction('attack', 'home', H[0])]), {}), {});
    const half = play([...lineup, { type: 'SET_SERVE', payload: { side: 'home' } }, { type: 'SET_ROTATION', payload: { team: 'home', players: court(H) } }, vb.outcomeAction('attack', 'away', A[0]), vb.outcomeAction('attack', 'away', A[0])]);
    assert.deepEqual(volleyballServeAttemptTotals(half, {}), {});
  });
});

describe('deep wave · statTotals contract (SD-19 harness)', () => {
  test('a match with every category, the toss and rotation: live keys = credits on every prefix; new keys derived ≥ 0', () => {
    const DERIVED = new Set([...VOLLEYBALL_DERIVED_KEYS, 'attackAttempts', 'attackKills', 'attackErrors', 'attacksBlocked', 'receptions', 'receptionsPerfect', 'receptionsPositive', 'receptionErrors', 'digs', 'setAssists', 'serveAttempts']);
    const sp: TotalsSport<vb.VolleyballState> = {
      name: 'volleyball', init: vb.init, reducer: vb.reducer, statTotals: volleyballStatTotals, partial: true,
      derived: (k) => DERIVED.has(k), ctx: { players: { home: court(H), away: court(A) } },
    };
    const acts: ScoreAction[] = [
      ...lineup,
      { type: 'SET_SERVE', payload: { side: 'home' } },
      { type: 'SET_ROTATION', payload: { team: 'home', players: court(H) } },
      { type: 'SET_ROTATION', payload: { team: 'away', players: court(A) } },
      { type: 'SET_DETAIL', payload: { vbAttack: true, vbReception: true, vbDig: true, vbAssist: true } },
      det('reception', 'away', A[0], 'good'), det('dig', 'home', H[4]),
      vb.outcomeAction('attack', 'away', A[1]), det('assist', 'away', A[2]),
      vb.outcomeAction('ace', 'away', A[1]), det('aced', 'home', H[3]),
      vb.outcomeAction('block', 'home', H[2]), det('blocked', 'away', A[3]),
      vb.outcomeAction('serveerror', 'away', undefined, { by: H[2] }),
      vb.outcomeAction('opperror', 'away', undefined, { err: 'attackout', by: H[0] }),
    ];
    const t = assertContract(sp, toRecords(acts), { every: 1 });
    assert.equal(t.a3.stats.setAssists, 1);
    assert.equal(t.h4.stats.receptionErrors, 1);
    assert.equal(t.h5.stats.digs, 1);
    assert.ok(Object.values(t).every((x) => typeof x.stats.serveAttempts === 'number'));
  });
});

describe('deep wave · the scorer clock (at)', () => {
  test('stampAction stamps scoring steps only; events carry it; EDIT_LOG keeps it', () => {
    assert.equal(vb.stampAction({ type: 'ATTACK', side: 'home' }, 5).payload?.at, 5);
    assert.equal(vb.stampAction({ type: 'SET_DETAIL', payload: { detail: true } }, 5).payload?.at, undefined);
    assert.equal(vb.stampAction({ type: 'ATTACK', side: 'home', payload: { at: 3 } }, 5).payload?.at, 3);
    const t0 = Date.UTC(2026, 0, 1, 10);
    const s = play([vb.stampAction(vb.outcomeAction('attack', 'home'), t0), vb.stampAction(vb.outcomeAction('ace', 'away'), t0 + 60_000), vb.stampAction({ type: 'TIMEOUT', side: 'home' }, t0 + 120_000)]);
    assert.deepEqual(s.events.map((e) => e.at), [t0, t0 + 60_000, t0 + 120_000]);
    // an unstamped (older) log carries none
    assert.equal(play([vb.outcomeAction('attack', 'home')]).events[0].at, undefined);
    // a correction keeps the stamps
    const pts = pointInputs(s.events).map((p, i) => (i === 0 ? { ...p, side: 'away' as const } : p));
    const e = vb.reducer(s, { type: 'EDIT_LOG', payload: { points: pts } });
    assert.deepEqual(e.events.filter((x) => x.kind !== 'timeout').map((x) => x.at), [t0, t0 + 60_000]);
  });
});

describe('deep wave · commentary', () => {
  test('sentences per outcome', () => {
    const e = (kind: string, side: Side, extra: Record<string, unknown> = {}) => ({ id: 1, stamp: 'Set 1', icon: '', label: '', side, kind, ...extra });
    assert.equal(rallySentence(e('attack', 'home', { playerName: 'Michieletto' }), NAMES, { setter: 'Giannelli' }), 'Point Italy — kill by Michieletto (set by Giannelli)');
    assert.equal(rallySentence(e('attack', 'home'), NAMES), 'Point Italy — attack kill');
    assert.equal(rallySentence(e('block', 'away', { playerName: 'Kochanowski' }), NAMES, { blocked: 'Romanò' }), 'Point Poland — block by Kochanowski, stuffing Romanò');
    assert.equal(rallySentence(e('ace', 'home'), NAMES, { server: 'Anzani', aced: 'Popiwczak' }), "Point Italy — ace by Anzani; Popiwczak couldn't receive it");
    assert.equal(rallySentence(e('opperror', 'home', { oe: { type: 'attackout', playerName: 'Leon' } }), NAMES), 'Point Italy — attack out by Leon (Poland)');
    assert.equal(rallySentence(e('opperror', 'home', { oe: { type: 'net' } }), NAMES), 'Point Italy — net touch by Poland');
    assert.equal(rallySentence(e('opperror', 'away'), NAMES), 'Point Poland — Italy error');
    assert.equal(rallySentence(e('serveerror', 'home', { oe: { playerName: 'Kurek' } }), NAMES), 'Point Italy — service error by Kurek (Poland)');
    assert.equal(rallySentence(e('serveerror', 'home'), NAMES), 'Point Italy — service error by Poland');
    assert.equal(rallySentence(e('point', 'away'), NAMES), 'Point Poland');
    assert.equal(rallySentence(e('point', 'home', { pen: { level: 'point', by: 'away', playerName: 'Leon', reason: 'Rude conduct' } }), NAMES), 'Point Italy — penalty against Poland (Leon): rude conduct');
  });

  test('grouped by set, newest first; running score, set point / saved, runs, subs, timeouts', () => {
    const acts: ScoreAction[] = [...lineup];
    for (let i = 0; i < 24; i++) acts.push(vb.outcomeAction('attack', 'home', H[0]));
    acts.push(vb.outcomeAction('block', 'away', A[2]));
    acts.push({ type: 'TIMEOUT', side: 'home' });
    acts.push({ type: 'SUB', side: 'home', payload: { off: { id: 'h2', name: 'Bela' }, on: { id: 'h9', name: 'Ira' }, kind: 'regular' } });
    acts.push(vb.outcomeAction('opperror', 'home', undefined, { err: 'net', by: A[0] }));
    acts.push(vb.outcomeAction('serveerror', 'away'));
    const s = play(acts, { setsToWin: 2 });
    const g = volleyballCommentary(s, SQUADS);
    assert.deepEqual(g.map((x) => x.title), ['Set 2', 'Set 1']);
    assert.equal(g[1].sub, 'Italy won 25-1');
    const set1 = g[1].entries;
    assert.equal(set1[0].text, 'Set 1 to Italy, 25-1');
    assert.equal(set1[1].text, 'Point Italy — net touch by Uma (Poland)');
    assert.equal(set1[1].score, '25-1');
    assert.equal(set1[2].text, 'Substitution Italy: Ira in for Bela');
    assert.equal(set1[3].text, 'Timeout Italy');
    assert.equal(set1[4].text, 'Point Poland — block by Wren');
    assert.deepEqual(set1[4].tags, ['Set point saved', 'SET POINT ITALY']);
    assert.equal(set1[4].key, true);
    const p24 = set1.find((e) => e.score === '24-0')!;
    assert.ok(p24.tags!.includes('SET POINT ITALY') && p24.tags!.includes('24 in a row'));
    assert.equal(g[0].entries[0].text, 'Point Poland — service error by Italy');
    assert.equal(g[0].sub, 'In play · 0-1');
    // key moments keep the big ones only
    assert.ok(keyMoments(g).every((x) => x.entries.every((e) => e.key)));
  });

  test('rally detail (server, receptions, digs), elapsed minute, the match result', () => {
    const t0 = Date.UTC(2026, 0, 1, 10);
    let s = play([
      ...lineup,
      { type: 'SET_SERVE', payload: { side: 'away' } },
      { type: 'SET_ROTATION', payload: { team: 'away', players: court(A) } },
      { type: 'SET_DETAIL', payload: { vbReception: true, vbDig: true, vbAssist: true } },
    ], { setsToWin: 1, pointsPerSet: 2 });
    s = vb.reducer(s, det('reception', 'home', H[3], 'perfect'));
    s = vb.reducer(s, det('dig', 'away', A[5]));
    s = vb.reducer(s, vb.stampAction(vb.outcomeAction('attack', 'home', H[0]), t0));
    s = vb.reducer(s, det('assist', 'home', H[1]));
    s = vb.reducer(s, vb.stampAction(vb.outcomeAction('ace', 'home', H[0]), t0 + 3 * 60_000));
    const g = volleyballCommentary(s, SQUADS);
    const kill = g[0].entries.find((e) => e.text.includes('kill'))!;
    assert.equal(kill.text, 'Point Italy — kill by Asha (set by Bela)');
    assert.equal(kill.detail, '🏐 Uma serving · reception # Diya · dig Zoya');
    assert.equal(kill.stamp, '0′');
    const ace = g[0].entries.find((e) => e.text.includes('ace'))!;
    assert.equal(ace.stamp, '3′');
    assert.equal(g[0].entries[0].text, 'Italy win the match 1-0 sets');
    assert.equal(g[0].sub, 'Italy won 2-0 · 3 min');
  });
});

describe('deep wave · match stats', () => {
  test('scoring by skill, opponent errors split only when typed, aces conceded, game flow', () => {
    const s = play([
      vb.outcomeAction('attack', 'home'), vb.outcomeAction('attack', 'home'), vb.outcomeAction('block', 'home'),
      vb.outcomeAction('ace', 'away'), vb.outcomeAction('serveerror', 'home'), vb.outcomeAction('opperror', 'away', undefined, { err: 'attackout' }),
    ]);
    const st = volleyballMatchStats(s);
    const row = (cat: string, key: string) => st.cats.find((c) => c.id === cat)!.rows.find((r) => r.key === key)!;
    assert.deepEqual([row('scoring', 'pts').home, row('scoring', 'pts').away], ['4', '2']);
    assert.deepEqual([row('scoring', 'opp').home, row('scoring', 'opp').away], ['1', '1']);
    assert.deepEqual([row('scoring', 'oppAtk').home, row('scoring', 'oppAtk').away], ['0', '1']);
    assert.equal(row('scoring', 'own').home, '75%');
    assert.deepEqual([row('attack', 'attErr').home, row('attack', 'attErr').away], ['1', '0']); // home hit out
    assert.equal(row('attack', 'attErr').better, 'lower');
    assert.deepEqual([row('attack', 'stuffed').home, row('attack', 'stuffed').away], ['0', '1']);
    assert.deepEqual([row('reception', 'acedAgainst').home, row('reception', 'acedAgainst').away], ['1', '0']);
    assert.equal(st.cats.find((c) => c.id === 'serve')!.rows.some((r) => r.key === 'srvAtt'), false); // no toss
    assert.deepEqual([row('flow', 'run').home, row('flow', 'run').away], ['3', '1']);
    // untyped faults: one combined row, no attack-error row
    const u = volleyballMatchStats(play([vb.outcomeAction('opperror', 'home'), vb.outcomeAction('attack', 'away')]));
    assert.ok(u.cats.find((c) => c.id === 'scoring')!.rows.some((r) => r.key === 'oppOther'));
    assert.equal(u.cats.find((c) => c.id === 'attack')!.rows.some((r) => r.key === 'attErr'), false);
  });

  test('with the toss + rotation: serve attempts, side-out %, rotation analysis, by server; per set', () => {
    const s = play([
      ...lineup,
      { type: 'SET_SERVE', payload: { side: 'home' } },
      { type: 'SET_ROTATION', payload: { team: 'home', players: court(H) } },
      { type: 'SET_ROTATION', payload: { team: 'away', players: court(A) } },
      vb.outcomeAction('attack', 'home', H[1]), // Asha serves, home wins (break)
      vb.outcomeAction('ace', 'home', H[0]), // Asha ace
      vb.outcomeAction('attack', 'away', A[1]), // side-out away (Uma's rotation receiving)
      vb.outcomeAction('serveerror', 'home'), // Vani serves, misses → home side-out
    ], { setsToWin: 2 });
    const st = volleyballMatchStats(s);
    const row = (cat: string, key: string) => st.cats.find((c) => c.id === cat)!.rows.find((r) => r.key === key)!;
    assert.deepEqual([row('serve', 'srvAtt').home, row('serve', 'srvAtt').away], ['3', '1']);
    assert.equal(row('serve', 'srvWon').home, '2/3 (67%)');
    assert.equal(row('reception', 'sideOut').away, '1/3 (33%)');
    assert.equal(row('reception', 'sideOut').home, '1/1 (100%)');
    assert.deepEqual(st.servers.map((x) => [x.name, x.serves, x.won, x.aces, x.errors]), [['Asha', 3, 2, 1, 0], ['Vani', 1, 0, 0, 1]]);
    const homeRot = st.rotations.home!;
    assert.deepEqual(homeRot.map((r) => [r.name, r.played, r.won, r.srvPlayed, r.srvWon, r.rcvPlayed, r.rcvWon]), [['Asha', 4, 3, 3, 2, 1, 1]]);
    assert.deepEqual(st.rotations.away!.map((r) => r.name), ['Uma', 'Vani']);
    // a set filter
    assert.equal(volleyballMatchStats(s, 2).rallies, 0);
  });

  test('detail rows show only with the category; efficiency signed', () => {
    let s = play([...lineup, { type: 'SET_DETAIL', payload: { vbAttack: true, vbDig: true } }]);
    s = vb.reducer(s, det('inplay', 'home', H[0]));
    s = vb.reducer(s, vb.outcomeAction('attack', 'home', H[0]));
    s = vb.reducer(s, det('dig', 'away', A[0]));
    const st = volleyballMatchStats(s);
    const atk = st.cats.find((c) => c.id === 'attack')!.rows;
    assert.equal(atk.find((r) => r.key === 'attempts')!.home, '2');
    assert.equal(atk.find((r) => r.key === 'eff')!.home, '+50%');
    assert.deepEqual(st.cats.find((c) => c.id === 'defence')!.rows.map((r) => [r.key, r.home, r.away]), [['digs', '0', '1']]);
    assert.equal(st.cats.find((c) => c.id === 'reception')!.rows.some((r) => r.key === 'graded'), false);
  });
});

describe('deep wave · deep box, schema, shared helpers', () => {
  test('the deep box shows digs / set assists / serve attempts only when captured', () => {
    const plain = play([...lineup, vb.outcomeAction('attack', 'home', H[0])]);
    const t0 = buildBoxTable(VOLLEYBALL_DEEP_BOX, volleyballDeepBox(plain, { homeRoster: H as never, awayRoster: A as never }).data('all'));
    assert.deepEqual(t0.columns.map((c) => c.abbr), ['PTS', 'ATK', 'BLK', 'ACE']);
    let s = play([...lineup, { type: 'SET_DETAIL', payload: { vbDig: true, vbAssist: true } }, vb.outcomeAction('attack', 'home', H[0])]);
    s = vb.reducer(s, det('assist', 'home', H[1]));
    s = vb.reducer(s, det('dig', 'away', A[3]));
    const t = buildBoxTable(VOLLEYBALL_DEEP_BOX, volleyballDeepBox(s, { homeRoster: H as never, awayRoster: A as never }).data('all'));
    assert.deepEqual(t.columns.map((c) => c.abbr), ['PTS', 'ATK', 'BLK', 'ACE', 'DIG', 'SET']);
    const bela = t.home.rows.find((r) => r.name === 'Bela')!;
    assert.equal(bela.playerId, 'h2');
    assert.equal(bela.cells[5], '1');
  });

  test('schemas validate; the new keys are labelled; leaders / awards resolve', () => {
    assert.deepEqual(validateSchema(VOLLEYBALL_DEEP_BOX), []);
    const sch = statSchema('volleyball')!;
    for (const k of ['digs', 'setAssists', 'receptionErrors', 'serveAttempts', 'digsPerSet', 'setAssistsPerSet', 'receptionEff', 'aceRate']) {
      assert.ok(sch.stats.find((d) => d.key === k)?.label, k);
    }
    assert.ok(sch.awards.some((a) => a.tournamentLabel === 'Best digger' && a.rankBy === 'digsPerSet' && a.match === false));
  });

  test('feed helpers', () => {
    assert.equal(elapsedStamp(180_000, 0), '3′');
    assert.equal(elapsedStamp(undefined, 0), undefined);
    assert.equal(joinNames(['A', 'B', 'C']), 'A, B and C');
    assert.deepEqual(ratioRow('k', 'L', 1, 4, 0, 0).home, '1/4 (25%)');
    assert.deepEqual(ratioRow('k', 'L', 1, 4, 0, 0).away, '–');
    assert.equal(pctRow('k', 'L', -1, 4, 1, 4, { signed: true }).home, '-25%');
    assert.equal(rowLeader({ h: 1, a: 3, better: 'lower', home: '1', away: '3' }), 'home');
    assert.equal(rowLeader({ h: 1, a: 3, home: '1', away: '3' }), 'away');
    assert.deepEqual(rowShares({ h: 0, a: 0 }), { home: 0.5, away: 0.5 });
  });

  test('a toggle without cats reads as attack + reception (SD-81)', () => {
    const t: VbDetailToggle = { set: 1, at: 0, on: true };
    const s = { ...vb.init({}), detail: [t] };
    assert.deepEqual(detailCats(s), ['attack', 'reception']);
    assert.equal(detailReducer(s, { type: 'ATTACK', side: 'home' }), null);
  });
});
