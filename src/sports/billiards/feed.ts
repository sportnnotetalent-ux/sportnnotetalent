/**
 * English billiards commentary: visit by visit, newest first, grouped by
 * frame (a single game: "Game 1"), each break with its strokes ("break of 80
 * (10 red pots, 10 cannons)") and the running score. PURE, derived from the
 * state's frames; names come from the caller (IDs-only scoring).
 */
import type { FeedGroup, FeedItem } from '../gcc/model.ts';
import type { BilliardsState, FoulKind, Part, Side } from './engine.ts';
import { readFrames, timeline, type RFrame, type RVisit } from './read.ts';
import { capFeed } from '../cue/uiState.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const PART_WORDS: Array<[Part, string, string]> = [
  ['potRed', 'red pot', 'red pots'], ['inOffRed', 'in-off from the red', 'in-offs from the red'], ['cannon', 'cannon', 'cannons'],
  ['potWhite', 'white pot', 'white pots'], ['inOffWhite', 'in-off from the white', 'in-offs from the white'],
];
/** "4 red pots, 2 cannons" */
export const strokeSummary = (v: RVisit): string => PART_WORDS.filter(([k]) => v[k] > 0).map(([k, one, many]) => count(v[k], one, many)).join(', ');

export const KIND_WORD: Record<FoulKind, string> = {
  miss: 'missed every ball', coup: 'coup', inHand: 'playing from hand', push: 'push stroke', jump: 'jump shot', touch: 'touched a ball',
  offTable: 'ball off the table', hazards: 'too many hazards', cannons: 'too many cannons', baulkLine: 'baulk line', other: 'other',
};

function howText(f: RFrame, name: (s: Side) => string, target: number): string {
  switch (f.how) {
    case 'target': return `reached ${target}`;
    case 'time': return 'at time';
    case 'sudden': return 'in sudden death';
    case 'draw': return 'a draw';
    case 'concede': return f.conceded ? `${name(f.conceded)} conceded` : 'conceded';
    case 'award': return `awarded${f.reason ? ` (${f.reason})` : ''}`;
    case 'quick': return 'score only';
    default: return '';
  }
}

const leadText = ([h, a]: [number, number], name: (s: Side) => string) =>
  (h === a ? `Level ${h}–${a}` : `${name(h > a ? 'home' : 'away')} leads ${Math.max(h, a)}–${Math.min(h, a)}`);

/** `unit`: what a frame is called ("frame"; a single game: "game"). */
export function billiardsFeed(s: BilliardsState, names: { home: string; away: string }, unit: 'frame' | 'game'): FeedGroup[] {
  try {
    return feedOf(s, names, unit);
  } catch {
    return [];
  }
}

function feedOf(s: BilliardsState, names: { home: string; away: string }, unit: 'frame' | 'game'): FeedGroup[] {
  const name = (sd: Side) => (sd === 'home' ? names.home : names.away);
  const Unit = unit === 'game' ? 'Game' : 'Frame';
  const target = typeof s?.target === 'number' ? s.target : 150;
  const groups: FeedGroup[] = [];
  for (const f of readFrames(s)) {
    const items: FeedItem[] = [];
    timeline(f).forEach((st, i) => {
      const { v } = st;
      const who = name(v.side);
      const parts = strokeSummary(v);
      const brk = v.pts > 0 ? `${who} — break of ${v.pts}${parts ? ` (${parts})` : ''}` : '';
      let text: string;
      // cue batch 5 (audit row 13): the make-up on every break line, the foul's and the one in play too
      const made = parts ? ` (${parts})` : '';
      if (st.foul) text = `${who} fouled${st.foul.kind ? ` (${KIND_WORD[st.foul.kind]})` : ''}: ${st.foul.value} to ${name(other(v.side))}${v.pts > 0 ? ` after a break of ${v.pts}${made}` : ''}`;
      else if (v.end === 'live') text = `${who} at the table — break of ${v.pts} so far${v.pts > 0 ? made : ''}`;
      else if (v.end === 'safety') text = brk ? `${brk}, then played safe` : `${who} played safe`;
      else if (v.end === 'frame') text = brk || `${who} ended the ${unit}`;
      else text = brk ? `${brk}, then missed` : `${who} missed`;
      const icon = v.pts >= 100 ? '💯' : v.pts >= 50 ? '🔥' : st.foul ? '⚠️' : undefined;
      items.push({ id: `${f.n}-${i}`, text, score: leadText(st.after, name), side: v.side, ...(icon ? { icon } : {}), ...(v.pts >= 100 ? { big: true } : {}) });
    });
    const [h, a] = f.score;
    if (!f.live && f.winner) {
      const how = howText(f, name, target);
      if (f.winner === 'draw') {
        items.push({ id: `${f.n}-end`, text: `${Unit} ${f.n} drawn, ${h}–${a}${how ? ` · ${how}` : ''}`, score: 'Drawn', icon: '🏁' });
      } else {
        const w = f.winner;
        items.push({
          id: `${f.n}-end`, text: `${Unit} ${f.n} to ${name(w)}, ${w === 'home' ? h : a}–${w === 'home' ? a : h}${how ? ` · ${how}` : ''}`,
          score: `${name(w)} wins the ${unit}`, side: w, icon: '🏁',
        });
      }
    }
    groups.push({
      key: `f${f.n}`,
      title: `${Unit} ${f.n}`,
      subtitle: f.live || !f.winner
        ? `In play · ${names.home} ${h}–${a} ${names.away}${f.sudden ? ' · sudden death' : ''}`
        : f.winner === 'draw' ? `Drawn ${h}–${a}` : `${name(f.winner)} won ${f.winner === 'home' ? `${h}–${a}` : `${a}–${h}`}`,
      // A-04 — a page of the newest lines per frame (a junk-filled frame can't freeze the tab)
      items: capFeed(items.reverse(), `f${f.n}`),
    });
  }
  return groups.reverse();
}
