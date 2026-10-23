/**
 * Table tennis plugin — archetype: set-game-point. Built on the shared rally
 * engine with rally scoring (every rally is a point) and the ITTF service order
 * (2 serves each, alternate every point from 10-10 — legacy 21: 5 each until 20-20; opening server alternates by
 * game — see ./serve.ts).
 *   • Games to 11, win by 2 (default) — or the legacy 21-point game.
 *   • Best of 5 (default) / 7 / 3.
 *   • Singles (default) or doubles.
 */
import { makeRallyPlugin, type RallyState } from '../rallyCore';
import { TABLETENNIS_FORMAT_FIELDS, TABLETENNIS_META } from './meta';

export type TableTennisState = RallyState;

export const tableTennisPlugin = makeRallyPlugin({
  id: 'tabletennis',
  name: TABLETENNIS_META.name,
  icon: TABLETENNIS_META.icon,
  // Table tennis has no serve-based scoring system; these labels are unused.
  sideOutValue: '__none__',
  sideOutLabel: 'Service',
  serveSystemLabel: 'Rally scoring',
  serveTag: 'rally',
  defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 },
  hasCourt: false,
  firstServePicker: true,
  serveRule: 'tt',
  formatFields: TABLETENNIS_FORMAT_FIELDS,
});
