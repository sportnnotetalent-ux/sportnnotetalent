/**
 * Deep wave — what a chess game's move list says (chess.com / lichess "game
 * report" depth a scorer can capture without an engine): per move the piece,
 * capture, check, mate, castling, promotion, the material after it, the clock
 * and the thinking time; per side captures, material won, checks, castling,
 * promotions, time left / used — for the whole game or one phase. PURE
 * (tests in tests/chess-deep.test.mts), derived from the state's move list,
 * so taking a move back re-derives everything.
 *
 * Phases (recommended, documented in the deep-wave report): the opening is
 * the first 10 moves; the endgame starts once both sides have at most 13
 * points of pieces besides pawns (Q = 9, R = 5, B / N = 3) — e.g. R + B + N;
 * the middlegame is in between.
 */
import { applyMove, inCheck, legalMoves, material, parseFen, PIECE_NAME, START_FEN, VALUE, readMove, sqName, type Color, type Move, type Position } from './board.ts';
import type { ChessMoves, ChessState, Side } from './engine.ts';
import { clockText } from './engine.ts';
import { nonEmpty, type CompareCategory, type CompareRow } from '../gcc/model.ts';

export type Phase = 'opening' | 'middlegame' | 'endgame';
export interface Ply {
  /** 0-based half-move index */
  i: number;
  moveNo: number;
  color: Color;
  san: string;
  move: Move;
  check: boolean;
  mate: boolean;
  /** material on the board after the move (standard values) */
  mat: { w: number; b: number };
  /** clock left after the move (s) and the time it took (s), when recorded */
  clk: number | null;
  think: number | null;
  at: number | null;
  phase: Phase;
}

export const OPENING_PLIES = 20;
export const ENDGAME_PIECES = 13;

/** "90+30" → { base: 5400, inc: 30 } (seconds); null when unknown. */
export function tcSeconds(tc?: string): { base: number; inc: number } | null {
  const m = /^(\d+)\+(\d+)$/.exec(tc ?? '');
  return m ? { base: Number(m[1]) * 60, inc: Number(m[2]) } : null;
}

/** Every half-move of the list, replayed (an unreadable list stops early). */
export function plies(game: ChessMoves | undefined, tc?: string): Ply[] {
  if (!game?.san.length) return [];
  let p: Position | null = parseFen(game.start ?? START_FEN);
  if (!p) return [];
  const t = tcSeconds(tc);
  const out: Ply[] = [];
  let endgame = false;
  const lastClk: Record<Color, number | null> = { w: t?.base ?? null, b: t?.base ?? null };
  for (let i = 0; i < game.san.length; i++) {
    const legal = legalMoves(p);
    const r = readMove(p, game.san[i], legal);
    if ('error' in r) break;
    const color = p.turn;
    const moveNo = p.fullmove;
    p = applyMove(p, r.move);
    const check = inCheck(p);
    const mate = check && legalMoves(p).length === 0;
    const m = material(p);
    if (!endgame && m.wPieces <= ENDGAME_PIECES && m.bPieces <= ENDGAME_PIECES) endgame = true;
    const clk = game.clk?.[i] ?? null;
    const prev = lastClk[color];
    const think = clk != null && prev != null ? Math.max(0, prev - clk + (t?.inc ?? 0)) : null;
    if (clk != null) lastClk[color] = clk; else lastClk[color] = null;
    out.push({
      i, moveNo, color, san: game.san[i], move: r.move, check, mate, mat: { w: m.w, b: m.b }, clk, think,
      at: game.at?.[i] ?? null, phase: endgame ? 'endgame' : i < OPENING_PLIES ? 'opening' : 'middlegame',
    });
  }
  return out;
}

/** The move in words: "knight takes the pawn on e5, check". */
export function plyWords(pl: Ply): string {
  const m = pl.move;
  let t: string;
  if (m.castle) t = m.castle === 'K' ? 'castles kingside' : 'castles queenside';
  else {
    const who = PIECE_NAME[m.piece];
    const sq = sqName(m.to);
    if (m.enPassant) t = `pawn takes en passant on ${sq}`;
    else if (m.captured) t = `${who} takes the ${PIECE_NAME[m.captured]} on ${sq}`;
    else t = `${who} to ${sq}`;
    if (m.promotion) t = `${m.captured ? `${t} and` : `pawn to ${sq} and`} promotes to a ${PIECE_NAME[m.promotion]}`;
  }
  if (pl.mate) return `${t} — checkmate`;
  if (pl.check) return `${t}, check`;
  return t;
}

/** "Material level" / "White +3" after a move. */
export const materialText = (mat: { w: number; b: number }): string =>
  mat.w === mat.b ? 'Material level' : `${mat.w > mat.b ? 'White' : 'Black'} +${Math.abs(mat.w - mat.b)}`;

/** Per side over a set of plies. */
interface SideFig { moves: number; captures: number; matWon: number; checks: number; castle: string; castled: number; promotions: number; clkEnd: number | null; think: number; thinkN: number; longest: { s: number; move: number } | null }

function sideFigures(list: Ply[], c: Color): SideFig {
  const mine = list.filter((x) => x.color === c);
  const f: SideFig = { moves: mine.length, captures: 0, matWon: 0, checks: 0, castle: '', castled: 0, promotions: 0, clkEnd: null, think: 0, thinkN: 0, longest: null };
  for (const x of mine) {
    if (x.move.captured) { f.captures += 1; f.matWon += VALUE[x.move.captured]; }
    if (x.check) f.checks += 1;
    if (x.move.castle) { f.castle = `${x.move.castle === 'K' ? 'O-O' : 'O-O-O'} (move ${x.moveNo})`; f.castled = 1; }
    if (x.move.promotion) f.promotions += 1;
    if (x.clk != null) f.clkEnd = x.clk;
    if (x.think != null) {
      f.think += x.think; f.thinkN += 1;
      if (!f.longest || x.think > f.longest.s) f.longest = { s: x.think, move: x.moveNo };
    }
  }
  return f;
}

/** The game stats panel (White vs Black), the whole game or one phase. */
export function chessGameStats(s: ChessState, phase: Phase | 'all' = 'all'): CompareCategory[] {
  const all = plies(s.game, s.tcExact);
  if (!all.length) return [];
  const list = phase === 'all' ? all : all.filter((x) => x.phase === phase);
  if (!list.length) return [];
  const W = sideFigures(list, 'w'), B = sideFigures(list, 'b');
  const row = (key: string, label: string, w: number, b: number, better: 'higher' | 'lower' = 'higher'): CompareRow => ({ key, label, home: String(w), away: String(b), hv: w, av: b, better });
  const play: CompareRow[] = [
    row('moves', 'Moves played', W.moves, B.moves),
    row('captures', 'Captures', W.captures, B.captures),
    row('matWon', 'Material captured (points)', W.matWon, B.matWon),
    row('checks', 'Checks given', W.checks, B.checks),
  ];
  if (W.castled || B.castled || phase === 'all') play.push({ key: 'castle', label: 'Castled', home: W.castle || '—', away: B.castle || '—' });
  if (W.promotions || B.promotions) play.push(row('promo', 'Promotions', W.promotions, B.promotions));
  const end = list[list.length - 1];
  const mat: CompareRow[] = [row('mat', `Material on the board${phase === 'all' ? ' at the end' : ` after the ${phase}`}`, end.mat.w, end.mat.b)];
  const clock: CompareRow[] = [];
  if (W.clkEnd != null || B.clkEnd != null) {
    clock.push({ key: 'left', label: `Time left${phase === 'all' ? '' : ` after the ${phase}`}`, home: W.clkEnd != null ? clockText(W.clkEnd) : '–', away: B.clkEnd != null ? clockText(B.clkEnd) : '–',
      ...(W.clkEnd != null && B.clkEnd != null ? { hv: W.clkEnd, av: B.clkEnd } : {}) });
  }
  if (W.thinkN || B.thinkN) {
    clock.push({ key: 'avg', label: 'Average time per move', home: W.thinkN ? clockText(W.think / W.thinkN) : '–', away: B.thinkN ? clockText(B.think / B.thinkN) : '–' });
    clock.push({ key: 'longest', label: 'Longest think', home: W.longest ? `${clockText(W.longest.s)} (move ${W.longest.move})` : '–', away: B.longest ? `${clockText(B.longest.s)} (move ${B.longest.move})` : '–' });
  }
  return nonEmpty([
    { id: 'play', title: 'Moves', rows: play },
    { id: 'material', title: 'Material', rows: mat },
    { id: 'clock', title: 'Clock', rows: clock },
  ]);
}

/** The phases a game reached (for the unit chips). */
export function phasesOf(s: ChessState): Phase[] {
  const seen = new Set(plies(s.game, s.tcExact).map((x) => x.phase));
  return (['opening', 'middlegame', 'endgame'] as Phase[]).filter((p) => seen.has(p));
}

/** Deep wave statTotals figures for one SIDE (its player's colour). */
export function sideMoveFigures(s: ChessState, side: Side): SideFig | null {
  const all = plies(s.game, s.tcExact);
  if (!all.length) return null;
  return sideFigures(all, side === s.white ? 'w' : 'b');
}
