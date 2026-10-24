/**
 * Rugby league (`rugby_league`: 13s, junior presets, Nines) — IRL Laws,
 * NRL / Super League competition rules:
 *  - scoring: try 4, conversion 2, penalty goal 2, field goal 1 (2 from 40 m
 *    with the NRL option), penalty try 4 THEN the conversion, Nines bonus try
 *    zone (5);
 *  - the clock: halves counting up, play on after the siren ("80+1'"), golden
 *    point (2 × 5 then a draw / until someone scores; golden try);
 *  - sin bin (10' on the playing clock, across half-time), send-off (short for
 *    good), on report; interchanges (limit, HIA free, a player may return);
 *  - six-tackle sets: the tackle count, endings, auto handover on the 6th,
 *    completion rate, tackles per set, possession on the playing clock;
 *  - statTotals (SD-19 harness), box score, stats sheet, commentary, timeline,
 *    ticker, undo label, voice, discipline, standings, walkover, match
 *    format, match records, game flow, match safety;
 *  - REPLAY: the 2015 NRL Grand Final (Brisbane 16–17 North Queensland,
 *    golden point), a Nines match with golden try, a sin-bin / send-off match.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  init, reducer, isComplete, result, clockAt, minuteText, periodName, periodLong, eventCredits, creditAttribution, matchSec, triesOf, nextPlan,
  interchangesUsed, openTemps, sinBinsOf, walkSets, currentSet, tracked, trackedDetailKeys, teamFigures, pointsOf, leagueStandingsUnits,
  LEAGUE_PRESETS, LEAGUE_LIVE_SETTINGS, DETAIL_STATS,
  type LeagueEvent, type LeagueState, type Side, type KickKind,
} from '../src/sports/rugby_league/engine.ts';
import { setFigures, completionText, setLine } from '../src/sports/rugby_league/sets.ts';
import { leagueTotals, leagueLiveField, DERIVED_KEYS } from '../src/sports/rugby_league/totals.ts';
import { leagueBox } from '../src/sports/rugby_league/box.ts';
import { rugbyLeagueStats } from '../src/sports/rugby_league/stats.ts';
import { leagueSheet, sinBinTime } from '../src/sports/rugby_league/sheet.ts';
import { leagueCommentary, sentence, LEAGUE_FEED_TAGS, leagueScopeLabel } from '../src/sports/rugby_league/commentary.ts';
import { leagueTimeline, leagueUndoLabel, describeEvent } from '../src/sports/rugby_league/timeline.ts';
import { leagueTickerDetail, leagueTickerFlash } from '../src/sports/rugby_league/ticker.ts';
import { leagueVoice, leagueVoiceEnds, leagueLast } from '../src/sports/rugby_league/voice.ts';
import { RUGBY_LEAGUE_DISCIPLINE } from '../src/sports/rugby_league/discipline.ts';
import { leagueMatchRecords } from '../src/sports/rugby_league/records.ts';
import { filterFeed, feedTags } from '../src/sports/feedGroups.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { careerFromSchema, validateSchema } from '../src/sports/statSchema.ts';
import { matchBoxSource } from '../src/sports/boxSources.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { FLOW_CONTROLS } from '../src/core/matchSafety.ts';
import { MATCH_RECORD_HOOKS } from '../src/sports/matchRecordHooks.ts';
import { MATCH_RECORD_TYPES } from '../src/sports/matchRecords.ts';
import { gameFlowFor, GAME_FLOW_SPORTS } from '../src/sports/gameFlow.ts';
import { FIELD_RULES } from '../src/sports/onField.ts';
import { DISCIPLINE_SPECS, readSportRule, sportDisciplineTable } from '../src/sports/discipline.ts';
import { walkoverRuleFor, forfeitFor, WALKOVER_SCORE_SPORTS } from '../src/data/walkover.ts';
import { KO_DECIDER, stageAwareFormat, hasDecider } from '../src/data/matchFormat.ts';
import { lineContext } from '../src/data/lineContext.ts';
import {
  teamStandings, standingsConfigFromFormat, standingsPresets, matchPoints, NEW_TOURNAMENT_POINTS, setStandingsUnitsProvider,
  setStandingsPointsProvider, setStandingsScoreProvider, categoryLeaders,
} from '../src/data/standings.ts';
import { tableColumns } from '../src/data/standingsColumns.ts';
import { assertContract, assertSameAsClean, amendRecord, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction, VoiceContext } from '../src/sports/types.ts';
import { replayLog } from '../src/sports/amend.ts';
import type { Match, Player, SportId, StatLine } from '../src/core/types.ts';
import type { StatSheet } from '../src/sports/compareSheet.ts';
import type { NameOf } from '../src/core/playerNames.ts';

/* ---------------------------------- helpers --------------------------------- */

let u = 0;
/** One action as the controls fire it: playing second, period second, period,
 *  a stable uid; credits from `eventCredits`. */
function A(type: string, side: Side | undefined, t: T, ev: Partial<LeagueEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'sub', ...ev });
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `u${++u}`, sec: t[0], psec: t[2], period: t[1] } };
  const a1 = creditAttribution(cr.first);
  const a2 = creditAttribution(cr.second);
  if (a1) a.attribution = a1;
  if (a2) a.attribution2 = a2;
  return a;
}
type T = readonly [number, number, number];
/** H1 at mm:ss; H2 at match minute mm:ss (first half played `h1` seconds); golden point `gp` seconds in. */
const H1 = (min: number, s = 0): T => [min * 60 + s, 1, min * 60 + s];
const H2 = (min: number, s = 0, h1 = 2400): T => [h1 + (min - 40) * 60 + s, 2, (min - 40) * 60 + s];
const GP = (psec: number, before: number, period = 3): T => [before + psec, period, psec];
const tryA = (side: Side, t: T, scorer?: string, assist?: string, extra: Record<string, unknown> = {}) =>
  A('TRY', side, t, { type: 'try', bonus: extra.bonus === true, playerId: scorer, playerName: scorer && nm(scorer), secondId: assist, secondName: assist && nm(assist) }, extra);
const kickA = (side: Side, t: T, kick: KickKind, made: boolean, kicker?: string, two = false) =>
  A('KICK', side, t, { type: 'kick', kick, made, two, playerId: kicker, playerName: kicker && nm(kicker) }, { kick, made, ...(two ? { two: true } : {}) });
const sanA = (side: Side, t: T, sanction: 'sinBin' | 'sendOff' | 'report', who: string) =>
  A('SANCTION', side, t, { type: 'sanction', sanction, playerId: who, playerName: nm(who) }, { sanction });
const subA = (side: Side, t: T, off: string, on: string, extra: Record<string, unknown> = {}) =>
  A('SUB', side, t, {}, { offId: off, offName: nm(off), onId: on, onName: nm(on), ...extra });
const detailA = (side: Side, t: T, detail: LeagueEvent['detail'], who?: string) =>
  A('DETAIL', side, t, { type: 'detail', detail, playerId: who, playerName: who && nm(who) }, { detail });
const ballA = (side: Side, t: T) => A('SET_BALL', side, t);
const tackleA = (t: T) => A('TACKLE', undefined, t);
const endA = (t: T, how: string, detail?: { kind: 'error' | 'penalty'; who?: string }) =>
  A('SET_END', undefined, t, detail ? { type: 'detail', detail: detail.kind, playerId: detail.who, playerName: detail.who && nm(detail.who) } : {}, { how, ...(detail ? { detail: detail.kind } : {}) });
/** End the period at exactly `len` seconds (the clock run that long). */
const endAt = (len: number): ScoreAction[] => [{ type: 'CLOCK', payload: { run: true, at: 1_000 } }, { type: 'END_PERIOD', payload: { at: 1_000 + len * 1000 } }];
const run = (acts: ScoreAction[], config?: Record<string, unknown>): LeagueState => acts.reduce(reducer, init(config));
const row = (sh: StatSheet, sec: string, key: string) => sh.sections.find((x) => x.key === sec)?.rows.find((r) => r.key === key);

/* --------------------------- the 2015 NRL Grand Final --------------------------- */

/**
 * 2015 NRL Grand Final, ANZ Stadium, 4 Oct 2015: Brisbane Broncos 16 – 17
 * North Queensland Cowboys (golden point). Half-time 14–12 to Brisbane;
 * 16–16 at full time after Kyle Feldt's try on the siren (from Michael
 * Morgan's pass) and Johnathan Thurston's conversion hitting the post; then
 * Thurston's field goal in golden point (83').
 * Totals verified: Brisbane 2 tries (Oates, Reed) + 4/4 goals (Parker 2,
 * Kahu 2 — 2 conversions, 2 penalty goals); North Queensland 3 tries
 * (O'Neill, Tamou, Feldt) + Thurston 2/3 conversions + 1 field goal.
 * SEQUENCE APPROXIMATE (minutes from match reports; the half lengths after
 * the siren are invented): Parker pen 6', Oates try 7' (Parker conv 9'),
 * O'Neill try 10' (Thurston conv 12'), Tamou try 24' (conv 26'), Reed try
 * 34' (Kahu conv 35'), Kahu pen 43', Feldt try 80' (conv missed), Thurston
 * field goal 83'. Only Feldt's assist (Morgan) is recorded.
 */
const NAMES: Record<string, string> = {
  parker: 'Corey Parker', oates: 'Corey Oates', reed: 'Jack Reed', kahu: 'Jordan Kahu',
  thurston: 'Johnathan Thurston', oneill: "Justin O'Neill", tamou: 'James Tamou', feldt: 'Kyle Feldt', morgan: 'Michael Morgan',
};
function nm(id: string): string { return NAMES[id] ?? id.toUpperCase(); }
/** IDs-only scoring: the state keeps ids; the viewer's names come from a lookup */
const VIEWER: NameOf = (id, legacy) => (id ? nm(id) : (legacy ?? '').trim() || 'Player');
const H1LEN = 2430; // the first half ran 30 s past the siren (invented)
const H2LEN = 2460; // Feldt's try on the siren, then the conversion
const GF_CONFIG = { preset: 'senior', ...LEAGUE_PRESETS.senior.set, decider: 'gpFinal' };
const GF: ScoreAction[] = [
  kickA('home', H1(6), 'pen', true, 'parker'),
  tryA('home', H1(7), 'oates'), kickA('home', H1(9), 'conv', true, 'parker'),
  tryA('away', H1(10), 'oneill'), kickA('away', H1(12), 'conv', true, 'thurston'),
  tryA('away', H1(24), 'tamou'), kickA('away', H1(26), 'conv', true, 'thurston'),
  tryA('home', H1(34), 'reed'), kickA('home', H1(35), 'conv', true, 'kahu'),
  ...endAt(H1LEN),
  kickA('home', H2(43, 0, H1LEN), 'pen', true, 'kahu'),
  tryA('away', H2(80, 0, H1LEN), 'feldt', 'morgan'),
  kickA('away', H2(80, 55, H1LEN), 'conv', false, 'thurston'),
  ...endAt(H2LEN),
  { type: 'CLOCK', payload: { run: true, at: 1_000 } },
  { ...kickA('away', GP(150, H1LEN + H2LEN), 'fg', true, 'thurston'), payload: { ...kickA('away', GP(150, H1LEN + H2LEN), 'fg', true, 'thurston').payload, at: 151_000 } },
];

describe('replay · 2015 NRL Grand Final (Brisbane 16–17 North Queensland, golden point)', () => {
  const s = run(GF, GF_CONFIG);
  test('half-time 14–12, full time 16–16, golden point 16–17', () => {
    assert.deepEqual([teamFigures(s, 'home', 1).points, teamFigures(s, 'away', 1).points], [14, 12]);
    const ft = run(GF.slice(0, -2), GF_CONFIG);
    assert.deepEqual([ft.home, ft.away], [16, 16]);
    assert.equal(ft.ended, false, 'level: golden point');
    assert.deepEqual(ft.plan, ['reg', 'reg', 'gp', 'gp']);
    assert.equal(periodName(ft, 3), 'GP1');
    assert.ok(s.ended && isComplete(s));
    assert.deepEqual(result(s), { winner: 'away', home: 16, away: 17 });
    assert.deepEqual(triesOf(s), { home: 2, away: 3 });
  });
  test('goals: Brisbane 4/4, North Queensland 2/3 + a field goal', () => {
    const h = teamFigures(s, 'home'), a = teamFigures(s, 'away');
    assert.deepEqual([h.conversions, h.conversionAttempts, h.penGoals, h.penGoalAttempts], [2, 2, 2, 2]);
    assert.deepEqual([a.conversions, a.conversionAttempts, a.fieldGoals, a.fieldGoalAttempts], [2, 3, 1, 1]);
  });
  test('the minutes: the try on the siren 80\', its conversion after it, the field goal 83\'', () => {
    const feldt = s.events.find((e) => e.playerId === 'feldt')!;
    const conv = s.events.find((e) => e.type === 'kick' && e.kick === 'conv' && !e.made)!;
    const fg = s.events.find((e) => e.kick === 'fg')!;
    assert.equal(minuteText(s, feldt.period, feldt.psec), "80'");
    assert.equal(minuteText(s, conv.period, conv.psec), "80+1'");
    assert.equal(clockAt(s, conv.period, conv.psec), '80:00 +0:55');
    assert.equal(minuteText(s, fg.period, fg.psec), "83'");
    assert.deepEqual(s.played, [H1LEN, H2LEN, 150]);
  });
  test('player totals (statTotals contract, every undo prefix)', () => {
    const t = assertContract(SPORT, toRecords(GF), { every: 1 });
    assert.equal(t.thurston.stats.points, 5);
    assert.deepEqual([t.thurston.stats.conversions, t.thurston.stats.conversionAttempts, t.thurston.stats.dropFieldGoals], [2, 3, 1]);
    assert.deepEqual([t.parker.stats.points, t.parker.stats.penGoals, t.parker.stats.conversions], [4, 1, 1]);
    assert.deepEqual([t.kahu.stats.points, t.kahu.stats.penGoals, t.kahu.stats.conversions], [4, 1, 1]);
    for (const id of ['oates', 'reed', 'oneill', 'tamou', 'feldt']) assert.deepEqual([t[id].stats.tries, t[id].stats.points], [1, 4], id);
    assert.equal(t.morgan.stats.tryAssists, 1);
    assert.equal('tackles' in t.thurston.stats, false, 'detail never tracked: no false 0');
  });
  test('commentary: grouped by half and golden point, the running score, the result line', () => {
    const g = leagueCommentary(s, { home: 'Broncos', away: 'Cowboys' }, VIEWER);
    assert.deepEqual(g.map((x) => x.title), ['Golden point · 1st · first score wins', '2nd half', '1st half']);
    assert.equal(g[0].lines[0].text, 'Full time — Cowboys win it in golden point: Broncos 16–17 Cowboys.');
    assert.equal(g[0].lines[1].text, 'FIELD GOAL! Johnathan Thurston slots a one-pointer for Cowboys.');
    assert.equal(g[0].lines[1].score, '16–17');
    assert.ok(g[1].lines.some((l) => l.text === 'End of normal time — Broncos 16–16 Cowboys. Level: golden point extra time follows.'));
    assert.ok(g[1].lines.some((l) => l.text === 'TRY! Kyle Feldt scores for Cowboys, assisted by Michael Morgan.' && l.score === '16–16' && l.when === "80'"));
    assert.equal(g[2].lines[0].text, 'Half-time — Broncos 14–12 Cowboys.');
    assert.equal(g[2].sub, 'Points 14–12 · Tries 2–2');
  });
  test('match stats: scoring, field goals, points by half (golden point included)', () => {
    const sh = leagueSheet(s);
    assert.deepEqual(sh.sections.map((x) => x.key), ['scoring', 'discipline', 'byPeriod']);
    assert.equal(row(sh, 'scoring', 'conversions')?.away, '2/3 (67%)');
    assert.equal(row(sh, 'scoring', 'fieldGoals')?.away, '1/1 (100%)');
    assert.equal(row(sh, 'scoring', 'goalKicking')?.home, '4/4 (100%)');
    assert.deepEqual(sh.sections.find((x) => x.key === 'byPeriod')!.rows.map((r) => [r.label, r.home, r.away]),
      [['1st half', '14', '12'], ['2nd half', '2', '4'], ['Golden point', '0', '1']]);
    assert.equal(row(leagueSheet(s, 3), 'scoring', 'points')?.away, '1');
  });
  test('game flow: 3 lead changes, tied twice; records; timeline; ticker', () => {
    const f = gameFlowFor('rugby_league', s)!;
    assert.equal(f.unit, 'points'); assert.equal(f.leadChanges, 3); assert.equal(f.timesTied, 2);
    const b = leagueMatchRecords(s)!;
    const types = new Set(MATCH_RECORD_TYPES.rugby_league!.map((x) => x.key));
    for (const it of b.items) assert.ok(types.has(it.type), it.type);
    assert.equal(b.items.find((i) => i.type === 'mostGoals')?.value, 33);
    assert.equal(b.items.find((i) => i.type === 'fastestTry')?.text, "7'");
    const rows = leagueTimeline(s, VIEWER);
    assert.equal(rows.filter((r) => r.label === 'Try').length, 5);
    assert.ok(rows.some((r) => r.stamp === "83'" && r.label === 'Field goal good'));
    const tk = leagueTickerDetail(s, { player: VIEWER });
    assert.equal(tk.right![0], '🏉 Justin O. · James T. · Kyle F.');
    assert.match(leagueTickerFlash(run(GF.slice(0, -1), GF_CONFIG), s, VIEWER)!.text, /^FIELD GOAL! .* 83'$/);
  });
});

/* -------------------------------- scoring rules -------------------------------- */

describe('scoring: try 4, conversion 2, penalty goal 2, field goal 1; penalty try + conversion', () => {
  test('values and credits', () => {
    const s = run([tryA('home', H1(3), 'h1', 'h2'), kickA('home', H1(4), 'conv', true, 'h7'), kickA('away', H1(10), 'pen', true, 'a7'),
      kickA('away', H1(20), 'fg', true, 'a6'), kickA('home', H1(25), 'fg', false, 'h7')]);
    assert.deepEqual([s.home, s.away], [6, 3]);
    assert.deepEqual(eventCredits(s.events[0]).first?.stats, { points: 4, tries: 1 });
    assert.deepEqual(eventCredits(s.events[3]).first?.stats, { points: 1, dropFieldGoals: 1, dropFieldGoalAttempts: 1 });
    assert.deepEqual(eventCredits(s.events[4]).first?.stats, { dropFieldGoalAttempts: 1 });
  });
  test('a penalty try is 4 to the team, and its conversion is still taken', () => {
    const s = run([A('PENALTY_TRY', 'away', H1(30)), kickA('away', H1(31), 'conv', true, 'a7')]);
    assert.deepEqual([s.away, pointsOf(s.events[0])], [6, 4]);
    assert.deepEqual(eventCredits(s.events[0]), {});
    assert.equal(teamFigures(s, 'away').penaltyTries, 1);
    assert.equal(describeEvent(s.events[0]).label, 'Penalty try (4)');
    assert.match(sentence(s, s.events[0], { home: 'A', away: 'B' }).text, /conversion is taken from in front/);
  });
  test('the NRL two-point field goal: only with the option on', () => {
    const on = run([kickA('home', H1(30), 'fg', true, 'h7', true)], { fg2: true });
    assert.equal(on.home, 2); assert.equal(on.events[0].two, true);
    assert.deepEqual(eventCredits(on.events[0]).first?.stats, { points: 2, dropFieldGoals: 1, dropFieldGoalAttempts: 1 });
    assert.equal(describeEvent(on.events[0]).label, '2-point field goal good');
    const off = run([kickA('home', H1(30), 'fg', true, 'h7', true)]);
    assert.equal(off.home, 1, 'option off: a field goal is 1');
    assert.equal(row(leagueSheet(on), 'scoring', 'twoPointFieldGoals')?.home, '1');
  });
  test('the bonus try zone (Nines option): 5 points', () => {
    const on = run([tryA('home', H1(2), 'h1', undefined, { bonus: true })], { bonusTry: true });
    assert.equal(on.home, 5);
    assert.deepEqual(eventCredits(on.events[0]).first?.stats, { points: 5, tries: 1 });
    assert.equal(run([tryA('home', H1(2), 'h1', undefined, { bonus: true })]).home, 4, 'option off');
  });
});

/* ------------------------------ golden point ------------------------------ */

describe('golden point', () => {
  const level = [tryA('home', H1(5), 'h1'), tryA('away', H1(9), 'a1'), ...endAt(2400), ...endAt(2400)];
  test('none: the draw stands', () => {
    const s = run(level);
    assert.ok(isComplete(s)); assert.equal(result(s)?.winner, 'draw');
  });
  test('2 × 5 then the draw stands (regular season)', () => {
    let s = run(level, { decider: 'gp' });
    assert.deepEqual(s.plan, ['reg', 'reg', 'gp', 'gp']); assert.equal(s.ended, false);
    s = [...endAt(300), ...endAt(300)].reduce(reducer, s);
    assert.ok(s.ended); assert.equal(result(s)?.winner, 'draw');
    assert.deepEqual(nextPlan({ plan: ['reg', 'reg', 'gp', 'gp'], decider: 'gp' }), []);
  });
  test('finals: 5-minute periods until someone scores; any score wins at once', () => {
    let s = run(level, { decider: 'gpFinal' });
    s = [...endAt(300), ...endAt(300)].reduce(reducer, s);
    assert.equal(s.ended, false); assert.equal(periodName(s, 5), 'GP3');
    s = reducer(reducer(s, { type: 'CLOCK', payload: { run: true, at: 1 } }), kickA('away', GP(40, 5400, 5), 'pen', false, 'a7'));
    assert.equal(s.ended, false, 'a miss is no score');
    s = reducer(s, { ...kickA('away', GP(60, 5400, 5), 'pen', true, 'a7'), payload: { ...kickA('away', GP(60, 5400, 5), 'pen', true, 'a7').payload, at: 61_000 } });
    assert.ok(s.ended); assert.equal(result(s)?.winner, 'away');
    assert.match(periodLong(s, 5), /^Golden point · period 3/);
  });
  test('a try in golden point ends it (no conversion)', () => {
    let s = run(level, { decider: 'gp' });
    s = reducer(reducer(s, { type: 'CLOCK', payload: { run: true, at: 1 } }), tryA('home', GP(30, 4800), 'h2'));
    assert.ok(s.ended); assert.equal(s.home, 8);
    assert.equal(reducer(s, kickA('home', GP(40, 4800), 'conv', true, 'h7')).home, 8, 'nothing after the end');
  });
  test('the voice "full time" only when it really is', () => {
    const s = run(level, { decider: 'gp' });
    assert.equal(leagueLast(s), false);
  });
});

/* ----------------------------------- Nines ----------------------------------- */

describe('replay · Nines: 9 a side, 2 × 9, sin bin 3, unlimited interchange, golden try', () => {
  const cfg = { preset: 'nines', ...LEAGUE_PRESETS.nines.set, decider: 'gp', goldenTry: true, bonusTry: true };
  const NINE_H = Array.from({ length: 9 }, (_, i) => `h${i + 1}`), NINE_A = Array.from({ length: 9 }, (_, i) => `a${i + 1}`);
  const xi9 = (team: Side) => ({ type: 'XI', payload: { team, players: (team === 'home' ? NINE_H : NINE_A).map((id) => ({ id, name: nm(id) })) } });
  const N2 = (min: number, s = 0): T => [540 + (min - 9) * 60 + s, 2, (min - 9) * 60 + s];
  const NINES: ScoreAction[] = [
    xi9('home'), xi9('away'),
    tryA('home', H1(3), 'h2', 'h6', { bonus: true }), kickA('home', H1(3, 40), 'conv', true, 'h6'),
    sanA('away', H1(6), 'sinBin', 'a4'),
    ...endAt(540),
    tryA('away', N2(12), 'a2', undefined, { bonus: true }), kickA('away', N2(12, 40), 'conv', true, 'a6'),
    subA('home', N2(14), 'h8', 'h10'), subA('home', N2(16), 'h10', 'h8'),
    ...endAt(540),
    { type: 'CLOCK', payload: { run: true, at: 1 } },
    kickA('home', GP(60, 1080), 'fg', true, 'h6'),
    { ...tryA('away', GP(120, 1080), 'a3'), payload: { ...tryA('away', GP(120, 1080), 'a3').payload, at: 121_000 } },
  ];
  test('the preset', () => {
    const s = init(cfg);
    assert.deepEqual([s.variant, s.playersPerSide, s.periodMinutes, s.sinBinMinutes, s.maxInterchanges, s.setTackles], ['9s', 9, 9, 3, 0, 6]);
  });
  test('a field goal doesn\'t end golden TRY extra time; the try does', () => {
    const s = run(NINES, cfg);
    const afterFg = run(NINES.slice(0, -1), cfg);
    assert.equal(afterFg.ended, false); assert.deepEqual([afterFg.home, afterFg.away], [8, 7]);
    assert.ok(s.ended); assert.deepEqual(result(s), { winner: 'away', home: 8, away: 11 });
    assert.equal(minuteText(s, 2, 180), "12'");
    assert.equal(minuteText(s, 3, 60), "19'");
    assert.match(periodLong(s, 3), /first try wins/);
    const g = leagueCommentary(s, { home: 'Lions', away: 'Wolves' }, VIEWER);
    assert.equal(g[0].lines[0].text, 'Full time — Wolves win it in golden try: Lions 8–11 Wolves.');
  });
  test('sin bin 3 minutes on the playing clock; interchanges unlimited and a player comes back', () => {
    const s = run(NINES.slice(0, 5), cfg);
    const live = run([...NINES.slice(0, 5), { type: 'CLOCK', payload: { run: true, at: 1_000 } }, { type: 'SET_CLOCK', payload: { periodSec: 8 * 60, at: 1_000 } }], cfg);
    const lf = leagueLiveField(live, 1_000);
    assert.equal(lf.suspended[0]?.left, '1:00'); assert.equal(lf.short.away, 1);
    assert.equal(s.sinBinMinutes, 3);
    const full = run(NINES, cfg);
    assert.equal(interchangesUsed(full, 'home'), 2);
    const t = leagueTotals(full);
    assert.equal(t.h8.stats.minutes, Math.round((1080 + 120 - 120) / 60), 'off 2 minutes, back on');
    assert.equal(t.h2.stats.points, 5, 'bonus-zone try');
  });
});

/* ---------------------------- sin bin, send-off ---------------------------- */

describe('replay · sin bin, send-off, on report, interchanges (13s)', () => {
  const HOME = Array.from({ length: 13 }, (_, i) => `h${i + 1}`), AWAY = Array.from({ length: 13 }, (_, i) => `a${i + 1}`);
  const xi = (team: Side) => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id, name: nm(id) })) } });
  const MATCH: ScoreAction[] = [
    xi('home'), xi('away'),
    sanA('home', H1(35), 'sinBin', 'h5'),
    tryA('away', H1(37), 'a2'),
    ...endAt(2400),
    sanA('away', H2(50), 'sendOff', 'a3'),
    sanA('away', H2(52), 'report', 'a9'),
    subA('home', H2(55), 'h8', 'h14'),
    subA('home', H2(60), 'h1', 'h15', { temp: 'hia' }),
    subA('home', H2(65), 'h15', 'h1', { back: true }),
    subA('home', H2(70), 'h14', 'h8'),
    ...endAt(2400),
  ];
  const s = run(MATCH);
  test('the sin bin runs across half-time on playing time', () => {
    const h2 = run([...MATCH.slice(0, 6), { type: 'CLOCK', payload: { run: true, at: 5_000 } }]);
    assert.equal(leagueLiveField(h2, 5_000 + 4 * 60_000).suspended[0]?.left, '1:00');
    assert.equal(leagueLiveField(h2, 5_000 + 6 * 60_000).short.home, 0);
    assert.equal(sinBinTime(s, 'home'), 600);
    assert.equal(sinBinTime(s, 'home', 1), 300);
  });
  test('a send-off: short for the rest of the match, not replaced; on report changes nothing', () => {
    const at75 = run([...MATCH.slice(0, -2), { type: 'CLOCK', payload: { run: true, at: 1 } }, { type: 'SET_CLOCK', payload: { periodSec: 35 * 60, at: 1 } }]);
    assert.equal(leagueLiveField(at75, 1).short.away, 1);
    const t = leagueTotals(s);
    assert.equal(t.a3.stats.minutes, 50); assert.equal(t.a3.stats.sendOffs, 1);
    assert.equal(t.h5.stats.minutes, 70); assert.equal(t.h5.stats.sinBins, 1);
    assert.equal(t.a9.stats.minutes, 80);
    assert.equal(sinBinsOf(s, 'home', { id: 'h5' }), 1);
    const sh = leagueSheet(s);
    assert.deepEqual([row(sh, 'discipline', 'sinBins')?.home, row(sh, 'discipline', 'sendOffs')?.away, row(sh, 'discipline', 'onReport')?.away], ['1', '1', '1']);
    assert.equal(row(sh, 'discipline', 'sinBin')?.home, '10:00');
  });
  test('interchanges: the limit counts, HIA is free, an interchanged player comes back', () => {
    assert.equal(interchangesUsed(s, 'home'), 2);
    assert.equal(openTemps(s, 'home').length, 0);
    assert.equal(openTemps(run(MATCH.slice(0, 10)), 'home').length, 1);
    const t = leagueTotals(s);
    assert.equal(t.h8.stats.minutes, 55 + 10); assert.equal(t.h14.stats.minutes, 15);
    assert.equal(row(leagueSheet(s), 'interchanges', 'interchanges')?.label, 'Interchanges used (of 8)');
  });
  test('discipline table: sin bins (cautions), report, send-off = 1 match by default', () => {
    assert.equal(DISCIPLINE_SPECS.rugby_league, RUGBY_LEAGUE_DISCIPLINE);
    assert.deepEqual(readSportRule(RUGBY_LEAGUE_DISCIPLINE, {}).bans, { banSendOff: 1 });
    assert.deepEqual(RUGBY_LEAGUE_DISCIPLINE.marks({ state: s } as never).map((m) => m.col), ['sinBin', 'sendOff', 'report']);
    const m = { id: 'm1', sport: 'rugby_league', status: 'completed', startsAt: '2026-10-01', homeTeam: { id: 'H', name: 'H' }, awayTeam: { id: 'W', name: 'W' }, state: s, score: { home: 0, away: 4 } } as unknown as Match;
    const tbl = sportDisciplineTable('rugby_league', [m as never], {})!;
    assert.ok(tbl.rows.some((r) => r.counts.sendOff === 1));
  });
  test('statTotals contract (every undo prefix); minutes are derived', () => {
    assertContract(SPORT, toRecords(MATCH), { every: 1 });
    assert.deepEqual([...DERIVED_KEYS], ['minutes']);
  });
});

/* ------------------------------ six-tackle sets ------------------------------ */

/** A first half on the tackle count (secs = H1 seconds; see the test for the sums). */
const S = (sec: number): T => [sec, 1, sec];
const SETS: ScoreAction[] = [
  ballA('home', S(10)), ...[20, 30, 40, 50, 60].map((x) => tackleA(S(x))), endA(S(70), 'kick'), // home: 5 tackles, kick (complete) — away ball
  tackleA(S(80)), tackleA(S(90)), endA(S(100), 'error', { kind: 'error', who: 'a7' }), // away: 2, error by a7 (incomplete) — home ball
  ...[110, 120, 130, 140, 150, 160].map((x) => tackleA(S(x))), // home: the 6th tackle hands over (incomplete)
  tackleA(S(170)), endA(S(180), 'restart'), // away: 1, six again (complete) — a fresh away set
  tackleA(S(190)), tackleA(S(200)), tackleA(S(210)), tryA('away', S(220), 'a1'), kickA('away', S(230), 'conv', true, 'a9'), // away: 3, try (complete)
  ballA('home', S(300)), tackleA(S(310)), endA(S(320), 'penalty', { kind: 'penalty' }), // home: 1, penalty against (Team) — away ball
  kickA('away', S(330), 'pen', true, 'a9'), // the away set had no tackle: a kick at goal, no set played
  ...endAt(600),
];
const SET_CFG = { trackSets: true, trackErrors: true };

describe('six-tackle sets', () => {
  const s = run(SETS, SET_CFG);
  test('the sets: endings, auto handover on the 6th, a score ends a set, a 0-tackle set before a kick at goal is dropped', () => {
    const { sets, open } = walkSets(s);
    assert.equal(open, null);
    assert.deepEqual(sets.map((x) => [x.side, x.tackles, x.end]), [
      ['home', 5, 'kick'], ['away', 2, 'error'], ['home', 6, 'sixth'], ['away', 1, 'restart'], ['away', 3, 'score'], ['home', 1, 'penalty'],
    ]);
  });
  test('figures: completion, tackles per set, possession on the playing clock', () => {
    const h = setFigures(s, 'home'), a = setFigures(s, 'away');
    assert.deepEqual([h.sets, h.completed, h.decided, h.tackles, h.time], [3, 1, 3, 12, 140]);
    assert.deepEqual([a.sets, a.completed, a.decided, a.tackles, a.time], [3, 2, 3, 6, 90]);
    assert.equal(completionText(a), '2/3 (67%)');
    const sh = leagueSheet(s);
    assert.equal(row(sh, 'sets', 'completion')?.home, '1/3 (33%)');
    assert.equal(row(sh, 'sets', 'tacklesPerSet')?.home, '4.0');
    assert.deepEqual([row(sh, 'sets', 'possession')?.home, row(sh, 'sets', 'possession')?.away], ['61%', '39%']);
    assert.equal(row(sh, 'sets', 'end:sixth')?.home, '1');
    assert.equal(row(sh, 'sets', 'end:restart')?.away, '1');
  });
  test('the live line, the tackle count, the 6th tackle', () => {
    const mid = run(SETS.slice(0, 4), SET_CFG);
    assert.equal(setLine(mid, { home: 'Lions', away: 'Wolves' }), 'Tackle 3 · Lions in possession');
    assert.equal(currentSet(run(SETS.slice(0, 15), SET_CFG))?.side, 'home', 'five tackles: still theirs');
    assert.equal(currentSet(run(SETS.slice(0, 16), SET_CFG))?.side, 'away', 'handed over on the 6th');
    assert.equal(run([tackleA(S(5))], SET_CFG).setLog, undefined, 'no tackle before anyone has the ball');
    assert.equal(run([ballA('home', S(5)), ballA('home', S(6))], SET_CFG).setLog?.length, 1, 'a tap on the side with the ball changes nothing');
  });
  test('an error / penalty tap credits the player (or the Team) once', () => {
    const t = leagueTotals(s);
    assert.equal(t.a7.stats.handlingErrors, 1);
    assert.equal(t.a1.stats.penaltiesGivenAway, 0, 'tracked: reads 0');
    const d = leagueBox(s).data('all');
    assert.equal(d.home.team?.stats.penaltiesGivenAway, 1);
    assert.deepEqual([d.home.teamStats?.sets, d.home.teamStats?.completedSets], [3, 1]);
    const g = leagueCommentary(s, { home: 'Lions', away: 'Wolves' }, VIEWER);
    const lines = g.flatMap((x) => x.lines);
    assert.ok(lines.some((l) => l.text === 'Error (A7) — Wolves lose the ball on tackle 2. Lions ball.'));
    assert.ok(lines.some((l) => l.text === 'Lions are tackled on the last — handover to Wolves.'));
    assert.ok(!lines.some((l) => l.text === 'Error by A7 (Wolves).'), 'told once, with its set');
    assert.equal(g[0].sub, 'Points 0–8 · Tries 0–1 · Completions 1/3 – 2/3');
  });
  test('removing the try re-opens its set (it then ends untagged when the ball changes hands)', () => {
    const tr = s.events.find((e) => e.type === 'try')!;
    const fixed = reducer(s, { type: 'REMOVE_EVENT', side: tr.side, payload: { id: tr.id } });
    assert.equal(fixed.away, 4);
    assert.deepEqual(walkSets(fixed).sets.map((x) => x.end), ['kick', 'error', 'sixth', 'restart', 'other', 'penalty']);
    assert.deepEqual([setFigures(fixed, 'away').completed, setFigures(fixed, 'away').decided], [1, 2]);
  });
  test('statTotals contract with set taps (every undo prefix)', () => {
    assertContract({ ...SPORT, config: SET_CFG }, toRecords(SETS), { every: 1 });
  });
  test('the end of a half ends the set running', () => {
    const x = run([ballA('home', S(10)), tackleA(S(20)), ...endAt(600)], SET_CFG);
    assert.deepEqual(walkSets(x).sets.map((y) => [y.end, y.to]), [['period', 600]]);
    assert.equal(setFigures(x, 'home').decided, 0, 'not counted for the completion rate');
  });
  test('undo labels', () => {
    assert.equal(leagueUndoLabel({ type: 'TACKLE', prev: s, next: s }), 'tackle');
    assert.equal(leagueUndoLabel({ type: 'SET_BALL', prev: s, next: s }), 'possession');
    assert.equal(leagueUndoLabel({ type: 'SET_END', prev: s, next: s }), 'set ending');
  });
});

/* ------------------------- tracked detail (no false 0) ------------------------- */

describe('Stats to track: off by default, keyed', () => {
  test('nothing tracked: no flags, no detail keys, no columns, no sections', () => {
    const s = run(GF, GF_CONFIG);
    for (const f of ['trackSets', 'trackDefence', 'trackAttack', 'trackErrors', 'setLog'] as const) assert.equal(f in s, false, f);
    for (const l of Object.values(leagueTotals(s))) for (const k of DETAIL_STATS) assert.equal(k in l.stats, false, k);
    const cols = buildBoxTable(rugbyLeagueStats, leagueBox(s).data('all'), { scope: 'all' }).columns.map((c) => c.abbr);
    assert.deepEqual(cols, ['T', 'C', 'PG', 'FG', 'PTS', 'TA', 'SB', 'SO']);
  });
  test('each toggle owns its keys (a defence-only match never shows runs or errors)', () => {
    const s = run([detailA('home', H1(1), 'tackle', 'h4'), detailA('home', H1(2), 'missedTackle', 'h5'), tryA('away', H1(3), 'a2')], { trackDefence: true });
    assert.deepEqual(trackedDetailKeys(s), ['tackles', 'missedTackles']);
    const t = assertContract({ ...SPORT, config: { trackDefence: true } }, toRecords([detailA('home', H1(1), 'tackle', 'h4'), detailA('home', H1(2), 'missedTackle', 'h5'), tryA('away', H1(3), 'a2')]), { every: 1 });
    assert.equal(t.a2.stats.tackles, 0); assert.equal('carries' in t.a2.stats, false); assert.equal('handlingErrors' in t.a2.stats, false);
    assert.deepEqual(leagueSheet(s).sections.map((x) => x.key), ['scoring', 'defence', 'discipline']);
    assert.equal(row(leagueSheet(s), 'defence', 'tackleSuccess')?.home, '1/2 (50%)');
    assert.equal(tracked(s, 'trackAttack'), false);
    // a recorded event tracks its group even with the toggle off (as union's detail does)
    assert.equal(tracked(run([detailA('home', H1(1), 'offload', 'h4')]), 'trackAttack'), true);
  });
  test('live settings: config mode, the four toggles, off by default', () => {
    assert.equal(LEAGUE_LIVE_SETTINGS.mode, 'config');
    assert.deepEqual(LEAGUE_LIVE_SETTINGS.read(init({ trackSets: true })), { periodMinutes: 40, sinBinMinutes: 10, trackSets: true, trackDefence: false, trackAttack: false, trackErrors: false });
  });
});

/* -------------------------------- statTotals -------------------------------- */

const SPORT: TotalsSport<LeagueState> = { name: 'rugby_league', init, reducer, statTotals: leagueTotals, partial: false, derived: DERIVED_KEYS, config: GF_CONFIG };

describe('statTotals: corrections', () => {
  test('a live correction (REMOVE_EVENT, reversed credits) = the match scored cleanly', () => {
    const wrong = tryA('home', H1(7), 'reed');
    const live = [GF[0], wrong];
    const ev = run(live, GF_CONFIG).events.at(-1)!;
    const cr = eventCredits(ev);
    const fix: ScoreAction = { type: 'REMOVE_EVENT', side: ev.side, payload: { id: ev.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) };
    const corrected = toRecords([...live, fix, ...GF.slice(1)]);
    assertContract(SPORT, corrected, { every: 1000, label: 'live remove' });
    assertSameAsClean(SPORT, corrected, toRecords(GF));
  });
  test('an AMEND (#05) re-credits the kicker', () => {
    const recs = toRecords(GF);
    const k = recs.find((r) => r.type === 'KICK' && r.attribution?.playerId === 'thurston' && (r.payload as { kick?: string }).kick === 'fg')!;
    const action = { type: k.type, side: k.side!, payload: k.payload!, attribution: { ...k.attribution!, playerId: 'morgan', playerName: 'Michael Morgan' } };
    const corrected = [...recs, amendRecord(recs, [{ op: 'replace', seq: k.seq, action }])];
    assertContract(SPORT, corrected, { every: 1000, label: 'AMEND' });
    const t = leagueTotals(replayLog({ createInitialState: init, reducer }, GF_CONFIG, corrected));
    assert.equal(t.morgan.stats.dropFieldGoals, 1); assert.equal(t.thurston.stats.dropFieldGoals, 0);
  });
});

/* ------------------------------------ box ------------------------------------ */

describe('box score', () => {
  test('a penalty try lands on the Team row; totals equal the score; per half', () => {
    const s = run([tryA('home', H1(5), 'h11', 'h7'), kickA('home', H1(6), 'conv', true, 'h7'), A('PENALTY_TRY', 'home', H1(30)), kickA('home', H1(31), 'conv', true, 'h7'),
      kickA('away', H1(35), 'pen', true, 'a7'), ...endAt(2400), tryA('away', H2(60), 'a2'), ...endAt(2400)]);
    assert.ok(matchBoxSource('rugby_league' as SportId, s));
    const d = leagueBox(s, { nameOf: VIEWER }).data('all');
    const sum = (sd: Side, k: string) => d[sd].rows.reduce((a, r) => a + (r.stats[k] ?? 0), 0) + (d[sd].team?.stats[k] ?? 0);
    assert.deepEqual([sum('home', 'points'), sum('away', 'points')], [s.home, s.away]);
    assert.deepEqual([s.home, s.away], [12, 6]);
    assert.equal(d.home.team?.stats.points, 4); assert.equal(d.home.team?.label, 'Team (penalty tries)');
    const table = buildBoxTable(rugbyLeagueStats, d, { scope: 'all' });
    const cols = table.columns.map((c) => c.abbr);
    assert.equal(table.home.totals[cols.indexOf('PTS')], '12');
    assert.equal(table.home.rows.find((r) => r.name === 'H7')!.cells[cols.indexOf('C')], '2-2');
    assert.equal(leagueBox(s).data(2).away.rows.reduce((a, r) => a + (r.stats.points ?? 0), 0), 4);
  });
});

/* ------------------------------ schema & career ------------------------------ */

describe('schema, career, leaders', () => {
  test('valid, registered; sin-bins share football\'s key and labels; send-offs are permanent', () => {
    assert.deepEqual(validateSchema(rugbyLeagueStats), []);
    assert.equal(STAT_SCHEMAS.rugby_league, rugbyLeagueStats);
    assert.equal(STAT_SCHEMAS.football.stats.find((x) => x.key === 'sinBins')?.label, rugbyLeagueStats.stats.find((x) => x.key === 'sinBins')?.label);
    assert.equal(rugbyLeagueStats.stats.find((x) => x.key === 'sendOffs')?.suspension?.permanent, true);
    assert.equal(rugbyLeagueStats.stats.find((x) => x.key === 'dropFieldGoals')?.label, 'Field goals (drop goals)');
  });
  test('career: goal-kicking %; leaders', () => {
    const lines: StatLine[] = [];
    for (const [mid, st] of [['m1', run(GF, GF_CONFIG)], ['m2', run([kickA('away', H1(3), 'pen', true, 'thurston'), kickA('away', H1(4), 'conv', false, 'thurston'), ...endAt(2400), ...endAt(2400)])]] as [string, LeagueState][]) {
      for (const [pid, t] of Object.entries(leagueTotals(st))) lines.push({ id: `${mid}-${pid}`, matchId: mid, playerId: pid, sport: 'rugby_league', stats: t.stats, won: false } as StatLine);
    }
    const c = careerFromSchema(rugbyLeagueStats, lines.filter((l) => l.playerId === 'thurston'));
    const v = (sec: string, k: string) => c[sec]?.find((r) => r.key === k)?.value;
    assert.equal(v('scoring', 'points'), '7');
    assert.equal(v('kicking', 'conversionPct'), '50%');
    const players: Player[] = Object.keys(NAMES).map((id) => ({ id, fullName: NAMES[id], sports: ['rugby_league'] } as Player));
    const cats = categoryLeaders(lines, players, 'rugby_league' as SportId);
    assert.equal(cats[0].key, 'points');
    assert.deepEqual(cats[0].leaders.slice(0, 1).map((l) => [l.name, l.value]), [['Johnathan Thurston', 7]]);
  });
});

/* ------------------------------ standings & format ------------------------------ */

let mn = 0;
function M(h: string, a: string, st: LeagueState): Match {
  const r = result(st)!;
  return {
    id: `rl${++mn}`, sport: 'rugby_league', status: 'completed', startsAt: '', score: { home: r.home, away: r.away }, winner: r.winner,
    homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, state: st,
  } as unknown as Match;
}
const played = (hp: number, ap: number): LeagueState => run([
  ...Array.from({ length: hp }, (_, i) => kickA('home', H1(1 + i), 'pen', true, 'h7')),
  ...Array.from({ length: ap }, (_, i) => kickA('away', H1(20 + i), 'pen', true, 'a7')),
  ...endAt(2400), ...endAt(2400),
]);

describe('standings (NRL ladder), walkover, match format', () => {
  setStandingsPointsProvider(null); setStandingsScoreProvider(null);
  setStandingsUnitsProvider((sport, state) => (sport === 'rugby_league' ? leagueStandingsUnits(state as LeagueState) : null));
  test('2 a win, 1 a draw; ties on points difference, then points scored', () => {
    assert.deepEqual(standingsPresets('rugby_league').map((p) => p.id), ['nrl', 'simple']);
    assert.equal(NEW_TOURNAMENT_POINTS.rugby_league?.winPoints, 2);
    const cfg = standingsConfigFromFormat('rugby_league' as SportId, standingsPresets('rugby_league')[0].set);
    assert.deepEqual(matchPoints(M('A', 'B', played(2, 1)), cfg), { home: 2, away: 0 });
    assert.deepEqual(matchPoints(M('A', 'B', played(1, 1)), cfg), { home: 1, away: 1 });
    const t = teamStandings([M('A', 'C', played(3, 0)), M('B', 'C', played(2, 0)), M('A', 'B', played(0, 1)), M('C', 'D', played(1, 1))], 'rugby_league' as SportId, cfg);
    assert.deepEqual(t.slice(0, 2).map((r) => [r.teamId, r.points, r.diff]), [['B', 4, 6], ['A', 2, 4]]);
    assert.deepEqual(tableColumns('rugby_league', cfg, 'team', t).columns.map((c) => c.label), ['P', 'W', 'D', 'L', 'PF', 'PA', '±', 'Pts']);
  });
  test('walkover 24-0 (verify)', () => {
    assert.equal(walkoverRuleFor('rugby_league')?.win, 24);
    assert.ok(WALKOVER_SCORE_SPORTS.includes('rugby_league'));
    assert.ok(forfeitFor({ sport: 'rugby_league', kind: 'walkover', winner: 'home' }));
  });
  test('finals resolve by golden point until a score; league games keep 2 × 5 or none', () => {
    assert.equal(KO_DECIDER.rugby_league, 'gpFinal'); assert.ok(hasDecider('rugby_league'));
    assert.equal(stageAwareFormat({ decider: 'gp' }, 'rugby_league', true).decider, 'gpFinal');
    assert.equal(stageAwareFormat({}, 'rugby_league', true).decider, 'gpFinal');
    assert.equal(stageAwareFormat({ decider: 'gpFinal' }, 'rugby_league', false).decider, 'gp');
    assert.equal(stageAwareFormat({ decider: 'gp' }, 'rugby_league', false).decider, 'gp');
    assert.equal(stageAwareFormat({}, 'rugby_league', false).decider, 'none');
  });
  test('career splits by format: 13s · 2 × 40 / Nines · 2 × 9', () => {
    const m = (st: LeagueState) => ({ id: `f${++mn}`, sport: 'rugby_league', status: 'completed', startsAt: '2026-10-01', homeTeam: { id: 'H', name: 'H' }, awayTeam: { id: 'A', name: 'A' }, state: st } as unknown as Match);
    const line = (mt: Match) => ({ id: 'l', matchId: mt.id, playerId: 'p', sport: 'rugby_league', stats: {}, won: false } as StatLine);
    const m13 = m(init()), m9 = m(init({ variant: '9s' }));
    assert.equal(lineContext(line(m13), m13, undefined).format?.label, '13s · 2 × 40');
    assert.equal(lineContext(line(m9), m9, undefined).format?.label, 'Nines · 2 × 9');
  });
});

/* ------------------------------------ voice ------------------------------------ */

const SUR_H = ['Rao', 'Khan', 'Nair', 'Iyer', 'Das', 'Pillai', 'Sen', 'Bose', 'Gill', 'Shah', 'Mehta', 'Joshi', 'Roy'];
const SUR_A = ['Smith', 'Jones', 'Brown', 'Taylor', 'Wilson', 'Evans', 'Thomas', 'Walker', 'White', 'Hughes', 'Green', 'Hall', 'Wood'];
const roster = (side: 'h' | 'a', sur: string[]): Player[] => sur.map((x, i) => ({ id: `${side}${i + 1}`, fullName: `${['Asha', 'Meera', 'Ravi', 'Kiran', 'Dev'][i % 5]} ${x}`, jerseyNo: i + 1, sports: ['rugby_league'] } as Player));
const HR = roster('h', SUR_H), AR = roster('a', SUR_A);
const ctxOf = (s: LeagueState): VoiceContext => ({ state: s, homeName: 'Lions', awayName: 'Wolves', homeRoster: HR, awayRoster: AR, now: 1_000 + 600_000 });

describe('voice', () => {
  const live = (cfg?: Record<string, unknown>) => reducer(init(cfg), { type: 'CLOCK', payload: { run: true, at: 1_000 } });
  test('try with assist, conversion to the last try\'s side, kicks, field goals, sin bin, send-off', () => {
    const s = live({ fg2: true });
    const t = leagueVoice('try Rao assist Khan', ctxOf(s))!;
    assert.equal(t[0].type, 'TRY'); assert.equal(t[0].attribution?.playerId, 'h1'); assert.equal(t[0].attribution2?.playerId, 'h2');
    const s2 = reducer(s, t[0]);
    const c = leagueVoice('conversion good Iyer', ctxOf(s2))!;
    assert.equal(c[0].side, 'home'); assert.equal(c[0].payload?.made, true); assert.equal(c[0].attribution?.playerId, 'h4');
    assert.equal(leagueVoice('conversion missed', ctxOf(s2))![0].payload?.made, false);
    assert.equal(leagueVoice('penalty goal Smith', ctxOf(s2))![0].payload?.kick, 'pen');
    const fg = leagueVoice('field goal Sen', ctxOf(s2))!;
    assert.deepEqual([fg[0].payload?.kick, fg[0].payload?.two, fg[0].attribution?.extra?.points ?? fg[0].attribution?.by], ['fg', undefined, 1]);
    const fg2 = leagueVoice('two point field goal Sen', ctxOf(s2))!;
    assert.equal(fg2[0].payload?.two, true); assert.equal(fg2[0].attribution?.playerId, 'h7');
    assert.equal(leagueVoice('drop goal missed Khan', ctxOf(s2))![0].payload?.made, false);
    assert.equal(leagueVoice('penalty try away', ctxOf(s2))![0].type, 'PENALTY_TRY');
    assert.equal(leagueVoice('sin bin Nair', ctxOf(s2))![0].payload?.sanction, 'sinBin');
    assert.equal(leagueVoice('send off Smith', ctxOf(s2))![0].payload?.sanction, 'sendOff');
    assert.equal(leagueVoice('on report Smith', ctxOf(s2))![0].payload?.sanction, 'report');
  });
  test('set commands only with a set running', () => {
    const s = live({ trackSets: true });
    assert.equal(leagueVoice('tackle', ctxOf(s)), null);
    const s2 = reducer(s, ballA('home', S(5)));
    assert.equal(leagueVoice('tackle', ctxOf(s2))![0].type, 'TACKLE');
    assert.equal(leagueVoice('six again', ctxOf(s2))![0].payload?.how, 'restart');
    assert.equal(leagueVoice('knock on', ctxOf(s2))![0].payload?.how, 'error');
  });
  test('ends ask first: end half; full time only when it is', () => {
    const s = live();
    assert.equal(leagueVoiceEnds(leagueVoice('end half', ctxOf(s))!, s)?.action, 'endPeriod');
    assert.equal(leagueVoice('full time', ctxOf(s)), null);
    const h2 = reducer(endAt(2400).reduce(reducer, init()), { type: 'CLOCK', payload: { run: true, at: 1_000 } });
    assert.equal(leagueVoiceEnds(leagueVoice('full time', ctxOf(h2))!, h2)?.action, 'fullTime');
  });
});

/* ------------------------------ registries & safety ------------------------------ */

describe('registries, feed tags, safety', () => {
  test('flow controls, field rules, game flow, records hook', () => {
    assert.deepEqual(FLOW_CONTROLS.rugby_league, ['endPeriod', 'fullTime']);
    assert.equal(FIELD_RULES.rugby_league.sinBin.minutes, 10);
    assert.ok((GAME_FLOW_SPORTS as readonly string[]).includes('rugby_league'));
    assert.equal(MATCH_RECORD_HOOKS.rugby_league, leagueMatchRecords);
  });
  test('feed filters: key moments, scores, scope labels', () => {
    const s = run(GF, GF_CONFIG);
    const g = leagueCommentary(s, { home: 'Broncos', away: 'Cowboys' }, VIEWER);
    assert.deepEqual(feedTags(g, LEAGUE_FEED_TAGS).map((t) => t.key), ['key', 'score']);
    assert.equal(filterFeed(g, { scope: 3 }).length, 1);
    assert.equal(filterFeed(g, { tag: 'score' }).flatMap((x) => x.lines).length, 13);
    assert.deepEqual([1, 2, 3].map(leagueScopeLabel(s)), ['H1', 'H2', 'GP1']);
  });
  test('scoring controls: period / full time through the ConfirmSheet; nothing dispatches END from a tap', () => {
    const src = readFileSync(new URL('../src/sports/rugby_league/index.tsx', import.meta.url), 'utf8');
    assert.ok(!/onPress=\{\(\) => dispatch\(\{ type: '(END|END_PERIOD)'/.test(src));
    assert.ok(/confirmMatchAction\('fullTime'/.test(src) && /confirmMatchAction\('endPeriod'/.test(src));
    assert.equal(matchSec(run(GF.slice(0, -2), GF_CONFIG)), H1LEN + H2LEN);
  });
});
