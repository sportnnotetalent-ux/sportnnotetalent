/**
 * MVP F1 — what Undo removes in football: "goal · Ravi (2-1)", "assist · Ajay",
 * "shot on target · Ravi", "yellow card · Ravi", "kick-off". Built from the
 * newest step only (state before / after). Null = nothing to name (the bar
 * falls back to plain "Undo"). PURE.
 */
import { legacyNameOf, type NameOf } from '../../core/playerNames.ts';
import type { FootballState } from './engine.ts';
import { STAT_META, type FootballEvent, type StatEvent } from './events.ts';

/** Steps that add no timeline entry — named by what they set. */
const QUIET: Record<string, string> = {
  KICKOFF: 'kick-off', NEXT_HALF: 'start of the next half', END: 'full time',
  POSSESSION: 'possession switch', CLOCK: 'clock start / stop', SET_CLOCK: 'clock set',
  XI: 'line-up', SET_STOPPAGE: 'added time', START_EXTRA_TIME: 'start of extra time',
  START_SHOOTOUT: 'start of the shoot-out', PEN: 'shoot-out kick', GOAL_DETAIL: 'goal detail',
  REMOVE_EVENT: 'timeline correction', UNDO_GOAL: 'goal removal', STOPPAGE_REASON: 'stoppage reason',
};

const EVENT_WORD: Record<FootballEvent['type'], string> = {
  goal: 'goal', owngoal: 'own goal', yellow: 'yellow card', red: 'red card', sub: 'substitution',
  stoppage: 'stoppage', sinbin: 'sin-bin', timeout: 'time-out', nogoal: 'goal ruled out',
};

/** The named player, or none (never the fallback "Player" for a team entry). */
const who = (nameOf: NameOf, id?: string, legacy?: string) => (id || legacy?.trim() ? nameOf(id, legacy) : '');
const join = (what: string, name: string) => (name ? `${what} · ${name}` : what);

const statWord = (st: StatEvent): string => {
  const base = STAT_META[st.kind]?.label.toLowerCase();
  if (!base) return '';
  if (st.kind === 'shot') return `shot ${st.blocked ? 'blocked' : st.onTarget ? 'on target' : 'off target'}`;
  if (st.kind === 'pass') return `pass ${st.complete ? 'completed' : 'misplaced'}`;
  return base;
};

export function footballUndoLabel(
  step: { type: string; prev: unknown; next: unknown } | null | undefined,
  nameOf: NameOf = legacyNameOf,
): string | null {
  if (!step) return null;
  if (QUIET[step.type]) return QUIET[step.type];
  const prev = step.prev as FootballState | null;
  const next = step.next as FootballState | null;
  if (!prev?.events || !next?.events) return null;
  const score = `(${next.home}-${next.away})`;
  let label: string | null = null;

  if (step.type === 'ASSIST') {
    // the assist rides on its goal: the goal whose assister changed
    const g = next.events.find((e, i) => e.type === 'goal' && (e.secondId !== prev.events[i]?.secondId || e.secondName !== prev.events[i]?.secondName));
    label = g ? join('assist', who(nameOf, g.secondId, g.secondName)) : null;
  } else if (step.type === 'STAT' && (next.stats?.length ?? 0) > (prev.stats?.length ?? 0)) {
    const st = next.stats[next.stats.length - 1];
    const w = statWord(st);
    label = w ? join(w, who(nameOf, st.playerId, st.playerName)) : null;
  } else if (next.events.length > prev.events.length) {
    const e = next.events[next.events.length - 1];
    const what = e.type === 'red' && e.secondYellow ? 'red card (2nd yellow)' : EVENT_WORD[e.type];
    if (what) {
      const name = e.type === 'sub' ? who(nameOf, e.secondId, e.secondName) : e.official ? (e.playerName ?? 'team official') : who(nameOf, e.playerId, e.playerName);
      label = join(what, name);
      if (e.type === 'goal' || e.type === 'owngoal') label = `${label} ${score}`;
    }
  }
  return label && !/\bundefined\b|\bnull\b|\bNaN\b/.test(label) ? label : null;
}
