/**
 * IDs-only scoring — baseball & softball, carrom, chess, golf match play
 * (docs/privacy/ids-only-scoring.md, groups F + G, founder 2026-10-24).
 * `matches.state` (the reducer state, saved after every tap) and
 * `match_events` (payload, attribution / attribution2) are readable logged
 * out, so these sports must store player IDS only — never a name.
 *
 * Each sport scores a realistic match here with the SAME pure builders the
 * scorer's controls (and voice) use, with rosters whose players have
 * distinctive full names:
 *   - baseball: line-ups + starting pitchers, pitches, hits, a sac fly / RBI,
 *     a steal, a wild pitch, an error, a double play, the extra-inning
 *     tie-break runners, pinch hitter / runner, a defensive and a pitching
 *     change, ejections (a player and a team official), a correction
 *     (re-entered play + held removal), an earned-run override, voice calls
 *     and a called game;
 *   - carrom (doubles): the toss with a break order, boards with the Queen,
 *     a slam, the foul log with who fouled, a penalty board, a board-ending
 *     foul, voice, and a board-editor correction (EDIT_LOG + STAT_ADJUSTs);
 *   - chess: typed moves, a pasted PGN carrying [White] / [Black] (and an
 *     e-mail) tags, the result with both players' credits, the arbiter's
 *     round-sheet result;
 *   - golf match play: holes won / halved, with and without strokes, voice
 *     ("Quartermaine wins the hole"), a concession.
 * Then: the state and every action's payload / attribution / attribution2
 * contain none of those names (nor surnames); the display builders given a
 * NameOf that maps ids → initials show initials and never a full name, and
 * with the circle's NameOf the full names. Older (name-carrying) logs still
 * replay and read as before, and a correction never copies their names into
 * the new events.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as bb from '../src/sports/baseball/engine.ts';
import { withNames as bbWithNames, whoText } from '../src/sports/baseball/names.ts';
import { baseballCommentary } from '../src/sports/baseball/commentary.ts';
import { baseballBox, baseballPitchingBox, battingNotes, pitchingNotes } from '../src/sports/baseball/box.ts';
import { baseballTickerDetail, baseballTickerFlash } from '../src/sports/baseball/ticker.ts';
import { baseballTimeline, describeEvent } from '../src/sports/baseball/timeline.ts';
import { baseballMatchRecords } from '../src/sports/baseball/records.ts';
import { baseballVoice } from '../src/sports/baseball/voice.ts';
import { BASEBALL_DISCIPLINE } from '../src/sports/baseball/discipline.ts';
import { matchBoxSource } from '../src/sports/boxSources.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { creditedPlayers } from '../src/sports/carrom/totals.ts';
import { carromFeed } from '../src/sports/carrom/feed.ts';
import { carromMatchRecords } from '../src/sports/carrom/records.ts';
import * as chess from '../src/sports/chess/engine.ts';
import { chessResultCredit } from '../src/sports/chess/stats.ts';
import { pastedMovesAction, readMoveList, withoutPlayerTags } from '../src/sports/chess/pgn.ts';
import { boardResultAction } from '../src/sports/chess/roundSheet.ts';
import { chessFeed } from '../src/sports/chess/gameFeed.ts';
import { chessMatchRecords } from '../src/sports/chess/records.ts';
import { initGolfMatch, golfMatchReducer, golfMatchStateOf, holeAction, type GolfMatchState } from '../src/sports/golf/match.ts';
import { matchHole, setupMatchStrokes } from '../src/sports/golf/matchStrokes.ts';
import { holeWinner, standardPar72 } from '../src/sports/golf/engine.ts';
import { golfMatchFeed } from '../src/sports/golf/feed.ts';
import { golfMatchRecords } from '../src/sports/golf/records.ts';
import { carromVoice, golfMatchVoice } from '../src/sports/voiceParsers.ts';
import { makeNameOf, nameInitials, legacyNameOf, type NameOf } from '../src/core/playerNames.ts';
import type { ScoreAction, VoiceContext } from '../src/sports/types.ts';
import type { Player } from '../src/core/types.ts';

// ─── Rosters with names that can't occur by accident ─────────────────────────

const HOME: [string, string][] = [
  ['h1', 'Zebedee Quartermaine'], ['h2', 'Philomena Thistlewood'], ['h3', 'Barnaby Fitzwilliam'],
  ['h4', 'Octavia Pennyworth'], ['h5', 'Leopold Ashcombe'], ['h6', 'Marigold Featherstone'],
  ['h7', 'Cornelius Blackwood'], ['h8', 'Seraphina Lockhart'], ['h9', 'Archibald Wexley'],
  ['h10', 'Ottoline Gravesend'], ['h11', 'Peregrine Halloway'], ['h12', 'Wilhelmina Crabtree'],
];
const AWAY: [string, string][] = [
  ['a1', 'Thaddeus Whitlock'], ['a2', 'Clementine Rookwood'], ['a3', 'Ignatius Pemberton'],
  ['a4', 'Henrietta Coldwater'], ['a5', 'Montgomery Ravensworth'], ['a6', 'Euphemia Starling'],
  ['a7', 'Bartholomew Kettering'], ['a8', 'Rosalind Merriweather'], ['a9', 'Algernon Fairbanks'],
  ['a10', 'Gwendolyn Hollister'], ['a11', 'Fitzgerald Quimby'], ['a12', 'Isadora Vanterpool'],
];
const ALL = [...HOME, ...AWAY];
/** every full name, and every surname on its own (stronger than full names) */
const FORBIDDEN = ALL.flatMap(([, n]) => [n, n.split(' ')[1]]);
const player = ([id, fullName]: [string, string], sport: string): Player => ({ id, fullName, sports: [sport] }) as Player;
const roster = (list: [string, string][], sport: string): Player[] => list.map((x) => player(x, sport));
/** The child's circle: full names. */
const CIRCLE: NameOf = makeNameOf(new Map(ALL));
/** Everyone else (players_view): initials — "Z. Q." */
const PUBLIC: NameOf = makeNameOf(new Map(ALL.map(([id, n]) => [id, nameInitials(n)])));

const leaks = (text: string): string[] => FORBIDDEN.filter((n) => text.includes(n));
const assertNoNames = (what: string, value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  assert.deepEqual(leaks(text), [], `${what} carries a name`);
};
/** every action's payload / attribution / attribution2 */
const assertActionsClean = (sport: string, actions: ScoreAction[]) => {
  actions.forEach((a, i) => {
    assertNoNames(`${sport} action #${i} ${a.type} payload`, a.payload ?? {});
    assertNoNames(`${sport} action #${i} ${a.type} attribution`, a.attribution ?? {});
    assertNoNames(`${sport} action #${i} ${a.type} attribution2`, a.attribution2 ?? {});
  });
};
test('the guard itself catches a name', () => {
  assert.throws(() => assertNoNames('x', { batter: { id: 'h1', name: 'Zebedee Quartermaine' } }));
  assert.throws(() => assertNoNames('x', 'c Pemberton b Quimby'));
});
const voiceCtx = (state: unknown, sport: string): VoiceContext =>
  ({ state, homeName: 'Hawks', awayName: 'Owls', homeRoster: roster(HOME, sport), awayRoster: roster(AWAY, sport) });

/* ═══════════════════════════════ baseball ═══════════════════════════════ */

class BaseballScorer {
  s: bb.BaseballState;
  actions: ScoreAction[] = [];
  steps: { prev: bb.BaseballState; next: bb.BaseballState }[] = [];
  constructor(config?: Record<string, unknown>) { this.s = bb.init(config); }
  do(a: ScoreAction): this {
    const prev = this.s;
    this.actions.push(a);
    this.s = bb.reducer(this.s, a);
    this.steps.push({ prev, next: this.s });
    return this;
  }
  pitch(k: bb.PitchKind) { return this.do(bb.buildPitch(this.s, k)); }
  /** as the outcome pad: the usual advance (the advance sheet confirms it as is) */
  play(o: bb.Outcome, opts: bb.PlayOpts = {}) { return this.do(bb.buildPlay(this.s, o, { moves: bb.withStays(this.s, bb.defaultMoves(this.s, o)), ...opts })); }
  runner(k: bb.RunnerKind, base?: 1 | 2 | 3) { return this.do(bb.buildRunner(this.s, k, bb.defaultRunnerMoves(this.s, k, base))); }
  get bat() { return bb.situation(this.s).bat; }
  get field() { return bb.situation(this.s).field; }
}

/** The line-up the screen stamps: the squad order with positions, by id. */
const POS = ['CF', 'SS', '1B', 'C', '3B', 'LF', 'RF', '2B', 'DH'];
const order = (list: [string, string][]): bb.LineupEntry[] => list.slice(0, 9).map(([id], i) => ({ id, pos: POS[i] }));
/** the screen's `who(p)`: a picked roster player as the log stores it */
const pick = (id: string): bb.Who => ({ id });

function baseballGame(): BaseballScorer {
  // the WBSC tie-break from the 2nd inning, so its placed runners are exercised
  const sc = new BaseballScorer({ preset: 'baseball', tiebreak: 'r12', tbFrom: 2, innings: 3 });
  sc.do(bb.lineupAction('home', order(HOME), pick('h10')));
  sc.do(bb.lineupAction('away', order(AWAY), pick('a10')));
  // ▲ 1st — the visitors bat
  sc.pitch('ball').pitch('called').pitch('foul').play('1B', { zone: 'LF' });
  sc.play('2B', { zone: 'RC' }); // a1 → 3rd, a2 on 2nd
  sc.play('SF', { fielders: '8' }); // a1 scores: 1 RBI
  sc.runner('SB', 2); // a2 steals 3rd
  sc.pitch('swinging').pitch('swinging').pitch('swinging'); // strike three closes it
  // pinch hitter for the batter due
  const due = bb.situation(sc.s).batter;
  sc.do(bb.subAction('away', 'ph', { slot: due.slot, on: pick('a12'), off: due }));
  sc.play('GO', { fielders: '6-3' });
  assert.equal(sc.bat, 'home', 'three out: the home side bats');
  // ▼ 1st
  sc.play('HR', { zone: 'CF' });
  sc.play('BB');
  // a pinch runner for the runner on 1st
  const r1 = sc.s.g.bases[0]!;
  sc.do(bb.subAction('home', 'pr', { base: 1, slot: r1.slot, on: pick('h11'), off: r1 }));
  sc.runner('WP');
  sc.play('E', { fielders: 'E5' });
  // a pitching change (the reliever inherits the runners)
  sc.do(bb.subAction('away', 'p', { on: pick('a11'), off: sc.s.g.pitcher.away }));
  sc.play('DP', { fielders: '6-4-3' });
  sc.play('FO', { fielders: 'F8' });
  assert.equal(bb.inningOf(sc.s.g.half), 2, 'the 2nd inning');
  // ▲ 2nd — the tie-break runners are placed (by id)
  assert.ok(sc.s.g.bases[0] && sc.s.g.bases[1], 'tie-break runners on 1st and 2nd');
  // a defensive change and an ejection (a player, then a team official)
  const out = sc.s.g.order.home[4];
  sc.do(bb.subAction('home', 'def', { slot: 4, on: pick('h12'), pos: 'SS', off: out }));
  sc.do(bb.ejectAction('away', { player: pick('a9') }));
  sc.do(bb.ejectAction('home', { official: 'Manager' }));
  sc.play('3B', { zone: 'RF' });
  // voice calls build the same actions
  const ctx = () => voiceCtx(sc.s, 'baseball');
  for (const call of ['ball', 'strike swinging', 'single to left']) {
    const acts = baseballVoice(call, ctx());
    assert.ok(acts?.length, `voice: ${call}`);
    for (const a of acts!) sc.do(a);
  }
  sc.play('FC', { fielders: '4-6' });
  // a correction: re-enter the last play as a double (held removal after it)
  const last = [...sc.s.events].reverse().find((e) => e.type === 'pa')!;
  const i = sc.s.events.findIndex((e) => e.id === last.id);
  const after = sc.s.events[i - 1].id;
  const view = bb.stateAfter(sc.s, after);
  sc.do(bb.buildPlay(view, '2B', { moves: bb.withStays(view, bb.defaultMoves(view, '2B')), extra: { after, edit: true } }));
  const cr = bb.eventCredits(last);
  sc.do({ type: 'REMOVE_EVENT', side: last.side, payload: { id: last.id }, attribution: bb.creditAttribution(cr.first, -1), attribution2: bb.creditAttribution(cr.second, -1) });
  // the scorer's earned-run override on the home run
  const hr = sc.s.events.find((e) => e.outcome === 'HR')!;
  sc.do({ type: 'ER', payload: { ref: hr.id, earned: false, uid: bb.newUid() } });
  sc.play('K', { pitch: 'called' });
  sc.play('LO', { fielders: 'L6' });
  // a called game (time / weather) — asks first on the screen
  sc.do({ type: 'END', payload: { reason: 'called', at: Date.UTC(2026, 9, 24, 12) } });
  return sc;
}

describe('IDs-only scoring · baseball / softball', () => {
  const sc = baseballGame();
  const s = sc.s;

  test('the game really was scored (runs, subs, ejections, decisions)', () => {
    assert.equal(s.g.ended, true);
    assert.ok(s.g.score.home + s.g.score.away >= 3, 'runs scored');
    assert.ok(s.events.some((e) => e.type === 'sub' && e.kind === 'p'));
    assert.ok(s.events.some((e) => e.type === 'eject' && e.on?.id === 'a9'));
    assert.ok(s.g.spells.length >= 3, 'pitching spells');
    assert.ok(s.g.runs.some((r) => r.runnerId), 'runs credited by id');
    assert.ok(s.g.decisions?.w || s.g.decisions?.l, 'a pitcher of record');
  });

  test('the persisted state carries no name', () => {
    assertNoNames('baseball state', s);
    // the players are there by id
    assert.equal(s.lineup.home?.[0]?.id, 'h1');
    assert.equal(s.lineup.home?.[0]?.name, undefined);
    assert.equal(s.starters.away?.id, 'a10');
    assert.ok(s.events.filter((e) => e.type === 'pa').every((e) => e.batter?.id && !e.batter.name));
  });

  test('no action carries a name in payload / attribution / attribution2', () => {
    assertActionsClean('baseball', sc.actions);
    // credits still reach the stat lines, by id
    assert.ok(sc.actions.some((a) => a.attribution?.playerId === 'a1' && a.attribution.stat === 'plateAppearances'));
    assert.ok(sc.actions.every((a) => !(a.attribution as { playerName?: string } | undefined)?.playerName));
  });

  test('records and the discipline marks keep ids only', () => {
    assertNoNames('baseball records', baseballMatchRecords(s));
    const marks = BASEBALL_DISCIPLINE.marks({ state: s } as never);
    assertNoNames('baseball discipline', marks);
    assert.ok(marks.some((m) => m.playerId === 'a9'));
  });

  test('the display builders name players by id — initials for the public, full names for the circle', () => {
    const names = { home: 'Hawks', away: 'Owls' };
    const pub = JSON.stringify(baseballCommentary(s, names, PUBLIC));
    assertNoNames('commentary (public)', pub);
    assert.ok(pub.includes('T. W.'), 'the leadoff hitter reads as initials');
    const circle = JSON.stringify(baseballCommentary(s, names, CIRCLE));
    assert.ok(circle.includes('Thaddeus Whitlock'), 'the circle sees the full name');

    // the box scores, given the FULL rosters: the viewer's lookup still wins
    const ctx = { homeRoster: roster(HOME, 'baseball'), awayRoster: roster(AWAY, 'baseball'), names, nameOf: PUBLIC };
    for (const src of [baseballBox(s, ctx), baseballPitchingBox(s, ctx), matchBoxSource('baseball', s, ctx)!]) {
      const d = src.data('all' as never);
      assertNoNames('box rows', d);
      assert.ok(JSON.stringify(d).includes('. '), 'initials in the rows');
      assertNoNames('box notes', src.notes?.() ?? []);
    }
    assertNoNames('batting notes', battingNotes(s, ctx));
    assertNoNames('pitching notes', pitchingNotes(s, ctx));
    assertNoNames('timeline', baseballTimeline(s, PUBLIC));
    assertNoNames('described events', bbWithNames(s, PUBLIC).events.map((e) => describeEvent(e)));
    // the ticker (the public OBS overlay) mid-game, and the home-run flash
    let flashes = 0;
    for (const { prev, next } of sc.steps) {
      if (!next.g.ended) assertNoNames('ticker detail', baseballTickerDetail(next, { player: PUBLIC }));
      const f = baseballTickerFlash(prev, next, PUBLIC);
      if (f) { flashes++; assertNoNames('ticker flash', f); assert.match(f.text, /HOME RUN! Z\. Q\./); }
    }
    assert.equal(flashes, 1, 'the home run flashed');
    assert.match(JSON.stringify(baseballTickerDetail(sc.steps[5].next, { player: PUBLIC })), /⚾ O\. G\. \(4\)/, 'the pitcher (home) as initials, with his pitch count');
  });

  test('a correction against an older (name-carrying) log writes ids only', () => {
    // an older log: names next to the ids in every payload — replays as before
    let old = bb.init();
    const legacy: ScoreAction[] = [
      { type: 'LINEUP', payload: { team: 'home', order: HOME.slice(0, 9).map(([id, name]) => ({ id, name })), pitcher: { id: 'h10', name: 'Ottoline Gravesend' } } },
      { type: 'LINEUP', payload: { team: 'away', order: AWAY.slice(0, 9).map(([id, name]) => ({ id, name })), pitcher: { id: 'a10', name: 'Gwendolyn Hollister' } } },
    ];
    for (const a of legacy) old = bb.reducer(old, a);
    const p = bb.buildPlay(old, '1B');
    old = bb.reducer(old, { ...p, payload: { ...p.payload, batter: { id: 'a1', name: 'Thaddeus Whitlock', slot: 0 }, pitcher: { id: 'h10', name: 'Ottoline Gravesend' } } });
    assert.equal(old.lineup.away?.[0]?.name, 'Thaddeus Whitlock', 'an older log keeps its names (replays as before)');
    assert.equal(old.g.bases[0]?.name, 'Thaddeus Whitlock');
    // with no lookup it reads as it always did
    assert.match(JSON.stringify(baseballCommentary(old, { home: 'H', away: 'A' })), /Thaddeus Whitlock singles/);
    // the public reads initials (by id)
    assertNoNames('older log, public commentary', baseballCommentary(old, { home: 'H', away: 'A' }, PUBLIC));
    // new plays on that state copy no name from it
    const next = [bb.buildPlay(old, '2B'), bb.buildRunner(old, 'SB', bb.defaultRunnerMoves(old, 'SB', 1)), bb.buildPitch(old, 'ball'),
      bb.subAction('away', 'pr', { base: 1, on: pick('a12'), off: old.g.bases[0] }), bb.lineupAction('home', old.lineup.home!, old.starters.home)];
    assertActionsClean('baseball over an older log', next);
  });

  test('a name-only player (no id) keeps its label: its only identity', () => {
    assert.deepEqual(bb.storedWho({ name: 'Batter 4' }), { name: 'Batter 4' });
    assert.deepEqual(bb.storedWho({ id: 'h1', name: 'Zebedee Quartermaine' }), { id: 'h1' });
    assert.equal(whoText({ name: 'Batter 4' }, PUBLIC), 'Batter 4');
    assert.equal(whoText({ id: 'h1' }, PUBLIC), 'Z. Q.');
    // no roster at all: numbered slots, as before
    let t = bb.init();
    t = bb.reducer(t, bb.buildPlay(t, '1B'));
    assert.equal(t.events[0].batter?.name, 'Batter 1');
  });
});

/* ════════════════════════════════ carrom ════════════════════════════════ */

describe('IDs-only scoring · carrom', () => {
  const H = roster(HOME.slice(0, 2), 'carrom');
  const A = roster(AWAY.slice(0, 2), 'carrom');
  let s = carrom.init({ playersPerSide: 2, trackFouls: true, trackBreak: true, trackQueenMiss: true, foulScore: true });
  const actions: ScoreAction[] = [];
  const steps: { prev: carrom.CarromState; next: carrom.CarromState }[] = [];
  const doA = (a: ScoreAction) => { const prev = s; actions.push(a); s = carrom.reducer(s, a as never); steps.push({ prev, next: s }); };
  // the toss with the doubles break order (the screen's orderOf: ids only)
  doA({ type: 'FIRST_BREAK', payload: { side: 'home', order: { home: H.map((p) => ({ id: p.id })), away: A.map((p) => ({ id: p.id })) } } });
  /** the screen's record(): both partners credited (carrom.boardCredit) */
  const board = (side: 'home' | 'away', o: { coins?: number; queen?: boolean; slam?: carrom.Slam; penalty?: boolean; det?: carrom.BoardDetail; endFoul?: carrom.EndFoul } = {}) => {
    const queen = !!o.queen;
    const value = carrom.boardValue(s, s.current[side], { coins: o.coins ?? 0, queen, penalty: o.penalty, endFoul: o.endFoul });
    const credit = Math.min(value, Math.max(0, s.target - s.current[side]));
    const players = creditedPlayers(side === 'home' ? H : A, 2);
    const attr = (p: Player) => carrom.boardCredit(p, credit, { penalty: o.penalty, queen });
    doA({
      type: 'BOARD', side,
      payload: o.penalty ? { coins: 0, queen: false, penalty: true, at: 1 } : { coins: o.coins, queen, ...(queen ? { queenBy: 'winner' } : {}), ...(o.slam ? { slam: o.slam } : {}), ...(o.det ? { det: o.det } : {}), at: 1, ...(o.endFoul ? { endFoul: o.endFoul } : {}) },
      attribution: attr(players[0]), attribution2: attr(players[1]),
    });
  };
  board('home', { coins: 4, queen: true, det: { fouls: { home: {}, away: { touch: 1 } }, dues: {}, split: true, who: { home: {}, away: { a2: { fouls: { touch: 1 } } } }, brk: 2 } });
  board('away', { coins: 6, endFoul: { striker: true } });
  board('home', { coins: 9, slam: 'black' });
  board('away', { penalty: true });
  // voice: "board away 3" (the screen's credit, by id)
  for (const a of carromVoice('board away 3', voiceCtx(s, 'carrom'))!) doA(a);
  // the board editor: board 2 goes to the home side instead (creditFor: ids)
  const list = carrom.boardInputs(s);
  const edited = list.map((b, i) => (i === 1 ? { ...b, side: 'home' as const, by: creditedPlayers(H, 2).map((p) => ({ side: 'home' as const, id: p.id })) } : b));
  for (const a of carrom.boardCorrection(s, edited)) doA(a as ScoreAction);

  test('the match really was scored and corrected', () => {
    assert.equal(s.boards.length, 5);
    assert.equal(s.boards[1].winner, 'home', 'the correction applied');
    assert.ok(s.credited?.every((c) => c.id && !c.name));
    assert.ok(actions.some((a) => a.type === 'STAT_ADJUST' && a.attribution?.playerId === 'h1'));
  });

  test('state and actions carry no name', () => {
    assertNoNames('carrom state', s);
    assertActionsClean('carrom', actions);
    assertNoNames('carrom records', carromMatchRecords(s));
  });

  test('the commentary names the breakers by id: initials for the public, full names for the circle', () => {
    const pub = JSON.stringify(carromFeed(s, { home: 'Hawks', away: 'Owls' }, PUBLIC));
    assertNoNames('carrom feed (public)', pub);
    assert.ok(pub.includes('Z. Q. broke'), 'the breaker as initials');
    assert.ok(JSON.stringify(carromFeed(s, { home: 'Hawks', away: 'Owls' }, CIRCLE)).includes('Zebedee Quartermaine broke'));
    // the next breaker is a credit by id
    assert.deepEqual(carrom.nextBreakerPlayer(steps[0].next), { side: 'home', id: 'h1' });
  });

  test('an older log keeps its names; a correction of it writes ids only', () => {
    let old = carrom.init();
    const legacyBoard: ScoreAction = { type: 'BOARD', side: 'home', payload: { coins: 5, queen: false }, attribution: { playerId: 'h1', playerName: 'Zebedee Quartermaine', stat: 'points', by: 5, extra: { boards: 1 } } };
    old = carrom.reducer(old, legacyBoard as never);
    assert.deepEqual(old.credited, [{ side: 'home', id: 'h1', name: 'Zebedee Quartermaine' }], 'replays as before');
    assert.match(JSON.stringify(carromFeed({ ...old, breakOrder: { home: [old.credited![0], { side: 'home', id: 'h2' }] }, firstBreak: 'home' }, { home: 'H', away: 'A' })), /Zebedee Quartermaine broke/);
    const fix = carrom.boardCorrection(old, carrom.boardInputs(old).map((b) => ({ ...b, coins: 7 })));
    assertActionsClean('carrom correction of an older log', fix as ScoreAction[]);
    assert.deepEqual((fix[0].payload!.boards as carrom.BoardInput[])[0].by, [{ side: 'home', id: 'h1' }]);
  });
});

/* ════════════════════════════════ chess ═════════════════════════════════ */

const PGN = `[Event "District U-12 Rapid"]
[Site "Pune"]
[White "Zebedee Quartermaine"]
[Black "Thaddeus Whitlock"]
[WhiteNA "zebedee.q@example.com"]
[BlackNA "thaddeus.w@example.com"]
[ECO "C60"]
[Opening "Ruy Lopez"]
[Result "1-0"]

1. e4 {[%clk 0:14:52]} e5 {[%clk 0:14:50]} 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0`;

describe('IDs-only scoring · chess', () => {
  const H = roster(HOME, 'chess');
  const A = roster(AWAY, 'chess');
  let s = chess.init({ timeControl: 'rapid', trackMoves: true });
  const actions: ScoreAction[] = [];
  const doA = (a: ScoreAction) => { actions.push(a); s = chess.reducer(s, a); };
  doA({ type: 'MOVES', payload: { add: ['e4', 'e5'], at: 1 } });
  // the whole game pasted (PGN with the players' tags) — the MovesPanel's builder
  doA(pastedMovesAction(PGN, { at: 2 }));
  // the result, as ScoringControls.record() dispatches it
  const credit = (side: 'home' | 'away') => chessResultCredit(side, (side === 'home' ? H : A)[0], 'home', 'resignation', false);
  doA({ type: 'RESULT', side: 'home', payload: { winner: 'home', method: 'resignation', moves: chess.listMoves(s.game), at: 3 }, attribution: credit('home'), attribution2: credit('away') });

  test('the game really was recorded', () => {
    assert.equal(s.ended, true);
    assert.equal(s.game?.san.length, 10);
    assert.equal(s.opening?.eco, 'C60');
    assert.equal(actions[2].attribution?.playerId, 'h1');
  });

  test('the stored PGN keeps the moves and other tags, not the players', () => {
    const stored = String(actions[1].payload?.pgn);
    assert.ok(stored.includes('[White "?"]') && stored.includes('[Black "?"]'));
    assert.ok(stored.includes('[Event "District U-12 Rapid"]') && stored.includes('[ECO "C60"]'));
    assert.ok(!stored.includes('@example.com'), 'no e-mail');
    assert.deepEqual(readMoveList(stored).san, readMoveList(PGN).san, 'the same game');
    assert.deepEqual(readMoveList(stored).clocks, readMoveList(PGN).clocks);
    assert.equal(withoutPlayerTags('1. e4 e5'), '1. e4 e5', 'a bare list is unchanged');
  });

  test('state and actions carry no name', () => {
    assertNoNames('chess state', s);
    assertActionsClean('chess', actions);
    assertNoNames('chess records', chessMatchRecords(s));
    // the arbiter's round sheet writes the same credits
    assertActionsClean('chess round sheet', [boardResultAction('1-0', 'home', { home: H[0], away: A[0] }), boardResultAction('½-½', 'away', { home: H[1], away: A[1] })]);
  });

  test('the feed names each side as the viewer sees the player', () => {
    // the screen: sideName(nameOf, roster, team) — the player by id for this viewer
    const side = (nameOf: NameOf, p: Player) => nameOf(p.id, p.fullName);
    const pub = chessFeed(s, { home: side(PUBLIC, H[0]), away: side(PUBLIC, A[0]) });
    assertNoNames('chess feed (public)', pub);
    assert.ok(JSON.stringify(pub).includes('Z. Q.'));
    assert.ok(JSON.stringify(chessFeed(s, { home: side(CIRCLE, H[0]), away: side(CIRCLE, A[0]) })).includes('Zebedee Quartermaine'));
  });

  test('an older result (credits with names) still replays', () => {
    const old = chess.reducer(chess.init(), { type: 'RESULT', side: 'away', payload: { winner: 'away' }, attribution: { playerId: 'h1', playerName: 'Zebedee Quartermaine', stat: 'games', by: 1 } } as never);
    assert.equal(old.winner, 'away');
  });
});

/* ═════════════════════════════ golf match play ═══════════════════════════ */

describe('IDs-only scoring · golf match play', () => {
  const H = roster(HOME, 'golf');
  const A = roster(AWAY, 'golf');
  const players = { home: H[0], away: A[0] };
  let s: GolfMatchState = initGolfMatch({ holes: '18' });
  const actions: ScoreAction[] = [];
  const doA = (a: ScoreAction) => { actions.push(a); s = golfMatchReducer(s, a); };
  // the screen's buttons (no strokes)
  doA(holeAction('home', players, { at: 1 }));
  doA(holeAction('halved', players, { at: 2 }));
  doA(holeAction('away', players, { at: 3 }));
  // voice, by surname
  for (const a of golfMatchVoice('Quartermaine wins the hole', voiceCtx(s, 'golf'))!) doA(a);
  for (const a of golfMatchVoice('halved', voiceCtx(s, 'golf'))!) doA(a);
  // handicap strokes set up: gross strokes per hole, the net winner
  doA({ type: 'SET_STROKES', payload: { strokes: setupMatchStrokes({ holes: standardPar72(), homeIndex: 4, awayIndex: 12 }) } });
  for (const [h, a] of [[4, 5], [3, 3], [5, 4]] as const) {
    const here = matchHole(s.strokes!, golfMatchStateOf(s).played);
    doA(holeAction(holeWinner(h, a, here.home, here.away), players, { strokes: { home: h, away: a }, par: here.hole.par, at: 10 }));
  }
  for (const a of golfMatchVoice('Whitlock 4 Quartermaine 5', voiceCtx(s, 'golf'))!) doA(a);
  doA({ type: 'CONCEDE', side: 'away', payload: { at: 20 } });

  test('the match really was scored', () => {
    assert.equal(s.ended, true);
    assert.equal(s.holes.length, 9);
    assert.ok(actions.some((a) => a.attribution?.stat === 'holesWon' && a.attribution.playerId === 'h1'));
    assert.ok(actions.some((a) => a.attribution2?.playerId === 'a1'));
  });

  test('state and actions carry no name', () => {
    assertNoNames('golf state', s);
    assertActionsClean('golf', actions);
    assertNoNames('golf records', golfMatchRecords(s));
  });

  test('the commentary names each side as the viewer sees the player', () => {
    const side = (nameOf: NameOf, p: Player) => nameOf(p.id, p.fullName);
    const pub = golfMatchFeed(s, { home: side(PUBLIC, H[0]), away: side(PUBLIC, A[0]) });
    assertNoNames('golf feed (public)', pub);
    assert.ok(JSON.stringify(pub).includes('Z. Q.'));
  });

  test('the hole builder: halved credits nobody; without a player, no credit', () => {
    assert.deepEqual(holeAction('halved', players), { type: 'HOLE', payload: { winner: 'halved' } });
    assert.deepEqual(holeAction('home', {}), { type: 'HOLE', side: 'home', payload: { winner: 'home' } });
    assert.deepEqual(holeAction('away', players).attribution, { playerId: 'a1', stat: 'holesWon', by: 1, side: 'away' });
  });
});

/* ════════════════════ the shared lookup (no provider) ═══════════════════ */

test('with no lookup, an id-only log reads "Player" — never a stored name it does not have', () => {
  let t = bb.init();
  t = bb.reducer(t, bb.lineupAction('away', [{ id: 'a1' }], { id: 'h10' }));
  t = bb.reducer(t, bb.buildPlay(t, '1B'));
  assert.equal(bbWithNames(t, legacyNameOf).events[0].batter?.name, 'Player');
  assert.equal(bbWithNames(t, PUBLIC).events[0].batter?.name, 'T. W.');
});
