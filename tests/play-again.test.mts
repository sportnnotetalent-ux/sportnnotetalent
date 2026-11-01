/**
 * Play again + the 7-day nudge (docs/security/breaks/play-again.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { playAgainDraft } from '../src/data/matchHousekeeping.ts';
import { replayNudge, NUDGE_PREFIX, NUDGE_AFTER_MS } from '../src/core/nudge.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const team = (id: string, name: string) => ({ id, name, shortName: name.slice(0, 3).toUpperCase(), sport: 'football' }) as never;
const base = {
  sport: 'football' as const, homeTeam: team('t1', 'Panthers'), awayTeam: team('t2', 'Cheetahs'),
  venueName: 'Gachibowli', venueMapsUrl: 'https://maps.example/x', streamUrl: 'https://youtube.com/live/abc',
  format: { preset: '5s', halfMinutes: 20, __walkover: true, __seriesLeg: 2, aggregateLeg: 2, aggPriorHome: 1, aggPriorAway: 0 } as Record<string, unknown>,
};

describe('PA1 / PA2 / PA3: what a replay copies', () => {
  test('teams, format and venue; never internal, series or stream keys', () => {
    const d = playAgainDraft(base as never)!;
    assert.deepEqual([d.homeTeamId, d.awayTeamId, d.sport], ['t1', 't2', 'football']);
    assert.deepEqual(d.format, { preset: '5s', halfMinutes: 20 });
    assert.equal(d.venueName, 'Gachibowli');
    assert.equal(d.streamUrl, undefined, 'a live-stream link belongs to one match');
  });
  test('tournament matches: no replay', () => assert.equal(playAgainDraft({ ...base, tournamentId: 'tr1' } as never), null));
});

describe('PA5 / PA6: the nudge', () => {
  const n = replayNudge({ matchId: 'm1', home: 'Panthers', away: 'Cheetahs', now: 0 });
  test('six days later, one id (a newer match replaces it), outside the reminders’ prefixes', () => {
    assert.equal(NUDGE_AFTER_MS, 6 * 24 * 3600 * 1000);
    assert.equal(n.fireAt, NUDGE_AFTER_MS);
    assert.equal(n.id, `${NUDGE_PREFIX}replay`);
    assert.ok(!['player:', 'follow:', 'scorer:'].some((p) => n.id.startsWith(p)));
  });
  test('friendly words, opens the match (where Play again is)', () => {
    assert.equal(n.title, 'Another game this week?');
    assert.equal(n.body, 'Play again: Panthers vs Cheetahs, set up in one tap.');
    assert.equal(n.matchId, 'm1');
  });
});

describe('the wiring', () => {
  const src = read('src/screens/LiveScoringScreen.tsx');
  test('Play again at full time, friendlies only, one at a time', () => {
    assert.match(src, /accessibilityLabel="Play again"/);
    assert.match(src, /!meta\.tournamentId && canScore && matchId/);
    assert.match(src, /if \(playingAgain\) return;/);
    assert.match(src, /navigation\.replace\('LiveScoring', \{\s*matchId: next\.id,/);
  });
  test('the new match is theirs: host + scorer', () => {
    const d = read('src/data/playAgain.ts');
    assert.match(d, /hostIds: \[me\]/);
    assert.match(d, /await setMatchScorer\(created\.id, me\)/);
  });
  test('nudge: scheduled at the final result, cancelled when they score again, switchable off', () => {
    assert.match(src, /void scheduleNudge\(replayNudge\(/);
    assert.match(src, /void cancelNudge\(\)/);
    const n = read('src/core/notifications.ts');
    assert.match(n, /export async function scheduleNudge/);
    assert.match(n, /export async function cancelNudge/);
    assert.match(n, /url: `sportnnote:\/\/m\/\$\{n\.matchId\}`/, 'the tap opens the match');
    assert.match(read('src/screens/NotificationPrefsScreen.tsx'), /Nudge me to score my next game/);
  });
});
