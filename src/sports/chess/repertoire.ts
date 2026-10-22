/**
 * Round 2 — a player's opening repertoire (chess.com / lichess "Openings"
 * report): their record by opening family, as White and as Black. PURE
 * (tests/chess-round2.test.mts).
 *
 * Read from the games themselves (each match's state replays from its event
 * log): the opening is the one named by hand / a PGN tag, else the longest
 * ECO line the moves follow (`openingOf`). A game with neither isn't in the
 * repertoire (never guessed); forfeits are no game. A knockout match gives
 * one entry per game that has an opening, with that game's colours.
 *
 * Family = the opening's name before the variation ("Sicilian Defense:
 * Najdorf Variation" → "Sicilian Defense"); a typed ECO code the table
 * doesn't name falls back to its ECO volume ("B — Semi-open games").
 */
import { isDoubleForfeit, isForfeit, openingOf, type ChessState, type Side } from './engine.ts';
import { ECO_VOLUME } from './openings.ts';

export interface RepGame {
  colour: 'white' | 'black';
  eco: string;
  name: string;
  /** 1 / ½ / 0 for the player */
  score: number;
}

/** The player's games in one match (their `side`), with an opening. */
export function repertoireGames(s: ChessState | null | undefined, side: Side): RepGame[] {
  if (!s || typeof s !== 'object') return [];
  const pts = (winner: Side | 'draw' | undefined) => (winner === 'draw' ? 0.5 : winner === side ? 1 : 0);
  if (s.ko) {
    return s.ko.games.flatMap((g) => {
      if (isForfeit(g.method) || isDoubleForfeit(g.method)) return [];
      const op = openingOf({ game: g.game, opening: g.opening });
      return op ? [{ colour: g.white === side ? 'white' as const : 'black' as const, eco: op.eco, name: op.name, score: pts(g.winner) }] : [];
    });
  }
  if (!s.ended || !s.winner || isForfeit(s.method) || isDoubleForfeit(s.method)) return [];
  const op = openingOf(s);
  return op ? [{ colour: s.white === side ? 'white' : 'black', eco: op.eco, name: op.name, score: pts(s.winner) }] : [];
}

/** "Sicilian Defense: Najdorf Variation" → "Sicilian Defense"; an unnamed
 *  code → its ECO volume. */
export function openingFamily(eco: string, name: string): string {
  if (!name || /^ECO [A-E]\d\d$/.test(name)) return `${eco[0]} — ${ECO_VOLUME[eco[0]] ?? 'Other'}`;
  return name.split(':')[0].trim();
}

export interface RepLine { eco: string; name: string; games: number; wins: number; draws: number; losses: number; score: number }
export interface RepFamily extends RepLine {
  /** "B20–B99" (the codes seen), or one code */
  ecoRange: string;
  /** score % (points ÷ games) */
  pct: number;
  /** the openings inside the family, most played first */
  lines: RepLine[];
}
export interface Repertoire { white: RepFamily[]; black: RepFamily[]; games: number }

const tally = (gs: RepGame[]): Omit<RepLine, 'eco' | 'name'> => ({
  games: gs.length,
  wins: gs.filter((g) => g.score === 1).length,
  draws: gs.filter((g) => g.score === 0.5).length,
  losses: gs.filter((g) => g.score === 0).length,
  score: gs.reduce((t, g) => t + g.score, 0),
});

/** The repertoire: per colour, the families most played first (then the
 *  better score, then by name), each with its openings. */
export function repertoire(games: RepGame[]): Repertoire {
  const side = (colour: 'white' | 'black'): RepFamily[] => {
    const mine = games.filter((g) => g.colour === colour);
    const fams = new Map<string, RepGame[]>();
    for (const g of mine) {
      const f = openingFamily(g.eco, g.name);
      fams.set(f, [...(fams.get(f) ?? []), g]);
    }
    return [...fams.entries()].map(([family, gs]) => {
      const codes = [...new Set(gs.map((g) => g.eco))].sort();
      const byLine = new Map<string, RepGame[]>();
      for (const g of gs) { const k = `${g.eco}|${g.name}`; byLine.set(k, [...(byLine.get(k) ?? []), g]); }
      const lines = [...byLine.entries()]
        .map(([k, xs]) => ({ eco: k.split('|')[0], name: k.slice(k.indexOf('|') + 1), ...tally(xs) }))
        .sort((a, b) => b.games - a.games || b.score - a.score || a.eco.localeCompare(b.eco) || a.name.localeCompare(b.name));
      const t = tally(gs);
      return {
        eco: codes[0], name: family, ...t,
        ecoRange: codes.length > 1 ? `${codes[0]}–${codes[codes.length - 1]}` : codes[0],
        pct: t.games ? Math.round((t.score / t.games) * 100) : 0,
        lines,
      };
    }).sort((a, b) => b.games - a.games || b.score - a.score || a.name.localeCompare(b.name));
  };
  return { white: side('white'), black: side('black'), games: games.length };
}

/** "3W 1D 1L" (the record), "½" halves in a score. */
export const recordText = (r: Pick<RepLine, 'wins' | 'draws' | 'losses'>): string => `${r.wins}W ${r.draws}D ${r.losses}L`;
export const halfText = (n: number): string => String(n).replace('.5', '½').replace(/^0½$/, '½');
