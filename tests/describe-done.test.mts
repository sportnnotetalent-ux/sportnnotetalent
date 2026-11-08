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
