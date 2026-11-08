/**
 * Snooker's `undoLabel` (SD-133): what Undo takes back, from the step's type
 * and the states before / after it ("black · break 8", "foul and a miss (4)",
 * "concession · frame 2"). PURE; no names (the state holds sides only, and
 * the bar reads fine without them). Null = the plain "Undo".
 */
import { COLOURS, isSnookerState, type SnookerState, type LiveFrame, type Visit } from './engine.ts';

type Step = { type: string; prev: unknown; next: unknown } | null | undefined;

const frameOf = (s: unknown): LiveFrame | null => (isSnookerState(s) ? s.frame : null);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Polish PQ1 — how much a visit's tag count went up with this stroke. */
const cnt = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 999 ? v : 0);
const grew = (before: Visit | undefined, after: Visit | undefined, k: 'lp' | 'lm' | 'rs'): boolean =>
  !!after && cnt(after[k]) > cnt(before?.[k]);

/** The visit as it stands after a pot (the frame's last visit when the pot
 *  ended the frame or re-spotted the black, else the one in play). */
function visitAfterPot(prev: SnookerState, next: SnookerState): Visit | undefined {
  const pf = prev.frame;
  const nf = next.frame;
  if (next.frames.length > prev.frames.length) {
    const rec = next.frames[next.frames.length - 1];
    return rec.visits?.[rec.visits.length - 1];
  }
  if (nf && nf.respot && !pf?.respot) return nf.visits[nf.visits.length - 1];
  return nf?.visit;
}

function potLabel(prev: SnookerState, next: SnookerState): string | null {
  const pf = prev.frame;
  if (!pf) return null;
  const nf = next.frame;
  const after = visitAfterPot(prev, next);
  const brk: number = after?.pts ?? pf.visit.pts;
  const pts = brk - pf.visit.pts;
  let ball: string;
  if (pf.respot) ball = 'black';
  else if (pf.on === 'red') {
    const reds = pf.redsLeft - (nf?.redsLeft ?? pf.redsLeft);
    ball = reds === 0 ? 'free ball' : pts > reds ? `free ball + ${plural(reds, 'red')}` : reds === 1 ? 'red' : plural(reds, 'red');
  } else if (pf.freeBall && pf.on !== 'colour' && nf && nf.on === pf.on) ball = 'free ball';
  else ball = COLOURS[pts - 2] ?? 'pot';
  // polish PQ1 — the stroke's tags, only when the engine counted them
  const tags = [...(grew(pf.visit, after, 'lp') ? ['long pot'] : []), ...(grew(pf.visit, after, 'rs') ? ['with the rest'] : [])];
  return `${ball}${tags.map((x) => ` · ${x}`).join('')} · break ${brk}`;
}

/** Polish PQ1 — "missed long pot · with the rest" (the ended visit's counts). */
function missLabel(prev: SnookerState, next: SnookerState): string | null {
  const pf = prev.frame, nf = next.frame;
  if (!pf || !nf || next.frames.length !== prev.frames.length) return null;
  const ended = nf.visits[nf.visits.length - 1];
  if (!ended || nf.visits.length <= pf.visits.length) return null;
  return `missed ${grew(pf.visit, ended, 'lm') ? 'long pot' : 'pot'}${grew(pf.visit, ended, 'rs') ? ' · with the rest' : ''}`;
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
      case 'MISS': return (valid && missLabel(prev, next)) || 'missed pot';
      case 'SAFETY': return 'safety';
      case 'FOUL': return (valid && foulLabel(prev, next)) || 'foul';
      case 'FREE_BALL': return 'free ball call';
      case 'PLAY_AGAIN': return 'play again';
      case 'SET_TRACK': return 'stats-to-track setting';
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
