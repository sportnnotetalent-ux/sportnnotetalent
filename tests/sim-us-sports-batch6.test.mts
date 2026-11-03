/**
 * US sports batch 6 — simulation (quality mandate step 6), seeded:
 *  - 600 basketball games (random format: NBA bonus rules, possession arrow,
 *    technicals as team fouls) with opening tips, held balls (hostile sides),
 *    coach / bench technicals (hostile values), fouls on the game clock:
 *    a held ball under the arrow always goes to the arrow's team; bench
 *    technicals are never team fouls; without the NBA key the bonus is the
 *    plain count; the coach-DQ count; jump balls and bench technicals credit
 *    nobody (statTotals equal without them); a game with none of the new
 *    actions keeps the old state shape;
 *  - 600 baseball games with dropped third strikes (valid and hostile),
 *    catcher's interference and triple plays: the game re-derives the same,
 *    outs ≤ 3, errors = E + CI + dropped-third errors, their runs unearned,
 *    WP / PB counted, at-bats exclude CI, live credits = statTotals;
 *  - 600 American football play-by-play games with returns, blocked kicks,
 *    onside kicks, fumbles kept / lost, forced fumbles and penalties on plays
 *    (all four settlements, hostile payloads): live credits = statTotals,
 *    a wiped-out play credits nobody, the ball stays on the field, team
 *    penalties / turnovers add up; every flag preset reads "Standard".
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import {
  init as bbInit, reducer as bbReducer, arrowSide, coachTechnicals, coachDisqualified, countsAsTeamFoul, inBonus, teamFoulsThisQuarter,
  type BasketballState,
} from '../src/sports/basketball/engine.ts';
import { foulAction, freeThrowAction, jumpBallAction, lineupAction, missAction, scoreAction } from '../src/sports/basketball/actions.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import { bbTeamFigures } from '../src/sports/basketball/deep.ts';
import { basketballFeed } from '../src/sports/basketball/commentary.ts';
import { pointsOf } from '../src/sports/basketball/events.ts';
import {
  init as bsInit, reducer as bsReducer, buildPlay as bsPlay, buildRunner, derive, NO_AB,
  type BaseballState, type Outcome, type RunnerKind,
} from '../src/sports/baseball/engine.ts';
import { baseballTotals } from '../src/sports/baseball/totals.ts';
import { baseballCommentary } from '../src/sports/baseball/commentary.ts';
import {
  init as afInit, reducer as afReducer, buildPlay as afPlay, eventCredits as afCredits, teamFigures, foulsFor, AF_LIVE_SETTINGS,
  type AFState, type PlayInput, type PenEnf,
} from '../src/sports/american_football/engine.ts';
import { AF_PRESETS } from '../src/sports/american_football/meta.ts';
import { afTotals } from '../src/sports/american_football/totals.ts';
import { afCommentary } from '../src/sports/american_football/commentary.ts';
import { afSheet } from '../src/sports/american_football/sheet.ts';
import { customCount } from '../src/sports/liveSettings.ts';

let seed = 20261106;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const N = 600;

function addLive(out: Record<string, Record<string, number>>, a: ScoreAction) {
  for (const x of [a.attribution, a.attribution2]) {
    if (!x) continue;
    const l = (out[x.playerId] ??= {});
    l[x.stat] = (l[x.stat] ?? 0) + (x.by ?? 1);
    for (const [k, v] of Object.entries(x.extra ?? {})) l[k] = (l[k] ?? 0) + (v as number);
  }
}

/* -------------------------------- basketball -------------------------------- */

type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const P = (id: string): Player => ({ id, fullName: id, sports: [] } as Player);
const HOME = ['h1', 'h2', 'h3', 'h4', 'h5'].map(P), AWAY = ['a1', 'a2', 'a3', 'a4', 'a5'].map(P);

describe('sim · basketball batch 6', () => {
  test(`${N} random games: the arrow decides held balls; bench techs never team fouls; bonus rules; nobody credited`, () => {
    let arrowHeld = 0, benchLogged = 0, lateBonus = 0, dq = 0;
    for (let g = 0; g < N; g++) {
      const cfg: Record<string, unknown> = {
        periodMinutes: 10, regPeriods: 4, gameClock: true, foulsForBonus: 4 + rnd(2), foulsToFoulOut: 0,
        ...(rnd(2) ? { nbaBonus: true } : {}), ...(rnd(3) ? { possArrow: rnd(4) > 0 } : {}), ...(rnd(2) ? { techIsTeamFoul: rnd(2) === 1 } : {}),
      };
      const fresh = () => [lineupAction('home', HOME), lineupAction('away', AWAY), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction].reduce(bbReducer, bbInit(cfg));
      let s = fresh();
      const all: ScoreAction[] = [];
      const plain: ScoreAction[] = [];
      let sec = 0;
      const plays = 30 + rnd(70);
      for (let i = 0; i < plays && !s.ended; i++) {
        sec += 1 + rnd(25);
        if (sec >= 600) { sec = 0; s = bbReducer(s, { type: 'NEXT_QUARTER' }); all.push({ type: 'NEXT_QUARTER' }); plain.push({ type: 'NEXT_QUARTER' }); if (s.quarter >= 4 && rnd(3) === 0) break; }
        const side: Side = rnd(2) ? 'home' : 'away';
        const roster = side === 'home' ? HOME : AWAY;
        const p = roster[rnd(5)];
        const r = rnd(12);
        let a: ScoreAction; let isNew = false;
        if (r <= 2) a = scoreAction(side, 2 + rnd(2), p);
        else if (r === 3) a = missAction(side, 2, p);
        else if (r === 4) a = freeThrowAction(side, rnd(2) === 1, p);
        else if (r <= 6) a = foulAction(side, rnd(4) ? p : null, (['personal', 'shooting', 'offensive', 'technical'] as const)[rnd(4)]);
        else if (r === 7) { a = foulAction(side, null, 'technical', { bench: rnd(2) ? 'C' : 'B' }); isNew = true; }
        else if (r === 8) { // hostile bench values
          const pick = rnd(3);
          a = pick === 0 ? { type: 'FOUL', side, payload: { foulType: 'technical', bench: 'Z' } }
            : pick === 1 ? { type: 'FOUL', side, payload: { foulType: 'personal', bench: 'C' } }
            : { type: 'FOUL', side, payload: { foulType: 'technical', bench: 'C', pid: p.id } };
        } else if (r <= 10) { a = jumpBallAction(rnd(5) === 0 ? ('nobody' as Side) : side, rnd(3) > 0); isNew = true; }
        else a = { type: 'TIMEOUT', side };
        a = { ...a, payload: { ...a.payload, quarter: s.quarter, minute: Math.floor(sec / 60), sec, v: 2 } };
        const before = s;
        const arrowBefore = arrowSide(before);
        s = bbReducer(s, a);
        all.push(a);
        if (!isNew) plain.push(a);
        const e = s.events.at(-1);
        if (s !== before && e?.type === 'jump' && e.ap) {
          arrowHeld++;
          assert.equal(e.side, arrowBefore, `g${g} the arrow's team gets the held ball`);
          assert.equal(arrowSide(s), other(e.side), `g${g} the arrow flips`);
        }
        if (s !== before && e?.type === 'foul' && e.bench) benchLogged++;
      }
      // invariants
      assert.equal(s.home, s.events.filter((e) => e.side === 'home').reduce((x, e) => x + pointsOf(e), 0), `g${g} score`);
      if (s.possArrow !== true) {
        assert.equal(arrowSide(s), null, `g${g} no arrow`);
        assert.equal(s.events.some((e) => e.ap), false, `g${g} no arrow possessions`);
      }
      for (const e of s.events) {
        if (e.bench) {
          assert.equal(e.foulType, 'technical', `g${g} bench only on a technical`);
          assert.ok(!e.pid && !e.playerName, `g${g} bench never with a player`);
          assert.equal(countsAsTeamFoul(s, e), false, `g${g} bench not a team foul`);
        }
      }
      for (const side of ['home', 'away'] as const) {
        const tf = s.events.filter((e) => e.side === side && e.quarter === s.quarter && countsAsTeamFoul(s, e)).length;
        if (!(s.otFoulsCarry && s.quarter > s.regPeriods)) assert.equal(teamFoulsThisQuarter(s, side), tf, `g${g} team fouls`);
        const opp = other(side);
        const at = rnd(2) ? 595 : rnd(600);
        if (!s.nbaBonus) assert.equal(inBonus(s, opp, at), s.foulsForBonus > 0 && teamFoulsThisQuarter(s, side) >= s.foulsForBonus, `g${g} plain bonus`);
        else {
          if (teamFoulsThisQuarter(s, side) >= s.foulsForBonus) assert.equal(inBonus(s, opp, at), true, `g${g} quota`);
          if (inBonus(s, opp, at) && teamFoulsThisQuarter(s, side) < s.foulsForBonus) lateBonus++;
        }
        const ct = coachTechnicals(s, side);
        assert.equal(ct.c + ct.b, s.events.filter((e) => e.side === side && e.bench).length);
        const d = coachDisqualified(s, side);
        assert.equal(d, ct.c >= 2 ? '2C' : ct.c + ct.b >= 3 ? '3B' : undefined);
        if (d) dq++;
        assert.equal(bbTeamFigures(s, side).benchTech, ct.c + ct.b);
        assert.equal(bbTeamFigures(s, side).jump, s.events.filter((e) => e.side === side && e.type === 'jump').length);
      }
      // jump balls and bench technicals credit nobody: statTotals equal without them
      const noNew = plain.reduce(bbReducer, fresh());
      assert.deepEqual(basketballStatTotals(s), basketballStatTotals(noNew), `g${g} new plays credit nobody`);
      assert.equal(noNew.events.some((e) => e.type === 'jump' || e.bench), false);
      basketballFeed(s, { home: 'H', away: 'A' });
      // a format without the new keys keeps the old state shape
      if (!('nbaBonus' in cfg) && !('possArrow' in cfg)) assert.ok(!('nbaBonus' in s) && !('possArrow' in s), `g${g} shape`);
    }
    assert.ok(arrowHeld > 100 && benchLogged > 100 && lateBonus > 10 && dq > 10, `coverage ${arrowHeld} ${benchLogged} ${lateBonus} ${dq}`);
  });
});

/* --------------------------------- baseball --------------------------------- */

const ORDER = (p: string) => Array.from({ length: 9 }, (_, i) => ({ id: `${p}${i + 1}`, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }));
const OUTS: Outcome[] = ['1B', '2B', 'HR', 'BB', 'K', 'GO', 'FO', 'LO', 'DP', 'SF', 'FC', 'E', 'CI', 'TP', 'HBP'];

describe('sim · baseball batch 6', () => {
  test(`${N} random games: dropped third strikes, catcher's interference, triple plays`, () => {
    let d3n = 0, cin = 0, tpn = 0;
    for (let g = 0; g < N; g++) {
      let s: BaseballState = bsInit({ innings: 3 + rnd(4), pitches: false });
      s = bsReducer(s, { type: 'LINEUP', payload: { team: 'home', order: ORDER('h'), pitcher: { id: 'hp' } } });
      s = bsReducer(s, { type: 'LINEUP', payload: { team: 'away', order: ORDER('a'), pitcher: { id: 'ap' } } });
      const live: Record<string, Record<string, number>> = {};
      for (let i = 0; i < 160 && !s.g.ended; i++) {
        const r = rnd(10);
        let a: ScoreAction;
        if (r === 0 && s.g.bases.some(Boolean)) a = buildRunner(s, (['WP', 'PB', 'SB', 'BK'] as RunnerKind[])[rnd(4)]);
        else if (r === 1) a = bsPlay(s, 'K', { d3: (['WP', 'PB', 'E'] as const)[rnd(3)] });
        else if (r === 2) { // hostile d3: on another play, or an unknown value
          const base = bsPlay(s, OUTS[rnd(OUTS.length)]);
          a = { ...base, payload: { ...base.payload, d3: rnd(2) ? 'WP' : 'ZZ' } };
        } else a = bsPlay(s, OUTS[rnd(OUTS.length)]);
        const before = s;
        s = bsReducer(s, a);
        if (s !== before) addLive(live, a);
      }
      // the game re-derives the same from its log
      assert.deepEqual(derive(s.cfg, s), s.g, `g${g} derive`);
      const ok = s.events.filter((e) => !s.g.ann[e.id]?.ignored);
      let errs = 0;
      for (const e of ok) {
        if (e.type !== 'pa') continue;
        assert.ok(s.g.ann[e.id].outs <= 3);
        if (e.d3) {
          d3n++;
          assert.equal(e.outcome, 'K', `g${g} d3 only on a K`);
          assert.ok(e.moves?.some((m) => m.from === 0 && m.to !== -1), `g${g} d3: the batter reached`);
        }
        if (e.outcome === 'CI') cin++;
        if (e.outcome === 'TP') tpn++;
        if (e.outcome === 'E' || e.outcome === 'CI' || e.d3 === 'E') errs++;
        for (const run of s.g.runs.filter((x) => x.event === e.id)) {
          if (e.outcome === 'CI' || e.d3 === 'PB' || e.d3 === 'E') assert.equal(run.earned, false, `g${g} unearned on ${e.outcome}/${e.d3}`);
        }
      }
      assert.equal(s.g.errors.home + s.g.errors.away, errs, `g${g} errors`);
      const t = baseballTotals(s);
      const sum = (k: string) => Object.values(t).reduce((x, l) => x + (l.stats[k] ?? 0), 0);
      const pas = s.events.filter((e) => e.type === 'pa');
      assert.equal(sum('atBats'), pas.filter((e) => !NO_AB.includes(e.outcome!)).length, `g${g} at-bats`);
      assert.equal(sum('wildPitches'), s.events.filter((e) => (e.type === 'runner' && e.kind === 'WP') || e.d3 === 'WP').length, `g${g} WP`);
      assert.equal(sum('passedBalls'), s.events.filter((e) => (e.type === 'runner' && e.kind === 'PB') || e.d3 === 'PB').length, `g${g} PB`);
      for (const [id, l] of Object.entries(live)) for (const [k, v] of Object.entries(l)) assert.equal(t[id]?.stats[k] ?? 0, v, `g${g} ${id} ${k}`);
      baseballCommentary(s, { home: 'H', away: 'A' });
    }
    assert.ok(d3n > 300 && cin > 300 && tpn > 20, `coverage ${d3n} ${cin} ${tpn}`);
  });
});

/* ------------------------------ American football ------------------------------ */

const ENF: PenEnf[] = ['prev', 'end', 'dec', 'off'];

describe('sim · American football batch 6', () => {
  test(`${N} random play-by-play games: returns, blocks, onside, fumbles, penalties on plays`, () => {
    let nul = 0, rets = 0, blocks = 0, onside = 0, kept = 0;
    for (let g = 0; g < N; g++) {
      const preset = (['nfl', 'ncaa', 'nfhs', 'flag'] as const)[rnd(4)];
      let s: AFState = afInit({ preset, mode: 'pbp' });
      const flag = s.variant === 'flag';
      const live: Record<string, Record<string, number>> = {};
      const id = (sd: Side) => `${sd[0]}${1 + rnd(11)}`;
      const go = (a: ScoreAction) => { const b = s; s = afReducer(s, a); if (s !== b && a.type !== 'REMOVE_EVENT') addLive(live, a); };
      if (flag) go({ type: 'SET_DRIVE', payload: { off: 'home', spot: s.flagStart } });
      else go(afPlay(s, 'home', { play: 'kickoff', newSpot: 25, p1: { id: id('home') }, ret: rnd(30) }));
      for (let i = 0; i < 90 && !s.ended; i++) {
        if (s.pendingTry) { go({ type: 'TRY', side: s.pendingTry, payload: { kind: flag ? 'one' : 'kick', good: rnd(2) === 1 } }); continue; }
        if (!s.drive) {
          const rec: Side = s.kickBy ? other(s.kickBy) : 'home';
          if (flag) go({ type: 'SET_DRIVE', payload: { off: rec, spot: s.flagStart } });
          else {
            const k = rnd(6);
            const inp: PlayInput = k === 0 ? { play: 'kickoff', onside: true, kept: rnd(2) === 1, newSpot: 45 + rnd(10) }
              : { play: 'kickoff', newSpot: 15 + rnd(30), ...(k > 2 ? { p1: { id: id(rec) }, ret: rnd(40) } : {}) };
            if (inp.onside) onside++;
            go(afPlay(s, rec, inp));
          }
          continue;
        }
        const off = s.drive.off;
        const def = other(off);
        const r = rnd(14);
        let inp: PlayInput;
        if (r <= 3) inp = { play: 'run', yards: rnd(15) - 3, p1: { id: id(off) } };
        else if (r <= 5) inp = { play: 'pass', yards: rnd(25) - 2, p1: { id: `${off[0]}1` }, p2: { id: id(off) } };
        else if (r === 6) inp = { play: 'inc', p1: { id: `${off[0]}1` } };
        else if (r === 7) inp = { play: 'int', p1: { id: `${off[0]}1` }, p2: { id: id(def) }, newSpot: 10 + rnd(60), ...(rnd(2) ? { ret: rnd(40) } : {}) };
        else if (r === 8) { inp = { play: 'fumble', kept: rnd(2) === 1, yards: rnd(8) - 2, p1: { id: id(off) }, p2: { id: id(rnd(2) ? off : def) }, newSpot: 10 + rnd(60) }; if (inp.kept) kept++; }
        else if (r === 9 && !flag) { inp = { play: 'punt', yards: 30 + rnd(25), p1: { id: id(off) }, ...(rnd(3) === 0 ? { blocked: true, p2: { id: id(def) } } : { p2: { id: id(def) }, ret: rnd(20) }) }; if (inp.blocked) blocks++; }
        else if (r === 10) inp = { play: 'sack', yards: -(1 + rnd(8)), p1: { id: `${off[0]}1` }, p2: { id: id(def) } };
        else {
          const f = foulsFor(s)[rnd(foulsFor(s).length)];
          const pen = rnd(6) === 0 ? ({ enf: 'zap', on: 'nobody', yards: 'x' } as never) : { foul: f.label, on: f.on === 'off' ? off : def, yards: f.yards, enf: ENF[rnd(4)], ...(rnd(2) ? { by: id(f.on === 'off' ? off : def) } : {}), ...(f.autoFirst ? { autoFirst: true as const } : {}) };
          inp = { play: (['run', 'pass', 'inc', 'sack'] as const)[rnd(4)], yards: rnd(20) - 4, p1: { id: id(off) }, p2: { id: id(off) }, pen };
        }
        if (!flag && rnd(12) === 0 && s.drive) {
          // a field goal try (sometimes blocked)
          const blocked = rnd(3) === 0;
          const good = !blocked && rnd(2) === 1;
          const kicker = id(off);
          const blocker = id(def);
          go({ type: 'FG', side: off, payload: { good, ...(blocked ? { blocked: true } : {}), yards: 30 + rnd(20) },
            attribution: { playerId: kicker, stat: 'fgAtt', by: 1, ...(good ? { extra: { points: 3, fgMade: 1 } } : {}) },
            ...(blocked ? { attribution2: { playerId: blocker, stat: 'kicksBlocked', by: 1, side: def } } : {}) });
          if (blocked) blocks++;
          continue;
        }
        if (inp.play === 'int' || inp.play === 'punt' || inp.play === 'kickoff') if (inp.ret != null) rets++;
        go(afPlay(s, off, inp));
        if (rnd(8) === 0 && s.events.at(-1)?.play === 'fumble') go({ type: 'FORCED_FUMBLE', side: def, attribution: { playerId: id(def), stat: 'forcedFum', by: 1 } });
      }
      // invariants
      const t = afTotals(s);
      for (const [pid, l] of Object.entries(live)) for (const [k, v] of Object.entries(l)) assert.equal(t[pid]?.stats[k] ?? 0, v, `g${g} ${pid} ${k}`);
      for (const e of s.events) {
        if (e.nul) { nul++; assert.deepEqual(afCredits(e), {}, `g${g} nul credits nobody`); assert.equal(e.playerId, undefined); }
        if (e.pen) assert.ok(['prev', 'end', 'dec', 'off'].includes(e.pen.enf) && (e.pen.on === 'home' || e.pen.on === 'away'), `g${g} pen sane`);
        if (e.kept) assert.ok(e.play === 'fumble' || (e.play === 'kickoff' && e.onside), `g${g} kept only on a fumble / onside`);
        if (e.blocked) assert.ok(e.play === 'punt' || (e.type === 'fg' && !e.good), `g${g} blocked only on a punt / missed FG`);
      }
      if (s.drive) assert.ok(s.drive.spot >= 1 && s.drive.spot <= s.field - 1, `g${g} ball on the field`);
      for (const side of ['home', 'away'] as const) {
        const f = teamFigures(s, side);
        const pens = s.events.filter((e) => e.type === 'play' && ((e.play === 'penalty' && e.on === side) || (e.pen && e.pen.on === side && (e.pen.enf === 'prev' || e.pen.enf === 'end')))).length;
        assert.equal(f.penalties, pens, `g${g} penalties`);
        const tos = s.events.filter((e) => e.type === 'play' && e.side === side && !e.nul && (e.play === 'int' || (e.play === 'fumble' && !e.kept))).length;
        assert.equal(f.turnovers, tos, `g${g} turnovers`);
      }
      afCommentary(s, { home: 'H', away: 'A' });
      afSheet(s);
    }
    assert.ok(nul > 200 && rets > 500 && blocks > 100 && onside > 100 && kept > 100, `coverage ${nul} ${rets} ${blocks} ${onside} ${kept}`);
  });
  test('every flag preset reads Standard; tackle presets too', () => {
    for (const k of Object.keys(AF_PRESETS)) {
      const st = afInit({ preset: k, mode: AF_PRESETS[k].set.mode });
      assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(st), st), 0, k);
    }
  });
});
