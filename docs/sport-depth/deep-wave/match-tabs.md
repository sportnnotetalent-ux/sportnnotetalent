# Match tabs — one purpose per tab, nothing twice (2026-10-22)

**The founder's decision:** "Commentary should be on a separate tab and summary should be a separate tab to showcase final ratings. Each tab's purpose and what it shows should be clear and different and we should not repeat any info across these tabs within a game and this stands for all sports."

Every head-to-head match (`LiveScoringScreen`) now has the same five tabs, under a scoreboard header that stays on top of every tab:

| Tab | Holds | Never holds |
|---|---|---|
| **Info** | when · where · format · tournament · head-to-head link · calendar · hosts · scorers · officials · stream link + score overlay · scoring settings / stats to track · score edits + "Correct this match" · disputes · matchday squads (+ add / invite player) · **lineups** · clone · danger zone | the result, stats, the feed |
| **Commentary** | the live event-by-event feed only; a small "situation now" on top where a sport has one (racket doubles' **Next point** serve diagram, cricket's **This over** + the chase equation / DLS par). "Key moments" is a filter chip inside the feed. | stats tables, ratings |
| **Stats** | team comparison panels, box scores / scorecards, charts (shot chart, worm / Manhattan, drive chart, rotation), period / category filters, match / set durations, **Game flow** | the feed, Player of the Match, ratings |
| **Summary** | the result and the people: the result line (and a hand-closed match's 🏁 line), the match facts that belong to the result (scorers, sendings-off), Player of the Match / top performer, awards, player ratings — labelled **"Live — provisional"** while the match is on — and *Change Player of the Match* | box scores, game flow, the match header, officials |
| **Scoring** | scorer controls only (scorers / hosts): sync banners, mini score, Undo / result hold, edit a past ball, add a late player, the sport's controls, Quick options, Match controls; after the game a sport's tidy-up (chess: attach the moves) | the match header, the result line |

Commentary and Stats show only when the sport has them (golf match play has no Stats tab).

## The plugin contract — `SportPlugin.matchTabs` (src/sports/types.ts)

```ts
matchTabs?: {
  Info?: FC<LiveExtrasProps>;          // Info, under the squads: the sport's own lineups view / a setup fact
  Situation?: FC<LiveExtrasProps>;     // Commentary, on top: "situation now"
  Commentary?: FC<LiveExtrasProps>;    // the feed (Key moments = a filter inside it)
  Stats?: FC<LiveExtrasProps>;         // comparison, boxes / scorecard, charts (own sub-switch: SubViews)
  ownGameFlow?: boolean;               // Stats already shows game flow → no shared card
  SummaryExtras?: FC<LiveExtrasProps>; // Summary, right under the result: the result's own detail
  AfterMatch?: FC<LiveExtrasProps>;    // Scoring, after full time (scorers only)
}
```

Every slot gets the old `LiveExtras` props (state, names, colours, rosters, lineups, managers, formations, edit rights, `onPlayer`, `dispatch`, `canScore`). The screen adds the shared pieces itself:

- **Info:** all the existing cards; lineups = the sport's `Info` slot, else the generic **Lineups** court when the sport has a `Court`, no `ServeCourt`, and placed players.
- **Commentary:** `ServeCourt` (racket doubles; renders nothing in singles) → `Situation` → `Commentary`.
- **Stats:** `Stats` → the shared **Game flow** card (SD-50; renders nothing for sports without a running score) unless `ownGameFlow`.
- **Summary:** the 🏁 result banner (generic summary only) → `plugin.Summary` (cricket) or `MatchSummary` with `SummaryExtras` right under its result block → *Change Player of the Match*.
- **Scoring:** as before minus the match header and result banner, plus `AfterMatch` once the match is complete.

`src/sports/SubViews.tsx` is the small chip switch a tab uses for its own views (Stats: "Match stats · Box score", cricket "Scorecard · Match stats"). Views are moved, not rewritten — each `render` returns the existing component.

**Removed from the contract:** `liveViews` (sport-defined top-level tabs) and `lineupsInExtras`. **Kept as fallback:** `LiveExtras` — a plugin without `matchTabs` shows it on the Stats tab with the shared box score (`matchBoxSource`), so nothing disappears. No sport uses it now. `hideScoreboard` stays in the type but no sport sets it (the header is on every tab).

### Where a viewer lands

Fixed once the match has loaded, so a kick-off or the final whistle never moves someone off the tab they are reading: **upcoming → Info, live → Commentary** (else Stats, else Summary), **finished → Summary**. Listed scorers (and a host when no one is listed) still land on **Scoring**, except on a match that was already over when opened (→ Summary). A match that ends while you score keeps you on Scoring (the result hold / Undo is there).

### Old tab names

Saved `tab=` params and links map to the new home: `score`, `scorecard`, `box` → **stats**; `lineups` → **info**; `timeline`, `pbp`, `feed` → **commentary** (`LEGACY_TABS` in the screen). Quick options' **📋 Full scorecard** opens Stats; the lock card's **Watch live** opens Commentary.

## What moved, sport by sport

| Sport | Info | Commentary | Stats | Summary (beyond result + ratings) | Before |
|---|---|---|---|---|---|
| Football | formation pitch, bench, managers (LineupView) | minute-by-minute, Key events | match centre + player boxes + Game flow | match facts: scorers, reds, HT, pens | Lineups / Stats / Commentary tabs; facts block on Commentary; Summary repeated box + game flow |
| Cricket | — | This over + chase (need / balls / target / RRR / DLS par) on top; ball-by-ball | **Scorecard** · Match stats (compare, batting, bowling, phases, matchups, worm / Manhattan, pitch map) | top performers by innings, standouts | header was hidden (scorecard stood in) — now shown; POTM line was also on the scorecard; the live chase card sat on Summary |
| Basketball | court lineups | play-by-play | Team stats (+ shot chart) · Box score; Game flow | — | Score sub-switch incl. game flow; Summary repeated box + game flow |
| Netball | court lineups | play-by-play | Team stats · Players; Game flow | — | Score sub-switch |
| Volleyball | court lineups | rally-by-rally | VIS match stats + player box | — | set chips (header has them), stats, box and feed stacked on Score |
| Kabaddi | court lineups | raid-by-raid | PKL match centre (own Game flow) + player box | — | feed + stats on Score; game flow twice |
| Hockey, Handball | court lineups | live text, Key events | match centre + boxes + Game flow | match facts | Commentary / Match stats sub-switch with facts on top |
| Ice hockey, Rugby | court lineups | play-by-play, **Key moments** chip | Match stats · Box score; Game flow | — | a separate "Key moments" view |
| American football | court lineups | play-by-play by drive, Key moments chip | Match stats · Drives · Box score; Game flow | — | a separate "Key moments" view |
| Baseball / softball | field lineups | play-by-play by half-inning, Key moments chip | Match stats · Box score (batting + pitching); Game flow | — | a separate "Key moments" view |
| Tennis, Badminton, Padel, Pickleball | — (no court) | doubles: **Next point** diagram on top; commentary by game | match stats panel + durations + box score | — | set / game chips, stats, box and commentary stacked on Score; diagram on Score |
| Table tennis, Squash | — | commentary by game | match stats panel + durations + box score | — | as above |
| Chess | — | move by move / the result | opening + Game stats (or how to get them) | — | Score tab; **♟ Moves** (attach PGN after the game) → **Scoring** tab |
| Carrom | — | board by board | match stats (Match / Game n) + box + ICF score sheet | — | game chips; Commentary / Match stats sub-switch |
| Golf (match play) | handicap strokes | hole by hole | — (no Stats tab) | — | strokes line + feed on Score |

**Duplicates removed:** the match header card on Summary and Scoring (Info only); the 🏁 result line on Info and Scoring (Summary only); the box score + team comparison and Game flow on Summary (Stats only); the officials line on Summary (Info's officials card shows them to everyone); set / game chips on the racket, volleyball and carrom stats (the header's line score); cricket's POTM line and "see the other tabs" note on the scorecard; cricket's live score / chase card on Summary (header + Commentary); the invasion sports' match facts on Commentary (Summary), with possession left to Stats; the four separate "Key moments" timelines (the feed's own chip).

## Follow-ups (not done here)

- **Records broken** on Summary — the per-match record hooks exist (`matchRecords`) but there is no "records broken in this match" UI; needs the tournament record book to compare against.
- **Kabaddi** match centre lists per-half top raider / defender — close to Summary's awards; it is inside the stats panel (owned by the sport), left as is.
- **Football lineups** keep the FIFA-style goal / card / sub markers on each player — part of the lineup, not a second feed.
- **Generic result card** on Summary repeats the score in the header — kept as the founder's "final result line".
- **GolfRoundScreen** (stroke play) and **ResultsEventScreen** (timed / measured events) are separate screens with their own sections — not changed; worth the same one-purpose audit.
- The four sports' `*Timeline` key-moment builders (`ice_hockey`, `rugby`, `american_football`, `baseball` `timeline.ts`) are no longer shown; still tested, can be retired by the sport owners.

## Checks

`tests/match-tabs.test.mts` guards the contract: every head-to-head sport fills `matchTabs` with a Commentary slot and no longer sets `LiveExtras` / `liveViews` / `lineupsInExtras`; no "Key moments" view; no stats component in a Commentary slot and no feed in a Stats slot; the invasion sports' facts are on Summary without possession; the five tabs in order; Summary free of box scores / game flow / header / officials; header and result line on one tab each; old tab names map. Guides naming the old tabs were updated (`website/guides/*`).
