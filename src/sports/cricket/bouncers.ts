/**
 * Cricket round 2 — the BOUNCERS-PER-OVER warning (ICC playing conditions on
 * fast short-pitched deliveries: one an over in T20 cricket, two in ODIs and
 * Tests; any more is a no-ball). It reads the optional pitch map's "Bouncer"
 * length, so it works only while the pitch map is tracked. The limit is an
 * organiser option (`bouncerMax`, rules.ts) with the format's standard as the
 * default; 0 = no limit (no warning). It only WARNS — the umpire calls the
 * no-ball and the scorer records it as usual.
 *
 * Pure and JSX-free (node tests — note the `.ts` imports).
 */
import type { BallRec, CricketState } from './engine.ts';
import { rulesOf } from './rules.ts';
import { detailByRec, isDeliveryRec } from './detail.ts';

/** The format's standard: 1 an over up to 20 overs (T20, T10, The Hundred,
 *  school short forms), else 2 (ODI, Test, longer one-dayers). Read from the
 *  scheduled length, so a rain-cut ODI keeps ODI conditions. */
export function standardBouncers(s: Pick<CricketState, 'oversLimit' | 'inn1Overs'>): number {
  return (s.inn1Overs ?? s.oversLimit) <= 20 ? 1 : 2;
}

/** Bouncers allowed per over in this match (0 = no limit). */
export function bouncerLimit(s: CricketState): number {
  return rulesOf(s).bouncerMax ?? standardBouncers(s);
}

/** The 0-based over a delivery belongs to (a wide / no-ball: the over in progress). */
export const overIndexOf = (r: Pick<BallRec, 'legal' | 'lb6'>, bpo: number): number =>
  (r.legal ? Math.floor((r.lb6 - 1) / bpo) : Math.floor(r.lb6 / bpo));

export interface BouncerCount {
  /** bouncers tagged in the over so far */
  count: number;
  limit: number;
  /** 1-based over number */
  over: number;
}

/** Bouncers tagged in one over of an innings. Null when there's no limit or
 *  none of the over's deliveries had the pitch map on (nothing to count). */
export function bouncersInOver(s: CricketState, inn: 1 | 2, side: 'home' | 'away', overIx: number): BouncerCount | null {
  const limit = bouncerLimit(s);
  if (limit <= 0) return null;
  const log = s.log ?? [];
  const det = detailByRec(log, s.detail, s.ballsPerOver);
  let tracked = false;
  let count = 0;
  log.forEach((r, i) => {
    if (r.inn !== inn || r.side !== side || r.cross || !isDeliveryRec(r)) return;
    if (overIndexOf(r, s.ballsPerOver) !== overIx) return;
    if (r.trk?.pitch) tracked = true;
    if (det[i]?.len === 'bouncer') count += 1;
  });
  if (!tracked && count === 0) return null;
  return { count, limit, over: overIx + 1 };
}

/** The over the NEXT ball belongs to (null at an over break with nothing bowled
 *  of the new over yet, when untracked, or with no limit). */
export function bouncerStatus(s: CricketState): BouncerCount | null {
  const balls = s.scores[s.battingSide].balls;
  return bouncersInOver(s, s.innings, s.battingSide, Math.floor(balls / s.ballsPerOver));
}

/** The scorer's line for the next ball: the limit reached ("another is a
 *  no-ball") or passed. Null below the limit. */
export function bouncerWarning(b: BouncerCount | null): string | null {
  if (!b || b.count < b.limit) return null;
  const n = `${b.count} bouncer${b.count === 1 ? '' : 's'}`;
  return b.count === b.limit
    ? `⚠️ Bouncer limit reached — ${n} this over (max ${b.limit}): another is a no-ball`
    : `⚠️ ${n} this over — over the limit of ${b.limit}: that's a no-ball`;
}

/** The one-line version for the fixed slot above the run pad ("⚠️ 1/1
 *  bouncers this over — the next is a no-ball"). Null below the limit. */
export function bouncerSlot(b: BouncerCount | null): string | null {
  if (!b || b.count < b.limit) return null;
  return b.count === b.limit
    ? `⚠️ ${b.count}/${b.limit} bouncer${b.limit === 1 ? '' : 's'} this over — the next is a no-ball`
    : `⚠️ ${b.count} bouncers this over — over the limit of ${b.limit}`;
}

/** For one tagged delivery (the detail panel): the warning for ITS over, but
 *  only when this ball is a bouncer that reaches or passes the limit. */
export function bouncerNoteFor(s: CricketState, rec: BallRec, isBouncer: boolean): string | null {
  if (!isBouncer) return null;
  return bouncerWarning(bouncersInOver(s, rec.inn, rec.side, overIndexOf(rec, s.ballsPerOver)));
}
