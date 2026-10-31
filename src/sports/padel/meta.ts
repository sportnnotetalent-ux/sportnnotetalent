/**
 * Perf F-15 — Padel's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';
import { trackFormatFields } from '../pointDetailSettings.ts';
import { timeUpRuleField } from '../../core/timeUp.ts';

export const PADEL_META: SportMeta = {
  id: 'padel',
  name: 'Padel',
  icon: '🟡',
  archetype: 'set-game-point',
  participantKind: 'both', // doubles-primary, but singles is possible,
  retireTerms: true,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'premier',
      options: [
        { value: 'premier', label: 'Golden point (WPT style)', set: { deuce: 'golden', gamesPerSet: 6, setsToWin: 2, decider: 'set' } },
        // SD-64 — FIP / Premier Padel from 2026 (Rules of Padel, Rule 1 option 2)
        { value: 'star', label: 'Star Point (FIP / Premier Padel 2026)', set: { deuce: 'star', gamesPerSet: 6, setsToWin: 2, decider: 'set' } },
        { value: 'classic', label: 'Classic (advantage)', set: { deuce: 'advantage', gamesPerSet: 6, setsToWin: 2, decider: 'set' } },
        { value: 'short', label: 'Short (to 4, match TB)', set: { deuce: 'golden', gamesPerSet: 4, setsToWin: 2, decider: 'match10' } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 2,
      options: [
        { value: 2, label: 'Doubles' },
        { value: 1, label: 'Singles' },
      ],
    },
    {
      key: 'deuce', label: 'At deuce', type: 'choice', default: 'advantage',
      hint: 'how 40-40 is decided',
      options: [
        { value: 'advantage', label: 'Advantage (classic)' },
        { value: 'golden', label: 'Golden point' },
        { value: 'star', label: 'Star Point (2 advantages, then deciding point)' },
      ],
    },
    {
      key: 'gamesPerSet', label: 'Games per set', type: 'choice', default: 6, advanced: true,
      options: [
        { value: 6, label: 'Standard (to 6)' },
        { value: 4, label: 'Short (to 4)' },
      ],
    },
    {
      key: 'setsToWin', label: 'Match length', type: 'choice', default: 2, advanced: true,
      options: [
        { value: 2, label: 'Best of 3 sets' },
        { value: 3, label: 'Best of 5 sets' },
        // MVP PD1: one set is a set — never the 10-point match tiebreak
        { value: 1, label: 'Single set', set: { decider: 'set' } },
      ],
    },
    {
      key: 'decider', label: 'Deciding set', type: 'choice', default: 'set', advanced: true,
      hideWhen: { key: 'setsToWin', value: 1 },
      hint: 'how the final set is played',
      options: [
        { value: 'set', label: 'Full set' },
        { value: 'match10', label: 'Match tiebreak (to 10)' },
      ],
    },
    // deep wave — "Stats to track" defaults for every match of this format
    // (the scorer can still change them per match in ⚙️ Scoring settings)
    // MVP (founder 2026-10-31): the "Time up" tiebreak is the organiser's
    timeUpRuleField('set'),
    ...trackFormatFields('padel'),
  ],
};
