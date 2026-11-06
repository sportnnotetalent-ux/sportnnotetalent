/** 600 organisers set up friendlies with "Who's playing" and officials, and make
 *  teams with or without a short code (docs/security/breaks/reference-batch-2.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { togglePick, copyLast } from '../src/core/whoPlays.ts';
import { shortCodeToSave } from '../src/core/shortCode.ts';
import { cleanOfficials } from '../src/data/matchOfficials.ts';
import { initialsOf } from '../src/core/initials.ts';
import { prefillCity } from '../src/core/prefill.ts';

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const NAMES = ['Red House', 'Sunday FC', 'Strikers', 'Kondapur Kestrels FC', '⚽ Rovers', 'A', '!!!', 'Gachibowli Smashers Club', 'tigers'];
const SLOTS = ['referee', 'ar1', 'ar2', 'fourth_official', 'commentator'];

test('600 organisers: squads never break the cap, the other side or eligibility', () => {
  for (let u = 0; u < 600; u++) {
    const cap = 1 + Math.floor(rnd() * 11);
    const roster = Array.from({ length: Math.floor(rnd() * 20) }, (_, i) => `p${u}-${i}`);
    const banned = new Set(roster.filter(() => rnd() < 0.15));
    const otherSide = new Set(roster.filter((id) => !banned.has(id) && rnd() < 0.1));
    const ok = (id: string) => !banned.has(id) && !otherSide.has(id);
    let picked = rnd() < 0.5 ? copyLast([...roster].sort(() => rnd() - 0.5).concat(['gone-1', 'gone-2']), roster, cap, ok) : [];
    for (let k = 0; k < 40; k++) picked = togglePick(picked, pick(roster.length ? roster : ['x']), cap, ok);
    assert.ok(picked.length <= cap, 'cap');
    assert.equal(new Set(picked).size, picked.length, 'no duplicates');
    for (const id of picked) {
      assert.ok(roster.includes(id), 'only this team');
      assert.ok(ok(id), 'only allowed players');
    }
  }
});

test('600 teams and officials drafts: codes are 2–4 capitals, officials clean and unique', () => {
  for (let u = 0; u < 600; u++) {
    const name = pick(NAMES);
    const typed = rnd() < 0.5 ? '' : pick(['rov', 'x', 'abcdef', 'R-H', '']);
    const code = shortCodeToSave(typed, name);
    assert.match(code, /^[A-Z0-9]{2,4}$/, `${typed}/${name} → ${code}`);
    assert.notEqual(initialsOf(name), '');
    const draft = Array.from({ length: Math.floor(rnd() * 8) }, () => ({ slot: pick(SLOTS), name: pick(['Mr Rao ', '  ', 'Ms Khan', '', 'Coach Dev']) }));
    const out = cleanOfficials(draft);
    assert.equal(new Set(out.map((o) => o.slot)).size, out.length, 'one per slot');
    for (const o of out) assert.ok(o.name.length > 0 && o.name === o.name.trim(), 'trimmed, no blanks');
    const touched = rnd() < 0.3;
    const city = prefillCity({ typed: touched ? 'Pune' : 'Old', touched, hostOrgCity: rnd() < 0.3 ? 'Delhi' : null, myCity: rnd() < 0.5 ? 'Hyderabad' : null });
    if (touched) assert.equal(city, 'Pune');
    else assert.notEqual(city, 'Old', 'an old prefill never sticks');
  }
});
