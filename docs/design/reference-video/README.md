# Reference video review: recommendations for the founder

2026-11-06. The founder's 7-minute iPhone recording (`reference-video.mp4`, kept out of git) shows:
- the DAZN launch (0–4 s): logo, then Home;
- the CricHeroes launch animation (19–24 s);
- CricHeroes setup flows (24 s on): tournaments, matches, teams, players and roles.

Two reviews went through every screen change (220 frames plus the launch frames, by timestamp):
- [design-review.md](design-review.md): Design & Motion (launch animation, visual cleanliness).
- [product-review.md](product-review.md): Product (setup flows, side by side with SportnNote).

We learn patterns from the reference. We never copy its branding, art, wording or screens.

**Already ahead of the reference, so keep these:**
- the quick friendly (about 3 taps, no names needed);
- Quick tournament (3 fields, not 9);
- per-sport defaults;
- "copy last XI";
- Assign scorers;
- the setup checklist.

## Recommendations (founder: approve, cut or reorder)

Size: S = a day or less, M = a few days, L = a week or more. Each item goes through the quality mandate before publishing.

### A. Launch animation and voice
| # | Recommendation | Impact | Size | Ships by |
|---|---|---|---|---|
| A1 | **Animated logo at launch, silent.** About 1.9 s, built from the S:N mark as a scoreline: the colon dots "tick" like a score change, the wordmark wipes in, a lime court line sweeps under it, then it opens into Home. First launch only. Later launches get a 0.6 s version, which never delays the app. Reduced-motion users get a plain fade. | High | M | Android OTA + web |
| A2 | **Voice saying "Sport n Note"** (about 0.9 s) on the first launch only. It respects silent mode, never stops the user's music, doesn't play on the web, and has an off switch in Settings. Recommended: a recorded human voice (founder or a hired voice artist, with rights). Not recommended: robotic text-to-speech. | Med | S + recording | Next app build (needs `expo-audio`) |
| A3 | **Native splash screen** in the same green as the animation, so the icon → splash → animation hand-off is seamless (what DAZN does well). | Med | S | Next app build |

### B. Visual cleanliness
| # | Recommendation | Impact | Size |
|---|---|---|---|
| B1 | **Lime only when asked for.** Buttons currently default to lime: 10 on match setup, 8 on tournament teams. Make outline the default, add a text-link style for second actions, and keep lime = one main action + "live". | High | S |
| B2 | **One title per screen.** Stack screens show the title twice (header "New Tournament", then a big "NEW TOURNAMENT" heading). Keep one. | High | S |
| B3 | **Calmer type.** 800/900 weights are used about 560 times and regular only 13. Move to a 5-step type scale, with bold for scores and names only, and use the theme's sizes instead of hand-typed ones. | High | M |
| B4 | **One list row for every team and player picker:** avatar or initials (in the team colour), name, a muted detail line, and a clear "selected" state (check + outline). | High | M |
| B5 | **Empty states with a next step:** a thin icon, one line, a main button plus a text link (replaces the emoji circle). | Med | S |
| B6 | **Skeleton loading** shaped like the coming content, instead of spinners, on Home, the tournament page and lists. | Med | M |
| B7 | **One bottom-sheet style** (handle, title, ✕, grouped rows with captions). Use it for "Manage tournament" and create menus. | Med | M |
| B8 | **Icon and spacing rules:** thin icons (1.75 stroke, 20/22 pt, grey unless active), emoji only for sport symbols, an 8-pt spacing rhythm, no shadows on list cards. | Med | S |
| B9 | **Forms:** prefill what we already know (your name, city), show a picked value as a removable chip, keep optional fields under "More options", and use one search screen for city/ground lookups. | Med | M |
| B10 | **Tournament details as a key/value card** with an edit pencil for owners. | Low | S |

### C. Flows (creating tournaments, matches, teams, players, roles)
| # | Recommendation | Impact | Size | Notes |
|---|---|---|---|---|
| C1 | **Show your teams before you type** when picking a team for a match: "Your teams" and "Played before", with city · captain · player count to tell same-name teams apart. Today you must type 3+ letters. | High | S | Under-18 captains shown by initials |
| C2 | **Empty tournament tabs say what to do next.** Teams: "Share the join link with captains" (main) or "Add a team myself". Matches: "Make fixtures automatically" or "Add one match". | High | S | |
| C3 | **Optional "Who's playing" in match setup.** Pick the squad right after picking a team, with last match's players first, "Add player", and a counter. Today it can only be done from the live match. It never blocks "Create & score now". | High | M | Individual sports skip it |
| C4 | **Two clear endings on match setup:** "Save for later" and "Start now". | Med | S | |
| C5 | **Lighter team creation.** The short code becomes optional (made from the name), the sport defaults to yours (not football), plus optional "captain's mobile → invite", "I play in this team" and "captain can add players". | Med | S | Minors' invites via guardian, as today |
| C6 | **Match-day roles from the squad, for every sport:** captain plus the sport's own role (keeper, goalkeeper, libero…), with the team captain as the default. | Med-High | M | Data-model change, maybe a migration; Security check |
| C7 | **Officials at setup (optional):** referee / umpire / judge / scorer, in each sport's own words. | Med | S | |
| C8 | **One "Invite players" sheet on a team:** join link, QR, mobile number, contacts. | Med | M | Security check: captain approves self-joins, guardian consent for under-18s |
| C9 | **Pick several grounds for a tournament**, showing how many games each has hosted. | Low-Med | S | |
| C10 | **One "Schedule" entry: automatic or one at a time?** | Low | S | |

### Not copying
- Paid upsells and banners inside creation flows (why the reference's Home feels busy).
- Cricket-only required fields at tournament level (every sport equal).
- The 9-field long form.
- "Add rounds before groups" style blocks.
- Everyone's photos and phone numbers shown publicly: under-18s get initials, and the organiser's phone stays private.
- Asking for camera access before the person taps Scan.
- Duplicate same-name teams.
- The reference's wording and exact screens.

## Suggested order
1. **Quick wins first (all S, one batch):** B1, B2, C1, C2, C4, B5, B8.
2. **The launch animation, silent:** A1.
3. **Then:** B4 + C3 (shared row + who's playing), B3, B6, B7, C5, C7, B9.
4. **Needs a decision or Security:** C6 (data model), C8 (invites).
5. **With the next native build:** A2 + A3. The founder records or chooses the voice.
6. **Low priority:** C9, C10, B10.
