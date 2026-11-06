# SportnNote: launch animation and a cleaner interface
Design & Motion review of the founder's reference recording (DAZN + CricHeroes, iPhone). Read-only: nothing in the repo was changed. Timestamps are recording time (`i_` = intro sheets, `s_` = flow frames).

## 1. Launch animation proposal

### What the reference teaches
- **DAZN (i_00.50 to 2.75 s):** the app opens straight onto the same logo as its home-screen icon, white on black, and holds it still for about 1 s. Then it shows a dark skeleton of Home (i_02.00 to 2.50) and real content at 2.75 s. Takeaways: the move from icon to splash is seamless, there's no spinner, and the screen behind is already loading.
- **CricHeroes (s_0019.5 to 0023.5, about 4 s):** a dark scene in one hero colour. A light sweep crosses the ball shape (s_0020.5), the mark resolves (s_0021.5), the wordmark wipes in from left to right (s_0022.0) and a small tagline sits at the bottom. Takeaways: one colour, one light sweep, mark first and then wordmark. The downside is the length: 4 s is too long to see on every launch.

### Storyboard (built from the existing S:N mark)
The pieces are the lime "S" stroke, the white "N" stroke and the two lime colon dots, all leaning −8°, on pitch green `primaryDark #0A3A2B`. The idea is the scoreline: the colon "ticks" the way a live score does.

| Time | Frame | Motion |
|---|---|---|
| 0–200 ms | F0 | The native splash: the mark centred (about 96 pt) on #0A3A2B. The JS layer starts pixel-identical to it, so there's no jump. |
| 200–500 ms | F1 "Score tick" | Each colon dot scales 1 → 1.35 → 1, the second 80 ms after the first (ease-out-back). This is the same "score changed" language as the live score bar's flash. The voice starts here. |
| 500–900 ms | F2 "Lockup" | The mark slides about 64 pt left. The wordmark (Barlow Condensed 800 Italic, white, same 8° lean) is revealed from left to right by a clip mask. |
| 900–1300 ms | F3 "Court line" | One lime line (6 pt, rounded) sweeps under the wordmark with a small overshoot. This replaces CricHeroes' light sweep, without any drawn art. |
| 1300–1600 ms | F4 | Hold. |
| 1600–1900 ms | F5 "Into the app" | A circular reveal from the mark's centre turns the background from green to cream (#F3F0E8). The lockup scales to 1.08 and fades, and Home (or its skeleton) shows through. |

- **Full version: 1.9 s, first launch only** (after install or a store update).
- **Every other launch: 0.6 s.** F0 hold, then F5.
- **If the app isn't ready at 1.6 s:** hold on the lockup with the dots pulsing slowly (no spinner, never longer than the app needs). If the app is ready early, still never wait past the end of the animation.
- **Reduced motion (OS setting):** the static mark fades out over 200 ms and there's no sound.

### The voice line ("Sport n Note")
| Option | Quality | Notes |
|---|---|---|
| A. A recorded human voice-over (founder or a hired voice artist), **recommended** | Best, and it's ownable as a sonic logo | A clip of about 0.9 s (AAC/MP3, under 20 KB). Record 3–4 takes (energetic, warm, stadium-announcer). Get written rights if hired. |
| B. An AI-generated voice | Good | Check that the licence allows commercial brand use. The founder must approve the voice. |
| C. On-device text-to-speech (expo-speech) | Poor | Robotic, varies by phone and mispronounces "n". Not recommended. |

**When it plays:**
- Only during the first-launch full version. Never on daily launches: repeated sound annoys people at matches and in classrooms.
- Timing: it starts at F1 (about 250 ms), so "Sport" lands on the dot tick and "n Note" on the wordmark wipe.
- **It respects silent mode.** On iOS, set the audio mode to `playsInSilentMode: false` (the ringer switch mutes it). On Android it plays at media volume and is skipped when the ringer is silent or on vibrate.
- It mixes with or ducks other audio and never stops the user's music.
- It doesn't play on the web (browsers block autoplay) or under reduced motion.
- A Settings switch, "Launch sound", lets people turn it off.

### Technical route (Expo SDK 56; check the v56 docs before building)
1. **Native splash.** Configure the `expo-splash-screen` plugin in app.json: background #0A3A2B, image = the mark. app.json has no splash config today, and Android 12+ shows the app icon anyway. **This needs a new APK and iOS build.**
2. **JS animated splash.** An overlay component in `App.tsx` sits above `RootNavigator`. Note that `App.tsx` currently renders nothing until `ready && fontsReady`. Call `SplashScreen.preventAutoHideAsync()`, then `hideAsync()` once the overlay has drawn F0.
   - Draw it with **RN `Animated` + `react-native-svg`**, both already installed (`LiveBadge` in MatchCard already uses `Animated` and checks reduced motion). Animate dot scale, `strokeDashoffset` on the court line, and a clip width. **No new native dependency, so this part can ship by OTA.**
   - Reanimated and Lottie would each add a native module (a new build) for no real gain on a 2 s, 5-element animation. Skip them.
3. **Sound.** `expo-audio` isn't installed (and neither is expo-av). Adding it is a native module, so it **needs a new build**: bundle it into the next APK and store build (1.1.0 or the store launch).
4. **Phasing.**
   - Phase A (OTA): the silent JS animation, with a flag for first launch.
   - Phase B (next native build): the splash config and the voice.
   - Run the 500-user simulation, plus a timing test that the overlay never adds more than 0 ms beyond the app's ready time on repeat launches.

## 2. Visual cleanliness findings

| # | Area | Reference (time) | SportnNote now | Recommendation | Impact | Size |
|---|---|---|---|---|---|---|
| F1 | Headers | A large left title that collapses to a small centred title on scroll (s_0050.0 → 0053.5). It's never shown twice. | The native header says "New Tournament", then `ScreenTitle` repeats it as a 34 pt uppercase italic h1 (`CreateTournamentScreen.tsx:231`, `RootNavigator.tsx:545`). Same on ScheduleMatch. | One title per screen. Use the native `headerLargeTitle` on iOS, or drop `ScreenTitle` on stack screens and keep the header. Keep display italics for Home or hero only. | High | S |
| F2 | Type scale and weight | About 3 sizes. Names in semibold, meta in light grey regular (s_0079.5 team rows, s_0113.5 players). | The weight count across src is 900 ×147, 800 ×416, 700 ×397, but only 400 ×13. There are 135 literal font sizes outside the tokens (22, 20, 18, 24, 9…). | Define a type ramp: Display, Title 20/600, Body 15/400, Label 13/600, Meta 12/400 muted. 800/900 only for scores and display. Lint against literal sizes. | High | M |
| F3 | Button hierarchy | One filled primary, with the second action as a text link (s_0286.0 "Share with captains" / "Add manually"; s_0295.5). Bottom bars are split: neutral "Skip" or "Schedule match" next to a filled "Next" (s_0164.5, s_0281.5). | `Button` defaults to **lime** when no variant is given. ScheduleMatch has 10 such buttons and TournamentTeams has 8 (plus 13 ghosts), so lime loses its meaning (audit #16). | Change the default variant to `secondary` (outline). Lime has to be asked for explicitly. Add a `link` variant (text only, primary green) for the second action. Add a split footer pattern. | High | S |
| F4 | Empty states | A thin outline icon (about 32 pt, grey), one bold line, one muted line, one filled button and one text link, centred (s_0286.0, s_0343.5, s_0381.5). | `EmptyState` exists and is used on 43 screens, but with a tinted circle and an emoji icon (`ui.tsx:94-95`). It has no action slots. | Make `EmptyState` take a lucide icon at 1.5 stroke plus `primary` and `secondary` actions, and use it everywhere "none yet" appears. | Med | S |
| F5 | Loading | Skeleton blocks shaped like the coming content (s_0285.0, s_0294.0, s_0381.0; DAZN i_02.00). | 43 screens use a spinner or `LoadingState`. There are no skeletons. | Add a `Skeleton` set (row, card, header) for Home, tournament page and lists. This pairs with the splash F5 hand-off. | Med | M |
| F6 | List rows | 56 pt avatar, name in semibold 15, two muted meta lines, one small trailing chip. Initials monogram when there's no logo (s_0097.5 "MV"/"VV"). A selected row swaps the avatar for a check circle and gets an outline (s_0127.0, s_0159.0). "Played last match" as a tiny status line. | Team and player pickers (`EntrantPicker`, `PersonPicker`, `TournamentTeamPicker`) each style their own rows and selection. | One `ListRow` with avatar/monogram, title, meta, trailing slot and a selected state (check plus outline, lime ring). Monograms use the team colour as a background tint and ink text (audit #12). | High | M |
| F7 | Segmented choice | Captain / WK / 12th man as one segmented control above a single list (s_0134.5, s_0137.5). | Captain and keeper are set by tapping players with unclear modes (audit #36). | A shared `Segmented` control for role pickers: one list, a mode on top. | Med | S |
| F8 | Forms | Floating labels on an underline. Known values prefilled (organiser name and number, city: s_0050.5). The selected value shows as a removable chip inside the field (s_0227.0 "HotFut Gachibowli ×"). Long option sets as small chips (s_0055.5). Optional items as plain checkboxes at the end (s_0056.5). | Boxed fields with a label above. City and venue are free text plus chips (audit #7–8). | Keep boxed fields (they're clearer on cream), but prefill from the profile, show picked lookups as a chip inside the field, and group optional fields at the end under "More options". | Med | M |
| F9 | Lookups | Full-screen search with a mic, multi-select checkboxes, a usage count ("53 matches") and a sticky "Add ground(s)" button (s_0210.0, s_0214.0). | `VenueField` and `CityField` exist; the audit says to unify them. | One lookup screen pattern: search, recent, counts, a sticky confirm. The keyboard-safe footer already exists (`KeyboardFooterLayout`). | Med | M |
| F10 | Bottom sheets | A grab handle, centred title, ✕ on the right, grouped inset rows with section captions (Tournament / Matches / People / More) and chevrons (s_0392.0, s_0395.0). A 2-option sheet: "Auto" filled, "Manual" as text (s_0330.0). | Sheets vary (`QuickOptionsSheet`, `ConfirmSheet`, `FollowAlertsSheet`). Manage is about 20 rows at equal weight (audit #40). | One `Sheet` shell (handle, title, ✕, `useKeyboardSheet`) and a `GroupedRows` list with captions. Use it for Manage tournament and "+" create menus. | Med | M |
| F11 | Icons | Thin outline icons at about 20 pt in muted grey. Colour only when active (tab bar s_0024.0; header icons s_0286.0). | Lucide is mostly used at stroke 2.2 (14 places) and sizes vary (20/24/26/30). Emoji are still in button labels ("💬 WhatsApp", "✉️ SMS": `TournamentTeamsScreen.tsx:827-828`; they're converted to icons only when mapped). | Fix lucide at stroke 1.75, 20 pt in rows and 22 pt in headers, `textMuted` unless active. Emoji are only for sport symbols (founder rule). | Med | S |
| F12 | Spacing and density | A 16 pt gutter, 8 pt between rows, 24 pt between sections, and section titles at 15/600 (s_0302.5 "Organiser details", "Tournament details"). | MatchCard is 16 pt top and bottom with 12 pt gaps; compact is 10 pt. Cards also carry shadows on cream. | Use an 8 pt rhythm: rows 8, sections 24, card padding 12–16. Drop shadows on list cards (border or hairline only) and keep shadow for floating elements. | Med | S |
| F13 | Colour use | Neutral greys everywhere. The brand teal appears only on the main button, the selected chip and the active tab (s_0055.5). | Lime appears on many buttons and chips. Coloured "hot" labels, team colours as text. | Lime = one primary action plus the live highlight. Green = links and active tab. Everything else uses ink or muted text. | High | S |
| F14 | Detail summary | "Tournament details" as a 2-column key/value table with an edit pencil (s_0303.5). | The Info tab shows hosts and format as stacked text (audit #28). | A `KeyValueCard` component with an edit pencil for owners. | Low | S |

**Don't copy:** CricHeroes' upsell banners (s_0024.0, s_0047.0), the sponsor price tags and the red promo carousels (s_0311.5). These are why its Home feels busy.

**Couldn't read clearly:**
- The light-sweep frames (s_0020.0 to 0021.0) are motion-blurred, so the exact easing is guessed.
- I couldn't read the tagline at s_0021.5 and didn't need it.
- Chip text at sheet scale is tiny, so the sizes above are estimates.
- The "Overs per bowler" row (s_0167.5) is too small to judge.
- No reference frame shows a keyboard covering a field, so CricHeroes isn't a model for that rule.

## 3. Ranked top 10
1. **Launch animation, Phase A (OTA, silent):** the 1.9 s scoreline-tick storyboard, 0.6 s on repeat launches, reduced-motion fallback.
2. **F3:** `Button` defaults to secondary, plus a `link` variant. Lime has to be chosen, never the default.
3. **F1:** one title per screen (drop the duplicate `ScreenTitle` on stack screens, collapsing header).
4. **F13:** a colour audit to lime = one main action plus who's live, everything else neutral.
5. **F6:** a shared `ListRow` with monogram and a selected state, for every team and player picker.
6. **F2:** a type ramp of 5 tokens, fewer 800/900 weights, lint literal sizes.
7. **Launch animation, Phase B (next native build):** native splash config plus the recorded "Sport n Note" voice via expo-audio, first launch only, silent-mode aware, with a Settings switch.
8. **F4 + F5:** `EmptyState` with icon and two actions, plus skeleton loading.
9. **F10 + F7:** one Sheet shell with grouped rows, and a segmented role picker.
10. **F11 + F12:** an icon spec (1.75 stroke, 20/22 pt, muted), the 8 pt rhythm, and no shadows on list cards.

Every item follows the quality mandate (tests first, 500-user simulation) and needs the founder's yes before publishing. Before/after screenshots go in docs/org/design.
