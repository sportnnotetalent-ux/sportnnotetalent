/** Stats on by default + Done for "Last point" (docs/security/breaks/describe-done.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackFields, detailLiveSettings } from '../src/sports/pointDetailSettings.ts';
import { panelMode, doneLabel } from '../src/sports/describePanel.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SPORTS = ['tennis', 'badminton', 'tabletennis', 'squash', 'padel', 'pickleball'] as const;

test('DD1/DD2: every tap stat on for a new match; serve speed stays off', () => {
  for (const s of SPORTS) {
    const d = detailLiveSettings(s).defaults as Record<string, unknown>;
    for (const f of trackFields(s)) {
      if (f.key === 'speedDetail') { assert.equal(d[f.key], false, `${s} serve speed`); continue; }
      assert.equal(f.on, true, `${s} ${f.key}`);
      assert.equal(d[f.key], true, `${s} ${f.key} default`);
    }
  }
  assert.equal(detailLiveSettings('badminton').defaults.rallyDetail, true);
});

test('DD4: Done when something is picked, Skip when nothing is', () => {
  assert.equal(doneLabel('Jump smash winner · 7–9 shots'), 'Done');
  assert.equal(doneLabel(''), 'Skip');
});

test('DD5/DD6/DD7: open → saved → next point open again; undo shows the earlier one saved', () => {
  const marks = new Map<number, 'done' | 'skipped'>();
  assert.equal(panelMode(1, marks), 'open');
  marks.set(1, 'done');
  assert.equal(panelMode(1, marks), 'saved');
  assert.equal(panelMode(2, marks), 'open', 'the next point opens fresh');
  marks.set(2, 'skipped');
  assert.equal(panelMode(2, marks), 'hidden');
  assert.equal(panelMode(1, marks), 'saved', 'after an undo, the earlier point stays saved');
  marks.delete(1);
  assert.equal(panelMode(1, marks), 'open', 'Edit reopens it');
});

test('DD4/DD5/DD8/DD9: both panels use the button, the saved line and Edit', () => {
  for (const f of ['src/sports/PointDetailRow.tsx', 'src/sports/tennis/PointCapture.tsx']) {
    const s = read(f);
    assert.match(s, /panelMode\(/, f);
    assert.match(s, /label=\{doneLabel\(summary\)\}/, f);
    assert.match(s, /✓ Saved/, f);
    assert.match(s, /accessibilityLabel="Edit the description of this point"/, f);
    // Done only changes what is shown; nothing is dispatched (DD8)
    assert.doesNotMatch(s, /onDone[^\n]*dispatch/, f);
  }
});

test('DD3/DD6: 600 scorers — a fresh card every point, never blocked', () => {
  let seed = 9;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let u = 0; u < 600; u++) {
    const marks = new Map<number, 'done' | 'skipped'>();
    let next = 0; // event ids only grow: a point after an undo gets a new one
    for (let p = 0; p < 60; p++) {
      const id = ++next;
      assert.equal(panelMode(id, marks), 'open', `${u}: point ${p} opens fresh`);
      const r = rnd();
      if (r < 0.4) marks.set(id, 'done');
      else if (r < 0.6) marks.set(id, 'skipped');
      // else: the scorer ignores the card and scores on (DD3)
      if (rnd() < 0.05 && id > 1) assert.ok(['open', 'saved', 'hidden'].includes(panelMode(id - 1, marks)), 'undo shows the earlier point as left');
    }
  }
});

test('DD10: endings grouped — Won it first, then Errors; empty groups dropped', async () => {
  const { howSections } = await import('../src/sports/describePanel.ts');
  const { DETAIL_HOWS } = await import('../src/sports/pointDetail.ts');
  for (const sp of ['tennis', 'badminton', 'tabletennis', 'squash', 'padel', 'pickleball'] as const) {
    const secs = howSections(DETAIL_HOWS[sp]);
    assert.deepEqual(secs.map((x) => x.title), ['Won it', 'Errors'], sp);
    assert.ok(secs[0].hows.every((h) => h.credit === 'winner') && secs[1].hows.every((h) => h.credit === 'loser'), sp);
    assert.equal(secs[0].hows.length + secs[1].hows.length, DETAIL_HOWS[sp].length, `${sp}: nothing lost`);
  }
  assert.deepEqual(howSections(DETAIL_HOWS.badminton.filter((h) => h.credit === 'loser')).map((x) => x.title), ['Errors']);
  for (const f of ['src/sports/PointDetailRow.tsx', 'src/sports/tennis/PointCapture.tsx']) {
    const s = read(f);
    assert.match(s, /howSections\(hows\)/, f);
    assert.match(s, />Shot</, f);
  }
});

test('DD11: switched on but never tagged is not "tracked" (no false zeros)', async () => {
  const { rallyTracked, netTracked, thirdTracked } = await import('../src/sports/pointDetail.ts');
  const on = { rallyDetail: true, netDetail: true, thirdDetail: true, events: [{ id: 1, kind: 'point' }] };
  assert.equal(rallyTracked(on as never), false);
  assert.equal(netTracked(on as never), false);
  assert.equal(thirdTracked(on as never), false);
  const tagged = { ...on, events: [{ id: 1, kind: 'point', rallyLen: 'short', atNet: 'home', third: 'drop' }] };
  assert.equal(rallyTracked(tagged as never), true);
  assert.equal(netTracked(tagged as never), true);
  assert.equal(thirdTracked(tagged as never), true);
});

test('DD12: doubles asks who; a doubles side with no names gets a hint, never silence', async () => {
  const { byHint } = await import('../src/sports/describePanel.ts');
  assert.equal(byHint(true, 0, 'Pair B'), "By: add Pair B's two players (Add / invite a player) to credit each one");
  assert.equal(byHint(true, 1, 'Pair B'), "By: add Pair B's two players (Add / invite a player) to credit each one");
  assert.equal(byHint(true, 2, 'Pair B'), null, 'named players: the By: chips show instead');
  assert.equal(byHint(false, 0, 'Ravi'), null, 'singles: the opponent is credited automatically');
  for (const f of ['src/sports/PointDetailRow.tsx', 'src/sports/tennis/PointCapture.tsx']) assert.match(read(f), /byHint\(/, f);
});

test('DD13: point detail switched on but nothing described is not tracked (no false zeros)', async () => {
  const { detailTracked, detailCoverage } = await import('../src/sports/pointDetail.ts');
  const on = { pointDetail: true, events: [{ id: 1, kind: 'point', side: 'home' }, { id: 2, kind: 'point', side: 'away' }] };
  assert.equal(detailTracked(on as never), false);
  assert.equal(detailCoverage('badminton', on as never), null);
  const described = { ...on, events: [...on.events, { id: 3, kind: 'point', side: 'home', pd: { how: 'winner' } }] };
  assert.equal(detailTracked(described as never), true);
  assert.equal(detailCoverage('badminton', described as never), 'full');
  assert.equal(detailCoverage('padel', { pointDetail: true, events: [{ id: 1, kind: 'point', pd: { how: 'ace' } }] } as never), 'quick', 'only one-tap hows: quick');
});
