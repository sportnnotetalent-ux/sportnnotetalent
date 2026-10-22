/**
 * Deep wave (cricket) — the OPTIONAL per-delivery detail a scorer can switch
 * on under "Stats to track" (Match rules): a pitch map (length + line), shot
 * control (false shots: beaten / edged / mistimed), ball speed from a speed
 * gun, and where a catch was taken; plus each bowler's type (pace / spin),
 * which can also come free from the player's profile.
 *
 * Default scoring is unchanged: all of this rides on two NEW score-neutral
 * actions (`BALL_DETAIL`, `SET_BOWL_TYPE`, `v: 2`) and an optional `btype` on
 * SET_BOWLER, so every older log replays to the byte-identical state.
 *
 * Pure and JSX-free (node tests load it — note the `.ts` imports). Only TYPE
 * imports from engine.ts (engine.ts imports the values below).
 */
import type { BallRec } from './engine.ts';

// ─── Vocabularies ─────────────────────────────────────────────────────────────

/** Where the ball pitched, from the bowler's end down to the batter. */
export const LENGTHS = ['bouncer', 'short', 'good', 'full', 'yorker', 'fulltoss'] as const;
export type Length = typeof LENGTHS[number];
export const LENGTH_LABEL: Record<Length, string> = {
  bouncer: 'Bouncer', short: 'Short', good: 'Good length', full: 'Full', yorker: 'Yorker', fulltoss: 'Full toss',
};
/** As commentary reads it: "short of a length", "a yorker". */
const LENGTH_PHRASE: Record<Length, string> = {
  bouncer: 'a bouncer', short: 'short of a length', good: 'on a good length', full: 'full', yorker: 'a yorker', fulltoss: 'a full toss',
};

/** The line, relative to the batter (so a left-hander's "off" is their off side). */
export const LINES = ['wideOff', 'off', 'stumps', 'leg', 'wideLeg'] as const;
export type Line = typeof LINES[number];
export const LINE_LABEL: Record<Line, string> = {
  wideOff: 'Wide off', off: 'Off', stumps: 'Stumps', leg: 'Leg', wideLeg: 'Wide leg',
};
const LINE_PHRASE: Record<Line, string> = {
  wideOff: 'wide outside off', off: 'outside off', stumps: 'on the stumps', leg: 'on the pads', wideLeg: 'down the leg side',
};

/** A false shot (CricViz "control"): the batter wasn't in control of it. An
 *  untagged ball faced while control tracking was on counts as in control. */
export const CONTROLS = ['beaten', 'edged', 'mistimed'] as const;
export type Control = typeof CONTROLS[number];
export const CONTROL_LABEL: Record<Control, string> = { beaten: 'Beaten', edged: 'Edged', mistimed: 'Mistimed' };

/** Bowling types (ESPNcricinfo style codes). Pace: RF RM LF LM; spin: OB LB SLA LWS. */
export const BOWL_TYPES = ['RF', 'RM', 'OB', 'LB', 'LF', 'LM', 'SLA', 'LWS'] as const;
export type BowlType = typeof BOWL_TYPES[number];
export const BOWL_TYPE_LABEL: Record<BowlType, string> = {
  RF: 'Right-arm fast', RM: 'Right-arm medium', OB: 'Right-arm off-spin', LB: 'Right-arm leg-spin',
  LF: 'Left-arm fast', LM: 'Left-arm medium', SLA: 'Left-arm orthodox', LWS: 'Left-arm wrist-spin',
};
export const isPace = (t: BowlType): boolean => t === 'RF' || t === 'RM' || t === 'LF' || t === 'LM';
/** The four kinds a scorer picks (the arm comes from the profile or a toggle). */
export const BOWL_KINDS = ['fast', 'medium', 'finger', 'wrist'] as const;
export type BowlKind = typeof BOWL_KINDS[number];
export const BOWL_KIND_LABEL: Record<BowlKind, string> = { fast: 'Fast', medium: 'Medium', finger: 'Finger spin', wrist: 'Wrist spin' };
export function bowlTypeCode(kind: BowlKind, leftArm: boolean): BowlType {
  if (kind === 'fast') return leftArm ? 'LF' : 'RF';
  if (kind === 'medium') return leftArm ? 'LM' : 'RM';
  if (kind === 'finger') return leftArm ? 'SLA' : 'OB';
  return leftArm ? 'LWS' : 'LB';
}
export const bowlKindOf = (t: BowlType): BowlKind =>
  (t === 'RF' || t === 'LF' ? 'fast' : t === 'RM' || t === 'LM' ? 'medium' : t === 'OB' || t === 'SLA' ? 'finger' : 'wrist');
export const isLeftArm = (t: BowlType): boolean => t.startsWith('L') || t === 'SLA';
/** The profile's "Bowling type" option (sportProfileFields) → kind. */
const PROFILE_KIND: Record<string, BowlKind> = { Fast: 'fast', Medium: 'medium', 'Finger spin': 'finger', 'Wrist spin': 'wrist' };
/** A bowler's type from their cricket profile sides ({ bowl: 'Left-arm', bowlType: 'Wrist spin' }), else null. */
export function bowlTypeFromProfile(sides?: Record<string, string> | null): BowlType | null {
  const kind = PROFILE_KIND[sides?.bowlType ?? ''];
  if (!kind || sides?.bowl === "Doesn't bowl") return null;
  return bowlTypeCode(kind, sides?.bowl === 'Left-arm');
}
export const asBowlType = (v: unknown): BowlType | null =>
  ((BOWL_TYPES as readonly string[]).includes(String(v)) ? (v as BowlType) : null);

/** Fielding positions for a wagon zone (1–8, right-hander frame) in the ring or deep. */
const POSITIONS: [string, string][] = [
  ['mid-off', 'long-off'], ['cover', 'deep cover'], ['point', 'deep point'], ['the slips', 'third man'],
  ['short fine leg', 'fine leg'], ['square leg', 'deep square leg'], ['mid-wicket', 'deep mid-wicket'], ['mid-on', 'long-on'],
];
export const fieldPosition = (zone: number, deep?: boolean): string => POSITIONS[zone - 1]?.[deep ? 1 : 0] ?? '';

// ─── The record ───────────────────────────────────────────────────────────────

/** One delivery's optional detail. Keyed by innings + side + the delivery's
 *  ordinal `d` in that innings (1-based; wides and no-balls count, so two
 *  wides in a row stay apart); `at` is its stamp ("12.4") — a guard: after an
 *  "Edit a past ball" shifts the deliveries, a record whose stamp no longer
 *  matches is ignored rather than shown on the wrong ball. */
export interface BallDetailRec {
  inn: 1 | 2;
  side: 'home' | 'away';
  d: number;
  at: string;
  batterId?: string;
  bowlerId?: string;
  len?: Length;
  line?: Line;
  ctrl?: Control;
  /** km/h, typed from a speed gun (40–180) */
  kph?: number;
  /** a catch: where it was taken (zone 1–8, right-hander frame) and deep */
  cz?: number;
  cdeep?: true;
}

const FIELDS = ['len', 'line', 'ctrl', 'kph', 'cz', 'cdeep'] as const;
const text = (v: unknown): string | undefined => {
  const x = typeof v === 'string' ? v.trim().slice(0, 80) : '';
  return x || undefined;
};
/** A speed worth keeping: a whole km/h 40–180, else null. */
export const asKph = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 40 && n <= 180 ? n : null;
};

/**
 * Apply one BALL_DETAIL payload to the list: merge the given fields into the
 * delivery's record (a `null` clears that field; a record left with nothing
 * goes). Returns the new list, or null when the payload is invalid or changes
 * nothing (the reducer then returns the state untouched).
 */
export function applyDetailPatch(list: BallDetailRec[] | undefined, p: Record<string, unknown>): BallDetailRec[] | null {
  if (p.v !== 2) return null;
  const inn: 1 | 2 = p.inn === 2 ? 2 : 1;
  const side = p.side === 'home' || p.side === 'away' ? p.side : null;
  const d = Math.floor(Number(p.d));
  const at = text(p.at);
  if (!side || !Number.isFinite(d) || d < 1 || !at) return null;
  const patch: Partial<Record<(typeof FIELDS)[number], unknown>> = {};
  let any = false;
  const take = (k: (typeof FIELDS)[number], ok: (v: unknown) => unknown) => {
    if (!(k in p)) return;
    if (p[k] === null) { patch[k] = null; any = true; return; }
    const v = ok(p[k]);
    if (v !== null && v !== undefined) { patch[k] = v; any = true; }
  };
  take('len', (v) => ((LENGTHS as readonly string[]).includes(String(v)) ? v : null));
  take('line', (v) => ((LINES as readonly string[]).includes(String(v)) ? v : null));
  take('ctrl', (v) => ((CONTROLS as readonly string[]).includes(String(v)) ? v : null));
  take('kph', asKph);
  take('cz', (v) => { const z = Number(v); return Number.isInteger(z) && z >= 1 && z <= 8 ? z : null; });
  take('cdeep', (v) => (v === true ? true : null));
  if (!any) return null;
  const all = list ?? [];
  const same = (x: BallDetailRec) => x.inn === inn && x.side === side && x.d === d;
  const prev = all.find(same);
  const rec: BallDetailRec = { ...(prev ?? { inn, side, d, at }), at };
  const batterId = text(p.batterId);
  const bowlerId = text(p.bowlerId);
  if (batterId) rec.batterId = batterId;
  if (bowlerId) rec.bowlerId = bowlerId;
  const r = rec as unknown as Record<string, unknown>;
  for (const k of FIELDS) {
    if (!(k in patch)) continue;
    if (patch[k] === null) delete r[k];
    else r[k] = patch[k];
  }
  if (r.cz === undefined) delete r.cdeep;
  const rest = all.filter((x) => !same(x));
  const empty = FIELDS.every((k) => r[k] === undefined);
  const next = empty ? rest : [...rest, rec];
  if (prev && !empty && JSON.stringify(prev) === JSON.stringify(rec)) return null;
  if (!prev && empty) return null;
  return next;
}

// ─── Joining the detail to the ball log ───────────────────────────────────────

/** A real delivery (a chip in the over strip) — not a penalty, a retirement or a Mankad. */
export const isDeliveryRec = (r: BallRec): boolean => r.sym !== undefined && !r.cross && r.out?.kind !== 'mankad';
/** The ball's stamp: "12.4" (a wide / no-ball shares the next legal ball's). */
export const recStamp = (r: Pick<BallRec, 'legal' | 'lb6'>, bpo = 6): string => {
  const balls = r.legal ? r.lb6 : r.lb6 + 1;
  return `${Math.floor((balls - 1) / bpo)}.${((balls - 1) % bpo) + 1}`;
};

/** Each log record's delivery ordinal in its innings (1-based), 0 for a non-delivery. */
export function deliveryOrdinals(log: BallRec[]): number[] {
  const n: Record<string, number> = {};
  return log.map((r) => {
    if (!isDeliveryRec(r)) return 0;
    const k = `${r.inn}:${r.side}`;
    n[k] = (n[k] ?? 0) + 1;
    return n[k];
  });
}

/** The detail for each record of the log (same order; undefined = none). */
export function detailByRec(log: BallRec[], detail: BallDetailRec[] | undefined, bpo = 6): (BallDetailRec | undefined)[] {
  if (!detail?.length) return log.map(() => undefined);
  const byKey = new Map(detail.map((x) => [`${x.inn}:${x.side}:${x.d}`, x]));
  const ords = deliveryOrdinals(log);
  return log.map((r, i) => {
    if (!ords[i]) return undefined;
    const x = byKey.get(`${r.inn}:${r.side}:${ords[i]}`);
    return x && x.at === recStamp(r, bpo) ? x : undefined;
  });
}

// ─── Words ────────────────────────────────────────────────────────────────────

/** "short of a length outside off" / "a yorker on the stumps" / "" */
export function pitchPhrase(x: Pick<BallDetailRec, 'len' | 'line'> | undefined): string {
  if (!x) return '';
  const l = x.len ? LENGTH_PHRASE[x.len] : '';
  const n = x.line ? LINE_PHRASE[x.line] : '';
  return [l, n].filter(Boolean).join(' ');
}
export const controlPhrase = (c?: Control): string => (c === 'beaten' ? 'beaten' : c === 'edged' ? 'edged' : c === 'mistimed' ? 'mistimed' : '');
/** Is the detail's control a false shot? */
export const isFalseShot = (x?: Pick<BallDetailRec, 'ctrl'>): boolean => !!x?.ctrl;

/** Optional capture toggles in force (rules keys) → the BallRec `trk` marker. */
export interface Tracking { ctrl?: true; pitch?: true; speed?: true }
export function trackingOf(r: { pitchMap?: boolean; shotCtrl?: boolean; ballSpeed?: boolean } | undefined): Tracking | undefined {
  if (!r || !(r.pitchMap || r.shotCtrl || r.ballSpeed)) return undefined;
  return { ...(r.shotCtrl ? { ctrl: true as const } : {}), ...(r.pitchMap ? { pitch: true as const } : {}), ...(r.ballSpeed ? { speed: true as const } : {}) };
}
