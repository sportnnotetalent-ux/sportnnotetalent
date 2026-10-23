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
 *
 * Follow-up: a combined event's TOTAL sets records the same way (on the
 * holder's total line — combined.ts combinedFinalLines), and RECORDS HELD —
 * which of the records an athlete set still stand in the book now (the meet's
 * book for a meet record, the host organisation's school book for a school
 * record), matched by the holder's id: `recordsSetBy`, `stillHeld`.
 */
import type { Category, PhaseFormat } from './model.ts';
import { categoryKey } from './model.ts';
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

/* ---------------------- follow-up: RECORDS HELD (standing) ---------------------- */

/**
 * A record an athlete set, located for the "still held?" check: the final it
 * was set in (`eventId`), its event + category, the mark, and where its book
 * lives — the meet's own book (MR, `tournamentId`) or the school book of the
 * meet's host organisation (SR). `sport` = the book's sport.
 */
export interface SetRecordRef { eventId: string; scope: RecordScope; discipline: string; category: string; value: number; tournamentId?: string; sport?: string }

/** What the check needs to know about a locked final (PhaseInfo carries it). */
export interface SetRecordPhase { category?: Category; tournamentId?: string; sport?: string; recordsSet?: readonly RecordSetMark[] }

/** The records `playerId` set (by id), from the locked finals' `recordsSet` —
 *  the same records the career counts (`mrSet` / `srSet`); a book that merely
 *  STARTED with their mark isn't one (as for "records set"). In the phases'
 *  order (the career sorts its own list). */
export function recordsSetBy(playerId: string, phases: ReadonlyMap<string, SetRecordPhase>): SetRecordRef[] {
  const out: SetRecordRef[] = [];
  for (const [eventId, p] of phases) {
    for (const r of p.recordsSet ?? []) {
      if (!recordPlayerIds(r).includes(playerId)) continue;
      out.push({ eventId, scope: r.scope, discipline: r.discipline, category: categoryKey(p.category), value: r.value, ...(p.tournamentId ? { tournamentId: p.tournamentId } : {}), ...(p.sport ? { sport: p.sport } : {}) });
    }
  }
  return out;
}

/** Still held: the book NOW has that scope / event / category's record naming
 *  them (by id) at the same mark. Beaten since (or rolled back by a reopened
 *  final) → not held; a book that can't be read → not held (never claimed). */
export function stillHeld(ref: Pick<SetRecordRef, 'scope' | 'discipline' | 'category' | 'value'>, book: readonly RecordMark[], playerId: string): boolean {
  const cur = book.find((r) => r.scope === ref.scope && r.discipline === ref.discipline && r.category === ref.category);
  return !!cur && cur.value === ref.value && recordPlayerIds(cur).includes(playerId);
}

/** The key a career record is matched on: its final and scope ("ph1:MR"). */
export const heldKey = (r: { eventId: string; scope: RecordScope }): string => `${r.eventId}:${r.scope}`;

/** Which records were checked against their book now, and which still stand
 *  (`heldKey`s) — resultsStore getRecordsHeld. */
export interface RecordsHeld { checked: ReadonlySet<string>; held: ReadonlySet<string> }

/** After the records-set line: "still held" / "all still held" / "2 still
 *  held" / "none still held"; '' until the books are read, or when none could
 *  be. With some records unchecked (a book that couldn't be read) only a
 *  positive count is said — never "none". */
export function recordsHeldText(r: RecordsHeld | null | undefined, records: readonly { eventId: string; scope: RecordScope }[]): string {
  if (!r || !records.length) return '';
  const known = records.filter((x) => r.checked.has(heldKey(x)));
  if (!known.length) return '';
  const n = known.filter((x) => r.held.has(heldKey(x))).length;
  if (known.length === records.length) {
    if (n === records.length) return n === 1 ? 'still held' : 'all still held';
    if (!n) return 'none still held';
  }
  return n ? `${n} still held` : '';
}

/** One record's note: " · still held" / " · beaten since" ('' unchecked). */
export const recordHeldNote = (r: RecordsHeld | null | undefined, rec: { eventId: string; scope: RecordScope }): string =>
  (!r?.checked.has(heldKey(rec)) ? '' : r.held.has(heldKey(rec)) ? ' · still held' : ' · beaten since');
