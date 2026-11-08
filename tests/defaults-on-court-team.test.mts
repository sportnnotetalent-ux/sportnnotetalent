/**
 * Wave 3 (docs/sport-expert/defaults-on/PLAN.md) — "Stats to track" on by
 * default for NEW matches in the court-team family: volleyball, kabaddi,
 * netball, handball. Break-it list: docs/security/breaks/defaults-on-court-team.md
 * (DOC1…DOC13).
 *
 * One defaults constant per sport feeds the format fields, the live-settings
 * Standard (Reset) and, for netball, every preset. Old matches (a stored
 * format without the keys, or with them off) read and replay exactly as
 * before: the engines' fallbacks stay OFF.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { FormatField, LiveSettings, ScoreAction } from '../src/sports/types.ts';
import { matchCaptures } from '../src/sports/matchRules.ts';
import { customCount, standardOf } from '../src/sports/liveSettings.ts';
import { volleyballVoice, kabaddiVoice } from '../src/sports/voiceParsers.ts';
// volleyball
import { VOLLEYBALL_META } from '../src/sports/volleyball/meta.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import * as vbSettings from '../src/sports/volleyball/settings.ts';
import { detailCats, detailTracked } from '../src/sports/volleyball/detail.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
// kabaddi
import { KABADDI_META } from '../src/sports/kabaddi/meta.ts';
import * as kbSettings from '../src/sports/kabaddi/settings.ts';
import { init as kbInit, reducer as kbReducer, raidActions, type KabaddiState, type RaidForm } from '../src/sports/kabaddi/engine.ts';
import { kabaddiMatchStats } from '../src/sports/kabaddi/matchStats.ts';
// netball
import * as nbMeta from '../src/sports/netball/meta.ts';
import * as nb from '../src/sports/netball/engine.ts';
import { netballVoice } from '../src/sports/netball/voice.ts';
import { netballTotals } from '../src/sports/netball/totals.ts';
// handball
import * as hbMeta from '../src/sports/handball/meta.ts';
import * as hb from '../src/sports/handball/engine.ts';

/** FormatEditor.defaultsFor (a new match's format), copied: the .tsx imports React Native. */
const defaultsFor = (fields: readonly FormatField[], ctx?: 'tournament'): Record<string, unknown> => {
  const preset = fields.find((f) => f.type === 'preset');
  const presetDefault = ctx === 'tournament' && preset?.tournamentDefault != null ? preset.tournamentDefault : preset?.default;
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f === preset ? presetDefault : (ctx === 'tournament' && f.tournamentDefault != null ? f.tournamentDefault : f.default)]));
  const chosen = preset?.options?.find((o) => o.value === presetDefault);
  if (chosen?.set) Object.assign(out, chosen.set);
  return out;
};
/** FormatEditor's preset pick: every sibling the preset names snaps to it. */
const pickPreset = (fmt: Record<string, unknown>, fields: readonly FormatField[], value: string) => {
  const o = fields.find((f) => f.type === 'preset')?.options?.find((x) => x.value === value);
  return { ...fmt, preset: value, ...(o?.set ?? {}) };
};
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const capOf = (ls: unknown, state: unknown, fields: readonly FormatField[], fmt: Record<string, unknown>) =>
  Object.fromEntries(matchCaptures(ls as never, state, fields, fmt).captures.map((c) => [c.key, c.on]));
const pickKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, o[k]]));
/** "N custom", counting only the stats switches (netball's quarter length differs per preset by design). */
const statsCustom = <S,>(ls: LiveSettings<S>, s: S, keys: readonly string[]) =>
  customCount({ ...ls, fields: ls.fields.filter((f) => keys.includes(f.key)) }, ls.read(s), s);
const P = (id: string, fullName = id.toUpperCase()) => ({ id, fullName });

/* ================================= volleyball ================================ */

const VB_WANT = { vbAttack: false, vbReception: true, vbDig: true, vbAssist: true, vbAced: true };
const VB_KEYS = Object.keys(VB_WANT);

describe('volleyball: reception and digs on; set assists and aced kept; attack attempts off', () => {
  const fields = VOLLEYBALL_META.formatFields ?? [];
  const ls = vbSettings.VOLLEYBALL_LIVE_SETTINGS;
  test('DOC3 · one defaults constant', () => {
    assert.deepEqual((vbSettings as Record<string, unknown>).VB_STATS_DEFAULTS, VB_WANT);
  });
  test('DOC2 · the Standard (Reset) equals the new defaults', () => {
    assert.deepEqual(ls.defaults, VB_WANT);
    assert.deepEqual(pickKeys(standardOf(ls, vb.init({}))!, VB_KEYS), VB_WANT);
  });
  test('DOC3 · every format field agrees', () => {
    for (const k of VB_KEYS) assert.equal(fields.find((f) => f.key === k)!.default, VB_WANT[k as keyof typeof VB_WANT], k);
  });
  for (const ctx of [undefined, 'tournament'] as const) {
    test(`DOC4 / DOC6 / DOC12 · a new ${ctx ?? 'friendly'} match tracks reception, digs, set by, aced; Info agrees; 0 custom`, () => {
      const fmt = defaultsFor(fields, ctx);
      const s = vb.init(fmt);
      assert.deepEqual(detailCats(s), ['reception', 'dig', 'assist', 'aced']);
      assert.equal(detailTracked(s), false, 'attack attempts not tracked');
      assert.deepEqual(capOf(ls, s, fields, fmt), VB_WANT);
      assert.equal(customCount(ls, ls.read(s), s), 0);
    });
  }
  test('DOC1 · old formats keep everything they had (fallback off)', () => {
    for (const cfg of [{}, { preset: 'indoor' }, { vbAttack: false, vbReception: false, vbDig: false, vbAssist: true, vbAced: true }]) {
      const s = vb.init(cfg);
      assert.equal(detailCats(s).includes('reception'), false);
      assert.equal(detailCats(s).includes('dig'), false);
      assert.equal(capOf(ls, s, fields, cfg).vbDig, false);
    }
  });
  test('DOC7 / DOC8 · every prompt skipped: same score, no digs / receptions / attack keys', () => {
    const lineup: ScoreAction[] = (['home', 'away'] as const).map((team) => ({ type: 'LINEUP', payload: { team, players: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${team[0]}${i}`, name: `${team[0]}${i}` })) } }));
    const plays = [vb.outcomeAction('attack', 'home', P('h1')), vb.outcomeAction('ace', 'away', P('a2')), vb.outcomeAction('block', 'home', P('h3'))];
    const now = [...lineup, ...plays].reduce(vb.reducer, vb.init(defaultsFor(fields)));
    const old = [...lineup, ...plays].reduce(vb.reducer, vb.init({}));
    assert.deepEqual([now.current, now.setsWon], [old.current, old.setsWon]);
    for (const l of Object.values(volleyballStatTotals(now))) {
      for (const k of ['digs', 'receptions', 'receptionErrors', 'setAssists', 'attackAttempts']) assert.equal(k in l.stats, false, k);
    }
  });
  test('DOC9 · a voice point scores on a new match and adds no detail', () => {
    const lineup: ScoreAction[] = (['home', 'away'] as const).map((team) => ({ type: 'LINEUP', payload: { team, players: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${team[0]}${i}`, name: `${team[0]}${i}` })) } }));
    const s0 = lineup.reduce(vb.reducer, vb.init(defaultsFor(fields)));
    const acts = volleyballVoice('point home', { state: s0, homeName: 'Home', awayName: 'Away', homeRoster: [], awayRoster: [] });
    assert.ok(acts && acts.length);
    const s = acts!.reduce(vb.reducer, s0);
    assert.equal(s.current.home, 1);
    assert.equal((s.vd ?? []).length, 0);
  });
});

/* ================================== kabaddi ================================== */

// polish PC12: defenders touched is on too, now that K1 ("Who was touched?" after a quick +1 touch) is built
const KB_WANT = { trackSkills: true, trackTouched: true };

describe('kabaddi: raid skill on; defenders touched on (polish PC12, K1 built)', () => {
  const fields = KABADDI_META.formatFields ?? [];
  const ls = kbSettings.KABADDI_LIVE_SETTINGS;
  test('DOC3 · one defaults constant', () => {
    assert.deepEqual((kbSettings as Record<string, unknown>).KABADDI_STATS_DEFAULTS, KB_WANT);
  });
  test('DOC2 · the Standard (Reset) equals the new defaults', () => {
    assert.deepEqual(ls.defaults, KB_WANT);
  });
  test('DOC3 · every format field agrees', () => {
    for (const [k, v] of Object.entries(KB_WANT)) assert.equal(fields.find((f) => f.key === k)!.default, v, k);
  });
  for (const ctx of [undefined, 'tournament'] as const) {
    test(`DOC4 / DOC6 · a new ${ctx ?? 'friendly'} match tracks skills and touched; Info agrees; 0 custom`, () => {
      const fmt = defaultsFor(fields, ctx);
      const s = kbInit(fmt);
      // polish PC12: touched on for a new match
      assert.deepEqual(s.track, { skills: true, touched: true });
      assert.deepEqual(capOf(ls, s, fields, fmt), KB_WANT);
      assert.equal(customCount(ls, ls.read(s), s), 0);
    });
  }
  test('DOC1 · old formats: no `track`', () => {
    for (const cfg of [{}, { playersPerSide: 7 }, { trackSkills: false, trackTouched: false }]) assert.equal('track' in kbInit(cfg), false);
  });
  // polish PC1 / PC12: the quick "+1 touch" now opens "Who was touched?", so trackTouched is on
  test('DOC13 · the quick "+1 touch" opens "Who was touched?", so trackTouched is on', () => {
    const ui = src('src/sports/kabaddi/index.tsx');
    assert.match(ui, /label="\+1 touch"/);
    assert.match(ui, /setAskTouched\(eid\)/);
    assert.equal(KB_WANT.trackTouched, true);
  });
  test('DOC7 / DOC8 / DOC9 · quick and voice raids score with skill on; no skills rows until one is described', () => {
    const play = (cfg: Record<string, unknown>) => {
      let s: KabaddiState = kbReducer(kbInit(cfg), { type: 'KICKOFF', payload: { at: 1 } });
      const raid = (f: Partial<RaidForm> & { side: 'home' | 'away' }) => {
        for (const a of raidActions(s, { touches: 0, bonus: false, tackled: false, ...f })) s = kbReducer(s, a.type === 'REMOVE_EVENT' ? a : { ...a, payload: { ...a.payload, minute: 2, half: 1 } });
      };
      raid({ side: 'home', raider: P('h1'), touches: 1 });
      raid({ side: 'away', raider: P('a1'), touches: 0 });
      const v = kabaddiVoice('raid home', { state: s, homeName: 'Home', awayName: 'Away', homeRoster: [P('h1')], awayRoster: [P('a1')] });
      assert.ok(v && v.length, 'voice raid parsed');
      for (const a of v!) s = kbReducer(s, a);
      return s;
    };
    const now = play(defaultsFor(fields));
    const old = play({});
    assert.equal(now.track?.skills, true);
    assert.deepEqual([now.home, now.away], [old.home, old.away], 'the score is the same with skill on');
    assert.equal(now.home, 2);
    assert.equal(kabaddiMatchStats(now).cats.some((c) => c.id === 'skills'), false, 'no skills rows from the switch alone');
  });
});

/* ================================== netball ================================== */

const NB_WANT = { detail: true, trackCpr: true, trackGains: true, trackTurnovers: true };
const NB_KEYS = Object.keys(NB_WANT);

describe('netball: feeds & rebounds, CPR, gains, turnover types on in every preset', () => {
  const fields = nbMeta.NETBALL_META.formatFields ?? [];
  const ls = nb.NETBALL_LIVE_SETTINGS;
  test('DOC3 · one defaults constant', () => {
    assert.deepEqual((nbMeta as Record<string, unknown>).NETBALL_STATS_DEFAULTS, NB_WANT);
  });
  test('DOC2 · the Standard (Reset) equals the new defaults', () => {
    assert.deepEqual(pickKeys(ls.defaults!, NB_KEYS), NB_WANT);
  });
  test('DOC3 · every format field agrees', () => {
    for (const k of NB_KEYS) assert.equal(fields.find((f) => f.key === k)!.default, true, k);
  });
  test('DOC5 · no preset switches a stat off', () => {
    for (const [k, p] of Object.entries(nbMeta.NETBALL_PRESETS)) {
      for (const key of NB_KEYS) assert.notEqual(p.set[key], false, `${k}.${key}`);
    }
  });
  for (const preset of ['international', 'school', 'halves', 'custom']) {
    for (const ctx of [undefined, 'tournament'] as const) {
      test(`DOC4 / DOC5 / DOC6 · a new ${preset} ${ctx ?? 'friendly'} match tracks all four; Info agrees; 0 custom`, () => {
        const fmt = pickPreset(defaultsFor(fields, ctx), fields, preset);
        const s = nb.init(fmt);
        assert.deepEqual({ detail: s.detail, trackCpr: s.trackCpr, trackGains: s.trackGains, trackTurnovers: s.trackTurnovers }, NB_WANT);
        assert.deepEqual(pickKeys(capOf(ls, s, fields, fmt), NB_KEYS), NB_WANT);
        assert.equal(statsCustom(ls, s, NB_KEYS), 0);
      });
    }
  }
  test('DOC5 · an organiser who turned a stat off keeps it off when picking a preset', () => {
    const fmt = { ...defaultsFor(fields), trackGains: false, detail: false };
    for (const p of ['international', 'school', 'halves']) {
      const s = nb.init(pickPreset(fmt, fields, p));
      assert.equal(s.trackGains, false, p);
      assert.equal(s.detail, false, p);
    }
  });
  test('DOC1 · old formats keep what they had (fallback off)', () => {
    for (const cfg of [{}, { preset: 'school', periods: 4, periodMinutes: 10, trackCpr: false, detail: false }, { preset: 'international', periods: 4, periodMinutes: 15 }]) {
      const s = nb.init(cfg);
      assert.equal(s.detail, false);
      assert.notEqual(s.trackGains, true);
      assert.notEqual(s.trackTurnovers, true);
    }
  });
  test('DOC7 / DOC8 / DOC9 · a voice goal lands on the board; nothing tapped → no CPR / pick-up / gains / feeds keys', () => {
    const POS = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'];
    const xi = (team: 'home' | 'away'): ScoreAction => ({ type: 'XI', payload: { team, pos: Object.fromEntries(POS.map((p, i) => [p, { id: `${team[0]}${i}`, name: `${team[0]}${i}` }])) } });
    let s = [xi('home'), xi('away'), { type: 'FIRST_CENTRE', side: 'home' } as ScoreAction].reduce(nb.reducer, nb.init(pickPreset(defaultsFor(fields), fields, 'school')));
    s = nb.reducer(s, { type: 'CLOCK', payload: { run: true, at: 1000 } });
    const acts = netballVoice('goal GS home', { state: s, homeName: 'Home', awayName: 'Away', homeRoster: [], awayRoster: [], now: 5000 });
    assert.ok(acts && acts.length, 'voice goal parsed');
    s = acts!.reduce(nb.reducer, s);
    assert.equal(s.home, 1);
    for (const l of Object.values(netballTotals(s))) {
      for (const k of ['centrePassReceives', 'pickups', 'gains', 'deflectionsGain', 'feeds', 'goalAssists']) assert.equal(k in l.stats, false, k);
    }
  });
});

/* ================================== handball ================================= */

const HB_WANT = { trackFaultTypes: true, trackSevenMDrawn: true };

describe('handball: both kept on', () => {
  const fields = hbMeta.HANDBALL_META.formatFields ?? [];
  const ls = hb.HANDBALL_LIVE_SETTINGS;
  test('DOC3 · one defaults constant', () => {
    assert.deepEqual((hbMeta as Record<string, unknown>).HANDBALL_STATS_DEFAULTS, HB_WANT);
  });
  test('DOC2 · the Standard (Reset) equals the defaults', () => {
    assert.deepEqual(pickKeys(ls.defaults!, Object.keys(HB_WANT)), HB_WANT);
  });
  for (const preset of ['senior', 'youth25', 'youth20']) {
    test(`DOC4 / DOC6 · a new ${preset} match tracks both; 0 custom`, () => {
      const fmt = pickPreset(defaultsFor(fields), fields, preset);
      const s = hb.init(fmt);
      assert.deepEqual(s.track, { faultTypes: true, sevenMDrawn: true });
      assert.deepEqual(pickKeys(capOf(ls, s, fields, fmt), Object.keys(HB_WANT)), HB_WANT);
      assert.equal(statsCustom(ls, s, Object.keys(HB_WANT)), 0);
    });
  }
  test('DOC1 · old formats: no `track`', () => {
    assert.equal('track' in hb.init({ preset: 'senior', playersPerSide: 7, periodMinutes: 30 }), false);
  });
});

/* =============================== cross-family ================================ */

describe('DOC10 · every stats toggle carries group "Stats to track"', () => {
  const sets: Array<[string, readonly FormatField[], readonly string[]]> = [
    ['volleyball meta', VOLLEYBALL_META.formatFields ?? [], VB_KEYS],
    ['volleyball live', vbSettings.VOLLEYBALL_LIVE_SETTINGS.fields, VB_KEYS],
    ['kabaddi meta', KABADDI_META.formatFields ?? [], Object.keys(KB_WANT)],
    ['kabaddi live', kbSettings.KABADDI_LIVE_SETTINGS.fields, Object.keys(KB_WANT)],
    ['netball meta', nbMeta.NETBALL_META.formatFields ?? [], NB_KEYS],
    ['netball live', nb.NETBALL_LIVE_SETTINGS.fields, NB_KEYS],
    ['handball meta', hbMeta.HANDBALL_META.formatFields ?? [], Object.keys(HB_WANT)],
    ['handball live', hb.HANDBALL_LIVE_SETTINGS.fields, Object.keys(HB_WANT)],
  ];
  for (const [name, fields, keys] of sets) {
    test(name, () => {
      for (const k of keys) {
        const f = fields.find((x) => x.key === k);
        assert.ok(f, `${name}: ${k} present`);
        assert.equal(f!.type, 'toggle');
        assert.equal(f!.group, 'Stats to track', `${name}: ${k}`);
      }
    });
  }
});

describe('DOC11 · wording no longer says "off by default"', () => {
  test('kabaddi', () => {
    assert.equal(/Both off by default/i.test(src('src/sports/kabaddi/settings.ts')), false);
    assert.equal(/both off by default/i.test(src('src/sports/kabaddi/index.tsx')), false);
  });
  test('volleyball', () => {
    assert.equal(/Off by default/.test(src('src/sports/volleyball/DetailRow.tsx')), false);
    assert.equal(/all off by default/.test(src('src/sports/volleyball/index.tsx')), false);
  });
  test('netball hints', () => {
    assert.equal(/on with International 4 × 15/.test(src('src/sports/netball/meta.ts')), false);
  });
});
