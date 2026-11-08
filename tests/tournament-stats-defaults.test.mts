/** New stats defaults reach tournaments (docs/security/breaks/tournament-stats-defaults.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statsDefaults, withStatsDefaults, missingStatsDefaults, statsUpdates } from '../src/core/statsDefaults.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const G = 'Stats to track';
const FIELDS: Record<string, { key: string; type: string; default?: unknown; group?: string; label?: string }[]> = {
  badminton: [{ key: 'pointDetail', type: 'toggle', default: true, group: G, label: 'Point detail' }, { key: 'rallyDetail', type: 'toggle', default: true, group: G, label: 'Rally length' }, { key: 'games', type: 'number', default: 3 }],
  tennis: [{ key: 'speedDetail', type: 'toggle', default: false, group: G }, { key: 'netDetail', type: 'toggle', default: true, group: G }, { key: 'lets', type: 'toggle', default: true }],
};
const of = (sp: string) => FIELDS[sp] ?? [];

test('TS7: only "Stats to track" toggles, with their default', () => {
  assert.deepEqual(statsDefaults(of('badminton')), { pointDetail: true, rallyDetail: true });
  assert.deepEqual(statsDefaults(of('tennis')), { speedDetail: false, netDetail: true }, 'a rule toggle (lets) is never touched');
});

test('TS1/TS2: a new tournament gets the defaults, chosen values stay', () => {
  const out = withStatsDefaults(['badminton', 'tennis'], { badminton: { rallyDetail: false, games: 5 } }, of);
  assert.deepEqual(out.badminton, { rallyDetail: false, games: 5, pointDetail: true });
  assert.deepEqual(out.tennis, { speedDetail: false, netDetail: true });
});

test('TS3/TS4/TS6: what an older tournament is missing; nothing once added', () => {
  const formats = { badminton: { pointDetail: true }, tennis: { netDetail: false } };
  assert.deepEqual(missingStatsDefaults(['badminton', 'tennis'], formats, of), { badminton: { rallyDetail: true }, tennis: { speedDetail: false } });
  const after = withStatsDefaults(['badminton', 'tennis'], formats, of);
  assert.deepEqual(missingStatsDefaults(['badminton', 'tennis'], after, of), {});
  assert.equal(after.tennis!.netDetail, false, 'the organiser’s off stays off');
});

test('TS3/TS4: the button offers every stat that differs from the new default, by name', () => {
  // a tournament made with the full form: old defaults stamped in (rallyDetail off)
  const formats = { badminton: { pointDetail: true, rallyDetail: false, games: 3 } };
  assert.deepEqual(statsUpdates(['badminton'], formats, of), [{ sport: 'badminton', key: 'rallyDetail', value: true, label: 'Rally length' }]);
  assert.deepEqual(statsUpdates(['badminton'], { badminton: { pointDetail: true, rallyDetail: true } }, of), [], 'up to date: no card');
  assert.deepEqual(statsUpdates(['tennis'], {}, of).map((u) => u.key), ['speedDetail', 'netDetail'], 'missing keys are offered too');
});

test('TS1/TS3: wired into tournament creation and Edit tournament', () => {
  assert.match(read('src/data/repos.ts'), /withStatsDefaults\(input\.sports, newTournamentFormats\(input\.sports, input\.formats\), \(sp\) => getSportMeta\(sp\)\?\.formatFields \?\? \[\]\)/);
  const e = read('src/screens/EditTournamentScreen.tsx');
  assert.match(e, /statsUpdates\(/);
  assert.match(e, /label="Use the new defaults"/);
  assert.match(e, /tournamentDraft\.setField\(/);
});

test('600 tournaments: chosen values never change; nothing missing after', () => {
  let seed = 8;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let u = 0; u < 600; u++) {
    const sports = ['badminton', 'tennis'].filter(() => rnd() < 0.7);
    const formats: Record<string, Record<string, unknown>> = {};
    for (const sp of sports) for (const f of of(sp)) if (rnd() < 0.4) (formats[sp] ??= {})[f.key] = f.type === 'toggle' ? rnd() < 0.5 : 4;
    const out = withStatsDefaults(sports, formats, of);
    for (const sp of Object.keys(formats)) for (const [k, v] of Object.entries(formats[sp])) assert.equal(out[sp]![k], v, `${u}: ${sp}.${k} kept`);
    assert.deepEqual(missingStatsDefaults(sports, out, of), {});
  }
});
