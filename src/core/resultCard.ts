/**
 * Share a match as a picture (MVP, founder 2026-10-31): what the score card
 * says. Pure, so it's tested in node (tests/result-card.test.mts); the web
 * draws it in src/core/resultCardImage.ts.
 */

import { publicName } from './playerNames.ts';

export const CARD_NAME_MAX = 24;

/** Growth plan #4 — Player of the match for a PUBLIC card / message: an adult
 *  by name, a possible minor (under 18, or age unknown, or not on the rosters)
 *  by initials, as players_view shows them publicly; a player under an open
 *  dispute not at all. Undefined when there's no one to name. */
export function cardStar(
  potm: { id?: string; name: string } | undefined,
  players: ReadonlyArray<{ id: string; fullName: string; age?: number }>,
  disputedIds: ReadonlySet<string>,
): string | undefined {
  if (!potm || !potm.name.trim()) return undefined;
  if (potm.id && disputedIds.has(potm.id)) return undefined;
  const p = potm.id ? players.find((x) => x.id === potm.id) : undefined;
  return publicName({ fullName: p?.fullName ?? potm.name, age: p?.age });
}

export interface CardInput {
  sportName: string;
  status: 'live' | 'final' | 'upcoming';
  home: string;
  away: string;
  homeScore?: string;
  awayScore?: string;
  statusLine?: string;
  winner?: 'home' | 'away' | 'draw';
  resultLine?: string;
  tournamentName?: string;
  venue?: string;
  when?: string;
  /** Player of the match, already public-safe (cardStar); results only */
  star?: string;
}

export interface CardModel {
  badge: 'LIVE' | 'RESULT' | 'UPCOMING';
  sport: string;
  home: string;
  away: string;
  homeScore: string;
  awayScore: string;
  line: string;
  where: string;
  /** "Player of the match: …" on a result, else '' */
  star: string;
  footer: string;
}

const short = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

export function cardModel(i: CardInput): CardModel {
  const home = short(i.home || 'Home', CARD_NAME_MAX);
  const away = short(i.away || 'Away', CARD_NAME_MAX);
  const final = i.status === 'final';
  const line = final
    ? i.resultLine || (i.winner === 'draw' ? 'Drawn' : i.winner === 'home' ? `${home} won` : i.winner === 'away' ? `${away} won` : i.statusLine || 'Full time')
    : i.status === 'live' ? i.statusLine || 'Live' : i.when || '';
  return {
    badge: final ? 'RESULT' : i.status === 'live' ? 'LIVE' : 'UPCOMING',
    sport: short(i.sportName, 30).toUpperCase(),
    home, away,
    homeScore: i.status === 'upcoming' ? '' : (i.homeScore ?? '').trim(),
    awayScore: i.status === 'upcoming' ? '' : (i.awayScore ?? '').trim(),
    line: short(line, 48),
    where: short([i.tournamentName, i.venue].filter(Boolean).join(' · '), 56),
    star: final && i.star?.trim() ? short(`Player of the match: ${i.star.trim()}`, 48) : '',
    footer: 'sportnnote.in',
  };
}
