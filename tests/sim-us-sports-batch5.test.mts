/**
 * US sports batch 5 — simulation (quality mandate step 6), seeded:
 *  - 600 basketball games with team rebounds / team turnovers (typed), paired
 *    steals and blocks (the ball-handler / shooter named or not), hostile
 *    links and random Removes: live credits = statTotals; each side's team
 *    TO / FGA = its plays + the other side's unlinked paired steals / blocks;
 *    a link never doubles; the same game as an older build logged it (no
 *    pair / team / type / ref) keeps the old figures and gains none of the keys;
 *  - 600 baseball games with runner plays, intentional walks, fielders noted
 *    after the play (valid and hostile) and random Removes: WP / BK / PO /
 *    IBB / PB on the right lines, fielders never move the game, the log
 *    without the notes derives the same game;
 *  - 600 American football formats (preset × mode stored or not): the mode
 *    is the stored one only, "Standard" matches the preset, the stats
 *    toggles hide exactly in Scores only; 600 play-by-play games with kneels.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { init as bbInit, reducer as bbReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import {
  blockAction, foulAction, lineupAction, missAction, removeAction, scoreAction, statAction, stealAction, teamReboundAction, turnoverAction, reboundAction,
} from '../src/sports/basketball/actions.ts';
import { basketballStatTotals, shotsTracked } from '../src/sports/basketball/totals.ts';
import { bbTeamFigures, pairedPlays } from '../src/sports/basketball/deep.ts';
import { basketballFeed } from '../src/sports/basketball/commentary.ts';
import { TO_TYPES } from '../src/sports/basketball/events.ts';
import {
  init as bsInit, reducer as bsReducer, buildPlay as bsPlay, buildRunner, eventCredits as bsCredits, creditAttribution, fieldersAction, FIELDED_OUTCOMES,
  type BaseballState, type Outcome, type RunnerKind,
} from '../src/sports/baseball/engine.ts';
import { baseballTotals } from '../src/sports/baseball/totals.ts';
import { init as afInit, reducer as afReducer, buildPlay as afPlay, AF_LIVE_SETTINGS, TRACK_FLAGS } from '../src/sports/american_football/engine.ts';
import { AF_PRESETS, AMERICAN_FOOTBALL_META } from '../src/sports/american_football/meta.ts';
import { customCount } from '../src/sports/liveSettings.ts';
import { isHidden } from '../src/sports/formatPick.ts';

let seed = 20261103;
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
const BB_NEW_KEYS = ['pair', 'team', 'toType', 'ref'] as const;

/** the same action as an older build sent it: no pair / team / type / ref */
function legacy(a: ScoreAction): ScoreAction {
  const p = { ...(a.payload ?? {}) };
  for (const k of BB_NEW_KEYS) delete p[k];
  return { ...a, payload: p };
}

describe('sim · basketball team plays and pairings', () => {
  test(`${N} random games: live = statTotals; team TO / FGA add up; links never double; old logs unchanged`, () => {
    let linked = 0, team = 0, removes = 0, hostile = 0;
    for (let g = 0; g < N; g++) {
      const start = [lineupAction('home', HOME), lineupAction('away', AWAY), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction];
      const cfg = { periodMinutes: 10, regPeriods: 4, foulsForBonus: 0, trackMisses: true };
      let s: BasketballState = start.reduce(bbReducer, bbInit(cfg));
      let old: BasketballState = start.reduce(bbReducer, bbInit(cfg));
      const live: Record<string, Record<string, number>> = {};
      const plays = 15 + rnd(40);
      for (let i = 0; i < plays; i++) {
        const side: Side = rnd(2) ? 'home' : 'away';
        const roster = side === 'home' ? HOME : AWAY;
        const p = roster[rnd(5)];
        const k = rnd(12);
        let a: ScoreAction;
        if (k === 0) a = scoreAction(side, 2 + rnd(2), p, { fga: true });
        else if (k === 1) a = missAction(side, 2 + rnd(2), rnd(3) ? p : undefined);
        else if (k === 2) a = teamReboundAction(side, rnd(2) ? 'off' : 'def');
        else if (k === 3) a = turnoverAction(side, rnd(2) ? p : null, rnd(2) ? { toType: TO_TYPES[rnd(TO_TYPES.length)] } : {});
        else if (k === 4) a = stealAction(side, p);
        else if (k === 5) a = blockAction(side, p);
        else if (k === 6 || k === 7) {
          // name the ball-handler / shooter of a random steal / block (sometimes a bad link)
          const pool = s.events.filter((e) => e.type === (k === 6 ? 'steal' : 'block'));
          const target = pool.length ? pool[rnd(pool.length)] : undefined;
          const tSide: Side = target ? (rnd(5) ? other(target.side) : target.side) : side;
          const who = (tSide === 'home' ? HOME : AWAY)[rnd(5)];
          const ref = target ? target.id : 999;
          a = k === 6 ? turnoverAction(tSide, who, { ref }) : missAction(tSide, 2 + rnd(2), who, undefined, ref);
        } else if (k === 8) a = reboundAction(side, p, rnd(2) ? 'off' : 'def');
        else if (k === 9) a = foulAction(side, p, (['personal', 'offensive', 'shooting'] as const)[rnd(3)]);
        else if (k === 10) {
          // hostile payloads
          hostile++;
          // (each carries the credit its builder would — statTotals owns the line either way)
          const over = (x: ScoreAction, payload: Record<string, unknown>): ScoreAction => ({ ...x, payload: { ...x.payload, ...payload } });
          const bad = [
            over(reboundAction(side, p), { team: true }),
            { type: 'TURNOVER', side, payload: { toType: ['<x>', 7, 'TRAVEL', null][rnd(4)], team: 'yes' } } as ScoreAction,
            over(turnoverAction(side, p), { ref: ['1', 1.5, -1, 1e9][rnd(4)] }),
            over(missAction(side, 2, p), { ref: s.events[0]?.id ?? 1 }),
            over(statAction(side, 'STEAL', p), { pair: 'true' }),
          ][rnd(5)];
          a = bad;
        } else {
          // remove a random play (reversing its credits)
          if (!s.events.length) continue;
          const e = s.events[rnd(s.events.length)];
          a = removeAction(e, e.pid, { halfCourt: false, tracked: shotsTracked(s) });
          removes++;
        }
        a = { ...a, payload: { ...a.payload, quarter: 1 + Math.floor(i / 15), minute: 0, sec: i, v: 2 } };
        const before = s;
        s = bbReducer(s, a);
        if (s !== before) addLive(live, a);
        // the older build logs the same plays (only those this build kept, so the ids line up)
        if (s === before) continue;
        if (a.type !== 'REMOVE_EVENT') old = bbReducer(old, legacy(a));
        else {
          // the same Remove on the old log (ids line up only while both logs keep the same plays)
          const id = Number(a.payload?.id);
          const oe = old.events.find((e) => e.id === id);
          if (oe) old = bbReducer(old, removeAction(oe, oe.pid, { halfCourt: false, tracked: shotsTracked(old) }));
        }
      }
      // live credits = statTotals
      const totals = basketballStatTotals(s);
      for (const [id, l] of Object.entries(live)) for (const [k, v] of Object.entries(l)) {
        if (k === 'minutes' || k === 'plusMinus') continue;
        assert.equal(totals[id]?.stats[k] ?? 0, v, `g${g} ${id} ${k}`);
      }
      // each steal / block linked at most once; links point at the other side's paired play
      const refs = s.events.filter((e) => typeof e.ref === 'number').map((e) => e.ref!);
      assert.equal(new Set(refs).size, refs.length, `g${g} a link doubled`);
      for (const e of s.events) {
        if (typeof e.ref !== 'number') continue;
        linked++;
        const t = s.events.find((x) => x.id === e.ref);
        if (t) { assert.ok(t.pair && t.side !== e.side && (t.type === 'steal' ? e.type === 'turnover' : e.type === 'miss'), `g${g} link`); }
      }
      // team figures add up
      const paired = pairedPlays(s);
      for (const sd of ['home', 'away'] as const) {
        const f = bbTeamFigures(s, sd);
        const tov = s.events.filter((e) => e.side === sd && (e.type === 'turnover' || (e.type === 'foul' && e.tov))).length + paired.filter((x) => x.side === sd && x.kind === 'tov').length;
        assert.equal(f.tov, tov, `g${g} ${sd} TO`);
        const fga = s.events.filter((e) => e.side === sd && (e.type === 'miss' || e.type === 'score')).length + paired.filter((x) => x.side === sd && x.kind === 'miss').length;
        assert.equal(f.fga, fga, `g${g} ${sd} FGA`);
        assert.equal(f.teamReb, s.events.filter((e) => e.side === sd && e.type === 'rebound' && e.team).length);
        team += f.teamReb;
      }
      for (const e of s.events) if (e.team) assert.ok(!e.pid && !e.playerName, `g${g} team play with a player`);
      // the older build's log: none of the new keys, no pairing, the old figures
      assert.equal(old.home, s.home, `g${g} score`); assert.equal(old.away, s.away, `g${g} score`);
      for (const e of old.events) for (const k of BB_NEW_KEYS) assert.equal((e as unknown as Record<string, unknown>)[k], undefined, `g${g} old ${k}`);
      assert.equal(pairedPlays(old).length, 0);
      for (const sd of ['home', 'away'] as const) {
        const f = bbTeamFigures(old, sd);
        assert.equal(f.tov, old.events.filter((e) => e.side === sd && (e.type === 'turnover' || (e.type === 'foul' && e.tov))).length, `g${g} old TO`);
        assert.equal(f.teamReb, 0);
      }
      basketballFeed(s, { home: 'H', away: 'A' }); // never throws
    }
    assert.ok(linked > 200 && team > 200 && removes > 200 && hostile > 200, `coverage ${linked}/${team}/${removes}/${hostile}`);
  });
});

/* --------------------------------- baseball --------------------------------- */

const ORDER = (p: string) => Array.from({ length: 9 }, (_, i) => ({ id: `${p}${i + 1}`, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }));
const OUTCOMES: Outcome[] = ['1B', '2B', 'HR', 'BB', 'IBB', 'K', 'GO', 'FO', 'LO', 'SF', 'FC', 'DP'];
const RUNNER: RunnerKind[] = ['WP', 'PB', 'BK', 'PO', 'SB'];
const NOTES = ['6-3', '4-3', 'F8', '5', 'L6', '6-4-3', 'P4', '<b>', 'x'.repeat(30), '1-2-3-4-5-6-7', ''];

describe('sim · baseball runner credits and fielders after the play', () => {
  test(`${N} random games: WP / PB / BK / PO / IBB on the right lines; notes never move the game`, () => {
    let notes = 0, runnerPlays = 0;
    for (let g = 0; g < N; g++) {
      let s: BaseballState = bsInit({ askFielders: rnd(2) === 1 });
      s = bsReducer(s, { type: 'LINEUP', payload: { team: 'home', order: ORDER('h'), pitcher: { id: 'hp' } } });
      s = bsReducer(s, { type: 'LINEUP', payload: { team: 'away', order: ORDER('a'), pitcher: { id: 'ap' } } });
      let plain = s; // the same game with no fielders notes
      const live: Record<string, Record<string, number>> = {};
      for (let i = 0; i < 40 && !s.g.ended; i++) {
        const r = rnd(10);
        if (r < 6) {
          const a = bsPlay(s, OUTCOMES[rnd(OUTCOMES.length)]);
          s = bsReducer(s, a); plain = bsReducer(plain, a); addLive(live, a);
          if (rnd(2)) {
            const id = s.events.at(-1)!.id;
            const n = NOTES[rnd(NOTES.length)];
            const before = s.g;
            s = bsReducer(s, rnd(8) ? fieldersAction(id, n) : { type: 'FIELDERS', payload: { ref: rnd(2) ? 'nope' : id, fielders: [7, null, { x: 1 }][rnd(3)] } });
            notes++;
            assert.deepEqual(s.g.score, before.score); assert.equal(s.g.outs, before.outs); assert.equal(s.g.half, before.half);
          }
        } else if (r < 9) {
          const occupied = s.g.bases.some(Boolean);
          if (!occupied) continue;
          const a = buildRunner(s, RUNNER[rnd(RUNNER.length)]);
          s = bsReducer(s, a); plain = bsReducer(plain, a); addLive(live, a); runnerPlays++;
        } else if (s.events.length) {
          const e = s.events[rnd(s.events.length)];
          const c = bsCredits(e);
          const rm: ScoreAction = { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(c.first, -1), attribution2: creditAttribution(c.second, -1) };
          s = bsReducer(s, rm); plain = bsReducer(plain, rm); addLive(live, rm);
        }
      }
      // the notes never change the game
      assert.deepEqual(s.g.score, plain.g.score, `g${g}`); assert.deepEqual(s.g.line, plain.g.line, `g${g}`);
      for (const e of s.events) if (e.fielders !== undefined) {
        assert.ok(e.type === 'pa' && FIELDED_OUTCOMES.includes(e.outcome!), `g${g} a note on ${e.outcome}`);
        assert.match(e.fielders!, /^[A-Z]{0,2}\d/);
        assert.ok(e.fielders!.length <= 16);
      }
      // the new keys on the right lines
      const t = baseballTotals(s);
      const count = (pred: (e: (typeof s.events)[number]) => boolean) => s.events.filter(pred).length;
      const sum = (k: string) => Object.values(t).reduce((n, l) => n + (l.stats[k] ?? 0), 0);
      assert.equal(sum('wildPitches'), count((e) => e.type === 'runner' && e.kind === 'WP'), `g${g} WP`);
      assert.equal(sum('balks'), count((e) => e.type === 'runner' && e.kind === 'BK'), `g${g} BK`);
      assert.equal(sum('pickoffs'), count((e) => e.type === 'runner' && e.kind === 'PO'), `g${g} PO`);
      assert.equal(sum('passedBalls'), count((e) => e.type === 'runner' && e.kind === 'PB'), `g${g} PB`);
      assert.equal(sum('intentionalWalks'), count((e) => e.type === 'pa' && e.outcome === 'IBB'), `g${g} IBB`);
      assert.equal(sum('ibbAllowed'), sum('intentionalWalks'), `g${g} IBB allowed`);
      for (const l of Object.values(t)) assert.ok((l.stats.intentionalWalks ?? 0) <= (l.stats.baseOnBalls ?? 0), `g${g} IBB ≤ BB`);
      // live credits still = statTotals for the live keys
      for (const [id, l] of Object.entries(live)) for (const [k, v] of Object.entries(l)) assert.equal(t[id]?.stats[k] ?? 0, v, `g${g} ${id} ${k}`);
    }
    assert.ok(notes > 1000 && runnerPlays > 1000, `coverage ${notes}/${runnerPlays}`);
  });
  test(`${N} formats: askFielders is on only when stored true (old formats read off)`, () => {
    for (let m = 0; m < N; m++) {
      const r = rnd(3);
      const cfg: Record<string, unknown> = r === 0 ? { innings: 7 + rnd(3) } : r === 1 ? { askFielders: true } : { askFielders: false };
      assert.equal(bsInit(cfg).cfg.askFielders, cfg.askFielders === true, `m${m}`);
    }
  });
});

/* ------------------------------ American football ------------------------------ */

describe('sim · American football mode and Standard', () => {
  const presets = Object.keys(AF_PRESETS);
  test(`${N} formats: mode only from the stored format; Standard = the preset; toggles hide in Scores only`, () => {
    for (let m = 0; m < N; m++) {
      const pk = presets[rnd(presets.length)];
      const stored = rnd(3);
      const cfg: Record<string, unknown> = { preset: pk, ...(stored === 0 ? {} : { mode: stored === 1 ? 'pbp' : 'score' }) };
      const s = afInit(cfg);
      assert.equal(s.mode, cfg.mode === 'pbp' ? 'pbp' : 'score', `m${m} ${pk}`);
      // a new match made from the preset (its own mode) reads Standard
      const fresh = afInit({ ...AF_PRESETS[pk].set, preset: pk });
      if (pk !== 'flagSchool') assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(fresh), fresh), 0, `m${m} ${pk} Standard`);
      const vals = AF_LIVE_SETTINGS.read(s);
      for (const f of AF_LIVE_SETTINGS.fields) {
        if (f.key === 'trackTackles' || (TRACK_FLAGS as string[]).includes(f.key)) assert.equal(isHidden(f, vals), s.mode === 'score', `m${m} live ${f.key}`);
        else assert.equal(isHidden(f, vals), false);
      }
      for (const f of AMERICAN_FOOTBALL_META.formatFields!) {
        if (f.key === 'trackTackles' || (TRACK_FLAGS as string[]).includes(f.key)) assert.equal(isHidden(f, { mode: s.mode }), s.mode === 'score');
      }
    }
  });
  test(`${N} play-by-play games with kneels: rushing adds up, the ball moves back`, () => {
    for (let g = 0; g < N; g++) {
      let s = afInit({ preset: 'nfl', mode: 'pbp' });
      s = afReducer(s, { type: 'SET_DRIVE', payload: { off: 'home', spot: 30 + rnd(40), down: 1, toGo: 10 } });
      let rushes = 0;
      for (let i = 0; i < 8 && s.drive; i++) {
        const before = s.drive.spot;
        const off = s.drive.off;
        const kneel = rnd(2) === 1;
        const a = afPlay(s, s.drive.off, kneel ? { play: 'kneel', yards: -1, p1: { id: 'qb' } } : { play: 'run', yards: rnd(9) - 2, p1: { id: 'rb' } });
        s = afReducer(s, a);
        rushes++;
        if (kneel && s.drive && s.drive.off === off && s.events.at(-1)!.type === 'play') assert.ok(s.drive.spot <= before, `g${g} kneel moved forward`);
      }
      const att = s.events.filter((e) => e.type === 'play' && (e.play === 'run' || e.play === 'kneel')).length;
      assert.ok(att <= rushes);
    }
  });
});
