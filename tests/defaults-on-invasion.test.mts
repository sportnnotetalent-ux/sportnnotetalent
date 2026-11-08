/**
 * Wave 3 — "Stats to track" ON by default for NEW football, hockey, ice
 * hockey, rugby union and rugby league matches
 * (docs/security/breaks/defaults-on-invasion.md DOI1–DOI10;
 * docs/sport-expert/defaults-on/invasion.md; founder decisions 2026-11-08).
 * One defaults constant per sport feeds the format fields, the live settings
 * and their `defaults`; replay fallbacks stay OFF.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FormatField, LiveSettings, ScoreAction } from '../src/sports/types.ts';
import type { Player } from '../src/core/types.ts';
import { matchCaptures } from '../src/sports/matchRules.ts';
import { customCount, standardOf } from '../src/sports/liveSettings.ts';
import * as fbMeta from '../src/sports/football/meta.ts';
import * as football from '../src/sports/football/engine.ts';
import { footballStatTotals } from '../src/sports/football/totals.ts';
import * as hkMeta from '../src/sports/hockey/meta.ts';
import * as hockey from '../src/sports/hockey/engine.ts';
import * as icMeta from '../src/sports/ice_hockey/meta.ts';
import * as ice from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyVoice } from '../src/sports/ice_hockey/voice.ts';
import * as ruMeta from '../src/sports/rugby/meta.ts';
import * as rugby from '../src/sports/rugby/engine.ts';
import { rugbyVoice } from '../src/sports/rugby/voice.ts';
import * as rlMeta from '../src/sports/rugby_league/meta.ts';
import * as league from '../src/sports/rugby_league/engine.ts';
import { leagueVoice } from '../src/sports/rugby_league/voice.ts';

const ROOT = join(import.meta.dirname, '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** What the new-match forms stamp (FormatEditor `defaultsFor`, a .tsx: mirrored here). */
export const newMatch = (fields: readonly FormatField[], ctx?: 'tournament') => {
  const preset = fields.find((f) => f.type === 'preset');
  const pd = ctx === 'tournament' && preset?.tournamentDefault != null ? preset.tournamentDefault : preset?.default;
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f === preset ? pd : (ctx === 'tournament' && f.tournamentDefault != null ? f.tournamentDefault : f.default)]));
  Object.assign(out, preset?.options?.find((o) => o.value === pd)?.set ?? {});
  return out;
};

type Spec = {
  name: string;
  fields: readonly FormatField[];
  ls: LiveSettings<any>;
  init: (c?: Record<string, unknown>) => unknown;
  /** the one constant (must exist) */
  defaults: () => Record<string, boolean>;
  on: string[];
  off: string[];
};

const FB_ON_BASE = ['shots', 'saves', 'cards', 'fouls', 'offsides', 'corners', 'tackles', 'interceptions', 'attackContribution', 'defenceContribution', 'crosses', 'dribbles', 'handball'];
const FB_ON_DEEP = ['shotDetail', 'keyPasses', 'clearances', 'setPieces', 'cardReasons'];
const tk = (k: string) => `track${k[0].toUpperCase()}${k.slice(1)}`;

const SPECS: Spec[] = [
  {
    name: 'football', fields: fbMeta.FOOTBALL_META.formatFields!, ls: football.FOOTBALL_LIVE_SETTINGS, init: football.init,
    defaults: () => (fbMeta as any).FOOTBALL_STATS_DEFAULTS,
    on: [...FB_ON_BASE, ...FB_ON_DEEP].map(tk), off: ['trackPossession', 'trackPasses', 'trackRuledOut'],
  },
  {
    name: 'hockey', fields: hkMeta.HOCKEY_META.formatFields!, ls: hockey.HOCKEY_LIVE_SETTINGS, init: hockey.init,
    defaults: () => (hkMeta as any).HOCKEY_STATS_DEFAULTS,
    on: [], off: ['trackPossession', 'trackReferrals', 'trackRuledOut'],
  },
  {
    name: 'ice hockey', fields: icMeta.ICE_HOCKEY_META.formatFields!, ls: ice.ICE_HOCKEY_LIVE_SETTINGS, init: ice.init,
    defaults: () => (icMeta as any).ICE_HOCKEY_STATS_DEFAULTS,
    // DOI9: faceoff zones still replace the controls (describe-invasion DI16) → OFF
    on: ['trackFaceoffs', 'trackPhysical', 'trackPuck', 'trackAttempts'], off: ['trackFaceoffZones', 'plusMinus', 'trackRuledOut'],
  },
  {
    name: 'rugby union', fields: ruMeta.RUGBY_META.formatFields!, ls: rugby.RUGBY_LIVE_SETTINGS, init: rugby.init,
    defaults: () => (ruMeta as any).RUGBY_STATS_DEFAULTS,
    on: ['trackDetail', 'trackPenalties', 'trackTurnovers', 'trackEntries', 'trackOffloads', 'trackRestarts'], off: ['trackPossession', 'trackRuledOut'],
  },
  {
    name: 'rugby league', fields: rlMeta.RUGBY_LEAGUE_META.formatFields!, ls: league.LEAGUE_LIVE_SETTINGS, init: league.init,
    defaults: () => (rlMeta as any).RUGBY_LEAGUE_STATS_DEFAULTS,
    on: ['trackDefence', 'trackAttack', 'trackErrors', 'trackRestarts'], off: ['trackSets', 'trackRuledOut'],
  },
];

const capOn = (sp: Spec, cfg: Record<string, unknown>) =>
  Object.fromEntries(matchCaptures(sp.ls as never, sp.init(cfg), sp.fields, cfg).captures.map((c) => [c.key, c.on]));

for (const sp of SPECS) {
  describe(`${sp.name} · new-match defaults`, () => {
    test('one defaults constant lists exactly the ON and OFF keys', () => {
      const d = sp.defaults();
      assert.ok(d && typeof d === 'object', 'constant exported from meta.ts');
      assert.deepEqual(Object.keys(d).sort(), [...sp.on, ...sp.off].sort());
      for (const k of sp.on) assert.equal(d[k], true, k);
      for (const k of sp.off) assert.equal(d[k], false, k);
    });
    test('a new match stamps them and the engine plays them (Info agrees: DOI3)', () => {
      const cfg = newMatch(sp.fields);
      const cap = capOn(sp, cfg);
      for (const k of sp.on) { assert.equal(cfg[k], true, `stamp ${k}`); assert.equal(cap[k], true, `info ${k}`); }
      for (const k of sp.off) { assert.notEqual(cfg[k], true, `stamp ${k}`); assert.equal(cap[k], false, `info ${k}`); }
    });
    test('DOI2: format default = live field default = live `defaults` = the constant', () => {
      const d = sp.defaults();
      for (const [k, v] of Object.entries(d)) {
        assert.equal(sp.fields.find((f) => f.key === k)?.default, v, `format ${k}`);
        assert.equal(sp.ls.fields.find((f) => f.key === k)?.default, v, `live field ${k}`);
        assert.equal(sp.ls.defaults?.[k], v, `live defaults ${k}`);
      }
    });
    test('DOI5: every stats toggle carries group "Stats to track"', () => {
      for (const k of Object.keys(sp.defaults())) {
        assert.equal(sp.fields.find((f) => f.key === k)?.group, 'Stats to track', `format ${k}`);
        assert.equal(sp.ls.fields.find((f) => f.key === k)?.group, 'Stats to track', `live ${k}`);
      }
      for (const f of [...sp.fields, ...sp.ls.fields]) {
        if (f.type === 'toggle' && /stat/i.test(f.group ?? '')) assert.equal(f.group, 'Stats to track', f.key);
      }
    });
    test('DOI4: no preset stamps a stats key', () => {
      const keys = Object.keys(sp.defaults());
      for (const f of sp.fields.filter((x) => x.type === 'preset')) {
        for (const o of f.options ?? []) for (const k of Object.keys(o.set ?? {})) assert.ok(!keys.includes(k), `${o.value} sets ${k}`);
      }
    });
    test('DOI6: a brand-new match shows no stats option as changed', () => {
      const s = sp.init(newMatch(sp.fields));
      const vals = sp.ls.read(s);
      const std = standardOf(sp.ls, s)!;
      const statKeys = Object.keys(sp.defaults());
      const changed = statKeys.filter((k) => vals[k] !== std[k]);
      assert.deepEqual(changed, []);
      const stats = { ...sp.ls, fields: sp.ls.fields.filter((f) => statKeys.includes(f.key)) };
      assert.equal(customCount(stats, vals, s), 0);
    });
    test('DOI1/DOI3: an old match (no keys) gains nothing; Info shows it off', () => {
      const cap = capOn(sp, {});
      for (const k of sp.on) {
        if (sp.name === 'football' && FB_ON_BASE.map(tk).includes(k)) continue; // saved football keeps the full set (BASE_TRACKABLE)
        assert.equal(cap[k], false, k);
      }
    });
    test('DOI10: the founder\'s OFF list stays off on a new tournament match too', () => {
      const cfg = newMatch(sp.fields, 'tournament');
      for (const k of sp.off) {
        if (sp.name === 'football' && k === 'trackPossession') continue; // the tournament keeps possession (full set)
        assert.notEqual(cfg[k], true, k);
      }
    });
  });
}

describe('football specifics', () => {
  const fields = fbMeta.FOOTBALL_META.formatFields!;
  test('a new tournament match: the full set (possession on, passes off) plus the deep stats', () => {
    const cfg = newMatch(fields, 'tournament');
    assert.deepEqual(football.readTrack(cfg), football.readTrack({}));
    for (const k of FB_ON_DEEP) assert.equal(cfg[tk(k)], true, k);
    assert.equal(cfg.trackRuledOut, false);
  });
  test('DOI1: BASE_TRACKABLE full column unchanged; saved football reads the full set, no deep stats', () => {
    assert.deepEqual(fbMeta.BASE_TRACKABLE.filter(([, , f]) => !f).map(([k]) => k), ['passes']);
    assert.equal(football.readDeepTrack({}), undefined);
    assert.equal(football.init({}).deep, undefined);
  });
  test('DOI8: a new friendly that taps only goals has no tracked zero', () => {
    const P = (id: string) => ({ id, name: id });
    const acts: ScoreAction[] = [
      { type: 'KICKOFF', payload: { at: 1000, ord: true } },
      { type: 'XI', payload: { team: 'home', gk: P('hgk'), players: ['hgk', 'hst'].map(P), keepers: [P('hgk')] } },
      { type: 'XI', payload: { team: 'away', gk: P('agk'), players: ['agk', 'ast'].map(P), keepers: [P('agk')] } },
      { type: 'GOAL', side: 'home', payload: { goalType: 'open', pid: 'hst', minute: 3, half: 1 }, attribution: { playerId: 'hst', stat: 'goals', playerName: 'hst' } },
    ];
    const s = acts.reduce(football.reducer, football.init(newMatch(fields)));
    const keys = new Set(Object.values(footballStatTotals(s)).flatMap((l) => Object.keys(l.stats)));
    for (const k of ['tackles', 'interceptions', 'fouls', 'crosses', 'dribbles', 'keyPasses', 'clearances', 'saves', 'offsides', 'handballs']) assert.ok(!keys.has(k), k);
  });
  test('DOI9: the key-pass step is a non-blocking card, not a panel', () => {
    const ui = src('src/sports/football/index.tsx');
    assert.doesNotMatch(ui, /mode: 'keypass'/);
    assert.doesNotMatch(ui, /Skip — no key pass/);
    assert.match(ui, /const kpMarks = useDescribeMarks<number>\(\)/);
    assert.match(ui, /<DescribeCard title=\{`🔑 Key pass/);
    assert.match(ui, /\{keyPassCard\}/);
  });
  test('Quick friendly comment no longer says "everything else is opt-in"', () => {
    assert.doesNotMatch(src('src/sports/football/meta.ts'), /everything else is opt-in/);
  });
});

describe('ice hockey specifics', () => {
  const fields = icMeta.ICE_HOCKEY_META.formatFields!;
  test('DOI9: faceoff zones stay OFF while the zone panel still replaces the controls', () => {
    assert.match(src('src/sports/ice_hockey/index.tsx'), /setFlow\(\{ mode: 'foZone', side: sd \}\)/);
    assert.equal(ice.init(newMatch(fields)).trackFaceoffZones, undefined);
  });
  test('DOI8: a new match that taps only goals tracks no tally', () => {
    const s = ice.init(newMatch(fields));
    assert.deepEqual(ice.iceTrackedKeys(s), []);
    for (const f of ice.TRACK_FLAGS) assert.equal(ice.tallyTracked(s, f), false, f);
  });
  test('DOI7: voice — "goal" is still a goal; a hit is offered by the new default', () => {
    const P = (id: string, fullName: string): Player => ({ id, fullName, sports: ['ice_hockey'] } as Player);
    const T = 1_700_000_000_000;
    const live = ice.reducer(ice.init(newMatch(fields)), { type: 'CLOCK', payload: { run: true, at: T - 300_000 } });
    const ctx = { state: live, homeName: 'Hawks', awayName: 'Wolves', homeRoster: [P('h2', 'Asha Rao')], awayRoster: [P('a2', 'Ravi Nair')], now: T };
    assert.equal(iceHockeyVoice('goal Rao', ctx as never)![0].type, 'GOAL');
    assert.equal(iceHockeyVoice('hit Nair', ctx as never)![0].payload?.kind, 'hit');
  });
});

describe('rugby specifics', () => {
  const P = (id: string, fullName: string, sport: string): Player => ({ id, fullName, sports: [sport] } as Player);
  test('DOI8: a new union match that taps only a try has no detail / tally key', () => {
    const s = rugby.init(newMatch(ruMeta.RUGBY_META.formatFields!));
    assert.equal(rugby.detailTracked(s), false);
    assert.deepEqual(rugby.trackedTallyKeys(s), []);
  });
  test('DOI8: a new league match that taps only a try has no detail key', () => {
    assert.deepEqual(league.trackedDetailKeys(league.init(newMatch(rlMeta.RUGBY_LEAGUE_META.formatFields!))), []);
  });
  test('DOI7: voice — "try" is still a try with every default on', () => {
    const ru = rugby.reducer(rugby.init(newMatch(ruMeta.RUGBY_META.formatFields!)), { type: 'CLOCK', payload: { run: true, at: 1_000 } });
    const rctx = { state: ru, homeName: 'Lions', awayName: 'Sharks', homeRoster: [P('h1', 'Asha Rao', 'rugby')], awayRoster: [P('a1', 'Ravi Nair', 'rugby')], now: 601_000 };
    assert.equal(rugbyVoice('try Rao', rctx as never)![0].type, 'TRY');
    const rl = league.reducer(league.init(newMatch(rlMeta.RUGBY_LEAGUE_META.formatFields!)), { type: 'CLOCK', payload: { run: true, at: 1_000 } });
    const lctx = { ...rctx, state: rl, homeRoster: [P('h1', 'Asha Rao', 'rugby_league')], awayRoster: [P('a1', 'Ravi Nair', 'rugby_league')] };
    assert.equal(leagueVoice('try Rao', lctx as never)![0].type, 'TRY');
  });
});
