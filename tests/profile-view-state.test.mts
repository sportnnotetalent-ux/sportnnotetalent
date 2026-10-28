/**
 * The Profile tab said "Set up your profile" while the profile was still
 * loading, and when a read failed (founder, 2026-10-29, after linking a
 * profile by phone). It now says that only when the account really has no
 * player profile; loading shows "Loading…", a failed read says so with
 * "Try again".
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { profileViewState } from '../src/data/profileViewState.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('profileViewState', () => {
  test('"Set up" only when the account has no player profile', () => {
    assert.equal(profileViewState({ playerId: null, status: 'ready', hasPlayer: false, hasStats: false }), 'setup');
    assert.equal(profileViewState({ playerId: 'p1', status: 'ready', hasPlayer: false, hasStats: false }), 'missing');
  });
  test('still finding the account\'s player, or loading it: loading', () => {
    assert.equal(profileViewState({ playerId: undefined, status: 'ready', hasPlayer: false, hasStats: false }), 'loading');
    assert.equal(profileViewState({ playerId: 'p1', status: 'loading', hasPlayer: false, hasStats: false }), 'loading');
    assert.equal(profileViewState({ playerId: 'p1', status: 'ready', hasPlayer: true, hasStats: false }), 'loading');
  });
  test('a failed read says so (and data already shown stays)', () => {
    assert.equal(profileViewState({ playerId: 'p1', status: 'failed', hasPlayer: false, hasStats: false }), 'failed');
    assert.equal(profileViewState({ playerId: undefined, status: 'failed', hasPlayer: false, hasStats: false }), 'failed');
    assert.equal(profileViewState({ playerId: 'p1', status: 'failed', hasPlayer: true, hasStats: true }), 'show');
  });
  test('loaded: show', () => {
    assert.equal(profileViewState({ playerId: 'p1', status: 'ready', hasPlayer: true, hasStats: true }), 'show');
  });
});

describe('the wiring', () => {
  test('the profile hook reports failures instead of leaving the screen empty', () => {
    const src = read('src/data/hooks.ts');
    const hook = src.slice(src.indexOf('export function usePlayerProfile'), src.indexOf('export function useFootballProfile'));
    assert.match(hook, /\.catch\(/);
    assert.match(hook, /status/);
  });
  test('the Profile tab waits for its own player id, and reports a failed lookup', () => {
    const src = read('src/screens/ProfileScreen.tsx');
    assert.match(src, /useState<string \| null \| undefined>\(undefined\)/);
    assert.match(src, /\.catch\(/);
  });
  test('ProfileView decides with profileViewState', () => {
    const src = read('src/components/ProfileView.tsx');
    assert.match(src, /profileViewState\(/);
    assert.match(src, /Couldn’t load/);
  });
});
