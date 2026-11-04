/**
 * Perf F-15 — Badminton's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';
import { PAIR_TYPE_FIELD } from '../pairType.ts';
import { trackFormatFields } from '../pointDetailSettings.ts';
import { timeUpRuleField } from '../../core/timeUp.ts';

export const BADMINTON_META: SportMeta = {
  id: 'badminton',
  name: 'Badminton',
  icon: '🏸',
  archetype: 'set-game-point',
  participantKind: 'both', // Singles = individual, Doubles = a pair,
  retireTerms: true,
  formatFields: [
    {
      // BWF 3×15 is the standard from 4 Jan 2027, 3×21 the alternate (AGM 25 Apr
      // 2026; docs/sport-expert/badminton-rulebook.md BR-1/2). New formats seed
      // 3×15 from that day; stored ones keep theirs.
      key: 'preset', label: 'Format', type: 'preset', default: 'bwf21', defaultFrom: { date: '2027-01-04', value: 'g15' },
      options: [
        { value: 'g15', label: 'Games to 15, best of 3 · BWF standard from 4 Jan 2027', set: { pointsPerGame: 15, cap: 21, gamesToWin: 2, goldenPoint: true } },
        { value: 'bwf21', label: 'Games to 21, best of 3 · BWF alternate', set: { pointsPerGame: 21, cap: 30, gamesToWin: 2, goldenPoint: true } },
        { value: 'g5x11', label: 'Games to 11, best of 5 · not a BWF system', set: { pointsPerGame: 11, cap: 15, gamesToWin: 3, goldenPoint: true } },
        { value: 'single', label: 'One game to 21', set: { pointsPerGame: 21, cap: 30, gamesToWin: 1, goldenPoint: true } },
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
    // doubles pair type (doubles-picker DP8): Open / Men's / Women's / Mixed, doubles only
    PAIR_TYPE_FIELD,
    // MVP B7: the deuce cap follows the points (21 → 30, 15 → 24); blank / out of range is fixed on leaving the box
    { key: 'pointsPerGame', label: 'Points per game', type: 'number', default: 21, min: 5, max: 30, advanced: true,
      derive: (v): Record<string, number> => (Number(v) >= 5 ? { cap: Math.min(40, Number(v) + 9) } : {}) },
    { key: 'cap', label: 'Longest a game can go', type: 'number', default: 30, min: 5, max: 40, advanced: true, hint: 'at 20-20 play goes on, but a game ends by this score (30 for games to 21)' },
    {
      key: 'goldenPoint', label: 'One short of that score, level', type: 'choice', default: true, advanced: true,
      options: [
        { value: true, label: 'Next point wins' },
        { value: false, label: 'Play on until 2 clear' },
      ],
    },
    {
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 2,
      options: [
        { value: 2, label: 'Best of 3' },
        { value: 3, label: 'Best of 5' },
        { value: 1, label: 'Single game' },
      ],
    },
    // deep wave — "Stats to track" defaults for every match of this format
    // (the scorer can still change them per match in ⚙️ Scoring settings)
    // MVP (founder 2026-10-31): the "Time up" tiebreak is the organiser's
    timeUpRuleField('game'),
    ...trackFormatFields('badminton'),
  ],
};
