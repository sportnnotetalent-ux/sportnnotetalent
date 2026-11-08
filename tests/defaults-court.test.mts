/**
 * Court sports, batch 3 — richer stats on by default for NEW matches
 * (docs/security/breaks/defaults-court.md). Basketball misses, volleyball
 * "Set by?", netball feeds & rebounds (International 4 × 15) and the CPR
 * default, handball fault types and "7 m won by" (a chip, no extra step).
 * Old matches (a stored format without the keys, or with them off) read and
 * replay exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { FormatField, ScoreAction } from '../src/sports/types.ts';
import { matchCaptures } from '../src/sports/matchRules.ts';
import { customCount } from '../src/sports/liveSettings.ts';
// basketball
import { BASKETBALL_META, BB_TRACK_DEFAULTS } from '../src/sports/basketball/meta.ts';
import * as bb from '../src/sports/basketball/engine.ts';
import { scoreAction, missAction } from '../src/sports/basketball/actions.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
// volleyball
import { VOLLEYBALL_META } from '../src/sports/volleyball/meta.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { VOLLEYBALL_LIVE_SETTINGS } from '../src/sports/volleyball/settings.ts';
import { detailCats, detailTracked } from '../src/sports/volleyball/detail.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
// netball
import { NETBALL_META, NETBALL_PRESETS } from '../src/sports/netball/meta.ts';
import * as nb from '../src/sports/netball/engine.ts';
// handball
import { HANDBALL_META, HANDBALL_TRACK_FIELDS } from '../src/sports/handball/meta.ts';
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
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const capOf = (ls: unknown, state: unknown, fields: readonly FormatField[], fmt: Record<string, unknown>) =>
  Object.fromEntries(matchCaptures(ls as never, state, fields, fmt).captures.map((c) => [c.key, c.on]));
const P = (id: string) => ({ id, fullName: id.toUpperCase() });

/* --------------------------------- basketball -------------------------------- */

describe('DC1 · basketball: Track missed shots on for a new match', () => {
  const fields = BASKETBALL_META.formatFields ?? [];
  test('the standard: misses on (shot zones on; fast breaks, fouls drawn opt-in)', () => {
    assert.deepEqual(BB_TRACK_DEFAULTS, { trackMisses: true, trackZones: true, trackFastBreak: false, trackFoulsDrawn: false });
    assert.equal(fields.find((f) => f.key === 'trackMisses')!.default, true);
  });
  for (const ctx of [undefined, 'tournament'] as const) {
    test(`a new ${ctx ?? 'friendly'} match tracks misses; Info lists it On`, () => {
      const fmt = defaultsFor(fields, ctx);
      const s = bb.init(fmt);
      assert.equal(s.trackMisses, true);
      const live = src('src/sports/basketball/index.tsx');
      assert.match(live, /defaults: \{ \.\.\.BB_TRACK_DEFAULTS \}/);
      assert.equal(capOf({ fields: [{ key: 'trackMisses', label: 'Track missed shots', type: 'toggle', default: true }], read: (x: bb.BasketballState) => ({ trackMisses: x.trackMisses === true }) }, s, fields, fmt).trackMisses, true);
    });
  }
  test('DC8/DC9 · an old match (no key, or off): nothing switched on, no FGA keys (no false zeros)', () => {
    for (const cfg of [{ preset: 'fiba' }, { preset: 'fiba', trackMisses: false }]) {
      const s0 = bb.init(cfg);
      assert.notEqual(s0.trackMisses, true);
      if (!('trackMisses' in cfg)) assert.equal('trackMisses' in s0, false, 'state shape unchanged');
      const fga = s0.trackMisses === true; // the controls stamp fga only when tracking
      const s = [{ type: 'KICKOFF', payload: { at: 1 } } as ScoreAction, scoreAction('home', 2, P('h1'), { fga }), scoreAction('away', 3, P('a1'), { fga })].reduce(bb.reducer, s0);
      const t = basketballStatTotals(s);
      assert.equal('fgAtt' in t.h1.stats, false);
      assert.equal('threesAtt' in t.a1.stats, false);
    }
  });
  test('DC9 · a new match: a make counts as an attempt; a miss is one tap; FG% real', () => {
    const s0 = bb.init(defaultsFor(fields));
    const s = [{ type: 'KICKOFF', payload: { at: 1 } } as ScoreAction, scoreAction('home', 2, P('h1'), { fga: s0.trackMisses === true }), missAction('home', 3, P('h1'))].reduce(bb.reducer, s0);
    const t = basketballStatTotals(s);
    assert.equal(t.h1.stats.fgAtt, 2);
    assert.equal(t.h1.stats.fgMade, 1);
    assert.equal(t.h1.stats.threesAtt, 1);
  });
});

/* --------------------------------- volleyball -------------------------------- */

describe('DC2 · volleyball: "Set by?" on for a new match', () => {
  const fields = VOLLEYBALL_META.formatFields ?? [];
  const ls = VOLLEYBALL_LIVE_SETTINGS;
  test('the format and the Standard: set assists on; attack attempts, reception, digs off', () => {
    // batch 5 (court-team-batch5.md V6): + "Who was aced?" on for new matches
    assert.deepEqual(ls.defaults, { vbAttack: false, vbReception: false, vbDig: false, vbAssist: true, vbAced: true });
    assert.equal(fields.find((f) => f.key === 'vbAssist')!.default, true);
    assert.equal(fields.find((f) => f.key === 'vbAttack')!.default, false);
  });
  test('a new match captures set assists only (no attack keys); Info lists Set assists On', () => {
    const fmt = defaultsFor(fields);
    const s = vb.init(fmt);
    assert.deepEqual(detailCats(s), ['assist', 'aced']); // batch 5: + aced
    assert.equal(detailTracked(s), false, 'attack attempts not tracked');
    assert.deepEqual(capOf(ls, s, fields, fmt), { vbAttack: false, vbReception: false, vbDig: false, vbAssist: true, vbAced: true });
    assert.equal(customCount(ls, ls.read(s)), 0);
  });
  test('DC10 · a kill is still one tap: the setter is optional; none named → not tracked (NZC1)', () => {
    const s = [vb.outcomeAction('attack', 'home', P('h1'))].reduce(vb.reducer, vb.init(defaultsFor(fields)));
    assert.equal(s.current.home, 1, 'the point counts with no setter named');
    const t = volleyballStatTotals(s);
    // no-false-zeros NZC1: no setter named in the match → not tracked (was a 0)
    assert.equal('setAssists' in t.h1.stats, false);
    assert.equal('attackAttempts' in t.h1.stats, false);
  });
  test('DC8/DC9 · an old match (no keys): no detail, no set-assist key; Info lists it Off', () => {
    for (const cfg of [{}, { preset: 'indoor' }, { vbAssist: false }]) {
      const s0 = vb.init(cfg);
      assert.equal('detail' in s0, false);
      const s = [vb.outcomeAction('attack', 'home', P('h1'))].reduce(vb.reducer, s0);
      assert.equal('setAssists' in volleyballStatTotals(s).h1.stats, false);
      assert.equal(capOf(ls, s0, fields, cfg).vbAssist, false);
    }
  });
});

/* ---------------------------------- netball ---------------------------------- */

describe('DC4 / DC5 / DC12 · netball: feeds & rebounds on with International 4 × 15; CPR default agrees', () => {
  const fields = NETBALL_META.formatFields ?? [];
  const ls = nb.NETBALL_LIVE_SETTINGS;
  test('International switches feeds & rebounds on; School and Halves off (a preset switch never carries it)', () => {
    assert.equal(NETBALL_PRESETS.international.set.detail, true);
    assert.equal(NETBALL_PRESETS.school.set.detail, false);
    assert.equal(NETBALL_PRESETS.halves.set.detail, false);
  });
  test('the format field defaults agree with the live Standard (CPR, feeds & rebounds)', () => {
    for (const k of ['trackCpr', 'detail', 'trackGains', 'trackTurnovers']) {
      assert.equal(fields.find((f) => f.key === k)!.default, ls.defaults?.[k], k);
    }
  });
  test('a new match (International) asks for feeds & rebounds and CPR; Info lists both On; nothing custom', () => {
    const fmt = defaultsFor(fields);
    const s = nb.init(fmt);
    assert.equal(s.detail, true);
    assert.equal(s.trackCpr, true);
    const cap = capOf(ls, s, fields, fmt);
    assert.equal(cap.detail, true);
    assert.equal(cap.trackCpr, true);
    assert.equal(customCount(ls, ls.read(s)), 0);
  });
  test('a new School match: feeds off (one tap a shot)', () => {
    assert.equal(nb.init({ ...defaultsFor(fields), preset: 'school', ...NETBALL_PRESETS.school.set }).detail, false);
  });
  test('DC8 · an old match keeps what it had (no key: off; CPR not on the state)', () => {
    const old = nb.init({ preset: 'international', periods: 4, periodMinutes: 15 });
    assert.equal(old.detail, false);
    assert.equal('trackCpr' in old, false);
    assert.equal(capOf(ls, old, fields, { preset: 'international', periods: 4, periodMinutes: 15 }).detail, false);
  });
  test('DC10 · the feed and rebound steps keep their Skip', () => {
    const ui = src('src/sports/netball/index.tsx');
    assert.match(ui, /label: 'No feed \/ skip'/);
    assert.match(ui, /label: 'No rebound \/ skip'/);
  });
});

/* ---------------------------------- handball --------------------------------- */

describe('DC6 / DC7 · handball: fault types and "7 m won by" on, both chips (no extra tap)', () => {
  const fields = HANDBALL_META.formatFields ?? [];
  const ls = hb.HANDBALL_LIVE_SETTINGS;
  test('the format and the Standard: both on', () => {
    assert.deepEqual(HANDBALL_TRACK_FIELDS.map((f) => [f.key, f.default]), [['trackFaultTypes', true], ['trackSevenMDrawn', true]]);
    assert.equal(ls.defaults?.trackFaultTypes, true);
    assert.equal(ls.defaults?.trackSevenMDrawn, true);
  });
  test('a new match tracks both; Info lists both On; nothing custom', () => {
    const fmt = defaultsFor(fields);
    const s = hb.init(fmt);
    assert.deepEqual(s.track, { faultTypes: true, sevenMDrawn: true });
    const cap = capOf(ls, s, fields, fmt);
    assert.equal(cap.trackFaultTypes, true);
    assert.equal(cap.trackSevenMDrawn, true);
    assert.equal(customCount(ls, ls.read(s)), 0);
  });
  test('DC8 · an old match (no keys): no `track` key; Info lists both Off', () => {
    const old = hb.init({ preset: 'senior', playersPerSide: 7, periodMinutes: 30 });
    assert.equal('track' in old, false);
    const cap = capOf(ls, old, fields, {});
    assert.equal(cap.trackFaultTypes, false);
    assert.equal(cap.trackSevenMDrawn, false);
  });
  const ui = src('src/sports/handball/index.tsx');
  test('DC7 / DC10 · the 7 m button goes straight to the result; no "Who won it?" step', () => {
    assert.match(ui, /onPress=\{\(\) => setFlow\(\{ mode: 'seven', side: sd, step: 'result' \}\)\}/);
    assert.equal(/flow\.step === 'drawn'/.test(ui), false);
  });
  test('DC7 / DC14 · "Won by" is an optional chip row on the result screen; its DRAWN goes before the result', () => {
    const i = ui.indexOf("{head('7-metre throw')}");
    assert.ok(i > 0);
    const block = ui.slice(i, ui.indexOf('\n        );', i));
    assert.match(block, /✓ Scored/);
    assert.match(block, /Won by/);
    assert.match(block, /s\.track\?\.sevenMDrawn && !editAt/);
    assert.match(ui, /const sevenResult = /);
    const fn = ui.slice(ui.indexOf('const sevenResult = '), ui.indexOf('const sevenResult = ') + 400);
    assert.ok(fn.indexOf('drawn(') >= 0 && fn.indexOf('drawn(') < fn.indexOf('setFlow('), 'DRAWN logged first');
  });
  test('DC13 · a 7 m correction never offers the chips (no second DRAWN)', () => {
    assert.match(ui, /s\.track\?\.sevenMDrawn && !editAt/);
  });
});
