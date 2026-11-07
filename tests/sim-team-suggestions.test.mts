/** 600 users pick a team for a new match: each sees only teams from their own
 *  games, in the right sport, capped, never the other side's pick, quickly
 *  (docs/security/breaks/quick-wins-reference.md QW8–QW11). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamSuggestions, SUGGEST_MAX } from '../src/core/teamSuggestions.ts';
import { matchEnding } from '../src/core/matchEnding.ts';
import { launchPlan } from '../src/core/launchPlan.ts';

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const SPORTS = ['football', 'cricket', 'basketball', 'kabaddi', 'volleyball', 'hockey'];

test('600 users: suggestions come only from their own games and teams', () => {
  const users = Array.from({ length: 600 }, (_, i) => `u${i}`);
  const teams = Array.from({ length: 1500 }, (_, i) => {
    const sport = pick(SPORTS);
    const roster = Array.from({ length: 3 + Math.floor(rnd() * 8) }, () => pick(users));
    return { id: `t${i}`, name: `Team ${i}`, sport, roster };
  });
  const bySport = new Map<string, typeof teams>();
  for (const t of teams) bySport.set(t.sport, [...(bySport.get(t.sport) ?? []), t]);
  const matches = Array.from({ length: 12000 }, (_, i) => {
    const sport = pick(SPORTS);
    const pool = bySport.get(sport)!;
    return {
      sport, startsAt: new Date(1.75e12 + i * 3.6e5).toISOString(),
      homeTeam: { id: pick(pool).id }, awayTeam: { id: pick(pool).id },
      hostIds: [pick(users)], scorerIds: rnd() < 0.5 ? [pick(users)] : [],
    };
  });
  const teamById = new Map(teams.map((t) => [t.id, t] as const));
  const t0 = performance.now();
  let shown = 0;
  for (const me of users) {
    const sport = pick(SPORTS);
    const other = rnd() < 0.5 ? pick(bySport.get(sport)!).id : null;
    const s = teamSuggestions({ teams: bySport.get(sport)!, matches, sport, me, exclude: other });
    assert.ok(s.yours.length <= SUGGEST_MAX && s.before.length <= SUGGEST_MAX);
    const ids = [...s.yours, ...s.before].map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, 'no team twice');
    for (const t of s.yours) assert.ok(t.roster.includes(me), 'yours = I am on it');
    for (const t of [...s.yours, ...s.before]) {
      assert.equal(t.sport, sport, 'right sport');
      assert.notEqual(t.id, other, 'never the other side');
    }
    // every "played before" team comes from a match of mine in this sport
    for (const t of s.before) {
      const mine = matches.some((m) => m.sport === sport && (m.homeTeam.id === t.id || m.awayTeam.id === t.id) && (
        m.hostIds.includes(me) || m.scorerIds.includes(me) ||
        teamById.get(m.homeTeam.id)!.roster.includes(me) || teamById.get(m.awayTeam.id)!.roster.includes(me)));
      assert.ok(mine, `${t.id} came from ${me}'s own games`);
    }
    shown += ids.length;
  }
  assert.ok(shown > 600, 'most users get suggestions');
  assert.ok(performance.now() - t0 < 15000, 'fast for 600 users');
});

test('600 users: the two endings and the launch plan always do what they say', () => {
  const now = Date.parse('2026-11-06T10:00:00Z');
  for (let i = 0; i < 600; i++) {
    const when = now + Math.round((rnd() - 0.3) * 6 * 3600_000);
    const choice = rnd() < 0.5 ? 'now' as const : 'later' as const;
    const e = matchEnding(choice, when, now);
    if (choice === 'now') assert.deepEqual(e, { startsAt: now, openScoring: true });
    else assert.deepEqual(e, { startsAt: when, openScoring: false });
    const p = launchPlan({ seen: rnd() < 0.3 ? null : rnd() < 0.5, reducedMotion: rnd() < 0.1, overlay: rnd() < 0.05 });
    assert.ok(p.ms <= 2500);
    if (p.full) assert.equal(p.ms, 2400);
  }
});
