# The live score link: setup (founder steps)

**What it does:** a shared `app.sportnnote.in/m/<match>` link previews in WhatsApp as "⚽ LIVE · Panthers 2–1 Cheetahs", with a big sport picture. When someone opens it, they get a ~15 KB live score page instead of the 7 MB app. The page refreshes itself, and "Full match & stats" opens the app.

**How it works:**
- The website's Cloudflare Worker (`worker/`, set up in `wrangler.jsonc`) answers `/m/*`.
- The scorer's app saves a tiny score summary with every save of the match.

## 1. Database (SQL Editor, once)
Run these two files, in this order. Both are safe to run again.
1. `supabase/migrations/20261031130000_near_places.sql`: Near you places more matches and skips abandoned "live" ones.
2. `supabase/migrations/20261031140000_share_match.sql`: the match summary and `share_match`.

## 2. Push
Push `main`. Cloudflare builds the website and the Worker from it, as it does today; the Worker build was checked locally with `wrangler deploy --dry-run`.

## 3. Cloudflare dashboard (once, about 5 minutes)
Today `app.sportnnote.in` redirects everything to `sportnnote.expo.app`, except `/.well-known/*`, which the Worker answers. Do the same for `/m/*`:

1. **Workers & Pages → sportnnote → Settings → Domains & Routes → Add → Route.**
   - Route: `app.sportnnote.in/m/*`
   - Zone: `sportnnote.in`
   - Save.
2. **sportnnote.in → Rules → Redirect Rules.** Open the rule that sends `app.sportnnote.in` to `sportnnote.expo.app`, the one that already has the `/.well-known/` exception. Add `/m/` the same way, so the expression ends with:
   `… and not starts_with(http.request.uri.path, "/.well-known/") and not starts_with(http.request.uri.path, "/m/")`
   Save.

## 4. Check
- Open `https://app.sportnnote.in/m/<a live match id>` on your phone. You should see the light score page.
- Paste the same link into a WhatsApp chat with yourself. The preview should read "⚽ LIVE · …" with the sport picture.
- WhatsApp keeps a link's preview for a while. To see a new one, add `?v=2` to the end.

## If something's off
- **Undo the routing:** delete the route from step 3.1. Links go straight back to the full app.
- **Previews show no score:** run step 1, then publish the app; older app versions don't save the summary.

---

# The whole app on app.sportnnote.in (MVP L8, founder's choice 2026-10-31)

**What it does:** the Worker serves the full web app on `app.sportnnote.in` (fetched from `sportnnote.expo.app`), so people who open a link never see the hosting address. `/m/<match>` stays the light score page; the app's own copy of a match is `/m/<match>?full=1`. The marketing site `sportnnote.in` is unchanged.

**Already done in code:** the Worker can serve the app (it does nothing new until step 2 below). Tested locally against the live app: home page, scripts and deep links all load.

## Steps (founder, about 5 minutes)
1. **Push** (done by the assistant): Cloudflare deploys the new Worker as usual. Nothing changes for visitors yet.
2. **Workers & Pages → sportnnote → Settings → Domains & Routes.** Edit the route `app.sportnnote.in/m/*` to `app.sportnnote.in/*` (zone `sportnnote.in`). If there's a separate `app.sportnnote.in/.well-known/*` route, it can stay or go; `/*` covers it.
3. **sportnnote.in → Rules → Redirect Rules.** Turn **off** the rule that sends `app.sportnnote.in` to `sportnnote.expo.app` (turn it off rather than delete it, so it's one click to undo).
4. **Check:** open `https://app.sportnnote.in/` on your phone. The app should load and the address should stay `app.sportnnote.in`. Open a match link: the light page, then "Full match & stats".
5. **Tell the assistant.** It then switches "Full match & stats" to stay on `app.sportnnote.in` (one setting, `APP_ORIGIN`, in `wrangler.jsonc`) and pushes.

**Status (2026-10-31): all done.** The founder changed the route to `app.sportnnote.in/*`, turned the redirect rule off and checked the app on a phone; `APP_ORIGIN` is set.

## What changes for people (you accepted this)
- It's a new site address to the browser: anyone signed in on `sportnnote.expo.app` signs in once more on `app.sportnnote.in`, and switches web alerts on again there. An app already added to a home screen keeps the old address. `sportnnote.expo.app` keeps working.
- **Cost:** every file the app loads now passes through the Worker. Cloudflare's free plan allows 100,000 Worker requests a day (roughly 2,000 full app visits); past that, Workers Paid is $5 a month for 10 million.

## Undo
Put the route back to `app.sportnnote.in/m/*` and turn the redirect rule on again. Everything is as before.
