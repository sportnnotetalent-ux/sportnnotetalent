/**
 * Squash plugin — archetype: set-game-point. Built on the shared rally engine,
 * supporting both scoring systems (defaults = modern PAR rules):
 *   • Scoring     — PAR / point-a-rally (every rally scores, default) or
 *                   English / hand-out (only the server scores; doubles tracks
 *                   server 1 & 2 with the hand-out sequence).
 *   • Points      — 11 (PAR default), 15, or 9 (classic English).
 *   • Win by      — 2 (default) or 1 (hard cap).
 *   • Match length— best of 5 (default) / best of 3 / single game.
 *   • Format      — singles (default) or doubles.
 *
 * Singles shares one enclosed court, so there's no symmetric court layout (like
 * cricket, it ships no positional formation).
 */
import { makeRallyPlugin, type RallyState } from '../rallyCore';
import { SQUASH_FORMAT_FIELDS, SQUASH_META } from './meta';

export type SquashState = RallyState;

export const squashPlugin = makeRallyPlugin({
  id: 'squash',
  name: SQUASH_META.name,
  icon: SQUASH_META.icon,
  sideOutValue: 'english',
  sideOutLabel: 'Hand-out',
  serveSystemLabel: 'English scoring',
  serveTag: 'English',
  defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 },
  hasCourt: false,
  firstServePicker: true,
  formatFields: SQUASH_FORMAT_FIELDS,
});
