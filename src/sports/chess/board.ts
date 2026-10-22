/**
 * Deep wave — a compact chess board for the OPTIONAL move list (FIDE Laws,
 * Appendix C: algebraic notation). PURE and dependency-free (tests in
 * tests/chess-deep.test.mts).
 *
 * It replays moves to check them ("legal-move checked": each move must be a
 * legal move in the position — pins, check, castling through check, en
 * passant and promotion included) and to describe them in the commentary
 * (what was captured, check, mate, material). It is not an engine: no
 * evaluation, no search.
 *
 * Squares are 0..63: a1 = 0, h1 = 7, a8 = 56.
 */
export type Color = 'w' | 'b';
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K';
export interface Piece { c: Color; t: PieceType }
export interface Position {
  board: (Piece | null)[];
  turn: Color;
  /** a subset of "KQkq" ('' = none) */
  castling: string;
  /** the en-passant target square, or null */
  ep: number | null;
  halfmove: number;
  fullmove: number;
}
export interface Move {
  from: number;
  to: number;
  piece: PieceType;
  color: Color;
  captured?: PieceType;
  promotion?: PieceType;
  castle?: 'K' | 'Q';
  enPassant?: boolean;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
export const sqName = (i: number): string => `${FILES[i % 8]}${Math.floor(i / 8) + 1}`;
export function sqIndex(s: string): number {
  if (!/^[a-h][1-8]$/.test(s)) return -1;
  return (Number(s[1]) - 1) * 8 + FILES.indexOf(s[0]);
}
/** The standard piece values (pawn 1, knight 3, bishop 3, rook 5, queen 9). */
export const VALUE: Record<PieceType, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
export const PIECE_NAME: Record<PieceType, string> = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };

export function parseFen(fen: string): Position | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const rows = parts[0].split('/');
  if (rows.length !== 8) return null;
  const board: (Piece | null)[] = new Array(64).fill(null);
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) { f += Number(ch); continue; }
      const t = ch.toUpperCase();
      if (!'PNBRQK'.includes(t) || f > 7) return null;
      board[(7 - r) * 8 + f] = { c: ch === t ? 'w' : 'b', t: t as PieceType };
      f++;
    }
    if (f !== 8) return null;
  }
  const turn = parts[1] === 'b' ? 'b' : parts[1] === 'w' ? 'w' : null;
  if (!turn) return null;
  const castling = parts[2] && parts[2] !== '-' ? parts[2].replace(/[^KQkq]/g, '') : '';
  const ep = parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1;
  return { board, turn, castling, ep: ep >= 0 ? ep : null, halfmove: Number(parts[4]) || 0, fullmove: Number(parts[5]) || 1 };
}

export function toFen(p: Position): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', empty = 0;
    for (let f = 0; f < 8; f++) {
      const pc = p.board[r * 8 + f];
      if (!pc) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += pc.c === 'w' ? pc.t : pc.t.toLowerCase();
    }
    rows.push(row + (empty ? empty : ''));
  }
  return `${rows.join('/')} ${p.turn} ${p.castling || '-'} ${p.ep != null ? sqName(p.ep) : '-'} ${p.halfmove} ${p.fullmove}`;
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const onBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;

/** Is `sq` attacked by any piece of colour `by`? */
export function attacked(board: (Piece | null)[], sq: number, by: Color): boolean {
  const f = sq % 8, r = Math.floor(sq / 8);
  const get = (ff: number, rr: number) => (onBoard(ff, rr) ? board[rr * 8 + ff] : null);
  const pr = by === 'w' ? r - 1 : r + 1; // the rank a pawn of `by` attacks from
  for (const df of [-1, 1]) { const p = get(f + df, pr); if (p && p.c === by && p.t === 'P') return true; }
  for (const [df, dr] of KNIGHT) { const p = get(f + df, r + dr); if (p && p.c === by && p.t === 'N') return true; }
  for (const [df, dr] of KING) { const p = get(f + df, r + dr); if (p && p.c === by && p.t === 'K') return true; }
  const slide = (dirs: number[][], kinds: PieceType[]) => dirs.some(([df, dr]) => {
    let ff = f + df, rr = r + dr;
    while (onBoard(ff, rr)) {
      const p = board[rr * 8 + ff];
      if (p) return p.c === by && kinds.includes(p.t);
      ff += df; rr += dr;
    }
    return false;
  });
  return slide(ORTHO, ['R', 'Q']) || slide(DIAG, ['B', 'Q']);
}

export const kingSquare = (board: (Piece | null)[], c: Color): number => board.findIndex((p) => !!p && p.c === c && p.t === 'K');

/** Is `c` (default: the side to move) in check? */
export function inCheck(p: Position, c: Color = p.turn): boolean {
  const k = kingSquare(p.board, c);
  return k >= 0 && attacked(p.board, k, other(c));
}

function pseudoMoves(p: Position): Move[] {
  const out: Move[] = [];
  const me = p.turn;
  const b = p.board;
  for (let sq = 0; sq < 64; sq++) {
    const pc = b[sq];
    if (!pc || pc.c !== me) continue;
    const f = sq % 8, r = Math.floor(sq / 8);
    const add = (to: number, extra: Partial<Move> = {}) => {
      const cap = b[to];
      out.push({ from: sq, to, piece: pc.t, color: me, ...(cap ? { captured: cap.t } : {}), ...extra });
    };
    if (pc.t === 'P') {
      const dir = me === 'w' ? 1 : -1;
      const startRank = me === 'w' ? 1 : 6;
      const lastRank = me === 'w' ? 7 : 0;
      const pushPromo = (to: number, extra: Partial<Move> = {}) => {
        if (Math.floor(to / 8) === lastRank) for (const t of ['Q', 'R', 'B', 'N'] as PieceType[]) add(to, { ...extra, promotion: t });
        else add(to, extra);
      };
      const one = sq + dir * 8;
      if (onBoard(f, r + dir) && !b[one]) {
        pushPromo(one);
        const two = sq + dir * 16;
        if (r === startRank && !b[two]) add(two);
      }
      for (const df of [-1, 1]) {
        if (!onBoard(f + df, r + dir)) continue;
        const to = (r + dir) * 8 + f + df;
        const t = b[to];
        if (t && t.c !== me) pushPromo(to);
        else if (p.ep === to) out.push({ from: sq, to, piece: 'P', color: me, captured: 'P', enPassant: true });
      }
      continue;
    }
    if (pc.t === 'N' || pc.t === 'K') {
      for (const [df, dr] of pc.t === 'N' ? KNIGHT : KING) {
        if (!onBoard(f + df, r + dr)) continue;
        const to = (r + dr) * 8 + f + df;
        if (!b[to] || b[to]!.c !== me) add(to);
      }
      if (pc.t === 'K') {
        const home = me === 'w' ? 4 : 60;
        const opp = other(me);
        if (sq === home && !attacked(b, home, opp)) {
          const [kc, qc] = me === 'w' ? ['K', 'Q'] : ['k', 'q'];
          const rook = (s: number) => b[s] && b[s]!.c === me && b[s]!.t === 'R';
          if (p.castling.includes(kc) && !b[home + 1] && !b[home + 2] && rook(home + 3) && !attacked(b, home + 1, opp) && !attacked(b, home + 2, opp)) {
            out.push({ from: home, to: home + 2, piece: 'K', color: me, castle: 'K' });
          }
          if (p.castling.includes(qc) && !b[home - 1] && !b[home - 2] && !b[home - 3] && rook(home - 4) && !attacked(b, home - 1, opp) && !attacked(b, home - 2, opp)) {
            out.push({ from: home, to: home - 2, piece: 'K', color: me, castle: 'Q' });
          }
        }
      }
      continue;
    }
    const dirs = pc.t === 'R' ? ORTHO : pc.t === 'B' ? DIAG : [...ORTHO, ...DIAG];
    for (const [df, dr] of dirs) {
      let ff = f + df, rr = r + dr;
      while (onBoard(ff, rr)) {
        const to = rr * 8 + ff;
        if (b[to]) { if (b[to]!.c !== me) add(to); break; }
        add(to);
        ff += df; rr += dr;
      }
    }
  }
  return out;
}

/** The position after a move (no legality check — see legalMoves). */
export function applyMove(p: Position, m: Move): Position {
  const board = p.board.slice();
  const pc = board[m.from]!;
  board[m.from] = null;
  if (m.enPassant) board[m.to + (m.color === 'w' ? -8 : 8)] = null;
  board[m.to] = m.promotion ? { c: pc.c, t: m.promotion } : pc;
  if (m.castle) {
    const [rf, rt] = m.castle === 'K' ? [m.from + 3, m.from + 1] : [m.from - 4, m.from - 1];
    board[rt] = board[rf];
    board[rf] = null;
  }
  let castling = p.castling;
  const drop = (chars: string) => { for (const ch of chars) castling = castling.replace(ch, ''); };
  if (pc.t === 'K') drop(pc.c === 'w' ? 'KQ' : 'kq');
  for (const s of [m.from, m.to]) {
    if (s === 0) drop('Q'); if (s === 7) drop('K'); if (s === 56) drop('q'); if (s === 63) drop('k');
  }
  const ep = pc.t === 'P' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : null;
  return {
    board, turn: other(p.turn), castling, ep,
    halfmove: pc.t === 'P' || m.captured ? 0 : p.halfmove + 1,
    fullmove: p.turn === 'b' ? p.fullmove + 1 : p.fullmove,
  };
}

/** Every legal move in the position. */
export function legalMoves(p: Position): Move[] {
  return pseudoMoves(p).filter((m) => !inCheck(applyMove(p, m), p.turn));
}

/** SAN for a legal move (with + / #). `legal` = the position's legal moves (for
 *  disambiguation; computed when absent). */
export function moveToSan(p: Position, m: Move, legal: Move[] = legalMoves(p)): string {
  let san: string;
  if (m.castle) san = m.castle === 'K' ? 'O-O' : 'O-O-O';
  else if (m.piece === 'P') {
    san = `${m.captured ? `${FILES[m.from % 8]}x` : ''}${sqName(m.to)}${m.promotion ? `=${m.promotion}` : ''}`;
  } else {
    const rivals = legal.filter((x) => x.piece === m.piece && x.to === m.to && x.from !== m.from);
    let dis = '';
    if (rivals.length) {
      const sameFile = rivals.some((x) => x.from % 8 === m.from % 8);
      const sameRank = rivals.some((x) => Math.floor(x.from / 8) === Math.floor(m.from / 8));
      dis = !sameFile ? FILES[m.from % 8] : !sameRank ? String(Math.floor(m.from / 8) + 1) : sqName(m.from);
    }
    san = `${m.piece}${dis}${m.captured ? 'x' : ''}${sqName(m.to)}`;
  }
  const next = applyMove(p, m);
  if (inCheck(next)) san += legalMoves(next).length ? '+' : '#';
  return san;
}

const SAN_RE = /^([NBRQK])?([a-h])?([1-8])?([x:])?([a-h][1-8])(?:=?([NBRQ]))?$/;
const UCI_RE = /^([a-h][1-8])-?([a-h][1-8])([nbrqNBRQ])?$/;

/** Read one move as written — SAN ("Nf3", "exd5", "O-O", "e8=Q+", "Qh4xe1#"),
 *  with or without the capture "x" / check marks / "!?" annotations, "0-0"
 *  castles, or a long / coordinate form ("e2e4", "g1-f3", "e7e8q"). Returns
 *  the one legal move it names, else an error. */
export function readMove(p: Position, token: string, legal: Move[] = legalMoves(p)): { move: Move } | { error: string } {
  let t = token.trim().replace(/[!?]+$/, '').replace(/[+#]+$/, '').replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O');
  if (!t) return { error: 'empty move' };
  if (t === 'O-O' || t === 'O-O-O') {
    const m = legal.find((x) => x.castle === (t === 'O-O' ? 'K' : 'Q'));
    return m ? { move: m } : { error: `${token}: castling isn't legal here` };
  }
  // the coordinate form first ("g1f3", "e7e8q"): from + to name one move
  const uci = UCI_RE.exec(t);
  if (uci) {
    const from = sqIndex(uci[1]), to = sqIndex(uci[2]);
    const promo = uci[3]?.toUpperCase() ?? '';
    const ms = legal.filter((x) => x.from === from && x.to === to && (x.promotion ?? '') === promo);
    if (ms.length === 1) return { move: ms[0] };
    if (!SAN_RE.test(t)) return { error: `${token}: not a legal move here` };
  }
  t = t.replace(/^([a-h][1-8])([NBRQ])$/, '$1=$2'); // "e8Q"
  const m = SAN_RE.exec(t);
  if (!m) return { error: `${token}: not a move` };
  const [, pieceL, file, rank, x, to, promo] = m;
  const piece = (pieceL ?? 'P') as PieceType;
  const toSq = sqIndex(to);
  const ms = legal.filter((mv) =>
    mv.piece === piece && mv.to === toSq && !mv.castle
    && (!file || FILES[mv.from % 8] === file)
    && (!rank || String(Math.floor(mv.from / 8) + 1) === rank)
    && (!x || !!mv.captured)
    && (mv.promotion ?? '') === (promo ?? ''));
  if (ms.length === 1) return { move: ms[0] };
  if (ms.length > 1) return { error: `${token}: more than one piece can go there — add the file or rank (e.g. Nbd2)` };
  if (piece === 'P' && !promo && legal.some((mv) => mv.piece === 'P' && mv.to === toSq && mv.promotion)) return { error: `${token}: say what the pawn promotes to (e.g. ${to}=Q)` };
  return { error: `${token}: not a legal move here` };
}

/** Replay a list of moves from a position: the normalised SAN of each legal
 *  move, and where it stopped (index + reason) at the first one that isn't. */
export function replayMoves(tokens: string[], startFen = START_FEN): { san: string[]; moves: Move[]; positions: Position[]; fen: string; error?: { index: number; token: string; reason: string } } {
  let p = parseFen(startFen);
  if (!p) return { san: [], moves: [], positions: [], fen: startFen, error: { index: 0, token: '', reason: 'bad starting position' } };
  const san: string[] = [], moves: Move[] = [], positions: Position[] = [p];
  for (let i = 0; i < tokens.length; i++) {
    const legal = legalMoves(p);
    const r = readMove(p, tokens[i], legal);
    if ('error' in r) return { san, moves, positions, fen: toFen(p), error: { index: i, token: tokens[i], reason: r.error } };
    san.push(moveToSan(p, r.move, legal));
    moves.push(r.move);
    p = applyMove(p, r.move);
    positions.push(p);
  }
  return { san, moves, positions, fen: toFen(p) };
}

/** Material on the board per colour (standard values), non-pawn material too. */
export function material(p: Position): { w: number; b: number; wPieces: number; bPieces: number; queens: number } {
  let w = 0, b = 0, wPieces = 0, bPieces = 0, queens = 0;
  for (const pc of p.board) {
    if (!pc) continue;
    const v = VALUE[pc.t];
    if (pc.c === 'w') { w += v; if (pc.t !== 'P') wPieces += v; } else { b += v; if (pc.t !== 'P') bPieces += v; }
    if (pc.t === 'Q') queens += 1;
  }
  return { w, b, wPieces, bPieces, queens };
}

/** Game over on the board? checkmate / stalemate (the side to move). */
export function boardEnd(p: Position): 'checkmate' | 'stalemate' | null {
  if (legalMoves(p).length) return null;
  return inCheck(p) ? 'checkmate' : 'stalemate';
}
