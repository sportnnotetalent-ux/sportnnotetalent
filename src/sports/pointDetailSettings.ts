/**
 * SD-107 — the racket sports' "Scoring settings" card: Point detail (and, in
 * tennis, 1st / 2nd serve). Event mode: before the first point it sets the
 * match format (`pointDetail` / `serveDetail`); after it, Apply logs a
 * SET_DETAIL so the change applies from the next point and earlier points
 * keep what they had. Remembered per match (the format, or the log). PURE.
 *
 * SD-157 — tennis lists every tracking option under "Stats to track", each
 * off by default: Point detail (how + forehand / backhand + shot), 1st / 2nd
 * serve, Net points, Rally length, Serve speed.
 *
 * Deep wave (racket) — every racket sport does the same with its own list
 * (`trackFields`): Point detail (how + forehand / backhand + the sport's
 * shot, error and service-fault types), Rally length (the sport's buckets;
 * table tennis' three phases), padel 1st / 2nd serve and Net points,
 * pickleball Kitchen line and 3rd shot. The same toggles are advanced format
 * fields, so an organiser can switch them on for a whole tournament.
 */
import type { FormatField, LiveSettings } from './types';
import { NET_WORDS, type DetailFlagKey, type DetailSport } from './pointDetail.ts';

type Flags = { pointDetail?: boolean; serveDetail?: boolean; netDetail?: boolean; rallyDetail?: boolean; speedDetail?: boolean; thirdDetail?: boolean; events?: unknown[] };

export interface TrackField { key: DetailFlagKey; label: string; hint: string }

/** SD-157 — tennis' tracking options, in card order, with one-line hints. */
export const TENNIS_TRACK_FIELDS: ReadonlyArray<{ key: 'pointDetail' | 'serveDetail' | 'netDetail' | 'rallyDetail' | 'speedDetail'; label: string; hint: string }> = [
  { key: 'pointDetail', label: 'Point detail', hint: 'How each point ended (winner, forced / unforced error, service winner), then forehand / backhand and the shot' },
  { key: 'serveDetail', label: '1st / 2nd serve', hint: 'Mark points played on a 2nd serve: 1st serve %, 1st / 2nd serve points won' },
  { key: 'netDetail', label: 'Net points', hint: 'Who came to the net: net points played and won' },
  { key: 'rallyDetail', label: 'Rally length', hint: 'Tap 0–4, 5–8 or 9+ shots: points won by rally length' },
  { key: 'speedDetail', label: 'Serve speed', hint: 'Type the serve speed in km/h: fastest serve and averages' },
];

const POINT_HINT: Record<Exclude<DetailSport, 'tennis'>, string> = {
  badminton: 'How each rally ended (winner, forced / unforced error, service fault), then forehand / backhand and the shot: smash, drop, clear, net shot, net kill, drive, lift, push, serve',
  tabletennis: 'How each rally ended (ace, winner, forced / unforced error, service fault), then forehand / backhand and the shot: receive, flick, push, chop, loop, block, smash, lob',
  squash: 'How each rally ended (winner, forced / unforced error, service fault, stroke, no let), then forehand / backhand and the shot: drive, drop, boast, volley, lob, kill, nick',
  padel: 'How each point ended (ace, service winner, winner, forced / unforced error), then forehand / backhand and the shot: return, volley, bandeja, víbora, smash, por tres, lob, chiquita, bajada, off the glass, drop',
  pickleball: 'How each rally ended (winner, forced / unforced error, service fault), then forehand / backhand and the shot: return, drive, drop, dink, volley, reset, lob, overhead, Erne, ATP',
};
const RALLY_HINT: Record<Exclude<DetailSport, 'tennis'>, string> = {
  badminton: 'Tap 0–4, 5–10 or 11+ shots: points won by rally length',
  tabletennis: 'Tap 1–2, 3–4 or 5+ shots: the three phases — serve & 3rd ball, receive & 4th ball, rally',
  squash: 'Tap 0–5, 6–15 or 16+ shots: points won by rally length',
  padel: 'Tap 0–4, 5–8 or 9+ shots: points won by rally length',
  pickleball: 'Tap 0–4, 5–8 or 9+ shots: points won by rally length',
};

/** The "Stats to track" options of `sport`, in card order (each off by default). */
export function trackFields(sport: DetailSport): TrackField[] {
  if (sport === 'tennis') return [...TENNIS_TRACK_FIELDS];
  const out: TrackField[] = [{ key: 'pointDetail', label: 'Point detail', hint: POINT_HINT[sport] }];
  if (sport === 'padel') out.push({ key: 'serveDetail', label: '1st / 2nd serve', hint: 'Mark points played on a 2nd serve: 1st serve %, 1st / 2nd serve points won' });
  const nw = NET_WORDS[sport];
  if (nw) {
    out.push({
      key: 'netDetail', label: nw.option,
      hint: sport === 'pickleball' ? 'Which team(s) got to the kitchen line: kitchen-line rallies played and won' : 'Who was at the net: net points played and won',
    });
  }
  out.push({ key: 'rallyDetail', label: 'Rally length', hint: RALLY_HINT[sport] });
  if (sport === 'pickleball') out.push({ key: 'thirdDetail', label: '3rd shot', hint: "The serving team's 3rd shot (drop, drive or lob) and who won the rally" });
  return out;
}

export function detailLiveSettings(sport: DetailSport): LiveSettings<Flags> {
  const tf = trackFields(sport);
  const fields: FormatField[] = tf.map((f) => ({ key: f.key, label: f.label, type: 'toggle', default: false, group: 'Stats to track', hint: f.hint }));
  return {
    title: '⚙️ Scoring settings',
    hint: sport === 'tennis'
      ? 'Pick the extra stats to track for this match — the point button stays one tap; describe a point only when you can.'
      : 'Pick the extra stats to track for this match — the point buttons stay one tap; describe a rally only when you can.',
    mode: 'event',
    actionType: 'SET_DETAIL',
    beforeStart: (s) => !(s.events ?? []).length,
    fields,
    read: (s) => Object.fromEntries(tf.map((f) => [f.key, s[f.key] === true])),
    defaults: Object.fromEntries(tf.map((f) => [f.key, false])),
  };
}

/** Deep wave — the same toggles as advanced format fields (the organiser's
 *  default for every match of the format; the scorer can still change them
 *  per match). */
export const trackFormatFields = (sport: DetailSport): FormatField[] =>
  detailLiveSettings(sport).fields.map((f) => ({ ...f, advanced: true }));
