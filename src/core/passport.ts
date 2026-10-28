/**
 * Career passport (migration 20261025110000_career_passport). Pure (node tests
 * load it): the share link and the printable one-page passport — the holder's
 * official record by sport, their honours (certificates), how their age was
 * verified, and a QR to the live passport page.
 */
import { qrSvg } from './qrSvg.ts';
import { formatCode } from './certificates.ts';

export function passportUrl(code: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/pp/${code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`;
}

export type AgeVerifiedBy = 'document' | 'school' | 'parent';

export const AGE_VERIFIED_TEXT: Record<AgeVerifiedBy, string> = {
  document: 'Age verified by document',
  school: 'Age confirmed by their school / club',
  parent: 'Age confirmed by their parent',
};

export interface PassportHonour {
  code: string;
  kind: string;
  title: string;
  detail?: string;
  teamName?: string;
  eventDate?: string;
  issuer?: string;
}

export interface PassportSportRow {
  icon: string;
  name: string;
  matches: number;
  /** "8W 2D 1L" (empty for event sports) */
  record: string;
  /** "12 goals · 4 assists" */
  summary: string;
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const readable = (d?: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '');
  if (!m) return '';
  return `${Number(m[3])} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1]} ${m[1]}`;
};

/** Honour counts for the header: titles, medals, awards. */
export function honourCounts(h: readonly PassportHonour[]): { titles: number; medals: number; awards: number } {
  return {
    titles: h.filter((x) => x.kind === 'champion').length,
    medals: h.filter((x) => x.kind === 'medal' || x.kind === 'runner_up' || x.kind === 'third').length,
    awards: h.filter((x) => x.kind === 'award').length,
  };
}

const CSS = `
@page { size: A4 portrait; margin: 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #1b1f24; font: 10.5pt/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
.bar { position: sticky; top: 0; display: flex; gap: 12px; align-items: center; padding: 10px 16px; background: #0D5A3F; color: #fff; }
.bar button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: #C6EE3E; color: #14181D; font-weight: 700; cursor: pointer; }
@media print { .bar { display: none; } }
.page { max-width: 182mm; margin: 0 auto; padding: 8px 0; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #1b6b4a; padding-bottom: 10px; }
.brand { font-weight: 800; color: #1b6b4a; letter-spacing: .5px; }
.brand b { color: #1b1f24; }
h1 { font-size: 24pt; margin: 6px 0 2px; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.badge { border: 1px solid #1b6b4a; color: #1b6b4a; border-radius: 99px; padding: 2px 8px; font-size: 9pt; font-weight: 700; }
.muted { color: #555; font-size: 9pt; }
.qr { text-align: center; }
.qr .code { font: 700 10pt ui-monospace, Menlo, Consolas, monospace; letter-spacing: 1px; margin-top: 2px; }
.tiles { display: flex; gap: 10px; margin: 12px 0; }
.tile { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px; text-align: center; }
.tile .v { font-size: 18pt; font-weight: 800; color: #1b6b4a; }
h2 { font-size: 12pt; margin: 14px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
table { width: 100%; border-collapse: collapse; }
td, th { text-align: left; padding: 5px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
th { font-size: 9pt; color: #555; }
.foot { margin-top: 16px; color: #555; font-size: 8.5pt; border-top: 1px solid #ddd; padding-top: 6px; }
`;

/** The printable passport (one A4 page for most players). */
export function passportHtml(p: {
  name: string;
  code: string;
  appUrl: string;
  ageVerifiedBy?: AgeVerifiedBy;
  since?: string;
  official: { matches: number; record: string };
  sports: readonly PassportSportRow[];
  honours: readonly PassportHonour[];
  toolbar?: boolean;
}): string {
  const url = passportUrl(p.code, p.appUrl);
  const c = honourCounts(p.honours);
  const sportRows = p.sports.map((s) => `<tr><td>${esc(s.icon)} ${esc(s.name)}</td><td>${s.matches}</td><td>${esc(s.record)}</td><td>${esc(s.summary)}</td></tr>`).join('');
  const honourRows = p.honours.map((h) => `<tr><td><b>${esc(h.title)}</b>${h.teamName ? `<div class="muted">${esc(h.teamName)}</div>` : ''}</td><td>${esc(h.detail ?? '')}<div class="muted">${esc([readable(h.eventDate), h.issuer].filter(Boolean).join(' · '))}</div></td><td class="muted">${esc(formatCode(h.code))}</td></tr>`).join('');
  const bar = p.toolbar === false ? '' : `<div class="bar"><button onclick="window.print()">🖨 Print / Save as PDF</button><span>Career passport · ${esc(p.name)}</span></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Career passport — ${esc(p.name)}</title><style>${CSS}</style></head><body>${bar}<div class="page">
  <div class="top">
    <div>
      <div class="brand">Sport<b>n</b>Note · Career passport</div>
      <h1>${esc(p.name)}</h1>
      <div class="badges">
        ${p.ageVerifiedBy ? `<span class="badge">✓ ${esc(AGE_VERIFIED_TEXT[p.ageVerifiedBy])}</span>` : ''}
        ${p.since ? `<span class="badge">On SportnNote since ${esc(p.since.slice(0, 4))}</span>` : ''}
      </div>
    </div>
    <div class="qr">${qrSvg(url, { size: 104 })}<div class="code">${esc(formatCode(p.code))}</div><div class="muted">Scan for the live record</div></div>
  </div>
  <div class="tiles">
    <div class="tile"><div class="v">${p.official.matches}</div><div class="muted">Official matches</div>${p.official.matches && p.official.record ? `<div class="muted">${esc(p.official.record)}</div>` : ''}</div>
    <div class="tile"><div class="v">${c.titles}</div><div class="muted">Titles</div></div>
    <div class="tile"><div class="v">${c.medals}</div><div class="muted">Podiums &amp; medals</div></div>
    <div class="tile"><div class="v">${c.awards}</div><div class="muted">Awards</div></div>
  </div>
  ${p.sports.length ? `<h2>Official record by sport</h2><table><tr><th>Sport</th><th>Matches</th><th>Record</th><th>Highlights</th></tr>${sportRows}</table>` : ''}
  ${p.honours.length ? `<h2>Honours</h2><table>${honourRows}</table>` : ''}
  <div class="foot">Official matches are tournament matches scored live on SportnNote; honours are certificates issued by the organisers (each code checks at ${esc(p.appUrl.replace(/^https?:\/\//, ''))}/c/CODE). Live passport: ${esc(url.replace(/^https?:\/\//, ''))}</div>
</div></body></html>`;
}
