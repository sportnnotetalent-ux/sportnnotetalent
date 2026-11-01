/**
 * Plain words (docs/security/breaks/plain-words.md): newcomer-readable labels
 * in the setup and on the board. Only words change: every stored value and
 * every preset's rules stay the same.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BADMINTON_META } from '../src/sports/badminton/meta.ts';
import { TENNIS_META } from '../src/sports/tennis/meta.ts';
import { PADEL_META } from '../src/sports/padel/meta.ts';
import { KABADDI_META } from '../src/sports/kabaddi/meta.ts';
import { tennisStatus } from '../src/sports/tennis/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import type { SportMeta } from '../src/sports/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const opt = (m: SportMeta, key: string, value: unknown) => m.formatFields!.find((f) => f.key === key)!.options!.find((o) => o.value === value)!;
const label = (m: SportMeta, key: string) => m.formatFields!.find((f) => f.key === key)!.label;

describe('W1: badminton', () => {
  test('presets in plain words, same values and rules', () => {
    assert.equal(opt(BADMINTON_META, 'preset', 'bwf21').label, 'Games to 21, best of 3');
    assert.equal(opt(BADMINTON_META, 'preset', 'g5x11').label, 'Games to 11, best of 5');
    assert.equal(opt(BADMINTON_META, 'preset', 'g15').label, 'Games to 15, best of 3');
    assert.equal(opt(BADMINTON_META, 'preset', 'single').label, 'One game to 21');
    assert.deepEqual(opt(BADMINTON_META, 'preset', 'bwf21').set, { pointsPerGame: 21, cap: 30, gamesToWin: 2, goldenPoint: true });
  });
  test('the cap and golden point', () => {
    assert.equal(label(BADMINTON_META, 'cap'), 'Longest a game can go');
    assert.equal(opt(BADMINTON_META, 'goldenPoint', true).label, 'Next point wins');
    assert.equal(opt(BADMINTON_META, 'goldenPoint', false).label, 'Play on until 2 clear');
  });
});

describe('W2: tennis', () => {
  test('presets keep the known name in brackets', () => {
    assert.equal(opt(TENNIS_META, 'preset', 'fast4').label, 'Short sets to 4, no deuce (Fast4)');
    assert.equal(opt(TENNIS_META, 'preset', 'proset').label, 'One long set to 8 (pro set)');
    assert.equal(opt(TENNIS_META, 'preset', 'gs5').label, 'Best of 5, tiebreak at 6-6 in the 5th (Grand Slam)');
    assert.equal(opt(TENNIS_META, 'preset', 'itf_dbl').label, 'Doubles: no deuce, 3rd set is a tiebreak to 10');
    assert.equal(opt(TENNIS_META, 'preset', 'fast4').set!.noAd, true);
  });
  test('the tiebreak options', () => {
    assert.equal(label(TENNIS_META, 'setTiebreak'), 'Tiebreak when a set is level');
    assert.equal(opt(TENNIS_META, 'tbSuddenDeathAt', 4).label, 'Next point wins at 4-4 (Fast4)');
  });
  test('the deuce court is explained', () => {
    assert.match(read('src/sports/ServeOrderPicker.tsx'), /right-hand \(deuce\) court/);
    assert.match(read('src/sports/ServeCourtPanel.tsx'), /right-hand \(deuce\) court/);
  });
});

test('W3: padel', () => assert.equal(opt(PADEL_META, 'preset', 'premier').label, 'Golden point (best of 3)'));

describe('W4: kabaddi', () => {
  test('plain words first, the rule name in brackets; same values', () => {
    assert.equal(label(KABADDI_META, 'style'), 'When a player is out');
    assert.equal(opt(KABADDI_META, 'style', 'sanjeevani').label, 'They come back as you score (Sanjeevani)');
    assert.equal(opt(KABADDI_META, 'style', 'amar').label, 'No one goes off, points only (Amar)');
    assert.equal(opt(KABADDI_META, 'style', 'gaminee').label, 'No revivals until an all out (Gaminee)');
  });
  test('the timeline says Lona', () => assert.match(read('src/sports/kabaddi/engine.ts'), /label: 'All out \(Lona\) \+2'/));
});

describe('W5: one game / one set on the board', () => {
  test('badminton and tennis', () => {
    assert.match(read('src/sports/badminton/index.tsx'), /bestOf=\{s\.gamesToWin === 1 \? 'single game' : `best of \$\{s\.gamesToWin \* 2 - 1\}`\}/);
    assert.match(read('src/sports/tennis/index.tsx'), /bestOf=\{s\.setsToWin === 1 \? 'single set' : `best of \$\{s\.setsToWin \* 2 - 1\}`\}/);
  });
});

describe('W6: tennis deuce', () => {
  const P = (side: 'home' | 'away') => ({ type: 'POINT', side } as ScoreAction);
  const at33 = (cfg: object) => [P('home'), P('away'), P('home'), P('away'), P('home'), P('away')].reduce(tennis.reducer, tennis.init(cfg));
  test('advantage games: "Deuce" at 40-40, then "Advantage"', () => {
    const s = at33({});
    assert.equal(tennisStatus(s), 'Deuce');
    assert.equal(tennisStatus(tennis.reducer(s, P('home'))), 'Advantage');
    assert.equal(tennisStatus(tennis.reducer(tennis.reducer(s, P('home')), P('away'))), 'Deuce');
  });
  test('no-ad: "Deciding point"', () => assert.equal(tennisStatus(at33({ noAd: true })), 'Deciding point'));
  test('otherwise nothing', () => assert.equal(tennisStatus(tennis.init({})), ''));
  test('the board shows it', () => assert.match(read('src/sports/tennis/index.tsx'), /tennisStatus\(s\)/));
});

test('W7: the side-out call is explained', () => {
  assert.match(read('src/sports/rallyCore.tsx'), /The call is the serving side’s score, the other side’s score, then server 1 or 2\./);
});
