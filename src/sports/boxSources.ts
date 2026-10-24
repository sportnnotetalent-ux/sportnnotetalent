/**
 * SD-23 — each sport's box score SOURCE: one match's per-player figures (and
 * the team figures for the comparison panel) for a period scope, from that
 * match's own live log. PURE (no React Native): the shared <BoxScore> renders
 * it on the live Score / Stats views and on the Summary tab, and the node
 * tests compare it with the bespoke tables it replaced.
 *
 * The per-player values are the same tallies the old components showed
 * (tests/box-score.test.mts holds them equal on fixtures): basketball's
 * play-by-play tally + SD-29 MIN / +/-, volleyball's and kabaddi's engine
 * `tally`, the racket point tallies. Football's per-player table is new
 * (FB-09): goals, assists, shots / on target, saves, fouls and cards from the
 * log, minutes from the SD-29 field tracker, goals conceded for keepers.
 */
import type { Player, SportId } from '../core/types';
import type { LiveEvent } from './liveEvents';
import type { BoxRowInput, BoxScope, BoxSideInput, MatchBoxSource } from './boxScore.ts';
import { periodLabel, teamFoulsByPeriod, type BasketballState } from './basketball/engine.ts';
import type { BBEvent } from './basketball/events.ts';
import { eventCredits } from './basketball/credits.ts';
import { shotsTracked } from './basketball/totals.ts';
import { boxField } from './basketball/fieldTime.ts';
import { bbDeepRows, type BbKeyOf } from './basketball/deep.ts';
import { hasPlayer } from './basketball/names.ts';
import { tally as volleyballTally, vbCreditKeyer, type VolleyballState } from './volleyball/engine.ts';
import { detailTally as vbDetailTally, detailTracked as vbDetailTracked } from './volleyball/detail.ts';
import { tally as kabaddiTally, isShootoutEvent, type KabaddiState } from './kabaddi/engine.ts';
import { kabaddiMatchCentre, KABADDI_COUNT_KEYS } from './kabaddi/totals.ts';
import { footballStats, kickText, type FootballState, type TrackConfig } from './football/engine.ts';
import { footballFieldLog, liveClockMinutes } from './football/fieldTime.ts';
import { keeperTotals, position } from './football/keepers.ts';
import { footballPossession } from './football/depth.ts';
import { trackField } from './onField.ts';
import type { RallyState } from './rallyEngine.ts';
import type { TennisState } from './tennis/engine.ts';
import type { PadelState } from './padel/engine.ts';
import type { BadmintonState } from './badminton/engine.ts';
import { creditedPoints as carromCredited, type CarromState } from './carrom/engine.ts';
import { hockeyBox } from './hockey/box.ts';
import { DETAIL_BOX_KEYS, detailCoverage, detailPlayerCredits, detailTracked, type DetailSport } from './pointDetail.ts';
import type { HockeyState } from './hockey/engine.ts';
import { handballBox } from './handball/box.ts';
import type { HandballState } from './handball/engine.ts';
import { iceHockeyBox } from './ice_hockey/box.ts';
import { baseballBox } from './baseball/box.ts';
import type { BaseballState } from './baseball/engine.ts';
import type { IceHockeyState } from './ice_hockey/engine.ts';
import { netballBox } from './netball/box.ts';
import type { NetballState } from './netball/engine.ts';
import { afBox } from './american_football/box.ts';
import type { AFState } from './american_football/engine.ts';
import { rugbyBox } from './rugby/box.ts';
import type { RugbyState } from './rugby/engine.ts';
import { leagueBox } from './rugby_league/box.ts';
import type { LeagueState } from './rugby_league/engine.ts';
import { withRosters, type NameOf } from './racketNames.ts';

type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export interface BoxContext {
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** the clock for live figures (football minutes / possession) */
  now?: number;
  /** team names, for footnotes (basketball team fouls) */
  homeName?: string;
  awayName?: string;
  /** IDs-only scoring (docs/privacy/ids-only-scoring.md): a player's name for
   *  this viewer by id. Used by the racket and volleyball boxes (their logs
   *  keep ids); absent → the stored legacy name / the roster name. */
  nameOf?: NameOf;
}

const rosterOf = (ctx: BoxContext, side: Side): Player[] => (side === 'home' ? ctx.homeRoster : ctx.awayRoster) ?? [];
const idIn = (name: string, roster: Player[]) => roster.find((p) => p.fullName === name)?.id;
const withId = (row: BoxRowInput, roster: Player[]): BoxRowInput => {
  const id = row.playerId ?? idIn(row.name, roster);
  return id ? { ...row, playerId: id } : row;
};
/** SD-56: a row with the player's shirt number (from the squad), when known. */
const numberedRow = (row: BoxRowInput, roster: Player[]): BoxRowInput => {
  const n = row.playerId ? roster.find((p) => p.id === row.playerId)?.jerseyNo : undefined;
  return n != null && Number.isFinite(n) ? { ...row, number: n } : row;
};
const numbered = (n: number, word: string) => Array.from({ length: n }, (_, i) => ({ value: i + 1, label: `${word} ${i + 1}` }));

/* -------------------------------- basketball -------------------------------- */

export interface BasketballLine {
  /** the row's key: the player id, or "~Name" for an older log's player no
   *  id is known for */
  key: string;
  /** the player's id, when known */
  playerId?: string;
  /** the names an older log / the squad knew this player by (the squad's
   *  first) — legacy lookups only: the minutes of a log that kept names */
  names: string[];
  pts: number; reb: number; ast: number; stl: number; blk: number; to: number; pf: number;
  ftm: number; fta: number;
  /** SD-40: field goals / threes made, attempts (tracked games), misses, OREB / DREB */
  fgm: number; fga: number; tpm: number; tpa: number; fgx: number; oreb: number; dreb: number;
}

const blankLine = (key: string, playerId?: string): BasketballLine =>
  ({ key, ...(playerId ? { playerId } : {}), names: [], pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, ftm: 0, fta: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, fgx: 0, oreb: 0, dreb: 0 });

/** IDs-only scoring: a basketball player's box key — the id (a play's
 *  `pid`; an older log's name through its `ids` map, else matched to the
 *  squad by name), else "~Name". */
export const basketballKeyer = (s: Pick<BasketballState, 'ids'>, roster: Player[]): BbKeyOf => (pid, name) => {
  if (pid) return pid;
  if (!name) return undefined;
  return s.ids?.[name] ?? idIn(name, roster) ?? `~${name}`;
};

/** A side's players from the play-by-play (every roster player listed, as the
 *  old table did), keyed by player id; `scope` = one period. Sorted by points. */
export function basketballTally(s: BasketballState, side: Side, roster: Player[], scope: BoxScope = 'all', tracked?: boolean, keyOf: BbKeyOf = basketballKeyer(s, roster)): BasketballLine[] {
  const halfCourt = s.targetPoints > 0;
  const byKey = new Map<string, BasketballLine>();
  const ensure = (key: string, name?: string) => {
    let l = byKey.get(key);
    if (!l) byKey.set(key, (l = blankLine(key, key.startsWith('~') ? undefined : key)));
    if (name && !l.names.includes(name)) l.names.push(name);
    return l;
  };
  roster.forEach((p) => ensure(p.id, p.fullName));
  for (const e of s.events) {
    if (e.side !== side || !hasPlayer(e)) continue;
    if (scope !== 'all' && e.quarter !== scope) continue;
    const key = keyOf(e.pid, e.playerName);
    if (key) add(ensure(key, e.playerName), e, halfCourt, tracked);
  }
  return [...byKey.values()].sort((a, b) => b.pts - a.pts);
}

/** One play onto a line — the same credits the controls send (credits.ts). */
function add(l: BasketballLine, e: BBEvent, halfCourt = false, tracked?: boolean) {
  const c = eventCredits(e, halfCourt, tracked);
  l.pts += c.points ?? 0; // field goals + made free throws
  l.ftm += c.freeThrowsMade ?? 0; l.fta += c.freeThrowsAtt ?? 0;
  l.fgm += c.fgMade ?? 0; l.fga += c.fgAtt ?? 0; l.tpm += c.threesMade ?? 0; l.tpa += c.threesAtt ?? 0; l.fgx += c.fgMissed ?? 0;
  l.reb += c.rebounds ?? 0; l.oreb += c.oreb ?? 0; l.dreb += c.dreb ?? 0;
  l.ast += c.assists ?? 0; l.stl += c.steals ?? 0; l.blk += c.blocks ?? 0; l.to += c.turnovers ?? 0; l.pf += c.fouls ?? 0;
}

/** The line's box keys. D8: FGA / 3PA only when the match tracked missed
 *  shots, OREB / DREB only once a rebound was typed — else those columns hide. */
const bbStats = (l: BasketballLine, cov: { shots: boolean; split: boolean }): Record<string, number> => ({
  points: l.pts, rebounds: l.reb, assists: l.ast, steals: l.stl, blocks: l.blk, turnovers: l.to, fouls: l.pf,
  freeThrowsMade: l.ftm, freeThrowsAtt: l.fta, fgMade: l.fgm, threesMade: l.tpm, fgMissed: l.fgx,
  ...(cov.shots ? { fgAtt: l.fga, threesAtt: l.tpa } : null),
  ...(cov.split ? { oreb: l.oreb, dreb: l.dreb } : null),
});

/** IDs-only scoring: rows keyed by player id; names are the viewer's
 *  (`ctx.nameOf`; without one the squad's), an older log's stored name only
 *  the fallback for a player outside the squad. */
export function basketballBox(s: BasketballState, ctx: BoxContext = {}): MatchBoxSource {
  const periods = Array.from({ length: Math.max(1, s.quarter) }, (_, i) => ({ value: i + 1, label: periodLabel(i + 1, s.regPeriods) }));
  const halfCourt = s.targetPoints > 0;
  const cov = { shots: shotsTracked(s), split: s.events.some((e) => e.type === 'rebound' && !!e.reboundType) };
  return {
    periods,
    emptyText: 'No players.',
    untrackedHint: cov.shots ? undefined : 'needs "Track missed shots" on',
    // SD-40: FIBA's team-fouls line, per period (full-court games only)
    notes: () => {
      if (halfCourt || !s.events.some((e) => e.type === 'foul')) return [];
      const h = teamFoulsByPeriod(s, 'home'), a = teamFoulsByPeriod(s, 'away');
      const who = ctx.homeName && ctx.awayName ? ` (${ctx.homeName}–${ctx.awayName})` : '';
      return [`Team fouls${who}: ${h.map((n, i) => `${periodLabel(i + 1, s.regPeriods)} ${n}–${a[i] ?? 0}`).join(' · ')}`];
    },
    data: (scope) => {
      // SD-29 MIN / +/- / on court: whole-game figures, the Overall view only
      // (keyed by id; an older log's player it couldn't resolve, by name).
      const field = scope === 'all' ? boxField(s) : undefined;
      const fieldOf = (l: BasketballLine) =>
        (l.playerId ? field?.get(l.playerId) : undefined) ?? l.names.map((n) => field?.get(`name:${n}`)).find(Boolean);
      const side = (sd: Side): BoxSideInput => {
        const roster = rosterOf(ctx, sd);
        const keyOf = basketballKeyer(s, roster);
        const nm = withRosters(ctx.nameOf, roster);
        // Deep wave: 2PM-A, fouls drawn… (each only when the match tracked it)
        const deep = bbDeepRows(s, scope, keyOf);
        const rows = basketballTally(s, sd, roster, scope, cov.shots, keyOf).map((l) => {
          const f = fieldOf(l);
          const stats = { ...bbStats(l, cov), ...deep.zero, ...deep[sd].rows.get(l.key) };
          if (f?.min !== undefined) stats.minutes = f.min;
          if (f) stats.plusMinus = f.pm;
          const inSquad = !!l.playerId && roster.some((p) => p.id === l.playerId);
          const name = l.playerId ? nm(l.playerId, inSquad ? undefined : l.names[0]) : nm(undefined, l.key.slice(1));
          return { name, ...(l.playerId ? { playerId: l.playerId } : null), stats, ...(f?.on ? { on: true } : null) };
        });
        // points / rebounds … logged with no player: the side's "Team" row
        const team = blankLine('Team');
        for (const e of s.events) if (e.side === sd && !hasPlayer(e) && (scope === 'all' || e.quarter === scope)) add(team, e, halfCourt, cov.shots);
        return { rows, team: { label: 'Team', stats: { ...bbStats(team, cov), ...deep.zero, ...deep[sd].team } } };
      };
      return { home: side('home'), away: side('away'), ...(cov.shots ? null : { untracked: ['fgPct', 'threePct'] }) };
    },
  };
}

/* -------------------------------- volleyball -------------------------------- */

const VB_OUTCOME_KINDS = new Set(['attack', 'opperror', 'serveerror']);

/** IDs-only scoring: a volleyball box keyed by player id. An older log's
 *  name-only credit is matched to a roster player by name, else keyed by the
 *  name ("~Name"); names are the viewer's (`ctx.nameOf`). */
export function volleyballBox(s: VolleyballState, ctx: BoxContext = {}): MatchBoxSource {
  const currentSet = s.setsWon.home + s.setsWon.away + 1;
  const periods = numbered(s.ended ? s.sets.length : currentSet, 'Set');
  // D8: attack points exist only once the scorer logs outcomes (SD-04); an
  // older "Point"-only log hides the ATK column instead of showing zeros.
  const outcomes = s.events.some((e) => VB_OUTCOME_KINDS.has(e.kind ?? ''));
  // SD-81 — keyed: a column shows only when the match captured it
  const named = (e: LiveEvent) => !!(e.oe?.playerName || e.oe?.playerId);
  const namedSE = s.events.some((e) => e.kind === 'serveerror' && named(e));
  const namedErr = s.events.some((e) => e.kind === 'opperror' && named(e));
  return {
    periods,
    emptyText: 'No points yet.',
    data: (scope) => {
      const inScope = (e: LiveEvent) => scope === 'all' || e.set === scope;
      const vbDetail = vbDetailTracked(s) ? vbDetailTally(s, scope) : null;
      const count = (sd: Side, kind: string) => s.events.filter((e) => e.side === sd && e.kind === kind && inScope(e)).length;
      const side = (sd: Side): BoxSideInput => {
        const roster = rosterOf(ctx, sd);
        const resolve = (name: string) => idIn(name, roster);
        const keyOf = vbCreditKeyer(s.events, resolve);
        const nm = withRosters(ctx.nameOf, roster);
        const byKey = new Map<string, BoxRowInput>();
        for (const l of volleyballTally(s.events, sd, scope, { nameOf: nm, resolve })) {
          byKey.set(l.key, {
            name: l.name, ...(l.playerId ? { playerId: l.playerId } : {}),
            stats: { points: l.points, aces: l.aces, blocks: l.blocks, ...(outcomes ? { attackPoints: l.attackPoints } : null) },
          });
        }
        // SD-81 — per-player ATT / EFF (detail mode), SE / ERR (named faults):
        // only on a match that captured them, so older matches hide the columns
        const extra = new Map<string, { legacy?: string; stats: Record<string, number> }>();
        const add = (key: string, legacy: string | undefined, k: string, n = 1) => {
          const m = extra.get(key) ?? extra.set(key, { ...(legacy ? { legacy } : {}), stats: {} }).get(key)!;
          m.stats[k] = (m.stats[k] ?? 0) + n;
        };
        if (vbDetail) {
          for (const l of vbDetail.values()) {
            if (l.side !== sd) continue;
            const key = keyOf({ playerId: l.playerId, playerName: l.name || undefined });
            if (!key) continue;
            for (const k of ['attackAttempts', 'attackKills', 'attackErrors', 'attacksBlocked'] as const) add(key, l.name || undefined, k, l[k]);
          }
        }
        for (const [kind, key, on] of [['serveerror', 'serveErrors', namedSE], ['opperror', 'errors', namedErr]] as const) {
          if (!on) continue;
          for (const e of s.events) {
            if (e.kind !== kind || e.side !== other(sd) || !inScope(e) || !named(e)) continue;
            const k = keyOf(e.oe);
            if (k) add(k, e.oe?.playerName, key);
          }
        }
        const zero: Record<string, number> = {
          ...(vbDetail ? { attackAttempts: 0, attackKills: 0, attackErrors: 0, attacksBlocked: 0 } : null),
          ...(namedSE ? { serveErrors: 0 } : null), ...(namedErr ? { errors: 0 } : null),
        };
        if (Object.keys(zero).length) {
          for (const [key, x] of extra) {
            if (byKey.has(key)) continue;
            byKey.set(key, key.startsWith('~')
              ? { name: nm(undefined, key.slice(1)), stats: { points: 0, aces: 0, blocks: 0, ...(outcomes ? { attackPoints: 0 } : null) } }
              : { name: nm(key, x.legacy), playerId: key, stats: { points: 0, aces: 0, blocks: 0, ...(outcomes ? { attackPoints: 0 } : null) } });
          }
          for (const [key, r] of byKey) Object.assign(r.stats, zero, extra.get(key)?.stats ?? {});
        }
        const rows = [...byKey.values()];
        const oppErrors = count(sd, 'opperror') + count(sd, 'serveerror');
        const scoredKinds = ['point', 'attack', 'ace', 'block'];
        const scored = s.events.filter((e) => e.side === sd && inScope(e) && scoredKinds.includes(e.kind ?? '')).length;
        // the side's points no player earned: the opponent's errors (VB-07),
        // plus any point logged without a player
        const loose = s.events.filter((e) => e.side === sd && inScope(e) && !e.playerName && !e.playerId && scoredKinds.includes(e.kind ?? ''));
        const looseOf = (k: string) => loose.filter((e) => e.kind === k).length;
        return {
          rows,
          team: {
            label: loose.length ? 'Team + opp. errors' : 'Opp. errors',
            stats: { points: oppErrors + loose.length, aces: looseOf('ace'), blocks: looseOf('block'), ...(outcomes ? { attackPoints: looseOf('attack') } : null) },
          },
          teamStats: {
            points: scored + oppErrors,
            ...(outcomes ? { attackPoints: count(sd, 'attack') } : null),
            aces: count(sd, 'ace'),
            blocks: count(sd, 'block'),
            ...(outcomes ? { oppErrors, serveErrors: count(other(sd), 'serveerror') } : null),
          },
        };
      };
      return { home: side('home'), away: side('away'), ...(outcomes ? null : { untracked: ['attackPoints', 'oppErrors', 'serveErrors'] }) };
    },
  };
}

/* ---------------------------------- kabaddi ---------------------------------- */

export const kabaddiPeriodName = (h: number): string => (h === 1 ? '1st half' : h === 2 ? '2nd half' : h === 3 ? 'ET 1' : 'ET 2');

export function kabaddiBox(s: KabaddiState, ctx: BoxContext = {}): MatchBoxSource {
  const periods = Array.from({ length: Math.max(1, s.half) }, (_, i) => ({ value: i + 1, label: kabaddiPeriodName(i + 1) }));
  return {
    periods,
    emptyText: 'No points yet.',
    data: (scope) => {
      const inScope = (e: LiveEvent) => !isShootoutEvent(e) && (scope === 'all' || e.half === scope);
      // SD-41 (KB-03): the PKL match centre — points split, raids, strike rates, all-outs
      const centre = kabaddiMatchCentre(s, scope);
      const teamFigures = (sd: Side): Record<string, number> => {
        const c = centre[sd];
        const out: Record<string, number> = { raidPoints: c.raidPoints, tacklePoints: c.tacklePoints, allOutPoints: c.allOutPoints, extraPoints: c.extraPoints };
        if (!centre.countsTracked) return out;
        Object.assign(out, {
          raids: c.raids, successfulRaids: c.successfulRaids, emptyRaids: c.emptyRaids, raidsOut: c.raidsOut, superRaids: c.superRaids,
          doOrDieRaids: c.doOrDieRaids, tackles: c.tackles, superTackles: c.superTackles, allOuts: c.allOuts,
        });
        if (c.raidStrikeRate !== undefined) out.raidStrikeRate = c.raidStrikeRate;
        if (c.tackleStrikeRate !== undefined) out.tackleStrikeRate = c.tackleStrikeRate;
        if (c.doOrDieRate !== undefined) out.doOrDieRate = c.doOrDieRate;
        return out;
      };
      const side = (sd: Side): BoxSideInput => {
        const roster = rosterOf(ctx, sd);
        // raid / tackle points logged without a player
        const loose = (kind: string) => s.events.filter((e) => e.side === sd && e.kind === kind && !e.playerName && inScope(e)).reduce((a, e) => a + (e.points ?? 0), 0);
        return {
          rows: kabaddiTally(s.events, sd, scope).map((l) => withId({ name: l.name, stats: { raidPoints: l.raid, tacklePoints: l.tackle } }, roster)),
          team: { label: 'Team', stats: { raidPoints: loose('raid'), tacklePoints: loose('tackle') } },
          teamStats: teamFigures(sd),
        };
      };
      // old one-tap points: the raid / tackle counts weren't captured (D8)
      const untracked = centre.countsTracked ? undefined : [...KABADDI_COUNT_KEYS, 'raidStrikeRate', 'tackleStrikeRate', 'doOrDieRate', 'allOuts'];
      return { home: side('home'), away: side('away'), ...(untracked ? { untracked } : null) };
    },
  };
}

/* --------------------------------- football ---------------------------------- */

/** The comparison / box keys each "Stats captured" toggle covers (D8). */
const FOOTBALL_TRACK_KEYS: Record<keyof TrackConfig, string[]> = {
  shots: ['shots', 'shotsOnTarget', 'blockedShots'],
  possession: ['possession'],
  passes: ['passes', 'passAccuracy'],
  fouls: ['fouls'],
  cards: ['yellowCards', 'redCards'],
  offsides: ['offsides'],
  corners: ['corners'],
  tackles: ['tackles'],
  interceptions: ['interceptions'],
  saves: ['saves'],
  crosses: ['crosses'],
  dribbles: ['dribbles'],
  handball: ['handballs'],
  attackContribution: ['attackingContributions'],
  defenceContribution: ['defensiveContributions'],
};

export const footballPeriodName = (h: number): string => (h === 1 ? '1st half' : h === 2 ? '2nd half' : h === 3 ? 'ET 1' : 'ET 2');

/** Minutes on the pitch so far, by side + name (only sides with an XI stamp). */
function footballMinutes(s: FootballState, now: number): Map<string, number> {
  const out = new Map<string, number>();
  const live = !s.ended && s.startedAt;
  const upTo = live ? position(s, liveClockMinutes(s, now), s.half).reg : undefined;
  for (const p of trackField(footballFieldLog(s, 'reg', upTo)).players) {
    if (!p.played || !p.name || !s.xi?.[p.side]) continue;
    out.set(`${p.side}|${p.name}`, Math.round(p.minutes));
  }
  return out;
}

export function footballBox(s: FootballState, ctx: BoxContext = {}): MatchBoxSource {
  const periods = s.half >= 2 ? Array.from({ length: s.half }, (_, i) => ({ value: i + 1, label: footballPeriodName(i + 1) })) : [];
  const t = s.track;
  const untracked = (Object.keys(FOOTBALL_TRACK_KEYS) as (keyof TrackConfig)[]).filter((k) => t && !t[k]).flatMap((k) => FOOTBALL_TRACK_KEYS[k]);
  return {
    periods,
    emptyText: 'No players yet.',
    tickMs: s.startedAt ? 2000 : undefined,
    untrackedHint: 'turn on in Scoring settings (Info tab).',
    // SD-80 (FB-14): the FIFA-style shootout list, kick by kick
    ...(s.shootout?.kicks?.length ? {
      notes: () => (['home', 'away'] as const).map((sd) => {
        const ks = (s.shootout?.kicks ?? []).filter((k) => k.side === sd);
        const name = (sd === 'home' ? ctx.homeName : ctx.awayName) ?? (sd === 'home' ? 'Home' : 'Away');
        return ks.length ? `Shootout · ${name}: ${ks.map(kickText).join(', ')}` : '';
      }).filter(Boolean),
    } : null),
    data: (scope) => {
      const now = ctx.now ?? Date.now();
      const inScope = (h?: number) => scope === 'all' || h === scope;
      const scoped = scope === 'all' ? s : { ...s, stats: s.stats.filter((e) => inScope(e.half)), events: s.events.filter((e) => inScope(e.half)) };
      const { totals, possession, passAcc } = footballStats(scoped, now);
      const realPossession = !!footballPossession(s, now);
      const minutes = scope === 'all' ? footballMinutes(s, now) : new Map<string, number>();
      const conceded = new Map<string, number>(); // keeper id → goals let in (whole match)
      if (scope === 'all') for (const [id, k] of Object.entries(keeperTotals(s))) conceded.set(`${k.side}|${id}`, k.stats.goalsConceded);
      const anyOg = scoped.events.some((e) => e.type === 'owngoal' && !!e.playerName);
      const side = (sd: Side): BoxSideInput => {
        const roster = rosterOf(ctx, sd);
        const rows = new Map<string, BoxRowInput>();
        const blank = (): Record<string, number> => ({
          goals: 0, assists: 0,
          // SD-80: an OG column only when the match (this scope) had an own goal
          ...(anyOg ? { ownGoals: 0 } : null),
          ...(t?.shots !== false ? { shots: 0, shotsOnTarget: 0 } : null),
          ...(t?.saves !== false ? { saves: 0 } : null),
          ...(t?.fouls !== false ? { fouls: 0 } : null),
          ...(t?.cards !== false ? { yellowCards: 0, redCards: 0 } : null),
        });
        const row = (name: string, id?: string) => {
          let r = rows.get(name);
          if (!r) { r = { name, ...(id ? { playerId: id } : null), stats: blank() }; rows.set(name, r); }
          else if (id && !r.playerId) r.playerId = id;
          return r;
        };
        const bump = (r: BoxRowInput, k: string) => { if (k in r.stats) r.stats[k] += 1; };
        // starters first (the XI stamp), then subs as they came on
        const xi = s.xi?.[sd];
        for (const p of xi?.players ?? (xi?.gk ? [xi.gk] : [])) row(p.name, p.id).starter = true;
        for (const e of s.events) if (e.side === sd && e.type === 'sub' && e.secondName) row(e.secondName, e.secondId);
        for (const e of scoped.events) {
          // SD-80 (FB-13): an own goal counts for the other side; the player who
          // put it in his own net gets OG, never a goal
          if (e.type === 'owngoal') {
            if (other(e.side) === sd && e.playerName) { const r = row(e.playerName, e.playerId); r.stats.ownGoals = (r.stats.ownGoals ?? 0) + 1; }
            continue;
          }
          if (e.side !== sd || !e.playerName || e.official) continue; // SD-117: an official's card is no player's
          if (e.type === 'goal') {
            const r = row(e.playerName);
            r.stats.goals += 1; bump(r, 'shots'); bump(r, 'shotsOnTarget'); // a goal is a shot on target
            if (e.secondName) row(e.secondName).stats.assists += 1;
          } else if (e.type === 'yellow') bump(row(e.playerName), 'yellowCards');
          else if (e.type === 'red') bump(row(e.playerName), 'redCards');
        }
        for (const e of scoped.stats) {
          if (e.side !== sd || !e.playerName) continue;
          if (e.kind === 'shot') { const r = row(e.playerName, e.playerId); bump(r, 'shots'); if (e.onTarget && !e.blocked) bump(r, 'shotsOnTarget'); }
          else if (e.kind === 'save') bump(row(e.playerName, e.playerId), 'saves');
          else if (e.kind === 'foul') bump(row(e.playerName, e.playerId), 'fouls');
        }
        // SD-80 (FB-14): shootout takers (scored-taken) and keepers (saves)
        if (scope === 'all') {
          // by id first (a row from the XI / a sub may carry another spelling)
          const byId = (id: string | undefined, name: string) => (id ? [...rows.values()].find((r) => r.playerId === id) : undefined) ?? row(name, id);
          for (const k of s.shootout?.kicks ?? []) {
            if (k.side === sd && (k.takerId || k.takerName)) {
              const r = byId(k.takerId, k.takerName ?? rosterOf(ctx, sd).find((p) => p.id === k.takerId)?.fullName ?? 'Player');
              r.stats.penKicksTaken = (r.stats.penKicksTaken ?? 0) + 1;
              r.stats.penKicksScored = (r.stats.penKicksScored ?? 0) + (k.scored ? 1 : 0);
            }
            if (k.side !== sd && (k.keeperId || k.keeperName)) {
              const r = byId(k.keeperId, k.keeperName ?? rosterOf(ctx, sd).find((p) => p.id === k.keeperId)?.fullName ?? 'Keeper');
              r.stats.shootoutSaves = (r.stats.shootoutSaves ?? 0) + (k.outcome === 'saved' ? 1 : 0);
            }
          }
        }
        for (const r of rows.values()) {
          const m = minutes.get(`${sd}|${r.name}`);
          if (m !== undefined) r.stats.minutes = m;
          const id = r.playerId ?? idIn(r.name, roster);
          const ga = id ? conceded.get(`${sd}|${id}`) : undefined;
          if (ga !== undefined) r.stats.goalsConceded = ga;
        }
        // the rest of the squad: the bench (listed on request)
        for (const p of roster) if (!rows.has(p.fullName)) rows.set(p.fullName, { name: p.fullName, playerId: p.id, stats: {}, dnp: true });
        const tt = totals[sd];
        return {
          // SD-56: the shirt number, where the squad has one
          rows: [...rows.values()].map((r) => numberedRow(withId(r, roster), roster)),
          teamStats: {
            shots: tt.shots, shotsOnTarget: tt.shotsOnTarget, blockedShots: tt.blockedShots,
            // possession only when the bar was used and the ball changed hands — the
            // kick-off alone hands one side a false "100% – 0%" (deep wave, 2026-10-22)
            ...(realPossession ? { possession: possession[sd] } : {}),
            passes: tt.passes, passAccuracy: passAcc[sd], fouls: tt.fouls, yellowCards: tt.yellow, redCards: tt.red,
            offsides: tt.offsides, corners: tt.corners, tackles: tt.tackles, interceptions: tt.interceptions, saves: tt.saves,
            crosses: tt.crosses, dribbles: tt.dribbles, handballs: tt.handballs,
            attackingContributions: tt.attackContributions, defensiveContributions: tt.defenceContributions,
          },
        };
      };
      return { home: side('home'), away: side('away'), untracked };
    },
  };
}

/* ------------------------------ racket sports ------------------------------ */

/** IDs-only scoring — who a racket credit is: the player's id; an older event
 *  that stored only a name is matched to a roster player by that name (else
 *  it is keyed by the name itself, "~Name"). */
type Credit = { playerId?: string; playerName?: string } | undefined;
const creditKey = (c: Credit, roster: Player[]): string | undefined =>
  c?.playerId || (c?.playerName ? idIn(c.playerName, roster) ?? `~${c.playerName}` : undefined);

/** Points (and tennis aces) per player from a point log, keyed by player id
 *  (IDs-only scoring); `periodOf` reads an event's game / set; `kinds` = the
 *  scoring kinds; `list` = the roster players listed at 0 (the old
 *  PointBoxScore did, tennis / badminton didn't). Names are the viewer's
 *  (`nameOf`), the stored legacy name / the roster name without one. */
export function pointTally(events: LiveEvent[], side: Side, opts: {
  scope?: BoxScope; periodOf: (e: LiveEvent) => number | undefined; kinds: string[]; roster?: Player[]; list?: boolean; aces?: boolean; nameOf?: NameOf;
}): { key: string; playerId?: string; name: string; points: number; aces: number }[] {
  const roster = opts.roster ?? [];
  const lines = new Map<string, { key: string; playerId?: string; name: string; points: number; aces: number }>();
  const legacy = new Map<string, string>();
  const ensure = (key: string) => lines.get(key)
    ?? lines.set(key, { key, ...(key.startsWith('~') ? {} : { playerId: key }), name: '', points: 0, aces: 0 }).get(key)!;
  if (opts.list) roster.forEach((p) => ensure(p.id));
  for (const e of events) {
    if (e.side !== side || !opts.kinds.includes(e.kind ?? '')) continue;
    const key = creditKey(e, roster);
    if (!key) continue;
    if (opts.scope !== undefined && opts.scope !== 'all' && opts.periodOf(e) !== opts.scope) continue;
    if (e.playerName && !legacy.has(key)) legacy.set(key, e.playerName);
    const l = ensure(key);
    l.points += 1;
    if (e.kind === 'ace') l.aces += 1;
  }
  const nm = withRosters(opts.nameOf, roster);
  for (const l of lines.values()) l.name = l.playerId ? nm(l.playerId, legacy.get(l.key)) : nm(undefined, l.key.slice(1));
  return [...lines.values()].sort((a, b) => b.points - a.points || (opts.aces ? b.aces - a.aces : 0));
}

function pointBox(events: LiveEvent[], ctx: BoxContext, periods: { value: number; label: string }[], o: {
  periodOf: (e: LiveEvent) => number | undefined; kinds: string[]; listRoster: boolean; aces?: boolean;
  /** SD-107 — the sport's point detail, when the match tracked it */
  detail?: DetailSport;
  /** SD-135 (TN-b) — count `df` markers as the faulting server's doubleFaults */
  dfs?: boolean;
}): MatchBoxSource {
  // SD-135 — the DF column only on a match with a marked double fault (older
  // logs' double faults were plain points: the column stays hidden, not 0)
  const dfOn = !!o.dfs && events.some((e) => !!e.df);
  return {
    periods,
    emptyText: 'No points yet.',
    data: (scope) => {
      // SD-107 — winners / UE / FE per player (by id) in scope; a credit no
      // player can take (doubles, nobody named) stays off the table.
      const detail = o.detail ? detailByPlayer(o.detail, events.filter((e) => scope === 'all' || o.periodOf(e) === scope), ctx) : null;
      const side = (sd: Side): BoxSideInput => {
        const roster = rosterOf(ctx, sd);
        const nm = withRosters(ctx.nameOf, roster);
        // IDs-only scoring: rows keyed by player id (an older name-only credit by "~name")
        const byKey = new Map<string, BoxRowInput>();
        const blank = (): Record<string, number> => ({ points: 0, ...(o.aces ? { aces: 0 } : null) });
        const add = (key: string, legacyName?: string) => {
          if (byKey.has(key)) return byKey.get(key)!;
          const row: BoxRowInput = key.startsWith('~')
            ? { name: nm(undefined, key.slice(1)), stats: blank() }
            : { name: nm(key, legacyName), playerId: key, stats: blank() };
          byKey.set(key, row);
          return row;
        };
        for (const l of pointTally(events, sd, { scope, periodOf: o.periodOf, kinds: o.kinds, roster, list: o.listRoster, aces: o.aces, nameOf: ctx.nameOf })) {
          byKey.set(l.key, { name: l.name, ...(l.playerId ? { playerId: l.playerId } : {}), stats: { points: l.points, ...(o.aces ? { aces: l.aces } : null) } });
        }
        if (detail) {
          // a player credited only with an error still gets a row
          for (const v of detail.values()) if (v.side === sd) add(v.key, v.legacy);
          for (const [key, r] of byKey) {
            const mine = detail.get(`${sd}|${key}`)?.stats ?? {};
            Object.assign(r.stats, Object.fromEntries(DETAIL_BOX_KEYS.map((k) => [k, mine[k] ?? 0])));
          }
        }
        if (dfOn) {
          // a df point is the receiver's: the faulting server is on the other side
          const faults = new Map<string, { n: number; legacy?: string }>();
          for (const e of events) {
            if (!e.df || e.side === sd || (e.side !== 'home' && e.side !== 'away')) continue;
            if (scope !== 'all' && o.periodOf(e) !== scope) continue;
            const key = creditKey(e.df, roster) ?? (roster.length === 1 ? roster[0].id : undefined);
            if (!key) continue;
            const f = faults.get(key) ?? { n: 0, ...(e.df.playerName ? { legacy: e.df.playerName } : {}) };
            f.n += 1;
            faults.set(key, f);
          }
          for (const [key, f] of faults) add(key, f.legacy);
          for (const [key, r] of byKey) r.stats.doubleFaults = faults.get(key)?.n ?? 0;
        }
        return { rows: [...byKey.values()] };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}

/** SD-107 — point-detail credits per "side|player key" (IDs-only scoring:
 *  the player's id; singles: the side's one player when the point names
 *  nobody). */
function detailByPlayer(sport: DetailSport, events: LiveEvent[], ctx: BoxContext): Map<string, { side: Side; key: string; legacy?: string; stats: Record<string, number> }> {
  const solo = (sd: Side): string | undefined => {
    const r = rosterOf(ctx, sd);
    if (r.length === 1) return r[0].id;
    const named = new Set(events.filter((e) => e.side === sd && (e.playerId || e.playerName) && (e.kind === 'point' || e.kind === 'ace')).map((e) => creditKey(e, r)!));
    return r.length === 0 && named.size === 1 ? [...named][0] : undefined;
  };
  const legacy = new Map<string, string>();
  const credits = detailPlayerCredits(sport, events, (sd, p) => {
    const key = creditKey(p, rosterOf(ctx, sd)) ?? solo(sd);
    if (key && p?.playerName && !legacy.has(`${sd}|${key}`)) legacy.set(`${sd}|${key}`, p.playerName);
    return key ? `${sd}|${key}` : undefined;
  });
  const out = new Map<string, { side: Side; key: string; legacy?: string; stats: Record<string, number> }>();
  for (const [k, stats] of credits) {
    const i = k.indexOf('|');
    const side = k.slice(0, i) as Side;
    out.set(k, { side, key: k.slice(i + 1), ...(legacy.has(k) ? { legacy: legacy.get(k) } : {}), stats });
  }
  return out;
}

/** Table tennis / squash / pickleball (the rally engine): per game. `sport`
 *  names the point-detail options (SD-107; the rally state doesn't know it). */
export const rallyBox = (s: RallyState, ctx: BoxContext = {}, sport?: 'tabletennis' | 'squash' | 'pickleball'): MatchBoxSource =>
  pointBox(s.events, ctx, numbered(Math.max(1, s.games.length + 1), 'Game'), { periodOf: (e) => e.game ?? e.set, kinds: ['point'], listRoster: true, detail: sport && detailCoverage(sport, s) === 'full' ? sport : undefined });

export const padelBox = (s: PadelState, ctx: BoxContext = {}): MatchBoxSource =>
  pointBox(s.events, ctx, numbered(Math.max(1, s.sets.length + 1), 'Set'), { periodOf: (e) => e.game ?? e.set, kinds: ['point'], listRoster: true, detail: detailCoverage('padel', s) === 'full' ? 'padel' : undefined });

export function tennisBox(s: TennisState, ctx: BoxContext = {}): MatchBoxSource {
  const currentSet = s.setsWon.home + s.setsWon.away + 1;
  return pointBox(s.events, ctx, numbered(s.ended ? s.sets.length : currentSet, 'Set'), { periodOf: (e) => e.set, kinds: ['point', 'ace'], listRoster: false, aces: true, detail: detailTracked(s) ? 'tennis' : undefined, dfs: true });
}

export function badmintonBox(s: BadmintonState, ctx: BoxContext = {}): MatchBoxSource {
  return pointBox(s.events, ctx, numbered(s.ended ? s.games.length : s.games.length + 1, 'Game'), { periodOf: (e) => e.game, kinds: ['point'], listRoster: false, detail: detailTracked(s) ? 'badminton' : undefined });
}

/* ---------------------------------- carrom ---------------------------------- */

/** Carrom: a board is the SIDE's (SD-37 credits both doubles partners the
 *  same), so a team comparison (points, boards, queens) per game, no player
 *  table. Points are the capped credits (SD-37), so a game's box = its score. */
export function carromBox(s: CarromState): MatchBoxSource {
  const games = Math.max(1, s.games.length + (s.ended ? 0 : 1), ...s.boards.map((b) => b.game));
  const credit = carromCredited(s);
  return {
    periods: numbered(games, 'Game'),
    players: false,
    data: (scope) => {
      const side = (sd: Side): BoxSideInput => {
        const won = s.boards.map((b, i) => ({ b, pts: credit[i] })).filter(({ b }) => b.winner === sd && (scope === 'all' || b.game === scope));
        return { rows: [], teamStats: { points: won.reduce((a, x) => a + x.pts, 0), boards: won.filter((x) => !x.b.penalty).length, queens: won.filter((x) => x.b.queen).length } };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}

/* --------------------------------- registry --------------------------------- */

/** The box score source for a sport's match state (undefined = none: cricket
 *  keeps its innings scorecard, chess and golf have no box). */
export function matchBoxSource(sport: SportId, state: unknown, ctx: BoxContext = {}): MatchBoxSource | undefined {
  if (!state || typeof state !== 'object') return undefined;
  switch (sport) {
    case 'basketball': return basketballBox(state as BasketballState, ctx);
    case 'volleyball': return volleyballBox(state as VolleyballState, ctx);
    case 'kabaddi': return kabaddiBox(state as KabaddiState, ctx);
    case 'football': return footballBox(state as FootballState, ctx);
    case 'tennis': return tennisBox(state as TennisState, ctx);
    case 'badminton': return badmintonBox(state as BadmintonState, ctx);
    case 'padel': return padelBox(state as PadelState, ctx);
    case 'tabletennis': case 'squash': case 'pickleball': return rallyBox(state as RallyState, ctx, sport);
    case 'carrom': return carromBox(state as CarromState);
    case 'hockey': return hockeyBox(state as HockeyState, ctx);
    case 'handball': return handballBox(state as HandballState, ctx);
    case 'ice_hockey': return iceHockeyBox(state as IceHockeyState, ctx);
    case 'baseball': return (state as BaseballState).g ? baseballBox(state as BaseballState, ctx) : undefined;
    case 'netball': return netballBox(state as NetballState, ctx);
    case 'american_football': return afBox(state as AFState, ctx);
    case 'rugby': return rugbyBox(state as RugbyState, ctx);
    case 'rugby_league': return leagueBox(state as LeagueState, ctx);
    default: return undefined;
  }
}
