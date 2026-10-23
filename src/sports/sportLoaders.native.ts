/**
 * Perf F-15 — how the registry loads ONE sport's full plugin, PHONE APP build
 * (the web build uses sportLoaders.ts). Everything is in the one bundle, so a
 * sport is required synchronously — but only the first time it is used, not
 * at start-up: launching the app no longer evaluates all the sports' engines
 * and scorer screens.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SportId } from '../core/types';
import type { SportPlugin } from './types';

const REQUIRES: Record<SportId, () => SportPlugin<any>> = {
  football: () => require('./football').footballPlugin,
  cricket: () => require('./cricket').cricketPlugin,
  basketball: () => require('./basketball').basketballPlugin,
  badminton: () => require('./badminton').badmintonPlugin,
  tennis: () => require('./tennis').tennisPlugin,
  volleyball: () => require('./volleyball').volleyballPlugin,
  kabaddi: () => require('./kabaddi').kabaddiPlugin,
  pickleball: () => require('./pickleball').pickleballPlugin,
  padel: () => require('./padel').padelPlugin,
  squash: () => require('./squash').squashPlugin,
  tabletennis: () => require('./tabletennis').tableTennisPlugin,
  chess: () => require('./chess').chessPlugin,
  carrom: () => require('./carrom').carromPlugin,
  golf: () => require('./golf').golfPlugin,
  athletics: () => require('./athletics').athleticsPlugin,
  hockey: () => require('./hockey').hockeyPlugin,
  swimming: () => require('./swimming').swimmingPlugin,
  weightlifting: () => require('./weightlifting').weightliftingPlugin,
  shooting: () => require('./shooting').shootingPlugin,
  archery: () => require('./archery').archeryPlugin,
  rowing: () => require('./rowing').rowingPlugin,
  canoe: () => require('./canoe').canoePlugin,
  cycling: () => require('./cycling').cyclingPlugin,
  handball: () => require('./handball').handballPlugin,
  ice_hockey: () => require('./ice_hockey').iceHockeyPlugin,
  netball: () => require('./netball').netballPlugin,
  american_football: () => require('./american_football').americanFootballPlugin,
  rugby: () => require('./rugby').rugbyPlugin,
  rugby_league: () => require('./rugby_league').rugbyLeaguePlugin,
  baseball: () => require('./baseball').baseballPlugin,
};

/** This build loads a sport on demand SYNCHRONOUSLY (one bundle). */
export const LOADS_SYNC = true;

/** The plugin, synchronously (evaluated on first use). */
export function requireSport(id: SportId): SportPlugin<any> | null {
  return REQUIRES[id]();
}

/** Same, as a promise (the registry's async path; resolves at once here). */
export function importSport(id: SportId): Promise<SportPlugin<any>> {
  return Promise.resolve(REQUIRES[id]());
}
