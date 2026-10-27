/**
 * register-lookup — SportnNote support checks a school's official ID against the
 * public register without retyping it (docs/verification/org-verification.md,
 * "Automation"). Today: CBSE SARAS by affiliation number — the registered name,
 * state, district, address, principal and affiliation period, shown on the
 * review card beside what the school entered. UDISE+ ("Know Your School") needs
 * a CAPTCHA for every search, so it stays a copy-and-search link.
 *
 * POST { type: 'cbse', value: '1930001' } → { found, source, url, record? }
 * Support only (profiles.role support / admin); 120 lookups an hour each. One
 * record per request, on demand — never a bulk crawl of the register.
 */
import { admin, CORS, json, rateLimit, requireUser, tooMany } from '../_shared/guard.ts';
import { parseSaras, sarasUrl } from '../_shared/saras.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;

  const { data: prof } = await admin.from('profiles').select('role').eq('id', caller.user.id).maybeSingle();
  const role = (prof as { role?: string } | null)?.role;
  if (role !== 'support' && role !== 'admin') return json({ error: 'SportnNote support only' }, 403);
  if (!(await rateLimit('register-lookup', caller.user.id, 120, 3600))) return tooMany();

  const raw = (await req.json().catch(() => ({}))) as { type?: unknown; value?: unknown };
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  if (raw.type !== 'cbse') return json({ error: 'Only CBSE affiliation numbers can be looked up for now' }, 400);
  if (!/^\d{4,8}$/.test(value)) return json({ error: 'A CBSE affiliation number is 4 to 8 digits' }, 400);

  const url = sarasUrl(value);
  let html = '';
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'SportnNote verification (support@sportnnote.in)', accept: 'text/html' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return json({ error: 'The CBSE register didn’t answer — open it directly.', url }, 502);
    html = await res.text();
  } catch {
    return json({ error: 'The CBSE register didn’t answer — open it directly.', url }, 502);
  }
  const record = parseSaras(html);
  return json({ found: !!record, source: 'CBSE SARAS', url, ...(record ? { record } : {}) });
});
