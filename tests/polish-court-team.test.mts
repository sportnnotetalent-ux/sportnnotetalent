/**
 * Wave 4 polish for the court-team family
 * (docs/security/breaks/polish-court-team.md, PC1…PC20):
 *  - kabaddi K1: "Who was touched?" after a quick "+1 touch" (RAID_TOUCHED),
 *    then "Defenders touched" on for a new match;
 *  - volleyball: the "Last point" card after full time;
 *  - netball: an edited goal / miss / stat keeps its feeder, rebound,
 *    outcome and type (carryOf / withCarry).
 * Ends with a 600-scorer simulation per sport, and a fixed fingerprint of
 * old logs recorded on 69e9bbc6 (they must replay identically).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { ScoreAction, Attribution } from '../src/sports/types.ts';
import * as kb from '../src/sports/kabaddi/engine.ts';
import * as kbSettings from '../src/sports/kabaddi/settings.ts';
import { KABADDI_META } from '../src/sports/kabaddi/meta.ts';
import { kabaddiTotals } from '../src/sports/kabaddi/totals.ts';
import { kabaddiPlayerCounts } from '../src/sports/kabaddi/deepBox.ts';
import { kabaddiCommentary } from '../src/sports/kabaddi/commentary.ts';
import { kabaddiUndoLabel } from '../src/sports/kabaddi/undoLabel.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { detailAction } from '../src/sports/volleyball/actions.ts';
import { lastScored } from '../src/sports/volleyball/detail.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import * as nb from '../src/sports/netball/engine.ts';
import { netballTotals } from '../src/sports/netball/totals.ts';

type Side = 'home' | 'away';
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
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

/* ================================= kabaddi ================================= */

const KCFG = { playersPerSide: 7, style: 'sanjeevani', proRules: true, halfMinutes: 20, trackTouched: true };
const kinit = (cfg: Record<string, unknown> = KCFG) => kb.reducer(kb.init(cfg), { type: 'KICKOFF', payload: { at: 1 } });
const kapply = (s: kb.KabaddiState, acts: (ScoreAction | null | undefined)[]) => acts.reduce((x, a) => (a ? kb.reducer(x, a) : x), s);
const stampRaid = (acts: ScoreAction[], minute: number) => acts.map((a) => (a.type === 'REMOVE_EVENT' ? a : { ...a, payload: { ...a.payload, minute, half: 1 } }));
const raidLog = (s: kb.KabaddiState, f: kb.RaidForm, minute = 5) => stampRaid(kb.raidActions(s, f), minute);
const logRaid = (s: kb.KabaddiState, f: kb.RaidForm, minute = 5) => kapply(s, raidLog(s, f, minute));
const K = { home: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'], away: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] };
const KNAMES = { home: 'Patna', away: 'Puneri' };
const touchedAction = (kb as unknown as { touchedAction?: (s: kb.KabaddiState, eid: number, who: { id: string }[]) => ScoreAction | null }).touchedAction;
const touch = (s: kb.KabaddiState, eid: number, who: string[]) => {
  assert.ok(touchedAction, 'touchedAction exists');
  return touchedAction!(s, eid, who.map((id) => ({ id })));
};

describe('kabaddi K1 · Who was touched? after a quick +1 touch (PC1–PC5, PC8, PC9)', () => {
  test('PC1 / PC2: naming the defender after the quick touch = naming him in the raid form (state, stats, careers, commentary)', () => {
    const s0 = kinit();
    const quick = logRaid(s0, kb.quickRaidForm('home', 'touch', { id: 'h1' }));
    const form = logRaid(s0, { ...kb.quickRaidForm('home', 'touch', { id: 'h1' }), touched: [{ id: 'a3' }] });
    const eid = kb.lastRaidEid(quick)!;
    const a = touch(quick, eid, ['a3'])!;
    assert.equal(a.type, 'RAID_TOUCHED');
    assert.deepEqual(a.payload, { eid, touched: [{ id: 'a3' }] });
    assert.equal(a.attribution, undefined, 'no live credit');
    const named = kb.reducer(quick, a);
    assert.deepEqual(named, form, 'the same state as the form (seq, lp, score, mat)');
    assert.deepEqual(kabaddiTotals(named), kabaddiTotals(form));
    assert.deepEqual([...kabaddiPlayerCounts(named)], [...kabaddiPlayerCounts(form)]);
    assert.deepEqual(kabaddiCommentary(named, KNAMES), kabaddiCommentary(form, KNAMES));
    assert.equal(kabaddiTotals(named, { players: { home: [], away: [{ id: 'a3', name: 'A3' }] } } as never)['a3']?.stats.touchedOut ?? kabaddiTotals(named)['a3']?.stats.touchedOut, 1);
  });
  test('PC3: a raid that is gone, or an unknown eid, takes no names', () => {
    const quick = logRaid(kinit(), kb.quickRaidForm('home', 'touch', { id: 'h1' }));
    const eid = kb.lastRaidEid(quick)!;
    assert.equal(touch(quick, 999, ['a3']), null);
    const gone = kb.reducer(quick, { type: 'REMOVE_EVENT', side: 'home', payload: { id: eid, v: 2 } });
    assert.equal(touch(gone, eid, ['a3']), null);
    assert.deepEqual(kb.reducer(gone, { type: 'RAID_TOUCHED', side: 'home', payload: { eid, touched: [{ id: 'a3' }] } }), gone);
  });
  test('PC4: an empty raid, a line-out or a 0-touch raider out takes no names', () => {
    for (const f of [kb.quickRaidForm('home', 'empty', { id: 'h1' }), kb.quickRaidForm('home', 'out', { id: 'h1' }),
      { side: 'home' as const, touches: 1, bonus: false, tackled: false, lineOut: true, rout: 'line' }]) {
      const s = logRaid(kinit(), f);
      const eid = kb.lastRaidEid(s)!;
      assert.equal(touch(s, eid, ['a3']), null);
      assert.deepEqual(kb.reducer(s, { type: 'RAID_TOUCHED', side: 'home', payload: { eid, touched: [{ id: 'a3' }] } }), s);
    }
  });
  test('PC5: capped at the touches, de-duplicated, ids only; [] clears; junk ignored', () => {
    const s = logRaid(kinit(), { side: 'home', raider: { id: 'h1' }, touches: 2, bonus: false, tackled: false });
    const eid = kb.lastRaidEid(s)!;
    const r = (p: Record<string, unknown>) => kb.reducer(s, { type: 'RAID_TOUCHED', side: 'home', payload: { eid, ...p } }).raids!.at(-1)!.touched;
    assert.deepEqual(r({ touched: [{ id: 'a1' }, { id: 'a1' }, { id: 'a2' }, { id: 'a3' }] }), [{ id: 'a1' }, { id: 'a2' }]);
    assert.deepEqual(r({ touched: [{ name: 'Rahul' }] }), undefined, 'a name never enters the public log');
    assert.equal(kb.reducer(s, { type: 'RAID_TOUCHED', payload: { eid, touched: 'a1' } }), s);
    const named = kb.reducer(s, touch(s, eid, ['a1'])!);
    const cleared = kb.reducer(named, touch(named, eid, [])!);
    assert.equal('touched' in cleared.raids!.at(-1)!, false);
    assert.deepEqual(cleared, s, 'clearing restores the unnamed raid');
    assert.equal(touch(named, eid, ['a1']), null, 'the same names again write nothing');
  });
  test('PC8: the touch that ends the match (Golden Raid) can still be described; the score never moves', () => {
    let s = kb.reducer(kinit({ ...KCFG, decider: 'golden_raid' }), { type: 'START_GOLDEN_RAID' });
    if (!s.goldenRaid) s = { ...s, goldenRaid: true };
    s = logRaid(s, kb.quickRaidForm('away', 'touch', { id: 'a1' }));
    assert.equal(s.ended, true);
    const eid = kb.lastRaidEid(s)!;
    const n = kb.reducer(s, touch(s, eid, ['h2'])!);
    assert.deepEqual(n.raids!.at(-1)!.touched, [{ id: 'h2' }]);
    assert.deepEqual([n.home, n.away, n.ended], [s.home, s.away, true]);
  });
  test('PC9: the step names its raid, so a late tap lands on that raid', () => {
    let s = logRaid(kinit(), kb.quickRaidForm('home', 'touch', { id: 'h1' }));
    const eid = kb.lastRaidEid(s)!;
    s = logRaid(s, kb.quickRaidForm('away', 'touch', { id: 'a1' }), 6);
    s = kb.reducer(s, touch(s, eid, ['a4'])!);
    assert.deepEqual(s.raids![0].touched, [{ id: 'a4' }]);
    assert.equal(s.raids![1].touched, undefined);
  });
  test('PC6: the undo bar names the tap', () => {
    const s = logRaid(kinit(), kb.quickRaidForm('home', 'touch', { id: 'h1' }));
    const a = touch(s, kb.lastRaidEid(s)!, ['a3'])!;
    assert.equal(kabaddiUndoLabel({ type: a.type, prev: s, next: kb.reducer(s, a) } as never), 'who was touched');
  });
});

describe('kabaddi · Defenders touched on for a new match (PC10–PC12)', () => {
  test('PC12: one defaults constant, with touched on; the fields and Standard agree', () => {
    assert.deepEqual(kbSettings.KABADDI_STATS_DEFAULTS, { trackSkills: true, trackTouched: true });
    assert.deepEqual(kbSettings.KABADDI_LIVE_SETTINGS.defaults, { trackSkills: true, trackTouched: true });
    const f = (KABADDI_META.formatFields ?? []).find((x) => x.key === 'trackTouched')!;
    assert.equal(f.default, true);
    assert.doesNotMatch(kbSettings.KABADDI_LIVE_SETTINGS.hint ?? '', /off by default/i);
    assert.doesNotMatch(read('src/sports/kabaddi/settings.ts'), /stays off until/);
  });
  test('PC11: an old format keeps touched off', () => {
    for (const cfg of [{}, { trackSkills: true }, { trackTouched: false }]) assert.equal(kb.init(cfg).track?.touched, undefined);
    assert.equal(kb.init({ trackTouched: true }).track?.touched, true);
  });
  test('PC10: on with nothing named writes no touched keys; one name brings them; clearing it takes them away', () => {
    let s = logRaid(kinit(), kb.quickRaidForm('home', 'touch', { id: 'h1' }));
    s = logRaid(s, kb.quickRaidForm('away', 'out', { id: 'a1' }), 6);
    const has = (st: kb.KabaddiState) => Object.values(kabaddiTotals(st)).some((l) => 'touchedOut' in l.stats || 'unsuccessfulTackles' in l.stats);
    assert.equal(has(s), false);
    const eid = s.raids![0].eid!;
    const named = kb.reducer(s, touch(s, eid, ['a3'])!);
    assert.equal(has(named), true);
    assert.equal(has(kb.reducer(named, touch(named, eid, [])!)), false);
  });
  test('PC1 (UI): a DescribeCard keyed by the raid after a quick +1 touch', () => {
    const ui = read('src/sports/kabaddi/index.tsx');
    assert.match(ui, /label="\+1 touch" variant="ghost" onPress=\{\(\) => \{ const eid = state\.seq \+ 1;[^}]*setAskTouched\(eid\)/);
    assert.match(ui, /lastRaidEid\(state\) !== askTouched/);
    assert.match(ui, /Who was touched\?/);
    assert.match(ui, /touchMarks\.modeOf\(askTouched\)/);
    assert.match(ui, /touchMarks\.mark\(askTouched, 'done'\)/);
    assert.match(ui, /touchMarks\.mark\(askTouched, 'skipped'\)/);
    assert.match(ui, /touchedAction\(state, askTouched, /);
    assert.match(ui, /state\.track\?\.touched/);
  });
});

/* =============================== volleyball =============================== */

const VCFG = { setsToWin: 1, pointsPerSet: 5, winByTwo: false, vbAssist: true, vbAced: true, vbAttack: true, vbReception: true, vbDig: true };
const P = (id: string) => ({ id });

describe('volleyball · the Last point card after full time (PC13, PC14)', () => {
  const endOn = (kind: 'attack' | 'block' | 'ace') => [0, 1, 2, 3].map(() => vb.outcomeAction('opperror', 'home')).concat([vb.outcomeAction(kind, 'home', P('h1'))]).reduce(vb.reducer, vb.init(VCFG));
  test('PC13: the match-winning point can be described after full time', () => {
    for (const [kind, k, sd] of [['attack', 'assist', 'home'], ['block', 'blocked', 'away'], ['ace', 'aced', 'away']] as const) {
      const s = endOn(kind);
      assert.equal(s.ended, true);
      const pt = lastScored(s)!;
      assert.equal(pt.e.kind, kind);
      const n = vb.reducer(s, detailAction(k, sd, P(`${sd[0]}2`), undefined, { set: pt.set, at: pt.at }));
      assert.equal(n.vd?.length, 1, kind);
      assert.deepEqual([n.setsWon, n.ended], [s.setsWon, true]);
    }
  });
  test('PC14: rally entries and stale taps stay out after full time', () => {
    const s = endOn('attack');
    assert.equal(vb.reducer(s, detailAction('dig', 'home', P('h3'))), s);
    assert.equal(vb.reducer(s, detailAction('reception', 'away', P('a3'), 'perfect')), s);
    assert.equal((vb.reducer(s, detailAction('assist', 'home', P('h2'), undefined, { set: 1, at: 2 })).vd ?? []).length, 0);
  });
  test('PC13 (UI): the card renders after full time; the switch and rally chips do not', () => {
    const t = read('src/sports/volleyball/DetailRow.tsx');
    // the card is built before the full-time return, and that return shows it
    const end = t.indexOf('if (s.ended)');
    assert.ok(end > 0, 'a full-time branch');
    assert.ok(t.indexOf('const lastPointCard') < end, 'the card is built first');
    const branch = t.slice(end, t.indexOf('\n  }', end));
    assert.match(branch, /\{lastPointCard\}/);
    assert.doesNotMatch(branch, /\{toggle\}|Attack in play|Reception ·|Dig ·/);
    assert.doesNotMatch(t, /if \(!on \|\| s\.ended\)/);
  });
});

/* ================================= netball ================================= */

const POS: nb.Pos[] = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'];
const ROSTER: Record<Side, string[]> = { home: ['hgs', 'hga', 'hwa', 'hc', 'hwd', 'hgd', 'hgk'], away: ['ags', 'aga', 'awa', 'ac', 'awd', 'agd', 'agk'] };
const DEEP = { detail: true, trackGains: true, trackTurnovers: true };
const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, pos: Object.fromEntries(POS.map((p, i) => [p, { id: ROSTER[team][i] }])) } });
const nbStart = () => [xi('home'), xi('away'), { type: 'FIRST_CENTRE', side: 'home' } as ScoreAction].reduce(nb.reducer, nb.init(DEEP));
const credit = (e: Parameters<typeof nb.eventCredits>[0]) => {
  const cr = nb.eventCredits(e);
  return { attribution: nb.creditAttribution(cr.first, 1, [...nb.LIVE_KEYS]), attribution2: nb.creditAttribution(cr.second, 1, [...nb.LIVE_KEYS]) };
};
const shooterOf = (side: Side, pos: 'GS' | 'GA') => ROSTER[side][pos === 'GS' ? 0 : 1];
const tapGoal = (side: Side, uid: string, sec: number, pos: 'GS' | 'GA' = 'GS', feeder?: string, edit = false): ScoreAction =>
  ({ type: 'GOAL', side, payload: { pos, uid, sec, period: 1, ...(edit ? { edit: true } : {}) }, ...credit({ type: 'goal', playerId: shooterOf(side, pos), secondId: feeder }) });
const tapMiss = (side: Side, uid: string, sec: number, pos: 'GS' | 'GA' = 'GS', feeder?: string, edit = false): ScoreAction =>
  ({ type: 'MISS', side, payload: { pos, uid, sec, period: 1, ...(edit ? { edit: true } : {}) }, ...credit({ type: 'miss', playerId: shooterOf(side, pos), secondId: feeder }) });
const tapStat = (side: Side, uid: string, sec: number, kind: nb.StatKind, who: string, extra: Record<string, unknown> = {}): ScoreAction =>
  ({ type: 'STAT', side, payload: { kind, uid, sec, period: 1, ...extra }, ...credit({ type: 'stat', stat: kind, playerId: who }) });
const rebStat = (side: Side, uid: string, sec: number, who: string, ref: string): ScoreAction =>
  ({ type: 'STAT', side, payload: { kind: 'rebound', ref, uid, sec, period: 1 }, ...credit({ type: 'stat', stat: 'rebound', playerId: who }) });
const napply = (s: nb.NetballState, acts: (ScoreAction | null | undefined)[]) => acts.reduce((x, a) => (a ? nb.reducer(x, a) : x), s);
/** the edit's held removal, as the controls build it (the play + its rebound, credits reversed) */
const removal = (s: nb.NetballState, e: nb.NetballEvent): ScoreAction[] => {
  const cr = nb.eventCredits(e);
  return [
    { type: 'REMOVE_EVENT', ...(e.side ? { side: e.side } : {}), payload: { id: e.id }, attribution: nb.creditAttribution(cr.first, -1), attribution2: nb.creditAttribution(cr.second, -1) },
    ...s.events.filter((x) => x.type === 'stat' && x.stat === 'rebound' && x.ref === e.id).flatMap((x) => removal(s, x)),
  ];
};
type Carry = unknown;
const NB = nb as unknown as {
  carryOf?: (s: nb.NetballState, e: nb.NetballEvent) => Carry | undefined;
  withCarry?: (a: ScoreAction, carry: Carry | undefined, o: { reboundUid: string }) => ScoreAction[];
};
/** the timeline ✎ Edit of play `id`, re-entered by `play` (the new tap, with its uid / sec) */
const editPlay = (s: nb.NetballState, id: string, play: ScoreAction, reboundUid = `${id}-rb`): ScoreAction[] => {
  assert.ok(NB.carryOf && NB.withCarry, 'carryOf / withCarry exist');
  const e = s.events.find((x) => x.id === id)!;
  const carry = NB.carryOf!(s, e);
  return [...removal(s, e), ...NB.withCarry!(play, carry, { reboundUid })];
};

describe('netball · an edited play keeps its detail (PC15–PC20)', () => {
  test('PC15: an edited goal keeps its feeder (stats and credits as never edited)', () => {
    const plain = napply(nbStart(), [tapGoal('home', 'g1', 10, 'GS', 'hwa')]);
    const log = editPlay(plain, 'g1', tapGoal('home', 'g2', 10, 'GS', undefined, true));
    const s = napply(plain, log);
    assert.equal(s.events.find((e) => e.id === 'g2')?.secondId, 'hwa');
    assert.equal(s.home, 1);
    assert.deepEqual(netballTotals(s), netballTotals(plain));
    assert.deepEqual(sumCredits([tapGoal('home', 'g1', 10, 'GS', 'hwa'), ...log]), sumCredits([tapGoal('home', 'g1', 10, 'GS', 'hwa')]));
  });
  test('PC16: an edited miss keeps its feeder and its rebound (linked to the new miss, right after it)', () => {
    const first = [tapMiss('away', 'm1', 20, 'GA', 'awa'), rebStat('home', 'r1', 20, 'hgk', 'm1')];
    const plain = napply(nbStart(), first);
    const log = editPlay(plain, 'm1', tapMiss('away', 'm2', 20, 'GA', undefined, true), 'r2');
    const s = napply(plain, log);
    const i = s.events.findIndex((e) => e.id === 'm2');
    assert.equal(s.events[i].secondId, 'awa');
    assert.deepEqual({ ...s.events[i + 1] }, { id: 'r2', sec: 20, period: 1, type: 'stat', side: 'home', stat: 'rebound', playerId: 'hgk', ref: 'm2' });
    assert.equal(s.events.filter((e) => e.type === 'stat' && e.stat === 'rebound').length, 1);
    assert.deepEqual(netballTotals(s), netballTotals(plain));
    assert.deepEqual(sumCredits([...first, ...log]), sumCredits(first));
  });
  test('PC17: an edited deflection keeps its outcome, an edited turnover its type', () => {
    const first = [tapStat('away', 'd1', 30, 'deflection', 'agk', { gain: true }), tapStat('home', 't1', 40, 'turnover', 'hwa', { tt: 'badPass' })];
    let s = napply(nbStart(), first);
    s = napply(s, editPlay(s, 'd1', tapStat('away', 'd2', 30, 'deflection', 'agd')));
    s = napply(s, editPlay(s, 't1', tapStat('home', 't2', 40, 'turnover', 'hc')));
    assert.equal(s.events.find((e) => e.id === 'd2')?.gain, true);
    assert.equal(s.events.find((e) => e.id === 't2')?.tt, 'badPass');
  });
  test('PC18: the new shooter was the feeder: the feeder is dropped', () => {
    const plain = napply(nbStart(), [tapGoal('home', 'g1', 10, 'GS', 'hga')]);
    const s = napply(plain, editPlay(plain, 'g1', tapGoal('home', 'g2', 10, 'GA', undefined, true)));
    assert.equal(s.events.find((e) => e.id === 'g2')?.secondId, undefined);
  });
  test('PC15: nothing to carry leaves the play as tapped', () => {
    const plain = napply(nbStart(), [tapGoal('home', 'g1', 10)]);
    const e = plain.events.find((x) => x.id === 'g1')!;
    const play = tapGoal('home', 'g2', 10, 'GS', undefined, true);
    assert.deepEqual(NB.withCarry!(play, NB.carryOf!(plain, e), { reboundUid: 'x' }), [play]);
  });
  test('PC19 (UI): the carry is read when the edit opens, used only by the re-entry, and cleared with the edit', () => {
    const ui = read('src/sports/netball/index.tsx');
    assert.match(ui, /setCarry\(carryOf\(s, e\)\)/);
    assert.match(ui, /withCarry\(/);
    assert.match(ui, /if \(flow === null && editAt\) \{[^}]*setCarry\(null\)/);
    assert.match(ui, /editAt \? carry : undefined/);
  });
});

/* ======================= old logs replay identically ======================= */

/** Old logs, built only with steps that existed before this wave. Their
 *  replayed states were fingerprinted on 69e9bbc6 (PC7). */
function oldLogs() {
  const out: unknown[] = [];
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed * 7);
    let s = kinit(seed % 2 ? KCFG : { ...KCFG, trackTouched: false });
    for (let i = 0; i < 18 && !s.ended; i++) {
      const side: Side = i % 2 ? 'away' : 'home';
      const raider = { id: pick(r, K[side]) };
      const touches = Math.floor(r() * 3);
      const tackled = touches === 0 && r() < 0.4;
      const touched = s.track?.touched && touches && r() < 0.5 ? K[other(side)].slice(0, touches).map((id) => ({ id })) : undefined;
      s = logRaid(s, { side, raider, touches, bonus: false, tackled, ...(tackled && r() < 0.6 ? { tackler: { id: pick(r, K[other(side)]) } } : {}), ...(touched ? { touched } : {}) }, 1 + i);
    }
    out.push({ s, t: kabaddiTotals(s) });
    const v = Array.from({ length: 30 }, (_, i) => vb.outcomeAction(pick(r, ['attack', 'block', 'ace', 'opperror'] as const), r() < 0.5 ? 'home' : 'away', P(`p${i % 6}`)))
      .flatMap((a, i) => (i % 3 ? [a] : [a, detailAction('assist', a.side as Side, P('s1'))])).reduce(vb.reducer, vb.init(VCFG));
    out.push({ v, t: volleyballStatTotals(v) });
    const n = napply(nbStart(), [tapGoal('home', `g${seed}`, 10, 'GS', 'hwa'), tapMiss('away', `m${seed}`, 20, 'GA', 'awa'), rebStat('home', `r${seed}`, 20, 'hgk', `m${seed}`),
      tapStat('away', `d${seed}`, 30, 'deflection', 'agk', { gain: r() < 0.5 }), tapStat('home', `t${seed}`, 40, 'turnover', 'hwa', { tt: 'badPass' })]);
    out.push({ n, t: netballTotals(n) });
  }
  return out;
}
const OLD_FINGERPRINT = '34d59de4c302424c024f5ab02130f7234636a78059c3f9116eaf632f98fdf31e';

/* ============================ the 600-scorer sim ============================ */

function kabaddiScorer(seed: number) {
  const r = rng(seed);
  let sNew = kinit(), sOld = kinit();
  const newLog: ScoreAction[] = [];
  const base = kinit();
  const push = (acts: (ScoreAction | null)[]) => { for (const a of acts) if (a) { newLog.push(a); sNew = kb.reducer(sNew, a); } };
  const undo = () => { newLog.pop(); sNew = newLog.reduce(kb.reducer, base); };
  for (let i = 0; i < 18 && !sNew.ended; i++) {
    const side: Side = i % 2 ? 'away' : 'home';
    const minute = 1 + i;
    const raider = { id: pick(r, K[side]) };
    const kind = pick(r, ['touch', 'touch', 'touch', 'empty', 'out', 'bonus', 'junk'] as const);
    if (kind === 'junk') { // a quick touch logged then undone, with or without a name first
      push(raidLog(sNew, kb.quickRaidForm(side, 'touch', raider), minute));
      if (r() < 0.5) { push([touchedAction!(sNew, kb.lastRaidEid(sNew)!, [{ id: K[other(side)][0] }])]); undo(); }
      undo();
      continue;
    }
    if (kind !== 'touch') {
      push(raidLog(sNew, kb.quickRaidForm(side, kind, raider), minute));
      sOld = logRaid(sOld, kb.quickRaidForm(side, kind, raider), minute);
      continue;
    }
    // the defenders on the mat right now (named ones are out); any of them
    const d = { id: pick(r, K[other(side)]) };
    const habit = r();
    const named = habit < 0.6; // later; else never
    sOld = logRaid(sOld, { ...kb.quickRaidForm(side, 'touch', raider), ...(named ? { touched: [d] } : {}) }, minute);
    push(raidLog(sNew, kb.quickRaidForm(side, 'touch', raider), minute));
    const eid = kb.lastRaidEid(sNew)!;
    if (r() < 0.25) { // a wrong name first: renamed, or undone
      const wrong = { id: K[other(side)].find((x) => x !== d.id)! };
      push([touchedAction!(sNew, eid, [wrong])]);
      if (r() < 0.5) undo();
      else if (!named) push([touchedAction!(sNew, eid, [])]);
    }
    if (named) push([touchedAction!(sNew, eid, [d])]);
    assert.deepEqual([sNew.home, sNew.away], [sOld.home, sOld.away]);
  }
  assert.deepEqual(sNew, sOld, 'the same state as the full raid form');
  assert.deepEqual(kabaddiTotals(sNew), kabaddiTotals(sOld));
  assert.deepEqual(kabaddiCommentary(sNew, KNAMES), kabaddiCommentary(sOld, KNAMES));
  assert.deepEqual(sumCredits(newLog), sumCredits(newLog.filter((a) => a.type !== 'RAID_TOUCHED')), 'no live credit from a name');
  assert.deepEqual(newLog.reduce(kb.reducer, base), sNew, 'replay of the log = the live state');
  // no touched keys unless a name stands
  const anyNamed = (sNew.raids ?? []).some((x) => x.touched?.length);
  for (const l of Object.values(kabaddiTotals(sNew))) if (!anyNamed) assert.equal('touchedOut' in l.stats, false);
}

function volleyballScorer(seed: number) {
  const r = rng(seed);
  const cfg = { ...VCFG, setsToWin: 1 + Math.floor(r() * 2), pointsPerSet: 5 + Math.floor(r() * 6) };
  const oldLog: ScoreAction[] = [];
  let s = vb.init(cfg);
  for (let i = 0; i < 200 && !s.ended; i++) {
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const kind = pick(r, ['attack', 'block', 'ace', 'opperror'] as const);
    const pt = vb.outcomeAction(kind, side, kind === 'opperror' ? undefined : P(`${side[0]}${1 + Math.floor(r() * 6)}`));
    s = vb.reducer(s, pt); oldLog.push(pt);
  }
  assert.equal(s.ended, true);
  const last = lastScored(s)!;
  const ann = last.e.kind === 'attack' ? { k: 'assist' as const, sd: last.side } : last.e.kind === 'block' ? { k: 'blocked' as const, sd: other(last.side) } : last.e.kind === 'ace' ? { k: 'aced' as const, sd: other(last.side) } : null;
  if (!ann || r() < 0.3) return; // nothing to describe, or never described
  const who = P(`${ann.sd[0]}${1 + Math.floor(r() * 6)}`);
  let n = s;
  if (r() < 0.3) n = vb.reducer(n, detailAction(ann.k, ann.sd, P(`${ann.sd[0]}9`), undefined, { set: last.set, at: last.at })); // a wrong one, replaced
  n = vb.reducer(n, detailAction(ann.k, ann.sd, who, undefined, { set: last.set, at: last.at }));
  // a rally chip after the end never lands
  n = vb.reducer(n, detailAction('dig', ann.sd, who));
  const old = [...oldLog, detailAction(ann.k, ann.sd, who)].reduce(vb.reducer, vb.init(cfg));
  assert.equal(n.vd?.length, 1);
  assert.deepEqual(n.vd, old.vd);
  assert.deepEqual([n.setsWon, n.sets, n.ended], [old.setsWon, old.sets, true]);
  assert.deepEqual(volleyballStatTotals(n), volleyballStatTotals(old));
}

function netballScorer(seed: number) {
  const r = rng(seed);
  const refLog: ScoreAction[] = []; // the plays as finally entered, never edited
  const newLog: ScoreAction[] = [];
  let s = nbStart();
  const push = (acts: ScoreAction[]) => { for (const a of acts) { newLog.push(a); s = nb.reducer(s, a); } };
  let sec = 0, n = 0;
  for (let i = 0; i < 20; i++) {
    const side: Side = r() < 0.5 ? 'home' : 'away';
    const id = `p${seed}_${++n}`;
    sec += 5;
    const kind = pick(r, ['goal', 'miss', 'deflection', 'turnover', 'intercept'] as const);
    const feeder = r() < 0.6 ? ROSTER[side][2 + Math.floor(r() * 3)] : undefined;
    const pos: 'GS' | 'GA' = r() < 0.5 ? 'GS' : 'GA';
    const reb = kind === 'miss' && r() < 0.6 ? { side: other(side), who: ROSTER[other(side)][6] } : undefined;
    const extra = kind === 'deflection' && r() < 0.6 ? { gain: r() < 0.5 } : kind === 'turnover' && r() < 0.6 ? { tt: pick(r, nb.TURNOVER_TYPES) } : {};
    const who = ROSTER[side][Math.floor(r() * 7)];
    const play = (uid: string, edit = false): ScoreAction[] =>
      kind === 'goal' ? [tapGoal(side, uid, sec, pos, feeder, edit)]
      : kind === 'miss' ? [tapMiss(side, uid, sec, pos, feeder, edit), ...(reb ? [rebStat(reb.side, `${uid}-rb`, sec, reb.who, uid)] : [])]
      : [tapStat(side, uid, sec, kind, who, extra)];
    push(play(id));
    if (r() < 0.4) { // ✎ Edit: re-entered by the same player / shooter, detail carried
      const bare: ScoreAction = kind === 'goal' ? tapGoal(side, `${id}e`, sec, pos, undefined, true)
        : kind === 'miss' ? tapMiss(side, `${id}e`, sec, pos, undefined, true)
        : tapStat(side, `${id}e`, sec, kind, who);
      push(editPlay(s, id, bare, `${id}e-rb`));
      refLog.push(...play(`${id}e`));
    } else refLog.push(...play(id));
  }
  const ref = napply(nbStart(), refLog);
  const norm = (st: nb.NetballState) => [...st.events].map((e) => ({ ...e })).sort((a, b) => (a.id < b.id ? -1 : 1));
  assert.deepEqual(norm(s), norm(ref), 'the same plays with the same detail');
  assert.deepEqual([s.home, s.away], [ref.home, ref.away]);
  assert.deepEqual(netballTotals(s), netballTotals(ref));
  assert.deepEqual(sumCredits(newLog), sumCredits(refLog));
}

describe('600-scorer simulation + old logs', () => {
  test('PC7: old logs replay identically (fingerprint from 69e9bbc6)', () => {
    const fp = hash(oldLogs());
    if (process.env.RECORD) console.log('OLD_FINGERPRINT', fp);
    assert.equal(fp, OLD_FINGERPRINT);
  });
  test('kabaddi: 600 scorers, quick touches named later / never / renamed / undone = the full raid form', () => {
    for (let i = 1; i <= 600; i++) kabaddiScorer(i);
  });
  test('volleyball: 600 matches, the last point described after full time = described in time', () => {
    for (let i = 1; i <= 600; i++) volleyballScorer(i);
  });
  test('netball: 600 scorers, edited plays keep their detail; totals and credits = never edited', () => {
    for (let i = 1; i <= 600; i++) netballScorer(i);
  });
});
