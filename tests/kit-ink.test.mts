/**
 * 2026-10-29 redesign follow-up: initials and numbers drawn on a team's kit
 * colour (or on the pale chip used when there's no kit) pick their ink from
 * that colour. The redesign had made them all white, and white on a yellow kit
 * or on the pale chip can't be read.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readableOn, contrastRatio } from '../src/core/contrast.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('ink on a kit colour', () => {
  test('pale and bright kits get dark ink, dark kits white, and every one reads (AA)', () => {
    const kits = ['#FFD400', '#FF5C5C', '#4DA3FF', '#F57C00', '#FFFFFF', '#EDE8DC', '#C62828', '#1D56C9', '#0D5A3F', '#111111', '#7B1FA2', '#3F8F3A'];
    for (const bg of kits) assert.ok(contrastRatio(readableOn(bg), bg) >= 4.5, `${bg}: ${contrastRatio(readableOn(bg), bg).toFixed(2)}`);
    assert.notEqual(readableOn('#FFD400'), '#FFFFFF', 'a yellow kit');
    assert.notEqual(readableOn('#EDE8DC'), '#FFFFFF', 'the pale no-kit chip');
    assert.equal(readableOn('#0D5A3F'), '#FFFFFF', 'the pitch green');
  });

  test('every avatar / leading cell on a kit colour takes its ink from it', () => {
    const sites: [string, RegExp, number][] = [
      ['src/components/BoxScore.tsx', /lead === side && \{ color: readableOn\(/g, 1],
      ['src/components/AwardPickerSheet.tsx', /st\.avatarText, \{ color: readableOn\(/g, 1],
      ['src/components/MatchSummary.tsx', /AvatarText, \{ color: readableOn\(/g, 3],
      ['src/components/TournamentAwardsTab.tsx', /st\.avatarText, \{ color: readableOn\(/g, 2],
      ['src/sports/cricket/index.tsx', /AvatarText, \{ color: readableOn\(/g, 3],
    ];
    for (const [file, re, n] of sites) assert.equal(read(file).match(re)?.length ?? 0, n, file);
  });

  test('the WhatsApp button: dark words on WhatsApp green (white there is ~2:1)', () => {
    assert.ok(contrastRatio('#FFFFFF', '#25D366') < 3, 'why white was wrong');
    assert.ok(contrastRatio('#14181D', '#25D366') >= 4.5);
    assert.match(read('src/components/ConnectBoard.tsx'), /waText: \{ color: theme\.colors\.onLime/);
  });
});
