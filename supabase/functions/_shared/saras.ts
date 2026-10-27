/** CBSE SARAS — one affiliated school's public record, read by its affiliation
 *  number (register-lookup). The page is a two-column table of bold labels and
 *  values; a number that doesn't exist returns a page without them. Pure — the
 *  node tests load it. */

export interface SarasRecord {
  name: string;
  affiliation: string;
  state?: string;
  district?: string;
  address?: string;
  pin?: string;
  /** "Name of Principal/ Head of Institution" */
  head?: string;
  /** "Senior Secondary Level" … */
  status?: string;
  /** "INDEPENDENT", "KV" … */
  schoolType?: string;
  trust?: string;
  /** the affiliation period, YYYY-MM-DD */
  from?: string;
  to?: string;
}

export const sarasUrl = (affiliation: string): string =>
  `https://saras.cbse.gov.in/SARAS/AffiliatedList/AfflicationDetails/${encodeURIComponent(affiliation)}`;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const clean = (s: string): string =>
  s.replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/\s+/g, ' ')
    .trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The value cell after a bold label ("<b>State</b></td><td …>TAMILNADU</td>"). */
function field(html: string, label: string): string | undefined {
  const m = new RegExp(`<b>\\s*${esc(label)}\\s*:?\\s*</b>\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, 'i').exec(html);
  const v = m ? clean(m[1]) : '';
  return v || undefined;
}

/** dd/mm/yyyy → yyyy-mm-dd */
const isoDay = (d?: string): string | undefined => {
  const m = d ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim()) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};

/** The record, or null when the page has no school on it. */
export function parseSaras(html: string): SarasRecord | null {
  const name = field(html, 'Name of Institution');
  const affiliation = field(html, 'Affiliation Number');
  if (!name || !affiliation) return null;
  const period = /<b>\s*Affiliation Period\s*<\/b>[\s\S]*?From\s*:\s*<\/b>([\s\S]*?)<b>\s*To\s*:\s*<\/b>([\s\S]*?)<\/p>/i.exec(html);
  const rec: SarasRecord = {
    name, affiliation,
    state: field(html, 'State'),
    district: field(html, 'District'),
    address: field(html, 'Postal Address'),
    pin: field(html, 'Pin Code'),
    head: field(html, 'Name of Principal/ Head of Institution'),
    status: field(html, 'Status of The School'),
    schoolType: field(html, 'School Type'),
    trust: field(html, 'Name of Trust/ Society/ Managing Committee'),
    from: period ? isoDay(clean(period[1])) : undefined,
    to: period ? isoDay(clean(period[2])) : undefined,
  };
  for (const k of Object.keys(rec) as (keyof SarasRecord)[]) if (rec[k] === undefined) delete rec[k];
  return rec;
}
