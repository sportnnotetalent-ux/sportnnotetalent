/** Usage dashboard reads (founder 2026-11-06, docs/security/breaks/usage-dashboard.md):
 *  live from the server on every open / refresh, support / admin only
 *  (usage_report, usage_report_people; the v1 usage_people is the demo's list).
 *  Demo: a small sample from the local store. */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { demo } from './demoStore';
import type { UsageReportCore, UsageTotals } from '../core/usageKpis';
import { bucketFor, daysIn } from '../core/usageFilters';

export type UsageKind = 'signups' | 'inactive' | 'games' | 'active';
export type UsagePerson = { player_id?: string; name?: string; joined?: string; city?: string; sports?: string[]; phone_verified?: boolean; minor?: boolean; games?: number; last_seen?: string; opens?: number;
  /** the link they signed up from (core/signupSource.ts kinds) and which one, when kept */
  source?: string | null; source_detail?: string | null };
export type UsageGame = { match_id: string; sport: string; home?: string; away?: string; at?: string; steps?: number; tournament?: string; city?: string };

const errText = (m: string) => (/not_allowed/.test(m) ? 'Only SportnNote support can see usage.'
  : /usage_(dashboard|people)|does not exist|schema cache/.test(m) ? 'The usage dashboard needs a database update.' : 'Couldn’t load usage — try again.');

export async function getUsagePeople(kind: UsageKind, week?: string): Promise<(UsagePerson | UsageGame)[]> {
  if (!isSupabaseConfigured || !supabase) {
    if (kind === 'games') return demo.matches.filter((m) => m.status === 'completed').slice(0, 20)
      .map((m) => ({ match_id: m.id, sport: m.sport, home: m.homeTeam.name, away: m.awayTeam.name, at: m.startsAt, steps: 1 }));
    return demo.players.slice(0, 12).map((p, i) => ({ player_id: p.id, name: p.fullName, joined: new Date(Date.now() - i * 864e5).toISOString(),
      city: p.city, sports: p.sports, phone_verified: !!p.phoneVerified, minor: i % 5 === 0, games: kind === 'inactive' ? 0 : i % 4, last_seen: new Date().toISOString(), opens: 3 + i,
      source: [null, 'invite', 'game', 'tournament'][i % 4], source_detail: [null, demo.players[0]?.fullName, null, null][i % 4] }));
  }
  const { data, error } = await supabase.rpc('usage_people', { p_kind: kind, p_week: week ?? null });
  if (error) throw new Error(errText(error.message));
  return (data ?? []) as (UsagePerson | UsageGame)[];
}

/** Filters (docs/security/breaks/usage-filters.md): inclusive IST dates, and
 *  sports / city ids (0 = "No city set"); empty = all. */
export interface UsageFilter { from: string; to: string; sports: string[]; cities: number[] }
export interface UsagePlace { id: number; name: string; people: number; games: number }
export interface UsageReport extends UsageReportCore {
  today: Partial<UsageTotals>; filtered: boolean;
  by_sport: { sport: string; games: number }[]; by_source: { kind: string; signups: number }[]; places: UsagePlace[];
}

const reportErr = (m: string) => (/bad_range/.test(m) ? 'Pick a period of up to 400 days, not in the future.'
  : /bad_filter/.test(m) ? 'Too many sports or places — pick fewer.'
  : /usage_report|does not exist|schema cache/.test(m) ? 'The dashboard filters need a database update.' : errText(m));
const nul = <T,>(a: T[]) => (a.length ? a : null);

/** Demo: the local store's games and players, honouring the filters (cities by name). */
function demoReport(f: UsageFilter): UsageReport {
  const cityNames = [...new Set(demo.players.map((p) => p.city).filter(Boolean) as string[])].sort();
  const cityId = (c?: string) => (c ? cityNames.indexOf(c) + 1 : 0);
  const ppl = demo.players.filter((p) => (!f.sports.length || (p.sports ?? []).some((s) => f.sports.includes(s)))
    && (!f.cities.length || f.cities.includes(cityId(p.city))));
  const games = demo.matches.filter((m) => m.status === 'completed' && (!f.sports.length || f.sports.includes(m.sport)) && (!f.cities.length || f.cities.includes(0)));
  const n = daysIn(f.from, f.to), unit = bucketFor(f.from, f.to), step = unit === 'day' ? 1 : unit === 'week' ? 7 : 30;
  const t = (k: number): UsageTotals => ({ games_scored: Math.round(games.length / k), active_users: Math.round(ppl.length / k), sign_ups: Math.round(ppl.length / (2 * k)),
    cohort: 4, activated: 3, started: 10, finished: 8, shares: 5, game_views: 22, ret_base: 5, retained: 2, sessions: 40, crashed: 1, from_links: Math.round(ppl.length / (4 * k)), tournaments: 1 });
  const sports = new Map<string, number>();
  for (const m of games) sports.set(m.sport, (sports.get(m.sport) ?? 0) + 1);
  const start = Date.parse(`${f.from}T00:00:00Z`);
  return { from: f.from, to: f.to, bucket: unit, filtered: !!(f.sports.length || f.cities.length), period: t(1), previous: t(2), today: t(n),
    buckets: Array.from({ length: Math.ceil(n / step) }, (_, i) => ({ start: new Date(start + i * step * 864e5).toISOString().slice(0, 10), ...t(Math.ceil(n / step) + (i % 3)) })),
    by_sport: [...sports].map(([sport, g]) => ({ sport, games: g })).sort((a, b) => b.games - a.games),
    by_source: [{ kind: 'invite', signups: 5 }, { kind: 'game', signups: 3 }, { kind: 'direct', signups: 2 }],
    places: [...cityNames.map((name, i) => ({ id: i + 1, name, people: demo.players.filter((p) => p.city === name).length, games: 0 })),
      { id: 0, name: 'No city set', people: demo.players.filter((p) => !p.city).length, games: demo.matches.filter((m) => m.status === 'completed').length }] };
}

export async function getUsageReport(f: UsageFilter): Promise<UsageReport> {
  if (!isSupabaseConfigured || !supabase) return demoReport(f);
  const { data, error } = await supabase.rpc('usage_report', { p_from: f.from, p_to: f.to, p_sports: nul(f.sports), p_cities: nul(f.cities) });
  if (error) throw new Error(reportErr(error.message));
  return data as UsageReport;
}

export async function getUsageReportPeople(kind: UsageKind, f: UsageFilter): Promise<(UsagePerson | UsageGame)[]> {
  if (!isSupabaseConfigured || !supabase) return getUsagePeople(kind);
  const { data, error } = await supabase.rpc('usage_report_people', { p_kind: kind, p_from: f.from, p_to: f.to, p_sports: nul(f.sports), p_cities: nul(f.cities) });
  if (error) throw new Error(reportErr(error.message));
  return (data ?? []) as (UsagePerson | UsageGame)[];
}
