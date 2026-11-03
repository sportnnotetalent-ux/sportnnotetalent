/**
 * Simulation (quality mandate step 6): 2,000 random entries — auto-named vs
 * custom × 1 / 2 / 3+ roster × renamed players × masked minors × team vs
 * individual sports × ad hoc or not. Invariants:
 *  - a custom-named team, a 'team'-sport team, a non-ad-hoc team and a 3+
 *    roster always keep their stored name;
 *  - an auto-named entry (its stored name = its players' names at the time,
 *    or the account-name variant "<first> Organizer") always shows its
 *    players' CURRENT names as this viewer sees them, in the stored order;
 *  - the rebuilt name never holds a child's full name for a viewer outside
 *    the child's circle, and never a blank / "undefined" part;
 *  - the "Me" name is the player's name whenever the player has one.
 * Break list: docs/security/breaks/entry-current-names.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoEntryIds, entryName, entryNameFromPlayers, meEntrantName } from '../src/data/participantEntry.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(xs: readonly T[]) => xs[rnd(xs.length)];

const FIRST = ['Hrudhay', 'Vivek', 'Ravi', 'Arjun', 'Meera', 'Asha', 'Ben', 'Zoya'];
const LAST = ['Chandra', 'Kumar', 'Shah', 'Rao', 'Lee', 'Singh', 'P V', 'Reddy'];
const CUSTOM = ["Hrudhay's 5s", 'Smash Bros', 'Cue Kings', 'Net Ninjas', 'Team Thunder', 'The Aces / Co', 'Rally Rebels'];
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');
const initials = (n: string) => tidy(n).split(' ').filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');

interface P { id: string; old: string; now: string; minor: boolean }
let n = 0;
const person = (): P => {
  const first = pick(FIRST);
  const old = rnd(3) === 0 ? first : `${first} ${pick(LAST)}`;
  // renamed half the time — keeping the first name (a fuller / shorter form)
  const now = rnd(2) ? old : (rnd(2) ? first : `${first} ${pick(LAST)}`);
  return { id: `p${++n}`, old, now, minor: rnd(4) === 0 };
};

test('2,000 random entries keep the auto-named rule and masking', () => {
  const tally = { auto: 0, custom: 0, rebuilt: 0, kept: 0 };
  for (let i = 0; i < 2000; i++) {
    const size = pick([1, 1, 2, 2, 3]);
    const ps = Array.from({ length: size }, person);
    const kind = pick(['individual', 'both', 'team'] as const);
    const adhoc = rnd(5) !== 0;
    const isAuto = rnd(2) === 0;
    const reversed = size === 2 && rnd(2) === 0;
    const order = reversed ? [...ps].reverse() : ps;
    // auto-named: the people's names at the time (or the account-name variant)
    const name = isAuto
      ? entryName(order.map((p) => (rnd(4) === 0 ? `${p.old.split(' ')[0]} Organizer` : p.old)))
      : pick(CUSTOM);
    isAuto ? tally.auto++ : tally.custom++;
    const inCircle = rnd(2) === 0;
    const view = (p: P) => (p.minor && !inCircle ? initials(p.now) : p.now);
    const nameOf = (id: string) => { const p = ps.find((x) => x.id === id); return p ? view(p) : undefined; };

    const ids = autoEntryIds({ name, adhoc, roster: ps.map((p) => p.id), kind }, nameOf);
    const shown = ids ? entryNameFromPlayers(ids, nameOf)! : name;
    ids ? tally.rebuilt++ : tally.kept++;

    if (kind === 'team' || !adhoc || size > 2) assert.equal(ids, undefined, `kept: ${name}`);
    // a custom name stays — except (by design, EN-04) a stranger viewing a child
    // whose initial starts the name sees the child's initials instead
    const maskedHit = ps.some((p) => p.minor && !inCircle && name.toLowerCase().startsWith(p.now[0].toLowerCase()));
    if (!isAuto && !maskedHit) assert.equal(shown, name, `custom kept: ${name} (${ps.map((p) => p.now)})`);
    if (isAuto && kind !== 'team' && adhoc && size <= 2) {
      assert.ok(ids, `auto: ${name} → ${order.map(view)}`);
      // the two partners share a first word → either order is a fair reading
      const ambiguous = size === 2 && ps[0].now.split(' ')[0] === ps[1].now.split(' ')[0];
      if (ambiguous) assert.deepEqual([...ids!].sort(), order.map((p) => p.id).sort());
      else {
        assert.deepEqual(ids, order.map((p) => p.id), `auto order: ${name} → ${order.map(view)}`);
        assert.equal(shown, entryName(order.map(view)));
      }
    }
    if (ids) {
      assert.doesNotMatch(shown, /undefined|null|\/\s*$|^\s*\//);
      for (const p of ps) if (p.minor && !inCircle) assert.ok(!shown.toLowerCase().includes(tidy(p.now).toLowerCase()) || tidy(p.now) === initials(p.now), `child masked: ${shown}`);
    }
  }
  assert.ok(tally.auto > 500 && tally.custom > 500 && tally.rebuilt > 300 && tally.kept > 500, JSON.stringify(tally));
});

test('600 "Me" names: the player name wins whenever it exists', () => {
  for (let i = 0; i < 600; i++) {
    const player = pick(['Hrudhay', 'Hrudhay P V', '  ', '', null, undefined, 'Asha  Rao']);
    const account = pick(['Hrudhay Organizer', '', null, 'Asha Rao']);
    const got = meEntrantName(player, account);
    if (player && player.trim()) assert.equal(got, tidy(player));
    else assert.equal(got, account && account.trim() ? tidy(account) : undefined);
  }
});
