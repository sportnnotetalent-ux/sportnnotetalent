/**
 * Deep wave — American football DRIVES (the NFL Game Book "drive chart" /
 * ESPN drive summaries), derived from the play-by-play log only. PURE, so a
 * correction or an undo re-derives every drive; a score-only game has none.
 *
 * A drive = consecutive snaps by one offence (runs, passes, sacks, turnovers,
 * punts, field-goal attempts, accepted penalties, touchdowns from scrimmage).
 * Kickoffs are NOT part of a drive (they say how the ball was obtained). Per
 * drive: the start spot (the first snap's ball spot), plays (scrimmage plays —
 * runs, passes incl. incomplete / intercepted, sacks, fumbles, kneels and the
 * scoring play; punts, field-goal attempts and penalties are not plays, as on
 * drive charts [verify]), net yards (field position at the end − the start, so
 * penalties count), time on the game clock (from the previous possession
 * moment to the drive's last play — the time-of-possession convention), the
 * result: touchdown, field goal, missed FG, punt, downs (a failed 4th / flag
 * 3rd down, or "turnover on downs"), interception, fumble, safety, end of
 * half / regulation / game, no score (an overtime possession), or none yet.
 *
 * Red zone (tackle): a drive with a snap inside the opponent's 20. Flag
 * football has no red zone (IFAF: 3 downs to cross midfield, then 3 to score)
 * — the flag equivalent is a drive that snapped past midfield.
 */
import {
  halfKey, isOT, mmss, periodName, playedOffset, pointsOf, possessionIntervals, possessionTime, spotText, turnoverSpot,
  type AFEvent, type AFState, type Side,
} from './engine.ts';

export type DriveResult = 'td' | 'fg' | 'fgMissed' | 'punt' | 'downs' | 'int' | 'fumble' | 'safety' | 'half' | 'end' | 'noScore' | 'other';
export type DriveObtained = 'kickoff' | 'punt' | 'int' | 'fumble' | 'downs' | 'fgMissed' | 'score' | 'start' | 'other';

export interface AFDrive {
  /** 1-based, in game order */
  n: number;
  off: Side;
  /** the period of the first snap (its scope) and of the last event */
  period: number;
  endPeriod: number;
  /** the first snap's ball spot / the spot at the end (own yard line; a TD = the field) */
  start: number;
  end: number;
  plays: number;
  yards: number;
  firstDowns: number;
  /** game seconds: from the previous possession moment to the last play */
  startSec: number;
  endSec: number;
  /** undefined = still going */
  result?: DriveResult;
  obtained: DriveObtained;
  /** points the offence scored on it (a touchdown + its try, a field goal) */
  points: number;
  /** tackle: a snap inside the opponent's 20 · flag: a snap past midfield */
  redZone: boolean;
  /** the drive ended with a turnover / punt returned for a touchdown */
  returnTd?: boolean;
  /** the event that ended it */
  lastId?: string;
  /** the half key (drives never cross half-time) */
  hk: string;
}

/** Events in game order (period, game second, then as recorded — a backfilled
 *  moment sits at its own time). */
export function gameOrder(s: AFState): { e: AFEvent; i: number }[] {
  return s.events.map((e, i) => ({ e, i })).sort((x, y) => x.e.period - y.e.period || x.e.sec - y.e.sec || x.i - y.i);
}

/** Drives never cross half-time (nor an overtime period). */
export { halfKey };
/** The first period of the half `p` is in. */
const halfStart = (s: AFState, p: number): number => (isOT(s, p) || s.periods !== 4 ? p : p <= 2 ? 1 : 3);

const SNAPS = new Set(['run', 'pass', 'inc', 'sack', 'int', 'fumble', 'kneel', 'punt', 'downs', 'penalty']);
const PLAYS = new Set(['run', 'pass', 'inc', 'sack', 'int', 'fumble', 'kneel']);
const POSSESSION = new Set(['play', 'td', 'fg', 'safety', 'try', 'defTry', 'possEnd']);

/** A red-zone (tackle) / past-midfield (flag) spot. */
export const inRedZone = (s: Pick<AFState, 'variant' | 'field'>, spot: number): boolean =>
  s.variant === 'flag' ? spot >= s.field / 2 : spot >= s.field - 20;

export interface DriveLog {
  drives: AFDrive[];
  /** event id → the drive (index into `drives`) it belongs to: its snaps, the
   *  kickoff before it, the try after its touchdown, a return touchdown after
   *  its turnover / punt, tackles / breakups during it */
  driveOf: Map<string, number>;
}

/** The game's drives (empty for a score-only game). */
export function afDrives(s: AFState): DriveLog {
  const drives: AFDrive[] = [];
  const driveOf = new Map<string, number>();
  // (a closure opens / closes it: keep the declared type wide)
  let cur = null as AFDrive | null;
  let spot = 0;
  let lastPoss: AFEvent | undefined;
  let kick: AFEvent | undefined;
  /** the drive a following try belongs to (after a touchdown) */
  let tdDrive: AFDrive | undefined;
  const field = s.field;
  const clamp = (n: number) => Math.max(0, Math.min(field, n));
  const close = (r: DriveResult) => { if (cur) { cur.result = r; cur = null; } };

  const open = (off: Side, e: AFEvent) => {
    const hk = halfKey(s, e.period);
    const prev = drives[drives.length - 1];
    const samePrev = prev && prev.hk === hk ? prev : undefined;
    const obtained: DriveObtained = kick && kick.side === off ? 'kickoff'
      : !samePrev ? 'start'
      : samePrev.result === 'punt' ? 'punt' : samePrev.result === 'int' ? 'int' : samePrev.result === 'fumble' ? 'fumble'
      : samePrev.result === 'downs' ? 'downs' : samePrev.result === 'fgMissed' ? 'fgMissed'
      : samePrev.result === 'td' || samePrev.result === 'fg' || samePrev.result === 'safety' ? 'score' : 'other';
    const startSec = lastPoss && halfKey(s, lastPoss.period) === hk ? lastPoss.sec : playedOffset(s, halfStart(s, e.period));
    spot = e.pre?.spot ?? (kick && kick.side === off ? kick.newSpot ?? 0 : 0);
    cur = {
      n: drives.length + 1, off, period: e.period, endPeriod: e.period, start: spot, end: spot, plays: 0, yards: 0, firstDowns: 0,
      startSec: Math.min(startSec, e.sec), endSec: e.sec, obtained, points: 0, redZone: false, hk,
    };
    drives.push(cur);
    if (kick && kick.side === off) driveOf.set(kick.id, cur.n - 1);
    kick = undefined;
  };
  const attach = (d: AFDrive, e: AFEvent) => {
    driveOf.set(e.id, d.n - 1);
    d.endSec = Math.max(d.endSec, e.sec);
    d.endPeriod = e.period;
  };

  for (const { e } of gameOrder(s)) {
    const hk = halfKey(s, e.period);
    if (cur && cur.hk !== hk) close('half');
    const play = e.type === 'play' ? e.play ?? 'run' : undefined;
    const snap = e.type === 'play' && !!e.pre && SNAPS.has(play!);
    const scrimTd = e.type === 'td' && !!e.pre && (e.off ?? e.side) === e.side && (e.how === 'run' || e.how === 'pass' || e.how === 'other');
    const fgTry = e.type === 'fg' && (!!e.pre || (cur !== null && cur.off === e.side));
    if (e.type === 'play' && play === 'kickoff') {
      close('other');
      kick = e;
    } else if (snap || scrimTd || fgTry) {
      const off = e.side;
      if (cur && cur.off !== off) close('other');
      if (!cur) open(off, e);
      const d = cur!;
      attach(d, e);
      d.lastId = e.id;
      if (e.pre) {
        spot = e.pre.spot;
        if (play !== 'penalty' && inRedZone(s, e.pre.spot)) d.redZone = true;
      }
      const y = Math.round(Number(e.yards) || 0);
      if (e.type === 'td') {
        if (e.pbp) { d.plays++; d.firstDowns++; }
        spot = field;
        d.points += pointsOf(e);
        tdDrive = d;
        d.end = spot;
        close('td');
      } else if (e.type === 'fg') {
        if (e.good) d.points += pointsOf(e);
        d.end = spot;
        close(e.good ? 'fg' : 'fgMissed');
      } else {
        if (PLAYS.has(play!)) d.plays++;
        if (e.first) d.firstDowns++;
        if (play === 'run' || play === 'pass' || play === 'sack' || play === 'kneel') spot = clamp(spot + y);
        else if (play === 'penalty') {
          const yds = Math.abs(y);
          spot = e.on === e.side ? Math.max(1, spot - Math.min(yds, Math.floor(spot / 2))) : Math.min(field - 1, spot + Math.min(yds, Math.floor((field - spot) / 2)));
        }
        d.end = spot;
        if (play === 'int') close('int');
        else if (play === 'fumble') close('fumble');
        else if (play === 'punt') close('punt');
        else if (play === 'downs') close('downs');
        else if (e.pre && !e.first && e.pre.down >= s.downs && (play === 'penalty' ? e.on === e.side && !!e.lossOfDown : PLAYS.has(play!))) close('downs');
      }
    } else if (e.type === 'safety') {
      // the offence (`off`) tackled in its own end zone
      if (cur && cur.off === (e.off ?? (e.side === 'home' ? 'away' : 'home'))) { attach(cur, e); cur.lastId = e.id; cur.end = 0; close('safety'); }
    } else if (e.type === 'possEnd') {
      if (cur && cur.off === e.side) { attach(cur, e); cur.lastId = e.id; close('noScore'); }
    } else if (e.type === 'try' || e.type === 'defTry') {
      if (tdDrive && tdDrive.hk === hk) {
        driveOf.set(e.id, tdDrive.n - 1);
        if (e.type === 'try' && e.side === tdDrive.off && tdDrive.result === 'td') tdDrive.points += pointsOf(e);
      }
      if (e.type === 'try') tdDrive = undefined;
    } else if (e.type === 'td') {
      // a return touchdown: after the drive's turnover / punt
      const prev = drives[drives.length - 1];
      tdDrive = undefined;
      if (!cur && prev && prev.hk === hk && prev.off !== e.side && (prev.result === 'int' || prev.result === 'fumble' || prev.result === 'punt' || prev.result === 'downs' || prev.result === 'fgMissed')) {
        driveOf.set(e.id, prev.n - 1);
        prev.returnTd = true;
        tdDrive = prev;
      }
    } else if (cur && (e.type === 'tackle' || e.type === 'pd' || e.type === 'timeout')) {
      driveOf.set(e.id, cur.n - 1);
    }
    if (POSSESSION.has(e.type)) lastPoss = e;
  }
  if (cur) {
    const d: AFDrive = cur;
    if (s.ended) d.result = d.hk === halfKey(s, s.period) ? 'end' : 'half';
    else if (d.hk !== halfKey(s, s.period)) d.result = 'half';
  }
  for (const d of drives) d.yards = d.end - d.start;
  return { drives, driveOf };
}

/** The drive's time on the game clock (seconds; 0 in a clockless overtime). */
export const driveTime = (d: Pick<AFDrive, 'startSec' | 'endSec'>): number => Math.max(0, d.endSec - d.startSec);

export const RESULT_LABEL: Record<DriveResult, string> = {
  td: 'Touchdown', fg: 'Field goal', fgMissed: 'Missed FG', punt: 'Punt', downs: 'Downs', int: 'Interception', fumble: 'Fumble',
  safety: 'Safety', half: 'End of half', end: 'End of game', noScore: 'No score', other: 'Possession change',
};
export const OBTAINED_LABEL: Record<DriveObtained, string> = {
  kickoff: 'Kickoff', punt: 'Punt', int: 'Interception', fumble: 'Fumble', downs: 'Downs', fgMissed: 'Missed FG', score: 'After a score', start: 'Start of half', other: 'Change of possession',
};

/** "Touchdown", "End of half" / "End of regulation" / "End of overtime", "Interception · TD return". */
export function resultText(s: AFState, d: AFDrive): string {
  if (!d.result) return 'In progress';
  let t = RESULT_LABEL[d.result];
  if (d.result === 'half') t = isOT(s, d.endPeriod) ? 'End of overtime' : d.endPeriod >= s.periods ? 'End of regulation' : 'End of half';
  if (d.result === 'end' && isOT(s, d.endPeriod)) t = 'End of game (OT)';
  return d.returnTd ? `${t} · returned for a TD` : t;
}

/** "8 plays, 75 yds, 4:12" (the time only when the game clock ran). */
export function driveLine(d: AFDrive): string {
  const t = driveTime(d);
  const yds = `${d.yards} yd${Math.abs(d.yards) === 1 ? '' : 's'}`;
  return `${d.plays} play${d.plays === 1 ? '' : 's'}, ${yds}${t > 0 ? `, ${mmss(t)}` : ''}`;
}

/** One drive-chart row (newest first in the live view). */
export interface DriveRow {
  key: string;
  side: Side;
  /** "Q2 · Lions" */
  title: string;
  /** "Touchdown" / "Punt" / "In progress" */
  result: string;
  /** "Kickoff · Own 25 · 8 plays, 75 yds, 4:12" */
  detail: string;
  points: number;
  scored: boolean;
}
export function driveRows(s: AFState, names: { home: string; away: string }): DriveRow[] {
  return afDrives(s).drives.map((d) => ({
    key: `d${d.n}`, side: d.off, title: `${periodName(s, d.period)} · ${names[d.off]}`, result: resultText(s, d),
    detail: `${isOT(s, d.period) && (d.obtained === 'start' || s.decider === 'kansas') ? 'Overtime' : OBTAINED_LABEL[d.obtained]} · ${spotText(s, d.start)} · ${driveLine(d)}`,
    points: d.points, scored: d.points > 0,
  })).reverse();
}

/** Drives of a side in a scope (a period scope = drives that started in it). */
export const drivesIn = (log: DriveLog, side: Side, scope: 'all' | number): AFDrive[] =>
  log.drives.filter((d) => d.off === side && (scope === 'all' || d.period === scope));

/** Time of possession over a scope (seconds): the engine's whole-game figure,
 *  or the same intervals clipped to one period's window. */
export function possessionIn(s: AFState, scope: 'all' | number, nowSec?: number): { home: number; away: number } {
  if (scope === 'all') return possessionTime(s, nowSec);
  const t = { home: 0, away: 0 };
  const w0 = playedOffset(s, scope);
  const w1 = scope < s.period || s.ended ? w0 + (s.played[scope - 1] ?? 0) : Infinity;
  for (const iv of possessionIntervals(s, nowSec)) {
    const a = Math.max(iv.from, w0), b = Math.min(iv.to, w1);
    if (b > a) t[iv.side] += b - a;
  }
  return t;
}

/** Where a turnover-on-downs hands the ball over (the commentary's "… take over"). */
export const downsSpot = (s: AFState, e: AFEvent): number | undefined =>
  e.newSpot ?? (e.pre ? turnoverSpot(s, e.pre.spot) : undefined);
