/**
 * Wave 2, invasion describe cards (docs/security/breaks/describe-invasion.md).
 * The goal / try is on the board at the scorer's tap. Its assist, second assist,
 * strength, empty net and on-ice players are attached after, one logged step
 * each (GOAL_DETAIL / TRY_DETAIL with the goal's `ref`). The step's credits are
 * the DIFFERENCE between the goal's credits before and after (the engine's own
 * `eventCredits`), so the goal plus its details credit exactly what the old
 * one-shot GOAL did (DI2), and a change of assister reverses the first (DI3).
 * PURE.
 */
import type { Attribution, ScoreAction } from '../types.ts';
import type { NameOf } from '../../core/playerNames.ts';
import { BODY_PART_LABEL, GOAL_TYPE_LABEL, SITUATION_LABEL, ZONE_LABEL, type FootballEvent } from '../football/events.ts';

export type CreditLike = { playerId: string; stats: Record<string, number>; side?: 'home' | 'away' } | undefined;

/** after − before, per player, as attributions (first non-zero stat as `stat`,
 *  the rest as `extra`). Players in first-seen order; nothing for no change. */
export function creditDiff(before: CreditLike[], after: CreditLike[], tracked?: string[]): Attribution[] {
  const order: string[] = [];
  const sum = new Map<string, Map<string, number>>();
  const sideOf = new Map<string, 'home' | 'away'>();
  const add = (c: CreditLike, sign: number) => {
    if (!c) return;
    if (!sum.has(c.playerId)) { sum.set(c.playerId, new Map()); order.push(c.playerId); }
    if (c.side) sideOf.set(c.playerId, c.side);
    const m = sum.get(c.playerId)!;
    for (const [k, v] of Object.entries(c.stats)) m.set(k, (m.get(k) ?? 0) + sign * v);
  };
  before.forEach((c) => add(c, -1));
  after.forEach((c) => add(c, 1));
  const out: Attribution[] = [];
  for (const id of order) {
    const entries = [...sum.get(id)!.entries()].filter(([, v]) => v !== 0);
    if (!entries.length) continue;
    const [[stat, by], ...rest] = entries;
    out.push({
      playerId: id, stat, by,
      ...(rest.length ? { extra: Object.fromEntries(rest) } : {}),
      ...(tracked ? { tracked } : {}),
      ...(sideOf.has(id) ? { side: sideOf.get(id)! } : {}),
    });
  }
  return out;
}

/** The detail step: its patch on the payload with the goal's ref, its credit
 *  changes as `attribution` / `attribution2`. Null when nothing changes, or
 *  when the change would need more than two stat lines (a single-field patch
 *  never does). */
export function detailAction(type: string, side: 'home' | 'away', ref: string, patch: Record<string, unknown>, diffs: Attribution[], changed: boolean): ScoreAction | null {
  if (!changed || diffs.length > 2) return null;
  return {
    type, side, payload: { ref, ...patch },
    ...(diffs[0] ? { attribution: diffs[0] } : {}),
    ...(diffs[1] ? { attribution2: diffs[1] } : {}),
  };
}

/** A player id from a patch: a non-empty string, `null` (clear), or invalid (undefined). */
export const patchId = (v: unknown): string | null | undefined => (v === null ? null : typeof v === 'string' && v ? v : undefined);

/** Same event? (key order ignored) */
export function sameEvent(a: object, b: object): boolean {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return false;
  return ka.every((k) => JSON.stringify((a as Record<string, unknown>)[k]) === JSON.stringify((b as Record<string, unknown>)[k]));
}

/** "Assist: Ravi" (or ''), for the card summaries. */
export const assistPart = (nameOf: NameOf, id?: string, legacy?: string, word = 'Assist') => (id || legacy ? `${word}: ${nameOf(id, legacy)}` : '');

/** DI15: the football goal card's summary, read from the goal on the board:
 *  "Header · Inside the box · Assist: X" ('' = nothing described). */
export function footballGoalSummary(e: FootballEvent, nameOf: NameOf): string {
  const how = e.bodyPart ? BODY_PART_LABEL[e.bodyPart] : '';
  const type = e.goalType && e.goalType !== 'open' ? GOAL_TYPE_LABEL[e.goalType] : '';
  return [
    type, how,
    e.zone ? ZONE_LABEL[e.zone] : '',
    e.bigChance ? 'Big chance' : '',
    e.situation ? SITUATION_LABEL[e.situation] : '',
    assistPart(nameOf, e.secondId, e.secondName),
  ].filter(Boolean).join(' · ');
}
