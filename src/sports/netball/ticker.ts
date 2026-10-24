/**
 * SD-146 — netball's score-ticker cells and goal flash (parity #25). PURE.
 * Netball has many goals, so the ticker lists the shooters with goals /
 * attempts ("Asha R. 18/20 · Meera J. 9/12"), not every goal.
 */
import { centreInfo, clockFace, periodName, type NetballEvent, type NetballState, type Side } from './engine.ts';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';
import { legacyNameOf, withNames, type NameOf } from '../invasion/names.ts';

/** "Asha R. 18/20 · Meera J. 9/12" — a side's shooters, most goals first. */
export function netballShooters(s: NetballState, side: Side, top = 2): string | undefined {
  const by = new Map<string, { who: string; g: number; a: number }>();
  for (const e of s.events) {
    if ((e.type !== 'goal' && e.type !== 'miss') || e.side !== side) continue;
    const who = shortName(e.playerName) || e.pos || 'Team';
    const k = e.playerId ? `id:${e.playerId}` : who; // by id (a shown name may repeat)
    const r = by.get(k) ?? { who, g: 0, a: 0 };
    r.a++; if (e.type === 'goal') r.g++;
    by.set(k, r);
  }
  if (!by.size) return undefined;
  return [...by.values()].sort((a, b) => b.g - a.g).slice(0, top).map((r) => `${r.who} ${r.g}/${r.a}`).join(' · ');
}

/** IDs-only scoring: `names.player` names the players by id for this viewer. */
export function netballTickerDetail(s0: NetballState, names: { home: string; away: string; player?: NameOf }): TickerDetail {
  const s = withNames(s0, names.player ?? legacyNameOf);
  const d: TickerDetail = {};
  const h = netballShooters(s, 'home');
  const a = netballShooters(s, 'away');
  if (h) d.left = [`🥅 ${h}`];
  if (a) d.right = [`🥅 ${a}`];
  if (!s.ended) {
    const c = centreInfo(s).now;
    d.detail = `${periodName(s, s.period)} · ${clockFace(s, Date.now())}${c ? ` · centre ${names[c]}` : ''}`;
  }
  return d;
}

/** A new goal → "GOAL! Asha R. (GS)". */
export function netballTickerFlash(prev: NetballState, next0: NetballState, nameOf: NameOf = legacyNameOf): TickerFlash | null {
  const next = withNames(next0, nameOf); // IDs-only scoring: names by id
  const last: NetballEvent | undefined = next.events[next.events.length - 1];
  if (!last || last.type !== 'goal' || !last.side || prev.events.some((e) => e.id === last.id)) return null;
  const who = shortName(last.playerName);
  // deep wave: a 2-point super shot flashes as one
  return { kind: 'goal', text: `${last.points === 2 ? 'SUPER SHOT!' : 'GOAL!'}${who ? ` ${who}` : ''}${last.pos ? ` (${last.pos})` : ''}`, sub: `${next.home}–${next.away}`, side: last.side };
}
