/** The organiser's plan for a knockout (founder 2026-11-07,
 *  docs/security/breaks/fixture-map.md part 2): how many teams are planned,
 *  what happens with an odd number, and a draw edited by hand. One module used
 *  by the fixture map, Auto-generate fixtures and the bracket's "next round",
 *  so all three always make the same draw (FM19). Stored on formats[sport]
 *  under reserved keys — no migration. Pure. */
import { seededRound, seedFromGroups, type Qualifier } from './groups.ts';
import { bracketSeedOrder, stageForTeams, koStageRank, KO_STAGES, pairingWinnerId, pairingLoserId, pairingMatches, type KoStage, type KnockoutRound } from './bracket.ts';

export const ODD_RULE_KEY = 'structOdd';
export const PLANNED_KEY = 'structTeams';
export const DRAW_KEY = 'structDraw';

/** What happens when a round can't split evenly:
 *  - 'playin' (default, the international draw): the top seeds skip the
 *    opening round, the rest play down to a clean bracket;
 *  - 'byes': everyone plays; an odd round gives its top team a bye;
 *  - 'bestLosers': everyone plays; the closest losers fill the next round. */
export type OddRule = 'playin' | 'byes' | 'bestLosers';
export const ODD_RULES: { key: OddRule; label: string; hint: string }[] = [
  { key: 'playin', label: 'Top seeds skip round 1', hint: 'The rest play down to a clean bracket (the usual draw).' },
  { key: 'byes', label: 'Everyone plays, byes when odd', hint: 'When a round has an odd number, its top team goes straight through.' },
  { key: 'bestLosers', label: 'Best losers go through', hint: 'The closest losers fill the next round.' },
];

type Fmt = Record<string, unknown> | null | undefined;

export function oddRuleOf(fmt: Fmt): OddRule {
  const v = fmt?.[ODD_RULE_KEY];
  return v === 'byes' || v === 'bestLosers' ? v : 'playin';
}

/** FM22: the planned number of teams, 2–128, or undefined. */
export function plannedTeamsOf(fmt: Fmt): number | undefined {
  const v = fmt?.[PLANNED_KEY];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 2) return undefined;
  return Math.min(128, v);
}

/** An edited draw: bracket positions read in pairs (0 v 1, 2 v 3 …); `null`
 *  means the other team of that pair goes straight through. Entries are team
 *  ids or place codes ("@A#1" = Group A winner, "@open#9" = open place 9). */
export interface DrawOverride { order: (string | null)[] }
const REF = /^(@[A-Za-z0-9~#]{1,40}|[A-Za-z0-9_-]{1,64})$/;

/** FM24: parse the stored draw, or null for anything odd. */
export function drawOf(fmt: Fmt): DrawOverride | null {
  const raw = fmt?.[DRAW_KEY];
  if (typeof raw !== 'string' || raw.length > 20000) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  const order = (v as { order?: unknown } | null)?.order;
  if (!Array.isArray(order) || order.length < 2 || order.length > 256 || order.length % 2) return null;
  const seen = new Set<string>();
  for (const x of order) {
    if (x === null) continue;
    if (typeof x !== 'string' || !REF.test(x) || seen.has(x)) return null;
    seen.add(x);
  }
  return { order: order as (string | null)[] };
}
export const drawToFormat = (d: DrawOverride): string => JSON.stringify({ order: d.order });

export interface Opening { ties: { homeId: string; awayId: string; slot: number }[]; byeIds: string[]; stage: KoStage }

const isPow2 = (n: number) => n >= 1 && (n & (n - 1)) === 0;
const nextPow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p; };

/** The opening knockout round from a seed list (best first). */
export function firstRound(seeds: string[], rule: OddRule): Opening {
  const n = seeds.length;
  if (rule === 'playin' || isPow2(n)) {
    const s = seededRound(seeds);
    return { ties: s.ties.map((t) => ({ homeId: t.homeId, awayId: t.awayId, slot: t.slot })), byeIds: s.byeIds, stage: s.stage };
  }
  // everyone plays; an odd field gives the top seed the one bye
  const byeIds = n % 2 ? [seeds[0]] : [];
  const rest = n % 2 ? seeds.slice(1) : seeds;
  const ties: Opening['ties'] = [];
  for (let k = 0; k < rest.length / 2; k++) ties.push({ homeId: rest[k], awayId: rest[rest.length - 1 - k], slot: k });
  return { ties, byeIds, stage: stageForTeams(n) };
}

/** The round after one: `winners` in bracket order (a value per tie: a team,
 *  or a placeholder in the map), `byes` (straight through) and `losers` ranked
 *  best first (rankLosers). Generic so the map can pass placeholders. */
export function nextRoundByRule<T>(r: { winners: T[]; byes: T[]; losers: T[] }, rule: OddRule): { pairs: [T, T][]; byes: T[] } {
  const total = r.winners.length + r.byes.length;
  const adjacent = (xs: T[]): { pairs: [T, T][]; byes: T[] } => {
    const pairs: [T, T][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) pairs.push([xs[i], xs[i + 1]]);
    return { pairs, byes: xs.length % 2 ? [xs[xs.length - 1]] : [] };
  };
  const seeded = (xs: T[]) => adjacent(isPow2(xs.length) ? bracketSeedOrder(xs.length).map((k) => xs[k - 1]) : xs);
  if (rule === 'bestLosers' && total > 1 && !isPow2(total)) {
    const need = nextPow2(total) - total;
    if (r.losers.length >= need) return seeded([...r.byes, ...r.winners, ...r.losers.slice(0, need)]);
  }
  if ((rule === 'byes' || rule === 'bestLosers') && total % 2 && !(r.byes.length && isPow2(total))) {
    const all = [...r.byes, ...r.winners];
    return { pairs: adjacent(all.slice(1)).pairs, byes: [all[0]] };
  }
  // play-in (the app's existing next round): byes join the winners, spread by seeding
  if (r.byes.length) return seeded([...r.byes, ...r.winners]);
  return adjacent(r.winners);
}

/** FM20: losers best first — the closest margin, then most scored, then name.
 *  A walkover loser is never a best loser. */
export function rankLosers(list: { id: string; margin: number; scored: number; name: string; walkover?: boolean }[]): string[] {
  return list.filter((x) => !x.walkover)
    .sort((a, b) => b.margin - a.margin || b.scored - a.scored || a.name.localeCompare(b.name))
    .map((x) => x.id);
}

/** FM25 / FM30: an edited draw in place of the automatic opening — only when
 *  it holds exactly the same field (and the same number of byes); otherwise
 *  null ("stale"). `resolve` turns place codes into team ids at creation time. */
export function applyDraw(o: Opening, d: DrawOverride | null, resolve: (ref: string) => string | undefined = (x) => x): Opening | null {
  if (!d) return null;
  const field = [...o.ties.flatMap((t) => [t.homeId, t.awayId]), ...o.byeIds];
  const refs = d.order.filter((x): x is string => x !== null);
  if (refs.length !== field.length || new Set(field).size !== field.length || !refs.every((x) => field.includes(x))) return null;
  const ties: Opening['ties'] = [];
  const byeIds: string[] = [];
  for (let i = 0; i < d.order.length; i += 2) {
    const a = d.order[i], b = d.order[i + 1];
    if (a === null && b === null) return null;
    const ra = a === null ? null : resolve(a);
    const rb = b === null ? null : resolve(b);
    if ((a !== null && !ra) || (b !== null && !rb)) return null;
    if (ra && rb) ties.push({ homeId: ra, awayId: rb, slot: i / 2 });
    else byeIds.push((ra ?? rb)!);
  }
  if (byeIds.length !== o.byeIds.length) return null;
  return { ties, byeIds, stage: o.stage };
}

/** The draw order an Opening is shown in (for editing): its ties, then byes as (team, null). */
export function orderOf(o: Opening): (string | null)[] {
  return [...o.ties.flatMap((t) => [t.homeId, t.awayId]), ...o.byeIds.flatMap((b) => [b, null])];
}


/** FM19: the real next round the bracket creates, by the organiser's rule —
 *  the same as the map's projection for the same results. Byes that skip the
 *  new round are recorded on its matches (they join its winners after). Null
 *  until every tie is decided, or after the final. */
export function nextRealRound(round: KnockoutRound, rule: OddRule, nameOf: (id: string) => string = (x) => x): { homeId: string; awayId: string; stage: KoStage; byes?: string[] }[] | null {
  const winners = round.pairings.map(pairingWinnerId);
  if (!winners.length || winners.some((w) => !w)) return null;
  const byes = [...new Set(round.matches.flatMap((m) => m.byes ?? []))];
  if (winners.length + byes.length < 2) return null;
  const losers = rankLosers(round.pairings.map((p) => {
    const id = pairingLoserId(p)!;
    const m = p.match;
    const home = m?.homeTeam.id === id;
    const ls = m?.score ? (home ? m.score.home : m.score.away) : 0;
    const ws = m?.score ? (home ? m.score.away : m.score.home) : 0;
    return { id, margin: ls - ws, scored: ls, name: nameOf(id), walkover: pairingMatches(p).some((x) => x.walkover) };
  }));
  const nx = nextRoundByRule({ winners: winners as string[], byes, losers }, rule);
  if (!nx.pairs.length) return null;
  const bySize = stageForTeams(nx.pairs.length * 2 + nx.byes.length);
  const stage = koStageRank(bySize) <= koStageRank(round.stage) ? KO_STAGES[Math.min(KO_STAGES.length - 1, koStageRank(round.stage) + 1)] : bySize;
  return nx.pairs.map(([homeId, awayId]) => ({ homeId, awayId, stage, ...(nx.byes.length ? { byes: nx.byes } : {}) }));
}

/** FM30: the knockout from group qualifiers — the app's seeding (cross-over
 *  or seeded), the organiser's odd-team rule, and their edited draw, which is
 *  written in place codes ("@A#1" = Group A winner, "@best#2") and resolved
 *  here to the teams that actually qualified. Same codes as the fixture map. */
export function groupsKnockoutOpening(q: Qualifier[], rule: OddRule, draw: DrawOverride | null): Opening {
  let best = 0;
  const codeOf = new Map<string, string>();
  const coded = q.map((x) => {
    const code = x.via === 'best' ? `@best#${++best}` : `@${x.group}#${x.rank}`;
    codeOf.set(code, x.teamId);
    return { ...x, teamId: code };
  });
  const n = coded.length;
  const onCodes: Opening = rule !== 'playin' && (n & (n - 1)) !== 0
    ? firstRound(coded.map((x) => x.teamId), rule)
    : (() => { const s = seedFromGroups(coded); return { ties: s.ties.map((t) => ({ homeId: t.homeId, awayId: t.awayId, slot: t.slot })), byeIds: s.byeIds, stage: s.stage }; })();
  const resolve = (c: string) => codeOf.get(c);
  const edited = applyDraw(onCodes, draw, resolve);
  if (edited) return edited;
  return { ...onCodes, ties: onCodes.ties.map((t) => ({ ...t, homeId: resolve(t.homeId)!, awayId: resolve(t.awayId)! })), byeIds: onCodes.byeIds.map((b) => resolve(b)!) };
}
