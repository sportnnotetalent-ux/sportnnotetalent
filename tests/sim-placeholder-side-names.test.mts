/**
 * Simulation (quality mandate step 6): 600 random sides — placeholder / real ×
 * empty / one / two players × masked / unmasked viewers. Invariants:
 *  - only a "Player X" (1) / "Pair X" (2) ad-hoc side with a complete roster
 *    is renamed or relabelled; real teams, renamed sides and "Team X" never;
 *  - a renamed side is no longer a placeholder;
 *  - the rename is always a name the server's teams_entry_names trigger
 *    recognises (so the stored copy masks a child) — never first names only;
 *  - what a viewer outside a child's circle sees never holds the child's full name.
 * Break list: docs/security/breaks/placeholder-side-names.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeholderRename, placeholderEntryIds, isQuickPlaceholder, looksQuickPlaceholder } from '../src/core/quickGame.ts';
import { entryNameFromPlayers } from '../src/data/participantEntry.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };

const FIRST = ['Vivek', 'Ravi', 'Arjun', 'Meera', 'Asha', 'Ben', 'Ravi', 'Zoya'];
const LAST = ['Chandra', 'Kumar', 'Shah', 'Rao', 'Lee', 'Singh'];
interface P { id: string; full: string; minor: boolean }
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');
// name_initials (SQL) → "M. R."
const initials = (n: string) => tidy(n).split(' ').filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ') || 'Player';
// mask_minor_names (SQL): each minor's full name → initials, case-insensitive
const maskMinors = (label: string, ps: P[]) => {
  let v = label;
  for (const p of [...ps].filter((x) => x.minor).sort((a, b) => b.full.length - a.full.length)) {
    const n = tidy(p.full);
    let i = 0;
    while ((i = v.toLowerCase().indexOf(n.toLowerCase(), i)) >= 0) { v = v.slice(0, i) + initials(n) + v.slice(i + n.length); i += initials(n).length; }
  }
  return v;
};
// teams_entry_names trigger: is this name the entry (either order, full or masked)?
const triggerRecognises = (name: string, ps: P[]) => {
  const fwd = ps.map((p) => tidy(p.full)).join(' / ');
  const rev = [...ps].reverse().map((p) => tidy(p.full)).join(' / ');
  const nm = tidy(name).toLowerCase();
  return [fwd, rev, maskMinors(fwd, ps), maskMinors(rev, ps)].map((x) => x.toLowerCase()).includes(nm);
};

test('600 random sides keep the naming + privacy invariants', () => {
  let renamed = 0, relabelled = 0, maskedSeen = 0;
  for (let i = 0; i < 600; i++) {
    const kind = rnd(5); // 0 Player, 1 Pair, 2 Team placeholder, 3 real team named like a placeholder, 4 real named side
    const letter = rnd(2) ? 'A' : 'B';
    const name = kind === 0 ? `Player ${letter}` : kind === 1 ? `Pair ${letter}` : kind === 2 ? `Team ${letter}` : kind === 3 ? `Player ${letter}` : 'Royal Smashers';
    const adhoc = kind !== 3 && (kind !== 4 || rnd(2) === 1);
    const n = rnd(3); // 0 / 1 / 2 players
    const ps: P[] = Array.from({ length: n }, (_, j) => ({ id: `p${i}-${j}`, full: `${FIRST[rnd(FIRST.length)]}${rnd(4) ? ' ' : '  '}${LAST[rnd(LAST.length)]}`, minor: rnd(2) === 1 }));
    const inCircle = rnd(2) === 1;
    const visible = (p: P) => (p.minor && !inCircle ? initials(p.full) : p.full); // players_view
    const team = { name, adhoc, roster: ps.map((p) => p.id) };
    const want = adhoc && ((kind === 0 && n === 1) || (kind === 1 && n === 2));

    // (1) the rename, from players_view names
    const r = placeholderRename(team, ps.map(visible));
    assert.equal(!!r, want, `rename ${name} adhoc=${adhoc} n=${n}`);
    if (r) {
      renamed++;
      assert.equal(isQuickPlaceholder({ name: r.name, adhoc: true }), false);
      assert.equal(looksQuickPlaceholder(r.name), false);
      assert.ok(triggerRecognises(r.name, ps), `trigger must recognise "${r.name}"`);
      assert.match(r.shortName, /^[A-Z0-9]{2,4}$/);
      // the stored copy (after the trigger) never holds a minor's full name
      const stored = maskMinors(r.name, ps);
      for (const p of ps) if (p.minor) assert.ok(!stored.toLowerCase().includes(tidy(p.full).toLowerCase()));
    }

    // (2) old matches: the display fallback
    const ids = placeholderEntryIds(team);
    assert.equal(!!ids, want);
    const shown = ids ? entryNameFromPlayers(ids, (id) => visible(ps.find((p) => p.id === id)!)) ?? name : name;
    if (ids) { relabelled++; assert.notEqual(shown, name); }
    else assert.equal(shown, name); // real / team / incomplete sides unchanged
    if (!inCircle) for (const p of ps) if (p.minor) { assert.ok(!shown.toLowerCase().includes(tidy(p.full).toLowerCase())); maskedSeen++; }
  }
  assert.ok(renamed > 30 && relabelled > 30 && maskedSeen > 30, `coverage ${renamed}/${relabelled}/${maskedSeen}`);
});
