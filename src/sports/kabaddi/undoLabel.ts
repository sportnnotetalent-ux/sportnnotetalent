/**
 * Undo labels batch (2026-11-03) — what Undo removes in kabaddi: "raid +2 — 2
 * touches · Pardeep (12-9)", "empty raid — raider out · Pardeep · tackle +1
 * (9-10)", "yellow card — 2 min suspension · Fazel", "timeout · Patna",
 * "substitution · Rahul on", "start of the next half". Built from the newest
 * step only (state before / after) with the timeline's own words (each line's
 * `label`). IDs-only: a player by id through `nameOf` (an older log's stored
 * name only as the fallback), the side otherwise. Null = nothing to name (the
 * bar says a plain "Undo"). PURE.
 */
import { legacyNameOf, whoName, type NameOf } from '../racketNames.ts';
import { cleanUndoLabel, lowerFirst, sideWord, type UndoSides, type UndoStep } from '../undoLabel.ts';
import type { KabaddiEvent, KabaddiState } from './engine.ts';
import { subPlayers } from './names.ts';

/** Steps that add no timeline line — named by what they set. */
const QUIET: Record<string, string> = {
  KICKOFF: 'clock start', PAUSE: 'clock pause', RESUME: 'clock restart', SET_TRACK: 'stats-to-track setting',
  NEXT_HALF: 'start of the next half', START_EXTRA_TIME: 'start of extra time',
  START_GOLDEN_RAID: 'start of the Golden Raid', START_SHOOTOUT: 'start of the shootout',
  END: 'full time', REMOVE_EVENT: 'timeline correction', STAT_ADJUST: 'stat correction',
};

/** The line's words: "Golden Raid" keeps its capitals. */
const words = (label: string) => (/^Golden Raid/.test(label) ? label : lowerFirst(label));

function whoOf(e: KabaddiEvent, nameOf: NameOf, sides?: UndoSides): string {
  if (e.kind === 'sub') {
    const p = subPlayers(e, nameOf);
    return p?.on ? `${p.on} on` : sideWord(e.side, sides);
  }
  if (e.kind === 'card' && !e.playerId && !e.playerName && /official/i.test(e.detail ?? '')) return 'team official';
  // a line-out / all-out / technical point names the side it scores for
  if (e.kind === 'lineout' || e.kind === 'allout' || e.kind === 'tech') return sideWord(e.side, sides);
  return whoName(nameOf, e.playerId, e.playerName) ?? sideWord(e.side, sides);
}

export function kabaddiUndoLabel(step: UndoStep, nameOf: NameOf = legacyNameOf, sides?: UndoSides): string | null {
  if (!step || typeof step.type !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(QUIET, step.type)) return QUIET[step.type];
  const prev = step.prev as KabaddiState | null, next = step.next as KabaddiState | null;
  if (!prev || !next || !Array.isArray(prev.events) || !Array.isArray(next.events)) return null;
  // a raid edited in place keeps its slot: the timeline is rebuilt, nothing added
  if (step.type === 'RAID_OUTCOME' && Array.isArray(prev.raids) && Array.isArray(next.raids) && next.raids.length === prev.raids.length) return 'raid correction';
  // the lines this step added (raids rebuild the timeline: compare by id)
  const had = new Set(prev.events.map((e) => e?.id));
  const added = next.events.filter((e) => e && !had.has(e.id));
  if (!added.length) return null;
  const head = added[0];
  if (typeof head.label !== 'string' || !head.label.trim()) return null;
  const who = whoOf(head, nameOf, sides);
  let text = `${words(head.label.trim())}${who ? ` · ${who}` : ''}`;
  // the raid's answer: the tackle, an all out
  const tackle = added.find((e) => e !== head && e.kind === 'tackle');
  if (tackle && typeof tackle.label === 'string' && tackle.label.trim()) {
    const by = whoName(nameOf, tackle.playerId, tackle.playerName);
    text += ` · ${lowerFirst(tackle.label.trim())}${by ? ` by ${by}` : ''}`;
  }
  if (added.some((e) => e !== head && e.kind === 'allout')) text += ' · all out';
  if (head.stamp === 'SO' && next.shootout) {
    const sum = (xs: unknown) => (Array.isArray(xs) ? xs.reduce((t: number, n) => t + (Number(n) || 0), 0) : 0);
    text += ` (SO ${sum(next.shootout.home)}-${sum(next.shootout.away)})`;
  } else if (next.home !== prev.home || next.away !== prev.away) text += ` (${next.home}-${next.away})`;
  return cleanUndoLabel(text);
}
