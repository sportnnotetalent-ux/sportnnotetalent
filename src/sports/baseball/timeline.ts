/** SD-144 — baseball plays as timeline rows (the shared LiveTimeline) and the
 *  scorer's correction list. PURE. */
import type { LiveEvent } from '../liveEvents';
import {
  BATTED_BALL_LABEL, OUTCOME_LABEL, RUNNER_LABEL, halfShort, inningOf, isTop,
  type BaseballEvent, type BaseballState, type Move, type Outcome, type RunnerKind,
} from './engine.ts';
import { withNames } from './names.ts';
import { legacyNameOf, type NameOf } from '../../core/playerNames.ts';

const ICON: Partial<Record<Outcome, string>> = { '1B': '⚾', '2B': '⚾', '3B': '⚾', HR: '💥', BB: '🚶', IBB: '🚶', HBP: '🤕', K: 'K', E: '⚠️', DP: '✌️' };
const PITCH_LABEL = { ball: 'Ball', called: 'Called strike', swinging: 'Swinging strike', foul: 'Foul', inplay: 'In play', hbp: 'Hit by pitch' } as const;
const BASE = ['home', '1st', '2nd', '3rd'];

/** "Rao to 3rd", "Khan scores", "Iyer out" */
export function moveText(m: Move): string {
  const who = m.name ?? (m.from === 0 ? 'Batter' : `Runner on ${BASE[m.from]}`);
  if (m.to === 4) return `${who} scores`;
  if (m.to === -1) return `${who} out`;
  return `${who} to ${BASE[m.to]}`;
}

/** One row's icon + words ("💥 Home run · Rao · 2 RBI"). */
export function describeEvent(e: BaseballEvent): { icon: string; label: string; detail?: string } {
  switch (e.type) {
    case 'pitch':
      return { icon: '·', label: PITCH_LABEL[e.pitch ?? 'ball'] };
    case 'pa': {
      const o = e.outcome ?? 'GO';
      const k = o === 'K' ? (e.pitch === 'called' ? 'Strikeout looking' : e.pitch === 'foul' ? 'Strikeout (foul, 2 strikes)' : 'Strikeout swinging') : OUTCOME_LABEL[o];
      const runners = (e.moves ?? []).filter((m) => m.from !== 0 && (m.to === 4 || m.to === -1 || m.to !== m.from)).map(moveText);
      const detail = [
        e.batter?.name,
        e.fielders ? `(${e.fielders})` : '',
        e.zone ? `→ ${e.zone}` : '',
        // round 2: the tapped batted-ball type ("line drive")
        e.btype ? BATTED_BALL_LABEL[e.btype].toLowerCase() : '',
        e.rbi ? `${e.rbi} RBI` : '',
        ...runners,
      ].filter(Boolean).join(' · ');
      return { icon: ICON[o] ?? '⚾', label: k, ...(detail ? { detail } : {}) };
    }
    case 'runner': {
      const k = (e.kind ?? 'ADV') as RunnerKind;
      const detail = (e.moves ?? []).map(moveText).join(' · ');
      return { icon: k === 'SB' ? '💨' : k === 'CS' || k === 'PO' || k === 'OUT' ? '✋' : '↗', label: RUNNER_LABEL[k], ...(detail ? { detail } : {}) };
    }
    case 'sub': {
      const what = e.kind === 'p' ? 'Pitching change' : e.kind === 'ph' ? 'Pinch hitter' : e.kind === 'pr' ? 'Pinch runner' : `Defensive change${e.pos ? ` · ${e.pos}` : ''}`;
      return { icon: '🔁', label: what, detail: `${e.on?.name ?? '?'}${e.off?.name ? ` for ${e.off.name}` : ''}` };
    }
    case 'eject':
      return { icon: '🟥', label: 'Ejected', detail: e.official ? `${e.official} (official)` : e.on?.name };
    case 'er':
      return { icon: '✎', label: e.earned ? 'Runs marked earned' : 'Runs marked unearned', detail: 'by the scorer' };
  }
}

/** "▲ 3rd · 1 out" — when an event happened. */
export function eventWhen(s: BaseballState, e: BaseballEvent): string {
  const a = s.g.ann[e.id];
  if (!a) return '';
  return `${halfShort(a.half)} · ${a.outs} out`;
}

/** The scorer's correction rows (pitches included), newest last. */
export const timelineEvents = (s: BaseballState): BaseballEvent[] => s.events.filter((e) => e.type !== 'er');

/** The viewer timeline: plate appearances, runner plays, changes. IDs-only
 *  scoring: players named by id for this viewer (`nameOf`, names.ts). */
export function baseballTimeline(state: BaseballState, nameOf: NameOf = legacyNameOf): LiveEvent[] {
  const s = withNames(state, nameOf);
  const rows: LiveEvent[] = [];
  s.events.forEach((e, i) => {
    if (e.type === 'pitch' || e.type === 'er') return;
    const a = s.g.ann[e.id];
    if (!a || a.ignored) return;
    const d = describeEvent(e);
    const who = e.type === 'pa' ? e.batter : e.type === 'sub' || e.type === 'eject' ? e.on : e.moves?.[0];
    const name = who?.name;
    rows.push({
      id: i,
      stamp: halfShort(a.half),
      icon: d.icon,
      label: a.runs > 0 ? `${d.label} · ${a.runs} run${a.runs === 1 ? '' : 's'}` : d.label,
      ...(d.detail ? { detail: d.detail } : {}),
      ...(e.side ? { side: e.side } : {}),
      kind: e.type,
      ...(who?.id ? { playerId: who.id } : {}),
      ...(name ? { playerName: name } : {}),
      half: inningOf(a.half),
      ...(e.type === 'pa' && e.outcome === 'HR' ? { tone: 'boundary' as const }
        : a.runs > 0 ? { tone: 'boundary' as const }
        : e.type === 'eject' ? { tone: 'wicket' as const } : {}),
    });
  });
  return rows;
}

/** "Top 3rd: 2 runs, 3 hits" lines (unused halves skipped) — for the summary. */
export function halfSummary(s: BaseballState, half: number): string {
  const runs = s.g.line[half] ?? 0;
  return `${isTop(half) ? 'Top' : 'Bottom'} ${inningOf(half)}: ${runs} run${runs === 1 ? '' : 's'}`;
}
