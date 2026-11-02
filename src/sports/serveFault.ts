/**
 * The 1st-serve fault's type, shared by tennis (tennis-endings-depth FT1) and
 * padel (padel-fault PF2). PURE (no React Native).
 *
 * A sport's state carries `fault` (the 1st serve of the point in play was a
 * fault: the next point is a 2nd-serve point) and its optional `faultKind`,
 * which the next point stamps as `sf1`; a double fault's own 2nd-serve type
 * is `sf2` on that point. FAULT_TYPE types (or clears, null) the pending
 * fault, else the double fault that is the last point played.
 */
import type { LiveEvent } from './liveEvents';
import type { ScoreAction } from './types';
import { isFaultKind, type FaultKind } from './pointDetail.ts';

export interface FaultFields { fault?: true; faultKind?: FaultKind; events: LiveEvent[] }

/** FAULT_TYPE: type (or clear, null) the pending 1st-serve fault, else the
 *  double fault that is the last point played. Anything else: unchanged.
 *  `sport` 'padel' also accepts the mesh. */
export function faultType<S extends FaultFields>(s: S, kind: unknown, sport?: 'padel'): S {
  if (kind !== null && !isFaultKind(kind, sport)) return s;
  if (s.fault) {
    if ((s.faultKind ?? null) === kind) return s;
    const { faultKind: _k, ...rest } = s;
    return (kind ? { ...rest, faultKind: kind } : rest) as S;
  }
  let i = s.events.length - 1;
  while (i >= 0 && s.events[i].kind !== 'point' && s.events[i].kind !== 'ace') i--;
  const e = s.events[i];
  if (!e?.df || (e.sf2 ?? null) === kind) return s;
  const { sf2: _o, ...plain } = e;
  const events = [...s.events];
  events[i] = kind ? { ...plain, sf2: kind } : plain;
  return { ...s, events };
}

/** What the type chips are typing now: the pending 1st-serve fault, else a
 *  double fault that is the last point played; null = nothing to type. */
export function faultTyping(s: FaultFields): { label: string; cur?: FaultKind } | null {
  const lastPt = [...(s.events ?? [])].reverse().find((e) => e.kind === 'point' || e.kind === 'ace');
  return s.fault ? { label: '1st serve was:', cur: s.faultKind } : lastPt?.df ? { label: 'Double fault was:', cur: lastPt.sf2 } : null;
}

/** A time violation's "fault · loss of serve" (tennis TF4; padel
 *  racket-batch5 RB1). The serving check is the sport's. */
export const isTimeFault = (a: ScoreAction): boolean =>
  a.type === 'CONDUCT' && a.payload?.track === 'time' && a.payload?.level === 'fault';

/**
 * What a server's time-violation fault does once the conduct step (`extra`)
 * has recorded it: on the 1st serve a fault (the 2nd serve is next; serve
 * tracking on from here, so it is counted), on the 2nd serve a double fault —
 * `doubleFault` scores the receiver's point for the sport (df, serve 2, the
 * pending fault's type as sf1), charged to the named offender.
 */
export function lossOfServe<S extends FaultFields & { serveDetail?: boolean }>(
  prev: S, extra: S, doubleFault: (s: S, df: { playerId?: string }, sf1?: FaultKind) => S,
): S {
  if (extra === prev) return extra;
  if (!prev.fault) return { ...extra, fault: true, serveDetail: true };
  const pen = [...extra.events].reverse().find((e) => e.kind === 'conduct')?.pen;
  return doubleFault(extra, pen?.playerId ? { playerId: pen.playerId } : {}, prev.faultKind);
}
