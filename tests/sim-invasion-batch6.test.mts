/**
 * Quality mandate step 6 for invasion batch 6 (docs/security/breaks/invasion-batch6.md):
 * random and hostile matches —
 *  football: goal situations, the fast Shot → Goal, concussion substitutes
 *    (with removals), penalties conceded; 300 old-style logs;
 *  ice hockey: shoot-outs (scored / saved / missed with goalies, hostile
 *    payloads) and penalties served by a team-mate;
 *  hockey, ice hockey, union, league: goals / tries ruled out (valid and hostile);
 *  union / league: restart and penalty-use tallies (valid, hostile, the other code's);
 *  voice: random phrases through the football grammar and the league voice.
 * After every tap the invariants hold, and the stat lines (live credits) match
 * the replayed statTotals.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fb from '../src/sports/football/engine.ts';
import * as fa from '../src/sports/football/actions.ts';
import { footballStatTotals, FOOTBALL_DERIVED_KEYS } from '../src/sports/football/totals.ts';
import { footballFeed } from '../src/sports/football/feed.ts';
import { footballDepthTeamStats } from '../src/sports/football/depth.ts';
import { parseIntent } from '../src/sports/football/voiceCommands.ts';
import * as hk from '../src/sports/hockey/engine.ts';
import { hockeyFeed } from '../src/sports/hockey/feed.ts';
import { hockeyTimeline } from '../src/sports/hockey/timeline.ts';
import { hockeyTotals, DERIVED_KEYS as HK_DERIVED } from '../src/sports/hockey/totals.ts';
import * as ice from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyCommentary } from '../src/sports/ice_hockey/commentary.ts';
import { iceHockeyTimeline } from '../src/sports/ice_hockey/timeline.ts';
import { iceHockeyTotals, DERIVED_KEYS as ICE_DERIVED } from '../src/sports/ice_hockey/totals.ts';
import * as ru from '../src/sports/rugby/engine.ts';
import { rugbyCommentary } from '../src/sports/rugby/commentary.ts';
import { rugbyTimeline } from '../src/sports/rugby/timeline.ts';
import { rugbySheet } from '../src/sports/rugby/sheet.ts';
import * as rl from '../src/sports/rugby_league/engine.ts';
import { leagueCommentary } from '../src/sports/rugby_league/commentary.ts';
import { leagueTimeline } from '../src/sports/rugby_league/timeline.ts';
import { leagueSheet } from '../src/sports/rugby_league/sheet.ts';
import { leagueVoice } from '../src/sports/rugby_league/voice.ts';
import * as ro from '../src/sports/invasion/ruledOut.ts';
import * as rs from '../src/sports/invasion/restarts.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction, VoiceContext } from '../src/sports/types.ts';
import type { FeedGroup } from '../src/sports/invasion/feed.ts';

type Side = 'home' | 'away';
let seed = 20261106;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const names = { home: 'Lions', away: 'Tigers' };
const HOSTILE: unknown[] = ['x'.repeat(3000), '<img src=x onerror=1>', { a: 1 }, [1], 42, null, '', 'CORNER', true, 'true', 1];
const clean = (t: string) => !/\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]|<img/.test(t);
const lines = (g: FeedGroup[]) => g.flatMap((x) => x.lines.map((l) => l.text));
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)];

/* -------------------------------- football -------------------------------- */

test('football: 600 random matches — situations, concussion subs, penalties conceded; lines match statTotals', () => {
  const sp: TotalsSport<fb.FootballState> = { name: 'football', init: fb.init, reducer: fb.reducer, statTotals: footballStatTotals, partial: true, derived: FOOTBALL_DERIVED_KEYS };
  let taps = 0, situations = 0, concussions = 0, conceded = 0;
  for (let m = 0; m < 600; m++) {
    const config = { halfMinutes: 45, subType: rnd(2) ? 'fixed' : 'rolling', maxSubs: 1 + rnd(5), trackShotDetail: rnd(2) === 0, trackFouls: rnd(4) !== 0 };
    const kick = { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction;
    let s = fb.reducer(fb.init(config), kick);
    const log: ScoreAction[] = [kick];
    const n = 10 + rnd(30);
    for (let i = 0; i < n; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const p = { id: `${side[0]}${1 + rnd(14)}` };
      let as: ScoreAction[] = [];
      switch (rnd(8)) {
        case 0: { // a goal with (or without) a situation, any goal type
          const gt = pick(['open', 'open', 'header', 'penalty', 'freekick'] as const);
          as = [fa.goalAction(side, p, gt, { situation: rnd(2) ? pick(fa.GOAL_SITUATIONS) : undefined, zone: rnd(3) ? undefined : 'box' })];
          break;
        }
        case 1: // the situation picked after (GOAL_DETAIL) — valid, cleared, or hostile
          as = [rnd(4) === 0 ? { type: 'GOAL_DETAIL', side, payload: { situation: pick(HOSTILE) } } as ScoreAction
            : fa.goalDetailAction(side, { situation: rnd(4) ? pick(fa.GOAL_SITUATIONS) : null })];
          break;
        case 2: { const g = fa.goalAction(side, p, 'open'); as = [{ ...g, payload: { ...g.payload, situation: pick(HOSTILE) } }]; break; }
        case 3: as = [fa.subAction(side, p, { id: `${side[0]}b${rnd(9)}` }, { concussion: rnd(2) === 0 })]; break;
        case 4: as = [{ type: 'SUB', side, payload: { offId: p.id, onId: `${side[0]}x`, concussion: pick(HOSTILE) } } as ScoreAction]; break;
        case 5: { // remove a random sub (its own count comes back)
          const subs = s.events.filter((e) => e.type === 'sub');
          if (subs.length) as = fa.eventRemoval(pick(subs));
          break;
        }
        case 6: as = fa.penaltyConcededActions(side, { id: `${opp(side)[0]}${1 + rnd(10)}` }, rnd(3) ? p : null, { fouls: s.track.fouls }); break;
        default: as = [fa.foulAction(side, p, null)];
      }
      const before = s;
      for (const a of as) {
        const t = { ...a, payload: { ...a.payload, minute: 1 + rnd(90), half: 1 + rnd(2) } } as ScoreAction;
        s = fb.reducer(s, t); log.push(t); taps++;
      }
      // invariants after every tap
      const goals = (sd: Side) => s.events.filter((e) => (e.type === 'goal' && e.side === sd) || (e.type === 'owngoal' && e.side === sd)).length;
      assert.equal(s.home, goals('home'));
      assert.equal(s.away, goals('away'));
      for (const e of s.events) {
        if ('situation' in e) {
          assert.ok(fa.GOAL_SITUATIONS.includes(e.situation!), 'a known situation');
          assert.ok(e.type === 'goal' && (e.goalType === 'open' || e.goalType === 'header' || e.goalType === undefined), 'open play only');
        }
        if ('concussion' in e) assert.ok(e.type === 'sub' && e.concussion === true);
      }
      for (const sd of ['home', 'away'] as const) {
        const subs = s.events.filter((e) => e.type === 'sub' && e.side === sd);
        assert.equal(s.subsUsed[sd], subs.filter((e) => !e.concussion).length, 'ordinary subs counted');
        assert.equal(s.concussionSubs?.[sd] ?? 0, subs.filter((e) => e.concussion).length, 'concussion subs counted apart');
        assert.ok((s.concussionSubs?.[sd] ?? 0) <= fb.MAX_CONCUSSION_SUBS);
        if (config.subType === 'fixed' && before.subsUsed[sd] <= config.maxSubs) assert.ok(s.subsUsed[sd] <= config.maxSubs);
      }
    }
    situations += s.events.filter((e) => e.situation).length;
    concussions += s.events.filter((e) => e.concussion).length;
    const t = footballStatTotals(s);
    const pens = s.stats.filter((e) => e.kind === 'foul' && e.pen && e.playerId).length;
    conceded += pens;
    assert.equal(Object.values(t).reduce((a, l) => a + (l.stats.penaltiesGivenAway ?? 0), 0), pens);
    for (const item of footballFeed(s, names)) assert.ok(clean(item.text), item.text);
    const d = footballDepthTeamStats(s);
    if (s.events.some((e) => e.situation)) {
      for (const sd of ['home', 'away'] as const) {
        assert.ok(d[sd].setPieceGoals! <= s.events.filter((e) => e.type === 'goal' && e.side === sd).length);
      }
    }
    if (m % 20 === 0) assertContract(sp, toRecords(log), { every: 7, label: `match ${m}` });
  }
  assert.ok(taps > 10000, `taps ${taps}`);
  assert.ok(situations > 300 && concussions > 300 && conceded > 300, `${situations} / ${concussions} / ${conceded}`);
});

test('football: 300 old-style logs replay with no new key', () => {
  for (let m = 0; m < 300; m++) {
    let s = fb.reducer(fb.init({ halfMinutes: 45, subType: 'fixed', maxSubs: 3 }), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
    for (let i = 0; i < 20; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const a: ScoreAction = pick([
        { type: 'GOAL', side, payload: { goalType: pick(['open', 'penalty', 'freekick', 'header']), pid: `${side}${rnd(9)}`, minute: rnd(90) } },
        { type: 'GOAL_DETAIL', side, payload: { zone: 'box', bigChance: true } },
        { type: 'SUB', side, payload: { offName: `Old ${rnd(9)}`, onName: `New ${rnd(9)}`, minute: rnd(90) } },
        { type: 'SUB', side, payload: { offId: `o${rnd(9)}`, onId: `n${rnd(9)}`, minute: rnd(90) } },
        { type: 'STAT', side, payload: { kind: 'foul', at: 1, minute: rnd(90) }, attribution: { playerId: `${side}${rnd(9)}`, stat: 'fouls' } },
      ] as ScoreAction[]);
      s = fb.reducer(s, a);
    }
    assert.equal('concussionSubs' in s, false);
    assert.ok(s.events.every((e) => !('situation' in e) && !('concussion' in e)));
    assert.ok(Object.values(footballStatTotals(s)).every((l) => !('penaltiesGivenAway' in l.stats)));
    const d = footballDepthTeamStats(s);
    assert.equal('setPieceGoals' in d.home, false);
    assert.ok(s.subsUsed.home <= 3 && s.subsUsed.away <= 3);
  }
});

test('football voice: 2000 random phrases — the grammar never throws; "injury time" is never a stoppage', () => {
  const words = ['goal', 'injury', 'injury time', 'stoppage', 'VAR', 'check', 'cooling', 'drinks', 'break', 'yellow', 'card', 'sub', 'corner', 'Lions', '9', 'red', 'full time', 'added', 'two minutes', 'player', 'injured', 'save'];
  for (let i = 0; i < 2000; i++) {
    const text = Array.from({ length: 1 + rnd(5) }, () => pick(words)).join(' ');
    const it = parseIntent(text);
    assert.ok(typeof it.kind === 'string');
    if (it.kind === 'stoppage' && it.reason) assert.ok(fa.STOPPAGE_REASONS.includes(it.reason));
    if (/injury time/.test(text) && !/injured|stoppage|var|check|cooling|drinks/i.test(text.replace(/injury time/g, ''))) assert.notEqual(it.kind, 'stoppage', text);
  }
});

/* ------------------------------- ice hockey ------------------------------- */

const ICE_SP: TotalsSport<ice.IceHockeyState> = { name: 'ice_hockey', init: ice.init, reducer: ice.reducer, statTotals: iceHockeyTotals, derived: ICE_DERIVED };

test('ice hockey: 600 shoot-outs (saved / missed / goalies, hostile) and served-by penalties; lines match statTotals', () => {
  let kicks = 0, served = 0;
  for (let m = 0; m < 600; m++) {
    const cfg = { decider: 'otso', otMinutes: 0, soRounds: 1 + rnd(5) };
    const log: ScoreAction[] = [{ type: 'CLOCK', payload: { run: true, at: 1000 } } as ScoreAction];
    let s = ice.reducer(ice.init(cfg), log[0]);
    // a few penalties first (some served by a team-mate, some hostile)
    for (let i = 0; i < 4; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      const pid = `${side[0]}${rnd(9)}`;
      const sv = rnd(3) === 0 ? pick(HOSTILE) : rnd(2) ? `${side[0]}${rnd(9)}` : undefined;
      const pen = pick(['minor', 'bench', 'major', 'match'] as const);
      const cr = ice.eventCredits({ type: 'pen', side, pen, playerId: pen === 'bench' ? undefined : pid }, s.pimScale);
      const a = { type: 'PEN', side, payload: { pen, ...(sv !== undefined ? { servedId: sv } : {}), sec: 10 * i, period: 1 }, attribution: ice.creditAttribution(cr.first, 1) } as ScoreAction;
      s = ice.reducer(s, a); log.push(a);
      const e = s.events.at(-1)!;
      if (e.servedId) {
        served++;
        assert.ok(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(e.servedId));
        assert.notEqual(e.servedId, e.playerId);
      }
    }
    for (const a of [{ type: 'END', payload: { at: 2000 } }, { type: 'START_SHOOTOUT', payload: { first: rnd(2) ? 'home' : 'away' } }] as ScoreAction[]) { s = ice.reducer(s, a); log.push(a); }
    for (let k = 0; k < 40 && !s.shootoutWinner; k++) {
      if (ice.needsSdPick(s)) { const a = { type: 'SO_ORDER', payload: { first: rnd(2) ? 'home' : 'away' } } as ScoreAction; s = ice.reducer(s, a); log.push(a); continue; }
      const side = ice.nextShooter(s.shootout!, s.soRounds);
      const a: ScoreAction = rnd(5) === 0
        ? { type: 'SO', side, payload: { scored: rnd(2) === 0, outcome: pick(HOSTILE), gkId: pick(HOSTILE) } } as ScoreAction
        : ice.soAction(side, pick(['scored', 'saved', 'missed'] as const), rnd(4) ? { id: `${side[0]}${rnd(9)}` } : null, rnd(4) ? { id: `${opp(side)[0]}gk` } : null);
      s = ice.reducer(s, a); log.push(a); kicks++;
      const shots = [...s.shootout!.home, ...s.shootout!.away];
      for (const x of shots) {
        if ('outcome' in x) assert.ok(!x.scored && (x.outcome === 'saved' || x.outcome === 'missed'));
        if ('gkId' in x) assert.ok(typeof x.gkId === 'string');
      }
      const sc = ice.soScore(s);
      assert.equal(sc.home, s.shootout!.home.filter((x) => x.scored).length);
      assert.equal(sc.away, s.shootout!.away.filter((x) => x.scored).length);
    }
    const t = iceHockeyTotals(s);
    for (const l of Object.values(t)) if ('soSaves' in l.stats) assert.ok(l.stats.soSaves <= l.stats.soShotsFaced);
    const faced = [...s.shootout!.home, ...s.shootout!.away].filter((x) => x.gkId).length;
    assert.equal(Object.values(t).reduce((a, l) => a + (l.stats.soShotsFaced ?? 0), 0), faced);
    for (const line of lines(iceHockeyCommentary(s, names))) assert.ok(clean(line), line);
    for (const r of iceHockeyTimeline(s, names)) assert.ok(clean(`${r.label} ${r.detail ?? ''}`));
    if (m % 10 === 0) assertContract({ ...ICE_SP, config: cfg }, toRecords(log), { every: 5, label: `so ${m}` });
  }
  assert.ok(kicks > 3000 && served > 300, `${kicks} / ${served}`);
});

/* ------------------------- ruled out (four sports) ------------------------- */

type RSport = { id: ro.RuledOutSport; init: (c?: Record<string, unknown>) => unknown; reducer: (s: never, a: ScoreAction) => unknown; score: (s: never) => number[];
  scoring: (side: Side) => ScoreAction; scored: (s: never) => number[]; text: (s: never) => string[] };
const pts = <E extends { side: Side }>(events: E[], f: (e: E) => number) => [events.filter((e) => e.side === 'home').reduce((a, e) => a + f(e), 0), events.filter((e) => e.side === 'away').reduce((a, e) => a + f(e), 0)];
const R_SPORTS: RSport[] = [
  { id: 'hockey', init: hk.init, reducer: hk.reducer as never, score: (s: hk.HockeyState) => [s.home, s.away],
    scoring: (side) => ({ type: 'GOAL', side, payload: { goalType: 'field' } }), scored: (s: hk.HockeyState) => pts(s.events, (e) => (e.type === 'goal' ? 1 : 0)),
    text: (s: hk.HockeyState) => [...hockeyFeed(s, names).map((f) => f.text), ...hockeyTimeline(s, names).map((r) => `${r.label} ${r.detail ?? ''}`)] } as never,
  { id: 'ice_hockey', init: ice.init, reducer: ice.reducer as never, score: (s: ice.IceHockeyState) => [s.home, s.away],
    scoring: (side) => ({ type: 'GOAL', side, payload: { strength: 'ev' } }), scored: (s: ice.IceHockeyState) => pts(s.events, (e) => (e.type === 'goal' ? 1 : 0)),
    text: (s: ice.IceHockeyState) => [...lines(iceHockeyCommentary(s, names)), ...iceHockeyTimeline(s, names).map((r) => `${r.label} ${r.detail ?? ''}`)] } as never,
  { id: 'rugby', init: ru.init, reducer: ru.reducer as never, score: (s: ru.RugbyState) => [s.home, s.away],
    scoring: (side) => ({ type: 'TRY', side, payload: {} }), scored: (s: ru.RugbyState) => pts(s.events, ru.pointsOf),
    text: (s: ru.RugbyState) => [...lines(rugbyCommentary(s, names)), ...rugbyTimeline(s, names).map((r) => `${r.label} ${r.detail ?? ''}`)] } as never,
  { id: 'rugby_league', init: rl.init, reducer: rl.reducer as never, score: (s: rl.LeagueState) => [s.home, s.away],
    scoring: (side) => ({ type: 'TRY', side, payload: {} }), scored: (s: rl.LeagueState) => pts(s.events, rl.pointsOf),
    text: (s: rl.LeagueState) => [...lines(leagueCommentary(s, names)), ...leagueTimeline(s).map((r) => `${r.label} ${r.detail ?? ''}`)] } as never,
];

for (const sp of R_SPORTS) {
  test(`${sp.id}: 500 random matches with goals / tries ruled out (valid, hostile, removed) — the score never moves`, () => {
    let rows = 0;
    for (let m = 0; m < 500; m++) {
      let s = sp.reducer(sp.init({ trackRuledOut: rnd(2) === 0 }) as never, { type: 'CLOCK', payload: { run: true, at: 1000 } } as ScoreAction);
      for (let i = 0; i < 12; i++) {
        const side: Side = rnd(2) ? 'home' : 'away';
        let a: ScoreAction;
        switch (rnd(5)) {
          case 0: a = sp.scoring(side); break;
          case 1: a = { type: 'RULED_OUT', side: rnd(6) ? side : pick(HOSTILE), payload: { reason: pick(HOSTILE), review: pick(HOSTILE) } } as unknown as ScoreAction; break;
          case 2: { // remove a ruled-out row
            const ev = (s as { events: { id: string; type: string }[] }).events.filter((e) => e.type === 'ruledout');
            a = { type: 'REMOVE_EVENT', payload: { id: ev.length ? pick(ev).id : 'nope' } } as ScoreAction;
            break;
          }
          default: a = ro.ruledOutAction(sp.id, side, { reason: rnd(4) ? pick(ro.RULED_OUT_REASONS[sp.id]) : undefined, review: rnd(2) === 0 });
        }
        s = sp.reducer(s as never, { ...a, payload: { ...a.payload, sec: 30 * i, psec: 30 * i, period: 1, at: 1000 + i } } as ScoreAction);
        assert.deepEqual(sp.score(s as never), sp.scored(s as never), 'the score is the scoring events only');
        for (const e of (s as { events: { type: string; reason?: unknown; review?: unknown; playerId?: unknown }[] }).events) {
          if (e.type !== 'ruledout') continue;
          assert.ok(e.reason === undefined || ro.RULED_OUT_REASONS[sp.id].includes(e.reason as string));
          assert.ok(e.review === undefined || e.review === true);
          assert.equal(e.playerId, undefined);
        }
      }
      rows += (s as { events: { type: string }[] }).events.filter((e) => e.type === 'ruledout').length;
      for (const t of sp.text(s as never)) assert.ok(clean(t), t);
    }
    assert.ok(rows > 500, `rows ${rows}`);
  });
}

test('hockey: ruled-out rows never touch the stat lines (contract)', () => {
  const sp: TotalsSport<hk.HockeyState> = { name: 'hockey', init: hk.init, reducer: hk.reducer, statTotals: hockeyTotals, derived: HK_DERIVED };
  for (let m = 0; m < 50; m++) {
    const log: ScoreAction[] = [{ type: 'CLOCK', payload: { run: true, at: 1000 } } as ScoreAction];
    for (let i = 0; i < 10; i++) {
      const side: Side = rnd(2) ? 'home' : 'away';
      log.push(rnd(2) ? ro.ruledOutAction('hockey', side, { reason: pick(ro.RULED_OUT_REASONS.hockey) })
        : { type: 'GOAL', side, payload: { goalType: 'field', sec: i * 20, period: 1 }, attribution: hk.creditAttribution(hk.eventCredits({ type: 'goal', goalType: 'field', playerId: `${side[0]}${rnd(5)}` }).first, 1) } as ScoreAction);
    }
    assertContract(sp, toRecords(log), { every: 3 });
  }
});

/* ----------------------------- restarts (rugby) ----------------------------- */

for (const code of ['rugby', 'rugby_league'] as const) {
  test(`${code}: 500 random matches with restart tallies (valid, hostile, the other code's) — sheet rows add up`, () => {
    const eng = code === 'rugby' ? ru : rl;
    const other = code === 'rugby' ? rs.LEAGUE_RESTARTS.filter((k) => !rs.UNION_RESTARTS.includes(k as never)) : rs.UNION_RESTARTS.filter((k) => !rs.LEAGUE_RESTARTS.includes(k as never));
    let rows = 0;
    for (let m = 0; m < 500; m++) {
      const tracked = rnd(3) !== 0;
      let s = (eng.reducer as (s: unknown, a: ScoreAction) => unknown)(eng.init({ trackRestarts: tracked }), { type: 'CLOCK', payload: { run: true, at: 1000 } } as ScoreAction) as ru.RugbyState & rl.LeagueState;
      for (let i = 0; i < 15; i++) {
        const side: Side = rnd(2) ? 'home' : 'away';
        const a: ScoreAction = rnd(5) === 0 ? { type: 'RESTART', side: rnd(3) ? side : pick(HOSTILE), payload: { kind: rnd(2) ? pick(HOSTILE) : pick(other) } } as unknown as ScoreAction
          : rnd(6) === 0 ? { type: 'TRY', side, payload: {} } as ScoreAction
          : rs.restartAction(side, pick(rs.restartKinds(code)));
        s = (eng.reducer as (s: unknown, a: ScoreAction) => unknown)(s, { ...a, payload: { ...a.payload, sec: 20 * i, psec: 20 * i, period: 1, at: 1000 + i } } as ScoreAction) as typeof s;
        for (const e of s.events) if (e.type === 'restart') assert.ok(rs.isRestart(code, e.restart));
      }
      const n = s.events.filter((e) => e.type === 'restart').length;
      rows += n;
      const sheet = code === 'rugby' ? rugbySheet(s) : leagueSheet(s);
      const sec = sheet.sections.find((x) => x.key === 'restarts');
      if (!tracked && n === 0) assert.equal(sec, undefined, 'no rows on a match that never tracked them');
      else assert.equal(sec!.rows.reduce((a, r) => a + r.h + r.a, 0), n);
      const text = code === 'rugby' ? lines(rugbyCommentary(s, names)) : lines(leagueCommentary(s, names));
      for (const t of text) assert.ok(clean(t), t);
      assert.equal(s.home + s.away, (code === 'rugby' ? s.events.reduce((a, e) => a + ru.pointsOf(e), 0) : s.events.reduce((a, e) => a + rl.pointsOf(e as rl.LeagueEvent), 0)));
    }
    assert.ok(rows > 3000, `rows ${rows}`);
  });
}

/* ------------------------------ league voice ------------------------------ */

test('league voice: 600 matches — "penalty to the attack" only with a set running, always the defence\'s penalty', () => {
  let ends = 0;
  for (let m = 0; m < 600; m++) {
    const errors = rnd(2) === 0;
    let s = rl.reducer(rl.init({ trackSets: true, trackErrors: errors }), { type: 'CLOCK', payload: { run: true, at: 1000 } } as ScoreAction);
    const ctx = (): VoiceContext => ({ state: s, homeRoster: [], awayRoster: [], homeName: 'Lions', awayName: 'Tigers', now: 5000 + m } as unknown as VoiceContext);
    for (let i = 0; i < 8; i++) {
      if (rnd(3) === 0) s = rl.reducer(s, { type: 'SET_BALL', side: rnd(2) ? 'home' : 'away', payload: { at: 2000 + i } } as ScoreAction);
      const phrase = pick(['penalty to the attack', 'penalty won', 'penalty with the ball', 'tackle', 'six again', 'penalty', 'penalty to the ball']);
      const out = leagueVoice(phrase, ctx());
      const open = rl.currentSet(s);
      if (/^penalty (to|won|with)/.test(phrase)) {
        if (!open) assert.equal(out, null);
        else {
          assert.equal(out![0].payload?.how, 'penWon');
          const n = s.events.length;
          s = out!.reduce(rl.reducer, s);
          ends++;
          if (errors) assert.equal(s.events.at(-1)!.side, opp(open.side));
          else assert.equal(s.events.length, n);
        }
      } else if (out) s = out.reduce(rl.reducer, s);
    }
  }
  assert.ok(ends > 500, `ends ${ends}`);
});
