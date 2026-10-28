/** Cue sports demo data (2026-10-28) — DEMO MODE ONLY (no Supabase configured):
 *  `__sportnnoteDemo.seedCueSports()` adds three matches ready to score — an
 *  8-ball race to 5, a 6-red snooker match (best of 3) and a 100-up billiards
 *  game — between made-up players. Everything goes through the repo layer. */
import { isSupabaseConfigured } from '../core/supabase';
import { createMatch, createTeam, getMatches, getMyPlayerId, invitePerson, setTeamRoster } from './repos';
import type { SportId } from '../core/types';

const day = (h: number) => { const x = new Date(); x.setHours(h, 0, 0, 0); return x.toISOString(); };

async function side(name: string, short: string, sport: SportId, color: string) {
  const p = (await invitePerson({ name })).player;
  const t = await createTeam({ name, shortName: short, sport, colorHex: color });
  await setTeamRoster(t.id, [p.id]);
  return t;
}

export async function seedCueSports(): Promise<string> {
  if (isSupabaseConfigured) return 'Demo mode only.';
  const have = new Set((await getMatches()).map((m) => m.sport));
  if (have.has('pool') && have.has('snooker') && have.has('billiards')) return 'Already seeded.';
  const myId = await getMyPlayerId().catch(() => null);
  const hostIds = myId ? [myId] : [];
  const out: string[] = [];
  const seed = async (sport: SportId, a: [string, string], b: [string, string], h: number, format: Record<string, unknown>) => {
    if (have.has(sport)) return;
    const ta = await side(a[0], a[1], sport, '#3DDC97');
    const tb = await side(b[0], b[1], sport, '#FFB454');
    const m = await createMatch({ sport, homeTeamId: ta.id, awayTeamId: tb.id, startsAt: day(h), hostIds, format } as never);
    out.push(`${sport} ${m.id}`);
  };
  await seed('pool', ['Rohan Pillai', 'ROH'], ['Meher Dutta', 'MEH'], 17, { game: 'eight', raceTo: 5, playersPerSide: 1 });
  await seed('snooker', ['Imran Qureshi', 'IMR'], ['Leela Varma', 'LEE'], 18, { reds: 6, bestOf: 3, scoringMode: 'shot' });
  await seed('billiards', ['Arjun Bose', 'ARJ'], ['Nikhil Rao', 'NIK'], 19, { format: 'points', target: 100, bestOf: 1, scoringMode: 'shot' });
  return `Seeded: ${out.join(', ')}`;
}

if (!isSupabaseConfigured) {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__sportnnoteDemo = { ...((g.__sportnnoteDemo as object | undefined) ?? {}), seedCueSports };
}
