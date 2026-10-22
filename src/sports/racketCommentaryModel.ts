/**
 * Deep wave (racket) — the live commentary for badminton, table tennis,
 * squash, pickleball (one block per GAME) and padel (one block per game in
 * each set, as tennis — SD-158). Newest first, the game in play on top. PURE —
 * RacketCommentary.tsx renders it (through CommentaryFeed), tests read it.
 * The block / row shapes are tennis' (tennis/commentaryModel.ts).
 *
 * Derived only: the point log is replayed through the sport's own reducer
 * rally by rally (like serveStats), and serveStats names who served each
 * rally — so a correction (EDIT_LOG) or undo re-derives every block, score
 * and sentence; old logs work (they just carry no detail sentences).
 *
 * A block (display order):
 *   - a finished game starts with "<winner> wins game N" and the game score
 *     (winner first, "21-18") with the match situation ("Lee leads 1-0 in
 *     games", "Game and match"); padel "<winner> wins the game" with the set's
 *     games score (home-away), "Break of serve", "Game and set · Set 1";
 *   - its rallies, newest first: "Point to <name>" (side-out scoring: "Rally
 *     to <name>" when the rally won only the serve), the elapsed match time,
 *     a sentence from the point detail ("Axelsen wins the point with a
 *     Forehand Smash Winner", "Ma Long loses the point with a Backhand Push
 *     Unforced Error (into the net)") and the score called after the rally,
 *     the NEXT server's score first, as the umpire / marker / server calls it
 *     ("12-10"; side-out doubles "4-2-1"); padel the game score with the
 *     server's points first ("30 - 15", "Game"); a line with the serve change
 *     as the sport says it ("Service over", "Change of service", "Hand-out",
 *     "Side out", "Second server"), the rally length, who was at the net /
 *     kitchen line, the 3rd shot, a 2nd serve, a golden / star point;
 *   - conduct / timeout / let records where they happened, the derived
 *     interval / change-ends cues after the rally due;
 *   - last: who served first in the game ("<name> serves first"; padel
 *     "<name> is serving game N").
 * Names: the credited / named player when known, else the serving player
 * serveStats names (doubles), the side's only player (singles), the side.
 */
import type { LiveEvent } from './liveEvents';
import { pointRows, replayPoints, type EditRow, type PointInput } from './rallyEdit.ts';
import { makeRallyEngine, rallyRows, rallyServingSide, type RallyState } from './rallyEngine.ts';
import { isMark } from './conduct.ts';
import { serveStats, type RallyTrace } from './serveStats.ts';
import { ttServer } from './tabletennis/serve.ts';
import { pickleballCue, squashCue, tableTennisCue, type Cue } from './courtCues.ts';
import * as badminton from './badminton/engine.ts';
import * as padel from './padel/engine.ts';
import {
  NET_WORDS, STROKES, THIRD_LABEL, TT_PHASE_LABEL, RALLY_LABEL, errTypeOf, netSides, shotOf, shotPhrase, type DepthSport,
} from './pointDetail.ts';
import { elapsed, gameScore, type CommentaryBlock, type CommentaryNames, type CommentaryRow } from './tennis/commentaryModel.ts';

export type { CommentaryBlock, CommentaryNames, CommentaryRow } from './tennis/commentaryModel.ts';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

const article = (x: string) => (/^[aeiou]/i.test(x) ? `an ${x}` : `a ${x}`);

/** The sentence a described rally reads with (undefined = no detail).
 *  `unit` = 'rally' for a side-out rally that won only the serve. */
export function racketSentence(sport: DepthSport, p: PointInput, who: { winner: string; loser: string; server: string }, unit: 'point' | 'rally' = 'point'): string | undefined {
  if (p.pen) return undefined;
  if (p.df) return `${p.df.playerName || who.server} double faults`;
  if (p.kind === 'ace' || p.pd?.how === 'ace') return `${who.winner} wins the ${unit} with an Ace`;
  const pd = p.pd;
  if (!pd) return undefined;
  const phrase = shotPhrase(sport, shotOf(sport, pd), true);
  const what = (s: string) => article(phrase ? `${phrase} ${s}` : s);
  const et = errTypeOf(sport, pd);
  const type = et && STROKES[et] ? ` (${STROKES[et].label.toLowerCase()})` : '';
  const loser = pd.err?.playerName || who.loser;
  switch (pd.how) {
    case 'sw': return `${who.winner} wins the ${unit} with a Service Winner`;
    case 'winner': return `${who.winner} wins the ${unit} with ${what('Winner')}`;
    case 'fe': return `${loser} loses the ${unit} with ${what('Forced Error')}`;
    case 'ue': return `${loser} loses the ${unit} with ${what('Unforced Error')}${type}`;
    case 'sf': return `${loser} loses the ${unit} with a Service Fault${type}`;
    case 'stroke': return `Stroke to ${who.winner}`;
    case 'nolet': return `No let to ${loser} — ${unit} to ${who.winner}`;
    default: return undefined;
  }
}

/** The serve-change call when the server changes after a rally. */
const SERVE_CHANGE: Record<Exclude<DepthSport, 'padel'>, string> = {
  badminton: 'Service over', tabletennis: 'Change of service', squash: 'Hand-out', pickleball: 'Side out',
};

// The rally sports' reducers (labels don't matter here: only the score is read).
const rallyEngine = (id: 'tabletennis' | 'squash' | 'pickleball') =>
  makeRallyEngine({ id, icon: '', sideOutValue: '__n/a__', sideOutLabel: '', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } }).reducer;
const RALLY_REDUCERS = { tabletennis: rallyEngine('tabletennis'), squash: rallyEngine('squash'), pickleball: rallyEngine('pickleball') };
const RALLY_CUES: Record<'tabletennis' | 'squash' | 'pickleball', (s: RallyState) => Cue | null> = { tabletennis: tableTennisCue, squash: squashCue, pickleball: pickleballCue };

interface Draft { block: CommentaryBlock; chrono: CommentaryRow[]; serving: Extract<CommentaryRow, { kind: 'serving' }>; named: boolean; gameRow?: Extract<CommentaryRow, { kind: 'game' }> }

type GameState = badminton.BadmintonState | RallyState;

/** The commentary blocks of a badminton / table tennis / squash / padel /
 *  pickleball match, newest first. Empty before the first rally (and before
 *  the first server is picked). */
export function racketCommentary(sport: DepthSport, state: unknown, names: CommentaryNames): CommentaryBlock[] {
  const s0 = state as (GameState | padel.PadelState) & { serverPicked?: boolean } | null;
  if (!s0 || !Array.isArray(s0.events)) return [];
  const events: LiveEvent[] = s0.events;
  const isRally = sport === 'tabletennis' || sport === 'squash' || sport === 'pickleball';
  const rowList: EditRow[] = isRally ? rallyRows(events) : pointRows(events);
  const rows = new Map(rowList.map((r, i) => [r.e.id, { p: r.p, i }]));
  const t0 = events.find((e) => typeof e.at === 'number')?.at;
  const roster = (side: Side) => (side === 'home' ? names.homeRoster : names.awayRoster) ?? [];
  const sideName = (side: Side) => (side === 'home' ? names.homeName : names.awayName);
  const doubles = !!(s0 as { doubles?: boolean }).doubles;
  const solo = (side: Side) => (!doubles && roster(side).length === 1 ? roster(side)[0].name : undefined);
  const playerOf = (side: Side) => solo(side) ?? sideName(side);
  const nameOfId = (id?: string) => (id ? [...roster('home'), ...roster('away')].find((p) => p.id === id)?.name : undefined);
  // who served each rally (SD-22 replay; doubles named where the sport knows)
  const st = serveStats(sport, s0, { home: roster('home').map((p) => p.id), away: roster('away').map((p) => p.id) });
  const traceOf = new Map<number, RallyTrace>((st?.trace ?? []).map((t) => [t.i, t]));
  const serverNameOf = (side: Side, id?: string) => nameOfId(id) || playerOf(side);

  const drafts: Draft[] = [];
  const byKey = new Map<string, Draft>();
  const push = (d: Draft) => { drafts.push(d); byKey.set(d.block.key, d); return d; };
  const markRow = (e: LiveEvent): CommentaryRow => {
    const time = elapsed(e.at, t0);
    const side = e.side === 'home' || e.side === 'away' ? e.side : undefined;
    // a squash let: who appealed, when the scorer named it
    const detail = e.kind === 'let' && side ? `Appeal by ${playerOf(side)} · rally replayed` : e.detail;
    return { kind: 'mark', id: e.id, ...(side ? { side } : {}), icon: e.icon, text: e.label, ...(detail ? { detail } : {}), ...(time ? { time } : {}) };
  };
  const finish = () => drafts.map((d) => ({
    ...d.block,
    rows: [...(d.gameRow ? [d.gameRow] : []), ...[...d.chrono].reverse(), d.serving],
  })).reverse();

  // ------------------------------------------------------------ padel --
  if (sport === 'padel') {
    const ps = s0 as padel.PadelState;
    const serverName = (s: padel.PadelState) => {
      const { side, slot } = padel.serveInfo(s);
      return (ps.doubles ? roster(side)[slot]?.name : solo(side)) || sideName(side);
    };
    const gamesDone = (s: padel.PadelState) => (s.sets ?? []).reduce((n, g) => n + g[0] + g[1], 0) + (s.games?.home ?? 0) + (s.games?.away ?? 0);
    let cur: padel.PadelState = { ...ps, serveDetail: undefined, pts: { home: 0, away: 0 }, games: { home: 0, away: 0 }, sets: [], setsWon: { home: 0, away: 0 }, tb: [], events: [], seq: 0, ended: false };
    const draftFor = (s: padel.PadelState, at?: number): Draft => {
      const set = s.sets.length + 1;
      const tb = padel.inTiebreak(s);
      const game = tb ? 0 : s.games.home + s.games.away + 1;
      const key = `${set}:${game}`;
      const have = byKey.get(key);
      if (have) return have;
      const side = padel.serveInfo(s).side;
      const name = serverName(s);
      const time = elapsed(at, t0);
      return push({
        block: { key, title: tb ? `Set ${set} · ${padel.matchTbActive(s) ? 'Match tiebreak' : 'Tiebreak'}` : `Set ${set} · Game ${game}`, set, game, done: false, rows: [] },
        chrono: [], named: true,
        serving: { kind: 'serving', side, name, text: tb ? `${name} serves first in the tiebreak` : `${name} is serving game ${game}`, ...(time ? { time } : {}) },
      });
    };
    for (const e of events) {
      const r = rows.get(e.id);
      if (r) {
        const { p } = r;
        const b = cur;
        const d = draftFor(b, e.at);
        const S = padel.serveInfo(b).side;
        const W = p.side, L = opp(W);
        const tb = padel.inTiebreak(b);
        const deciding = padel.decidingPoint(b);
        const next = replayPoints(padel.reducer, { ...b, events: [] }, [p]);
        const gameOver = gamesDone(next) > gamesDone(b) || next.sets.length > b.sets.length || (next.ended && !b.ended);
        const score = tb
          ? (() => { const a = { ...b.pts, [W]: b.pts[W] + 1 }; return `${a[S]} - ${a[opp(S)]}`; })()
          : gameOver ? 'Game' : gameScore(next.pts, S, b.goldenPoint);
        const winner = (p.kind !== 'rally' && p.playerName) || playerOf(W);
        const server = serverName(b);
        const text = p.pen ? [e.label, e.detail].filter(Boolean).join(' · ') : racketSentence('padel', p, { winner, loser: playerOf(L), server });
        const meta = [
          deciding === 'golden' ? 'Golden point' : deciding === 'star' ? 'Star point' : '',
          p.serve === 2 && !p.df ? '2nd serve' : '',
          ...annotations('padel', p, W, playerOf),
        ].filter(Boolean).join(' · ');
        const time = elapsed(e.at, t0);
        d.chrono.push({ kind: 'point', id: e.id, side: W, name: winner, title: `Point to ${winner}`, ...(time ? { time } : {}), ...(text ? { text } : {}), ...(meta ? { meta } : {}), score, ...(p.pen ? { penalty: true } : {}) });
        const cue = padel.padelCue(next);
        if (cue) d.chrono.push({ kind: 'cue', text: cue.text });
        if (gameOver) {
          const setOver = next.sets.length > b.sets.length;
          const g = setOver ? next.sets[next.sets.length - 1] : [next.games.home, next.games.away];
          const team = playerOf(W);
          d.block.done = true;
          d.gameRow = {
            kind: 'game', side: W, name: team, text: `${team} wins the ${tb ? 'tiebreak' : 'game'}`, score: `${g[0]}-${g[1]}`,
            ...(next.ended ? { note: 'Game, set and match' } : setOver ? { note: `Game and set · Set ${b.sets.length + 1}` } : !tb && W !== S ? { note: 'Break of serve' } : {}),
          };
        }
        cur = next;
        continue;
      }
      if (isMark(e)) draftFor(cur, e.at).chrono.push(markRow(e));
    }
    if (!cur.ended && (drafts.length > 0 || ps.serverPicked)) draftFor(cur);
    return finish();
  }

  // ------------------------------------------- the game sports (rally scoring / side-out) --
  const reducer = (sport === 'badminton' ? badminton.reducer : RALLY_REDUCERS[sport]) as (s: GameState, a: import('./types').ScoreAction) => GameState;
  const cueOf = (s: GameState): Cue | null => (sport === 'badminton' ? badminton.badmintonCue(s as badminton.BadmintonState) : RALLY_CUES[sport](s as RallyState));
  const g0 = s0 as GameState;
  let cur: GameState = sport === 'badminton'
    ? { ...(g0 as badminton.BadmintonState), current: { home: 0, away: 0 }, games: [], gamesWon: { home: 0, away: 0 }, events: [], seq: 0, ended: false }
    : (() => { const x = g0 as RallyState; return { ...x, current: { home: 0, away: 0 }, games: [], gamesWon: { home: 0, away: 0 }, serving: x.opening ?? 'home', serverNo: 2 as const, srvStarter: true, events: [], seq: 0, ended: false }; })();
  const sideOut = isRally && !!(g0 as RallyState).sideOut;
  /** who serves the next rally of `s` (the replayed state: its events hold the last rally only) */
  const nextServer = (s: GameState): Side => {
    if (sport === 'badminton') return badminton.serve(s as badminton.BadmintonState).side;
    const x = s as RallyState;
    if (sport === 'tabletennis') return ttServer(x.current.home, x.current.away, x.games.length, x.opening ?? 'home', x.target);
    return rallyServingSide(x);
  };
  const total = (s: GameState) => s.games.reduce((n, g) => n + g[0] + g[1], 0) + s.current.home + s.current.away;
  const draftFor = (s: GameState, at?: number): Draft => {
    const game = s.games.length + 1;
    const key = `g${game}`;
    const have = byKey.get(key);
    if (have) return have;
    const side = nextServer(s);
    const name = playerOf(side);
    const time = elapsed(at, t0);
    return push({
      block: { key, title: `Game ${game}`, set: 1, game, done: false, rows: [] },
      chrono: [], named: false,
      serving: { kind: 'serving', side, name, text: `${name} serves first`, ...(time ? { time } : {}) },
    });
  };
  for (const e of events) {
    const r = rows.get(e.id);
    if (r) {
      const { p, i } = r;
      const b = cur;
      const d = draftFor(b, e.at);
      const tr = traceOf.get(i);
      const S: Side = tr?.server ?? nextServer(b);
      // the game's first rally names its server (doubles: the player serveStats names)
      if (!d.named && !p.pen) {
        const nm = serverNameOf(S, tr?.serverId);
        d.serving = { ...d.serving, side: S, name: nm, text: `${nm} serves first` };
        d.named = true;
      }
      const W = p.side, L = opp(W);
      const next = replayPoints(reducer, { ...b, events: [] } as GameState, [p]);
      const gameOver = next.games.length > b.games.length || (next.ended && !b.ended);
      const scored = total(next) > total(b);
      const unit: 'point' | 'rally' = scored || p.pen ? 'point' : 'rally';
      const winner = (p.kind !== 'rally' && p.playerName) || playerOf(W);
      const server = serverNameOf(S, tr?.serverId);
      const text = p.pen ? [e.label, e.detail].filter(Boolean).join(' · ') : racketSentence(sport, p, { winner, loser: playerOf(L), server }, unit);
      let score: string;
      let call = '';
      if (gameOver) {
        const g = next.games[next.games.length - 1] ?? [next.current.home, next.current.away];
        const gw = g[0] >= g[1] ? 'home' : 'away';
        score = gw === 'home' ? `${g[0]}-${g[1]}` : `${g[1]}-${g[0]}`;
      } else {
        const NS = nextServer(next);
        const x = next as RallyState;
        score = `${next.current[NS]}-${next.current[opp(NS)]}${sideOut && doubles ? `-${x.serverNo}` : ''}`;
        if (!p.pen) {
          if (sideOut && !scored) call = doubles && (b as RallyState).serverNo === 1 && NS === S ? 'Second server' : sport === 'squash' ? 'Hand-out' : 'Side out';
          else if (!sideOut && NS !== S) call = SERVE_CHANGE[sport];
          if (call && call !== 'Second server') call = `${call} · ${playerOf(NS)} to serve`;
        }
      }
      const meta = [call, ...annotations(sport, p, W, playerOf)].filter(Boolean).join(' · ');
      const time = elapsed(e.at, t0);
      d.chrono.push({
        kind: 'point', id: e.id, side: W, name: winner, title: `${unit === 'point' ? 'Point' : 'Rally'} to ${winner}`,
        ...(time ? { time } : {}), ...(text ? { text } : {}), ...(meta ? { meta } : {}), score, ...(p.pen ? { penalty: true } : {}),
      });
      const cue = cueOf(next);
      if (cue) d.chrono.push({ kind: 'cue', text: cue.text });
      if (gameOver) {
        const g = next.games[next.games.length - 1] ?? [0, 0];
        const gw: Side = g[0] >= g[1] ? 'home' : 'away';
        const team = playerOf(gw);
        const gm = next.gamesWon;
        const lead = gm.home === gm.away ? `Games level ${gm.home}-${gm.away}`
          : `${playerOf(gm.home > gm.away ? 'home' : 'away')} leads ${Math.max(gm.home, gm.away)}-${Math.min(gm.home, gm.away)} in games`;
        d.block.done = true;
        d.gameRow = {
          kind: 'game', side: gw, name: team, text: `${team} wins game ${b.games.length + 1}`,
          score: gw === 'home' ? `${g[0]}-${g[1]}` : `${g[1]}-${g[0]}`,
          note: next.ended ? 'Game and match' : lead,
        };
      }
      cur = next;
      continue;
    }
    if (isMark(e)) draftFor(cur, e.at).chrono.push(markRow(e));
  }
  if (!cur.ended && (drafts.length > 0 || s0.serverPicked)) draftFor(cur);
  return finish();
}

/** The rally's extra marks for the meta line: rally length, net / kitchen,
 *  the 3rd shot. */
function annotations(sport: DepthSport, p: PointInput, W: Side, playerOf: (s: Side) => string): string[] {
  const out: string[] = [];
  if (p.rallyLen) out.push(sport === 'tabletennis' ? TT_PHASE_LABEL[p.rallyLen] ?? RALLY_LABEL[p.rallyLen] : RALLY_LABEL[p.rallyLen]);
  const nw = NET_WORDS[sport];
  const net = nw ? netSides(p, W) : [];
  if (nw && net.length) out.push(`${nw.at}: ${net.map((x) => playerOf(x)).join(' & ')}`);
  if (p.third) out.push(THIRD_LABEL[p.third]);
  return out;
}
