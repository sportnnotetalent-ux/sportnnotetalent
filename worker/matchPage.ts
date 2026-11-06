/**
 * The live score link's page (MVP, founder 2026-10-31): one small HTML page
 * that is both the link preview (its og: tags) and what a person sees: the
 * score at once, refreshing itself while live, plus a way into the full match.
 * Pure: worker/index.ts fetches share_match() and hands the result here.
 */
import { SPORTS } from './sports.ts';

export interface SharedMatch {
  id: string;
  sport: string;
  status: 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled' | string;
  starts_at?: string | null;
  venue_name?: string | null;
  winner?: 'home' | 'away' | 'draw' | null;
  /** f: 1 — full time, result still held (docs/security/breaks/full-time-held.md) */
  summary?: { h?: string; a?: string; s?: string; d?: string; f?: number } | null;
  result_score?: { home?: number; away?: number } | null;
  home?: { name?: string; short_name?: string; color_hex?: string | null } | null;
  away?: { name?: string; short_name?: string; color_hex?: string | null } | null;
  tournament?: { id?: string; name?: string } | null;
  views?: number;
}

export const APP_ORIGIN = 'https://sportnnote.expo.app';
/** MVP L8 — the full match in the app. Once the app is served on our own
 *  domain (the Worker's APP_ORIGIN var), `/m/<id>` there is this light page,
 *  so the app's copy of the match is `/m/<id>?full=1`. */
/** Growth plan #6 — the light page's call to action: a game of your own, in the
 *  app's guest setup (no sign-up to start), tagged so the step is measured. */
export const scoreOwnHref = (appOrigin: string) => `${appOrigin}/GuestGame?from=match_link`;

export const fullMatchHref = (appOrigin: string, id: string) =>
  appOrigin === LINK_ORIGIN ? `${appOrigin}/m/${id}?full=1` : `${appOrigin}/m/${id}`;
export const LINK_ORIGIN = 'https://app.sportnnote.in';
export const SITE_ORIGIN = 'https://sportnnote.in';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const colour = (c?: string | null) => (c && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#59616C');
const sportOf = (id: string) => SPORTS[id] ?? { name: 'Match', icon: '🏅' };

/** "340 views" from 25 (as the app shows it); "1.2k" when big. */
function viewsLabel(n?: number): string | null {
  if (!n || n < 25) return null;
  if (n < 1000) return `${n} views`;
  return `${Math.round(n / 100) / 10}k views`.replace('.0k', 'k');
}

function when(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata', timeZoneName: 'short' }).format(new Date(iso));
  } catch { return ''; }
}

/** The two scores, from the live summary or (closed by hand) the result. */
function scores(m: SharedMatch): [string, string] | null {
  if (m.summary && (m.summary.h || m.summary.a)) return [m.summary.h ?? '0', m.summary.a ?? '0'];
  if (m.result_score && m.result_score.home != null && m.result_score.away != null) return [String(m.result_score.home), String(m.result_score.away)];
  return null;
}

export function previewText(m: SharedMatch): { title: string; description: string; badge: string } {
  const sp = sportOf(m.sport);
  const home = m.home?.name || 'Home';
  const away = m.away?.name || 'Away';
  const sc = scores(m);
  const done = m.status === 'completed';
  const live = m.status === 'live';
  const held = live && !!m.summary?.f;
  const badge = done ? 'RESULT' : held ? 'FULL TIME' : live ? 'LIVE' : m.status === 'postponed' ? 'POSTPONED' : m.status === 'cancelled' ? 'CANCELLED' : 'UPCOMING';
  const title = sc && (live || done) ? `${sp.icon} ${badge} · ${home} ${sc[0]}–${sc[1]} ${away}` : `${sp.icon} ${badge} · ${home} vs ${away}`;
  const t = m.tournament?.name;
  let parts: (string | null | undefined)[];
  if (done) {
    const won = m.winner === 'draw' ? 'Drawn' : m.winner === 'home' ? `${home} won` : m.winner === 'away' ? `${away} won` : m.summary?.s;
    parts = [won, t, 'Full scorecard on SportnNote'];
  } else if (live) {
    parts = [m.summary?.s, m.summary?.d, t, 'Follow it live on SportnNote'];
  } else {
    parts = [when(m.starts_at), m.venue_name, t, 'Follow it on SportnNote'];
  }
  return { title, description: parts.filter(Boolean).join(' · '), badge };
}

const STYLE = `*{box-sizing:border-box}body{margin:0;background:#F3F0E8;color:#14181D;font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.top{background:#0A3A2B;padding:14px 16px}.brand{color:#F3F0E8;text-decoration:none;font-weight:800;font-style:italic;font-size:20px;letter-spacing:.3px}.brand b{color:#C6EE3E}
.card{max-width:520px;margin:16px auto;background:#fff;border:1px solid #DDD8CB;border-radius:16px;padding:16px;margin-left:max(16px,calc(50% - 260px));margin-right:max(16px,calc(50% - 260px))}
.row{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.sport{font-weight:700;color:#59616C;text-transform:uppercase;letter-spacing:.8px;font-size:13px}
.badge{font-weight:800;font-size:12px;letter-spacing:.8px;padding:4px 10px;border-radius:99px;background:#E9E5DA;color:#14181D}.badge.live{background:#B32525;color:#fff}.badge.done{background:#0D5A3F;color:#fff}
.side{display:flex;align-items:center;gap:10px;padding:8px 0}.dot{width:12px;height:12px;border-radius:6px;flex:none}.name{flex:1;font-weight:700;font-size:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.score{font-weight:800;font-size:40px;font-style:italic;color:#0D5A3F;min-width:2ch;text-align:right;font-variant-numeric:tabular-nums}
.status{margin:8px 0 0;font-weight:700}.detail{margin:2px 0 0;color:#59616C;font-size:14px}.where{margin:12px 0 0;color:#59616C;font-size:14px}
.btn{display:block;text-align:center;margin-top:12px;padding:14px;border-radius:12px;border:1.5px solid #757B84;color:#14181D;text-decoration:none;font-weight:700}
.btn.primary{background:#0D5A3F;border-color:#0D5A3F;color:#fff}.views{margin:12px 0 0;text-align:center;color:#59616C;font-size:13px}
.foot{text-align:center;color:#59616C;font-size:13px;padding:8px 16px 24px}.foot a{color:#0D5A3F;font-weight:700}`;

function shell(o: { title: string; description: string; image: string; url: string; body: string; script?: string; appOrigin?: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)} | SportnNote</title><meta name="description" content="${esc(o.description)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="SportnNote">
<meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.description)}">
<meta property="og:image" content="${esc(o.image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(o.url)}"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0A3A2B"><link rel="icon" href="${SITE_ORIGIN}/favicon.png">
<style>${STYLE}</style></head><body><header class="top"><a class="brand" href="${SITE_ORIGIN}">S:N Sport<b>nNote</b></a></header>
${o.body}<p class="foot"><a href="${esc(scoreOwnHref(o.appOrigin ?? APP_ORIGIN))}">Score your own game, free →</a> · <a href="${SITE_ORIGIN}/#get">Get SportnNote</a></p>${o.script ?? ''}</body></html>`;
}

export function renderMatchPage(m: SharedMatch, appOrigin: string = APP_ORIGIN): string {
  const sp = sportOf(m.sport);
  const { title, description, badge } = previewText(m);
  const sc = scores(m);
  const live = m.status === 'live';
  const done = m.status === 'completed';
  const held = live && !!m.summary?.f; // full time, result still held: not "LIVE"
  const views = viewsLabel(m.views);
  const side = (t: SharedMatch['home'], id: 'h' | 'a', v: string | undefined) =>
    `<div class="side"><span class="dot" style="background:${colour(t?.color_hex)}"></span><span class="name">${esc(t?.name || (id === 'h' ? 'Home' : 'Away'))}</span><span class="score" id="${id}">${esc(v ?? '')}</span></div>`;
  const where = [m.tournament?.name, m.venue_name].filter(Boolean).map(esc).join(' · ');
  const status = live ? m.summary?.s : done ? description.split(' · ')[0] : when(m.starts_at);
  const body = `<main class="card"><div class="row"><span class="sport">${esc(sp.icon)} ${esc(sp.name)}</span><span class="badge${held ? ' done' : live ? ' live' : done ? ' done' : ''}" id="b">${live && !held ? '● ' : ''}${esc(badge)}</span></div>
${side(m.home, 'h', sc?.[0])}${side(m.away, 'a', sc?.[1])}
<p class="status" id="st">${esc(status ?? '')}</p><p class="detail" id="d">${esc(live ? m.summary?.d ?? '' : '')}</p>
${where ? `<p class="where">${where}</p>` : ''}
<a class="btn primary" href="${esc(fullMatchHref(appOrigin, m.id))}">Full match &amp; stats</a>
${views ? `<p class="views">${esc(views)}</p>` : ''}</main>`;
  // While it's live (or about to start), refresh the score every few seconds when
  // the page is open, from the Worker (LL-01: one cached read per match, however
  // many are watching; no database address or key in the page).
  const script = live || m.status === 'scheduled'
    ? `<script>(function(){var u=${JSON.stringify(`/m/${m.id}.json`)},t;
function x(i,v){var e=document.getElementById(i);if(e&&v!=null)e.textContent=v}
function tick(){if(document.hidden)return;fetch(u).then(function(r){return r.json()}).then(function(m){if(!m)return;var s=m.summary||{};
if(m.status==="live"){x("h",s.h);x("a",s.a);x("st",s.s);x("d",s.d||"");var b=document.getElementById("b");if(b){b.className=s.f?"badge done":"badge live";b.textContent=s.f?"FULL TIME":"● LIVE"}}
else if(m.status==="completed"){x("h",s.h);x("a",s.a);x("st",s.s);x("d","");var c=document.getElementById("b");if(c){c.className="badge done";c.textContent="RESULT"}clearInterval(t)}}).catch(function(){})}
t=setInterval(tick,${live ? 5000 : 30000});document.addEventListener("visibilitychange",tick)})();</script>`
    : '';
  return shell({ title, description, image: `${SITE_ORIGIN}/share/${SPORTS[m.sport] ? m.sport : 'sportnnote'}.png`, url: `${LINK_ORIGIN}/m/${m.id}`, body, script, appOrigin });
}

/** No such match (or its tournament was deleted). */
export function renderMissingPage(appOrigin: string = APP_ORIGIN): string {
  return shell({
    title: 'Match not found', description: 'This match isn’t on SportnNote any more. Score your own games, free.',
    image: `${SITE_ORIGIN}/share/sportnnote.png`, url: LINK_ORIGIN,
    body: `<main class="card"><p class="status">This match isn’t here any more.</p><p class="detail">It may have been deleted by its organiser.</p><a class="btn primary" href="${esc(appOrigin)}">Open SportnNote</a></main>`,
    appOrigin,
  });
}

/** The database didn't answer in time: still a working page, into the full match. */
export function renderFallbackPage(id: string, appOrigin: string = APP_ORIGIN): string {
  return shell({
    title: 'Live score on SportnNote', description: 'Follow this match live on SportnNote.',
    image: `${SITE_ORIGIN}/share/sportnnote.png`, url: `${LINK_ORIGIN}/m/${id}`,
    body: `<main class="card"><p class="status">Live score on SportnNote</p><a class="btn primary" href="${esc(fullMatchHref(appOrigin, id))}">Open the match</a></main>`,
    appOrigin,
  });
}
