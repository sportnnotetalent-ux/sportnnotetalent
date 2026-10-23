/**
 * Pickleball plugin — archetype: set-game-point. Built on the shared rally engine
 * so every rule is optional with a recreational-friendly default:
 *   • Scoring     — Rally (every rally is a point, rec default) or Side-out
 *                   (only the serving side scores; doubles tracks server 1 & 2).
 *                   Sanctioned play (USA Pickleball / PPA / APP) is side-out, so the
 *                   "Tournament" presets are side-out and tournaments default to it
 *                   (SD-06, founder D4). Matches keep the format they were stored with.
 *   • Server      — named by court position (USA Pickleball): one pre-serve "who
 *                   starts on the right" pick per team, then score parity.
 *   • Points      — 11 (default), 15 or 21 to win a game.
 *   • Win by      — 2 (default) or 1 (casual hard cap).
 *   • Match length— best of 1 / 3 / 5 games.
 *   • Format      — singles or doubles (default).
 */
import { makeRallyPlugin, type RallyState } from '../rallyCore';
import { PICKLEBALL_FORMAT_FIELDS, PICKLEBALL_META } from './meta';

export type PickleballState = RallyState;

export const pickleballPlugin = makeRallyPlugin({
  id: 'pickleball',
  name: PICKLEBALL_META.name,
  icon: PICKLEBALL_META.icon,
  sideOutValue: 'sideout',
  sideOutLabel: 'Side-out',
  serveSystemLabel: 'Side-out scoring',
  serveTag: 'side-out',
  defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 },
  hasCourt: true,
  courtPositions: true,
  // SD-115 — "Who serves first?" on the scoring screen too (no default).
  firstServePicker: true,
  formatFields: PICKLEBALL_FORMAT_FIELDS,
});
