/**
 * SD-144 — baseball's score-ticker cells and home-run flash (parity #25).
 * PURE. The detail line is the situation a broadcast bug shows: inning, outs,
 * count and the runners ("▲ 7th · 2 out · 3-2 · 1B 3B"); the side cells name
 * the pitcher (with his pitch count) and the batter.
 */
import { countText, halfShort, situation, statusText, whoKey, type BaseballState } from './engine.ts';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';
import { withNames } from './names.ts';
import { legacyNameOf, type NameOf } from '../../core/playerNames.ts';

export const basesText = (s: BaseballState): string => {
  const on = (['1B', '2B', '3B'] as const).filter((_, i) => !!s.g.bases[i]);
  return on.length === 3 ? 'bases loaded' : on.length ? on.join(' ') : 'bases empty';
};

/** IDs-only scoring: the pitcher and batter are named by id for this viewer
 *  (`names.player` — the public overlay gets initials for a child). */
export function baseballTickerDetail(state: BaseballState, names?: { player?: NameOf }): TickerDetail {
  const s = withNames(state, names?.player ?? legacyNameOf);
  const d: TickerDetail = {};
  if (s.g.ended) { d.detail = statusText(s); return d; }
  if (!s.events.length) return d;
  const sit = situation(s);
  d.detail = `${halfShort(s.g.half)} · ${s.g.outs} out · ${countText(s.g)} · ${basesText(s)}`;
  d.batting = sit.bat;
  const pk = whoKey(sit.pitcher);
  const pitch = sit.pitcher ? [`⚾ ${shortName(sit.pitcher.name) || 'P'}${pk ? ` (${s.g.pitches[pk] ?? 0})` : ''}`] : [];
  const bat = [`🏏 ${shortName(sit.batter.name) || sit.batter.name || 'Batter'}`];
  if (sit.bat === 'home') { d.left = bat; d.right = pitch; } else { d.left = pitch; d.right = bat; }
  return d;
}

/** A new home run → "HOME RUN! Rao" (a grand slam says so). */
export function baseballTickerFlash(prev: BaseballState, next: BaseballState, nameOf: NameOf = legacyNameOf): TickerFlash | null {
  const raw = next.events[next.events.length - 1];
  if (!raw || raw.type !== 'pa' || raw.outcome !== 'HR' || !raw.side || prev.events.some((e) => e.id === raw.id)) return null;
  // the batter named by id for this viewer (IDs-only scoring)
  const last = withNames(next, nameOf).events[next.events.length - 1];
  const runs = next.g.ann[last.id]?.runs ?? 0;
  const who = shortName(last.batter?.name);
  return { kind: 'six', text: `${runs >= 4 ? 'GRAND SLAM!' : 'HOME RUN!'}${who ? ` ${who}` : ''}`, sub: `${next.g.score.home}–${next.g.score.away}`, side: raw.side };
}
