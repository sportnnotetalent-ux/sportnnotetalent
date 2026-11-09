import { fileURLToPath } from 'node:url';
/** Reference-video quick wins + silent launch animation
 *  (docs/security/breaks/quick-wins-reference.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { launchPlan, LAUNCH_FULL_MS } from '../src/core/launchPlan.ts';
import { teamSuggestions, teamDetail } from '../src/core/teamSuggestions.ts';
import { matchEnding } from '../src/core/matchEnding.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
});
const root = fileURLToPath(new URL('..', import.meta.url));

// ---------- B1: lime only when asked ----------
test('QW3: a Button with no variant is the outline style, not lime', () => {
  const ui = read('src/components/ui.tsx');
  assert.match(ui, /export function Button\([\s\S]{0,200}variant = 'ghost'/);
});

test('QW1: scoring pads keep their strong buttons (every Button in src/sports names its variant)', () => {
  const bad: string[] = [];
  for (const f of walk(join(root, 'src/sports'))) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/<Button\b/g)) {
      let i = m.index! + 7, depth = 0;
      for (; i < s.length; i++) { const c = s[i]; if (c === '{') depth++; else if (c === '}') depth--; else if (c === '>' && depth === 0) break; }
      if (!/variant=/.test(s.slice(m.index!, i))) bad.push(f.replace(root, ''));
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test('QW2/QW3: screens use lime sparingly — at most 3 lime buttons written in any screen file', () => {
  // Files whose lime buttons are alternatives — only one is on screen at a time.
  const ONE_AT_A_TIME: Record<string, string> = {
    'src/screens/ScheduleMatchScreen.tsx': 'each results sport has its own "Set up the event" button; only the picked sport shows',
  };
  const over: string[] = [];
  for (const f of walk(join(root, 'src/screens'))) {
    if (ONE_AT_A_TIME[f.replace(root, '')]) continue;
    const n = (readFileSync(f, 'utf8').match(/<Button\b[^>]*?variant="primary"/gs) ?? []).length;
    if (n > 3) over.push(`${f.replace(root, '')}: ${n}`);
  }
  assert.deepEqual(over, []);
});

test('QW2: the main actions keep lime (match setup, new tournament, quick tournament)', () => {
  assert.match(read('src/screens/ScheduleMatchScreen.tsx'), /variant="primary"[^>]*label=\{[^}]*Start now|label=[^>]*Start now[^>]*variant="primary"/s);
  assert.match(read('src/screens/CreateTournamentScreen.tsx'), /<Button[^>]*Create tournament[^>]*variant="primary"|<Button[^>]*variant="primary"[^>]*Create tournament/s);
});

// ---------- B2: one title per screen ----------
test('QW4/QW5: the big title hides only under a visible header, and the subtitle stays', () => {
  const ui = read('src/components/ui.tsx');
  assert.match(ui, /HeaderShownContext/);
  const fn = ui.slice(ui.indexOf('export function ScreenTitle'), ui.indexOf('export function ScreenTitle') + 900);
  assert.match(fn, /useContext\(HeaderShownContext\)/);
  assert.match(fn, /subtitle \?/);
});

// ---------- B5: empty states with a next step ----------
test('QW6: EmptyState keeps its old props and gains optional actions', () => {
  const ui = read('src/components/ui.tsx');
  const sig = ui.slice(ui.indexOf('export function EmptyState'), ui.indexOf('export function EmptyState') + 700);
  for (const p of ['title', 'hint', 'icon', 'compact', 'action?', 'secondaryAction?']) assert.ok(sig.includes(p), p);
});

// ---------- C2: empty tabs say what to do ----------
test('QW7/QW14: the empty Matches and Teams tabs offer next steps, only to managers, only on Upcoming', () => {
  const s = read('src/screens/TournamentProfileScreen.tsx');
  assert.match(s, /matchTab === 'upcoming' && canManageHosts[\s\S]{0,300}GenerateFixtures/);
  assert.match(s, /canManageHosts[\s\S]{0,300}TournamentTeams/);
});

// ---------- C4: two clear endings ----------
test('QW12: "Start now" always starts now and opens scoring; "Save for later" never opens scoring', () => {
  const now = Date.parse('2026-11-06T10:00:00Z');
  const later = now + 3 * 3600_000;
  assert.deepEqual(matchEnding('now', later, now), { startsAt: now, openScoring: true });
  assert.deepEqual(matchEnding('now', now - 60_000, now), { startsAt: now, openScoring: true });
  assert.deepEqual(matchEnding('later', later, now), { startsAt: later, openScoring: false });
  assert.deepEqual(matchEnding('later', now, now), { startsAt: now, openScoring: false });
});

test('QW13: only friendlies get the two endings; a tournament match keeps "Schedule match"', () => {
  const s = read('src/screens/ScheduleMatchScreen.tsx');
  assert.match(s, /Save for later/);
  assert.match(s, /isFriendly \?/);
  assert.match(s, /'Schedule match'/);
});

// ---------- C1: your teams first ----------
const T = (id: string, roster: string[], sport = 'football') => ({ id, name: id.toUpperCase(), sport, roster });
const M = (home: string, away: string, at: string, extra: Record<string, unknown> = {}) =>
  ({ sport: 'football', startsAt: at, homeTeam: { id: home }, awayTeam: { id: away }, ...extra });

test('C1: "Your teams" are teams I am on; "Played before" are their opponents in my matches, newest first', () => {
  const teams = [T('mine', ['me', 'x']), T('opp1', ['a']), T('opp2', ['b']), T('stranger', ['z']), T('mine2', ['me'])];
  const matches = [
    M('mine', 'opp1', '2026-10-01T10:00:00Z'),
    M('mine', 'opp2', '2026-11-01T10:00:00Z'),
    M('stranger', 'opp1', '2026-11-02T10:00:00Z'),
  ];
  const s = teamSuggestions({ teams, matches, sport: 'football', me: 'me' });
  assert.deepEqual(s.yours.map((t) => t.id), ['mine', 'mine2']);
  assert.deepEqual(s.before.map((t) => t.id), ['opp2', 'opp1']);
});

test('QW8: teams I hosted or scored count as mine-played; strangers never appear', () => {
  const teams = [T('h1', ['p']), T('h2', ['q']), T('s1', ['r']), T('s2', ['t'])];
  const matches = [M('h1', 'h2', '2026-11-01T10:00:00Z', { hostIds: ['me'] }), M('s1', 's2', '2026-11-02T10:00:00Z')];
  const s = teamSuggestions({ teams, matches, sport: 'football', me: 'me' });
  assert.deepEqual(s.yours, []);
  assert.deepEqual(s.before.map((t) => t.id).sort(), ['h1', 'h2']);
});

test('QW9: other sports, the other side, and nobody signed in', () => {
  const teams = [T('mine', ['me']), T('opp', ['a']), T('cricketmine', ['me'], 'cricket')];
  const matches = [M('mine', 'opp', '2026-11-01T10:00:00Z')];
  assert.deepEqual(teamSuggestions({ teams, matches, sport: 'football', me: 'me' }).yours.map((t) => t.id), ['mine']);
  const ex = teamSuggestions({ teams, matches, sport: 'football', me: 'me', exclude: 'opp' });
  assert.deepEqual(ex.before, []);
  assert.deepEqual(teamSuggestions({ teams, matches, sport: 'football', me: null }), { yours: [], before: [] });
});

test('QW10: the detail line is a player count only — never a name', () => {
  assert.equal(teamDetail({ roster: ['a', 'b', 'c'] }), '3 players');
  assert.equal(teamDetail({ roster: ['a'] }), '1 player');
  assert.equal(teamDetail({}), '');
});

test('QW11: 20,000 matches resolve quickly and the lists are capped', () => {
  const teams = Array.from({ length: 2000 }, (_, i) => T(`t${i}`, i % 50 === 0 ? ['me'] : [`p${i}`]));
  const matches = Array.from({ length: 20000 }, (_, i) => M(`t${(i * 50) % 2000}`, `t${(i * 7 + 1) % 2000}`, new Date(1.7e12 + i * 6e4).toISOString()));
  const t0 = performance.now();
  const s = teamSuggestions({ teams, matches, sport: 'football', me: 'me' });
  assert.ok(performance.now() - t0 < 200, 'fast');
  assert.ok(s.yours.length <= 6 && s.before.length <= 6);
});

// ---------- A1: silent launch animation ----------
test('QW15 (founder 2026-11-07): the full animation plays on EVERY launch, about 2–2.5 s, then Home', () => {
  assert.ok(LAUNCH_FULL_MS >= 2000 && LAUNCH_FULL_MS <= 2500);
  for (const seen of [false, true, null]) {
    assert.deepEqual(launchPlan({ seen, reducedMotion: false, overlay: false }), { show: true, full: true, ms: LAUNCH_FULL_MS });
  }
});

test('QW17: reduced motion → a short plain fade, never the full animation', () => {
  const p = launchPlan({ seen: false, reducedMotion: true, overlay: false });
  assert.equal(p.full, false);
  assert.ok(p.ms <= 300);
});

test('QW18: never on the TV overlay', () => {
  assert.equal(launchPlan({ seen: false, reducedMotion: false, overlay: true }).show, false);
});

test('QW19: storage failing changes nothing — the full animation still plays and still ends', () => {
  assert.equal(launchPlan({ seen: null, reducedMotion: false, overlay: false }).full, true);
});

test('QW16: the overlay always ends — a hard stop timer, and it never blocks touches to the app', () => {
  const s = read('src/components/LaunchAnimation.tsx');
  assert.match(s, /setTimeout\(/);
  assert.match(s, /pointerEvents="none"/);
  const app = read('App.tsx');
  assert.match(app, /<LaunchAnimation/);
});

// ---------- B8: icons ----------
test('QW20: shared icon stroke is the thin standard', () => {
  assert.match(read('src/components/Icon.tsx'), /ICON_STROKE = 1\.75/);
});

test('QW15/QW16: the timeline ends on time, fully faded, with times always moving forward', async () => {
  const { launchTracks } = await import('../src/core/launchPlan.ts');
  for (const plan of [launchPlan({ seen: false, reducedMotion: false, overlay: false }), launchPlan({ seen: true, reducedMotion: false, overlay: false }), launchPlan({ seen: false, reducedMotion: true, overlay: false })]) {
    const tr = launchTracks(plan, 100);
    for (const [k, track] of Object.entries(tr)) {
      assert.equal(track.t.length, track.v.length, k);
      for (let i = 1; i < track.t.length; i++) assert.ok(track.t[i] >= track.t[i - 1], `${k} time order`);
      assert.ok(track.t[track.t.length - 1] <= plan.ms, `${k} ends by ${plan.ms}`);
    }
    assert.equal(tr.overlay.v[tr.overlay.v.length - 1], 0, 'ends invisible');
    assert.equal(tr.overlay.t[tr.overlay.t.length - 1], plan.ms, 'the fade ends exactly at the end');
  }
});

test('QW15: no JS-thread sequence — one native progress value on phones, CSS keyframes on the web', () => {
  const s = read('src/components/LaunchAnimation.tsx');
  assert.doesNotMatch(s, /Animated\.sequence/);
  assert.match(s, /useNativeDriver: true/);
  assert.match(s, /animationKeyframes/);
});

test('C1: a match carrying its own copy of a team (another id) still finds it by name in the sport', () => {
  const teams = [{ id: 'football-ENG', name: 'England', sport: 'football', roster: [] as string[] }, { id: 'football-CRO', name: 'Croatia', sport: 'football', roster: [] as string[] }];
  const matches = [{ sport: 'football', startsAt: '2026-07-01T10:00:00Z', homeTeam: { id: 'eng', name: 'England' }, awayTeam: { id: 'cro', name: 'Croatia' }, hostIds: ['me'] }];
  assert.deepEqual(teamSuggestions({ teams, matches, sport: 'football', me: 'me' }).before.map((t) => t.id), ['football-ENG', 'football-CRO']);
});
