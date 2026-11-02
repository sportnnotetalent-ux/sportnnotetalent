/**
 * SD-107 — optional point detail for the racket sports: HOW a point was won
 * (winner by stroke, forced / unforced error, ace, service winner, service
 * fault, squash stroke / no-let decisions), plus tennis' 1st / 2nd serve.
 *
 * Capture (D8, off by default): the scorer still taps WHO won the point. With
 * "Point detail" on (`SET_DETAIL`, format key `pointDetail`), an optional row
 * under the controls describes the LAST point; each tap dispatches
 * `POINT_DETAIL` { pd, serve } which annotates that point event (no score
 * effect, replaces any earlier detail on it, `pd: null` clears it). Undo pops
 * the annotation like any other event. Old logs never contain either action,
 * so they replay identically (Decision 8).
 *
 * Credits (absolute, via statTotals — never live increments):
 *   winner / ace / service winner / stroke awarded → the point winner (the
 *   player on the point, else the side's only player in singles);
 *   forced / unforced error / service fault / no let / stroke conceded → the
 *   erring opponent (`pd.err`, else the other side's only player in singles).
 * A match that never tracked detail writes none of these keys ("not tracked",
 * never a false 0).
 *
 * SD-157 — tennis goes to ATP / Infosys depth (all optional, off by default):
 *   - the stroke is WING (forehand / backhand) + SHOT type (groundstroke,
 *     return, volley, approach, passing, lob, overhead, drop shot), for
 *     winners, unforced AND forced errors (`pd.wing` / `pd.shot`). Older
 *     tennis stroke ids (`pd.stroke`: fh, bh, fhVolley, bhVolley, overhead,
 *     drop, lob, return, volley) are NORMALISED on read (`strokeOf`), never
 *     rewritten;
 *   - per point, outside `pd` (POINT_DETAIL `atNet` / `rallyLen` / `kmh`):
 *     who came to the net, the rally-length bucket and the serve speed.
 *     A legacy `pd.net` (the winner won it at the net) reads as the point
 *     winner at the net;
 *   - capture switches (SET_DETAIL / format): `netDetail`, `rallyDetail`,
 *     `speedDetail` beside `pointDetail` / `serveDetail`.
 *
 * Deep wave (racket: badminton, table tennis, squash, padel, pickleball) —
 * the same model, each sport with its own lists (all optional, off by default):
 *   - winners, forced AND unforced errors take WING + the sport's SHOT type
 *     (`RACKET_SHOTS`, e.g. badminton smash / net kill / lift, TT loop / chop,
 *     squash boast / nick, padel bandeja / víbora / por tres, pickleball dink /
 *     erne / reset). Their older winner stroke ids (`pd.stroke`: smash, netKill,
 *     loop, fh, bh, nick, bandeja, dink, atp …) are the SAME ids, normalised on
 *     read (`shotOf`), never rewritten — so the career keys (winnersSmash,
 *     winnersFh …) carry on unchanged;
 *   - an unforced error keeps its error type in `pd.stroke` (into the net, out,
 *     tin, kitchen, foot fault) beside wing / shot; a service fault may carry
 *     its type (badminton above 1.15 m, TT illegal serve, squash short …);
 *   - per point: the rally-length bucket (each sport's own buckets,
 *     `rallyBucketsOf`), who was at the net (padel) / the kitchen line
 *     (pickleball), and pickleball's 3rd shot (`third`: drop / drive / lob);
 *   - capture switch `thirdDetail` (pickleball) beside the others.
 *
 * Round 2 (founder's answers, racket family):
 *   - serve speed may be typed and shown in mph (`speedUnit`, a match / format
 *     option, default km/h); the log always stores km/h (`validSpeed`,
 *     `speedText` convert on entry and display);
 *   - badminton adds Jump smash and Block to its shots;
 *   - rally-length buckets are an organiser option per sport
 *     (`rallyBuckets` = a scheme id, RALLY_SCHEMES; the current buckets stay
 *     the default). A point keeps the bucket it was tagged with, so an old
 *     match (no scheme) reads exactly as before (`matchRallyBuckets`);
 *   - pickleball's kitchen-line mark gains "Nobody got there" (`atNet:
 *     'none'`), so kitchen ARRIVAL % can be read once a match has used it
 *     (`arrivalTracked`).
 *
 * PURE (no React Native): engines, statTotals, the panel and tests import it.
 */
import type { LiveEvent } from './liveEvents';
import { legacyNameOf, whoName, type NameOf } from './racketNames.ts';

export type DetailSport = 'tennis' | 'badminton' | 'tabletennis' | 'squash' | 'padel' | 'pickleball';
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** How a point ended. */
export type How = 'winner' | 'fe' | 'ue' | 'ace' | 'sw' | 'sf' | 'stroke' | 'nolet' | 'rule';

/** The detail stored on a point event (`event.pd`) and its PointInput. */
export interface PointDetail {
  how: How;
  /** the stroke / error type (ids in STROKES); tennis: legacy ids only
   *  (SD-157 writes `wing` / `shot`, see `strokeOf`) */
  stroke?: string;
  /** SD-157 tennis (deep wave: every racket sport): forehand / backhand */
  wing?: Wing;
  /** SD-157 tennis: the shot type (deep wave: the sport's own, RACKET_SHOTS) */
  shot?: Shot | RShot;
  /** tennis, before SD-157: the point winner won it at the net (read as the
   *  winner's side at the net; new points use the event's `atNet`) */
  net?: true;
  /** the erring / conceding player (errors, service faults, no-lets).
   *  IDs-only scoring: new details carry `playerId` only; `playerName` is
   *  legacy, read-only (an older log stored it). */
  err?: { playerId?: string; playerName?: string };
}

export interface HowDef {
  how: How;
  label: string;
  /** chip label */
  chip: string;
  /** who the point's credit goes to */
  credit: 'winner' | 'loser';
  /** only offered when the point winner served ('server') / received ('receiver') */
  serve?: 'server' | 'receiver';
  /** the stroke / error-type chips offered after it */
  strokes?: string[];
  /** SD-157 (tennis): offered with Forehand / Backhand + a shot type */
  wingShot?: true;
}

// ------------------------------------------------- SD-157 tennis strokes --

export type Wing = 'fh' | 'bh';
export type Shot = 'gs' | 'return' | 'volley' | 'approach' | 'passing' | 'lob' | 'overhead' | 'drop';
export const WINGS: readonly Wing[] = ['fh', 'bh'];
export const SHOTS: readonly Shot[] = ['gs', 'return', 'volley', 'approach', 'passing', 'lob', 'overhead', 'drop'];
export const WING_LABEL: Record<Wing, string> = { fh: 'Forehand', bh: 'Backhand' };
/** label (sentence case, as in the timeline), chip, and the ATP rally-panel row */
export const SHOT_LABEL: Record<Shot, { label: string; chip: string; row: string }> = {
  gs: { label: 'Groundstroke', chip: 'Groundstroke', row: 'Groundstroke' },
  return: { label: 'Return', chip: 'Return', row: 'Return' },
  volley: { label: 'Volley', chip: 'Volley', row: 'Volley' },
  approach: { label: 'Approach', chip: 'Approach', row: 'Approach' },
  passing: { label: 'Passing shot', chip: 'Passing', row: 'Passing' },
  lob: { label: 'Lob', chip: 'Lob', row: 'Lob' },
  overhead: { label: 'Overhead', chip: 'Overhead', row: 'Overhead' },
  drop: { label: 'Drop shot', chip: 'Drop shot', row: 'Drop shots' },
};
/** The tennis stroke ids used before SD-157 → wing + shot (read-time only). */
export const LEGACY_TENNIS_STROKES: Record<string, { wing?: Wing; shot: Shot }> = {
  fh: { wing: 'fh', shot: 'gs' },
  bh: { wing: 'bh', shot: 'gs' },
  fhVolley: { wing: 'fh', shot: 'volley' },
  bhVolley: { wing: 'bh', shot: 'volley' },
  overhead: { shot: 'overhead' },
  drop: { shot: 'drop' },
  lob: { shot: 'lob' },
  return: { shot: 'return' },
  volley: { shot: 'volley' },
};
const isWing = (v: unknown): v is Wing => v === 'fh' || v === 'bh';
const isShot = (v: unknown): v is Shot => typeof v === 'string' && (SHOTS as readonly string[]).includes(v);

/** SD-157 — a tennis point's stroke as wing + shot: the new fields when set,
 *  else the legacy `stroke` id normalised (fh → forehand groundstroke …).
 *  Tennis only (other sports' `stroke` ids mean their own strokes). */
export function strokeOf(pd: PointDetail | null | undefined): { wing?: Wing; shot?: Shot } {
  if (!pd) return {};
  if (pd.wing || pd.shot) return { ...(isWing(pd.wing) ? { wing: pd.wing } : {}), ...(isShot(pd.shot) ? { shot: pd.shot } : {}) };
  const l = pd.stroke ? LEGACY_TENNIS_STROKES[pd.stroke] : undefined;
  return l ? { ...l } : {};
}

/** "Forehand", "Backhand volley", "Overhead", "Forehand drop shot" — sentence
 *  case; '' when neither is known. `title` → "Forehand Drop Shot" (commentary).
 *  A groundstroke with a known wing is just the wing ("Forehand"). */
export function strokePhrase(st: { wing?: Wing; shot?: Shot }, title = false): string {
  const w = st.wing ? WING_LABEL[st.wing] : '';
  const sh = st.shot && !(st.wing && st.shot === 'gs') ? SHOT_LABEL[st.shot].label : '';
  const out = w && sh ? `${w} ${sh.toLowerCase()}` : w || sh;
  return title ? out.replace(/\b([a-z])/g, (c) => c.toUpperCase()) : out;
}

// ------------------------------------- deep wave · the other racket sports --

/** The racket sports other than tennis (the deep-wave lists below). */
export type DepthSport = Exclude<DetailSport, 'tennis'>;
export const DEPTH_SPORTS: readonly DepthSport[] = ['badminton', 'tabletennis', 'squash', 'padel', 'pickleball'];

/** Every shot id a non-tennis racket sport offers (ids shared where the shot
 *  is the same; a sport's list is `RACKET_SHOTS[sport]`). The ids that were
 *  SD-107 winner strokes keep their id, so their career keys carry on. */
export type RShot =
  | 'smash' | 'jumpSmash' | 'drop' | 'clear' | 'netShot' | 'netKill' | 'drive' | 'lift' | 'push' | 'serve'
  | 'receive' | 'flick' | 'chop' | 'loop' | 'block' | 'lob'
  | 'boast' | 'volley' | 'kill' | 'nick'
  | 'return' | 'x3' | 'bandeja' | 'vibora' | 'chiquita' | 'bajada' | 'wall'
  | 'dink' | 'reset' | 'overhead' | 'erne' | 'atp';
export interface ShotDef { id: RShot; label: string; chip: string }
const sh = (id: RShot, label: string, chip = label): ShotDef => ({ id, label, chip });
/** Each sport's shot types, in chip order (federation / broadcast names). */
export const RACKET_SHOTS: Record<DepthSport, readonly ShotDef[]> = {
  // BWF (round 2: + jump smash, + block — the defensive block of a smash)
  badminton: [
    sh('smash', 'Smash'), sh('jumpSmash', 'Jump smash'), sh('drop', 'Drop shot', 'Drop'), sh('clear', 'Clear'), sh('netShot', 'Net shot'), sh('netKill', 'Net kill'),
    sh('drive', 'Drive'), sh('lift', 'Lift'), sh('push', 'Push'), sh('block', 'Block'), sh('serve', 'Serve'),
  ],
  // ITTF / WTT (the serve itself is Ace / Service fault)
  tabletennis: [
    sh('receive', 'Receive'), sh('flick', 'Flick'), sh('push', 'Push'), sh('chop', 'Chop'), sh('loop', 'Loop (topspin)', 'Loop'),
    sh('block', 'Block'), sh('smash', 'Smash'), sh('lob', 'Lob'),
  ],
  // PSA / WSF
  squash: [
    sh('drive', 'Drive'), sh('drop', 'Drop'), sh('boast', 'Boast'), sh('volley', 'Volley'), sh('lob', 'Lob'), sh('kill', 'Kill'), sh('nick', 'Nick'),
  ],
  // Premier Padel / FIP
  padel: [
    sh('return', 'Return'), sh('volley', 'Volley'), sh('bandeja', 'Bandeja'), sh('vibora', 'Víbora'), sh('smash', 'Smash'),
    sh('x3', 'Smash out (por tres / por cuatro)', 'Por tres'), sh('lob', 'Lob'), sh('chiquita', 'Chiquita'), sh('bajada', 'Bajada'),
    sh('wall', 'Off the glass', 'Off the glass'), sh('drop', 'Drop shot', 'Drop'),
  ],
  // PPA / USA Pickleball
  pickleball: [
    sh('return', 'Return'), sh('drive', 'Drive'), sh('drop', 'Third-shot drop', 'Drop'), sh('dink', 'Dink'), sh('volley', 'Volley'),
    sh('reset', 'Reset'), sh('lob', 'Lob'), sh('overhead', 'Overhead'), sh('erne', 'Erne'), sh('atp', 'Around the post (ATP)', 'ATP'),
  ],
};
/** One label per shot id (a timeline row without its sport). */
const ANY_SHOT_LABEL: Record<RShot, string> = Object.fromEntries(
  (Object.values(RACKET_SHOTS) as ShotDef[][]).flat().reverse().map((d) => [d.id, d.id === 'drop' ? 'Drop shot' : d.label]),
) as Record<RShot, string>;
const isRShot = (v: unknown): v is RShot => typeof v === 'string' && v in ANY_SHOT_LABEL;
/** The shot ids `sport` offers (tennis: SHOTS). */
export const shotIdsOf = (sport: DetailSport): readonly string[] => (sport === 'tennis' ? SHOTS : RACKET_SHOTS[sport].map((d) => d.id));
/** A shot's label in `sport` (sentence case), else '' (unknown id). */
export function shotLabel(sport: DetailSport | undefined, id: string | undefined): string {
  if (!id) return '';
  if (sport === 'tennis' || (!sport && isShot(id))) return isShot(id) ? SHOT_LABEL[id].label : '';
  if (sport) return RACKET_SHOTS[sport].find((d) => d.id === id)?.label ?? '';
  return isRShot(id) ? ANY_SHOT_LABEL[id] : '';
}

/** A racket point's stroke as wing + shot, by sport: the new fields when set,
 *  else an older winner stroke id (SD-107: smash, netKill, fh / bh in table
 *  tennis …) normalised to the same shot / wing — read-time only. Tennis:
 *  `strokeOf`. An error's `stroke` is its error TYPE (into the net, out …),
 *  never a shot (`errTypeOf`). */
export function shotOf(sport: DetailSport, pd: PointDetail | null | undefined): { wing?: Wing; shot?: string } {
  if (sport === 'tennis') return strokeOf(pd);
  if (!pd) return {};
  const ids = shotIdsOf(sport);
  if (pd.wing || pd.shot) return { ...(isWing(pd.wing) ? { wing: pd.wing } : {}), ...(pd.shot && ids.includes(pd.shot) ? { shot: pd.shot } : {}) };
  if (pd.how === 'winner' && pd.stroke) {
    if (isWing(pd.stroke)) return { wing: pd.stroke };
    if (ids.includes(pd.stroke)) return { shot: pd.stroke };
  }
  return {};
}

/** The error / service-fault type carried in `pd.stroke` (deep wave: beside
 *  wing + shot), when `sport` offers it for that how; else undefined. */
export function errTypeOf(sport: DetailSport, pd: PointDetail | null | undefined): string | undefined {
  if (!pd?.stroke || pd.how === 'winner') return undefined;
  return howDef(sport, pd.how)?.strokes?.includes(pd.stroke) ? pd.stroke : undefined;
}

/** "Forehand smash", "Backhand", "Drop shot" (sentence case; title → "Forehand
 *  Net Kill" for the commentary). A sport's own labels; '' when neither. */
export function shotPhrase(sport: DetailSport, st: { wing?: Wing; shot?: string }, title = false): string {
  if (sport === 'tennis') return strokePhrase(st as { wing?: Wing; shot?: Shot }, title);
  const w = st.wing ? WING_LABEL[st.wing] : '';
  const s = shotLabel(sport, st.shot);
  const out = w && s ? `${w} ${s.charAt(0).toLowerCase()}${s.slice(1)}` : w || s;
  return title ? out.replace(/(^|[\s(])([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase()) : out;
}

/** Pickleball's 3rd shot (the serving team's shot after the return). */
export type ThirdShot = 'drop' | 'drive' | 'lob';
export const THIRD_SHOTS: readonly ThirdShot[] = ['drop', 'drive', 'lob'];
export const THIRD_LABEL: Record<ThirdShot, string> = { drop: '3rd-shot drop', drive: '3rd-shot drive', lob: '3rd-shot lob' };
const validThird = (v: unknown): ThirdShot | null | undefined => (v === null ? null : v === 'drop' || v === 'drive' || v === 'lob' ? v : undefined);

/** SD-157 — who came to the net on a point. Round 2: pickleball's kitchen
 *  line may be marked 'none' — nobody got there (`hasNobodyMark`), which is
 *  what lets kitchen ARRIVAL % be read. */
export type NetMark = 'home' | 'away' | 'both' | 'none';
/** Round 2 — the sports whose net mark offers "Nobody" (pickleball's kitchen line). */
export const hasNobodyMark = (s: DetailSport | undefined) => s === 'pickleball';
/** SD-157 — rally length buckets (shots in the rally, the serve included).
 *  Deep wave: each sport has its own three (`rallyBucketsOf`). Round 2: the
 *  organiser may pick another standard set (RALLY_SCHEMES). */
export type RallyBucket =
  | '0-4' | '5-8' | '9+' | '5-10' | '11+' | '1-2' | '3-4' | '5+' | '0-5' | '6-15' | '16+'
  | '1-3' | '4-6' | '7-9' | '10+' | '0-10' | '11-20' | '21+' | '5-6' | '7+';
/** Tennis' buckets (SD-157). */
export const RALLY_BUCKETS: readonly RallyBucket[] = ['0-4', '5-8', '9+'];
export const RALLY_LABEL: Record<RallyBucket, string> = {
  '0-4': '0–4 shots', '5-8': '5–8 shots', '9+': '9+ shots',
  '5-10': '5–10 shots', '11+': '11+ shots',
  '1-2': '1–2 shots', '3-4': '3–4 shots', '5+': '5+ shots',
  '0-5': '0–5 shots', '6-15': '6–15 shots', '16+': '16+ shots',
  '1-3': '1–3 shots', '4-6': '4–6 shots', '7-9': '7–9 shots', '10+': '10+ shots',
  '0-10': '0–10 shots', '11-20': '11–20 shots', '21+': '21+ shots',
  '5-6': '5–6 shots', '7+': '7+ shots',
};
/** Deep wave — each sport's rally-length buckets (one scorer can count them):
 *  tennis / padel / pickleball 0–4 · 5–8 · 9+; badminton 0–4 · 5–10 · 11+;
 *  table tennis the three phases 1–2 (serve, receive) · 3–4 (3rd, 4th ball)
 *  · 5+ (rally); squash 0–5 · 6–15 · 16+. Round 2: these are the DEFAULT
 *  scheme of each sport (RALLY_SCHEMES). */
export const RALLY_BUCKETS_OF: Record<DetailSport, readonly RallyBucket[]> = {
  tennis: RALLY_BUCKETS, padel: RALLY_BUCKETS, pickleball: RALLY_BUCKETS,
  badminton: ['0-4', '5-10', '11+'],
  tabletennis: ['1-2', '3-4', '5+'],
  squash: ['0-5', '6-15', '16+'],
};

/** Round 2 — a standard set of rally-length buckets an organiser can pick
 *  (format / Scoring settings `rallyBuckets` = its id). */
export interface RallyScheme { id: string; label: string; buckets: readonly RallyBucket[] }
/** The default scheme's id (every sport): the deep-wave buckets above. */
export const DEFAULT_RALLY_SCHEME = 'std';
/** Finer, four buckets — the tennis Match Charting Project's (Tennis Abstract). */
const chart = (note: string): RallyScheme => ({ id: 'chart', label: `1–3 · 4–6 · 7–9 · 10+ (${note})`, buckets: ['1-3', '4-6', '7-9', '10+'] });
/** Round 2 — each sport's rally-length schemes, the default first (the
 *  buckets every match used before this option existed). */
export const RALLY_SCHEMES: Record<DetailSport, readonly RallyScheme[]> = {
  tennis: [{ id: 'std', label: '0–4 · 5–8 · 9+ (ATP standard)', buckets: RALLY_BUCKETS }, chart('Match Charting')],
  padel: [{ id: 'std', label: '0–4 · 5–8 · 9+ (standard)', buckets: RALLY_BUCKETS }, chart('finer')],
  pickleball: [{ id: 'std', label: '0–4 · 5–8 · 9+ (standard)', buckets: RALLY_BUCKETS }, chart('finer')],
  badminton: [{ id: 'std', label: '0–4 · 5–10 · 11+ (standard)', buckets: RALLY_BUCKETS_OF.badminton }, chart('finer')],
  // table tennis: the three-phase method, or the four-phase one (5–6
  // transition, 7+ stalemate) — serve & 3rd ball / receive & 4th ball stay
  tabletennis: [
    { id: 'std', label: '1–2 · 3–4 · 5+ (three phases)', buckets: RALLY_BUCKETS_OF.tabletennis },
    { id: 'four', label: '1–2 · 3–4 · 5–6 · 7+ (four phases)', buckets: ['1-2', '3-4', '5-6', '7+'] },
  ],
  // squash: school-length rallies, or the long rallies of senior / PSA play
  squash: [
    { id: 'std', label: '0–5 · 6–15 · 16+ (standard)', buckets: RALLY_BUCKETS_OF.squash },
    { id: 'long', label: '0–10 · 11–20 · 21+ (long rallies)', buckets: ['0-10', '11-20', '21+'] },
  ],
};
/** The scheme `id` names for `sport` (unknown / absent → the default). */
export const rallySchemeOf = (sport: DetailSport, id?: unknown): RallyScheme =>
  RALLY_SCHEMES[sport].find((x) => x.id === id) ?? RALLY_SCHEMES[sport][0];
/** The buckets of `sport` — its default scheme, or the scheme `scheme` names. */
export const rallyBucketsOf = (sport: DetailSport, scheme?: unknown): readonly RallyBucket[] => rallySchemeOf(sport, scheme).buckets;
/** A bucket's lower and upper shot counts ('9+' → [9, ∞]). */
const bucketRange = (b: RallyBucket): [number, number] => {
  const m = /^(\d+)(?:-(\d+)|\+)$/.exec(b);
  return m ? [Number(m[1]), m[2] ? Number(m[2]) : Infinity] : [0, 0];
};
const byLength = (a: RallyBucket, b: RallyBucket) => bucketRange(a)[0] - bucketRange(b)[0] || bucketRange(a)[1] - bucketRange(b)[1];
/** Every bucket any scheme of `sport` offers (valid on a point; declared in
 *  the schema; career rows), the default scheme's first. */
export const allRallyBuckets = (sport: DetailSport): RallyBucket[] =>
  [...new Set(RALLY_SCHEMES[sport].flatMap((x) => x.buckets))];
/** The buckets a match reads with: its scheme's, plus any other bucket of the
 *  sport its points carry (the scheme changed mid-match), by length. An old
 *  match (no scheme) → the default buckets, as before. */
export function matchRallyBuckets(sport: DetailSport, s: { rallyBuckets?: unknown; events?: LiveEvent[] } | null | undefined): RallyBucket[] {
  const base = rallyBucketsOf(sport, s?.rallyBuckets);
  const used = new Set((s?.events ?? []).map((e) => e.rallyLen).filter(Boolean));
  const extra = allRallyBuckets(sport).filter((b) => used.has(b) && !base.includes(b));
  return extra.length ? [...base, ...extra].sort(byLength) : [...base];
}
/** A bucket's career-key stem: '0-4' → rl04, '9+' → rl9, '5-10' → rl510. */
export const rallyKey = (b: RallyBucket): string => `rl${b.replace(/[-+]/g, '')}`;
/** Table tennis' names for its buckets (the three-phase analysis; round 2:
 *  the four-phase one's transition and stalemate). */
export const TT_PHASE_LABEL: Partial<Record<RallyBucket, string>> = {
  '1-2': 'Serve & receive (1–2)', '3-4': '3rd & 4th ball (3–4)', '5+': 'Rally (5+)', '5-6': 'Transition (5–6)', '7+': 'Stalemate (7+)',
};
/** SD-157 — plausible serve speeds (km/h): a slow junior serve up to just
 *  over the fastest ever recorded (263 km/h). Outside it the value is refused. */
export const KMH_MIN = 30;
export const KMH_MAX = 270;
const toNumber = (v: unknown): number => (typeof v === 'string' ? (v.trim() ? Number(v.trim().replace(',', '.')) : NaN) : typeof v === 'number' ? v : NaN);
/** A valid speed (rounded to a whole km/h), else undefined. */
export function validKmh(v: unknown): number | undefined {
  const n = toNumber(v);
  if (!Number.isFinite(n)) return undefined;
  const r = Math.round(n);
  return r >= KMH_MIN && r <= KMH_MAX ? r : undefined;
}

/** Round 2 — the unit serve speeds are typed and shown in (a match / format
 *  option, `speedUnit`; default km/h). The log always stores km/h. */
export type SpeedUnit = 'kmh' | 'mph';
export const SPEED_UNITS: readonly SpeedUnit[] = ['kmh', 'mph'];
export const SPEED_UNIT_LABEL: Record<SpeedUnit, string> = { kmh: 'km/h', mph: 'mph' };
export const KMH_PER_MPH = 1.609344;
/** The mph range that matches KMH_MIN–KMH_MAX (19 mph ≈ 31 km/h, 168 mph ≈ 270 km/h). */
export const MPH_MIN = 19;
export const MPH_MAX = 168;
/** A match state's speed unit (anything but 'mph' reads km/h). */
export const speedUnitOf = (s: unknown): SpeedUnit => ((s as { speedUnit?: unknown } | null | undefined)?.speedUnit === 'mph' ? 'mph' : 'kmh');
/** The typing range in `unit`. */
export const speedRange = (unit: SpeedUnit): [number, number] => (unit === 'mph' ? [MPH_MIN, MPH_MAX] : [KMH_MIN, KMH_MAX]);
/** A typed speed in `unit` → the whole km/h to store, else undefined (out of
 *  range). mph is rounded to a whole mph first, so what was typed reads back. */
export function validSpeed(v: unknown, unit: SpeedUnit = 'kmh'): number | undefined {
  if (unit === 'kmh') return validKmh(v);
  const n = toNumber(v);
  if (!Number.isFinite(n)) return undefined;
  const r = Math.round(n);
  return r >= MPH_MIN && r <= MPH_MAX ? validKmh(r * KMH_PER_MPH) : undefined;
}
/** A stored km/h in `unit`, whole (averages included). */
export const speedIn = (kmh: number, unit: SpeedUnit = 'kmh'): number => Math.round(unit === 'mph' ? kmh / KMH_PER_MPH : kmh);
/** "193 km/h" / "120 mph"; '–' for none. */
export const speedText = (kmh: number | undefined, unit: SpeedUnit = 'kmh'): string =>
  (kmh === undefined ? '–' : `${speedIn(kmh, unit)} ${SPEED_UNIT_LABEL[unit]}`);

const validNet = (v: unknown, sport?: DetailSport): NetMark | null | undefined =>
  (v === null ? null : v === 'home' || v === 'away' || v === 'both' ? v : v === 'none' && hasNobodyMark(sport) ? 'none' : undefined);
/** A bucket of `sport` (tennis when none is named — the tennis engine's call):
 *  any of its schemes' (the capture offers the match's). */
const validRally = (v: unknown, sport: DetailSport = 'tennis'): RallyBucket | null | undefined =>
  (v === null ? null : typeof v === 'string' && (allRallyBuckets(sport) as readonly string[]).includes(v) ? v as RallyBucket : undefined);
const validKmhOrNull = (v: unknown): number | null | undefined => (v === null ? null : validKmh(v));

/** Stroke and error-type ids → labels (one map for every sport). */
export const STROKES: Record<string, { label: string; chip: string }> = {
  fh: { label: 'Forehand', chip: 'Forehand' },
  bh: { label: 'Backhand', chip: 'Backhand' },
  fhVolley: { label: 'Forehand volley', chip: 'FH volley' },
  bhVolley: { label: 'Backhand volley', chip: 'BH volley' },
  volley: { label: 'Volley', chip: 'Volley' },
  overhead: { label: 'Overhead', chip: 'Overhead' },
  smash: { label: 'Smash', chip: 'Smash' },
  x3: { label: 'Smash out (×3 / ×4)', chip: 'Smash out ×3/×4' },
  drop: { label: 'Drop shot', chip: 'Drop' },
  lob: { label: 'Lob', chip: 'Lob' },
  return: { label: 'Return', chip: 'Return' },
  netKill: { label: 'Net kill', chip: 'Net kill' },
  clear: { label: 'Clear', chip: 'Clear' },
  drive: { label: 'Drive', chip: 'Drive' },
  push: { label: 'Push / lift', chip: 'Push / lift' },
  loop: { label: 'Loop', chip: 'Loop' },
  flick: { label: 'Flick', chip: 'Flick' },
  boast: { label: 'Boast', chip: 'Boast' },
  nick: { label: 'Nick', chip: 'Nick' },
  bandeja: { label: 'Bandeja', chip: 'Bandeja' },
  vibora: { label: 'Víbora', chip: 'Víbora' },
  dink: { label: 'Dink', chip: 'Dink' },
  erne: { label: 'Erne', chip: 'Erne' },
  atp: { label: 'Around the post (ATP)', chip: 'ATP' },
  net: { label: 'Into the net', chip: 'Net' },
  out: { label: 'Out', chip: 'Out' },
  // tennis (founder 2026-11-02, tennis-endings-depth ED1): past the baseline / the sideline
  long: { label: 'Long', chip: 'Long' },
  wide: { label: 'Wide', chip: 'Wide' },
  tin: { label: 'Tin', chip: 'Tin' },
  fault: { label: 'Fault (touch / double hit)', chip: 'Fault' },
  // SD-52 — pickleball (PB-05): non-volley-zone ("kitchen") fault, foot fault
  kitchen: { label: 'Kitchen (non-volley zone) fault', chip: 'Kitchen' },
  foot: { label: 'Foot fault', chip: 'Foot fault' },
  // deep wave — service-fault types (BWF Law 9.1, ITTF 2.6, WSF Rule 5)
  high: { label: 'Above 1.15 m', chip: 'Too high' },
  illegal: { label: 'Illegal serve', chip: 'Illegal' },
  short: { label: 'Short (below the service line)', chip: 'Short' },
};

const FE: HowDef = { how: 'fe', label: 'Forced error', chip: 'Forced error', credit: 'loser' };
const ACE: HowDef = { how: 'ace', label: 'Ace', chip: 'Ace', credit: 'winner', serve: 'server' };
const SW: HowDef = { how: 'sw', label: 'Service winner', chip: 'Service winner', credit: 'winner', serve: 'server' };
/** A service fault, with the sport's fault types (deep wave; optional). */
const SF = (strokes: string[]): HowDef => ({ how: 'sf', label: 'Service fault', chip: 'Service fault', credit: 'loser', serve: 'receiver', strokes });

/** SD-157 — tennis: winners and both kinds of error take wing + shot. */
const T_WINNER: HowDef = { how: 'winner', label: 'Winner', chip: 'Winner', credit: 'winner', wingShot: true };
const T_FE: HowDef = { ...FE, wingShot: true };
const T_UE: HowDef = { how: 'ue', label: 'Unforced error', chip: 'Unforced error', credit: 'loser', wingShot: true };
/** Deep wave — the other racket sports: the same, with the sport's shots
 *  (RACKET_SHOTS); an unforced error keeps its error types (`strokes`). */
const R_UE = (strokes: string[]): HowDef => ({ ...T_UE, strokes });
/** Tennis (tennis-endings-depth FT1): a serve fault's type — into the net,
 *  long (past the service line), wide, or a foot fault. */
export type FaultKind = 'net' | 'long' | 'wide' | 'foot';
export const FAULT_KINDS: readonly FaultKind[] = ['net', 'long', 'wide', 'foot'];
export const FAULT_KIND_LABEL: Record<FaultKind, string> = { net: 'Net', long: 'Long', wide: 'Wide', foot: 'Foot fault' };
export const isFaultKind = (v: unknown): v is FaultKind => v === 'net' || v === 'long' || v === 'wide' || v === 'foot';
/** Tennis (tennis-endings-depth): which way an error went (net / long /
 *  wide; a stat-keeper's error direction), and a point lost by rule (ITF
 *  Rule 24: net touch, hindrance, double bounce, hit by the ball, carry):
 *  neither a winner nor an error, charged to the player who broke it. */
const T_DIR = ['net', 'long', 'wide'];
const T_RULE: HowDef = { how: 'rule', label: 'Lost by rule', chip: 'Lost by rule', credit: 'loser' };

/** Each sport's options, in chip order. Tennis aces and double faults keep
 *  their own one-tap buttons (SD-104), so they're not repeated here. Deep
 *  wave: every sport's winners / errors take wing + shot (RACKET_SHOTS; the
 *  SD-107 winner stroke ids are those shot ids — `shotOf`). */
export const DETAIL_HOWS: Record<DetailSport, HowDef[]> = {
  // ATP / WTA match-stat conventions (SD-157: wing + shot, see strokeOf)
  tennis: [SW, T_WINNER, { ...T_FE, strokes: T_DIR }, { ...T_UE, strokes: T_DIR }, T_RULE],
  // BWF: errors into the net, out, faults; service faults (Law 9.1)
  badminton: [T_WINNER, T_FE, R_UE(['net', 'out', 'fault']), SF(['high', 'foot', 'net', 'out', 'fault'])],
  // ITTF / WTT: the ace and the service fault are the serve's outcomes
  tabletennis: [ACE, T_WINNER, T_FE, R_UE(['net', 'out']), SF(['net', 'out', 'illegal'])],
  // WSF: winners incl. the nick; referee decisions (SQ-03): stroke awarded, no let
  squash: [
    T_WINNER, T_FE, R_UE(['tin', 'out']), SF(['short', 'foot', 'out']),
    { how: 'stroke', label: 'Stroke awarded', chip: 'Stroke', credit: 'winner' },
    { how: 'nolet', label: 'No let', chip: 'No let', credit: 'loser' },
  ],
  padel: [ACE, SW, T_WINNER, T_FE, R_UE(['net', 'out'])],
  pickleball: [T_WINNER, T_FE, R_UE(['net', 'out', 'kitchen', 'foot']), SF(['net', 'out', 'kitchen', 'foot'])],
};

export const isDetailSport = (s: string): s is DetailSport => s in DETAIL_HOWS;
/** Tennis only: net points (SD-157: who came to the net; a legacy `pd.net`),
 *  rally length and serve speed. */
export const hasNetFlag = (s: DetailSport) => s === 'tennis';
/** Tennis, and padel from SD-135 (PD-b — Premier Padel's 1st-serve stats). */
export const hasServeDetail = (s: DetailSport) => s === 'tennis' || s === 'padel';
/** Deep wave — the "who was forward" capture (`netDetail` / `atNet`) and its
 *  words: tennis / padel net points, pickleball the kitchen (non-volley zone)
 *  line. Null = not offered (badminton, table tennis, squash). */
export const NET_WORDS: Partial<Record<DetailSport, { option: string; at: string; points: string; won: string; one: string; keys: { pts: string; won: string; pct: string } }>> = {
  tennis: { option: 'Net points', at: 'At the net', points: 'Net points', won: 'Net points won', one: 'net point', keys: { pts: 'netPts', won: 'netPtsWon', pct: 'netPtsPct' } },
  padel: { option: 'Net points', at: 'At the net', points: 'Net points', won: 'Net points won', one: 'net point', keys: { pts: 'netPts', won: 'netPtsWon', pct: 'netPtsPct' } },
  pickleball: {
    option: 'Kitchen line', at: 'At the kitchen line', points: 'Kitchen-line rallies', won: 'Kitchen-line rallies won', one: 'kitchen-line rally',
    keys: { pts: 'kitchenPts', won: 'kitchenWon', pct: 'kitchenPct' },
  },
};
export const hasNetMark = (s: DetailSport) => !!NET_WORDS[s];
/** Deep wave — pickleball's 3rd-shot capture (`thirdDetail` / `third`). */
export const hasThirdShot = (s: DetailSport) => s === 'pickleball';

/** SD-135 (PD-a) — the hows a one-tap button records on its own, with point
 *  detail OFF: padel's Ace, squash's Stroke / No let. A match whose only
 *  detail is these tracked just these keys — never winners / errors (no
 *  false zeros). */
export const QUICK_HOWS: Partial<Record<DetailSport, How[]>> = { padel: ['ace'], squash: ['stroke', 'nolet'] };

export const howDef = (sport: DetailSport, how: How): HowDef | undefined => DETAIL_HOWS[sport].find((h) => h.how === how);

// ---------------------------------------------------------------- keys --

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The stat key a how credits. */
export const HOW_KEY: Record<How, string> = {
  winner: 'winners', fe: 'forcedErrors', ue: 'unforcedErrors', ace: 'aces',
  sw: 'serviceWinners', sf: 'serviceFaults', stroke: 'strokesWon', nolet: 'noLets', rule: 'ruleLosses',
};
/** squash: a stroke awarded is also one conceded by the opponent */
export const STROKES_CONCEDED = 'strokesConceded';
export const NET_KEY = 'netPtsWon';
/** Winners / unforced errors by stroke: winnersFh, ueNet … Deep wave: a
 *  service fault by type: sfHigh, sfFoot, sfNet … */
export const strokeKey = (how: How, stroke: string): string | undefined =>
  how === 'winner' ? `winners${cap(stroke)}` : how === 'ue' ? `ue${cap(stroke)}` : how === 'fe' ? `fe${cap(stroke)}` : how === 'sf' ? `sf${cap(stroke)}` : undefined;

/** SD-157 — tennis key prefixes for wing / shot counts. */
const WS_PREFIX: Partial<Record<How, string>> = { winner: 'winners', ue: 'ue', fe: 'fe' };
/** Winners / UE / FE by wing, every shot of that wing: winnersFh, ueBh, feFh.
 *  (Before SD-157 `winnersFh` / `winnersBh` left out the FH / BH volley,
 *  which had its own key; the career row adds the retired volley key, so old
 *  and new lines both read "all forehand winners".) */
export const wingKey = (how: How, wing: Wing): string | undefined => (WS_PREFIX[how] ? `${WS_PREFIX[how]}${cap(wing)}` : undefined);
/** Winners / UE / FE by shot type, either wing: winnersGs, ueReturn, feVolley
 *  (winnersReturn / winnersOverhead / winnersDrop / winnersLob / ueVolley /
 *  ueOverhead keep their pre-SD-157 meaning). */
export const shotKey = (how: How, shot: Shot | RShot | string): string | undefined => (WS_PREFIX[how] ? `${WS_PREFIX[how]}${cap(shot)}` : undefined);
/** SD-157 — tennis keys no longer credited (a volley now counts in
 *  winnersFh / winnersBh AND winnersVolley). Written as 0 on a tracked line,
 *  so a re-sync of an older match clears them and no career row counts twice. */
export const RETIRED_TENNIS_KEYS = ['winnersFhVolley', 'winnersBhVolley'] as const;

/** Every key the sport's detail writes on a tracked line, in display order.
 *  `quickOnly` (SD-135): just the one-tap keys (QUICK_HOWS). Tennis net
 *  points have their own coverage (SD-157, tennis/matchStats.ts). */
export function detailKeys(sport: DetailSport, quickOnly = false): string[] {
  const out: string[] = [];
  const quick = QUICK_HOWS[sport] ?? [];
  for (const h of DETAIL_HOWS[sport]) {
    if (quickOnly && !quick.includes(h.how)) continue;
    out.push(HOW_KEY[h.how]);
    if (h.how === 'stroke') out.push(STROKES_CONCEDED);
    for (const st of h.strokes ?? []) out.push(strokeKey(h.how, st)!);
    if (h.wingShot) {
      for (const w of WINGS) out.push(wingKey(h.how, w)!);
      for (const s of shotIdsOf(sport)) out.push(shotKey(h.how, s)!);
    }
  }
  if (sport === 'tennis' && !quickOnly) out.push(...RETIRED_TENNIS_KEYS);
  return out;
}

/** 1st / 2nd serve keys (tennis, `serveDetail`): tracked service points,
 *  1st serves in, points won on the 1st serve, 2nd-serve points (incl.
 *  double faults) and won. The serving player's, like srvPts. */
export const SERVE_DETAIL_KEYS = ['srv1Pts', 'srv1In', 'srv1Won', 'srv2Pts', 'srv2Won'] as const;

// -------------------------------------------------------------- labels --

/** "Forehand winner", "Unforced error (net)", "Ace" — for the timeline. */
/** `names` = add the erring player's name (off where names may be masked).
 *  `sport` (deep wave) reads the sport's own shot names and keeps an error's
 *  type beside its shot: "Unforced error (forehand drive, into the net)".
 *  Without it a tennis wing / shot reads as SD-157 did, another sport's shot
 *  by its generic name. IDs-only scoring: `nameOf` names the erring player
 *  by id for the viewer (without it, only an older log's stored name). */
export function pdText(pd: PointDetail | undefined | null, names = true, sport?: DetailSport, nameOf: NameOf = legacyNameOf): string {
  if (!pd || !pd.how) return '';
  let st: string | undefined;
  if (sport && sport !== 'tennis') {
    const shot = shotPhrase(sport, shotOf(sport, pd));
    const et = errTypeOf(sport, pd);
    st = [shot, et ? STROKES[et]?.label : ''].filter(Boolean).join(', ') || undefined;
  } else if (pd.wing || pd.shot) {
    // SD-157: a tennis wing / shot reads "Backhand volley"; another racket
    // sport's shot (deep wave, no sport given) its generic name
    const t = strokePhrase(strokeOf(pd));
    const other = !isShot(pd.shot) && isRShot(pd.shot) ? ANY_SHOT_LABEL[pd.shot] : '';
    const both = other ? (t ? `${t} ${other.charAt(0).toLowerCase()}${other.slice(1)}` : other) : t;
    // an error type (into the net, out …) — never a legacy tennis stroke id
    const et = pd.how !== 'winner' && pd.stroke && !(pd.stroke in LEGACY_TENNIS_STROKES) ? STROKES[pd.stroke]?.label : '';
    st = [both, et].filter(Boolean).join(', ') || undefined;
  } else st = pd.stroke ? STROKES[pd.stroke]?.label : undefined;
  let t: string;
  switch (pd.how) {
    case 'winner': t = st ? `${st} winner` : 'Winner'; break;
    case 'ue': t = st ? `Unforced error (${st.toLowerCase()})` : 'Unforced error'; break;
    case 'fe': t = st ? `Forced error (${st.toLowerCase()})` : 'Forced error'; break;
    case 'ace': t = 'Ace'; break;
    case 'sw': t = 'Service winner'; break;
    case 'sf': t = st && pd.stroke && STROKES[pd.stroke] ? `Service fault (${STROKES[pd.stroke].label.toLowerCase()})` : 'Service fault'; break;
    case 'stroke': t = 'Stroke awarded'; break;
    case 'nolet': t = 'No let'; break;
    case 'rule': t = 'Lost by rule'; break;
    default: t = '';
  }
  const errBy = names && pd.err ? whoName(nameOf, pd.err.playerId, pd.err.playerName) : undefined;
  if (errBy && (pd.how === 'ue' || pd.how === 'fe' || pd.how === 'sf' || pd.how === 'nolet' || pd.how === 'rule')) t += ` · ${errBy}`;
  if (pd.net) t += ' · at net';
  return t;
}

// ------------------------------------------------------------- reducer --

/** Kinds a detail can describe: a scored point, a tennis ace, a side-out rally. */
const DESCRIBABLE = new Set(['point', 'ace', 'rally']);

/** A shot of `sport` (tennis when none is named — the tennis engine's call). */
const validShot = (v: unknown, sport: DetailSport = 'tennis'): v is Shot | RShot => typeof v === 'string' && shotIdsOf(sport).includes(v);

const validPd = (v: unknown, sport?: DetailSport): PointDetail | null | undefined => {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.how !== 'string' || !Object.hasOwn(HOW_KEY, o.how)) return undefined;
  const err = o.err && typeof o.err === 'object' ? o.err as { playerId?: unknown; playerName?: unknown } : undefined;
  return {
    how: o.how as How,
    ...(typeof o.stroke === 'string' && Object.hasOwn(STROKES, o.stroke) ? { stroke: o.stroke } : {}),
    ...(isWing(o.wing) ? { wing: o.wing } : {}),
    ...(validShot(o.shot, sport) ? { shot: o.shot } : {}),
    ...(o.net === true ? { net: true as const } : {}),
    ...(err && (typeof err.playerId === 'string' || typeof err.playerName === 'string') ? {
      err: { ...(typeof err.playerId === 'string' && err.playerId ? { playerId: err.playerId } : {}), ...(typeof err.playerName === 'string' && err.playerName ? { playerName: err.playerName } : {}) },
    } : {}),
  };
};

/**
 * `POINT_DETAIL` — annotate the LAST describable event (a point, an ace, a
 * side-out rally). payload.pd: a detail (replaces), null (clears), absent
 * (keeps). payload.serve: 1 / 2 (tennis 1st / 2nd serve; only on a point that
 * was served while serve tracking was on, i.e. already carries `serve`).
 * SD-157 (tennis) — payload.atNet ('home' / 'away' / 'both'), payload.rallyLen
 * ('0-4' / '5-8' / '9+') and payload.kmh (KMH_MIN–KMH_MAX): each a value
 * (sets), null (clears) or absent (keeps); an invalid value is ignored.
 * A double-fault point is fully described already — left alone.
 * Deep wave — `sport` names the engine's sport (absent = tennis, as the
 * tennis engine calls it): its shots and rally buckets are the valid ones;
 * payload.third (pickleball 3rd shot: 'drop' / 'drive' / 'lob') as atNet.
 * Round 2 — rallyLen: any bucket of the sport's schemes; pickleball's atNet
 * may be 'none' (nobody got to the kitchen line).
 */
export function applyPointDetail(events: LiveEvent[], payload: Record<string, unknown> | undefined, sport?: DetailSport): LiveEvent[] | null {
  let i = events.length - 1;
  while (i >= 0 && !DESCRIBABLE.has(events[i].kind ?? '')) i--;
  if (i < 0) return null;
  const e = events[i];
  if (e.df) return null;
  const pd = validPd(payload?.pd, sport);
  const sv = payload?.serve === 1 || payload?.serve === 2 ? payload.serve : undefined;
  const net = validNet(payload?.atNet, sport);
  const rl = validRally(payload?.rallyLen, sport);
  const kmh = validKmhOrNull(payload?.kmh);
  const third = sport === 'pickleball' ? validThird(payload?.third) : undefined;
  if (pd === undefined && sv === undefined && net === undefined && rl === undefined && kmh === undefined && third === undefined) return null;
  const next: LiveEvent = { ...e };
  if (third === null) delete next.third;
  else if (third) next.third = third;
  if (pd === null) delete next.pd;
  else if (pd) next.pd = pd;
  if (sv && e.serve) next.serve = sv;
  if (net === null) delete next.atNet;
  else if (net) next.atNet = net;
  if (rl === null) delete next.rallyLen;
  else if (rl) next.rallyLen = rl;
  if (kmh === null) delete next.kmh;
  else if (kmh !== undefined) next.kmh = kmh;
  const out = [...events];
  out[i] = next;
  return out;
}

/** SD-157 — the POINT_DETAIL payload that re-applies a point's annotations
 *  on a replay (EDIT_LOG): its detail, net, rally length, speed (deep wave:
 *  pickleball's 3rd shot). {} = none. */
export function annotationsOf(p: { pd?: PointDetail; atNet?: NetMark; rallyLen?: RallyBucket; kmh?: number; third?: ThirdShot }): Record<string, unknown> {
  return {
    ...(p.pd ? { pd: p.pd } : {}),
    ...(p.atNet ? { atNet: p.atNet } : {}),
    ...(p.rallyLen ? { rallyLen: p.rallyLen } : {}),
    ...(typeof p.kmh === 'number' ? { kmh: p.kmh } : {}),
    ...(p.third ? { third: p.third } : {}),
  };
}

/** The capture switches (format keys and SET_DETAIL payload keys). SD-157
 *  adds tennis' net points, rally length and serve speed; the deep wave
 *  pickleball's 3rd shot (`thirdDetail`). */
export const DETAIL_FLAG_KEYS = ['pointDetail', 'serveDetail', 'netDetail', 'rallyDetail', 'speedDetail', 'thirdDetail'] as const;
export type DetailFlagKey = typeof DETAIL_FLAG_KEYS[number];

/** Round 2 — the capture OPTIONS beside the switches (format keys and
 *  SET_DETAIL payload keys): the serve-speed unit (tennis) and the
 *  rally-length scheme (every racket sport). Absent = the default. */
export interface DetailOptions { speedUnit?: SpeedUnit; rallyBuckets?: string }
export type DetailFlags = Partial<Record<DetailFlagKey, boolean>> & DetailOptions;

/** `SET_DETAIL` — the scorer's capture settings (event mode: applies from the
 *  next point; earlier points keep what they had). Returns the flags patch.
 *  Round 2: `speedUnit` ('kmh' / 'mph' — display and typing only, the log is
 *  km/h) and `rallyBuckets` (a scheme id; points already tagged keep theirs). */
export function detailFlags(payload: Record<string, unknown> | undefined, cur: DetailFlags): DetailFlags | null {
  const out: DetailFlags = {};
  for (const k of DETAIL_FLAG_KEYS) {
    const v = payload?.[k];
    if (typeof v === 'boolean' && v !== !!cur[k]) out[k] = v;
  }
  const u = payload?.speedUnit;
  if ((u === 'kmh' || u === 'mph') && u !== (cur.speedUnit ?? 'kmh')) out.speedUnit = u;
  const rb = payload?.rallyBuckets;
  if (typeof rb === 'string' && rb && rb !== (cur.rallyBuckets ?? DEFAULT_RALLY_SCHEME)) out.rallyBuckets = rb;
  return Object.keys(out).length ? out : null;
}

/** The flags `init` reads from a match format (absent unless switched on, so
 *  an old match's state is unchanged). Round 2: a non-default speed unit /
 *  rally scheme too (the default leaves the state as it was). */
export function initDetailFlags(config?: Record<string, unknown>): Partial<Record<DetailFlagKey, true>> & DetailOptions {
  const out: Partial<Record<DetailFlagKey, true>> & DetailOptions = {};
  for (const k of DETAIL_FLAG_KEYS) if (config?.[k] === true) out[k] = true;
  if (config?.speedUnit === 'mph') out.speedUnit = 'mph';
  const rb = config?.rallyBuckets;
  if (typeof rb === 'string' && rb && rb !== DEFAULT_RALLY_SCHEME) out.rallyBuckets = rb;
  return out;
}

/** Did this match track point detail? (switched on, or any annotated point) */
export const detailTracked = (s: { pointDetail?: boolean; events?: LiveEvent[] } | null | undefined): boolean =>
  !!s && (s.pointDetail === true || (s.events ?? []).some((e) => !!e.pd));

/** SD-135 (PD-a) — how much detail a match tracked: 'full' = point detail
 *  was on, or a point carries a how no one-tap button records; 'quick' =
 *  only one-tap hows (padel Ace, squash Stroke / No let); null = none. */
export function detailCoverage(sport: DetailSport, s: { pointDetail?: boolean; events?: LiveEvent[] } | null | undefined): 'full' | 'quick' | null {
  if (!s) return null;
  if (s.pointDetail === true) return 'full';
  const quick = QUICK_HOWS[sport] ?? [];
  let any = false;
  for (const e of s.events ?? []) {
    if (!e.pd) continue;
    if (!quick.includes(e.pd.how)) return 'full';
    any = true;
  }
  return any ? 'quick' : null;
}

/** Did this match track 1st / 2nd serves on any point? */
export const serveTracked = (s: { events?: LiveEvent[] } | null | undefined): boolean =>
  !!s && (s.events ?? []).some((e) => e.serve === 1 || e.serve === 2);

type Tracks = { netDetail?: boolean; rallyDetail?: boolean; speedDetail?: boolean; thirdDetail?: boolean; events?: LiveEvent[] } | null | undefined;
/** Deep wave — did this (pickleball) match track the 3rd shot? */
export const thirdTracked = (s: Tracks): boolean =>
  !!s && (s.thirdDetail === true || (s.events ?? []).some((e) => !!e.third));
/** SD-157 — did this match track net points? (switched on, or a point marked,
 *  a legacy `pd.net` included) */
export const netTracked = (s: Tracks): boolean =>
  !!s && (s.netDetail === true || (s.events ?? []).some((e) => !!e.atNet || e.pd?.net === true));
/** SD-157 — did this match track rally length? */
export const rallyTracked = (s: Tracks): boolean =>
  !!s && (s.rallyDetail === true || (s.events ?? []).some((e) => !!e.rallyLen));
/** SD-157 — did this match track serve speed? */
export const speedTracked = (s: Tracks): boolean =>
  !!s && (s.speedDetail === true || (s.events ?? []).some((e) => typeof e.kmh === 'number'));
/** Round 2 — did this (pickleball) match track kitchen ARRIVAL? Only once a
 *  rally was marked "Nobody got there": before that chip an unmarked rally
 *  may have meant nobody, so an older match never reads a false 100%. */
export const arrivalTracked = (s: { events?: LiveEvent[] } | null | undefined): boolean =>
  !!s && (s.events ?? []).some((e) => e.atNet === 'none');

/** SD-157 — the net mark after the scorer toggles `side` on `cur` (both on →
 *  'both'; none → null, which clears it). Round 2: a side replaces "Nobody". */
export function toggleNet(cur: NetMark | undefined, side: Side): NetMark | null {
  const on = new Set<Side>(cur === 'both' ? ['home', 'away'] : cur === 'home' || cur === 'away' ? [cur] : []);
  if (on.has(side)) on.delete(side); else on.add(side);
  return on.size === 2 ? 'both' : on.size === 1 ? [...on][0] : null;
}
/** Round 2 — the mark after the scorer taps "Nobody" (again → cleared). */
export const toggleNobody = (cur: NetMark | undefined): NetMark | null => (cur === 'none' ? null : 'none');

/** SD-157 — the sides at the net on a point (`atNet`; a legacy `pd.net` =
 *  the point winner). `winner` = who won the point. 'none' → nobody. */
export function netSides(p: { atNet?: NetMark; pd?: PointDetail }, winner: Side | undefined): Side[] {
  if (p.atNet === 'none') return [];
  if (p.atNet === 'both') return ['home', 'away'];
  if (p.atNet === 'home' || p.atNet === 'away') return [p.atNet];
  return p.pd?.net === true && winner ? [winner] : [];
}

// ---------------------------------------------------------------- tally --

/** The side that WON a describable event. */
export const winnerSide = (e: LiveEvent): Side | undefined =>
  (e.kind === 'rally' ? e.wonBy : e.side) as Side | undefined;

/** Per-side counts of every detail key: winner-credit keys count for the
 *  side that hit them, error keys for the side that made them. `period`
 *  filters by the event's set / game. */
export function detailTally(sport: DetailSport, events: LiveEvent[] | undefined, period?: number): { home: Record<string, number>; away: Record<string, number>; points: number } {
  const keys = detailKeys(sport);
  const zero = () => Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>;
  const out = { home: zero(), away: zero(), points: 0 };
  for (const e of events ?? []) {
    if (!e.pd || !DESCRIBABLE.has(e.kind ?? '')) continue;
    if (period !== undefined && (e.set ?? e.game) !== period) continue;
    const W = winnerSide(e);
    if (W !== 'home' && W !== 'away') continue;
    for (const [side, key] of creditsOf(sport, e.pd)) {
      const t = side === 'winner' ? W : opp(W);
      out[t][key] = (out[t][key] ?? 0) + 1;
    }
    out.points += 1;
  }
  return out;
}

/** The (who, key) credits one detail makes. SD-157 tennis: the wing key and
 *  the shot key of the (normalised) stroke; net points are counted from the
 *  point itself (`netSides`, tennis/matchStats.ts), not here. Deep wave: the
 *  other racket sports the same (their shots, older winner ids normalised by
 *  `shotOf`), plus an error's / service fault's type (ueNet, sfHigh …). */
export function creditsOf(sport: DetailSport, pd: PointDetail): Array<['winner' | 'loser', string]> {
  const def = howDef(sport, pd.how);
  if (!def) return [];
  const out: Array<['winner' | 'loser', string]> = [[def.credit, HOW_KEY[pd.how]]];
  if (pd.how === 'stroke') out.push(['loser', STROKES_CONCEDED]);
  if (def.wingShot) {
    const { wing, shot } = shotOf(sport, pd);
    if (wing) out.push([def.credit, wingKey(pd.how, wing)!]);
    if (shot) out.push([def.credit, shotKey(pd.how, shot)!]);
  }
  const et = errTypeOf(sport, pd);
  const sk = et ? strokeKey(pd.how, et) : undefined;
  if (sk) out.push([def.credit, sk]);
  return out;
}

/** Player credits for statTotals: per player id, the detail keys. `resolve`
 *  maps an event's player (id / name) to a line id, else the side's only
 *  player (singles). */
export function detailPlayerCredits(
  sport: DetailSport,
  events: LiveEvent[] | undefined,
  resolve: (side: Side, p?: { playerId?: string; playerName?: string }) => string | undefined,
): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  const add = (id: string | undefined, key: string) => {
    if (!id) return;
    const m = out.get(id) ?? {};
    m[key] = (m[key] ?? 0) + 1;
    out.set(id, m);
  };
  for (const e of events ?? []) {
    if (!e.pd || !DESCRIBABLE.has(e.kind ?? '')) continue;
    const W = winnerSide(e);
    if (W !== 'home' && W !== 'away') continue;
    const winnerId = resolve(W, e.kind === 'rally' ? undefined : { playerId: e.playerId, playerName: e.playerName });
    const loserId = resolve(opp(W), e.pd.err);
    for (const [who, key] of creditsOf(sport, e.pd)) add(who === 'winner' ? winnerId : loserId, key);
  }
  return out;
}

// ----------------------------------------------------------- panel rows --

export interface DetailRow { key: string; label: string; home: string; away: string; hv: number; av: number }

const HOW_ROW_LABEL: Record<How, string> = {
  winner: 'Winners', fe: 'Forced errors', ue: 'Unforced errors', ace: 'Aces', sw: 'Service winners',
  sf: 'Service faults', stroke: 'Strokes awarded', nolet: 'No lets', rule: 'Points lost by rule',
};

/** The match-stats panel rows for point detail (empty when nothing is
 *  annotated in scope). Winners and errors, the winners / UE ratio, then the
 *  strokes that occurred (by stroke rows only when non-zero). */
export function detailRows(sport: DetailSport, events: LiveEvent[] | undefined, period?: number, full = true): DetailRow[] {
  const t = detailTally(sport, events, period);
  if (!t.points) return [];
  // SD-135 — one-tap detail only (Ace, Stroke / No let): just those rows
  if (!full) {
    const rows: DetailRow[] = [];
    for (const how of QUICK_HOWS[sport] ?? []) {
      const k = HOW_KEY[how];
      const h = t.home[k] ?? 0, a = t.away[k] ?? 0;
      if (h + a) rows.push({ key: k, label: HOW_ROW_LABEL[how], home: String(h), away: String(a), hv: h, av: a });
    }
    return rows;
  }
  const rows: DetailRow[] = [];
  const count = (key: string, label: string, always = false) => {
    const h = t.home[key] ?? 0, a = t.away[key] ?? 0;
    if (!always && h + a === 0) return;
    rows.push({ key, label, home: String(h), away: String(a), hv: h, av: a });
  };
  const hows = DETAIL_HOWS[sport];
  const main: How[] = ['winner', 'ue', 'fe'];
  for (const h of main) count(HOW_KEY[h], HOW_ROW_LABEL[h], true);
  const ratio = (x: Record<string, number>) => (x.unforcedErrors ? x.winners / x.unforcedErrors : x.winners ? Infinity : 0);
  const rt = (x: Record<string, number>) => (x.unforcedErrors ? (x.winners / x.unforcedErrors).toFixed(2) : x.winners ? `${x.winners}–0` : '–');
  const rh = ratio(t.home), ra = ratio(t.away);
  rows.push({ key: 'wue', label: 'Winners / UE', home: rt(t.home), away: rt(t.away), hv: Number.isFinite(rh) ? rh : 99, av: Number.isFinite(ra) ? ra : 99 });
  for (const d of hows) if (!main.includes(d.how)) count(HOW_KEY[d.how], HOW_ROW_LABEL[d.how]);
  for (const d of hows) {
    for (const st of d.strokes ?? []) {
      const lab = STROKES[st]?.label ?? st;
      count(strokeKey(d.how, st)!, d.how === 'winner' ? `${lab} winners` : d.how === 'sf' ? `Service fault · ${lab.toLowerCase()}` : `UE · ${lab.toLowerCase()}`);
    }
  }
  // SD-157 tennis (deep wave: every racket sport): by wing, then by shot type (the rows that occurred)
  const ws = hows.filter((d) => d.wingShot);
  for (const d of ws) for (const w of WINGS) count(wingKey(d.how, w)!, `${WING_LABEL[w]} ${HOW_ROW_LABEL[d.how].toLowerCase()}`);
  for (const d of ws) for (const s of shotIdsOf(sport)) count(shotKey(d.how, s)!, `${shotLabel(sport, s)} ${HOW_ROW_LABEL[d.how].toLowerCase()}`);
  return rows;
}

/** SD-107 — the keys the box score shows (W, UE, FE). */
export const DETAIL_BOX_KEYS = ['winners', 'unforcedErrors', 'forcedErrors'] as const;
