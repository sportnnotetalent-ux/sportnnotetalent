/**
 * Reads that silently stopped at 1,000 rows: PostgREST caps every response at
 * max_rows (Supabase default 1,000) without saying so. data/paging.ts reads
 * page by page and chunks long `.in()` lists; the edge functions carry a copy
 * (supabase/functions/_shared/paging.ts) — both are run through the same tests.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as app from '../src/data/paging.ts';
import * as edge from '../supabase/functions/_shared/paging.ts';

type Row = { id: number; team: string; at: number };
type Err = { code: string; message: string };

/** A tiny PostgREST stand-in: `.in()` / `.order()` / `.range()` / `.limit()`,
 *  thenable, and — like the real server — never more than `maxRows` rows back. */
class FakeQuery implements PromiseLike<{ data: Row[] | null; error: Err | null }> {
  private filters: ((r: Row) => boolean)[] = [];
  private orders: [keyof Row, boolean][] = [];
  private from = 0;
  private to: number | null = null;
  private db: FakeDb;
  constructor(db: FakeDb) { this.db = db; }
  in(col: keyof Row, vals: unknown[]) { const s = new Set(vals); this.filters.push((r) => s.has(r[col])); this.db.inLists.push(vals.length); return this; }
  order(col: keyof Row, o: { ascending?: boolean } = {}) { this.orders.push([col, o.ascending !== false]); return this; }
  range(from: number, to: number) { this.from = from; this.to = to; return this; }
  limit(n: number) { this.from = 0; this.to = n - 1; return this; }
  then<A = { data: Row[] | null; error: Err | null }, B = never>(ok?: ((v: { data: Row[] | null; error: Err | null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
  }
  private run(): { data: Row[] | null; error: Err | null } {
    const n = this.db.requests++;
    if (this.db.failOn === n) return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    let rows = this.db.rows.filter((r) => this.filters.every((f) => f(r)));
    rows = [...rows].sort((a, b) => {
      for (const [c, asc] of this.orders) { if (a[c] !== b[c]) return (a[c] < b[c] ? -1 : 1) * (asc ? 1 : -1); }
      return 0;
    });
    const end = this.to === null ? rows.length : this.to + 1;
    const want = rows.slice(this.from, end);
    return { data: want.slice(0, this.db.maxRows), error: null };
  }
}
class FakeDb {
  requests = 0;
  inLists: number[] = [];
  failOn: number | null = null;
  rows: Row[];
  maxRows: number;
  constructor(rows: Row[], maxRows = 1000) { this.rows = rows; this.maxRows = maxRows; }
  from() { return new FakeQuery(this); }
}
const rowsOf = (n: number, teams = 1): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, team: `t${i % teams}`, at: Math.floor(i / 3) })); // `at` has ties

for (const [label, P] of [['src/data/paging.ts', app], ['_shared/paging.ts (edge copy)', edge]] as const) {
  describe(`paging — ${label}`, () => {
    test('the bug: an unpaged read of 2,500 rows comes back with 1,000 and no error', async () => {
      const db = new FakeDb(rowsOf(2500));
      const { data, error } = await db.from().order('id');
      assert.equal(error, null);
      assert.equal(data!.length, 1000);
    });

    test('fetchAllPages reads every row, in order, one request per page', async () => {
      const db = new FakeDb(rowsOf(2500));
      const { data, error } = await P.fetchAllPages((from, to) => db.from().order('at').order('id').range(from, to));
      assert.equal(error, null);
      assert.equal(data!.length, 2500);
      assert.deepEqual(data!.map((r) => r.id), rowsOf(2500).map((r) => r.id));
      assert.equal(db.requests, 3);
    });

    test('a small result is one request with exactly the rows of the unpaged read', async () => {
      const db = new FakeDb(rowsOf(37));
      const plain = await db.from().order('id');
      const paged = await P.fetchAllPages((from, to) => db.from().order('id').range(from, to));
      assert.deepEqual(paged.data, plain.data);
      assert.equal(db.requests, 2); // one each
    });

    test('exactly a full page needs one extra (empty) request; empty table → []', async () => {
      const db = new FakeDb(rowsOf(1000));
      const { data } = await P.fetchAllPages((from, to) => db.from().order('id').range(from, to));
      assert.equal(data!.length, 1000);
      assert.equal(db.requests, 2);
      const none = await P.fetchAllPages((from, to) => new FakeDb([]).from().order('id').range(from, to));
      assert.deepEqual(none, { data: [], error: null });
    });

    test('an error on any page fails the whole read (never a silent partial list)', async () => {
      const db = new FakeDb(rowsOf(2500));
      db.failOn = 1;
      const res = await P.fetchAllPages((from, to) => db.from().order('id').range(from, to));
      assert.equal(res.data, null);
      assert.equal(res.error?.code, '57014');
      const first = new FakeDb(rowsOf(10));
      first.failOn = 0;
      assert.equal((await P.fetchAllPages((from, to) => first.from().order('id').range(from, to))).data, null);
    });

    test('a first page with neither data nor error passes through as null', async () => {
      const res = await P.fetchAllPages(async () => ({ data: null, error: null }));
      assert.deepEqual(res, { data: null, error: null });
    });

    test('maxRows: an intended cap above the server one (the old .limit(5000) got 1,000)', async () => {
      const db = new FakeDb(rowsOf(7000));
      const { data } = await P.fetchAllPages((from, to) => db.from().order('id').range(from, to), { maxRows: 5000 });
      assert.equal(data!.length, 5000);
      assert.equal(data![4999].id, 5000);
      assert.equal(db.requests, 5);
      const odd = new FakeDb(rowsOf(7000));
      assert.equal((await P.fetchAllPages((from, to) => odd.from().order('id').range(from, to), { maxRows: 1500 })).data!.length, 1500);
      assert.equal(odd.requests, 2);
    });

    test('smaller pages and a lower server cap still read everything when pageSize ≤ cap', async () => {
      const db = new FakeDb(rowsOf(1234), 500);
      const { data } = await P.fetchAllPages((from, to) => db.from().order('id').range(from, to), { pageSize: 500 });
      assert.equal(data!.length, 1234);
      assert.equal(db.requests, 3);
    });

    test('runaway guard: a builder that ignores the range stops at maxPages', async () => {
      let calls = 0;
      const full = rowsOf(1000);
      const res = await P.fetchAllPages(async () => { calls++; return { data: full, error: null }; }, { maxPages: 4 });
      assert.equal(calls, 4);
      assert.equal(res.data!.length, 4000);
    });

    test('a page size below 1 is refused', async () => {
      await assert.rejects(P.fetchAllPages(async () => ({ data: [], error: null }), { pageSize: 0 }), RangeError);
    });

    test('pageRange and chunk', () => {
      assert.deepEqual(P.pageRange(0), [0, 999]);
      assert.deepEqual(P.pageRange(2), [2000, 2999]);
      assert.deepEqual(P.pageRange(1, 1000, 1500), [1000, 1499]);
      assert.equal(P.pageRange(2, 1000, 2000), null);
      assert.deepEqual(P.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
      assert.deepEqual(P.chunk([], 3), []);
      assert.equal(P.chunk(Array.from({ length: 250 }, (_, i) => i)).length, 3); // ID_CHUNK = 100
      assert.throws(() => P.chunk([1], 0), RangeError);
      assert.equal(P.PAGE_SIZE, 1000);
      assert.equal(P.ID_CHUNK, 100);
    });

    test('fetchAllChunked: short .in() lists, every row of every chunk, no ids → no request', async () => {
      // 30 teams × 120 rows = 3,600 rows; 250 ids (30 real) → 3 chunks
      const db = new FakeDb(rowsOf(3600, 30));
      const ids = [...Array.from({ length: 30 }, (_, i) => `t${i}`), ...Array.from({ length: 220 }, (_, i) => `x${i}`)];
      const { data, error } = await P.fetchAllChunked(ids, (part, from, to) => db.from().in('team', part).order('id').range(from, to));
      assert.equal(error, null);
      assert.equal(data!.length, 3600);
      assert.equal(new Set(data!.map((r) => r.id)).size, 3600);
      assert.ok(db.inLists.every((n) => n <= 100));
      assert.deepEqual(db.inLists, [100, 100, 100, 100, 100, 50]); // chunk 1 (all 30 teams) is 4 pages, then 1 + 1
      const quiet = new FakeDb(rowsOf(10));
      assert.deepEqual(await P.fetchAllChunked([], (part, from, to) => quiet.from().in('team', part).range(from, to)), { data: [], error: null });
      assert.equal(quiet.requests, 0);
    });

    test('fetchAllChunked: duplicate ids are asked once; an error in any chunk fails the read', async () => {
      const db = new FakeDb(rowsOf(20, 2));
      const { data } = await P.fetchAllChunked(['t0', 't0', 't1'], (part, from, to) => db.from().in('team', part).order('id').range(from, to), { chunkSize: 1 });
      assert.equal(data!.length, 20);
      assert.equal(db.requests, 2);
      const bad = new FakeDb(rowsOf(20, 2));
      bad.failOn = 1;
      const res = await P.fetchAllChunked(['t0', 't1'], (part, from, to) => bad.from().in('team', part).order('id').range(from, to), { chunkSize: 1 });
      assert.equal(res.data, null);
      assert.equal(res.error?.code, '57014');
    });
  });
}

test('the edge copy is the same code as src/data/paging.ts', () => {
  const body = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');
  assert.equal(body('../supabase/functions/_shared/paging.ts'), body('../src/data/paging.ts'));
});
