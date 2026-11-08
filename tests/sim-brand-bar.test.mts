/** 600 users moving around the app at every width: never two bars, never a bar
 *  on a phone's match or detail screen, always one on a tab screen
 *  (docs/security/breaks/brand-bar.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barPlacement, TAB_ROOTS, NO_BAR, isWideWeb } from '../src/core/brandBar.ts';

let seed = 23;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const STACK = ['Match', 'LiveScoring', 'TournamentProfile', 'TeamProfile', 'PlayerProfile', 'FixtureMap', 'Settings', 'Notifications', 'Calendar'];
const OS = ['ios', 'android', 'web'] as const;

test('600 users × 40 screens: exactly the right bars', () => {
  const t0 = performance.now();
  for (let u = 0; u < 600; u++) {
    const os = pick(OS), width = 300 + Math.floor(rnd() * 1700), authed = rnd() < 0.85;
    for (let s = 0; s < 40; s++) {
      const route = pick([...TAB_ROOTS, ...STACK, ...NO_BAR]);
      const p = barPlacement({ os, width, authed, route });
      const bars = (p.root ? 1 : 0) + (p.screen ? 1 : 0);
      assert.ok(bars <= 1, `${u}: two bars on ${route}`);
      if (!authed || NO_BAR.includes(route)) assert.equal(bars, 0, `${u}: ${route}`);
      else if (isWideWeb(os, width)) assert.ok(p.root && !p.screen, `${u}: wide ${route}`);
      else if (TAB_ROOTS.includes(route)) assert.ok(p.screen, `${u}: tab ${route}`);
      else assert.equal(bars, 0, `${u}: phone ${route}`);
    }
  }
  assert.ok(performance.now() - t0 < 1000);
});
