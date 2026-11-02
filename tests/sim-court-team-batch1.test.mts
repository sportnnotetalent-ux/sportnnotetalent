/**
 * Court and team sports, batch 1 — seeded simulation (quality mandate step 6;
 * breaks: docs/security/breaks/court-team-batch1.md).
 *  - kabaddi: 60 matches × ~40 random raids (quick raids, form raids, self-outs
 *    with and without a reason, "Tackled by?" edits, undo) — rout is label-only,
 *    a tackler edit never moves the score / mat, self-outs are never tackles.
 *  - volleyball: 600 random rallies with random fault types — blockout keeps
 *    its key, counts as a block error, reads "block fault".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as kb from '../src/sports/kabaddi/engine.ts';
import { kabaddiCommentary } from '../src/sports/kabaddi/commentary.ts';
import { kabaddiMatchStats } from '../src/sports/kabaddi/matchStats.ts';
import { removeEventAction } from '../src/sports/kabaddi/actions.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { volleyballCommentary } from '../src/sports/volleyball/commentary.ts';
import { volleyballMatchStats } from '../src/sports/volleyball/matchStats.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 20261102;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
type Side = 'home' | 'away';
const NAMES = { home: 'Patna', away: 'Bengaluru' };
const ROUTS = ['line', 'baulk', 'time', 'cant'];
const players = (side: Side) => Array.from({ length: 7 }, (_, i) => ({ id: `${side[0]}${i}` }));

const stamp = (acts: ScoreAction[], minute: number) => acts.map((a) => (a.type === 'RAID_OUTCOME' && a.payload?.replaces != null ? a : { ...a, payload: { ...a.payload, minute, half: 1 } }));
const apply = (s: kb.KabaddiState, acts: ScoreAction[]) => acts.reduce(kb.reducer, s);
const core = (s: kb.KabaddiState) => ({ home: s.home, away: s.away, out: s.out, emptyRaids: s.emptyRaids });

test('kabaddi: 2,400 random raids — rout label-only, tackler edits score-neutral, self-outs never tackles', () => {
  let raids = 0, selfOuts = 0, edits = 0;
  for (let m = 0; m < 60; m++) {
    const cfg = { playersPerSide: 7, style: ['sanjeevani', 'sanjeevani', 'gaminee'][rnd(3)], proRules: rnd(2) === 0, halfMinutes: 20 };
    let s = kb.reducer(kb.init(cfg), { type: 'KICKOFF', payload: { at: 1 } });
    /** the same log with every rout dropped (B9: an old line-out) */
    let plain = s;
    for (let i = 0; i < 40 && !s.ended; i++) {
      const side: Side = i % 2 === 0 ? 'home' : 'away';
      const raider = players(side)[rnd(7)];
      const roll = rnd(10);
      let f: kb.RaidForm;
      if (roll < 3) f = kb.quickRaidForm(side, (['empty', 'touch', 'bonus', 'out'] as const)[rnd(4)], raider);
      else if (roll < 5) { f = { side, touches: rnd(3), bonus: false, tackled: false, lineOut: true, rout: rnd(5) === 0 ? undefined : ROUTS[rnd(4)], raider }; selfOuts++; }
      else f = { side, touches: rnd(4), bonus: rnd(4) === 0, tackled: rnd(3) === 0, defOut: rnd(6) === 0 ? 1 : undefined, raider };
      const before = s;
      const acts = stamp(kb.raidActions(s, f), i);
      s = apply(s, acts);
      plain = apply(plain, stamp(kb.raidActions(plain, { ...f, rout: undefined }), i));
      raids++;
      // B9/B12: the reason never changes the score or the mat
      assert.deepEqual(core(s), core(plain), `match ${m} raid ${i}`);
      const r = s.raids!.at(-1)!;
      if (f.lineOut) {
        // B10: a self-out is never a tackle, never credits a tackler
        assert.equal(r.lineOut, true);
        assert.equal(r.tacklerId, undefined);
        assert.ok(!s.events.some((e) => e.group === r.eid && e.kind === 'tackle'));
        assert.equal(r.rout, f.rout);
      } else assert.equal(r.rout, undefined);
      // B1–B3: "Tackled by?" after a tackle never moves the score or the mat
      if (!s.ended && r.raiderOut && !r.lineOut && rnd(2) === 0) {
        const t = players(side === 'home' ? 'away' : 'home')[rnd(7)];
        const ed = kb.tacklerActions(s, r.eid!, t);
        assert.ok(ed.length > 0);
        const s2 = apply(s, ed);
        assert.deepEqual(core(s2), core(s));
        assert.equal(s2.raids!.length, s.raids!.length);
        assert.equal(s2.raids!.at(-1)!.tacklerId, t.id);
        assert.equal(s2.raids!.at(-1)!.minute, r.minute);
        assert.deepEqual(kb.tacklerActions(s2, r.eid!, t), [], 'asked once');
        s = s2;
        plain = apply(plain, kb.tacklerActions(plain, plain.raids!.at(-1)!.eid!, t));
        edits++;
      }
      // B14: undo the last raid now and then — back to the score before it
      if (!s.ended && rnd(12) === 0) {
        const head = s.events.find((e) => e.id === r.eid)!;
        const u = kb.reducer(s, removeEventAction(s, head));
        assert.deepEqual({ h: u.home, a: u.away, out: u.out }, { h: before.home, a: before.away, out: before.out });
      }
    }
    // B16: every self-out counted once, by reason; B17: a sentence per raid
    const rows = kabaddiMatchStats(s).cats.flatMap((c) => c.rows);
    const lineOuts = (s.raids ?? []).filter((r) => r.lineOut);
    const so = rows.find((x) => x.key === 'selfOuts');
    assert.equal(so ? Number(so.h) + Number(so.a) : 0, lineOuts.length);
    const byReason = rows.filter((x) => x.key.startsWith('rout_')).reduce((t, x) => t + Number(x.h) + Number(x.a), 0);
    assert.equal(byReason, lineOuts.length);
    const feed = kabaddiCommentary(s, NAMES).flatMap((g) => g.entries).map((e) => e.text);
    assert.equal(feed.filter((t) => /out without a tackle/.test(t)).length, lineOuts.filter((r) => r.rout).length);
    // the score is the sum of its timeline lines
    for (const side of ['home', 'away'] as const) assert.equal(s[side], s.events.filter((e) => e.side === side).reduce((t, e) => t + (e.points ?? 0), 0));
  }
  assert.ok(raids >= 500 && selfOuts >= 100 && edits >= 50, `${raids} raids, ${selfOuts} self-outs, ${edits} edits`);
});

test('volleyball: 600 random rallies — blockout keeps its key and counts as a block error', () => {
  const ERRS = [undefined, ...vb.VB_ERROR_TYPES.map((t) => t.key)];
  let rallies = 0;
  for (let m = 0; m < 20; m++) {
    let s = vb.init({});
    for (let i = 0; i < 30; i++) {
      const side: Side = rnd(2) === 0 ? 'home' : 'away';
      const kind = (['attack', 'block', 'ace', 'opperror', 'serveerror'] as const)[rnd(5)];
      s = vb.reducer(s, vb.outcomeAction(kind, side, undefined, kind === 'opperror' ? { err: ERRS[rnd(ERRS.length)] } : undefined));
      rallies++;
    }
    const blk = s.events.filter((e) => e.kind === 'opperror' && e.oe?.type === 'blockout');
    assert.ok(!s.events.some((e) => /block out/i.test(`${e.label} ${e.detail ?? ''}`)));
    const row = volleyballMatchStats(s).cats.flatMap((c) => c.rows).find((r) => r.key === 'oppBlk');
    assert.equal(row ? Number(row.h) + Number(row.a) : 0, blk.length);
    const feed = volleyballCommentary(s, { home: 'Italy', away: 'Poland' }).flatMap((g) => g.entries).map((e) => e.text);
    assert.ok(!feed.some((t) => /block out/i.test(t)));
    assert.equal(feed.filter((t) => /block fault/.test(t)).length, blk.length);
  }
  assert.ok(rallies >= 500);
});
