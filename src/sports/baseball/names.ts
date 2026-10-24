/**
 * IDs-only scoring — baseball / softball's name seam
 * (docs/privacy/ids-only-scoring.md, founder 2026-10-24).
 *
 * The match state (`matches.state`) and the event log (`match_events`) are
 * public, so baseball stores players by ID only: the line-ups, the starters,
 * every play's batter / pitcher / runner moves, subs and ejections carry
 * `{ id }` (engine.ts `storedWho`); the derived game (order, bases, runs,
 * pitching spells) follows. A player with no id keeps the label it is known
 * by — a numbered "Batter n" slot, or an older log's name-only player.
 *
 * `withNames(state, nameOf)` is the display copy: every player that has an id
 * named for THIS viewer (players_view: the child's circle sees full names,
 * everyone else initials, an open dispute "X"). Readers keep reading
 * `e.batter.name`, `entry.name`, `runner.name`, `spell.name`… on that copy.
 * It is NEVER dispatched or persisted (the builders take the raw state, and
 * store ids only anyway).
 *
 * Legacy (pre IDs-only) logs carry names next to the ids; the reducer replays
 * them exactly as before, and the stored name is the fallback for an id the
 * viewer can't resolve (`nameOf(id, legacyName)`) — any name the state holds
 * for an id serves every place that id appears (a legacy line-up names the
 * batter of a later id-only play). With no lookup (`legacyNameOf`) an older
 * log reads exactly as it did. Name-only players are left as they are (their
 * label is their key: `whoKey` "name:…").
 *
 * Pure and JSX-free (node tests load it — note the `.ts` imports).
 */
import { legacyNameOf, type NameOf } from '../../core/playerNames.ts';
import type { BaseballEvent, BaseballState, Game, LineupEntry, Move, PitcherSpell, Runner, RunCredit, Who } from './engine.ts';

export type { NameOf };

/** Every name the state stores for a player id (an older log's), first seen wins. */
function storedNames(s: BaseballState): Map<string, string> {
  const out = new Map<string, string>();
  const put = (id: string | undefined, name: string | undefined) => {
    const n = (name ?? '').trim();
    if (id && n && !out.has(id)) out.set(id, n);
  };
  const who = (w: Who | undefined) => put(w?.id, w?.name);
  for (const e of [...(s.lineup?.home ?? []), ...(s.lineup?.away ?? [])]) who(e);
  who(s.starters?.home); who(s.starters?.away);
  for (const e of s.events ?? []) {
    who(e.batter); who(e.pitcher); who(e.on); who(e.off);
    for (const m of e.moves ?? []) who(m);
  }
  const g = s.g;
  if (g) {
    for (const e of [...(g.order?.home ?? []), ...(g.order?.away ?? [])]) who(e);
    who(g.pitcher?.home); who(g.pitcher?.away);
    for (const r of g.bases ?? []) if (r) { put(r.id, r.name); put(r.resp, r.respName); }
    for (const sp of g.spells ?? []) put(sp.id, sp.name);
    for (const r of g.runs ?? []) { put(r.runnerId, r.runnerName); put(r.resp, r.respName); }
  }
  return out;
}

const NAMED = Symbol('baseball.withNames');
const cache = new WeakMap<object, { nameOf: NameOf; out: object }>();

/** Has this state already been through `withNames`? */
export const isNamed = (s: unknown): boolean => !!s && typeof s === 'object' && (s as Record<symbol, unknown>)[NAMED] === true;

/**
 * The display copy of a baseball state: every player with an id named by id
 * for this viewer (the stored legacy name only as the fallback). Cached per
 * (state, nameOf); a state that is already named is returned as it is.
 */
export function withNames<T extends BaseballState>(s: T, nameOf: NameOf = legacyNameOf): T {
  if (!s || typeof s !== 'object' || !s.g || isNamed(s)) return s;
  const hit = cache.get(s);
  if (hit && hit.nameOf === nameOf) return hit.out as T;

  const known = storedNames(s);
  /** the name for a player id (a pitcher's key is its id; "name:…" keys stay as they are) */
  const nm = (id: string, legacy: string | undefined): string => nameOf(id, legacy ?? known.get(id));
  const isId = (k: string | undefined): k is string => !!k && !k.startsWith('name:');
  const who = <W extends Who>(w: W | undefined): W | undefined => (w?.id ? { ...w, name: nm(w.id, w.name) } : w);
  const entry = (e: LineupEntry): LineupEntry => (e.id ? { ...e, name: nm(e.id, e.name) } : e);
  const move = (m: Move): Move => (m.id ? { ...m, name: nm(m.id, m.name) } : m);
  const runner = (r: Runner | null): Runner | null => (r ? {
    ...r, ...(r.id ? { name: nm(r.id, r.name) } : {}), ...(isId(r.resp) ? { respName: nm(r.resp, r.respName) } : {}),
  } : r);
  const run = (r: RunCredit): RunCredit => ({
    ...r, ...(r.runnerId ? { runnerName: nm(r.runnerId, r.runnerName) } : {}), ...(isId(r.resp) ? { respName: nm(r.resp, r.respName) } : {}),
  });
  const spell = (sp: PitcherSpell): PitcherSpell => (sp.id ? { ...sp, name: nm(sp.id, sp.name) } : sp);
  const event = (e: BaseballEvent): BaseballEvent => {
    if (!e.batter?.id && !e.pitcher?.id && !e.on?.id && !e.off?.id && !e.moves?.some((m) => m.id)) return e;
    return {
      ...e,
      ...(e.batter ? { batter: who(e.batter) } : {}), ...(e.pitcher ? { pitcher: who(e.pitcher) } : {}),
      ...(e.on ? { on: who(e.on) } : {}), ...(e.off ? { off: who(e.off) } : {}),
      ...(e.moves ? { moves: e.moves.map(move) } : {}),
    };
  };
  const side = <V>(x: { home?: V; away?: V } | undefined, f: (v: V) => V) =>
    (x ? { ...x, ...(x.home !== undefined ? { home: f(x.home) } : {}), ...(x.away !== undefined ? { away: f(x.away) } : {}) } : x);

  const g: Game = {
    ...s.g,
    order: { home: s.g.order.home.map(entry), away: s.g.order.away.map(entry) },
    pitcher: side(s.g.pitcher, (w: Who) => who(w)!) ?? s.g.pitcher,
    bases: s.g.bases.map(runner) as Game['bases'],
    spells: s.g.spells.map(spell),
    runs: s.g.runs.map(run),
  };
  const out = {
    ...s,
    lineup: side(s.lineup, (l: LineupEntry[]) => l.map(entry)),
    starters: side(s.starters, (w: Who) => who(w)!),
    events: s.events.map(event),
    g,
  } as T;
  Object.defineProperty(out, NAMED, { value: true, enumerable: false });
  cache.set(s, { nameOf, out });
  return out;
}

/** A player's name for this viewer from a stored `Who` / slot / move (by id;
 *  a player with no id reads its label). For a draft the screen builds from
 *  the raw state (the advance sheet's moves). */
export const whoText = (w: { id?: string; name?: string } | null | undefined, nameOf: NameOf = legacyNameOf): string | undefined =>
  (w?.id ? nameOf(w.id, w.name) : w?.name);
