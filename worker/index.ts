/**
 * The website's Cloudflare Worker (wrangler.jsonc). The marketing site is its
 * static assets, served as before. One route is code (MVP live score link,
 * founder 2026-10-31): `/m/<match id>` on app.sportnnote.in answers with a
 * small page that is both the link preview ("⚽ LIVE · Panthers 2–1 Cheetahs")
 * and a light live score for people, instead of the 7 MB app.
 * Cloudflare setup: docs/launch/live-link.md. Tests: tests/worker-match-page.test.mts.
 */
import { renderFallbackPage, renderMatchPage, renderMissingPage, APP_ORIGIN, LINK_ORIGIN, type SharedMatch } from './matchPage.ts';

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  SUPABASE_URL: string;
  /** the public (anon) key, as in the web app */
  SUPABASE_ANON_KEY: string;
  /** MVP L8 — where "Full match & stats" opens the app: unset = the hosting
   *  address (as before); "https://app.sportnnote.in" once the founder has
   *  routed the whole app host to this Worker (docs/launch/live-link.md). */
  APP_ORIGIN?: string;
}

/** MVP L8 — the web app is hosted here; the Worker serves it on app.sportnnote.in.
 *  Fixed: never a host taken from the request. */
const UPSTREAM = APP_ORIGIN;
const APP_HOST = new URL(LINK_ORIGIN).hostname;
/** Request headers never sent upstream: the viewer's cookies and the host. */
const DROP = ['cookie', 'host', 'x-forwarded-host'];

/** Serve the web app from its hosting address on our own domain (D1, D3, D6). */
async function proxyApp(request: Request, url: URL): Promise<Response> {
  const headers = new Headers(request.headers);
  for (const h of DROP) headers.delete(h);
  const method = request.method;
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const res = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
    method, headers, redirect: 'manual',
    ...(hasBody ? { body: await request.arrayBuffer() } : {}),
    // hashed build files never change: let the edge keep them
    ...(url.pathname.startsWith('/_expo/static/') ? { cf: { cacheTtl: 86400, cacheEverything: true } } : {}),
  } as RequestInit);
  const loc = res.headers.get('location');
  if (!loc || !loc.startsWith(UPSTREAM)) return res;
  const out = new Response(res.body, res);
  out.headers.set('location', `${LINK_ORIGIN}${loc.slice(UPSTREAM.length)}`);
  return out;
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
    const appOrigin = env.APP_ORIGIN || APP_ORIGIN;
    // MVP L8: on app.sportnnote.in everything but the light score page (and
    // /.well-known, the app links) is the web app itself.
    const onAppHost = url.hostname === APP_HOST && !url.pathname.startsWith('/.well-known/');
    if (onAppHost && (!m || url.searchParams.has('full') || (request.method !== 'GET' && request.method !== 'HEAD'))) return proxyApp(request, url);
    if (!m || (request.method !== 'GET' && request.method !== 'HEAD')) return env.ASSETS.fetch(request);
    const id = m[1].toLowerCase();
    const match = await readMatch(id, env);
    if (m[2] === '.json') {
      // the open page's refresh: only what it shows
      if (match === 'error') return json({ error: 'unavailable' }, 503, 'no-store');
      if (!match) return json(null, 404, 'public, max-age=60');
      return json({ status: match.status, summary: match.summary ?? null, winner: match.winner ?? null }, 200, `public, max-age=${EDGE_CACHE_S}`);
    }
    if (match === 'error') return html(renderFallbackPage(id, appOrigin), 200, 'no-store');
    if (!match) return html(renderMissingPage(appOrigin), 404, 'public, max-age=60');
    const page = renderMatchPage(match, appOrigin);
    const cache = match.status === 'completed' ? 'public, max-age=300' : match.status === 'live' ? 'public, max-age=5' : 'public, max-age=30';
    return html(page, 200, cache);
  },
};
