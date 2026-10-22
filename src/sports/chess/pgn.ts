/**
 * Deep wave — reading a game's moves as a scorer would paste or type them
 * (PGN Standard 1994, "Portable Game Notation"; chess.com / lichess exports):
 *   • tag pairs: [Event "…"] [ECO "C60"] [Opening "Ruy Lopez"] [FEN "…"];
 *   • movetext: move numbers ("12." / "12..."), SAN or coordinate moves,
 *     comments {…} (the clock "[%clk 1:29:52]" is kept per move), line
 *     comments (;), variations (…) and NAGs ($1) skipped, the result token.
 * A bare list ("e4 e5 Nf3 Nc6") reads the same way. PURE.
 */
import { replayMoves, START_FEN } from './board.ts';

export interface PgnRead {
  tags: Record<string, string>;
  /** the move tokens as written */
  tokens: string[];
  /** clock left after each move, seconds (null = none) */
  clocks: (number | null)[];
  /** "1-0", "0-1", "1/2-1/2", "*" when present */
  result?: string;
}

/** "1:29:52" / "0:04:07.3" / "4:07" → seconds. */
export function clkSeconds(v: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.\d+)?$/.exec(v.trim());
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
}

export function readPgn(text: string): PgnRead {
  const tags: Record<string, string> = {};
  let body = text.replace(/\r/g, '');
  body = body.replace(/\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/g, (_m, k: string, v: string) => { tags[k] = v.replace(/\\(.)/g, '$1'); return ' '; });
  const tokens: string[] = [];
  const clocks: (number | null)[] = [];
  let result: string | undefined;
  let i = 0, depth = 0;
  const n = body.length;
  while (i < n) {
    const ch = body[i];
    if (ch === '{') {
      const end = body.indexOf('}', i + 1);
      const comment = body.slice(i + 1, end < 0 ? n : end);
      const clk = /\[%clk\s+([\d:.]+)\]/.exec(comment);
      if (clk && depth === 0 && tokens.length) clocks[tokens.length - 1] = clkSeconds(clk[1]);
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (ch === ';') { const end = body.indexOf('\n', i); i = end < 0 ? n : end + 1; continue; }
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    let j = i;
    while (j < n && !/[\s{}();]/.test(body[j])) j++;
    let tok = body.slice(i, j);
    i = j;
    if (depth > 0) continue;
    if (/^\$\d+$/.test(tok)) continue;
    if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(tok)) { result = tok === '½-½' ? '1/2-1/2' : tok; continue; }
    tok = tok.replace(/^\d+\.(\.\.)?/, '').replace(/^\.+/, '');
    if (!tok || /^\d+$/.test(tok)) continue;
    tokens.push(tok);
    clocks[tokens.length - 1] = clocks[tokens.length - 1] ?? null;
  }
  return { tags, tokens, clocks: tokens.map((_, k) => clocks[k] ?? null), ...(result ? { result } : {}) };
}

export interface MoveList {
  /** normalised SAN of the legal moves (up to the first that isn't) */
  san: string[];
  clocks: (number | null)[];
  /** the position after the last move */
  fen: string;
  /** a non-standard start ([FEN] tag) */
  start?: string;
  tags: Record<string, string>;
  /** the first move that isn't legal */
  error?: { index: number; token: string; reason: string };
  result?: string;
}

/** Read + check a pasted game or a typed list from the starting position (or
 *  `fromFen`, to add moves to a game in progress). */
export function readMoveList(text: string, fromFen?: string): MoveList {
  const r = readPgn(text);
  const tagFen = r.tags.SetUp === '1' || r.tags.FEN ? r.tags.FEN : undefined;
  const start = fromFen ?? tagFen ?? START_FEN;
  const rep = replayMoves(r.tokens, start);
  return {
    san: rep.san, clocks: r.clocks.slice(0, rep.san.length), fen: rep.fen,
    ...(!fromFen && tagFen && tagFen !== START_FEN ? { start: tagFen } : {}),
    tags: r.tags, ...(rep.error ? { error: rep.error } : {}), ...(r.result ? { result: r.result } : {}),
  };
}

/** "1. e4 e5 2. Nf3 Nc6 3. Bb5" — the moves written out with numbers. */
export function movetext(san: string[], startFullmove = 1, blackFirst = false): string {
  const out: string[] = [];
  san.forEach((m, k) => {
    const ply = k + (blackFirst ? 1 : 0);
    const no = startFullmove + Math.floor(ply / 2);
    if (ply % 2 === 0) out.push(`${no}. ${m}`);
    else out.push(k === 0 ? `${no}... ${m}` : m);
  });
  return out.join(' ');
}
