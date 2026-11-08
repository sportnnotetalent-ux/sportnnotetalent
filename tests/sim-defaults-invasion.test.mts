/**
 * Quality mandate step 6 for batch 3 defaults (docs/security/breaks/defaults-invasion.md):
 * random old and new football, rugby union and rugby league matches, each
 * replayed from a random log. Old matches (stored format without the key, or
 * with it off) replay deep-equal to the same log under the explicit old
 * format and never gain the stat (no false zeros); new matches track it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FormatField, ScoreAction } from '../src/sports/types.ts';
import { FOOTBALL_META } from '../src/sports/football/meta.ts';
import * as football from '../src/sports/football/engine.ts';
import { goalAction } from '../src/sports/football/actions.ts';
import { RUGBY_META } from '../src/sports/rugby/meta.ts';
import * as rugby from '../src/sports/rugby/engine.ts';
import { RUGBY_LEAGUE_META } from '../src/sports/rugby_league/meta.ts';
import * as league from '../src/sports/rugby_league/engine.ts';

let seed = 1103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const side = () => (rnd(2) ? 'home' : 'away') as 'home' | 'away';
const newMatch = (fields: FormatField[], ctx?: 'tournament') => {
  const preset = fields.find((f) => f.type === 'preset');
  const pd = ctx === 'tournament' && preset?.tournamentDefault != null ? preset.tournamentDefault : preset?.default;
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f === preset ? pd : (ctx === 'tournament' && f.tournamentDefault != null ? f.tournamentDefault : f.default)]));
  Object.assign(out, preset?.options?.find((o) => o.value === pd)?.set ?? {});
  return out;
};
const N = 500;

/* -------------------------------- football -------------------------------- */
const cap = (k: string) => `track${k[0].toUpperCase()}${k.slice(1)}`;
const OLD_FRIENDLY = Object.fromEntries(football.TRACK_KEYS.map((k) => [cap(k), k === 'cards']));
const footballLog = (): ScoreAction[] => {
  const log: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1_000 } }];
  let t = 1_000;
  for (let i = 0, n = 5 + rnd(20); i < n; i++) {
    t += 5_000 + rnd(60_000);
    log.push(rnd(3) ? { type: 'POSSESSION', payload: { side: side(), at: t } } : goalAction(side(), { id: `p${rnd(11)}` }, 'open'));
  }
  return log;
};

test(`${N} old football friendlies (stored Quick, cards only) replay unchanged: no shots, no saves`, () => {
  for (let i = 0; i < N; i++) {
    const log = footballLog();
    const s = log.reduce(football.reducer, football.init(OLD_FRIENDLY));
    assert.equal(s.track.shots, false);
    assert.equal(s.track.saves, false);
    assert.deepEqual(s, log.reduce(football.reducer, football.init({ ...OLD_FRIENDLY })));
  }
});
test(`${N} saved football matches (no track keys) keep the full set`, () => {
  for (let i = 0; i < N; i++) {
    const s = footballLog().reduce(football.reducer, football.init({}));
    for (const k of football.TRACK_KEYS) assert.equal(s.track[k], k !== 'passes', k);
  }
});
test(`${N} new football friendlies track shots and saves; ${N} tournament matches keep the full set`, () => {
  const fields = FOOTBALL_META.formatFields!;
  for (let i = 0; i < N; i++) {
    const s = footballLog().reduce(football.reducer, football.init(newMatch(fields)));
    assert.equal(s.track.shots, true);
    assert.equal(s.track.saves, true);
    assert.equal(s.track.possession, false);
    const tm = footballLog().reduce(football.reducer, football.init(newMatch(fields, 'tournament')));
    assert.deepEqual(tm.track, football.readTrack({}));
  }
});

/* ------------------------------- rugby union ------------------------------- */
let u = 0;
const at = (p: Record<string, unknown> = {}) => { const sec = 30 + rnd(2_000); return { uid: `u${++u}`, sec, psec: sec, period: 1, ...p }; };
const unionLog = (): ScoreAction[] => {
  const log: ScoreAction[] = [{ type: 'CLOCK', payload: { run: true, at: 1_000 } }];
  for (let i = 0, n = 3 + rnd(15); i < n; i++) {
    const r = rnd(4);
    if (r === 0) log.push({ type: 'TRY', side: side(), payload: at() });
    else if (r === 1) log.push({ type: 'KICK', side: side(), payload: at({ kick: rnd(2) ? 'pen' : 'conv', made: !!rnd(2) }) });
    else if (r === 2) log.push({ type: 'CARD', side: side(), payload: at({ card: 'yellow' }), attribution: { playerId: `p${rnd(15)}`, playerName: 'P', delta: 1 } as never });
    else log.push({ type: 'PENALTY_TRY', side: side(), payload: at() });
  }
  return log;
};
let pts = 0, evs = 0;
test(`${N} old union matches (key absent or off) replay unchanged with no penalties-conceded key`, () => {
  for (let i = 0; i < N; i++) {
    const log = unionLog();
    const absent = log.reduce(rugby.reducer, rugby.init({}));
    const off = log.reduce(rugby.reducer, rugby.init({ trackPenalties: false }));
    assert.deepEqual(absent, off);
    assert.equal(absent.trackPenalties, undefined);
    assert.equal(rugby.trackedTallyKeys(absent).includes('penaltiesGivenAway'), false);
    pts += absent.home + absent.away; evs += absent.events.length;
  }
  assert.ok(pts > N && evs > N, 'the logs really score');
});
test(`${N} new union matches track penalties conceded`, () => {
  const fields = RUGBY_META.formatFields!;
  for (let i = 0; i < N; i++) {
    const s = unionLog().reduce(rugby.reducer, rugby.init(newMatch(fields, rnd(2) ? 'tournament' : undefined)));
    assert.equal(s.trackPenalties, true);
    // no-false-zeros NZI11: offered by default, tracked once a penalty is recorded (none in these logs)
    assert.equal(rugby.trackedTallyKeys(s).includes('penaltiesGivenAway'), false);
    assert.ok(rugby.trackedTallyKeys(s, { type: 'tally', side: 'home', tally: 'penalty' }).includes('penaltiesGivenAway'));
    assert.equal(rugby.RUGBY_LIVE_SETTINGS.read(s).trackPenalties, true);
  }
});

/* ------------------------------- rugby league ------------------------------ */
const leagueLog = (): ScoreAction[] => {
  const log: ScoreAction[] = [{ type: 'CLOCK', payload: { run: true, at: 1_000 } }];
  for (let i = 0, n = 3 + rnd(15); i < n; i++) {
    const r = rnd(3);
    if (r === 0) log.push({ type: 'TRY', side: side(), payload: at() });
    else if (r === 1) log.push({ type: 'KICK', side: side(), payload: at({ kick: ['conv', 'pen', 'fg'][rnd(3)], made: !!rnd(2) }) });
    else log.push({ type: 'CARD', side: side(), payload: at({ card: 'yellow' }), attribution: { playerId: `p${rnd(13)}`, playerName: 'P', delta: 1 } as never });
  }
  return log;
};
test(`${N} old league matches (key absent or off) replay unchanged with no error / penalty keys`, () => {
  pts = 0; evs = 0;
  for (let i = 0; i < N; i++) {
    const log = leagueLog();
    const absent = log.reduce(league.reducer, league.init({}));
    assert.deepEqual(absent, log.reduce(league.reducer, league.init({ trackErrors: false })));
    assert.equal(absent.trackErrors, undefined);
    assert.deepEqual(league.trackedDetailKeys(absent), []);
    pts += absent.home + absent.away; evs += absent.events.length;
  }
  assert.ok(pts > N && evs > N, 'the logs really score');
});
test(`${N} new league matches track errors & penalties conceded`, () => {
  const fields = RUGBY_LEAGUE_META.formatFields!;
  for (let i = 0; i < N; i++) {
    const s = leagueLog().reduce(league.reducer, league.init(newMatch(fields, rnd(2) ? 'tournament' : undefined)));
    assert.equal(s.trackErrors, true);
    // no-false-zeros NZI12: offered by default, tracked per kind once recorded (none in these logs)
    assert.deepEqual(league.trackedDetailKeys(s), []);
    assert.deepEqual(league.trackedDetailKeys(s, { type: 'detail', side: 'home', detail: 'penalty' }), ['penaltiesGivenAway']);
    assert.equal(league.LEAGUE_LIVE_SETTINGS.read(s).trackErrors, true);
  }
});
