/**
 * The website's Cloudflare Worker (wrangler.jsonc). The marketing site is its
 * static assets, served as before. One route is code (MVP live score link,
 * founder 2026-10-31): `/m/<match id>` on app.sportnnote.in answers with a
 * small page that is both the link preview ("⚽ LIVE · Panthers 2–1 Cheetahs")
 * and a light live score for people, instead of the 7 MB app.
 * Cloudflare setup: docs/launch/live-link.md. Tests: tests/worker-match-page.test.mts.
 */
import { renderFallbackPage, renderMatchPage, renderMissingPage, type SharedMatch } from './matchPage.ts';

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  SUPABASE_URL: string;
  /** the public (anon) key, as in the web app */
  SUPABASE_ANON_KEY: string;
}

const MATCH_PATH = /^\/m\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.json|\/)?$/i;
/** LL-01: Cloudflare keeps the database's answer this long, so open pages refreshing every few
 *  seconds cost one database read per match per 5 s, however many people are watching. */
const EDGE_CACHE_S = 5;
const TIMEOUT_MS = 2500;

const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });
const html = (body: string, status: number, cache: string) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache, 'x-content-type-options': 'nosniff' } });

/** share_match(), or 'error' when the database didn't answer well in time. */
async function readMatch(id: string, env: Env): Promise<SharedMatch | null | 'error'> {
  const call = fetch(`${env.SUPABASE_URL}/rest/v1/rpc/share_match?p_id=${id}`, {
    method: 'GET',
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, Accept: 'application/json' },
    cf: { cacheTtl: EDGE_CACHE_S, cacheEverything: true },
  } as RequestInit).then(async (r) => (r.ok ? ((await r.json()) as SharedMatch | null) : 'error' as const), () => 'error' as const);
  const timeout = new Promise<'error'>((resolve) => setTimeout(() => resolve('error'), TIMEOUT_MS));
  return Promise.race([call, timeout]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = MATCH_PATH.exec(url.pathname);
    if (!m || (request.method !== 'GET' && request.method !== 'HEAD')) return env.ASSETS.fetch(request);
    const id = m[1].toLowerCase();
    const match = await readMatch(id, env);
    if (m[2] === '.json') {
      // the open page's refresh: only what it shows
      if (match === 'error') return json({ error: 'unavailable' }, 503, 'no-store');
      if (!match) return json(null, 404, 'public, max-age=60');
      return json({ status: match.status, summary: match.summary ?? null, winner: match.winner ?? null }, 200, `public, max-age=${EDGE_CACHE_S}`);
    }
    if (match === 'error') return html(renderFallbackPage(id), 200, 'no-store');
    if (!match) return html(renderMissingPage(), 404, 'public, max-age=60');
    const page = renderMatchPage(match);
    const cache = match.status === 'completed' ? 'public, max-age=300' : match.status === 'live' ? 'public, max-age=5' : 'public, max-age=30';
    return html(page, 200, cache);
  },
};
