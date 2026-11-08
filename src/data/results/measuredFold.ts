/** Measured sports, wave 2 (docs/security/breaks/describe-measured.md): the
 *  pure parts of the splits / take-overs / DQ-reason cards that fold to
 *  "✓ Saved · … Edit" with Done. Typed values still save on blur; Done runs the
 *  same commit first, so a valid typed value is never lost (DM1). PURE. */
import type { PanelMode } from '../../sports/describePanel';

export type FoldKind = 'splits' | 'takeovers' | 'dq';

/** DM4 / DM10: remembered per entry and phase — never by lane or position. */
export const foldKey = (kind: FoldKind, phaseId: string, entryId: string) => `${kind}:${phaseId}:${entryId}`;

const typed = (v: number | null | undefined) => v != null;

/** "3 splits" / "2 of 3 splits"; '' when nothing is typed (the button reads Skip). */
export function splitsSummary(vals: readonly (number | null | undefined)[], total: number): string {
  const n = vals.filter(typed).length;
  if (!n) return '';
  const word = n === 1 ? 'split' : 'splits';
  return n >= total ? `${n} ${word}` : `${n} of ${total} ${word}`;
}

/** DM5: legs 2–4 by the exchange ("L2 0.21 · L4 0.25"); '' when none. */
export function takeoverSummary(vals: readonly (number | null | undefined)[]): string {
  return vals.map((v, i) => (typed(v) ? `L${i + 2} ${Number.isNaN(v) ? '?' : (v as number).toFixed(2)}` : '')).filter(Boolean).join(' · ');
}

/** "DQ · SW 7.6 — reason" once a reason is picked; '' otherwise. Read from the saved row (DM7). */
export function dqSummary(r: { status?: string; ruleRef?: string; reason?: string }): string {
  if (r.status !== 'DQ' || !r.reason) return '';
  return `DQ · ${r.ruleRef ? `${r.ruleRef} — ` : ''}${r.reason}`;
}

/** DM7: a "saved" mark with nothing left to show (the reason was removed) opens again. */
export const foldMode = (mode: PanelMode, summary: string): PanelMode => (mode === 'saved' && !summary ? 'open' : mode);

/** Empty boxes at the end are dropped (not saved as gaps). */
export function trimTrailing<T>(vals: readonly (T | null | undefined)[]): (T | null | undefined)[] {
  const list = [...vals];
  while (list.length && list[list.length - 1] == null) list.pop();
  return list;
}

/** One commit, for blur and for Done / Skip.
 *  DM1: a valid list that differs from the saved one is sent, then the card may fold.
 *  DM2: an unreadable value never folds and never saves.
 *  DM3: a list already sent (blur, before the row reloads) isn't sent twice. */
export function doneStep<T>(o: { bad: boolean; next: readonly T[] | undefined; saved: readonly T[] | null | undefined; lastSent?: string }): { send: boolean; fold: boolean; key: string | null } {
  if (o.bad) return { send: false, fold: false, key: null };
  const key = JSON.stringify(o.next ?? []);
  return { send: key !== JSON.stringify(o.saved ?? []) && key !== o.lastSent, fold: true, key };
}
