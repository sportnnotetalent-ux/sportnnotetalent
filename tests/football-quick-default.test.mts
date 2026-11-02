/**
 * Football "Quick" stats for friendlies (founder, 2026-10-31; MVP F8) —
 * docs/security/breaks/mvp-football-quick.md Q1–Q6.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FOOTBALL_META } from '../src/sports/football/meta.ts';
import { readTrack, TRACK_KEYS, FOOTBALL_LIVE_SETTINGS } from '../src/sports/football/engine.ts';

const fields = FOOTBALL_META.formatFields!;
const cap = (k: string) => `track${k[0].toUpperCase()}${k.slice(1)}`;
const field = (k: string) => fields.find((f) => f.key === cap(k));
const friendly = Object.fromEntries(TRACK_KEYS.map((k) => [cap(k), field(k)?.default]));
const tournament = Object.fromEntries(TRACK_KEYS.map((k) => [cap(k), field(k)?.tournamentDefault ?? field(k)?.default]));

describe('the format', () => {
  test('every tracked stat is a "Stats to track" option', () => {
    for (const k of TRACK_KEYS) assert.ok(field(k), k);
  });
  test('Q5/Q6: a friendly tracks cards only (goals, assists, subs are always on); possession off', () => {
    const t = readTrack(friendly);
    assert.equal(t.cards, true);
    assert.equal(t.possession, false);
    for (const k of TRACK_KEYS) if (k !== 'cards') assert.equal(t[k], false, k);
  });
  test('Q2: a tournament keeps the full set it had (passes off, as before)', () => {
    assert.deepEqual(readTrack(tournament), readTrack({}));
  });
});

describe('saved matches and live settings', () => {
  test('Q1: a saved match (no track keys) still tracks everything but passes', () => {
    const t = readTrack({});
    for (const k of TRACK_KEYS) assert.equal(t[k], k !== 'passes', k);
  });
  test('Q4: every stat can be switched on mid-match in Scoring settings', () => {
    const keys = new Set(FOOTBALL_LIVE_SETTINGS.fields.map((f) => f.key));
    for (const k of TRACK_KEYS) assert.ok(keys.has(cap(k)), k);
  });
  test('Q3: the match-info format editor leaves live-setting keys to Scoring settings', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'src/screens/LiveScoringScreen.tsx'), 'utf8');
    // info-chain IC3: every key Scoring settings owns (liveOwnedKeys), not only `track…` keys
    assert.match(src, /\.\.\.liveOwnedKeys\(plugin\.liveSettings( as never)?\)/);
  });
});
