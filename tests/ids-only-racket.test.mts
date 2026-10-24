/**
 * IDs-only scoring guard (docs/privacy/ids-only-scoring.md) — the racket
 * sports: badminton, tennis, padel, pickleball, squash, table tennis.
 *
 * Match state (`matches.state`) and events (`match_events` attribution /
 * payload) are public, logged out included. Each sport here scripts a
 * realistic match the way the scorer's controls build it (the same pure
 * builders: racketActions.ts, the voice parsers, the timeline editor's
 * `correctionActions`), with players whose full names are distinctive, and
 * requires:
 *   1. no full name (nor a distinctive surname) anywhere in the reduced state
 *      or in any action's attribution / attribution2 / payload;
 *   2. the display builders (commentary, box score, undo label, point
 *      detail text), given a `nameOf` that maps ids to initials ("Z. Q."),
 *      show the initials — never the full name, even when the rosters they
 *      get still hold full names.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { LiveEvent } from '../src/sports/liveEvents.ts';
import { nameInitials, type NameOf } from '../src/core/playerNames.ts';
import { makeRallyEngine, rallyRows, rallyInputs, type RallyState } from '../src/sports/rallyEngine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import { pointRows, correctionActions, defaultCredits, type EditRow, type PointInput } from '../src/sports/rallyEdit.ts';
import { stamped } from '../src/sports/conduct.ts';
import {
  pointAction, doubleFaultAction, startRightAction, serveOrderAction, doublesOrderAction, conductAction, timeoutAction, errOf,
} from '../src/sports/racketActions.ts';
import { pointVoice, tennisVoice } from '../src/sports/voiceParsers.ts';
import { racketCommentary } from '../src/sports/racketCommentaryModel.ts';
import { tennisCommentary, type CommentaryBlock } from '../src/sports/tennis/commentaryModel.ts';
import { badmintonBox, tennisBox, padelBox, rallyBox, type BoxContext } from '../src/sports/boxSources.ts';
import type { MatchBoxSource } from '../src/sports/boxScore.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import { pdText } from '../src/sports/pointDetail.ts';
import { markDetail } from '../src/sports/racketNames.ts';

type Side = 'home' | 'away';
const P = (id: string, fullName: string) => ({ id, fullName } as Player);
const HOME = [P('h1', 'Zebedee Quartermaine'), P('h2', 'Philomena Ravenscroft')];
const AWAY = [P('a1', 'Bartholomew Wigglesworth'), P('a2', 'Clementine Fairweather')];
const EVERYONE = [...HOME, ...AWAY];
/** every full name, and every distinctive word of one */
const SECRETS = EVERYONE.flatMap((p) => [p.fullName, ...p.fullName.split(' ')]);
/** what a viewer outside the circle sees (players_view initials) */
const INITIALS: Record<string, string> = Object.fromEntries(EVERYONE.map((p) => [p.id, nameInitials(p.fullName)]));
const viewer: NameOf = (id, legacy) => (id && INITIALS[id]) || (legacy ?? '').trim() || 'Player';
const rosterId = (name?: string) => EVERYONE.find((p) => p.fullName === name)?.id;

function assertNoNames(what: string, value: unknown) {
  const json = JSON.stringify(value) ?? '';
  for (const s of SECRETS) assert.ok(!json.includes(s), `${what} must not contain "${s}": ${json.slice(0, 400)}`);
}
function assertActionsClean(actions: ScoreAction[]) {
  for (const a of actions) {
    assertNoNames(`${a.type} attribution`, a.attribution ?? null);
    assertNoNames(`${a.type} attribution2`, a.attribution2 ?? null);
    assertNoNames(`${a.type} payload`, a.payload ?? null);
  }
}
/** A scripted match: every action applied through the sport's reducer, the
 *  scoring steps stamped with the clock as the controls stamp them. */
function scripted<S extends { events: LiveEvent[] }>(reducer: (s: S, a: ScoreAction) => S, start: S) {
  let s = start;
  let t = Date.UTC(2026, 9, 24, 10);
  const actions: ScoreAction[] = [];
  const steps: Array<{ type: string; prev: S; next: S }> = [];
  const STAMP = new Set(['POINT', 'ACE', 'CONDUCT', 'TIMEOUT', 'LET']);
  return {
    get state() { return s; },
    actions, steps,
    do(...as: Array<ScoreAction | null | undefined>) {
      for (const raw of as) {
        if (!raw) continue;
        t += 25_000;
        const a = STAMP.has(raw.type) && raw.payload?.at == null ? stamped(raw, t) : raw;
        const prev = s;
        s = reducer(s, a);
        actions.push(a);
        steps.push({ type: a.type, prev, next: s });
      }
    },
  };
}
const voiceCtx = (state: unknown) => ({ state, homeName: 'Lions', awayName: 'Tigers', homeRoster: HOME, awayRoster: AWAY });
/** The editor's correction (RallyPointEditor): re-credit the first credited
 *  point to the partner, drop one point, insert one for the away side. */
function correction(rows: EditRow[], normalize?: (pts: PointInput[]) => PointInput[]): ScoreAction[] {
  const list = rows.map((r) => r.p);
  const edited = list.map((p) => ({ ...p }));
  const i = edited.findIndex((p) => p.playerId === 'h1' && (p.kind === 'point' || p.kind === 'ace') && !p.pd && !p.pen);
  if (i >= 0) edited[i] = { ...edited[i], playerId: 'h2' };
  edited.splice(2, 1);
  edited.splice(4, 0, { side: 'away', kind: 'point', playerId: 'a1' });
  return correctionActions(list, edited, rosterId, defaultCredits, normalize);
}
const blockText = (blocks: CommentaryBlock[]) => JSON.stringify(blocks);
const boxNames = (src: MatchBoxSource) => { const d = src.data('all'); return [...d.home.rows, ...d.away.rows].map((r) => r.name); };
/** The display builders get FULL-name rosters (the scorer's squads) plus the
 *  viewer's lookup — the lookup must win, by id. */
const fullCtx: BoxContext = { homeRoster: HOME, awayRoster: AWAY, nameOf: viewer };
const commentaryNames = { homeName: 'Lions', awayName: 'Tigers', homeRoster: HOME.map((p) => ({ id: p.id, name: p.fullName })), awayRoster: AWAY.map((p) => ({ id: p.id, name: p.fullName })), nameOf: viewer };

function assertDisplays(label: string, o: { blocks: CommentaryBlock[]; box: MatchBoxSource; steps: Array<{ type: string; prev: unknown; next: unknown }>; events: LiveEvent[] }) {
  const text = blockText(o.blocks);
  assertNoNames(`${label} commentary`, o.blocks);
  assert.ok(text.includes('Z. Q.'), `${label} commentary names Zebedee by initials`);
  const names = boxNames(o.box);
  assertNoNames(`${label} box score`, names);
  assert.ok(names.includes('Z. Q.') && names.includes('B. W.'), `${label} box names by initials: ${names}`);
  // undo labels for every step, as the scorer's undo bar reads them
  const labels = o.steps.map((st) => undoLabel(st, { home: 'Lions', away: 'Tigers', player: viewer }) ?? '');
  assertNoNames(`${label} undo labels`, labels);
  assert.ok(labels.some((l) => /Z\. Q\.|P\. R\.|B\. W\.|C\. F\./.test(l)), `${label}: an undo label names a player by initials`);
  // conduct / timeout records and point detail read through the lookup too
  for (const e of o.events) {
    assertNoNames(`${label} record detail`, markDetail(e, viewer) ?? '');
    if (e.pd) assertNoNames(`${label} point detail`, pdText(e.pd, true, undefined, viewer));
  }
}

// ----------------------------------------------------------------- badminton --

describe('IDs-only · badminton (doubles)', () => {
  const m = scripted(badminton.reducer, badminton.init({ playersPerSide: 2, pointsPerGame: 21, gamesToWin: 2 }));
  m.do({ type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
  m.do(doublesOrderAction('server', HOME[0]), doublesOrderAction('receiver', AWAY[0]));
  m.do({ type: 'SET_DETAIL', payload: { pointDetail: true, rallyDetail: true } });
  for (let i = 0; i < 21; i++) {
    m.do(pointAction('home', HOME[i % 2]));
    if (i % 3 === 0) m.do({ type: 'POINT_DETAIL', payload: { pd: { how: 'winner', wing: 'fh', shot: 'smash' }, rallyLen: '0-4' } });
    if (i < 15) m.do(pointAction('away', i % 4 === 0 ? null : AWAY[i % 2]));
    if (i % 5 === 1) m.do({ type: 'POINT_DETAIL', payload: { pd: { how: 'ue', err: errOf(HOME[1]) } } });
  }
  m.do(conductAction('away', { level: 'warning', reason: 'Delaying play' }, AWAY[1]));
  m.do(conductAction('home', { level: 'point', reason: 'Leaving the court' }, HOME[1]));
  m.do(doublesOrderAction('server', AWAY[1]), doublesOrderAction('receiver', HOME[1]));
  m.do(...(pointVoice('Zebedee scores', voiceCtx(m.state)) ?? []));
  for (let i = 0; i < 6; i++) m.do(pointAction(i % 2 ? 'home' : 'away', i % 2 ? HOME[0] : AWAY[0]));
  m.do(...correction(pointRows(m.state.events)));

  test('state and every action carry ids only', () => {
    assertNoNames('badminton state', m.state);
    assertActionsClean(m.actions);
    assert.ok(m.state.events.some((e) => e.playerId === 'h1'), 'points keep the player id');
    assert.ok(m.state.events.every((e) => e.playerName === undefined));
  });
  test('the commentary, box score and undo label show initials', () => {
    assertDisplays('badminton', { blocks: racketCommentary('badminton', m.state, commentaryNames), box: badmintonBox(m.state, fullCtx), steps: m.steps, events: m.state.events });
    const text = blockText(racketCommentary('badminton', m.state, commentaryNames));
    assert.match(text, /P\. R\. loses the point with an Unforced Error/);
  });
});

// -------------------------------------------------------------------- tennis --

describe('IDs-only · tennis (doubles)', () => {
  const m = scripted(tennis.reducer, tennis.init({ playersPerSide: 2, setsToWin: 2 }));
  m.do({ type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
  m.do(serveOrderAction('home', 0, HOME[0]), serveOrderAction('away', 1, AWAY[1]));
  m.do({ type: 'SET_DETAIL', payload: { pointDetail: true, serveDetail: true } });
  const game = (w: Side, who: Player | null, ace = false) => { for (let i = 0; i < 4; i++) m.do(pointAction(w, who, ace && i === 0 ? { type: 'ACE' } : {})); };
  game('home', HOME[0], true);
  m.do({ type: 'POINT_DETAIL', payload: { pd: { how: 'fe', err: errOf(AWAY[0]) } } });
  game('away', AWAY[0]);
  m.do(doubleFaultAction('home', HOME[1]));
  game('home', HOME[1]);
  m.do(conductAction('away', { level: 'warning', reason: 'Racket abuse' }, AWAY[1]));
  m.do(conductAction('away', { level: 'point', reason: 'Racket abuse' }, AWAY[1]));
  m.do(timeoutAction('home', 'medical', HOME[0]));
  m.do(...(tennisVoice('ace Zebedee', voiceCtx(m.state)) ?? []));
  m.do(...(tennisVoice('double fault Bartholomew', voiceCtx(m.state)) ?? []));
  for (let g = 0; g < 4; g++) game(g % 2 ? 'away' : 'home', g % 2 ? AWAY[g % 2] : HOME[0]);
  m.do(...correction(pointRows(m.state.events)));

  test('state and every action carry ids only', () => {
    assertNoNames('tennis state', m.state);
    assertActionsClean(m.actions);
    assert.ok(m.state.events.some((e) => e.df?.playerId === 'h2'), 'a double fault keeps the server id');
    assert.ok(m.state.events.some((e) => e.pen?.playerId === 'a2'), 'a code violation keeps the offender id');
    assert.ok(m.state.events.some((e) => e.kind === 'timeout' && e.playerId === 'h1'));
  });
  test('the commentary, box score and undo label show initials', () => {
    const blocks = tennisCommentary(m.state, commentaryNames);
    assertDisplays('tennis', { blocks, box: tennisBox(m.state, fullCtx), steps: m.steps, events: m.state.events });
    const text = blockText(blocks);
    assert.match(text, /P\. R\. double faults/);
    assert.match(text, /B\. W\. loses the point with a Forced Error/);
    assert.match(text, /Racket abuse · C\. F\./);
    // the double-fault column names the server by initials
    const box = tennisBox(m.state, fullCtx).data('all');
    assert.ok(box.home.rows.some((r) => r.name === 'P. R.' && (r.stats.doubleFaults ?? 0) >= 1));
  });
});

// --------------------------------------------------------------------- padel --

describe('IDs-only · padel (doubles)', () => {
  const m = scripted(padel.reducer, padel.init({ deuce: 'golden', gamesPerSet: 6, setsToWin: 2, playersPerSide: 2 }));
  m.do({ type: 'SET_FIRST_SERVER', payload: { side: 'away' } });
  m.do(serveOrderAction('home', 1, HOME[1]), serveOrderAction('away', 0, AWAY[0]));
  m.do({ type: 'SET_DETAIL', payload: { pointDetail: true } });
  for (let g = 0; g < 6; g++) {
    const w: Side = g % 3 === 2 ? 'away' : 'home';
    const team = w === 'home' ? HOME : AWAY;
    for (let i = 0; i < 4; i++) m.do(pointAction(w, team[i % 2]));
    m.do({ type: 'POINT_DETAIL', payload: { pd: { how: 'ue', err: errOf(w === 'home' ? AWAY[1] : HOME[0]) } } });
  }
  m.do(pointAction('away', AWAY[0], { payload: { pd: { how: 'ace' } } }));
  m.do(doubleFaultAction('away', AWAY[0]));
  m.do(conductAction('home', { level: 'warning', reason: 'Ball abuse' }, HOME[0]));
  m.do(...(pointVoice('point Clementine', voiceCtx(m.state)) ?? []));
  m.do(...correction(pointRows(m.state.events)));

  test('state and every action carry ids only', () => {
    assertNoNames('padel state', m.state);
    assertActionsClean(m.actions);
  });
  test('the commentary, box score and undo label show initials', () => {
    assertDisplays('padel', { blocks: racketCommentary('padel', m.state, commentaryNames), box: padelBox(m.state, fullCtx), steps: m.steps, events: m.state.events });
  });
});

// ---------------------------------------------- the rally engine: TT / squash / pickleball --

const ENGINES = {
  tabletennis: makeRallyEngine({ id: 'tabletennis', icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } }),
  squash: makeRallyEngine({ id: 'squash', icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } }),
  pickleball: makeRallyEngine({ id: 'pickleball', icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } }),
};

function rallyMatch(sport: 'tabletennis' | 'squash' | 'pickleball', cfg: Record<string, unknown>, extra: (m: ReturnType<typeof scripted<RallyState>>) => void) {
  const eng = ENGINES[sport];
  const m = scripted<RallyState>(eng.reducer, eng.init(cfg));
  extra(m);
  // side-out scoring: the editor normalises the list to what it replays to (rallyCore)
  const s = m.state;
  const normalize = s.sideOut ? (pts: PointInput[]) => rallyInputs(eng.reducer(s, { type: 'EDIT_LOG', payload: { points: pts } }).events) : undefined;
  m.do(...correction(rallyRows(s.events), normalize));
  return m;
}

describe('IDs-only · table tennis (doubles)', () => {
  const m = rallyMatch('tabletennis', { playersPerSide: 2 }, (m) => {
    m.do({ type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    m.do(doublesOrderAction('server', HOME[0]), doublesOrderAction('receiver', AWAY[1]));
    m.do({ type: 'SET_DETAIL', payload: { pointDetail: true, rallyDetail: true } });
    for (let i = 0; i < 11; i++) {
      m.do(pointAction('home', HOME[i % 2]));
      if (i % 4 === 0) m.do({ type: 'POINT_DETAIL', payload: { pd: { how: 'ue', err: errOf(AWAY[0]) }, rallyLen: '0-4' } });
      if (i < 8) m.do(pointAction('away', AWAY[i % 2]));
    }
    m.do(timeoutAction('away', 'timeout', AWAY[0]));
    m.do(conductAction('home', { level: 'warning', reason: 'Bad language' }, HOME[1]));
    m.do(doublesOrderAction('server', AWAY[0]), doublesOrderAction('receiver', HOME[1]));
    m.do(...(pointVoice('Zebedee scores', voiceCtx(m.state)) ?? []));
  });
  test('state and every action carry ids only', () => {
    assertNoNames('table tennis state', m.state);
    assertActionsClean(m.actions);
  });
  test('the commentary, box score and undo label show initials', () => {
    assertDisplays('table tennis', { blocks: racketCommentary('tabletennis', m.state, commentaryNames), box: rallyBox(m.state, fullCtx, 'tabletennis'), steps: m.steps, events: m.state.events });
  });
});

describe('IDs-only · squash (singles, English scoring)', () => {
  const H = [HOME[0]], A = [AWAY[0]];
  const m = rallyMatch('squash', { scoring: 'english', pointsPerGame: 9, winBy: 1, gamesToWin: 3 }, (m) => {
    m.do({ type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    for (let i = 0; i < 12; i++) {
      // the controls credit the server when the server wins (side-out scoring)
      const w: Side = i % 3 === 2 ? 'away' : 'home';
      m.do(pointAction(w, w === m.state.serving ? (w === 'home' ? H[0] : A[0]) : null));
      if (i === 4) m.do({ type: 'LET', side: 'away' });
      if (i === 6) m.do(pointAction('home', m.state.serving === 'home' ? H[0] : null, { payload: { pd: { how: 'stroke' } } }));
    }
    m.do(conductAction('away', { level: 'warning', reason: 'Dissent' }, A[0]));
  });
  test('state and every action carry ids only', () => {
    assertNoNames('squash state', m.state);
    assertActionsClean(m.actions);
  });
  test('the commentary, box score and undo label show initials', () => {
    const blocks = racketCommentary('squash', m.state, { ...commentaryNames, homeRoster: [commentaryNames.homeRoster[0]], awayRoster: [commentaryNames.awayRoster[0]] });
    assertDisplays('squash', { blocks, box: rallyBox(m.state, { homeRoster: H, awayRoster: A, nameOf: viewer }, 'squash'), steps: m.steps, events: m.state.events });
  });
});

describe('IDs-only · pickleball (doubles, rally scoring)', () => {
  const m = rallyMatch('pickleball', { scoring: 'rally', playersPerSide: 2, pointsPerGame: 11 }, (m) => {
    m.do({ type: 'SET_FIRST_SERVER', payload: { side: 'away', alt: true, pos: 2 } });
    m.do(startRightAction('home', HOME[1]), startRightAction('away', AWAY[0]));
    m.do({ type: 'SET_DETAIL', payload: { pointDetail: true, netDetail: true, thirdDetail: true } });
    for (let i = 0; i < 11; i++) {
      m.do(pointAction('home', HOME[i % 2]));
      if (i % 3 === 0) m.do({ type: 'POINT_DETAIL', payload: { pd: { how: 'ue', err: errOf(AWAY[1]) }, atNet: 'home', third: 'drop' } });
      if (i < 9) m.do(pointAction('away', AWAY[(i + 1) % 2]));
    }
    m.do(timeoutAction('home', 'timeout', HOME[0]), timeoutAction('away', 'medical', AWAY[1]));
    m.do(conductAction('away', { level: 'warning', reason: 'Paddle abuse' }, AWAY[1]));
    m.do(startRightAction('home', HOME[0], true));
    m.do(...(pointVoice('Bartholomew scores', voiceCtx(m.state)) ?? []));
  });
  test('state and every action carry ids only', () => {
    assertNoNames('pickleball state', m.state);
    assertActionsClean(m.actions);
    assert.equal(m.state.startRight?.home, 'h1');
  });
  test('the commentary, box score and undo label show initials', () => {
    assertDisplays('pickleball', { blocks: racketCommentary('pickleball', m.state, commentaryNames), box: rallyBox(m.state, fullCtx, 'pickleball'), steps: m.steps, events: m.state.events });
  });
});

// ------------------------------------------------------------ legacy logs --

describe('IDs-only · an older (named) log still reads as before', () => {
  const named = (a: ScoreAction): ScoreAction => (a.attribution
    ? { ...a, attribution: { ...a.attribution, playerName: EVERYONE.find((p) => p.id === a.attribution!.playerId)?.fullName } } : a);
  test('badminton: the stored name shows with no lookup; the viewer sees initials by id', () => {
    const s = [pointAction('home', HOME[0]), pointAction('away', AWAY[1])].map(named).reduce(badminton.reducer, badminton.init({ playersPerSide: 2 }));
    assert.equal(s.events[0].detail, '1-0 · Zebedee Quartermaine'); // replayed exactly as it was stored
    const plain = blockText(racketCommentary('badminton', s, { homeName: 'Lions', awayName: 'Tigers' }));
    assert.match(plain, /Point to Zebedee Quartermaine/);
    const masked = blockText(racketCommentary('badminton', s, { homeName: 'Lions', awayName: 'Tigers', nameOf: viewer }));
    assert.match(masked, /Point to Z\. Q\./);
    assertNoNames('legacy log via the viewer lookup', racketCommentary('badminton', s, { homeName: 'Lions', awayName: 'Tigers', nameOf: viewer }));
  });
  test('a correction of an older log stores ids only (names resolved through the squads)', () => {
    const s = [pointAction('home', HOME[0]), pointAction('away', AWAY[1]), pointAction('home', HOME[1])].map(named)
      .reduce(badminton.reducer, badminton.init({ playersPerSide: 2 }));
    const list = pointRows(s.events).map((r) => r.p);
    assert.equal(list[0].playerName, 'Zebedee Quartermaine'); // the old row
    const acts = correctionActions(list, list.slice(1), rosterId);
    assertActionsClean(acts);
    const next = acts.reduce(badminton.reducer, s);
    assertNoNames('corrected older log', next.events);
    assert.deepEqual(next.events.filter((e) => e.kind === 'point').map((e) => e.playerId), ['a2', 'h2']);
  });
  test('an older penalty record: the stored name is swapped for the viewer\'s', () => {
    const e = { id: 1, stamp: 'Set 1', icon: '🟥', label: 'Code violation · point penalty', detail: 'Racket abuse · Zebedee Quartermaine · 15-0', kind: 'point', side: 'away', pen: { level: 'point', by: 'home', playerId: 'h1', playerName: 'Zebedee Quartermaine', reason: 'Racket abuse' } } as LiveEvent;
    assert.equal(markDetail(e), 'Racket abuse · Zebedee Quartermaine · 15-0');
    assert.equal(markDetail(e, viewer), 'Racket abuse · Z. Q. · 15-0');
    const fresh = { ...e, detail: 'Racket abuse · 15-0', pen: { level: 'point', by: 'home', playerId: 'h1', reason: 'Racket abuse' } } as LiveEvent;
    assert.equal(markDetail(fresh, viewer), 'Racket abuse · Z. Q. · 15-0');
  });
});


// -------------------------------------------- the controls never write a name --

describe('IDs-only · no scorer control copies a name into an action', () => {
  // React Native components can't run here: their dispatches are checked by
  // source (the pure builders above are what they call). The commentary tabs
  // map squads to { id, name } for display only — not scoring data.
  const DISPLAY_ONLY = /(^|\/)(Commentary|RacketCommentary|ServeCourtPanel|CommentaryFeed)\.tsx$/;
  const root = new URL('../src/sports/', import.meta.url);
  const files = [
    'rallyCore.tsx', 'RacketQuickOptions.tsx', 'PointDetailRow.tsx', 'RallyPointEditor.tsx', 'ServeOrderPicker.tsx', 'DoublesOrderPicker.tsx',
    'racketActions.ts', 'PointButtons.tsx',
    ...['badminton', 'tennis', 'padel', 'pickleball', 'squash', 'tabletennis', 'volleyball']
      .flatMap((d) => readdirSync(new URL(d, root)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${d}/${f}`)),
  ].filter((f) => !DISPLAY_ONLY.test(f));
  test('no `playerName: x.fullName` / `name: x.fullName` in the racket and volleyball controls', () => {
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(new URL(f, root), 'utf8').split('\n').forEach((line, i) => {
        if (/(playerName|\bname)\s*:\s*[\w.?!\[\]()]*fullName/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(bad, []);
  });
});
