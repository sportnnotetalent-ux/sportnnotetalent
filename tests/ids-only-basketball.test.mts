/**
 * IDs-only scoring guard (docs/privacy/ids-only-scoring.md) — basketball.
 *
 * Match state (`matches.state`) and events (`match_events` attribution /
 * payload) are public, logged out included. A realistic game scripted the way
 * the scorer's controls build it (the builders in basketball/actions.ts —
 * starting fives, made / missed 2s and 3s with zones and assists, free
 * throws, rebounds, steals, blocks, turnovers, fouls with who drew them, a
 * disqualification, subs, time-outs, a fast-break tag, a timeline removal —
 * plus the voice parser), with players whose full names are distinctive:
 *   1. no full name (nor a distinctive part of one) in the reduced state or
 *      in any action's attribution / attribution2 / payload;
 *   2. the timeline / commentary, the box score, the team-stats panel, game
 *      flow, records, discipline marks, undo labels and the overlay ticker,
 *      given a `nameOf` that maps ids to initials, show the initials — never
 *      a full name, even with full-name squads passed alongside.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { nameInitials, type NameOf } from '../src/core/playerNames.ts';
import * as bb from '../src/sports/basketball/engine.ts';
import {
  ejectAction, foulAction, freeThrowAction, lineupAction, missAction, reboundAction, removeAction, scoreAction, statAction, subAction, timeoutAction,
} from '../src/sports/basketball/actions.ts';
import { basketballVoice } from '../src/sports/voiceParsers.ts';
import { basketballFeed, describePlay } from '../src/sports/basketball/commentary.ts';
import { basketballBox } from '../src/sports/boxSources.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { gameFlowFor } from '../src/sports/gameFlow.ts';
import { basketballStatTotals, shotsTracked } from '../src/sports/basketball/totals.ts';
import { basketballMatchRecords } from '../src/sports/basketball/records.ts';
import { BASKETBALL_DISCIPLINE } from '../src/sports/basketball/discipline.ts';
import { basketballPanel } from '../src/sports/basketball/panel.ts';
import { boxField } from '../src/sports/basketball/fieldTime.ts';
import { BB_EVENT_NAME_KEYS, BB_PAYLOAD_NAME_KEYS, playId, playerOf } from '../src/sports/basketball/names.ts';
import { withRosters } from '../src/sports/racketNames.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import { buildTicker } from '../src/sports/ticker.ts';
import { subsCameOn } from '../src/data/appearances.ts';

type Side = 'home' | 'away';
const P = (id: string, fullName: string) => ({ id, fullName } as Player);
const HOME = [
  P('h1', 'Zebedee Quartermaine'), P('h2', 'Philomena Ravenscroft'), P('h3', 'Octavius Pemberton'),
  P('h4', 'Isadora Thistlewood'), P('h5', 'Leopold Ashcombe'), P('h6', 'Wilhelmina Blackwood'), P('h7', 'Cornelius Featherstonehaugh'),
];
const AWAY = [
  P('a1', 'Bartholomew Wigglesworth'), P('a2', 'Clementine Fairweather'), P('a3', 'Montgomery Bramblecote'),
  P('a4', 'Prudence Hollingsworth'), P('a5', 'Ignatius Cobblestone'), P('a6', 'Rosalind Merriweather'), P('a7', 'Barnaby Thornbury'),
];
const EVERYONE = [...HOME, ...AWAY];
const SECRETS = EVERYONE.flatMap((p) => [p.fullName, ...p.fullName.split(' ')]);
const INITIALS: Record<string, string> = Object.fromEntries(EVERYONE.map((p) => [p.id, nameInitials(p.fullName)]));
const viewer: NameOf = (id, legacy) => (id && INITIALS[id]) || (legacy ?? '').trim() || 'Player';
const [Z, PH, OC, IS, LE, WI, CO] = HOME;
const [BA, CL, MO, PR, IG, RO, BB] = AWAY;
const NAMES = { home: 'Lions', away: 'Tigers' };

function assertNoNames(what: string, value: unknown) {
  const json = JSON.stringify(value) ?? '';
  for (const s of SECRETS) assert.ok(!json.includes(s), `${what} must not contain "${s}": ${json.slice(0, 400)}`);
}

const CONFIG = {
  regPeriods: 4, periodMinutes: 10, foulsToFoulOut: 5, foulsForBonus: 4, techIsTeamFoul: true, otFoulsCarry: true,
  timeoutRule: 'fiba', gameClock: true, trackMisses: true, trackZones: true, trackFastBreak: true, trackFoulsDrawn: true,
};

/** The game, as the controls dispatch it (index.tsx `fire`: every play
 *  stamped with its quarter, minute and clock second, and `v: 2`). */
function scriptedGame() {
  let s = bb.init(CONFIG);
  let sec = 0;
  const actions: ScoreAction[] = [];
  const steps: Array<{ type: string; prev: unknown; next: unknown }> = [];
  const apply = (a: ScoreAction) => {
    const prev = s;
    s = bb.reducer(s, a);
    actions.push(a);
    steps.push({ type: a.type, prev, next: s });
  };
  // a live play: stamped like `fire` does
  const go = (...as: ScoreAction[]) => {
    for (const a of as) {
      sec += 17;
      apply({ ...a, payload: { ...a.payload, quarter: s.quarter, minute: Math.floor(sec / 60), sec, at: 1_000 + sec * 1000, v: 2 } });
    }
  };
  // set-up steps the controls dispatch unstamped (the five, tip-off, the clock, a tag)
  const raw = (...as: ScoreAction[]) => as.forEach(apply);
  const ctx = () => ({ state: s, homeName: NAMES.home, awayName: NAMES.away, homeRoster: HOME, awayRoster: AWAY });
  const fga = { fga: true, fbt: true };

  raw(lineupAction('home', HOME.slice(0, 5)), lineupAction('away', AWAY.slice(0, 5)));
  raw({ type: 'KICKOFF', payload: { at: 1_000 } });
  // Q1
  go(scoreAction('home', 3, Z, { ...fga, zone: 'c3' }), statAction('home', 'ASSIST', PH));
  go(missAction('away', 2, BA, 'mid'), reboundAction('home', OC, 'def'));
  go(statAction('away', 'STEAL', CL), scoreAction('away', 2, CL, { ...fga, zone: 'paint' }));
  raw({ type: 'TAG', side: 'away', payload: { fb: true } });
  go(missAction('home', 3, IS, 'ab3'), reboundAction('home', LE, 'off'), scoreAction('home', 2, LE, { ...fga, zone: 'paint' }));
  go(foulAction('away', MO, 'shooting', { fdt: true, drawnBy: LE }), freeThrowAction('home', true, LE));
  go(statAction('home', 'TURNOVER', OC), statAction('away', 'BLOCK', PR), scoreAction('away', 3, IG, { ...fga, zone: 'ab3' }));
  go(timeoutAction('home'));
  go(subAction('home', LE, WI), subAction('away', MO, RO));
  go(foulAction('home', Z, 'personal', { fdt: true, drawnBy: BA }), freeThrowAction('away', true, BA), freeThrowAction('away', false, BA));
  // voice: "three Zebedee", "rebound Bartholomew", "foul Clementine"
  go(...basketballVoice('three Zebedee', ctx())!, ...basketballVoice('rebound Bartholomew', ctx())!, ...basketballVoice('foul Clementine', ctx())!);
  raw({ type: 'NEXT_QUARTER' });
  raw({ type: 'CLOCK', payload: { run: true, at: 5_000_000 } });
  // Q2: a disqualifying foul → the ejection the rules force; a bench player scores
  go(foulAction('away', PR, 'disqualifying', { fdt: true }), ejectAction('away', PR, 'D'));
  go(freeThrowAction('home', true, WI), freeThrowAction('home', true, WI));
  go(scoreAction('home', 2, WI, { ...fga, zone: 'mid' }), statAction('home', 'ASSIST', IS), missAction('away', 3, RO, 'c3'));
  go(scoreAction('home', 2, undefined, { ...fga }), timeoutAction('away'), subAction('home', OC, CO));
  // the timeline's Remove: the last miss, reversed by id
  const last = [...s.events].reverse().find((e) => e.type === 'miss')!;
  raw(removeAction(last, playId(s, last), { halfCourt: false, tracked: shotsTracked(s) }));
  go(scoreAction('home', 3, CO, { ...fga, zone: 'c3' }));
  raw({ type: 'END', payload: { at: 9_000_000 } });
  return { state: s, actions, steps };
}

describe('IDs-only · basketball', () => {
  const m = scriptedGame();
  const s = m.state;

  test('state and every action carry ids only', () => {
    assertNoNames('basketball state', s);
    for (const a of m.actions) {
      assertNoNames(`${a.type} attribution`, a.attribution ?? null);
      assertNoNames(`${a.type} attribution2`, a.attribution2 ?? null);
      assertNoNames(`${a.type} payload`, a.payload ?? null);
      assert.equal(a.attribution?.playerName, undefined);
      for (const k of BB_PAYLOAD_NAME_KEYS) assert.ok(!(k in (a.payload ?? {})), `${a.type} payload has no ${k}`);
      if (a.type === 'SET_LINEUP') assert.ok(!('home' in a.payload!) && !('away' in a.payload!), 'the five by id (pids), not name arrays');
    }
    // no public name → id map, no name-keyed court; the five by id
    assert.equal(s.ids, undefined);
    assert.equal(s.onCourt, undefined);
    assert.deepEqual(s.court, { home: ['h1', 'h2', 'h3', 'h4', 'h5'], away: ['a1', 'a2', 'a3', 'a4', 'a5'] });
    assert.ok(s.events.every((e) => BB_EVENT_NAME_KEYS.every((k) => e[k] === undefined)), 'no name on any play');
    assert.ok(s.events.filter((e) => e.pid).every((e) => !('playerName' in e)), 'a credited play keeps only the id');
  });

  test('what the ids are for is all still there', () => {
    assert.equal(s.ended, true);
    assert.equal(s.home, 3 + 2 + 1 + 3 + 2 + 2 + 2 + 3, 'every basket and made free throw on the board');
    const ev = (f: (e: (typeof s.events)[number]) => boolean) => s.events.filter(f);
    assert.ok(ev((e) => e.type === 'score').every((e) => e.pid || e.points === 2), 'baskets keep the scorer id (one team basket)');
    assert.deepEqual(ev((e) => e.type === 'sub').map((e) => [e.pid, e.secondId]), [['h5', 'h6'], ['a3', 'a6'], ['h3', 'h7']]);
    // the players who came on reach their appearances by id (no name to match)
    assert.deepEqual(subsCameOn(s), { ids: ['h6', 'a6', 'h7'], names: [] });
    assert.deepEqual(ev((e) => e.type === 'foul' && !!e.drawnPid).map((e) => e.drawnPid), ['h5', 'a1']);
    assert.deepEqual(ev((e) => e.type === 'eject').map((e) => [e.pid, e.reason]), [['a4', 'D']]);
    assert.equal(ev((e) => e.type === 'miss' && e.points === 3 && e.pid === 'a6').length, 0, 'the removed miss is gone');
    // the court follows the subs by id; the disqualified player is out
    assert.deepEqual(bb.onCourtIds(s, 'home'), ['h1', 'h2', 'h7', 'h4', 'h6']);
    assert.deepEqual(bb.onCourtIds(s, 'away'), ['a1', 'a2', 'a6', 'a4', 'a5']);
    assert.equal(bb.isPlayerOut(s, undefined, { side: 'away', pid: 'a4' }), true);
    assert.equal(bb.isPlayerOut(s, undefined, { side: 'home', pid: 'h4' }), false);
    // the voice credits by id
    assert.ok(ev((e) => e.type === 'score' && e.points === 3 && e.pid === 'h1').length === 2);
  });

  test('a disqualified (or fouled-out) player is refused by id', () => {
    const refused = bb.reducer(s.ended ? { ...s, ended: false } : s, { ...scoreAction('away', 2, PR), payload: { ...scoreAction('away', 2, PR).payload, v: 2 } });
    assert.equal(refused.away, s.away);
    let g = bb.init({ foulsToFoulOut: 2 });
    g = [foulAction('home', Z), foulAction('home', Z)].reduce(bb.reducer, g);
    assert.equal(bb.isFouledOut(g, undefined, { side: 'home', pid: 'h1' }), true);
    assert.equal(bb.reducer(g, scoreAction('home', 2, Z)).home, 0);
    assert.equal(bb.reducer(g, scoreAction('away', 2, { id: 'h1' })).away, 2, 'the same id on the other side is another player');
  });

  test('stat totals, records and discipline marks resolve by id without any name', () => {
    const t = basketballStatTotals(s);
    assertNoNames('stat totals', t);
    assert.equal(t.h1.stats.points, 6);
    assert.equal(t.h1.stats.threesMade, 2);
    assert.equal(t.h5.stats.foulsDrawn, 1);
    assert.equal(t.a6.stats.fgMissed ?? 0, 0, 'the removed miss is not counted');
    assert.equal(typeof t.h6.stats.minutes, 'number', 'MIN from the five + subs by id');
    const rec = basketballMatchRecords(s);
    assertNoNames('match records', rec);
    assert.ok(rec?.items.filter((i) => i.type === 'playerHigh').every((i) => i.playerId && i.playerName === undefined));
    const marks = BASKETBALL_DISCIPLINE.marks({ state: s } as never);
    assertNoNames('discipline marks', marks);
    assert.deepEqual(marks.map((x) => [x.playerId, x.col]), [['a4', 'D'], ['a4', 'DQ']]);
  });

  test('the commentary names players by id (initials for this viewer)', () => {
    const feed = basketballFeed(s, NAMES, withRosters(viewer, HOME, AWAY));
    assertNoNames('basketball commentary', feed);
    const text = JSON.stringify(feed);
    assert.match(text, /Z\. Q\. makes a corner 3 \(assist: P\. R\.\)/);
    assert.match(text, /Shooting foul on M\. B\. \(drawn by L\. A\.\)/);
    assert.match(text, /W\. B\. checks in for L\. A\./);
    assert.match(text, /P\. H\. is disqualified \(disqualifying foul\)/);
    const rows = feed.flatMap((g) => g.rows).filter((r) => r.playerName);
    assert.ok(rows.length > 10 && rows.every((r) => r.playerId && /^[A-Z]\. [A-Z]\.$/.test(r.playerName!)), 'rows link by id and show initials');
    const sub = s.events.find((e) => e.type === 'sub')!;
    assert.equal(describePlay(s, sub, 'Lions', {}, viewer), 'W. B. checks in for L. A.');
    assert.equal(playerOf(s, sub, viewer), 'L. A.');
  });

  test('the box score keys by id and shows initials — even with full-name squads alongside', () => {
    const src = basketballBox(s, { homeRoster: HOME, awayRoster: AWAY, homeName: 'Lions', awayName: 'Tigers', nameOf: viewer });
    for (const scope of ['all', 1, 2] as const) {
      const d = src.data(scope);
      const rows = [...d.home.rows, ...d.away.rows];
      assertNoNames(`box ${scope}`, rows.map((r) => r.name));
      assert.ok(rows.every((r) => r.playerId && /^[A-Z]\. [A-Z]\.$/.test(r.name)), `box rows by id: ${rows.map((r) => r.name)}`);
    }
    const t = buildBoxTable(STAT_SCHEMAS.basketball, src.data('all'));
    assertNoNames('box table', t);
    const cols = t.columns.map((c) => c.abbr);
    const row = t.home.rows.find((r) => r.name === 'Z. Q.')!;
    assert.equal(row.cells[cols.indexOf('PTS')], '6');
    assert.equal(t.home.rows.find((r) => r.name === 'L. A.')!.cells[cols.indexOf('FD')], '1');
    assert.equal(typeof row.cells[cols.indexOf('MIN')], 'string', 'MIN by id');
    // the minutes tracker keys by id
    assert.deepEqual([...boxField(s).keys()].sort(), ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7']);
  });

  test('the team-stats panel and game flow carry no names (bench points by id)', () => {
    const panel = basketballPanel(s, 'all');
    assertNoNames('panel', panel);
    const bench = panel.categories.find((c) => c.key === 'scoring')!.rows.find((r) => r.key === 'bench')!;
    assert.deepEqual([bench.home, bench.away], ['7', '0'], 'W. B. 4 + C. F. 3 came off the bench');
    const flow = gameFlowFor('basketball', s);
    assertNoNames('game flow', flow);
    assert.deepEqual(flow?.bench, { home: 7, away: 0 });
  });

  test('undo labels and the overlay ticker name nobody', () => {
    const labels = m.steps.map((st) => undoLabel(st, { home: 'Lions', away: 'Tigers', player: viewer }) ?? '');
    assertNoNames('undo labels', labels);
    // basketball adds no ticker cells or flashes: the overlay shows the summary (scores) only
    const src = readFileSync(new URL('../src/sports/basketball/index.tsx', import.meta.url), 'utf8');
    assert.ok(!/tickerDetail|tickerFlash/.test(src));
    const plugin = { summary: (x: bb.BasketballState) => ({ homeScore: String(x.home), awayScore: String(x.away), statusLine: 'Final' }), isComplete: (x: bb.BasketballState) => x.ended };
    const ticker = buildTicker(plugin as never, s, { home: { name: 'Lions', short: 'LIO' }, away: { name: 'Tigers', short: 'TIG' }, nameOf: viewer }, m.actions.length);
    assertNoNames('ticker', ticker);
  });
});

describe('IDs-only · basketball — an older (named) log still reads as before', () => {
  // what an older app sent: the name beside every id, the five by name + the name → id map
  const named = (p: Player, a: ScoreAction): ScoreAction =>
    ({ ...a, ...(a.attribution ? { attribution: { ...a.attribution, playerName: p.fullName } } : {}) });
  const oldFive: ScoreAction = { type: 'SET_LINEUP', payload: { home: [Z.fullName, PH.fullName], ids: { [Z.fullName]: 'h1', [PH.fullName]: 'h2' } } };
  const oldSub: ScoreAction = { type: 'SUB', side: 'home', payload: { offName: PH.fullName, onName: OC.fullName, offId: 'h2', onId: 'h3', quarter: 1, minute: 3 } };
  const log = [oldFive, named(Z, scoreAction('home', 3, Z)), named(PH, statAction('home', 'ASSIST', PH)), oldSub, named(OC, scoreAction('home', 2, OC))];
  const s = log.reduce(bb.reducer, bb.init({}));

  test('replayed exactly as stored: names on the plays, the map and the five by name', () => {
    assert.equal(s.events[0].playerName, Z.fullName);
    assert.equal(s.events[0].pid, undefined, 'no v: 2 → the old shape');
    assert.deepEqual(s.onCourt?.home, [Z.fullName, PH.fullName]);
    assert.equal(s.ids?.[OC.fullName], 'h3');
    assert.deepEqual(bb.onCourtNames(s, 'home'), [Z.fullName, OC.fullName]);
    assert.deepEqual(bb.onCourtIds(s, 'home'), ['h1', 'h3']);
  });
  test('stored names show with no lookup; the viewer sees initials by id', () => {
    const plain = JSON.stringify(basketballFeed(s, NAMES));
    assert.match(plain, /Zebedee Quartermaine makes a 3-pointer \(assist: Philomena Ravenscroft\)/);
    const masked = basketballFeed(s, NAMES, viewer);
    assertNoNames('older log via the viewer lookup', masked);
    assert.match(JSON.stringify(masked), /Z\. Q\. makes a 3-pointer \(assist: P\. R\.\)/);
    assert.match(JSON.stringify(masked), /O\. P\. checks in for P\. R\./);
    assert.deepEqual(basketballBox(s, { homeRoster: HOME.slice(0, 3), nameOf: viewer }).data('all').home.rows.map((r) => r.name), ['Z. Q.', 'O. P.', 'P. R.']);
    assert.deepEqual(basketballBox(s, { homeRoster: HOME.slice(0, 3) }).data('all').home.rows.map((r) => r.name), [Z.fullName, OC.fullName, PH.fullName]);
  });
  test('a match continued on the updated app: the new plays by id join the old ones', () => {
    const next = [subAction('home', OC, PH), scoreAction('home', 2, PH)].reduce(bb.reducer, s);
    assert.deepEqual(bb.onCourtIds(next, 'home'), ['h1', 'h2'], 'the id sub finds the player the old log named');
    assert.equal(basketballStatTotals(next).h2.stats.points, 2);
    assert.equal(basketballStatTotals(next).h1.stats.points, 3);
    // an old foul-out by name still counts for the id-only action (through the log's map)
    let f = bb.init({ foulsToFoulOut: 1 });
    f = bb.reducer(f, { type: 'FOUL', side: 'home', payload: { foulType: 'personal', pid: 'h1' }, attribution: { playerId: 'h1', stat: 'fouls', playerName: Z.fullName } });
    assert.equal(f.events[0].pid, undefined, 'an SD-40 play (pid, no v: 2) keeps its old shape');
    assert.equal(bb.reducer(f, scoreAction('home', 2, Z)).home, 0, 'refused: fouled out under the old log');
  });
});
