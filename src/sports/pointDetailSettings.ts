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
 *
 * Round 2 — two options beside the toggles (choice fields, same card and the
 * same advanced format fields): the serve-speed unit (tennis: km/h or mph;
 * the log stays km/h) and the rally-length buckets (every racket sport: the
 * deep-wave buckets by default, or a standard alternative, RALLY_SCHEMES).
 */
import type { FormatField, LiveSettings } from './types';
import { DEFAULT_RALLY_SCHEME, NET_WORDS, RALLY_SCHEMES, SPEED_UNITS, SPEED_UNIT_LABEL, rallySchemeOf, speedUnitOf, type DetailFlagKey, type DetailSport } from './pointDetail.ts';

type Flags = {
  pointDetail?: boolean; serveDetail?: boolean; netDetail?: boolean; rallyDetail?: boolean; speedDetail?: boolean; thirdDetail?: boolean;
  speedUnit?: string; rallyBuckets?: string; events?: unknown[];
};

export interface TrackField { key: DetailFlagKey; label: string; hint: string; /** on for a new match (tennis serve-and-endings TF2 / TF3) */ on?: boolean }

/** SD-157 — tennis' tracking options, in card order, with one-line hints. */
// founder 2026-11-02: point detail and 1st / 2nd serve are ON for a new tennis
// match (only what is captured in scoring reaches the stats); an old match keeps its own
export const TENNIS_TRACK_FIELDS: ReadonlyArray<{ key: 'pointDetail' | 'serveDetail' | 'netDetail' | 'rallyDetail' | 'speedDetail'; label: string; hint: string; on?: boolean }> = [
  { key: 'pointDetail', label: 'Point detail', hint: 'How each point ended (winner, forced / unforced error, service winner), then forehand / backhand and the shot', on: true },
  { key: 'serveDetail', label: '1st / 2nd serve', hint: 'Tap Fault when a 1st serve misses: 1st serve %, 1st / 2nd serve points won', on: true },
  { key: 'netDetail', label: 'Net points', hint: 'Who came to the net: net points played and won' },
  { key: 'rallyDetail', label: 'Rally length', hint: 'Tap 0–4, 5–8 or 9+ shots: points won by rally length' },
  { key: 'speedDetail', label: 'Serve speed', hint: 'Type the serve speed (km/h or mph, see the unit below): fastest serve and averages' },
];

const POINT_HINT: Record<Exclude<DetailSport, 'tennis'>, string> = {
  badminton: 'How each rally ended (winner, forced / unforced error, service fault), then forehand / backhand and the shot: smash, jump smash, drop, clear, net shot, net kill, drive, lift, push, block, serve',
  tabletennis: 'How each rally ended (ace, winner, forced / unforced error, service fault), then forehand / backhand and the shot: receive, flick, push, chop, loop, block, smash, lob',
  squash: 'How each rally ended (winner, forced / unforced error, service fault, stroke, no let), then forehand / backhand and the shot: drive, drop, boast, volley, lob, kill, nick',
  padel: 'How each point ended (ace, service winner, winner, forced / unforced error), then forehand / backhand and the shot: return, volley, bandeja, víbora, smash, por tres, lob, chiquita, bajada, off the glass, drop',
  pickleball: 'How each rally ended (winner, forced / unforced error, service fault), then forehand / backhand and the shot: return, drive, drop, dink, volley, reset, lob, overhead, Erne, ATP',
};
const RALLY_HINT: Record<Exclude<DetailSport, 'tennis'>, string> = {
  badminton: 'Tap 0–4, 5–10 or 11+ shots (or the buckets chosen below): points won by rally length',
  tabletennis: 'Tap 1–2, 3–4 or 5+ shots (or the four phases below): serve & 3rd ball, receive & 4th ball, rally',
  squash: 'Tap 0–5, 6–15 or 16+ shots (or the buckets chosen below): points won by rally length',
  padel: 'Tap 0–4, 5–8 or 9+ shots (or the buckets chosen below): points won by rally length',
  pickleball: 'Tap 0–4, 5–8 or 9+ shots (or the buckets chosen below): points won by rally length',
};

/** The "Stats to track" options of `sport`, in card order (off by default; point detail on in every racket
 *  sport, and tennis' 1st / 2nd serve; padel's waits for a Fault button, defaults-racket DR3). */
export function trackFields(sport: DetailSport): TrackField[] {
  if (sport === 'tennis') return [...TENNIS_TRACK_FIELDS];
  // Batch 3 (defaults-racket DR1): point detail on for a new match, as tennis
  const out: TrackField[] = [{ key: 'pointDetail', label: 'Point detail', hint: POINT_HINT[sport], on: true }];
  if (sport === 'padel') out.push({ key: 'serveDetail', label: '1st / 2nd serve', hint: 'Mark points played on a 2nd serve: 1st serve %, 1st / 2nd serve points won' });
  const nw = NET_WORDS[sport];
  if (nw) {
    out.push({
      key: 'netDetail', label: nw.option,
      hint: sport === 'pickleball'
        ? 'Which team(s) got to the kitchen line, or nobody: kitchen-line rallies won and kitchen arrival %'
        : 'Who was at the net: net points played and won',
    });
  }
  out.push({ key: 'rallyDetail', label: 'Rally length', hint: RALLY_HINT[sport] });
  if (sport === 'pickleball') out.push({ key: 'thirdDetail', label: '3rd shot', hint: "The serving team's 3rd shot (drop, drive or lob) and who won the rally" });
  return out;
}

/** Round 2 — the options beside the toggles: tennis' serve-speed unit and
 *  every sport's rally-length buckets (choice fields; default = as before). */
export function trackOptionFields(sport: DetailSport): FormatField[] {
  const out: FormatField[] = [];
  if (sport === 'tennis') {
    out.push({
      key: 'speedUnit', label: 'Serve speed unit', type: 'choice', default: 'kmh',
      options: SPEED_UNITS.map((u) => ({ value: u, label: SPEED_UNIT_LABEL[u] })),
      hint: 'Serve speeds are typed and shown in this unit (always saved in km/h)',
    });
  }
  out.push({
    key: 'rallyBuckets', label: 'Rally-length buckets', type: 'choice', default: DEFAULT_RALLY_SCHEME,
    options: RALLY_SCHEMES[sport].map((x) => ({ value: x.id, label: x.label })),
    hint: 'The shot counts the Rally chips offer (rallies already tagged keep theirs)',
  });
  return out;
}

export function detailLiveSettings(sport: DetailSport): LiveSettings<Flags> {
  const tf = trackFields(sport);
  const opts = trackOptionFields(sport);
  const fields: FormatField[] = [
    ...tf.map((f): FormatField => ({ key: f.key, label: f.label, type: 'toggle', default: f.on === true, group: 'Stats to track', hint: f.hint })),
    ...opts,
  ];
  return {
    title: '⚙️ Scoring settings',
    hint: sport === 'tennis'
      ? 'Pick the extra stats to track for this match — the point button stays one tap; describe a point only when you can.'
      : 'Pick the extra stats to track for this match — the point buttons stay one tap; describe a rally only when you can.',
    mode: 'event',
    actionType: 'SET_DETAIL',
    beforeStart: (s) => !(s.events ?? []).length,
    fields,
    read: (s) => ({
      ...Object.fromEntries(tf.map((f) => [f.key, s[f.key] === true])),
      ...(sport === 'tennis' ? { speedUnit: speedUnitOf(s) } : {}),
      rallyBuckets: rallySchemeOf(sport, s.rallyBuckets).id,
    }),
    defaults: { ...Object.fromEntries(tf.map((f) => [f.key, f.on === true])), ...Object.fromEntries(opts.map((f) => [f.key, f.default])) },
  };
}

/** Deep wave — the same toggles as advanced format fields (the organiser's
 *  default for every match of the format; the scorer can still change them
 *  per match). */
export const trackFormatFields = (sport: DetailSport): FormatField[] =>
  detailLiveSettings(sport).fields.map((f) => ({ ...f, advanced: true }));
