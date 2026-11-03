/**
 * Undo labels batch (2026-11-03) — what Undo removes in handball: "goal · 9 m
 * · Asha (12-10)", "2-minute suspension · Meera", "team time-out · India",
 * "7 m throw won · Ravi", "shoot-out goal · Asha (SO 3-2)". Built from the
 * newest step only (state before / after) with the timeline's own words
 * (`describeEvent`). IDs-only: a player by id through `nameOf` (an older log's
 * stored name only as the fallback), the side otherwise. Null = nothing to
 * name (the bar says a plain "Undo"). PURE.
 */
import { legacyNameOf, whoName, type NameOf } from '../racketNames.ts';
import { cleanUndoLabel, lowerFirst, sideWord, type UndoSides, type UndoStep } from '../undoLabel.ts';
import { soScore, type HandballEvent, type HandballState } from './engine.ts';
import { describeEvent } from './timeline.ts';

/** Steps that add no timeline row — named by what they set. */
const QUIET: Record<string, string> = {
  CLOCK: 'clock start / stop', SET_CLOCK: 'clock set', XI: 'line-up', REMOVE_EVENT: 'timeline correction',
  END_PERIOD: 'period end', END: 'full time', START_SHOOTOUT: 'start of the shoot-out',
  SO_ORDER: 'sudden-death order', STAT_ADJUST: 'stat correction',
};

export function handballUndoLabel(step: UndoStep, nameOf: NameOf = legacyNameOf, sides?: UndoSides): string | null {
  if (!step || typeof step.type !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(QUIET, step.type)) return QUIET[step.type];
  const prev = step.prev as HandballState | null, next = step.next as HandballState | null;
  if (!prev || !next) return null;
  if (step.type === 'SO') {
    for (const sd of ['home', 'away'] as const) {
      const a = prev.shootout?.[sd] ?? [], b = next.shootout?.[sd] ?? [];
      if (!Array.isArray(a) || !Array.isArray(b) || b.length <= a.length) continue;
      const k = b[b.length - 1];
      const who = whoName(nameOf, k?.playerId, k?.playerName) ?? sideWord(sd, sides);
      const so = soScore(next);
      return cleanUndoLabel(`shoot-out ${k?.scored ? 'goal' : 'miss'} · ${who} (SO ${so.home}-${so.away})`);
    }
    return 'shoot-out throw';
  }
  const before = Array.isArray(prev.events) ? prev.events : null, after = Array.isArray(next.events) ? next.events : null;
  if (!before || !after || after.length <= before.length) return null;
  const e = after[after.length - 1] as HandballEvent;
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
