/**
 * Run it again (2026-10-27): a carried programme event (tournamentCopyPlan.ts)
 * turned back into each event-setup screen's choices, so "Set up ›" on
 * "Events from last time" opens the screen as last edition left it: the event,
 * age group and gender, and the set-up (match length and final, bow and round
 * and bracket, boat and distance and lanes, race kind and laps, category,
 * course and team scoring, a combined event's list and implements).
 * Athletics track / field and swimming pre-fill in AthleticsEventSetupScreen.
 * Each returns null when the event isn't one this screen knows.
 *
 * PURE (no React Native) — node tests load it.
 */
import type { ProgrammeEvent } from './tournamentCopyPlan.ts';
import { SHOOT_EVENTS, shootTeamKey } from './results/shootingDefs.ts';
import { ARCH_ROUNDS, archTeamOf, type Bow } from './results/archeryDefs.ts';
import { crewEventOf } from './results/crewDefs.ts';
import { CYC_EVENTS, CYC_TEAM_EVENTS, type CycKind } from './results/cyclingDefs.ts';
import { roadEventOf, ROAD_METRES, WALK_ROAD_METRES, WALK_TRACK_METRES, XC_METRES, type RoadKind, type TeamBasis } from './results/roadDefs.ts';
import { COMBINED_PRESETS, type CombinedKind, type CombinedTable } from './results/combinedDefs.ts';

const gender2 = (g?: string): 'M' | 'F' => (g === 'F' ? 'F' : 'M');
const gender3 = (g?: string): 'M' | 'F' | 'X' => (g === 'F' || g === 'X' ? g : 'M');
const hadQualifying = (e: ProgrammeEvent) => !!e.rounds?.includes('qualification');

export interface ShootingSeed { evKey: string; of3: boolean; age: string; gender: 'M' | 'F'; shots: number; mode: 'series' | 'shot'; finalists?: number; matches?: boolean }

export function shootingSeed(e: ProgrammeEvent): ShootingSeed | null {
  const direct = SHOOT_EVENTS.find((x) => x.key === e.discipline);
  const base = direct ?? SHOOT_EVENTS.find((x) => !x.teamSize && shootTeamKey(x.key) === e.discipline);
  if (!base) return null;
  const s = e.settings ?? {};
  return {
    evKey: base.key,
    of3: !direct,
    age: e.category?.age ?? 'Junior',
    gender: gender2(e.category?.gender),
    shots: e.category?.shots ?? base.shots,
    mode: s.shootEntry === 'shot' ? 'shot' : 'series',
    // an individual event with a final: last time's final size, or none at all
    ...(base.final && direct && !base.teamSize ? { finalists: s.shootFinal && e.fieldSize ? e.fieldSize : s.shootFinal ? base.final.finalists : 0 } : {}),
    ...(base.teamSize ? { matches: !!s.shootMatch } : {}),
  };
}

export interface ArcherySeed { bow: Bow; indoor: boolean; roundKey: string; mode: 'ind' | 'team' | 'mixed'; age: string; gender: 'M' | 'F'; bracket: number }

export function archerySeed(e: ProgrammeEvent): ArcherySeed | null {
  const team = archTeamOf(e.discipline);
  const round = team?.round ?? ARCH_ROUNDS.find((r) => r.key === e.discipline);
  if (!round) return null;
  return {
    bow: round.bow, indoor: round.indoor, roundKey: round.key,
    mode: team ? team.kind : 'ind',
    age: e.category?.age ?? 'U18',
    gender: gender2(e.category?.gender),
    // match play after the ranking round: last time's bracket; a ranking round only: 0
    bracket: hadQualifying(e) ? e.fieldSize ?? 0 : 0,
  };
}

export interface CrewSeed { boat: string; distance: number; age: string; gender: 'M' | 'F' | 'X'; cls: string; lanes?: number; splits?: boolean }

export function crewSeed(e: ProgrammeEvent): CrewSeed | null {
  const ev = crewEventOf(e.discipline);
  if (!ev) return null;
  const s = e.settings ?? {};
  return {
    boat: ev.boat.code, distance: ev.distance,
    age: e.category?.age ?? 'Senior',
    gender: gender3(e.category?.gender),
    cls: e.category?.weightClass ?? 'Open',
    ...(s.lanes ? { lanes: s.lanes } : {}),
    ...(s.splits ? { splits: true } : {}),
  };
}

export interface CyclingSeed {
  setting: 'road' | 'track'; kind: CycKind; dist: Record<string, number>;
  km?: string; laps?: string; every?: string; interval?: number; stages?: ('road' | 'itt')[]; bo?: 1 | 3;
  age: string; gender: 'M' | 'F' | 'X';
}

export function cyclingSeed(e: ProgrammeEvent): CyclingSeed | null {
  const ev = CYC_EVENTS.find((x) => x.key === e.discipline) ?? CYC_TEAM_EVENTS.find((x) => x.key === e.discipline);
  if (!ev) return null;
  const c = e.settings?.cyc ?? {};
  const dist: Record<string, number> = { itt: 10, ip: 3000, tt: 1000 };
  if (ev.metres) dist[ev.kind] = ev.kind === 'itt' ? ev.metres / 1000 : ev.metres;
  return {
    setting: ev.setting, kind: ev.kind, dist,
    ...(c.km ? { km: String(c.km) } : {}),
    ...(c.laps ? { laps: String(c.laps) } : {}),
    ...(c.sprintEvery ? { every: String(c.sprintEvery) } : {}),
    ...(c.interval ? { interval: c.interval } : {}),
    ...(c.stages?.length ? { stages: [...c.stages] } : {}),
    ...(c.bo ? { bo: c.bo } : {}),
    age: e.category?.age ?? 'U16',
    gender: gender3(e.category?.gender),
  };
}

export interface LiftingSeed { age: string; gender: 'M' | 'F'; cls?: string }

export function liftingSeed(e: ProgrammeEvent): LiftingSeed | null {
  if (!e.discipline.startsWith('wl.')) return null;
  return { age: e.category?.age ?? 'Senior', gender: gender2(e.category?.gender), ...(e.category?.weightClass ? { cls: e.category.weightClass } : {}) };
}

export interface RoadSeed {
  kind: RoadKind; metres: number; trackWalk: boolean; age: string; gender: 'M' | 'F' | 'X';
  /** a distance that isn't one of the chips, in km ("2.5") */
  custom: string;
  certified: boolean; timing: 'gun' | 'chip'; penaltyZone: boolean;
  team: { on: boolean; scorers?: number; size?: number | null; basis?: TeamBasis; points?: boolean };
}

export function roadSeed(e: ProgrammeEvent): RoadSeed | null {
  const ev = roadEventOf(e.discipline);
  if (!ev) return null;
  const r = e.settings?.road;
  const t = r?.team;
  const chips = ev.kind === 'road' ? ROAD_METRES : ev.kind === 'walk' ? (ev.track ? WALK_TRACK_METRES : WALK_ROAD_METRES) : XC_METRES;
  return {
    kind: ev.kind, metres: ev.metres, trackWalk: ev.track,
    custom: chips.includes(ev.metres) ? '' : String(ev.metres / 1000),
    age: e.category?.age ?? 'U14',
    gender: gender3(e.category?.gender),
    certified: !!r?.certified, timing: r?.timing === 'chip' ? 'chip' : 'gun', penaltyZone: !!r?.penaltyZone,
    team: t ? { on: true, scorers: t.scorers, size: t.size ?? null, basis: t.basis, points: t.points !== false } : { on: false },
  };
}

export interface CombinedSeed {
  kind: CombinedKind | 'x'; gender: CombinedTable; age: string; events: string[]; day2: number | null;
  implements: Record<string, string>; handTimed?: boolean; noGauge?: boolean;
}

export function combinedSeed(e: ProgrammeEvent): CombinedSeed | null {
  const c = e.combined;
  if (!c?.events.length) return null;
  const table: CombinedTable = c.table === 'M' ? 'M' : c.table === 'F' ? 'F' : gender2(e.category?.gender);
  const preset = COMBINED_PRESETS.find((p) => e.discipline === `ath.ce_${p.kind}` && !!p.events[table]);
  const s = e.settings ?? {};
  return {
    kind: preset?.kind ?? 'x', gender: table,
    age: e.category?.age ?? 'U16',
    events: [...c.events],
    day2: c.day2 ?? null,
    implements: { ...(c.implements ?? {}) },
    ...(s.handTimed ? { handTimed: true } : {}),
    ...(s.noWindGauge ? { noGauge: true } : {}),
  };
}
