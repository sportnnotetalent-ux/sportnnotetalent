/**
 * MVP B5 — what Undo removes in basketball: "+3 · Arjun (54-50)", "free throw
 * made · Arjun (55-50)", "shooting foul · Rahul", "team foul (personal)",
 * "tip-off". Built from the newest step only. Null = nothing to name (the bar
 * falls back to plain "Undo"). PURE.
 */
import { legacyNameOf, type NameOf } from '../../core/playerNames.ts';
import type { BasketballState } from './engine.ts';
import { BB_META, FOUL_LABEL } from './events.ts';

const QUIET: Record<string, string> = {
  KICKOFF: 'tip-off', CLOCK: 'clock start / stop', SET_CLOCK: 'clock set', NEXT_QUARTER: 'end of the period',
  START_OVERTIME: 'start of overtime', SET_LINEUP: 'starting five', TAG: 'fast-break tag', END: 'full time',
  REMOVE_EVENT: 'timeline correction',
};

const who = (nameOf: NameOf, id?: string, legacy?: string) => (id || legacy?.trim() ? nameOf(id, legacy) : '');
const join = (what: string, name: string) => (name ? `${what} · ${name}` : what);

export function basketballUndoLabel(
  step: { type: string; prev: unknown; next: unknown } | null | undefined,
  nameOf: NameOf = legacyNameOf,
): string | null {
  if (!step) return null;
  if (QUIET[step.type]) return QUIET[step.type];
  const prev = step.prev as BasketballState | null;
  const next = step.next as BasketballState | null;
  if (!prev?.events || !next?.events || next.events.length <= prev.events.length) return null;
  const e = next.events[next.events.length - 1];
  const name = who(nameOf, e.pid, e.playerName);
  const score = `(${next.home}-${next.away})`;
  let label: string;
  switch (e.type) {
    case 'score': label = `${join(`+${e.points ?? 0}`, name)} ${score}`; break;
    case 'freethrow': label = e.made ? `${join('free throw made', name)} ${score}` : join('free throw missed', name); break;
    case 'miss': label = join(`missed ${e.points ?? ''}`.trim(), name); break;
    case 'foul': {
      const kind = FOUL_LABEL[e.foulType ?? 'personal'].replace(/ \([A-Z]\)$/, '').toLowerCase();
      label = name ? `${kind} foul · ${name}` : `team foul (${kind})`;
      break;
    }
    default: {
      const meta = BB_META[e.type];
      if (!meta) return null;
      label = join(`${e.team ? 'team ' : ''}${meta.label.toLowerCase()}`, name); // US batch 5: a team rebound / turnover
    }
  }
  return /\bundefined\b|\bnull\b|\bNaN\b/.test(label) ? null : label;
}
