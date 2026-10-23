/**
 * Perf F-15 — Golf's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

export const GOLF_META: SportMeta = {
  id: 'golf',
  name: 'Golf',
  icon: '⛳',
  archetype: 'measured',
  participantKind: 'individual',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'stroke',
      options: [
        { value: 'stroke', label: 'Stroke play (medal)', set: { competition: 'stroke', allowance: 95, holes: '18' } },
        { value: 'stableford', label: 'Stableford', set: { competition: 'stableford', allowance: 95, holes: '18' } },
        { value: 'match', label: 'Match play', set: { competition: 'match', allowance: 100, holes: '18' } },
        { value: 'nine', label: '9-hole stroke play', set: { competition: 'stroke', allowance: 95, holes: 'front9' } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'competition', label: 'Competition', type: 'choice', default: 'stroke',
      options: [
        { value: 'stroke', label: 'Stroke play' },
        { value: 'stableford', label: 'Stableford' },
        { value: 'match', label: 'Match play' },
      ],
    },
    {
      key: 'holes', label: 'Holes', type: 'choice', default: '18',
      options: [
        { value: '18', label: '18 holes' },
        { value: 'front9', label: 'Front 9' },
        { value: 'back9', label: 'Back 9' },
      ],
    },
    {
      key: 'netScoring', label: 'Scores', type: 'choice', default: 'gross', advanced: true,
      hint: 'stroke play: rank on gross or net (handicap) scores',
      options: [
        { value: 'gross', label: 'Gross' },
        { value: 'net', label: 'Net (handicap)' },
      ],
    },
    { key: 'allowance', label: 'Handicap allowance %', type: 'number', default: 95, min: 0, max: 100, advanced: true, hint: 'WHS: 95% stroke/Stableford, 100% match play' },
    {
      key: 'tieBreak', label: 'Ties', type: 'choice', default: 'countback', advanced: true,
      options: [
        { value: 'countback', label: 'Countback (last 9/6/3/1)' },
        { value: 'shared', label: 'Shared' },
        // SD-89 — a tie for first is "Playoff pending" until the host records the winner
        { value: 'playoff', label: 'Playoff for 1st' },
      ],
    },
    {
      // SD-66 — Best Gross / Best Net boards side by side (stroke play with handicaps)
      key: 'prizes', label: 'Gross + net prizes', type: 'choice', default: 'both', advanced: true,
      hint: 'stroke play: can one player win both the gross and the net prize?',
      options: [
        { value: 'both', label: 'Can win both' },
        { value: 'one', label: 'One prize each (gross first)' },
      ],
    },
    // Round 2 — drives and first-putt lengths in yards (the PGA TOUR / DP
    // World Tour unit, default) or metres; cards always store yards
    {
      key: 'distUnit', label: 'Distances', type: 'choice', default: 'yd', advanced: true,
      hint: 'measured drives and first-putt lengths (Stats to track)',
      options: [
        { value: 'yd', label: 'Yards' },
        { value: 'm', label: 'Metres' },
      ],
    },
    {
      key: 'extraHoles', label: 'Match play if level', type: 'choice', default: false, advanced: true,
      options: [
        { value: false, label: 'Halved' },
        { value: true, label: 'Extra holes (knockout)' },
      ],
    },
  ],
};
