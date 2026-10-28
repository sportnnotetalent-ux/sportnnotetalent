/** Perf audit wave 3 (docs/perf/audit.md): sport metadata split from the
 *  plugins, which load on demand (F-15); the live log re-derived in one place
 *  so Undo steps the board back locally first (F-21). The plugins themselves
 *  are React Native and can't load here — their wiring is checked as source. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { ScoreAction, SportMeta } from '../src/sports/types.ts';
import { deriveLog, eventKey, newestEvent } from '../src/data/eventLog.ts';
import { replayLog, AMEND_TYPE } from '../src/sports/amend.ts';
import * as cricket from '../src/sports/cricket/engine.ts';
import { CRICKET_MATCH_EVENTS, CRICKET_LIVE_EVENTS } from '../src/data/cricketSeed.ts';
import * as football from '../src/sports/football/engine.ts';
import * as afEngine from '../src/sports/american_football/engine.ts';
import * as afMeta from '../src/sports/american_football/meta.ts';
import * as baseballEngine from '../src/sports/baseball/engine.ts';
import * as baseballMeta from '../src/sports/baseball/meta.ts';
import * as basketballEngine from '../src/sports/basketball/engine.ts';
import * as basketballMeta from '../src/sports/basketball/meta.ts';
import * as footballMeta from '../src/sports/football/meta.ts';
import * as handballEngine from '../src/sports/handball/engine.ts';
import * as handballMeta from '../src/sports/handball/meta.ts';
import * as hockeyEngine from '../src/sports/hockey/engine.ts';
import * as hockeyMeta from '../src/sports/hockey/meta.ts';
import * as iceEngine from '../src/sports/ice_hockey/engine.ts';
import * as iceMeta from '../src/sports/ice_hockey/meta.ts';
import * as netballEngine from '../src/sports/netball/engine.ts';
import * as netballMeta from '../src/sports/netball/meta.ts';
import * as rugbyEngine from '../src/sports/rugby/engine.ts';
import * as rugbyMeta from '../src/sports/rugby/meta.ts';
import * as leagueEngine from '../src/sports/rugby_league/engine.ts';
import * as leagueMeta from '../src/sports/rugby_league/meta.ts';
import { MATCH_RECORD_HOOKS } from '../src/sports/matchRecordHooks.ts';

const ROOT = new URL('../src/sports/', import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, ROOT), 'utf8');
/** every sport folder with a plugin */
const SPORTS = readdirSync(ROOT).filter((d) => existsSync(new URL(`${d}/index.tsx`, ROOT))).sort();

/* ------------------------------ F-21 · replay ------------------------------ */

const ev = (seq: number, type: string, extra: Partial<MatchEventRecord> = {}): MatchEventRecord =>
  ({ seq, type, side: 'home', payload: {}, attribution: null, ...extra });
/** the engines as the replay takes them (plugin-shaped) */
const CRICKET = { createInitialState: cricket.init, reducer: cricket.reducer } as never;
const FOOTBALL = { createInitialState: football.init, reducer: football.reducer } as never;
/** a tiny pure "sport": counts its events per type */
const counter = {
  createInitialState: () => ({} as Record<string, number>),
  reducer: (s: Record<string, number>, a: ScoreAction) => ({ ...s, [a.type]: (s[a.type] ?? 0) + 1 }),
};

describe('F-21 · deriveLog (the one replay behind rebuild and the local Undo)', () => {
  test('the state is the replayed log — every finished cricket seed match, ball by ball', () => {
    for (const raw of Object.values(CRICKET_MATCH_EVENTS)) {
      const d = deriveLog(CRICKET, undefined, raw);
      assert.deepEqual(d.state, replayLog(CRICKET, undefined, raw));
      assert.equal(d.maxSeq, Math.max(...raw.map((e) => e.seq)));
      for (const e of raw) assert.ok(d.applied.has(eventKey(e)));
      const tail = newestEvent(raw)!;
      assert.equal(d.lastStep!.type, tail.type);
      assert.equal(d.lastStep!.next, d.state);
    }
  });
  test('Undo locally = the same board the server rebuild shows after the pop', () => {
    for (const raw of [...Object.values(CRICKET_LIVE_EVENTS), ...Object.values(CRICKET_MATCH_EVENTS)]) {
      const tail = newestEvent(raw)!;
      const rest = raw.filter((e) => e !== tail);
      const local = deriveLog(CRICKET, undefined, rest);
      const rebuilt = deriveLog(CRICKET, undefined, raw.slice().sort((a, b) => a.seq - b.seq).slice(0, -1));
      assert.deepEqual(local.state, rebuilt.state);
      assert.deepEqual(local.lastStep, rebuilt.lastStep);
      assert.equal(local.maxSeq, rebuilt.maxSeq);
    }
  });
  test('football: undoing step by step walks the board back through every earlier state', () => {
    const actions: ScoreAction[] = [
      { type: 'KICKOFF', payload: { at: 1_000 } },
      { type: 'GOAL', side: 'home', payload: { minute: 3 } },
      { type: 'YELLOW', side: 'away', payload: { minute: 9 } },
      { type: 'GOAL', side: 'away', payload: { minute: 20 } },
    ];
    const raw = actions.map((a, i) => ev(i + 1, a.type, { side: a.side ?? null, payload: a.payload ?? {} }));
    let log = raw;
    while (log.length) {
      const tail = newestEvent(log)!;
      log = log.filter((e) => e !== tail);
      assert.deepEqual(deriveLog(FOOTBALL, undefined, log).state, replayLog(FOOTBALL, undefined, log));
    }
  });
  test('the newest event is the highest seq (a tie: the later one), as Undo pops it', () => {
    const a = ev(1, 'A'), b = ev(3, 'B'), c = ev(2, 'C'), d = ev(3, 'D');
    assert.equal(newestEvent([a, b, c]), b);
    assert.equal(newestEvent([a, b, d]), d);
    assert.equal(newestEvent([]), undefined);
  });
  test('a correction (AMEND) at the tail: its step reads as no change on the board, as before', () => {
    const raw = [ev(1, 'A'), ev(2, 'B'), { ...ev(3, AMEND_TYPE), payload: { ops: [{ op: 'void', seq: 2 }], lines: [], byName: 'x', deltas: [] } }];
    const d = deriveLog(counter as never, undefined, raw);
    assert.deepEqual(d.state, { A: 1 });
    assert.equal(d.lastStep!.type, AMEND_TYPE);
    assert.equal(d.lastStep!.prev, d.lastStep!.next);
    assert.equal(d.maxSeq, 3);
  });
  test('an empty log: the initial state, nothing to undo', () => {
    const d = deriveLog(counter as never, undefined, []);
    assert.deepEqual(d.state, {});
    assert.equal(d.lastStep, null);
    assert.equal(d.maxSeq, 0);
  });
});

/* ------------------------- F-15 · the light sport meta ------------------------- */

const metaOf = async (sport: string): Promise<SportMeta> => {
  const mod = await import(`../src/sports/${sport}/meta.ts`) as Record<string, unknown>;
  const key = `${sport.toUpperCase()}_META`;
  assert.ok(mod[key], `${sport}/meta.ts exports ${key}`);
  return mod[key] as SportMeta;
};

describe('F-15 · each sport keeps its light meta next to its plugin', () => {
  test('every sport has a meta.ts, pure (no React Native), named and iconed, its id its folder', async () => {
    assert.ok(SPORTS.length >= 30);
    for (const sport of SPORTS) {
      const src = read(`${sport}/meta.ts`);
      assert.doesNotMatch(src, /from 'react-native'|from 'react'|\.tsx'/, `${sport}/meta.ts stays light`);
      const m = await metaOf(sport);
      assert.equal(m.id, sport);
      assert.ok(m.name && m.icon && m.archetype, sport);
      const keys = (m.formatFields ?? []).map((f) => f.key);
      assert.equal(new Set(keys).size, keys.length, `${sport}: no duplicate format keys`);
    }
  });
  test('every plugin spreads its meta and never redefines it (one source for both)', () => {
    for (const sport of SPORTS) {
      const src = read(`${sport}/index.tsx`);
      if (/makeRallyPlugin\(/.test(src)) {
        // rally sports: the base options + name / icon from the meta
        assert.match(src, new RegExp(`formatFields: ${sport.toUpperCase()}_FORMAT_FIELDS`), sport);
        assert.match(src, new RegExp(`name: ${sport.toUpperCase()}_META\\.name`), sport);
        continue;
      }
      assert.match(src, new RegExp(`\\.\\.\\.${sport.toUpperCase()}_META,`), sport);
      assert.doesNotMatch(src, /^\s{2}(formatFields|archetype|participantKind|retireTerms):/m, `${sport}/index.tsx`);
    }
  });
  test('the format presets the engines use are the very objects the meta offers', () => {
    assert.equal(afEngine.AF_PRESETS, afMeta.AF_PRESETS);
    assert.equal(afEngine.TRACK_FIELDS, afMeta.TRACK_FIELDS);
    assert.equal(baseballEngine.BASEBALL_PRESETS, baseballMeta.BASEBALL_PRESETS);
    assert.equal(baseballEngine.TRACK_FIELDS, baseballMeta.TRACK_FIELDS);
    assert.equal(basketballEngine.BB_TRACK_DEFAULTS, basketballMeta.BB_TRACK_DEFAULTS);
    assert.equal(football.DEEP_TRACK_FIELDS, footballMeta.DEEP_TRACK_FIELDS);
    assert.equal(handballEngine.HANDBALL_PRESETS, handballMeta.HANDBALL_PRESETS);
    assert.equal(hockeyEngine.HOCKEY_PRESETS, hockeyMeta.HOCKEY_PRESETS);
    assert.equal(iceEngine.ICE_HOCKEY_PRESETS, iceMeta.ICE_HOCKEY_PRESETS);
    assert.equal(netballEngine.SUPER_SHOT_RULE_OPTIONS, netballMeta.SUPER_SHOT_RULE_OPTIONS);
    assert.equal(rugbyEngine.RUGBY_PRESETS, rugbyMeta.RUGBY_PRESETS);
    assert.equal(leagueEngine.LEAGUE_PRESETS, leagueMeta.LEAGUE_PRESETS);
  });
  test('the meta list (sportMeta.ts) and both plugin loaders cover every sport', () => {
    const list = read('sportMeta.ts');
    const web = read('sportLoaders.ts');
    const native = read('sportLoaders.native.ts');
    for (const sport of SPORTS) {
      assert.match(list, new RegExp(`from './${sport}/meta'`), `sportMeta.ts: ${sport}`);
      assert.match(web, new RegExp(`import\\('\\./${sport}'\\)`), `sportLoaders.ts: ${sport}`);
      assert.match(native, new RegExp(`require\\('\\./${sport}'\\)`), `sportLoaders.native.ts: ${sport}`);
    }
  });
  test('the registry no longer imports any plugin (they load on demand)', () => {
    const reg = read('registry.ts');
    for (const sport of SPORTS) assert.doesNotMatch(reg, new RegExp(`from '\\./${sport}'`), sport);
    assert.doesNotMatch(reg, /matchRecordHooks/);
  });
  test('each sport with a records hook sets it on its own plugin (was the registry)', () => {
    for (const sport of Object.keys(MATCH_RECORD_HOOKS)) {
      // a plugin may keep its pure half in <sport>/core.ts (pool) and spread it
      const core = existsSync(new URL(`${sport}/core.ts`, ROOT)) ? read(`${sport}/core.ts`) : '';
      const src = /makeRallyPlugin\(/.test(read(`${sport}/index.tsx`)) ? read('rallyCore.tsx') : read(`${sport}/index.tsx`) + core;
      assert.match(src, /matchRecords: [a-zA-Z]+MatchRecords,/, sport);
    }
  });
});
