/**
 * Round 2 (founder answers, 2026-10-22) — rugby union:
 *  - free kicks CREDIT A PLAYER (optional, like a penalty): `freeKicksConceded`,
 *    keyed once the match asked for the player (an older one-tap, team-only
 *    free kick never makes the key appear — no false 0 on old matches);
 *  - the possession bar's "Ball dead" switch (`BALL_DEAD`): possession and
 *    territory pause at stoppages until a team is tapped or "Ball live";
 *    the sheet notes the ball-in-play time it measured.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, eventCredits, creditAttribution, ballTime, ballDead, currentBall, deadSpans, freeKicksAsked, trackedTallyKeys, RUGBY_LIVE_SETTINGS, TALLY_KEYS,
  type RugbyEvent, type RugbyState, type Side, type TallyKind,
} from '../src/sports/rugby/engine.ts';
import { rugbyTotals, DERIVED_KEYS } from '../src/sports/rugby/totals.ts';
import { rugbyBox } from '../src/sports/rugby/box.ts';
import { rugbyStats } from '../src/sports/rugby/stats.ts';
import { rugbyUndoLabel } from '../src/sports/rugby/timeline.ts';
import { rugbySheet } from '../src/sports/rugby/sheet.ts';
import { sentence } from '../src/sports/rugby/commentary.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import type { StatSheet } from '../src/sports/compareSheet.ts';

const HOME = Array.from({ length: 15 }, (_, i) => `h${i + 1}`);
const AWAY = Array.from({ length: 15 }, (_, i) => `a${i + 1}`);
const nm = (id: string) => id.toUpperCase();
const NAMES = { home: 'Lions', away: 'Wolves' };
let u = 0;
function A(type: string, side: Side | undefined, sec: number, period: number, psec: number, ev: Partial<RugbyEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction {
  const cr = eventCredits({ type: ev.type ?? 'setpiece', ...ev } as RugbyEvent);
  const a: ScoreAction = { type, ...(side ? { side } : {}), payload: { ...payload, uid: `r${++u}`, sec, psec, period } };
  const a1 = creditAttribution(cr.first);
  if (a1) a.attribution = a1;
  return a;
}
type T = readonly [number, number, number];
const H1 = (min: number): T => [min * 60, 1, min * 60];
const H2 = (min: number, h1 = 2400): T => [h1 + (min - 40) * 60, 2, (min - 40) * 60];
const S1 = (sec: number): T => [sec, 1, sec];
const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: (team === 'home' ? HOME : AWAY).map((id) => ({ id, name: nm(id) })) } });
const tryA = (side: Side, t: T, scorer?: string) => A('TRY', side, ...t, { type: 'try', playerId: scorer, playerName: scorer && nm(scorer) });
const tally = (side: Side, t: T, kind: TallyKind, who?: string, extra: Record<string, unknown> = {}) =>
  A('TALLY', side, ...t, { type: 'tally', tally: kind, playerId: who, playerName: who && nm(who) }, { kind, ...extra });
/** a free kick as the round-2 controls record it: the player asked (named or Team) */
const fk = (side: Side, t: T, who?: string) => tally(side, t, 'freeKick', who, { asked: true });
const poss = (side: Side, t: T) => A('POSSESSION', side, ...t);
const terr = (side: Side, t: T) => A('TERRITORY', side, ...t);
const dead = (t: T, on = true) => A('BALL_DEAD', undefined, ...t, {}, { dead: on });
const endAt = (len: number): ScoreAction[] => [{ type: 'CLOCK', payload: { run: true, at: 1_000 } }, { type: 'END_PERIOD', payload: { at: 1_000 + len * 1000 } }];
const run = (acts: ScoreAction[], config?: Record<string, unknown>): RugbyState => acts.reduce(reducer, init(config));
const row = (sh: StatSheet, sec: string, key: string) => sh.sections.find((x) => x.key === sec)?.rows.find((r) => r.key === key);

/* ------------------------------- free kicks -------------------------------- */

describe('round 2 · free kicks credit a player (optional)', () => {
  const PEN = { trackPenalties: true };
  const log: ScoreAction[] = [
    xi('home'), xi('away'),
    fk('away', H1(5), 'a4'),
    fk('away', H1(9)), // "Team (no name)"
    fk('home', H1(12), 'h2'),
    tally('home', H1(15), 'penalty', 'h3', { infringement: 'offside' }),
    tryA('home', H1(20), 'h11'),
  ];
  test('the reducer keeps the player and the "asked" mark on free kicks only', () => {
    const s = run(log, PEN);
    const fks = s.events.filter((e) => e.tally === 'freeKick');
    assert.deepEqual(fks.map((e) => [e.side, e.playerId, e.asked]), [['away', 'a4', true], ['away', undefined, true], ['home', 'h2', true]]);
    const pen = run([tally('home', H1(1), 'penalty', 'h3', { asked: true })], PEN);
    assert.equal('asked' in pen.events[0], false, 'only a free kick carries it');
  });
  test('credits and keys: freeKicksConceded is a tally key; a team free kick credits nobody', () => {
    assert.ok((TALLY_KEYS as readonly string[]).includes('freeKicksConceded'));
    assert.deepEqual(eventCredits({ type: 'tally', tally: 'freeKick', playerId: 'a4', playerName: 'A4' }).first?.stats, { freeKicksConceded: 1 });
    assert.equal(eventCredits({ type: 'tally', tally: 'freeKick' }).first, undefined);
    const cr = eventCredits({ type: 'tally', tally: 'freeKick', playerId: 'a4', playerName: 'A4' });
    assert.deepEqual(creditAttribution(cr.first, -1), { playerId: 'a4', stat: 'freeKicksConceded', by: -1, playerName: 'A4' }, 'undo reverses it');
  });
  test('statTotals = live sums on every prefix; once asked, everyone reads 0', () => {
    const SPORT: TotalsSport<RugbyState> = { name: 'rugby round 2', init, reducer, statTotals: rugbyTotals, partial: false, derived: DERIVED_KEYS, config: PEN };
    const t = assertContract(SPORT, toRecords(log), { every: 1 });
    assert.deepEqual([t.a4.stats.freeKicksConceded, t.h2.stats.freeKicksConceded, t.h11.stats.freeKicksConceded], [1, 1, 0]);
    assert.equal(t.h3.stats.penaltiesGivenAway, 1);
  });
  test('old one-tap free kicks (team only, never asked): no key, no false 0 — even with penalties tracked', () => {
    const old = run([xi('home'), xi('away'), tally('away', H1(5), 'freeKick'), tally('home', H1(7), 'penalty', 'h3'), tryA('home', H1(20), 'h11')], PEN);
    assert.equal(freeKicksAsked(old), false);
    assert.deepEqual(trackedTallyKeys(old), ['penaltiesGivenAway']);
    for (const l of Object.values(rugbyTotals(old))) assert.equal('freeKicksConceded' in l.stats, false);
    const cols = buildBoxTable(rugbyStats, rugbyBox(old).data('all'), { scope: 'all' }).columns.map((c) => c.key);
    assert.ok(!cols.includes('freeKicksConceded'), 'no FKC column');
    assert.equal(row(rugbySheet(old), 'discipline', 'freeKicks')?.away, '1', 'the team count is unchanged');
  });
  test('a team-only free kick from the new flow still tracks the key (asked); the Team row carries it', () => {
    const s = run([xi('home'), xi('away'), fk('away', H1(9)), tryA('home', H1(20), 'h11')], PEN);
    assert.equal(freeKicksAsked(s), true);
    assert.equal(rugbyTotals(s).h11.stats.freeKicksConceded, 0);
    const d = rugbyBox(s).data('all');
    assert.equal(d.away.team?.stats.freeKicksConceded, 1);
    const table = buildBoxTable(rugbyStats, d, { scope: 'all' });
    assert.ok(table.columns.some((c) => c.abbr === 'FKC'));
  });
  test('a named free kick on an old-style event (player, no mark) also counts as asked', () => {
    assert.equal(freeKicksAsked({ events: [{ id: 'x', type: 'tally', tally: 'freeKick', side: 'home', sec: 1, psec: 1, period: 1, playerId: 'h1' }] }), true);
  });
  test('commentary names who conceded it; the team line is unchanged', () => {
    const e = (x: Partial<RugbyEvent>): RugbyEvent => ({ id: 'e', type: 'tally', side: 'home', sec: 60, psec: 60, period: 1, ...x } as RugbyEvent);
    const s = run([]);
    assert.equal(sentence(s, e({ tally: 'freeKick', playerName: 'H4' }), NAMES)!.text, 'Free kick against Lions — conceded by H4.');
    assert.equal(sentence(s, e({ tally: 'freeKick' }), NAMES)!.text, 'Free kick against Lions.');
  });
  test('schema: a keyed discipline stat with a box column; the career row hides when untracked', () => {
    assert.deepEqual(validateSchema(rugbyStats), []);
    const def = rugbyStats.stats.find((x) => x.key === 'freeKicksConceded')!;
    assert.deepEqual([def.coverage, def.abbr, def.format?.better], ['keyed', 'FKC', 'lower']);
    const line = (stats: Record<string, number>, i: number) => ({ id: `l${i}`, playerId: 'p', matchId: `m${i}`, sport: 'rugby', stats } as unknown as StatLine);
    const rows = careerSections(rugbyStats, [line({ points: 5, tries: 1, freeKicksConceded: 2 }, 1)]).flatMap((x) => x.rows);
    assert.equal(rows.find((r) => r.key === 'freeKicksConceded')?.value, '2');
    const none = careerSections(rugbyStats, [line({ points: 5, tries: 1 }, 1)]).flatMap((x) => x.rows);
    assert.ok(!none.some((r) => r.key === 'freeKicksConceded'));
  });
  test('live settings hint says the free kick asks for the player', () => {
    const f = RUGBY_LIVE_SETTINGS.fields.find((x) => x.key === 'trackPenalties');
    assert.match(String(f?.hint), /Free kick button: the player \(optional\)/);
  });
});

/* ------------------------------- ball dead --------------------------------- */

describe('round 2 · "Ball dead" pauses possession and territory', () => {
  const ON = { trackPossession: true };
  // H1 (40 min): Lions have it from 0', ball dead 10'–15' (Wolves restart), dead again 20'–25', "Ball live" with Wolves
  const base: ScoreAction[] = [
    poss('home', S1(0)), terr('home', S1(0)),
    dead(S1(600)), poss('away', S1(900)),
    terr('away', S1(1000)),
    dead(S1(1200)), dead(S1(1300)), // the second tap changes nothing
    dead(S1(1500), false), // "Ball live": back with Wolves
  ];
  test('the switch: no-op before anyone has the ball, after it is already dead / live, and after full time', () => {
    assert.equal('ball' in run([dead(S1(10))], ON), false, 'nobody has the ball yet');
    const s = run(base, ON);
    assert.equal(s.ball?.filter((m) => m.dead).length, 2);
    assert.equal(s.ball?.length, 7, '2 + dead + Wolves + terr + dead + live');
    assert.equal(ballDead(s), false);
    assert.equal(currentBall(s, 'poss'), 'away');
    const live = run([poss('home', S1(0)), dead(S1(5), false)], ON);
    assert.equal(live.ball?.length, 1, '"Ball live" when it is live changes nothing');
    const ended = run([poss('home', S1(0)), ...endAt(2400), ...endAt(2400), dead(S1(4900))], ON);
    assert.equal(ended.ended, true);
    assert.equal(ended.ball?.length, 1);
  });
  test('while dead: who had it is remembered; tapping that same team brings it back to life', () => {
    const s = run([poss('home', S1(0)), dead(S1(60))], ON);
    assert.equal(ballDead(s), true);
    assert.equal(currentBall(s, 'poss'), 'home');
    const back = reducer(s, poss('home', S1(90)));
    assert.equal(ballDead(back), false);
    assert.equal(back.ball?.length, 3);
    const same = reducer(back, poss('home', S1(100)));
    assert.equal(same.ball?.length, 3, 'live: the same team again is still no switch');
  });
  test('dead spans and the clocks: possession and territory both lose them (playing clock)', () => {
    const s = run([...base, ...endAt(2400)], ON);
    assert.deepEqual(deadSpans(s, 2400), [[600, 900], [1200, 1500]]);
    // possession: Lions 0–600, Wolves 900–1200 + 1500–2400
    assert.deepEqual(ballTime(s, 'poss'), { home: 600, away: 1200, from: 0 });
    // territory: Lions 0–1000 less 600–900 = 700; Wolves 1000–2400 less 1200–1500 = 1100
    assert.deepEqual(ballTime(s, 'terr'), { home: 700, away: 1100, from: 0 });
    const sh = rugbySheet(s);
    assert.deepEqual([row(sh, 'possession', 'possession')?.home, row(sh, 'possession', 'possession')?.away], ['33%', '67%']);
    assert.equal(sh.sections.find((x) => x.key === 'possession')?.note,
      'Time on the playing clock from the scorer\'s taps. Ball in play 30:00 — "Ball dead" spells left out.');
  });
  test('live: a dead spell still open runs to now and counts for nobody', () => {
    const s = run([poss('home', S1(0)), dead(S1(300))], ON);
    assert.deepEqual(deadSpans(s, 420), [[300, 420]]);
    assert.deepEqual(ballTime(s, 'poss', 'all', 420), { home: 300, away: 0, from: 0 });
  });
  test('across half-time: a spell left on at the break holds until the next tap; per-half scopes clip it', () => {
    const s = run([poss('home', S1(0)), dead(S1(2300)), ...endAt(2400), poss('away', H2(42)), ...endAt(2400)], ON);
    assert.deepEqual(deadSpans(s, 4800), [[2300, 2520]]);
    assert.deepEqual(ballTime(s, 'poss', 1), { home: 2300, away: 0, from: 0 });
    assert.deepEqual(ballTime(s, 'poss', 2), { home: 0, away: 2280, from: 2400 });
    const h2 = rugbySheet(s, 2).sections.find((x) => x.key === 'possession')?.note ?? '';
    assert.match(h2, /Ball in play 38:00/);
  });
  test('without "Ball dead" nothing changes: same times, the old note', () => {
    const s = run([poss('home', S1(0)), poss('away', S1(600)), ...endAt(2400)], ON);
    assert.deepEqual(deadSpans(s, 2400), []);
    assert.deepEqual(ballTime(s, 'poss'), { home: 600, away: 1800, from: 0 });
    assert.equal(rugbySheet(s).sections.find((x) => x.key === 'possession')?.note, "Time on the playing clock from the scorer's taps.");
  });
  test('Undo names it; it never writes an event or a stat', () => {
    const prev = run([poss('home', S1(0))], ON);
    const next = reducer(prev, dead(S1(60)));
    assert.equal(rugbyUndoLabel({ type: 'BALL_DEAD', prev, next }), 'ball dead / live switch');
    assert.equal(next.events.length, 0);
    assert.deepEqual(rugbyTotals(next), {});
  });
  test('live settings hint mentions the switch', () => {
    const f = RUGBY_LIVE_SETTINGS.fields.find((x) => x.key === 'trackPossession');
    assert.match(String(f?.hint), /Ball dead/);
  });
});
