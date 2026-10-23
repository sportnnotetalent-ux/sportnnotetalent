/**
 * Perf F-15 — Rowing's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

export const ROWING_META: SportMeta = {
  id: 'rowing',
  name: 'Rowing',
  icon: '🚣',
  archetype: 'measured',
  participantKind: 'individual',
  formatFields: [
    {
      key: 'lanes', label: 'Lanes', type: 'choice', default: 6, onCreate: true,
      hint: 'World Rowing courses have 6 lanes (some 8); school courses often 4',
      options: [{ value: 6, label: '6' }, { value: 8, label: '8' }, { value: 4, label: '4' }, { value: 5, label: '5' }],
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
    { key: 'splits', label: '500 m splits', type: 'toggle', default: false, advanced: true, group: 'Stats to track', hint: 'record each crew’s time at every 500 m' },
  ],
};
