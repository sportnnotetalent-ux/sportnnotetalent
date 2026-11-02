/**
 * Batch 3 simulation — 600 random carrom matches (old formats without the
 * tracking keys, old formats with them off, new formats from the defaults,
 * new formats switched off) and 600 random baseball formats.
 * docs/security/breaks/defaults-carrom-baseball.md
 *
 * Invariants:
 *  - an old match (no keys / keys off) replays exactly as with every key off:
 *    no `track`, no board detail, no brk / qMiss / foul career keys;
 *  - a new match tracks coins on the break and missed covers, never fouls;
 *  - the scores never depend on what is tracked;
 *  - an untapped break is "not recorded" (no brkTracked), never 0;
 *  - baseball: askFielders is on only when the stored format says true.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FormatField } from '../src/sports/types.ts';
import { matchCaptures } from '../src/sports/matchRules.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { CARROM_META } from '../src/sports/carrom/meta.ts';
import { carromStatTotals, CARROM_BRK_KEYS, CARROM_QMISS_KEYS, CARROM_FOUL_KEYS } from '../src/sports/carrom/totals.ts';
import * as baseball from '../src/sports/baseball/engine.ts';
import { BASEBALL_META } from '../src/sports/baseball/meta.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const defaultsFor = (fields: readonly FormatField[]) => {
  const preset = fields.find((f) => f.type === 'preset');
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f.default]));
  const chosen = preset?.options?.find((o) => o.value === preset.default);
  if (chosen?.set) Object.assign(out, chosen.set);
  return out;
};
const NEW_C = defaultsFor(CARROM_META.formatFields!);
const OFF = { trackFouls: false, trackBreak: false, trackQueenMiss: false };
const PRESETS = ['icf', 'single', 'casual29'];

type Kind = 'old' | 'oldOff' | 'new' | 'newOff';
function format(kind: Kind): Record<string, unknown> {
  const base = { preset: PRESETS[rnd(3)], playersPerSide: 1, target: [25, 29][rnd(2)], maxBoards: 8, gamesToWin: 1 + rnd(2) };
  if (kind === 'old') return base;
  if (kind === 'oldOff') return { ...base, ...OFF };
  if (kind === 'new') return { ...NEW_C, ...base };
  return { ...NEW_C, ...base, ...OFF };
}
/** the boards the controls send: detail only for what is tracked, and only sometimes tapped */
function boards(s0: carrom.CarromState) {
  const acts: Array<{ type: string; side: 'home' | 'away'; payload: Record<string, unknown>; attribution: { playerId: string; points: number } }> = [];
  let s = s0;
  for (let i = 0; i < 40 && !s.ended; i++) {
    const side = rnd(2) ? 'home' : 'away';
    const det: carrom.BoardDetail = {};
    if (s.track?.brk && rnd(2)) det.brk = rnd(10);
    if (s.track?.qMiss) det.qMiss = rnd(4) ? {} : { [side === 'home' ? 'away' : 'home']: 1 };
    const a = { type: 'BOARD', side, payload: { coins: 1 + rnd(9), queen: rnd(3) === 0, ...(Object.keys(det).length ? { det } : {}) }, attribution: { playerId: `${side[0]}1`, points: 1 } } as const;
    acts.push(a as never);
    s = carrom.reducer(s, a as never);
  }
  return { acts, s };
}

test('sim · 600 carrom matches: old ones replay as before, new ones track break + missed covers', () => {
  const kinds: Kind[] = ['old', 'oldOff', 'new', 'newOff'];
  const seen: Record<Kind, number> = { old: 0, oldOff: 0, new: 0, newOff: 0 };
  for (let m = 0; m < 600; m++) {
    const kind = kinds[rnd(4)];
    seen[kind]++;
    const cfg = format(kind);
    const s0 = carrom.init(cfg);
    const { acts, s } = boards(s0);
    const ctx = { home: ['h1'], away: ['a1'] } as never;
    const caps = Object.fromEntries(matchCaptures(carrom.CARROM_LIVE_SETTINGS as never, s0, CARROM_META.formatFields!, cfg).captures.map((c) => [c.key, c.on]));
    // the score never depends on what is tracked
    const bare = acts.reduce((st, a) => carrom.reducer(st, { ...a, payload: { coins: a.payload.coins, queen: a.payload.queen } } as never), carrom.init({ ...cfg, ...OFF }));
    assert.deepEqual(s.games, bare.games, `m${m} games`);
    assert.deepEqual(s.gamesWon, bare.gamesWon, `m${m} gamesWon`);
    assert.equal(s.ended, bare.ended);
    const t = carromStatTotals(s, ctx);
    if (kind === 'old' || kind === 'oldOff' || kind === 'newOff') {
      assert.equal(s0.track, undefined, `m${m} ${kind} track`);
      assert.deepEqual(s, bare, `m${m} ${kind} replay identical`);
      assert.ok(s.boards.every((b) => b.det === undefined));
      for (const e of Object.values(t)) for (const k of [...CARROM_BRK_KEYS, ...CARROM_QMISS_KEYS, ...CARROM_FOUL_KEYS]) assert.equal(e.stats[k], undefined, `m${m} ${k}`);
      assert.deepEqual(caps, OFF, `m${m} Info`);
    } else {
      assert.deepEqual(s0.track, { brk: true, qMiss: true }, `m${m} track`);
      assert.deepEqual(caps, { trackFouls: false, trackBreak: true, trackQueenMiss: true }, `m${m} Info`);
      for (const e of Object.values(t)) for (const k of CARROM_FOUL_KEYS) assert.equal(e.stats[k], undefined, `m${m} no foul zeros: ${k}`);
      // coins on the break: counted only over the breaks a chip was tapped for
      const tapped = s.boards.filter((b) => b.det?.brk !== undefined).length;
      const tracked = Object.values(t).reduce((n, e) => n + (e.stats.brkTracked ?? 0), 0);
      assert.ok(tracked <= tapped, `m${m} brkTracked ${tracked} <= tapped ${tapped}`);
      if (tapped === 0) for (const e of Object.values(t)) assert.equal(e.stats.brkTracked, undefined, `m${m} untapped break is not a 0`);
    }
  }
  for (const k of kinds) assert.ok(seen[k] > 100, `${k}: ${seen[k]}`);
});

test('sim · 600 baseball formats: askFielders only when stored true; old formats read off', () => {
  const NEW_B = defaultsFor(BASEBALL_META.formatFields!);
  for (let m = 0; m < 600; m++) {
    const r = rnd(4);
    const cfg: Record<string, unknown> = r === 0 ? { innings: 7 + rnd(3) } : r === 1 ? { ...NEW_B } : r === 2 ? { ...NEW_B, askFielders: true } : { innings: 9, askFielders: rnd(2) === 1 };
    const s = baseball.init(cfg);
    assert.equal(s.cfg.askFielders, cfg.askFielders === true, `m${m}`);
    const cap = matchCaptures(baseball.BASEBALL_LIVE_SETTINGS as never, s, BASEBALL_META.formatFields!, cfg).captures.find((c) => c.key === 'askFielders');
    assert.equal(cap?.on, cfg.askFielders === true, `m${m} Info`);
  }
});
