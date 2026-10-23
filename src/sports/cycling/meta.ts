/**
 * Perf F-15 — Cycling's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

export const CYCLING_META: SportMeta = {
  id: 'cycling',
  name: 'Cycling',
  icon: '🚴',
  archetype: 'measured',
  participantKind: 'individual',
  formatFields: [
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team (the GC for a stage race); tied places share',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
        { value: '7,5,4,3,2,1', label: '7-5-4-3-2-1' },
      ],
    },
    { key: 'handTimed', label: 'Hand timing', type: 'toggle', default: false, onCreate: true, hint: 'stopwatches, no transponders / photo finish: hand times count for the meet’s records' },
    // deep wave (timed races): "Stats to track" — optional depth the meet switches on
    { key: 'cycSplits', label: 'Intermediate times', type: 'toggle', default: false, advanced: true, group: 'Stats to track', hint: 'pursuit every 1000 m, kilo / 500 m every lap, team sprint each rider’s lap, a road time trial’s halfway time check' },
  ],
};
