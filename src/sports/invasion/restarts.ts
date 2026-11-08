/**
 * Invasion batch 6 (docs/sport-expert/invasion.md fix 16): restart and
 * penalty-use depth for the two rugby codes, behind a "Stats to track" toggle
 * (`trackRestarts`, off by default — one tap each, team only):
 *  - union (World Rugby): what a penalty was used for — kicked to touch, a
 *    scrum, a tap (a kick at goal is its own button already) — and the 50:22
 *    (Law 18: the kicking side throws in);
 *  - league (NRL / IRL): a penalty kicked to touch or tapped, the 40/20 and
 *    20/40 kicks, and goal-line drop-outs.
 * `side` = the team that did it (took the penalty option, kicked the 50:22 /
 * 40/20 / 20/40, took the drop-out — the defending side forced to drop out).
 * Action: `RESTART { side, payload: { kind } }` → an event of type `restart`.
 * A kind of the other code (or anything else) is ignored. PURE.
 */
import type { FormatField, ScoreAction } from '../types';
import { countRow, section, type SheetSection } from '../compareSheet.ts';

type Side = 'home' | 'away';
export type UnionRestart = 'penTouch' | 'penScrum' | 'penTap' | 'fiftyTwentyTwo';
export type LeagueRestart = 'penTouch' | 'penTap' | 'fortyTwenty' | 'twentyForty' | 'dropOut';
export type RestartKind = UnionRestart | LeagueRestart;
export const UNION_RESTARTS: readonly UnionRestart[] = ['penTouch', 'penScrum', 'penTap', 'fiftyTwentyTwo'];
export const LEAGUE_RESTARTS: readonly LeagueRestart[] = ['penTouch', 'penTap', 'fortyTwenty', 'twentyForty', 'dropOut'];

/** button label */
export const RESTART_LABEL: Record<RestartKind, string> = {
  penTouch: 'Penalty → touch', penScrum: 'Penalty → scrum', penTap: 'Penalty → tap',
  fiftyTwentyTwo: '50:22', fortyTwenty: '40/20', twentyForty: '20/40', dropOut: 'Goal-line drop-out',
};
/** stats sheet row */
export const RESTART_ROW: Record<RestartKind, string> = {
  penTouch: 'Penalties kicked to touch', penScrum: 'Penalties to a scrum', penTap: 'Penalties tapped',
  fiftyTwentyTwo: '50:22 kicks', fortyTwenty: '40/20 kicks', twentyForty: '20/40 kicks', dropOut: 'Goal-line drop-outs',
};

export const restartKinds = (code: 'rugby' | 'rugby_league'): readonly RestartKind[] => (code === 'rugby' ? UNION_RESTARTS : LEAGUE_RESTARTS);
export const isRestart = (code: 'rugby' | 'rugby_league', v: unknown): v is RestartKind =>
  typeof v === 'string' && (restartKinds(code) as readonly string[]).includes(v);

/** The toggle (format + live settings: Info lists it). */
export const restartField = (code: 'rugby' | 'rugby_league'): FormatField => ({
  key: 'trackRestarts', label: code === 'rugby' ? 'Penalty options & 50:22' : 'Kicks & restarts (40/20, 20/40, drop-outs)', type: 'toggle', default: false, group: 'Stats to track',
  hint: code === 'rugby' ? 'what each penalty was used for (touch / scrum / tap) and 50:22 kicks — one tap, the team' : 'penalties to touch / tapped, 40/20, 20/40 and goal-line drop-outs — one tap, the team',
});

/** The action a restart button dispatches (the controls add the clock). */
export const restartAction = (side: Side, kind: RestartKind): ScoreAction => ({ type: 'RESTART', side, payload: { kind } });

/** Is the toggle on in this config (state key only when on)? */
export const restartConfig = (config?: Record<string, unknown>): { trackRestarts?: true } => (config?.trackRestarts === true ? { trackRestarts: true } : {});

type RestartEvent = { type: string; side: Side; period: number; restart?: RestartKind };
/** Tracked in the match: any recorded. NZI13 (no false zeros): the toggle only
 *  offers the chips — switched on with none recorded is no section of zeros. */
export const restartsTracked = (s: { trackRestarts?: boolean; events: RestartEvent[] }): boolean =>
  s.events.some((e) => e.type === 'restart');

/** The sheet's "Kicks & restarts" section (null when the match never tracked them). */
export function restartSection(code: 'rugby' | 'rugby_league', s: { trackRestarts?: boolean; events: RestartEvent[] }, scope: 'all' | number = 'all'): SheetSection | null {
  if (!restartsTracked(s)) return null;
  const n = (sd: Side, k: RestartKind) => s.events.filter((e) => e.type === 'restart' && e.restart === k && e.side === sd && (scope === 'all' || e.period === scope)).length;
  return section('restarts', code === 'rugby' ? 'Penalty options & kicks' : 'Kicks & restarts', restartKinds(code).map((k) => countRow(`restart:${k}`, RESTART_ROW[k], n('home', k), n('away', k))));
}

/** Commentary sentence. */
export function restartText(kind: RestartKind, team: string, opp: string): string {
  switch (kind) {
    case 'penTouch': return `${team} kick for touch from the penalty.`;
    case 'penScrum': return `${team} take the scrum from the penalty.`;
    case 'penTap': return `${team} tap the penalty and go.`;
    case 'fiftyTwentyTwo': return `50:22! ${team} kick from their own half into touch in the ${opp} 22 — their throw.`;
    case 'fortyTwenty': return `40/20! ${team} find touch in the ${opp} 20 — their feed.`;
    case 'twentyForty': return `20/40! ${team} kick from their own 20 into touch past halfway — their feed.`;
    case 'dropOut': return `Goal-line drop-out, ${team}.`;
  }
}

/** The kicks a viewer timeline shows (penalty options are frequent — they stay
 *  in the commentary and the sheet). */
export const restartOnTimeline = (kind: RestartKind | undefined): boolean => kind === 'fiftyTwentyTwo' || kind === 'fortyTwenty' || kind === 'twentyForty';

/** Timeline row words. */
export const restartRow = (kind: RestartKind): { icon: string; label: string } =>
  ({ icon: kind === 'dropOut' ? '↩' : kind.startsWith('pen') ? '⚖' : '🦵', label: RESTART_LABEL[kind] });
