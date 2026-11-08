/**
 * Wave 2 — describe cards for the court-team family
 * (docs/security/breaks/describe-court-team.md, DC1…DC17):
 *  - netball: the goal / miss / deflection / turnover is logged on the tap; the
 *    feeder, rebound, outcome and turnover type are attached after by DESCRIBE;
 *  - volleyball: one "Last point" card; a VB_DETAIL names the point it describes;
 *  - kabaddi: "Tackled by?" with Done / Saved / Edit (rename through the raid edit).
 * Ends with a 600-scorer simulation: random plays, detail later or never,
 * undos — the score is always right, and stats / careers / commentary equal
 * the old flow's.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ScoreAction, Attribution } from '../src/sports/types.ts';
import * as nb from '../src/sports/netball/engine.ts';
import { netballTotals } from '../src/sports/netball/totals.ts';
import { netballFeed } from '../src/sports/netball/commentary.ts';
import { netballVoice } from '../src/sports/netball/voice.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { detailAction } from '../src/sports/volleyball/actions.ts';
import { lastScored } from '../src/sports/volleyball/detail.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import * as kb from '../src/sports/kabaddi/engine.ts';
import { kabaddiTotals } from '../src/sports/kabaddi/totals.ts';

type Side = 'home' | 'away';
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/* ================================ netball ================================ */

const POS: nb.Pos[] = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'];
const ROSTER: Record<Side, string[]> = { home: ['hgs', 'hga', 'hwa', 'hc', 'hwd', 'hgd', 'hgk'], away: ['ags', 'aga', 'awa', 'ac', 'awd', 'agd', 'agk'] };
const DEEP = { detail: true, trackGains: true, trackTurnovers: true };
const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, pos: Object.fromEntries(POS.map((p, i) => [p, { id: ROSTER[team][i] }])) } });
const nbStart = (cfg: Record<string, unknown> = DEEP) => [xi('home'), xi('away'), { type: 'FIRST_CENTRE', side: 'home' } as ScoreAction].reduce(nb.reducer, nb.init(cfg));
const credit = (e: Parameters<typeof nb.eventCredits>[0]) => {
  const cr = nb.eventCredits(e);
  return { attribution: nb.creditAttribution(cr.first, 1, [...nb.LIVE_KEYS]), attribution2: nb.creditAttribution(cr.second, 1, [...nb.LIVE_KEYS]) };
};
/** the tap, as the controls fire it (no detail) */
const tapGoal = (side: Side, uid: string, sec: number, pos: 'GS' | 'GA' = 'GS', feeder?: string): ScoreAction =>
  ({ type: 'GOAL', side, payload: { pos, uid, sec, period: 1 }, ...credit({ type: 'goal', playerId: ROSTER[side][pos === 'GS' ? 0 : 1], secondId: feeder }) });
const tapMiss = (side: Side, uid: string, sec: number, pos: 'GS' | 'GA' = 'GS', feeder?: string): ScoreAction =>
  ({ type: 'MISS', side, payload: { pos, uid, sec, period: 1 }, ...credit({ type: 'miss', playerId: ROSTER[side][pos === 'GS' ? 0 : 1], secondId: feeder }) });
const tapStat = (side: Side, uid: string, sec: number, kind: nb.StatKind, who: string, extra: Record<string, unknown> = {}): ScoreAction =>
  ({ type: 'STAT', side, payload: { kind, uid, sec, period: 1, ...extra }, ...credit({ type: 'stat', stat: kind, playerId: who }) });
const rebStat = (side: Side, uid: string, sec: number, who: string, ref: string): ScoreAction =>
  ({ type: 'STAT', side, payload: { kind: 'rebound', ref, uid, sec, period: 1 }, ...credit({ type: 'stat', stat: 'rebound', playerId: who }) });
const apply = <S,>(r: (s: S, a: ScoreAction) => S, s: S, acts: (ScoreAction | null | undefined)[]) => acts.reduce((x, a) => (a ? r(x, a) : x), s);
const sumCredits = (log: ScoreAction[]) => {
  const m = new Map<string, number>();
  const add = (c?: Attribution) => {
    if (!c?.playerId) return;
    const k = `${c.playerId}|${c.stat}`; m.set(k, (m.get(k) ?? 0) + Number(c.by ?? 1));
    for (const [x, v] of Object.entries(c.extra ?? {})) m.set(`${c.playerId}|${x}`, (m.get(`${c.playerId}|${x}`) ?? 0) + v);
  };
  for (const a of log) { add(a.attribution); add(a.attribution2); }
  return Object.fromEntries([...m].filter(([, v]) => v !== 0).sort());
};
const NAMES = { home: 'Sharks', away: 'Kites' };

describe('netball · the play on the tap, the detail after (DC1–DC3)', () => {
  test('DC1: a goal is on the board at the tap; DESCRIBE feed attaches the feeder and credits them', () => {
    const s1 = nb.reducer(nbStart(), tapGoal('home', 'g1', 10));
    assert.equal(s1.home, 1);
    const a = nb.describeAction(s1, 'g1', { feed: 'hwa' })!;
    assert.equal(a.type, 'DESCRIBE');
    assert.deepEqual(a.payload, { id: 'g1', field: 'feed', value: 'hwa' });
    assert.equal(a.attribution?.playerId, 'hwa');
    assert.equal(a.attribution?.stat, 'goalAssists');
    assert.deepEqual(a.attribution?.extra, { feeds: 1 });
    const s2 = nb.reducer(s1, a);
    assert.equal(s2.home, 1, 'the score does not move');
    assert.equal(s2.events.at(-1)!.secondId, 'hwa');
  });
  test('DC2: the rebound is attached after, right after its miss, as a linked rebound', () => {
    let s = apply(nb.reducer, nbStart(), [tapMiss('away', 'm1', 20), tapStat('home', 'i1', 25, 'intercept', 'hgd')]);
    const a = nb.describeAction(s, 'm1', { rebound: { side: 'home', playerId: 'hgk', uid: 'r1' } })!;
    assert.equal(a.side, 'home');
    assert.equal(a.attribution?.playerId, 'hgk');
    assert.equal(a.attribution?.stat, 'rebounds');
    s = nb.reducer(s, a);
    const i = s.events.findIndex((e) => e.id === 'm1');
    assert.deepEqual({ ...s.events[i + 1] }, { id: 'r1', sec: 20, period: 1, type: 'stat', side: 'home', stat: 'rebound', playerId: 'hgk', ref: 'm1' });
    assert.equal(nb.reboundOf(s, 'm1')?.playerId, 'hgk');
  });
  test('DC3: a deflection\'s outcome and a turnover\'s type are attached after', () => {
    let s = apply(nb.reducer, nbStart(), [tapStat('away', 'd1', 30, 'deflection', 'agk'), tapStat('home', 't1', 40, 'turnover', 'hwa')]);
    s = apply(nb.reducer, s, [nb.describeAction(s, 'd1', { gain: true }), nb.describeAction(s, 't1', { tt: 'footwork' })]);
    assert.equal(s.events.find((e) => e.id === 'd1')!.gain, true);
    assert.equal(s.events.find((e) => e.id === 't1')!.tt, 'footwork');
    // no live credit for an outcome or a type (statTotals-only keys)
    assert.equal(nb.describeAction(s, 'd1', { gain: false })!.attribution, undefined);
    s = nb.reducer(s, nb.describeAction(s, 't1', { tt: null })!);
    assert.equal('tt' in s.events.find((e) => e.id === 't1')!, false);
  });
});

describe('netball · gone plays, edits, undo, old logs (DC4–DC8)', () => {
  test('DC4: no DESCRIBE for a play that is gone; the reducer ignores one anyway', () => {
    const s = nb.reducer(nbStart(), tapGoal('home', 'g1', 10));
    assert.equal(nb.describeAction(s, 'nope', { feed: 'hwa' }), null);
    const gone = nb.reducer(s, { type: 'REMOVE_EVENT', side: 'home', payload: { id: 'g1' } });
    assert.equal(nb.describeAction(gone, 'g1', { feed: 'hwa' }), null);
    assert.deepEqual(nb.reducer(gone, { type: 'DESCRIBE', payload: { id: 'g1', field: 'feed', value: 'hwa' } }), gone);
    // a field that doesn't fit the play is ignored too
    assert.equal(nb.describeAction(s, 'g1', { gain: true }), null);
    assert.equal(nb.describeAction(s, 'g1', { feed: 'hgs' }), null, 'the shooter cannot feed her own goal');
  });
  test('DC5: changing the feeder moves the credit in one action; the same feeder is a no-op', () => {
    let s = nb.reducer(nbStart(), tapGoal('home', 'g1', 10));
    s = nb.reducer(s, nb.describeAction(s, 'g1', { feed: 'hwa' })!);
    assert.equal(nb.describeAction(s, 'g1', { feed: 'hwa' }), null);
    const a = nb.describeAction(s, 'g1', { feed: 'hc' })!;
    assert.equal(a.attribution?.playerId, 'hc');
    assert.equal(a.attribution2?.playerId, 'hwa');
    assert.equal(a.attribution2?.by, -1);
    assert.deepEqual(a.attribution2?.extra, { feeds: -1 });
    const cleared = nb.describeAction(nb.reducer(s, a), 'g1', { feed: null })!;
    assert.equal(cleared.attribution, undefined);
    assert.equal(cleared.attribution2?.playerId, 'hc');
    // rebound: a new rebounder replaces the old one in place
    let m = nb.reducer(nbStart(), tapMiss('away', 'm1', 20));
    m = nb.reducer(m, nb.describeAction(m, 'm1', { rebound: { side: 'home', playerId: 'hgk', uid: 'r1' } })!);
    const b = nb.describeAction(m, 'm1', { rebound: { side: 'away', playerId: 'ags', uid: 'r2' } })!;
    assert.equal(b.attribution2?.playerId, 'hgk');
    m = nb.reducer(m, b);
    assert.equal(m.events.filter((e) => e.type === 'stat' && e.ref === 'm1').length, 1);
    assert.equal(nb.reboundOf(m, 'm1')?.playerId, 'ags');
  });
  test('DC7: old logs (detail inside the original action) replay to the same events', () => {
    const old = apply(nb.reducer, nbStart(), [
      tapGoal('home', 'g1', 10, 'GS', 'hwa'),
      tapMiss('away', 'm1', 20, 'GA', 'awa'), rebStat('home', 'r1', 20, 'hgk', 'm1'),
      tapStat('away', 'd1', 30, 'deflection', 'agk', { gain: true }),
      tapStat('home', 't1', 40, 'turnover', 'hwa', { tt: 'badPass' }),
    ]);
    assert.deepEqual(old.events.map((e) => ({ ...e })), [
      { id: 'g1', sec: 10, period: 1, type: 'goal', side: 'home', pos: 'GS', playerId: 'hgs', secondId: 'hwa' },
      { id: 'm1', sec: 20, period: 1, type: 'miss', side: 'away', pos: 'GA', playerId: 'aga', secondId: 'awa' },
      { id: 'r1', sec: 20, period: 1, type: 'stat', side: 'home', stat: 'rebound', playerId: 'hgk', ref: 'm1' },
      { id: 'd1', sec: 30, period: 1, type: 'stat', side: 'away', stat: 'deflection', playerId: 'agk', gain: true },
      { id: 't1', sec: 40, period: 1, type: 'stat', side: 'home', stat: 'turnover', playerId: 'hwa', tt: 'badPass' },
    ]);
  });
  test('DC8: the same match by the new flow equals the old flow (events, totals, credits, commentary)', () => {
    const oldLog = [
      tapGoal('home', 'g1', 10, 'GS', 'hwa'),
      tapMiss('away', 'm1', 20, 'GA', 'awa'), rebStat('home', 'r1', 20, 'hgk', 'm1'),
      tapStat('away', 'd1', 30, 'deflection', 'agk', { gain: true }),
      tapStat('home', 't1', 40, 'turnover', 'hwa', { tt: 'badPass' }),
    ];
    const old = apply(nb.reducer, nbStart(), oldLog);
    const newLog: ScoreAction[] = [];
    let s = nbStart();
    const go = (a: ScoreAction | null) => { assert.ok(a); newLog.push(a); s = nb.reducer(s, a); };
    go(tapGoal('home', 'g1', 10)); go(nb.describeAction(s, 'g1', { feed: 'hwa' }));
    go(tapMiss('away', 'm1', 20, 'GA')); go(nb.describeAction(s, 'm1', { feed: 'awa' })); go(nb.describeAction(s, 'm1', { rebound: { side: 'home', playerId: 'hgk', uid: 'r1' } }));
    go(tapStat('away', 'd1', 30, 'deflection', 'agk')); go(nb.describeAction(s, 'd1', { gain: true }));
    go(tapStat('home', 't1', 40, 'turnover', 'hwa')); go(nb.describeAction(s, 't1', { tt: 'badPass' }));
    assert.deepEqual(s.events, old.events);
    assert.deepEqual([s.home, s.away], [old.home, old.away]);
    assert.deepEqual(netballTotals(s), netballTotals(old));
    assert.deepEqual(sumCredits(newLog), sumCredits(oldLog));
    assert.deepEqual(netballFeed(s, NAMES), netballFeed(old, NAMES));
  });
});

describe('netball · which play the card describes (DC9–DC13)', () => {
  test('DC10: the card follows the last play; admin moments are skipped; a non-describable play closes it', () => {
    let s = nb.reducer(nbStart(), tapGoal('home', 'g1', 10));
    assert.equal(nb.lastDescribable(s)?.id, 'g1');
    assert.deepEqual(nb.describeFields(s, nb.lastDescribable(s)!), ['feed']);
    s = apply(nb.reducer, s, [{ type: 'CPR', side: 'away', payload: { playerId: 'awa', pos: 'WA', uid: 'c1' } }, { type: 'STOP', payload: { reason: 'injury', uid: 's1' } }]);
    assert.equal(nb.lastDescribable(s)?.id, 'g1', 'a CPR / held time does not close it');
    s = nb.reducer(s, tapStat('home', 'i1', 30, 'intercept', 'hgd'));
    assert.equal(nb.lastDescribable(s), undefined, 'an intercept has nothing to describe');
    s = nb.reducer(s, tapMiss('away', 'm1', 40));
    assert.deepEqual(nb.describeFields(s, nb.lastDescribable(s)!), ['feed', 'rebound']);
    s = nb.reducer(s, nb.describeAction(s, 'm1', { rebound: { side: 'home', playerId: 'hgk', uid: 'r1' } })!);
    assert.equal(nb.lastDescribable(s)?.id, 'm1', 'its own rebound does not close it');
    // switches off: nothing to describe
    const plain = nb.reducer(nbStart({ detail: false }), tapGoal('home', 'g1', 10));
    assert.equal(nb.lastDescribable(plain), undefined);
  });
  test('DC9: a describe tap names its play, so it never lands on a newer one', () => {
    let s = apply(nb.reducer, nbStart(), [tapGoal('home', 'g1', 10), tapGoal('away', 'g2', 12)]);
    s = nb.reducer(s, nb.describeAction(s, 'g1', { feed: 'hwa' })!);
    assert.equal(s.events.find((e) => e.id === 'g1')!.secondId, 'hwa');
    assert.equal(s.events.find((e) => e.id === 'g2')!.secondId, undefined);
  });
  test('DC11: a voice goal is a plain goal, and the card opens for it', () => {
    const s0 = nb.reducer(nbStart(), { type: 'CLOCK', payload: { run: true, at: 1000 } });
    const acts = netballVoice('goal GS home', { state: s0, homeName: 'Sharks', awayName: 'Kites', homeRoster: [], awayRoster: [], now: 5000 })!;
    assert.equal(acts.length, 1);
    const s = nb.reducer(s0, acts[0]);
    assert.equal(s.home, 1);
    assert.equal(nb.lastDescribable(s)?.id, acts[0].payload!.uid);
  });
  test('DC12: after the match ends on the last goal, its feeder can still be attached', () => {
    const s = nb.reducer({ ...nb.reducer(nbStart(), tapGoal('home', 'g1', 10)), ended: true }, { type: 'DESCRIBE', payload: { id: 'g1', field: 'feed', value: 'hwa' } });
    assert.equal(s.events[0].secondId, 'hwa');
  });
  test('DC13: an edit re-entry is logged on the tap at its original time, then described by its new id', () => {
    let s = nb.reducer(nbStart(), tapGoal('home', 'g1', 10, 'GS', 'hwa'));
    s = nb.reducer(s, { type: 'REMOVE_EVENT', side: 'home', payload: { id: 'g1' } });
    s = nb.reducer(s, { ...tapGoal('home', 'g9', 10, 'GA'), payload: { ...tapGoal('home', 'g9', 10, 'GA').payload, edit: true } });
    assert.equal(s.home, 1);
    assert.equal(nb.lastDescribable(s)?.id, 'g9');
    s = nb.reducer(s, nb.describeAction(s, 'g9', { feed: 'hc' })!);
    assert.equal(s.events.at(-1)!.secondId, 'hc');
  });
});

/* =============================== volleyball =============================== */

const vrun = (acts: ScoreAction[], cfg: Record<string, unknown> = { vbAssist: true, vbAced: true, vbAttack: true }) => acts.reduce(vb.reducer, vb.init(cfg));
const P = (id: string) => ({ id });

describe('volleyball · one Last point card (DC9, DC10, DC14)', () => {
  test('lastScored: the last scored point, any kind, with its set, rally number and event', () => {
    const s = vrun([vb.outcomeAction('attack', 'home', P('h1')), vb.outcomeAction('ace', 'away', P('a1'))]);
    const pt = lastScored(s)!;
    assert.deepEqual([pt.set, pt.at, pt.side, pt.e.kind], [1, 2, 'away', 'ace']);
    assert.equal(lastScored(vrun([])), null);
  });
  test('DC9: a VB_DETAIL names its point (pt); it is dropped once the last point has moved on', () => {
    let s = vrun([vb.outcomeAction('attack', 'home', P('h1'))]);
    const pt = lastScored(s)!;
    const setBy = detailAction('assist', 'home', P('h2'), undefined, { set: pt.set, at: pt.at });
    assert.deepEqual(setBy.payload?.pt, { set: 1, at: 1 });
    // a second Attack point comes first: the late tap is dropped, not put on the new point
    s = vb.reducer(s, vb.outcomeAction('attack', 'home', P('h3')));
    assert.equal((vb.reducer(s, setBy).vd ?? []).length, 0);
    // on time, it lands
    const ok = vb.reducer(vrun([vb.outcomeAction('attack', 'home', P('h1'))]), setBy);
    assert.equal(ok.vd?.[0]?.playerId, 'h2');
    // an older entry with no pt keeps the old rule (the last point of that kind)
    const legacy = vb.reducer(s, detailAction('assist', 'home', P('h2')));
    assert.deepEqual([legacy.vd?.[0]?.at, legacy.vd?.[0]?.playerId], [2, 'h2']);
  });
  test('DC14 / DC17: the three rows are one DescribeCard keyed by the point\'s event id', () => {
    const t = read('src/sports/volleyball/DetailRow.tsx');
    assert.match(t, /import \{ DescribeCard, useDescribeMarks \} from '..\/..\/components\/DescribeCard'/);
    assert.match(t, /<DescribeCard/);
    assert.match(t, /title=\{`Last point · /);
    assert.match(t, /modeOf\(pt\.e\.id\)/);
    assert.match(t, /mark\(pt\.e\.id, 'done'\)/);
    assert.match(t, /mark\(pt\.e\.id, 'skipped'\)/);
    assert.match(t, /mark\(pt\.e\.id, null\)/);
    assert.doesNotMatch(t, /setSkipped/);
    assert.match(t, /\{ set: pt\.set, at: pt\.at \}/);
  });
});

/* ================================= kabaddi ================================= */

const KCFG = { playersPerSide: 7, style: 'sanjeevani', proRules: true, halfMinutes: 20 };
const kplay = (acts: ScoreAction[]) => acts.reduce(kb.reducer, kb.init(KCFG));
const kapply = (s: kb.KabaddiState, acts: ScoreAction[]) => acts.reduce(kb.reducer, s);
const stampRaid = (acts: ScoreAction[], minute: number) => acts.map((a) => ({ ...a, payload: { ...a.payload, minute, half: 1 } }));
const logRaid = (s: kb.KabaddiState, f: kb.RaidForm, minute = 5) => kapply(s, stampRaid(kb.raidActions(s, f), minute));

describe('kabaddi · Tackled by? with Done / Saved / Edit (DC10, DC15, DC16)', () => {
  const quick = (s: kb.KabaddiState, side: Side = 'home', minute = 5) => logRaid(s, kb.quickRaidForm(side, 'out', { id: 'r1' }), minute);
  test('DC15: Edit renames the tackler; the first one\'s tackle points are reversed', () => {
    let s = quick(kplay([]));
    const eid = s.raids![0].eid!;
    s = kapply(s, kb.tacklerActions(s, eid, { id: 't1' }));
    assert.deepEqual(kb.tacklerActions(s, eid, { id: 't2' }), [], 'not without rename (batch 1 contract)');
    const acts = kb.tacklerActions(s, eid, { id: 't2' }, undefined, { rename: true });
    assert.ok(acts.length);
    const credits = new Map<string, number>();
    for (const a of acts) for (const c of [a.attribution, a.attribution2]) if (c?.playerId) credits.set(`${c.playerId}|${c.stat}`, (credits.get(`${c.playerId}|${c.stat}`) ?? 0) + Number(c.by ?? 1));
    assert.equal(credits.get('t1|tacklePoints'), -1);
    assert.equal(credits.get('t2|tacklePoints'), 1);
    const s2 = kapply(s, acts);
    assert.equal(s2.raids![0].tacklerId, 't2');
    assert.deepEqual([s2.home, s2.away], [s.home, s.away]);
    assert.equal(s2.raids![0].eid, eid);
  });
  test('DC16: rename to the same tackler, or of a line-out, writes nothing', () => {
    let s = quick(kplay([]));
    const eid = s.raids![0].eid!;
    s = kapply(s, kb.tacklerActions(s, eid, { id: 't1' }));
    assert.deepEqual(kb.tacklerActions(s, eid, { id: 't1' }, undefined, { rename: true }), []);
    const lo = logRaid(kplay([]), { side: 'home', touches: 0, bonus: false, tackled: false, lineOut: true, rout: 'time' });
    assert.deepEqual(kb.tacklerActions(lo, lo.raids![0].eid!, { id: 't1' }, undefined, { rename: true }), []);
    assert.deepEqual(kb.tacklerActions(s, 999, { id: 't1' }, undefined, { rename: true }), []);
  });
  test('DC10: lastRaidEid — the card shows only while its raid is the latest', () => {
    let s = quick(kplay([]));
    const eid = s.raids![0].eid!;
    assert.equal(kb.lastRaidEid(s), eid);
    s = logRaid(s, kb.quickRaidForm('away', 'empty'), 6);
    assert.notEqual(kb.lastRaidEid(s), eid);
  });
  test('DC15 / DC17: the UI is a DescribeCard keyed by the raid', () => {
    const ui = read('src/sports/kabaddi/index.tsx');
    assert.match(ui, /import \{ DescribeCard, useDescribeMarks \} from '..\/..\/components\/DescribeCard'/);
    assert.match(ui, /<DescribeCard/);
    assert.match(ui, /`Tackled by \$\{/);
    assert.match(ui, /tackleMarks\.mark\(askTackler, 'done'\)/);
    assert.match(ui, /tackleMarks\.mark\(askTackler, 'skipped'\)/);
    assert.match(ui, /\{ rename: true \}/);
    assert.match(ui, /lastRaidEid\(state\) !== askTackler/);
    assert.match(ui, /Tackled by\?/);
  });
});

describe('netball · the UI no longer blocks (DC1–DC3, DC12, DC17)', () => {
  const ui = read('src/sports/netball/index.tsx');
  test('the feed / rebound / outcome / type steps are gone; the play fires on the tap', () => {
    assert.doesNotMatch(ui, /step: 'feed'/);
    assert.doesNotMatch(ui, /step: 'rebound'/);
    assert.doesNotMatch(ui, /step: 'outcome'/);
    assert.doesNotMatch(ui, /'No feed \/ skip'/);
    assert.match(ui, /const afterShooter = \(sd: Side, pos: Pos, shooter: Player \| null, isMiss: boolean\) => \{\n\s+if \(isMiss\) miss\(sd, pos, shooter\); else goal\(sd, pos, shooter\);/);
  });
  test('one DescribeCard keyed by the play\'s id, on the live and the full-time panel', () => {
    assert.match(ui, /import \{ DescribeCard, useDescribeMarks \} from '..\/..\/components\/DescribeCard'/);
    assert.match(ui, /lastDescribable\(s\)/);
    assert.match(ui, /describeAction\(s, /);
    assert.match(ui, /marks\.modeOf\(ev\.id\)/);
    assert.ok((ui.match(/\{describeCard\}/g) ?? []).length >= 2, 'live + full time');
  });
});

/* ============================ the 600-scorer sim ============================ */

/** a small deterministic PRNG per scorer */
const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

function netballScorer(seed: number) {
  const r = rng(seed);
  const oldLog: ScoreAction[] = [];
  const newLog: ScoreAction[] = [];
  let s = nbStart();
  const push = (a: ScoreAction | null) => { if (!a) return; newLog.push(a); s = nb.reducer(s, a); };
  const undo = () => { newLog.pop(); s = apply(nb.reducer, nbStart(), newLog); };
  let n = 0, sec = 0;
  const want = { home: 0, away: 0 };
  for (let i = 0; i < 25; i++) {
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const id = `p${seed}_${++n}`;
    sec += 5;
    const kind = pick(r, ['goal', 'goal', 'miss', 'deflection', 'turnover', 'intercept', 'junk'] as const);
    const attackers = ROSTER[side].slice(2, 5);
    if (kind === 'junk') { // a mis-tapped goal, undone at once
      push(tapGoal(side, id, sec)); undo();
      continue;
    }
    if (kind === 'goal' || kind === 'miss') {
      const pos = r() < 0.5 ? 'GS' : 'GA';
      const feeder = r() < 0.6 ? pick(r, attackers) : undefined;
      const reb = kind === 'miss' && r() < 0.6 ? (r() < 0.5 ? { side, who: ROSTER[side][r() < 0.5 ? 0 : 1] } : { side: other(side), who: ROSTER[other(side)][r() < 0.5 ? 5 : 6] }) : undefined;
      oldLog.push(kind === 'goal' ? tapGoal(side, id, sec, pos, feeder) : tapMiss(side, id, sec, pos, feeder));
      if (reb) oldLog.push(rebStat(reb.side, `${id}r`, sec, reb.who, id));
      push(kind === 'goal' ? tapGoal(side, id, sec, pos) : tapMiss(side, id, sec, pos));
      if (kind === 'goal') want[side]++;
      // a wrong feeder first, then corrected (or undone)
      if (r() < 0.3) { const wrong = pick(r, attackers); push(nb.describeAction(s, id, { feed: wrong })); if (r() < 0.5) undo(); }
      if (feeder) push(nb.describeAction(s, id, { feed: feeder }));
      else if (s.events.find((e) => e.id === id)?.secondId) push(nb.describeAction(s, id, { feed: null }));
      if (kind === 'miss') {
        if (r() < 0.3) { push(nb.describeAction(s, id, { rebound: { side, playerId: ROSTER[side][0], uid: `${id}x` } })); if (r() < 0.5) undo(); }
        if (reb) push(nb.describeAction(s, id, { rebound: { side: reb.side, playerId: reb.who, uid: `${id}r` } }));
        else if (nb.reboundOf(s, id)) push(nb.describeAction(s, id, { rebound: null }));
      }
    } else {
      const who = pick(r, ROSTER[side]);
      const extra = kind === 'deflection' && r() < 0.6 ? { gain: r() < 0.5 } : kind === 'turnover' && r() < 0.6 ? { tt: pick(r, nb.TURNOVER_TYPES) } : {};
      oldLog.push(tapStat(side, id, sec, kind, who, extra));
      push(tapStat(side, id, sec, kind, who));
      if ('gain' in extra) push(nb.describeAction(s, id, { gain: extra.gain! }));
      if ('tt' in extra) push(nb.describeAction(s, id, { tt: extra.tt! }));
    }
    assert.deepEqual([s.home, s.away], [want.home, want.away], 'the score is right after every play');
  }
  // the old log replays to the same match, and both read the same
  const old = apply(nb.reducer, nbStart(), oldLog);
  // a rebound's own id is arbitrary (a kept first pick keeps its id): name it by its miss
  const norm = (st: nb.NetballState) => ({ ...st, events: st.events.map((e) => (e.ref ? { ...e, id: `${e.ref}r` } : e)) });
  assert.deepEqual(norm(s).events, old.events);
  assert.deepEqual(netballTotals(s), netballTotals(old));
  assert.deepEqual(sumCredits(newLog), sumCredits(oldLog));
  assert.deepEqual(netballFeed(norm(s), NAMES), netballFeed(old, NAMES));
  // replaying the new log from scratch gives the same state (undo-safe)
  assert.deepEqual(apply(nb.reducer, nbStart(), newLog).events, s.events);
}

function volleyballScorer(seed: number) {
  const r = rng(seed);
  const cfg = { vbAssist: true, vbAced: true, vbAttack: true };
  const oldLog: ScoreAction[] = [];
  const newLog: ScoreAction[] = [];
  let s = vb.init(cfg);
  const push = (a: ScoreAction) => { newLog.push(a); s = vb.reducer(s, a); };
  const want = { home: 0, away: 0 };
  for (let i = 0; i < 20; i++) {
    if (s.ended) break;
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const kind = pick(r, ['attack', 'block', 'ace', 'opperror'] as const);
    const pt = vb.outcomeAction(kind, side, kind === 'opperror' ? undefined : P(`${side[0]}${1 + Math.floor(r() * 6)}`));
    if (r() < 0.1) { push(pt); newLog.pop(); s = newLog.reduce(vb.reducer, vb.init(cfg)); continue; } // undone
    const before = s.setsWon.home + s.setsWon.away;
    push(pt); oldLog.push(pt);
    const after = s.setsWon.home + s.setsWon.away;
    if (after === before) want[side]++; else { want.home = 0; want.away = 0; }
    const ann = kind === 'attack' ? { k: 'assist' as const, sd: side } : kind === 'block' ? { k: 'blocked' as const, sd: other(side) } : kind === 'ace' ? { k: 'aced' as const, sd: other(side) } : null;
    if (after !== before) continue; // a set point: the set is over (the next set has its own points)
    assert.deepEqual([s.current.home, s.current.away], [want.home, want.away]);
    if (!ann || r() < 0.3) continue; // never described
    const p = lastScored(s)!;
    const who = P(`${ann.sd[0]}${1 + Math.floor(r() * 6)}`);
    const d = detailAction(ann.k, ann.sd, who, undefined, { set: p.set, at: p.at });
    oldLog.push(detailAction(ann.k, ann.sd, who));
    push(d);
    // a stale tap for an earlier point after a newer one is dropped
    if (r() < 0.2) {
      const nxt = vb.outcomeAction('opperror', side);
      push(nxt); oldLog.push(nxt);
      const b2 = s.setsWon.home + s.setsWon.away;
      if (b2 === after) want[side]++; else { want.home = 0; want.away = 0; }
      const vd = s.vd?.length ?? 0;
      push(d);
      assert.equal(s.vd?.length ?? 0, vd, 'a stale tap never lands');
      newLog.pop(); s = newLog.reduce(vb.reducer, vb.init(cfg));
    }
  }
  const old = oldLog.reduce(vb.reducer, vb.init(cfg));
  assert.deepEqual(s.vd ?? [], old.vd ?? []);
  assert.deepEqual([s.current, s.setsWon, s.sets], [old.current, old.setsWon, old.sets]);
  assert.deepEqual(volleyballStatTotals(s), volleyballStatTotals(old));
}

function kabaddiScorer(seed: number) {
  const r = rng(seed);
  let sNew = kplay([]), sOld = kplay([]);
  const raiders = { home: ['hr1', 'hr2'], away: ['ar1', 'ar2'] };
  const tacklers = { home: ['ht1', 'ht2', 'ht3'], away: ['at1', 'at2', 'at3'] };
  for (let i = 0; i < 16; i++) {
    const side: Side = i % 2 ? 'away' : 'home';
    const minute = 1 + i;
    const raider = { id: pick(r, raiders[side]) };
    const kind = pick(r, ['out', 'out', 'empty', 'touch'] as const);
    if (kind !== 'out') { sNew = logRaid(sNew, kb.quickRaidForm(side, kind, raider), minute); sOld = logRaid(sOld, kb.quickRaidForm(side, kind, raider), minute); continue; }
    const t = r() < 0.7 ? { id: pick(r, tacklers[other(side)]) } : undefined;
    sOld = logRaid(sOld, { ...kb.quickRaidForm(side, 'out', raider), ...(t ? { tackler: t } : {}) }, minute);
    sNew = logRaid(sNew, kb.quickRaidForm(side, 'out', raider), minute);
    const eid = kb.lastRaidEid(sNew)!;
    if (!t) continue;
    if (r() < 0.3) { // a wrong tackler first, renamed
      const wrong = { id: pick(r, tacklers[other(side)].filter((x) => x !== t.id)) };
      sNew = kapply(sNew, kb.tacklerActions(sNew, eid, wrong));
      sNew = kapply(sNew, kb.tacklerActions(sNew, eid, t, undefined, { rename: true }));
    } else sNew = kapply(sNew, kb.tacklerActions(sNew, eid, t));
    assert.deepEqual([sNew.home, sNew.away], [sOld.home, sOld.away]);
  }
  assert.deepEqual([sNew.home, sNew.away], [sOld.home, sOld.away]);
  assert.deepEqual(kabaddiTotals(sNew), kabaddiTotals(sOld));
}

describe('600-scorer simulation', () => {
  test('netball: 600 scorers, detail later / never / corrected, undos — score right, stats = old flow', () => {
    for (let i = 1; i <= 600; i++) netballScorer(i);
  });
  test('volleyball: 600 scorers, the Last point card later / never, stale taps dropped', () => {
    for (let i = 1; i <= 600; i++) volleyballScorer(i);
  });
  test('kabaddi: 600 scorers, Tackled by later / never / renamed — totals = the raid form with the tackler', () => {
    for (let i = 1; i <= 600; i++) kabaddiScorer(i);
  });
});
