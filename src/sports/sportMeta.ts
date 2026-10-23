/**
 * Perf F-15 — the LIGHT half of the sport registry: what every list, picker
 * and format form needs about every sport (id, name, icon, archetype, who
 * competes, format options, result terms), with none of the scoring engines
 * or scorer UI. It is in the first download; a sport's full plugin (engine,
 * controls, match tabs) loads on demand through registry.ts — only for the
 * sport being scored or viewed.
 *
 * Each sport keeps its meta next to its plugin (`<sport>/meta.ts`), and the
 * plugin spreads it, so the two can't drift apart.
 */
import type { SportId } from '../core/types';
import type { SportMeta } from './types';
import { regionStore } from '../core/region';
import { marketForCountry, sportDisplayName } from '../core/markets';
import { FOOTBALL_META } from './football/meta';
import { CRICKET_META } from './cricket/meta';
import { BASKETBALL_META } from './basketball/meta';
import { BADMINTON_META } from './badminton/meta';
import { TENNIS_META } from './tennis/meta';
import { VOLLEYBALL_META } from './volleyball/meta';
import { KABADDI_META } from './kabaddi/meta';
import { PICKLEBALL_META } from './pickleball/meta';
import { PADEL_META } from './padel/meta';
import { SQUASH_META } from './squash/meta';
import { TABLETENNIS_META } from './tabletennis/meta';
import { CHESS_META } from './chess/meta';
import { CARROM_META } from './carrom/meta';
import { GOLF_META } from './golf/meta';
import { ATHLETICS_META } from './athletics/meta';
import { HOCKEY_META } from './hockey/meta';
import { SWIMMING_META } from './swimming/meta';
import { WEIGHTLIFTING_META } from './weightlifting/meta';
import { SHOOTING_META } from './shooting/meta';
import { ARCHERY_META } from './archery/meta';
import { ROWING_META } from './rowing/meta';
import { CANOE_META } from './canoe/meta';
import { CYCLING_META } from './cycling/meta';
import { HANDBALL_META } from './handball/meta';
import { ICE_HOCKEY_META } from './ice_hockey/meta';
import { NETBALL_META } from './netball/meta';
import { AMERICAN_FOOTBALL_META } from './american_football/meta';
import { RUGBY_META } from './rugby/meta';
import { RUGBY_LEAGUE_META } from './rugby_league/meta';
import { BASEBALL_META } from './baseball/meta';

export type { SportMeta } from './types';

/** SD-153: display names by the viewer's market — "Soccer" and "Field hockey"
 *  in the US (where football / hockey mean American football / ice hockey).
 *  Ids never change; only `name` is read through the viewer's region. */
export const MARKET_NAMED_SPORTS: SportId[] = ['football', 'hockey', 'rugby', 'ice_hockey', 'american_football'];

/** Give `o.name` the market getter (SD-153); `standard` is the sport's own name. */
export function withMarketName<T extends { name: string }>(id: SportId, o: T, standard: string): T {
  Object.defineProperty(o, 'name', {
    get: () => sportDisplayName(id, standard, marketForCountry(regionStore.get().country)),
    enumerable: true, configurable: true,
  });
  return o;
}

// The registry's order — it is the order every sport picker lists them in.
const BASE: Record<SportId, SportMeta> = {
  football: FOOTBALL_META,
  cricket: CRICKET_META,
  basketball: BASKETBALL_META,
  badminton: BADMINTON_META,
  tennis: TENNIS_META,
  volleyball: VOLLEYBALL_META,
  kabaddi: KABADDI_META,
  pickleball: PICKLEBALL_META,
  padel: PADEL_META,
  squash: SQUASH_META,
  tabletennis: TABLETENNIS_META,
  chess: CHESS_META,
  carrom: CARROM_META,
  golf: GOLF_META,
  athletics: ATHLETICS_META,
  hockey: HOCKEY_META,
  swimming: SWIMMING_META,
  weightlifting: WEIGHTLIFTING_META,
  shooting: SHOOTING_META,
  archery: ARCHERY_META,
  rowing: ROWING_META,
  canoe: CANOE_META,
  cycling: CYCLING_META,
  handball: HANDBALL_META,
  ice_hockey: ICE_HOCKEY_META,
  netball: NETBALL_META,
  american_football: AMERICAN_FOOTBALL_META,
  rugby: RUGBY_META,
  rugby_league: RUGBY_LEAGUE_META,
  baseball: BASEBALL_META,
};

/** Every sport's meta, by id (copies: the per-sport objects stay plain, so a
 *  plugin that spreads one gets the standard name — the registry gives the
 *  loaded plugin the same market getter). */
export const SPORT_META: Record<SportId, SportMeta> = Object.fromEntries(
  (Object.keys(BASE) as SportId[]).map((id) => {
    const m: SportMeta = { ...BASE[id] };
    return [id, MARKET_NAMED_SPORTS.includes(id) ? withMarketName(id, m, BASE[id].name) : m];
  }),
) as Record<SportId, SportMeta>;

/** Every sport, in picker order (was the registry's SPORT_LIST). */
export const SPORT_LIST: SportMeta[] = Object.values(SPORT_META);

/** A sport's light meta (name, icon, format options…); undefined for an id the
 *  app doesn't know (a sport since removed), as the registry always returned. */
export function getSportMeta(id: SportId): SportMeta {
  return SPORT_META[id];
}

/** How the two sides of a match are picked, resolved for a concrete format.
 *  'team' = pick two teams; 'individual' = pick two people; 'pairs' = pick two
 *  pairs (doubles). A 'both' sport is decided by its `playersPerSide` value. */
export type ParticipantMode = 'team' | 'individual' | 'pairs';
export function participantMode(sport: SportId, format?: Record<string, unknown>): ParticipantMode {
  const kind = SPORT_META[sport].participantKind ?? 'team';
  if (kind === 'team') return 'team';
  if (kind === 'individual') return 'individual';
  // 'both' → Singles (1 player a side) is individual, Doubles (2) is a pair.
  return Number(format?.playersPerSide ?? 1) >= 2 ? 'pairs' : 'individual';
}
