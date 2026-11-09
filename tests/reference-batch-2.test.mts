import { fileURLToPath } from 'node:url';
/** Reference-video batch 2 (docs/security/breaks/reference-batch-2.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { initialsOf } from '../src/core/initials.ts';
import { togglePick, copyLast } from '../src/core/whoPlays.ts';
import { shortCodeFrom, shortCodeToSave } from '../src/core/shortCode.ts';
import { skeletonVisible, SKELETON_DELAY_MS } from '../src/core/skeleton.ts';
import { prefillCity } from '../src/core/prefill.ts';
import { withOfficial } from '../src/data/matchOfficials.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
});

// ---------- B4: one list row ----------
test('R7/R8: initials from the shown name; symbols, emoji and blanks never crash', () => {
  assert.equal(initialsOf('Aarav Mehta'), 'AM');
  assert.equal(initialsOf('M. R.'), 'MR', 'a masked child name stays masked');
  assert.equal(initialsOf('Sana'), 'S');
  assert.equal(initialsOf('  rohan  nair  '), 'RN');
  assert.equal(initialsOf('⚽ FC Rovers'), 'FR');
  assert.equal(initialsOf(''), '?');
  assert.equal(initialsOf(undefined), '?');
  assert.equal(initialsOf('!!!'), '?');
});

test('B4: ListRow exists in the shared UI with a selected state and an initials avatar', () => {
  const ui = read('src/components/ui.tsx');
  assert.match(ui, /export function ListRow\(/);
  assert.match(ui, /initialsOf\(/);
  assert.match(ui, /accessibilityState=\{\{ selected/);
});

// ---------- C3: who's playing ----------
test('R1/R3: picking respects the cap and who may play; unpicking always works', () => {
  const ok = (id: string) => id !== 'banned';
  assert.deepEqual(togglePick([], 'a', 2, ok), ['a']);
  assert.deepEqual(togglePick(['a', 'b'], 'c', 2, ok), ['a', 'b'], 'full');
  assert.deepEqual(togglePick(['a'], 'banned', 2, ok), ['a'], 'not allowed');
  assert.deepEqual(togglePick(['a', 'b'], 'a', 2, ok), ['b'], 'unpick');
});

test('R3: copy last match keeps only players still in the team, allowed, up to the cap', () => {
  const ok = (id: string) => id !== 'other-side';
  assert.deepEqual(copyLast(['a', 'gone', 'b', 'other-side', 'c', 'd'], ['a', 'b', 'c', 'd', 'other-side'], 3, ok), ['a', 'b', 'c']);
  assert.deepEqual(copyLast([], ['a'], 3, ok), []);
});

test('R2/R6: "Who\'s playing" is offered for friendlies with team sides only', () => {
  const s = read('src/screens/ScheduleMatchScreen.tsx');
  assert.match(s, /<WhoPlaysSheet/);
  assert.match(s, /twoEndings && mode === 'team'/);
});

test('R4/R5: the draft squad saves after the match is created, best effort, with the pitch lineup', () => {
  const s = read('src/screens/ScheduleMatchScreen.tsx');
  const i = s.indexOf('const created = await createMatch(');
  assert.ok(i > 0);
  const after = s.slice(i, i + 4000);
  assert.match(after, /saveDraftSquads\(/);
  const helper = read('src/data/draftSquad.ts');
  assert.match(helper, /setMatchSquad\(/);
  assert.match(helper, /reconcilePositions\(/);
  assert.match(helper, /catch/);
});

// ---------- C5: lighter team creation ----------
test('R9: short codes from names are 2–4 capitals; a typed code wins', () => {
  assert.equal(shortCodeFrom('Red House'), 'RH');
  assert.equal(shortCodeFrom('Sunday Football Club'), 'SFC');
  assert.equal(shortCodeFrom('Strikers'), 'STR');
  assert.equal(shortCodeFrom('A'), 'AX');
  assert.equal(shortCodeFrom('!!!'), 'TM');
  assert.equal(shortCodeFrom('one two three four five'), 'OTTF');
  assert.equal(shortCodeToSave('rov', 'Rovers United'), 'ROV');
  assert.equal(shortCodeToSave('', 'Rovers United'), 'RU');
  assert.equal(shortCodeToSave('r', 'Rovers United'), 'RU', 'one letter is not a code');
  assert.equal(shortCodeToSave('abcdef', 'x'), 'ABCD');
});

test('R10: team creation uses the shared sport picker and your sport, and the code is optional', () => {
  const s = read('src/screens/TeamsScreen.tsx');
  assert.match(s, /<SportPicker/);
  assert.match(s, /shortCodeToSave\(/);
  assert.doesNotMatch(s, /Name and short code are required/);
  assert.doesNotMatch(s, /useState<SportId>\('football'\)/);
});

// ---------- C7: officials at setup ----------
test('R12: officials draft drops blanks and never puts one person in two slots', () => {
  let l = withOfficial([], 'referee', { name: '  ' });
  assert.deepEqual(l, []);
  l = withOfficial(l, 'referee', { playerId: 'p1', name: 'Rao' });
  l = withOfficial(l, 'ar1', { playerId: 'p1', name: 'Rao' });
  assert.deepEqual(l, [{ slot: 'ar1', playerId: 'p1', name: 'Rao' }]);
  l = withOfficial(l, 'referee', { name: 'Mr Khan' });
  assert.equal(l.length, 2);
});

test('R11: officials are saved only after the match exists, and never block it', () => {
  const s = read('src/screens/ScheduleMatchScreen.tsx');
  const i = s.indexOf('const created = await createMatch(');
  const after = s.slice(i, i + 4000);
  assert.match(after, /setMatchOfficials\(created\.id/);
  assert.match(s, /<OfficialsDraft/);
});

// ---------- B7: one sheet ----------
test('R13: one Sheet shell — keyboard-safe, Android back closes it, a title for screen readers', () => {
  const s = read('src/components/Sheet.tsx');
  assert.match(s, /useKeyboardSheet\(/);
  assert.match(s, /onRequestClose=\{onClose\}/);
  assert.match(s, /accessibilityRole="header"/);
  assert.match(s, /accessibilityViewIsModal/);
  for (const f of ['src/components/QuickOptionsSheet.tsx', 'src/components/FollowAlertsSheet.tsx']) assert.match(read(f), /<Sheet\b/, f);
});

// ---------- B6: loading placeholders ----------
test('R14/R15: placeholders only while loading, and only after a short delay', () => {
  assert.equal(skeletonVisible({ loading: true, elapsedMs: 0 }), false, 'no flicker');
  assert.equal(skeletonVisible({ loading: true, elapsedMs: SKELETON_DELAY_MS }), true);
  assert.equal(skeletonVisible({ loading: false, elapsedMs: 10_000 }), false, 'never stays after loading ends');
});

test('B6: Home and the tournament page use the placeholders', () => {
  assert.match(read('src/components/Skeleton.tsx'), /export function SkeletonList/);
  assert.match(read('src/screens/HomeScreen.tsx'), /<SkeletonList/);
  assert.match(read('src/screens/TournamentProfileScreen.tsx'), /<SkeletonList/);
});

// ---------- B3: calmer type ----------
test('B3: the theme has a type ramp, and the shared text styles use it', () => {
  const t = read('src/core/theme.ts');
  for (const k of ['title:', 'body:', 'label:', 'meta:']) assert.ok(t.includes(k), k);
  assert.match(read('src/components/ui.tsx'), /theme\.type\./);
});

test('R17: hand-typed font sizes and 900 weights can only go down (ratchet)', () => {
  let sizes = 0, heavy = 0;
  for (const f of walk(join(root, 'src'))) {
    const s = readFileSync(f, 'utf8');
    sizes += (s.match(/fontSize: \d/g) ?? []).length;
    heavy += (s.match(/fontWeight: '900'/g) ?? []).length;
  }
  assert.ok(sizes <= 173, `literal font sizes: ${sizes} (lower the cap when you remove some)`);
  assert.ok(heavy <= 219, `900 weights: ${heavy} (scores and numbers only; lower the cap as screens move to theme.type)`);
});

// ---------- B9: smarter forms ----------
test('R18: the typed city wins, then the host community, then my own home city', () => {
  assert.equal(prefillCity({ typed: 'Pune', touched: true, hostOrgCity: 'Delhi', myCity: 'Hyderabad' }), 'Pune');
  assert.equal(prefillCity({ typed: '', touched: false, hostOrgCity: 'Delhi', myCity: 'Hyderabad' }), 'Delhi');
  assert.equal(prefillCity({ typed: '', touched: false, hostOrgCity: null, myCity: 'Hyderabad' }), 'Hyderabad');
  assert.equal(prefillCity({ typed: '', touched: false }), '');
});

test('R19: the tournament form prefills from my own personalisation only', () => {
  const s = read('src/screens/CreateTournamentScreen.tsx');
  assert.match(s, /prefillCity\(/);
  assert.match(s, /getMyPersonalisation\(/);
});

test('R12: typing keeps spaces; the saved draft is trimmed and blanks are dropped', async () => {
  const { cleanOfficials } = await import('../src/data/matchOfficials.ts');
  assert.deepEqual(cleanOfficials([{ slot: 'referee', name: 'Mr Rao ' }, { slot: 'ar1', name: '   ' }]), [{ slot: 'referee', name: 'Mr Rao' }]);
  const draft = read('src/components/OfficialsDraft.tsx');
  assert.doesNotMatch(draft, /onChange=\{\(name\) => onChange\(name\.trim\(\)/, 'no trimming while typing');
});

test('R18: switching the host back to yourself drops the old community city', () => {
  assert.equal(prefillCity({ typed: 'Delhi', touched: false, hostOrgCity: null, myCity: null }), '');
  assert.equal(prefillCity({ typed: 'Delhi', touched: false, hostOrgCity: undefined, myCity: 'Hyderabad' }), 'Hyderabad');
});
