/**
 * Snooker commentary: visit by visit, newest first, grouped by frame
 * ("Ravi — break of 54, then missed a pot · Ravi leads 58–20"). PURE: derived
 * from the state's frames (they replay from the event log), so an undo or a
 * correction re-derives it. Names come from the caller, for this viewer
 * (IDs-only scoring: the state holds sides only).
 */
import type { FeedGroup, FeedItem } from '../gcc/model.ts';
import { maxBreak, type FoulKind, type Side, type SnookerState } from './engine.ts';
import { readFrames, timeline, type RFoul, type RFrame } from './read.ts';
import { capFeed } from '../cue/uiState.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Short words for a foul's kind, inside a sentence. */
export const KIND_WORD: Record<FoulKind, string> = {
  inOff: 'in-off', noContact: 'missed every ball', wrongBall: 'wrong ball first', pottedWrong: 'potted a ball not on', push: 'push stroke',
  jump: 'jump shot', touch: 'touched a ball', offTable: 'ball off the table', other: 'other',
};

function howText(f: RFrame, name: (s: Side) => string): string {
  switch (f.how) {
    case 'black': return 'on the black';
    case 'foul': return 'on a foul';
    case 'respot': return 'on the re-spotted black';
    case 'concede': return f.conceded ? `${name(f.conceded)} conceded` : 'conceded';
    case 'award': return `awarded${f.reason === 'miss' ? ' (foul and a miss)' : f.reason ? ` (${f.reason})` : ''}`;
    case 'quick': return 'score only';
    default: return '';
  }
}

function foulText(x: RFoul, name: (s: Side) => string, brk: number): string {
  const extras = [
    ...(x.miss ? ['foul and a miss'] : []),
    ...(x.fb ? ['free ball'] : []),
    ...(x.reds ? [`${plural(x.reds, 'red')} off the table`] : []),
  ];
  return `${name(x.by)} fouled${x.kind ? ` (${KIND_WORD[x.kind]})` : ''}: ${x.value} to ${name(other(x.by))}${brk > 0 ? ` after a break of ${brk}` : ''}${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
}

const leadText = ([h, a]: [number, number], name: (s: Side) => string) =>
  (h === a ? `Level ${h}–${a}` : `${name(h > a ? 'home' : 'away')} leads ${Math.max(h, a)}–${Math.min(h, a)}`);

/** The commentary groups (newest frame first, newest line first). */
export function snookerFeed(s: SnookerState, names: { home: string; away: string }): FeedGroup[] {
  try {
    return feedOf(s, names);
  } catch {
    return [];
  }
}

function feedOf(s: SnookerState, names: { home: string; away: string }): FeedGroup[] {
  const name = (sd: Side) => (sd === 'home' ? names.home : names.away);
  const reds = s?.reds === 6 || s?.reds === 10 ? s.reds : 15;
  const max = maxBreak(reds);
  const groups: FeedGroup[] = [];
  for (const f of readFrames(s)) {
    const items: FeedItem[] = [];
    timeline(f).forEach((st, i) => {
      const id = `${f.n}-${i}`;
      const score = leadText(st.after, name);
      if (st.kind === 'penalty') {
        items.push({ id, text: `${name(st.foul.by)} penalised while not at the table: ${st.foul.value} to ${name(other(st.foul.by))}`, score, side: other(st.foul.by), icon: '⚠️' });
        return;
      }
      const { v } = st;
      const who = name(v.side);
      let text: string;
      if (st.foul) text = foulText(st.foul, name, v.pts);
      else if (v.end === 'live') text = `${who} at the table — break of ${v.pts} so far`;
      else if (v.end === 'safety') text = v.pts > 0 ? `${who} — break of ${v.pts}, then played safe` : `${who} played a safety`;
      else if (v.end === 'respot') text = `${who} — break of ${v.pts}: level, the black is re-spotted`;
      else if (v.end === 'frame') text = `${who} — break of ${v.pts}`;
      else text = v.pts > 0 ? `${who} — break of ${v.pts}, then missed a pot` : `${who} missed a pot`;
      const maximum = v.pts === max && !v.fb && v.end !== 'live';
      const icon = maximum ? '🏆' : v.pts >= 100 ? '💯' : v.pts >= 50 ? '🔥' : st.foul ? '⚠️' : undefined;
      items.push({
        id, text: maximum ? `${text} · a maximum!` : text, score, side: st.foul ? st.foul.by : v.side,
        ...(icon ? { icon } : {}), ...(v.pts >= 100 ? { big: true } : {}),
      });
    });
    const [h, a] = f.score;
    if (!f.live && f.winner) {
      const w = f.winner;
      const ws = w === 'home' ? h : a;
      const ls = w === 'home' ? a : h;
      const how = howText(f, name);
      items.push({ id: `${f.n}-end`, text: `Frame ${f.n} to ${name(w)}, ${ws}–${ls}${how ? ` · ${how}` : ''}`, score: `${name(w)} wins the frame`, side: w, icon: '🏁' });
    }
    const rr = f.reracks ? ` · re-racked ${f.reracks === 1 ? 'once' : `${f.reracks} times`}` : '';
    const won = f.winner === 'home' ? `${h}–${a}` : `${a}–${h}`;
    groups.push({
      key: `f${f.n}`,
      title: `Frame ${f.n}`,
      subtitle: f.live || !f.winner
        ? `In play · ${names.home} ${h}–${a} ${names.away}${f.respot ? ' · re-spotted black' : ''}${rr}`
        : `${name(f.winner)} won ${won}${rr}`,
      // A-04 — a page of the newest lines per frame (a junk-filled frame can't freeze the tab)
      items: capFeed(items.reverse(), `f${f.n}`),
    });
  }
  return groups.reverse();
}
