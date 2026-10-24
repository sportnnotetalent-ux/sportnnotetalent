/**
 * IDs-only scoring guard (docs/privacy/ids-only-scoring.md) — kabaddi.
 *
 * Match state (`matches.state`) and events (`match_events` attribution /
 * payload) are public, logged out included. A realistic match scripted the
 * way the scorer's controls build it (engine `raidActions` — raids with
 * touches, bonus, skills, named touched defenders, tackles, a super tackle,
 * an all-out, do-or-die, line-outs, an edit of a past raid — and the builders
 * in kabaddi/actions.ts: substitutions incl. a return, cards, technical
 * points, the timeline's ✕ remove; plus the voice parser), with players whose
 * full names are distinctive:
 *   1. no full name (nor a distinctive part of one) in the reduced state or in
 *      any action's attribution / attribution2 / payload;
 *   2. what tracks players (subbed off, the revival queue, who is unavailable,
 *      the totals) is keyed by id;
 *   3. the commentary, the box scores, the match centre, the live suspension
 *      banner, the timeline's player text and the undo label, given a `nameOf`
 *      that maps ids to initials, show the initials — never a full name, even
 *      with full-name squads passed alongside;
 *   4. an older (named) log still replays and reads exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { nameInitials, type NameOf } from '../src/core/playerNames.ts';
import * as kb from '../src/sports/kabaddi/engine.ts';
import { subAction, cardAction, techPointAction, removeEventAction } from '../src/sports/kabaddi/actions.ts';
import { kabaddiEventDetail, subPlayers } from '../src/sports/kabaddi/names.ts';
import { kabaddiCommentary } from '../src/sports/kabaddi/commentary.ts';
import { kabaddiMatchStats } from '../src/sports/kabaddi/matchStats.ts';
import { kabaddiDeepBox } from '../src/sports/kabaddi/deepBox.ts';
import { kabaddiTotals, kabaddiSuspended } from '../src/sports/kabaddi/totals.ts';
import { kabaddiMatchRecords } from '../src/sports/kabaddi/records.ts';
import { KABADDI_DISCIPLINE } from '../src/sports/kabaddi/discipline.ts';
import { kabaddiBox } from '../src/sports/boxSources.ts';
import { kabaddiVoice } from '../src/sports/voiceParsers.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';

type Side = 'home' | 'away';
const P = (id: string, fullName: string) => ({ id, fullName } as Player);
const HOME = [
  P('h1', 'Zebedee Quartermaine'), P('h2', 'Philomena Ravenscroft'), P('h3', 'Octavius Pemberton'), P('h4', 'Isadora Thistlewood'),
  P('h5', 'Leopold Ashcombe'), P('h6', 'Wilhelmina Blackwood'), P('h7', 'Cornelius Featherstonehaugh'), P('h8', 'Eudora Applethwaite'),
];
const AWAY = [
  P('a1', 'Bartholomew Wigglesworth'), P('a2', 'Clementine Fairweather'), P('a3', 'Montgomery Bramblecote'), P('a4', 'Prudence Hollingsworth'),
  P('a5', 'Ignatius Cobblestone'), P('a6', 'Rosalind Merriweather'), P('a7', 'Barnaby Thornbury'), P('a8', 'Ottoline Gainsborough'),
];
const EVERYONE = [...HOME, ...AWAY];
const SECRETS = EVERYONE.flatMap((p) => [p.fullName, ...p.fullName.split(' ')]);
const INITIALS: Record<string, string> = Object.fromEntries(EVERYONE.map((p) => [p.id, nameInitials(p.fullName)]));
/** A viewer outside the children's circle: initials by id. */
const viewer: NameOf = (id, legacy) => (id && INITIALS[id]) || (legacy ?? '').trim() || 'Player';
const rosterId = (name?: string) => EVERYONE.find((p) => p.fullName === name)?.id;
const byId = (id: string) => EVERYONE.find((p) => p.id === id)!;
const H = (i: number) => HOME[i - 1];
const A = (i: number) => AWAY[i - 1];
const NAMES = { home: 'Lions', away: 'Tigers' };

function assertNoNames(what: string, value: unknown) {
  const json = JSON.stringify(value) ?? '';
  for (const s of SECRETS) assert.ok(!json.includes(s), `${what} must not contain "${s}": ${json.slice(0, 400)}`);
}

const CFG = {
  playersPerSide: 7, style: 'sanjeevani', superTackle: true, doOrDie: true, caughtTouches: 'void',
  substitutes: 3, subReturn: true, trackSkills: true, trackTouched: true, halfMinutes: 20,
};
const T0 = Date.UTC(2026, 9, 24, 10);

/** The scorer, as the controls dispatch (index.tsx): scoring steps go through
 *  `fire` (stamped with the minute / half and, live, the clock); REMOVE_EVENT,
 *  KICKOFF, PAUSE / RESUME and the period buttons go out as they are. */
class Scorer {
  s = kb.init(CFG);
  actions: ScoreAction[] = [];
  steps: Array<{ type: string; prev: unknown; next: unknown }> = [];
  /** snapshots by label, for the live-only checks */
  at: Record<string, kb.KabaddiState> = {};
  minute = 0;
  half = 1;
  private t0 = T0;
  raw(a: ScoreAction) {
    const prev = this.s;
    this.s = kb.reducer(this.s, a);
    this.actions.push(a);
    this.steps.push({ type: a.type, prev, next: this.s });
    return this;
  }
  fire(a: ScoreAction) {
    const at = this.t0 + (this.minute - (this.half - 1) * 20) * 60000 + 5000;
    return this.raw({ ...a, payload: { ...a.payload, minute: this.minute, half: this.half, ...(this.s.startedAt ? { at } : null) } });
  }
  kickoff(minute: number) { this.minute = minute; this.t0 = T0 + minute * 60000; return this.raw({ type: 'KICKOFF', payload: { at: this.t0 } }); }
  raid(f: Partial<kb.RaidForm> & { side: Side }, minute = this.minute + 1) {
    this.minute = minute;
    for (const a of kb.raidActions(this.s, { touches: 0, bonus: false, tackled: false, ...f }, rosterId)) {
      if (a.type === 'REMOVE_EVENT') this.raw(a); else this.fire(a);
    }
    return this;
  }
  /** the scorer's clock now (match minutes) */
  clock() { return kb.clockAt(this.s, this.t0 + (this.minute - (this.half - 1) * 20) * 60000 + 10000); }
}

function scriptedMatch() {
  const m = new Scorer();
  m.kickoff(0);
  // 1st half: raids with touches (named defenders), bonus, skills
  m.raid({ side: 'home', raider: H(1), touches: 2, bonus: true, skill: 'running', touched: [A(1), A(2)] }, 1);
  m.raid({ side: 'away', raider: A(3), tackled: true, tackler: H(2), tackleType: 'ankle' }, 2);
  m.raid({ side: 'home', raider: H(3) }, 3); // empty
  m.raid({ side: 'away', raider: A(4), touches: 1, touched: [H(5)], skill: 'toe' }, 4); // revives a1
  m.raid({ side: 'home', raider: H(1), touches: 3, touched: [A(5), A(6), A(7)], skill: 'hand' }, 5); // super raid
  m.raid({ side: 'home', raider: H(4), tackled: true, tackler: A(4), tackleType: 'dash' }, 6); // super tackle (≤ 3 on the mat)
  m.at.superTackle = m.s;
  m.raid({ side: 'home', raider: H(6), touches: 3, touched: [A(1), A(4), A(2)] }, 7); // the mat empties: all out
  m.at.afterAllOut = m.s;
  // substitutions, cards, a technical point, a timeout and the clock
  m.minute = 8; m.fire(subAction('home', H(7), H(8)));
  m.minute = 9; m.fire(cardAction('away', 'green', A(5)));
  m.minute = 10; m.fire(cardAction('away', 'yellow', A(6)));
  m.at.yellow = m.s;
  m.minute = 11; m.fire(techPointAction('home', { reason: 'delay', by: A(7) }));
  m.minute = 11; m.fire(cardAction('away', 'green', 'official'));
  m.fire({ type: 'TIMEOUT', side: 'home' });
  m.raw({ type: 'PAUSE', payload: { at: T0 + 11 * 60000 + 30000 } }).raw({ type: 'RESUME', payload: { at: T0 + 12 * 60000 } });
  // a do-or-die raid that fails
  m.raid({ side: 'away', raider: A(1) }, 12);
  m.raid({ side: 'home', raider: H(2), touches: 1, touched: [A(3)] }, 13);
  m.raid({ side: 'away', raider: A(2) }, 13);
  m.raid({ side: 'home', raider: H(1) }, 14);
  m.raid({ side: 'away', raider: A(4) }, 14); // 3rd empty raid: do-or-die, out
  // voice: a raid, a tackle, a yellow card
  const ctx = () => ({ state: m.s, ...{ homeName: NAMES.home, awayName: NAMES.away }, homeRoster: HOME, awayRoster: AWAY });
  m.minute = 15;
  for (const a of kabaddiVoice('raid Zebedee', ctx()) ?? []) m.fire(a);
  for (const a of kabaddiVoice('tackle Bartholomew', ctx()) ?? []) m.fire(a);
  for (const a of kabaddiVoice('yellow card Montgomery', ctx()) ?? []) m.fire(a);
  m.at.voice = m.s;
  // a red card with a technical point
  m.minute = 16; m.fire(cardAction('away', 'red', A(5), { tp: 1 }));
  m.at.red = m.s;
  // an edit of the first raid (re-entered with another raider) and a ✕ remove
  const first = m.s.events.find((e) => kb.isRaidHead(e))!;
  m.raid({ side: 'home', raider: H(2), touches: 2, bonus: true, skill: 'running', touched: [A(1), A(2)], editOf: first.id }, 17);
  const tackle = m.s.events.find((e) => e.kind === 'tackle' && e.playerId === 'h2')!;
  m.raw(removeEventAction(m.s, tackle, rosterId));
  // 2nd half: line-outs, the substitute returns
  m.raw({ type: 'NEXT_HALF' });
  m.half = 2;
  m.kickoff(20);
  m.raid({ side: 'away', raider: A(8 - 1), touches: 1, defOut: 1, touched: [H(3)] }, 21);
  m.raid({ side: 'home', raider: H(3), touches: 2, lineOut: true }, 22);
  m.minute = 23; m.fire(subAction('home', H(8), H(7))); // returns (format: subReturn)
  m.minute = 24; m.fire(subAction('away', A(2), A(8)));
  m.raid({ side: 'home', raider: H(7), touches: 1, touched: [A(8)] }, 25);
  m.raw({ type: 'END' });
  return m;
}

describe('IDs-only · kabaddi', () => {
  const m = scriptedMatch();
  const s = m.s;

  test('the match played out (every kind of moment is in it)', () => {
    assert.equal(s.ended, true);
    assert.ok(s.raids.length >= 15, `raids: ${s.raids.length}`);
    const kinds = new Set(s.events.map((e) => e.kind));
    for (const k of ['raid', 'tackle', 'allout', 'sub', 'card', 'tech', 'timeout', 'lineout']) assert.ok(kinds.has(k), `a ${k} line`);
    assert.ok(s.events.some((e) => /^Super tackle/.test(e.label)), 'a super tackle');
    assert.ok(s.events.some((e) => /^Do-or-die stop/.test(e.label)), 'a failed do-or-die');
    assert.ok(s.events.some((e) => e.kind === 'sub' && e.ret), 'a substitute returned');
    assert.equal(s.raids[0].raiderId, 'h2', 'the edit re-entered raid 1');
  });

  test('state and every action carry ids only', () => {
    assertNoNames('kabaddi state', s);
    for (const a of m.actions) {
      assertNoNames(`${a.type} attribution`, a.attribution ?? null);
      assertNoNames(`${a.type} attribution2`, a.attribution2 ?? null);
      assertNoNames(`${a.type} payload`, a.payload ?? null);
    }
    for (const snap of Object.values(m.at)) assertNoNames('kabaddi state (mid-match)', snap);
    // what the ids are for is all still there
    assert.ok(s.raids.every((r) => r.raider === undefined && r.tackler === undefined));
    assert.ok(s.raids.filter((r) => r.raiderId).length >= 14);
    assert.ok(s.raids.some((r) => r.tacklerId === 'a4'));
    assert.ok(s.raids.flatMap((r) => r.touched ?? []).every((t) => t.id && t.name === undefined));
    assert.ok((s.extras ?? []).every((x) => x.playerName === undefined));
    assert.deepEqual((s.extras ?? []).filter((x) => x.playerId).map((x) => [x.x, x.card ?? '', x.playerId]),
      [['card', 'green', 'a5'], ['card', 'yellow', 'a6'], ['tech', '', 'a7'], ['card', 'yellow', 'a3'], ['card', 'red', 'a5']]);
    const subs = s.events.filter((e) => e.kind === 'sub');
    assert.deepEqual(subs.map((e) => [e.playerId, e.secondId, e.ret ?? null, e.detail ?? null]), [['h7', 'h8', null, null], ['h8', 'h7', 'h7', null], ['a2', 'a8', null, null]]);
    assert.ok(s.events.every((e) => e.playerName === undefined));
  });

  test('who is off, out or unavailable is keyed by id', () => {
    assert.deepEqual(s.subbedOff, { home: ['h8'], away: ['a2'] });
    assert.ok(kb.isSubbedOff(s, 'away', A(2)) && !kb.isSubbedOff(s, 'home', H(7)));
    // the revival queue after the all-out: everyone back for the away side
    assert.deepEqual(kb.outPlayers(m.at.afterAllOut).away, []);
    const out = kb.outPlayers(m.at.superTackle);
    for (const k of [...out.home, ...out.away]) assert.match(k, /^[ha]\d$/);
    assert.deepEqual(out.home, ['h4'], 'the super-tackled raider is out, by id');
    assert.ok(kb.listHas(out.home, H(4)));
    assert.ok(out.away.length > 0 && out.away.every((k) => /^a\d$/.test(k)), 'the touched defenders are out, by id');
    const un = kb.unavailable(m.at.red, m.clock());
    assert.deepEqual(un.away.filter((x) => x.why === 'red').map((x) => [x.key, x.id, x.name]), [['a5', 'a5', undefined]]);
    assert.equal(kb.unavailableOf(un.away, A(5))?.why, 'red');
    // the scorer's sub list: a substitution by id leaves the right player off
    const lineup = HOME.filter((p) => !kb.isSubbedOff(s, 'home', p)).map((p) => p.id);
    assert.ok(!lineup.includes('h8') && lineup.includes('h7'));
  });

  test('the totals, records and discipline count by id (no name lookup needed)', () => {
    const t = kabaddiTotals(s);
    assert.ok(t.h1 && t.h1.stats.raidPoints > 0, 'raid points by id with no squads given');
    assert.ok(t.a4 && t.a4.stats.tacklePoints === 2 && t.a4.stats.superTackles === 1);
    assert.ok(t.a1 && t.a1.stats.touchedOut >= 1);
    assert.ok(t.a5 && t.a5.stats.greenCards === 1 && t.a5.stats.redCards === 1);
    assert.equal(t.a7?.stats.techPointsConceded, 1);
    for (const id of Object.keys(t)) assert.match(id, /^[ha]\d$/);
    const rec = kabaddiMatchRecords(s);
    assertNoNames('match records', rec);
    assert.ok(rec?.items.some((i) => i.playerId) && rec.items.every((i) => i.playerName === undefined));
    const marks = KABADDI_DISCIPLINE.marks({ state: s } as never);
    assertNoNames('discipline marks', marks);
    assert.deepEqual(marks.filter((x) => x.playerId).map((x) => [x.playerId, x.col]), [['a5', 'green'], ['a6', 'yellow'], ['a3', 'yellow'], ['a5', 'red']]);
  });

  test('the commentary names players by id (initials for this viewer)', () => {
    const feed = kabaddiCommentary(s, { ...NAMES, nameOf: viewer, homeRoster: HOME, awayRoster: AWAY });
    assertNoNames('kabaddi commentary', feed);
    const text = JSON.stringify(feed);
    assert.match(text, /Raid 1 — P\. R\. \(Lions\): 2 touch points \+ bonus \(running hand touch\)/);
    assert.match(text, /Touched: B\. W\. and C\. F\./);
    assert.match(text, /SUPER TACKLE by P\. H\. \(Tigers\) with dash \(\+2\)/);
    assert.match(text, /Substitution Lions: E\. A\. in for C\. F\./);
    assert.match(text, /Substitution Lions: C\. F\. in for E\. A\. \(returns\)/);
    assert.match(text, /Yellow card — R\. M\. \(Tigers\): 2-minute suspension/);
    assert.match(text, /Technical point to Lions \(\+1\) — delay of game; B\. T\. \(Tigers\) at fault/);
    assert.match(text, /Green card — Tigers team official/);
    // with no lookup at all, the squads name them (the scorer's own view)
    assert.match(JSON.stringify(kabaddiCommentary(s, { ...NAMES, homeRoster: HOME, awayRoster: AWAY })), /Raid 1 — Philomena Ravenscroft \(Lions\)/);
  });

  test('the box scores and match centre key by id and show initials', () => {
    const ctx = { homeRoster: HOME, awayRoster: AWAY, nameOf: viewer };
    for (const src of [kabaddiBox(s, ctx), kabaddiDeepBox(s, ctx)]) {
      for (const scope of ['all', 1, 2] as const) {
        const d = src.data(scope);
        const rows = [...d.home.rows, ...d.away.rows];
        assertNoNames('kabaddi box', rows.map((r) => r.name));
        assert.ok(rows.length > 0 && rows.every((r) => r.playerId && r.name === INITIALS[r.playerId]), `rows: ${JSON.stringify(rows.map((r) => [r.playerId, r.name]))}`);
        assert.equal(new Set(rows.map((r) => r.playerId)).size, rows.length, 'one row per player');
      }
    }
    // no player-less "team" points: every credited line is a player's
    assert.equal(kabaddiBox(s, ctx).data('all').home.team?.stats.raidPoints, 0);
    const st = kabaddiMatchStats(s, 'all', viewer);
    assertNoNames('kabaddi match centre', st);
    const leaders = [st.leaders.home.raider, st.leaders.home.defender, st.leaders.away.raider, st.leaders.away.defender].filter(Boolean);
    assert.ok(leaders.length >= 3);
    for (const l of leaders) assert.ok(l?.id && l.name === INITIALS[l.id], `leader: ${JSON.stringify(l)}`);
    assert.deepEqual([st.leaders.away.defender?.id, st.leaders.away.defender?.name], ['a4', 'P. H.']);
  });

  test('the live banner, the timeline\'s player text and the undo label name players by id', () => {
    const y = m.at.yellow;
    const susp = kabaddiSuspended(y, kb.clockAt(y, T0 + 10 * 60000 + 30000), viewer);
    assert.deepEqual(susp.map((x) => [x.side, x.id, x.name]), [['away', 'a6', 'R. M.']]);
    const details = s.events.map((e) => kabaddiEventDetail(s, e, viewer));
    assertNoNames('timeline player text', details);
    assert.ok(details.includes('E. A. ⬆  C. F. ⬇'));
    assert.ok(details.includes('Team official'));
    assert.equal(kabaddiEventDetail(s, s.events.find((e) => kb.isRaidHead(e))!, viewer), 'P. R.');
    assert.deepEqual(subPlayers(s.events.find((e) => e.kind === 'sub')!, viewer), { on: 'E. A.', off: 'C. F.' });
    const labels = m.steps.map((st) => undoLabel(st, { ...NAMES, player: viewer }) ?? '');
    assertNoNames('undo labels', labels);
    assert.ok(labels.some((l) => /^Raid \+2 — 2 touches · Z\. Q\./.test(l) || /· Z\. Q\./.test(l)), `labels: ${labels.join(' | ')}`);
    assert.ok(labels.some((l) => /^Substitution · C\. F\./.test(l)));
  });
});

describe('IDs-only · kabaddi — an older (named) log still reads as before', () => {
  // an older app wrote the names beside the ids (payload, credits) and subs by name
  const named = (a: ScoreAction): ScoreAction => {
    const p = a.payload ?? {};
    const nm = (id?: unknown) => (typeof id === 'string' ? EVERYONE.find((x) => x.id === id)?.fullName : undefined);
    return {
      ...a,
      payload: {
        ...p,
        ...(p.raiderId ? { raiderName: nm(p.raiderId) } : {}),
        ...(p.tacklerId ? { tacklerName: nm(p.tacklerId) } : {}),
        ...(Array.isArray(p.touched) ? { touched: (p.touched as { id: string }[]).map((t) => ({ id: t.id, name: nm(t.id) })) } : {}),
        ...(p.playerId && (a.type === 'CARD' || a.type === 'TECH_POINT') ? { playerName: nm(p.playerId) } : {}),
      },
      ...(a.attribution ? { attribution: { ...a.attribution, playerName: nm(a.attribution.playerId) } } : {}),
      ...(a.attribution2 ? { attribution2: { ...a.attribution2, playerName: nm(a.attribution2.playerId) } } : {}),
    };
  };
  const play = (acts: ScoreAction[]) => acts.reduce(kb.reducer, kb.init(CFG));
  const stamp = (a: ScoreAction, minute: number): ScoreAction => ({ ...a, payload: { ...a.payload, minute, half: 1 } });
  const log = (() => {
    let s = kb.init(CFG);
    const out: ScoreAction[] = [];
    const push = (a: ScoreAction) => { const b = named(a); out.push(b); s = kb.reducer(s, b); };
    for (const a of kb.raidActions(s, { side: 'home', raider: H(1), touches: 2, bonus: false, tackled: false, touched: [A(1), A(2)] })) push(stamp(a, 1));
    for (const a of kb.raidActions(s, { side: 'away', raider: A(3), touches: 0, bonus: false, tackled: true, tackler: H(2) })) push(stamp(a, 2));
    push(stamp(cardAction('away', 'green', A(5)), 3));
    push(stamp(techPointAction('home', { by: A(7) }), 3));
    push({ type: 'SUB', side: 'home', payload: { offName: 'Cornelius Featherstonehaugh', onName: 'Eudora Applethwaite', minute: 4, half: 1 } });
    return out;
  })();

  test('replayed exactly as stored: the names come back with no lookup', () => {
    const s = play(log);
    assert.equal(s.raids[0].raider, 'Zebedee Quartermaine');
    assert.deepEqual(s.raids[0].touched, [{ id: 'a1', name: 'Bartholomew Wigglesworth' }, { id: 'a2', name: 'Clementine Fairweather' }]);
    assert.deepEqual(s.subbedOff.home, ['Cornelius Featherstonehaugh']);
    const head = s.events.find((e) => kb.isRaidHead(e))!;
    assert.deepEqual([head.detail, head.playerName, head.playerId], ['Zebedee Quartermaine', 'Zebedee Quartermaine', 'h1']);
    // the timeline's player text with no lookup = what the old log stored
    for (const e of s.events) assert.equal(kabaddiEventDetail(s, e), e.detail, `${e.label}`);
    const plain = JSON.stringify(kabaddiCommentary(s, NAMES));
    assert.match(plain, /Raid 1 — Zebedee Quartermaine \(Lions\): 2 touch points/);
    assert.match(plain, /Touched: Bartholomew Wigglesworth and Clementine Fairweather/);
    assert.match(plain, /Substitution Lions: Eudora Applethwaite in for Cornelius Featherstonehaugh/);
    assert.deepEqual(kb.tally(s.events, 'home').map((l) => l.name), ['Zebedee Quartermaine', 'Philomena Ravenscroft']);
    // a subbed-off player named only by name still can't raid
    const blocked = kb.reducer(s, named(stamp(kb.raidActions(s, { side: 'home', raider: H(7), touches: 1, bonus: false, tackled: false })[0], 5)));
    assert.equal(blocked, s);
  });

  test('a viewer outside the circle sees initials by id; a name-only sub keeps its stored names', () => {
    const s = play(log);
    const feed = JSON.stringify(kabaddiCommentary(s, { ...NAMES, nameOf: viewer }));
    assert.match(feed, /Raid 1 — Z\. Q\. \(Lions\)/);
    assert.match(feed, /tackled by P\. R\. \(Lions\)/);
    assert.match(feed, /Green card — I\. C\. \(Tigers\)/);
    assert.match(feed, /Substitution Lions: Eudora Applethwaite in for Cornelius Featherstonehaugh/); // no id to look up until the clean-up maps it
    assert.deepEqual(kabaddiBox(s, { nameOf: viewer }).data('all').home.rows.map((r) => r.name), ['Z. Q.', 'P. R.']);
  });

  test('a new IDs-only substitution in an older match: by id from then on', () => {
    let s = play(log);
    s = kb.reducer(s, stamp(subAction('home', H(1), H(7)), 6)); // Cornelius was subbed off by name
    assert.deepEqual(s.subbedOff.home, ['Cornelius Featherstonehaugh', 'h1']);
    assert.ok(kb.isSubbedOff(s, 'home', H(1)) && kb.isSubbedOff(s, 'home', H(7)), 'by id, and the older entry by name');
    const back = kb.reducer(s, { type: 'REMOVE_EVENT', side: 'home', payload: { id: s.events.at(-1)!.id, v: 2 } });
    assert.deepEqual(back.subbedOff.home, ['Cornelius Featherstonehaugh']);
  });
});

// -------------------------------------------- the controls never write a name --

describe('IDs-only · no kabaddi control copies a name into an action', () => {
  // React Native components can't run here: their dispatches are checked by
  // source (the pure builders above are what they call).
  const root = new URL('../src/sports/', import.meta.url);
  const files = ['kabaddi/index.tsx', 'kabaddi/actions.ts', 'kabaddi/engine.ts', 'voiceParsers.ts'];
  test('no `playerName: x.fullName` / `name: x.fullName` / `*Name: x.fullName`', () => {
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(new URL(f, root), 'utf8').split('\n').forEach((line, i) => {
        const kabaddiPart = f !== 'voiceParsers.ts' || /kabaddi|raiderName|tacklerName|offName|onName/i.test(line);
        if (kabaddiPart && /(playerName|\bname|raiderName|tacklerName|offName|onName)\s*:\s*[\w.?!\[\]()]*fullName/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(bad, []);
  });
});
