/**
 * "Your stats from today's game" (growth plan #5;
 * docs/security/breaks/player-stats-links.md). Pure. At full time:
 *  - a push to each player with an account (not the scorer) whose line has
 *    something to say;
 *  - for players added by mobile number (no account), a ready WhatsApp message
 *    the scorer sends from their own phone. A player known to be under 18 is
 *    reached through their guardian's number, or not at all.
 * A disputed player is left out of both. Numbers come only from the players
 * this viewer was allowed to read (players_view).
 */
import type { Player, SportId, StatLine } from './types';
import { sportSummary, type SportBreakdown } from '../data/stats.ts';
import { ageOf } from './age.ts';

export interface StatsMatch { matchId: string; sport: SportId; sportName: string; home: string; away: string; homeScore: string; awayScore: string }

const words = (sport: SportId, stats: Record<string, number>) => sportSummary({ sport, totals: stats } as SportBreakdown);
const score = (m: StatsMatch) => `${m.home} ${m.homeScore}–${m.awayScore} ${m.away}`;
const first = (name: string) => name.trim().split(/\s+/)[0] || 'there';

interface Lined { p: Player; said: string }
function said(m: StatsMatch, lines: StatLine[], players: Player[], disputed: ReadonlySet<string>): Lined[] {
  const out: Lined[] = [];
  for (const l of lines) {
    if (l.matchId !== m.matchId || disputed.has(l.playerId)) continue;
    const p = players.find((x) => x.id === l.playerId);
    const w = p ? words(m.sport, l.stats ?? {}) : '';
    if (p && w) out.push({ p, said: w });
  }
  return out;
}

export function statsPushes(m: StatsMatch, lines: StatLine[], players: Player[], o: { me?: string | null; disputed: ReadonlySet<string> }) {
  return said(m, lines, players, o.disputed)
    .filter(({ p }) => !!p.profileId && p.id !== o.me)
    .map(({ p, said: w }) => ({ playerId: p.id, title: 'Your stats from today’s game', body: `${w} · ${score(m)}`, matchId: m.matchId }));
}

export function statsWhatsApps(m: StatsMatch, lines: StatLine[], players: Player[], o: { disputed: ReadonlySet<string>; link: string }) {
  const sport = m.sportName.toLowerCase();
  const out: { playerId: string; name: string; phone: string; text: string }[] = [];
  for (const { p, said: w } of said(m, lines, players, o.disputed)) {
    if (p.profileId) continue;
    const age = ageOf(p);
    const minor = age !== undefined && age < 18;
    const phone = minor ? p.guardian?.phone : p.phone;
    if (!phone) continue;
    const hi = minor ? `Hi ${first(p.guardian?.name ?? '')}! ${first(p.fullName)}’s stats` : `Hi ${first(p.fullName)}! Your stats`;
    out.push({
      playerId: p.id, name: p.fullName, phone,
      text: `${hi} from today’s ${sport} game: ${w}.\n${score(m)}\n\nThe match: ${o.link}\n\nSign up on SportnNote with this number to keep your stats on your profile.`,
    });
  }
  return out;
}
