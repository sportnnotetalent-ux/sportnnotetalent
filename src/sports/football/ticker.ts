/**
 * Football's score-ticker cells and flash (parity #25). Pure — reads the state.
 * The clock itself ticks in the overlay (the plugin's LiveClock).
 */
import { penScore, minuteText, type FootballState } from './engine.ts';
import type { FootballEvent } from './events';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';
import { legacyNameOf, nameRow, withNames, type NameOf } from '../invasion/names.ts';

const isGoal = (e: FootballEvent) => e.type === 'goal' || e.type === 'owngoal';

/** "Rahul S. 23', 67' · Dev K. 41' (OG)" — a side's goals, scorer by scorer
 *  (`s` = a named state; grouped by the scorer's id, else the shown name). */
function scorers(s: FootballState, side: 'home' | 'away'): string | undefined {
  const by = new Map<string, { who: string; mins: string[] }>();
  for (const e of s.events) {
    if (!isGoal(e) || e.side !== side) continue;
    const who = `${shortName(e.playerName) || 'Goal'}${e.type === 'owngoal' ? ' (OG)' : ''}`;
    const k = `${e.playerId ? `id:${e.playerId}` : who}${e.type === 'owngoal' ? ' og' : ''}`;
    const g = by.get(k) ?? { who, mins: [] };
    g.mins.push(minuteText(e.minute, e.half, s)); // "45+2'" (SD-08)
    by.set(k, g);
  }
  if (!by.size) return undefined;
  return [...by.values()].map((g) => `${g.who} ${g.mins.join(', ')}`).join(' · ');
}

/** IDs-only scoring: `names.player` names the scorers by id for this viewer. */
export function footballTickerDetail(s0: FootballState, names: { home: string; away: string; player?: NameOf }): TickerDetail {
  const s = withNames(s0, names.player ?? legacyNameOf);
  const d: TickerDetail = {};
  const h = scorers(s, 'home');
  const a = scorers(s, 'away');
  if (h) d.left = [`⚽ ${h}`];
  if (a) d.right = [`⚽ ${a}`];
  if (s.shootoutWinner) {
    const p = penScore(s);
    d.status = `${names[s.shootoutWinner]} win ${p.home}–${p.away} on pens`;
  }
  return d;
}

/** A new goal (or own goal) → "GOAL! Rahul S. 34'". */
export function footballTickerFlash(prev: FootballState, next: FootballState, nameOf: NameOf = legacyNameOf): TickerFlash | null {
  const raw = next.events[next.events.length - 1];
  if (!raw || !isGoal(raw) || prev.events.some((e) => e.id === raw.id)) return null;
  const last = nameRow(raw, nameOf);
  const who = shortName(last.playerName);
  return {
    kind: 'goal',
    text: `GOAL!${who ? ` ${who}` : ''} ${minuteText(last.minute, last.half, next)}`,
    ...(last.type === 'owngoal' ? { sub: 'Own goal' } : {}),
    side: last.side,
  };
}
