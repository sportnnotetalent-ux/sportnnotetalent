/**
 * Batch 3 — richer stats on by default for NEW carrom matches (coins on the
 * break, missed Queen covers; fouls stay off) and the baseball "Ask for
 * fielders" decision. Old matches read and replay exactly as before.
 * docs/security/breaks/defaults-carrom-baseball.md
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FormatField } from '../src/sports/types.ts';
import { matchCaptures, liveOwnedKeys } from '../src/sports/matchRules.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { CARROM_META } from '../src/sports/carrom/meta.ts';
import { carromStatTotals, CARROM_BRK_KEYS, CARROM_QMISS_KEYS, CARROM_FOUL_KEYS } from '../src/sports/carrom/totals.ts';
import * as baseball from '../src/sports/baseball/engine.ts';
import { BASEBALL_META } from '../src/sports/baseball/meta.ts';

// defaultsFor (src/components/FormatEditor.tsx) without React Native: the preset's set wins
const defaultsFor = (fields: readonly FormatField[]) => {
  const preset = fields.find((f) => f.type === 'preset');
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f.default]));
  const chosen = preset?.options?.find((o) => o.value === preset.default);
  if (chosen?.set) Object.assign(out, chosen.set);
  return out;
};
const src = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const fieldOf = (fields: readonly FormatField[], k: string) => fields.find((f) => f.key === k)!;

// an old carrom match's stored format: written before the tracking keys existed
const OLD_CARROM = { preset: 'icf', playersPerSide: 1, target: 25, maxBoards: 8, gamesToWin: 2 };
const BOARDS: Array<['home' | 'away', number, boolean]> = [['home', 5, true], ['away', 3, false], ['home', 9, false], ['away', 6, true], ['home', 7, true], ['home', 4, false]];
const boardActs = (det?: carrom.BoardDetail) => BOARDS.map(([side, coins, queen]) => ({ type: 'BOARD', side, payload: { coins, queen, ...(det ? { det } : {}) }, attribution: { playerId: `${side[0]}1`, points: 1 } }));
const runC = (cfg: Record<string, unknown>, acts = boardActs()) => acts.reduce((s, a) => carrom.reducer(s, a as never), carrom.init(cfg));

describe('DC1 · carrom: coins on the break and missed Queen covers on for a new match', () => {
  // defaults-on DOK8 (wave 3, docs/security/breaks/defaults-on-cricket-cue.md): fouls are
  // on too now that a board is foul-tracked only from the first tapped foul (NZG3)
  test('the format fields default them on; fouls on too since wave 3 (was DC3)', () => {
    const f = CARROM_META.formatFields!;
    assert.equal(fieldOf(f, 'trackBreak').default, true);
    assert.equal(fieldOf(f, 'trackQueenMiss').default, true);
    assert.equal(fieldOf(f, 'trackFouls').default, true);
  });
  test('a new match (format from defaultsFor) tracks break + missed covers + fouls', () => {
    const s = carrom.init(defaultsFor(CARROM_META.formatFields!));
    assert.deepEqual(s.track, { fouls: true, brk: true, qMiss: true });
  });
  test('the organiser / scorer can still switch either off', () => {
    assert.equal(carrom.init({ ...defaultsFor(CARROM_META.formatFields!), trackBreak: false, trackQueenMiss: false, trackFouls: false }).track, undefined); // defaults-on DOK8
    let s = carrom.init(defaultsFor(CARROM_META.formatFields!));
    s = carrom.reducer(s, { type: 'SET_TRACK', payload: { trackBreak: false, trackQueenMiss: false, trackFouls: false } });
    assert.equal(s.track, undefined);
  });
});

describe('DC2 · old carrom matches read and replay exactly as before', () => {
  test('a stored format without the keys tracks nothing', () => {
    assert.equal(carrom.init(OLD_CARROM).track, undefined);
    assert.equal(carrom.init({}).track, undefined);
    assert.equal(carrom.init({ ...OLD_CARROM, trackBreak: false, trackQueenMiss: false }).track, undefined);
  });
  test('replay is identical to the keys stored off; no detail, no new career keys (no false zeros)', () => {
    const old = runC(OLD_CARROM);
    assert.deepEqual(old, runC({ ...OLD_CARROM, trackFouls: false, trackBreak: false, trackQueenMiss: false }));
    assert.ok(old.boards.every((b) => b.det === undefined));
    const t = carromStatTotals(old, { home: ['h1'], away: ['a1'] } as never);
    for (const e of Object.values(t)) for (const k of [...CARROM_BRK_KEYS, ...CARROM_QMISS_KEYS, ...CARROM_FOUL_KEYS]) assert.equal(e.stats[k], undefined, k);
  });
  test('the scores of an old match do not depend on the new defaults', () => {
    const neu = runC(defaultsFor(CARROM_META.formatFields!));
    const old = runC(OLD_CARROM);
    assert.deepEqual(neu.games, old.games);
    assert.deepEqual(neu.current, old.current);
    assert.deepEqual(neu.gamesWon, old.gamesWon);
  });
});

describe('DC4 · one source for the carrom default (format field = live settings card)', () => {
  test('CARROM_LIVE_SETTINGS lives in the pure engine and agrees with the format fields', () => {
    const ls = carrom.CARROM_LIVE_SETTINGS;
    for (const k of ['trackFouls', 'trackBreak', 'trackQueenMiss']) {
      assert.equal(fieldOf(ls.fields, k).default, fieldOf(CARROM_META.formatFields!, k).default, k);
      assert.equal(ls.defaults?.[k], fieldOf(CARROM_META.formatFields!, k).default, k);
    }
  });
  test('the plugin uses it (index.tsx)', () => {
    assert.match(src('src/sports/carrom/index.tsx'), /liveSettings:\s*CARROM_LIVE_SETTINGS/);
  });
  test('read: a new match reads on; an old match reads off', () => {
    const ls = carrom.CARROM_LIVE_SETTINGS;
    assert.deepEqual(ls.read(carrom.init(defaultsFor(CARROM_META.formatFields!))), { trackFouls: true, trackBreak: true, trackQueenMiss: true }); // defaults-on DOK8
    assert.deepEqual(ls.read(carrom.init(OLD_CARROM)), { trackFouls: false, trackBreak: false, trackQueenMiss: false });
  });
});

describe('DC5 · the newly-on captures stay optional', () => {
  test('a board with no break count records; coins on the break stays "not recorded"', () => {
    const s = runC(defaultsFor(CARROM_META.formatFields!), boardActs({ qMiss: {} }));
    assert.equal(s.boards.length, BOARDS.length);
    assert.ok(s.boards.every((b) => b.det?.brk === undefined));
    const t = carromStatTotals(s, { home: ['h1'], away: ['a1'] } as never);
    for (const e of Object.values(t)) assert.equal(e.stats.brkTracked, undefined);
  });
  test('a board with no detail at all still records (nothing is required)', () => {
    const s = runC(defaultsFor(CARROM_META.formatFields!));
    assert.equal(s.boards.length, BOARDS.length);
  });
});

describe('DC6 · Info › Rules & stats captured shows the new defaults', () => {
  const caps = (cfg: Record<string, unknown>) =>
    Object.fromEntries(matchCaptures(carrom.CARROM_LIVE_SETTINGS as never, carrom.init(cfg), CARROM_META.formatFields!, cfg).captures.map((c) => [c.key, c.on]));
  test('new match: break + missed covers On, fouls On (defaults-on DOK8)', () => {
    assert.deepEqual(caps(defaultsFor(CARROM_META.formatFields!)), { trackFouls: true, trackBreak: true, trackQueenMiss: true });
  });
  test('old match: all Off (what it actually captured)', () => {
    assert.deepEqual(caps(OLD_CARROM), { trackFouls: false, trackBreak: false, trackQueenMiss: false });
  });
});

// US batch 5 (docs/security/breaks/us-sports-batch5.md BS9 / BS11) replaced DB1: the
// fielders are optional chips AFTER the play is recorded (no blocking sheet), so
// "Ask for fielders" is on for a NEW match; a stored format without the key reads off.
describe('DB1 · baseball: Ask for fielders on for new matches (non-blocking since US batch 5)', () => {
  test('format field and live settings both default on', () => {
    assert.equal(fieldOf(BASEBALL_META.formatFields!, 'askFielders').default, true);
    assert.equal(fieldOf(baseball.BASEBALL_LIVE_SETTINGS.fields, 'askFielders').default, true);
    assert.equal(baseball.BASEBALL_LIVE_SETTINGS.defaults?.askFielders, true);
  });
  test('no blocking step: a fielded out no longer opens the sheet for fielders', () => {
    assert.doesNotMatch(src('src/sports/baseball/index.tsx'), /\(askFielders && FIELDED\.includes\(o\)\)/);
  });
  test('a new game reads it on; Info shows On; an old format reads off', () => {
    const fmt = defaultsFor(BASEBALL_META.formatFields!);
    const s = baseball.init(fmt);
    assert.equal(s.cfg.askFielders, true);
    const cap = matchCaptures(baseball.BASEBALL_LIVE_SETTINGS as never, s, BASEBALL_META.formatFields!, fmt).captures.find((c) => c.key === 'askFielders');
    assert.equal(cap?.on, true);
    assert.equal(baseball.init({ innings: 9 }).cfg.askFielders, false);
  });
});

describe('DB2 · baseball switches live in one place', () => {
  test('Scoring settings owns pitches, askFielders and the stats toggles (Edit format leaves them out)', () => {
    const owned = liveOwnedKeys(baseball.BASEBALL_LIVE_SETTINGS as never);
    for (const k of ['pitches', 'askFielders', 'pitchTypes', 'sprayZones', 'battedBallTypes']) assert.ok(owned.includes(k), k);
    assert.match(src('src/screens/LiveScoringScreen.tsx'), /liveOwnedKeys\(plugin\.liveSettings/);
  });
});

describe('DB3 · old baseball games unchanged', () => {
  test('a format without askFielders reads off; stored on stays on', () => {
    assert.equal(baseball.init({ innings: 9 }).cfg.askFielders, false);
    assert.equal(baseball.init({}).cfg.askFielders, false);
    assert.equal(baseball.init({ askFielders: true }).cfg.askFielders, true);
  });
});
