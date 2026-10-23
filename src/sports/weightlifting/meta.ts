/**
 * Perf F-15 — Weightlifting's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

export const WEIGHTLIFTING_META: SportMeta = {
  id: 'weightlifting',
  name: 'Weightlifting',
  icon: '🏋️',
  archetype: 'measured',
  participantKind: 'individual',
  formatFields: [
    {
      key: 'liftMedals', label: 'Medals for snatch and C&J too', type: 'toggle', default: false, onCreate: true,
      hint: 'on: medals (and points) for the snatch, the clean & jerk and the total, as at IWF World Championships; off: the total only, as at the Olympic Games',
    },
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team; tied places share',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
        { value: '28,25,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1', label: 'IWF team points 28-25-23-22-…-1' },
      ],
    },
    // SD-154: pounds alongside kilograms (US school meets) — kg is stored and is what counts
    {
      key: 'massUnits', label: 'Weights shown in', type: 'choice', default: 'auto', advanced: true,
      hint: 'kilograms always count (IWF); pounds are shown alongside for reading only',
      options: [{ value: 'auto', label: 'Each viewer’s region' }, { value: 'kg', label: 'Kilograms' }, { value: 'kg+lb', label: 'Kilograms + pounds' }],
    },
    { key: 'sinclair', label: 'Sinclair totals', type: 'toggle', default: false, advanced: true, hint: 'compare lifters across bodyweight categories (IWF Sinclair coefficients 2021–2024)' },
  ],
};
