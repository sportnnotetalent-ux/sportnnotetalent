/**
 * IDs-only scoring guard (docs/privacy/ids-only-scoring.md) — volleyball.
 *
 * Match state (`matches.state`) and events (`match_events` attribution /
 * payload) are public, logged out included. A realistic match scripted the
 * way the scorer's controls build it (engine `outcomeAction`, the builders in
 * volleyball/actions.ts — court stamp, toss, rotation, substitutions, detail
 * entries, sanctions — the voice parser and the timeline editor's
 * `correctionActions`), with players whose full names are distinctive:
 *   1. no full name (nor a distinctive part of one) in the reduced state or
 *      in any action's attribution / attribution2 / payload;
 *   2. the commentary, the box scores, the match stats and the scorer's sub
 *      checks, given a `nameOf` that maps ids to initials, show the initials
 *      — never a full name, even with full-name squads passed alongside.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { nameInitials, type NameOf } from '../src/core/playerNames.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { lineupAction, rotationAction, subAction, detailAction, sanctionAction, courtPlayer } from '../src/sports/volleyball/actions.ts';
import { volleyballVoice } from '../src/sports/voiceParsers.ts';
import { pointInputs, correctionActions, type PointInput } from '../src/sports/rallyEdit.ts';
import { volleyballCommentary } from '../src/sports/volleyball/commentary.ts';
import { volleyballBox } from '../src/sports/boxSources.ts';
import { volleyballDeepBox } from '../src/sports/volleyball/deepBox.ts';
import { volleyballMatchStats } from '../src/sports/volleyball/matchStats.ts';
import { checkSub, liberoCue, trackCourt } from '../src/sports/volleyball/rotation.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';

type Side = 'home' | 'away';
const P = (id: string, fullName: string) => ({ id, fullName } as Player);
const HOME = [
  P('h1', 'Zebedee Quartermaine'), P('h2', 'Philomena Ravenscroft'), P('h3', 'Octavius Pemberton'),
  P('h4', 'Isadora Thistlewood'), P('h5', 'Leopold Ashcombe'), P('h6', 'Wilhelmina Blackwood'), P('h7', 'Cornelius Featherstonehaugh'), P('h8', 'Eudora Applethwaite'),
];
const AWAY = [
  P('a1', 'Bartholomew Wigglesworth'), P('a2', 'Clementine Fairweather'), P('a3', 'Montgomery Bramblecote'),
  P('a4', 'Prudence Hollingsworth'), P('a5', 'Ignatius Cobblestone'), P('a6', 'Rosalind Merriweather'), P('a7', 'Barnaby Thornbury'),
];
const EVERYONE = [...HOME, ...AWAY];
const SECRETS = EVERYONE.flatMap((p) => [p.fullName, ...p.fullName.split(' ')]);
const INITIALS: Record<string, string> = Object.fromEntries(EVERYONE.map((p) => [p.id, nameInitials(p.fullName)]));
const viewer: NameOf = (id, legacy) => (id && INITIALS[id]) || (legacy ?? '').trim() || 'Player';
const rosterId = (name?: string) => EVERYONE.find((p) => p.fullName === name)?.id;

function assertNoNames(what: string, value: unknown) {
  const json = JSON.stringify(value) ?? '';
  for (const s of SECRETS) assert.ok(!json.includes(s), `${what} must not contain "${s}": ${json.slice(0, 400)}`);
}

/** The match, as the controls dispatch it (index.tsx: the court stamp before
 *  the first point, every scoring step stamped with the scorer's clock). */
function scriptedMatch() {
  let s = vb.init({ setsToWin: 2, pointsPerSet: 15, deciderPoints: 15 });
  let t = Date.UTC(2026, 9, 24, 10);
  const actions: ScoreAction[] = [];
  const steps: Array<{ type: string; prev: unknown; next: unknown }> = [];
  const go = (...as: Array<ScoreAction | null | undefined>) => {
    for (const raw of as) {
      if (!raw) continue;
      t += 20_000;
      const a = vb.stampAction(raw, t);
      const prev = s;
      s = vb.reducer(s, a);
      actions.push(a);
      steps.push({ type: a.type, prev, next: s });
    }
  };
  const six = (team: Player[]) => team.slice(0, 6);
  go(lineupAction('home', six(HOME)), lineupAction('away', six(AWAY)));
  go({ type: 'SET_SERVE', payload: { side: 'home', set: 1 } });
  go(rotationAction('home', 1, six(HOME), [HOME[7]]), rotationAction('away', 1, six(AWAY), [AWAY[6]]));
  go({ type: 'SET_DETAIL', payload: { vbAttack: true, vbReception: true, vbDig: true, vbAssist: true } });
  const credit = (side: Side, i: number) => (side === 'home' ? HOME : AWAY)[i % 6];
  const outcomes: vb.VbOutcome[] = ['attack', 'block', 'ace', 'attack', 'opperror', 'serveerror'];
  for (let i = 0; i < 26; i++) {
    const side: Side = i % 3 === 2 ? 'away' : 'home';
    const kind = outcomes[i % outcomes.length];
    const opp = side === 'home' ? AWAY : HOME;
    if (kind === 'opperror') go(vb.outcomeAction('opperror', side, undefined, { err: i % 2 ? 'attackout' : 'net', by: opp[i % 6] }));
    else if (kind === 'serveerror') go(vb.outcomeAction('serveerror', side, undefined, { by: opp[(i + 1) % 6] }));
    else go(vb.outcomeAction(kind, side, credit(side, i)));
    if (kind === 'attack') go(detailAction('assist', side, credit(side, i + 1)));
    if (kind === 'block') go(detailAction('blocked', side === 'home' ? 'away' : 'home', opp[i % 6]));
    if (kind === 'ace') go(detailAction('aced', side === 'home' ? 'away' : 'home', opp[(i + 2) % 6]));
    if (i % 4 === 0) go(detailAction('reception', side, credit(side, i + 2), 'good'), detailAction('dig', side, credit(side, i + 3)), detailAction('inplay', side, credit(side, i + 4)));
    if (i === 7) go({ type: 'TIMEOUT', side: 'away' });
    if (i === 9) go(subAction('home', HOME[2], HOME[6], 'regular'));
    if (i === 11) go(subAction('away', AWAY[4], AWAY[6], 'libero'));
    if (i === 12) go(sanctionAction('away', 'warning', { reason: 'Rude conduct', player: AWAY[1] }));
    if (i === 13) go(sanctionAction('home', 'penalty', { reason: 'Offensive conduct', player: HOME[3] }));
    if (i === 14) go(sanctionAction('away', 'disqualification', { player: AWAY[2] }));
    if (i === 15) go(sanctionAction('home', 'delayWarning'));
  }
  go(...(volleyballVoice('attack Zebedee', { state: s, homeName: 'Lions', awayName: 'Tigers', homeRoster: HOME, awayRoster: AWAY }) ?? []));
  go(...(volleyballVoice('block Bartholomew', { state: s, homeName: 'Lions', awayName: 'Tigers', homeRoster: HOME, awayRoster: AWAY }) ?? []));
  // the timeline editor: re-credit a kill, turn a point into an opponent's fault with its player, drop one, insert one
  const list = pointInputs(s.events);
  const edited: PointInput[] = list.map((p) => ({ ...p }));
  const k = edited.findIndex((p) => p.kind === 'attack' && p.playerId === 'h1');
  if (k >= 0) edited[k] = { ...edited[k], playerId: 'h4' };
  edited.splice(5, 1);
  edited.splice(8, 0, { side: 'away', kind: 'opperror', oe: { type: 'net', playerId: 'h5' } });
  go(...correctionActions(list, edited, rosterId, vb.volleyballCredits));
  return { state: s, actions, steps };
}

describe('IDs-only · volleyball', () => {
  const m = scriptedMatch();

  test('state and every action carry ids only', () => {
    assertNoNames('volleyball state', m.state);
    for (const a of m.actions) {
      assertNoNames(`${a.type} attribution`, a.attribution ?? null);
      assertNoNames(`${a.type} attribution2`, a.attribution2 ?? null);
      assertNoNames(`${a.type} payload`, a.payload ?? null);
    }
    // what the ids are for is all still there
    const s = m.state;
    assert.ok(s.events.some((e) => e.kind === 'attack' && e.playerId), 'kills keep the attacker id');
    assert.ok(s.events.some((e) => e.oe?.playerId), 'a named fault keeps the opponent id');
    assert.ok(s.events.some((e) => e.vs?.playerId === 'a2'), 'a sanction keeps the offender id');
    assert.ok((s.subs ?? []).some((x) => x.on.id === 'h7' && x.on.name === undefined));
    assert.ok((s.vd ?? []).length > 0 && (s.vd ?? []).every((x) => x.playerId && x.playerName === undefined));
    assert.ok(s.lineup?.home?.every((p) => p.name === undefined));
  });

  test('the commentary names players by id (initials for this viewer)', () => {
    const feed = volleyballCommentary(m.state, { home: 'Lions', away: 'Tigers', nameOf: viewer, homeRoster: HOME, awayRoster: AWAY });
    assertNoNames('volleyball commentary', feed);
    const text = JSON.stringify(feed);
    assert.match(text, /kill by [A-Z]\. [A-Z]\./);
    assert.match(text, /Substitution Lions: C\. F\. in for O\. P\./);
    assert.match(text, /Warning — C\. F\. \(Tigers\): rude conduct/);
    assert.match(text, /serving/);
  });

  test('the box scores and match stats key by id and show initials', () => {
    const ctx = { homeRoster: HOME, awayRoster: AWAY, nameOf: viewer };
    for (const src of [volleyballBox(m.state, ctx), volleyballDeepBox(m.state, ctx)]) {
      const d = src.data('all');
      const names = [...d.home.rows, ...d.away.rows].map((r) => r.name);
      assertNoNames('volleyball box', names);
      assert.ok(names.includes('Z. Q.') || names.includes('I. T.'), `box names: ${names}`);
      assert.ok([...d.home.rows, ...d.away.rows].every((r) => r.playerId), 'every row is a player id');
      assert.equal(new Set(names.map((n, i) => `${n}|${[...d.home.rows, ...d.away.rows][i].playerId}`)).size, names.length, 'one row per player');
    }
    const st = volleyballMatchStats(m.state);
    assertNoNames('volleyball match stats', st);
    const rot = st.rotations.home ?? [];
    assert.ok(rot.length > 0 && rot.every((r) => r.id && r.name === ''), 'rotation rows by id (names looked up when shown)');
    assert.ok(rot.map((r) => viewer(r.id, r.name)).every((n) => /^[A-Z]\. [A-Z]\.$/.test(n)));
  });

  test('stat totals resolve by id without any name', () => {
    const t = volleyballStatTotals(m.state);
    assert.ok(t.h4 && (t.h4.stats.points ?? 0) > 0, 'the re-credited kill landed on h4');
    assert.ok(t.h5 && t.h5.stats.errors === 1, 'the inserted fault charged h5');
  });

  test('the scorer\'s sub checks and cues name players by id', () => {
    const s = m.state;
    const t = trackCourt(s);
    const on = t.court.away?.[0];
    assert.ok(on);
    const c = checkSub(s, 'away', courtPlayer(AWAY[1]), courtPlayer(AWAY[2]), undefined, viewer);
    assertNoNames('sub check', c.issues);
    assert.ok(c.issues.some((x) => /M\. B\./.test(x)), `the expelled player by initials: ${c.issues}`);
    assertNoNames('libero cue', liberoCue(s, 'away', t, viewer) ?? '');
  });

  test('undo labels name players by id', () => {
    const labels = m.steps.map((st) => undoLabel(st, { home: 'Lions', away: 'Tigers', player: viewer }) ?? '');
    assertNoNames('undo labels', labels);
  });
});

describe('IDs-only · volleyball — an older (named) log still reads as before', () => {
  // an older app wrote the name beside every id (court stamp + credits)
  const fullName = (id: string) => EVERYONE.find((p) => p.id === id)?.fullName;
  const named = (a: ScoreAction): ScoreAction => {
    if (a.type === 'LINEUP') return { ...a, payload: { ...a.payload, players: (a.payload!.players as Array<{ id: string }>).map((p) => ({ id: p.id, name: fullName(p.id) })) } };
    return a.attribution ? { ...a, attribution: { ...a.attribution, playerName: fullName(a.attribution.playerId) } } : a;
  };
  test('stored names show with no lookup; the viewer sees initials by id', () => {
    const s = [lineupAction('home', HOME.slice(0, 6)), lineupAction('away', AWAY.slice(0, 6)), vb.outcomeAction('attack', 'home', HOME[0]), vb.outcomeAction('block', 'away', AWAY[0])]
      .map(named).reduce(vb.reducer, vb.init());
    assert.equal(s.events[0].playerName, 'Zebedee Quartermaine'); // replayed exactly as stored
    assert.equal(s.events[0].playerId, 'h1');
    assert.equal(s.events[0].detail, '1-0 · Zebedee Quartermaine');
    const plain = JSON.stringify(volleyballCommentary(s, { home: 'Lions', away: 'Tigers' }));
    assert.match(plain, /kill by Zebedee Quartermaine/);
    assert.deepEqual(volleyballBox(s).data('all').home.rows.map((r) => r.name), ['Zebedee Quartermaine']);
    // a viewer outside the circle: by id, the stored name is only the fallback
    const masked = volleyballCommentary(s, { home: 'Lions', away: 'Tigers', nameOf: viewer });
    assertNoNames('older log via the viewer lookup', masked);
    assert.match(JSON.stringify(masked), /kill by Z\. Q\./);
    assert.deepEqual(volleyballBox(s, { nameOf: viewer }).data('all').home.rows.map((r) => r.name), ['Z. Q.']);
  });
  test('a name-only credit (before court stamps) keeps its stored name until the clean-up maps it', () => {
    const s = [vb.outcomeAction('attack', 'home', HOME[0])].map(named).reduce(vb.reducer, vb.init());
    assert.equal(s.events[0].playerId, undefined); // no id to look up (pre SD-29)
    assert.match(JSON.stringify(volleyballCommentary(s, { home: 'Lions', away: 'Tigers', nameOf: viewer })), /kill by Zebedee Quartermaine/);
  });
});
