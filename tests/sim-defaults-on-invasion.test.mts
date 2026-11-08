/**
 * Wave 3 — defaults-on for invasion sports: a 600-user simulation
 * (docs/security/breaks/defaults-on-invasion.md DOI1, DOI8, DOI9).
 * 120 new matches per sport (football, hockey, ice hockey, union, league)
 * stamped with the NEW defaults, random play:
 *  - no false zeros: a stats key appears only for a kind that was captured;
 *  - one-tap scoring is never blocked: every goal / try lands on its own
 *    action, whatever else is on;
 *  - old-format matches (no keys, or the old stored values) replay exactly as
 *    before: the same log gives the same state with or without the key absent
 *    vs explicitly off, and none of the new flags turns on.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FormatField, ScoreAction } from '../src/sports/types.ts';
import { FOOTBALL_META, FOOTBALL_STATS_DEFAULTS } from '../src/sports/football/meta.ts';
import * as football from '../src/sports/football/engine.ts';
import { footballStatTotals, GOAL_STAT, STAT_KEY, statCredits } from '../src/sports/football/totals.ts';
import { footballTrackedKeys } from '../src/sports/football/actions.ts';
import { footballCapturedKeys } from '../src/sports/football/depth.ts';
import type { StatKind } from '../src/sports/football/events.ts';
import { HOCKEY_META, HOCKEY_STATS_DEFAULTS } from '../src/sports/hockey/meta.ts';
import * as hockey from '../src/sports/hockey/engine.ts';
import { ICE_HOCKEY_META, ICE_HOCKEY_STATS_DEFAULTS } from '../src/sports/ice_hockey/meta.ts';
import * as ice from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyTotals } from '../src/sports/ice_hockey/totals.ts';
import { RUGBY_META, RUGBY_STATS_DEFAULTS } from '../src/sports/rugby/meta.ts';
import * as rugby from '../src/sports/rugby/engine.ts';
import { rugbyTotals } from '../src/sports/rugby/totals.ts';
import { UNION_RESTARTS } from '../src/sports/invasion/restarts.ts';
import { RUGBY_LEAGUE_META, RUGBY_LEAGUE_STATS_DEFAULTS } from '../src/sports/rugby_league/meta.ts';
import * as league from '../src/sports/rugby_league/engine.ts';
import { leagueTotals } from '../src/sports/rugby_league/totals.ts';

type Side = 'home' | 'away';
const SIDES = ['home', 'away'] as const;
const N = 120; // × 5 sports = 600 users

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0x100000000; };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const keysOf = (t: Record<string, { stats: Record<string, number> }>): Set<string> => new Set(Object.values(t).flatMap((l) => Object.keys(l.stats)));
const nm = (id: string) => id.toUpperCase();
let u = 0;

const newMatch = (fields: readonly FormatField[], ctx?: 'tournament') => {
  const preset = fields.find((f) => f.type === 'preset');
  const opts = preset?.options?.filter((o) => o.set) ?? [];
  const pd = ctx === 'tournament' && preset?.tournamentDefault != null ? preset.tournamentDefault : preset?.default;
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f === preset ? pd : (ctx === 'tournament' && f.tournamentDefault != null ? f.tournamentDefault : f.default)]));
  Object.assign(out, opts.find((o) => o.value === pd)?.set ?? {});
  return out;
};
/** a new match on a random preset (DOI4: picking one keeps the stats defaults) */
const newMatchOnPreset = (fields: readonly FormatField[], r: () => number) => {
  const cfg = newMatch(fields, r() < 0.3 ? 'tournament' : undefined);
  const preset = fields.find((f) => f.type === 'preset');
  const o = pick(r, preset?.options?.filter((x) => x.set) ?? [{ value: undefined, set: {} } as never]);
  return { ...cfg, preset: o.value, ...(o.set ?? {}) };
};
/** an old match's stored format: the keys absent, or the old values stored */
const oldFormats = (d: Record<string, boolean>): Record<string, unknown>[] => [{}, Object.fromEntries(Object.keys(d).map((k) => [k, false]))];

/* ------------------------------- football -------------------------------- */
const FB_KINDS: StatKind[] = ['shot', 'foul', 'offside', 'corner', 'tackle', 'interception', 'save', 'cross', 'dribble', 'handball', 'attackContribution', 'defenceContribution', 'keyPass', 'clearance'];
const FB_KEYS: Record<string, string[]> = {
  tackle: ['tackles'], interception: ['interceptions'], foul: ['fouls'], save: ['saves'], cross: ['crosses'], dribble: ['dribbles'],
  offside: ['offsides'], handball: ['handballs'], attackContribution: ['attackingContributions'], defenceContribution: ['defensiveContributions'],
  keyPass: ['keyPasses'], clearance: ['clearances'],
};
const FB_PL: Record<Side, string[]> = { home: ['hgk', 'hcb', 'hmf', 'hst'], away: ['agk', 'acb', 'amf', 'ast'] };
const fbP = (id: string) => ({ id, name: nm(id) });
const FB_KICK: ScoreAction[] = [
  { type: 'KICKOFF', payload: { at: 1000, ord: true } },
  ...SIDES.map((team): ScoreAction => ({ type: 'XI', payload: { team, gk: fbP(FB_PL[team][0]), players: FB_PL[team].map(fbP), keepers: [fbP(FB_PL[team][0])] } })),
];
let fbMin = 1;
const fbGoal = (side: Side, id: string): ScoreAction =>
  ({ type: 'GOAL', side, payload: { goalType: 'open', pid: id, minute: fbMin++, half: 1 }, attribution: { playerId: id, stat: 'goals', playerName: nm(id), extra: { shots: 1, shotsOnTarget: 1, [GOAL_STAT.open]: 1 } } });
const fbStat = (side: Side, kind: StatKind, id: string, ref?: number): ScoreAction => {
  const key = STAT_KEY[kind];
  const c = statCredits({ kind });
  const { [key ?? '']: _k, ...extra } = c;
  return { type: 'STAT', side, payload: { kind, at: 1, ...(ref != null ? { ref } : {}), minute: fbMin++, half: 1 }, attribution: key ? { playerId: id, stat: key, playerName: nm(id), ...(Object.keys(extra).length ? { extra } : {}) } : undefined };
};

describe('600 users · new matches with the new defaults, random play', () => {
  test(`${N} football matches: no false zeros, goals on one action, old formats unchanged`, () => {
    for (let m = 0; m < N; m++) {
      const r = rng(71_000 + m);
      const cfg = newMatchOnPreset(FOOTBALL_META.formatFields!, r);
      for (const [k, v] of Object.entries(FOOTBALL_STATS_DEFAULTS)) if (k !== 'trackPossession') assert.equal(cfg[k], v, `m${m} ${k}`);
      const used = FB_KINDS.filter(() => r() < 0.3);
      let s = FB_KICK.reduce(football.reducer, football.init(cfg));
      let goals = 0;
      const acts: ScoreAction[] = [...FB_KICK];
      for (let i = 0; i < 20; i++) {
        const side = pick(r, SIDES), id = pick(r, FB_PL[side]);
        const a = r() < 0.2 || !used.length ? fbGoal(side, id) : fbStat(side, pick(r, used), id);
        const before = s.home + s.away;
        s = football.reducer(s, a);
        acts.push(a);
        if (a.type === 'GOAL') { goals++; assert.equal(s.home + s.away, before + 1, `m${m} one-tap goal`); }
      }
      assert.equal(s.home + s.away, goals);
      const captured = new Set(s.stats.map((e) => e.kind));
      const keys = keysOf(footballStatTotals(s));
      const stamp = footballCapturedKeys(footballTrackedKeys(s.track, s.deep ?? {}), s);
      for (const [kind, ks] of Object.entries(FB_KEYS)) {
        if (captured.has(kind as StatKind)) continue;
        for (const k of ks) { assert.ok(!keys.has(k), `m${m} totals ${k}`); assert.ok(!stamp.includes(k), `m${m} stamp ${k}`); }
      }
      // DOI1: the same log on an old format replays as it always did (no deep, full base set)
      const [absent, offs] = oldFormats(FOOTBALL_STATS_DEFAULTS);
      const old = acts.reduce(football.reducer, football.init(absent));
      assert.equal(old.deep, undefined, `m${m} old deep`);
      assert.deepEqual(old.track, football.readTrack({}), `m${m} old track`);
      const oldOff = acts.reduce(football.reducer, football.init(offs));
      assert.equal(oldOff.deep, undefined);
      assert.ok(Object.values(oldOff.track).every((v) => v === false), `m${m} stored off stays off`);
      assert.equal(old.home + old.away, goals);
    }
  });

  test(`${N} hockey matches: nothing new switched on; goals on one action`, () => {
    for (let m = 0; m < N; m++) {
      const r = rng(72_000 + m);
      const cfg = newMatchOnPreset(HOCKEY_META.formatFields!, r);
      for (const [k, v] of Object.entries(HOCKEY_STATS_DEFAULTS)) assert.equal(cfg[k], v, `m${m} ${k}`);
      let s = hockey.init(cfg);
      assert.ok(!s.track?.possession && !s.track?.referrals && !s.track?.ruledOut, `m${m} off`);
      let goals = 0;
      for (let i = 0; i < 12; i++) {
        const side = pick(r, SIDES);
        const before = s.home + s.away;
        if (r() < 0.4) {
          s = hockey.reducer(s, { type: 'GOAL', side, payload: { uid: `h${++u}`, sec: i * 30, period: 1 } });
          goals++;
          assert.equal(s.home + s.away, before + 1, `m${m} one-tap goal`);
        } else s = hockey.reducer(s, { type: 'PC', side, payload: { uid: `h${++u}`, sec: i * 30, period: 1 } });
      }
      assert.equal(s.home + s.away, goals);
      for (const old of oldFormats(HOCKEY_STATS_DEFAULTS)) assert.deepEqual(hockey.init(old).track, hockey.init({}).track);
    }
  });

  test(`${N} ice hockey matches: no false zeros, goals on one action, old formats unchanged`, () => {
    const IH = ['hg', 'h2', 'h3', 'h4', 'h5', 'h6'], IA = ['ag', 'a2', 'a3', 'a4', 'a5', 'a6'];
    const A = (type: string, side: Side, sec: number, ev: Partial<ice.IceEvent>, payload: Record<string, unknown> = {}): ScoreAction => {
      const cr = ice.eventCredits({ side, ...ev } as ice.IceEvent);
      const a: ScoreAction = { type, side, payload: { ...payload, uid: `i${++u}`, sec, period: 1 } };
      const a1 = ice.creditAttribution(cr.first), a2 = ice.creditAttribution(cr.second);
      if (a1) a.attribution = a1;
      if (a2) a.attribution2 = a2;
      return a;
    };
    const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: (team === 'home' ? IH : IA).map((id) => ({ id, name: nm(id) })), gk: { id: team === 'home' ? 'hg' : 'ag', name: nm(team === 'home' ? 'hg' : 'ag') } } });
    for (let m = 0; m < N; m++) {
      const r = rng(73_000 + m);
      const cfg = newMatchOnPreset(ICE_HOCKEY_META.formatFields!, r);
      for (const [k, v] of Object.entries(ICE_HOCKEY_STATS_DEFAULTS)) assert.equal(cfg[k], v, `m${m} ${k}`);
      const used = ice.TALLY_KINDS.filter((k) => k !== 'faceoff' && r() < 0.35);
      const acts: ScoreAction[] = [xi('home'), xi('away')];
      let s = acts.reduce(ice.reducer, ice.init(cfg));
      assert.equal(s.trackFaceoffZones, undefined, 'DOI9: zones stay off');
      assert.equal(s.plusMinus, false);
      let goals = 0;
      for (let i = 0; i < 15; i++) {
        const side = pick(r, SIDES), id = pick(r, side === 'home' ? IH.slice(1) : IA.slice(1));
        const before = s.home + s.away;
        let a: ScoreAction;
        if (r() < 0.25 || !used.length) { a = A('GOAL', side, 10 + i * 30, { type: 'goal', playerId: id, strength: 'ev' }, { strength: 'ev' }); goals++; }
        else { const kind = pick(r, used); a = A('TALLY', side, 10 + i * 30, { type: 'tally', tally: kind, playerId: id }, { kind }); }
        s = ice.reducer(s, a);
        acts.push(a);
        if (a.type === 'GOAL') assert.equal(s.home + s.away, before + 1, `m${m} one-tap goal`);
      }
      assert.equal(s.home + s.away, goals);
      const keys = keysOf(iceHockeyTotals(s));
      for (const k of ice.TALLY_KINDS) {
        if (s.events.some((e) => e.type === 'tally' && e.tally === k)) continue;
        assert.ok(!keys.has(ice.TALLY_KEY[k]), `m${m} ${k}`);
      }
      for (const k of ice.FO_ZONE_KEYS) assert.ok(!keys.has(k), `m${m} zone ${k}`);
      for (const old of oldFormats(ICE_HOCKEY_STATS_DEFAULTS)) {
        const o = acts.reduce(ice.reducer, ice.init(old));
        for (const f of [...ice.TRACK_FLAGS, 'trackFaceoffZones', 'trackRuledOut'] as const) assert.notEqual((o as never)[f], true, `m${m} old ${f}`);
        assert.deepEqual(o, acts.reduce(ice.reducer, ice.init({})), `m${m} old replay`);
      }
    }
  });

  test(`${N} rugby union matches: no false zeros, tries on one action, old formats unchanged`, () => {
    const RH = Array.from({ length: 15 }, (_, i) => `h${i + 1}`), RA = Array.from({ length: 15 }, (_, i) => `a${i + 1}`);
    const A = (type: string, side: Side, sec: number, ev: Partial<rugby.RugbyEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction => {
      const cr = rugby.eventCredits({ type: 'setpiece', side, ...ev } as rugby.RugbyEvent);
      const a: ScoreAction = { type, side, payload: { ...payload, uid: `r${++u}`, sec, psec: sec, period: 1 } };
      const a1 = rugby.creditAttribution(cr.first), a2 = rugby.creditAttribution(cr.second);
      if (a1) a.attribution = a1;
      if (a2) a.attribution2 = a2;
      return a;
    };
    const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: (team === 'home' ? RH : RA).map((id) => ({ id, name: nm(id) })) } });
    const DET = rugby.DETAIL_KEYS.filter((d) => d !== 'penaltyConceded');
    const TAL: rugby.TallyKind[] = ['turnover', 'offload'];
    for (let m = 0; m < N; m++) {
      const r = rng(74_000 + m);
      const cfg = newMatchOnPreset(RUGBY_META.formatFields!, r);
      for (const [k, v] of Object.entries(RUGBY_STATS_DEFAULTS)) assert.equal(cfg[k], v, `m${m} ${k}`);
      const usedD = DET.filter(() => r() < 0.3), usedT = TAL.filter(() => r() < 0.3);
      const acts: ScoreAction[] = [xi('home'), xi('away')];
      let s = acts.reduce(rugby.reducer, rugby.init(cfg));
      let pts = 0;
      for (let i = 0; i < 15; i++) {
        const side = pick(r, SIDES), id = pick(r, side === 'home' ? RH : RA);
        const x = r();
        const before = s.home + s.away;
        let a: ScoreAction;
        if (x < 0.35 && usedD.length) { const d = pick(r, usedD); a = A('DETAIL', side, 10 + i * 30, { type: 'detail', detail: d, playerId: id }, { detail: d }); }
        else if (x < 0.6 && usedT.length) { const k = pick(r, usedT); a = A('TALLY', side, 10 + i * 30, { type: 'tally', tally: k, playerId: id }, { kind: k }); }
        else if (x < 0.7) { const k = pick(r, UNION_RESTARTS); a = { type: 'RESTART', side, payload: { kind: k, uid: `r${++u}`, sec: 10 + i * 30, psec: 10 + i * 30, period: 1 } }; }
        else a = A('TRY', side, 10 + i * 30, { type: 'try', playerId: id });
        s = rugby.reducer(s, a);
        acts.push(a);
        if (a.type === 'TRY') { pts += 5; assert.equal(s.home + s.away, before + 5, `m${m} one-tap try`); }
      }
      assert.equal(s.home + s.away, pts);
      const keys = keysOf(rugbyTotals(s));
      const capD = new Set(s.events.filter((e) => e.type === 'detail').map((e) => e.detail));
      for (const d of DET) {
        const fam = d === 'tackle' || d === 'missedTackle' ? capD.has('tackle') || capD.has('missedTackle') : capD.has(d);
        if (!fam) assert.ok(!keys.has(rugby.DETAIL_STAT[d]), `m${m} ${d}`);
      }
      for (const k of TAL) if (!s.events.some((e) => e.type === 'tally' && e.tally === k)) assert.ok(!keys.has(rugby.TALLY_KEY[k]!), `m${m} ${k}`);
      for (const old of oldFormats(RUGBY_STATS_DEFAULTS)) {
        const o = acts.reduce(rugby.reducer, rugby.init(old));
        assert.equal(o.trackDetail, false);
        for (const f of [...rugby.TRACK_FLAGS, 'trackRuledOut', 'trackRestarts'] as const) assert.notEqual((o as never)[f], true, `m${m} old ${f}`);
        assert.deepEqual(o, acts.reduce(rugby.reducer, rugby.init({})), `m${m} old replay`);
      }
    }
  });

  test(`${N} rugby league matches: no false zeros, tries on one action, old formats unchanged`, () => {
    const A = (type: string, side: Side, sec: number, ev: Partial<league.LeagueEvent> = {}, payload: Record<string, unknown> = {}): ScoreAction => {
      const cr = league.eventCredits({ type: 'sub', side, ...ev } as league.LeagueEvent);
      const a: ScoreAction = { type, side, payload: { ...payload, uid: `l${++u}`, sec, psec: sec, period: 1 } };
      const a1 = league.creditAttribution(cr.first), a2 = league.creditAttribution(cr.second);
      if (a1) a.attribution = a1;
      if (a2) a.attribution2 = a2;
      return a;
    };
    const xi = (team: Side): ScoreAction => ({ type: 'XI', payload: { team, players: Array.from({ length: 13 }, (_, i) => `${team[0]}${i + 1}`).map((id) => ({ id, name: nm(id) })) } });
    for (let m = 0; m < N; m++) {
      const r = rng(75_000 + m);
      const cfg = newMatchOnPreset(RUGBY_LEAGUE_META.formatFields!, r);
      for (const [k, v] of Object.entries(RUGBY_LEAGUE_STATS_DEFAULTS)) assert.equal(cfg[k], v, `m${m} ${k}`);
      const used = league.DETAIL_KEYS.filter(() => r() < 0.3);
      const acts: ScoreAction[] = [xi('home'), xi('away')];
      let s = acts.reduce(league.reducer, league.init(cfg));
      assert.notEqual(s.trackSets, true, 'six-tackle sets stay off');
      let pts = 0;
      for (let i = 0; i < 15; i++) {
        const side = pick(r, SIDES), id = `${side[0]}${1 + Math.floor(r() * 13)}`;
        const before = s.home + s.away;
        let a: ScoreAction;
        if (r() < 0.3 || !used.length) a = A('TRY', side, 10 + i * 30, { type: 'try', playerId: id });
        else { const d = pick(r, used); a = A('DETAIL', side, 10 + i * 30, { type: 'detail', detail: d, playerId: id }, { detail: d }); }
        s = league.reducer(s, a);
        acts.push(a);
        if (a.type === 'TRY') { pts += 4; assert.equal(s.home + s.away, before + 4, `m${m} one-tap try`); }
      }
      assert.equal(s.home + s.away, pts);
      const keys = keysOf(leagueTotals(s));
      const cap = new Set(s.events.filter((e) => e.type === 'detail').map((e) => e.detail));
      for (const d of league.DETAIL_KEYS) {
        // tackles and missed tackles are one family (a tackle rate)
        const fam = d === 'tackle' || d === 'missedTackle' ? cap.has('tackle') || cap.has('missedTackle') : cap.has(d);
        if (!fam) assert.ok(!keys.has(league.DETAIL_STAT[d]), `m${m} ${d}`);
      }
      for (const old of oldFormats(RUGBY_LEAGUE_STATS_DEFAULTS)) {
        const o = acts.reduce(league.reducer, league.init(old));
        for (const f of [...league.TRACK_FLAGS, 'trackRuledOut', 'trackRestarts'] as const) assert.notEqual((o as never)[f], true, `m${m} old ${f}`);
        assert.deepEqual(o, acts.reduce(league.reducer, league.init({})), `m${m} old replay`);
      }
    }
  });
});
