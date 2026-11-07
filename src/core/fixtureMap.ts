/** The fixture map (founder 2026-11-07, Figma "Tournament Fixture Map";
 *  docs/security/breaks/fixture-map.md): a sport's whole format as one picture
 *  from day one — the groups with their teams and open slots, then the
 *  knockout whose boxes say where each team comes from ("Group A winner",
 *  "Winner of Semi-final 1"), down to the final and the champion. Real matches
 *  replace the projection round by round. The projection goes through the same
 *  seeding the app uses to make the real rounds (FM1), so the map never shows
 *  a tree the app won't make. Pure. */
import type { Match, TournamentStructure } from './types.ts';
import { seedFromGroups, seededRound, type Qualifier } from '../data/groups.ts';
import {
  knockoutStageRounds, pairingWinnerId, pairingMatches, stageChampionId, stageForTeams, bracketSeedOrder,
  isDoubleChanceStage, isExtraDrawStage, isKoStage, KO_STAGE_LABEL, THIRD_PLACE_STAGE, type KnockoutPairing,
} from '../data/bracket.ts';
import { shapeForStructure, type StructureConfig } from '../data/structureConfig.ts';
import { esc, sheetDoc } from '../data/results/printSheets.ts';

/** One side of a box: a team (or open slot), "where it comes from", or a bye. */
export type MapSide =
  | { kind: 'team'; id: string; name: string; color?: string; slot: boolean }
  | { kind: 'from'; label: string }
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
}
export interface MapInput {
  cfg: StructureConfig | null;
  structure?: TournamentStructure | null;
  /** one sport, one division */
  matches: Match[];
  entries: { id: string; name: string; color?: string }[];
  slotIds: ReadonlySet<string>;
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
  const base = { groups: [] as MapGroup[], unplaced: [] as MapSide[], rounds: [] as MapRound[], openSlots: entries.filter((e) => slotIds.has(e.id)).length };
  if (!entries.length && !matches.length) return { ...base, kind: 'empty' };
  const other = otherFormatOf(cfg, matches);
  if (other) return { ...base, kind: 'other', otherFormat: other };

  // Names and colours: entries first, then whatever the fixtures say.
  const info = new Map<string, { name: string; color?: string }>();
  for (const m of matches) for (const t of [m.homeTeam, m.awayTeam]) if (t?.id) info.set(t.id, { name: t.name, color: t.colorHex });
  for (const e of entries) info.set(e.id, { name: e.name, color: e.color ?? info.get(e.id)?.color });
  const side = (id: string): MapSide => ({ kind: 'team', id, name: info.get(id)?.name ?? 'Team', ...(info.get(id)?.color ? { color: info.get(id)!.color } : {}), slot: slotIds.has(id) });

  const byTime = matches.slice().sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.id.localeCompare(b.id));
  const grouped = byTime.filter((m) => m.group);
  const hasKo = matches.some((m) => isKoStage(m.stage));
  const shape = cfg?.shape ?? (grouped.length ? 'groups' : hasKo ? 'knockout' : shapeForStructure(i.structure ?? 'league'));
  const kind: MapKind = shape === 'groups' ? 'groups' : shape === 'knockout' ? 'knockout' : 'league';

  // ── Groups / league table
  let groups: MapGroup[] = [];
  let unplaced: MapSide[] = [];
  if (kind === 'league') {
    const ids = [...new Set([...entries.map((e) => e.id), ...byTime.flatMap((m) => [m.homeTeam.id, m.awayTeam.id])])];
    groups = [{ name: 'league', label: 'League', teams: ids.map(side) }];
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
      else unplaced.push(side(e.id));
    }
    // FM10: teams that only play ungrouped, non-knockout games wait here too
    const waiting = new Set([...unplaced.map((x) => (x.kind === 'team' ? x.id : '')), ...[...members.values()].flat()]);
    for (const m of byTime) {
      if (m.group || isKoStage(m.stage) || m.stage === THIRD_PLACE_STAGE) continue;
      for (const id of [m.homeTeam.id, m.awayTeam.id]) if (!waiting.has(id)) { waiting.add(id); unplaced.push(side(id)); }
    }
    groups = names.map((n) => ({ name: n, label: groupLabel(n), teams: members.get(n)!.map(side) }));
  }

  // ── Knockout: real rounds, then the projection onward
  const real = knockoutStageRounds(matches);
  const rounds: MapRound[] = real.map((r) => {
    const byes = [...new Set(r.matches.flatMap((m) => m.byes ?? []))].map(side);
    return { stage: r.stage, label: r.label, byes, projected: false, ties: r.pairings.map((p, k) => realTie(p, tieLabel(r.stage, k), side)) };
  });
  let note: string | undefined;
  if (!rounds.length && kind !== 'league') {
    const first = kind === 'groups' ? groupsFirstRound(groups.map((g) => g.name), cfg) : knockoutFirstRound([...entries.map((e) => e.id), ...byTime.flatMap((m) => [m.homeTeam.id, m.awayTeam.id])], side);
    if (kind === 'groups' && cfg?.superPhase) {
      note = `Super round: the top ${cfg.advanceTopN} of each group play each other once more; the knockout is drawn from it.`;
    } else if (first) rounds.push(first);
  }
  if (rounds.length) {
    let last = rounds[rounds.length - 1];
    while (last.ties.length + last.byes.length > 1 && !(last.stage === 'final' && !last.projected && last.ties.length === 1)) {
      last = nextRound(last);
      rounds.push(last);
    }
  }
  const thirdMatch = matches.find((m) => m.stage === THIRD_PLACE_STAGE);
  const third = thirdMatch ? realTie({ key: thirdMatch.id, stage: THIRD_PLACE_STAGE, homeId: thirdMatch.homeTeam.id, awayId: thirdMatch.awayTeam.id, match: thirdMatch }, 'Third place', side) : undefined;
  const champId = stageChampionId(real);
  return {
    ...base, kind, groups, unplaced, rounds, note,
    ...(third ? { third } : {}),
    ...(champId ? { champion: side(champId) } : {}),
  };
}

function realTie(p: KnockoutPairing, label: string, side: (id: string) => MapSide): MapTie {
  const legs = pairingMatches(p);
  const w = pairingWinnerId(p);
  const one = p.match;
  const state: TieState = w ? 'done' : legs.some((m) => m.status === 'live') ? 'live' : legs.every((m) => m.status === 'completed') && legs.length ? 'done' : 'scheduled';
  return {
    key: p.key, label, home: side(p.homeId), away: side(p.awayId), state,
    ...(one ? { matchId: one.id } : {}),
    ...(legs[0]?.startsAt ? { startsAt: legs[0].startsAt } : {}),
    ...(one?.score ? { score: { home: one.score.home, away: one.score.away } } : {}),
    ...(w === p.homeId ? { winner: 'home' as const } : w === p.awayId ? { winner: 'away' as const } : {}),
  };
}

/** FM1: group places go through the app's own group → knockout seeding. */
function groupsFirstRound(names: string[], cfg: StructureConfig | null): MapRound | null {
  if (names.length < 1) return null;
  const top = Math.max(1, cfg?.advanceTopN ?? 2);
  const best = Math.max(0, cfg?.advanceBest ?? 0);
  const q: Qualifier[] = [];
  for (let r = 1; r <= top; r++) for (const g of names) q.push({ teamId: `@${g}#${r}`, name: placeLabel(g, r), group: g, rank: r, via: 'direct' });
  for (let k = 1; k <= best; k++) q.push({ teamId: `@best#${k}`, name: `Best ${ordinal(top + 1)}-placed ${k}`, group: `~best${k}`, rank: top + 1, via: 'best' });
  if (q.length < 2) return null;
  const label = new Map(q.map((x) => [x.teamId, x.name]));
  const from = (id: string): MapSide => ({ kind: 'from', label: label.get(id) ?? id });
  const s = seedFromGroups(q);
  return {
    stage: s.stage, label: roundLabel(s.stage), projected: true, byes: s.byeIds.map(from),
    ties: s.ties.map((t, k) => ({ key: `p:${s.stage}:${k}`, label: tieLabel(s.stage, k), home: from(t.homeId), away: from(t.awayId), state: 'planned' as const })),
  };
}

/** FM1/FM5: a straight knockout from the entries, in entry order, seeded with byes. */
function knockoutFirstRound(ids: string[], side: (id: string) => MapSide): MapRound | null {
  const uniq = [...new Set(ids)];
  if (uniq.length < 2) return null;
  const s = seededRound(uniq);
  return {
    stage: s.stage, label: roundLabel(s.stage), projected: true, byes: s.byeIds.map(side),
    ties: s.ties.map((t, k) => ({ key: `p:${s.stage}:${k}`, label: tieLabel(s.stage, k), home: side(t.homeId), away: side(t.awayId), state: 'planned' as const })),
  };
}

/** FM12: the round after `r` — a decided tie sends its winner by name, an
 *  undecided one "Winner of …"; byes join, spread by standard seeding like
 *  the app's own next round (bracket.nextRoundPairs). */
function nextRound(r: MapRound): MapRound {
  const winners: MapSide[] = r.ties.map((t) => (t.winner ? t[t.winner] : { kind: 'from', label: `Winner of ${t.label}` }));
  let seeds = r.byes.length ? [...r.byes, ...winners] : winners;
  if (r.byes.length && (seeds.length & (seeds.length - 1)) === 0) seeds = bracketSeedOrder(seeds.length).map((k) => seeds[k - 1]);
  const stage = stageForTeams(seeds.length);
  const ties: MapTie[] = [];
  for (let k = 0; k + 1 < seeds.length; k += 2) ties.push({ key: `p:${stage}:${k / 2}`, label: tieLabel(stage, k / 2), home: seeds[k], away: seeds[k + 1], state: 'planned' });
  return { stage, label: roundLabel(stage), ties, byes: seeds.length % 2 ? [seeds[seeds.length - 1]] : [], projected: true };
}

/** Where each box sits in the tree (FM4): the first shown round stacks its
 *  boxes; a later box sits midway between the two it comes from, with a joining
 *  line. A round fed through byes (not a plain halving) is spread evenly over
 *  the same height, without joining lines. */
export function treeLayout(rounds: readonly MapRound[], cardH: number, gap: number): { tops: number[][]; joined: boolean[]; height: number } {
  const tops: number[][] = [];
  const joined: boolean[] = [];
  const first = rounds[0]?.ties.length ?? 0;
  const height = Math.max(0, first * cardH + Math.max(0, first - 1) * gap);
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

const sideText = (s: MapSide): string => (s.kind === 'team' ? (s.slot ? `${s.name} (open slot)` : s.name) : s.kind === 'from' ? s.label : 'Bye');

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

/** Unused-import guard for tooling that tree-shakes types. */
export const _isExtraDrawStage = isExtraDrawStage;
