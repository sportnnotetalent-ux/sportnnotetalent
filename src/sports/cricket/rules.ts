/**
 * Cricket local rules (parity #14) — wide / no-ball values, byes, free hit,
 * "normal rules in the last N overs". Pure and JSX-free so node tests load it
 * (note the `.ts` extensions, as in engine.ts).
 *
 * The match's baseline comes from its format (`rulesFromConfig`); mid-match
 * changes are SET_RULES events (payloads use the same CONFIG keys), so past
 * balls keep the rules they were bowled under.
 */
import type { FormatField, FormatValue, LiveSettings } from '../types';
import type { CricketState } from './engine.ts';

export interface CricketRules {
  wideRuns: number;
  wideLegal: boolean;
  noBallRuns: number;
  noBallLegal: boolean;
  stdLastOvers: number;
  byes: boolean;
  legByes: boolean;
  freeHit: boolean;
  /** SD-133 (CK-11) — offer the wagon wheel + shot type after each scoring
   *  shot. A capture setting, not a playing rule (ignored by `isStandard`). */
  wagonWheel: boolean;
  /** SD-133 — local "retire at N runs" (school / sixes cricket): a batter who
   *  reaches N retires not out. Absent / 0 = off. Only present when set, so
   *  older states keep their exact shape. */
  retireAt?: number;
  /** …and may come back once everyone else has batted (default yes). */
  retireBack?: boolean;
  /** Deep wave — "Stats to track" (capture settings, not playing rules; each
   *  key present only when on, so older states keep their exact shape):
   *  a pitch map (length + line) per delivery, shot control (false shots),
   *  ball speed (km/h from a speed gun), and each bowler's type. */
  pitchMap?: true;
  shotCtrl?: true;
  ballSpeed?: true;
  bowlerType?: true;
  /** Round 2 — "Stats to track": the reason for a wide / no-ball (a chip
   *  after the extra). Present only when on. */
  extraWhy?: true;
  /** Round 2 — the stats PHASES (organiser options, phases.ts; not playing
   *  rules — the format's `powerplayOvers` sets fielding restrictions):
   *  powerplay overs (absent = the format's, 0 = none, N = overs 1–N) and the
   *  death overs (absent = automatic, 0 = none, N = the last N). Present only
   *  when the organiser chose something other than the default. */
  phasePP?: number;
  phaseDeath?: number;
  /** Round 2 — fast short-pitched balls allowed per over (ICC playing
   *  conditions; absent = the standard for the format: 1 up to 20 overs, else
   *  2 — `bouncerLimit`; 0 = no limit). Drives the bouncer warning, which reads
   *  the pitch map's "Bouncer" length. Present only when set. */
  bouncerMax?: number;
  /** Batch 5 (audit fix 3, R9) — DRS: unsuccessful reviews each side may make
   *  per innings (ICC T20I 2, ODI 3). A playing condition the organiser opts
   *  into; absent = off (no Review chip). 1–5; present only when set. */
  reviews?: number;
  /** Batch 6 (audit fix 5, R8) — "last man stands" (box / gully cricket): when
   *  one batter is left they bat on alone, keep the strike, and the innings
   *  ends only when they are out too. A playing rule; absent = off (present
   *  only when on, so older states keep their exact shape). */
  lastManStands?: true;
}

/** Deep wave — the optional capture toggles ("Stats to track"), in chip order. */
export const TRACK_KEYS = ['pitchMap', 'shotCtrl', 'ballSpeed', 'bowlerType', 'extraWhy'] as const;
export type TrackKey = typeof TRACK_KEYS[number];
const TRACK_WORD: Record<TrackKey, string> = { pitchMap: 'Pitch map', shotCtrl: 'Shot control', ballSpeed: 'Ball speed', bowlerType: 'Bowler type', extraWhy: 'Wide / no-ball reason' };
/** Round 2 — the organiser's option keys (stats phases, bouncer limit):
 *  'auto' or absent = the standard default; a number = the choice. */
export const OPTION_KEYS = ['phasePP', 'phaseDeath', 'bouncerMax'] as const;
export type OptionKey = typeof OPTION_KEYS[number];
const isAuto = (v: unknown) => v === undefined || v === null || v === '' || v === 'auto';
/** A whole number 0–max, or undefined for the default ('auto' / absent / junk). */
const optNum = (v: unknown, max: number): number | undefined => {
  if (isAuto(v)) return undefined;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(max, n) : undefined;
};
const OPTION_MAX: Record<OptionKey, number> = { phasePP: 50, phaseDeath: 50, bouncerMax: 6 };
/** The option keys that are set (absent = the default, so older states keep their shape). */
const optionsOn = (get: (k: OptionKey) => unknown): Partial<Pick<CricketRules, OptionKey>> => {
  const out: Partial<Pick<CricketRules, OptionKey>> = {};
  for (const k of OPTION_KEYS) {
    const v = optNum(get(k), OPTION_MAX[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
};
/** The capture keys that are on (absent keys = off, so the shape stays lean). */
const trackOn = (get: (k: TrackKey) => unknown): Partial<Pick<CricketRules, TrackKey>> => {
  const out: Partial<Pick<CricketRules, TrackKey>> = {};
  for (const k of TRACK_KEYS) if (get(k)) out[k] = true;
  return out;
};

export const STANDARD_RULES: CricketRules = {
  wideRuns: 1, wideLegal: false, noBallRuns: 1, noBallLegal: false,
  stdLastOvers: 0, byes: true, legByes: true, freeHit: true, wagonWheel: false,
};

/** Config (format / SET_RULES payload) keys. Two differ from CricketRules:
 *  byesAllowed ⇄ byes, legByesAllowed ⇄ legByes. The rest are identical. */
export const RULE_CONFIG_KEYS = ['wideRuns', 'wideLegal', 'noBallRuns', 'noBallLegal', 'freeHit', 'stdLastOvers', 'byesAllowed', 'legByesAllowed', 'wagonWheel', 'retireAt', 'retireBack', ...TRACK_KEYS, ...OPTION_KEYS, 'reviews', 'lastManStands'] as const;

const clamp05 = (v: unknown, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : d;
};
const bool = (v: unknown, d: boolean) => (v === undefined || v === null ? d : v === true || v === 'true' || v === 1);
/** SD-133 — the retire limit: a whole number 1–500, else off (0). */
const retireOf = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(500, n) : 0;
};

/** Batch 5 — DRS reviews per side per innings: a whole number 1–5, else off (0). */
export const reviewsOf = (v: unknown): number => {
  if (typeof v !== 'number' && typeof v !== 'string') return 0;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(5, n) : 0;
};

/** Batch 6 — last man stands: only a real "on" (true / 'true' / 1) turns it on. */
export const lastManOf = (v: unknown): boolean => v === true || v === 'true' || v === 1;

/** Format / SET_RULES config → rules (missing keys = standard; numbers clamped 0–5). */
export function rulesFromConfig(config?: Record<string, unknown> | null): CricketRules {
  const c = config ?? {};
  return {
    wideRuns: clamp05(c.wideRuns, STANDARD_RULES.wideRuns),
    wideLegal: bool(c.wideLegal, STANDARD_RULES.wideLegal),
    noBallRuns: clamp05(c.noBallRuns, STANDARD_RULES.noBallRuns),
    noBallLegal: bool(c.noBallLegal, STANDARD_RULES.noBallLegal),
    stdLastOvers: clamp05(c.stdLastOvers, STANDARD_RULES.stdLastOvers),
    byes: bool(c.byesAllowed, STANDARD_RULES.byes),
    legByes: bool(c.legByesAllowed, STANDARD_RULES.legByes),
    freeHit: bool(c.freeHit, STANDARD_RULES.freeHit),
    wagonWheel: bool(c.wagonWheel, STANDARD_RULES.wagonWheel),
    // SD-133 — only when on (older states: no keys).
    ...(retireOf(c.retireAt) > 0 ? { retireAt: retireOf(c.retireAt), retireBack: bool(c.retireBack, true) } : {}),
    // Deep wave — only when on (older states: no keys).
    ...trackOn((k) => bool(c[k], false)),
    // Round 2 — only when not the default (older states: no keys).
    ...optionsOn((k) => c[k]),
    // Batch 5 — DRS, only when on (older states: no key).
    ...(reviewsOf(c.reviews) > 0 ? { reviews: reviewsOf(c.reviews) } : {}),
    // Batch 6 — last man stands, only when on (older states: no key).
    ...(lastManOf(c.lastManStands) ? { lastManStands: true as const } : {}),
  };
}

/** Rules → config keys (the inverse of rulesFromConfig). */
export function rulesToConfig(r: CricketRules = STANDARD_RULES): Record<string, number | boolean> {
  return {
    wideRuns: r.wideRuns, wideLegal: r.wideLegal, noBallRuns: r.noBallRuns, noBallLegal: r.noBallLegal,
    freeHit: r.freeHit, stdLastOvers: r.stdLastOvers, byesAllowed: r.byes, legByesAllowed: r.legByes,
    wagonWheel: r.wagonWheel,
    ...(r.retireAt ? { retireAt: r.retireAt, retireBack: r.retireBack !== false } : {}),
    ...trackOn((k) => r[k]),
    ...optionsOn((k) => r[k]),
    ...(r.reviews ? { reviews: r.reviews } : {}),
    ...(r.lastManStands ? { lastManStands: true } : {}),
  };
}

/** Rules after a SET_RULES patch (config keys; unknown keys ignored, values sanitised). */
export function patchRules(r: CricketRules, patch?: Record<string, unknown> | null): CricketRules {
  const known: Record<string, unknown> = {};
  for (const k of RULE_CONFIG_KEYS) if (patch && k in patch) known[k] = patch[k];
  return rulesFromConfig({ ...rulesToConfig(r), ...known });
}

export const rulesOf = (s: Pick<CricketState, 'rules'>): CricketRules => s.rules ?? STANDARD_RULES;

/** Inside the last `stdLastOvers` overs? (then wides/no-balls revert to standard) */
export function inStandardWindow(s: Pick<CricketState, 'rules' | 'oversLimit' | 'scores' | 'battingSide' | 'ballsPerOver'>): boolean {
  const r = rulesOf(s);
  if (r.stdLastOvers <= 0) return false;
  const bowled = Math.floor(s.scores[s.battingSide].balls / s.ballsPerOver);
  return bowled >= s.oversLimit - r.stdLastOvers;
}

/** The rules in force for the NEXT ball. */
export function effectiveRules(s: Pick<CricketState, 'rules' | 'oversLimit' | 'scores' | 'battingSide' | 'ballsPerOver'>): CricketRules {
  const r = rulesOf(s);
  if (!inStandardWindow(s)) return r;
  return { ...r, wideRuns: STANDARD_RULES.wideRuns, wideLegal: STANDARD_RULES.wideLegal, noBallRuns: STANDARD_RULES.noBallRuns, noBallLegal: STANDARD_RULES.noBallLegal };
}

/** Standard playing rules? The wagon wheel is a capture setting, not a rule;
 *  nor are the stats phases — but a bouncer limit is. */
export const isStandard = (r: CricketRules) =>
  (Object.keys(STANDARD_RULES) as (keyof CricketRules)[]).every((k) => k === 'wagonWheel' || r[k] === STANDARD_RULES[k])
  && !r.retireAt && r.bouncerMax === undefined && !r.lastManStands;

const runsWord = (n: number) => `${n} run${n === 1 ? '' : 's'}`;

/** Short chip text for non-standard rules: "Wd 2 · NB = ball · no byes". */
export function rulesChip(r: CricketRules): string {
  const parts: string[] = [];
  if (r.wideRuns !== 1) parts.push(`Wd ${r.wideRuns}`);
  if (r.wideLegal) parts.push('Wd = ball');
  if (r.noBallRuns !== 1) parts.push(`NB ${r.noBallRuns}`);
  if (r.noBallLegal) parts.push('NB = ball');
  if (!r.freeHit) parts.push('no free hit');
  if (!r.byes) parts.push('no byes');
  if (!r.legByes) parts.push('no leg byes');
  if (r.stdLastOvers > 0) parts.push(`normal last ${r.stdLastOvers}`);
  if (r.retireAt) parts.push(`retire at ${r.retireAt}`);
  if (r.bouncerMax !== undefined) parts.push(r.bouncerMax > 0 ? `${r.bouncerMax} bouncer${r.bouncerMax === 1 ? '' : 's'}/over` : 'no bouncer limit');
  if (r.reviews) parts.push(`DRS ${r.reviews}`);
  if (r.lastManStands) parts.push('last man stands');
  return parts.join(' · ');
}

const oversWord = (n: number) => `${n} over${n === 1 ? '' : 's'}`;
/** Round 2 — "Powerplay phase: overs 1–4" / "No powerplay phase" / "Powerplay phase: the format's". */
export const phasePPText = (n?: number): string =>
  (n === undefined ? 'Powerplay phase: the format’s' : n === 0 ? 'No powerplay phase' : `Powerplay phase: overs 1–${n}`);
/** Round 2 — "Death phase: last 4 overs" / "No death phase" / "Death phase: automatic". */
export const phaseDeathText = (n?: number): string =>
  (n === undefined ? 'Death phase: automatic' : n === 0 ? 'No death phase' : `Death phase: last ${oversWord(n)}`);
/** Round 2 — "Bouncers: 2 per over" / "No bouncer limit" / "Bouncer limit: standard". */
export const bouncerText = (n?: number): string =>
  (n === undefined ? 'Bouncer limit: standard' : n === 0 ? 'No bouncer limit' : `Bouncers: ${n} per over`);

/** Batch 5 — "DRS: 2 reviews per innings" / "No DRS reviews". */
export const reviewsText = (n?: number): string =>
  (n ? `DRS: ${n} review${n === 1 ? '' : 's'} per innings` : 'No DRS reviews');

/** Timeline text for a rules change: "Wide 2 runs · counts as a ball". */
export function describeRulesChange(prev: CricketRules, next: CricketRules): string {
  const parts: string[] = [];
  if (prev.wideRuns !== next.wideRuns || prev.wideLegal !== next.wideLegal) {
    const w: string[] = [];
    if (prev.wideRuns !== next.wideRuns) w.push(`Wide ${runsWord(next.wideRuns)}`);
    if (prev.wideLegal !== next.wideLegal) w.push(next.wideLegal ? (w.length ? 'counts as a ball' : 'Wide counts as a ball') : (w.length ? 'not a ball' : 'Wide not a ball'));
    parts.push(w.join(' · '));
  }
  if (prev.noBallRuns !== next.noBallRuns || prev.noBallLegal !== next.noBallLegal) {
    const n: string[] = [];
    if (prev.noBallRuns !== next.noBallRuns) n.push(`No-ball ${runsWord(next.noBallRuns)}`);
    if (prev.noBallLegal !== next.noBallLegal) n.push(next.noBallLegal ? (n.length ? 'counts as a ball' : 'No-ball counts as a ball') : (n.length ? 'not a ball' : 'No-ball not a ball'));
    parts.push(n.join(' · '));
  }
  if (prev.freeHit !== next.freeHit) parts.push(next.freeHit ? 'Free hit on' : 'No free hit');
  if (prev.byes !== next.byes) parts.push(next.byes ? 'Byes allowed' : 'No byes');
  if (prev.legByes !== next.legByes) parts.push(next.legByes ? 'Leg byes allowed' : 'No leg byes');
  if (prev.stdLastOvers !== next.stdLastOvers) parts.push(next.stdLastOvers > 0 ? `Normal rules in the last ${next.stdLastOvers} over${next.stdLastOvers === 1 ? '' : 's'}` : 'Local rules all innings');
  // SD-133
  if ((prev.retireAt ?? 0) !== (next.retireAt ?? 0)) parts.push(next.retireAt ? `Batters retire at ${next.retireAt}` : 'No retire limit');
  else if (next.retireAt && (prev.retireBack !== false) !== (next.retireBack !== false)) parts.push(next.retireBack !== false ? 'Retired batters may return' : 'Retired batters can’t return');
  if (prev.wagonWheel !== next.wagonWheel) parts.push(next.wagonWheel ? 'Wagon wheel on' : 'Wagon wheel off');
  // Deep wave
  for (const k of TRACK_KEYS) if (!!prev[k] !== !!next[k]) parts.push(`${TRACK_WORD[k]} ${next[k] ? 'on' : 'off'}`);
  // Round 2 — organiser options
  if (prev.phasePP !== next.phasePP) parts.push(phasePPText(next.phasePP));
  if (prev.phaseDeath !== next.phaseDeath) parts.push(phaseDeathText(next.phaseDeath));
  if (prev.bouncerMax !== next.bouncerMax) parts.push(bouncerText(next.bouncerMax));
  if ((prev.reviews ?? 0) !== (next.reviews ?? 0)) parts.push(reviewsText(next.reviews));
  if (!!prev.lastManStands !== !!next.lastManStands) parts.push(next.lastManStands ? 'Last man stands — the last batter bats on alone' : 'Last man stands off');
  return parts.join(' · ');
}

/** "Before ball 1": innings 1, no deliveries and no extras. The toss and setup
 *  picks (batters, bowler, keeper) don't count — so rules set now become the
 *  match's format baseline rather than a SET_RULES event. */
export function cricketBeforeStart(s: CricketState): boolean {
  if (s.superOver || s.innings !== 1) return false;
  const { home, away } = s.scores;
  return home.balls + away.balls === 0 && home.extras + away.extras === 0 && home.runs + away.runs === 0
    && home.wickets + away.wickets === 0 && s.thisOver.length === 0;
}

/** Shared by formatFields (advanced) and liveSettings.fields. */
export const LOCAL_RULE_FIELDS: FormatField[] = [
  { key: 'wideRuns', label: 'Runs for a wide', type: 'count', default: 1, min: 0, max: 5, advanced: true },
  { key: 'wideLegal', label: 'Wide counts as a ball', type: 'toggle', default: false, advanced: true },
  { key: 'noBallRuns', label: 'Runs for a no-ball', type: 'count', default: 1, min: 0, max: 5, advanced: true },
  { key: 'noBallLegal', label: 'No-ball counts as a ball', type: 'toggle', default: false, advanced: true },
  { key: 'freeHit', label: 'Free hit after a no-ball', type: 'toggle', default: true, advanced: true },
  { key: 'stdLastOvers', label: 'Normal wide/no-ball rules in the last N overs', type: 'count', default: 0, min: 0, max: 5, hint: '0 = never', advanced: true },
  { key: 'byesAllowed', label: 'Byes allowed', type: 'toggle', default: true, advanced: true },
  { key: 'legByesAllowed', label: 'Leg byes allowed', type: 'toggle', default: true, advanced: true },
  // SD-133 — school / sixes cricket: retire at N runs (0 = off)
  { key: 'retireAt', label: 'Batters retire at (runs)', type: 'number', default: 0, min: 0, max: 500, advanced: true, hint: '0 = off · e.g. 25 in school cricket — the batter retires not out' },
  { key: 'retireBack', label: 'Retired batters may bat again', type: 'toggle', default: true, advanced: true, hint: 'once everyone else has batted' },
  // SD-133 (CK-11) — wagon wheel + shot type after each scoring shot (optional taps);
  // batch 5 (C2) — the shot type on a dot ball or a dismissal too
  { key: 'wagonWheel', label: 'Wagon wheel (where each shot went)', type: 'toggle', default: false, advanced: true, hint: 'an optional field tap after each scoring shot, and the shot type on a dot ball or a wicket', group: 'Stats to track' },
  // Deep wave — optional depth, one chip row ("Stats to track"); every tap is optional
  { key: 'pitchMap', label: 'Pitch map (line & length)', type: 'toggle', default: false, advanced: true, hint: 'optional length + line chips after each ball', group: 'Stats to track' },
  { key: 'shotCtrl', label: 'Shot control (beaten / edged)', type: 'toggle', default: false, advanced: true, hint: 'tap Beaten / Edged / Mistimed on a false shot — untagged balls count as in control', group: 'Stats to track' },
  { key: 'ballSpeed', label: 'Ball speed (speed gun)', type: 'toggle', default: false, advanced: true, hint: 'type the km/h after a ball', group: 'Stats to track' },
  { key: 'bowlerType', label: 'Bowler type (pace / spin)', type: 'toggle', default: false, advanced: true, hint: 'one tap per bowler — free when the profile has it', group: 'Stats to track' },
  // Round 2 — why a wide / no-ball was called (an optional chip after the extra)
  { key: 'extraWhy', label: 'Wide / no-ball reason', type: 'toggle', default: false, advanced: true, hint: 'tap why after a wide (down leg, outside off, over head) or a no-ball (front foot, height, bouncers, fielding)', group: 'Stats to track' },
  // Round 2 — the stats phases (organiser options; the format's powerplay still sets fielding restrictions)
  { key: 'phasePP', label: 'Stats phases — powerplay', type: 'choice', default: 'auto', advanced: true,
    hint: 'splits the Stats tab and careers into powerplay / middle / death',
    options: [
      { value: 'auto', label: 'Format’s powerplay' }, { value: 0, label: 'None' },
      ...[2, 3, 4, 5, 6, 8, 10, 15].map((n) => ({ value: n, label: `Overs 1–${n}` })),
    ] },
  { key: 'phaseDeath', label: 'Stats phases — death overs', type: 'choice', default: 'auto', advanced: true,
    hint: 'automatic = the last quarter (T20 16–20; the last 10 from 40 overs up)',
    options: [
      { value: 'auto', label: 'Automatic' }, { value: 0, label: 'None' },
      ...[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: n, label: `Last ${oversWord(n)}` })),
    ] },
  // Round 2 — bouncers per over (ICC: 1 in T20, 2 in longer cricket); the warning reads the pitch map
  { key: 'bouncerMax', label: 'Bouncers allowed per over', type: 'choice', default: 'auto', advanced: true,
    hint: 'with the pitch map on, a warning once the limit is reached — the next bouncer is a no-ball',
    options: [
      { value: 'auto', label: 'Standard (T20 1 · longer 2)' }, { value: 0, label: 'No limit' },
      ...[1, 2, 3].map((n) => ({ value: n, label: String(n) })),
    ] },
  // Batch 5 (audit fix 3) — DRS: an optional Review chip and "reviews left"
  { key: 'reviews', label: 'DRS reviews (per side, per innings)', type: 'choice', default: 0, advanced: true,
    hint: 'off = no Review chip · a struck-down review is lost; overturned or umpire’s call keeps it',
    options: [{ value: 0, label: 'Off' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} per innings` }))] },
  // Batch 6 (audit fix 5, R8) — box / gully cricket. A `choice` (0 / 1), not a
  // toggle, so Info lists it as a rule, not a stats capture.
  { key: 'lastManStands', label: 'Last man stands', type: 'choice', default: 0, advanced: true,
    hint: 'box / gully cricket: the last batter bats on alone (keeps the strike); all out only when they are out too',
    options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On — the last batter bats alone' }] },
];

export const LOCAL_RULE_DEFAULTS: Record<string, FormatValue> = {
  ...rulesToConfig(STANDARD_RULES), retireAt: 0, retireBack: true,
  ...Object.fromEntries(TRACK_KEYS.map((k) => [k, false])),
  ...Object.fromEntries(OPTION_KEYS.map((k) => [k, 'auto'])),
  reviews: 0,
  lastManStands: 0,
};

/** Cricket's live settings (event mode): before ball 1 a change patches the
 *  match format; after it, Apply logs SET_RULES (from the next ball). */
export const CRICKET_LIVE_SETTINGS: LiveSettings<CricketState> = {
  title: '⚙️ Match rules',
  hint: 'Local rules for this match — wides, no-balls, byes — and the optional stats to track.',
  mode: 'event',
  actionType: 'SET_RULES',
  fields: LOCAL_RULE_FIELDS,
  read: (s) => {
    const r = rulesOf(s);
    return {
      ...rulesToConfig(r), retireAt: r.retireAt ?? 0, retireBack: r.retireBack !== false, ...Object.fromEntries(TRACK_KEYS.map((k) => [k, !!r[k]])),
      ...Object.fromEntries(OPTION_KEYS.map((k) => [k, r[k] ?? 'auto'])),
      reviews: r.reviews ?? 0,
      lastManStands: r.lastManStands ? 1 : 0,
    };
  },
  beforeStart: cricketBeforeStart,
  defaults: LOCAL_RULE_DEFAULTS,
};
