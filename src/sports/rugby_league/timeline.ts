/** Rugby league events as timeline rows (the shared LiveTimeline), the
 *  scorer's correction list and the named Undo. PURE. */
import type { LiveEvent } from '../liveEvents';
import { minuteText, periodName, clockAt, pointsOf, DETAIL_LABEL, KICK_LABEL, type LeagueEvent, type LeagueState } from './engine.ts';
import { legacyNameOf, withNames, type NameOf } from '../invasion/names.ts';

/** One row's icon + words ("🏉 Try · Asha Rao · assist Meera"). */
export function describeEvent(e: LeagueEvent): { icon: string; label: string; detail?: string } {
  switch (e.type) {
    case 'try':
      return { icon: '🏉', label: e.bonus ? 'Try (bonus zone, 5)' : 'Try', detail: [e.playerName ?? 'Team try', e.secondName ? `assist ${e.secondName}` : ''].filter(Boolean).join(' · ') };
    case 'pentry':
      return { icon: '🏉', label: 'Penalty try (4)' };
    case 'kick': {
      if (e.kick === 'fg') return { icon: e.made ? '🦶' : '↗', label: `${e.two && e.made ? '2-point field goal' : KICK_LABEL.fg} ${e.made ? 'good' : 'missed'}`, detail: e.playerName };
      return { icon: e.made ? '🎯' : '↗', label: `${KICK_LABEL[e.kick ?? 'pen']} ${e.made ? 'good' : 'missed'}`, detail: e.playerName };
    }
    case 'sanction':
      return e.sanction === 'sinBin' ? { icon: '⏱', label: 'Sin bin', detail: e.playerName }
        : e.sanction === 'sendOff' ? { icon: '🟥', label: 'Sent off', detail: e.playerName }
        : { icon: '📝', label: 'Placed on report', detail: e.playerName };
    case 'sub': {
      const what = e.temp === 'hia' ? 'HIA interchange' : e.temp === 'blood' ? 'Blood bin interchange' : e.back ? 'Back on' : 'Interchange';
      return { icon: '🔁', label: what, detail: e.playerId || e.playerName ? `${e.secondName ?? '?'} ⬆  ${e.playerName ?? '?'} ⬇` : `${e.secondName ?? '?'} ⬆` };
    }
    case 'detail':
      return { icon: e.detail === 'penalty' ? '⚖' : e.detail === 'error' ? '✋' : '📋', label: DETAIL_LABEL[e.detail ?? 'tackle'], ...(e.playerName ? { detail: e.playerName } : {}) };
  }
}

/** The viewer timeline (LiveTimeline sorts by id: period, then playing time).
 *  Detail rows stay off it (they'd drown the scores) — they're in the
 *  commentary, the stats sheet and the box. */
export function leagueTimeline(s0: LeagueState, nameOf: NameOf = legacyNameOf): LiveEvent[] {
  const s = withNames(s0, nameOf);
  return s.events.map((e, i) => ({ e, i })).filter(({ e }) => e.type !== 'detail').map(({ e, i }) => {
    const d = describeEvent(e);
    const name = e.type === 'sub' ? e.secondName : e.playerName;
    return {
      id: e.period * 1e8 + e.psec * 1000 + i,
      stamp: minuteText(s, e.period, e.psec),
      icon: d.icon,
      label: d.label,
      ...(d.detail ? { detail: d.detail } : {}),
      side: e.side,
      kind: e.type,
      ...(name ? { playerName: name } : {}),
      minute: Math.ceil(e.sec / 60),
      half: e.period,
      ...(e.type === 'try' || e.type === 'pentry' ? { tone: 'boundary' as const } : e.type === 'sanction' && e.sanction === 'sendOff' ? { tone: 'wicket' as const } : {}),
    };
  });
}

/** "H2 · 63:20" — where a row sits, for the correction list. */
export const eventWhen = (s: LeagueState, e: LeagueEvent): string => `${periodName(s, e.period)} · ${clockAt(s, e.period, e.psec)}`;

/** SD-115 — what Undo removes: "Try · Asha Rao (10-6)", "Conversion good · Meera". */
export function leagueUndoLabel(step: { type: string; prev: unknown; next: unknown } | null | undefined, nameOf: NameOf = legacyNameOf): string | null {
  if (!step) return null;
  const prev = step.prev as LeagueState | null;
  // IDs-only scoring: the players by id, for this viewer
  const next = step.next ? withNames(step.next as LeagueState, nameOf) : null;
  if (step.type === 'CLOCK') return 'clock start / stop';
  if (step.type === 'SET_CLOCK') return 'clock set';
  if (step.type === 'END_PERIOD') return 'end of the period';
  if (step.type === 'XI') return 'line-up';
  if (step.type === 'TACKLE') return 'tackle';
  if (step.type === 'SET_BALL') return 'possession';
  if (step.type === 'SET_END' && (next?.events.length ?? 0) <= (prev?.events.length ?? 0)) return 'set ending';
  if (!prev?.events || !next?.events || next.events.length <= prev.events.length) return null;
  const e = next.events[next.events.length - 1];
  const d = describeEvent(e);
  const who = e.type === 'sub' ? e.secondName : e.playerName;
  const head = who ? `${d.label} · ${who}` : d.label;
  return pointsOf(e) ? `${head} (${next.home}-${next.away})` : head;
}
