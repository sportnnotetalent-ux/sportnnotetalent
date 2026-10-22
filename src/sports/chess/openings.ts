/**
 * Deep wave — the opening a game began with, as the Encyclopaedia of Chess
 * Openings (ECO, A00–E99) names it: the longest line in this table that the
 * game's first moves follow. A compact table of the main openings and their
 * best-known variations (names as chess.com / lichess show them) — not the
 * full ECO tree; move-order transpositions aren't detected. PURE.
 */
export interface OpeningLine { eco: string; name: string; moves: string }

export const OPENINGS: OpeningLine[] = [
  // ---------------------------------------------------------------- flank / irregular
  { eco: 'A00', name: 'Polish Opening', moves: 'b4' },
  { eco: 'A00', name: 'Grob Opening', moves: 'g4' },
  { eco: 'A00', name: 'Van Geet Opening', moves: 'Nc3' },
  { eco: 'A00', name: 'Hungarian Opening', moves: 'g3' },
  { eco: 'A01', name: 'Nimzo-Larsen Attack', moves: 'b3' },
  { eco: 'A02', name: 'Bird Opening', moves: 'f4' },
  { eco: 'A04', name: 'Zukertort Opening', moves: 'Nf3' },
  { eco: 'A07', name: "King's Indian Attack", moves: 'Nf3 d5 g3' },
  { eco: 'A09', name: 'Réti Opening', moves: 'Nf3 d5 c4' },
  { eco: 'A10', name: 'English Opening', moves: 'c4' },
  { eco: 'A15', name: 'English Opening: Anglo-Indian Defense', moves: 'c4 Nf6' },
  { eco: 'A20', name: "English Opening: King's English Variation", moves: 'c4 e5' },
  { eco: 'A30', name: 'English Opening: Symmetrical Variation', moves: 'c4 c5' },
  // ---------------------------------------------------------------- 1.d4 without 1...d5
  { eco: 'A40', name: "Queen's Pawn Game", moves: 'd4' },
  { eco: 'A43', name: 'Old Benoni Defense', moves: 'd4 c5' },
  { eco: 'A45', name: 'Indian Defense', moves: 'd4 Nf6' },
  { eco: 'A45', name: 'Trompowsky Attack', moves: 'd4 Nf6 Bg5' },
  { eco: 'A46', name: 'Indian Defense: Knights Variation', moves: 'd4 Nf6 Nf3' },
  { eco: 'A48', name: 'Indian Defense: London System', moves: 'd4 Nf6 Nf3 g6 Bf4' },
  { eco: 'A50', name: 'Indian Defense: Normal Variation', moves: 'd4 Nf6 c4' },
  { eco: 'A56', name: 'Benoni Defense', moves: 'd4 Nf6 c4 c5' },
  { eco: 'A57', name: 'Benko Gambit', moves: 'd4 Nf6 c4 c5 d5 b5' },
  { eco: 'A60', name: 'Benoni Defense: Modern Variation', moves: 'd4 Nf6 c4 c5 d5 e6' },
  { eco: 'A80', name: 'Dutch Defense', moves: 'd4 f5' },
  // ---------------------------------------------------------------- 1.e4, semi-open
  { eco: 'B00', name: "King's Pawn Game", moves: 'e4' },
  { eco: 'B00', name: 'Nimzowitsch Defense', moves: 'e4 Nc6' },
  { eco: 'B00', name: 'Owen Defense', moves: 'e4 b6' },
  { eco: 'B01', name: 'Scandinavian Defense', moves: 'e4 d5' },
  { eco: 'B02', name: 'Alekhine Defense', moves: 'e4 Nf6' },
  { eco: 'B06', name: 'Modern Defense', moves: 'e4 g6' },
  { eco: 'B07', name: 'Pirc Defense', moves: 'e4 d6 d4 Nf6' },
  { eco: 'B10', name: 'Caro-Kann Defense', moves: 'e4 c6' },
  { eco: 'B12', name: 'Caro-Kann Defense: Advance Variation', moves: 'e4 c6 d4 d5 e5' },
  { eco: 'B13', name: 'Caro-Kann Defense: Exchange Variation', moves: 'e4 c6 d4 d5 exd5' },
  { eco: 'B15', name: 'Caro-Kann Defense', moves: 'e4 c6 d4 d5 Nc3' },
  { eco: 'B18', name: 'Caro-Kann Defense: Classical Variation', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5' },
  { eco: 'B20', name: 'Sicilian Defense', moves: 'e4 c5' },
  { eco: 'B21', name: 'Sicilian Defense: Smith-Morra Gambit', moves: 'e4 c5 d4 cxd4 c3' },
  { eco: 'B22', name: 'Sicilian Defense: Alapin Variation', moves: 'e4 c5 c3' },
  { eco: 'B23', name: 'Sicilian Defense: Closed', moves: 'e4 c5 Nc3' },
  { eco: 'B27', name: 'Sicilian Defense', moves: 'e4 c5 Nf3' },
  { eco: 'B30', name: 'Sicilian Defense: Old Sicilian', moves: 'e4 c5 Nf3 Nc6' },
  { eco: 'B32', name: 'Sicilian Defense: Open', moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4' },
  { eco: 'B33', name: 'Sicilian Defense: Sveshnikov Variation', moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5' },
  { eco: 'B40', name: 'Sicilian Defense: French Variation', moves: 'e4 c5 Nf3 e6' },
  { eco: 'B50', name: 'Sicilian Defense: Modern Variations', moves: 'e4 c5 Nf3 d6' },
  { eco: 'B54', name: 'Sicilian Defense: Open', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4' },
  { eco: 'B56', name: 'Sicilian Defense: Classical Variation', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6' },
  { eco: 'B70', name: 'Sicilian Defense: Dragon Variation', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6' },
  { eco: 'B80', name: 'Sicilian Defense: Scheveningen Variation', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6' },
  { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6' },
  // ---------------------------------------------------------------- French
  { eco: 'C00', name: 'French Defense', moves: 'e4 e6' },
  { eco: 'C01', name: 'French Defense: Exchange Variation', moves: 'e4 e6 d4 d5 exd5' },
  { eco: 'C02', name: 'French Defense: Advance Variation', moves: 'e4 e6 d4 d5 e5' },
  { eco: 'C03', name: 'French Defense: Tarrasch Variation', moves: 'e4 e6 d4 d5 Nd2' },
  { eco: 'C10', name: 'French Defense', moves: 'e4 e6 d4 d5 Nc3' },
  { eco: 'C11', name: 'French Defense: Classical Variation', moves: 'e4 e6 d4 d5 Nc3 Nf6' },
  { eco: 'C15', name: 'French Defense: Winawer Variation', moves: 'e4 e6 d4 d5 Nc3 Bb4' },
  // ---------------------------------------------------------------- 1.e4 e5
  { eco: 'C20', name: "King's Pawn Game", moves: 'e4 e5' },
  { eco: 'C21', name: 'Center Game', moves: 'e4 e5 d4 exd4' },
  { eco: 'C23', name: "Bishop's Opening", moves: 'e4 e5 Bc4' },
  { eco: 'C25', name: 'Vienna Game', moves: 'e4 e5 Nc3' },
  { eco: 'C30', name: "King's Gambit", moves: 'e4 e5 f4' },
  { eco: 'C33', name: "King's Gambit Accepted", moves: 'e4 e5 f4 exf4' },
  { eco: 'C40', name: "King's Knight Opening", moves: 'e4 e5 Nf3' },
  { eco: 'C41', name: 'Philidor Defense', moves: 'e4 e5 Nf3 d6' },
  { eco: 'C42', name: 'Petrov Defense', moves: 'e4 e5 Nf3 Nf6' },
  { eco: 'C44', name: "King's Pawn Game: Open Game", moves: 'e4 e5 Nf3 Nc6' },
  { eco: 'C44', name: 'Ponziani Opening', moves: 'e4 e5 Nf3 Nc6 c3' },
  { eco: 'C44', name: 'Scotch Game', moves: 'e4 e5 Nf3 Nc6 d4' },
  { eco: 'C45', name: 'Scotch Game', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4' },
  { eco: 'C46', name: 'Three Knights Opening', moves: 'e4 e5 Nf3 Nc6 Nc3' },
  { eco: 'C47', name: 'Four Knights Game', moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6' },
  { eco: 'C50', name: 'Italian Game', moves: 'e4 e5 Nf3 Nc6 Bc4' },
  { eco: 'C50', name: 'Italian Game: Giuoco Piano', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5' },
  { eco: 'C51', name: 'Italian Game: Evans Gambit', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4' },
  { eco: 'C53', name: 'Italian Game: Classical Variation', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3' },
  { eco: 'C55', name: 'Italian Game: Two Knights Defense', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6' },
  { eco: 'C57', name: 'Italian Game: Two Knights Defense, Knight Attack', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5' },
  { eco: 'C60', name: 'Ruy Lopez', moves: 'e4 e5 Nf3 Nc6 Bb5' },
  { eco: 'C65', name: 'Ruy Lopez: Berlin Defense', moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6' },
  { eco: 'C68', name: 'Ruy Lopez: Exchange Variation', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6' },
  { eco: 'C70', name: 'Ruy Lopez: Morphy Defense', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4' },
  { eco: 'C78', name: 'Ruy Lopez: Morphy Defense', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O' },
  { eco: 'C80', name: 'Ruy Lopez: Open Variation', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4' },
  { eco: 'C84', name: 'Ruy Lopez: Closed Variation', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7' },
  // ---------------------------------------------------------------- 1.d4 d5
  { eco: 'D00', name: "Queen's Pawn Game", moves: 'd4 d5' },
  { eco: 'D00', name: "Queen's Pawn Game: Accelerated London System", moves: 'd4 d5 Bf4' },
  { eco: 'D02', name: "Queen's Pawn Game: London System", moves: 'd4 d5 Nf3 Nf6 Bf4' },
  { eco: 'D06', name: "Queen's Gambit", moves: 'd4 d5 c4' },
  { eco: 'D07', name: "Queen's Gambit Declined: Chigorin Defense", moves: 'd4 d5 c4 Nc6' },
  { eco: 'D08', name: "Queen's Gambit Declined: Albin Countergambit", moves: 'd4 d5 c4 e5' },
  { eco: 'D10', name: 'Slav Defense', moves: 'd4 d5 c4 c6' },
  { eco: 'D20', name: "Queen's Gambit Accepted", moves: 'd4 d5 c4 dxc4' },
  { eco: 'D30', name: "Queen's Gambit Declined", moves: 'd4 d5 c4 e6' },
  { eco: 'D35', name: "Queen's Gambit Declined: Exchange Variation", moves: 'd4 d5 c4 e6 Nc3 Nf6 cxd5' },
  { eco: 'D43', name: 'Semi-Slav Defense', moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6' },
  { eco: 'D80', name: 'Grünfeld Defense', moves: 'd4 Nf6 c4 g6 Nc3 d5' },
  { eco: 'D85', name: 'Grünfeld Defense: Exchange Variation', moves: 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5' },
  // ---------------------------------------------------------------- Indian defences
  { eco: 'E00', name: 'Indian Defense', moves: 'd4 Nf6 c4 e6' },
  { eco: 'E00', name: 'Catalan Opening', moves: 'd4 Nf6 c4 e6 g3' },
  { eco: 'E10', name: 'Indian Defense', moves: 'd4 Nf6 c4 e6 Nf3' },
  { eco: 'E11', name: 'Bogo-Indian Defense', moves: 'd4 Nf6 c4 e6 Nf3 Bb4' },
  { eco: 'E12', name: "Queen's Indian Defense", moves: 'd4 Nf6 c4 e6 Nf3 b6' },
  { eco: 'E20', name: 'Nimzo-Indian Defense', moves: 'd4 Nf6 c4 e6 Nc3 Bb4' },
  { eco: 'E60', name: "King's Indian Defense", moves: 'd4 Nf6 c4 g6' },
  { eco: 'E61', name: "King's Indian Defense", moves: 'd4 Nf6 c4 g6 Nc3 Bg7' },
  { eco: 'E70', name: "King's Indian Defense: Normal Variation", moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4' },
  { eco: 'E90', name: "King's Indian Defense: Normal Variation", moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3' },
];

const bare = (san: string) => san.replace(/[+#!?]+$/g, '');
const LINES = OPENINGS.map((o) => ({ ...o, seq: o.moves.split(' ') }));

/** The opening the moves follow (the longest matching line), or null. */
export function detectOpening(san: string[]): { eco: string; name: string; plies: number } | null {
  let best: (typeof LINES)[number] | null = null;
  for (const o of LINES) {
    if (o.seq.length > san.length) continue;
    if (o.seq.every((m, i) => bare(san[i]) === m) && (!best || o.seq.length > best.seq.length)) best = o;
  }
  return best ? { eco: best.eco, name: best.name, plies: best.seq.length } : null;
}

/** A valid ECO code "A00".."E99", upper-cased; null otherwise. */
export function ecoCode(v: unknown): string | null {
  const s = String(v ?? '').trim().toUpperCase();
  return /^[A-E]\d\d$/.test(s) ? s : null;
}

/** The ECO volume's name (A flank openings … E Indian defences). */
export const ECO_VOLUME: Record<string, string> = {
  A: 'Flank openings', B: 'Semi-open games', C: 'Open games and the French', D: "Closed games (Queen's Gambit)", E: 'Indian defences',
};

/** A name for a typed ECO code: the table's first opening with that code. */
export const nameForEco = (eco: string): string | null => OPENINGS.find((o) => o.eco === eco)?.name ?? null;
