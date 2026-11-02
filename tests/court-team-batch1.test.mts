/**
 * Court and team sports, batch 1 (docs/sport-expert/court-team.md fixes 1–3;
 * breaks: docs/security/breaks/court-team-batch1.md).
 *  1. Kabaddi: Raider chips above the one-tap row; "Tackled by?" after a quick
 *     "Raider out" — an in-place edit of that raid (tacklerActions).
 *  2. Volleyball: "Block out" → "Block fault (net / over / blocked a serve)";
 *     the stored key stays `blockout`.
 *  3. Kabaddi: raider out without a tackle, with a reason (`rout`).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as kb from '../src/sports/kabaddi/engine.ts';
import { kabaddiCommentary, raidSentence } from '../src/sports/kabaddi/commentary.ts';
import { kabaddiMatchStats } from '../src/sports/kabaddi/matchStats.ts';
import { removeEventAction } from '../src/sports/kabaddi/actions.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { rallySentence } from '../src/sports/volleyball/commentary.ts';
import { volleyballMatchStats } from '../src/sports/volleyball/matchStats.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const CFG = { playersPerSide: 7, style: 'sanjeevani', proRules: true, halfMinutes: 20 };
const play = (acts: ScoreAction[], c: Record<string, unknown> = CFG) => acts.reduce(kb.reducer, kb.init(c));
const NAMES = { home: 'Patna', away: 'Bengaluru' };
const root = join(import.meta.dirname, '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');
/** a raid as the form logs it, stamped at `minute` */
const raid = (f: kb.RaidForm, minute = 5): ScoreAction[] =>
  kb.raidActions(play([]), f).map((a) => ({ ...a, payload: { ...a.payload, minute, half: 1 } }));
const apply = (s: kb.KabaddiState, acts: ScoreAction[]) => acts.reduce(kb.reducer, s);
const logRaid = (s: kb.KabaddiState, f: kb.RaidForm, minute = 5) =>
  apply(s, kb.raidActions(s, f).map((a) => ({ ...a, payload: { ...a.payload, minute, half: 1 } })));
const strip = (s: kb.KabaddiState) => ({ home: s.home, away: s.away, out: s.out, emptyRaids: s.emptyRaids, events: s.events.map((e) => ({ ...e, playerId: undefined, detail: undefined })) });

/* ===================== fix 1: "Tackled by?" ===================== */
describe('fix 1 · Tackled by? after a quick Raider out', () => {
  const raider = { id: 'r1' };
  const tackler = { id: 't1' };
  const quick = (s: kb.KabaddiState, side: Side = 'home', minute = 5) => logRaid(s, kb.quickRaidForm(side, 'out', raider), minute);

  test('B1/B2: naming the tackler keeps the score, the mat and the raid count', () => {
    const s0 = logRaid(logRaid(play([]), { side: 'away', touches: 2, bonus: false, tackled: false }, 3), { side: 'home', touches: 1, bonus: false, tackled: false }, 4);
    const s1 = quick(s0, 'away', 6);
    const eid = s1.raids!.at(-1)!.eid!;
    const acts = kb.tacklerActions(s1, eid, tackler);
    assert.ok(acts.length > 0);
    const s2 = apply(s1, acts);
    assert.equal(s2.raids!.length, s1.raids!.length, 'no second raid');
    assert.equal(s2.home, s1.home);
    assert.equal(s2.away, s1.away);
    assert.deepEqual(s2.out, s1.out);
    assert.deepEqual(s2.emptyRaids, s1.emptyRaids);
    const r = s2.raids!.at(-1)!;
    assert.equal(r.eid, eid);
    assert.equal(r.tacklerId, 't1');
    assert.equal(r.raiderId, 'r1');
    assert.equal(s2.events.filter((e) => e.kind === 'tackle').length, s1.events.filter((e) => e.kind === 'tackle').length);
    assert.equal(s2.events.find((e) => e.kind === 'tackle' && e.group === eid)?.playerId, 't1');
  });

  test('B3: the tackler is credited the tackle points once; the raider keeps his net credit', () => {
    const s1 = quick(play([]));
    const eid = s1.raids![0].eid!;
    const acts = kb.tacklerActions(s1, eid, tackler);
    const credits = new Map<string, number>();
    for (const a of acts) for (const c of [a.attribution, a.attribution2]) if (c?.playerId) credits.set(`${c.playerId}|${c.stat}`, (credits.get(`${c.playerId}|${c.stat}`) ?? 0) + Number(c.by ?? 1));
    assert.equal(credits.get('t1|tacklePoints'), 1);
    assert.equal(credits.get('r1|raidPoints') ?? 0, 0);
  });

  test('B3: a super tackle credits 2', () => {
    // away loses 4 defenders → 3 on the mat → a tackle is a super tackle
    let s = logRaid(play([]), { side: 'home', touches: 4, bonus: false, tackled: false }, 2);
    s = quick(s, 'home', 3);
    const acts = kb.tacklerActions(s, s.raids!.at(-1)!.eid!, tackler);
    const rc = acts.find((a) => a.type === 'RAID_OUTCOME')!;
    assert.equal(rc.attribution2?.by, 2);
    assert.equal(rc.attribution2?.side, 'away');
  });

  test('B4: the edit is stamped at the raid’s own minute and half', () => {
    const s1 = quick(play([]), 'home', 7);
    const acts = kb.tacklerActions(s1, s1.raids![0].eid!, tackler);
    const rc = acts.find((a) => a.type === 'RAID_OUTCOME')!;
    assert.equal(rc.payload?.minute, 7);
    assert.equal(rc.payload?.half, 1);
    assert.equal(rc.payload?.replaces, s1.raids![0].eid);
    const s2 = apply(s1, acts);
    assert.equal(s2.raids![0].minute, 7);
  });

  test('B5: nothing to edit on a raid that is gone, not a tackle, or already named', () => {
    const s1 = quick(play([]));
    const eid = s1.raids![0].eid!;
    const head = s1.events.find((e) => e.id === eid)!;
    const removed = kb.reducer(s1, removeEventAction(s1, head));
    assert.deepEqual(kb.tacklerActions(removed, eid, tackler), []);
    assert.deepEqual(kb.tacklerActions(s1, 9999, tackler), []);
    const empty = logRaid(play([]), kb.quickRaidForm('home', 'empty', raider));
    assert.deepEqual(kb.tacklerActions(empty, empty.raids![0].eid!, tackler), []);
    const self = logRaid(play([]), { side: 'home', touches: 0, bonus: false, tackled: false, lineOut: true, rout: 'baulk' });
    assert.deepEqual(kb.tacklerActions(self, self.raids![0].eid!, tackler), []);
    const named = apply(s1, kb.tacklerActions(s1, eid, tackler));
    assert.deepEqual(kb.tacklerActions(named, eid, { id: 't2' }), []);
  });

  test('B6: the Raider chips sit above the one-tap row, which still credits the picked raider', () => {
    const ui = src('src/sports/kabaddi/index.tsx');
    assert.ok(ui.indexOf('Raider (optional)') < ui.indexOf('One tap'), 'raider chips first');
    assert.match(ui, /recordForm\(quickRaidForm\(raidFlow\.side, 'out', raidFlow\.raider\)/);
    assert.match(ui, /Tackled by\?/);
    assert.match(ui, /tacklerActions\(/);
  });
});

/* ===================== fix 2: volleyball block fault ===================== */
describe('fix 2 · volleyball "Block out" → block fault', () => {
  const vplay = (acts: ScoreAction[]) => acts.reduce(vb.reducer, vb.init({}));
  test('B7: the key stays blockout; the label is the block fault', () => {
    const t = vb.VB_ERROR_TYPES.find((x) => x.key === 'blockout');
    assert.ok(t);
    assert.equal(t!.label, 'Block fault (net / over / blocked a serve)');
    assert.equal(vb.errorTypeLabel('blockout'), 'Block fault (net / over / blocked a serve)');
    assert.ok(!vb.VB_ERROR_TYPES.some((x) => /block out/i.test(x.label)));
  });
  test('B7: an old blockout event still counts as a block error', () => {
    const s = vplay([vb.outcomeAction('opperror', 'home', undefined, { err: 'blockout' }), vb.outcomeAction('opperror', 'away', undefined, { err: 'net' })]);
    assert.equal(s.events[0].oe?.type, 'blockout');
    const row = volleyballMatchStats(s).cats.flatMap((c) => c.rows).find((r) => r.key === 'oppBlk');
    assert.ok(row);
    assert.equal(row!.home, '1');
  });
  test('B8: commentary and hint read "block fault"', () => {
    const e = { id: 1, stamp: 'Set 1', icon: '', label: '', side: 'home' as const, kind: 'opperror', oe: { type: 'blockout' } };
    assert.match(rallySentence(e, { home: 'Italy', away: 'Poland' }), /block fault/);
    assert.doesNotMatch(rallySentence(e, { home: 'Italy', away: 'Poland' }), /block out/);
    assert.match(vb.VB_BLOCK_HINT, /off the block and out/i);
    assert.match(vb.VB_BLOCK_HINT, /⚡ Attack/);
    assert.match(src('src/sports/volleyball/index.tsx'), /VB_BLOCK_HINT/);
  });
});

/* ===================== fix 3: raider out without a tackle ===================== */
describe('fix 3 · raider out without a tackle (rout)', () => {
  const self = (rout: string | undefined, extra: Partial<kb.RaidForm> = {}): kb.RaidForm => ({ side: 'home', touches: 0, bonus: false, tackled: false, lineOut: true, ...(rout ? { rout } : {}), raider: { id: 'r1' }, ...extra });

  test('the reasons', () => {
    assert.deepEqual(kb.ROUT_REASONS.map((r) => r.key), ['line', 'baulk', 'time', 'cant']);
    assert.equal(kb.routLabel('time'), 'Raid time (30 s)');
  });

  test('raidActions carries rout only on a self-out', () => {
    assert.equal(raid(self('baulk')).at(-1)!.payload?.rout, 'baulk');
    assert.equal(raid({ side: 'home', touches: 1, bonus: false, tackled: true, rout: 'baulk' }).at(-1)!.payload?.rout, undefined);
  });

  test('B9: an old line-out (no rout) replays exactly as before', () => {
    const old = play(raid(self(undefined)));
    assert.equal(old.raids![0].rout, undefined);
    const ev = old.events.find((e) => e.kind === 'lineout')!;
    assert.equal(ev.label, 'Line-out +1 — raider out');
    assert.match(old.events.find((e) => e.kind === 'raid')!.label, /raider stepped out/);
    const s = kabaddiCommentary(old, NAMES).flatMap((g) => g.entries).map((x) => x.text).join('\n');
    assert.match(s, /stepped out of bounds — out, \+1 to Bengaluru/);
  });

  test('B10/B11: scored as a line-out: +1 to the defence, raider out, a defender revived', () => {
    for (const k of ['line', 'baulk', 'time', 'cant']) {
      const base = logRaid(play([]), { side: 'home', touches: 2, bonus: false, tackled: false }, 2); // away: 2 out
      const a = logRaid(base, { side: 'home', touches: 0, bonus: false, tackled: false, lineOut: true, rout: k }, 3);
      const b = logRaid(base, { side: 'home', touches: 0, bonus: false, tackled: false, lineOut: true }, 3);
      assert.equal(a.home, b.home);
      assert.equal(a.away, b.away);
      assert.deepEqual(a.out, b.out);
      assert.equal(a.away, base.away + 1, '+1 to the defence');
      assert.equal(a.home, base.home);
      assert.equal(a.out.home, base.out.home + 1, 'the raider is out');
      assert.equal(a.out.away, base.out.away - 1, 'one defender revived');
      assert.equal(a.raids!.at(-1)!.rout, k);
    }
  });

  test('B10: never a super tackle, never a tackler credit', () => {
    let s = logRaid(play([]), { side: 'home', touches: 4, bonus: false, tackled: false }, 2); // away 3 on the mat
    const before = s.away;
    const acts = kb.raidActions(s, { side: 'home', touches: 0, bonus: false, tackled: true, tackler: { id: 't1' }, lineOut: true, rout: 'time' });
    s = apply(s, acts);
    assert.equal(s.away, before + 1);
    assert.equal(acts.at(-1)!.attribution2, undefined);
    assert.equal(s.raids!.at(-1)!.tacklerId, undefined);
    assert.equal(s.events.filter((e) => e.kind === 'tackle').length, 0);
  });

  test('B11: a self-out that empties the raiding side is an all-out', () => {
    // away touches 6 home defenders, then home's last raider self-outs
    let s = logRaid(play([]), { side: 'away', touches: 6, bonus: false, tackled: false }, 2);
    assert.equal(s.out.home, 6);
    const awayBefore = s.away;
    s = logRaid(s, { side: 'home', touches: 0, bonus: false, tackled: false, lineOut: true, rout: 'baulk' }, 3);
    assert.equal(s.away, awayBefore + 1 + 2);
    assert.ok(s.events.some((e) => e.kind === 'allout' && e.side === 'away'));
  });

  test('B12: an unknown / non-string rout is ignored', () => {
    for (const bad of ['jump', 7, { x: 1 }, '']) {
      const a = { ...raid(self(undefined)).at(-1)!, payload: { ...raid(self(undefined)).at(-1)!.payload, rout: bad } } as ScoreAction;
      const s = play([a]);
      assert.equal(s.raids![0].rout, undefined);
      assert.deepEqual(strip(s), strip(play(raid(self(undefined)))));
    }
  });

  test('B13: a valid rout without lineOut still puts the raider out, no tackle', () => {
    const a = raid({ side: 'home', touches: 2, bonus: false, tackled: false }).at(-1)!;
    const s = play([{ ...a, payload: { ...a.payload, rout: 'cant' } }]);
    assert.equal(s.raids![0].lineOut, true);
    assert.equal(s.home, 0);
    assert.equal(s.away, 1);
    assert.equal(s.out.home, 1);
  });

  test('B14: removing a self-out takes its point and line', () => {
    const s = play(raid(self('baulk')));
    const head = s.events.find((e) => e.kind === 'raid')!;
    const r = kb.reducer(s, removeEventAction(s, head));
    assert.equal(r.home + r.away, 0);
    assert.equal(r.events.filter((e) => e.kind === 'lineout').length, 0);
    assert.deepEqual(r.out, { home: 0, away: 0 });
  });

  test('B15: editing keeps the reason; turning it into a tackle drops it', () => {
    const s = play(raid(self('time')));
    const eid = s.raids![0].eid!;
    const kept = logRaid(s, { ...self('time'), editOf: eid });
    assert.equal(kept.raids![0].rout, 'time');
    const tackle = logRaid(s, { side: 'home', touches: 0, bonus: false, tackled: true, rout: 'time', editOf: eid });
    assert.equal(tackle.raids![0].rout, undefined);
    assert.equal(tackle.raids![0].lineOut, undefined);
    const ui = src('src/sports/kabaddi/index.tsx');
    assert.match(ui, /raid\.rout \? \{ rout: raid\.rout \}/);
  });

  test('B16: Stats — raider self-outs by reason, old line-outs as stepped out', () => {
    let s = play([]);
    s = logRaid(s, self('baulk'), 1);
    s = logRaid(s, { ...self('time'), side: 'away' }, 2);
    s = logRaid(s, self(undefined), 3);
    s = logRaid(s, { ...self('baulk'), side: 'away' }, 4);
    s = logRaid(s, self('cant'), 5);
    const rows = kabaddiMatchStats(s).cats.flatMap((c) => c.rows);
    const row = (id: string) => rows.find((r) => r.key === id);
    assert.equal(row('selfOuts')?.home, '3');
    assert.equal(row('selfOuts')?.away, '2');
    assert.equal(row('rout_baulk')?.home, '1');
    assert.equal(row('rout_baulk')?.away, '1');
    assert.equal(row('rout_line')?.home, '1');
    assert.equal(row('rout_time')?.away, '1');
    assert.equal(row('rout_cant')?.home, '1');
    const ids = rows.map((r) => r.key);
    const cats = kabaddiMatchStats(s).cats;
    for (const c of cats) assert.equal(new Set(c.rows.map((r) => r.key)).size, c.rows.length, `unique ids in ${c.id}`);
    assert.ok(ids.includes('selfOuts'));
    const none = kabaddiMatchStats(logRaid(play([]), { side: 'home', touches: 1, bonus: false, tackled: false })).cats.flatMap((c) => c.rows);
    assert.ok(!none.some((r) => r.key === 'selfOuts' || r.key.startsWith('rout_')));
  });

  test('B17: commentary and timeline wording', () => {
    const s = play(raid(self('baulk')));
    const r = s.raids![0];
    const b = kb.perRaidByIndex(kb.replayOf(s))[0];
    assert.equal(raidSentence(r, b, 1, NAMES).text, 'Raid 1 — Patna raider: out without a tackle (baulk line not crossed) — +1 to Bengaluru');
    const line = s.events.find((e) => e.kind === 'lineout')!;
    assert.equal(line.label, 'Raider out +1 — baulk line not crossed (no tackle)');
    assert.equal(line.side, 'away');
    assert.match(s.events.find((e) => e.kind === 'raid')!.label, /raider out \(baulk line not crossed\)/);
    // a self-out never counts towards High 5
    let t = play([]);
    for (let i = 0; i < 6; i++) t = logRaid(t, { side: 'home', touches: 0, bonus: false, tackled: false, lineOut: true, rout: 'time', tackler: { id: 't1' } }, i);
    assert.ok(!kabaddiCommentary(t, NAMES).flatMap((g) => g.entries).some((e) => (e.tags ?? []).some((x: string) => /HIGH 5/.test(x))));
  });

  test('B18: "Cant late" hidden for new technical points, old ones still read', () => {
    assert.ok(!kb.NEW_TECH_REASONS.some((r) => r.key === 'cant'));
    assert.equal(kb.NEW_TECH_REASONS.length, kb.TECH_REASONS.length - 1);
    assert.equal(kb.techReasonLabel('cant'), 'Cant late / not kept');
    const ui = src('src/sports/kabaddi/index.tsx');
    assert.match(ui, /NEW_TECH_REASONS\.map/);
    assert.doesNotMatch(ui, /\{TECH_REASONS\.map/);
  });
});
