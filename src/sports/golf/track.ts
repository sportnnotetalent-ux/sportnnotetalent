/**
 * Deep wave — golf "Stats to track" (PURE; tests/golf-deep.test.mts).
 *
 * The marker keeps strokes only by default (as fast as ever). Each optional
 * stat adds a row on the hole card: putts (GIR, scrambling and putts per GIR
 * come from them), the fairway (par 4 / 5: left · hit · right), a greenside
 * bunker (sand saves), penalty strokes, the first putt's length (a bucket),
 * the measured drive (yards, on the round's measured holes) and — round 2 —
 * the shots from off the green (up and downs). The organiser can switch the
 * round to metres (`format.distUnit`); cards still store yards.
 *
 * Who decides: the round's organiser, for every marker (`format.track`, and
 * `format.driveHoles` for the measured-drive holes); when the round sets
 * nothing, each marker's own phone setting (remembered on the phone, as the
 * SD-45 stats row was).
 */
import { GOLF_TRACK_KEYS, type DistUnit, type GolfCard, type GolfTrackKey, type Hole } from './engine.ts';

export const GOLF_TRACK_LABEL: Record<GolfTrackKey, { label: string; hint: string }> = {
  putts: { label: 'Putts', hint: 'greens in regulation, scrambling, putts per GIR, one- and three-putts' },
  fairway: { label: 'Fairways', hint: 'par 4s and 5s: missed left · hit · missed right' },
  bunker: { label: 'Bunkers', hint: 'in a greenside bunker → sand saves' },
  upDown: { label: 'Up and downs', hint: 'shots from off the green (chips, pitches, greenside bunker shots) → up and down = holed in 2 shots or fewer from there, whatever the score (needs putts)' },
  penalties: { label: 'Penalties', hint: 'penalty strokes on the hole' },
  firstPutt: { label: 'First-putt length', hint: 'inside 3 ft · 3–10 ft · 10–20 ft · 20 ft+ (needs putts)' },
  drive: { label: 'Driving distance', hint: 'yards, on the measured holes (par 4 / 5)' },
};

/** Round 2 — the hints in the round's unit (metres: the bucket equivalents
 *  and the drive in metres). */
export function trackHint(k: GolfTrackKey, unit: DistUnit): string {
  if (unit === 'm' && k === 'firstPutt') return 'inside 1 m · 1–3 m · 3–6 m · 6 m+ (needs putts)';
  if (unit === 'm' && k === 'drive') return 'metres, on the measured holes (par 4 / 5)';
  return GOLF_TRACK_LABEL[k].hint;
}

/** The SD-45 stats row as a track set (a phone that had it switched on). */
export const LEGACY_STATS_ROW: GolfTrackKey[] = ['putts', 'fairway', 'bunker', 'penalties'];

/** A clean track list (known keys, in the standard order; first-putt length
 *  and up and downs bring putts with them). */
export function cleanTrack(v: unknown): GolfTrackKey[] {
  if (!Array.isArray(v)) return [];
  const set = new Set(v.filter((k): k is GolfTrackKey => (GOLF_TRACK_KEYS as string[]).includes(k as string)));
  if (set.has('firstPutt') || set.has('upDown')) set.add('putts');
  return GOLF_TRACK_KEYS.filter((k) => set.has(k));
}

/** The round's own setting (the organiser's), or null when it sets none. */
export function roundTrackOf(format: Record<string, unknown> | undefined | null): GolfTrackKey[] | null {
  return Array.isArray(format?.track) ? cleanTrack(format!.track) : null;
}

/** The round's measured-drive holes (hole numbers), [] = any par 4 / 5. */
export function driveHolesOf(format: Record<string, unknown> | undefined | null): number[] {
  const v = format?.driveHoles;
  return Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 18))].sort((a, b) => a - b) : [];
}

/** What this marker tracks: the round's setting, else the phone's. */
export function effectiveTrack(round: GolfTrackKey[] | null, phone: GolfTrackKey[]): GolfTrackKey[] {
  return round ?? cleanTrack(phone);
}

/** Is the drive measured on this hole? (par 4 / 5, and one of the round's
 *  measured holes when it names some) */
export const driveMeasuredOn = (hole: Hole, driveHoles: number[]): boolean =>
  hole.par >= 4 && (!driveHoles.length || driveHoles.includes(hole.n));

/** A card ready for the tracked stats: the arrays it needs (absent ones only)
 *  and `track` = what it has been kept with so far (a union — a stat switched
 *  off mid-round keeps the holes already recorded). Strokes-only (nothing
 *  tracked) leaves the card exactly as it was. */
export function withTrack(card: GolfCard, n: number, track: GolfTrackKey[]): GolfCard {
  if (!track.length) return card;
  const out: GolfCard = { ...card };
  const blank = <T,>() => new Array<T | null>(n).fill(null);
  if (track.includes('putts') && !out.putts) out.putts = blank<number>();
  if (track.includes('fairway') && !out.firDir) out.firDir = blank();
  if (track.includes('bunker') && !out.bunker) out.bunker = blank<boolean>();
  if (track.includes('penalties') && !out.penalties) out.penalties = blank<number>();
  if (track.includes('firstPutt') && !out.firstPutt) out.firstPutt = blank<number>();
  if (track.includes('drive') && !out.drive) out.drive = blank<number>();
  if (track.includes('upDown') && !out.offGreen) out.offGreen = blank<number>();
  out.track = cleanTrack([...(card.track ?? []), ...track]);
  return out;
}

/** Stamp hole `i` with the time its score was entered (the commentary's
 *  time); a cleared hole loses its stamp. */
export function stampHole(card: GolfCard, n: number, i: number, at: number | null): GolfCard {
  if (at == null && !card.holeAt) return card;
  const holeAt = [...(card.holeAt ?? new Array<number | null>(n).fill(null))];
  holeAt[i] = at;
  return { ...card, holeAt };
}
