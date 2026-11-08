/**
 * Perf F-15 — Carrom's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

export const CARROM_META: SportMeta = {
  id: 'carrom',
  name: 'Carrom',
  icon: '🟤',
  archetype: 'set-game-point',
  participantKind: 'both',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'icf',
      options: [
        { value: 'icf', label: 'ICF (to 25 · 8 boards · best of 3)', set: { target: 25, maxBoards: 8, gamesToWin: 2 } },
        { value: 'single', label: 'Single game to 25', set: { target: 25, maxBoards: 8, gamesToWin: 1 } },
        { value: 'casual29', label: 'Casual (to 29 · best of 3)', set: { target: 29, maxBoards: 12, gamesToWin: 2 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 1,
      options: [
        { value: 1, label: 'Singles' },
        { value: 2, label: 'Doubles' },
      ],
    },
    { key: 'target', label: 'Points to win a game', type: 'number', default: 25, min: 10, max: 50, advanced: true },
    { key: 'maxBoards', label: 'Boards per game', type: 'number', default: 8, min: 1, max: 20, advanced: true, hint: 'leader after this many boards wins; level → tie-break board' },
    {
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 2,
      options: [
        { value: 2, label: 'Best of 3' },
        { value: 1, label: 'Single game' },
      ],
    },
    // Round 2 — ICF foul penalties in the score (on by default; a match
    // created before this option has no key and keeps its score rules)
    { key: 'foulScore', label: 'ICF foul penalties in the score', type: 'toggle', default: true, advanced: true,
      hint: 'a penalty board is 3 (1 at 22+); a board ended on a foul: +1 striker, +1 foul stroke; 12 a board at most' },
    // Deep wave — the organiser can switch the optional stats on for every match.
    // Batch 3 (founder 2026-11-02, docs/security/breaks/defaults-carrom-baseball.md):
    // coins on the break and missed Queen covers are ON for a new match (an old
    // match has no key and keeps them off); fouls stay off — skipped rows would
    // read as "no fouls" (false zeros) on a casual match
    // Defaults-on wave 3: fouls ON too, now that a board counts as foul-tracked only
    // from the first tapped foul (NZG3) and the row folds behind Fouls ▾ (C3)
    { key: 'trackFouls', label: 'Track fouls & dues', type: 'toggle', default: true, advanced: true, group: 'Stats to track', hint: 'optional rows on the board form' },
    { key: 'trackBreak', label: 'Track coins on the break', type: 'toggle', default: true, advanced: true, group: 'Stats to track' },
    { key: 'trackQueenMiss', label: 'Track missed Queen covers', type: 'toggle', default: true, advanced: true, group: 'Stats to track' },
  ],
};
