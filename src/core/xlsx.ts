/**
 * Read the first sheet of an Excel workbook (.xlsx) as rows of text — for the
 * student list upload (2026-10-27), so a school doesn't have to "Save as CSV"
 * first. No library: an .xlsx is a zip of XML files; the zip is read here and
 * inflated with the platform's DecompressionStream (every current browser,
 * and Node for the tests). Dates in date-formatted cells come out as
 * YYYY-MM-DD; numbers (phone, admission numbers) as plain digits.
 *
 * Only the old binary .xls, .ods and Numbers files still need saving as CSV.
 */

/** Student lists breaks SL-10 / SL-11: a file, an unzipped part and a sheet
 *  can't be bigger than this (a zip bomb stops here instead of freezing the tab). */
export const XLSX_LIMITS = { fileBytes: 15 * 1024 * 1024, entryBytes: 40 * 1024 * 1024, rows: 5002 };
const TOO_BIG = 'This Excel file is too big — split the list (up to 5,000 students at a time), or save it as CSV.';

/* ----------------------------------- zip ----------------------------------- */

interface ZipEntry { name: string; method: number; size: number; offset: number }

function zipEntries(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This isn’t an Excel (.xlsx) file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    out.push({ name: dec.decode(buf.subarray(p + 46, p + 46 + nameLen)), method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!DS) throw new Error('This browser can’t open Excel files — save it as CSV, or copy the cells and paste them.');
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DS('deflate-raw')).getReader();
  // Read in pieces and stop at the limit — the size in the zip can lie (SL-10).
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > XLSX_LIMITS.entryBytes) { await reader.cancel().catch(() => {}); throw new Error(TOO_BIG); }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const x of parts) { out.set(x, p); p += x.length; }
  return out;
}

async function readEntry(buf: Uint8Array, e: ZipEntry): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error('The Excel file looks damaged.');
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const raw = buf.subarray(start, start + e.size);
  if (e.method === 0 && raw.length > XLSX_LIMITS.entryBytes) throw new Error(TOO_BIG);
  const bytes = e.method === 0 ? raw : e.method === 8 ? await inflateRaw(raw) : null;
  if (!bytes) throw new Error('The Excel file uses a format we can’t read — save it as CSV.');
  return new TextDecoder().decode(bytes);
}

/* ----------------------------------- xml ----------------------------------- */

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const xmlText = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) =>
    (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? _m));

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** The workbook's shared strings (rich-text runs joined). */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) ?? []) {
    const parts = [...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
    out.push(xmlText(parts.join('')));
  }
  return out;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Which cell styles (by index) show a date. */
export function parseDateStyles(xml: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attr(m[0], 'numFmtId')), code = xmlText(attr(m[0], 'formatCode') ?? '');
    if (Number.isFinite(id)) custom.set(id, code);
  }
  const isDateCode = (code: string) => {
    const c = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return /[dy]/i.test(c) && !/^[#0.,%\s]*$/.test(c);
  };
  const out = new Set<number>();
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? '';
  let k = 0;
  for (const m of xfs.matchAll(/<xf\b[^>]*\/?>/g)) {
    const id = Number(attr(m[0], 'numFmtId') ?? 0);
    if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateCode(custom.get(id)!))) out.add(k);
    k += 1;
  }
  return out;
}

const colIndex = (ref: string): number => {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** An Excel date serial → YYYY-MM-DD. `date1904`: the workbook counts from
 *  1904 (older Mac Excel), 1,462 days later than the usual 1900 system (SL-15). */
export function excelDate(serial: number, date1904 = false): string {
  const ms = Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86_400_000); // 25569 = 1970-01-01
  return new Date(ms).toISOString().slice(0, 10);
}

const plainNumber = (v: string): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return Number.isInteger(n) && Math.abs(n) < 1e16 ? n.toFixed(0) : String(n);
};

/** A worksheet's rows of text. Split, not regex-scanned, so a malformed
 *  sheet (unclosed cells, one giant row) stays linear (SL-11). */
export function parseSheet(xml: string, shared: string[], dateStyles: Set<number> = new Set(), opts: { date1904?: boolean } = {}): string[][] {
  const rows: string[][] = [];
  const at0 = xml.indexOf('<sheetData');
  for (const piece of (at0 >= 0 ? xml.slice(at0) : xml).split('</row>')) {
    if (rows.length >= XLSX_LIMITS.rows) break;
    const start = piece.lastIndexOf('<row');
    const open = start < 0 ? -1 : piece.indexOf('>', start);
    if (open < 0) continue;
    const rowXml = piece.slice(open + 1);
    if (rowXml.length > 2_000_000) continue;
    const row: string[] = [];
    for (const part of rowXml.split(/<c(?=[\s>/])/).slice(1)) {
      const gt = part.indexOf('>');
      if (gt < 0) continue;
      const selfClosing = part[gt - 1] === '/';
      const head = part.slice(0, selfClosing ? gt - 1 : gt);
      const end = part.indexOf('</c>', gt);
      const body = selfClosing ? '' : part.slice(gt + 1, end < 0 ? undefined : end);
      const ref = attr(head, 'r'), t = attr(head, 't'), s = Number(attr(head, 's') ?? -1);
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let text = '';
      if (t === 's' && v != null) text = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') text = xmlText([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
      else if (t === 'b') text = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : '';
      else if (v != null) text = t === 'str' || t === 'e' ? xmlText(v) : dateStyles.has(s) && Number(v) > 0 && Number(v) < 2958466 ? excelDate(Number(v), opts.date1904) : plainNumber(v);
      const at = ref ? colIndex(ref) : row.length;
      while (row.length < at) row.push('');
      row[at] = text.trim();
    }
    if (row.some((x) => x !== '')) rows.push(row);
  }
  return rows;
}

/** Rows → tab-separated text the roster parser reads (quoted where needed). */
export const rowsToTsv = (rows: string[][]): string =>
  rows.map((r) => r.map((c) => (/[\t\n\r"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t')).join('\n');

/** The workbook's first sheet (in the workbook's own order). */
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (buf.length > XLSX_LIMITS.fileBytes) throw new Error(TOO_BIG);
  const entries = zipEntries(buf);
  const get = async (name: string) => { const e = entries.find((x) => x.name === name); return e ? readEntry(buf, e) : undefined; };
  const wb = (await get('xl/workbook.xml')) ?? '';
  const rels = (await get('xl/_rels/workbook.xml.rels')) ?? '';
  const firstRid = /<sheet\b[^>]*\sr:id="([^"]+)"/.exec(wb)?.[1];
  const target = firstRid ? new RegExp(`<Relationship\\b[^>]*Id="${firstRid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
    ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstRid}"`).exec(rels)?.[1] : undefined;
  const sheetPath = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : undefined;
  const sheetName = sheetPath && entries.some((e) => e.name === sheetPath)
    ? sheetPath
    : entries.map((e) => e.name).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]))[0];
  if (!sheetName) throw new Error('No sheet found in the Excel file.');
  const [sheet, sst, styles] = await Promise.all([get(sheetName), get('xl/sharedStrings.xml'), get('xl/styles.xml')]);
  const date1904 = /<workbookPr\b[^>]*\sdate1904="(1|true)"/i.test(wb);
  return parseSheet(sheet ?? '', sst ? parseSharedStrings(sst) : [], styles ? parseDateStyles(styles) : new Set(), { date1904 });
}
