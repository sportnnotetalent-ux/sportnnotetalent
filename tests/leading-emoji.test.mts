/**
 * 2026-10-29 redesign: buttons, chips, section headers and empty states swap a
 * label's leading emoji for a line icon (or a sport's colour dot) as they draw,
 * so the 1,900 emoji-bearing lines across the app don't each need an edit.
 * The splitting is PURE and tested here; the icons are in components/Icon.tsx.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitLeading, stripLeadingEmoji, sportChip, sportStack, iconBox } from '../src/core/leadingEmoji.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const KEYS = ['🏆', '✓', '✕', '⏱', '🟨', '🛡'];

describe('splitLeading', () => {
  test('a known leading emoji, with or without the variation selector, and the text after it', () => {
    assert.deepEqual(splitLeading('🏆 New tournament', KEYS), { key: '🏆', rest: 'New tournament' });
    assert.deepEqual(splitLeading('🛡️ Block', KEYS), { key: '🛡', rest: 'Block' });
    assert.deepEqual(splitLeading('⏱️Overs & target', KEYS), { key: '⏱', rest: 'Overs & target' });
    assert.deepEqual(splitLeading('✕', KEYS), { key: '✕', rest: '' }, 'an icon-only label');
  });
  test('nothing to split: plain text, an unknown emoji, or an emoji in the middle', () => {
    assert.equal(splitLeading('New tournament', KEYS), null);
    assert.equal(splitLeading('🦄 Unicorn', KEYS), null);
    assert.equal(splitLeading('Save ✓', KEYS), null);
    assert.equal(splitLeading('', KEYS), null);
    assert.equal(splitLeading(undefined as never, KEYS), null);
  });
  test('the longest key wins (a two-part emoji before its first half)', () => {
    assert.deepEqual(splitLeading('🟥🟦 + report', ['🟥', '🟥🟦']), { key: '🟥🟦', rest: '+ report' });
  });
});

describe('stripLeadingEmoji (section titles)', () => {
  test('any pictograph, symbol or arrow at the start goes; the words stay', () => {
    assert.equal(stripLeadingEmoji('🔴 Live now'), 'Live now');
    assert.equal(stripLeadingEmoji('👀 From people you follow'), 'From people you follow');
    assert.equal(stripLeadingEmoji('🏋️ Weightlifting'), 'Weightlifting');
    assert.equal(stripLeadingEmoji('👨‍👩‍👧 Families'), 'Families', 'a joined emoji sequence');
    assert.equal(stripLeadingEmoji('Up next'), 'Up next');
    assert.equal(stripLeadingEmoji('100m final'), '100m final');
    assert.equal(stripLeadingEmoji('🏆'), '🏆', 'never leaves an empty title');
  });
});

describe('sportChip ("⚽ Football" → the sport, drawn with its colour dot)', () => {
  const SPORTS = [{ id: 'football', name: 'Football', icon: '⚽' }, { id: 'shooting', name: 'Shooting', icon: '🎯' }, { id: 'weightlifting', name: 'Weightlifting', icon: '🏋️' }];
  test('only when the words are exactly the sport\'s name', () => {
    assert.deepEqual(sportChip('⚽ Football', SPORTS), { id: 'football', name: 'Football' });
    assert.deepEqual(sportChip('⚽Football', SPORTS), { id: 'football', name: 'Football' });
    assert.deepEqual(sportChip('🏋️ Weightlifting', SPORTS), { id: 'weightlifting', name: 'Weightlifting' });
    assert.equal(sportChip('🎯 On target', SPORTS), null, 'a scoring chip that happens to use a sport\'s emoji');
    assert.equal(sportChip('Football', SPORTS), null);
  });
});

describe('sportStack (a run of sports drawn as overlapping badges, not "⚽ 🏏 🏀 …")', () => {
  test('the first few, once each, and how many more', () => {
    assert.deepEqual(sportStack(['football', 'cricket'], 4), { shown: ['football', 'cricket'], more: 0 });
    assert.deepEqual(sportStack(['football', 'cricket', 'chess', 'golf', 'tennis', 'hockey'], 4), { shown: ['football', 'cricket', 'chess', 'golf'], more: 2 });
    assert.deepEqual(sportStack(['football', 'football', 'chess'], 4), { shown: ['football', 'chess'], more: 0 }, 'a repeated sport once');
    assert.deepEqual(sportStack([], 4), { shown: [], more: 0 });
    assert.deepEqual(sportStack(undefined as never, 4), { shown: [], more: 0 });
  });
  test('the screens that listed sports as a run of emoji draw the stack instead', () => {
    for (const f of ['CalendarScreen', 'ClubsScreen', 'OrganizationScreen', 'TeamProfileScreen', 'TournamentProfileScreen', 'SquadScreen', 'DiscoverScreen', 'JoinTournamentScreen']) {
      const src = read(`src/screens/${f}.tsx`);
      assert.match(src, /<SportLine /, `${f} draws a SportLine`);
      assert.doesNotMatch(src, /<Text[^>]*>\{[a-z.]*sports\.map\(\(s\) => getSportMeta\(s\)\.icon\)\.join\(' '\)/, `${f} has no run of sport emoji as text`);
    }
  });
});

describe('the Discover board (segments, filters, listing cards)', () => {
  test('every listing kind\'s emoji has a line icon', () => {
    const icons = read('src/components/Icon.tsx');
    for (const e of ['🙋', '🧩', '⚔', '📍']) assert.ok(icons.includes(`'${e}':`), `${e} is mapped`);
  });
  test('custom buttons draw their icon through IconText; the card shows the sport as a badge', () => {
    assert.match(read('src/components/Icon.tsx'), /export function IconText[\s\S]*splitLeading\(label, EMOJI_KEYS\)/);
    assert.match(read('src/screens/DiscoverScreen.tsx'), /<IconText label=\{m\.label\}/);
    assert.match(read('src/components/PlayerFilters.tsx'), /<IconText label=/);
    const board = read('src/components/ConnectBoard.tsx');
    assert.match(board, /<SportBadge sport=\{l\.sport\}/);
    assert.match(board, /<IconText label="💬 WhatsApp"/);
    assert.doesNotMatch(board, /📍 \$\{l\.city\}/);
  });
});

describe('iconBox (an emoji slot\'s Text style → the icon\'s box, size and colour)', () => {
  test('layout stays on the box; text-only props become the icon\'s size and colour', () => {
    const r = iconBox({ fontSize: 20, color: '#0D5A3F', fontWeight: '800', lineHeight: 24, textAlign: 'center', marginRight: 8, width: 28, position: 'absolute', top: 4, backgroundColor: '#FFF', borderRadius: 14, padding: 4 });
    assert.equal(r.size, 19);
    assert.equal(r.color, '#0D5A3F');
    assert.deepEqual(r.box, { marginRight: 8, width: 28, position: 'absolute', top: 4, backgroundColor: '#FFF', borderRadius: 14, padding: 4 });
  });
  test('no style: a 20pt slot in the fallback colour', () => {
    assert.deepEqual(iconBox(undefined, '#111'), { size: 19, color: '#111', box: {} });
    assert.equal(iconBox({ color: '#0D5A3F' }, '#111', '#B32525').color, '#B32525', 'an explicit colour wins');
  });
});

describe('icon-only Text slots', () => {
  test('a Text holding only a mapped emoji is drawn as a Glyph (pairs and the welcome wave excepted)', () => {
    const icons = read('src/components/Icon.tsx');
    const keys = new Set([...icons.matchAll(/'([^']+)':\s*(?:\{ Icon|card\()/g)].map((m) => m[1].replace(/️/g, '')));
    const KEEP = ['GolfRoundScreen.tsx', 'ChampionsCard.tsx', 'OnboardingOverlay.tsx'];
    const files = readdirSync(join(import.meta.dirname, '..', 'src'), { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.tsx') && !KEEP.some((k) => f.endsWith(k)));
    const left: string[] = [];
    for (const f of files) {
      for (const m of read(`src/${f}`).matchAll(/<Text style=\{(?:[^{}]*|\[[^\]]*\])\}>([^<>{}A-Za-z0-9]{1,4})<\/Text>/g)) {
        if (keys.has(m[1].trim().replace(/️/g, ''))) left.push(`${f}: ${m[1]}`);
      }
    }
    assert.deepEqual(left, []);
  });
});

describe('the wiring', () => {
  test('Button, SelectChip, Pill, SectionHeader, ScreenTitle and EmptyState use it', () => {
    const ui = read('src/components/ui.tsx');
    assert.match(ui, /splitLeading\(label, EMOJI_KEYS\)/);
    assert.match(ui, /sportChip\(label/);
    assert.match(ui, /stripLeadingEmoji\(title\)/);
    assert.match(read('src/components/SectionHeader.tsx'), /stripLeadingEmoji\(title\)/);
  });
});
