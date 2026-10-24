/**
 * IDs-only scoring — cricket (docs/privacy/ids-only-scoring.md, founder
 * 2026-10-24). `matches.state` (the reducer state, saved after every ball) and
 * `match_events` (payload, attribution) are readable logged out, so cricket
 * must store player IDS only — never a name, nor text with a name in it.
 *
 * A two-innings match is scored here the way the scorer UI (cricket/index.tsx)
 * sends its actions — wickets of every kind (caught, c & b, lbw, stumped, run
 * out with a 2nd fielder and a direct hit, hit wicket, Mankad, obstructing,
 * hit twice, timed out, retired out, wickets off a wide / no-ball), retired
 * hurt and retired-at-the-limit, a mid-over bowler replacement, a keeper
 * change, an Impact Player and a concussion sub, fielding notes, penalties,
 * voice-scored balls and an in-log Player of the Match — with rosters whose
 * players have distinctive full names. Then:
 *   - the persisted snapshot, the match-records block and every action's
 *     payload / attribution / attribution2 contain none of those names;
 *   - every display builder (commentary, scorecard, match stats, share card,
 *     ticker, undo label, the ball editor's lines) given a NameOf that maps
 *     ids → initials shows the initials and never a full name — and given
 *     the circle's NameOf, the full names.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, snapshotState, wicketAttribution, RUNS_KINDS, type CricketState, type DismissalKind, type RunsAs,
} from '../src/sports/cricket/engine.ts';
import { withNames, carriesNames, fillNames, tokenIds } from '../src/sports/cricket/names.ts';
import { cricketCommentary } from '../src/sports/cricket/commentary.ts';
import { fallOfWickets, fowText, partnerships, overHistory, fieldingNotesText, statTotals } from '../src/sports/cricket/scorecard.ts';
import { battingRows, bowlingRows, matchups, inningsTop } from '../src/sports/cricket/matchStats.ts';
import { inningsShareText, resultShareText, overShareText } from '../src/sports/cricket/shareCard.ts';
import { cricketTickerDetail, cricketTickerFlash } from '../src/sports/cricket/ticker.ts';
import { cricketUndoLabel } from '../src/sports/cricket/undo.ts';
import { cricketMatchRecords } from '../src/sports/cricket/records.ts';
import { editableOvers, editBall, changeBowlerOps, ballDiffLine, describeBall, recordToAction } from '../src/sports/cricket/editOvers.ts';
import { cricketVoice } from '../src/sports/voiceParsers.ts';
import { makeNameOf, nameInitials, type NameOf } from '../src/core/playerNames.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { MatchEventRecord, Player } from '../src/core/types.ts';

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
const roster = (list: [string, string][]): Player[] => list.map(([id, fullName]) => ({ id, fullName, sports: ['cricket'] }) as Player);
/** The child's circle: full names. */
const CIRCLE: NameOf = makeNameOf(new Map(ALL));
/** Everyone else (players_view): initials. */
const PUBLIC: NameOf = makeNameOf(new Map(ALL.map(([id, n]) => [id, nameInitials(n)])));

const leaks = (text: string): string[] => FORBIDDEN.filter((n) => text.includes(n));
const assertNoNames = (what: string, value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  assert.deepEqual(leaks(text), [], `${what} carries a name`);
};

// ─── A scorer that sends what cricket/index.tsx sends ────────────────────────

const CFG = { overs: 6, playersPerSide: 11, impactPlayer: true, retireAt: 15, powerplayOvers: 2 };

class Scorer {
  s: CricketState = init(CFG);
  actions: ScoreAction[] = [];
  steps: { type: string; prev: CricketState; next: CricketState }[] = [];
  clock = Date.UTC(2026, 9, 24, 9, 0, 0);
  // the batting order (a sub who came on may bat — after everyone else)
  private queue: Record<'home' | 'away', string[]> = { home: HOME.map(([id]) => id), away: AWAY.map(([id]) => id) };
  do(a: ScoreAction): this {
    const prev = this.s;
    this.actions.push(a);
    this.s = reducer(this.s, a);
    this.steps.push({ type: a.type, prev, next: this.s });
    return this;
  }
  get bat(): 'home' | 'away' { return this.s.battingSide; }
  get field(): 'home' | 'away' { return this.bat === 'home' ? 'away' : 'home'; }
  /** the next batter in (not yet batted, not out, not subbed off) */
  nextIn(): string {
    const q = this.queue[this.bat];
    const id = q.find((x) => !this.s.batting[x] && !this.s.unavailable.includes(x) && x !== this.s.strikerId && x !== this.s.nonStrikerId);
    assert.ok(id, 'a batter is left');
    return id!;
  }
  opening(st: string, ns: string, bw: string): this {
    this.do({ type: 'SET_STRIKER', payload: { id: st, v: 2 } });
    this.do({ type: 'SET_NONSTRIKER', payload: { id: ns, v: 2 } });
    return this.bowler(bw);
  }
  bowler(id: string, extra: Record<string, unknown> = {}): this {
    const before = this.s.bowlerId;
    this.do({ type: 'SET_BOWLER', payload: { id, v: 2, btype: 'RM', ...extra } });
    assert.ok(this.s.bowlerId === id || before === id, `bowler ${id} accepted`);
    return this;
  }
  /** ball(): the striker and bowler, by id (plus the device clock) */
  ball(type: string, payload: Record<string, unknown>, credits: Partial<ScoreAction> = {}): this {
    this.clock += 30_000;
    return this.do({ type, side: this.bat, payload: { ...payload, strikerId: this.s.strikerId, bowlerId: this.s.bowlerId, at: this.clock }, ...credits });
  }
  runs(...rs: number[]): this {
    for (const r of rs) {
      this.ball('RUNS', { runs: r, ...(r === 4 || r === 6 ? { boundary: true } : {}) },
        this.s.strikerId ? { attribution: { playerId: this.s.strikerId, stat: 'runs', by: r } } : {});
    }
    return this;
  }
  /** finishWicket(): ids only; credits from the engine's one rule */
  wicket(kind: DismissalKind, o: { fielder?: string; fielder2?: string; batterOut?: 'striker' | 'nonstriker'; runs?: number; runsAs?: RunsAs; end?: 'striker' | 'bowler'; onExtra?: 'wide' | 'noball'; direct?: boolean; last?: boolean } = {}): this {
    const count = () => this.s.dismissals.length + Object.values(this.s.batting).filter((c) => c.retired).length;
    const before = count();
    const takesRuns = RUNS_KINDS.includes(kind);
    const batterOut = kind === 'mankad' ? 'nonstriker' : kind === 'hittwice' || kind === 'stumped' || kind === 'hitwicket' ? 'striker' : (o.batterOut ?? 'striker');
    const payload: Record<string, unknown> = {
      fielderId: o.fielder, batterOut, runs: takesRuns ? (o.runs ?? 0) : 0, newBatId: o.last ? undefined : this.nextIn(),
    };
    if (kind === 'runout' && o.fielder2) payload.fielder2Id = o.fielder2;
    if (kind === 'runout' && o.direct && o.fielder) payload.direct = true;
    if (takesRuns && o.end) payload.end = o.end;
    if (takesRuns && o.runsAs && o.runsAs !== 'bat') payload.runsAs = o.runsAs;
    const keeper = this.s.keepers[this.field];
    const credits = wicketAttribution({
      kind, bowler: { id: this.s.bowlerId }, fielder: { id: o.fielder }, keeper: keeper ? { id: keeper.id } : undefined,
      striker: { id: this.s.strikerId }, runs: takesRuns ? (o.runs ?? 0) : 0, runsAs: o.runsAs, wide: o.onExtra === 'wide', battingSide: this.bat,
    });
    if (o.onExtra) this.ball('EXTRA', { ...payload, kind: o.onExtra === 'wide' ? 'Wide' : 'No ball', wicket: kind }, credits);
    else this.ball('WICKET', { ...payload, kind }, credits);
    assert.ok(count() > before, `${kind} applied`);
    return this;
  }
  fieldNote(kind: 'drop' | 'saved' | 'missed', fielder: string, runs?: number): this {
    const stat = kind === 'drop' ? 'dropped' : kind === 'saved' ? 'runsSaved' : 'runsMissed';
    return this.do({ type: 'FIELD_NOTE', side: this.field, payload: { kind, fielderId: fielder, ...(runs ? { runs } : {}) }, attribution: { playerId: fielder, stat, by: kind === 'drop' ? 1 : runs ?? 0 } });
  }
}

/** The match — innings 1 home, innings 2 away. */
function scoreMatch(): { m: Scorer; mid: CricketState; inn1: CricketState } {
  const m = new Scorer();
  m.do({ type: 'SET_TOSS', payload: { winner: 'home', decision: 'bat' } });
  m.do({ type: 'SET_CAPTAIN', payload: { side: 'home', id: 'h1' } });
  m.do({ type: 'SET_CAPTAIN', payload: { side: 'away', id: 'a1' } });
  m.do({ type: 'SET_KEEPER', payload: { side: 'home', id: 'h2' } });
  m.do({ type: 'SET_KEEPER', payload: { side: 'away', id: 'a2' } });

  // ── Innings 1 (home) — over 1: a3
  m.opening('h1', 'h3', 'a3');
  m.runs(4, 1, 6);
  m.fieldNote('drop', 'a6', 2).fieldNote('saved', 'a7', 2);
  m.do({ type: 'SHOT', side: 'home', payload: { v: 2, inn: 1, side: 'home', at: '0.3', batterId: m.s.strikerId, bowlerId: 'a3', runs: 6, zone: 8, deep: true, shot: 'Lofted' } });
  m.ball('EXTRA', { kind: 'Wide', runs: 0 });
  m.wicket('caught', { fielder: 'a5' });
  m.runs(0, 2);
  // over 2: a4 (powerplay) — a no-ball four, lbw, byes, leg byes, stumped
  m.bowler('a4');
  m.runs(2);
  m.ball('EXTRA', { kind: 'No ball', runs: 4, boundary: true }, { attribution: { playerId: m.s.strikerId!, stat: 'runs', by: 4 } });
  m.wicket('lbw');
  m.runs(1);
  m.ball('BYES', { runs: 2 });
  m.ball('LEGBYES', { runs: 1 });
  m.wicket('stumped');
  // a keeper change between overs, a penalty, a bonus
  m.do({ type: 'SET_KEEPER', payload: { side: 'away', id: 'a8' } });
  m.do({ type: 'PENALTY', side: 'home', payload: { runs: 5, against: 'fielding', reason: 'Ball hit helmet', teamName: 'Home XI' } });
  m.do({ type: 'ADJUST', side: 'home', payload: { side: 'home', runs: 2, reason: 'hit the net', teamName: 'Home XI' } });
  // over 3: a5 — a run out with a 2nd fielder, c & b, a direct hit, voice
  m.bowler('a5');
  m.runs(1);
  m.wicket('runout', { fielder: 'a6', fielder2: 'a8', runs: 1, batterOut: 'nonstriker', end: 'bowler' });
  m.runs(4);
  m.wicket('caught', { fielder: 'a5' }); // c & b
  const voiced = cricketVoice('four', { state: m.s, homeName: 'Home XI', awayName: 'Away XI', homeRoster: roster(HOME), awayRoster: roster(AWAY) })!;
  assert.ok(voiced.length === 1, 'a voice-scored four');
  for (const a of voiced) m.do(a);
  m.runs(1);
  // the Impact Player (away) and a concussion sub (home)
  m.do({ type: 'IMPACT_SUB', side: 'away', payload: { side: 'away', outId: 'a11', inId: 'a12' } });
  m.do({ type: 'CONCUSSION_SUB', side: 'home', payload: { side: 'home', outId: 'h11', inId: 'h12' } });
  // over 4: a3 starts, injured after 2 balls — a6 finishes it
  m.bowler('a3');
  m.runs(1, 0);
  m.bowler('a6', { reason: 'injury' });
  m.wicket('stumped', { onExtra: 'wide' });
  m.runs(2);
  m.wicket('hitwicket');
  m.runs(1);
  // retired hurt (no ball), then the over's last ball
  m.wicket('retired', { batterOut: 'nonstriker' });
  m.runs(0);
  // over 5: a4 — a Mankad
  m.bowler('a4');
  m.runs(0);
  m.wicket('mankad');
  m.runs(1, 1, 1, 1, 1);
  // over 6: a7 — run the innings out
  m.bowler('a7');
  m.runs(0, 0, 0, 0, 0, 0);
  const inn1 = m.s;
  assert.equal(inn1.innings, 2, 'innings 1 is over');

  // ── Innings 2 (away)
  m.opening('a1', 'a3', 'h3');
  m.runs(4, 4, 4, 2, 1);
  m.fieldNote('missed', 'h5', 1);
  // a1 on 14 → on the limit at 15+
  m.runs(1);
  m.bowler('h4');
  const mid = m.s;
  // retire at the limit (the UI's retire panel: v:2, limit)
  const due = [m.s.strikerId, m.s.nonStrikerId].find((id) => id && (m.s.batting[id]?.runs ?? 0) >= 15);
  if (due) {
    m.ball('WICKET', { kind: 'retired', batterOut: due === m.s.strikerId ? 'striker' : 'nonstriker', v: 2, limit: true, newBatId: m.nextIn() });
  }
  m.wicket('obstruct', { batterOut: 'nonstriker', runs: 1 });
  m.wicket('hittwice');
  m.wicket('runout', { fielder: 'h6', runs: 1, runsAs: 'legbye', batterOut: 'striker', end: 'striker', onExtra: 'noball' });
  m.wicket('retiredout', { batterOut: 'nonstriker' });
  m.wicket('runout', { fielder: 'h7', runs: 0, batterOut: 'striker', end: 'striker', direct: true });
  m.wicket('timedout', { batterOut: 'striker' });
  m.runs(6, 6, 6);
  m.do({ type: 'END', payload: {} });
  m.do({ type: 'POTM', payload: { id: 'h1' } });
  assert.equal(m.s.ended, true, 'the match finished');
  return { m, mid, inn1 };
}

const { m, mid, inn1 } = scoreMatch();
const s = m.s;

// ─── 1. nothing public carries a name ────────────────────────────────────────

describe('IDs-only cricket: no name is stored', () => {
  test('the scoring actually happened (every kind of wicket, subs, notes, POTM)', () => {
    const kinds = new Set([...inn1.dismissals, ...s.dismissals].map((d) => d.kind));
    for (const k of ['caught', 'lbw', 'stumped', 'runout', 'hitwicket', 'mankad', 'timedout', 'obstruct', 'hittwice', 'retiredout']) assert.ok(kinds.has(k as DismissalKind), k);
    assert.ok(s.dismissals.some((d) => d.fielder2Id === 'a8'), 'a run out with a 2nd fielder');
    assert.ok(s.dismissals.some((d) => d.direct), 'a direct hit');
    assert.ok(Object.values(s.batting).some((c) => c.retired && !c.retLimit), 'retired hurt');
    assert.ok(Object.values(s.batting).some((c) => c.retLimit), 'retired at the limit');
    assert.deepEqual(s.impactUsed.away, { inId: 'a12', outId: 'a11' });
    assert.ok(s.unavailable.includes('h11'));
    assert.equal(s.keepers.away?.id, 'a8');
    assert.ok((s.fieldNotes ?? []).length >= 3);
    assert.equal(s.potmId, 'h1');
    assert.ok(s.events.some((e) => e.label === 'BOWLER REPLACED'));
    assert.ok(s.events.some((e) => e.label === 'NEW KEEPER'));
  });

  test('the persisted snapshot (matches.state) has no name in it', () => {
    assertNoNames('snapshotState', snapshotState(s));
    assertNoNames('snapshot mid-match', snapshotState(mid));
    // …and nor does the derived log
    assertNoNames('the whole live state', s);
    // players are there, by id: cards, crease, dismissal text tokens
    assert.ok(Object.keys(s.batting).includes('h1'));
    assert.ok(Object.values(s.batting).every((c) => c.name === undefined), 'no card stores a name');
    assert.ok(Object.values(s.batting).some((c) => (c.dismissal ?? '').includes('{@')), 'dismissal text names by id token');
    assert.ok(s.events.some((e) => tokenIds(e.detail).length > 0), 'event text names by id token');
  });

  test('every action — payload, attribution, attribution2 — carries ids only', () => {
    for (const a of m.actions) {
      assertNoNames(`${a.type} payload`, a.payload ?? {});
      assertNoNames(`${a.type} attribution`, a.attribution ?? {});
      assertNoNames(`${a.type} attribution2`, a.attribution2 ?? {});
      assert.equal(carriesNames(a.payload), false, `${a.type} has no name key`);
      for (const at of [a.attribution, a.attribution2]) if (at) assert.equal(at.playerName, undefined, `${a.type} credit`);
    }
  });

  test('the match-records block (stored in matches.state) names no one', () => {
    const rec = cricketMatchRecords(s)!;
    assert.ok(rec.items.some((i) => i.type === 'bestInnings' && i.playerId), 'records still point at players by id');
    assertNoNames('matchRecords', rec);
  });

  test('stat totals are keyed by id', () => {
    const t = statTotals(s);
    assert.ok(t.h1 && t.a5);
    assertNoNames('statTotals', t);
  });
});

// ─── 2. what people see: initials outside the circle, full names inside ─────

describe('IDs-only cricket: the display names players by id', () => {
  const teams = { home: 'Home XI', away: 'Away XI' };
  const ZQ = nameInitials('Zebedee Quartermaine'); // 'Z. Q.'

  test('withNames: initials for the public, full names for the circle', () => {
    const pub = withNames(s, PUBLIC);
    assertNoNames('withNames(PUBLIC)', pub);
    assert.equal(pub.batting.h1.name, ZQ);
    assert.equal(pub.potm, ZQ);
    assert.ok(JSON.stringify(pub).includes(ZQ));
    const circle = withNames(s, CIRCLE);
    assert.equal(circle.batting.h1.name, 'Zebedee Quartermaine');
    assert.equal(circle.keepers.away?.name, 'Rosalind Merriweather');
    assert.equal(circle.impactUsed.away?.inName, 'Isadora Vanterpool');
    // no id token survives the display copy
    assert.ok(!JSON.stringify(circle.events).includes('{@'));
    assert.ok(!Object.values(circle.batting).some((c) => (c.dismissal ?? '').includes('{@')));
    // the dismissals read as a scorecard does
    const caught = Object.values(withNames(inn1, CIRCLE).batting).map((c) => c.dismissal ?? '');
    assert.ok(caught.includes('c Montgomery Ravensworth b Ignatius Pemberton'), caught.join(' | '));
    assert.ok(caught.includes('c & b Montgomery Ravensworth'), caught.join(' | '));
    assert.ok(caught.includes('run out (Euphemia Starling/Rosalind Merriweather)'), caught.join(' | '));
    assert.ok(caught.includes('st Clementine Rookwood b Henrietta Coldwater'), caught.join(' | '));
  });

  test('commentary', () => {
    const pub = cricketCommentary(s, teams, PUBLIC);
    assert.equal(pub.hasLog, true);
    assertNoNames('commentary (public)', pub);
    assert.ok(JSON.stringify(pub).includes(ZQ));
    const circle = JSON.stringify(cricketCommentary(s, teams, CIRCLE));
    assert.ok(circle.includes('Zebedee Quartermaine'));
    assert.ok(!circle.includes('{@'), 'no raw id token in the commentary');
  });

  test('scorecard and match stats', () => {
    for (const side of ['home', 'away'] as const) {
      const parts = [
        fowText(fallOfWickets(s, side, PUBLIC)), partnerships(s, side, PUBLIC), overHistory(s, side, PUBLIC),
        fieldingNotesText(s, side, PUBLIC), battingRows(s, side, PUBLIC), bowlingRows(s, side, PUBLIC),
        matchups(s, side, PUBLIC), inningsTop(s, side, 3, PUBLIC),
      ];
      assertNoNames(`scorecard ${side}`, parts);
    }
    assert.ok(fowText(fallOfWickets(s, 'home', PUBLIC)).includes(ZQ) || JSON.stringify(partnerships(s, 'home', PUBLIC)).includes(ZQ));
    assert.ok(inningsTop(s, 'home', 3, CIRCLE).bat.some((b) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(b.name)));
  });

  test('the WhatsApp share card', () => {
    const o = { homeName: 'Home XI', awayName: 'Away XI', matchId: 'm-ids', nameOf: PUBLIC };
    const cards = [inningsShareText(s, o), resultShareText(s, o), overShareText(s, { inn: 1, side: 'home', over: 1 }, o) ?? ''];
    for (const c of cards) assertNoNames('share card', c);
    assert.ok(cards.join('\n').includes(ZQ));
    assert.ok(resultShareText(s, { ...o, nameOf: CIRCLE }).includes('Zebedee Quartermaine'));
  });

  test('the score ticker and its flashes (the public overlay)', () => {
    const d = cricketTickerDetail(mid, { home: 'HOM', away: 'AWY', player: PUBLIC });
    assertNoNames('ticker', d);
    assert.ok((d.left ?? []).length > 0 && (d.right ?? []).length > 0);
    assert.ok(![...(d.left ?? []), ...(d.right ?? [])].some((t) => t.includes('{@')));
    let flashes = 0;
    for (const st of m.steps) {
      const f = cricketTickerFlash(st.prev, st.next, PUBLIC);
      if (!f) continue;
      flashes++;
      assertNoNames('flash', f);
      assert.ok(!JSON.stringify(f).includes('{@'));
    }
    assert.ok(flashes >= 5, 'fours, sixes and wickets flashed');
  });

  test('the named Undo', () => {
    let named = 0;
    for (const st of m.steps) {
      const label = cricketUndoLabel(st, PUBLIC);
      if (!label) continue;
      assertNoNames('undo', label);
      assert.ok(!label.includes('{@'), label);
      if (/ — [A-Z]\. [A-Z]\./.test(label)) named++;
    }
    assert.ok(named > 5, 'balls name the batter by initials');
  });

  test('the ball editor (#06) writes ids only; its lines name by initials', () => {
    const log: MatchEventRecord[] = m.actions.map((a, i) => {
      const r: MatchEventRecord = { seq: i + 1, type: a.type };
      if (a.side) r.side = a.side;
      const payload = a.attribution2 ? { ...(a.payload ?? {}), _attr2: a.attribution2 } : a.payload;
      if (payload) r.payload = payload;
      if (a.attribution) r.attribution = a.attribution;
      return r;
    });
    const inns = editableOvers(log, CFG);
    assertNoNames('editableOvers', inns);
    const wk = log.find((r) => r.type === 'WICKET' && r.payload?.kind === 'caught')!;
    const edited = editBall(wk, { fielderId: 'a9', fielderName: 'Algernon Fairbanks' });
    assertNoNames('editBall', edited);
    const line = ballDiffLine('0.5', recordToAction(wk), edited as ScoreAction, (id, n) => nameInitials(CIRCLE(id, n)));
    assertNoNames('change line', line);
    assert.match(line, /Caught \(M\. R\.\) → Caught \(A\. F\.\)/);
    const ops = changeBowlerOps(inns.find((i) => i.side === 'home')!, 6, { id: 'a9', name: 'Algernon Fairbanks' }, 'over', log);
    assert.ok(Array.isArray(ops) && ops.length > 0);
    assertNoNames('changeBowlerOps', ops);
    assert.equal(describeBall(recordToAction(wk), PUBLIC), 'Caught (M. R.)');
  });

  test('a token is filled through the lookup, never shown raw', () => {
    assert.equal(fillNames('c {@a5} b {@a3}', PUBLIC), 'c M. R. b I. P.');
    assert.equal(fillNames('c {@a5} b {@a3}', CIRCLE), 'c Montgomery Ravensworth b Ignatius Pemberton');
    assert.equal(fillNames('c {@zz} b {@a3}'), 'c Player b Player'); // no lookup: no name to show
    assert.equal(fillNames('c Veer b Ishaan', PUBLIC), 'c Veer b Ishaan'); // legacy text untouched
  });
});

// ─── 3. legacy logs still read as before ─────────────────────────────────────

describe('IDs-only cricket: an older log (with names) replays as it always did', () => {
  test('names in a legacy payload are kept (legacy, read-only) and shown', () => {
    let st = init({ overs: 2, playersPerSide: 11 });
    st = reducer(st, { type: 'SET_STRIKER', payload: { id: 'x1', name: 'Veer' } });
    st = reducer(st, { type: 'SET_NONSTRIKER', payload: { id: 'x2', name: 'Dev' } });
    st = reducer(st, { type: 'SET_BOWLER', payload: { id: 'y1', name: 'Ishaan' } });
    st = reducer(st, { type: 'WICKET', side: 'home', payload: { kind: 'caught', strikerId: 'x1', strikerName: 'Veer', bowlerId: 'y1', bowlerName: 'Ishaan', fielderId: 'y2', fielderName: 'Kabir', newBatId: 'x3', newBatName: 'Ravi' } });
    assert.equal(st.batting.x1.name, 'Veer');
    assert.equal(st.batting.x1.dismissal, 'c Kabir b Ishaan');
    assert.equal(st.events.at(-1)!.detail, 'Veer c Kabir b Ishaan');
    // display: by id when the viewer can resolve it, else the stored legacy name
    assert.equal(withNames(st).batting.x1.dismissal, 'c Kabir b Ishaan');
    assert.equal(withNames(st, makeNameOf(new Map([['x1', 'V. S.']]))).batting.x1.name, 'V. S.');
    assert.equal(withNames(st, makeNameOf(new Map())).batting.x1.name, 'Veer');
    // a legacy POTM by name still shows
    const p = reducer({ ...st, ended: true }, { type: 'POTM', payload: { name: 'Veer' } });
    assert.equal(p.potm, 'Veer');
    assert.equal(p.potmId, undefined);
  });
});
