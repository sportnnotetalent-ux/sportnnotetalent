/**
 * SD-51 (GEN-21 / CK-07) — each sport's `matchRecords(state)` hook: the record
 * candidates of ONE finished match, derived from its final state only (no
 * reducer change; an old log replays to the same records). Each plugin sets
 * its own (`plugin.matchRecords`, from `<sport>/records.ts` — perf F-15: so
 * a sport's lazily loaded chunk carries only its own hook); this module
 * collects them all (tests, and any code that wants every hook at once). The
 * record types and the shared set/game-sport helper live in matchRecords.ts.
 *
 * PURE (no React Native): node tests load it — note the `.ts` imports.
 * The results-engine sports and golf STROKE play have no hook (they keep
 * their own records); carrom and golf match play joined in SD-137a.
 */
import type { SportId } from '../core/types';
import type { MatchRecordsBlock } from './matchRecords.ts';
import { cricketMatchRecords } from './cricket/records.ts';
import { footballMatchRecords } from './football/records.ts';
import { hockeyMatchRecords } from './hockey/records.ts';
import { handballMatchRecords } from './handball/records.ts';
import { iceHockeyMatchRecords } from './ice_hockey/records.ts';
import { baseballMatchRecords } from './baseball/records.ts';
import { netballMatchRecords } from './netball/records.ts';
import { afMatchRecords } from './american_football/records.ts';
import { leagueMatchRecords } from './rugby_league/records.ts';
import { rugbyMatchRecords } from './rugby/records.ts';
import { basketballMatchRecords } from './basketball/records.ts';
import { kabaddiMatchRecords } from './kabaddi/records.ts';
import { chessMatchRecords } from './chess/records.ts';
import { carromMatchRecords } from './carrom/records.ts';
import { golfMatchRecords } from './golf/records.ts';
import { tennisMatchRecords } from './tennis/records.ts';
import { padelMatchRecords } from './padel/records.ts';
import { badmintonMatchRecords } from './badminton/records.ts';
import { volleyballMatchRecords } from './volleyball/records.ts';
import { rallyMatchRecords } from './rallyRecords.ts';
import { poolMatchRecords } from './pool/records.ts';
import { snookerMatchRecords } from './snooker/records.ts';
import { billiardsMatchRecords } from './billiards/records.ts';

export {
  cricketMatchRecords, footballMatchRecords, hockeyMatchRecords, handballMatchRecords, rugbyMatchRecords,
  basketballMatchRecords, kabaddiMatchRecords, chessMatchRecords, carromMatchRecords, golfMatchRecords,
  tennisMatchRecords, padelMatchRecords, badmintonMatchRecords, volleyballMatchRecords, rallyMatchRecords,
  poolMatchRecords, snookerMatchRecords, billiardsMatchRecords,
};

/** The hook per sport (the registry sets `plugin.matchRecords` from this). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MATCH_RECORD_HOOKS: Partial<Record<SportId, (state: any) => MatchRecordsBlock | null>> = {
  cricket: cricketMatchRecords,
  football: footballMatchRecords,
  hockey: hockeyMatchRecords,
  handball: handballMatchRecords,
  ice_hockey: iceHockeyMatchRecords,
  baseball: baseballMatchRecords,
  netball: netballMatchRecords,
  american_football: afMatchRecords,
  rugby: rugbyMatchRecords,
  rugby_league: leagueMatchRecords,
  basketball: basketballMatchRecords,
  kabaddi: kabaddiMatchRecords,
  chess: chessMatchRecords,
  tennis: tennisMatchRecords,
  padel: padelMatchRecords,
  badminton: badmintonMatchRecords,
  volleyball: volleyballMatchRecords,
  tabletennis: rallyMatchRecords,
  squash: rallyMatchRecords,
  pickleball: rallyMatchRecords,
  carrom: carromMatchRecords,
  pool: poolMatchRecords,
  snooker: snookerMatchRecords,
  billiards: billiardsMatchRecords,
  golf: golfMatchRecords,
};
