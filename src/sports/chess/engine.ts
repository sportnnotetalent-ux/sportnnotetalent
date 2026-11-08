/**
 * Chess engine — a result-only match: record who won (or a draw) and how. No
 * move-by-move scoring; the board is the players'. Scoring is the standard
 * 1 / ½ / 0, so Swiss and round-robin tables read like a crosstable.
 */
import { replayMoves, parseFen, boardEnd, START_FEN } from './board.ts';
import { readMoveList } from './pgn.ts';
import { detectOpening, ecoCode, nameForEco } from './openings.ts';
import type { FormatField, LiveSettings } from '../types';
import { CHESS_META } from './meta.ts';

export type Side = 'home' | 'away';
export type ChessMethod =
  | 'checkmate' | 'resignation' | 'time' | 'agreement' | 'stalemate'
  | 'repetition' | 'fifty-move' | 'insufficient' | 'forfeit'
  // SD-117c — FIDE Laws: an illegal move (Art. 7.5.5 / A.4.2 — the 2nd one in
  // standard / rapid, the 1st in blitz loses); a flag fall when the opponent
  // can't mate (Art. 6.9 — a draw); fivefold repetition and the 75-move rule
  // (Art. 9.6 — automatic draws, no claim needed)
  | 'illegal-move' | 'time-insufficient' | 'fivefold' | 'seventy-five-move'
  // SD-67 — a dead position (Art. 5.2.2: no sequence of legal moves can mate —
  // a draw); an adjudicated game and the arbiter's decision (Art. 12.9 / a
  // penalty) — either a win or a draw; a double forfeit (neither player came:
  // 0-0, both lose — FIDE C.07 treats it as two unplayed losses)
  | 'dead-position' | 'adjudication' | 'arbiter' | 'double-forfeit';

export const DECISIVE: ChessMethod[] = ['checkmate', 'resignation', 'time', 'illegal-move', 'forfeit', 'adjudication', 'arbiter'];
export const DRAWN: ChessMethod[] = ['agreement', 'stalemate', 'repetition', 'fifty-move', 'insufficient', 'time-insufficient', 'fivefold', 'seventy-five-move', 'dead-position', 'adjudication', 'arbiter'];

export const METHOD_LABEL: Record<ChessMethod, string> = {
  checkmate: 'Checkmate', resignation: 'Resignation', time: 'On time', forfeit: 'Forfeit',
  agreement: 'Draw agreed', stalemate: 'Stalemate', repetition: 'Threefold repetition',
  'fifty-move': '50-move rule', insufficient: 'Insufficient material',
  'illegal-move': 'Illegal move', 'time-insufficient': 'Time out vs insufficient material',
  fivefold: 'Fivefold repetition', 'seventy-five-move': '75-move rule',
  'dead-position': 'Dead position', adjudication: 'Adjudicated', arbiter: 'Arbiter\'s decision',
  'double-forfeit': 'Double forfeit',
};

/** SD-67 — neither player turned up: 0-0, both lose by forfeit (no game). */
export const isDoubleForfeit = (m?: ChessMethod | null): boolean => m === 'double-forfeit';

/** SD-67 — the exact time control, FIDE style: "90+30" (base minutes +
 *  increment seconds per move), "15+10", "5+0"; '' when no base is set. */
export function exactTimeControl(baseMin?: unknown, incSec?: unknown): string {
  const b = Number(baseMin); const i = Number(incSec);
  if (!Number.isFinite(b) || b <= 0) return '';
  return `${Math.round(b)}+${Number.isFinite(i) && i > 0 ? Math.round(i) : 0}`;
}

/** SD-117c — a forfeit (no game played): the result counts in the table, but
 *  neither player is credited a game played (FIDE: forfeits are excluded from
 *  played-game stats). */
export const isForfeit = (m?: ChessMethod | null): boolean => m === 'forfeit';

/** SD-117c — clock time left, "1:05:30" / "4:07" / "0:42", from seconds. */
export function clockText(secs: number): string {
  const t = Math.max(0, Math.round(secs));
  const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** SD-117c — parse a typed clock reading to seconds: "4:07" (m:ss),
 *  "1:05:30" (h:mm:ss), "0:42", or a bare "12" / "12m" (minutes); null when it
 *  isn't one. */
export function parseClock(v: string): number | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  const mins = /^(\d+(?:\.\d+)?)\s*m(in)?$/.exec(t);
  if (mins) return Math.round(Number(mins[1]) * 60);
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  if (!t.includes(':')) return Number(t) * 60;
  const parts = t.split(':').map(Number);
  if (parts.slice(1).some((n) => n >= 60)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/* ── SD-121: knockout tie-breaks ─────────────────────────────────────────────
 * A knockout "match" must produce a winner (FIDE World Cup regulations): a
 * mini-match of N games at the event's time control, then — while level —
 * pairs of rapid games, then pairs of blitz games, then one Armageddon game
 * (Black has draw odds: a draw sends Black through; colours by the arbiter /
 * lot). The match holds every game; the bracket sees only the winner. */

/** How a knockout pairing is played: games in the main mini-match, then the
 *  number of rapid and blitz PAIRS before the Armageddon. */
export interface KoPlan { games: number; rapid: number; blitz: number }
export const DEFAULT_KO_PLAN: KoPlan = { games: 1, rapid: 1, blitz: 1 };
export type KoPhaseKind = 'main' | 'rapid' | 'blitz' | 'armageddon';
export interface KoPhase { kind: KoPhaseKind; games: number; /** 1-based pair number for rapid / blitz */ n?: number }
/** One game of a knockout match. */
export interface KoGame {
  phase: number;
  white: Side;
  winner: Side | 'draw';
  method?: ChessMethod;
  moves?: number;
  clock?: { white?: number; black?: number };
  /** Deep wave — when the result was recorded (ms) */
  at?: number;
  /** Round 2 — this game's move list (typed while it was played, or pasted
   *  after: MOVES `koGame`). Absent on every older knockout game. */
  game?: ChessMoves;
  /** Round 2 — this game's opening, named by hand / a PGN tag */
  opening?: { eco: string; name?: string; manual?: boolean };
  /** Cue batch 6 — the arbiter's events during this game (moved here with its result) */
  events?: ArbiterEvent[];
}
export interface KoState { plan: KoPlan; games: KoGame[] }

/** Deep wave — the optional move list of a game (FIDE Laws App. C, SAN). */
export interface ChessMoves {
  /** normalised SAN, in order from the start position */
  san: string[];
  /** the position after the last move (FEN) — adding moves checks from here */
  fen: string;
  /** a non-standard starting position (a pasted PGN's [FEN] tag) */
  start?: string;
  /** the clock left after each move, seconds (null = not recorded) */
  clk?: (number | null)[];
  /** when each move was entered (ms, the scorer's clock) */
  at?: (number | null)[];
}

/** Deep wave — the optional detail being tracked ("Stats to track"). */
export interface ChessTrack { moves?: boolean; clock?: boolean }

/** Cue batch 6 (audit row 16) — an arbiter's in-game event: an illegal move
 *  completed (FIDE Art. 7.5.5: the opponent gets `t` seconds, 2 minutes; blitz
 *  1 minute; the same player's second one loses) or a draw offer (Art. 9.1.2).
 *  No score effect. `s` = the player who made it. */
export type ArbiterKind = 'illegal' | 'drawOffer';
export interface ArbiterEvent { k: ArbiterKind; s: Side; t?: number; at?: number }
/** The most events one game keeps (a hostile log can't grow the state). */
export const MAX_EVENTS = 60;
/** Art. 7.5.5 / B.3 — time added for the opponent of an illegal move. */
export const illegalSecs = (timeControl: string): number => (timeControl === 'blitz' || timeControl === 'bullet' ? 60 : 120);

/** Cue batch 6 (audit row 17) — a second time-control period and a delay:
 *  `moves` to the first control, then `base2` minutes added; `delay` seconds
 *  (Bronstein / US delay). Each only when set. */
export interface TimeControl2 { moves?: number; base2?: number; delay?: number }
const tcNum = (v: unknown, max: number): number | undefined => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : undefined;
};
export function tc2From(config?: Record<string, unknown>): TimeControl2 | undefined {
  const moves = tcNum(config?.tcMoves, 200);
  const base2 = moves ? tcNum(config?.tcBase2, 600) : undefined;
  const delay = tcNum(config?.tcDelay, 600);
  const out: TimeControl2 = { ...(moves && base2 ? { moves, base2 } : {}), ...(delay ? { delay } : {}) };
  return Object.keys(out).length ? out : undefined;
}
/** "90+30 · +30 min after move 40 · 5 s delay" ('' when nothing is set). */
export function timeControlText(s: Pick<ChessState, 'tcExact' | 'tc2'>): string {
  const t = s?.tc2;
  return [
    s?.tcExact ?? '',
    t?.moves && t.base2 ? `+${t.base2} min after move ${t.moves}` : '',
    t?.delay ? `${t.delay} s delay` : '',
  ].filter(Boolean).join(' · ');
}

const clampInt = (v: unknown, lo: number, hi: number, dv: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dv;
};
/** A plan from the format / a payload (out-of-range values clamped). */
export function koPlanFrom(v: unknown): KoPlan {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    games: clampInt(o.games ?? o.koGames, 1, 12, DEFAULT_KO_PLAN.games),
    rapid: clampInt(o.rapid ?? o.koRapidPairs, 0, 4, DEFAULT_KO_PLAN.rapid),
    blitz: clampInt(o.blitz ?? o.koBlitzPairs, 0, 4, DEFAULT_KO_PLAN.blitz),
  };
}
/** The phases in order: main mini-match, rapid pairs, blitz pairs, Armageddon. */
export function koPhases(plan: KoPlan): KoPhase[] {
  return [
    { kind: 'main', games: plan.games },
    ...Array.from({ length: plan.rapid }, (_, i) => ({ kind: 'rapid' as const, games: 2, n: i + 1 })),
    ...Array.from({ length: plan.blitz }, (_, i) => ({ kind: 'blitz' as const, games: 2, n: i + 1 })),
    { kind: 'armageddon', games: 1 },
  ];
}
const gamePts = (g: KoGame, side: Side): number =>
  isDoubleForfeit(g.method) ? 0 : g.winner === 'draw' ? 0.5 : g.winner === side ? 1 : 0;
/** Points each side scored in one phase (or every game when `phase` is omitted). */
export function koPoints(ko: KoState, phase?: number): { home: number; away: number } {
  const gs = phase == null ? ko.games : ko.games.filter((g) => g.phase === phase);
  return gs.reduce((a, g) => ({ home: a.home + gamePts(g, 'home'), away: a.away + gamePts(g, 'away') }), { home: 0, away: 0 });
}
/** The winner of a phase once it can't be caught (lead > games left), or
 *  after its last game; Armageddon: a draw goes to Black. null = level / open. */
export function koPhaseWinner(ko: KoState, phase: number): Side | null {
  const ph = koPhases(ko.plan)[phase];
  if (!ph) return null;
  const gs = ko.games.filter((g) => g.phase === phase);
  if (ph.kind === 'armageddon') {
    const g = gs[0];
    if (!g) return null;
    if (g.winner !== 'draw') return g.winner;
    return isDoubleForfeit(g.method) ? null : g.white === 'home' ? 'away' : 'home';
  }
  const p = koPoints(ko, phase);
  const left = ph.games - gs.length;
  if (Math.abs(p.home - p.away) > left) return p.home > p.away ? 'home' : 'away';
  return null;
}
/** Where a knockout match stands: the phase now being played (its index and
 *  game number in it), and the winner once decided. */
export function koStatus(ko: KoState): { phase: number; game: number; winner: Side | null } {
  const phases = koPhases(ko.plan);
  for (let i = 0; i < phases.length; i++) {
    const w = koPhaseWinner(ko, i);
    if (w) return { phase: i, game: ko.games.filter((g) => g.phase === i).length, winner: w };
    const played = ko.games.filter((g) => g.phase === i).length;
    if (played < phases[i].games) return { phase: i, game: played + 1, winner: null };
  }
  // A drawn Armageddon after a double forfeit — nothing can decide it here.
  const last = phases.length - 1;
  return { phase: last, game: 1, winner: null };
}
export const KO_PHASE_LABEL: Record<KoPhaseKind, string> = {
  main: 'Match', rapid: 'Rapid tie-break', blitz: 'Blitz tie-break', armageddon: 'Armageddon',
};
/** "Rapid tie-break 1 · game 2", "Armageddon", "Match · game 1 of 2". */
export function koPhaseText(ko: KoState, phase: number, game: number): string {
  const ph = koPhases(ko.plan)[phase];
  if (!ph) return '';
  if (ph.kind === 'armageddon') return 'Armageddon (draw = Black goes through)';
  if (ph.kind === 'main') return ph.games > 1 ? `Mini-match · game ${game} of ${ph.games}` : 'Match game';
  return `${KO_PHASE_LABEL[ph.kind]}${(ph.kind === 'rapid' ? ko.plan.rapid : ko.plan.blitz) > 1 ? ` ${ph.n}` : ''} · game ${game} of 2`;
}

export interface ChessState {
  /** which side has the white pieces */
  white: Side;
  /** time control label for reference, e.g. 'rapid' (from the format) */
  timeControl: string;
  /** SD-67 — the exact time control "90+30" from the format (`tcBase`
   *  minutes + `tcInc` seconds). Absent on older games / when not set. */
  tcExact?: string;
  winner?: Side | 'draw';
  method?: ChessMethod;
  /** optional move count, for the record */
  moves?: number;
  /** SD-117c — optional clock time left at the end, in seconds, by colour
   *  (RESULT payload `clock`). Absent on older games. */
  clock?: { white?: number; black?: number };
  ended: boolean;
  seq: number;
  /** SD-121 — the organiser's knockout plan (format `koGames` / `koRapidPairs`
   *  / `koBlitzPairs`); only set when the format carries one. */
  koPlan?: KoPlan;
  /** SD-121 — a knockout match: every game so far (set by the first RESULT
   *  that carries `ko` — a new payload key, so no older log has it). While it
   *  is undecided the top-level winner / method are empty; once decided,
   *  `winner` is the side that goes through. */
  ko?: KoState;
  /** Deep wave — the move list (MOVES: typed move by move, or a pasted PGN /
   *  SAN list, during or after the game). Absent = result only (every older
   *  game). Round 2 — in a knockout match it is the game IN PLAY: recording
   *  that game's result moves it into its `KoGame` (one list per game). */
  game?: ChessMoves;
  /** Deep wave — the opening named by hand (OPENING) or by a pasted PGN's
   *  [ECO] / [Opening] tags; otherwise `openingOf` reads it from the moves */
  opening?: { eco: string; name?: string; manual?: boolean };
  /** Deep wave — Stats to track (the format before the game, then SET_TRACK) */
  track?: ChessTrack;
  /** Deep wave — when the result was recorded (ms) */
  resultAt?: number;
  /** Cue batch 6 — the arbiter's events in the game in play (ARBITER).
   *  Absent until the first (every older game). */
  events?: ArbiterEvent[];
  /** Cue batch 6 — an uneven arbiter score (Art. 11 / 12): the winner gets ½,
   *  the other 0 ("½-0"). Only with the arbiter's decision or adjudication. */
  uneven?: true;
  /** Cue batch 6 — the second period / delay from the format */
  tc2?: TimeControl2;
}

/** Deep wave — the tracking flags from the format (`trackMoves`,
 *  `trackClock`) or a SET_TRACK payload; undefined when none is on. */
function readTrack(v: Record<string, unknown> | undefined, base?: ChessTrack): ChessTrack | undefined {
  const t: ChessTrack = { ...(base ?? {}) };
  if (v?.trackMoves !== undefined) t.moves = v.trackMoves === true;
  if (v?.trackClock !== undefined) t.clock = v.trackClock === true;
  for (const k of Object.keys(t) as (keyof ChessTrack)[]) if (!t[k]) delete t[k];
  return Object.keys(t).length ? t : undefined;
}
/** Deep wave — "Stats to track" (event mode: the format before the game,
 *  then SET_TRACK). Defaults-on H1 (docs/security/breaks/defaults-on-cricket-cue.md
 *  DOK2): each default is the format field's (meta.ts: one source), so a new
 *  game, Info and the card's Standard / Reset agree. */
const metaField = (k: string) => (CHESS_META.formatFields ?? []).find((f) => f.key === k);
const trackDefault = (k: string): boolean => metaField(k)?.default === true;
export const CHESS_LIVE_SETTINGS: LiveSettings<ChessState> = {
  title: '⚙️ Stats to track',
  hint: 'Optional. Recording the result stays the same; the move list can also be pasted after the game.',
  mode: 'event',
  actionType: 'SET_TRACK',
  fields: ([
    { key: 'trackMoves', label: 'Move list (SAN / PGN)', type: 'toggle', default: trackDefault('trackMoves'), group: 'Stats to track', hint: 'Type each move as it is played (checked for legality) — commentary, opening, game stats' },
    { key: 'trackClock', label: 'Clock after each move', type: 'toggle', default: trackDefault('trackClock'), group: 'Stats to track', hint: 'With the move list: the time left after each move → time used per move' },
  ] as FormatField[]),
  read: (st) => ({ trackMoves: !!st?.track?.moves, trackClock: !!st?.track?.clock }),
  defaults: { trackMoves: trackDefault('trackMoves'), trackClock: trackDefault('trackClock') },
};
const stampOf = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** Deep wave — the game's opening: named by hand / a PGN tag, else the
 *  longest ECO line the moves follow; null when neither. */
export function openingOf(s: Pick<ChessState, 'game' | 'opening'>): { eco: string; name: string } | null {
  if (s.opening?.eco) return { eco: s.opening.eco, name: s.opening.name ?? nameForEco(s.opening.eco) ?? `ECO ${s.opening.eco}` };
  const d = s.game?.san.length && !s.game.start ? detectOpening(s.game.san) : null;
  return d ? { eco: d.eco, name: d.name } : null;
}

/** Deep wave — the game's length in moves from the list (full moves). */
export const listMoves = (g: ChessMoves | undefined): number => (g ? Math.ceil(g.san.length / 2) : 0);

/** `config.white` (SD-26) is the fixture's colour from the Swiss pairing;
 *  absent (every older fixture) = home has White, as before. The scorer can
 *  still switch it with SET_WHITE before the result. */
export function init(config?: Record<string, unknown>): ChessState {
  const white: Side = config?.white === 'away' ? 'away' : 'home';
  // SD-67 — only when the organiser set one (old fixtures' state is unchanged)
  const tcExact = exactTimeControl(config?.tcBase, config?.tcInc);
  // SD-121 — only when the format has a knockout plan (older fixtures unchanged)
  const hasKo = config && ['koGames', 'koRapidPairs', 'koBlitzPairs'].some((k) => config[k] != null);
  // Deep wave — Stats to track, only when the organiser switched one on
  const track = readTrack(config);
  // cue batch 6 — only when the organiser set one (older fixtures unchanged)
  const tc2 = tc2From(config);
  return { white, timeControl: String(config?.timeControl ?? 'rapid'), ...(tcExact ? { tcExact } : {}), ...(tc2 ? { tc2 } : {}), ended: false, seq: 0,
    ...(hasKo ? { koPlan: koPlanFrom(config) } : {}), ...(track ? { track } : {}) };
}

/** One game's move list and opening (the game in play, or a knockout game). */
interface MoveSlot { game?: ChessMoves; opening?: { eco: string; name?: string; manual?: boolean } }

/** Deep wave — MOVES: `pgn` (a pasted game or list — replaces the moves),
 *  `add` (moves typed during the game, checked from the current position;
 *  `clk` = the clock after the last one), or `drop` (take back the last n).
 *  Only legal moves are kept (up to the first that isn't). No score effect.
 *  Round 2 — works on one slot (the game in play, or a knockout game);
 *  null = nothing changed. */
function movesOn(slot: MoveSlot, p: Record<string, unknown>): MoveSlot | null {
  const at = stampOf(p.at);
  if (typeof p.pgn === 'string') {
    const r = readMoveList(p.pgn);
    if (!r.san.length) return null;
    const game: ChessMoves = {
      san: r.san, fen: r.fen, ...(r.start ? { start: r.start } : {}),
      ...(r.clocks.some((x) => x != null) ? { clk: r.clocks } : {}), ...(at ? { at: r.san.map(() => at) } : {}),
    };
    const eco = ecoCode(r.tags.ECO);
    const keep = slot.opening?.manual ? { opening: slot.opening } : eco ? { opening: { eco, ...(r.tags.Opening ? { name: r.tags.Opening } : {}) } } : {};
    return { ...keep, game };
  }
  const prev: ChessMoves = slot.game ?? { san: [], fen: START_FEN };
  const op = slot.opening ? { opening: slot.opening } : {};
  if (typeof p.drop === 'number' && p.drop > 0) {
    if (!slot.game?.san.length) return null;
    const n = Math.max(0, prev.san.length - Math.floor(p.drop));
    if (n === 0) return { ...op };
    const rep = replayMoves(prev.san.slice(0, n), prev.start ?? START_FEN);
    return { ...op, game: { ...prev, san: prev.san.slice(0, n), fen: rep.fen, ...(prev.clk ? { clk: prev.clk.slice(0, n) } : {}), ...(prev.at ? { at: prev.at.slice(0, n) } : {}) } };
  }
  if (Array.isArray(p.add)) {
    const rep = replayMoves(p.add.map(String), prev.fen);
    const k = rep.san.length;
    if (!k) return null;
    const clkIn = typeof p.clk === 'number' && Number.isFinite(p.clk) && p.clk >= 0 ? Math.round(p.clk) : null;
    const old = prev.san.length;
    const clk = prev.clk || clkIn != null ? [...(prev.clk ?? new Array<number | null>(old).fill(null)), ...rep.san.map((_, i) => (i === k - 1 ? clkIn : null))] : undefined;
    const ats = prev.at || at ? [...(prev.at ?? new Array<number | null>(old).fill(null)), ...rep.san.map(() => at ?? null)] : undefined;
    return { ...op, game: { ...prev, san: [...prev.san, ...rep.san], fen: rep.fen, ...(clk ? { clk } : {}), ...(ats ? { at: ats } : {}) } };
  }
  return null;
}

/** OPENING on a slot: a typed ECO (by hand), or none = clear. */
function openingOn(slot: MoveSlot, p: Record<string, unknown> | undefined): MoveSlot {
  const eco = ecoCode(p?.eco);
  const rest: MoveSlot = slot.game ? { game: slot.game } : {};
  if (!eco) return rest;
  const name = typeof p?.name === 'string' && p.name.trim() ? p.name.trim() : nameForEco(eco) ?? undefined;
  return { ...rest, opening: { eco, ...(name ? { name } : {}), manual: true } };
}

/** The game in play's slot. */
const slotOf = (x: MoveSlot): MoveSlot => ({ ...(x.game ? { game: x.game } : {}), ...(x.opening ? { opening: x.opening } : {}) });

/** Put a slot back on the state (the game in play) — keys absent when empty. */
function withSlot(s: ChessState, slot: MoveSlot): ChessState {
  const rest: ChessState = { ...s };
  delete rest.game;
  delete rest.opening;
  return { ...rest, ...(slot.game ? { game: slot.game } : {}), ...(slot.opening ? { opening: slot.opening } : {}), seq: s.seq + 1 };
}

/** Round 2 — a MOVES / OPENING aimed at knockout game `k` (payload `koGame`):
 *  the list of a game already recorded (pasted after it). */
function onKoGame(s: ChessState, k: number, f: (slot: MoveSlot) => MoveSlot | null): ChessState {
  const g = s.ko?.games[k];
  if (!s.ko || !g) return s;
  const next = f(slotOf(g));
  if (!next) return s;
  const base: KoGame = { ...g };
  delete base.game;
  delete base.opening;
  const games = s.ko.games.map((x, i) => (i === k ? { ...base, ...(next.game ? { game: next.game } : {}), ...(next.opening ? { opening: next.opening } : {}) } : x));
  return { ...s, ko: { ...s.ko, games }, seq: s.seq + 1 };
}

/** Round 2 — the result the moves on the board show: checkmate (the side to
 *  move is mated — the other colour wins) or stalemate (a draw). The controls
 *  pre-select it; the arbiter still confirms. null = the game goes on (or no
 *  moves). */
export function boardResult(s: Pick<ChessState, 'game'>): { pick: 'white' | 'black' | 'draw'; method: 'checkmate' | 'stalemate' } | null {
  if (!s.game?.san.length) return null;
  const p = parseFen(s.game.fen);
  if (!p) return null;
  const end = boardEnd(p);
  if (end === 'checkmate') return { pick: p.turn === 'w' ? 'black' : 'white', method: 'checkmate' };
  if (end === 'stalemate') return { pick: 'draw', method: 'stalemate' };
  return null;
}

/** Actions: SET_WHITE {side}, RESULT {winner, method, moves?}. PLAYED is a no-op
 *  carrier the controls use to credit each player a game for their profile. */
export function reducer(s: ChessState, a: { type: string; side?: Side; payload?: Record<string, unknown> }): ChessState {
  // Deep wave — optional detail (new action types: no older log has them).
  // The move list and the opening may be added after the game too.
  // Round 2 — in a knockout match the list is the game in play's (moved into
  // its KoGame when the result is recorded), or a recorded game's (`koGame`).
  // No older log has MOVES / OPENING on a knockout match (they were ignored).
  if (a.type === 'MOVES') {
    const p = a.payload ?? {};
    if (typeof p.koGame === 'number') return onKoGame(s, Math.floor(p.koGame), (slot) => movesOn(slot, p));
    if (s.ko && s.ended) return s;
    const next = movesOn(slotOf(s), p);
    return next ? withSlot(s, next) : s;
  }
  if (a.type === 'OPENING') {
    const p = a.payload ?? {};
    if (typeof p.koGame === 'number') return onKoGame(s, Math.floor(p.koGame), (slot) => openingOn(slot, p));
    return withSlot(s, openingOn(slotOf(s), p));
  }
  if (a.type === 'SET_TRACK') {
    if (s.ended) return s;
    const t = readTrack(a.payload, s.track);
    const { track: _t, ...rest } = s;
    return t ? { ...rest, track: t } : rest;
  }
  // Cue batch 6 — an arbiter's event (a new action type: no older log has one)
  if (a.type === 'ARBITER') {
    const p = a.payload ?? {};
    const k = p.kind;
    const side = p.side ?? a.side;
    if (s.ended || (k !== 'illegal' && k !== 'drawOffer') || (side !== 'home' && side !== 'away')) return s;
    const list = s.events ?? [];
    if (list.length >= MAX_EVENTS) return s;
    const secs = typeof p.secs === 'number' && Number.isInteger(p.secs) && p.secs >= 0 && p.secs <= 600 ? p.secs : illegalSecs(s.timeControl);
    const at = stampOf(p.at);
    const ev: ArbiterEvent = { k, s: side, ...(k === 'illegal' ? { t: secs } : {}), ...(at ? { at } : {}) };
    return { ...s, events: [...list, ev], seq: s.seq + 1 };
  }
  if (a.type === 'SET_WHITE' && !s.ended) {
    const side = (a.payload?.side ?? a.side) as Side | undefined;
    return side === 'home' || side === 'away' ? { ...s, white: side } : s;
  }
  if (a.type === 'RESULT' && !s.ended) {
    const winner = a.payload?.winner as Side | 'draw' | undefined;
    const method = a.payload?.method as ChessMethod | undefined;
    if (winner !== 'home' && winner !== 'away' && winner !== 'draw') return s;
    // A method must be consistent with the outcome (no "draw by checkmate").
    // SD-67: a double forfeit is recorded as winner 'draw' (no winner) with
    // this method only — a new value, so no older log carries it.
    if (method && !(winner === 'draw' && method === 'double-forfeit') && (winner === 'draw' ? !DRAWN.includes(method) : !DECISIVE.includes(method))) return s;
    const moves = typeof a.payload?.moves === 'number' && a.payload.moves > 0 ? Math.round(a.payload.moves as number) : undefined;
    // SD-117c — optional clock times left (a new optional key: old logs carry none)
    const c = a.payload?.clock as { white?: unknown; black?: unknown } | undefined;
    const secs = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);
    const clock = c && typeof c === 'object' ? { ...(secs(c.white) != null ? { white: secs(c.white) } : {}), ...(secs(c.black) != null ? { black: secs(c.black) } : {}) } : undefined;
    // SD-121 — a knockout match: this result is ONE game of it.
    const ko: KoState | undefined = s.ko ?? (a.payload?.ko ? { plan: koPlanFrom(a.payload.ko), games: [] } : undefined);
    // Cue batch 6 — ½-0 / 0-½: only the arbiter's decision or adjudication of a
    // decisive result, never in a knockout game (a new key: old logs have none)
    const uneven = !ko && a.payload?.uneven === true && winner !== 'draw' && (method === 'arbiter' || method === 'adjudication');
    // Deep wave — when the result was recorded (a new optional key)
    const stamped = stampOf(a.payload?.at);
    if (ko) {
      const at = koStatus(ko);
      // Round 2 — the game in play's move list / opening go with its result
      // (absent on every older knockout game: nothing moves)
      const game: KoGame = { phase: at.phase, white: s.white, winner, ...(method ? { method } : {}), ...(moves ? { moves } : {}), ...(clock && Object.keys(clock).length ? { clock } : {}), ...(stamped ? { at: stamped } : {}),
        ...slotOf(s), ...(s.events?.length ? { events: s.events } : {}) };
      const next: KoState = { ...ko, games: [...ko.games, game] };
      const st = koStatus(next);
      const base: ChessState = { ...s };
      delete base.game;
      delete base.opening;
      delete base.events;
      if (st.winner) {
        return { ...base, ko: next, winner: st.winner, method, moves, ...(clock && Object.keys(clock).length ? { clock } : {}), ...(stamped ? { resultAt: stamped } : {}), ended: true, seq: s.seq + 1 };
      }
      // Undecided: the next game. Colours alternate (the arbiter can still
      // switch them with SET_WHITE — e.g. the Armageddon draw of lots).
      const { winner: _w, method: _m, moves: _mv, clock: _c, ...rest } = base;
      return { ...rest, ko: next, white: s.white === 'home' ? 'away' : 'home', seq: s.seq + 1 };
    }
    return { ...s, winner, method, moves, ...(clock && Object.keys(clock).length ? { clock } : {}), ...(stamped ? { resultAt: stamped } : {}), ...(uneven ? { uneven: true as const } : {}), ended: true, seq: s.seq + 1 };
  }
  return s;
}

/** Cue batch 6 — an ARBITER action for the game in play (null once it has ended). */
export function arbiterAction(s: ChessState, kind: ArbiterKind, side: Side, at?: number): { type: string; payload: Record<string, unknown> } | null {
  if (!s || s.ended) return null;
  return { type: 'ARBITER', payload: { kind, side, ...(typeof at === 'number' && at > 0 ? { at } : {}) } };
}
/** Illegal moves `side` has made in the game in play. */
export const illegalCount = (s: Pick<ChessState, 'events'>, side: Side): number =>
  (Array.isArray(s?.events) ? s.events.filter((e) => e && e.k === 'illegal' && e.s === side).length : 0);
/** Art. 7.5.5 — a player's second illegal move loses: the result the controls
 *  pre-select (the arbiter still confirms). null = nobody has two. */
export function arbiterPreset(s: Pick<ChessState, 'events' | 'ended'>): { winner: Side; method: 'illegal-move' } | null {
  if (!s || s.ended) return null;
  for (const side of ['home', 'away'] as const) if (illegalCount(s, side) >= 2) return { winner: side === 'home' ? 'away' : 'home', method: 'illegal-move' };
  return null;
}

/** Screen sweep — the result tile a second-illegal-move loss pre-selects
 *  (the winner's colour with the colour as it stands on the result screen). */
export const presetPick = (preset: { winner: Side } | null, white: Side): 'white' | 'black' | null =>
  preset ? (preset.winner === white ? 'white' : 'black') : null;

/** Game points: 1 / ½ / 0. */
export function points(s: ChessState): { home: number; away: number } {
  // SD-121 — a knockout match: every game's points (live too)
  if (s.ko) return koPoints(s.ko);
  if (!s.ended || !s.winner) return { home: 0, away: 0 };
  if (isDoubleForfeit(s.method)) return { home: 0, away: 0 };
  // cue batch 6 — ½-0 / 0-½: the winner gets half a point, the other none
  if (s.uneven === true && s.winner !== 'draw') return s.winner === 'home' ? { home: 0.5, away: 0 } : { home: 0, away: 0.5 };
  if (s.winner === 'draw') return { home: 0.5, away: 0.5 };
  return s.winner === 'home' ? { home: 1, away: 0 } : { home: 0, away: 1 };
}

/** "1-0", "0-1" or "½-½" (the chess way of writing a result). */
export function resultString(s: ChessState): string {
  // SD-121 — a knockout match reads home-first over all its games: "2½-1½"
  if (s.ko && (s.ko.games.length > 1 || !s.ended)) {
    if (!s.ko.games.length) return '–';
    const p = koPoints(s.ko);
    const h = (n: number) => String(n).replace('.5', '½').replace(/^0½$/, '½');
    return `${h(p.home)}-${h(p.away)}`;
  }
  if (!s.ended || !s.winner) return '–';
  if (isDoubleForfeit(s.method)) return '0-0';
  if (s.winner === 'draw') return '½-½';
  // Written white-first.
  const whiteWon = s.winner === s.white;
  if (s.uneven === true) return whiteWon ? '½-0' : '0-½';
  return whiteWon ? '1-0' : '0-1';
}

/** SD-116 — the arbiter's result written White-first for a pending result:
 *  "1-0", "½-½" or "0-1" for `winner` when `white` has the white pieces. */
export function scoreFor(white: Side, winner: Side | 'draw', method?: ChessMethod | null, uneven = false): '1-0' | '½-½' | '0-1' | '0-0' | '½-0' | '0-½' {
  if (winner === 'draw' && isDoubleForfeit(method)) return '0-0';
  if (winner === 'draw') return '½-½';
  if (uneven) return winner === white ? '½-0' : '0-½';
  return winner === white ? '1-0' : '0-1';
}

/** SD-116 — the one-line result the confirm sheet asks about:
 *  "1-0: Anand beat Carlsen by Resignation", "½-½: Anand drew with Carlsen (Stalemate)".
 *  Names are White first (whiteName has the white pieces). */
export function resultSentence(white: Side, winner: Side | 'draw', whiteName: string, blackName: string, method?: ChessMethod, uneven = false): string {
  const sc = scoreFor(white, winner, method, uneven && winner !== 'draw');
  if (uneven && winner !== 'draw') {
    const [w, l] = winner === white ? [whiteName, blackName] : [blackName, whiteName];
    return `${sc}: ${w} ½, ${l} 0 (${method ? METHOD_LABEL[method].toLowerCase() : 'arbiter decision'})`;
  }
  if (winner === 'draw' && isDoubleForfeit(method)) return `0-0: double forfeit — neither ${whiteName} nor ${blackName} played (both lose)`;
  if (winner === 'draw') return `${sc}: ${whiteName} drew with ${blackName}${method ? ` (${METHOD_LABEL[method]})` : ''}`;
  const [w, l] = winner === white ? [whiteName, blackName] : [blackName, whiteName];
  const how = method ? (method === 'time' ? ' on time' : method === 'forfeit' ? ' by forfeit' : method === 'illegal-move' ? ' (illegal move)' : method === 'adjudication' ? ' (adjudicated)' : method === 'arbiter' ? ' (arbiter\'s decision)' : ` by ${METHOD_LABEL[method]}`) : '';
  return `${sc}: ${w} beat ${l}${how}`;
}
