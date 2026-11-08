/** Sport row wraps; picked contact reads its number (docs/security/breaks/sport-row-contacts.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPicked } from '../src/core/pickedContact.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const contact = (name: string, phones: string[], failUntilAllowed: { allowed: boolean }) => ({
  getFullName: async () => { if (!failUntilAllowed.allowed) throw new Error('SecurityException'); return name; },
  getPhones: async () => { if (!failUntilAllowed.allowed) throw new Error('SecurityException'); return phones.map((number) => ({ number })); },
});

test('SR1/SR2: the sport picker always wraps at full width; no extra row wrappers', () => {
  assert.match(read('src/components/SportPicker.tsx'), /chips: \{[^}]*width: '100%'[^}]*flexWrap: 'wrap'|chips: \{[^}]*flexWrap: 'wrap'[^}]*width: '100%'/);
  for (const f of ['src/screens/SquadSessionScreen.tsx', 'src/screens/CreateTournamentScreen.tsx']) {
    assert.doesNotMatch(read(f), /<View style=\{st\.chips\}>\s*<SportPicker/, f);
  }
});

test('PC1: a failed read asks for the permission once, then reads the number', async () => {
  const perm = { allowed: false };
  let asked = 0;
  const r = await readPicked(contact('Ravi K', ['+91 98450 12345'], perm), async () => { asked++; perm.allowed = true; return true; });
  assert.deepEqual(r, { kind: 'ok', contact: { name: 'Ravi K', phones: ['+91 98450 12345'] } });
  assert.equal(asked, 1);
});

test('PC2: permission refused → a clear "allow access" outcome', async () => {
  const r = await readPicked(contact('Ravi K', ['1'], { allowed: false }), async () => false);
  assert.deepEqual(r, { kind: 'denied' });
});

test('PC3/PC4: a readable contact never asks; a truly empty one says no number', async () => {
  let asked = 0;
  const ok = await readPicked(contact('Asha', ['+44 7700 900123'], { allowed: true }), async () => { asked++; return true; });
  assert.equal(ok.kind, 'ok'); assert.equal(asked, 0);
  const none = await readPicked(contact('Asha', [], { allowed: true }), async () => { asked++; return true; });
  assert.deepEqual(none, { kind: 'ok', contact: { name: 'Asha', phones: [] } });
  assert.equal(asked, 0, 'a name came back, so the read worked: no permission prompt');
});

test('PC2/PC3: the invite screen words each case honestly', () => {
  const s = read('src/screens/InviteFriendScreen.tsx');
  assert.match(s, /Allow contacts access to pick a friend, or type their number below\./);
  assert.match(s, /has no number saved — type it below/);
});

test('600 pickers: never a silent empty contact', async () => {
  let seed = 4;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let u = 0; u < 600; u++) {
    const perm = { allowed: rnd() < 0.5 };
    const grants = rnd() < 0.7;
    const phones = rnd() < 0.9 ? ['+91 90000 0000' + (u % 10)] : [];
    const r = await readPicked(contact(`P${u}`, phones, perm), async () => { if (grants) perm.allowed = true; return grants; });
    if (r.kind === 'ok') assert.equal(r.contact.name, `P${u}`, `${u}: a read contact always has its name`);
    else assert.equal(r.kind, 'denied');
  }
});
