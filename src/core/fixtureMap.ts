/** The fixture map (founder 2026-11-07, Figma "Tournament Fixture Map";
 *  docs/security/breaks/fixture-map.md): a sport's whole format as one picture
 *  from day one — the groups with their teams and open slots, then the
 *  knockout whose boxes say where each team comes from ("Group A winner",
 *  "Winner of Semi-final 1"), down to the final and the champion. Real matches
 *  replace the projection round by round. The projection goes through the same
 *  seeding the app uses to make the real rounds (FM1), so the map never shows
 *  a tree the app won't make. Pure. */
import type { Match, TournamentStructure } from './types.ts';
import { seedFromGroups, type Qualifier } from '../data/groups.ts';
import {
  knockoutStageRounds, pairingWinnerId, pairingMatches, pairingSlot, stageChampionId, stageForTeams,
  isDoubleChanceStage, isKoStage, koStageRank, KO_STAGES, KO_STAGE_LABEL, THIRD_PLACE_STAGE, type KnockoutPairing, type KnockoutRound,
} from '../data/bracket.ts';
import { firstRound, nextRoundByRule, applyDraw, orderOf, rankLosers, type OddRule, type DrawOverride, type Opening } from '../data/drawRules.ts';
import { shapeForStructure, type StructureConfig } from '../data/structureConfig.ts';
import { esc, sheetDoc } from '../data/results/printSheets.ts';

/** One side of a box: a team (or open slot), "where it comes from", or a bye. */
export type MapSide =
  | { kind: 'team'; id: string; name: string; color?: string; slot: boolean }
  | { kind: 'from'; label: string }
  /** a place in the planned field no team or slot holds yet (FM23) */
  | { kind: 'open'; ref: string; label: string; group?: string }
  | { kind: 'bye' };
export type TieState = 'planned' | 'scheduled' | 'live' | 'done';
export interface MapTie {
  key: string;
  /** "Semi-final 1", "Final" */
  label: string;
  home: MapSide;
  away: MapSide;
  state: TieState;
  matchId?: string;
  startsAt?: string;
  score?: { home: number; away: number };
  winner?: 'home' | 'away';
  /** position in its round (0 = top) — a custom match fills a box by it (FM27) */
  box: number;
}
export interface MapRound {
  stage: string;
  /** "Semi-finals" */
  label: string;
  ties: MapTie[];
  /** teams that skip this round and join its winners */
  byes: MapSide[];
  /** true = drawn from the format, no matches yet */
  projected: boolean;
  /** the opening round's draw order (Edit draw): team ids / place codes, null = bye */
  refs?: (string | null)[];
}
export interface MapGroup { name: string; label: string; teams: MapSide[] }
export type MapKind = 'groups' | 'knockout' | 'league' | 'other' | 'empty';
export interface FixtureMap {
  kind: MapKind;
  groups: MapGroup[];
  /** teams entered but not in a group yet */
  unplaced: MapSide[];
  rounds: MapRound[];
  third?: MapTie;
  champion?: MapSide;
  openSlots: number;
  note?: string;
  /** kind 'other': the format's name, shown with a link to its own view (FM6) */
  otherFormat?: string;
  /** FM25: an edited draw no longer matches the teams, so the automatic one shows */
  drawStale?: boolean;
  /** the planned number of teams the map was drawn for (FM22) */
  planned?: number;
}
export interface MapInput {
  cfg: StructureConfig | null;
  structure?: TournamentStructure | null;
  /** one sport, one division */
  matches: Match[];
  entries: { id: string; name: string; color?: string }[];
  slotIds: ReadonlySet<string>;
  /** the organiser's plan (data/drawRules) */
  plannedTeams?: number;
  oddRule?: OddRule;
  draw?: DrawOverride | null;
}

/** FM13: "A" → "Group A"; a longer name stays as typed. */
export function groupLabel(name: string): string {
  const n = name.trim();
  return /^[A-Z]\d?$/i.test(n) ? `Group ${n.toUpperCase()}` : n;
}

const ordinal = (k: number): string => {
  const v = k % 100;
  return k + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th');
};
const placeLabel = (g: string, rank: number): string =>
  `${groupLabel(g)} ${rank === 1 ? 'winner' : rank === 2 ? 'runner-up' : ordinal(rank)}`;

/** "Semi-final 2", "Quarter-final 1", "Round of 16 match 3", "Final". */
function tieLabel(stage: string, i: number): string {
  if (stage === 'final') return 'Final';
  if (stage === 'sf') return `Semi-final ${i + 1}`;
  if (stage === 'qf') return `Quarter-final ${i + 1}`;
  return `${isKoStage(stage) ? KO_STAGE_LABEL[stage] : stage} match ${i + 1}`;
}
const roundLabel = (stage: string): string => (isKoStage(stage) ? KO_STAGE_LABEL[stage] : stage);

function otherFormatOf(cfg: StructureConfig | null, matches: Match[]): string | undefined {
  if (cfg?.manualStandings) return 'Scorecard — standings kept by hand';
  if (cfg?.shape === 'swiss') return 'Swiss system';
  if (cfg?.shape === 'americano') return 'Americano';
  if (cfg?.bracket === 'double' || matches.some((m) => /^(wb|lb)\d+$|^gf2?$/.test(m.stage ?? ''))) return 'Double elimination';
  if (matches.some((m) => isDoubleChanceStage(m.stage))) return 'Playoff with a second chance for the top two';
  return undefined;
}

export function buildFixtureMap(i: MapInput): FixtureMap {
  const { cfg, matches, entries, slotIds } = i;
  const rule: OddRule = i.oddRule ?? 'playin';
  const base = { groups: [] as MapGroup[], unplaced: [] as MapSide[], rounds: [] as MapRound[], openSlots: entries.filter((e) => slotIds.has(e.id)).length };
  if (!entries.length && !matches.length && !i.plannedTeams) return { ...base, kind: 'empty' };
  const other = otherFormatOf(cfg, matches);
  if (other) return { ...base, kind: 'other', otherFormat: other };

  // Names and colours: entries first, then whatever the fixtures say.
  const info = new Map<string, { name: string; color?: string }>();
  for (const m of matches) for (const t of [m.homeTeam, m.awayTeam]) if (t?.id) info.set(t.id, { name: t.name, color: t.colorHex });
  for (const e of entries) info.set(e.id, { name: e.name, color: e.color ?? info.get(e.id)?.color });
  const team = (id: string): MapSide => ({ kind: 'team', id, name: info.get(id)?.name ?? 'Team', ...(info.get(id)?.color ? { color: info.get(id)!.color } : {}), slot: slotIds.has(id) });
  // place codes: "@A#1" group place, "@best#2" best-placed, "@open#9" an open place
  const places = new Map<string, MapSide>();
  const side = (ref: string): MapSide => places.get(ref) ?? team(ref);

  const byTime = matches.slice().sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.id.localeCompare(b.id));
  const grouped = byTime.filter((m) => m.group);
  const hasKo = matches.some((m) => isKoStage(m.stage));
  // the organiser's saved format, then the group games, then the tournament's structure, then what's been played
  const shape = cfg?.shape ?? (grouped.length ? 'groups' : i.structure ? shapeForStructure(i.structure) : hasKo ? 'knockout' : 'league');
  const kind: MapKind = shape === 'groups' ? 'groups' : shape === 'knockout' ? 'knockout' : 'league';
  const openSide = (n: number, label: string, group?: string): MapSide => {
    const ref = `@open#${n}`;
    const s: MapSide = { kind: 'open', ref, label, ...(group ? { group } : {}) };
    places.set(ref, s);
    return s;
  };

  // ── Groups / league table
  let groups: MapGroup[] = [];
  const unplaced: MapSide[] = [];
  let fieldSize = 0;
  if (kind === 'league') {
    const ids = [...new Set([...entries.map((e) => e.id), ...byTime.flatMap((m) => [m.homeTeam.id, m.awayTeam.id])])];
    const teams = ids.map(team);
    // FM22/FM23: the planned field, open places for the rest
    for (let k = ids.length; k < (i.plannedTeams ?? 0); k++) teams.push(openSide(k + 1, `Open place ${k + 1}`));
    groups = [{ name: 'league', label: 'League', teams }];
    fieldSize = teams.length;
  } else if (kind === 'groups') {
    const members = new Map<string, string[]>();
    // FM10: the group-tagged matches decide who is where
    for (const m of grouped) {
      const list = members.get(m.group!) ?? [];
      for (const id of [m.homeTeam.id, m.awayTeam.id]) if (!list.includes(id)) list.push(id);
      members.set(m.group!, list);
    }
    if (!members.size) {
      // not drawn yet: slots named A1, B2 … sit in their group; real teams wait
      const count = Math.max(2, Math.min(26, cfg?.groupCount ?? 2));
      for (let g = 0; g < count; g++) members.set(String.fromCharCode(65 + g), []);
    }
    const names = [...members.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const placed = new Set([...members.values()].flat());
    for (const e of entries) {
      if (placed.has(e.id)) continue;
      const m = grouped.length ? null : /^([A-Z])\d{1,3}$/.exec(e.name.trim());
      if (m && slotIds.has(e.id) && members.has(m[1])) members.get(m[1])!.push(e.id);
      else unplaced.push(team(e.id));
    }
    // FM10: teams that only play ungrouped, non-knockout games wait here too
    const waiting = new Set([...unplaced.map((x) => (x.kind === 'team' ? x.id : '')), ...[...members.values()].flat()]);
    for (const m of byTime) {
      if (m.group || isKoStage(m.stage) || m.stage === THIRD_PLACE_STAGE) continue;
      for (const id of [m.homeTeam.id, m.awayTeam.id]) if (!waiting.has(id)) { waiting.add(id); unplaced.push(team(id)); }
    }
    const sides = new Map(names.map((n) => [n, members.get(n)!.map(team)] as const));
    // FM22/FM23: open places for the planned field, to the smallest groups first
    const have = [...sides.values()].reduce((x, t) => x + t.length, 0) + unplaced.length;
    let next = have;
    for (let k = have; k < (i.plannedTeams ?? 0); k++) {
      const g = names.reduce((a, b) => (sides.get(b)!.length < sides.get(a)!.length ? b : a));
      const nums = sides.get(g)!.map((x) => (x.kind === 'team' || x.kind === 'open' ? Number(/^[A-Z](\d{1,3})$/.exec(x.kind === 'team' ? x.name : x.label)?.[1] ?? 0) : 0));
      const pos = Math.max(sides.get(g)!.length, ...nums) + 1;
      sides.get(g)!.push(openSide(++next, /^[A-Z]$/.test(g) ? `${g}${pos}` : `${g} · place ${pos}`, g));
    }
    groups = names.map((n) => ({ name: n, label: groupLabel(n), teams: sides.get(n)! }));
    fieldSize = next;
  }

  // ── Knockout: the opening round from the plan, real matches into their boxes, the projection onward
  let note: string | undefined;
  let drawStale = false;
  let opening: MapRound | null = null;
  if (kind === 'groups' && cfg?.superPhase) {
    note = `Super round: the top ${cfg.advanceTopN} of each group play each other once more; the knockout is drawn from it.`;
  } else if (kind !== 'league') {
    let op: Opening | null = null;
    if (kind === 'groups') op = groupsOpening(groups.map((g) => g.name), cfg, rule, places);
    else {
      const ids = [...new Set([...entries.map((e) => e.id), ...byTime.flatMap((m) => [m.homeTeam.id, m.awayTeam.id])])];
      for (let k = ids.length; k < (i.plannedTeams ?? 0); k++) ids.push((openSide(k + 1, `Open place ${k + 1}`) as { ref: string }).ref);
      fieldSize = ids.length;
      if (ids.length >= 2) op = firstRound(ids, rule);
    }
    if (op && i.draw) {
      const edited = applyDraw(op, i.draw);
      if (edited) op = edited; else drawStale = true;
    }
    if (op) opening = { ...openingRound(op, side), refs: orderOf(op) };
  }
  const real = knockoutStageRounds(matches);
  const rounds = chain(opening, real, team, rule);

  const thirdMatch = matches.find((m) => m.stage === THIRD_PLACE_STAGE);
  const third = thirdMatch ? realTie({ key: thirdMatch.id, stage: THIRD_PLACE_STAGE, homeId: thirdMatch.homeTeam.id, awayId: thirdMatch.awayTeam.id, match: thirdMatch }, 'Third place', team, 0) : undefined;
  const champId = stageChampionId(real);
  return {
    ...base, kind, groups, unplaced, rounds, note,
    ...(drawStale ? { drawStale } : {}),
    ...(i.plannedTeams ? { planned: Math.max(fieldSize, i.plannedTeams) } : {}),
    ...(third ? { third } : {}),
    ...(champId ? { champion: team(champId) } : {}),
  };
}

function openingRound(op: Opening, side: (ref: string) => MapSide): MapRound {
  return {
    stage: op.stage, label: roundLabel(op.stage), projected: true, byes: op.byeIds.map(side),
    ties: op.ties.map((t, k) => ({ key: `p:${op.stage}:${k}`, label: tieLabel(op.stage, k), home: side(t.homeId), away: side(t.awayId), state: 'planned' as const, box: k })),
  };
}

/** The rounds from the opening to the final: each round's real matches go in
 *  their boxes (FM27–FM29), the rest stays projected; the next round follows
 *  the organiser's odd-team rule (FM19). If the real rounds don't fit the
 *  projection (a stage the plan doesn't have), the real rounds lead (FM29). */
function chain(opening: MapRound | null, real: KnockoutRound[], team: (id: string) => MapSide, rule: OddRule): MapRound[] {
  const out: MapRound[] = [];
  if (opening) {
    let cur: MapRound = opening;
    const used = new Set<string>();
    for (let guard = 0; guard < 12; guard++) {
      const r = real.find((x) => x.stage === cur.stage && !used.has(x.stage));
      if (r) { cur = merge(cur, r, team, out.length === 0); used.add(r.stage); }
      out.push(cur);
      if (cur.ties.length + cur.byes.length <= 1 || (cur.stage === 'final' && cur.ties.length === 1)) break;
      cur = nextRound(cur, rule);
    }
    if (real.every((r) => used.has(r.stage))) return out;
    out.length = 0;
  }
  // FM29: the real rounds lead; the projection carries on after the last
  for (const r of real) {
    const byes = [...new Set(r.matches.flatMap((m) => m.byes ?? []))].map(team);
    out.push({ stage: r.stage, label: r.label, byes, projected: false, ties: r.pairings.map((p, k) => realTie(p, tieLabel(r.stage, k), team, k)) });
  }
  let last = out[out.length - 1];
  for (let guard = 0; last && guard < 12 && last.ties.length + last.byes.length > 1 && !(last.stage === 'final' && last.ties.length === 1); guard++) {
    last = nextRound(last, rule);
    out.push(last);
  }
  return out;
}

/** A round's real matches into their boxes: by the saved bracket position
 *  (`__koSlot`) first, then the free boxes in kickoff order, extra boxes after.
 *  In the opening round, the projected boxes left over are re-drawn from the
 *  teams no real match has taken (no team twice, none lost). */
function merge(p: MapRound, r: KnockoutRound, team: (id: string) => MapSide, isOpening: boolean): MapRound {
  const ties: (MapTie | null)[] = p.ties.map(() => null);
  const rest: KnockoutPairing[] = [];
  for (const x of r.pairings) {
    const s = pairingSlot(x);
    if (s !== undefined && s < ties.length && !ties[s]) ties[s] = realTie(x, tieLabel(r.stage, s), team, s);
    else rest.push(x);
  }
  for (const x of rest) {
    let k = ties.findIndex((t) => !t);
    if (k < 0) { k = ties.length; ties.push(null); }
    ties[k] = realTie(x, tieLabel(r.stage, k), team, k);
  }
  const realByes = [...new Set(r.matches.flatMap((m) => m.byes ?? []))];
  const taken = new Set([...ties.flatMap((t) => (t ? [sideKey(t.home), sideKey(t.away)] : [])), ...realByes]);
  let byes: MapSide[] = realByes.length ? realByes.map(team) : p.byes.filter((b) => !taken.has(sideKey(b)));
  if (isOpening) {
    // left-over boxes: the field's teams no real match has, in projected order
    // every projected team (a box a real match took may have held others)
    const free = [...p.ties.flatMap((t) => [t.home, t.away]), ...p.byes]
      .filter((x) => !taken.has(sideKey(x)) && !byes.some((b) => sideKey(b) === sideKey(x)));
    if (!realByes.length) byes = [];
    const out: MapTie[] = [];
    ties.forEach((t, k) => {
      if (t) { out.push(t); return; }
      if (realByes.length) return; // the real round fixed who goes straight through
      const h = free.shift(), a = free.shift();
      if (h && a) out.push({ ...p.ties[k], home: h, away: a });
      else if (h) byes = [...byes, h];
    });
    byes = [...byes, ...free]; // the projection's own byes keep their place
    return { ...p, ties: out, byes, projected: false };
  }
  return { ...p, ties: ties.map((t, k) => t ?? p.ties[k]), byes, projected: ties.every((t) => !t) };
}
const sideKey = (s: MapSide): string => (s.kind === 'team' ? s.id : s.kind === 'open' ? s.ref : s.kind === 'from' ? `from:${s.label}` : 'bye');

function realTie(p: KnockoutPairing, label: string, team: (id: string) => MapSide, box: number): MapTie {
  const legs = pairingMatches(p);
  const w = pairingWinnerId(p);
  const one = p.match;
  const state: TieState = w ? 'done' : legs.some((m) => m.status === 'live') ? 'live' : legs.every((m) => m.status === 'completed') && legs.length ? 'done' : 'scheduled';
  return {
    key: p.key, label, home: team(p.homeId), away: team(p.awayId), state, box,
    ...(one ? { matchId: one.id } : {}),
    ...(legs[0]?.startsAt ? { startsAt: legs[0].startsAt } : {}),
    ...(one?.score ? { score: { home: one.score.home, away: one.score.away } } : {}),
    ...(w === p.homeId ? { winner: 'home' as const } : w === p.awayId ? { winner: 'away' as const } : {}),
  };
}

/** FM1: group places go through the app's own group → knockout seeding (the
 *  cross-over or seeded positions); an odd field follows the organiser's rule. */
function groupsOpening(names: string[], cfg: StructureConfig | null, rule: OddRule, places: Map<string, MapSide>): Opening | null {
  if (names.length < 1) return null;
  const top = Math.max(1, cfg?.advanceTopN ?? 2);
  const best = Math.max(0, cfg?.advanceBest ?? 0);
  const q: Qualifier[] = [];
  for (let r = 1; r <= top; r++) for (const g of names) q.push({ teamId: `@${g}#${r}`, name: placeLabel(g, r), group: g, rank: r, via: 'direct' });
  for (let k = 1; k <= best; k++) q.push({ teamId: `@best#${k}`, name: `Best ${ordinal(top + 1)}-placed ${k}`, group: `~best${k}`, rank: top + 1, via: 'best' });
  if (q.length < 2) return null;
  for (const x of q) places.set(x.teamId, { kind: 'from', label: x.name });
  const n = q.length;
  if (rule !== 'playin' && (n & (n - 1)) !== 0) return firstRound(q.map((x) => x.teamId), rule);
  const s = seedFromGroups(q);
  return { ties: s.ties.map((t) => ({ homeId: t.homeId, awayId: t.awayId, slot: t.slot })), byeIds: s.byeIds, stage: s.stage };
}

/** FM12/FM19: the round after `r`, by the organiser's rule — a decided tie
 *  sends its winner by name, an undecided one "Winner of …"; best losers are
 *  named once every tie is decided, "Best loser 1 …" until then. */
function nextRound(r: MapRound, rule: OddRule): MapRound {
  const winners: MapSide[] = r.ties.map((t) => (t.winner ? t[t.winner] : { kind: 'from', label: `Winner of ${t.label}` }));
  const decided = r.ties.length > 0 && r.ties.every((t) => t.winner && t.score);
  const losers: MapSide[] = decided
    ? rankLosers(r.ties.map((t) => {
        const lose = t.winner === 'home' ? 'away' : 'home';
        const ls = t.score![lose], ws = t.score![t.winner!];
        const s = t[lose];
        return { id: sideKey(s), margin: ls - ws, scored: ls, name: s.kind === 'team' ? s.name : '' };
      })).map((k) => r.ties.map((t) => t[t.winner === 'home' ? 'away' : 'home']).find((s) => sideKey(s) === k)!)
    : r.ties.map((_, k) => ({ kind: 'from', label: `Best loser ${k + 1}` }) as MapSide);
  const nx = nextRoundByRule({ winners, byes: r.byes, losers }, rule);
  // always a later stage than this one (an odd round can't repeat its name)
  const bySize = stageForTeams(nx.pairs.length * 2 + nx.byes.length);
  const stage = isKoStage(r.stage) && koStageRank(bySize) <= koStageRank(r.stage) ? KO_STAGES[Math.min(KO_STAGES.length - 1, koStageRank(r.stage) + 1)] : bySize;
  return {
    stage, label: roundLabel(stage), byes: nx.byes, projected: true,
    ties: nx.pairs.map(([home, away], k) => ({ key: `p:${stage}:${k}`, label: tieLabel(stage, k), home, away, state: 'planned' as const, box: k })),
  };
}

/** A box side in words: the team, where it comes from, or the open place. */
export const sideLabel = (s: MapSide): string => (s.kind === 'team' ? s.name : s.kind === 'bye' ? 'Bye' : s.label);

/** FM27: the boxes a custom match can still go in — no match there yet. */
export function freeBoxes(m: FixtureMap): { stage: string; box: number; label: string; home: MapSide; away: MapSide }[] {
  return m.rounds.flatMap((r) => r.ties.filter((t) => !t.matchId).map((t) => ({ stage: r.stage, box: t.box, label: t.label, home: t.home, away: t.away })));
}

/** Where each box sits in the tree (FM4): the first shown round stacks its
 *  boxes; a later box sits midway between the two it comes from, with a joining
 *  line. A round fed through byes (not a plain halving) is spread evenly over
 *  the same height, without joining lines. */
export function treeLayout(rounds: readonly MapRound[], cardH: number, gap: number): { tops: number[][]; joined: boolean[]; height: number } {
  const tops: number[][] = [];
  const joined: boolean[] = [];
  // tall enough for the biggest round (a play-in round can be smaller than the next)
  const height = Math.max(0, ...rounds.map((r) => r.ties.length * cardH + Math.max(0, r.ties.length - 1) * gap));
  rounds.forEach((r, k) => {
    if (k === 0) { tops.push(r.ties.map((_, i) => i * (cardH + gap))); return; }
    const prev = rounds[k - 1];
    const halves = !prev.byes.length && r.ties.length === Math.floor(prev.ties.length / 2) && prev.ties.length % 2 === 0;
    joined.push(halves);
    if (halves) tops.push(r.ties.map((_, i) => (tops[k - 1][2 * i] + tops[k - 1][2 * i + 1]) / 2));
    else {
      const step = r.ties.length > 1 ? (height - cardH) / (r.ties.length - 1) : 0;
      tops.push(r.ties.map((_, i) => (r.ties.length > 1 ? i * step : Math.max(0, (height - cardH) / 2))));
    }
  });
  return { tops, joined, height };
}

/* ------------------------------ the PDF sheet ------------------------------ */

const sideText = (s: MapSide): string => (s.kind === 'team' ? (s.slot ? `${s.name} (open slot)` : s.name) : s.kind === 'from' ? s.label : s.kind === 'open' ? `${s.label} (open)` : 'Bye');

/** FM7/FM14: the map as an A4 sheet — names only, every string escaped. */
export function fixtureMapSheet(m: FixtureMap, h: { name: string; sport: string; dates?: string }): string {
  const parts: string[] = [`<h1>${esc(h.sport)} — fixture map</h1>`];
  if (m.note) parts.push(`<div class="sub">${esc(m.note)}</div>`);
  for (const g of m.groups) {
    parts.push(`<h2>${esc(g.label)}</h2><table><tbody>${g.teams.map((t) => `<tr><td>${esc(sideText(t))}</td></tr>`).join('') || '<tr><td class="note">No teams yet</td></tr>'}</tbody></table>`);
  }
  if (m.unplaced.length) parts.push(`<h2>Not in a group yet</h2><div class="sub">${m.unplaced.map((t) => esc(sideText(t))).join(', ')}</div>`);
  for (const r of m.rounds) {
    const rows = r.ties.map((t) => {
      const score = t.score ? `${t.score.home} – ${t.score.away}` : '';
      return `<tr><td>${esc(t.label)}</td><td>${esc(sideText(t.home))}</td><td class="c">${esc(score) || 'v'}</td><td>${esc(sideText(t.away))}</td></tr>`;
    }).join('');
    const byes = r.byes.length ? `<div class="note">Straight through: ${r.byes.map((b) => esc(sideText(b))).join(', ')}</div>` : '';
    parts.push(`<h2>${esc(r.label)}</h2><table><tbody>${rows}</tbody></table>${byes}`);
  }
  if (m.third) parts.push(`<h2>Third place</h2><table><tbody><tr><td>${esc(sideText(m.third.home))}</td><td class="c">${m.third.score ? esc(`${m.third.score.home} – ${m.third.score.away}`) : 'v'}</td><td>${esc(sideText(m.third.away))}</td></tr></tbody></table>`);
  if (m.champion) parts.push(`<h2>Champion: ${esc(sideText(m.champion))}</h2>`);
  return sheetDoc({ title: `${h.name} — fixture map`, header: { name: h.name, ...(h.dates ? { dates: h.dates } : {}) }, sheets: [parts.join('')] });
}
