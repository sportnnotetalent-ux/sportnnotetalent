/**
 * Cue sports integration: whole matches scored the way the screen does it —
 * every tap taken from what the panel offers (snookerPanel / billiardsPanel),
 * the frame- and match-ending ones predicted by `endingOf` (the confirm
 * sheet) — then the log is stored as useLiveMatch stores it and replayed
 * through the engine into every projection the app reads: summary, result,
 * scoreLine, lineScore, standingsUnits, statTotals, matchRecords, undoLabel,
 * the commentary and the Stats tab. Plus source guards on the two plugins
 * (the shared screen loads index.tsx; node can't render it).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ScoreAction } from '../src/sports/types.ts';
import { replayLog } from '../src/sports/amend.ts';
import { toRecords } from './statTotalsHarness.mts';
import { SINGLES_CTX } from './cue-script.mts';
import * as S from '../src/sports/snooker/engine.ts';
import * as B from '../src/sports/billiards/engine.ts';
import { snookerPanel, foulAction } from '../src/sports/snooker/controls.ts';
import { billiardsPanel } from '../src/sports/billiards/controls.ts';
import { endingOf } from '../src/sports/cue/ending.ts';
import { snookerStatTotals } from '../src/sports/snooker/totals.ts';
import { billiardsStatTotals } from '../src/sports/billiards/totals.ts';
import { snookerMatchRecords } from '../src/sports/snooker/records.ts';
import { billiardsMatchRecords } from '../src/sports/billiards/records.ts';
import { snookerUndoLabel } from '../src/sports/snooker/undo.ts';
import { billiardsUndoLabel } from '../src/sports/billiards/undo.ts';
import { snookerFeed } from '../src/sports/snooker/feed.ts';
import { billiardsFeed } from '../src/sports/billiards/feed.ts';
import { snookerMatchStats } from '../src/sports/snooker/matchStats.ts';
import { billiardsMatchStats } from '../src/sports/billiards/matchStats.ts';

/** a tiny deterministic "scorer": n-th choice by a counter */
function counter(seed: number) {
  let x = seed;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

/** Play a snooker match to the end from the panel alone. */
function playSnooker(config: Record<string, unknown>, seed: number) {
  let s = S.createInitialState(config);
  const log: ScoreAction[] = [];
  const rnd = counter(seed);
  for (let i = 0; i < 4000 && !s.ended; i++) {
    const p = snookerPanel(s)!;
    assert.ok(p, 'a live match always has a panel');
    let a: ScoreAction | null;
    const lit = p.balls.filter((b) => b.action);
    const r = rnd();
    if (p.respotLots && r < 0.5) a = p.respotLots.home ?? p.respotLots.away;
    else if (p.afterFoul && r < 0.2) a = p.afterFoul.playAgain;
    else if (r < 0.62 && lit.length) a = lit[Math.floor(rnd() * lit.length)].action;
    else if (r < 0.8) a = p.miss;
    else if (r < 0.9) a = p.safety;
    else if (r < 0.97) a = foulAction(s, { value: p.foul.values[Math.floor(rnd() * p.foul.values.length)], miss: rnd() < 0.3 });
    else a = p.concede[rnd() < 0.5 ? 'home' : 'away'];
    if (!a) continue;
    const ends = endingOf(S.reducer, s, a);
    const next = S.reducer(s, a as never);
    assert.notEqual(next, s, `the panel offered a refused tap: ${JSON.stringify(a)}`);
    assert.equal(!!ends, next.frames.length > s.frames.length, 'the confirm sheet asks exactly when a frame ends');
    if (ends) assert.equal(ends.kind === 'match', next.ended);
    log.push(a);
    s = next;
  }
  return { s, log };
}

function playBilliards(config: Record<string, unknown>, seed: number) {
  let s = B.createInitialState(config);
  const log: ScoreAction[] = [];
  const rnd = counter(seed);
  for (let i = 0; i < 6000 && !s.ended; i++) {
    const p = billiardsPanel(s)!;
    const r = rnd();
    let a: ScoreAction | null;
    if (p.time && rnd() < 0.01) a = p.time;
    else if (r < 0.75) a = p.strokes[Math.floor(rnd() * 4)].action;
    else if (r < 0.88) a = p.miss;
    else if (r < 0.95) a = p.safety;
    else a = { type: 'FOUL', side: p.striker, payload: { frame: p.frame } };
    if (!a) continue;
    const ends = endingOf(B.reducer, s, a);
    const next = B.reducer(s, a as never);
    assert.notEqual(next, s);
    assert.equal(!!ends, next.frames.length > s.frames.length);
    log.push(a);
    s = next;
  }
  return { s, log };
}

describe('snooker: a match from the panel into every projection', () => {
  for (const [cfg, seed] of [[{ bestOf: 3 }, 7], [{ reds: 6, bestOf: 5 }, 11], [{ reds: 10, bestOf: 1 }, 23]] as const) {
    test(`${JSON.stringify(cfg)}`, () => {
      const { s, log } = playSnooker(cfg, seed);
      assert.equal(s.ended, true);
      // stored as useLiveMatch stores it, replayed as every device does
      const replayed = replayLog({ createInitialState: S.createInitialState, reducer: S.reducer as never }, cfg, toRecords(log)) as S.SnookerState;
      assert.deepEqual(replayed, s);
      const res = S.result(s)!;
      assert.equal(res.winner, s.winner);
      assert.equal(Math.max(res.home, res.away), s.framesToWin);
      const sum = S.summary(s);
      assert.equal(`${sum.homeScore}-${sum.awayScore}`, `${res.home}-${res.away}`);
      assert.equal(sum.statusLine, 'Match Over');
      const ls = S.lineScore(s)!;
      assert.deepEqual(ls.done.map((c) => [c.home, c.away]), s.frames.map((f) => f.score));
      assert.equal(S.scoreLine(s).split(', ').length, s.frames.length);
      const units = S.standingsUnits(s)!;
      assert.equal(units.points.home + units.points.away, s.frames.reduce((t, f) => t + f.score[0] + f.score[1], 0));
      const t = snookerStatTotals(s, SINGLES_CTX);
      assert.equal(t.h1.stats.framesWon, res.home);
      assert.equal(t.a1.stats.framesWon, res.away);
      assert.equal(t.h1.stats.framesLost, res.away);
      const rec = snookerMatchRecords(s);
      if (rec) for (const it of rec.items) assert.ok(Number.isFinite(it.value) && it.text.length > 0);
      // every step Undo can take back has a label
      let prev = S.createInitialState(cfg);
      for (const a of log) {
        const next = S.reducer(prev, a as never);
        assert.ok(snookerUndoLabel({ type: a.type, prev, next }), a.type);
        prev = next;
      }
      // the tabs render from it
      const feed = snookerFeed(s, { home: 'Asha', away: 'Ravi' });
      assert.equal(feed.length, s.frames.length);
      assert.ok(snookerMatchStats(s).length >= 1);
      // ids only: nothing in the log names anyone, and no attribution is sent
      assert.ok(log.every((a) => !('attribution' in a) && !('attribution2' in a)));
    });
  }
});

describe('billiards: a match from the panel into every projection', () => {
  for (const [cfg, seed] of [[{ target: 50, bestOf: 3 }, 5], [{ target: 100, bestOf: 1 }, 9], [{ format: 'timed' }, 13]] as const) {
    test(`${JSON.stringify(cfg)}`, () => {
      let { s, log } = playBilliards(cfg, seed);
      if (!s.ended) {
        // a timed game ends when time is called
        const p = billiardsPanel(s)!;
        log = [...log, p.time!];
        s = B.reducer(s, p.time as never);
        while (!s.ended) { const q = billiardsPanel(s)!; log.push(q.strokes[2].action!); s = B.reducer(s, q.strokes[2].action as never); }
      }
      const replayed = replayLog({ createInitialState: B.createInitialState, reducer: B.reducer as never }, cfg, toRecords(log)) as B.BilliardsState;
      assert.deepEqual(replayed, s);
      const res = B.result(s)!;
      assert.ok(res);
      const sum = B.summary(s);
      assert.equal(`${sum.homeScore}-${sum.awayScore}`, `${res.home}-${res.away}`);
      const t = billiardsStatTotals(s, SINGLES_CTX);
      assert.equal(t.h1.stats.framesWon, s.framesWon.home);
      const rec = billiardsMatchRecords(s);
      if (rec) for (const it of rec.items) assert.ok(Number.isFinite(it.value));
      let prev = B.createInitialState(cfg);
      for (const a of log) {
        const next = B.reducer(prev, a as never);
        assert.ok(billiardsUndoLabel({ type: a.type, prev, next }), a.type);
        prev = next;
      }
      assert.equal(billiardsFeed(s, { home: 'A', away: 'R' }, s.bestOf > 1 ? 'frame' : 'game').length, s.frames.length);
      assert.ok(billiardsMatchStats(s).length >= 1);
    });
  }
});

describe('the plugins (source guards)', () => {
  for (const sp of ['snooker', 'billiards'] as const) {
    test(`${sp}: wired to its pure modules; asks before ending; no live credits`, () => {
      const src = readFileSync(new URL(`../src/sports/${sp}/index.tsx`, import.meta.url), 'utf8');
      assert.match(src, /matchTabs: \{ Commentary: \w+, Stats: \w+ \}/);
      assert.match(src, /matchRecords: \w+MatchRecords,/);
      assert.match(src, /undoLabel: \(step\) => \w+UndoLabel\(step\)/);
      assert.match(src, /Scoreboard: \w+Scoreboard,/);
      assert.match(src, /statTotalsNeedsPlayers: true/);
      assert.match(src, /<SetLineBoard/);
      assert.match(src, /sendTap\(/);
      assert.doesNotMatch(src, /attribution/);
      // every dispatch of a tap goes through the confirm path, except the
      // taps that can't end a frame (re-rack and level TIME ask their own)
      const direct = [...src.matchAll(/dispatch\((p\.\w+)\)/g)].map((m) => m[1]);
      assert.ok(direct.every((x) => x === 'p.rerack' || x === 'p.time'), direct.join(','));
      // no he / she in the copy
      assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /\b(he|she|his|her)\b/i);
    });
  }
});
