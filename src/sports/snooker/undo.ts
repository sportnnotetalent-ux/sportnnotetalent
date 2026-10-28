/**
 * Snooker's `undoLabel` (SD-133): what Undo takes back, from the step's type
 * and the states before / after it ("black · break 8", "foul and a miss (4)",
 * "concession · frame 2"). PURE; no names (the state holds sides only, and
 * the bar reads fine without them). Null = the plain "Undo".
 */
import { COLOURS, isSnookerState, type SnookerState, type LiveFrame } from './engine.ts';

type Step = { type: string; prev: unknown; next: unknown } | null | undefined;

const frameOf = (s: unknown): LiveFrame | null => (isSnookerState(s) ? s.frame : null);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function potLabel(prev: SnookerState, next: SnookerState): string | null {
  const pf = prev.frame;
  if (!pf) return null;
  const nf = next.frame;
  let brk: number;
  if (next.frames.length > prev.frames.length) {
    const rec = next.frames[next.frames.length - 1];
    brk = rec.visits?.[rec.visits.length - 1]?.pts ?? pf.visit.pts;
  } else if (nf && nf.respot && !pf.respot) {
    brk = nf.visits[nf.visits.length - 1]?.pts ?? pf.visit.pts;
  } else {
    brk = nf?.visit.pts ?? pf.visit.pts;
  }
  const pts = brk - pf.visit.pts;
  let ball: string;
  if (pf.respot) ball = 'black';
  else if (pf.on === 'red') {
    const reds = pf.redsLeft - (nf?.redsLeft ?? pf.redsLeft);
    ball = reds === 0 ? 'free ball' : pts > reds ? `free ball + ${plural(reds, 'red')}` : reds === 1 ? 'red' : plural(reds, 'red');
  } else if (pf.freeBall && pf.on !== 'colour' && nf && nf.on === pf.on) ball = 'free ball';
  else ball = COLOURS[pts - 2] ?? 'pot';
  return `${ball} · break ${brk}`;
}

function foulLabel(prev: SnookerState, next: SnookerState): string | null {
  const ended = next.frames.length > prev.frames.length;
  const fouls = ended ? next.frames[next.frames.length - 1].fouls : next.frame?.fouls;
  const f = fouls?.[fouls.length - 1];
  if (!f) return null;
  return `${f.penalty ? 'penalty' : f.miss ? 'foul and a miss' : 'foul'} (${f.value})`;
}

export function snookerUndoLabel(step: Step): string | null {
  if (!step) return null;
  try {
    const prev = step.prev as SnookerState;
    const next = step.next as SnookerState;
    const valid = isSnookerState(prev) && isSnookerState(next);
    const n = frameOf(prev)?.n;
    const frame = n ? ` · frame ${n}` : '';
    switch (step.type) {
      case 'POT': return (valid && potLabel(prev, next)) || 'pot';
      case 'MISS': return 'missed pot';
      case 'SAFETY': return 'safety';
      case 'FOUL': return (valid && foulLabel(prev, next)) || 'foul';
      case 'FREE_BALL': return 'free ball call';
      case 'PLAY_AGAIN': return 'play again';
      case 'REPLACE': return 'balls replaced';
      case 'RESPOT_TURN': return 're-spotted black: who plays';
      case 'BREAK_OFF': return 'break-off pick';
      case 'CONCEDE': return `concession${frame}`;
      case 'AWARD_FRAME': return `award${frame}`;
      case 'RERACK': return `re-rack${frame}`;
      case 'FRAME_SCORE': {
        const rec = valid && next.frames.length > prev.frames.length ? next.frames[next.frames.length - 1] : null;
        return rec ? `frame ${rec.n} score ${rec.score[0]}–${rec.score[1]}` : 'frame score';
      }
      default: return null;
    }
  } catch {
    return null;
  }
}
