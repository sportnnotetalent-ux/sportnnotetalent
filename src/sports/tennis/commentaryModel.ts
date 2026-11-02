/**
 * SD-158 — the tennis commentary (match summary as the scorer updates):
 * newest first, one block per game ("Set 4 · Game 2", "Set 1 · Tiebreak"),
 * the game in play on top. PURE — Commentary.tsx renders it, tests read it.
 *
 * Derived only: the point log (`state.events`) is replayed through the
 * tennis reducer point by point (like serveStats), so a correction (EDIT_LOG)
 * or undo re-derives every block, score and sentence; old logs work.
 *
 * A block (display order):
 *   - a finished game starts with "<winner> wins the game" + that set's games
 *     score in home-away order ("1-1"); a tiebreak "… wins the tiebreak";
 *     the set's last game adds "Game and set", the match's "Game, set and match";
 *   - its points, newest first: "Point to <name>", the elapsed match time
 *     (h:mm from the first stamped event; none when unstamped), a sentence
 *     from the point detail ("Sinner loses the point with a Backhand Forced
 *     Error", "Alcaraz wins the point with an Ace", "<server> double faults";
 *     no detail → no sentence) and the score AFTER the point with the
 *     SERVER's score first ("30 - 15", "40 - AD", "AD - 40", "Game"; a
 *     tiebreak's points "4 - 3"); penalty points read their conduct label;
 *   - conduct / timeout / let records where they happened (no score effect),
 *     and the derived "↔ Change ends" cues (SD-117c) after the point due;
 *   - last: "<server> is serving game N" (the time of its first point).
 * Names: the credited / named player when known, else the server by roster
 * slot (doubles) or the side's only player (singles), else the side's name.
 * IDs-only scoring (docs/privacy/ids-only-scoring.md): the log names players
 * by id; `names.nameOf` gives this viewer's name (the rosters' names, then an
 * older log's stored name, without one).
 */
import type { LiveEvent } from '../liveEvents';
import { pointRows, replayPoints, type PointInput } from '../rallyEdit.ts';
import { isMark } from '../conduct.ts';
import { RALLY_LABEL, STROKES, errTypeOf, speedText, speedUnitOf, strokeOf, strokePhrase, netSides, type PointDetail } from '../pointDetail.ts';

/** " into the net" / " (long)" — an error's direction, when recorded (tennis-endings-depth ED1). */
const dirOf = (pd: PointDetail): string => {
  const d = errTypeOf('tennis', pd);
  return d === 'net' ? ' into the net' : d ? ` (${STROKES[d].label.toLowerCase()})` : '';
};
import { inTiebreak, reducer, serveInfo, tennisCue, tiebreakInfo, type TennisState } from './engine.ts';
import { legacyNameOf, markDetail, whoName, withRosters, type NameOf } from '../racketNames.ts';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export interface CommentaryNames {
  homeName: string;
  awayName: string;
  /** the players per side in roster order (doubles slot 0 / 1), names shown */
  homeRoster?: Array<{ id: string; name: string }>;
  awayRoster?: Array<{ id: string; name: string }>;
  /** IDs-only scoring: a player's name for this viewer by id (players_view +
   *  the dispute mask); absent → the rosters' names / an older log's name */
  nameOf?: NameOf;
}

export type CommentaryRow =
  | { kind: 'point'; id: number; side: Side; name: string; title: string; time?: string; text?: string; meta?: string; score: string; penalty?: boolean }
  | { kind: 'game'; side: Side; name: string; text: string; score: string; note?: string }
  | { kind: 'serving'; side: Side; name: string; text: string; time?: string }
  | { kind: 'mark'; id: number; side?: Side; icon: string; text: string; detail?: string; time?: string }
  /** SD-117c — a derived court cue after the point ("↔ Change ends · 90 s changeover") */
  | { kind: 'cue'; text: string };

export interface CommentaryBlock {
  key: string;
  /** "Set 4 · Game 2" / "Set 1 · Tiebreak" / "Set 3 · Match tiebreak" */
  title: string;
  set: number;
  /** the game number in the set; 0 = a tiebreak */
  game: number;
  done: boolean;
  /** display order: game row (when done), points newest first, serving row */
  rows: CommentaryRow[];
}

const CALL = ['0', '15', '30', '40'];
/** The game score with the SERVER's points first: "30 - 15", "40 - 40", "AD - 40", "40 - AD". */
export function gameScore(pts: { home: number; away: number }, server: Side, noAd = false): string {
  const s = pts[server], r = pts[opp(server)];
  if (s >= 3 && r >= 3) {
    if (s === r || noAd) return '40 - 40';
    return s > r ? 'AD - 40' : '40 - AD';
  }
  return `${CALL[Math.min(s, 3)]} - ${CALL[Math.min(r, 3)]}`;
}

/** "0:42", "1:05" — elapsed match time (h:mm). */
export function elapsed(at: number | undefined, t0: number | undefined): string | undefined {
  if (typeof at !== 'number' || typeof t0 !== 'number' || at < t0) return undefined;
  const m = Math.floor((at - t0) / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

const article = (x: string) => (/^[aeiou]/i.test(x) ? `an ${x}` : `a ${x}`);

/** The sentence a described point reads with (undefined = no detail).
 *  `nameOf` names a double-faulting / erring player by id (IDs-only). */
export function pointSentence(p: PointInput, who: { winner: string; loser: string; server: string }, nameOf: NameOf = legacyNameOf): string | undefined {
  if (p.pen) return undefined;
  if (p.df) return `${whoName(nameOf, p.df.playerId, p.df.playerName) || who.server} double faults`;
  if (p.kind === 'ace' || p.pd?.how === 'ace') return `${who.winner} wins the point with an Ace`;
  const pd = p.pd;
  if (!pd) return undefined;
  const phrase = strokePhrase(strokeOf(pd), true);
  const what = (s: string) => article(phrase ? `${phrase} ${s}` : s);
  const loser = (pd.err && whoName(nameOf, pd.err.playerId, pd.err.playerName)) || who.loser;
  switch (pd.how) {
    case 'sw': return `${who.winner} wins the point with a Service Winner`;
    case 'winner': return `${who.winner} wins the point with ${what('Winner')}`;
    case 'fe': return `${loser} loses the point with ${what('Forced Error')}${dirOf(pd)}`;
    case 'ue': return `${loser} loses the point with ${what('Unforced Error')}${dirOf(pd)}`;
    // tennis-endings-depth LR1 — net touch, hindrance, double bounce …
    case 'rule': return `${loser} loses the point by rule`;
    default: return undefined;
  }
}

const gamesDone = (s: TennisState) => (s.sets ?? []).reduce((n, g) => n + g[0] + g[1], 0) + (s.games?.home ?? 0) + (s.games?.away ?? 0);

interface Draft { block: CommentaryBlock; chrono: CommentaryRow[]; serving: Extract<CommentaryRow, { kind: 'serving' }>; gameRow?: Extract<CommentaryRow, { kind: 'game' }> }

/** The commentary blocks, newest first. Empty before the first point (and
 *  before the first server is picked). */
export function tennisCommentary(state: TennisState | null | undefined, names: CommentaryNames): CommentaryBlock[] {
  if (!state || !Array.isArray(state.events)) return [];
  const events: LiveEvent[] = state.events;
  const rows = new Map(pointRows(events).map((r) => [r.e.id, r.p]));
  // Match time only when the match was timed from its first point: an older
  // match whose later points gained stamps would otherwise read "0:00" mid-match.
  const first = events.find((e) => e.kind === 'point' || e.kind === 'ace');
  const t0 = typeof first?.at === 'number' ? first.at : undefined;
  const roster = (side: Side) => (side === 'home' ? names.homeRoster : names.awayRoster) ?? [];
  const sideName = (side: Side) => (side === 'home' ? names.homeName : names.awayName);
  // IDs-only scoring: every player by id (the viewer's name, else the roster / an older log's)
  const nm = withRosters(names.nameOf, roster('home'), roster('away'));
  const rosterName = (p?: { id: string; name: string }) => (p ? nm(p.id, p.name) : undefined);
  const solo = (side: Side) => (!state.doubles && roster(side).length === 1 ? rosterName(roster(side)[0]) : undefined);
  const playerOf = (side: Side) => solo(side) ?? sideName(side);
  const serverName = (s: TennisState) => {
    const { side, slot } = serveInfo(s);
    const r = roster(side);
    return (state.doubles ? rosterName(r[slot]) : solo(side)) || sideName(side);
  };

  // a clean slate with the match's format, first server and serving order;
  // each point replays with the 1st / 2nd serve it carries (none = untracked)
  let cur: TennisState = { ...state, serveDetail: undefined, pts: { home: 0, away: 0 }, games: { home: 0, away: 0 }, sets: [], setsWon: { home: 0, away: 0 }, tb: [], events: [], seq: 0, ended: false };
  const drafts: Draft[] = [];
  const byKey = new Map<string, Draft>();
  const where = (s: TennisState) => {
    const set = s.sets.length + 1;
    const tb = inTiebreak(s);
    const game = tb ? 0 : s.games.home + s.games.away + 1;
    return { key: `${set}:${game}`, set, game, tb };
  };
  const draftFor = (s: TennisState, at?: number): Draft => {
    const w = where(s);
    const have = byKey.get(w.key);
    if (have) return have;
    const side = serveInfo(s).side;
    const name = serverName(s);
    const info = w.tb ? tiebreakInfo(s) : null;
    const title = w.tb ? `Set ${w.set} · ${info?.kind === 'match' ? 'Match tiebreak' : 'Tiebreak'}` : `Set ${w.set} · Game ${w.game}`;
    const serving = { kind: 'serving' as const, side, name, text: w.tb ? `${name} serves first in the tiebreak` : `${name} is serving game ${w.game}`, ...(elapsed(at, t0) ? { time: elapsed(at, t0) } : {}) };
    const d: Draft = { block: { key: w.key, title, set: w.set, game: w.game, done: false, rows: [] }, chrono: [], serving };
    drafts.push(d);
    byKey.set(w.key, d);
    return d;
  };

  for (const e of events) {
    const p = rows.get(e.id);
    if (p) {
      const b = cur;
      const d = draftFor(b, e.at);
      const S = serveInfo(b).side;
      const W = p.side, L = opp(W);
      const tb = inTiebreak(b);
      const next = replayPoints(reducer, { ...b, events: [] }, [p]);
      const gameOver = gamesDone(next) > gamesDone(b) || next.sets.length > b.sets.length || (next.ended && !b.ended);
      const score = tb
        ? (() => { const a = { ...b.pts, [W]: b.pts[W] + 1 }; return `${a[S]} - ${a[opp(S)]}`; })()
        : gameOver ? 'Game' : gameScore(next.pts, S, b.noAd);
      const credited = p.kind !== 'rally' ? whoName(nm, p.playerId, p.playerName) : undefined;
      const winner = credited || playerOf(W);
      const loser = playerOf(L);
      const server = serverName(b);
      const text = p.pen
        ? [e.label, markDetail(e, nm)].filter(Boolean).join(' · ')
        : pointSentence(p, { winner: p.kind === 'ace' ? (credited || server) : winner, loser, server }, nm);
      const net = netSides(p, W);
      const meta = [
        p.serve === 2 && !p.df ? '2nd serve' : '',
        // round 2: in the match's unit (km/h or mph; the log is km/h)
        typeof p.kmh === 'number' ? speedText(p.kmh, speedUnitOf(state)) : '',
        p.rallyLen ? RALLY_LABEL[p.rallyLen] : '',
        net.length ? `At the net: ${net.map((x) => playerOf(x)).join(' & ')}` : '',
      ].filter(Boolean).join(' · ');
      const time = elapsed(e.at, t0);
      d.chrono.push({
        kind: 'point', id: e.id, side: W, name: winner, title: `Point to ${winner}`,
        ...(time ? { time } : {}), ...(text ? { text } : {}), ...(meta ? { meta } : {}), score, ...(p.pen ? { penalty: true } : {}),
      });
      // SD-117c — the change-ends / set-break cue due after this point (derived)
      const cue = tennisCue(next);
      if (cue) d.chrono.push({ kind: 'cue', text: cue.text });
      if (gameOver) {
        const setOver = next.sets.length > b.sets.length;
        const g = setOver ? next.sets[next.sets.length - 1] : [next.games.home, next.games.away];
        const team = playerOf(W);
        d.block.done = true;
        d.gameRow = {
          kind: 'game', side: W, name: team, text: `${team} wins the ${tb ? 'tiebreak' : 'game'}`, score: `${g[0]}-${g[1]}`,
          ...(next.ended ? { note: 'Game, set and match' } : setOver ? { note: `Game and set · Set ${b.sets.length + 1}` } : {}),
        };
      }
      cur = next;
      continue;
    }
    if (isMark(e)) {
      const d = draftFor(cur, e.at);
      const time = elapsed(e.at, t0);
      const detail = markDetail(e, nm);
      d.chrono.push({ kind: 'mark', id: e.id, ...(e.side ? { side: e.side } : {}), icon: e.icon, text: e.label, ...(detail ? { detail } : {}), ...(time ? { time } : {}) });
    }
  }
  // the game in play, even before its first point (who is serving)
  if (!cur.ended && (drafts.length > 0 || state.serverPicked)) draftFor(cur);

  return drafts.map((d) => ({
    ...d.block,
    rows: [...(d.gameRow ? [d.gameRow] : []), ...[...d.chrono].reverse(), d.serving],
  })).reverse();
}
