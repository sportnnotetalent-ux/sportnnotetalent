/**
 * US sports batch 1 — simulation (quality mandate step 6): 600 random
 * basketball games and 600 random baseball games, each checking that
 *  - the live credits the actions carry equal statTotals (fouls, turnovers,
 *    strikeouts, kLooking), also after random Removes;
 *  - a turnover count = turnover plays + stamped offensive fouls, and an
 *    older log (the same plays, offensive fouls unstamped) keeps the old count;
 *  - kLooking = strikeouts on a called third strike; never above strikeouts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { init as bbInit, reducer as bbReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { foulAction, lineupAction, removeAction, scoreAction, statAction } from '../src/sports/basketball/actions.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import { bbTeamFigures } from '../src/sports/basketball/deep.ts';
import { init as bsInit, reducer as bsReducer, buildPlay, buildPitch, eventCredits as bsCredits, creditAttribution, readConfig, type BaseballState, type Outcome } from '../src/sports/baseball/engine.ts';
import { baseballTotals } from '../src/sports/baseball/totals.ts';
import { teamSplit } from '../src/sports/baseball/situational.ts';

let seed = 20261102;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const N = 600;

function addLive(out: Record<string, Record<string, number>>, a: ScoreAction) {
  for (const at of [a.attribution, a.attribution2]) {
    if (!at) continue;
    const l = (out[at.playerId] ??= {});
    l[at.stat] = (l[at.stat] ?? 0) + (at.by ?? 1);
    for (const [k, v] of Object.entries(at.extra ?? {})) l[k] = (l[k] ?? 0) + (v as number);
  }
}

/* -------------------------------- basketball -------------------------------- */

const P = (id: string): Player => ({ id, fullName: id, sports: [] } as Player);
const HOME = ['h1', 'h2', 'h3', 'h4', 'h5'].map(P), AWAY = ['a1', 'a2', 'a3', 'a4', 'a5'].map(P);
const FOULS = ['personal', 'shooting', 'offensive', 'technical'] as const;

describe('sim · basketball offensive foul = turnover', () => {
  test(`${N} random games: live = statTotals; old logs keep their counts`, () => {
    let removes = 0, offFouls = 0;
    for (let g = 0; g < N; g++) {
      let s: BasketballState = [lineupAction('home', HOME), lineupAction('away', AWAY), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction]
        .reduce(bbReducer, bbInit({ periodMinutes: 10, regPeriods: 4, foulsForBonus: 0 }));
      let old: BasketballState = s;
      const live: Record<string, Record<string, number>> = {};
      const plays = 10 + rnd(30);
      for (let i = 0; i < plays; i++) {
        const side = rnd(2) ? 'home' : 'away';
        const p = (side === 'home' ? HOME : AWAY)[rnd(5)];
        const kind = rnd(4);
        let a: ScoreAction;
        if (kind === 0) a = scoreAction(side, 2 + rnd(2), p);
        else if (kind === 1) a = statAction(side, 'TURNOVER', p);
        else a = foulAction(side, p, FOULS[rnd(FOULS.length)]);
        a = { ...a, payload: { ...a.payload, quarter: 1, minute: 0, sec: i, v: 2 } };
        // the same play as an older build sent it: no stamp, fouls only
        const legacy: ScoreAction = a.type === 'FOUL'
          ? { ...a, payload: { ...a.payload, tov: undefined }, attribution: { playerId: p.id, stat: 'fouls' } } : a;
        const before = s.events.length;
        s = bbReducer(s, a); old = bbReducer(old, legacy);
        if (s.events.length > before) addLive(live, a);
        // random Remove of an earlier play
        if (rnd(8) === 0) {
          const cand = s.events.filter((e) => e.pid && ['score', 'turnover', 'foul'].includes(e.type));
          if (cand.length) {
            const e = cand[rnd(cand.length)];
            const r = removeAction(e, e.pid, { halfCourt: false, tracked: false });
            s = bbReducer(s, r); addLive(live, r);
            const oe = old.events.find((x) => x.id === e.id)!;
            old = bbReducer(old, removeAction(oe, oe.pid, { halfCourt: false, tracked: false }));
            removes++;
          }
        }
      }
      const t = basketballStatTotals(s);
      for (const [id, l] of Object.entries(t)) {
        for (const k of ['fouls', 'turnovers', 'points'] as const) assert.equal(l.stats[k] ?? 0, live[id]?.[k] ?? 0, `game ${g} ${id} ${k}`);
        const mine = s.events.filter((e) => e.pid === id);
        const off = mine.filter((e) => e.type === 'foul' && e.foulType === 'offensive').length;
        offFouls += off;
        assert.equal(l.stats.turnovers ?? 0, mine.filter((e) => e.type === 'turnover').length + off, `game ${g} ${id} TO`);
        const ol = basketballStatTotals(old)[id];
        assert.equal(ol?.stats.turnovers ?? 0, mine.filter((e) => e.type === 'turnover').length, `game ${g} ${id} old TO`);
        assert.equal(ol?.stats.fouls ?? 0, l.stats.fouls ?? 0, 'fouls unchanged');
      }
      for (const side of ['home', 'away'] as const) {
        const f = bbTeamFigures(s, side);
        const ev = s.events.filter((e) => e.side === side);
        assert.equal(f.tov, ev.filter((e) => e.type === 'turnover' || e.tov).length);
        assert.equal(bbTeamFigures(old, side).tov, ev.filter((e) => e.type === 'turnover').length);
      }
      assert.deepEqual(old.score, s.score, 'score unchanged');
    }
    assert.ok(removes > 100 && offFouls > 300, `coverage: ${removes} removes, ${offFouls} offensive fouls`);
  });
});

/* --------------------------------- baseball --------------------------------- */

const ORDER = (p: string) => Array.from({ length: 9 }, (_, i) => ({ id: `${p}${i + 1}`, name: `${p}${i + 1}` }));
const QUICK: Outcome[] = ['1B', '2B', 'HR', 'BB', 'K', 'K', 'GO', 'FO'];

describe('sim · baseball K looking / swinging', () => {
  test(`${N} random games (pitch mode and quick pad): live = statTotals, kLooking = called Ks`, () => {
    let looks = 0;
    for (let g = 0; g < N; g++) {
      let s: BaseballState = bsInit(g % 2 ? { pitches: false } : undefined);
      for (const team of ['home', 'away'] as const) s = bsReducer(s, { type: 'LINEUP', payload: { team, order: ORDER(team[0]), pitcher: { id: `${team[0]}p`, name: 'P' } } });
      assert.ok(readConfig().innings > 0);
      const live: Record<string, Record<string, number>> = {};
      const steps = 20 + rnd(60);
      for (let i = 0; i < steps && !s.g.ended; i++) {
        let a: ScoreAction;
        if (rnd(2)) {
          const k = (['ball', 'called', 'swinging', 'foul'] as const)[rnd(4)];
          a = buildPitch(s, k);
        } else {
          const o = QUICK[rnd(QUICK.length)];
          a = o === 'K' ? buildPlay(s, 'K', rnd(3) ? { pitch: rnd(2) ? 'called' : 'swinging' } : {}) : buildPlay(s, o);
        }
        const before = s.events.length;
        s = bsReducer(s, a);
        if (s.events.length > before) addLive(live, a);
        if (rnd(10) === 0) {
          const pas = s.events.filter((e) => e.type === 'pa');
          if (pas.length) {
            const e = pas[rnd(pas.length)];
            const cr = bsCredits(e);
            const r: ScoreAction = { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) };
            const n = s.events.length;
            s = bsReducer(s, r);
            if (s.events.length < n) addLive(live, r);
          }
        }
      }
      const t = baseballTotals(s);
      for (const [id, l] of Object.entries(t)) {
        for (const k of ['strikeouts', 'kLooking', 'kPitched'] as const) assert.equal(l.stats[k] ?? 0, live[id]?.[k] ?? 0, `game ${g} ${id} ${k}`);
        const ks = s.events.filter((e) => e.type === 'pa' && e.outcome === 'K' && e.batter?.id === id);
        assert.equal(l.stats.kLooking ?? 0, ks.filter((e) => e.pitch === 'called').length);
        assert.ok((l.stats.kLooking ?? 0) <= (l.stats.strikeouts ?? 0));
        looks += l.stats.kLooking ?? 0;
      }
      for (const side of ['home', 'away'] as const) {
        const sp = teamSplit(s, side);
        assert.ok(sp.kl <= sp.so);
        assert.equal(sp.kl, Object.values(t).filter((l) => l.side === side).reduce((n, l) => n + (l.stats.kLooking ?? 0), 0));
      }
    }
    assert.ok(looks > 500, `coverage: ${looks} strikeouts looking`);
  });
});
