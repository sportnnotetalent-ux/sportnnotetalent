/**
 * SD-133 — pool's own words for what Undo removes ("pot 3, 5 · Asha",
 * "foul: scratch · Ravi · ends rack 4", "dry break", "choice: hand back").
 * PURE: from the state before / after the newest event (useLiveMatch's
 * `lastStep`) — the feed line the step added says what it was. IDs-only
 * scoring: the player is named by id for this viewer (`nameOf`); a side
 * with no known player is not named (the bar reads the action alone).
 */
import type { NameOf } from '../../core/playerNames';
import { whoName } from '../racketNames.ts';
import { cnt } from './engine.ts';
import { creditOf, feedOf, perSideOf, type FeedEntry, type PoolMatch } from './match.ts';
import { FOUL_SHORT } from './controls.ts';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** What one feed line did, in a few words. */
export function stepWords(e: FeedEntry): string {
  switch (e.t) {
    case 'LAG': return 'who breaks first';
    case 'BREAK':
      if (e.k) return `break foul: ${FOUL_SHORT[e.k]}`;
      if (e.pd === 'illegalBreak') return 'illegal break';
      if (e.pd === 'threeBall') return 'short break';
      return e.b?.length ? `break · ${plural(e.b.length, 'ball')}` : 'dry break';
    case 'POT': return `pot ${(e.b ?? []).join(', ')}`;
    case 'MISS': return 'miss';
    case 'SAFETY': return 'safety';
    case 'FOUL': return `foul: ${e.k ? FOUL_SHORT[e.k] : 'other'}`;
    case 'PUSH': return e.k ? `push-out foul: ${FOUL_SHORT[e.k]}` : 'push-out';
    case 'CHOOSE': return e.c === 'play' ? 'choice: play on' : e.c === 'pass' ? 'choice: hand back' : 'choice: re-rack';
    case 'RACK': return `rack ${e.n} result`;
    case 'STALEMATE': return 'stalemate (re-rack)';
    case 'EXTENSION': return 'shot-clock extension';
    default: return e.t.toLowerCase();
  }
}

export function poolUndoLabel(step: { type: string; prev: unknown; next: unknown } | null | undefined, nameOf?: NameOf): string | null {
  if (!step || !isObj(step.prev) || !isObj(step.next) || step.prev === step.next) return null;
  const prev = step.prev as unknown as PoolMatch, next = step.next as unknown as PoolMatch;
  // defaults-on DOK5 — the Stats to track switch adds no feed line
  if (step.type === 'SET_TRACK') return 'stats-to-track setting';
  if (cnt(next.seq) !== cnt(prev.seq) + 1) return null;
  const f = feedOf(next);
  const e = f[f.length - 1];
  if (!e || e.t !== step.type) return null;
  const parts = [stepWords(e)];
  // who: the doubles shooter, else a singles side's one player
  const id = e.p ?? (e.s && e.t !== 'LAG' && e.t !== 'CHOOSE' && e.t !== 'RACK' && e.t !== 'STALEMATE' && perSideOf(next) === 1 ? creditOf(next).ids[e.s][0] : undefined);
  const who = id && nameOf ? whoName(nameOf, id) : undefined;
  if (who) parts.push(who);
  if (e.end) {
    const sets = Array.isArray(next.sets) ? next.sets.length : 0;
    const before = Array.isArray(prev.sets) ? prev.sets.length : 0;
    parts.push(next.ended ? 'ends the match' : sets > before && cnt(next.setsToWin) > 1 ? `ends set ${sets}` : `ends rack ${e.n}`);
  }
  const out = parts.join(' · ');
  return /\bundefined\b|\bnull\b|\bNaN\b/.test(out) ? null : out;
}
