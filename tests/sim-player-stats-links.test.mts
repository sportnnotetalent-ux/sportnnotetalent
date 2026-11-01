/**
 * Quality mandate step 6 for "Your stats from today's game"
 * (docs/security/breaks/player-stats-links.md): 1,000 random matches of
 * players with and without accounts, of every age (some unknown), with and
 * without numbers and guardians, some disputed. Every time: pushes go only to
 * players with an account, with stats, not the scorer, not disputed; WhatsApp
 * messages only to players without an account; a known minor is never sent to
 * their own number, only their guardian's; no message names another player.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statsPushes, statsWhatsApps } from '../src/core/playerStatsMessage.ts';
import type { Player, StatLine } from '../src/core/types.ts';

let seed = 127;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const NAMES = ['Ravi', 'Asha', 'Arjun', 'Meera', 'Kiran', 'Lakshmi', 'Imran', 'Sara'];

test('1,000 full-time stats rounds', () => {
  for (let i = 0; i < 1000; i++) {
    const n = 2 + rnd(12);
    const players: Player[] = Array.from({ length: n }, (_, k) => ({
      id: `p${k}`, fullName: `${NAMES[rnd(NAMES.length)]}${k} X`, sports: ['football'],
      ...(rnd(2) ? { profileId: `pr${k}` } : {}),
      ...(rnd(4) ? { age: 8 + rnd(40) } : {}),
      ...(rnd(3) ? { phone: `9${String(100000000 + k).padStart(9, '0')}` } : {}),
      ...(rnd(2) ? { guardian: { name: `G${k}`, phone: `8${String(100000000 + k).padStart(9, '0')}` } } : {}),
    }));
    const lines: StatLine[] = players.map((p) => ({ id: `l${p.id}`, matchId: 'm', playerId: p.id, sport: 'football', stats: rnd(3) ? { goals: rnd(3), assists: rnd(2) } : {} } as StatLine));
    const disputed = new Set(players.filter(() => rnd(8) === 0).map((p) => p.id));
    const me = players[rnd(n)].id;
    const m = { matchId: 'm', sport: 'football' as const, sportName: 'Football', home: 'H', away: 'A', homeScore: '1', awayScore: '0' };
    const has = (id: string) => { const s = lines.find((l) => l.playerId === id)!.stats; return (s.goals ?? 0) + (s.assists ?? 0) > 0; };
    for (const push of statsPushes(m, lines, players, { me, disputed })) {
      const p = players.find((x) => x.id === push.playerId)!;
      assert.ok(p.profileId && p.id !== me && !disputed.has(p.id) && has(p.id));
      for (const other of players) if (other.id !== p.id) assert.ok(!push.body.includes(other.fullName));
    }
    for (const w of statsWhatsApps(m, lines, players, { disputed, link: 'https://app.sportnnote.in/m/m' })) {
      const p = players.find((x) => x.id === w.playerId)!;
      assert.ok(!p.profileId && !disputed.has(p.id) && has(p.id));
      if (p.age !== undefined && p.age < 18) {
        assert.equal(w.phone, p.guardian?.phone, 'a minor: the guardian only');
        assert.notEqual(w.phone, p.phone);
      } else assert.equal(w.phone, p.phone);
      for (const other of players) if (other.id !== p.id) assert.ok(!w.text.includes(other.fullName.split(' ')[0] + ' '), 'names no one else');
      assert.ok(!/https?:\/\/(?!app\.sportnnote\.in)/.test(w.text), 'only SportnNote links');
    }
  }
});
