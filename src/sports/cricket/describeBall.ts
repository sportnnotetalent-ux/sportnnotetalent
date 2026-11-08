/**
 * Wave 2 (cricket) — the pure parts of the ONE per-ball describe card
 * (docs/security/breaks/describe-cricket.md): the ball's key, the summary
 * line, and the typed speed that Done (DK2) or moving on to the next ball (DK3)
 * must not drop. Pure and JSX-free (node tests load it — note the `.ts`
 * imports). Only TYPE imports from engine.ts.
 */
import type { BallRec, CricketState, ShotRec } from './engine.ts';
import type { ScoreAction } from '../types.ts';
import {
  LENGTH_LABEL, LINE_LABEL, CONTROL_LABEL, asKph, deliveryOrdinals, extraWhyLabel, fieldPosition, recStamp,
  type BallDetailRec,
} from './detail.ts';
import { zoneName } from './wagon.ts';

/** The ball the card describes: its record, delivery ordinal and stamp. */
export interface BallTarget { rec: BallRec; d: number; at: string }

/** The last delivery the card can tag, with its key, or null. */
export function detailTarget(s: CricketState): BallTarget | null {
  const log = s.log ?? [];
  const ords = deliveryOrdinals(log);
  for (let i = log.length - 1; i >= 0; i--) {
    if (!ords[i]) continue;
    return { rec: log[i], d: ords[i], at: recStamp(log[i], s.ballsPerOver) };
  }
  return null;
}

/** One key per delivery (DK5/DK7/DK9/DK12): innings, side, the delivery's
 *  ordinal (a re-bowled wide / no-ball is its own delivery) and the device
 *  stamp `t`, so a ball re-scored after an undo opens a fresh card. Balls
 *  without a stamp (older clients) fall back to innings:side:delivery. */
export const ballKey = (rec: Pick<BallRec, 'inn' | 'side' | 't'>, d: number): string =>
  `${rec.inn}:${rec.side}:${d}${rec.t ? `@${rec.t}` : ''}`;

/** A typed km/h waiting to be saved: valid (40–180) and not already saved. */
export function pendingKph(text: string, saved: number | undefined): number | null {
  const n = asKph(text);
  return n !== null && n !== saved ? n : null;
}

/** The scorer's typed (not yet saved) speed, for one ball (`key`). */
export interface KphDraft { key: string; text: string }

/** The BALL_DETAIL action for a ball — the same payload the detail panel
 *  always sent (DK11). */
export function detailAction(target: BallTarget, patch: Record<string, unknown>): ScoreAction {
  const { rec, d, at } = target;
  return {
    type: 'BALL_DETAIL', side: rec.side,
    payload: { v: 2, inn: rec.inn, side: rec.side, d, at, ...(rec.strikerId ? { batterId: rec.strikerId } : {}), ...(rec.bowlerId ? { bowlerId: rec.bowlerId } : {}), ...patch },
  };
}

/** DK2: Done first saves a valid typed speed for THIS ball (null = nothing to send). */
export function doneAction(draft: KphDraft | null, target: BallTarget, savedKph: number | undefined): ScoreAction | null {
  if (!draft || draft.key !== ballKey(target.rec, target.d)) return null;
  const n = pendingKph(draft.text, savedKph);
  return n === null ? null : detailAction(target, { kph: n });
}

/** DK3/DK5: the card moved to another ball (the next ball, voice, another
 *  scorer, an undo). A valid typed speed is saved to the ball it was typed for
 *  — only if that very ball (same key, so same stamp) is still in the log; an
 *  undone ball's speed is dropped, never moved to the ball that replaced it. */
export function flushOnMove(draft: KphDraft | null, log: BallRec[], detail: BallDetailRec[] | undefined, bpo = 6): ScoreAction | null {
  if (!draft) return null;
  const ords = deliveryOrdinals(log);
  for (let i = log.length - 1; i >= 0; i--) {
    if (!ords[i] || ballKey(log[i], ords[i]) !== draft.key) continue;
    const rec = log[i];
    const d = ords[i];
    const saved = (detail ?? []).find((x) => x.inn === rec.inn && x.side === rec.side && x.d === d)?.kph;
    const n = pendingKph(draft.text, saved);
    return n === null ? null : detailAction({ rec, d, at: recStamp(rec, bpo) }, { kph: n });
  }
  return null;
}

/** The card's "✓ …" line: what is picked for this ball ('' = nothing, so the
 *  button reads Skip). `kph` = a valid typed speed not yet saved (DK2). */
export function ballSummary({ shot, detail, ext, kph }: {
  shot?: Pick<ShotRec, 'zone' | 'deep' | 'shot'>;
  detail?: BallDetailRec;
  ext?: 'wd' | 'nb';
  kph?: number | null;
}): string {
  const parts: string[] = [];
  if (shot?.zone) parts.push(`${zoneName(shot.zone)}${shot.deep ? ' (deep)' : ''}`);
  if (shot?.shot) parts.push(shot.shot);
  const why = extraWhyLabel(ext, detail?.why);
  if (why) parts.push(why);
  if (detail?.len) parts.push(LENGTH_LABEL[detail.len]);
  if (detail?.line) parts.push(LINE_LABEL[detail.line]);
  if (detail?.ctrl) parts.push(CONTROL_LABEL[detail.ctrl]);
  const speed = kph ?? detail?.kph;
  if (speed) parts.push(`${speed} km/h`);
  if (detail?.cz) parts.push(`caught at ${fieldPosition(detail.cz, detail.cdeep)}`);
  return parts.join(' · ');
}
