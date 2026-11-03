/**
 * Deep wave (timed races: athletics, swimming, rowing, canoe sprint, cycling)
 * — the optional depth an organiser switches on under "Stats to track" (the
 * sport's settings), and the federation-depth analysis derived from stored
 * results: lap / split times with places at each split, relay leg times and
 * swimming take-overs, reaction-time summaries, gaps to the winner, and each
 * athlete's path through the rounds (heat → semi-final → final with Q / q).
 *
 * Nothing here is stored: every figure is recomputed from the entries, so a
 * correction changes it at once. A figure that was never recorded is absent
 * (never 0). Pure.
 */
import type { DisciplineDef, EntryResult, PhaseFormat, RankedEntry, ResultEntry, ResultFlag, TrackOverrides } from './model.ts';
import { disciplineOf, looseLegal, phaseDiscipline } from './model.ts';
import { formatMark } from './marks.ts';
import { rankByHeat, rankEntries } from './rank.ts';
import { qualify, withQualification } from './progression.ts';
import { splitDistances, swimEventOf } from './swimming.ts';
import { isCrewSport, routeCrews, routeTarget } from './crews.ts';
import { crewEventOf } from './crewDefs.ts';
import { combinedPhaseName } from './combined.ts';
import { athLapDistances, distanceLabel, lapPointsDiffer, lapPointsOf, raceMetres, type LapPoints } from './raceSplitDefs.ts';

export * from './raceSplitDefs.ts';

/* ------------------------------ the sports ------------------------------- */

export const TIMED_RACE_SPORTS = ['athletics', 'swimming', 'rowing', 'canoe', 'cycling'] as const;
export type TimedRaceSport = (typeof TIMED_RACE_SPORTS)[number];
export const isTimedRaceSport = (s?: string | null): s is TimedRaceSport => !!s && (TIMED_RACE_SPORTS as readonly string[]).includes(s);

/* ---------------------------- stats to track ----------------------------- */

/** What the meet captures beyond the result itself — the sport's "Stats to
 *  track" settings (`tournament.formats[sport]`). Off unless switched on,
 *  except swimming splits (on since SD-94, folded behind "＋ Splits"). */
export interface RaceTracking {
  /** reaction times from a start-information system / touchpads (athletics, swimming) */
  reaction: boolean;
  /** athletics: lap times in races of 400 m and longer */
  lapSplits: boolean;
  /** athletics: relay changeover times → each runner's leg */
  relayLegs: boolean;
  /** swimming 50 m splits / rowing 500 m / canoe intermediate times (the meet default) */
  splits: boolean;
  /** swimming relays: take-over times for legs 2–4 */
  takeovers: boolean;
  /** cycling: intermediate times (pursuit every 1000 m, TT laps, ITT time check) */
  cycSplits: boolean;
  /** athletics road races: the chip (net) time beside the official gun time */
  chipTimes: boolean;
  /** round 2 — athletics lap times: at the finish-line passes (default) or every 400 m from the start */
  lapPoints: LapPoints;
}

/** The on / off "Stats to track" keys (lapPoints is a choice). */
export type TrackKey = Exclude<keyof RaceTracking, 'lapPoints'>;
export const TRACK_KEYS: TrackKey[] = ['reaction', 'lapSplits', 'relayLegs', 'splits', 'takeovers', 'cycSplits', 'chipTimes'];

/**
 * The meet's "Stats to track" (`tournament.formats[sport]`) and — round 2 —
 * the event's own overrides (`PhaseFormat.track`; an absent key follows the
 * meet). A key that isn't the sport's stays off whatever an override says.
 */
export function raceTracking(sport: string | null | undefined, fmt?: Record<string, unknown> | null, own?: TrackOverrides | null): RaceTracking {
  const on = (k: TrackKey) => (typeof own?.[k] === 'boolean' ? own[k] === true : fmt?.[k] === true);
  return {
    reaction: (sport === 'athletics' || sport === 'swimming') && on('reaction'),
    lapSplits: sport === 'athletics' && on('lapSplits'),
    relayLegs: sport === 'athletics' && on('relayLegs'),
    splits: sport === 'swimming' ? (typeof own?.splits === 'boolean' ? own.splits : fmt?.splits !== false) : (sport === 'rowing' || sport === 'canoe') && on('splits'),
    takeovers: sport === 'swimming' && on('takeovers'),
    cycSplits: sport === 'cycling' && on('cycSplits'),
    chipTimes: sport === 'athletics' && on('chipTimes'),
    lapPoints: sport === 'athletics' ? lapPointsOf(own?.lapPoints ?? fmt?.lapPoints) : 'finish',
  };
}

/* ----------------------- round 2: per-event overrides ---------------------- */

export interface TrackOption {
  key: TrackKey | 'lapPoints';
  label: string;
  hint: string;
}

const OPT: Record<TrackKey | 'lapPoints', Omit<TrackOption, 'key'>> = {
  reaction: { label: 'Reaction times', hint: 'from a start-information system / the blocks' },
  lapSplits: { label: 'Lap times', hint: 'each runner every lap, with places at each split' },
  lapPoints: { label: 'Lap points', hint: 'where the lap times are read' },
  relayLegs: { label: 'Relay leg times', hint: 'the time at each changeover → every runner’s leg' },
  splits: { label: 'Splits', hint: 'intermediate times at the usual points' },
  takeovers: { label: 'Relay take-over times', hint: 'the pads’ reading for legs 2–4' },
  cycSplits: { label: 'Intermediate times', hint: 'every 1000 m / lap / the time check' },
  chipTimes: { label: 'Chip times', hint: 'the chip (net) time beside the official gun time' },
};

/**
 * The "Stats to track" an EVENT can set for itself (round 2 — the founder:
 * meet-wide and per-event), only the ones that mean something for it: a
 * 1500 m offers reaction, lap times and where they are read; a relay its leg
 * times; a swim relay its take-overs; a road race its chip times. [] = none
 * (field events, order races …).
 */
export function trackOptions(def: Pick<DisciplineDef, 'key' | 'sport' | 'teamSize' | 'capture' | 'tie' | 'unit'>, f?: Partial<Pick<PhaseFormat, 'road'>> | null): TrackOption[] {
  const keys: (TrackKey | 'lapPoints')[] = [];
  const timed = def.capture === 'single' && def.unit === 'time';
  if (def.sport === 'athletics') {
    if (def.tie === 'road') {
      if (/^ath\.(road|walk)\.(?!t)/.test(def.key) && f?.road?.timing !== 'chip') keys.push('chipTimes');
    } else if (timed) {
      keys.push('reaction');
      if (def.teamSize) { if (splitDistances(def.key).length) keys.push('relayLegs'); }
      else if (splitDistances(def.key).length) { keys.push('lapSplits'); if (lapPointsDiffer(def.key)) keys.push('lapPoints'); }
    }
  } else if (def.sport === 'swimming' && timed) {
    if (splitDistances(def.key).length) keys.push('splits');
    keys.push('reaction');
    if (def.teamSize) keys.push('takeovers');
  } else if (isCrewSport(def.sport)) {
    if (def.capture === 'single' && splitDistances(def.key).length) keys.push('splits');
  } else if (def.sport === 'cycling') {
    if (def.capture === 'single' && splitDistances(def.key).length) keys.push('cycSplits');
  }
  return keys.map((key) => ({ key, ...OPT[key] }));
}

/**
 * The event's overrides after setting one value: a value equal to what the
 * meet / phase gives anyway is dropped (the key follows the meet again), so
 * "back to the meet's choice" is just picking it. Undefined = no overrides.
 */
export function setTrackOverride(cur: TrackOverrides | null | undefined, key: TrackKey | 'lapPoints', value: boolean | LapPoints, base: RaceTracking): TrackOverrides | undefined {
  const next: TrackOverrides = { ...(cur ?? {}) };
  if (key === 'lapPoints') {
    if (value === base.lapPoints) delete next.lapPoints; else next.lapPoints = value as LapPoints;
  } else if (value === base[key]) delete next[key];
  else next[key] = value as boolean;
  return Object.keys(next).length ? next : undefined;
}

/**
 * What an event captures before its own overrides: the meet's choices, with
 * the phase's own flags where they decide (reaction set at creation, SD-90;
 * swimming / crew splits per phase, SD-94 / SD-99) — the base the per-event
 * card compares against (picking the base value drops the override).
 */
export function trackDefaults(sport: string | null | undefined, meet: Record<string, unknown> | null | undefined, f: Partial<Pick<PhaseFormat, 'reaction' | 'splits'>>): RaceTracking {
  const t = raceTracking(sport, meet);
  return {
    ...t,
    reaction: (sport === 'athletics' || sport === 'swimming') && (!!f.reaction || t.reaction),
    splits: sport === 'swimming' ? f.splits ?? true : isCrewSport(sport) ? !!f.splits : t.splits,
  };
}

/** What the event captures now: its defaults with its own overrides on top. */
export function trackEffective(sport: string | null | undefined, meet: Record<string, unknown> | null | undefined, f: Partial<Pick<PhaseFormat, 'reaction' | 'splits' | 'track'>>): RaceTracking {
  const base = trackDefaults(sport, meet, f);
  const own = f.track ?? {};
  // an override counts only for a key the sport has
  const pick = (k: TrackKey) => (typeof own[k] === 'boolean' ? own[k] === true && raceTracking(sport, { [k]: true })[k] : base[k]);
  return {
    reaction: pick('reaction'), lapSplits: pick('lapSplits'), relayLegs: pick('relayLegs'), splits: pick('splits'),
    takeovers: pick('takeovers'), cycSplits: pick('cycSplits'), chipTimes: pick('chipTimes'),
    lapPoints: sport === 'athletics' && own.lapPoints ? lapPointsOf(own.lapPoints) : base.lapPoints,
  };
}

/** Is a reaction-time box offered on this phase? The event's override, else the
 *  phase's own flag (set at creation, SD-90) or the meet's current choice.
 *  Not on the road (no start-information system on a road course). */
export function reactionOffered(def: Pick<DisciplineDef, 'sport' | 'unit'> & Partial<Pick<DisciplineDef, 'tie'>>, f: Pick<PhaseFormat, 'reaction'> & Partial<Pick<PhaseFormat, 'track'>>, meet: Pick<RaceTracking, 'reaction'>): boolean {
  if (def.unit !== 'time') return false;
  if (def.tie === 'road' && !f.reaction) return false;
  if (typeof f.track?.reaction === 'boolean') return f.track.reaction && (def.sport === 'athletics' || def.sport === 'swimming');
  return !!f.reaction || meet.reaction;
}

/**
 * Is the splits row offered for this phase on the entry screen? Swimming and
 * rowing / canoe keep their SD-94 / SD-99 behaviour exactly (the phase's own
 * `splits` flag, swimming on unless switched off); athletics and cycling read
 * the meet's "Stats to track" (so turning one on mid-meet works for events
 * already set up).
 */
export function splitsOffered(def: Pick<DisciplineDef, 'key' | 'sport' | 'teamSize' | 'capture'>, f: Pick<PhaseFormat, 'splits'> & Partial<Pick<PhaseFormat, 'track'>>, t: RaceTracking): boolean {
  if (def.capture !== 'single' || !splitDistances(def.key).length) return false;
  // round 2: the event's own choice wins over the phase's SD-94 / SD-99 flag
  const own = typeof f.track?.splits === 'boolean' ? f.track.splits : undefined;
  if (def.sport === 'swimming') return own ?? f.splits ?? true;
  if (isCrewSport(def.sport)) return own ?? !!f.splits;
  if (def.sport === 'athletics') return def.teamSize ? t.relayLegs : t.lapSplits;
  if (def.sport === 'cycling') return t.cycSplits;
  return false;
}

/* --------------------------- splits and laps ----------------------------- */

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export interface SplitPoint {
  /** metres from the start (the last point is the finish) */
  at: number;
  /** "200 m", "1100 m", "5 km", "50 yd" */
  label: string;
  /** cumulative time there (absent = not read) */
  time?: number;
  /** the segment since the previous point (a lap, a 50 m length, a 500 m section) */
  seg?: number;
}

/**
 * Round 2 — where THIS result's splits were read: an athletics race's lap
 * times read every 400 m from the start carry `lapsFrom: 'start'`; anything
 * else (every older result) reads at the discipline's usual points.
 */
export function splitDistancesFor(key: string, r?: Pick<EntryResult, 'lapsFrom'> | null): number[] {
  return key.startsWith('ath.') && r?.lapsFrom === 'start' ? athLapDistances(key, 'start') : splitDistances(key);
}

/** The lap points a result's split boxes use: its own when it has splits, else the meet's / event's choice. */
export function entryLapPoints(r: Pick<EntryResult, 'splits' | 'lapsFrom'>, t: Pick<RaceTracking, 'lapPoints'>): LapPoints {
  return r.splits?.some((x) => x != null) ? (r.lapsFrom === 'start' ? 'start' : 'finish') : t.lapPoints;
}

/** The split boxes on the entry screen for this result (athletics laps follow the lap-point choice). */
export function entrySplitDistances(def: Pick<DisciplineDef, 'key' | 'teamSize'>, r: Pick<EntryResult, 'splits' | 'lapsFrom'>, t: Pick<RaceTracking, 'lapPoints'>): number[] {
  return def.key.startsWith('ath.') && !def.teamSize ? athLapDistances(def.key, entryLapPoints(r, t)) : splitDistances(def.key);
}

/** The result after typing its splits: `lapsFrom: 'start'` only on athletics laps read from the start (absent = the usual points). */
export function resultWithSplits<R extends EntryResult>(r: R, splits: number[] | undefined, from: LapPoints): R {
  const { lapsFrom: _drop, ...rest } = r;
  void _drop;
  return { ...rest, splits, ...(splits?.length && from === 'start' ? { lapsFrom: 'start' as const } : {}) } as R;
}

/** The cumulative times at every split point and the finish, with each
 *  segment. [] when no split was recorded (old results look exactly as before). */
export function splitPoints(def: Pick<DisciplineDef, 'key'>, r: Pick<EntryResult, 'splits' | 'mark' | 'status' | 'lapsFrom'>, yards = false): SplitPoint[] {
  const ds = splitDistancesFor(def.key, r);
  if (!ds.length || !r.splits?.some((x) => x != null)) return [];
  const total = raceMetres(def.key);
  const pts: { at: number; time?: number }[] = ds.map((d, i) => ({ at: d, time: r.splits?.[i] ?? undefined }));
  if (total) pts.push({ at: total, time: (r.status ?? 'ok') === 'ok' && r.mark != null ? r.mark : undefined });
  let prev: number | undefined = 0;
  return pts.map((p) => {
    const seg = p.time != null && prev != null ? round3(p.time - prev) : undefined;
    prev = p.time;
    return { at: p.at, label: yards ? `${p.at} yd` : distanceLabel(p.at), ...(p.time != null ? { time: p.time } : {}), ...(seg != null ? { seg } : {}) };
  });
}

/** Each entry's place at every split point (1 = leading), among the entries
 *  with a time there. Index i = splitDistances(...)[i]. */
export function splitPlaces(rows: { id: string; result: Pick<EntryResult, 'splits'> }[], points: number): Map<string, (number | undefined)[]> {
  const out = new Map<string, (number | undefined)[]>(rows.map((r) => [r.id, new Array(points).fill(undefined)]));
  for (let i = 0; i < points; i++) {
    const timed = rows.filter((r) => r.result.splits?.[i] != null).sort((a, b) => (a.result.splits![i] as number) - (b.result.splits![i] as number));
    timed.forEach((r, j) => {
      // equal times share the place
      const first = timed.findIndex((x) => x.result.splits![i] === r.result.splits![i]);
      out.get(r.id)![i] = (first >= 0 ? first : j) + 1;
    });
  }
  return out;
}

/**
 * Round 2 — each entry's place at each of ITS OWN split points (1 = leading),
 * among the entries timed at that same distance. Rows may read different
 * points (an organiser switched the lap points mid-heat); index i =
 * splitDistancesFor(key, row)[i]. Equal times share the place.
 */
export function splitPlacesFor(def: Pick<DisciplineDef, 'key'>, rows: { id: string; result: Pick<EntryResult, 'splits' | 'lapsFrom'> }[]): Map<string, (number | undefined)[]> {
  const at = rows.map((r) => ({ id: r.id, ds: splitDistancesFor(def.key, r.result), sp: r.result.splits ?? [] }));
  const byDist = new Map<number, number[]>();
  for (const a of at) a.ds.forEach((d, i) => { const t = a.sp[i]; if (t != null) byDist.set(d, [...(byDist.get(d) ?? []), t]); });
  const placeAt = (d: number, t: number) => (byDist.get(d) ?? []).filter((x) => x < t).length + 1;
  return new Map(at.map((a) => [a.id, a.ds.map((d, i) => (a.sp[i] != null ? placeAt(d, a.sp[i] as number) : undefined))]));
}

/** "led at every split" / "came from 4th at 1100 m" / "took the lead by 1000 m" —
 *  the winner's race from the splits, or null without them. */
export function winnerSplitStory(def: Pick<DisciplineDef, 'key'>, rows: RankedEntry[]): string | null {
  const win = rows.find((r) => r.position === 1);
  const ds = win ? splitDistancesFor(def.key, win.entry.result) : [];
  if (!ds.length || !win || !win.entry.result.splits?.some((x) => x != null)) return null;
  const places = splitPlacesFor(def, rows.filter((r) => r.status === 'ok').map((r) => ({ id: r.id, result: r.entry.result }))).get(win.id) ?? [];
  const known = places.map((p, i) => ({ p, at: ds[i] })).filter((x) => x.p != null) as { p: number; at: number }[];
  if (!known.length) return null;
  if (known.every((x) => x.p === 1)) return known.length > 1 ? 'led at every split' : `led at ${distanceLabel(known[0].at)}`;
  const last = known[known.length - 1];
  if (last.p > 1) return `came from ${raceOrdinal(last.p)} at ${distanceLabel(last.at)}`;
  const took = known.find((x, i) => x.p === 1 && known.slice(i).every((y) => y.p === 1));
  return took ? `took the lead by ${distanceLabel(took.at)}` : null;
}

/** The fastest segment over the last split → finish (the last lap / length / 500 m).
 *  Round 2: like is compared with like — when rows read different lap points,
 *  the last segment most of them share (the first one on a tie). */
export function fastestFinish(def: Pick<DisciplineDef, 'key'>, rows: RankedEntry[]): { id: string; name: string; seg: number; label: string } | null {
  const segs: { id: string; name: string; seg: number; label: string }[] = [];
  for (const r of rows) {
    if (r.status !== 'ok') continue;
    const pts = splitPoints(def, r.entry.result);
    const lastSeg = pts[pts.length - 1];
    if (!lastSeg?.seg || pts.length < 2) continue;
    const from = pts[pts.length - 2];
    segs.push({ id: r.id, name: r.entry.name, seg: lastSeg.seg, label: `${lastSeg.at - from.at} m` });
  }
  if (!segs.length) return null;
  const count = (l: string) => segs.filter((x) => x.label === l).length;
  const label = segs.map((x) => x.label).reduce((a, b) => (count(b) > count(a) ? b : a));
  return segs.filter((x) => x.label === label).reduce((a, b) => (b.seg < a.seg ? b : a));
}

/* ------------------------------ relay legs ------------------------------- */

/** Below −0.03 s a take-over is early on the pads (World Aquatics; a judge
 *  confirms the disqualification — SW 10.13). From memory: verify. */
export const TAKEOVER_TOLERANCE = 0.03;
export const takeoverEarly = (t: number | null | undefined): boolean => t != null && t < -TAKEOVER_TOLERANCE - 1e-9;
/** A take-over reading an official could have typed: −1 … +3 s. */
export const takeoverPlausible = (t: number): boolean => Number.isFinite(t) && t >= -1 && t <= 3;
export const takeoversOffered = (def: Pick<DisciplineDef, 'sport' | 'teamSize'>, t: RaceTracking): boolean => def.sport === 'swimming' && !!def.teamSize && t.takeovers;
/** A chip-time box beside the gun time: a road race / walk (not cross-country, not a track walk) timed by the gun. */
export const chipOffered = (def: Pick<DisciplineDef, 'key' | 'tie'>, f: Pick<PhaseFormat, 'road'>, t: RaceTracking): boolean =>
  t.chipTimes && def.tie === 'road' && /^ath\.(road|walk)\.(?!t)/.test(def.key) && f.road?.timing !== 'chip';

export interface RelayLeg {
  leg: number;
  name?: string;
  playerId?: string;
  /** the leg's time (leg 1 includes the reaction) */
  time?: number;
  /** swimming: the take-over reading for this leg (legs 2–4) */
  takeover?: number;
  early?: boolean;
}

/** Legs in a team race: athletics relays and swimming relays (4), the team sprint (3 riders, a lap each). */
const legCount = (def: Pick<DisciplineDef, 'key' | 'teamSize'>): number | null => {
  if (!def.teamSize) return null;
  if (/^ath\.4x/.test(def.key) || swimEventOf(def.key)?.relay) return 4;
  if (/^cyc\.ts\./.test(def.key)) return 3;
  return null;
};

/** Each leg of a relay / team sprint from the changeover splits (and the
 *  swimming take-overs), or null when none were recorded. */
export function relayLegs(def: Pick<DisciplineDef, 'key' | 'teamSize'>, r: Pick<EntryResult, 'splits' | 'mark' | 'status' | 'members' | 'takeovers'>): RelayLeg[] | null {
  const n = legCount(def);
  const total = raceMetres(def.key);
  if (!n || !total) return null;
  const hasSplits = !!r.splits?.some((x) => x != null);
  const hasTo = !!r.takeovers?.some((x) => x != null);
  if (!hasSplits && !hasTo) return null;
  const ds = splitDistances(def.key);
  const leg = total / n;
  const cum: (number | undefined)[] = [0];
  for (let k = 1; k < n; k++) { const i = ds.indexOf(leg * k); cum.push(i >= 0 ? r.splits?.[i] ?? undefined : undefined); }
  cum.push((r.status ?? 'ok') === 'ok' && r.mark != null ? r.mark : undefined);
  const out: RelayLeg[] = [];
  for (let k = 1; k <= n; k++) {
    const a = cum[k - 1], b = cum[k];
    const m = r.members?.[k - 1];
    const to = k >= 2 ? r.takeovers?.[k - 2] : undefined;
    out.push({
      leg: k, ...(m?.name ? { name: m.name } : {}), ...(m?.playerId ? { playerId: m.playerId } : {}),
      ...(a != null && b != null && b > a ? { time: round3(b - a) } : {}),
      ...(to != null ? { takeover: to, early: takeoverEarly(to) } : {}),
    });
  }
  return out;
}

/** "−0.05" / "+0.21" (seconds, two decimals). */
export const takeoverText = (t: number): string => `${t < 0 ? '−' : '+'}${Math.abs(t).toFixed(2)}`;

/** A typed take-over: "0.21", "-0.05", "−.05", or hundredths digits "21" / "-5"
 *  (the pad display). undefined = blank; NaN = can't read it / not plausible. */
export function parseTakeover(text: string): number | undefined {
  const t = text.trim().replace(/[−–]/g, '-').replace(',', '.');
  if (!t) return undefined;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  let v = Number(t);
  if (!/\./.test(t)) v = v / 100;
  v = Math.round(v * 100) / 100;
  return takeoverPlausible(v) ? v : NaN;
}

/* ------------------------- athletics DQ reasons ------------------------- */

/** World Athletics disqualifications an official picks from (Technical Rules,
 *  2024 numbering as remembered — verify against the current C&T Rules).
 *  `when` limits a reason to the races it can happen in. A false start is the
 *  FS status (TR 16.8); race-walk red cards live on the road card (TR 54.7). */
export const ATH_DQ: { ref: string; label: string; when?: 'lanes' | 'break' | 'hurdles' | 'relay' }[] = [
  { ref: 'TR 17.3', label: 'Lane infringement', when: 'lanes' },
  { ref: 'TR 17.5', label: 'Left the lane before the break line', when: 'break' },
  { ref: 'TR 17.2', label: 'Obstruction (jostling)' },
  { ref: 'TR 22.6', label: 'Hurdle: trail leg / knocked down', when: 'hurdles' },
  { ref: 'TR 24.7', label: 'Baton passed outside the zone', when: 'relay' },
  { ref: 'TR 24.6', label: 'Dropped baton not recovered', when: 'relay' },
  { ref: 'TR 6', label: 'Unauthorised assistance' },
  { ref: 'TR 7.1', label: 'Unsporting conduct' },
];

/** Batch 6: UCI reasons a commissaire's DQ is usually for (Part 2 road / Part 3
 *  track, as remembered — verify the article numbers before quoting them). A
 *  relegation is NOT a DQ: it is the "REL" chip (the rider stays classified). */
export const CYC_DQ: { ref: string; label: string }[] = [
  { ref: 'UCI sprint', label: 'Irregular sprint — left the line / blocked a rider' },
  { ref: 'UCI dangerous', label: 'Dangerous riding' },
  { ref: 'UCI keirin', label: 'Passed the pacer before it left the track (keirin)' },
  { ref: 'UCI assistance', label: 'Pushing, pulling or pacing help' },
  { ref: 'UCI equipment', label: 'Bike or equipment not to the rules' },
  { ref: 'UCI conduct', label: 'Unsporting conduct' },
];

/** Batch 6: rowing / canoe — exclusion from THIS race and disqualification
 *  from the whole regatta are different penalties (World Rowing Rules of
 *  Racing; ICF: verify), plus the weight / boat checks. `cox` = coxed boats only;
 *  `sport` limits a reason to one federation. */
export const CREW_DQ: { ref: string; label: string; cox?: boolean; sport?: 'rowing' | 'canoe' }[] = [
  { ref: 'Exclusion', label: 'Excluded from this race' },
  { ref: 'Disqualification', label: 'Disqualified from the regatta' },
  { ref: 'Boat weight', label: 'Boat under the minimum weight' },
  { ref: 'Cox weight', label: 'Cox under weight (no dead weight carried)', cox: true, sport: 'rowing' },
  { ref: 'Boat check', label: 'Boat failed the boat check (ICF)', sport: 'canoe' },
  { ref: 'Lane', label: 'Left the lane / interfered with another crew' },
];

/** Batch 6: the DQ reasons an official picks from for a race — athletics (TR),
 *  cycling (UCI), rowing / canoe (exclusion vs regatta DQ, weight, boat check).
 *  Swimming has its own (SW, by stroke and leg); [] elsewhere. */
export function raceDqCodesFor(def: Pick<DisciplineDef, 'key' | 'sport' | 'capture' | 'lanes' | 'teamSize'>): { ref: string; label: string }[] {
  if (def.sport === 'athletics') return def.capture === 'single' ? athDqCodesFor(def) : [];
  if (def.sport === 'cycling') return CYC_DQ;
  if (isCrewSport(def.sport)) {
    const coxed = crewEventOf(def.key)?.boat.cox === true;
    return CREW_DQ.filter((c) => (!c.cox || coxed) && (!c.sport || c.sport === def.sport)).map(({ ref, label }) => ({ ref, label }));
  }
  return [];
}

/** A reason picked from a DQ list (athletics, batch 6: cycling, crews) no longer matches a rule reference typed over it (clear it). */
export const athDqReasonStale = (r: Pick<EntryResult, 'reason'>, newRef: string | undefined): boolean => {
  const c = [...ATH_DQ, ...CYC_DQ, ...CREW_DQ].find((x) => x.label === r.reason);
  return !!c && c.ref !== (newRef ?? '').trim();
};

/** The DQ reasons for an athletics track race (lanes, break line, hurdles, relays). */
export function athDqCodesFor(def: Pick<DisciplineDef, 'key' | 'lanes' | 'teamSize'>): typeof ATH_DQ {
  const hurdles = /mh$/.test(def.key);
  const relay = !!def.teamSize;
  const lanes = !!def.lanes;
  // the break line: 800 m (TR 17.5), 4 × 400 m after the first bend of leg 2, 4 × 200 m (verify)
  const brk = ['ath.800m', 'ath.4x400', 'ath.4x200'].includes(def.key);
  return ATH_DQ.filter((c) => !c.when || (c.when === 'lanes' && lanes) || (c.when === 'break' && brk) || (c.when === 'hurdles' && hurdles) || (c.when === 'relay' && relay));
}

/* ---------------------------- reaction times ----------------------------- */

export interface ReactionSummary { fastest: { id: string; name: string; rt: number }; mean: number; n: number; under100: string[] }

/** The heat's reaction times (individual races): fastest, average, any under 0.100 s (athletics TR 16.6). */
export function reactionSummary(rows: RankedEntry[], sport: string): ReactionSummary | null {
  const rts = rows.filter((r) => r.entry.athleteId && r.status !== 'DNS' && r.entry.result.reaction != null).map((r) => ({ id: r.id, name: r.entry.name, rt: r.entry.result.reaction as number }));
  if (!rts.length) return null;
  const fastest = rts.reduce((a, b) => (b.rt < a.rt ? b : a));
  const mean = Math.round((rts.reduce((a, b) => a + b.rt, 0) / rts.length) * 1000) / 1000;
  return { fastest, mean, n: rts.length, under100: sport === 'athletics' ? rts.filter((x) => x.rt < 0.1).map((x) => x.name) : [] };
}

/* ------------------------------- margins --------------------------------- */

/** Each placed entry's gap to the winner in the mark's unit (a time race:
 *  seconds behind; a field event: metres short). The winner has none. */
export function gapsToWinner(rows: RankedEntry[], def: Pick<DisciplineDef, 'better' | 'dp'>): Map<string, number> {
  const out = new Map<string, number>();
  const win = rows.find((r) => r.position === 1 && r.best != null);
  if (!win) return out;
  const scale = 10 ** Math.max(def.dp, 2);
  for (const r of rows) {
    if (r === win || r.position == null || r.best == null) continue;
    const g = Math.round(Math.abs(r.best - (win.best as number)) * scale) / scale;
    out.set(r.id, g);
  }
  return out;
}

/** "+0.13" for a time, "−0.24 m" for a distance / height. */
export const raceGapText = (g: number, def: Pick<DisciplineDef, 'unit' | 'dp'>): string =>
  def.unit === 'time' ? `+${g.toFixed(Math.max(def.dp, 2))}` : def.unit === 'distance' || def.unit === 'height' ? `−${g.toFixed(2)} m` : `−${g}`;

/* ------------------------- one phase, ranked -------------------------- */

export interface PhaseRanking {
  /** the discipline as raced at this phase (venue lanes, meet rules) */
  def: DisciplineDef;
  /** heat → its rows (Q / q added). A timed final / lettered finals: each heat's rows keep their overall place. */
  heats: Map<number, RankedEntry[]>;
  /** a timed final or lettered finals ranked as one */
  overall?: RankedEntry[];
  /** rowing / canoe: where each crew goes next ("Final A", "Repechage 1") */
  dest: Map<string, string>;
  timedFinal: boolean;
  raceFinal: boolean;
}

/** A phase ranked the way the results screen ranks it (per heat with Q / q, or
 *  across heats for a timed final / Finals A / B), without record flags. */
export function phaseRanking(p: { format: PhaseFormat; entries: ResultEntry[] }): PhaseRanking | null {
  const f = p.format;
  const base = disciplineOf(f.discipline);
  if (!base) return null;
  const def = phaseDiscipline(base, f);
  const o = { handLegal: looseLegal(f) };
  const raceFinal = f.phase === 'final' && (f.races?.length ?? 0) > 1;
  const timedFinal = f.phase === 'final' && f.heats > 1 && def.capture === 'single' && !raceFinal;
  const heatNos = [...new Set(p.entries.map((e) => e.heat))].sort((a, b) => a - b);
  const dest = new Map<string, string>();
  if (timedFinal || raceFinal) {
    const all = rankEntries(p.entries, def, o);
    return { def, heats: new Map(heatNos.map((h) => [h, all.filter((r) => r.entry.heat === h)])), overall: all, dest, timedFinal, raceFinal };
  }
  const byHeat = rankByHeat(p.entries, def, o);
  const prog = f.progression;
  if (prog?.routes?.length) {
    const routing = routeCrews(byHeat, prog);
    for (const [id, d] of routing.dest) dest.set(id, routeTarget(f.plan, d));
    return { def, heats: byHeat, dest, timedFinal, raceFinal };
  }
  if (!prog || prog.stage) return { def, heats: byHeat, dest, timedFinal, raceFinal };
  const q = qualify(byHeat, def, prog);
  return { def, heats: new Map([...byHeat].map(([h, rows]) => [h, withQualification(rows, q)])), dest, timedFinal, raceFinal };
}

/** "Heat 2", "Semi-final 1", "Final", "Final B", "Repechage 1", "Group A",
 *  "Stage 3", a combined event's "3. Shot put". */
export function heatName(f: Pick<PhaseFormat, 'phase' | 'heats' | 'races' | 'discipline' | 'combined' | 'phaseNo'>, heat: number): string {
  if (f.combined) return `${combinedPhaseName(f)}${f.heats > 1 ? ` · heat ${heat}` : ''}`;
  if (f.phase === 'final' && (f.races?.length ?? 0) > 1) {
    if (f.discipline.startsWith('cyc.')) return heat === 1 ? 'Final for gold' : 'Final for bronze';
    return `Final ${f.races![heat - 1] ?? heat}`;
  }
  if (f.phase === 'final') return f.heats > 1 ? `Final, heat ${heat}` : 'Final';
  if (f.phase === 'semi') return f.heats > 1 ? `Semi-final ${heat}` : 'Semi-final';
  if (f.phase === 'repechage') return f.heats > 1 ? `Repechage ${heat}` : 'Repechage';
  if (f.phase === 'qualification') return f.heats > 1 ? `Group ${String.fromCharCode(64 + heat)}` : 'Qualification';
  if (f.phase === 'stage') return `Stage ${f.phaseNo}`;
  return `Heat ${heat}`;
}

/** Short round tag for a path step: "H2", "SF1", "R1", "F", "FB", "Q". */
export function roundTag(f: Pick<PhaseFormat, 'phase' | 'heats' | 'races' | 'discipline'>, heat: number): string {
  if (f.phase === 'final') return (f.races?.length ?? 0) > 1 ? `F${f.races![heat - 1] ?? ''}` : 'F';
  if (f.phase === 'semi') return `SF${f.heats > 1 ? heat : ''}`;
  if (f.phase === 'repechage') return `R${f.heats > 1 ? heat : ''}`;
  if (f.phase === 'qualification') return f.heats > 1 ? `Q${String.fromCharCode(64 + heat)}` : 'Q';
  return `H${heat}`;
}

/* --------------------------- rounds: the path ---------------------------- */

export interface PathStep {
  phaseId: string;
  /** "H2", "SF1", "F" */
  tag: string;
  place: number | null;
  /** "1", "=3", "DNF" */
  label: string;
  mark: string;
  flags: ResultFlag[];
  /** where a crew went next ("Final A") */
  next?: string;
}
export interface AthletePath { key: string; name: string; team?: string; steps: PathStep[] }

/** A stable identity across rounds: the athlete, or the relay team / crew. */
export const pathKey = (e: ResultEntry): string => e.athleteId ?? `team:${e.result.team?.id ?? e.team?.id ?? e.name}`;

/**
 * Every athlete's / team's path through an event's rounds — "H2 12.61 Q →
 * SF1 12.50 q → F 12.48" — for events with more than one round. Ordered by
 * the furthest round reached, then the place there. `flags` per phase id add
 * the PB / SB / record markers the caller knows (the live phase).
 */
export function progressionPaths(phases: { id: string; format: PhaseFormat; entries: ResultEntry[] }[], flags?: Map<string, Map<string, ResultFlag[]>>): AthletePath[] {
  const sorted = [...phases].filter((p) => !p.format.combined).sort((a, b) => a.format.phaseNo - b.format.phaseNo);
  if (sorted.length < 2) return [];
  const paths = new Map<string, AthletePath & { depth: number; lastPlace: number }>();
  sorted.forEach((p, depth) => {
    const pr = phaseRanking(p);
    if (!pr) return;
    const extra = flags?.get(p.id);
    for (const [heat, rows] of pr.heats) {
      for (const r of rows) {
        const k = pathKey(r.entry);
        const cur = paths.get(k) ?? { key: k, name: r.entry.name, team: r.entry.team?.name || undefined, steps: [], depth: 0, lastPlace: 999 };
        const fl = [...r.flags, ...(extra?.get(r.id) ?? []).filter((x) => !r.flags.includes(x))];
        cur.steps.push({
          phaseId: p.id, tag: roundTag(p.format, heat), place: r.position, label: r.label, mark: r.bestText,
          flags: fl, ...(pr.dest.get(r.id) ? { next: pr.dest.get(r.id) } : {}),
        });
        cur.depth = depth;
        cur.lastPlace = r.position ?? 999;
        paths.set(k, cur);
      }
    }
  });
  return [...paths.values()]
    .sort((a, b) => b.depth - a.depth || a.lastPlace - b.lastPlace || a.name.localeCompare(b.name))
    .map(({ key, name, team, steps }) => ({ key, name, ...(team ? { team } : {}), steps }));
}

/** "H2 12.61 (2) Q → SF1 12.50 (3) q → F 12.48 (1)". */
export function pathText(p: AthletePath): string {
  return p.steps.map((s) => `${s.tag} ${s.mark || s.label || '–'}${s.place != null ? ` (${s.label})` : ''}${s.flags.filter((f) => f === 'Q' || f === 'q').map((f) => ` ${f}`).join('')}${s.next ? ` → ${s.next}` : ''}`).join(' → ');
}

/* --------------------------- the heat, analysed --------------------------- */

export interface HeatAnalysis {
  heat: number;
  /** split points (labels) and, per entry with splits, its points and places */
  splitLabels: string[];
  splits: { id: string; name: string; points: SplitPoint[]; places: (number | undefined)[] }[];
  story: string | null;
  fastestFinish: ReturnType<typeof fastestFinish>;
  legs: { id: string; name: string; legs: RelayLeg[] }[];
  fastestLeg: { name: string; team: string; leg: number; time: number } | null;
  reaction: ReactionSummary | null;
  gaps: Map<string, number>;
}

/** Everything the race-analysis card shows for one heat (only what was recorded). */
export function heatAnalysis(def: DisciplineDef, heat: number, rows: RankedEntry[], yards = false): HeatAnalysis {
  const total = raceMetres(def.key);
  const withSplits = rows.filter((r) => r.entry.result.splits?.some((x) => x != null));
  // round 2: every point any row was read at (athletics laps at the finish line or from the start)
  const ds = [...new Set(withSplits.flatMap((r) => splitDistancesFor(def.key, r.entry.result)))].sort((a, b) => a - b);
  const places = splitPlacesFor(def, rows.filter((r) => r.status === 'ok').map((r) => ({ id: r.id, result: r.entry.result })));
  const legs = def.teamSize ? rows.flatMap((r) => { const l = relayLegs(def, r.entry.result); return l ? [{ id: r.id, name: r.entry.name, legs: l }] : []; }) : [];
  let fastestLeg: HeatAnalysis['fastestLeg'] = null;
  // leg 1 includes the reaction (a standing start) — the fastest leg is from the flying legs when there are any
  for (const t of legs) for (const l of t.legs) {
    if (l.time == null || (l.leg === 1 && t.legs.length > 1)) continue;
    if (!fastestLeg || l.time < fastestLeg.time) fastestLeg = { name: l.name ?? `Leg ${l.leg}`, team: t.name, leg: l.leg, time: l.time };
  }
  return {
    heat,
    splitLabels: withSplits.length ? [...ds, ...(total ? [total] : [])].map((d) => (yards ? `${d} yd` : distanceLabel(d))) : [],
    splits: def.teamSize && /^(ath|swim)\./.test(def.key) ? [] : withSplits.map((r) => ({ id: r.id, name: r.entry.name, points: splitPoints(def, r.entry.result, yards), places: places.get(r.id) ?? [] })),
    story: winnerSplitStory(def, rows),
    fastestFinish: def.teamSize ? null : fastestFinish(def, rows),
    legs,
    fastestLeg,
    reaction: reactionSummary(rows, def.sport),
    gaps: def.capture === 'single' || def.capture === 'attempts' || def.capture === 'heights' ? gapsToWinner(rows, def) : new Map(),
  };
}

/** Is there anything beyond the result sheet to show for this heat? */
export const hasAnalysis = (a: HeatAnalysis): boolean => a.splits.length > 0 || a.legs.length > 0 || !!a.reaction;

/* ------------------------------- helpers -------------------------------- */

export const raceOrdinal = (n: number): string => { const v = n % 100; return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'}`; };

/** "12.48" / "1:58.40" in the discipline's precision. */
export const markText = (v: number | undefined | null, def: Pick<DisciplineDef, 'unit' | 'dp'>): string => formatMark(v ?? null, def);
