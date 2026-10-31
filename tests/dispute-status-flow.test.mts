/**
 * AS-02 (docs/security/breaks/audit-security-2026-10-31.md) — a dispute's
 * status only moves the way the scoring screen offers:
 *   reported → open (accept) · reported → dismissed
 *   open → resolved · open → dismissed
 * Closed disputes (resolved / dismissed) stay closed. Before this, the live
 * app could reopen or re-resolve them and the server let a match manager make
 * any change. The app rule is src/core/disputeFlow.ts (demo and live share
 * it); the server rule is guard_dispute (migration 20261031150000).
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canMoveDispute } from '../src/core/disputeFlow.ts';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

const ALL = ['reported', 'open', 'resolved', 'dismissed'] as const;
const ALLOWED = new Set(['reported>open', 'reported>dismissed', 'open>resolved', 'open>dismissed']);

describe('the app rule', () => {
  test('exactly the four moves the screen offers', () => {
    for (const from of ALL) for (const to of ALL) {
      assert.equal(canMoveDispute(from, to), ALLOWED.has(`${from}>${to}`), `${from} → ${to}`);
    }
  });
});

describe('the server rule (guard_dispute)', () => {
  let db: TestDb;
  let manager: string;
  let matchId: string;
  let other: string;
  before(async () => {
    db = await bootDb();
    manager = await db.signUp({ name: 'Match Host', dob: '1985-01-01' });
    const [hp] = await db.as<{ id: string }>(manager, `insert into players (full_name, profile_id) values ('Match Host', $1) returning id`, [manager]);
    const [h] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('Lions', 'LIO', 'football') returning id`);
    const [a] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('Tigers', 'TIG', 'football') returning id`);
    [{ id: matchId }] = await db.sql<{ id: string }>(`insert into matches (sport, status, home_team_id, away_team_id, host_ids) values ('football', 'completed', $1, $2, $3) returning id`, [h.id, a.id, [hp.id]]);
    other = await db.signUp({ name: 'Someone Else', dob: '1985-01-01' });
    await db.as(other, `insert into players (full_name, profile_id) values ('Someone Else', $1)`, [other]);
  });
  const dispute = async (status: string) => (await db.sql<{ id: string }>(
    `insert into match_disputes (match_id, side, player_name, kind, status) values ($1, 'home', 'Ravi', 'report', $2) returning id`, [matchId, status]))[0].id;
  const move = (uid: string, id: string, to: string) => db.as(uid, `update match_disputes set status = $2 where id = $1`, [id, to]);
  const refused = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };

  test('a match manager can make each allowed move', async () => {
    for (const k of ALLOWED) {
      const [from, to] = k.split('>');
      const id = await dispute(from);
      await move(manager, id, to);
      const [r] = await db.sql<{ status: string }>(`select status from match_disputes where id = $1`, [id]);
      assert.equal(r.status, to, k);
    }
  });
  test('…and no other move: closed disputes stay closed, no skipping', async () => {
    for (const from of ALL) for (const to of ALL) {
      if (from === to || ALLOWED.has(`${from}>${to}`)) continue;
      const id = await dispute(from);
      assert.ok(await refused(() => move(manager, id, to)), `${from} → ${to} should be refused`);
    }
  });
  test('a manager can still edit a closed dispute without changing its status (history)', async () => {
    const id = await dispute('resolved');
    await db.as(manager, `update match_disputes set history = '[{"action":"note"}]' where id = $1`, [id]);
    const [r] = await db.sql<{ history: unknown[] }>(`select history from match_disputes where id = $1`, [id]);
    assert.equal(r.history.length, 1);
  });
  test('someone who does not manage the match still cannot change status (unchanged)', async () => {
    const id = await dispute('reported');
    assert.ok(await refused(() => move(other, id, 'open')) || (await db.sql<{ status: string }>(`select status from match_disputes where id = $1`, [id]))[0].status === 'reported');
  });
});

describe('the app (repos.ts) uses the rule in demo and live', () => {
  // repos.ts isn't loadable by the Node test runner; its wiring is checked on source.
  const src = readFileSync(join(import.meta.dirname, '..', 'src/data/repos.ts'), 'utf8');
  const body = (name: string) => src.slice(src.indexOf(`export async function ${name}(`), src.indexOf('\n}\n', src.indexOf(`export async function ${name}(`)));
  test('escalate and dismiss: guarded in demo, and the live update only matches allowed statuses', () => {
    for (const [fn, to] of [['escalateDispute', 'open'], ['dismissDispute', 'dismissed']]) {
      const b = body(fn);
      assert.match(b, new RegExp(`canMoveDispute\\(d\\.status, '${to}'\\)`), `${fn} demo`);
      assert.match(b, new RegExp(`\\.in\\('status', movesInto\\('${to}'\\)\\)`), `${fn} live`);
      assert.match(b, /if \(data\?\.length\) await appendDisputeHistory/, `${fn}: history only when it moved`);
    }
  });
  test('resolve: only an open dispute, in demo and live', () => {
    const b = body('resolveDispute');
    assert.equal((b.match(/canMoveDispute\(d\.status, 'resolved'\)/g) ?? []).length, 2);
  });
});
