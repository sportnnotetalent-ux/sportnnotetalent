/** QR-verified certificates — data (migration 20261025090000_certificates).
 *  Organisers issue; holders (and their parents) list theirs; anyone verifies
 *  a code. Demo mode keeps them in memory. Pure parts: core/certificates.ts. */
import { isSupabaseConfigured, supabase } from '../core/supabase';
import { APP_URL } from '../core/hosts';
import { printSheet, type PrintOutcome } from '../core/printSheet';
import { certificatesHtml, type CertificateItem, type CertKind, type IssuedCertificate, type PrintableCertificate } from '../core/certificates';
import { getPlayerNamesById } from './repos';

const live = () => isSupabaseConfigured && !!supabase;
const rpcMessage = (e: { message?: string } | null | undefined, fallback: string) => e?.message || fallback;

/* demo: issued certificates live here for the session */
const demoCerts: (IssuedCertificate & { tournamentId: string })[] = [];
const demoCode = () => Array.from({ length: 10 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

type Row = { code: string; player_id: string; kind: CertKind; title: string; detail: string | null; sport?: string | null; team_name?: string | null; event_date?: string | null; tournament?: string | null; issued_at: string; revoked_at: string | null };
const fromRow = (r: Row): IssuedCertificate => ({
  code: r.code, playerId: r.player_id, kind: r.kind, title: r.title, detail: r.detail ?? undefined,
  sport: r.sport ?? undefined, teamName: r.team_name ?? undefined, eventDate: r.event_date ?? undefined,
  tournament: r.tournament ?? undefined, issuedAt: r.issued_at, revokedAt: r.revoked_at ?? undefined,
});

/** Issue (organisers). Returns every certificate of the tournament afterwards. */
export async function issueCertificates(tournamentId: string, items: CertificateItem[]): Promise<IssuedCertificate[]> {
  if (!live()) {
    for (const i of items) {
      if (demoCerts.some((c) => c.tournamentId === tournamentId && c.playerId === i.playerId && c.kind === i.kind && c.title === i.title && (c.detail ?? '') === (i.detail ?? ''))) continue;
      demoCerts.push({ ...i, tournamentId, code: demoCode(), issuedAt: new Date().toISOString() });
    }
    return demoCerts.filter((c) => c.tournamentId === tournamentId);
  }
  const all: IssuedCertificate[] = [];
  // the server takes up to 2,000 at a time
  for (let i = 0; i < Math.max(items.length, 1); i += 2000) {
    const { data, error } = await supabase!.rpc('issue_certificates', { p_tournament: tournamentId, p_items: items.slice(i, i + 2000) });
    if (error) throw new Error(rpcMessage(error, 'Couldn’t issue the certificates — try again.'));
    all.splice(0, all.length, ...((data ?? []) as Row[]).map(fromRow));
  }
  return all;
}

/** A tournament's issued certificates (its organisers). */
export async function getTournamentCertificates(tournamentId: string): Promise<IssuedCertificate[]> {
  if (!live()) return demoCerts.filter((c) => c.tournamentId === tournamentId);
  const { data, error } = await supabase!.from('certificates')
    .select('code, player_id, kind, title, detail, sport, team_name, event_date, issued_at, revoked_at')
    .eq('tournament_id', tournamentId).order('kind').order('title');
  if (error) return [];
  return ((data ?? []) as Row[]).map(fromRow);
}

/** The signed-in person's certificates — and their children's (linked parent). */
export async function getMyCertificates(): Promise<IssuedCertificate[]> {
  if (!live()) return [...demoCerts];
  const { data, error } = await supabase!.rpc('my_certificates');
  if (error) return [];
  return ((data ?? []) as Row[]).map(fromRow);
}

export interface VerifiedCertificate {
  found: boolean;
  code?: string;
  /** an adult by name; a possible minor by initials */
  holder?: string;
  kind?: CertKind;
  title?: string;
  detail?: string;
  sport?: string;
  teamName?: string;
  eventDate?: string;
  tournament?: string;
  tournamentId?: string;
  issuer?: string;
  issuerVerified?: boolean;
  issuedAt?: string;
  revoked?: boolean;
  revokedReason?: string;
}

/** Anyone: is this code a genuine SportnNote certificate? */
export async function verifyCertificate(code: string): Promise<VerifiedCertificate> {
  const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!live()) {
    const d = demoCerts.find((x) => x.code === c);
    return d ? { found: true, code: d.code, holder: 'Demo player', kind: d.kind, title: d.title, detail: d.detail, teamName: d.teamName, eventDate: d.eventDate, issuer: 'Demo organisers', issuedAt: d.issuedAt, revoked: !!d.revokedAt } : { found: false };
  }
  const { data, error } = await supabase!.rpc('verify_certificate', { p_code: c });
  if (error) throw new Error('Couldn’t check that certificate just now — try again.');
  return (data ?? { found: false }) as VerifiedCertificate;
}

/** Organisers: withdraw a certificate (it then shows as revoked when scanned). */
export async function revokeCertificate(code: string, reason?: string): Promise<void> {
  if (!live()) {
    const d = demoCerts.find((x) => x.code === code);
    if (d) d.revokedAt = new Date().toISOString();
    return;
  }
  const { error } = await supabase!.rpc('revoke_certificate', { p_code: code, p_reason: reason ?? null });
  if (error) throw new Error(rpcMessage(error, 'Couldn’t revoke it — try again.'));
}

/** Print certificates (one A4 landscape page each, QR on every one). The names
 *  printed are the ones THIS viewer may see — organisers and holders are in the
 *  player's circle, so full names. */
export async function printCertificates(certs: readonly IssuedCertificate[], o: { issuer: string; title?: string }): Promise<PrintOutcome> {
  if (!certs.length) return 'failed';
  const names = await getPlayerNamesById(certs.map((c) => c.playerId));
  const printable: PrintableCertificate[] = certs.map((c) => ({ ...c, holderName: names.get(c.playerId) ?? 'Player', issuer: o.issuer }));
  return printSheet(certificatesHtml(printable, { appUrl: APP_URL, title: o.title }), { autoPrint: false, landscape: true });
}
