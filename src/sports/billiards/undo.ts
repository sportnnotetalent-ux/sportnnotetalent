/**
 * English billiards' `undoLabel` (SD-133): what Undo takes back ("pot red +
 * cannon · break 5", "foul (too many hazards)", "time called"). PURE; no
 * names. Null = the plain "Undo".
 */
import { isBilliardsState, PARTS, type BilliardsState, type Part, type Visit } from './engine.ts';

type Step = { type: string; prev: unknown; next: unknown } | null | undefined;

const WORD: Record<Part, string> = { potRed: 'pot red', potWhite: 'pot white', inOffRed: 'in-off red', inOffWhite: 'in-off white', cannon: 'cannon' };
const KIND: Record<string, string> = { hazards: 'too many hazards', cannons: 'too many cannons' };

function strokeLabel(prev: BilliardsState, next: BilliardsState): string | null {
  const pf = prev.frame;
  if (!pf) return null;
  const ended = next.frames.length > prev.frames.length;
  const rec = ended ? next.frames[next.frames.length - 1] : null;
  const fouls = ended ? rec?.fouls ?? [] : next.frame?.fouls ?? [];
  // over the hazard / cannon limit the stroke became a foul
  if (fouls.length > pf.fouls.length) {
    const f = fouls[fouls.length - 1];
    return `foul (${(f.kind && KIND[f.kind]) ?? f.value})`;
  }
  const after: Visit | undefined = ended ? rec?.visits?.[rec.visits.length - 1] : next.frame?.visit;
  if (!after) return null;
  const parts = PARTS.filter((k) => after[k] > pf.visit[k]).map((k) => WORD[k]);
  return parts.length ? `${parts.join(' + ')} · break ${after.pts}` : null;
}

export function billiardsUndoLabel(step: Step): string | null {
  if (!step) return null;
  try {
    const prev = step.prev as BilliardsState;
    const next = step.next as BilliardsState;
    const valid = isBilliardsState(prev) && isBilliardsState(next);
    const unit = valid && prev.bestOf === 1 ? 'game' : 'frame';
    const n = valid ? prev.frame?.n : undefined;
    const frame = n ? ` · ${unit} ${n}` : '';
    switch (step.type) {
      case 'SCORE': return (valid && strokeLabel(prev, next)) || 'scoring stroke';
      case 'MISS': return 'missed';
      case 'SAFETY': return 'safety';
      case 'FOUL': {
        const f = valid ? (next.frames.length > prev.frames.length ? next.frames[next.frames.length - 1].fouls : next.frame?.fouls)?.slice(-1)[0] : undefined;
        return f ? `foul (${f.value})` : 'foul';
      }
      case 'TIME': return 'time called';
      case 'BREAK_OFF': return 'break-off pick';
      case 'CONCEDE': return `concession${frame}`;
      case 'AWARD_FRAME': return `award${frame}`;
      case 'FRAME_SCORE': {
        const rec = valid && next.frames.length > prev.frames.length ? next.frames[next.frames.length - 1] : null;
        return rec ? `${unit} ${rec.n} score ${rec.score[0]}–${rec.score[1]}` : `${unit} score`;
      }
      default: return null;
    }
  } catch {
    return null;
  }
}
