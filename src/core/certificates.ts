/**
 * QR-verified certificates (migration 20261025090000_certificates). Pure (node
 * tests load it): kinds and wording, the code format, the verify link, who gets
 * which certificate from a tournament's results, and the printable A4 sheet
 * (one certificate per page, each with a QR to its verify page).
 */
import { qrSvg } from './qrSvg.ts';

export type CertKind = 'champion' | 'runner_up' | 'third' | 'award' | 'medal' | 'participation';

/** What the organiser issues (the server adds the code and who issued it). */
export interface CertificateItem {
  playerId: string;
  kind: CertKind;
  /** "Champions", "Player of the Tournament", "Gold — 100 m U14 Boys" */
  title: string;
  /** the event line: "Inter-School Football Cup 2026 · Football" */
  detail?: string;
  sport?: string;
  teamName?: string;
  /** YYYY-MM-DD */
  eventDate?: string;
}

export interface IssuedCertificate extends CertificateItem {
  code: string;
  issuedAt: string;
  revokedAt?: string;
  tournament?: string;
}

export const KIND_LABEL: Record<CertKind, string> = {
  champion: 'Champions',
  runner_up: 'Runners-up',
  third: 'Third place',
  award: 'Award',
  medal: 'Medal',
  participation: 'Participation',
};

/** "ABCDE23456" → "ABCD-E234-56" (how it's printed and typed). */
export function formatCode(code: string): string {
  const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return c.match(/.{1,4}/g)?.join('-') ?? c;
}

/** The page the QR opens: `${appUrl}/c/CODE`. */
export function certificateUrl(code: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/c/${code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`;
}

/* ----------------------------- who gets what ------------------------------ */

export interface PlacementInput {
  tournamentName: string;
  sport: string;
  sportName: string;
  eventDate?: string;
  /** team id → its players (roster ids) */
  rosters: ReadonlyMap<string, readonly string[]>;
  teamName: (teamId: string) => string;
  champion?: string;
  runnerUp?: string;
  third?: string;
}

/** Every player of the champion / runner-up / third team gets that certificate. */
export function placementItems(p: PlacementInput): CertificateItem[] {
  const out: CertificateItem[] = [];
  const detail = `${p.tournamentName} · ${p.sportName}`;
  const add = (teamId: string | undefined, kind: CertKind, title: string) => {
    if (!teamId) return;
    for (const playerId of p.rosters.get(teamId) ?? []) {
      out.push({ playerId, kind, title, detail, sport: p.sport, teamName: p.teamName(teamId), eventDate: p.eventDate });
    }
  };
  add(p.champion, 'champion', 'Champions');
  add(p.runnerUp, 'runner_up', 'Runners-up');
  add(p.third, 'third', 'Third place');
  return out;
}

/** A published tournament award ("Player of the Tournament" …). */
export function awardItems(awards: readonly { playerId: string; label: string; sport: string; teamName?: string; detail?: string }[], o: { tournamentName: string; sportName: (sport: string) => string; eventDate?: string }): CertificateItem[] {
  return awards.filter((a) => a.playerId && a.label.trim()).map((a) => ({
    playerId: a.playerId, kind: 'award', title: a.label.trim().slice(0, 80),
    detail: [o.tournamentName, o.sportName(a.sport), a.detail].filter(Boolean).join(' · ').slice(0, 160),
    sport: a.sport, teamName: a.teamName, eventDate: o.eventDate,
  }));
}

const MEDAL_WORD = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' } as const;

/** A meet medal — every member of a relay / crew gets one. */
export function medalItems(medals: readonly { playerIds: readonly string[]; medal: 'gold' | 'silver' | 'bronze'; event: string; sport: string; teamName?: string }[], o: { tournamentName: string; eventDate?: string }): CertificateItem[] {
  const out: CertificateItem[] = [];
  for (const m of medals) {
    for (const playerId of m.playerIds) {
      out.push({ playerId, kind: 'medal', title: `${MEDAL_WORD[m.medal]} — ${m.event}`.slice(0, 80), detail: o.tournamentName.slice(0, 160), sport: m.sport, teamName: m.teamName, eventDate: o.eventDate });
    }
  }
  return out;
}

/** Everyone on a team that played in the tournament. */
export function participationItems(p: Omit<PlacementInput, 'champion' | 'runnerUp' | 'third'> & { teamIds: readonly string[] }): CertificateItem[] {
  const out: CertificateItem[] = [];
  const seen = new Set<string>();
  for (const t of p.teamIds) {
    for (const playerId of p.rosters.get(t) ?? []) {
      if (seen.has(playerId)) continue;
      seen.add(playerId);
      out.push({ playerId, kind: 'participation', title: 'Participation', detail: `${p.tournamentName} · ${p.sportName}`, sport: p.sport, teamName: p.teamName(t), eventDate: p.eventDate });
    }
  }
  return out;
}

/** One certificate per player per achievement (the server dedupes too). */
export function dedupeItems(items: readonly CertificateItem[]): CertificateItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = `${i.playerId}|${i.kind}|${i.title}|${i.detail ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* --------------------------- the printable sheet --------------------------- */

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface PrintableCertificate extends IssuedCertificate {
  /** the name printed on it (the organiser / holder sees the full name) */
  holderName: string;
  /** "Greenwood High School" */
  issuer: string;
}

const readableDate = (d?: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '');
  if (!m) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
};

const CSS = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #1b1f24; font-family: Georgia, "Times New Roman", serif; }
.bar { position: sticky; top: 0; display: flex; gap: 12px; align-items: center; padding: 10px 16px; background: #0D5A3F; color: #fff; font: 14px -apple-system, Roboto, Arial, sans-serif; }
.bar button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: #C6EE3E; color: #14181D; font-weight: 700; cursor: pointer; }
@media print { .bar { display: none; } }
.cert { width: 297mm; height: 210mm; padding: 12mm; page-break-after: always; break-after: page; }
.cert:last-child { page-break-after: auto; break-after: auto; }
.frame { position: relative; height: 100%; border: 3px double #1b6b4a; padding: 14mm 18mm; display: flex; flex-direction: column; align-items: center; text-align: center; }
.brand { font: 700 13pt -apple-system, Roboto, Arial, sans-serif; letter-spacing: 1px; color: #1b6b4a; }
.brand b { color: #1b1f24; }
.kind { margin-top: 8mm; font-size: 30pt; letter-spacing: 2px; text-transform: uppercase; }
.pre { margin-top: 6mm; font-size: 13pt; color: #555; font-style: italic; }
.name { margin-top: 3mm; font-size: 30pt; font-weight: 700; border-bottom: 1px solid #999; padding: 0 12mm 2mm; }
.title { margin-top: 6mm; font-size: 20pt; font-weight: 700; color: #1b6b4a; }
.detail { margin-top: 2mm; font-size: 14pt; }
.team { margin-top: 1mm; font-size: 12pt; color: #555; }
.foot { position: absolute; left: 18mm; right: 18mm; bottom: 12mm; display: flex; align-items: flex-end; justify-content: space-between; font: 10pt -apple-system, Roboto, Arial, sans-serif; color: #333; text-align: left; }
.sign { min-width: 70mm; }
.sign .line { border-top: 1px solid #333; margin-top: 14mm; padding-top: 1mm; }
.qr { display: flex; gap: 4mm; align-items: flex-end; }
.qr .code { font: 700 11pt ui-monospace, Menlo, Consolas, monospace; letter-spacing: 1px; }
.qr .how { font-size: 8.5pt; color: #555; max-width: 52mm; }
.revoked { position: absolute; top: 40%; left: 0; right: 0; font: 900 48pt -apple-system, Arial, sans-serif; color: rgba(200,0,0,0.35); transform: rotate(-12deg); }
`;

/** The printable document: one A4 landscape certificate per page. */
export function certificatesHtml(certs: readonly PrintableCertificate[], o: { appUrl: string; title?: string; toolbar?: boolean }): string {
  const pages = certs.map((c) => {
    const url = certificateUrl(c.code, o.appUrl);
    const heading = c.kind === 'participation' ? 'Certificate of Participation' : 'Certificate of Achievement';
    const pre = c.kind === 'participation' ? 'This is to certify that' : 'This certificate is proudly presented to';
    const title = c.kind === 'participation' ? 'for taking part in' : c.title;
    const when = readableDate(c.eventDate) || readableDate(c.issuedAt);
    return `<section class="cert"><div class="frame">
      <div class="brand">Sport<b>n</b>Note · ${esc(c.issuer)}</div>
      <div class="kind">${esc(heading)}</div>
      <div class="pre">${esc(pre)}</div>
      <div class="name">${esc(c.holderName)}</div>
      <div class="title">${esc(title)}</div>
      ${c.detail ? `<div class="detail">${esc(c.detail)}</div>` : ''}
      ${c.teamName ? `<div class="team">${esc(c.teamName)}</div>` : ''}
      ${c.revokedAt ? '<div class="revoked">REVOKED</div>' : ''}
      <div class="foot">
        <div class="sign"><div>${esc(when)}</div><div class="line">Organiser · ${esc(c.issuer)}</div></div>
        <div class="qr">${qrSvg(url, { size: 96 })}<div><div class="code">${esc(formatCode(c.code))}</div><div class="how">Scan to check this certificate is genuine, or open ${esc(url.replace(/^https?:\/\//, ''))}</div></div></div>
      </div>
    </div></section>`;
  }).join('');
  const bar = o.toolbar === false ? '' : `<div class="bar"><button onclick="window.print()">🖨 Print / Save as PDF</button><span>${esc(o.title ?? 'Certificates')} · ${certs.length} page${certs.length === 1 ? '' : 's'}</span></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(o.title ?? 'Certificates')}</title><style>${CSS}</style></head><body>${bar}${pages}</body></html>`;
}
