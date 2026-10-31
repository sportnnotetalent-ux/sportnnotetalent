/**
 * Quality mandate step 6 for MVP P2 batch 1 (docs/security/breaks/mvp-p2-batch1.md):
 *  - 1,000 random names × screen widths: the board shows the full name only
 *    when it fits, else the code, never an empty name;
 *  - 1,000 random "today" kick-offs: never in the past, 15–45 minutes ahead,
 *    on the hour or half hour;
 *  - 1,000 random live matches: hidden only after 12 idle hours;
 *  - 1,000 random team names: only untouched ad hoc placeholders are hidden.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardName } from '../src/core/teamShort.ts';
import { quickKickoff } from '../src/data/fixtureSchedule.ts';
import { isStaleLive } from '../src/core/staleLive.ts';
import { isQuickPlaceholder } from '../src/core/quickGame.ts';

let seed = 61;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const WORDS = ['Royal', 'Kondapur', 'FC', 'United', 'Panthers', 'Team', 'A', 'B', 'Player', 'Pair', 'Challengers', 'Bengaluru', 'Lions'];
const name = () => Array.from({ length: 1 + rnd(4) }, () => WORDS[rnd(WORDS.length)]).join(' ');

test('1,000 board names', () => {
  for (let i = 0; i < 1000; i++) {
    const full = rnd(10) ? name() : undefined;
    const code = 'ABC'.slice(0, 2 + rnd(2));
    const w = 280 + rnd(900);
    const out = boardName(full, code, w);
    assert.ok(out.length > 0);
    if (out !== code) assert.ok(full && out === full && full.length <= Math.floor(w / 22) && w >= 360);
  }
});

test('1,000 "today" kick-offs', () => {
  const half = 30 * 60 * 1000;
  for (let i = 0; i < 1000; i++) {
    const now = Date.parse('2026-01-01T00:00:00Z') + rnd(365 * 24 * 60) * 60_000 + rnd(60_000);
    const t = Date.parse(quickKickoff('today', now, 'Asia/Kolkata'));
    assert.ok(t - now >= 15 * 60_000 && t - now < 45 * 60_000, `${new Date(now).toISOString()} → ${new Date(t).toISOString()}`);
    assert.equal(t % half, 0);
  }
});

test('1,000 live matches', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  for (let i = 0; i < 1000; i++) {
    const idleMin = rnd(48 * 60);
    const status = ['live', 'scheduled', 'completed'][rnd(3)];
    const m = { status, ...(rnd(5) ? { updatedAt: new Date(now - idleMin * 60_000).toISOString() } : {}) };
    assert.equal(isStaleLive(m, now), status === 'live' && 'updatedAt' in m && idleMin > 12 * 60);
  }
});

test('1,000 team names', () => {
  for (let i = 0; i < 1000; i++) {
    const n = rnd(3) ? name() : `${['Team', 'Player', 'Pair'][rnd(3)]} ${'AB'[rnd(2)]}`;
    const adhoc = rnd(2) === 0;
    const hidden = isQuickPlaceholder({ name: n, adhoc });
    assert.equal(hidden, adhoc && /^(Team|Player|Pair) [AB]$/.test(n));
  }
});
