/**
 * Timed races round 2 — RECORDS SET on athletes' profiles (the founder: yes).
 *
 * A record-book entry now carries its holder's player id (`holderId`, or a
 * relay's / crew's members as `holderIds` — records.ts recordHolderIds),
 * written with every new record; older and historic entries (typed from a
 * school's board) have none and simply don't count.
 *
 * When a final is locked, the records it set — the meet record (the
 * tournament's book) and the school record (against the organisation's book
 * the official saw: the best at its other meets + its historic board) — are
 * kept on the phase (`PhaseFormat.recordsSet`) and each holder's stat line for
 * that final gets `mrSet` / `srSet` (1 per record). The career counts them
 * and lists them; a re-sync rewrites the same keys from the phase. Keys only
 * when a record was set (never a 0). Pure.
 */
import type { PhaseFormat } from './model.ts';
import type { RecordMark, RecordScope } from './records.ts';
import { recordPlayerIds } from './records.ts';

export type RecordSetMark = NonNullable<PhaseFormat['recordsSet']>[number];

/**
 * The records a final set: the entries of `after` (the book once this final's
 * marks are in) that weren't in `before`, of this scope and — when given — this
 * event, and only where a record STOOD before (the first mark ever in an empty
 * book starts the book; it isn't announced or counted as a record broken —
 * the results sheet shows no MR / SR for it either). Empty when nothing was beaten.
 */
export function newRecordsSet(before: RecordMark[], after: RecordMark[], scope: RecordScope, eventKey?: string): RecordSetMark[] {
  const stood = (r: RecordMark) => before.some((x) => x.scope === scope && x.discipline === r.discipline && x.category === r.category);
  return after
    .filter((r) => r.scope === scope && !before.includes(r) && (!eventKey || r.eventKey === eventKey) && stood(r))
    .map((r) => ({ scope, discipline: r.discipline, value: r.value, ...(r.holderId ? { holderId: r.holderId } : {}), ...(r.holderIds?.length ? { holderIds: [...r.holderIds] } : {}) }));
}

/** The stat-line keys: `mrSet` / `srSet` on each holder's line (other lines unchanged). */
export function withRecordKeys<L extends { playerId: string; stats: Record<string, number> }>(lines: L[], sets: readonly RecordSetMark[] | undefined | null): L[] {
  if (!sets?.length) return lines;
  const add = new Map<string, { mr: number; sr: number }>();
  for (const r of sets) {
    for (const id of recordPlayerIds(r)) {
      const cur = add.get(id) ?? { mr: 0, sr: 0 };
      if (r.scope === 'MR') cur.mr += 1; else cur.sr += 1;
      add.set(id, cur);
    }
  }
  return lines.map((l) => {
    const a = add.get(l.playerId);
    if (!a) return l;
    return { ...l, stats: { ...l.stats, ...(a.mr ? { mrSet: a.mr } : {}), ...(a.sr ? { srSet: a.sr } : {}) } };
  });
}

/** One record on a career: "Meet record — 100 m U14 Boys, 12.31". */
export interface CareerRecord { scope: RecordScope; title: string; text: string; date: string; eventId: string }

/** "2 meet records · 1 school record" (empty when none). */
export function recordsSetText(c: { meetRecords: number; schoolRecords: number }): string {
  const part = (n: number, w: string) => (n ? `${n} ${w} record${n === 1 ? '' : 's'}` : '');
  return [part(c.meetRecords, 'meet'), part(c.schoolRecords, 'school')].filter(Boolean).join(' · ');
}
