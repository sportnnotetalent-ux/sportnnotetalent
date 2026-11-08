# New stats defaults reach tournaments; "Use the new defaults" for older ones — break it first

2026-11-08. Wave 3 turns "Stats to track" on by default. Founder decision: tournaments created before keep their settings, and organisers get a **Use the new defaults** button.

**Found while building it:** a tournament stores only the settings the organiser changed, and its matches read any missing stats setting as OFF (so old matches never change). That means a brand-new tournament got none of the defaults either, including the racket defaults already published. Only friendlies did, because the match form writes every default into the match.

| # | Break | Kind | Fix |
|---|---|---|---|
| TS1 | A new tournament's matches have every stat off, whatever the defaults say. | Defaults | Creating a tournament writes each sport's "Stats to track" defaults into its format (`withStatsDefaults`), next to the points system it already writes. Tested. |
| TS2 | The organiser had already chosen a stats setting; the defaults overwrite it. | Data | Only keys the sport's format doesn't have are written. A chosen value always stays. Tested. |
| TS3 | An older tournament never gets the new defaults. Most were created through the full form, which saved every setting with that day's defaults (e.g. "Rally length: off"), so nothing is "missing". | Defaults | Edit tournament shows a "New stats defaults" card listing each stat whose saved value differs from the new default (e.g. "Badminton: Rally length"). **Use the new defaults** puts them in the form, and Save changes saves them like any other edit. Tested. |
| TS4 | The button silently overrides a deliberate choice. | Data | Old stamped defaults can't be told apart from choices, so the card names every stat it will change before the organiser taps, and nothing is saved until Save changes. Creation (TS1) still fills only missing keys. Tested. |
| TS5 | Matches already played change their stats. | Stats | Stats come from what was captured (wave 1), so a finished match shows the same numbers. Only its Info toggles read on. Matches not yet started score with the new defaults. Tested. |
| TS6 | The card stays after use, or shows for nothing. | UI | It shows only while something is missing (`missingStatsDefaults`), and disappears once added. Tested. |
| TS7 | A toggle outside "Stats to track" (a rule, a points option) is switched. | Data | Only toggles in the "Stats to track" group are touched. Tested. |
| TS8 | A sport has a different default for tournaments than for friendlies (football keeps possession on in tournaments), but the tournament gets the friendly value. | Defaults | Tournament defaults use a field's `tournamentDefault` when it has one, else its `default`. That covers both creation and the button. Tested. |
