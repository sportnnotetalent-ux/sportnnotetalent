/**
 * Perf F-15 — Canoe sprint's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

export const CANOE_META: SportMeta = {
  id: 'canoe',
  name: 'Canoe sprint',
  icon: '🛶',
  archetype: 'measured',
  participantKind: 'individual',
  formatFields: [
    {
      key: 'lanes', label: 'Lanes', type: 'choice', default: 9, onCreate: true,
      hint: 'ICF sprint courses have 9 lanes',
      options: [{ value: 9, label: '9' }, { value: 8, label: '8' }, { value: 6, label: '6' }, { value: 5, label: '5' }, { value: 4, label: '4' }],
    },
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team (places run on into Final B); tied places share',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
        { value: '7,5,4,3,2,1', label: '7-5-4-3-2-1' },
      ],
    },
    {
      key: 'relayFactor', label: 'Crew-boat points', type: 'choice', default: 1,
      options: [{ value: 1, label: 'Same as single boats' }, { value: 2, label: 'Double' }],
    },
    { key: 'handTimed', label: 'Hand timing', type: 'toggle', default: false, onCreate: true, hint: 'stopwatches at the finish, no photo finish: times to 1/100 count for regatta records' },
    { key: 'splits', label: 'Intermediate times', type: 'toggle', default: false, advanced: true, group: 'Stats to track', hint: 'record each boat’s time every 250 m (every 100 m over 200 m, every 1000 m over 5000 m)' },
  ],
};
