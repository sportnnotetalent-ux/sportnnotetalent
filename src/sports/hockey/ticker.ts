/**
 * SD-101 — hockey's score-ticker cells and goal flash (parity #25). PURE.
 */
import { clockFace, minuteText, periodName, soScore, type HockeyEvent, type HockeyState, type Side } from './engine.ts';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';
import { legacyNameOf, withNames, type NameOf } from '../invasion/names.ts';

const TYPE_MARK: Record<string, string> = { pc: ' (PC)', stroke: ' (PS)', field: '' };

/** "Asha R. 12', 40' (PC) · Team 55'" — a side's goals, scorer by scorer. */
export function hockeyScorers(s: HockeyState, side: Side): string | undefined {
  const by = new Map<string, { who: string; mins: string[] }>();
  for (const e of s.events) {
    if (e.type !== 'goal' || e.side !== side) continue;
    const who = shortName(e.playerName) || 'Goal';
    const k = e.playerId ? `id:${e.playerId}` : who; // by id (a shown name may repeat)
    const g = by.get(k) ?? { who, mins: [] };
    g.mins.push(`${minuteText(e.sec)}${TYPE_MARK[e.goalType ?? 'field']}`);
    by.set(k, g);
  }
  if (!by.size) return undefined;
  return [...by.values()].map((g) => `${g.who} ${g.mins.join(', ')}`).join(' · ');
}

/** IDs-only scoring: `names.player` names the players by id for this viewer. */
export function hockeyTickerDetail(s0: HockeyState, names: { home: string; away: string; player?: NameOf }): TickerDetail {
  const s = withNames(s0, names.player ?? legacyNameOf);
  const d: TickerDetail = {};
  const h = hockeyScorers(s, 'home');
  const a = hockeyScorers(s, 'away');
  if (h) d.left = [`🏑 ${h}`];
  if (a) d.right = [`🏑 ${a}`];
  if (s.shootoutWinner) {
    const p = soScore(s);
    d.status = `${names[s.shootoutWinner]} win ${p.home}–${p.away} in the shoot-out`;
  } else if (s.shootout) {
    const p = soScore(s);
    d.status = `Shoot-out ${p.home}–${p.away}`;
  } else if (!s.ended) {
    d.detail = `${periodName(s, s.period)} · ${clockFace(s, Date.now())}`;
  }
  return d;
}

/** A new goal → "GOAL! Asha R. 34'" (PC / stroke as the second line). */
export function hockeyTickerFlash(prev: HockeyState, next0: HockeyState, nameOf: NameOf = legacyNameOf): TickerFlash | null {
  const next = withNames(next0, nameOf); // IDs-only scoring: names by id
  const last: HockeyEvent | undefined = next.events[next.events.length - 1];
  if (!last || last.type !== 'goal' || prev.events.some((e) => e.id === last.id)) return null;
  const who = shortName(last.playerName);
  return {
    kind: 'goal',
    text: `GOAL!${who ? ` ${who}` : ''} ${minuteText(last.sec)}`,
    ...(last.goalType === 'pc' ? { sub: 'Penalty corner' } : last.goalType === 'stroke' ? { sub: 'Penalty stroke' } : {}),
    side: last.side,
  };
}
