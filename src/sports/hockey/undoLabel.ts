/**
 * Undo labels batch (2026-11-03) — what Undo removes in hockey: "field goal ·
 * Asha (2-1)", "penalty corner · India", "green card (2 min) · Meera",
 * "shoot-out goal · Asha (SO 2-1)", "clock start / stop". Built from the
 * newest step only (state before / after) with the timeline's own words
 * (`describeEvent`). IDs-only: a player by id through `nameOf` (an older log's
 * stored name only as the fallback), the side otherwise. Null = nothing to
 * name (the bar says a plain "Undo"). PURE.
 */
import { legacyNameOf, whoName, type NameOf } from '../racketNames.ts';
import { cleanUndoLabel, lowerFirst, sideWord, type UndoSides, type UndoStep } from '../undoLabel.ts';
import { soScore, type HockeyEvent, type HockeyState } from './engine.ts';
import { describeEvent } from './timeline.ts';

/** Steps that add no timeline row — named by what they set. */
const QUIET: Record<string, string> = {
  CLOCK: 'clock start / stop', SET_CLOCK: 'clock set', XI: 'line-up', POSS: 'possession switch',
  PC_OUTCOME: 'penalty-corner outcome', REMOVE_EVENT: 'timeline correction', END_PERIOD: 'period end',
  END: 'full time', START_SHOOTOUT: 'start of the shoot-out', SO_ORDER: 'sudden-death order',
  STAT_ADJUST: 'stat correction',
};

const listOf = (s: unknown, k: string): unknown[] | null => {
  const v = (s as Record<string, unknown> | null)?.[k];
  return Array.isArray(v) ? v : null;
};

export function hockeyUndoLabel(step: UndoStep, nameOf: NameOf = legacyNameOf, sides?: UndoSides): string | null {
  if (!step || typeof step.type !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(QUIET, step.type)) return QUIET[step.type];
  const prev = step.prev as HockeyState | null, next = step.next as HockeyState | null;
  if (!prev || !next) return null;
  if (step.type === 'CIRCLE') {
    const a = listOf(prev, 'circles')?.length ?? 0, b = listOf(next, 'circles')?.length ?? 0;
    const last = listOf(next, 'circles')?.[b - 1] as { side?: string } | undefined;
    return b > a ? cleanUndoLabel(`circle entry · ${sideWord(last?.side, sides)}`) : b < a ? 'circle entry removal' : null;
  }
  if (step.type === 'SO') {
    for (const sd of ['home', 'away'] as const) {
      const a = prev.shootout?.[sd] ?? [], b = next.shootout?.[sd] ?? [];
      if (!Array.isArray(a) || !Array.isArray(b) || b.length <= a.length) continue;
      const k = b[b.length - 1];
      const who = whoName(nameOf, k?.playerId, k?.playerName) ?? sideWord(sd, sides);
      const so = soScore(next);
      return cleanUndoLabel(`shoot-out ${k?.scored ? 'goal' : 'miss'} · ${who} (SO ${so.home}-${so.away})`);
    }
    return 'shoot-out attempt';
  }
  if (step.type === 'GOAL_DETAIL') {
    // describe-invasion DI4: the assist attached after the goal — the goal whose assister changed
    const b0 = (listOf(prev, 'events') ?? []) as HockeyEvent[], a0 = (listOf(next, 'events') ?? []) as HockeyEvent[];
    const g = a0.find((e, i) => e?.type === 'goal' && (e.secondId !== b0[i]?.secondId || e.secondName !== b0[i]?.secondName));
    if (!g) return 'goal detail';
    const who = whoName(nameOf, g.secondId, g.secondName);
    return g.secondId || g.secondName ? cleanUndoLabel(who ? `assist · ${who}` : 'assist') : 'assist removal';
  }
  const before = listOf(prev, 'events'), after = listOf(next, 'events');
  if (!before || !after || after.length <= before.length) return null;
  const e = after[after.length - 1] as HockeyEvent;
  if (!e || typeof e !== 'object') return null;
  let d: { label: string } | undefined;
  try { d = describeEvent(e); } catch { return null; }
  if (!d?.label) return null;
  const what = lowerFirst(d.label);
  const who = e.type === 'sub'
    ? (() => { const on = whoName(nameOf, e.secondId, e.secondName), off = whoName(nameOf, e.playerId, e.playerName); return on ? `${on} on` : off ? `${off} off` : sideWord(e.side, sides); })()
    : e.type === 'card' && e.official ? `${e.official} (official)`
    : whoName(nameOf, e.playerId, e.playerName) ?? sideWord(e.side, sides);
  const score = e.type === 'goal' ? ` (${next.home}-${next.away})` : '';
  return cleanUndoLabel(`${what}${who ? ` · ${who}` : ''}${score}`);
}
