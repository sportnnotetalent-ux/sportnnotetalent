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
