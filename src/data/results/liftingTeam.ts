/**
 * Round 2 (precision-strength) — the IWF team classification: its own result,
 * next to (not instead of) the house / medal table. Pure.
 *
 * As implemented (sources in docs/sport-depth/deep-wave/precision-strength-round2.md):
 *  - points per place in each bodyweight category: 28, 25, 23, 22, 21 … 1
 *    (`IWF_TEAM_POINTS`; places after 25th score nothing);
 *  - by default the total only; the organiser can also count the snatch and
 *    the clean & jerk rankings (rule `wlTeamLifts`);
 *  - one classification per age group and gender ("Men", "Youth Women" …);
 *  - a team = the entry's team / house / school (`entry.team`); lifters with
 *    no team score nothing;
 *  - equal points → more 1st places, then more 2nd places … (rule `wlTeamTie`);
 *    still level → the place is shared;
 *  - lifters who didn't start, withdrew or were disqualified score nothing, as
 *    does a lift / total that wasn't made (no total → no total points).
 */
import type { Category, ResultEntry } from './model.ts';
import { categoryLabel, disciplineOf } from './model.ts';
import { rankEntries } from './rank.ts';
import { eventAwards } from './medals.ts';
import { IWF_TEAM_POINTS, LIFT_DISCIPLINE } from './weightlifting.ts';
import { sharedPositions } from './positions.ts';

/** 28-25-23-22-21-20 … 1 for 1st … 25th. */
export const TEAM_CLASS_POINTS: number[] = IWF_TEAM_POINTS.split(',').map(Number);

export interface TeamClassRow {
  teamId?: string;
  team: string;
  colorHex?: string;
  points: number;
  /** places won: [1sts, 2nds, 3rds …] for the tie-break (index 0 = 1st) */
  places: number[];
  /** lifters who scored */
  lifters: number;
  position: number;
  tie: boolean;
}
export interface TeamClassGroup { key: string; label: string; rows: TeamClassRow[]; sessions: number }

export interface TeamClassOptions {
  /** 'total' (default) or 'all' — snatch, clean & jerk and total each score */
  lifts?: 'total' | 'all';
  /** 'places' (default): more 1st places, then 2nd … ; 'share': equal points share the place */
  tie?: 'places' | 'share';
  points?: number[];
}

const groupKey = (c?: Category) => `${c?.age ?? 'Open'}-${c?.gender ?? 'X'}`;
const groupLabel = (c?: Category) => categoryLabel({ age: c?.age, gender: c?.gender }).trim() || 'Open';

/**
 * The team classification from the finished sessions of a meet (each event's
 * completed phase). Groups in the order their first session appears.
 */
export function wlTeamClassification(
  events: { category?: Category; phases: { status: string; format: { category?: Category }; entries: ResultEntry[] }[] }[],
  opts: TeamClassOptions = {},
): TeamClassGroup[] {
  const table = opts.points?.length ? opts.points : TEAM_CLASS_POINTS;
  const lifts: ('total' | 'snatch' | 'cj')[] = opts.lifts === 'all' ? ['snatch', 'cj', 'total'] : ['total'];
  const groups = new Map<string, { label: string; sessions: number; teams: Map<string, Omit<TeamClassRow, 'position' | 'tie'> & { ids: Set<string> }> }>();
  for (const ev of events) {
    const fin = ev.phases.find((p) => p.status === 'completed');
    if (!fin) continue;
    const cat = fin.format.category ?? ev.category;
    const k = groupKey(cat);
    const g = groups.get(k) ?? { label: groupLabel(cat), sessions: 0, teams: new Map() };
    g.sessions += 1;
    groups.set(k, g);
    for (const lift of lifts) {
      const def = disciplineOf(LIFT_DISCIPLINE[lift])!;
      const ranked = rankEntries(fin.entries, def).filter((r) => r.status === 'ok' && r.position != null && r.best != null);
      for (const a of eventAwards(ranked, { positionPoints: table })) {
        const row = ranked.find((r) => r.id === a.entryId)!;
        const team = row.entry.team;
        if (!team?.name) continue;
        const tk = team.id ?? team.name.trim().toLowerCase();
        const t = g.teams.get(tk) ?? { ...(team.id ? { teamId: team.id } : {}), team: team.name, ...(team.colorHex ? { colorHex: team.colorHex } : {}), points: 0, places: [], lifters: 0, ids: new Set<string>() };
        t.points = Math.round((t.points + a.points) * 100) / 100;
        while (t.places.length < a.position) t.places.push(0);
        t.places[a.position - 1] += 1;
        t.ids.add(row.entry.athleteId ?? row.id);
        t.lifters = t.ids.size;
        g.teams.set(tk, t);
      }
    }
  }
  const out: TeamClassGroup[] = [];
  for (const [key, g] of groups) {
    const list = [...g.teams.values()].map(({ ids: _i, ...t }) => t).filter((t) => t.points > 0 || t.lifters > 0);
    const cmp = (a: typeof list[number], b: typeof list[number]) => {
      if (b.points !== a.points) return b.points - a.points;
      if (opts.tie === 'share') return 0;
      const n = Math.max(a.places.length, b.places.length);
      for (let i = 0; i < n; i++) { const d = (b.places[i] ?? 0) - (a.places[i] ?? 0); if (d) return d; }
      return 0;
    };
    const sorted = [...list].sort((a, b) => cmp(a, b) || a.team.localeCompare(b.team));
    const pos = sharedPositions(sorted, (a, b) => cmp(a, b) === 0);
    out.push({ key, label: g.label, sessions: g.sessions, rows: sorted.map((t, i) => ({ ...t, position: pos[i].position, tie: pos[i].tie })) });
  }
  return out;
}

/** "1st ×2, 2nd ×1" — a team's places, for the tie-break line. */
export const placesText = (places: number[]): string =>
  places.map((n, i) => (n ? `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} ×${n}` : '')).filter(Boolean).slice(0, 3).join(', ');
