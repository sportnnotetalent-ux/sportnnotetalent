/**
 * Perf F-15 — Archery's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

export const ARCHERY_META: SportMeta = {
  id: 'archery',
  name: 'Archery',
  icon: '🏹',
  archetype: 'measured',
  participantKind: 'individual',
  formatFields: [
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team; tied places share (archers out in the same match-play round share a place)',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
      ],
    },
  ],
};
