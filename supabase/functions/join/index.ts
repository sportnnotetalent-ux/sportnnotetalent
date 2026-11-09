/**
 * Edge Function: join  (PUBLIC — deploy with --no-verify-jwt)
 * ------------------------------------------------------------------------
 * The accept link in a provisional-player invite (WhatsApp/SMS).
 *
 * The shared *.supabase.co/functions domain forces text/plain (anti-phishing),
 * so it can't show a real page with a sign-up button. So:
 *   GET /join?p=<playerId>              → 302 to the web app's invite page
 *                                          (app.sportnnote.in/i/<id>), where the
 *                                          person signs up right there with the
 *                                          invited number and lands in the team.
 *   GET /join?p=<playerId>&format=json  → { team, teamId, claimed } for that page.
 * Older messages carry this link, so it keeps working forever.
 *
 * Deploy:    npx supabase functions deploy join --no-verify-jwt \
 *              --project-ref byjuxrajzvfjpnqvzwzv
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { APP_URL } from '../_shared/hosts.ts'; // SD-151: APP_URL secret, default app.sportnnote.in
import { rateLimit } from '../_shared/guard.ts';
import { clientIp } from '../_shared/net.ts';

const PROJECT_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const id = url.searchParams.get('p') ?? '';
  const json = url.searchParams.get('format') === 'json';
  if (!json) {
    return new Response(null, { status: 302, headers: { ...CORS, Location: UUID.test(id) ? `${APP_URL}/i/${id}` : APP_URL, 'Cache-Control': 'no-store' } });
  }
  const out = { team: '', teamId: null as string | null, claimed: false };
  // Security W3 (EF-11): the JSON answer is public, so limited per address (120 an hour).
  const allowed = await rateLimit('join-ip', clientIp(req.headers), 120, 3600);
  if (allowed && UUID.test(id)) {
    try {
      const svc = createClient(PROJECT_URL, SERVICE);
      const [{ data: p }, { data: teams }] = await Promise.all([
        svc.from('players').select('house_name, profile_id').eq('id', id).maybeSingle(),
        // teams.roster is jsonb, so match it as a JSON array
        svc.from('teams').select('id, name').contains('roster', JSON.stringify([id])).limit(1),
      ]);
      out.claimed = !!p?.profile_id;
      // not on a roster: invited to RUN a team (captain / vice-captain / team admin —
      // Tournament teams → "manager / captain contact")
      let team = teams?.[0] as { id: string; name: string } | undefined;
      if (!team) {
        const { data: led } = await svc.from('teams').select('id, name')
          .or(`captain_id.eq.${id},vice_captain_id.eq.${id},admin_ids.cs.{${id}}`).limit(1);
        team = led?.[0] as { id: string; name: string } | undefined;
      }
      out.team = team?.name ?? (p?.house_name as string | null) ?? '';
      out.teamId = team?.id ?? null;
    } catch { /* generic page */ }
  }
  return new Response(JSON.stringify(out), { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
});
