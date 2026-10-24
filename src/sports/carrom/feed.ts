/**
 * Deep wave — carrom board-by-board commentary (ICF score sheet in words):
 * "Board 5 — Rahul clears with the Queen, +4 · Rahul leads 17–9". Newest first,
 * grouped by game, the running game score after each board, the time the board
 * was recorded, and the optional detail (break, fouls, dues, missed covers)
 * when it was tracked. PURE: derived from the state's boards (which replay
 * from the event log), so a board correction re-derives the feed.
 */
import { scoreSheet, FOUL_TYPES, FOUL_LABEL, type BoardDetail, type CarromState, type Side } from './engine.ts';
import type { FeedGroup, FeedItem } from '../gcc/model.ts';
import { legacyNameOf, whoName, type NameOf } from '../racketNames.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Priya 2 (striker pocketed, touching) · Rahul 1 (thumbing)" */
export function foulText(det: BoardDetail | undefined, name: (s: Side) => string): string {
  if (!det?.fouls) return '';
  const parts: string[] = [];
  for (const sd of ['home', 'away'] as Side[]) {
    const by = det.fouls[sd];
    if (!by) continue;
    const n = FOUL_TYPES.reduce((t, k) => t + (by[k] ?? 0), 0);
    if (!n) continue;
    const kinds = FOUL_TYPES.filter((k) => by[k]).map((k) => `${FOUL_LABEL[k].toLowerCase()}${(by[k] ?? 0) > 1 ? ` ×${by[k]}` : ''}`);
    parts.push(`${name(sd)} ${n} (${kinds.join(', ')})`);
  }
  return parts.length ? `Fouls — ${parts.join(' · ')}` : 'No fouls';
}

/** The commentary groups (newest game first, newest board first). IDs-only
 *  scoring: a doubles breaker is named by id for this viewer (`nameOf`; an
 *  older log's stored name is the fallback — unchanged with no lookup). */
export function carromFeed(s: CarromState, names: { home: string; away: string }, nameOf: NameOf = legacyNameOf): FeedGroup[] {
  const name = (sd: Side) => (sd === 'home' ? names.home : names.away);
  const sheet = scoreSheet(s);
  const boards = s?.boards ?? [];
  let i = 0; // index into s.boards (the sheet lists them in order)
  const groups: FeedGroup[] = [];
  for (const g of sheet) {
    const items: FeedItem[] = [];
    g.rows.forEach((r, ri) => {
      const b = boards[i++];
      const w = r.winner;
      const l = other(w);
      const det = b?.det;
      // what the board did
      let text: string;
      let icon: string | undefined;
      let big = false;
      if (r.penalty) {
        text = `Board ${r.n} — penalty board: ${name(l)} penalised, +${r.pts} to ${name(w)}`;
        icon = '⚠️';
      } else {
        const coins = `${plural(r.coins, 'coin')} left`;
        if (r.queen === 'winner' && r.queenCounted) { text = `Board ${r.n} — ${name(w)} clears with the Queen, +${r.pts} (${coins} + Queen)`; icon = '👑'; }
        else if (r.queen === 'winner') text = `Board ${r.n} — ${name(w)} clears, +${r.pts} (${coins}; Queen covered, no points at 22+)`;
        else if (r.queen === 'loser') text = `Board ${r.n} — ${name(w)} wins the board, +${r.pts} (${coins}; ${name(l)} covered the Queen)`;
        else text = `Board ${r.n} — ${name(w)} wins the board, +${r.pts} (${coins})`;
        if (r.slam) { text = `${text} · ${r.slam === 'white' ? 'White' : 'Black'} slam!`; icon = r.slam === 'white' ? '⚪' : '⚫'; big = true; }
      }
      if (r.tieBreak) text = `${text} · tie-break board`;
      // the running score after it
      const last = ri === g.rows.length - 1;
      let score: string;
      if (last && g.done && g.winner) {
        const hi = Math.max(g.score[0], g.score[1]), lo = Math.min(g.score[0], g.score[1]);
        const gamesH = sheet.filter((x) => x.game <= g.game && x.done && x.winner === 'home').length;
        const gamesA = sheet.filter((x) => x.game <= g.game && x.done && x.winner === 'away').length;
        const matchOver = s.ended && g.game === sheet[sheet.length - 1].game;
        score = `${name(g.winner)} wins Game ${g.game} ${hi}–${lo}${matchOver ? ` and the match ${Math.max(gamesH, gamesA)}–${Math.min(gamesH, gamesA)}` : ` · games ${gamesH}–${gamesA}`}`;
      } else {
        const { home: h, away: a } = r.total;
        score = h === a ? `Level ${h}–${a}` : `${name(h > a ? 'home' : 'away')} leads ${Math.max(h, a)}–${Math.min(h, a)}`;
      }
      // the optional detail
      const sub: string[] = [];
      const brName = (r.breakerBy ? whoName(nameOf, r.breakerBy.id, r.breakerBy.name) : undefined) ?? (r.breaker ? name(r.breaker) : null);
      if (brName) sub.push(`${brName} broke${det?.brk != null ? ` · ${det.brk} pocketed on the break` : ''}`);
      else if (det?.brk != null) sub.push(`${det.brk} pocketed on the break`);
      const f = foulText(det, name);
      if (f) sub.push(f);
      const dues = (['home', 'away'] as Side[]).filter((sd) => det?.dues?.[sd]).map((sd) => `${name(sd)} ${det!.dues![sd]}`);
      if (dues.length) sub.push(`Dues — ${dues.join(' · ')}`);
      const qm = (['home', 'away'] as Side[]).filter((sd) => det?.qMiss?.[sd]).map((sd) => `${name(sd)}${(det!.qMiss![sd] ?? 0) > 1 ? ` ×${det!.qMiss![sd]}` : ''}`);
      if (qm.length) sub.push(`Queen pocketed, cover missed — ${qm.join(' · ')}`);
      // Round 2 — ICF r.102–112: the board ended on the loser's foul
      const ef = b?.endFoul;
      if (ef && (ef.striker || ef.improper)) sub.push(`Ended on ${name(l)}'s foul — ${[ef.striker ? 'striker pocketed +1' : '', ef.improper ? 'foul stroke +1' : ''].filter(Boolean).join(', ')}`);
      items.push({
        id: `${g.game}-${r.n}`, text, score, side: w, ...(icon ? { icon } : {}), ...(big ? { big } : {}),
        ...(sub.length ? { sub: sub.join(' · ') } : {}), ...(b?.at ? { at: b.at } : {}),
      });
    });
    const [h, a] = g.score;
    groups.push({
      key: `g${g.game}`,
      title: `Game ${g.game}`,
      subtitle: g.done && g.winner ? `${name(g.winner)} won ${Math.max(h, a)}–${Math.min(h, a)}` : `in play · ${names.home} ${h}–${a} ${names.away}`,
      items: items.reverse(),
    });
  }
  return groups.reverse();
}
