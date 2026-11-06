# Break it: several grounds (C9) and one Schedule entry (C10)

2026-11-06. Founder's order: after C6, C9 and C10.

| # | Break | Risk | Fix |
|---|---|---|---|
| GS1 | Counts split by case or spacing ("Chinnaswamy" vs " chinnaswamy "), or blank venues counted. | Data | `venueCounts` trims and lower-cases, skipping blanks (test). |
| GS2 | The busiest grounds hidden behind six recently used quiet ones; "1 games". | UX | `rankVenues`: busiest first, ties keep recent order; `venueLabel` says "1 game" or "N games" (test). |
| GS3 | Counts include other organisers' private data. | Privacy | The counts come from the same match list the form already uses for suggestions (`useMatches`, what this user can see), and show a number only. |
| GS4 | One entry hides a choice, or viewers see scheduling. | UX / permission | The single "Schedule matches" row sits in the Manage hub (organisers only) and opens a sheet with all three choices (automatic in lime, one at a time, import). Each choice navigates exactly where its old row did. |

**Note:** grounds could already take several venues (removable chips plus add). C9 adds the counts and the busiest-first order, on both the create and edit forms.

**Tests:** `tests/grounds-and-schedule.test.mts` (4).

**Demo check:**
- the Manage sheet opened with its three choices;
- the new-tournament form lists "Bangalore Football Stadium · 10 games" first.
