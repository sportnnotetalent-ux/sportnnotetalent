/** Usage dashboard reads (founder 2026-11-06, docs/security/breaks/usage-dashboard.md):
 *  live from the server on every open / refresh, support / admin only
 *  (usage_dashboard, usage_people). Demo: a small sample from the local store. */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { demo } from './demoStore';
import type { UsageWeek } from '../core/usageKpis';

export type UsageKind = 'signups' | 'inactive' | 'games' | 'active';
export interface UsageDashboard { weeks: UsageWeek[]; by_sport: { sport: string; games: number }[]; today: Record<string, number> }
export type UsagePerson = { player_id?: string; name?: string; joined?: string; city?: string; sports?: string[]; phone_verified?: boolean; minor?: boolean; games?: number; last_seen?: string; opens?: number };
export type UsageGame = { match_id: string; sport: string; home?: string; away?: string; at?: string; steps?: number; tournament?: string };

const errText = (m: string) => (/not_allowed/.test(m) ? 'Only SportnNote support can see usage.'
  : /usage_(dashboard|people)|does not exist|schema cache/.test(m) ? 'The usage dashboard needs a database update.' : 'Couldn’t load usage — try again.');

export async function getUsageDashboard(weeks = 8): Promise<UsageDashboard> {
  if (!isSupabaseConfigured || !supabase) {
    const done = demo.matches.filter((m) => m.status === 'completed');
    const sports = new Map<string, number>();
    for (const m of done) sports.set(m.sport, (sports.get(m.sport) ?? 0) + 1);
    const wk = (i: number): UsageWeek => ({ week: new Date(Date.now() - i * 7 * 864e5).toISOString().slice(0, 10), games_scored: Math.max(0, done.length - i * 3),
      active_users: Math.max(0, demo.players.length - i * 4), sign_ups: Math.max(0, 6 - i), cohort: 4, activated: 3, started: 10, finished: 8,
      shares: 5, game_views: 22, prev_signups: 5, retained: 2, sessions: 40, crashed: i % 3 === 0 ? 1 : 0 });
    return { weeks: Array.from({ length: weeks }, (_, i) => wk(i)), by_sport: [...sports].map(([sport, games]) => ({ sport, games })).sort((a, b) => b.games - a.games),
      today: { sign_ups: 2, games_scored: 3, active_users: 9, tournaments: 1 } };
  }
  const { data, error } = await supabase.rpc('usage_dashboard', { p_weeks: weeks });
  if (error) throw new Error(errText(error.message));
  return data as UsageDashboard;
}

export async function getUsagePeople(kind: UsageKind, week?: string): Promise<(UsagePerson | UsageGame)[]> {
  if (!isSupabaseConfigured || !supabase) {
    if (kind === 'games') return demo.matches.filter((m) => m.status === 'completed').slice(0, 20)
      .map((m) => ({ match_id: m.id, sport: m.sport, home: m.homeTeam.name, away: m.awayTeam.name, at: m.startsAt, steps: 1 }));
    return demo.players.slice(0, 12).map((p, i) => ({ player_id: p.id, name: p.fullName, joined: new Date(Date.now() - i * 864e5).toISOString(),
      city: p.city, sports: p.sports, phone_verified: !!p.phoneVerified, minor: i % 5 === 0, games: kind === 'inactive' ? 0 : i % 4, last_seen: new Date().toISOString(), opens: 3 + i }));
  }
  const { data, error } = await supabase.rpc('usage_people', { p_kind: kind, p_week: week ?? null });
  if (error) throw new Error(errText(error.message));
  return (data ?? []) as (UsagePerson | UsageGame)[];
}
