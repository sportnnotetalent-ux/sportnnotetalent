/**
 * Court-team batch 5 — seeded simulation (quality mandate step 6;
 * docs/security/breaks/court-team-batch5.md). 600 matches with the new
 * captures (200 volleyball, 200 kabaddi, 200 handball) checked against
 * invariants, plus 180 old-style matches whose state, totals, stats numbers
 * and commentary match the fingerprint recorded on the code before this
 * batch (e1a8916).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ScoreAction } from '../src/sports/types.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import * as vbActions from '../src/sports/volleyball/actions.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import { volleyballMatchStats } from '../src/sports/volleyball/matchStats.ts';
import { volleyballCommentary } from '../src/sports/volleyball/commentary.ts';
import { sanctionsOf } from '../src/sports/volleyball/sanctions.ts';
import { catCoveredAt, detailTally, entryCat, receptionTracked } from '../src/sports/volleyball/detail.ts';
import * as kb from '../src/sports/kabaddi/engine.ts';
import * as kbActions from '../src/sports/kabaddi/actions.ts';
import { kabaddiMatchStats } from '../src/sports/kabaddi/matchStats.ts';
import { kabaddiTotals } from '../src/sports/kabaddi/totals.ts';
import * as hb from '../src/sports/handball/engine.ts';
import { handballTotals } from '../src/sports/handball/totals.ts';
import { handballDepthFigures } from '../src/sports/handball/depth.ts';
import * as save from '../src/sports/handball/savePrompt.ts';
import { hbLog, kbRun, oldFingerprint, vbActions as toVbActions, vbLog } from './courtTeamBatch5Gen.mts';

type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const mods = {
  vb, actions: { ...vbActions, ...kbActions }, totals: { volleyballStatTotals, kabaddiTotals, handballTotals },
  matchStats: { volleyballMatchStats, kabaddiMatchStats }, commentary: { volleyballCommentary },
  kb, hb, depth: { handballDepthFigures }, save,
};

describe('sim · old matches replay identically (R1, V1, K2, H2)', () => {
  test('180 old-style logs: the same fingerprint as the code before this batch', () => {
    assert.deepEqual(oldFingerprint(mods), {
      // no-false-zeros NZC1 / NZC2 / NZC4: 12 of these 60 volleyball logs had a
      // category switched on with nothing of it captured — their setAssists 0,
      // receptionErrors 0, kills-only attack attempts (efficiency 100%) and
      // reception efficiency without errors are gone (verified old-vs-new log
      // by log: nothing else changed). Was 'a0696d80cb52e166f0c9ed352718aee3002043dce23556712a86819d56b0552a'.
      vb: 'fc8bf30a32415df6f34c2cfd1f86852971ef7ff30d0201a6d0a873d427b70e6a',
      kb: '3dab044cb43b2e3a60c2b47a1bbbdcbe806f6c6f2fc044c3a47b5f64fdf24388',
      hb: '77b1392145f470ececfae87059725661fb45999d154f7ba2f8e6cef2265cf70d',
    });
  });
});

describe('sim · volleyball (200 matches)', () => {
  test('aced, discipline and fault invariants', () => {
    let acedOnly = 0, acedEntries = 0, sanctions = 0, newFaults = 0;
    for (let i = 1; i <= 200; i++) {
      const { cfg, acts } = vbLog(5000 + i, false);
      const real = toVbActions(mods, acts);
      const s = real.reduce(vb.reducer, vb.init(cfg));
      // V7 / DC10: detail entries never move the score
      const bare = real.filter((a: ScoreAction) => a.type !== 'VB_DETAIL' && a.type !== 'SET_DETAIL').reduce(vb.reducer, vb.init(cfg));
      assert.deepEqual([s.current, s.setsWon, s.ended], [bare.current, bare.setsWon, bare.ended], `seed ${i}: score`);
      const tally = [...detailTally(s).values()];
      const vd = s.vd ?? [];
      for (const X of SIDES) {
        // V3: every aced receiver is one reception error
        const aced = vd.filter((x) => x.kind === 'aced' && x.side === X);
        assert.equal(tally.filter((l) => l.side === X).reduce((t, l) => t + l.receptionErrors, 0), aced.length, `seed ${i}: errors`);
        // V2 / V4: receptions = grades + aced logged with Reception quality on (old rule without the aced category)
        const covered = aced.filter((x) => entryCat(s, x) === 'reception').length;
        const graded = vd.filter((x) => x.kind === 'reception' && x.side === X).length;
        assert.equal(tally.filter((l) => l.side === X).reduce((t, l) => t + l.receptions, 0), graded + covered, `seed ${i}: receptions`);
        for (const x of aced) if (entryCat(s, x) === 'aced') { acedOnly++; assert.equal(catCoveredAt(s, 'reception', x.set, x.at - 1), false); }
        acedEntries += aced.length;
      }
      // V2: no reception keys unless Reception quality was tracked
      const t = volleyballStatTotals(s);
      if (!receptionTracked(s)) for (const l of Object.values(t)) assert.equal('receptions' in l.stats, false, `seed ${i}: no reception keys`);
      const ms = volleyballMatchStats(s);
      // V8: discipline = the sanctions, per offender
      const sx = sanctionsOf(s.events);
      sanctions += sx.length;
      const disc = ms.cats.find((c) => c.id === 'discipline');
      if (!sx.length) assert.equal(disc, undefined);
      else for (const X of SIDES) assert.equal(disc!.rows.reduce((n, r) => n + (X === 'home' ? r.h : r.a), 0), sx.filter((x) => x.by === X).length, `seed ${i}: discipline`);
      // V9: faults = the six known fault keys only
      const scoring = ms.cats.find((c) => c.id === 'scoring')!;
      const fault = scoring.rows.find((r) => r.key === 'oppFault');
      if (fault) for (const X of SIDES) {
        const n = s.events.filter((e) => e.kind === 'opperror' && e.side === X && ['net', 'foot', 'rotation', 'hits', 'handling', 'backrow'].includes(e.oe?.type ?? '')).length;
        assert.equal(X === 'home' ? fault.h : fault.a, n);
      }
      newFaults += s.events.filter((e) => ['handling', 'backrow'].includes(e.oe?.type ?? '')).length;
      // V3: commentary names each aced receiver once
      const text = volleyballCommentary(s, { home: 'H', away: 'A', nameOf: (id) => id ?? '' }).flatMap((g) => g.entries).map((e) => e.text);
      assert.equal(text.filter((x) => /couldn't receive it/.test(x)).length, vd.filter((x) => x.kind === 'aced').length, `seed ${i}: commentary`);
      for (const x of text) assert.doesNotMatch(x, /undefined|NaN|\[object/);
    }
    assert.ok(acedOnly > 20 && acedEntries > 200 && sanctions > 50 && newFaults > 20, `coverage ${acedOnly}/${acedEntries}/${sanctions}/${newFaults}`);
  });
});

describe('sim · kabaddi (200 matches)', () => {
  test('technical-point reason rows add up, in every scope; no hostile row', () => {
    let techs = 0;
    for (let i = 1; i <= 200; i++) {
      const s = kbRun(mods, 7000 + i, false);
      techs += (s.extras ?? []).filter((x) => x.x === 'tech').length;
      for (const scope of ['all', 1, 2] as const) {
        const d = kabaddiMatchStats(s, scope).cats.find((c) => c.id === 'discipline');
        if (!d) continue;
        const total = d.rows.find((r) => r.key === 'techAgainst')!;
        const subs = d.rows.filter((r) => r.key.startsWith('tech_'));
        assert.equal(subs.reduce((t, r) => t + r.h, 0), total.h, `seed ${i} ${scope}`);
        assert.equal(subs.reduce((t, r) => t + r.a, 0), total.a, `seed ${i} ${scope}`);
        for (const r of subs) assert.match(r.key, /^tech_(cant|coaching|delay|twoRaiders|entry|other|card|none)$/);
        assert.equal(new Set(d.rows.map((r) => r.key)).size, d.rows.length, 'unique row keys');
      }
    }
    assert.ok(techs > 200, `coverage ${techs}`);
  });
});

describe('sim · handball (200 matches)', () => {
  test('team saves always; a named keeper gets the save; picks never move the score', () => {
    let picks = 0, credited = 0;
    for (let i = 1; i <= 200; i++) {
      const { acts, picks: p } = hbLog(mods, 9000 + i, 'new');
      picks += p;
      const s = acts.reduce(hb.reducer, hb.init({}));
      // H4: dropping the keeper changes leaves the score and the shots as they were
      const bare = acts.filter((a) => a.type !== 'GK').reduce(hb.reducer, hb.init({}));
      assert.deepEqual([s.home, s.away], [bare.home, bare.away]);
      for (const X of SIDES) {
        // H1: every save counts for the team
        const saves = s.events.filter((e) => e.type === 'save' && e.side === X).length;
        assert.equal(hb.teamFigures(s, X).saves, saves);
        const against = s.events.filter((e) => e.type === 'goal' && e.side === other(X)).length;
        const pct = handballDepthFigures(s, X).savePct;
        if (saves + against > 0) assert.equal(pct, Math.round((100 * saves) / (saves + against)));
      }
      // H2: each keeper's saves = the save events naming him
      const t = handballTotals(s);
      for (const [id, l] of Object.entries(t)) {
        const n = s.events.filter((e) => e.type === 'save' && e.playerId === id).length;
        assert.equal(l.stats.saves ?? 0, n, `seed ${i}: ${id}`);
        credited += n;
      }
      // a keeper named with `spell` has a full line (goals conceded written)
      for (const e of s.events) if (e.type === 'gk' && e.spell) assert.equal(typeof t[e.playerId!]?.stats.goalsConceded, 'number');
    }
    assert.ok(picks > 50 && credited > 500, `coverage ${picks}/${credited}`);
  });
});
