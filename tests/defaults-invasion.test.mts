/**
 * Batch 3 — richer stats on by default for NEW football and rugby matches
 * (founder 2026-11-02: only what is captured in scoring is seen in stats).
 * docs/security/breaks/defaults-invasion.md D1–D10; docs/sport-expert/invasion.md
 * "Defaults hide depth" and fix #8.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FormatField } from '../src/sports/types.ts';
import { matchCaptures } from '../src/sports/matchRules.ts';
import { FOOTBALL_META } from '../src/sports/football/meta.ts';
import * as football from '../src/sports/football/engine.ts';
import { RUGBY_META } from '../src/sports/rugby/meta.ts';
import * as rugby from '../src/sports/rugby/engine.ts';
import { RUGBY_LEAGUE_META } from '../src/sports/rugby_league/meta.ts';
import * as league from '../src/sports/rugby_league/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const ROOT = join(import.meta.dirname, '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** What the new-match forms stamp (FormatEditor `defaultsFor`, a .tsx: mirrored here). */
const newMatch = (fields: FormatField[], ctx?: 'tournament') => {
  const preset = fields.find((f) => f.type === 'preset');
  const pd = ctx === 'tournament' && preset?.tournamentDefault != null ? preset.tournamentDefault : preset?.default;
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f === preset ? pd : (ctx === 'tournament' && f.tournamentDefault != null ? f.tournamentDefault : f.default)]));
  Object.assign(out, preset?.options?.find((o) => o.value === pd)?.set ?? {});
  return out;
};
const on = (caps: { key: string; on: boolean }[], key: string) => caps.find((c) => c.key === key)?.on;

/** The football friendly format stored before this change (MVP F8 "Quick": cards only). */
const OLD_FRIENDLY = Object.fromEntries(football.TRACK_KEYS.map((k) => [`track${k[0].toUpperCase()}${k.slice(1)}`, k === 'cards']));

describe('football', () => {
  const fields = FOOTBALL_META.formatFields!;
  test('a new friendly tracks shots and saves (and cards); the rest stays opt-in', () => {
    const t = football.readTrack(newMatch(fields));
    assert.equal(t.shots, true);
    assert.equal(t.saves, true);
    assert.equal(t.cards, true);
    // defaults-on DOI10: every tap stat is now on for a new friendly; possession and passes stay off
    for (const k of football.TRACK_KEYS) assert.equal(t[k], !['possession', 'passes'].includes(k), k);
  });
  test('D8: a new tournament match keeps the full set (passes off)', () => {
    assert.deepEqual(football.readTrack(newMatch(fields, 'tournament')), football.readTrack({}));
  });
  test('D1: an old friendly (stored cards-only) still has no shots or saves', () => {
    const t = football.readTrack(OLD_FRIENDLY);
    assert.equal(t.shots, false);
    assert.equal(t.saves, false);
    assert.equal(football.init(OLD_FRIENDLY).track.shots, false);
  });
  test('D2: a saved match with no track keys keeps the full set', () => {
    for (const k of football.TRACK_KEYS) assert.equal(football.readTrack({})[k], k !== 'passes', k);
  });
  test('D7: Info lists Shots and Saves as captured on a new friendly, not on an old one', () => {
    const cfgNew = newMatch(fields);
    const capNew = matchCaptures(football.FOOTBALL_LIVE_SETTINGS as never, football.init(cfgNew), fields, cfgNew).captures;
    assert.equal(on(capNew, 'trackShots'), true);
    assert.equal(on(capNew, 'trackSaves'), true);
    const capOld = matchCaptures(football.FOOTBALL_LIVE_SETTINGS as never, football.init(OLD_FRIENDLY), fields, OLD_FRIENDLY).captures;
    assert.equal(on(capOld, 'trackShots'), false);
    assert.equal(on(capOld, 'trackSaves'), false);
  });
  test('D6: the Goal flow does not read shots / saves (Shot and Save stay extra buttons)', () => {
    const ui = src('src/sports/football/index.tsx');
    assert.match(ui, /shot: t\.shots,/);
    assert.match(ui, /save: t\.saves,/);
    // invasion batch 5: trackedKeys moved to actions.ts (footballTrackedKeys)
    assert.equal((ui.match(/t\.shots\b/g) ?? []).length, 1, 'only the button map');
    assert.equal((ui.match(/t\.saves\b/g) ?? []).length, 1, 'only the button map');
    assert.match(ui, /footballTrackedKeys\(t, deep\)/);
  });
});

const flag = (fields: FormatField[], key: string) => fields.find((f) => f.key === key);

describe('rugby union', () => {
  const fields = RUGBY_META.formatFields!;
  test('a new match (friendly or tournament) tracks penalties conceded', () => {
    assert.equal(flag(fields, 'trackPenalties')?.default, true);
    assert.equal(rugby.init(newMatch(fields)).trackPenalties, true);
    assert.equal(rugby.init(newMatch(fields, 'tournament')).trackPenalties, true);
    // no-false-zeros NZI11: switched on = offered; the key is tracked once a penalty is recorded
    assert.equal(rugby.trackedTallyKeys(rugby.init(newMatch(fields))).includes('penaltiesGivenAway'), false);
    assert.ok(rugby.trackedTallyKeys(rugby.init(newMatch(fields)), { type: 'tally', side: 'home', tally: 'penalty' }).includes('penaltiesGivenAway'));
  });
  test('only penalties: the other "Stats to track" stay off for a new match', () => {
    const s = rugby.init(newMatch(fields));
    // defaults-on DOI10: wave 3 turns the rest on too; possession & territory stays off
    for (const f of rugby.TRACK_FLAGS) assert.equal(s[f] === true, f !== 'trackPossession', f);
    assert.equal(s.trackDetail, true);
  });
  test('D3/D4: an old match (key absent or off) stays off, with no false zero', () => {
    for (const cfg of [{}, { trackPenalties: false }]) {
      const s = rugby.init(cfg);
      assert.equal('trackPenalties' in s, false);
      assert.equal(rugby.trackedTallyKeys(s).includes('penaltiesGivenAway'), false);
      assert.equal(rugby.RUGBY_LIVE_SETTINGS.read(s).trackPenalties, false);
    }
  });
  test('D7: Info lists penalties as captured on a new match, not on an old one', () => {
    const cfg = newMatch(fields);
    assert.equal(on(matchCaptures(rugby.RUGBY_LIVE_SETTINGS as never, rugby.init(cfg), fields, cfg).captures, 'trackPenalties'), true);
    assert.equal(on(matchCaptures(rugby.RUGBY_LIVE_SETTINGS as never, rugby.init({}), fields, {}).captures, 'trackPenalties'), false);
  });
  test('D10: still a switch in Match settings', () => {
    assert.ok(rugby.RUGBY_LIVE_SETTINGS.fields.some((f) => f.key === 'trackPenalties' && f.type === 'toggle'));
  });
});

describe('rugby league', () => {
  const fields = RUGBY_LEAGUE_META.formatFields!;
  test('a new match tracks errors & penalties conceded', () => {
    assert.equal(flag(fields, 'trackErrors')?.default, true);
    const s = league.init(newMatch(fields));
    assert.equal(s.trackErrors, true);
    // no-false-zeros NZI12: switched on = offered; each kind is tracked once one is recorded
    assert.deepEqual(league.trackedDetailKeys(s), []);
    assert.deepEqual(league.trackedDetailKeys(s, { type: 'detail', side: 'home', detail: 'error' }), ['handlingErrors']);
  });
  test('only errors: sets, defence and attack stay off for a new match', () => {
    const s = league.init(newMatch(fields));
    // defaults-on DOI10: wave 3 turns defence and attack on; six-tackle sets stay off
    for (const f of league.TRACK_FLAGS) assert.equal(s[f] === true, f !== 'trackSets', f);
  });
  test('D3/D4: an old match (key absent or off) stays off, with no false zero', () => {
    for (const cfg of [{}, { trackErrors: false }]) {
      const s = league.init(cfg);
      assert.equal('trackErrors' in s, false);
      assert.deepEqual(league.trackedDetailKeys(s), []);
      assert.equal(league.LEAGUE_LIVE_SETTINGS.read(s).trackErrors, false);
    }
  });
  test('D7: Info lists errors & penalties as captured on a new match, not on an old one', () => {
    const cfg = newMatch(fields);
    assert.equal(on(matchCaptures(league.LEAGUE_LIVE_SETTINGS as never, league.init(cfg), fields, cfg).captures, 'trackErrors'), true);
    assert.equal(on(matchCaptures(league.LEAGUE_LIVE_SETTINGS as never, league.init({}), fields, {}).captures, 'trackErrors'), false);
  });
  test('D6: the player step offers "Team (no name)" (optional)', () => {
    const ui = src('src/sports/rugby_league/index.tsx');
    assert.match(ui, /Who\? \(optional — tapping records it\)/);
    assert.match(ui, /skip=\{\{ label: 'Team \(no name\)', onPress: \(\) => setEnd\(flow\.how, null\) \}\}/);
  });
});

describe('old matches replay exactly as before', () => {
  test('D3: a union log replays the same with the key absent or off', () => {
    const log: ScoreAction[] = [
      { type: 'CLOCK', payload: { run: true, at: 1_000 } },
      { type: 'TRY', side: 'home', payload: { uid: 'u1', sec: 60, psec: 60, period: 1 } },
      { type: 'KICK', side: 'away', payload: { uid: 'u2', sec: 120, psec: 120, period: 1, kick: 'pen', made: true } },
    ];
    const run = (cfg: Record<string, unknown>) => log.reduce(rugby.reducer, rugby.init(cfg));
    assert.deepEqual(run({}), run({ trackPenalties: false }));
  });
  test('D5: Edit format leaves the stat toggles to Scoring settings and saves only changed keys', () => {
    const ls = src('src/screens/LiveScoringScreen.tsx');
    assert.match(ls, /\.\.\.liveOwnedKeys\(plugin\.liveSettings( as never)?\)/);
    assert.match(ls, /const changed = changedFormatKeys\(editFmtShown, editFmt\);/);
  });
  test('new-match forms stamp the defaults', () => {
    assert.match(src('src/screens/GuestGameScreen.tsx'), /defaultsFor\(fields\)/);
    assert.match(src('src/screens/ScheduleMatchScreen.tsx'), /defaultsFor\(getSportMeta\(s\)\.formatFields \?\? \[\]\)/);
  });
});
