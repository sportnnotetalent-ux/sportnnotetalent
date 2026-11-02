/**
 * SD-32 (VB-03) — volleyball's absolute `statTotals`: the point credits the
 * log gives each player, keyed by player id. PURE.
 *
 *  - Box keys: exactly what the controls credit live (`volleyballCredits`) —
 *    `points` (every credited point: attack, block, ace, or an outcome not
 *    recorded), `attackPoints` (kills), `blocks` (block points) and `aces`,
 *    summed over the log. Edits (EDIT_LOG + STAT_ADJUST), undos and a retried
 *    upload can't drift. Older lines heal: before SD-04 an ace / block didn't
 *    also credit `points` live; the re-sync (D2) sets the line to the log.
 *  - Errors / serve errors are player keys only when the scorer named the
 *    erring opponent (SD-117b "Opp. fault" → `errors`; SD-58 a missed serve
 *    pre-filled with the opponent's server → `serveErrors`), keyed coverage.
 *    The team figures stay in src/sports/boxSources.ts.
 *  - `setsPlayed` (SD-29, fieldTime.ts) and `setsWon` / `setsLost` (SD-19,
 *    racketTotals.ts) are merged in.
 *
 * Ids: IDs-only scoring (docs/privacy/ids-only-scoring.md) — every credited
 * point carries its `playerId` (before it, once a court was stamped, SD-29,
 * `LINEUP`). Older logs carry names only — they resolve per side through
 * the stamped court and the matchday squads (`ctx`). If ANY credited name
 * can't be resolved (or is ambiguous), the box keys are left out entirely and
 * the lines keep moving by live increments, as before — the sync zeroes owned
 * keys for players missing from the totals, so a partial guess would wipe
 * real stats (the SD-40 / SD-30 safeguard).
 */
import type { StatTotalsContext, StatTotalsEntry } from '../types';
import { mergeTotals, volleyballSetRecord } from '../racketTotals.ts';
import { volleyballCredits, type VolleyballState } from './engine.ts';
import { volleyballTotals } from './fieldTime.ts';
import type { PointKind } from '../rallyEdit.ts';
import {
  detailTally, detailTracked, receptionTracked, acedTracked, digTracked, assistTracked,
  VB_ATTACK_KEYS, VB_RECEPTION_KEYS, VB_RECEPTION_ERROR_KEY, VB_DIG_KEY, VB_ASSIST_KEY,
} from './detail.ts';
import { rallyServers, serveTracked } from './rotation.ts';

type Side = 'home' | 'away';

/** The box keys the totals own (all of them, or none). */
export const VOLLEYBALL_BOX_KEYS = ['points', 'attackPoints', 'blocks', 'aces'] as const;
/** Owned here but never credited live. */
export const VOLLEYBALL_DERIVED_KEYS = ['setsPlayed', 'setsWon', 'setsLost'] as const;

const CREDITED = new Set<string>(['point', 'attack', 'block', 'ace']);

/** name → id per side (court stamp + ctx); a name with two ids is ambiguous. */
function nameIndex(s: VolleyballState, ctx?: StatTotalsContext): Record<Side, Map<string, string | null>> {
  const idx: Record<Side, Map<string, string | null>> = { home: new Map(), away: new Map() };
  const note = (side: Side, id?: string, name?: string) => {
    if (!id || !name) return;
    const cur = idx[side].get(name);
    if (cur === undefined) idx[side].set(name, id);
    else if (cur !== id) idx[side].set(name, null);
  };
  for (const side of ['home', 'away'] as const) {
    for (const p of s.lineup?.[side] ?? []) note(side, p.id, p.name);
    for (const p of ctx?.players?.[side] ?? []) note(side, p.id, p.name);
  }
  for (const e of s.events ?? []) if (e.side === 'home' || e.side === 'away') note(e.side, e.playerId, e.playerName);
  return idx;
}

/** The box keys per player id — empty when any credited name is unresolved. */
export function volleyballBoxTotals(s: VolleyballState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  const out: Record<string, StatTotalsEntry> = {};
  if (!s?.events) return out;
  const idx = nameIndex(s, ctx);
  for (const e of s.events) {
    if (!CREDITED.has(e.kind ?? '') || (!e.playerName && !e.playerId) || (e.side !== 'home' && e.side !== 'away')) continue;
    const id = e.playerId || (e.playerName ? idx[e.side].get(e.playerName) : undefined) || undefined;
    if (!id) return {}; // the safeguard: leave the whole group out
    const line = out[id] ?? (out[id] = { side: e.side, stats: Object.fromEntries(VOLLEYBALL_BOX_KEYS.map((k) => [k, 0])) });
    for (const [k, v] of Object.entries(volleyballCredits(e.kind as PointKind))) line.stats[k] = (line.stats[k] ?? 0) + v;
  }
  return out;
}

/** SD-117b — `errors` per player id: each "Opp. fault" that names the erring
 *  opponent charges them one. SD-58 — `serveErrors` the same way: each missed
 *  serve that names the opponent's server. Written only for a match that named
 *  at least one (coverage 'keyed': every other match reads "not tracked",
 *  never 0) — then on every line of the match, 0 for the rest. Left out whole
 *  when a named player can't be resolved (the same safeguard as the box keys). */
function chargedTotals(kind: 'opperror' | 'serveerror', key: string, s: VolleyballState, ctx: StatTotalsContext | undefined, lines: Record<string, StatTotalsEntry>): Record<string, StatTotalsEntry> {
  const faults = (s?.events ?? []).filter((e) => e.kind === kind && (e.oe?.playerName || e.oe?.playerId) && (e.side === 'home' || e.side === 'away'));
  if (!faults.length) return {};
  const idx = nameIndex(s, ctx);
  const count = new Map<string, { side: Side; n: number }>();
  for (const e of faults) {
    const side: Side = e.side === 'home' ? 'away' : 'home'; // the erring side
    const id = e.oe!.playerId || (e.oe!.playerName ? idx[side].get(e.oe!.playerName) : undefined) || undefined;
    if (!id) return {};
    const c = count.get(id) ?? { side, n: 0 };
    c.n += 1;
    count.set(id, c);
  }
  const out: Record<string, StatTotalsEntry> = {};
  for (const [id, e] of Object.entries(lines)) out[id] = { side: e.side, stats: { [key]: 0 } };
  for (const [id, c] of count) out[id] = { side: out[id]?.side ?? c.side, stats: { [key]: c.n } };
  return out;
}
export const volleyballErrorTotals = (s: VolleyballState, ctx: StatTotalsContext | undefined, lines: Record<string, StatTotalsEntry>) =>
  chargedTotals('opperror', VOLLEYBALL_ERROR_KEY, s, ctx, lines);
/** SD-58 / SD-81 — `serveErrors` per player id (keyed coverage). */
export const volleyballServeErrorTotals = (s: VolleyballState, ctx: StatTotalsContext | undefined, lines: Record<string, StatTotalsEntry>) =>
  chargedTotals('serveerror', VOLLEYBALL_SERVE_ERROR_KEY, s, ctx, lines);
export const VOLLEYBALL_SERVE_ERROR_KEY = 'serveErrors';
export const VOLLEYBALL_ERROR_KEY = 'errors';

/** SD-81 — the "Detailed stats" keys per player id: attack attempts / kills /
 *  errors / blocked (a match that had detail on) and receptions (a match that
 *  graded one). Keyed coverage: written on EVERY line of such a match (0 for
 *  the rest), never on any other match ("not tracked"). Left out whole when a
 *  named player can't be resolved (the SD-30 / SD-40 safeguard). */
export function volleyballDetailTotals(s: VolleyballState, ctx: StatTotalsContext | undefined, lines: Record<string, StatTotalsEntry>): Record<string, StatTotalsEntry> {
  const attack = detailTracked(s);
  const recv = receptionTracked(s);
  // deep wave — reception errors (aced receivers named), digs, set assists:
  // each only for a match that captured its category. Batch 5: the reception
  // keys follow Reception quality alone ("Who was aced?" on its own writes
  // reception errors only; on an older match aced implies recv, as before)
  const aced = acedTracked(s);
  const dig = digTracked(s);
  const assist = assistTracked(s);
  if (!attack && !recv && !aced && !dig && !assist) return {};
  const keys: string[] = [
    ...(attack ? VB_ATTACK_KEYS : []), ...(recv ? VB_RECEPTION_KEYS : []),
    ...(aced ? [VB_RECEPTION_ERROR_KEY] : []), ...(dig ? [VB_DIG_KEY] : []), ...(assist ? [VB_ASSIST_KEY] : []),
  ];
  const idx = nameIndex(s, ctx);
  for (const x of s.vd ?? []) if (x.playerId && x.playerName) idx[x.side].set(x.playerName, idx[x.side].get(x.playerName) ?? x.playerId);
  const zero = () => Object.fromEntries(keys.map((k) => [k, 0]));
  const out: Record<string, StatTotalsEntry> = {};
  for (const [id, e] of Object.entries(lines)) out[id] = { side: e.side, stats: zero() };
  for (const l of detailTally(s).values()) {
    const id = l.playerId || (l.name ? idx[l.side].get(l.name) : undefined) || undefined;
    if (!id) return {};
    const line = out[id] ?? (out[id] = { side: l.side, stats: zero() });
    for (const k of keys) line.stats[k] = (line.stats[k] ?? 0) + (l[k as keyof typeof l] as number);
  }
  return out;
}

/** Deep wave — `serveAttempts` per player id: the rallies each player served
 *  (FIVB VIS serve attempts), from the toss + rotation (SD-58). Written only
 *  when EVERY served rally of the match names its server (a match without
 *  the toss, or with one side's rotation unknown, reads "not tracked" —
 *  never a partial count); then on every line (0 for the rest). Penalty
 *  points aren't served rallies. */
export function volleyballServeAttemptTotals(s: VolleyballState, lines: Record<string, StatTotalsEntry>): Record<string, StatTotalsEntry> {
  if (!s?.events || !serveTracked(s)) return {};
  const rallies = rallyServers(s);
  if (!rallies.length || rallies.some((r) => !r.serverId || !r.side)) return {};
  const out: Record<string, StatTotalsEntry> = {};
  for (const [id, e] of Object.entries(lines)) out[id] = { side: e.side, stats: { [VOLLEYBALL_SERVE_ATTEMPT_KEY]: 0 } };
  for (const r of rallies) {
    const line = out[r.serverId!] ?? (out[r.serverId!] = { side: r.side!, stats: { [VOLLEYBALL_SERVE_ATTEMPT_KEY]: 0 } });
    line.stats[VOLLEYBALL_SERVE_ATTEMPT_KEY] += 1;
  }
  return out;
}
export const VOLLEYBALL_SERVE_ATTEMPT_KEY = 'serveAttempts';

/** The plugin's `statTotals`: box keys, SD-29 sets played, SD-19 set record,
 *  SD-117b errors (only for a match that named an erring player), SD-58
 *  serve errors (only for a match that named a server who missed). */
export const volleyballStatTotals = (s: VolleyballState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> => {
  const base = mergeTotals(mergeTotals(volleyballBoxTotals(s, ctx), volleyballTotals(s)), volleyballSetRecord(s, ctx));
  const withErrors = mergeTotals(base, volleyballErrorTotals(s, ctx, base));
  const withServe = mergeTotals(withErrors, volleyballServeErrorTotals(s, ctx, withErrors));
  // SD-81 — attack attempts / efficiency inputs and receptions (detail mode);
  // deep wave — reception errors, digs, set assists (their categories)
  const withDetail = mergeTotals(withServe, volleyballDetailTotals(s, ctx, withServe));
  // deep wave — serve attempts (every served rally's server known)
  return mergeTotals(withDetail, volleyballServeAttemptTotals(s, withDetail));
};
