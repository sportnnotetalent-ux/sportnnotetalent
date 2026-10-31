/**
 * Personalised Home (founder 2026-10-31) — talking to the server (migration
 * 20261031120000_personalised_home.sql). The answers to the first-run questions
 * go straight into the person's own player profile (sports, position,
 * handedness, city), so nothing is filled in twice; the server keeps how they
 * use the app, the sports they picked and their home city for "Near you".
 * Before that migration runs, everything here reports "not available" and the
 * app behaves as before. Demo mode keeps the answers on the device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '../core/supabase';
import type { Match, SportId } from '../core/types';
import { mergeSportDetails, mergeSports, plays, type NearBasis, type SportAnswer, type Use } from '../core/personalise';
import type { Coords } from '../core/location';
import { createMyPlayer, getMatches, getPlayer, matchesFromRows, updatePlayer } from './repos';

const live = () => isSupabaseConfigured && !!supabase;
const missing = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (['PGRST202', '42883', 'PGRST205'].includes(e.code ?? '') || /could not find the function/i.test(e.message ?? ''));
const message = (e: unknown) =>
  (e as { message?: string } | null)?.message || 'Something went wrong. Check your connection and try again.';

export interface City { id: number; name: string; region?: string | null; country: string; lat: number; lng: number }
export interface Personalisation { done: boolean; skipped: boolean; uses: Use[]; sports: SportId[]; homeCity: City | null }

/* ---------------- demo mode: kept on the device ---------------- */

const DEMO_KEY = 'sn.demo.personalisation';
const DEMO_CITY: City = { id: 1269843, name: 'Hyderabad', region: 'Telangana', country: 'IN', lat: 17.384, lng: 78.456 };
async function demoRead(): Promise<Personalisation> {
  try {
    const v = await AsyncStorage.getItem(DEMO_KEY);
    if (v) return JSON.parse(v) as Personalisation;
  } catch { /* fall through */ }
  return { done: false, skipped: false, uses: [], sports: [], homeCity: null };
}
const demoWrite = async (p: Personalisation) => { try { await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(p)); } catch { /* non-fatal */ } };

/* ---------------- the answers ---------------- */

/** This account's answers; null when the server doesn't have the feature yet. */
export async function getMyPersonalisation(): Promise<Personalisation | null> {
  if (!live()) return demoRead();
  const { data, error } = await supabase!.rpc('my_personalisation', {}, { get: true });
  // Not there yet (migration not run) or unreachable: behave as before, never nag.
  if (error) return null;
  const d = data as { done: boolean; skipped: boolean; uses: Use[] | null; sports: SportId[] | null; home_city: City | null } | null;
  if (!d) return null;
  return { done: !!d.done, skipped: !!d.skipped, uses: d.uses ?? [], sports: d.sports ?? [], homeCity: d.home_city ?? null };
}

/** Save the answers: on the server, and into the person's own player profile
 *  (sports and per-sport details only for people who play; the city for all). */
export async function savePersonalisation(o: {
  profileId?: string; uses: Use[]; sports: SportId[]; homeCity: City | null; answers: Partial<Record<SportId, SportAnswer>>;
}): Promise<void> {
  if (!live()) {
    await demoWrite({ done: true, skipped: false, uses: o.uses, sports: o.sports, homeCity: o.homeCity });
  } else {
    const { error } = await supabase!.rpc('save_personalisation', { p_uses: o.uses, p_home_city: o.homeCity?.id ?? null, p_sports: o.sports });
    if (error) throw new Error(message(error));
  }
  if (live() && !o.profileId) return;
  const playerId = await createMyPlayer(o.profileId ?? '');
  const player = await getPlayer(playerId);
  if (!player) return;
  const player_plays = plays(o.uses);
  await updatePlayer(playerId, {
    ...(player_plays ? { sports: mergeSports(player.sports ?? [], o.sports), sportDetails: mergeSportDetails(player.sportDetails, o.answers) } : {}),
    ...(o.homeCity ? { city: o.homeCity.name } : {}),
  });
}

/** "Skip": remembered, so the questions don't open by themselves again. */
export async function skipPersonalisation(): Promise<void> {
  if (!live()) { const p = await demoRead(); await demoWrite({ ...p, skipped: true }); return; }
  const { error } = await supabase!.rpc('skip_personalisation');
  if (error && !missing(error)) throw new Error(message(error));
}

/* ---------------- cities ---------------- */

export async function searchCities(q: string): Promise<City[]> {
  const s = q.trim();
  if (s.length < 2) return [];
  if (!live()) return DEMO_CITY.name.toLowerCase().startsWith(s.toLowerCase()) ? [DEMO_CITY] : [];
  const { data, error } = await supabase!.rpc('search_cities', { p_q: s, p_limit: 8 }, { get: true });
  if (error) throw new Error(missing(error) ? 'City search isn’t ready yet. Please try again later.' : message(error));
  return (data as City[] | null) ?? [];
}

/* ---------------- Near you ---------------- */

export type NearMatch = Match & { views: number; distanceKm: number | null };
export interface NearResult {
  basis: NearBasis; radiusKm: number | null; allSports: boolean; city: { name: string; region?: string | null } | null;
  live: NearMatch[]; soon: NearMatch[]; recent: NearMatch[];
}
type NearRow = { views?: number; distance_km?: number | null };

async function nearRows(rows: NearRow[] | undefined): Promise<NearMatch[]> {
  const list = rows ?? [];
  const ms = await matchesFromRows(list);
  return ms.map((m, i) => ({ ...m, views: list[i]?.views ?? 0, distanceKm: list[i]?.distance_km ?? null }));
}

/** Live matches near a point (nearest first) or in a city (most viewed first);
 *  starting soon and just finished when nothing's live. Null when the server
 *  doesn't have the feature yet. */
export async function nearMatches(o: { sports: SportId[]; at: Coords | null; cityId: number | null }): Promise<NearResult | null> {
  if (!live()) {
    // Like the server: no location and no city → nothing to go on.
    if (!o.at && !o.cityId) return { basis: 'none', radiusKm: null, allSports: false, city: null, live: [], soon: [], recent: [] };
    const all = (await getMatches()).filter((m) => !o.sports.length || o.sports.includes(m.sport));
    const now = Date.now();
    const tag = (m: Match): NearMatch => ({ ...m, views: 0, distanceKm: null });
    return {
      basis: 'city', radiusKm: 50, allSports: false, city: DEMO_CITY,
      live: all.filter((m) => m.status === 'live').map(tag),
      soon: all.filter((m) => m.status === 'scheduled' && Date.parse(m.startsAt) - now < 24 * 3600_000).map(tag),
      recent: all.filter((m) => m.status === 'completed').slice(-5).map(tag),
    };
  }
  // PH-03: a POST, so the location travels in the body and never sits in a
  // request address (server logs keep those). It doesn't empty the read cache
  // (readCache.ts: it changes nothing a cached read returns).
  const { data, error } = await supabase!.rpc('near_matches', {
    p_sports: o.sports.length ? o.sports : null, p_lat: o.at?.lat ?? null, p_lng: o.at?.lng ?? null, p_city: o.cityId, p_limit: 10,
  });
  if (error) { if (missing(error)) return null; throw new Error(message(error)); }
  const d = data as { basis: NearBasis; radius_km: number | null; all_sports: boolean; city: NearResult['city']; live: NearRow[]; soon: NearRow[]; recent: NearRow[] };
  const [l, s, r] = await Promise.all([nearRows(d.live), nearRows(d.soon), nearRows(d.recent)]);
  return { basis: d.basis, radiusKm: d.radius_km, allSports: !!d.all_sports, city: d.city, live: l, soon: s, recent: r };
}

/* ---------------- match views ---------------- */

const demoViews = new Map<string, number>();
/** Count this person's (or, signed out, this device's) view of a match —
 *  once a day; the match's scorers and hosts don't count. Returns the count,
 *  or null when it couldn't be read. Never throws. */
export async function recordMatchView(matchId: string, deviceId: string | null): Promise<number | null> {
  if (!live()) { const n = (demoViews.get(matchId) ?? 0) + 1; demoViews.set(matchId, n); return n; }
  try {
    const { data, error } = await supabase!.rpc('record_match_view', { p_match: matchId, p_device: deviceId });
    return error ? null : (data as number);
  } catch { return null; }
}
