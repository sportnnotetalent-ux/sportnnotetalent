# MVP L8: the web app on app.sportnnote.in, break it (2026-10-31)

**Founder's choice (2026-10-31):** move the full web app to `app.sportnnote.in` (the Worker serves it from `sportnnote.expo.app`), rather than keep jumping to the hosting address.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| D1 | **Viewers leave our domain.** "Full match & stats" on the light score page, and every other `app.sportnnote.in` address, jump to `sportnnote.expo.app` (a Cloudflare redirect rule). | **Fixed (switched on by the founder's Cloudflare change):** on `app.sportnnote.in` the Worker serves every path but the light page and `/.well-known` from `sportnnote.expo.app`. Tests; 1,000 simulated requests; checked locally against the live app (home page, scripts, deep link: 200). |
| D2 | **The light score page and the app share `/m/<id>`.** Serving the app on the same host would make "Full match & stats" open the light page again (a loop). | **Fixed:** the light page keeps `/m/<id>`; the app's copy is `/m/<id>?full=1` (`fullMatchHref`), so no loop. Tests. |
| D3 | **Redirects from the app host point back to the hosting address.** An upstream `Location: https://sportnnote.expo.app/…` would throw the viewer off the domain again. | **Fixed:** an upstream `Location` on the hosting address is rewritten to `app.sportnnote.in`. Test. |
| D4 | **Order of switching on.** Pushing `main` deploys the Worker at once, but the Cloudflare route and redirect rule change later (founder). Links that assume the new setup would break in between. | **Fixed:** the proxy only runs for requests the new route sends; the "Full match" link stays on the hosting address until `APP_ORIGIN` is set, after the founder's switch (docs/launch/live-link.md). Tests for both. |
| D5 | **The marketing site must stay as it is.** `sportnnote.in` pages, the 404 page and `/.well-known/*` (app links) must never be proxied. | **Fixed:** `sportnnote.in` and `/.well-known/*` go to the static site as before; `run_worker_first: true` so the app host's `/` isn't answered by the website. Tests; simulation; `wrangler deploy --dry-run` builds. |
| D6 | **Spoofed upstream.** The proxy must only ever fetch `https://sportnnote.expo.app` (never a host taken from the request), and never forward the viewer's cookies to another host. | **Fixed:** the upstream is a constant; `cookie`, `host` and `x-forwarded-host` are dropped; bodies only for methods that have one. Tests; simulation (forged headers, `//evil.example` paths). |

## Follow-on breaks to check while fixing
- **Methods / bodies:** GET, HEAD and POST (if any) pass through; a body is forwarded only when the method has one.
- **Caching:** the hashed `/_expo/static/*` files may be cached at the edge; HTML is passed with upstream headers.
- **Known effects of a new site address (founder accepted):** a browser signed in on `sportnnote.expo.app` signs in once more on `app.sportnnote.in`; web push is switched on again there; an installed home-screen app stays on the old address.
- **Cost:** with the whole app on the Worker, every file the app loads is a Worker request (free plan: 100,000 a day, roughly 2,000 full app visits).

## Results
Full suite 6,024 tests, 0 failing; tsc clean.
