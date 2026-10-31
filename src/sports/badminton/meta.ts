/**
 * Perf F-15 — Badminton's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';
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
      key: 'preset', label: 'Format', type: 'preset', default: 'bwf21',
      options: [
        { value: 'bwf21', label: 'BWF · 21 rally', set: { pointsPerGame: 21, cap: 30, gamesToWin: 2, goldenPoint: true } },
        { value: 'g5x11', label: '5×11 (rally, cap 15)', set: { pointsPerGame: 11, cap: 15, gamesToWin: 3, goldenPoint: true } },
        { value: 'g15', label: '15-point', set: { pointsPerGame: 15, cap: 21, gamesToWin: 2, goldenPoint: true } },
        { value: 'single', label: 'Single game to 21', set: { pointsPerGame: 21, cap: 30, gamesToWin: 1, goldenPoint: true } },
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
    // MVP B7: the deuce cap follows the points (21 → 30, 15 → 24); blank / out of range is fixed on leaving the box
    { key: 'pointsPerGame', label: 'Points per game', type: 'number', default: 21, min: 5, max: 30, advanced: true,
      derive: (v): Record<string, number> => (Number(v) >= 5 ? { cap: Math.min(40, Number(v) + 9) } : {}) },
    { key: 'cap', label: 'Deuce cap', type: 'number', default: 30, min: 5, max: 40, advanced: true, hint: 'hard ceiling that settles a long deuce' },
    {
      key: 'goldenPoint', label: 'At the cap', type: 'choice', default: true, advanced: true,
      options: [
        { value: true, label: 'Golden point (next wins)' },
        { value: false, label: 'Win by 2 (no golden point)' },
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
