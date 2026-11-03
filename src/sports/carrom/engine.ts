/**
 * Carrom engine (ICF rules, singles/doubles). A game is a series of BOARDS. The
 * board winner scores 1 point for each of the opponent's coins left on the board,
 * plus 3 for the Queen if they pocketed and covered it — but the Queen only counts
 * while the winner's game total is under 22 (r.52-54: "3 points up to and
 * including 21"; a Queen covered by the LOSER scores nobody anything). The most
 * a board can be worth is 12. A game ends when a side reaches the
 * target (25), or after the board limit (8) — then the higher total wins; level
 * after the limit → an extra (tie-break) board. A match is best of 1 or 3 games.
 */
import type { FormatField, LiveSettings, ScoreSummary } from '../types';
import { CARROM_META } from './meta.ts';
import { scoreLine as lineOf, finalSummary, pointsLineScore, type LineScore } from '../scoreline.ts';

export type Side = 'home' | 'away';

/** SD-37/78 — a slam: the board finished in the first turn. White = by the
 *  side that broke; Black = by the side that didn't (ICF records). */
export type Slam = 'white' | 'black';

export interface BoardResult {
  winner: Side; coins: number; queen: boolean;
  /** the board's value as played (coins + a Queen that counted) — uncapped;
   *  `creditedPoints` gives what it adds to the game score (capped at 25) */
  points: number; game: number;
  /** SD-37 — only on a board recorded with a slam (old logs: absent) */
  slam?: Slam;
  /** SD-117c — who covered the Queen, when the scorer said so (the three-way
   *  chip): 'winner' (= `queen`), 'loser' (covered by the side that lost the
   *  board — it scores nobody anything) or 'none'. Absent = not recorded. */
  queenBy?: QueenBy;
  /** SD-68 (CR-07) — a penalty board: `PENALTY_POINTS` (3) to `winner` (the
   *  side NOT penalised). It is a board played (the break moves on, it counts
   *  toward the board limit) but not a board won, a Queen or a slam. Only on
   *  a board recorded as one (old logs: absent). */
  penalty?: true;
  /** Deep wave — the optional board detail (fouls by type, dues, coins on the
   *  break, missed Queen covers), only on a board recorded while that stat was
   *  tracked (old logs: absent — "not tracked", never 0). */
  det?: BoardDetail;
  /** Deep wave — when the board was recorded (the scorer's clock, ms;
   *  `payload.at`). Absent on older boards. */
  at?: number;
  /** Round 2 — the foul on the stroke that ENDED the board, by the side that
   *  lost it (ICF r.102–112, "if demanded"): the Striker pocketed (a Due, +1
   *  to the board winner) and / or an improper (foul) stroke (+1). Only on a
   *  match scored with `foulScore` (older matches: absent). */
  endFoul?: EndFoul;
  /** Cue batch 6 (audit row 18) — the board was conceded or awarded, and why
   *  (the umpire's call; scored from the coins and Queen as recorded). Only
   *  on a board recorded as one (old logs: absent); never on a penalty board. */
  award?: AwardReason;
}

/** Cue batch 6 — the award / concession vocabulary the cue sports share. */
export const AWARD_REASONS = ['concession', 'conduct', 'time', 'forfeit', 'other'] as const;
export type AwardReason = typeof AWARD_REASONS[number];
/** A whitelisted reason, or undefined (junk, a prototype key, a number…). */
export const awardReasonOf = (v: unknown): AwardReason | undefined =>
  (typeof v === 'string' && (AWARD_REASONS as readonly string[]).includes(v) ? (v as AwardReason) : undefined);
/** Cue batch 6 — a game conceded or awarded: recorded at the target for
 *  `winner`; `boards` = boards played in that game when it was awarded (a
 *  board correction re-applies it there). */
export interface GameAward { game: number; winner: Side; boards: number; reason?: AwardReason }

/** Round 2 — ICF r.102–112: what the board-ending stroke's foul adds to the
 *  board winner's points (each part claimed by the winner). */
export interface EndFoul { striker?: true; improper?: true }

/** Deep wave — carrom foul types for the optional foul log (ICF Laws: the
 *  striker pocketed, touching a coin / the striker out of turn, a foul stroke
 *  from the base line / arrow / hand position; thumbing is legal under ICF and
 *  is a foul only where the event's own rules ban it).
 *  Round 2 — "line / hand" splits into the ICF / AICF terms: BASE LINE (the
 *  Striker must touch both base lines, r.130), ARROW LINE (no part of the
 *  body but the hand beyond the arrow lines, r.32; the Striker on the arrow
 *  from a base circle, r.130) and ELBOW CROSSING (the playing elbow within
 *  the playing surface / past the arrow, r.37). `line` stays readable for
 *  boards recorded before the split. */
export type FoulType = 'striker' | 'touch' | 'base' | 'arrow' | 'elbow' | 'thumb' | 'line' | 'other';
/** Every type a board can carry (display order; `line` = before the split). */
export const FOUL_TYPES: FoulType[] = ['striker', 'touch', 'base', 'arrow', 'elbow', 'line', 'thumb', 'other'];
/** Round 2 — the chips the board form offers (no legacy `line`). */
export const FOUL_CHIPS: FoulType[] = ['striker', 'touch', 'base', 'arrow', 'elbow', 'thumb', 'other'];
export const FOUL_LABEL: Record<FoulType, string> = {
  striker: 'Striker pocketed', touch: 'Touching', base: 'Base line', arrow: 'Arrow line', elbow: 'Elbow crossing',
  line: 'Line / hand', thumb: 'Thumbing', other: 'Other foul',
};

/** Deep wave — the optional detail of one board. Each part is present only
 *  when that stat was tracked for the board (an empty `fouls` = tracked, no
 *  fouls). */
export interface BoardDetail {
  /** fouls per side, by type */
  fouls?: { home?: Partial<Record<FoulType, number>>; away?: Partial<Record<FoulType, number>> };
  /** dues per side (a foul with no pocketed coin to return: the coin is owed) */
  dues?: { home?: number; away?: number };
  /** coins the breaker pocketed with the break stroke */
  brk?: number;
  /** the Queen pocketed but the cover missed (she goes back), per side */
  qMiss?: { home?: number; away?: number };
  /** Round 2 — the foul chips were the split ones (base line / arrow /
   *  elbow): a board without it may hold a "line / hand" foul */
  split?: true;
  /** Round 2 — doubles: WHO fouled (the "who" chip), per side, by player id.
   *  Present (even empty) = recorded with the who chips; a side's players are
   *  credited only on a board where every foul and due of the side has a who. */
  who?: { home?: Record<string, PlayerFouls>; away?: Record<string, PlayerFouls> };
}

/** Round 2 — one doubles player's fouls / dues on a board. */
export interface PlayerFouls { fouls?: Partial<Record<FoulType, number>>; dues?: number }

/** Deep wave — the optional stats the scorer tracks (Stats to track). */
export interface CarromTrack { fouls?: boolean; brk?: boolean; qMiss?: boolean }

const cnt = (v: unknown, max = 20): number | undefined => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(max, n) : undefined;
};
const sideCounts = (v: unknown): { home?: number; away?: number } | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: { home?: number; away?: number } = {};
  for (const sd of ['home', 'away'] as const) { const n = cnt(o[sd]); if (n) out[sd] = n; }
  return out;
};
/** A board detail from a payload (unknown keys / bad counts dropped; zero
 *  counts dropped inside a tracked part). undefined = nothing tracked. */
export function readDetail(v: unknown): BoardDetail | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const det: BoardDetail = {};
  if (o.fouls && typeof o.fouls === 'object') {
    const f = o.fouls as Record<string, unknown>;
    const fouls: NonNullable<BoardDetail['fouls']> = {};
    for (const sd of ['home', 'away'] as const) {
      const x = f[sd];
      if (!x || typeof x !== 'object') continue;
      const by: Partial<Record<FoulType, number>> = {};
      for (const t of FOUL_TYPES) { const n = cnt((x as Record<string, unknown>)[t]); if (n) by[t] = n; }
      if (Object.keys(by).length) fouls[sd] = by;
    }
    det.fouls = fouls;
    const dues = sideCounts(o.dues);
    if (dues && Object.keys(dues).length) det.dues = dues;
  }
  const brk = cnt(o.brk, 9);
  if (brk != null) det.brk = brk;
  if (o.qMiss && typeof o.qMiss === 'object') det.qMiss = sideCounts(o.qMiss) ?? {};
  // Round 2 — only with a foul log (new payload keys: old logs carry none)
  if (det.fouls && o.split === true) det.split = true;
  if (det.fouls && o.who && typeof o.who === 'object') {
    const w = o.who as Record<string, unknown>;
    const who: NonNullable<BoardDetail['who']> = {};
    for (const sd of ['home', 'away'] as const) {
      const x = w[sd];
      if (!x || typeof x !== 'object') continue;
      const players: Record<string, PlayerFouls> = {};
      for (const [id, v] of Object.entries(x as Record<string, unknown>)) {
        if (!id || !v || typeof v !== 'object') continue;
        const pv = v as Record<string, unknown>;
        const by: Partial<Record<FoulType, number>> = {};
        if (pv.fouls && typeof pv.fouls === 'object') for (const t of FOUL_TYPES) { const n = cnt((pv.fouls as Record<string, unknown>)[t]); if (n) by[t] = n; }
        const dues = cnt(pv.dues);
        if (Object.keys(by).length || dues) players[id] = { ...(Object.keys(by).length ? { fouls: by } : {}), ...(dues ? { dues } : {}) };
      }
      if (Object.keys(players).length) who[sd] = players;
    }
    det.who = who;
  }
  return Object.keys(det).length ? det : undefined;
}

/** Round 2 — a doubles side's fouls fully attributed on a board (every foul
 *  by type and every due has a who)? Then each player's own counts. null =
 *  not recorded with the who chips, or not every foul has a who. */
export function whoFouls(det: BoardDetail | undefined, side: Side): Record<string, PlayerFouls> | null {
  if (!det?.fouls || !det.who) return null;
  const players = det.who[side] ?? {};
  const sideBy = det.fouls[side] ?? {};
  for (const t of FOUL_TYPES) {
    const sum = Object.values(players).reduce((n, p) => n + (p.fouls?.[t] ?? 0), 0);
    if (sum !== (sideBy[t] ?? 0)) return null;
  }
  const dues = Object.values(players).reduce((n, p) => n + (p.dues ?? 0), 0);
  return dues === (det.dues?.[side] ?? 0) ? players : null;
}

/** Deep wave — the tracking flags from the format (`trackFouls`,
 *  `trackBreak`, `trackQueenMiss`) or a SET_TRACK payload. */
function readTrack(v: Record<string, unknown> | undefined, base?: CarromTrack): CarromTrack | undefined {
  const t: CarromTrack = { ...(base ?? {}) };
  if (v?.trackFouls !== undefined) t.fouls = v.trackFouls === true;
  if (v?.trackBreak !== undefined) t.brk = v.trackBreak === true;
  if (v?.trackQueenMiss !== undefined) t.qMiss = v.trackQueenMiss === true;
  for (const k of Object.keys(t) as (keyof CarromTrack)[]) if (!t[k]) delete t[k];
  return Object.keys(t).length ? t : undefined;
}

/** Deep wave — "Stats to track": optional detail on the board form (event
 *  mode: the format before board 1, then SET_TRACK from the next board).
 *  Batch 3 — each default is the format field's (meta.ts: one source), so a
 *  new match, Info and the card's "Standard" agree; an old match reads its own. */
const trackOn = (k: string): boolean => (CARROM_META.formatFields ?? []).find((f) => f.key === k)?.default === true;
export const CARROM_LIVE_SETTINGS: LiveSettings<CarromState> = {
  title: '⚙️ Stats to track',
  hint: 'Optional extra detail. Recording a board stays the same; the extra rows appear on the board form and feed the commentary, match stats and careers.',
  mode: 'event',
  actionType: 'SET_TRACK',
  fields: ([
    { key: 'trackFouls', label: 'Fouls & dues', type: 'toggle', default: trackOn('trackFouls'), group: 'Stats to track', hint: 'Fouls by type (striker pocketed, touching, base line, arrow line, elbow crossing, thumbing) and dues, per board; doubles: who fouled' },
    { key: 'trackBreak', label: 'Coins on the break', type: 'toggle', default: trackOn('trackBreak'), group: 'Stats to track', hint: 'How many coins the breaker pocketed with the break stroke' },
    { key: 'trackQueenMiss', label: 'Missed Queen covers', type: 'toggle', default: trackOn('trackQueenMiss'), group: 'Stats to track', hint: 'The Queen pocketed but the cover missed (she goes back)' },
  ] as FormatField[]),
  read: (st) => ({ trackFouls: !!st.track?.fouls, trackBreak: !!st.track?.brk, trackQueenMiss: !!st.track?.qMiss }),
  defaults: { trackFouls: trackOn('trackFouls'), trackBreak: trackOn('trackBreak'), trackQueenMiss: trackOn('trackQueenMiss') },
};

/** SD-68 (CR-07) — what a penalty board gives the opponent. */
export const PENALTY_POINTS = 3;
/** Round 2 — ICF r.102–109: once the awarded side has 22 or more, a board lost
 *  "by 3 points" (the Queen's value) is lost by 1 (with `foulScore`). */
export const PENALTY_POINTS_22 = 1;
/** Round 2 — ICF r.55: the most a board can be worth. */
export const MAX_BOARD_POINTS = 12;

/** SD-117c — the three-way Queen chip. */
export type QueenBy = 'winner' | 'loser' | 'none';

/** SD-37 — a player the log credited (the scorer's attribution on a BOARD).
 *  IDs-only scoring (docs/privacy/ids-only-scoring.md): the state is public,
 *  so a credit keeps the player's `id` only; names are looked up when shown
 *  (`nameOf(id, name)`). */
export interface CarromCredit {
  side: Side; id?: string;
  /** @deprecated legacy, read-only — an older log's `playerName` (or a
   *  break-order name), kept so it replays identically; a name-only credit
   *  (no id) is identified by it. New actions never carry one. */
  name?: string;
}

/** IDs-only scoring — a credit as new data stores it: the id only (a legacy
 *  credit with no id keeps its name: it is the only identity it has). */
export const idCredit = (c: CarromCredit): CarromCredit => (c.id ? { side: c.side, id: c.id } : c);

/** The profile credit a recorded board gives each of the winning side's
 *  players — by id only (match events are public). SD-37: `by` = the board's
 *  capped points; SD-68: a penalty board credits its points, never a board
 *  won or a Queen. The scorer's buttons and voice build it the same way. */
export const boardCredit = (p: { id: string }, by: number, o: { penalty?: boolean; queen?: boolean } = {}) =>
  ({ playerId: p.id, stat: 'points', by, ...(o.penalty ? {} : { extra: { boards: 1, ...(o.queen ? { queens: 1 } : {}) } }) });

export interface CarromState {
  current: { home: number; away: number };
  /** boards played in the current game */
  boardsInGame: number;
  boards: BoardResult[];
  games: Array<[number, number]>;
  gamesWon: { home: number; away: number };
  target: number;
  maxBoards: number;
  gamesToWin: number;
  queenValue: number;
  /** the Queen stops counting once the board winner's total reaches this */
  queenCutoff: number;
  ended: boolean;
  seq: number;
  /** players per side (1 singles, 2 doubles) — which roster players a board credits */
  perSide?: number;
  /** SD-37 — every player the log credited, per side (absent until a credited
   *  board; deduplicated). `statTotals` adds them to the ctx players. */
  credited?: CarromCredit[];
  /** SD-117c (CR-04) — who broke the first board of game 1 (the toss /
   *  FIRST_BREAK). The break then alternates board by board, and the first
   *  break of each game alternates game by game. Absent = not recorded (every
   *  older match): no breaker is shown or counted. */
  firstBreak?: Side;
  /** SD-117c — the players each board credited (same order as `boards`), so
   *  the board editor can replay a corrected list with its credits. Absent
   *  until a credited board; not part of the score. */
  boardBy?: CarromCredit[][];
  /** SD-134 — doubles: each side's two players in break order (the first
   *  breaks that side's first board; then they alternate — A1 → B1 → A2 → B2,
   *  ICF doubles rotation, verify). Absent = not recorded (every older match):
   *  only the side's break is shown, as before. */
  breakOrder?: { home?: CarromCredit[]; away?: CarromCredit[] };
  /** Deep wave — the optional stats being tracked (Stats to track: the format
   *  before board 1, then SET_TRACK from the next board). Absent = none. */
  track?: CarromTrack;
  /** Round 2 — ICF foul penalties in the score (format `foulScore`, an
   *  organiser option, on by default for matches created from now on):
   *  a penalty board is worth 3, or 1 once the awarded side has 22+ (r.102–
   *  109); the board-ending stroke's foul adds +1 for the Striker / +1 for an
   *  improper stroke (r.102–112); a board is worth 12 at most (r.55). Absent
   *  on every older match — its boards replay exactly as before. */
  foulScore?: true;
  /** Batch 1 (cue-board audit #1) — the ICF format preset: the Queen is always
   *  covered before a board can end, so the board form offers Winner / Loser
   *  only. Display only (no score rule); absent on other formats. */
  icf?: true;
  /** Cue batch 6 — games conceded or awarded (AWARD_GAME), in order. Absent
   *  until the first (every older match). */
  gameAwards?: GameAward[];
}

/** SD-117c — one board as the editor replays it (EDIT_LOG). */
export interface BoardInput {
  side: Side; coins: number; queen: boolean;
  queenBy?: QueenBy; slam?: Slam;
  /** SD-68 — a penalty board (3 to `side`) */
  penalty?: boolean;
  /** the players the board credited (attribution / attribution2) */
  by?: CarromCredit[];
  /** Deep wave — kept through a correction */
  det?: BoardDetail;
  at?: number;
  /** Round 2 — the board-ending stroke's foul (with `foulScore`) */
  endFoul?: EndFoul;
  /** Cue batch 6 — conceded / awarded, and why */
  award?: AwardReason;
}

export function init(config?: Record<string, unknown>): CarromState {
  return {
    current: { home: 0, away: 0 }, boardsInGame: 0, boards: [], games: [], gamesWon: { home: 0, away: 0 },
    target: Number(config?.target ?? 25),
    maxBoards: Number(config?.maxBoards ?? 8),
    gamesToWin: Number(config?.gamesToWin ?? 2),
    queenValue: 3,
    queenCutoff: Number(config?.queenCutoff ?? 22),
    ended: false, seq: 0,
    perSide: Number(config?.playersPerSide ?? 1) >= 2 ? 2 : 1,
    // Deep wave — only when the organiser switched a stat on (older formats: absent)
    ...(() => { const t = readTrack(config); return t ? { track: t } : {}; })(),
    // Round 2 — ICF foul penalties in the score (the format's default is on;
    // a match created before has no key: its score rules are unchanged)
    ...(config?.foulScore === true ? { foulScore: true as const } : {}),
    ...(config?.preset === 'icf' ? { icf: true as const } : {}),
  };
}

/** Batch 1 (cue-board audit #1) — the answers to "Queen covered by" on a
 *  played-out board: under the ICF format the Queen is always covered (by the
 *  winner or the loser) before a board ends; other formats keep "Not covered". */
export const queenChoices = (s: Pick<CarromState, 'icf'>, award = false): QueenBy[] =>
  // cue batch 6 — a conceded / awarded board may end with the Queen still on the board
  (s.icf && !award ? ['winner', 'loser'] : ['winner', 'loser', 'none']);

/** Batch 1 — the board form can record: a penalty board, or a played-out board
 *  with the coins left AND the Queen answered (a skipped Queen used to drop
 *  the winner's 3 points silently). Old boards are never re-asked. */
export const boardReady = (s: Pick<CarromState, 'icf'>, b: { penalty: boolean; coins: number | null; queenBy: QueenBy | null; award?: boolean }): boolean =>
  b.penalty || (b.coins != null && b.queenBy != null && queenChoices(s, b.award === true).includes(b.queenBy));

/** Cue batch 6 — AWARD_GAME: the game in play conceded / awarded to `side`
 *  (stamped with the game number, so a repeated tap can't end the next one). */
export const awardGameAction = (s: CarromState, side: Side, reason?: AwardReason | null): { type: string; side: Side; payload: Record<string, unknown> } => {
  const r = awardReasonOf(reason);
  return { type: 'AWARD_GAME', side, payload: { game: (s?.games?.length ?? 0) + 1, ...(r ? { reason: r } : {}) } };
};

/** Round 2 — a board-ending foul from a payload (unknown keys dropped). */
export function readEndFoul(v: unknown): EndFoul | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const f: EndFoul = { ...(o.striker === true ? { striker: true as const } : {}), ...(o.improper === true ? { improper: true as const } : {}) };
  return Object.keys(f).length ? f : undefined;
}

/** Round 2 — what a board is worth to its winner, every rule applied: a
 *  penalty board (3; with `foulScore` 1 once the winner has 22+), else the
 *  coins + a counted Queen; with `foulScore` plus the board-ending foul (+1
 *  Striker, +1 improper stroke), at most 12 (r.55). Without `foulScore` this
 *  is exactly the board value every older match was scored with. */
export function boardValue(
  s: Pick<CarromState, 'queenValue' | 'queenCutoff' | 'foulScore'>, winnerTotal: number,
  b: { coins?: number; queen?: boolean; penalty?: boolean; endFoul?: EndFoul },
): number {
  if (!s.foulScore) return b.penalty ? PENALTY_POINTS : boardPoints(b.coins ?? 0, !!b.queen, winnerTotal, s);
  const base = b.penalty ? (winnerTotal < s.queenCutoff ? PENALTY_POINTS : PENALTY_POINTS_22) : boardPoints(b.coins ?? 0, !!b.queen, winnerTotal, s);
  const extra = (b.endFoul?.striker ? 1 : 0) + (b.endFoul?.improper ? 1 : 0);
  return Math.min(MAX_BOARD_POINTS, base + extra);
}

/** Points a board is worth to its winner, given their total before the board. */
export function boardPoints(coins: number, queen: boolean, winnerTotal: number, s: Pick<CarromState, 'queenValue' | 'queenCutoff'>): number {
  const c = Math.max(0, Math.min(9, Math.round(coins)));
  return c + (queen && winnerTotal < s.queenCutoff ? s.queenValue : 0);
}

/** SD-37 — what a board adds to its winner's GAME score: its value, capped so
 *  the game is recorded at the target (Laws r.56 — a 28 is written 25). The
 *  credited player points, so a player's points = their side's game scores. */
export function creditPoints(coins: number, queen: boolean, winnerTotal: number, s: Pick<CarromState, 'queenValue' | 'queenCutoff' | 'target'>): number {
  const pts = boardPoints(coins, queen, winnerTotal, s);
  return winnerTotal + pts >= s.target ? Math.max(0, s.target - winnerTotal) : pts;
}

/** SD-37 — the capped value of every board in `s.boards` (same order), replayed
 *  from the boards: per game, the winner's running total before each board. */
export function creditedPoints(s: Pick<CarromState, 'boards' | 'target'>): number[] {
  const run = new Map<number, { home: number; away: number }>();
  return (s?.boards ?? []).map((b) => {
    const t = run.get(b.game) ?? run.set(b.game, { home: 0, away: 0 }).get(b.game)!;
    const before = t[b.winner];
    const v = before + b.points >= s.target ? Math.max(0, s.target - before) : b.points;
    t[b.winner] = before + b.points;
    return v;
  });
}

type Attr = { playerId?: string; playerName?: string } | null | undefined;

/** The players a BOARD action credits (attribution + a doubles partner's
 *  `attribution2`, stored as `payload._attr2` on replay). */
function creditsOf(side: Side, a: { attribution?: Attr; attribution2?: Attr; payload?: Record<string, unknown> }, prior: CarromCredit[] | undefined): CarromCredit[] | undefined {
  let out = prior;
  for (const at of [a.attribution, a.attribution2 ?? (a.payload?._attr2 as Attr)]) {
    if (!at || (!at.playerId && !at.playerName)) continue;
    const c: CarromCredit = { side, ...(at.playerId ? { id: at.playerId } : {}), ...(at.playerName ? { name: at.playerName } : {}) };
    if ((out ?? []).some((o) => o.side === side && (c.id ? o.id === c.id : !o.id && o.name === c.name))) continue;
    out = [...(out ?? []), c];
  }
  return out;
}

/**
 * BOARD {side: winner, payload: {coins (opponent's left, 0-9), queen, slam?}}.
 * SD-37: `slam` ('white' | 'black') is optional — old logs replay identically.
 * SD-68 (CR-07): `penalty: true` (optional) = a penalty board — `side` is the
 * side awarded PENALTY_POINTS; coins / Queen / slam are ignored.
 */
export function reducer(s: CarromState, a: { type: string; side?: Side; payload?: Record<string, unknown>; attribution?: Attr; attribution2?: Attr }): CarromState {
  // SD-117c — corrections. STAT_ADJUST only reconciles player profiles (no
  // match effect); EDIT_LOG replays a corrected board list (the board editor).
  if (a.type === 'STAT_ADJUST') return s;
  if (a.type === 'EDIT_LOG') return replayBoards(s, (a.payload?.boards as BoardInput[] | undefined) ?? []);
  // SD-117c (CR-04) — the toss: who breaks the first board. Only names the
  // breaker (derived per board), so it may be fixed later; no score effect.
  if (a.type === 'FIRST_BREAK') {
    const side = (a.payload?.side ?? a.side) as Side | undefined;
    if (s.ended || (side !== 'home' && side !== 'away')) return s;
    // SD-134 — optional doubles break order (a new payload key: old logs carry none)
    const order = readBreakOrder(a.payload?.order);
    return { ...s, firstBreak: side, ...(order ? { breakOrder: order } : {}) };
  }
  // Deep wave — Stats to track changed during play: applies from the next board
  if (a.type === 'SET_TRACK') {
    if (s.ended) return s;
    const t = readTrack(a.payload, s.track);
    const { track: _old, ...rest } = s;
    return t ? { ...rest, track: t } : rest;
  }
  // Cue batch 6 — a game conceded / awarded (a new action: no older log has one)
  if (a.type === 'AWARD_GAME') return awardGame(s, a);
  if (a.type !== 'BOARD' || s.ended || (a.side !== 'home' && a.side !== 'away')) return s;
  const side = a.side;
  const penalty = a.payload?.penalty === true;
  const coins = penalty ? 0 : Number(a.payload?.coins ?? 0);
  const qb = penalty ? undefined : a.payload?.queenBy;
  const queenBy: QueenBy | undefined = qb === 'winner' || qb === 'loser' || qb === 'none' ? qb : undefined;
  // the three-way chip wins over the old flag; old logs carry only `queen`
  const queen = penalty ? false : queenBy ? queenBy === 'winner' : !!a.payload?.queen;
  const slam = !penalty && (a.payload?.slam === 'white' || a.payload?.slam === 'black') ? (a.payload!.slam as Slam) : undefined;
  // Round 2 — the board-ending foul counts only with `foulScore` (older
  // matches: ignored, so a stray key can't move an old score)
  const endFoul = s.foulScore ? readEndFoul(a.payload?.endFoul) : undefined;
  const pts = boardValue(s, s.current[side], { coins, queen, penalty, endFoul });
  const gameNo = s.games.length + 1;
  const current = { ...s.current, [side]: s.current[side] + pts };
  const boardsInGame = s.boardsInGame + 1;
  // Deep wave — optional detail + the time stamp (new payload keys: old logs carry none)
  const det = readDetail(a.payload?.det);
  const at = Number(a.payload?.at);
  // cue batch 6 — conceded / awarded (a new payload key; a penalty board is its own kind)
  const award = penalty ? undefined : awardReasonOf(a.payload?.award);
  const boards = [...s.boards, { winner: side, coins, queen, points: pts, game: gameNo, ...(slam ? { slam } : {}), ...(queenBy ? { queenBy } : {}), ...(penalty ? { penalty: true as const } : {}),
    ...(det ? { det } : {}), ...(Number.isFinite(at) && at > 0 ? { at } : {}), ...(endFoul ? { endFoul } : {}), ...(award ? { award } : {}) }];
  const credited = creditsOf(side, a, s.credited);
  if (credited) s = { ...s, credited };
  // SD-117c — this board's own credits (for the editor's replay)
  const by = creditsOf(side, a, undefined) ?? [];
  if (by.length || s.boardBy) s = { ...s, boardBy: [...(s.boardBy ?? s.boards.map(() => [])), by] };

  let gameWinner: Side | null = null;
  if (current[side] >= s.target) gameWinner = side;
  else if (boardsInGame >= s.maxBoards && current.home !== current.away) gameWinner = current.home > current.away ? 'home' : 'away';
  // Level after the board limit: keep playing (tie-break boards) until someone leads.

  if (!gameWinner) return { ...s, current, boardsInGame, boards, seq: s.seq + 1 };
  // Results are written with the winner on the target: a game "won 25-22" even if
  // the last board took them past 25 (Laws of Carrom r.56 — a game is 25 points).
  const final = { ...current, [gameWinner]: Math.min(current[gameWinner], s.target) };
  const games = [...s.games, [final.home, final.away] as [number, number]];
  const gamesWon = { ...s.gamesWon, [gameWinner]: s.gamesWon[gameWinner] + 1 };
  const ended = gamesWon[gameWinner] >= s.gamesToWin;
  return { ...s, current: { home: 0, away: 0 }, boardsInGame: 0, boards, games, gamesWon, ended, seq: s.seq + 1 };
}

/** Cue batch 6 — AWARD_GAME {side, payload: {game, reason?}}: the game in
 *  play ends for `side`, recorded at the target (the other side keeps its
 *  points); the next game starts, or the match ends. */
function awardGame(s: CarromState, a: { side?: Side; payload?: Record<string, unknown> }): CarromState {
  const side = a.side;
  if (s.ended || (side !== 'home' && side !== 'away')) return s;
  const own = a.payload && Object.prototype.hasOwnProperty.call(a.payload, 'game') ? a.payload.game : undefined;
  const game = s.games.length + 1;
  if (own !== game) return s;
  const opp: Side = side === 'home' ? 'away' : 'home';
  const final = { [side]: s.target, [opp]: Math.max(0, Math.min(s.current[opp], s.target - 1)) } as { home: number; away: number };
  const reason = awardReasonOf(a.payload?.reason);
  const games = [...s.games, [final.home, final.away] as [number, number]];
  const gamesWon = { ...s.gamesWon, [side]: s.gamesWon[side] + 1 };
  const ended = gamesWon[side] >= s.gamesToWin;
  const rec: GameAward = { game, winner: side, boards: s.boardsInGame, ...(reason ? { reason } : {}) };
  return { ...s, current: { home: 0, away: 0 }, boardsInGame: 0, games, gamesWon, ended, gameAwards: [...(s.gameAwards ?? []), rec], seq: s.seq + 1 };
}

/** A stored award list, read defensively. */
function readAwards(v: unknown): GameAward[] {
  if (!Array.isArray(v)) return [];
  const out: GameAward[] = [];
  for (const x of v.slice(0, 20)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const game = Number(o.game), boards = Number(o.boards);
    if (!Number.isInteger(game) || game < 1 || (o.winner !== 'home' && o.winner !== 'away') || !Number.isInteger(boards) || boards < 0) continue;
    const reason = awardReasonOf(o.reason);
    out.push({ game, winner: o.winner, boards, ...(reason ? { reason } : {}) });
  }
  return out;
}

export function result(s: CarromState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!s.ended) return null;
  return { winner: s.gamesWon.home > s.gamesWon.away ? 'home' : 'away', home: s.gamesWon.home, away: s.gamesWon.away };
}

/** SD-01 — the completed games, "25-18, 12-25, 25-20". */
export function scoreLine(s: CarromState, perspective?: Side): string {
  return lineOf(s?.games, { perspective });
}

/** SD-20 — the line score: every game + the one in play (board points). */
export const lineScore = (s: CarromState): LineScore | null =>
  pointsLineScore('game', s && { games: s.games, current: s.current, won: s.gamesWon, ended: s.ended, toWin: s.gamesToWin });

/** Scoreboard summary: live = this game's points; once ended = games won + every
 *  game's score (the board no longer reads the reset 0 : 0). */
export function summary(s: CarromState): ScoreSummary {
  if (s.ended) return finalSummary(s.gamesWon, scoreLine(s));
  const line = scoreLine(s);
  return {
    homeScore: String(s.current.home),
    awayScore: String(s.current.away),
    statusLine: `Game ${s.games.length + 1} · board ${s.boardsInGame + 1}`,
    detailLine: `Games — ${s.gamesWon.home}:${s.gamesWon.away}${line ? ` (${line})` : ''} · to ${s.target} · ${s.gamesToWin === 1 ? 'single game' : `best of ${s.gamesToWin * 2 - 1}`}`,
  };
}

/** SD-17 standings units: board points won by each side over every game (plus
 *  an unfinished one) — the carrom points-difference tie-break. */
export function standingsUnits(s: CarromState): { points: { home: number; away: number } } | null {
  if (!s || !Array.isArray(s.games)) return null;
  const points = s.games.reduce((t, [h, a]) => ({ home: t.home + h, away: t.away + a }), { home: s.current?.home ?? 0, away: s.current?.away ?? 0 });
  return { points };
}

/** SD-116 — what recording this board would close, for the Record button
 *  ("✓ Record board · wins Game 2"). Pure: replays the board on a copy.
 *  `winner` is the side that takes the game — after the board limit that can
 *  be the side that LOST this board. null = the game goes on. */
export function boardCloses(s: CarromState, side: Side, coins: number, queen: boolean, penalty = false, endFoul?: EndFoul): { kind: 'game' | 'match'; game: number; winner: Side } | null {
  if (s.ended) return null;
  const next = reducer(s, { type: 'BOARD', side, payload: { ...(penalty ? { penalty: true } : { coins, queen }), ...(endFoul ? { endFoul } : {}) } });
  if (next.games.length === s.games.length) return null;
  const winner: Side = next.gamesWon.home > s.gamesWon.home ? 'home' : 'away';
  return { kind: next.ended ? 'match' : 'game', game: next.games.length, winner };
}

// ------------------------------------------------ SD-117c · breaker --

/** The side that breaks the board at `index` (0-based, over the whole match)
 *  of `boards`, or null when the toss wasn't recorded. Game g's first break
 *  alternates (game 1: the toss winner), then the break alternates board by
 *  board inside the game — ICF. */
export function breakerAt(s: Pick<CarromState, 'firstBreak' | 'boards' | 'games'>, game: number, boardInGame: number): Side | null {
  if (!s.firstBreak) return null;
  const other: Side = s.firstBreak === 'home' ? 'away' : 'home';
  const opener = game % 2 === 1 ? s.firstBreak : other;
  return boardInGame % 2 === 0 ? opener : opener === 'home' ? 'away' : 'home';
}

/** Who broke each recorded board (same order as `s.boards`); null = unknown. */
export function boardBreakers(s: CarromState): Array<Side | null> {
  const seen = new Map<number, number>();
  return (s?.boards ?? []).map((b) => {
    const i = seen.get(b.game) ?? 0;
    seen.set(b.game, i + 1);
    return breakerAt(s, b.game, i);
  });
}

/** SD-134 — a doubles break order from a payload: up to two players a side. */
function readBreakOrder(v: unknown): CarromState['breakOrder'] | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const side = (x: unknown, sd: Side): CarromCredit[] | undefined => {
    if (!Array.isArray(x)) return undefined;
    const list: CarromCredit[] = [];
    for (const c of x) {
      if (!c || typeof c !== 'object') continue;
      const { id, name } = c as { id?: unknown; name?: unknown };
      if ((typeof id !== 'string' || !id) && (typeof name !== 'string' || !name)) continue;
      list.push({ side: sd, ...(typeof id === 'string' && id ? { id } : {}), ...(typeof name === 'string' && name ? { name } : {}) });
    }
    return list.length >= 2 ? list.slice(0, 2) : undefined;
  };
  const home = side(o.home, 'home');
  const away = side(o.away, 'away');
  return home || away ? { ...(home ? { home } : {}), ...(away ? { away } : {}) } : undefined;
}

/** SD-134 — the PLAYER who broke each board (doubles with a recorded break
 *  order): each side's breaks alternate between its two players, counted
 *  over the whole match. null where the side or its order is unknown. */
export function breakerPlayers(s: CarromState): Array<CarromCredit | null> {
  const breakers = boardBreakers(s);
  const n = { home: 0, away: 0 };
  return breakers.map((side) => {
    if (!side) return null;
    const order = s.breakOrder?.[side];
    const i = n[side]++;
    return order?.length === 2 ? order[i % 2] : null;
  });
}

/** SD-134 — who breaks the next board (doubles with an order): the player's
 *  credit (by id; a legacy order may also carry a name). */
export function nextBreakerPlayer(s: CarromState): CarromCredit | null {
  const side = nextBreaker(s);
  if (!side) return null;
  const order = s.breakOrder?.[side];
  if (order?.length !== 2) return null;
  const done = boardBreakers(s).filter((x) => x === side).length;
  return order[done % 2];
}

/** Who breaks the next board (null = the toss isn't recorded). */
export const nextBreaker = (s: CarromState): Side | null =>
  s.ended ? null : breakerAt(s, s.games.length + 1, s.boardsInGame);

/** SD-117c — the slam a board finished in the first turn is: White when the
 *  board's winner broke it, Black when they didn't. null = breaker unknown. */
export const slamFor = (winner: Side, breaker: Side | null): Slam | null =>
  (breaker ? (winner === breaker ? 'white' : 'black') : null);

// ------------------------------------------- SD-117c · board editor --

/** Back to board 1 of game 1 keeping the format, the toss and the players
 *  credited so far — the clean slate an EDIT_LOG replays onto. */
const clearMatch = (s: CarromState): CarromState => {
  const { boardBy: _b, gameAwards: _g, ...rest } = s;
  return { ...rest, current: { home: 0, away: 0 }, boardsInGame: 0, boards: [], games: [], gamesWon: { home: 0, away: 0 }, ended: false, seq: 0 };
};

const attrOf = (c?: CarromCredit): Attr => (c ? { ...(c.id ? { playerId: c.id } : {}), ...(c.name ? { playerName: c.name } : {}) } : undefined);

/** The BOARD action one corrected board replays as. */
export function boardAction(b: BoardInput): { type: string; side: Side; payload: Record<string, unknown>; attribution?: Attr; attribution2?: Attr } {
  // Deep wave — the board's detail and time stamp ride along (absent = as
  // before); round 2 — and the board-ending foul
  const extra = { ...(b.det ? { det: b.det } : {}), ...(b.at ? { at: b.at } : {}), ...(b.endFoul ? { endFoul: b.endFoul } : {}) };
  const award = b.penalty ? undefined : awardReasonOf(b.award);
  return {
    type: 'BOARD', side: b.side,
    payload: b.penalty ? { coins: 0, queen: false, penalty: true, ...extra }
      : { coins: b.coins, queen: b.queenBy ? b.queenBy === 'winner' : !!b.queen, ...(b.queenBy ? { queenBy: b.queenBy } : {}), ...(b.slam ? { slam: b.slam } : {}), ...extra, ...(award ? { award } : {}) },
    attribution: attrOf(b.by?.[0]), attribution2: attrOf(b.by?.[1]),
  };
}

/** Replay a corrected board list through this reducer: games, totals and the
 *  match result re-derive (a board limit or a game end can move). */
export function replayBoards(s: CarromState, boards: BoardInput[]): CarromState {
  // cue batch 6 — an awarded game is re-applied where it was awarded (its
  // game number, once that game has had as many boards)
  const awards = readAwards(s?.gameAwards);
  const apply = (st: CarromState): CarromState => {
    for (const aw of awards) {
      if (!st.ended && aw.game === st.games.length + 1 && st.boardsInGame >= aw.boards) st = reducer(st, awardGameAction(st, aw.winner, aw.reason));
    }
    return st;
  };
  return boards.reduce((st, b) => apply(reducer(st, boardAction(b))), apply(clearMatch(s)));
}

/** The board list a state replays from (the editor's rows). */
export function boardInputs(s: CarromState): BoardInput[] {
  return (s?.boards ?? []).map((b, i) => ({
    side: b.winner, coins: b.coins, queen: b.queen,
    ...(b.queenBy ? { queenBy: b.queenBy } : {}), ...(b.slam ? { slam: b.slam } : {}),
    ...(b.penalty ? { penalty: true } : {}),
    ...(s.boardBy?.[i]?.length ? { by: s.boardBy[i] } : {}),
    ...(b.det ? { det: b.det } : {}), ...(b.at ? { at: b.at } : {}), ...(b.endFoul ? { endFoul: b.endFoul } : {}),
    ...(b.award ? { award: b.award } : {}),
  }));
}

/** What a board list credits each player LIVE (the controls' attribution:
 *  capped `points`, `boards`, `queens`), keyed by player id. */
export function liveCredits(s: CarromState): Map<string, { name?: string; points: number; boards: number; queens: number }> {
  const capped = creditedPoints(s);
  const out = new Map<string, { name?: string; points: number; boards: number; queens: number }>();
  (s?.boards ?? []).forEach((b, i) => {
    for (const c of s.boardBy?.[i] ?? []) {
      if (!c.id) continue;
      const t = out.get(c.id) ?? { name: c.name, points: 0, boards: 0, queens: 0 };
      // SD-68 — a penalty board's points count, but it is not a board won
      t.points += capped[i]; if (!b.penalty) t.boards += 1; if (b.queen) t.queens += 1;
      out.set(c.id, t);
    }
  });
  return out;
}

/** Everything one board-editor correction dispatches: the EDIT_LOG with the
 *  corrected list, then STAT_ADJUST deltas so the live profile lines match
 *  what the corrected boards credit (capped points move with the game).
 *  IDs-only scoring: both are public match events, so the corrected boards'
 *  credits keep their ids only (an older board's stored names are dropped —
 *  a name-only legacy credit keeps its name, its only identity) and each
 *  STAT_ADJUST names the player by id. */
export function boardCorrection(s: CarromState, edited: BoardInput[]): Array<{ type: string; payload?: Record<string, unknown>; attribution?: { playerId: string; stat: string; by: number } }> {
  const boards = edited.map((b) => (b.by ? { ...b, by: b.by.map(idCredit) } : b));
  const next = replayBoards(s, boards);
  const before = liveCredits(s);
  const after = liveCredits(next);
  const out: Array<{ type: string; payload?: Record<string, unknown>; attribution?: { playerId: string; stat: string; by: number } }> = [
    { type: 'EDIT_LOG', payload: { boards } },
  ];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(id); const a = after.get(id);
    for (const stat of ['points', 'boards', 'queens'] as const) {
      const d = (a?.[stat] ?? 0) - (b?.[stat] ?? 0);
      if (d) out.push({ type: 'STAT_ADJUST', attribution: { playerId: id, stat, by: d } });
    }
  }
  return out;
}

// --------------------------------------------- SD-68 · ICF score sheet --

/** One row of the ICF score sheet: a board as the referee writes it. */
export interface SheetRow {
  /** board number inside the game (1-based) */
  n: number;
  /** who broke it (null = the toss wasn't recorded) */
  breaker: Side | null;
  /** SD-134 — the player who broke it (doubles with a break order) */
  breakerBy?: CarromCredit;
  winner: Side;
  /** opponent's coins left (0 on a penalty board) */
  coins: number;
  /** the Queen: 'winner' (+3 counted, or covered past 21), 'loser', 'none', or undefined (not recorded) */
  queen?: QueenBy;
  /** did the Queen add points on this board (under 22)? */
  queenCounted: boolean;
  slam?: Slam;
  penalty?: true;
  /** what the board added to the winner's GAME score (capped at the target) */
  pts: number;
  /** the game's running total after the board */
  total: { home: number; away: number };
  /** a tie-break board (after the board limit) */
  tieBreak: boolean;
}

export interface SheetGame {
  game: number;
  rows: SheetRow[];
  /** the final score, when the game is over (else the running total) */
  score: [number, number];
  done: boolean;
  winner?: Side;
}

/** SD-68 (CR-03) — the ICF score sheet: per game, board # · breaker · winner ·
 *  coins · Queen · points · running total; penalty boards and slams marked.
 *  Pure — derived from the boards (and the toss, when recorded). */
export function scoreSheet(s: CarromState): SheetGame[] {
  const capped = creditedPoints(s);
  const breakers = boardBreakers(s);
  const byPlayer = s?.breakOrder ? breakerPlayers(s) : [];
  const out: SheetGame[] = [];
  (s?.boards ?? []).forEach((b, i) => {
    let g = out.find((x) => x.game === b.game);
    if (!g) { g = { game: b.game, rows: [], score: [0, 0], done: false }; out.push(g); }
    const prev = g.rows[g.rows.length - 1]?.total ?? { home: 0, away: 0 };
    const total = { ...prev, [b.winner]: prev[b.winner] + capped[i] };
    const queen: QueenBy | undefined = b.queenBy ?? (b.queen ? 'winner' : undefined);
    g.rows.push({
      n: g.rows.length + 1, breaker: breakers[i], ...(byPlayer[i] ? { breakerBy: byPlayer[i]! } : {}), winner: b.winner, coins: b.coins,
      ...(queen ? { queen } : {}), queenCounted: b.queen && b.points > b.coins,
      ...(b.slam ? { slam: b.slam } : {}), ...(b.penalty ? { penalty: true as const } : {}),
      pts: capped[i], total, tieBreak: g.rows.length >= s.maxBoards,
    });
    g.score = [total.home, total.away];
  });
  for (const g of out) {
    const final = s.games?.[g.game - 1];
    if (final) { g.score = [final[0], final[1]]; g.done = true; g.winner = final[0] > final[1] ? 'home' : 'away'; }
  }
  return out;
}
