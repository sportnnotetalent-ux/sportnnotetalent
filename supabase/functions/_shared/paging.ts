/**
 * Complete list reads for the edge functions — a copy of src/data/paging.ts
 * (functions can't import the app's code; tests/paging.test.mts checks the
 * code below this comment is the same in both).
 *
 * PostgREST returns at most `max_rows` rows per request (Supabase default
 * 1,000) and doesn't say it stopped: page with a stable, unique order (end
 * with the primary key) and keep `.in()` id lists short. Pure — no Deno APIs.
 */

/** Rows per request — Supabase's default `max_rows`. */
export const PAGE_SIZE = 1000;
/** Ids per `.in()` list — longer lists overrun the URL (a uuid is ~37 chars). */
export const ID_CHUNK = 100;
/** Runaway guard (a builder that ignored the range would loop forever): 1M rows. */
export const MAX_PAGES = 1000;

/** What a Supabase list query resolves to. */
export interface ListResult<T, E> { data: T[] | null; error: E | null }
/** One page of a query: the inclusive row range `[from, to]`, i.e. `.range(from, to)`. */
export type PageQuery<T, E> = (from: number, to: number) => PromiseLike<ListResult<T, E>>;

export interface PageOptions {
  /** rows per request (default PAGE_SIZE; never above the server's max_rows) */
  pageSize?: number;
  /** stop after this many rows — an intended cap above the server's (e.g. 5,000) */
  maxRows?: number;
  /** runaway guard (default MAX_PAGES) */
  maxPages?: number;
}

/** `xs` in consecutive slices of at most `size` (the last may be shorter). */
export function chunk<T>(xs: readonly T[], size: number = ID_CHUNK): T[][] {
  if (!(size >= 1)) throw new RangeError('chunk size must be at least 1');
  const n = Math.floor(size);
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** The inclusive `[from, to]` rows of page `n` (0-based), never past `maxRows`;
 *  null once page `n` would start at or beyond `maxRows`. */
export function pageRange(n: number, pageSize: number = PAGE_SIZE, maxRows: number = Infinity): [number, number] | null {
  const from = n * pageSize;
  if (from >= maxRows) return null;
  return [from, Math.min(from + pageSize, maxRows) - 1];
}

/** Every row of a query, page by page: `page(from, to)` must return the query
 *  with a stable unique order and `.range(from, to)`. Any page's error fails
 *  the whole read ({ data: null, error }) — a partial list never passes for a
 *  complete one. A first page with neither data nor error passes through. */
export async function fetchAllPages<T, E>(page: PageQuery<T, E>, opts: PageOptions = {}): Promise<ListResult<T, E>> {
  const pageSize = Math.floor(opts.pageSize ?? PAGE_SIZE);
  if (!(pageSize >= 1)) throw new RangeError('page size must be at least 1');
  const maxRows = opts.maxRows ?? Infinity;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const rows: T[] = [];
  for (let n = 0; n < maxPages; n++) {
    const range = pageRange(n, pageSize, maxRows);
    if (!range) break;
    const { data, error } = await page(range[0], range[1]);
    if (error) return { data: null, error };
    if (!data && n === 0) return { data: null, error: null };
    const got = data ?? [];
    for (const r of got) rows.push(r);
    if (got.length < range[1] - range[0] + 1) break;
  }
  return { data: rows, error: null };
}

/** `fetchAllPages` over a long id list: one paged query per chunk of distinct
 *  ids (`page(part, from, to)` puts `part` in its `.in()`), rows concatenated
 *  in chunk order. No ids → no request. Any error fails the whole read. */
export async function fetchAllChunked<I, T, E>(
  ids: readonly I[],
  page: (part: I[], from: number, to: number) => PromiseLike<ListResult<T, E>>,
  opts: { chunkSize?: number; pageSize?: number } = {},
): Promise<ListResult<T, E>> {
  const rows: T[] = [];
  for (const part of chunk([...new Set(ids)], opts.chunkSize ?? ID_CHUNK)) {
    const res = await fetchAllPages<T, E>((from, to) => page(part, from, to), { pageSize: opts.pageSize });
    if (res.error) return { data: null, error: res.error };
    for (const r of res.data ?? []) rows.push(r);
  }
  return { data: rows, error: null };
}
