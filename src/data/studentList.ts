/**
 * Student lists (2026-10-27, founder 1A / 2A / 3A) — the PURE plan for a
 * school's bulk upload: a whole-school list, one class, or one section; every
 * row recognised as a student the school already has (admission number, then
 * name + date of birth, then first name + a parent's contact — the server's
 * org_roster_match), a child elsewhere on SportnNote (the parent is asked), or
 * someone new. Nothing is created twice; existing students move to the class
 * the list gives them; a whole-school list can mark the students missing from
 * it as left — only when the school says so.
 *
 * Classes keep the app's one label per class and section ("Class 7-B"): the
 * list's class and section are put together in the school's own wording.
 *
 * Pure — node tests load it.
 */
import type { OrgMember } from '../core/types';
import { assignHouse, currentHouse, currentStandard, promoteGrade } from '../core/org.ts';
import { classKey, sameClass } from '../core/markets.ts';
import type { RosterRow } from './rosterImport.ts';

/* --------------------------------- classes -------------------------------- */

const ROMAN_OR_NUM = /^(\d+|[ivxlc]+)$/i;

/** "Class 7-B" → Class 7 + B; "7B", "VII B", "Grade 9 / C", "LKG-A" too. "Class X"
 *  and "Year 8" have no section; "Pre-KG" isn't split. */
export function splitClassSection(label: string | undefined): { cls: string; section?: string } {
  const s = (label ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return { cls: '' };
  // "7-B", "Class 7 / C", "LKG-A", "Class 9-Rose"
  let m = /^(.*\S)\s*[-/]\s*([A-Za-z][A-Za-z]{0,11})$/.exec(s);
  if (m && (/(\d|\b[ivxlc]+)$/i.test(m[1]) || m[2].length === 1)) return { cls: m[1], section: m[2] };
  // "7B", "Class 10A"
  m = /^(.*\d)([A-Za-z])$/.exec(s);
  if (m) return { cls: m[1], section: m[2] };
  // "VII B", "Grade 9 C" — a single letter after a number / roman numeral
  m = /^(.*?)(\S+) ([A-Za-z])$/.exec(s);
  if (m && ROMAN_OR_NUM.test(m[2])) return { cls: `${m[1]}${m[2]}`, section: m[3] };
  return { cls: s };
}

const tidySection = (x: string) => (x.length === 1 ? x.toUpperCase() : x.charAt(0).toUpperCase() + x.slice(1));

/** The family word a school writes before its class numbers ("Class", "Grade", "Std"). */
function familyWord(existing: string[]): string | undefined {
  const count = new Map<string, number>();
  for (const l of existing) {
    const w = /^([A-Za-z]+\.?)\s+(\d+|[IVXLC]+)\b/.exec(splitClassSection(l).cls)?.[1];
    if (w) count.set(w, (count.get(w) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** A list's class (and section) as the school writes it: an existing class's
 *  wording when it's the same class ("7" at a school of "Class 7-A" → "Class 7"),
 *  a bare number gets the school's word ("Class" when it has none). */
export function composeClass(cls: string | undefined, section: string | undefined, existing: string[]): string | undefined {
  const own = splitClassSection(cls);
  let base = own.cls;
  const sec = (section ?? '').trim() || own.section;
  if (!base) return undefined;
  const same = existing.map((l) => splitClassSection(l).cls).find((c) => c && sameClass(c, base));
  if (same) base = same;
  else if (ROMAN_OR_NUM.test(base)) base = `${familyWord(existing) ?? 'Class'} ${base}`;
  return sec ? `${base}-${tidySection(sec)}` : base;
}

/** Same class and section? ("Class 7-B" = "Std VII B"; "Class 7-A" ≠ "Class 7-B") */
export function sameClassAndSection(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const x = splitClassSection(a), y = splitClassSection(b);
  return sameClass(x.cls, y.cls) && (x.section ?? '').toLowerCase() === (y.section ?? '').toLowerCase();
}

/** Every class label a school uses (current and past), for wording new ones. */
export const classLabelsOf = (members: OrgMember[]): string[] =>
  [...new Set(members.flatMap((m) => (m.grades ?? []).map((g) => g.standard)).filter(Boolean))];

/* ---------------------------------- scope --------------------------------- */

/** What the list is: the whole school (class from each row), or one class /
 *  one section (rows without a class take it). */
export type ListScope = { kind: 'school' } | { kind: 'class'; cls: string; section?: string };

/** The class a row ends up in. */
export function rowClass(row: Pick<RosterRow, 'standard' | 'section'>, scope: ListScope, existing: string[]): string | undefined {
  if (scope.kind === 'class') {
    const own = row.standard ? splitClassSection(row.standard) : undefined;
    // a row may name its own section inside the class list ("7-C" in a Class 7 list)
    return composeClass(scope.cls, row.section || (own && sameClass(own.cls, splitClassSection(scope.cls).cls) ? own.section : undefined) || scope.section, existing);
  }
  return composeClass(row.standard, row.section, existing);
}

/** Every row's class, in file order: a class written two ways in one list
 *  ("VIII-A", then "8B") takes the wording it had first, so one class never
 *  becomes two. */
export function rowClasses(rows: Pick<RosterRow, 'line' | 'standard' | 'section'>[], scope: ListScope, existing: string[]): Map<number, string | undefined> {
  const seen = [...existing];
  const out = new Map<number, string | undefined>();
  for (const r of rows) {
    const c = rowClass(r, scope, seen);
    out.set(r.line, c);
    if (c && !seen.includes(c)) seen.push(c);
  }
  return out;
}

/* ---------------------------------- match --------------------------------- */

/** What the server (org_roster_match) — or the demo — says about one row. */
export type MatchKind = 'member' | 'check' | 'parent' | 'unreachable' | 'invited' | 'new';
export interface RowMatch { i: number; kind: MatchKind; playerId?: string; why?: string; left?: boolean }

/** One row as the server is asked about it (`i` = the file line). */
export interface MatchInput { i: number; name: string; dob?: string; adm?: string; email?: string; phone?: string; standard?: string; house?: string }

export const matchInputs = (rows: RosterRow[], scope: ListScope, existing: string[]): MatchInput[] => {
  const ok = rows.filter((r) => !r.errors.length && r.dupInFile == null && r.fullName);
  const classes = rowClasses(ok, scope, existing);
  return ok.map((r) => {
    const standard = classes.get(r.line);
    return {
      i: r.line, name: r.fullName, ...(r.dob ? { dob: r.dob } : {}), ...(r.admissionNo ? { adm: r.admissionNo } : {}),
      ...(r.guardian?.email ? { email: r.guardian.email } : {}), ...(r.guardian?.phone ? { phone: r.guardian.phone } : {}),
      ...(standard ? { standard } : {}), ...(r.house ? { house: r.house } : {}),
    };
  });
};

const nameKey = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

export interface LocalPerson { id: string; fullName: string; dob?: string; contacts: string[] }

/** The demo's (and the tests') copy of org_roster_match: the same order of
 *  checks. `members` = this school's (current and past); `others` = everyone else. */
export function matchLocally(rows: MatchInput[], members: (LocalPerson & { left: boolean })[], others: LocalPerson[], admission: Record<string, string>): RowMatch[] {
  const byAdm = new Map(Object.entries(admission).map(([pid, a]) => [a.trim().toUpperCase(), pid]));
  const contact = (p: LocalPerson, r: MatchInput) =>
    p.contacts.some((c) => (r.email && c === r.email.toLowerCase()) || (r.phone && c.replace(/\D/g, '').slice(-10) === r.phone.replace(/\D/g, '').slice(-10)));
  return rows.map((r): RowMatch => {
    const adm = r.adm?.trim().toUpperCase();
    const pid = adm ? byAdm.get(adm) : undefined;
    const am = pid ? members.find((m) => m.id === pid) : undefined;
    if (am) return { i: r.i, kind: 'member', playerId: am.id, why: 'admission', left: am.left };
    const k = nameKey(r.name);
    const named = members.filter((m) => nameKey(m.fullName) === k);
    const fit = named.filter((m) => !r.dob || !m.dob || m.dob === r.dob);
    if (fit.length === 1) return { i: r.i, kind: 'member', playerId: fit[0].id, why: r.dob && fit[0].dob === r.dob ? 'name_dob' : 'name', left: fit[0].left };
    if (fit.length > 1) return { i: r.i, kind: 'check', why: 'several' };
    if (named.length) {
      const m = [...named].sort((a, b) => Number(a.left) - Number(b.left))[0];
      return { i: r.i, kind: 'check', playerId: m.id, why: 'dob_differs', left: m.left };
    }
    const first = k.split(' ')[0];
    if (r.email || r.phone) {
      const c = members.filter((m) => nameKey(m.fullName).split(' ')[0] === first && contact(m, r)).sort((a, b) => Number(a.left) - Number(b.left))[0];
      if (c) return { i: r.i, kind: 'member', playerId: c.id, why: 'contact', left: c.left };
      if (r.dob && others.some((p) => nameKey(p.fullName) === k && p.dob === r.dob && contact(p, r))) return { i: r.i, kind: 'parent', why: 'elsewhere' };
    }
    return { i: r.i, kind: 'new' };
  });
}

/* ---------------------------------- plan ---------------------------------- */

/**
 * new · move (to another class) · update (House / admission number) · same ·
 * rejoin (a past student back) · parent (a child elsewhere: their parent is
 * asked) · invited (asked before) · check (the school decides) · skip.
 */
export type StudentAction = 'new' | 'move' | 'update' | 'same' | 'rejoin' | 'parent' | 'invited' | 'check' | 'skip';

export interface PlannedStudent {
  row: RosterRow;
  action: StudentAction;
  /** the student it is (move / update / same / rejoin, and a check with a candidate) */
  playerId?: string;
  standard?: string;
  fromStandard?: string;
  house?: string;
  fromHouse?: string;
  admissionNo?: string;
  /** why a row needs a look, or was skipped */
  note?: string;
  /** a check the school can answer "same student" to */
  canBeSame?: boolean;
}

export type CheckChoice = 'same' | 'new' | 'skip';

export interface StudentPlan {
  rows: PlannedStudent[];
  counts: Record<StudentAction, number>;
  /** whole-school list: current students (with a class) missing from it */
  leavers: { playerId: string; standard?: string }[];
}

const CHECK_NOTE: Record<string, string> = {
  dob_differs: 'A student with this name is already here with another date of birth: the same student, or a new one?',
  several: 'Several students here have this name: add as a new student, or skip it.',
  unreachable: 'Already on SportnNote outside your school, but we have no email to ask their parent: add as a new student, or skip it.',
};

export function planStudents(input: {
  rows: RosterRow[];
  matches: RowMatch[];
  members: OrgMember[];
  admission: Record<string, string>;
  scope: ListScope;
  /** the school's class labels (classLabelsOf) */
  labels: string[];
  /** the school's answers to "check" rows, by file line */
  choices?: Record<number, CheckChoice>;
}): StudentPlan {
  const byLine = new Map(input.matches.map((m) => [m.i, m]));
  const classes = rowClasses(input.rows.filter((r) => !r.errors.length && r.dupInFile == null && r.fullName), input.scope, input.labels);
  const memberOf = new Map(input.members.map((m) => [m.playerId, m]));
  const seen = new Set<string>();
  const rows = input.rows.map((row): PlannedStudent => {
    if (row.errors.length) return { row, action: 'skip', note: row.errors.join(' · ') };
    if (row.dupInFile != null) return { row, action: 'skip', note: `Same student as line ${row.dupInFile}` };
    const standard = classes.get(row.line);
    const base = { row, ...(standard ? { standard } : {}), ...(row.house ? { house: row.house } : {}), ...(row.admissionNo ? { admissionNo: row.admissionNo } : {}) };
    const m = byLine.get(row.line) ?? { i: row.line, kind: 'new' as const };
    const choice = input.choices?.[row.line];
    const asMember = (pid: string, left?: boolean): PlannedStudent => {
      if (seen.has(pid)) return { ...base, action: 'skip', playerId: pid, note: 'This student is on the list twice' };
      seen.add(pid);
      const cur = memberOf.get(pid);
      const fromStandard = cur ? currentStandard(cur) : undefined;
      const fromHouse = cur ? currentHouse(cur) : undefined;
      const extra = { playerId: pid, ...(fromStandard ? { fromStandard } : {}), ...(fromHouse ? { fromHouse } : {}) };
      if (left || (cur && cur.until)) return { ...base, ...extra, action: 'rejoin' };
      const moves = !!standard && !sameClassAndSection(standard, fromStandard);
      const houseChanges = !!row.house && row.house !== fromHouse;
      const admChanges = !!row.admissionNo && row.admissionNo.trim().toUpperCase() !== (input.admission[pid] ?? '').trim().toUpperCase();
      return { ...base, ...extra, action: moves ? 'move' : houseChanges || admChanges ? 'update' : 'same' };
    };
    switch (m.kind) {
      case 'member':
        return m.playerId ? asMember(m.playerId, m.left) : { ...base, action: 'new' };
      case 'check':
      case 'unreachable': {
        const why = m.kind === 'unreachable' ? 'unreachable' : m.why ?? 'several';
        const canBeSame = m.kind === 'check' && !!m.playerId;
        if (choice === 'same' && canBeSame) return asMember(m.playerId!, m.left);
        if (choice === 'new') return { ...base, action: 'new' };
        if (choice === 'skip') return { ...base, action: 'skip', note: 'Skipped' };
        return { ...base, action: 'check', note: CHECK_NOTE[why] ?? CHECK_NOTE.several, canBeSame, ...(canBeSame ? { playerId: m.playerId } : {}) };
      }
      case 'parent':
        return { ...base, action: 'parent' };
      case 'invited':
        return { ...base, action: 'invited', note: 'Their parent was asked already' };
      default:
        return { ...base, action: 'new' };
    }
  });
  const counts = { new: 0, move: 0, update: 0, same: 0, rejoin: 0, parent: 0, invited: 0, check: 0, skip: 0 } as Record<StudentAction, number>;
  for (const r of rows) counts[r.action] += 1;
  // A whole-school list: who isn't on it (students with a class; staff stay).
  const onList = new Set(rows.filter((r) => r.playerId && r.action !== 'skip' && r.action !== 'check').map((r) => r.playerId!));
  for (const r of rows) if (r.action === 'check' && r.playerId) onList.add(r.playerId);
  const leavers = input.scope.kind === 'school'
    ? input.members.filter((m) => !m.until && m.role === 'Member' && !!currentStandard(m) && !onList.has(m.playerId))
        .map((m) => ({ playerId: m.playerId, standard: currentStandard(m) }))
    : [];
  return { rows, counts, leavers };
}

/* ------------------------------ the new members ------------------------------ */

/** The school's member list after the plan: new students added (with class /
 *  House from today), students moved, past students back, Houses changed, and —
 *  only when the school ticked it — the leavers' membership ended today. */
export function membersAfter(members: OrgMember[], plan: StudentPlan, created: { line: number; playerId: string }[], today: string, markLeft: boolean): OrgMember[] {
  const out = new Map(members.map((m) => [m.playerId, { ...m }]));
  const closeOpen = <T extends { until?: string }>(list: T[] | undefined) => (list ?? []).map((x) => (!x.until ? { ...x, until: today } : x));
  for (const p of plan.rows) {
    if (!['move', 'update', 'rejoin'].includes(p.action) || !p.playerId) continue;
    const m = out.get(p.playerId);
    if (!m) continue;
    if (p.action === 'rejoin') { m.until = undefined; m.since = today; }
    if (p.standard && (p.action === 'rejoin' || !sameClassAndSection(p.standard, currentStandard(m)))) m.grades = promoteGrade(m.grades, p.standard, today);
    if (p.house) m.houses = assignHouse(m.houses, p.house, today);
  }
  const lines = new Map(plan.rows.map((p) => [p.row.line, p]));
  for (const c of created) {
    const p = lines.get(c.line);
    out.set(c.playerId, {
      playerId: c.playerId, role: 'Member', since: today,
      ...(p?.standard ? { grades: [{ standard: p.standard, since: today }] } : {}),
      ...(p?.house ? { houses: [{ house: p.house, since: today }] } : {}),
    });
  }
  if (markLeft) {
    for (const l of plan.leavers) {
      const m = out.get(l.playerId);
      if (!m || m.until) continue;
      m.until = today;
      m.grades = closeOpen(m.grades);
      m.houses = closeOpen(m.houses);
    }
  }
  return [...out.values()];
}

/** Class labels in a sensible order (Class 2 before Class 10; sections A, B…). */
export function sortClasses(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const x = splitClassSection(a), y = splitClassSection(b);
    const kx = classKey(x.cls)?.n ?? 999, ky = classKey(y.cls)?.n ?? 999;
    return kx - ky || x.cls.localeCompare(y.cls) || (x.section ?? '').localeCompare(y.section ?? '');
  });
}

/** A ready-made file: the whole school (class + section columns), or one class. */
export const STUDENT_TEMPLATE = (order: 'DMY' | 'MDY' | 'YMD' = 'DMY', scope: ListScope['kind'] = 'school'): string => {
  const dob = order === 'MDY' ? '03/05/2012' : '05/03/2012';
  return scope === 'school'
    ? `Admission no,Name,Date of birth,Gender,Class,Section,House,Guardian name,Guardian email,Guardian phone\nA1023,Asha Rao,${dob},F,Class 7,B,Red,Meera Rao,meera@example.com,+91 98450 00000\n`
    : `Admission no,Name,Date of birth,Gender,House,Guardian name,Guardian email,Guardian phone\nA1023,Asha Rao,${dob},F,Red,Meera Rao,meera@example.com,+91 98450 00000\n`;
};
