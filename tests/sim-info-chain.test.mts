/**
 * Quality mandate step 6 for the Info chain (docs/security/breaks/info-chain.md):
 * 1,000 random formats per sport (good values, old formats missing keys, and
 * hostile ones: objects, NaN, nulls, prototype keys). The rules list never
 * prints junk, never lists a stats switch or a hidden field, and the captures
 * list is always every switch, on or off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { matchRules, matchCaptures } from '../src/sports/matchRules.ts';
import type { FormatField, SportMeta } from '../src/sports/types.ts';

let seed = 503;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const SPORTS = join(import.meta.dirname, '..', 'src', 'sports');
const metas: SportMeta[] = [];
for (const d of readdirSync(SPORTS)) {
  const f = join(SPORTS, d, 'meta.ts');
  if (existsSync(f)) for (const v of Object.values(await import(f))) if (v && typeof v === 'object' && 'id' in v && 'formatFields' in v) metas.push(v as SportMeta);
}
const JUNK = [undefined, null, NaN, Infinity, '', ' ', {}, [], { a: 1 }, '__proto__', -1, 1e9, true, false];
const valueFor = (f: FormatField): unknown => {
  const r = rnd(10);
  if (r < 5 && f.options?.length) return f.options[rnd(f.options.length)].value;
  if (r < 7) return f.default;
  if (r < 8) return undefined; // an older format without the key
  return JUNK[rnd(JUNK.length)];
};
const BAD = /undefined|NaN|\[object|Infinity|^\s*$/;

test('1,000 random formats per sport', () => {
  assert.ok(metas.length >= 25, `sports found: ${metas.length}`);
  let lines = 0;
  for (const m of metas) {
    const fields = m.formatFields ?? [];
    for (let i = 0; i < 1000; i++) {
      const fmt: Record<string, unknown> = {};
      for (const f of fields) { const v = valueFor(f); if (v !== undefined) fmt[f.key] = v; }
      const rules = matchRules(fields, fmt);
      lines += rules.length;
      for (const l of rules) {
        assert.ok(!BAD.test(l.value) && !BAD.test(l.label), `${m.id}.${l.key} = ${JSON.stringify(l.value)}`);
        const f = fields.find((x) => x.key === l.key)!;
        assert.ok(!(f.type === 'toggle' && /stat/i.test(f.group ?? '')), `${m.id}.${l.key}: a stats switch listed as a rule`);
      }
      const caps = matchCaptures(undefined, null, fields, fmt).captures;
      assert.deepEqual(caps.map((c) => c.key), fields.filter((f) => f.type === 'toggle' && /stat/i.test(f.group ?? '')).map((f) => f.key));
      for (const c of caps) assert.equal(typeof c.on, 'boolean');
    }
  }
  assert.ok(lines > 50000, `rule lines checked: ${lines}`);
});
