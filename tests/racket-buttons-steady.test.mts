/**
 * MVP B1 / T4 — racket point buttons must not move under the thumb. Pickers
 * (who serves first, serving order, who starts on the right), the change-ends
 * cue and the serve banner used to sit ABOVE the buttons and appear / fold as
 * play went on. Now the buttons come first in every racket sport's controls;
 * PointButtons' own "pick who serves first" hint sits under the buttons; the
 * board keeps one fixed-height line for game point / change ends, so it never
 * grows. Tennis / padel's Ace and Double fault keep a gap below the buttons.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const MOVERS = ['<CueBanner', '<ServeFirstPicker', '<DoublesOrderPicker', '<ServeOrderPicker', '{firstPicker}', '{startPicker}', '{ttPicker}', 'Serving:'];

/** Each controls block (from its outer <View gap 4> to its </View>): the buttons come before every mover. */
function blocks(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const b = src.indexOf('<PointButtons', i);
    if (b < 0) break;
    const start = src.lastIndexOf('return (', b);
    const end = src.indexOf('\n    </View>\n  );', b) > 0 ? src.indexOf('\n  );', b) : src.indexOf(');', b);
    out.push(src.slice(start, end));
    i = b + 1;
  }
  return out;
}

for (const f of ['src/sports/badminton/index.tsx', 'src/sports/tennis/index.tsx', 'src/sports/padel/index.tsx', 'src/sports/rallyCore.tsx']) {
  test(`${f}: the point buttons come before anything that appears or folds`, () => {
    const bs = blocks(read(f));
    assert.ok(bs.length >= 1);
    for (const b of bs) {
      const btn = b.indexOf('<PointButtons');
      for (const m of MOVERS) {
        const at = b.indexOf(m);
        if (at >= 0) assert.ok(at > btn, `${m} is above the buttons`);
      }
    }
  });
}

test('PointButtons: the "pick who serves first" hint sits below the buttons', () => {
  const src = read('src/sports/PointButtons.tsx');
  assert.ok(src.indexOf('{disabled && disabledHint ?') > src.indexOf('<View style={pb.row}>{sideOrder(swapped).map(big)}</View>'));
});

test('the board keeps one fixed-height line for game point / change ends', () => {
  const src = read('src/sports/SetLineBoard.tsx');
  assert.match(src, /st\.slot/);
  assert.match(src, /slot: \{ minHeight:/);
});

test('tennis and padel: a gap before Ace / Double fault', () => {
  for (const f of ['src/sports/tennis/index.tsx', 'src/sports/padel/index.tsx']) assert.match(read(f), /ctrl\.secGap|style=\{\{ marginTop: theme\.spacing\(3\) \}\}/, f);
});

test('the undo bar is there from the start (greyed out), so the first action never pushes the controls down', () => {
  const src = read('src/screens/LiveScoringScreen.tsx');
  assert.match(src, /const undoBar = canScore && \(eventCount > 0 \|\| started\) \?/);
  assert.match(src, /Nothing to undo yet/);
});
