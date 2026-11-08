/** 600 users through the Stitch-picks helpers: pair names, the count strip,
 *  the standings card, the week line and progress — never wrong, never slow
 *  (pair-names.md, stitch-tournament-page.md, stitch-home.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sideLines, sideSpoken } from '../src/core/sideName.ts';
import { countStrip, miniStandings } from '../src/core/tournamentPage.ts';
import { weekLine, scheduleProgress, heroSportChips } from '../src/core/homeHero.ts';

let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const NAMES = ['Aanya Verma', 'Divya N.', 'Red House', 'Ravi K', 'Mumbai / Pune XI', 'Kabir', 'Zoë Ølsen'];

test('600 users: pair names, counts, tables, week lines', () => {
  const t0 = performance.now();
  const now = Date.parse('2026-11-08T06:00:00Z');
  for (let u = 0; u < 600; u++) {
    const a = NAMES[int(0, NAMES.length - 1)], b = NAMES[int(0, NAMES.length - 1)];
    const pair = rnd() < 0.5;
    const name = pair ? `${a} / ${b}` : a;
    const lines = sideLines(name);
    assert.ok(lines.length === 1 || lines.length === 2);
    assert.equal(lines.join(' ').replace(/\s+\/\s*/g, ' / ').replace(/\s+/g, ' ').trim().length > 0, true);
    for (const l of lines) for (const w of l.replace('/', '').split(/\s+/).filter(Boolean)) assert.ok(name.includes(w), `${u}: nothing invented`);
    assert.ok(!sideSpoken(name).includes('/') || (name.match(/\//g) ?? []).length > 1);

    const fixtures = int(0, 60), sports = int(1, 6), teams = int(0, 30);
    const strip = countStrip({ fixtures, sports, teams, fixturesWord: 'Fixtures' });
    assert.ok(strip.every((x) => !x.startsWith('0 ')));

    const rows = Array.from({ length: int(0, 10) }, (_, i) => {
      const played = int(0, 6), won = int(0, played), drawn = int(0, played - won);
      return { teamId: `t${i}`, name: `T${i}`, played, won, drawn, lost: played - won - drawn, points: won * 3 + drawn };
    });
    const marks = new Map(rows.filter(() => rnd() < 0.2).map((r) => [r.teamId, 'qualified']));
    const mini = miniStandings({ rows, marks });
    if (mini) {
      assert.ok(mini.rows.length <= 4);
      for (const r of mini.rows) assert.equal(r.q, marks.get(r.teamId) === 'qualified');
    } else assert.ok(rows.every((r) => r.played === 0));

    const feed = Array.from({ length: int(0, 20) }, (_, i) => ({ status: ['scheduled', 'live', 'completed', 'cancelled', 'postponed'][int(0, 4)], startsAt: new Date(now + int(-200, 300) * 3.6e6).toISOString(), ...(rnd() < 0.6 ? { tournamentId: `x${int(0, 4)}` } : {}) }));
    const line = weekLine(feed, now);
    if (line) assert.match(line, /^(\d+ match(es)? this week)?( · )?(\d+ active tournaments?)?$/);
    const pct = scheduleProgress(feed);
    if (pct !== null) assert.ok(pct >= 0 && pct <= 100);
    assert.ok(heroSportChips(['football', 'cricket', 'tennis', 'chess', 'badminton'].slice(0, int(0, 5)) as never).shown.length <= 3);
  }
  assert.ok(performance.now() - t0 < 5000);
});
