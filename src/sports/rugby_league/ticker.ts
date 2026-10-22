/**
 * Rugby league's score-ticker cells and try flash (parity #25). PURE.
 * The ticker lists each side's try scorers ("Rao 2 · Khan") and the live half.
 */
import { clockFace, minuteText, periodName, pointsOf, type LeagueEvent, type LeagueState, type Side } from './engine.ts';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';

/** "Asha R. 2 · Meera J. · PT" — a side's try scorers, most first (top 3). */
export function leagueTryScorers(s: LeagueState, side: Side, top = 3): string | undefined {
  const by = new Map<string, number>();
  for (const e of s.events) {
    if ((e.type !== 'try' && e.type !== 'pentry') || e.side !== side) continue;
    const who = e.type === 'pentry' ? 'PT' : shortName(e.playerName) || 'Team';
    by.set(who, (by.get(who) ?? 0) + 1);
  }
  if (!by.size) return undefined;
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, top).map(([who, n]) => (n > 1 ? `${who} ${n}` : who)).join(' · ');
}

export function leagueTickerDetail(s: LeagueState): TickerDetail {
  const d: TickerDetail = {};
  const h = leagueTryScorers(s, 'home');
  const a = leagueTryScorers(s, 'away');
  if (h) d.left = [`🏉 ${h}`];
  if (a) d.right = [`🏉 ${a}`];
  if (!s.ended) d.detail = `${periodName(s, s.period)} · ${clockFace(s, Date.now())}`;
  return d;
}

/** A new try → "TRY! Asha R. 23'"; a field goal that wins in golden point says so. */
export function leagueTickerFlash(prev: LeagueState, next: LeagueState): TickerFlash | null {
  const last: LeagueEvent | undefined = next.events[next.events.length - 1];
  if (!last || prev.events.some((e) => e.id === last.id)) return null;
  if (last.type === 'try' || last.type === 'pentry') {
    const who = last.type === 'pentry' ? 'Penalty try' : shortName(last.playerName);
    return { kind: 'goal', text: `TRY!${who ? ` ${who}` : ''} ${minuteText(next, last.period, last.psec)}`, sub: `${pointsOf(last)} points`, side: last.side };
  }
  if (last.type === 'kick' && last.kick === 'fg' && last.made) {
    const who = shortName(last.playerName);
    return { kind: 'goal', text: `FIELD GOAL!${who ? ` ${who}` : ''} ${minuteText(next, last.period, last.psec)}`, sub: last.two ? '2 points' : '1 point', side: last.side };
  }
  return null;
}
