/**
 * What a profile screen shows (founder report 2026-10-29: the Profile tab said
 * "Set up your profile" while it was loading, and when a read failed). PURE.
 *
 *   playerId  undefined = still finding the account's player; null = it has none
 *   status    the profile read: 'loading' | 'ready' | 'failed'
 *
 * 'setup' only when the account really has no player profile; 'missing' when a
 * player id was given but no profile came back (someone else's, or removed).
 * Data already on screen stays when a later refresh fails.
 */
export type ProfileLoadStatus = 'loading' | 'ready' | 'failed';
export type ProfileViewState = 'loading' | 'failed' | 'setup' | 'missing' | 'show';

export function profileViewState(s: {
  playerId: string | null | undefined;
  status: ProfileLoadStatus;
  hasPlayer: boolean;
  hasStats: boolean;
}): ProfileViewState {
  if (s.hasPlayer && s.hasStats) return 'show';
  if (s.status === 'failed') return 'failed';
  if (s.playerId === undefined || s.status === 'loading') return 'loading';
  if (s.playerId === null) return 'setup';
  return s.hasPlayer ? 'loading' : 'missing';
}
