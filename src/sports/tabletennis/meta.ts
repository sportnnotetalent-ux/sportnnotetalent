/**
 * Perf F-15 — Table tennis's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';
import { trackFormatFields } from '../pointDetailSettings.ts';
import { timeUpRuleField } from '../../core/timeUp.ts';

/** The sport's own format options (makeRallyPlugin adds the shared "Stats to
 *  track" defaults after them, exactly as `formatFields` below does). */
export const TABLETENNIS_FORMAT_FIELDS: FormatField[] = [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'bo5',
      options: [
        { value: 'bo5', label: 'Best of 5 (to 11)', set: { pointsPerGame: 11, winBy: 2, gamesToWin: 3 } },
        { value: 'bo7', label: 'Best of 7 (to 11)', set: { pointsPerGame: 11, winBy: 2, gamesToWin: 4 } },
        { value: 'bo3', label: 'Best of 3 (to 11)', set: { pointsPerGame: 11, winBy: 2, gamesToWin: 2 } },
        { value: 'legacy21', label: 'Legacy (to 21 · best of 3)', set: { pointsPerGame: 21, winBy: 2, gamesToWin: 2 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    // SD-115: who serves first (ITTF 2.13.1 toss) is asked once, on the scoring
    // screen, with no default; a stored `firstServe` from older formats still seeds it.
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 1,
      options: [
        { value: 1, label: 'Singles' },
        { value: 2, label: 'Doubles' },
      ],
    },
    {
      key: 'pointsPerGame', label: 'Points to win', type: 'choice', default: 11, advanced: true,
      options: [
        { value: 11, label: '11' },
        { value: 21, label: '21' },
      ],
    },
    {
      key: 'winBy', label: 'Win by', type: 'choice', default: 2, advanced: true,
      options: [
        { value: 2, label: 'Win by 2' },
        { value: 1, label: 'Win by 1' },
      ],
    },
    {
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 3,
      options: [
        { value: 4, label: 'Best of 7' },
        { value: 3, label: 'Best of 5' },
        { value: 2, label: 'Best of 3' },
        { value: 1, label: 'Single game' },
      ],
    },
  ];

export const TABLETENNIS_META: SportMeta = {
  id: 'tabletennis',
  name: 'Table tennis',
  icon: '🏓',
  // as makeRallyPlugin (../rallyCore.tsx) builds the plugin
  archetype: 'set-game-point',
  participantKind: 'both', // Singles = individual, Doubles = a pair
  retireTerms: true,
  formatFields: [...TABLETENNIS_FORMAT_FIELDS, timeUpRuleField('game'), ...trackFormatFields('tabletennis')],
};
