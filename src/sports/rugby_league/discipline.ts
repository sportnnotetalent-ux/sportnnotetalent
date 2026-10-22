/**
 * Rugby league sanctions for the tournament discipline table and suspension
 * rule (src/sports/discipline.ts). IRL Laws: the referee may sin-bin a player
 * (10 minutes, served in the match), send him off (the team plays short for
 * the rest of the match), or place him on report — a send-off and a report
 * both go to the competition's judiciary, which sets any ban case by case
 * (NRL Judiciary / RFL Match Review Panel). The defaults are placeholders the
 * organiser edits: a send-off = 1 match out until the judiciary says
 * otherwise; on report = no automatic ban; sin bins don't add up (set a count
 * here if your competition does). Verify against your competition's rules.
 */
import type { SportDisciplineSpec, CardMark } from '../discipline';
import type { LeagueEvent } from './engine';

export const RUGBY_LEAGUE_DISCIPLINE: SportDisciplineSpec = {
  sport: 'rugby_league',
  columns: [
    { key: 'sinBin', icon: '⏱', label: 'Sin bins' },
    { key: 'report', icon: '📝', label: 'Placed on report' },
    { key: 'sendOff', icon: '🟥', label: 'Send-offs' },
  ],
  sendOffs: [
    { key: 'banSendOff', ask: 'A send-off means', reason: 'send-off', def: 1 },
  ],
  caution: { col: 'sinBin', plural: 'sin bins', def: 0 },
  source: 'IRL Laws: sin bins are served in the match; a send-off or a report goes to the judiciary',
  marks(m) {
    const ev = (m.state as { events?: unknown } | null | undefined)?.events;
    if (!Array.isArray(ev)) return [];
    const out: CardMark[] = [];
    for (const e of ev as LeagueEvent[]) {
      if (e?.type !== 'sanction' || (e.side !== 'home' && e.side !== 'away')) continue;
      const who = { ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.playerName ? { playerName: e.playerName } : {}) };
      if (e.sanction === 'sinBin') out.push({ side: e.side, ...who, col: 'sinBin', caution: true });
      else if (e.sanction === 'report') out.push({ side: e.side, ...who, col: 'report' });
      else out.push({ side: e.side, ...who, col: 'sendOff', off: 'banSendOff' });
    }
    return out;
  },
};
