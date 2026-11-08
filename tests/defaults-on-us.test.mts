/**
 * US sports: stats to track on by default for NEW matches (wave 3 of
 * docs/sport-expert/defaults-on/PLAN.md; break list DOU1–DOU11 in
 * docs/security/breaks/defaults-on-us.md).
 *
 * Basketball: fast breaks + fouls drawn on. American football: targets + pass
 * breakups / TFL on, tackles off. Baseball: spray + batted-ball type on, pitch
 * types off, ask-for-fielders on (now under "Stats to track"). Old matches
 * (a stored format without the key) replay exactly as before.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Player } from '../src/core/types.ts';
import type { FormatField, ScoreAction, VoiceContext } from '../src/sports/types.ts';
import { formatDefaults, fieldChanges } from '../src/sports/formatPick.ts';
import { customCount, standardOf } from '../src/sports/liveSettings.ts';
import { matchCaptures } from '../src/sports/matchRules.ts';
// basketball
import * as bbMeta from '../src/sports/basketball/meta.ts';
import { init as bbInit, reducer as bbReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { foulAction, scoreAction } from '../src/sports/basketball/actions.ts';
import { bbDeepKeys } from '../src/sports/basketball/deep.ts';
import { basketballPanel } from '../src/sports/basketball/panel.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import { basketballVoice } from '../src/sports/voiceParsers.ts';
// american football
import * as afMeta from '../src/sports/american_football/meta.ts';
import {
  init as afInit, reducer as afReducer, buildPlay as afBuildPlay, credit as afCredit, deepKeys as afDeepKeys, eventCredits,
  AF_LIVE_SETTINGS, type AFState, type Side, type Who,
} from '../src/sports/american_football/engine.ts';
import { afTotals } from '../src/sports/american_football/totals.ts';
import { afBox } from '../src/sports/american_football/box.ts';
import { afVoice } from '../src/sports/american_football/voice.ts';
// baseball
import * as baMeta from '../src/sports/baseball/meta.ts';
import {
  init as baInit, reducer as baReducer, buildPlay as baBuildPlay, battedBallOf, BASEBALL_LIVE_SETTINGS,
  type BaseballState, type BattedBall, type Outcome, type Zone,
} from '../src/sports/baseball/engine.ts';
import { baseballTotals, BATTED_BALL_KEYS } from '../src/sports/baseball/totals.ts';
import { baseballSheet } from '../src/sports/baseball/sheet.ts';
import { baseballVoice } from '../src/sports/baseball/voice.ts';

const src = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** a new match's stored format: the field defaults, then the picked preset's `set` */
function newFormat(fields: FormatField[], preset?: string, ctx?: 'tournament'): Record<string, unknown> {
  const f = formatDefaults(fields, ctx);
  const pf = fields.find((x) => x.type === 'preset');
  if (preset && pf) for (const [k, v] of fieldChanges(pf, preset)) f[k] = v;
  return f;
}
/** an old match: the stored format from before the stats keys existed */
const withoutKeys = (f: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(Object.entries(f).filter(([k]) => !keys.includes(k)));

const BB_STATS = ['trackMisses', 'trackZones', 'trackFastBreak', 'trackFoulsDrawn'] as const;
const AF_STATS = ['trackTackles', 'trackTargets', 'trackDefence'] as const;
const BA_STATS = ['askFielders', 'pitchTypes', 'sprayZones', 'battedBallTypes'] as const;

/* ---------------------------------- defaults ---------------------------------- */

describe('the new defaults (key → new default)', () => {
  test('basketball: fast breaks and fouls drawn on (misses, zones already on)', () => {
    assert.deepEqual({ ...bbMeta.BB_TRACK_DEFAULTS }, { trackMisses: true, trackZones: true, trackFastBreak: true, trackFoulsDrawn: true });
    const f = newFormat(bbMeta.BASKETBALL_META.formatFields);
    for (const k of BB_STATS) assert.equal(f[k], true, k);
  });
  test('American football: targets and pass breakups / TFL on; tackles off (DOU8)', () => {
    assert.deepEqual({ ...afMeta.AF_TRACK_DEFAULTS }, { trackTackles: false, trackTargets: true, trackDefence: true });
    for (const p of Object.keys(afMeta.AF_PRESETS)) {
      const f = newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, p);
      assert.deepEqual([f.trackTackles, f.trackTargets, f.trackDefence], [false, true, true], p);
    }
  });
  test('baseball: spray and batted-ball type on; pitch types off (DOU8); fielders on', () => {
    assert.deepEqual({ ...baMeta.BASEBALL_TRACK_DEFAULTS }, { askFielders: true, pitchTypes: false, sprayZones: true, battedBallTypes: true });
    for (const p of Object.keys(baMeta.BASEBALL_PRESETS)) {
      const f = newFormat(baMeta.BASEBALL_META.formatFields, p);
      assert.deepEqual([f.askFielders, f.pitchTypes, f.sprayZones, f.battedBallTypes], [true, false, true, true], p);
    }
  });
  test('DOU11: a tournament seeds the same stats defaults as a friendly', () => {
    for (const [fields, keys] of [[bbMeta.BASKETBALL_META.formatFields, BB_STATS], [afMeta.AMERICAN_FOOTBALL_META.formatFields, AF_STATS], [baMeta.BASEBALL_META.formatFields, BA_STATS]] as const) {
      const a = formatDefaults(fields as FormatField[]), b = formatDefaults(fields as FormatField[], 'tournament');
      for (const k of keys) assert.equal(b[k], a[k], k);
    }
  });
});

/* ---------------------------- DOU1 · old matches ---------------------------- */

describe('DOU1 · an old match (no keys stored) reads every stat off', () => {
  test('basketball: no track key on the state', () => {
    const s = bbInit(withoutKeys(newFormat(bbMeta.BASKETBALL_META.formatFields), BB_STATS));
    assert.equal(s.trackFastBreak, undefined);
    assert.equal(s.trackFoulsDrawn, undefined);
    assert.equal(s.trackMisses, undefined);
  });
  test('American football: tackles / targets / defence off', () => {
    const s = afInit(withoutKeys(newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, 'nfl'), AF_STATS));
    assert.equal(s.trackTackles, false);
    assert.equal(s.trackTargets, undefined);
    assert.equal(s.trackDefence, undefined);
    assert.deepEqual(afInit(withoutKeys(newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, 'nfl'), AF_STATS)), afInit({ ...withoutKeys(newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, 'nfl'), AF_STATS), trackTackles: false, trackTargets: false, trackDefence: false }));
  });
  test('baseball: fielders / spray / batted / pitch types off', () => {
    const s = baInit(withoutKeys(newFormat(baMeta.BASEBALL_META.formatFields), BA_STATS));
    assert.equal(s.cfg.askFielders, false);
    for (const k of ['pitchTypes', 'sprayZones', 'battedBallTypes'] as const) assert.notEqual(s.cfg[k], true, k);
  });
  test('the setup / replay fallbacks still read a missing key as OFF (source)', () => {
    assert.match(src('src/sports/american_football/engine.ts'), /trackTackles: bool\(config\?\.trackTackles, false\)/);
    assert.match(src('src/sports/american_football/engine.ts'), /TRACK_FLAGS\.filter\(\(f\) => bool\(config\?\.\[f\], false\)\)/);
    assert.match(src('src/sports/baseball/engine.ts'), /askFielders: bool\(config\?\.askFielders, false\)/);
    assert.match(src('src/sports/baseball/engine.ts'), /TRACK_FLAGS\.filter\(\(f\) => bool\(config\?\.\[f\], false\)\)/);
    assert.match(src('src/sports/basketball/engine.ts'), /config\?\.trackFastBreak != null \?/);
  });
});

/* --------------------- DOU2 / DOU4 · one source of the defaults --------------------- */

describe('DOU2 / DOU4 · Standard = the new-match format (one const per sport); a new match reads 0 custom', () => {
  test('American football: every preset — standard == format, 0 custom', () => {
    for (const p of Object.keys(afMeta.AF_PRESETS)) {
      const s = afInit(newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, p));
      const std = standardOf(AF_LIVE_SETTINGS, s)!;
      for (const k of AF_STATS) assert.equal(std[k], afMeta.AF_TRACK_DEFAULTS[k], `${p} ${k}`);
      assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(s), s), 0, p);
    }
    for (const k of AF_STATS) assert.equal(AF_LIVE_SETTINGS.defaults?.[k], afMeta.AF_TRACK_DEFAULTS[k], k);
  });
  test('baseball: every preset — standard == format, 0 custom', () => {
    for (const p of Object.keys(baMeta.BASEBALL_PRESETS)) {
      const s = baInit(newFormat(baMeta.BASEBALL_META.formatFields, p));
      assert.equal(customCount(BASEBALL_LIVE_SETTINGS, BASEBALL_LIVE_SETTINGS.read(s), s), 0, p);
    }
    for (const k of BA_STATS) assert.equal(BASEBALL_LIVE_SETTINGS.defaults?.[k], baMeta.BASEBALL_TRACK_DEFAULTS[k], k);
  });
  test('the live fields default from the same const', () => {
    for (const f of AF_LIVE_SETTINGS.fields) if ((AF_STATS as readonly string[]).includes(f.key)) assert.equal(f.default, afMeta.AF_TRACK_DEFAULTS[f.key as (typeof AF_STATS)[number]], f.key);
    for (const f of BASEBALL_LIVE_SETTINGS.fields) if ((BA_STATS as readonly string[]).includes(f.key)) assert.equal(f.default, baMeta.BASEBALL_TRACK_DEFAULTS[f.key as (typeof BA_STATS)[number]], f.key);
  });
  test('no hard-coded stats default left in the live settings (source)', () => {
    const af = src('src/sports/american_football/engine.ts'), ba = src('src/sports/baseball/engine.ts');
    assert.doesNotMatch(af, /trackTackles: false/);
    assert.doesNotMatch(af, /TRACK_FLAGS\.map\(\(f\) => \[f, false\]\)/);
    assert.doesNotMatch(ba, /TRACK_FLAGS\.map\(\(f\) => \[f, false\]\)/);
    assert.doesNotMatch(ba, /askFielders: true/);
    assert.match(src('src/sports/basketball/index.tsx'), /defaults: \{ \.\.\.BB_TRACK_DEFAULTS \}/);
  });
  test('DOU4: an old American football Scores-only game reads Standard (hidden switches are never "custom"); an old play-by-play game reads its honest count', () => {
    const oldFlag = afInit(withoutKeys(newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, 'flag'), AF_STATS));
    assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(oldFlag), oldFlag), 0);
    const oldNfl = afInit(withoutKeys(newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, 'nfl'), AF_STATS));
    // custom-count CC1: stats choices aren't rule changes — the old play-by-play game reads Standard too
    assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(oldNfl), oldNfl), 0);
    // switching an old flag game to play by play shows the new standard for the now-visible switches
    assert.deepEqual(AF_STATS.map((k) => standardOf(AF_LIVE_SETTINGS, { ...oldFlag, mode: 'pbp' })![k]), [false, true, true]);
  });
  test('an old match reads its count against the new standard (accepted, as carrom DC4)', () => {
    const s = baInit(withoutKeys(newFormat(baMeta.BASEBALL_META.formatFields), BA_STATS));
    // custom-count CC1: stats choices aren't rule changes
    assert.equal(customCount(BASEBALL_LIVE_SETTINGS, BASEBALL_LIVE_SETTINGS.read(s), s), 0);
  });
});

/* --------------------------- DOU3 · Info shows the truth --------------------------- */

describe('DOU3 · Info: a new match shows On, an old match shows Off', () => {
  const on = (cap: { captures: { key: string; on: boolean }[] }, k: string) => cap.captures.find((c) => c.key === k)?.on;
  test('American football', () => {
    const fmt = newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, 'nfl');
    const nw = matchCaptures(AF_LIVE_SETTINGS as never, afInit(fmt), afMeta.AMERICAN_FOOTBALL_META.formatFields, fmt);
    const oldFmt = withoutKeys(fmt, AF_STATS);
    const old = matchCaptures(AF_LIVE_SETTINGS as never, afInit(oldFmt), afMeta.AMERICAN_FOOTBALL_META.formatFields, oldFmt);
    assert.deepEqual(AF_STATS.map((k) => on(nw, k)), [false, true, true]);
    assert.deepEqual(AF_STATS.map((k) => on(old, k)), [false, false, false]);
  });
  test('baseball', () => {
    const fmt = newFormat(baMeta.BASEBALL_META.formatFields);
    const nw = matchCaptures(BASEBALL_LIVE_SETTINGS as never, baInit(fmt), baMeta.BASEBALL_META.formatFields, fmt);
    const oldFmt = withoutKeys(fmt, BA_STATS);
    const old = matchCaptures(BASEBALL_LIVE_SETTINGS as never, baInit(oldFmt), baMeta.BASEBALL_META.formatFields, oldFmt);
    assert.deepEqual(BA_STATS.map((k) => on(nw, k)), [true, false, true, true]);
    assert.deepEqual(BA_STATS.map((k) => on(old, k)), [false, false, false, false]);
  });
  test('basketball: read() returns each toggle from the state (source)', () => {
    assert.match(src('src/sports/basketball/index.tsx'), /read: \(s\) => \(\{ trackMisses: s\.trackMisses === true, trackZones: scoringLayout\(s\) === 'zones', trackFastBreak: s\.trackFastBreak === true, trackFoulsDrawn: s\.trackFoulsDrawn === true \}\)/);
  });
});

/* ---------------------- DOU9 · every stats toggle is grouped ---------------------- */

describe('DOU9 · every stats toggle carries group "Stats to track" (format and live)', () => {
  test('format fields', () => {
    for (const [fields, keys] of [[bbMeta.BASKETBALL_META.formatFields, BB_STATS], [afMeta.AMERICAN_FOOTBALL_META.formatFields, AF_STATS], [baMeta.BASEBALL_META.formatFields, BA_STATS]] as const) {
      for (const k of keys) assert.equal((fields as FormatField[]).find((f) => f.key === k)?.group, 'Stats to track', k);
    }
  });
  test('live settings', () => {
    for (const [ls, keys] of [[AF_LIVE_SETTINGS, AF_STATS], [BASEBALL_LIVE_SETTINGS, BA_STATS]] as const) {
      for (const k of keys) assert.equal(ls.fields.find((f) => f.key === k)?.group, 'Stats to track', k);
    }
    for (const k of BB_STATS) assert.match(src('src/sports/basketball/index.tsx'), new RegExp(`key: '${k}'[^\\n]*group: 'Stats to track'`));
  });
});

/* ------------------------- DOU6 / DOU7 · one tap, voice ------------------------- */

type BSide = 'home' | 'away';
const BP = (id: string): Player => ({ id, fullName: id.toUpperCase(), sports: [] } as Player);
const ROSTER: Record<BSide, Player[]> = { home: [1, 2, 3, 4, 5].map((n) => BP(`h${n}`)), away: [1, 2, 3, 4, 5].map((n) => BP(`a${n}`)) };
const bbAt = (sec: number) => ({ quarter: 1, minute: Math.floor(sec / 60), sec, v: 2 });
const stampB = (a: ScoreAction, sec: number): ScoreAction => ({ ...a, payload: { ...a.payload, ...bbAt(sec) } });
const KO: ScoreAction = { type: 'KICKOFF', payload: { at: 1 } };
const BB_NEW = () => newFormat(bbMeta.BASKETBALL_META.formatFields);
const bbVctx = (s: BasketballState): VoiceContext => ({ state: s, homeName: 'H', awayName: 'A', homeRoster: ROSTER.home, awayRoster: ROSTER.away, now: 60_000 });

describe('DOU6 / DOU7 · the defaults on never block one-tap scoring; voice still one call', () => {
  test('basketball: a basket and a foul each land in one action (no fouled-by, no ⚡)', () => {
    let s = bbReducer(bbInit(BB_NEW()), KO);
    s = bbReducer(s, stampB(scoreAction('home', 2, ROSTER.home[0], { fbt: true }), 10));
    s = bbReducer(s, stampB(foulAction('away', ROSTER.away[0], 'personal', { fdt: true }), 20));
    assert.equal(s.home, 2);
    assert.equal(s.events.filter((e) => e.type === 'foul').length, 1);
    assert.ok(!bbDeepKeys(s).includes('fastBreakPoints') && !bbDeepKeys(s).includes('foulsDrawn'));
  });
  test('basketball voice: one call scores, no capture keys', () => {
    let s = bbReducer(bbInit(BB_NEW()), KO);
    for (const t of ['two H1', 'three A2', 'foul H3']) for (const a of basketballVoice(t, bbVctx(s)) ?? []) s = bbReducer(s, a);
    assert.equal(s.home + s.away, 5);
    const keys = new Set(Object.values(basketballStatTotals(s)).flatMap((l) => Object.keys(l.stats)));
    assert.ok(!keys.has('fastBreakPoints') && !keys.has('foulsDrawn'));
  });
  test('American football: an incompletion lands on the ✗ tap with targets + defence on', () => {
    let s = afInit(newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, 'nfl'));
    s = afReducer(s, { type: 'PLAY', side: 'home', payload: { play: 'kickoff', newSpot: 25, uid: 'k', period: 1, psec: 0, sec: 0 } });
    const before = s.drive!.down;
    s = afReducer(s, afBuildPlay(s, 'home', { play: 'inc', p1: { id: 'h1', name: 'H1' } }, { uid: 'i1', period: 1, psec: 10, sec: 10 }));
    assert.equal(s.drive!.down, before + 1);
    assert.deepEqual(afDeepKeys(s), []);
  });
  test('baseball: an out and a hit are one action each; the chips are optional pre-play pickers (source)', () => {
    let s = baStart(newFormat(baMeta.BASEBALL_META.formatFields));
    s = baPlay(s, [['GO'], ['1B']]);
    assert.equal(s.events.filter((e) => e.type === 'pa').length, 2);
    const ix = src('src/sports/baseball/index.tsx');
    const line = ix.split('\n').find((l) => l.includes('const needsSheet ='))!;
    assert.doesNotMatch(line, /sprayZones|battedBallTypes|zone|btype/);
  });
  test('baseball voice: one call per play, no batted-ball keys from "single"', () => {
    let s = baStart(newFormat(baMeta.BASEBALL_META.formatFields));
    for (const t of ['single', 'strikeout looking', 'single']) for (const a of baseballVoice(t, { state: s, homeName: 'H', awayName: 'A', homeRoster: [], awayRoster: [] }) ?? []) s = baReducer(s, a);
    assert.ok(s.events.filter((e) => e.type === 'pa').length >= 3);
    for (const l of Object.values(baseballTotals(s))) for (const k of BATTED_BALL_KEYS) assert.equal(k in l.stats, false, k);
  });
  test('American football voice: a completion by voice adds no defensive columns', () => {
    let s = afInit(newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, 'nfl'));
    s = afReducer(s, { type: 'PLAY', side: 'home', payload: { play: 'kickoff', newSpot: 25, uid: 'k', period: 1, psec: 0, sec: 0 } });
    const ctx: VoiceContext = { state: s, homeName: 'Lions', awayName: 'Bears', homeRoster: [BP('rao'), BP('khan')], awayRoster: [BP('das')], now: 60_000 };
    for (const a of afVoice('run Rao for 5', ctx) ?? []) s = afReducer(s, a);
    for (const k of afDeepKeys(s)) assert.ok(!['passDef', 'tfl', 'tackles'].includes(k), k);
  });
});

/* ------------------------------ 600-user simulation ------------------------------ */

const W = (id?: string): Who | undefined => (id ? { id, name: id.toUpperCase() } : undefined);
let u = 0;
const afAt = (psec: number) => ({ uid: `u${++u}`, period: 1, psec, sec: psec });
const tackle = (side: Side, id: string, t: Record<string, unknown>, tfl = false): ScoreAction =>
  ({ type: 'TACKLE', side, payload: { ...t, ...(tfl ? { tfl: true } : {}) }, ...afCredit({ type: 'tackle', playerId: id, playerName: id.toUpperCase(), ...(tfl ? { tfl: true } : {}) }) });
const passDef = (side: Side, id: string, t: Record<string, unknown>): ScoreAction =>
  ({ type: 'PASS_DEF', side, payload: t, ...afCredit({ type: 'pd', playerId: id, playerName: id.toUpperCase() }) });
const ORDER = (p: string) => Array.from({ length: 9 }, (_, i) => ({ id: `${p}${i + 1}`, name: `${p.toUpperCase()}${i + 1}` }));
function baStart(config?: Record<string, unknown>): BaseballState {
  let s = baInit(config);
  s = baReducer(s, { type: 'LINEUP', payload: { team: 'home', order: ORDER('h'), pitcher: { id: 'hp', name: 'HP' } } });
  s = baReducer(s, { type: 'LINEUP', payload: { team: 'away', order: ORDER('a'), pitcher: { id: 'ap', name: 'AP' } } });
  return s;
}
const baPlay = (s: BaseballState, plays: [Outcome, { fielders?: string; zone?: Zone; btype?: BattedBall }?][]) =>
  plays.reduce((x, [o, opts]) => baReducer(x, baBuildPlay(x, o, opts ?? {})), s);
const outputs = (s: unknown, fns: ((x: never) => unknown)[]) => JSON.stringify(fns.map((f) => f(s as never)));

describe('600-user simulation: new games with the new defaults; old-format games replay unchanged', () => {
  test('200 basketball games', () => {
    for (let m = 0; m < 200; m++) {
      const r = rng(31_000 + m);
      const voiceOnly = r() < 0.2, pFb = r() < 0.4 ? 0 : r() * 0.5, pFd = r() < 0.4 ? 0 : r() * 0.7;
      const fmt = BB_NEW();
      const st = bbInit(fmt);
      assert.equal(st.trackFastBreak && st.trackFoulsDrawn, true, `m${m} new game on`);
      const as: ScoreAction[] = [];
      const n = 5 + Math.floor(r() * 40);
      for (let i = 0; i < n; i++) {
        const side: BSide = r() < 0.5 ? 'home' : 'away', opp: BSide = side === 'home' ? 'away' : 'home';
        const p = ROSTER[side][Math.floor(r() * 5)];
        // the controls stamp `fbt` / `fdt` while the toggle is on; voice stamps nothing
        if (r() < 0.7) as.push(stampB(scoreAction(side, r() < 0.3 ? 3 : 2, p, voiceOnly ? {} : { fbt: true, ...(r() < pFb ? { fb: true } : {}) }), 10 + i * 10));
        else as.push(stampB(foulAction(side, p, 'personal', voiceOnly ? {} : { fdt: true, ...(r() < pFd ? { drawnBy: ROSTER[opp][Math.floor(r() * 5)] } : {}) }), 10 + i * 10));
      }
      const s = [KO, ...as].reduce(bbReducer, st);
      // one tap: every basket counts at once
      const pts = s.events.filter((e) => e.type === 'score').reduce((a, e) => a + (e.points ?? 0), 0);
      assert.equal(s.home + s.away, pts, `m${m} score`);
      const fbCap = s.events.some((e) => e.type === 'score' && e.fb), fdCap = s.events.some((e) => e.type === 'foul' && e.drawnPid);
      const keys = basketballPanel(s, 'all').categories.flatMap((c) => c.rows.map((x) => x.key));
      assert.equal(keys.includes('fastBreak'), fbCap, `m${m} fb row`);
      assert.equal(keys.includes('fd'), fdCap, `m${m} fd row`);
      for (const l of Object.values(basketballStatTotals(s))) {
        assert.equal('fastBreakPoints' in l.stats, fbCap, `m${m} fbp`);
        assert.equal('foulsDrawn' in l.stats, fdCap, `m${m} fd`);
      }
      // an old-format game (no keys) replays exactly as with the keys stored off
      const oldFmt = withoutKeys(fmt, BB_STATS);
      const oldAs = as.map((a) => ({ ...a, payload: Object.fromEntries(Object.entries(a.payload ?? {}).filter(([k]) => k !== 'fbt' && k !== 'fdt' && k !== 'fb' && k !== 'drawnBy')) })) as ScoreAction[];
      const o1 = [KO, ...oldAs].reduce(bbReducer, bbInit(oldFmt));
      const o2 = [KO, ...oldAs].reduce(bbReducer, bbInit({ ...oldFmt, trackFastBreak: false, trackFoulsDrawn: false }));
      assert.equal(outputs(o1, [basketballStatTotals, bbDeepKeys, (x: BasketballState) => [x.home, x.away]]), outputs(o2, [basketballStatTotals, bbDeepKeys, (x: BasketballState) => [x.home, x.away]]), `m${m} old replay`);
      assert.equal(o1.trackFastBreak, undefined);
    }
  });

  test('200 American football games (tackle presets play by play, flag Scores only)', () => {
    const KEYS = ['targets', 'passDef', 'tfl', 'tackles'] as const;
    const presets = Object.keys(afMeta.AF_PRESETS);
    for (let m = 0; m < 200; m++) {
      const r = rng(41_000 + m);
      const preset = presets[m % presets.length];
      const fmt = newFormat(afMeta.AMERICAN_FOOTBALL_META.formatFields, preset);
      let s: AFState = afInit(fmt);
      assert.equal(s.trackTackles, false, `m${m} tackles stay off`);
      const go = (a: ScoreAction) => { s = afReducer(s, a); };
      go({ type: 'PLAY', side: 'home', payload: { play: 'kickoff', newSpot: 25, ...afAt(0) } });
      const pbp = s.mode === 'pbp';
      const pPd = r() < 0.4 ? 0 : r(), pTgt = r() < 0.4 ? 0 : r();
      const n = 3 + Math.floor(r() * 30);
      for (let i = 0; i < n && pbp; i++) {
        const off: Side = s.drive?.off ?? 'home', def: Side = off === 'home' ? 'away' : 'home';
        const o = (k: number) => `${off[0]}${k}`, d = (k: number) => `${def[0]}${k}`;
        const t = afAt(10 + i * 10);
        const x = r();
        const evBefore = s.events.length;
        if (x < 0.4) go(afBuildPlay(s, off, { play: 'run', yards: Math.floor(r() * 10) - 3, p1: W(o(2)) }, t));
        else if (x < 0.65) go(afBuildPlay(s, off, { play: 'pass', yards: Math.floor(r() * 9) + 1, p1: W(o(1)), p2: W(o(3)), tgt: true }, t));
        else {
          go(afBuildPlay(s, off, { play: 'inc', p1: W(o(1)), ...(r() < pTgt ? { p2: W(o(3)), tgt: true } : {}) }, t));
          if (r() < pPd) go(passDef(def, d(4), t));
        }
        if (r() < 0.1) go(tackle(def, d(1), t)); // an organiser who switched tackles on later (rare)
        assert.ok(s.events.length > evBefore, `m${m} play ${i} logged on the tap`);
      }
      const captured = new Set<string>();
      for (const e of s.events) for (const cr of [eventCredits(e).first, eventCredits(e).second]) if (cr) for (const k of KEYS) if (k in cr.stats) captured.add(k);
      const tot = afTotals(s);
      const d = afBox(s).data('all');
      const box = new Set([...d.home.rows, ...d.away.rows].flatMap((x) => Object.keys(x.stats)));
      for (const k of KEYS) {
        assert.equal(box.has(k), captured.has(k), `m${m} box ${k}`);
        for (const l of Object.values(tot)) assert.equal(k in l.stats, captured.has(k), `m${m} ${k}`);
      }
      if (!pbp) assert.deepEqual(afDeepKeys(s), [], `m${m} Scores only: nothing`);
      // old format: replay of the same kickoff + plain plays reads off and matches the keys stored off
      const oldFmt = withoutKeys(fmt, AF_STATS);
      const k0: ScoreAction = { type: 'PLAY', side: 'home', payload: { play: 'kickoff', newSpot: 25, uid: 'k0', period: 1, psec: 0, sec: 0 } };
      const a1 = afReducer(afInit(oldFmt), k0), a2 = afReducer(afInit({ ...oldFmt, trackTackles: false, trackTargets: false, trackDefence: false }), k0);
      assert.deepEqual(a1, a2, `m${m} old replay`);
    }
  });

  test('200 baseball games', () => {
    const OUTS: Outcome[] = ['K', 'BB', '1B', '2B', 'GO', 'FO', 'LO', 'K', 'BB', '1B'];
    const TYPES: BattedBall[] = ['GB', 'LD', 'FB', 'PU'];
    const ZONES: Zone[] = ['LF', 'CF', 'RF'];
    const presets = Object.keys(baMeta.BASEBALL_PRESETS);
    for (let m = 0; m < 200; m++) {
      const r = rng(51_000 + m);
      const fmt = newFormat(baMeta.BASEBALL_META.formatFields, presets[m % presets.length]);
      const pType = r() < 0.4 ? 0 : r(), pZone = r() < 0.4 ? 0 : r();
      const n = 3 + Math.floor(r() * 25);
      const plays: [Outcome, { btype?: BattedBall; zone?: Zone }?][] = [];
      for (let i = 0; i < n; i++) {
        plays.push([OUTS[Math.floor(r() * OUTS.length)], {
          ...(r() < pType ? { btype: TYPES[Math.floor(r() * 4)] } : {}),
          ...(r() < pZone ? { zone: ZONES[Math.floor(r() * 3)] } : {}),
        }]);
      }
      const st = baStart(fmt);
      assert.deepEqual([st.cfg.sprayZones, st.cfg.battedBallTypes, st.cfg.pitchTypes === true, st.cfg.askFielders], [true, true, false, true], `m${m} new game`);
      const s = baPlay(st, plays);
      assert.equal(s.events.filter((e) => e.type === 'pa').length, n, `m${m} one action per play`);
      const captured = s.events.some((e) => e.type === 'pa' && !s.g.ann[e.id]?.ignored && !!battedBallOf(e));
      if (!captured) for (const l of Object.values(baseballTotals(s))) for (const k of BATTED_BALL_KEYS) assert.equal(k in l.stats, false, `m${m} ${k}`);
      const spray = baseballSheet(s).sections.find((x) => x.key === 'spray');
      if (spray) for (const row of spray.rows) assert.doesNotMatch(`${row.home} ${row.away}`, /^0 · 0 H 0 · 0 H$/, `m${m} empty spray zone`);
      // the same plays without chips (an old scorer) on the old format == keys stored off
      const plain = plays.map(([o]) => [o, {}] as [Outcome, Record<string, never>]);
      const oldFmt = withoutKeys(fmt, BA_STATS);
      const o1 = baPlay(baStart(oldFmt), plain), o2 = baPlay(baStart({ ...oldFmt, askFielders: false, pitchTypes: false, sprayZones: false, battedBallTypes: false }), plain);
      assert.equal(outputs(o1, [baseballTotals, baseballSheet]), outputs(o2, [baseballTotals, baseballSheet]), `m${m} old replay`);
      assert.deepEqual(o1.cfg, o2.cfg, `m${m} old cfg`);
    }
  });
});
