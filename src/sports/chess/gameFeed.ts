/**
 * Deep wave — chess commentary. PURE (tests/chess-deep.test.mts).
 *   • A game with a move list: one item per half-move, grouped by move number,
 *     newest first — "23. Nxe5+ — Anand: knight takes the pawn on e5, check" —
 *     with the material after it, the clock left and the time it was entered;
 *     the result on top.
 *   • A result-only game: the result in a sentence (method, length, clocks,
 *     opening when named).
 *   • A knockout mini-match: one item per game, grouped by stage; round 2 —
 *     a game kept with its own move list shows its moves under its result
 *     (and the game in play its moves so far).
 * Derived from the state (the event log), so a taken-back move re-derives it.
 */
import { clockText, koPhases, koStatus, KO_PHASE_LABEL, METHOD_LABEL, isDoubleForfeit, openingOf, resultSentence, listMoves, type ChessState, type Side } from './engine.ts';
import { plies, plyWords, materialText } from './gameStats.ts';
import type { FeedGroup, FeedItem } from '../gcc/model.ts';

/** The result line as an item (null while the game is on). */
function resultItem(s: ChessState, name: (sd: Side) => string): FeedItem | null {
  if (!s.ended || !s.winner || s.ko) return null;
  const black: Side = s.white === 'home' ? 'away' : 'home';
  const len = s.moves ?? (listMoves(s.game) || undefined);
  const sentence = resultSentence(s.white, s.winner, name(s.white), name(black), s.method);
  const sub = [
    len && !isDoubleForfeit(s.method) && s.method !== 'forfeit' ? `${len} moves` : '',
    s.clock && (s.clock.white != null || s.clock.black != null) ? `⏱ White ${s.clock.white != null ? clockText(s.clock.white) : '–'} · Black ${s.clock.black != null ? clockText(s.clock.black) : '–'}` : '',
  ].filter(Boolean).join(' · ');
  return {
    id: 'result', text: sentence, icon: '🏁', big: true,
    ...(s.winner !== 'draw' ? { side: s.winner } : {}),
    ...(sub ? { sub } : {}), ...(s.resultAt ? { at: s.resultAt } : {}),
  };
}

/** One item per half-move of a move list ("23. Nxe5+ — Anand: …"), in
 *  play order; `white` = the side with White, `tag` = an id prefix and a
 *  sub-line prefix (a knockout game: "Game 2"). */
function plyItems(game: ChessState['game'], white: Side, tc: string | undefined, name: (sd: Side) => string, tag?: { id: string; label: string }): { moveNo: number; item: FeedItem }[] {
  const black: Side = white === 'home' ? 'away' : 'home';
  return plies(game, tc).map((pl) => {
    const sd = pl.color === 'w' ? white : black;
    const sub = [tag?.label ?? '', pl.clk != null ? `⏱ ${clockText(pl.clk)} left` : '', pl.think != null ? `${clockText(pl.think)} on the move` : ''].filter(Boolean).join(' · ');
    return {
      moveNo: pl.moveNo,
      item: {
        id: `${tag?.id ?? ''}p${pl.i}`,
        text: `${pl.moveNo}${pl.color === 'w' ? '.' : '…'} ${pl.san} — ${name(sd)}: ${plyWords(pl)}`,
        score: materialText(pl.mat),
        side: sd,
        ...(pl.mate || pl.move.promotion ? { big: true } : {}),
        ...(pl.mate ? { icon: '#️⃣' } : pl.move.castle ? { icon: '🏰' } : {}),
        ...(sub ? { sub } : {}),
        ...(pl.at ? { at: pl.at } : {}),
      },
    };
  });
}

export function chessFeed(s: ChessState, names: { home: string; away: string }): FeedGroup[] {
  const name = (sd: Side) => (sd === 'home' ? names.home : names.away);
  // a knockout mini-match: game by game
  if (s.ko) {
    const phases = koPhases(s.ko.plan);
    const groups = new Map<number, FeedItem[]>();
    s.ko.games.forEach((g, k) => {
      const bl: Side = g.white === 'home' ? 'away' : 'home';
      const ph = phases[g.phase];
      const items = groups.get(g.phase) ?? [];
      // Round 2 — a game kept with its own move list: its moves (in play
      // order; the group is reversed below → newest first), then its result
      const op = g.game || g.opening ? openingOf({ game: g.game, opening: g.opening }) : null;
      if (g.game?.san.length) items.push(...plyItems(g.game, g.white, s.tcExact, name, { id: `ko${k}`, label: `Game ${k + 1}` }).map((x) => x.item));
      const len = g.moves ?? (listMoves(g.game) || undefined);
      const subParts = [len ? `${len} moves` : '', op ? `${op.eco} ${op.name}` : '', ph?.kind === 'armageddon' && g.winner === 'draw' ? `${name(bl)} (Black) goes through` : ''].filter(Boolean);
      items.push({
        id: `ko${k}`, text: `Game ${k + 1}: ${resultSentence(g.white, g.winner, name(g.white), name(bl), g.method)}`,
        ...(g.winner !== 'draw' ? { side: g.winner } : {}),
        ...(subParts.length ? { sub: subParts.join(' · ') } : {}),
        ...(g.at ? { at: g.at } : {}),
      });
      groups.set(g.phase, items);
    });
    // Round 2 — the game in play's moves (an undecided knockout match)
    if (!s.ended && s.game?.san.length) {
      const now = koStatus(s.ko);
      const k = s.ko.games.length;
      const items = groups.get(now.phase) ?? [];
      items.push(...plyItems(s.game, s.white, s.tcExact, name, { id: `ko${k}`, label: `Game ${k + 1}` }).map((x) => x.item));
      groups.set(now.phase, items);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([i, items]) => {
      const ph = phases[i];
      const title = ph.kind === 'main' ? (ph.games > 1 ? 'Mini-match' : 'Game') : ph.kind === 'armageddon' ? 'Armageddon' : `${KO_PHASE_LABEL[ph.kind]}${ph.n && ph.n > 1 ? ` ${ph.n}` : ''}`;
      return { key: `ko${i}`, title, items: [...items].reverse() };
    });
  }
  const groups: FeedGroup[] = [];
  const res = resultItem(s, name);
  if (res) {
    const op = openingOf(s);
    groups.push({ key: 'result', title: 'Result', subtitle: op ? `${op.eco} ${op.name}` : s.method ? METHOD_LABEL[s.method] : undefined, items: [res] });
  }
  const byMove = new Map<number, FeedItem[]>();
  for (const { moveNo, item } of plyItems(s.game, s.white, s.tcExact, name)) {
    const items = byMove.get(moveNo) ?? [];
    items.push(item);
    byMove.set(moveNo, items);
  }
  const op = openingOf(s);
  [...byMove.entries()].sort((a, b) => b[0] - a[0]).forEach(([n, items]) => {
    groups.push({ key: `m${n}`, title: `Move ${n}`, ...(n === 1 && op ? { subtitle: `${op.eco} ${op.name}` } : {}), items: [...items].reverse() });
  });
  return groups;
}
