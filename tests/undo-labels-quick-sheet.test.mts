/**
 * Undo labels in every sport, and the Quick options sheet closing
 * (docs/security/breaks/undo-labels-quick-sheet.md).
 *
 * (A) hockey, handball, kabaddi, chess and carrom name what Undo removes, from
 * the step's real prev / next states, in the sport's own words; a sport's own
 * label that returns null (or junk, or throws) falls back to the shared one.
 * (B) an action applied from a Quick options tile closes the sheet.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as H from '../src/sports/hockey/engine.ts';
import * as HB from '../src/sports/handball/engine.ts';
import * as K from '../src/sports/kabaddi/engine.ts';
import * as C from '../src/sports/carrom/engine.ts';
import * as CH from '../src/sports/chess/engine.ts';
import { hockeyUndoLabel } from '../src/sports/hockey/undoLabel.ts';
import { handballUndoLabel } from '../src/sports/handball/undoLabel.ts';
import { kabaddiUndoLabel } from '../src/sports/kabaddi/undoLabel.ts';
import { carromUndoLabel } from '../src/sports/carrom/undoLabel.ts';
import { chessUndoLabel } from '../src/sports/chess/undoLabel.ts';
import { cleanUndoLabel, resolveUndoLabel, undoLabel } from '../src/sports/undoLabel.ts';

const root = join(import.meta.dirname, '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

const N: Record<string, string> = { p1: 'Asha', p2: 'Meera', p3: 'Ravi', p4: 'Kiran' };
const nameOf = (id?: string | null, legacy?: string | null) => (id && N[id]) || (legacy ?? '').trim() || 'Player';
const sides = { home: 'India', away: 'Spain' };
type Fn = (step: { type: string; prev: unknown; next: unknown }, n: typeof nameOf, s: typeof sides) => string | null;
/** Apply `a` to `s`; the label of that step (and the states untouched by it). */
function step<S>(r: (s: S, a: never) => S, s: S, a: unknown, fn: Fn): { next: S; label: string | null } {
  const next = r(s, a as never);
  const before = JSON.stringify([s, next]);
  const label = fn({ type: (a as { type: string }).type, prev: s, next }, nameOf, sides);
  assert.equal(JSON.stringify([s, next]), before, 'a label never changes the states');
  return { next, label };
}

describe('UQ-1 / UQ-9 — the screen falls back to the shared label', () => {
  test('null, junk or a throw from the sport → the shared label; both empty → null', () => {
    assert.equal(resolveUndoLabel(() => null, () => 'point to Nadal'), 'point to Nadal');
    assert.equal(resolveUndoLabel(() => 'move e4', () => 'x'), 'move e4');
    assert.equal(resolveUndoLabel(() => { throw new Error('odd state'); }, () => 'x'), 'x');
    assert.equal(resolveUndoLabel(() => 'goal · undefined', () => 'x'), 'x');
    assert.equal(resolveUndoLabel(null, () => 'x'), 'x');
    assert.equal(resolveUndoLabel(() => null, () => null), null);
    assert.equal(resolveUndoLabel(() => null, () => { throw new Error('x'); }), null);
  });
  test('junk never reaches the bar', () => {
    for (const bad of ['', '  ', 'NaN points', 'null', 'goal · ', '[object Object]', 'card ·  · x', 'goal ()', 42, undefined, null]) {
      assert.equal(cleanUndoLabel(bad), null, String(bad));
    }
    assert.equal(cleanUndoLabel(' field goal · Asha (1-0) '), 'field goal · Asha (1-0)');
  });
  test('LiveScoringScreen resolves the sport label with the shared one as the fallback', () => {
    const s = src('src/screens/LiveScoringScreen.tsx');
    // DR3 (demo-recording-bugs.md): the sides as the screen shows them, not their codes
    assert.match(s, /resolveUndoLabel\(\s*(?:\/\/[^\n]*\n\s*)?plugin\.undoLabel \? \(\) => plugin\.undoLabel!\(lastStep, undoNameOf, \{ home: homeShown, away: awayShown \}\) : null,\s*\(\) => undoLabel\(lastStep/);
    assert.doesNotMatch(s, /plugin\.undoLabel \? plugin\.undoLabel\(lastStep, undoNameOf\) : undoLabel\(/);
  });
  test('each of the five sports registers its own label', () => {
    for (const [sp, fn] of [['hockey', 'hockeyUndoLabel'], ['handball', 'handballUndoLabel'], ['kabaddi', 'kabaddiUndoLabel'], ['carrom', 'carromUndoLabel'], ['chess', 'chessUndoLabel']]) {
      assert.match(src(`src/sports/${sp}/index.tsx`), new RegExp(`undoLabel: ${fn},`), sp);
    }
  });
});

describe('UQ-2 — hockey', () => {
  test('goals, corners, cards, shots, subs, strokes and quiet steps', () => {
    let s = H.init({});
    const go = (a: unknown) => { const r = step(H.reducer, s, a, hockeyUndoLabel); s = r.next; return r.label; };
    assert.equal(go({ type: 'CLOCK', payload: { run: true, at: 1 } }), 'clock start / stop');
    assert.equal(go({ type: 'GOAL', side: 'home', attribution: { playerId: 'p1' }, payload: {} }), 'field goal · Asha (1-0)');
    assert.equal(go({ type: 'GOAL', side: 'away', payload: { goalType: 'pc' } }), 'penalty-corner goal · Spain (1-1)');
    assert.equal(go({ type: 'PC', side: 'away', payload: {} }), 'penalty corner · Spain');
    assert.equal(go({ type: 'CARD', side: 'home', attribution: { playerId: 'p2' }, payload: { card: 'green' } }), 'green card (2 min) · Meera');
    assert.equal(go({ type: 'CARD', side: 'home', payload: { card: 'yellow', official: 'Coach' } }), 'yellow card · Coach (official)');
    assert.equal(go({ type: 'SHOT', side: 'home', attribution: { playerId: 'p1' }, payload: { onGoal: false, miss: 'wide' } }), 'shot wide · Asha');
    assert.equal(go({ type: 'SUB', side: 'home', payload: { offId: 'p1', onId: 'p3' } }), 'substitution · Ravi on');
    assert.equal(go({ type: 'STROKE', side: 'away', payload: { outcome: 'saved' } }), 'penalty stroke saved · Spain');
    assert.equal(go({ type: 'END_PERIOD', payload: { at: 2 } }), 'period end');
  });
  test('UQ-7 an older log: the stored name is the fallback; an unknown id → the side', () => {
    const s = H.init({});
    const legacy = H.reducer(s, { type: 'GOAL', side: 'home', attribution: { playerName: 'Old Name' }, payload: {} } as never);
    // the legacy reducer keeps a stored name only beside an id; a name-only credit reads as a team goal
    assert.match(hockeyUndoLabel({ type: 'GOAL', prev: s, next: legacy }, nameOf, sides)!, /^field goal · (Old Name|India) \(1-0\)$/);
    const unknown = H.reducer(s, { type: 'GOAL', side: 'away', attribution: { playerId: 'zz' }, payload: {} } as never);
    assert.equal(hockeyUndoLabel({ type: 'GOAL', prev: s, next: unknown }, nameOf, sides), 'field goal · Spain (0-1)');
  });
});

describe('UQ-3 — handball', () => {
  test('goals by position, misses, suspensions, time-outs, faults and quiet steps', () => {
    let s = HB.init({});
    const go = (a: unknown) => { const r = step(HB.reducer, s, a, handballUndoLabel); s = r.next; return r.label; };
    assert.equal(go({ type: 'GOAL', side: 'home', attribution: { playerId: 'p1' }, payload: { shotType: 'nineM' } }), 'goal · 9 m · Asha (1-0)');
    assert.equal(go({ type: 'MISS', side: 'away', payload: { result: 'saved' } }), '9 m saved · Spain');
    assert.equal(go({ type: 'CARD', side: 'home', attribution: { playerId: 'p2' }, payload: { card: 'twoMin' } }), '2-minute suspension · Meera');
    assert.equal(go({ type: 'TIMEOUT', side: 'away', payload: {} }), 'team time-out · Spain');
    assert.equal(go({ type: 'TURNOVER', side: 'home', attribution: { playerId: 'p3' }, payload: { fault: 'steps' } }), 'technical fault · steps · Ravi');
    assert.equal(go({ type: 'PASSIVE', side: 'away', payload: {} }), 'passive-play warning · Spain');
    assert.equal(go({ type: 'CLOCK', payload: { run: true, at: 1 } }), 'clock start / stop');
    // no raw keys (twoMin, sevenM, nineM)
    const g7 = go({ type: 'GOAL', side: 'home', attribution: { playerId: 'p1' }, payload: { shotType: 'sevenM' } })!;
    assert.equal(g7, 'goal · 7 m · Asha (2-0)');
  });
});

describe('UQ-4 — kabaddi', () => {
  test('raids (with the tackle), timeouts, cards, technical points, subs and quiet steps', () => {
    let s = K.reducer(K.init({ substitutes: 5 }), { type: 'KICKOFF', payload: { at: 1 } } as never);
    const go = (a: unknown) => { const r = step(K.reducer, s, a, kabaddiUndoLabel); s = r.next; return r.label; };
    const all = (acts: unknown[]) => acts.map(go).at(-1);
    assert.equal(all(K.raidActions(s, K.quickRaidForm('home', 'touch', { id: 'p1' } as never))), 'raid +1 — 1 touch · Asha (1-0)');
    assert.equal(all(K.raidActions(s, { ...K.quickRaidForm('away', 'out', { id: 'p3' } as never), tackler: { id: 'p2' } } as never)), 'raid — raider out · Ravi · tackle +1 by Meera (2-0)');
    assert.equal(go({ type: 'TIMEOUT', side: 'away', payload: {} }), 'timeout · Spain');
    assert.equal(go({ type: 'CARD', side: 'away', payload: { card: 'green', official: true } }), 'green card — warning · team official');
    assert.equal(go({ type: 'TECH_POINT', side: 'home', payload: { reason: 'coaching' } }), 'technical point +1 — coaching from outside · India (3-0)');
    assert.equal(go({ type: 'SUB', side: 'home', payload: { offId: 'p1', onId: 'p4' } }), 'substitution · Kiran on');
    assert.equal(go({ type: 'PAUSE', payload: { at: 5 } }), 'clock pause');
    assert.equal(go({ type: 'NEXT_HALF', payload: {} }), 'start of the next half');
  });
  test('a raid edited in place reads as a correction', () => {
    let s = K.reducer(K.init({}), { type: 'KICKOFF', payload: { at: 1 } } as never);
    for (const a of K.raidActions(s, K.quickRaidForm('home', 'touch', { id: 'p1' } as never))) s = K.reducer(s, a as never);
    const eid = s.raids[0].eid!;
    const edit = { type: 'RAID_OUTCOME', side: 'home', payload: { touches: 2, replaces: eid, raiderId: 'p1', v: 2 } };
    const next = K.reducer(s, edit as never);
    assert.equal(kabaddiUndoLabel({ type: 'RAID_OUTCOME', prev: s, next }, nameOf, sides), 'raid correction');
  });
});

describe('UQ-5 — carrom', () => {
  test('boards, penalty boards, game ends, awards and the break pick', () => {
    let s = C.init({});
    const go = (a: unknown) => { const r = step(C.reducer, s, a, carromUndoLabel); s = r.next; return r.label; };
    assert.equal(go({ type: 'FIRST_BREAK', side: 'home', payload: { side: 'home' } }), 'break pick');
    assert.equal(go(C.boardAction({ side: 'home', coins: 4, queen: true, by: [{ side: 'home', id: 'p1' }] })), 'board to Asha +7 with the Queen (7-0)');
    assert.equal(go(C.boardAction({ side: 'away', coins: 0, queen: false, penalty: true })), 'penalty board · +3 to Spain (7-3)');
    assert.equal(go(C.boardAction({ side: 'away', coins: 9, queen: false })), 'board to Spain +9 (7-12)');
    go(C.boardAction({ side: 'home', coins: 9, queen: true, by: [{ side: 'home', id: 'p1' }] }));
    assert.equal(go(C.boardAction({ side: 'home', coins: 9, queen: true, by: [{ side: 'home', id: 'p1' }] })), 'board to Asha +6 with the Queen · game 1 (25-12)');
    assert.equal(go({ type: 'AWARD_GAME', side: 'away', payload: { game: 2, reason: 'conduct' } }), 'game 2 awarded to Spain');
    assert.equal(go({ type: 'EDIT_LOG', payload: { boards: [] } }), 'board correction');
  });
});

describe('UQ-6 — chess', () => {
  test('moves, arbiter events, colour pick, clock times and the result', () => {
    let s = CH.init({});
    const go = (a: unknown) => { const r = step(CH.reducer, s, a, chessUndoLabel as Fn); s = r.next; return r.label; };
    assert.equal(go({ type: 'SET_WHITE', payload: { side: 'away' } }), 'colour pick');
    assert.equal(go({ type: 'MOVES', payload: { add: ['e4', 'e5'] } }), 'moves e4 e5');
    assert.equal(go({ type: 'ARBITER', payload: { kind: 'illegal', side: 'home' } }), 'illegal move · India');
    assert.equal(go({ type: 'ARBITER', payload: { kind: 'drawOffer', side: 'away' } }), 'draw offer · Spain');
    assert.equal(go({ type: 'RESULT', payload: { winner: 'home', method: 'checkmate' } }), 'result 0-1 · India wins (checkmate)');
  });
  test('a draw, and a same-moves clock change', () => {
    const s = CH.init({});
    const d = CH.reducer(s, { type: 'RESULT', payload: { winner: 'draw', method: 'agreement' } });
    assert.equal(chessUndoLabel({ type: 'RESULT', prev: s, next: d }, nameOf, sides), 'result ½-½ (draw agreed)');
    const a = { ...s, game: { san: ['e4'], fen: 'x', clk: [100] } };
    const b = { ...s, game: { san: ['e4'], fen: 'x', clk: [95] } };
    assert.equal(chessUndoLabel({ type: 'MOVES', prev: a, next: b }, nameOf, sides), 'clock times');
  });
  test('a step chess cannot name falls back to the shared label (still clean or null)', () => {
    const s = CH.init({});
    const own = chessUndoLabel({ type: 'SOMETHING_NEW', prev: s, next: s }, nameOf, sides);
    assert.equal(own, null);
    assert.equal(resolveUndoLabel(() => own, () => undoLabel({ type: 'SOMETHING_NEW', prev: s, next: s }, { home: 'India', away: 'Spain' })), null);
  });
});

describe('UQ-11 / UQ-12 — the Quick options sheet closes after an action', () => {
  const screen = src('src/screens/LiveScoringScreen.tsx');
  test('the sport tiles get a dispatch that closes the sheet', () => {
    // tap feedback (2026-11-03): through the capture wrapper, so a tile's step is confirmed too
    assert.match(screen, /const quickDispatch = useCallback\(\(a: [^)]*\) => \{ scoreDispatch\(a\); setQuickOpen\(false\); \}, \[scoreDispatch\]\);/);
    assert.match(screen, /<plugin\.QuickOptions\s+state=\{state\} dispatch=\{quickDispatch\}/);
    assert.match(screen, /onDone=\{\(msg\) => \{ setQuickOpen\(false\);/);
  });
  test('racket and volleyball tiles: every dispatch is followed by onDone (or ends the match)', () => {
    for (const f of ['src/sports/RacketQuickOptions.tsx', 'src/sports/volleyball/SanctionOptions.tsx']) {
      const lines = src(f).split('\n');
      lines.forEach((l, i) => {
        if (!/\bdispatch\(/.test(l)) return;
        const near = lines.slice(i, i + 3).join('\n');
        assert.ok(/onDone\(|onEndMatch|stampAction\(action\)\);\s*$/.test(near) || /onDone\(\);/.test(lines.slice(Math.max(0, i - 12), i).join('\n')), `${f}:${i + 1} ${l.trim()}`);
      });
    }
  });
  test('a tile that opens a further step dispatches nothing (the sheet stays open)', () => {
    const r = src('src/sports/RacketQuickOptions.tsx');
    assert.match(r, /<Tile key=\{t\.k\} [^>]*onPress=\{\(\) => toggle\(t\.k\)\} \/>/);
    const sheet = src('src/components/QuickOptionsSheet.tsx');
    assert.match(sheet, /onPress=\{\(\) => setPanel\('break'\)\}/);
    assert.match(sheet, /onBreak\(kind, kind === 'other' \? note\.trim\(\) : undefined\);\s*onClose\(\);/);
  });
});
