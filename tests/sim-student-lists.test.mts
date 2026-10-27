/**
 * Student lists — simulating hundreds of schools (quality mandate step 6).
 *
 * 500 seeded schools, each with 20–120 children (common names, mixed class
 * spellings "7", "VII", "Class 7-B", "7B", optional admission numbers and dates
 * of birth). Year 1: the whole school uploads. Year 2: everyone moves up a
 * class, some leave, some join (a few already on SportnNote at another school),
 * some names are typed differently, some dates of birth are missing — and the
 * list comes in shuffled. Invariants, for every school:
 *  - every row gets exactly one action; the planner never throws;
 *  - a child is never matched to another child when the admission number or
 *    the name + date of birth identifies them;
 *  - no child ends up with two active memberships (no duplicates), and no
 *    member is ever lost from the school's list;
 *  - every member's class history has at most one open class, in order;
 *  - leavers are exactly the children who weren't on the list (and had a class);
 *  - a child elsewhere is "parent asked" only for a verified school;
 *  - uploading the same list again changes nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoster } from '../src/data/rosterImport.ts';
import { classLabelsOf, matchInputs, matchLocally, membersAfter, planStudents, type CheckChoice, type LocalPerson } from '../src/data/studentList.ts';
import type { OrgMember } from '../src/core/types.ts';

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FIRST = ['Aarav', 'Asha', 'Rahul', 'Priya', 'Vihaan', 'Ananya', 'Kabir', 'Diya', 'Arjun', 'Meera', 'Ishaan', 'Tara', 'Rohan', 'Zoya', 'Dev', 'Ira', 'Neil', 'Sara', 'Kian', 'Myra'];
const LAST = ['Rao', 'Kumar', 'Shah', 'Iyer', 'Menon', 'Das', 'Singh', 'Nair', 'Bose', 'Joshi', 'Pai', 'Khan'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const today = new Date('2026-10-27T00:00:00Z');

interface Kid { tid: string; name: string; dob: string; adm?: string; cls: number; sec: string; email: string }

test('500 schools, two school years — no duplicates, no wrong matches, nothing lost', () => {
  const r = mulberry32(20261027);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const t0 = Date.now();
  // children already on SportnNote at other schools (their parents can be asked)
  const elsewhere: (Kid & LocalPerson)[] = [];
  let totals = { rows: 0, created: 0, moved: 0, parent: 0, checks: 0, leavers: 0 };

  for (let s = 0; s < 500; s++) {
    const verified = r() < 0.5;
    const seen = new Set<string>();
    const makeKid = (k: string): Kid => {
      for (;;) {
        const name = `${pick(FIRST)} ${pick(LAST)}`;
        const dob = `20${String(8 + Math.floor(r() * 9)).padStart(2, '0')}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`;
        if (seen.has(`${name}|${dob}`)) continue;
        seen.add(`${name}|${dob}`);
        return { tid: `s${s}-${k}`, name, dob, ...(r() < 0.7 ? { adm: `A${s}-${k}` } : {}), cls: 1 + Math.floor(r() * 10), sec: pick(['A', 'B', 'C']), email: `parent.${s}.${k}@example.com` };
      }
    };
    const fmtClass = (k: Kid) => {
      const f = Math.floor(r() * 4);
      return f === 0 ? [`${k.cls}`, k.sec] : f === 1 ? [`Class ${k.cls}`, k.sec] : f === 2 ? [`${ROMAN[k.cls]}`, k.sec] : [`${k.cls}${k.sec}`, ''];
    };
    const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const csv = (rows: { kid: Kid; name?: string; noDob?: boolean }[]) =>
      'Admission no,Name,Date of birth,Class,Section,Guardian email\n' + rows.map(({ kid, name, noDob }) => {
        const [c, sec] = fmtClass(kid);
        return [kid.adm ?? '', name ?? kid.name, noDob ? '' : ddmmyyyy(kid.dob), c, sec, kid.email].join(',');
      }).join('\n') + '\n';

    // --- the school's state -----------------------------------------------------------
    let members: OrgMember[] = [];
    const people = new Map<string, LocalPerson & { tid: string }>(); // playerId → person
    const admission: Record<string, string> = {};
    let nextId = 0;
    const tidOf = (pid: string) => people.get(pid)!.tid;

    const run = (rows: { kid: Kid; name?: string; noDob?: boolean }[], expectations: (plan: ReturnType<typeof planStudents>, parsedLines: Map<number, Kid>) => void, markLeft: boolean) => {
      const parsed = parseRoster(csv(rows), { today });
      const lines = new Map(parsed.rows.map((pr, k) => [pr.line, rows[k].kid] as const));
      const labels = classLabelsOf(members);
      const inputs = matchInputs(parsed.rows, { kind: 'school' }, labels);
      const memberPeople = members.map((m) => ({ ...people.get(m.playerId)!, left: !!m.until }));
      const matches = matchLocally(inputs, memberPeople, elsewhere.filter((e) => !e.tid.startsWith(`s${s}-`)), admission, { verified });
      // a careful admin: a check is the same student only when it really is
      const choices: Record<number, CheckChoice> = {};
      let plan = planStudents({ rows: parsed.rows, matches, members, admission, scope: { kind: 'school' }, labels });
      for (const p of plan.rows.filter((x) => x.action === 'check')) {
        choices[p.row.line] = p.playerId && tidOf(p.playerId) === lines.get(p.row.line)!.tid ? 'same' : 'new';
      }
      plan = planStudents({ rows: parsed.rows, matches, members, admission, scope: { kind: 'school' }, labels, choices });
      // every row, one action
      assert.equal(plan.rows.length, rows.length);
      assert.equal(Object.values(plan.counts).reduce((a, b) => a + b, 0), rows.length);
      expectations(plan, lines);
      // apply
      const created: { line: number; playerId: string }[] = [];
      for (const p of plan.rows.filter((x) => x.action === 'new')) {
        const kid = lines.get(p.row.line)!;
        const pid = `p${s}-${nextId++}`;
        people.set(pid, { id: pid, tid: kid.tid, fullName: p.row.fullName, dob: p.row.dob, contacts: [kid.email] });
        created.push({ line: p.row.line, playerId: pid });
      }
      const before = new Set(members.map((m) => m.playerId));
      members = membersAfter(members, plan, created, '2026-10-27', markLeft);
      for (const pid of before) assert.ok(members.some((m) => m.playerId === pid), 'a member was lost');
      for (const p of plan.rows) {
        const pid = p.action === 'new' ? created.find((c) => c.line === p.row.line)?.playerId : p.playerId;
        if (pid && p.admissionNo && ['new', 'move', 'update', 'same', 'rejoin'].includes(p.action)) {
          for (const [k, v] of Object.entries(admission)) if (v === p.admissionNo && k !== pid) delete admission[k];
          admission[pid] = p.admissionNo;
        }
      }
      totals = { rows: totals.rows + rows.length, created: totals.created + created.length, moved: totals.moved + plan.counts.move,
        parent: totals.parent + plan.counts.parent, checks: totals.checks + Object.keys(choices).length, leavers: totals.leavers + (markLeft ? plan.leavers.length : 0) };
      return plan;
    };
    const assertTimelines = () => {
      for (const m of members) {
        const g = m.grades ?? [];
        assert.ok(g.filter((x) => !x.until).length <= 1, 'two open classes');
        for (let k = 1; k < g.length; k++) assert.ok(g[k - 1].since <= g[k].since, 'class history out of order');
      }
    };
    const assertNoDuplicates = () => {
      const active = members.filter((m) => !m.until).map((m) => tidOf(m.playerId));
      assert.equal(new Set(active).size, active.length, `school ${s}: a child has two active memberships`);
    };

    // --- year 1 ---------------------------------------------------------------------
    const kids = Array.from({ length: 20 + Math.floor(r() * 100) }, (_, k) => makeKid(`${k}`));
    run(kids.map((kid) => ({ kid })), (plan) => {
      assert.equal(plan.counts.new, kids.length, 'year 1: everyone is new');
    }, false);
    assertNoDuplicates(); assertTimelines();
    // some of this school's children become "elsewhere" for later schools
    for (const kid of kids.slice(0, 2)) elsewhere.push({ ...kid, id: `ext-${kid.tid}`, fullName: kid.name, contacts: [kid.email] });

    // --- year 2 ---------------------------------------------------------------------
    const stay = kids.filter(() => r() > 0.05).map((k) => ({ ...k, cls: k.cls + 1 }));
    const gone = new Set(kids.filter((k) => !stay.some((x) => x.tid === k.tid)).map((k) => k.tid));
    const joiners = Array.from({ length: Math.floor(r() * 5) }, (_, k) => makeKid(`j${k}`));
    const fromElsewhere = elsewhere.length > 2 && r() < 0.5 ? [elsewhere[Math.floor(r() * (elsewhere.length - 2))]] : [];
    const rows2 = [
      ...stay.map((kid) => ({ kid, ...(kid.adm && r() < 0.1 ? { name: `${kid.name.split(' ')[0]} ${kid.name.split(' ')[1][0]}.` } : {}), ...(kid.adm && r() < 0.2 ? { noDob: true } : {}) })),
      ...joiners.map((kid) => ({ kid })),
      ...fromElsewhere.map((kid) => ({ kid })),
    ].sort(() => r() - 0.5);
    const plan2 = run(rows2, (plan, lines) => {
      for (const p of plan.rows) {
        const kid = lines.get(p.row.line)!;
        const onFile = [...people.values()].some((x) => x.tid === kid.tid);
        if (onFile && p.playerId && ['move', 'same', 'update', 'rejoin'].includes(p.action)) {
          assert.equal(tidOf(p.playerId), kid.tid, `school ${s}: ${p.row.fullName} matched to another child`);
        }
        if (onFile && (kid.adm || p.row.dob)) assert.notEqual(p.action, 'new', `school ${s}: ${p.row.fullName} would be created twice`);
        if (fromElsewhere.some((e) => e.tid === kid.tid)) assert.equal(p.action, verified ? 'parent' : 'new', 'a child elsewhere');
      }
      const leaverTids = new Set(plan.leavers.map((l) => tidOf(l.playerId)));
      assert.deepEqual([...leaverTids].sort(), [...gone].sort(), `school ${s}: leavers`);
    }, true);
    assertNoDuplicates(); assertTimelines();
    for (const tid of gone) assert.ok(members.some((m) => tidOf(m.playerId) === tid && m.until), 'a leaver is kept as a past member');

    // --- the same list again: nothing changes -------------------------------------------
    run(rows2.map(({ kid }) => ({ kid })), (plan) => {
      assert.equal(plan.counts.new, 0, 'nobody is created again');
      assert.equal(plan.counts.parent, plan2.counts.parent, 'a parent still to answer is still waiting (the server says "asked before")');
      assert.equal(plan.counts.move, 0);
      assert.equal(plan.counts.rejoin, 0);
    }, false);
    assertNoDuplicates();
  }
  const ms = Date.now() - t0;
  console.log(`simulated ${totals.rows} rows: ${totals.created} created, ${totals.moved} moved, ${totals.parent} parents asked, ${totals.checks} checks answered, ${totals.leavers} leavers — ${ms} ms`);
  assert.ok(ms < 20_000, `took ${ms} ms`);
});
