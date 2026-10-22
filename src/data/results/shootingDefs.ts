/**
 * SD-96 — the ISSF shooting programme the results engine knows (no imports, so
 * model.ts can build its discipline catalogue from it). Rules as implemented —
 * ISSF General Technical Rules (GTR) and the Rifle / Pistol / Shotgun rules,
 * edition in force from 1 January 2022 (as remembered; see the SD-96 report):
 *
 *  - 10 m Air Rifle: 60 shots, decimal scoring (10.9 a shot), series of 10;
 *    final of 8 — 2 series of 5 shots, then single shots, the last-placed
 *    eliminated after shot 12 and after every 2nd shot after it; shot 24
 *    decides gold and silver.
 *  - 10 m Air Pistol: 60 shots, integer scoring (10 a shot) with inner tens;
 *    the same final format, scored in decimals.
 *  - 10 m mixed team (rifle / pistol): a pair, 30 shots each, team total — the
 *    ISSF medal matches (first to 16) are not built: ranked on the total.
 *  - 50 m Rifle 3 Positions: 3 × 20 shots (kneeling, prone, standing), integer
 *    scoring with inner tens; final of 8 over 45 shots — two eliminated after
 *    shot 40, then one after each shot to 44, shot 45 decides gold.
 *  - 25 m Pistol / 25 m Rapid Fire Pistol: 60 shots in series of 5, integer
 *    scoring with inner tens — the hit-scored finals are not built: the
 *    qualification (match) result is the result.
 *  - Trap / Skeet: rounds of 25 targets, hits — qualification only.
 *
 * Round 2 (ISSF Rule Book, Edition 2025, effective 19 Oct 2026 — 6.11.9; see
 * docs/sport-depth/deep-wave/precision-strength-round2.md):
 *  - 50 m Rifle Prone: 60 shots, decimal scoring (max 654.0), no final;
 *  - 25 m Standard Pistol: 60 shots — 4 × 5 in 150 s, 4 × 5 in 20 s, 4 × 5 in
 *    10 s; integer with inner tens; no final;
 *  - 25 m Centre-Fire Pistol: 30 precision + 30 rapid-fire shots (3 s a shot);
 *    integer with inner tens; no final;
 *  - 50 m Pistol: 60 shots, integer with inner tens; no final;
 *  - NRAI school classes (NRAI Match Book 2024, amended 17 May 2025): 10 m
 *    Peep Sight Air Rifle = the NR "10M Rifle" match, 40 shots on the ISSF 10 m
 *    target, whole-ring scoring; 10 m Open Sight Air Rifle (a factory spring-
 *    piston rifle, NRAI 9.6) — its match is not defined nationally, so the same
 *    40-shot format is an organiser-configurable default.
 *
 * Shorter junior / school matches (40, 30, 20 shots …) are offered per event;
 * the category carries the shot count so records / PBs stay per match length.
 */

export type ShotScoring = 'decimal' | 'integer' | 'hits';
export type Gun = 'rifle' | 'pistol' | 'shotgun';
export type Position = 'K' | 'P' | 'S';

export interface ShootFinalDef {
  /** finalists for the standard final */
  finalists: number;
  /** the shot after which each elimination happens (one entry per shooter out,
   *  from the 8th place up) — 10 m: 12, 14 … 22 */
  elims: number[];
  /** the last shot: decides gold and silver */
  last: number;
  /** the first stage, as a hint ("2 series of 5 shots") */
  stage: string;
}

export interface ShootEventDef {
  key: string;
  label: string;
  short: string;
  gun: Gun;
  /** how a qualification shot is scored */
  scoring: ShotScoring;
  /** the standard qualification (match) length */
  shots: number;
  /** shots per series as entered (10; 25 m pistol 5; shotgun rounds 25) */
  seriesOf: number;
  /** shorter matches offered (junior / youth / school) */
  shotOptions: number[];
  /** 3 positions: the order of the positions in the match */
  positions?: Position[];
  final?: ShootFinalDef;
  /** a team of N (mixed team: a man and a woman) */
  teamSize?: number;
  /** rule references for the sheet */
  rules: string;
  /** Round 2: the stages of the match in order (25 m: "150 s", "20 s", "10 s"),
   *  each an equal share of the series — shown with the series being entered */
  stages?: string[];
  /** Round 2: 'nrai' = an NRAI national class (India), not an ISSF event */
  level?: 'issf' | 'nrai';
}

const AIR_FINAL: ShootFinalDef = { finalists: 8, elims: [12, 14, 16, 18, 20, 22], last: 24, stage: '2 series of 5 shots, then single shots' };
const R3P_FINAL: ShootFinalDef = { finalists: 8, elims: [40, 40, 41, 42, 43, 44], last: 45, stage: '3 × 5 kneeling, 3 × 5 prone, 2 × 5 standing, then single shots' };

export const SHOOT_EVENTS: ShootEventDef[] = [
  { key: 'shoot.10mar', label: '10 m Air Rifle', short: '10m AR', gun: 'rifle', scoring: 'decimal', shots: 60, seriesOf: 10, shotOptions: [60, 40, 30, 20], final: AIR_FINAL, rules: 'ISSF Rifle rules · decimal scoring' },
  { key: 'shoot.10map', label: '10 m Air Pistol', short: '10m AP', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 10, shotOptions: [60, 40, 30, 20], final: AIR_FINAL, rules: 'ISSF Pistol rules · integer scoring, inner tens' },
  { key: 'shoot.50m3p', label: '50 m Rifle 3 Positions', short: '50m 3P', gun: 'rifle', scoring: 'integer', shots: 60, seriesOf: 10, shotOptions: [60, 30], positions: ['K', 'P', 'S'], final: R3P_FINAL, rules: 'ISSF Rifle rules · 3 × 20 kneeling, prone, standing' },
  { key: 'shoot.25mp', label: '25 m Pistol', short: '25m P', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 5, shotOptions: [60, 30], stages: ['Precision', 'Rapid fire'], rules: 'ISSF Pistol rules · precision + rapid stages, series of 5' },
  { key: 'shoot.25mrf', label: '25 m Rapid Fire Pistol', short: '25m RF', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 5, shotOptions: [60, 30], rules: 'ISSF Pistol rules · series of 5 in 8 / 6 / 4 s' },
  { key: 'shoot.10marx', label: '10 m Air Rifle Mixed Team', short: '10m AR MT', gun: 'rifle', scoring: 'decimal', shots: 60, seriesOf: 10, shotOptions: [60, 40], teamSize: 2, rules: 'ISSF Rifle rules · 30 shots each, team total' },
  { key: 'shoot.10mapx', label: '10 m Air Pistol Mixed Team', short: '10m AP MT', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 10, shotOptions: [60, 40], teamSize: 2, rules: 'ISSF Pistol rules · 30 shots each, team total' },
  { key: 'shoot.trap', label: 'Trap', short: 'Trap', gun: 'shotgun', scoring: 'hits', shots: 125, seriesOf: 25, shotOptions: [125, 75, 50], rules: 'ISSF Shotgun rules · rounds of 25 targets' },
  { key: 'shoot.skeet', label: 'Skeet', short: 'Skeet', gun: 'shotgun', scoring: 'hits', shots: 125, seriesOf: 25, shotOptions: [125, 75, 50], rules: 'ISSF Shotgun rules · rounds of 25 targets' },
  // Round 2: more ISSF events (Rule Book 2025 edition, 6.11.9) — none has a final
  { key: 'shoot.50mpr', label: '50 m Rifle Prone', short: '50m PR', gun: 'rifle', scoring: 'decimal', shots: 60, seriesOf: 10, shotOptions: [60, 40, 30], rules: 'ISSF Rifle rules · 60 shots prone, decimal scoring (6.11.9.3)' },
  { key: 'shoot.25msp', label: '25 m Standard Pistol', short: '25m SP', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 5, shotOptions: [60, 30], stages: ['150 s', '20 s', '10 s'], rules: 'ISSF Pistol rules · 4 × 5 in 150 s, 4 × 5 in 20 s, 4 × 5 in 10 s (6.11.9.9)' },
  { key: 'shoot.25mcf', label: '25 m Centre-Fire Pistol', short: '25m CF', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 5, shotOptions: [60, 30], stages: ['Precision', 'Rapid fire'], rules: 'ISSF Pistol rules · 30 precision + 30 rapid fire, 3 s a shot (6.11.9.7)' },
  { key: 'shoot.50mp', label: '50 m Pistol', short: '50m P', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 10, shotOptions: [60, 40, 30], rules: 'ISSF Pistol rules · 60 shots, integer scoring, inner tens (6.11.9.8)' },
  // Round 2: NRAI school classes (India) — not ISSF events
  { key: 'shoot.10mps', label: '10 m Peep Sight Air Rifle', short: '10m Peep', gun: 'rifle', scoring: 'integer', shots: 40, seriesOf: 10, shotOptions: [40, 20, 10], level: 'nrai', rules: 'NRAI 10 m Rifle (NR) · peep sight, 40 shots, ISSF 10 m target, whole rings' },
  { key: 'shoot.10mos', label: '10 m Open Sight Air Rifle', short: '10m Open', gun: 'rifle', scoring: 'integer', shots: 40, seriesOf: 10, shotOptions: [40, 20, 10], level: 'nrai', rules: 'NRAI open sight (factory spring-piston rifle) · 40 shots, whole rings — the match is the organiser’s (default as the peep-sight match)' },
];

/** Round 2: the stage a series belongs to (25 m Standard Pistol "20 s"; Centre-Fire "Rapid fire"), or undefined. */
export function stageOf(ev: ShootEventDef, shots: number, seriesIdx: number): string | undefined {
  if (!ev.stages?.length) return undefined;
  const per = Math.max(1, Math.round(Math.ceil(shots / ev.seriesOf) / ev.stages.length));
  return ev.stages[Math.min(ev.stages.length - 1, Math.floor(seriesIdx / per))];
}

export const shootEventOf = (key?: string): ShootEventDef | undefined => SHOOT_EVENTS.find((e) => e.key === key) ?? shootTeamOf(key);

/**
 * SD-137b — ISSF team events of 3 (GTR team events, as remembered — verify):
 * three shooters of one country / club / house shoot the individual match; the
 * team's score is the sum of their three scores (no separate team firing).
 * Ties: the same order as individuals on the team's added scores — inner tens
 * (integer scoring), then the last series of all three added, back series by
 * series (ISSF GTR team ties as remembered — verify). No final.
 * Key: the individual event's key + '.team' ('shoot.10mar.team').
 */
export const SHOOT_TEAM_SIZE = 3;
export const shootTeamKey = (base: string): string => `${base}.team`;
export function shootTeamOf(key?: string | null): ShootEventDef | undefined {
  if (!key || !key.endsWith('.team')) return undefined;
  const base = SHOOT_EVENTS.find((e) => e.key === key.slice(0, -5));
  if (!base || base.teamSize) return undefined;
  return {
    ...base, key, label: `${base.label} Team`, short: `${base.short} Team`, final: undefined, teamSize: SHOOT_TEAM_SIZE,
    rules: `${base.rules} · team of 3: the members' match scores added`,
  };
}
/** The individual event behind a team-of-3 key. */
export const shootTeamBase = (key?: string | null): string | undefined => (shootTeamOf(key) ? key!.slice(0, -5) : undefined);

/** The most a shot / target scores: 10.9 (decimal), 10 (integer), 1 (a hit). */
export const maxShot = (s: ShotScoring): number => (s === 'decimal' ? 10.9 : s === 'hits' ? 1 : 10);

/** Points as integer tenths, so decimal sums compare exactly (10.4 + 10.2 = 20.6, not 20.599…). */
export const tenths = (v: number): number => Math.round(v * 10);
export const sumTenths = (xs: number[]): number => xs.reduce((a, v) => a + tenths(v), 0);
export const fromTenths = (t: number): number => t / 10;

/**
 * Round 2: a finalist's shots net of the penalties given in the final
 * (`fpen[i]` points off shot `i` — ISSF: 2 points). A net shot never goes below
 * 0. Without penalties these are exactly the shots as fired.
 */
export function netFinalShots(r: { fshots?: number[]; fpen?: number[] }): number[] {
  const f = r.fshots ?? [];
  if (!r.fpen?.some((p) => p > 0)) return f;
  return f.map((v, i) => Math.max(0, fromTenths(tenths(v) - tenths(r.fpen?.[i] ?? 0))));
}
/** Round 2: penalty points given in the final (0 without any). */
export const finalPenaltyTotal = (r: { fpen?: number[] }): number => fromTenths((r.fpen ?? []).reduce((a, p) => a + tenths(p ?? 0), 0));

/**
 * The elimination points for a final of `n` (default: the event's finalists).
 * A smaller final (a school final of 6) drops the first eliminations, so it
 * still ends on the same last shot (10 m: 16, 18, 20, 22, then 24).
 */
export function finalSchedule(f: ShootFinalDef, n: number): number[] {
  const need = Math.max(0, n - 2);
  return f.elims.slice(Math.max(0, f.elims.length - need));
}

/** The series count of a match: 60 shots in tens = 6; 25 m in fives = 12; shotgun 125 = 5 rounds. */
export const seriesCount = (ev: ShootEventDef, shots: number): number => Math.ceil(shots / ev.seriesOf);

/** 3 positions: which position a series belongs to (3 × 20: K K P P S S). */
export function positionOf(ev: ShootEventDef, shots: number, seriesIdx: number): Position | undefined {
  if (!ev.positions) return undefined;
  const per = Math.max(1, Math.round(seriesCount(ev, shots) / ev.positions.length));
  return ev.positions[Math.min(ev.positions.length - 1, Math.floor(seriesIdx / per))];
}

export const POSITION_LABEL: Record<Position, string> = { K: 'Kneeling', P: 'Prone', S: 'Standing' };
