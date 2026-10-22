/**
 * SD-147 — American football's absolute statTotals (SD-19). PURE.
 *
 * statTotals owns the WHOLE line: every live key is the sum of `eventCredits`
 * over the state. The scoring keys are written for everyone credited (0 when
 * none); the play-by-play keys only in a match scored play by play (or one
 * that has such plays); tackles only when tackles were tracked. `fgLong`
 * (longest field goal made) is derived — no live action credits it.
 *
 * Deep wave: the optional keys (targets, passes defended, tackles for loss,
 * times sacked / sack yards lost) read 0 on every line only when the match
 * tracked them (`deepKeys`) — an old match never gets them. Longest run /
 * reception (`rushLong` / `recLong`) are derived from the play-by-play log
 * (a player with a carry / a catch; never below 0) — never credited live.
 */
import { deepKeys, eventCredits, isPbp, secondIsDefence, tacklesTracked, PBP_KEYS, SCORE_KEYS, type AFEvent, type AFState, type Side } from './engine.ts';

/** A carry / catch's yards for "longest" (play by play only: a run, a kneel,
 *  a completion, a touchdown run / catch from scrimmage). */
export function longGain(e: AFEvent): { kind: 'rush' | 'rec'; id?: string; name?: string; yards: number } | null {
  const y = Math.round(Number(e.yards) || 0);
  if (e.type === 'play' && (e.play === 'run' || e.play === 'kneel')) return { kind: 'rush', id: e.playerId, name: e.playerName, yards: y };
  if (e.type === 'play' && e.play === 'pass') return { kind: 'rec', id: e.secondId, name: e.secondName, yards: y };
  if (e.type === 'td' && e.pbp && e.how === 'run') return { kind: 'rush', id: e.playerId, name: e.playerName, yards: y };
  if (e.type === 'td' && e.pbp && e.how === 'pass') return { kind: 'rec', id: e.playerId, name: e.playerName, yards: y };
  return null;
}

export function afTotals(s: AFState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const line = (id: string, side: Side) => (out[id] ??= { side, stats: {} });
  const add = (id: string, side: Side, stats: Record<string, number>) => {
    const l = line(id, side);
    for (const [k, v] of Object.entries(stats)) l.stats[k] = (l.stats[k] ?? 0) + v;
  };
  for (const e of s.events) {
    const c = eventCredits(e);
    // a play's second player is on the other side for defensive credits (sack / int / fumble recovery)
    const def = secondIsDefence(e);
    if (c.first) add(c.first.playerId, e.side, c.first.stats);
    if (c.second) add(c.second.playerId, def ? (e.side === 'home' ? 'away' : 'home') : e.side, c.second.stats);
    if (e.type === 'fg' && e.good && e.playerId && e.yards) {
      const l = line(e.playerId, e.side);
      l.stats.fgLong = Math.max(l.stats.fgLong ?? 0, e.yards);
    }
    // deep wave: longest run / reception (derived, ≥ 0)
    const g = longGain(e);
    if (g?.id) {
      const k = g.kind === 'rush' ? 'rushLong' : 'recLong';
      const l = line(g.id, e.side);
      l.stats[k] = Math.max(l.stats[k] ?? 0, g.yards, 0);
    }
  }
  const pbp = isPbp(s);
  const tackles = tacklesTracked(s);
  const deep = deepKeys(s);
  for (const l of Object.values(out)) {
    for (const k of SCORE_KEYS) l.stats[k] ??= 0;
    if (pbp) for (const k of PBP_KEYS) l.stats[k] ??= 0;
    if (tackles) l.stats.tackles ??= 0;
    for (const k of deep) l.stats[k] ??= 0;
  }
  return out;
}

/** The keys statTotals owns that no live action credits (contract rule 5). */
export const DERIVED_KEYS = ['fgLong', 'rushLong', 'recLong'] as const;
