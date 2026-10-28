/**
 * Perf F-15 — how the registry loads ONE sport's full plugin (engine, scorer
 * controls, match tabs). WEB build: each sport is its own on-demand chunk
 * (`import()`), fetched the first time that sport is scored or viewed, so the
 * first download carries none of them. The phone app uses
 * sportLoaders.native.ts (one bundle; a sport is evaluated on first use).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SportId } from '../core/types';
import type { SportPlugin } from './types';

const LOADERS: Record<SportId, () => Promise<SportPlugin<any>>> = {
  football: () => import('./football').then((m) => m.footballPlugin),
  cricket: () => import('./cricket').then((m) => m.cricketPlugin),
  basketball: () => import('./basketball').then((m) => m.basketballPlugin),
  badminton: () => import('./badminton').then((m) => m.badmintonPlugin),
  tennis: () => import('./tennis').then((m) => m.tennisPlugin),
  volleyball: () => import('./volleyball').then((m) => m.volleyballPlugin),
  kabaddi: () => import('./kabaddi').then((m) => m.kabaddiPlugin),
  pickleball: () => import('./pickleball').then((m) => m.pickleballPlugin),
  padel: () => import('./padel').then((m) => m.padelPlugin),
  squash: () => import('./squash').then((m) => m.squashPlugin),
  tabletennis: () => import('./tabletennis').then((m) => m.tableTennisPlugin),
  chess: () => import('./chess').then((m) => m.chessPlugin),
  carrom: () => import('./carrom').then((m) => m.carromPlugin),
  pool: () => import('./pool').then((m) => m.poolPlugin),
  snooker: () => import('./snooker').then((m) => m.snookerPlugin),
  billiards: () => import('./billiards').then((m) => m.billiardsPlugin),
  golf: () => import('./golf').then((m) => m.golfPlugin),
  athletics: () => import('./athletics').then((m) => m.athleticsPlugin),
  hockey: () => import('./hockey').then((m) => m.hockeyPlugin),
  swimming: () => import('./swimming').then((m) => m.swimmingPlugin),
  weightlifting: () => import('./weightlifting').then((m) => m.weightliftingPlugin),
  shooting: () => import('./shooting').then((m) => m.shootingPlugin),
  archery: () => import('./archery').then((m) => m.archeryPlugin),
  rowing: () => import('./rowing').then((m) => m.rowingPlugin),
  canoe: () => import('./canoe').then((m) => m.canoePlugin),
  cycling: () => import('./cycling').then((m) => m.cyclingPlugin),
  handball: () => import('./handball').then((m) => m.handballPlugin),
  ice_hockey: () => import('./ice_hockey').then((m) => m.iceHockeyPlugin),
  netball: () => import('./netball').then((m) => m.netballPlugin),
  american_football: () => import('./american_football').then((m) => m.americanFootballPlugin),
  rugby: () => import('./rugby').then((m) => m.rugbyPlugin),
  rugby_league: () => import('./rugby_league').then((m) => m.rugbyLeaguePlugin),
  baseball: () => import('./baseball').then((m) => m.baseballPlugin),
};

/** This build loads a sport on demand ASYNCHRONOUSLY (its own chunk). */
export const LOADS_SYNC = false;

/** The plugin, synchronously, when this build can (the phone app); the web
 *  build can't — it fetches the sport's chunk with `importSport`. */
export function requireSport(_id: SportId): SportPlugin<any> | null {
  return null;
}

/** Fetch and evaluate a sport's chunk. */
export function importSport(id: SportId): Promise<SportPlugin<any>> {
  return LOADERS[id]();
}
