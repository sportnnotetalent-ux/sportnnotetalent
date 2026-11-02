/**
 * Quality mandate step 6 for invasion batch 5 (docs/security/breaks/invasion-batch5.md):
 * random and hostile matches in football (stoppage reasons, penalty conceded),
 * hockey (official cards, card warnings), rugby league (penalty to the side
 * with the ball) and rugby union (penalty try + offender's card). After every
 * tap the invariants hold, and the stat lines (live credits) match the
 * replayed statTotals.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fb from '../src/sports/football/engine.ts';
import { footballStatTotals, FOOTBALL_DERIVED_KEYS } from '../src/sports/football/totals.ts';
import * as fa from '../src/sports/football/actions.ts';
import { footballFeed } from '../src/sports/football/feed.ts';
import * as hk from '../src/sports/hockey/engine.ts';
import { hockeyTotals, hockeyField, DERIVED_KEYS as HK_DERIVED } from '../src/sports/hockey/totals.ts';
import { hockeyFeed } from '../src/sports/hockey/feed.ts';
import * as rl from '../src/sports/rugby_league/engine.ts';
import { setFigures } from '../src/sports/rugby_league/sets.ts';
import { leagueCommentary } from '../src/sports/rugby_league/commentary.ts';
import { leagueTotals, DERIVED_KEYS as RL_DERIVED } from '../src/sports/rugby_league/totals.ts';
import * as ru from '../src/sports/rugby/engine.ts';
import { rugbyCommentary } from '../src/sports/rugby/commentary.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const names = { home: 'Lions', away: 'Tigers' };
const HOSTILE: unknown[] = ['x'.repeat(3000), '<img src=x onerror=1>', { a: 1 }, [1], 42, null, '', 'INJURY', 'var ', true];
const clean = (t: string) => !/\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/.test(t);

/* -------------------------------- football -------------------------------- */

test('football: 600 random matches — stoppage reasons and conceded penalties stay valid; lines match statTotals', () => {
  const sp: TotalsSport<fb.FootballState> = { name: 'football', init: fb.init, reducer: fb.reducer, statTotals: footballStatTotals, partial: true, derived: FOOTBALL_DERIVED_KEYS };
  let taps = 0;
  for (let m = 0; m < 600; m++) {
    const config = { halfMinutes: 45, trackFouls: rnd(3) !== 0, trackCards: rnd(4) !== 0 };
    const kick = { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction;
    let s = fb.reducer(fb.init(config), kick);
    const log: ScoreAction[] = [kick];
    let concededFouls = 0;
    const n = 10 + rnd(30);
    for (let i = 0; i < n; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const p = rnd(4) ? { id: `${side[0]}${1 + rnd(10)}` } : null;
      const d = { id: `${opp(side)[0]}${1 + rnd(10)}` };
      let as: ScoreAction[];
      switch (rnd(7)) {
        case 0: as = [fa.stoppageAction(side, rnd(3) ? fa.STOPPAGE_REASONS[rnd(4)] : undefined)]; break;
        case 1: as = [{ type: 'STOPPAGE', side, payload: { reason: HOSTILE[rnd(HOSTILE.length)] } } as ScoreAction]; break;
        case 2: { // a reason for the latest stoppage — or a hostile ref / reason
          const last = [...s.events].reverse().find((e) => e.type === 'stoppage');
          const ref = rnd(4) === 0 ? (rnd(2) ? 'x' : (s.events[0]?.id ?? 99)) : last?.id ?? 1;
          const reason = rnd(4) === 0 ? HOSTILE[rnd(HOSTILE.length)] : fa.STOPPAGE_REASONS[rnd(4)];
          as = [{ type: 'STOPPAGE_REASON', payload: { ref, reason } } as ScoreAction];
          break;
        }
        case 3: { // the penalty flow: conceded (optional) → card (optional) → outcome
          const fouls = s.track.fouls;
          const conceded = rnd(3) !== 0;
          as = conceded ? fa.penaltyConcededActions(side, d, p, { fouls }) : [];
          if (conceded && fouls) concededFouls++;
          if (conceded && rnd(2)) as.push(...fa.cardActions(s.events, opp(side), rnd(3) ? 'yellow' : 'red', d));
          if (!conceded && p) as.push(fa.statAction('penaltyWon', side, p));
          const out = rnd(3);
          if (out === 0) as.push(fa.goalAction(side, p ?? { id: `${side[0]}9` }, 'penalty'));
          else as.push(...fa.penaltyMissActions(side, out === 1 ? 'saved' : 'missed', p, { id: `${opp(side)[0]}gk` }));
          break;
        }
        case 4: as = [fa.foulAction(side, { id: `${side[0]}${1 + rnd(10)}` }, rnd(2) ? d : null)]; break;
        case 5: as = [fa.goalAction(side, p ?? { id: `${side[0]}9` }, 'open')]; break;
        default: as = [fa.statAction('shot', side, p, { onTarget: rnd(2) === 0 })];
      }
      as = as.map((a) => ({ ...a, payload: { ...a.payload, minute: 1 + i, half: 1 } }));
      for (const a of as) s = fb.reducer(s, a);
      log.push(...as);
      taps++;
      // invariants after every tap
      for (const e of s.events) if (e.type === 'stoppage') assert.ok(e.playerName === undefined || (fa.STOPPAGE_REASONS as string[]).includes(e.playerName), `match ${m}: stoppage reason ${String(e.playerName).slice(0, 20)}`);
      assert.equal(s.stats.filter((x) => x.kind === 'foul' && x.pen).length, concededFouls, `match ${m}: conceded fouls`);
      for (const x of s.stats) if (x.kind === 'foul' && x.pen) assert.ok(x.playerId?.[0] === x.side[0], 'a conceded foul is the defender\'s');
    }
    const feed = footballFeed(s, names);
    for (const f of feed) assert.ok(clean(f.text), `match ${m}: ${f.text}`);
    assert.equal(feed.filter((f) => /Penalty conceded by/.test(f.text)).length, concededFouls);
    if (m % 20 === 0) assertContract({ ...sp, config }, toRecords(log), { every: 5, label: `match ${m}` });
  }
  assert.ok(taps > 10_000, `${taps} taps`);
});

test('football: 300 old-style logs (stoppages with no reason, plain fouls) read as before', () => {
  for (let m = 0; m < 300; m++) {
    let s = fb.reducer(fb.init({ halfMinutes: 45 }), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
    for (let i = 0; i < 15; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      s = fb.reducer(s, rnd(2) ? { type: 'STOPPAGE', side, payload: { minute: i + 1, half: 1 } } : fa.foulAction(side, { id: `${side[0]}4` }, rnd(2) ? { id: `${opp(side)[0]}7` } : null));
    }
    const texts = footballFeed(s, names).map((f) => f.text);
    for (const e of s.events) assert.equal(e.playerName, undefined);
    assert.ok(texts.every((t) => !/Penalty conceded|injury|VAR|Cooling/.test(t)), `old match ${m}`);
    assert.ok(s.stats.every((x) => !x.pen));
  }
});

/* --------------------------------- hockey --------------------------------- */

test('hockey: 600 random matches — official cards never count as player cards or put a side short', () => {
  const sp: TotalsSport<hk.HockeyState> = { name: 'hockey', init: hk.init, reducer: hk.reducer, statTotals: hockeyTotals, derived: HK_DERIVED };
  let u = 0;
  for (let m = 0; m < 600; m++) {
    let s = hk.init({});
    const log: ScoreAction[] = [];
    const n = 8 + rnd(25);
    for (let i = 0; i < n; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const stamp = { uid: `u${++u}`, sec: i * 60, period: 1 };
      const card = (['green', 'yellow', 'red'] as const)[rnd(3)];
      let a: ScoreAction;
      if (rnd(3) === 0) {
        const off = rnd(3) === 0 ? HOSTILE[rnd(HOSTILE.length)] : ['Coach', 'Manager', ' ', 'Physio'][rnd(4)];
        a = { type: 'CARD', side, payload: { card, official: off, ...stamp } };
      } else if (rnd(2)) {
        const pid = `${side[0]}${1 + rnd(4)}`;
        const c = hk.creditAttribution(hk.eventCredits({ type: 'card', card, playerId: pid }).first);
        a = { type: 'CARD', side, payload: { card, ...(card !== 'red' ? { minutes: card === 'green' ? 2 : 5 } : {}), ...stamp }, ...(c ? { attribution: c } : {}) };
      } else {
        const pid = `${side[0]}${1 + rnd(4)}`;
        const c = hk.creditAttribution(hk.eventCredits({ type: 'shot', onGoal: false, playerId: pid }).first);
        a = { type: 'SHOT', side, payload: { onGoal: false, ...stamp }, ...(c ? { attribution: c } : {}) };
      }
      s = hk.reducer(s, a);
      log.push(a);
      for (const sd of ['home', 'away'] as const) {
        const f = hk.teamFigures(s, sd);
        const players = s.events.filter((e) => e.type === 'card' && e.side === sd && !e.official);
        assert.equal(f.greenCards + f.yellowCards + f.redCards, players.length, `match ${m}: player cards`);
        for (const col of ['green', 'yellow'] as const) {
          for (const id of hk.cardWarnIds(s, sd, col)) assert.ok(players.some((e) => e.card === col && e.playerId === id), 'a warned player is on that card');
        }
      }
      for (const e of s.events) if (e.official !== undefined) {
        assert.equal(typeof e.official, 'string');
        assert.ok(e.official.length > 0 && e.official.length <= hk.OFFICIAL_MAX);
        assert.equal(e.playerId, undefined); assert.equal(e.minutes, undefined);
      }
    }
    // the field without the official cards is the same field
    const noOfficials = { ...s, events: s.events.filter((e) => !e.official) };
    assert.deepEqual(hockeyField(s), hockeyField(noOfficials), `match ${m}: officials change the field`);
    for (const f of hockeyFeed(s, names)) assert.ok(clean(f.text), f.text);
    if (m % 20 === 0) assertContract(sp, toRecords(log), { every: 5, label: `hockey ${m}` });
  }
});

/* ------------------------------ rugby league ------------------------------ */

test('league: 600 random matches with six-tackle sets — "Penalty to" keeps the ball, credits the defence', () => {
  const sp = (config: Record<string, unknown>): TotalsSport<rl.LeagueState> => ({ name: 'rugby_league', init: rl.init, reducer: rl.reducer, statTotals: leagueTotals as never, derived: RL_DERIVED, config });
  let u = 0;
  let penWons = 0;
  for (let m = 0; m < 600; m++) {
    const config = { trackSets: true, trackErrors: rnd(2) === 0 };
    let s = rl.init(config);
    const log: ScoreAction[] = [];
    const n = 15 + rnd(40);
    let sec = 0;
    for (let i = 0; i < n; i++) {
      sec += 5 + rnd(20);
      const stamp = { uid: `l${++u}`, sec, psec: sec, period: 1 };
      const open = rl.currentSet(s);
      let a: ScoreAction;
      const r = rnd(10);
      if (!open || r === 0) a = { type: 'SET_BALL', side: rnd(2) ? 'home' : 'away', payload: stamp };
      else if (r < 5) a = { type: 'TACKLE', payload: stamp };
      else {
        const how = rnd(8) === 0 ? HOSTILE[rnd(HOSTILE.length)] : (['kick', 'error', 'penalty', 'restart', 'penWon', 'penWon'] as const)[rnd(6)];
        const named = s.trackErrors && (how === 'error' || how === 'penalty' || how === 'penWon');
        const det = how === 'error' ? 'error' : 'penalty';
        const credSide = how === 'penWon' ? opp(open.side) : open.side;
        const pid = rnd(3) ? `${credSide[0]}${1 + rnd(13)}` : undefined;
        const c = named ? rl.creditAttribution(rl.eventCredits({ type: 'detail', detail: det, playerId: pid }).first) : undefined;
        a = { type: 'SET_END', payload: { how, ...(named ? { detail: det } : {}), ...stamp }, ...(c ? { attribution: c } : {}) };
        if (how === 'penWon') penWons++;
      }
      const before = rl.currentSet(s);
      s = rl.reducer(s, a);
      log.push(a);
      if (a.type === 'SET_END' && a.payload?.how === 'penWon' && before) {
        const now = rl.currentSet(s);
        assert.equal(now?.side, before.side, 'a penalty to the side with the ball: a fresh set for it');
        assert.equal(now?.tackles, 0);
      }
      for (const sd of ['home', 'away'] as const) {
        const f = setFigures(s, sd);
        assert.ok(f.completed <= f.decided && f.decided <= f.finished, `match ${m}: figures`);
      }
    }
    // every penalty detail is on the side that conceded it
    const { sets } = rl.walkSets(s);
    for (const x of sets) {
      if (!x.det) continue;
      const d = s.events.find((e) => e.id === x.det)!;
      assert.equal(d.side, x.end === 'penWon' ? opp(x.side) : x.side, `match ${m}: ${x.end}`);
    }
    for (const g of leagueCommentary(s, names)) for (const l of g.lines) assert.ok(clean(l.text), l.text);
    if (m % 20 === 0) assertContract(sp(config), toRecords(log), { every: 5, label: `league ${m}` });
  }
  assert.ok(penWons > 500, `${penWons} penalties to the side with the ball`);
});

/* ------------------------------ rugby union ------------------------------- */

test('union: 500 random matches — a penalty try (7) and the offender\'s optional card', () => {
  let u = 0;
  for (let m = 0; m < 500; m++) {
    let s = ru.init({});
    const want = { home: 0, away: 0 };
    let cards = 0;
    for (let i = 0; i < 10 + rnd(10); i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const stamp = () => ({ uid: `r${++u}`, sec: i * 120, psec: i * 120, period: 1 });
      s = ru.reducer(s, { type: 'PENALTY_TRY', side, payload: stamp() });
      want[side] += 7;
      if (rnd(2)) {
        const card = rnd(3) ? 'yellow' : 'red';
        const pid = `${opp(side)[0]}${1 + rnd(15)}`;
        const cr = ru.eventCredits({ type: 'card', card, playerId: pid });
        const at = ru.creditAttribution(cr.first);
        s = ru.reducer(s, { type: 'CARD', side: opp(side), payload: { card, ...stamp() }, ...(at ? { attribution: at } : {}) });
        cards++;
      }
    }
    assert.deepEqual([s.home, s.away], [want.home, want.away]);
    assert.equal(s.events.filter((e) => e.type === 'card').length, cards);
    for (const g of rugbyCommentary(s, names)) for (const l of g.lines) assert.ok(clean(l.text), l.text);
  }
});
