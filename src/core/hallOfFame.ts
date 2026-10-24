/**
 * School hall of fame (migration 20261025130000_hall_of_fame). Pure (node tests
 * load it): turn the server's rows into year-by-year honours, counts, the share
 * link and the printable honours board. People are player ids; the caller
 * passes `nameOf` (names as this viewer may see them — initials for a possible
 * minor to the public).
 */
import { qrSvg } from './qrSvg.ts';

export type HonourKind = 'champion' | 'runner_up' | 'third' | 'medal' | 'award' | 'other';
export type HonourLevel = 'school' | 'zone' | 'district' | 'state' | 'national' | 'international';

export const HONOUR_KINDS: readonly HonourKind[] = ['champion', 'runner_up', 'third', 'medal', 'award', 'other'];
export const HONOUR_KIND_LABEL: Record<HonourKind, string> = {
  champion: 'Champions', runner_up: 'Runners-up', third: 'Third place', medal: 'Medal', award: 'Award', other: 'Other',
};
export const HONOUR_LEVELS: readonly HonourLevel[] = ['school', 'zone', 'district', 'state', 'national', 'international'];
export const HONOUR_LEVEL_LABEL: Record<HonourLevel, string> = {
  school: 'School', zone: 'Zonal', district: 'District', state: 'State', national: 'National', international: 'International',
};

/** A certificate one of the school's students earned (server row). */
export interface HallCert {
  kind: string;
  title: string;
  detail?: string;
  sport?: string;
  teamName?: string;
  date?: string;
  tournamentId?: string;
  tournament?: string;
  /** the school hosted the event */
  home?: boolean;
  playerId: string;
}

/** An honour the school recorded itself. */
export interface HallManual {
  id: string;
  year: number;
  kind: HonourKind;
  title: string;
  sport?: string;
  level?: HonourLevel;
  teamLabel?: string;
  playerIds: string[];
  note?: string;
}

export interface HallHosted { id: string; name: string; sports?: string[]; startDate?: string; endDate?: string }

export interface HallEntry {
  key: string;
  /** verified = from certificates on SportnNote; school = added by the school */
  source: 'verified' | 'school';
  kind: HonourKind;
  title: string;
  /** the event: "Cup 2026 · Football", or the tournament's name */
  event?: string;
  sport?: string;
  team?: string;
  date?: string;
  year: number;
  playerIds: string[];
  tournamentId?: string;
  /** a school event (it hosted it) */
  home?: boolean;
  level?: HonourLevel;
  note?: string;
  /** the school's own entry (editable) */
  id?: string;
}

const ORDER: Record<HonourKind, number> = { champion: 0, runner_up: 1, third: 2, medal: 3, award: 4, other: 5 };
const asKind = (k: string): HonourKind => (HONOUR_KINDS as readonly string[]).includes(k) ? k as HonourKind : 'other';
const yearOf = (d?: string): number => Number(/^(\d{4})/.exec(d ?? '')?.[1] ?? 0);

/** The icon for an honour: 🏆 champions, 🥈 / 🥉 podium, a medal by its colour. */
export function honourIcon(kind: HonourKind, title = ''): string {
  if (kind === 'champion') return '🏆';
  if (kind === 'runner_up') return '🥈';
  if (kind === 'third') return '🥉';
  if (kind === 'medal') return /^gold/i.test(title) ? '🥇' : /^silver/i.test(title) ? '🥈' : /^bronze/i.test(title) ? '🥉' : '🏅';
  if (kind === 'award') return '🎖️';
  return '⭐';
}

/** One entry per achievement: a team's title (every squad member's certificate)
 *  or a relay's medal is one line with all its players. */
export function certEntries(certs: readonly HallCert[]): HallEntry[] {
  const by = new Map<string, HallEntry>();
  for (const c of certs) {
    const key = ['v', c.tournamentId ?? '', c.kind, c.title, c.detail ?? '', c.teamName ?? ''].join('|');
    const e = by.get(key);
    if (e) { if (!e.playerIds.includes(c.playerId)) e.playerIds.push(c.playerId); continue; }
    by.set(key, {
      key, source: 'verified', kind: asKind(c.kind), title: c.title, event: c.detail || c.tournament || undefined,
      sport: c.sport || undefined, team: c.teamName || undefined, date: c.date, year: yearOf(c.date),
      playerIds: [c.playerId], tournamentId: c.tournamentId || undefined, home: !!c.home,
    });
  }
  return [...by.values()];
}

export function manualEntries(rows: readonly HallManual[]): HallEntry[] {
  return rows.map((h) => ({
    key: `s|${h.id}`, source: 'school', kind: asKind(h.kind), title: h.title, sport: h.sport || undefined,
    team: h.teamLabel || undefined, year: h.year, playerIds: [...(h.playerIds ?? [])], level: h.level, note: h.note || undefined, id: h.id,
  }));
}

/** Every honour, newest year first; within a year titles, podiums, medals, awards. */
export function hallEntries(certs: readonly HallCert[], manual: readonly HallManual[]): HallEntry[] {
  return [...certEntries(certs), ...manualEntries(manual)].sort((a, b) =>
    b.year - a.year || ORDER[a.kind] - ORDER[b.kind] || (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title));
}

export const filterBySport = (entries: readonly HallEntry[], sport?: string | null): HallEntry[] =>
  sport ? entries.filter((e) => e.sport === sport) : [...entries];

/** Sports with honours, most first. */
export function hallSports(entries: readonly HallEntry[]): string[] {
  const n = new Map<string, number>();
  for (const e of entries) if (e.sport) n.set(e.sport, (n.get(e.sport) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}

export function hallYears(entries: readonly HallEntry[]): { year: number; entries: HallEntry[] }[] {
  const out: { year: number; entries: HallEntry[] }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.year === e.year) last.entries.push(e);
    else out.push({ year: e.year, entries: [e] });
  }
  return out;
}

export function hallCounts(entries: readonly HallEntry[]): { titles: number; podiums: number; medals: number; awards: number } {
  return {
    titles: entries.filter((e) => e.kind === 'champion').length,
    podiums: entries.filter((e) => e.kind === 'runner_up' || e.kind === 'third').length,
    medals: entries.filter((e) => e.kind === 'medal').length,
    awards: entries.filter((e) => e.kind === 'award').length,
  };
}

/** "A. K., Riya Sharma +3" — names as this viewer may see them. */
export function peopleLine(ids: readonly string[], nameOf: (id: string) => string | undefined, max = 6): string {
  const names = ids.map((id) => nameOf(id)).filter((n): n is string => !!n);
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}

/** The line under an honour's title: event · team · level / school event. */
export function entryMeta(e: HallEntry, sportName: (id: string) => string): string {
  return [
    e.event ?? (e.sport ? sportName(e.sport) : ''),
    e.team ?? '',
    e.level ? `${HONOUR_LEVEL_LABEL[e.level]} level` : '',
    e.source === 'verified' && e.home ? 'School event' : '',
  ].filter(Boolean).join(' · ');
}

export function hallUrl(orgId: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/h/${orgId}`;
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const CSS = `
@page { size: A4 portrait; margin: 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #1b1f24; font: 10.5pt/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
.bar { position: sticky; top: 0; display: flex; gap: 12px; align-items: center; padding: 10px 16px; background: #0E1116; color: #fff; }
.bar button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: #3DDC97; color: #0E1116; font-weight: 700; cursor: pointer; }
@media print { .bar { display: none; } }
.page { max-width: 182mm; margin: 0 auto; padding: 8px 0; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px double #8a6d1d; padding-bottom: 10px; }
.brand { font-weight: 800; color: #8a6d1d; letter-spacing: 1px; text-transform: uppercase; font-size: 9pt; }
h1 { font-size: 24pt; margin: 4px 0 2px; }
.muted { color: #555; font-size: 9pt; }
.qr { text-align: center; }
.tiles { display: flex; gap: 10px; margin: 12px 0; }
.tile { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px; text-align: center; }
.tile .v { font-size: 18pt; font-weight: 800; color: #8a6d1d; }
h2 { font-size: 14pt; margin: 14px 0 4px; color: #8a6d1d; border-bottom: 1px solid #e5d9b6; padding-bottom: 2px; break-after: avoid; }
.e { display: flex; gap: 8px; padding: 5px 0; border-bottom: 1px solid #f0f0f0; break-inside: avoid; }
.e .i { width: 22px; font-size: 13pt; }
.e b { font-size: 10.5pt; }
.tag { font-size: 8pt; color: #1b6b4a; font-weight: 700; }
.foot { margin-top: 16px; color: #555; font-size: 8.5pt; border-top: 1px solid #ddd; padding-top: 6px; }
`;

/** The printable honours board (A4 portrait; QR to the live page). */
export function hallHtml(p: {
  orgName: string;
  orgId: string;
  appUrl: string;
  verified?: boolean;
  city?: string;
  entries: readonly HallEntry[];
  hostedCount: number;
  nameOf: (id: string) => string | undefined;
  sportName: (id: string) => string;
  toolbar?: boolean;
}): string {
  const url = hallUrl(p.orgId, p.appUrl);
  const c = hallCounts(p.entries);
  const years = hallYears(p.entries).map((y) => `<h2>${y.year || 'Earlier'}</h2>${y.entries.map((e) => {
    const people = peopleLine(e.playerIds, p.nameOf, 12);
    const meta = entryMeta(e, p.sportName);
    return `<div class="e"><div class="i">${honourIcon(e.kind, e.title)}</div><div><b>${esc(e.title)}</b>${meta ? `<div class="muted">${esc(meta)}</div>` : ''}${people ? `<div>${esc(people)}</div>` : ''}<div class="tag">${e.source === 'verified' ? '✓ Verified on SportnNote' : 'Added by the school'}</div></div></div>`;
  }).join('')}`).join('');
  const bar = p.toolbar === false ? '' : `<div class="bar"><button onclick="window.print()">🖨 Print / Save as PDF</button><span>Hall of fame · ${esc(p.orgName)}</span></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hall of fame — ${esc(p.orgName)}</title><style>${CSS}</style></head><body>${bar}<div class="page">
  <div class="top">
    <div>
      <div class="brand">Hall of fame</div>
      <h1>${esc(p.orgName)}</h1>
      <div class="muted">${esc([p.city, p.verified ? '✓ Verified school / club on SportnNote' : ''].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="qr">${qrSvg(url, { size: 96 })}<div class="muted">Scan for the live page</div></div>
  </div>
  <div class="tiles">
    <div class="tile"><div class="v">${c.titles}</div><div class="muted">Titles</div></div>
    <div class="tile"><div class="v">${c.podiums}</div><div class="muted">Runners-up &amp; third</div></div>
    <div class="tile"><div class="v">${c.medals}</div><div class="muted">Medals</div></div>
    <div class="tile"><div class="v">${c.awards}</div><div class="muted">Awards</div></div>
    <div class="tile"><div class="v">${p.hostedCount}</div><div class="muted">Events hosted</div></div>
  </div>
  ${years || '<p class="muted">No honours yet.</p>'}
  <div class="foot">"Verified" honours come from certificates issued by the organisers on SportnNote. On the live page, under-18s show as initials to the public. Live page: ${esc(url.replace(/^https?:\/\//, ''))}</div>
</div></body></html>`;
}
