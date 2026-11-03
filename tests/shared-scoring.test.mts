/**
 * Shared scoring (docs/security/breaks/shared-scoring.md): several listed
 * scorers record one match at once. The pure rules (src/core/sharedScoring.ts),
 * the lock status, the Info row, and the wiring through repos / outbox / the
 * live-match hook / the screen. The SQL is proven in db-shared-scoring.test.mts.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  baseKey, baseOf, parseRefusal, staleDisposition, outboxOnError, serverDecision, canSwitchShared,
  staleMessage, undoByLabel, undoNeedsConfirm, STALE_FRESH_MS,
} from '../src/core/sharedScoring.ts';
import { lockStatus, canWriteWith } from '../src/core/scoringLock.ts';
import { scoringRule } from '../src/sports/matchRules.ts';
import { isRejection } from '../src/data/eventLog.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const ev = (seq: number, o: { clientId?: string; id?: number } = {}) => ({ seq, type: 'pot', ...o });

describe('the base a tap carries', () => {
  test('the newest event\'s client id, else "id:" + its server id; empty log = ""', () => {
    assert.equal(baseOf([]), '');
    assert.equal(baseOf([ev(1, { clientId: 'a', id: 4 }), ev(2, { id: 7 })]), 'id:7');
    assert.equal(baseOf([ev(2, { clientId: 'b', id: 9 }), ev(1, { clientId: 'a' })]), 'b');
    assert.equal(baseKey(ev(3, { clientId: 'c', id: 3 })), 'c');
    assert.equal(baseKey(ev(3)), '');
  });
  test('on a seq tie the later row is the newest (as Undo picks it)', () => {
    assert.equal(baseOf([ev(5, { clientId: 'mine' }), ev(5, { id: 12 })]), 'id:12');
  });
});

describe('S1/S2/S4/S6/S12/S17 — what the server decides (mirrors append_match_event)', () => {
  const d = (o: Partial<Parameters<typeof serverDecision>[0]>) =>
    serverDecision({ shared: true, inPlay: true, base: 'n', newestKey: 'n', isRetry: false, ...o });
  test('shared: the base must be the newest event', () => {
    assert.equal(d({}), 'accept');
    assert.equal(d({ base: 'old' }), 'stale');
    assert.equal(d({ base: '', newestKey: '' }), 'accept');
    assert.equal(d({ base: '', newestKey: 'n' }), 'stale');
  });
  test('shared: an old app (no base) is refused with "update the app"', () => {
    assert.equal(d({ base: null }), 'update_app');
  });
  test('a late retry of a step that was undone meanwhile is stale (it never comes back)', () => {
    assert.equal(d({ undone: true }), 'stale');
    assert.equal(d({ undone: true, shared: false }), 'accept'); // one at a time: as today
  });
  test('a retry of a tap that already landed is accepted (idempotent), never stale', () => {
    assert.equal(d({ base: 'old', isRetry: true }), 'accept');
    assert.equal(d({ base: null, isRetry: true }), 'accept');
  });
  test('one at a time (or a finished match): the base is ignored, exactly as today', () => {
    assert.equal(d({ shared: false, base: 'old' }), 'accept');
    assert.equal(d({ shared: false, base: null }), 'accept');
    assert.equal(d({ inPlay: false, base: 'old' }), 'accept');
  });
});

describe('S10/S11 — refusals', () => {
  test('parseRefusal tells stale, update-the-app and the lock apart', () => {
    assert.deepEqual(parseRefusal('stale_tap:11111111-2222-3333-4444-555555555555'), { kind: 'stale', by: '11111111-2222-3333-4444-555555555555' });
    assert.deepEqual(parseRefusal('stale_tap:'), { kind: 'stale', by: null });
    assert.deepEqual(parseRefusal('update_app_shared_scoring'), { kind: 'update_app' });
    assert.deepEqual(parseRefusal('not_active_scorer'), { kind: 'lock' });
    assert.equal(parseRefusal('Failed to fetch'), null);
    assert.equal(parseRefusal(undefined), null);
  });
  test('isRejection (never retried) covers the lock, stale taps and old apps', () => {
    assert.ok(isRejection('not_active_scorer'));
    assert.ok(isRejection('stale_tap:abc'));
    assert.ok(isRejection('update_app_shared_scoring'));
    assert.ok(!isRejection('network down'));
  });
  test('fresh live taps are dropped at once; anything older (made offline) goes to review', () => {
    const now = 1_000_000;
    assert.equal(staleDisposition([{ madeAt: now - 300 }], now), 'drop');
    assert.equal(staleDisposition([{ madeAt: now - 300 }, { madeAt: now - 100 }], now), 'drop');
    assert.equal(staleDisposition([{ madeAt: now - STALE_FRESH_MS - 1 }], now), 'review');
    assert.equal(staleDisposition([{ madeAt: now - 300 }, { madeAt: now - 60_000 }], now), 'review');
    assert.equal(staleDisposition([{}], now), 'review'); // unknown age: never silently dropped
    assert.equal(staleDisposition([{ madeAt: now - 300, waited: true }], now), 'review'); // made offline / a send failed
  });
  test('outboxOnError: stale → drop the whole (chained) queue or review it; lock → review; else retry', () => {
    const now = 5_000_000;
    const q = [{ madeAt: now - 10 }, { madeAt: now - 5 }];
    assert.deepEqual(outboxOnError('stale_tap:p2', q, now), { action: 'drop', by: 'p2' });
    assert.deepEqual(outboxOnError('stale_tap:p2', [{ madeAt: now - 99_000 }], now), { action: 'review', by: 'p2', reason: 'stale' });
    assert.deepEqual(outboxOnError('update_app_shared_scoring', q, now), { action: 'review', by: null, reason: 'update_app' });
    assert.deepEqual(outboxOnError('not_active_scorer', q, now), { action: 'review', by: null, reason: 'lock' });
    assert.deepEqual(outboxOnError('timeout', q, now), { action: 'retry' });
  });
});

describe('S8 — who may switch shared scoring', () => {
  test('friendly: any listed scorer or host; tournament: hosts / organisers only', () => {
    assert.equal(canSwitchShared({ tournamentId: undefined, isListedScorer: true, isHost: false }), true);
    assert.equal(canSwitchShared({ tournamentId: undefined, isListedScorer: false, isHost: true }), true);
    assert.equal(canSwitchShared({ tournamentId: undefined, isListedScorer: false, isHost: false }), false);
    assert.equal(canSwitchShared({ tournamentId: 't1', isListedScorer: true, isHost: false }), false);
    assert.equal(canSwitchShared({ tournamentId: 't1', isListedScorer: false, isHost: true }), true);
  });
});

describe('S13/S14 — the lock in shared mode', () => {
  test('shared → every allowed device may write, whoever the old holder was', () => {
    assert.equal(lockStatus({ supported: true, shared: true, holderId: 'p2', device: 'd2' }, 'p1', 'd1'), 'shared');
    assert.equal(lockStatus({ supported: true, shared: true }, 'p1', 'd1'), 'shared');
    assert.equal(canWriteWith('shared'), true);
  });
  test('not shared → exactly as before', () => {
    assert.equal(lockStatus({ supported: true, shared: false, holderId: 'p2', device: 'd2' }, 'p1', 'd1'), 'other');
    assert.equal(lockStatus({ supported: true, holderId: null }, 'p1', 'd1'), 'free');
  });
});

describe('S3 / Undo and messages', () => {
  test('the stale message names who recorded the newer step when known', () => {
    assert.equal(staleMessage('Ashok'), 'Ashok just recorded a step — your tap wasn’t added');
    assert.equal(staleMessage(null), 'Someone else just recorded a step — your tap wasn’t added');
  });
  test('Undo names who recorded the step in shared mode; another person\'s step asks first', () => {
    assert.equal(undoByLabel({ shared: true, by: 'p2', me: 'p1', nameOf: () => 'Ashok' }), ' · recorded by Ashok');
    assert.equal(undoByLabel({ shared: true, by: 'p1', me: 'p1', nameOf: () => 'Me' }), ' · recorded by you');
    assert.equal(undoByLabel({ shared: false, by: 'p2', me: 'p1', nameOf: () => 'Ashok' }), '');
    assert.equal(undoByLabel({ shared: true, by: null, me: 'p1', nameOf: () => 'x' }), '');
    assert.equal(undoNeedsConfirm({ shared: true, by: 'p2', me: 'p1' }), true);
    assert.equal(undoNeedsConfirm({ shared: true, by: 'p1', me: 'p1' }), false);
    assert.equal(undoNeedsConfirm({ shared: false, by: 'p2', me: 'p1' }), false);
    assert.equal(undoNeedsConfirm({ shared: true, by: null, me: 'p1' }), false);
  });
});

describe('S20 — Info says how the match is scored', () => {
  test('a rule line "Scoring"', () => {
    assert.deepEqual(scoringRule(true), { key: '__scoring', label: 'Scoring', value: 'Shared — several phones at once' });
    assert.deepEqual(scoringRule(false), { key: '__scoring', label: 'Scoring', value: 'One phone at a time' });
  });
});

describe('wiring', () => {
  test('repos: taps and undo send their base (falling back to the old signature on an old database); the switch is an RPC', () => {
    const src = read('src/data/repos.ts');
    assert.match(src, /p_base: rec\.base \?\? ''/);
    assert.match(src, /rpc\('pop_match_event', \{ p_match: matchId, p_device: [^}]*p_base/);
    assert.match(src, /rpc\('set_shared_scoring'/);
    assert.match(src, /shared_scoring/);
    assert.match(src, /recorded_by/);
  });
  test('outbox: refusals go through outboxOnError — stale live taps dropped with a notice, the rest to review', () => {
    const src = read('src/data/matchOutbox.ts');
    assert.match(src, /outboxOnError\(/);
    assert.match(src, /onStale/);
    assert.match(src, /waited: true/);
  });
  test('hook: each tap records its base and time; stale drops reverse stats and rebuild', () => {
    const src = read('src/data/useLiveMatch.ts');
    assert.match(src, /base: baseOf\(rawRef\.current\)/);
    assert.match(src, /madeAt: Date\.now\(\)/);
    assert.match(src, /matchOutbox\.onStale\(/);
    assert.match(src, /staleBy/);
    assert.match(src, /popMatchEvent\(matchId, baseOf\(/);
  });
  test('screen: no Hand over in shared mode; the switch; Undo names and confirms; Info row', () => {
    const src = read('src/screens/LiveScoringScreen.tsx');
    assert.match(src, /setSharedScoring\(/);
    assert.match(src, /canSwitchShared\(/);
    assert.match(src, /lockStat !== 'shared' && \(canManage \|\| lockStat === 'mine'\)/);
    assert.match(src, /undoNeedsConfirm\(/);
    assert.match(src, /undoByLabel\(/);
    assert.match(src, /scoringRule\(/);
    assert.match(src, /staleMessage\(/);
  });
});

describe('every append path sends a base (nothing legitimate refused in a shared match)', () => {
  const walk = (d: string, out: string[] = []) => {
    for (const f of readdirSync(join(import.meta.dirname, '..', d))) {
      const p = `${d}/${f}`;
      if (statSync(join(import.meta.dirname, '..', p)).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(f)) out.push(p);
    }
    return out;
  };
  test('source scan: every appendMatchEvent / outbox enqueue call carries a base', () => {
    const calls: string[] = [];
    for (const f of walk('src')) {
      const src = read(f);
      for (const m of src.matchAll(/(?<!function )(appendMatchEvent|matchOutbox\.enqueue)\(([^;]*)\);/g)) {
        calls.push(f);
        const arg = m[2];
        const near = src.slice(Math.max(0, m.index! - 1500), m.index!);
        // the call names its base, or passes a record built just above with one
        // (the outbox sends the records the hook stamped)
        const ok = /\bbase\b/.test(arg) || (/^\s*[\w.]+,\s*(rec|setWhite)\s*$/.test(arg) && /\bbase\b/.test(near)) || (f.endsWith('matchOutbox.ts') && arg.trim() === 'matchId, rec');
        assert.ok(ok, `${f}: ${m[0].slice(0, 120)}`);
      }
    }
    for (const f of ['src/data/matchOutbox.ts', 'src/data/useLiveMatch.ts', 'src/data/chessRoundResults.ts', 'src/data/amendments.ts', 'src/data/teamTieDemoSeed.ts', 'src/data/guestClaim.ts']) {
      assert.ok(calls.includes(f), `no append call found in ${f}`);
    }
  });
  test('live taps, FORMAT changes and voice go through dispatch, which stamps the base', () => {
    assert.match(read('src/data/useLiveMatch.ts'), /base: baseOf\(rawRef\.current\),\n\s*madeAt: Date\.now\(\)/);
    assert.match(read('src/screens/LiveScoringScreen.tsx'), /dispatch\(\{ type: FORMAT_TYPE/);
  });
  test('live correction (AMEND through the outbox) is stamped', () => {
    assert.match(read('src/data/useLiveMatch.ts'), /matchOutbox\.enqueue\(matchId, \{ \.\.\.plan\.record, [^}]*base: baseOf\(rawRef\.current\)/);
  });
  test('post-match correction (publishAmendment) asks the server for the newest key', () => {
    assert.match(read('src/data/amendments.ts'), /appendMatchEvent\(matchId, \{ \.\.\.plan\.record, base: await newestEventKey\(matchId\) \}\)/);
  });
  test('chess round results chain SET_WHITE then RESULT on the log they read', () => {
    const src = read('src/data/chessRoundResults.ts');
    assert.match(src, /let base = baseOf\(log\);/);
    assert.match(src, /base = setWhite\.clientId;/);
    assert.match(src, /clientId: newId\(\), base,/);
  });
  test('guest claim upload and the team-tie demo seed use the newest key', () => {
    assert.match(read('src/data/guestClaim.ts'), /appendMatchEvent\(id, \{ \.\.\.e, base: await newestEventKey\(id\) \}\)/);
    assert.match(read('src/data/teamTieDemoSeed.ts'), /appendMatchEvent\(matchId, \{ \.\.\.e, base: await newestEventKey\(matchId\) \}\)/);
  });
  test('newestEventKey reads the newest row (seq, then id) and keys it like baseOf', () => {
    const src = read('src/data/repos.ts');
    assert.match(src, /export async function newestEventKey\(matchId: string\): Promise<string>/);
    assert.match(src, /\.order\('seq', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)\.limit\(1\)/);
  });
});
