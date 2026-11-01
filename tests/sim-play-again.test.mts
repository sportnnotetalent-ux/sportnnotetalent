/**
 * Quality mandate step 6 for Play again (docs/security/breaks/play-again.md):
 * 1,000 random finished matches (friendlies and tournament matches, formats
 * with internal, series and stream keys). A replay is offered only for a
 * friendly; it keeps the same sides, sport, rules and venue, and never carries
 * a result, an internal key, a series / aggregate key or the stream link.
 * The nudge always fires six days on, under its one id.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playAgainDraft } from '../src/data/matchHousekeeping.ts';
import { replayNudge, NUDGE_AFTER_MS } from '../src/core/nudge.ts';

let seed = 137;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const SPORTS = ['football', 'badminton', 'tennis', 'kabaddi', 'basketball'];
const PLAIN = ['preset', 'halfMinutes', 'pointsPerGame', 'gamesToWin', 'setsToWin', 'playersPerSide', 'timeUpRule'];
const BAD = ['__walkover', '__seriesLeg', '__tieHalf', 'aggregateLeg', 'aggPriorHome', 'aggPriorAway'];

test('1,000 replays', () => {
  for (let i = 0; i < 1000; i++) {
    const format: Record<string, unknown> = {};
    for (const k of PLAIN) if (rnd(2)) format[k] = rnd(30);
    for (const k of BAD) if (rnd(3) === 0) format[k] = rnd(5);
    const m = {
      sport: SPORTS[rnd(SPORTS.length)], homeTeam: { id: `h${i}` }, awayTeam: { id: `a${i}` },
      venueName: rnd(2) ? `Ground ${i}` : undefined, streamUrl: rnd(2) ? 'https://youtube.com/live/x' : undefined,
      format, ...(rnd(3) === 0 ? { tournamentId: `t${i}` } : {}), result: { kind: 'draw' }, winner: 'home',
    };
    const d = playAgainDraft(m as never);
    if ((m as { tournamentId?: string }).tournamentId) { assert.equal(d, null); continue; }
    assert.ok(d);
    assert.deepEqual([d.homeTeamId, d.awayTeamId, d.sport, d.venueName], [m.homeTeam.id, m.awayTeam.id, m.sport, m.venueName]);
    assert.equal(d.streamUrl, undefined);
    const keys = Object.keys(d.format ?? {});
    for (const k of BAD) assert.ok(!keys.includes(k), k);
    for (const k of PLAIN) if (k in format) assert.equal(d.format![k], format[k]);
    assert.ok(!('result' in d) && !('winner' in d));
    const n = replayNudge({ matchId: `m${i}`, home: 'H', away: 'A', now: i * 1000 });
    assert.equal(n.fireAt - i * 1000, NUDGE_AFTER_MS);
    assert.equal(n.id, 'nudge:replay');
  }
});
