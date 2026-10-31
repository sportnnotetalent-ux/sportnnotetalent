# Personalised Home: break it

**Process:** quality mandate step 4. These points were listed after the build and before any fix. Each fix then got its own failing test first (step 5).

**What is under test:**
- migrations `20261031110000_cities.sql` (GeoNames city list) and `20261031120000_personalised_home.sql`;
- the app:
  - `PersonaliseScreen` (first-run questions);
  - `NearYouSection` on Home;
  - view counting on the match page;
  - `core/location.ts`;
  - `data/personalise.ts`.

**Founder decisions (2026-10-31):**
- Under-18 matches show in "Near you" like any match.
- Location is "while using" only.
- View counts show from 25.
- The first question asks how people will use the app.

| # | Attack or failure | Status |
|---|---|---|
| PH-01 | **Fake views from a script.** Signed-out views are counted per device id, and the caller makes the id up. A script that sends a new id each time adds a view every call, up to the signed-out limits (600 an hour per address), pushing its match to the top of "Near you". | **Fixed:** a signed-out view counts once per internet address per match per day, whatever device id it sends (test). Schools sharing one address undercount; that's acceptable. |
| PH-02 | Many signed-in accounts viewing one match. | **Accepted.** One view per account per day. Accounts come through the sign-up guard and its limits. |
| PH-03 | **The location lands in server logs.** `near_matches` was read with GET, so the rounded coordinates sat in the request address, and Supabase keeps request logs. The privacy text says the location is never stored. | **Fixed:** sent in the request body (POST), never in the address. It doesn't empty the app's read cache, and neither does counting a view (tests). |
| PH-04 | Finding where a particular child is playing by asking "near me" from many points. | **Accepted (founder decision).** Under-18 matches show like any match. The venue was already public on the match, and names still show as initials to strangers. For the lawyer review. |
| PH-05 | A child's home city revealed by placing their friendly at it. | **Holds:** only an adult host's city places a friendly (test). Hosts with no date of birth don't count either. |
| PH-06 | Someone else reads a person's answers (home city, how they use the app, followed sports) from `profiles`. | **Holds:** the new columns aren't readable by other users. Only the person's own `my_personalisation()` returns them (test). |
| PH-07 | Junk in the answers: unknown uses, made-up sports, a fake city id, a huge list. | **Holds:** each is refused (tests). |
| PH-08 | **"Near you" gets slow as matches grow.** Each step of the search (50 km, 150 km, then all sports) placed every candidate match again. Each placement looked up a typed city name across all 8,079 cities. | **Fixed:** candidates are placed once per request, and each distinct city name is looked up once (exact name by index first, then old names). 500 users' requests are timed in the simulation. |
| PH-09 | Scraping the city list or hammering city search. | **Accepted.** It's a public dataset, and a search is one indexed read. |
| PH-10 | **An under-18's location.** Asking children for location is extra personal data about a child, and Google Play's Families rules are strict about it. | **Fixed:** under-18 accounts (and accounts with no date of birth) are never asked for location. They get matches by city (test). |
| PH-11 | An older app without the location module crashes when the update arrives over the air. | **Holds:** the module is only loaded when its native side is there (test). Older apps use the city. |
| PH-12 | The questions pop up over a match link at the ground. | **Holds:** they only open from Home, once, and "Skip" is remembered on the server (tests, checked in the browser). |
| PH-13 | Running the two migrations in the wrong order. | **Holds:** the main file creates the (empty) city table if it's missing. The big file then fills it. |
| PH-14 | A match's own scorers inflating its views by reopening it. | **Holds:** scorers and hosts don't count (test). |
| PH-15 | Someone with database access checks whether a known account viewed a match by hashing its id. | **Accepted.** Only staff can read view rows, and they're deleted within 3 days. Follow-up: add a secret salt. |
| PH-16 | **(Found live, 2026-10-31) A real match was missing.** The founder's live match in a tournament with no city wasn't in "Live near you": only a pin, a tournament city or a friendly's host could place a match. | **Fixed (`20261031130000_near_places.sql`):** a match is also placed by the home city of the people running it: its hosts, its scorers, then the tournament's hosts (their answer, else their profile's city), then the organiser's answer. Adults only (tests). This places a match roughly at an adult scorer's home city, which is usually their public profile city anyway. |
| PH-17 | **Abandoned "live" matches.** Test matches left "live" since August would have filled "Live near you". | **Fixed:** a "live" match with no change and no scoring for 12 hours isn't live near you (test). The founder's "Live now" list still shows them until they're ended. |
| PH-18 | That fix made the query plan rescan the in-between results for every match (about 4.6× slower). | **Fixed:** people are looked up per match through indexes. Same speed as before on the same data (26 ms against 27 ms); the 500-user average stays under the bar (51 ms). |

**500 users** (`tests/sim-personalised-home.test.mts`): see that file.
