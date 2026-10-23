/**
 * Perf F-15 — Squash's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';
import { trackFormatFields } from '../pointDetailSettings.ts';

/** The sport's own format options (makeRallyPlugin adds the shared "Stats to
 *  track" defaults after them, exactly as `formatFields` below does). */
export const SQUASH_FORMAT_FIELDS: FormatField[] = [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'psa',
      options: [
        { value: 'psa', label: 'PSA (PAR 11 · best of 5)', set: { scoring: 'par', pointsPerGame: 11, winBy: 2, gamesToWin: 3 } },
        { value: 'american', label: 'American (PARS 15)', set: { scoring: 'par', pointsPerGame: 15, winBy: 2, gamesToWin: 3 } },
        { value: 'english', label: 'Club English (to 9)', set: { scoring: 'english', pointsPerGame: 9, winBy: 1, gamesToWin: 3 } },
        { value: 'short', label: 'Short (PAR 11 · best of 3)', set: { scoring: 'par', pointsPerGame: 11, winBy: 2, gamesToWin: 2 } },
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
    {
      key: 'scoring', label: 'Scoring', type: 'choice', default: 'par', advanced: true,
      hint: 'how points are won',
      options: [
        { value: 'par', label: 'PAR (point-a-rally)' },
        { value: 'english', label: 'English (hand-out)' },
      ],
    },
    {
      key: 'pointsPerGame', label: 'Points to win', type: 'choice', default: 11, advanced: true,
      hint: 'PAR is to 11; English is traditionally to 9',
      options: [
        { value: 11, label: '11' },
        { value: 15, label: '15' },
        { value: 9, label: '9' },
      ],
    },
    {
      key: 'winBy', label: 'Win by', type: 'choice', default: 2, advanced: true,
      hint: '2 is standard; 1 is a casual hard cap',
      options: [
        { value: 2, label: 'Win by 2' },
        { value: 1, label: 'Win by 1' },
      ],
    },
    {
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 3,
      options: [
        { value: 3, label: 'Best of 5' },
        { value: 2, label: 'Best of 3' },
        { value: 1, label: 'Single game' },
      ],
    },
  ];

export const SQUASH_META: SportMeta = {
  id: 'squash',
  name: 'Squash',
  icon: '⚫',
  // as makeRallyPlugin (../rallyCore.tsx) builds the plugin
  archetype: 'set-game-point',
  participantKind: 'both', // Singles = individual, Doubles = a pair
  retireTerms: true,
  formatFields: [...SQUASH_FORMAT_FIELDS, ...trackFormatFields('squash')],
};
