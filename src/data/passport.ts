/** Career passport — data (migration 20261025110000_career_passport). The
 *  player or their parent makes a share code; anyone with it sees the passport:
 *  the official record (tournament matches), honours (certificates) and how
 *  their age was verified. Demo mode works without a server. Pure parts:
 *  core/passport.ts. */
import { isSupabaseConfigured, supabase } from '../core/supabase';
import { APP_URL } from '../core/hosts';
import { printSheet, type PrintOutcome } from '../core/printSheet';
import { passportHtml, type AgeVerifiedBy, type PassportHonour, type PassportSportRow } from '../core/passport';
import type { LineResult, SportId, StatLine } from '../core/types';
import { getSportMeta } from '../sports/sportMeta';
import { isEventSport } from '../sports/eventSports';
import { aggregate, recordText, sportSummary, type PlayerStats } from './stats';
import { getMyCertificates } from './certificates';
import { getPlayer, getPlayerStatLines } from './repos';

const live = () => isSupabaseConfigured && !!supabase;
const demoCodes = new Map<string, string>(); // playerId → code (demo)
const demoCode = () => Array.from({ length: 10 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

/** The passport's share code (made on first use) — the player or their parent. */
export async function getPassportCode(playerId: string): Promise<string> {
  if (!live()) {
    if (!demoCodes.has(playerId)) demoCodes.set(playerId, demoCode());
    return demoCodes.get(playerId)!;
  }
  const { data, error } = await supabase!.rpc('passport_code', { p_player: playerId });
  if (error || !data) throw new Error(/only the player/i.test(error?.message ?? '') ? 'Only the player or their parent can share this passport.' : 'Couldn’t make the passport link — try again.');
  return String(data);
}

/** A new code: the old link stops working. */
export async function resetPassportCode(playerId: string): Promise<string> {
  if (!live()) { const c = demoCode(); demoCodes.set(playerId, c); return c; }
  const { data, error } = await supabase!.rpc('reset_passport_code', { p_player: playerId });
  if (error || !data) throw new Error('Couldn’t reset the link — try again.');
  return String(data);
}

export interface Passport {
  found: boolean;
  playerId?: string;
  /** the viewer is the player or their parent (full name, owner actions) */
  owner?: boolean;
  /** an adult (or the owner) by name, a possible minor by initials */
  name?: string;
  ageVerifiedBy?: AgeVerifiedBy;
  since?: string;
  /** official record — tournament matches and events only */
  official: PlayerStats;
  honours: PassportHonour[];
}

interface Line { sport: string; stats?: Record<string, number>; event?: boolean; result?: LineResult | null }
const toStatLines = (lines: readonly Line[], playerId: string): StatLine[] =>
  lines.map((l, i) => ({
    id: `pp-${i}`,
    matchId: l.event ? '' : `pp-${i}`,
    ...(l.event ? { eventId: `pp-${i}` } : {}),
    playerId,
    sport: l.sport as SportId,
    stats: l.stats ?? {},
    won: l.result === 'W',
    ...(l.result ? { result: l.result } : {}),
  }));

/** Anyone with the code. */
export async function resolvePassport(code: string): Promise<Passport> {
  const c = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const none: Passport = { found: false, official: aggregate([]), honours: [] };
  if (!live()) {
    const playerId = [...demoCodes].find(([, v]) => v === c)?.[0];
    if (!playerId) return none;
    const [p, lines, certs] = await Promise.all([getPlayer(playerId), getPlayerStatLines(playerId), getMyCertificates()]);
    const honours = certs.filter((x) => x.playerId === playerId && !x.revokedAt && x.kind !== 'participation')
      .map((x) => ({ code: x.code, kind: x.kind, title: x.title, detail: x.detail, teamName: x.teamName, eventDate: x.eventDate, issuer: x.tournament }));
    return { found: true, playerId, owner: true, name: p?.fullName ?? 'Player', official: aggregate(lines), honours };
  }
  const { data, error } = await supabase!.rpc('resolve_passport', { p_code: c });
  if (error) throw new Error('Couldn’t open that passport just now — try again.');
  const d = (data ?? {}) as Partial<Omit<Passport, 'official'>> & { lines?: Line[]; adult?: boolean };
  if (!d.found || !d.playerId) return none;
  return {
    found: true,
    playerId: d.playerId,
    owner: !!d.owner,
    name: d.name ?? 'Player',
    ageVerifiedBy: d.ageVerifiedBy ?? undefined,
    since: d.since ?? undefined,
    official: aggregate(toStatLines(d.lines ?? [], d.playerId)),
    honours: d.honours ?? [],
  };
}

/** One row per sport, most played first — the passport's record table. */
export function passportRows(s: PlayerStats): PassportSportRow[] {
  return [...s.bySport].sort((a, b) => b.matches - a.matches).map((b) => {
    const meta = getSportMeta(b.sport);
    return { icon: meta.icon, name: meta.name, matches: b.matches, record: isEventSport(b.sport) ? '' : recordText(b), summary: sportSummary(b) };
  });
}

/** The printable passport (A4 portrait, QR to the live page). */
export function printPassport(p: Passport, code: string): Promise<PrintOutcome> {
  return printSheet(passportHtml({
    name: p.name ?? 'Player',
    code,
    appUrl: APP_URL,
    ageVerifiedBy: p.ageVerifiedBy,
    since: p.since,
    official: { matches: p.official.matches, record: recordText(p.official) },
    sports: passportRows(p.official),
    honours: p.honours,
  }), { autoPrint: false });
}
