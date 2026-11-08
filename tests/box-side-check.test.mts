/** racket-depth RD11 / tennis-hitter TH4: the box score checks the side, as careers do. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '../src/core/types.ts';
import { badmintonBox, type BoxContext } from '../src/sports/boxSources.ts';

const P = (id: string): Player => ({ id, fullName: id.toUpperCase() } as Player);
const ctx: BoxContext = { homeRoster: [P('h1'), P('h2')], awayRoster: [P('a1'), P('a2')] };
const state = (events: unknown[]) => ({ events, games: [], pointDetail: true } as never);
const rows = (src: ReturnType<typeof badmintonBox>) => src.data('all');
const ids = (r: { rows: { playerId?: string }[] }) => r.rows.map((x) => x.playerId).filter(Boolean).sort();

test('RD11: a hitter from the wrong side makes no row; the credit falls back to the point’s player', () => {
  const d = rows(badmintonBox(state([{ id: 1, kind: 'point', side: 'home', game: 1, playerId: 'h1', pd: { how: 'winner', by: 'a1' } }]), ctx));
  assert.deepEqual(ids(d.home), ['h1'], 'badminton lists only players with points (listRoster off)');
  assert.ok(!d.home.rows.some((r) => r.playerId === 'a1'), 'no phantom a1 row on the home side');
  assert.equal(d.home.rows.find((r) => r.playerId === 'h1')!.stats.winners, 1);
});

test('RD11: an error credited to someone not on the losing side makes no row', () => {
  const d = rows(badmintonBox(state([{ id: 1, kind: 'point', side: 'home', game: 1, playerId: 'h1', pd: { how: 'ue', err: { playerId: 'h2' } } }]), ctx));
  assert.ok(!d.away.rows.some((r) => r.playerId === 'h2'), 'no phantom h2 row on the away side');
});

test('RD11: a legitimate hitter and error still credit their player', () => {
  const d = rows(badmintonBox(state([
    { id: 1, kind: 'point', side: 'home', game: 1, playerId: 'h1', pd: { how: 'winner', by: 'h2' } },
    { id: 2, kind: 'point', side: 'home', game: 1, playerId: 'h1', pd: { how: 'ue', err: { playerId: 'a2' } } },
  ]), ctx));
  assert.equal(d.home.rows.find((r) => r.playerId === 'h2')!.stats.winners, 1);
  assert.equal(d.away.rows.find((r) => r.playerId === 'a2')!.stats.unforcedErrors, 1);
});
