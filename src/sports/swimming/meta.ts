/**
 * Perf F-15 — Swimming's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

export const SWIMMING_META: SportMeta = {
  id: 'swimming',
  name: 'Swimming',
  icon: '🏊',
  archetype: 'measured',
  participantKind: 'individual',
  formatFields: [
    {
      key: 'course', label: 'Pool', type: 'choice', default: 'LCM', onCreate: true,
      hint: 'records and personal bests are kept separately for each pool (25 m, 50 m, 25 yd)',
      options: [{ value: 'LCM', label: '50 m (long course)' }, { value: 'SCM', label: '25 m (short course)' }, { value: 'SCY', label: '25 yd (short course yards, US)' }],
    },
    {
      key: 'lanes', label: 'Lanes', type: 'choice', default: 8, onCreate: true,
      hint: 'a 10-lane pool numbers its lanes 0–9',
      options: [{ value: 6, label: '6' }, { value: 8, label: '8' }, { value: 10, label: '10' }, { value: 5, label: '5' }, { value: 4, label: '4' }],
    },
    {
      key: 'pointsScheme', label: 'Position points', type: 'choice', default: '8,7,6,5,4,3,2,1', onCreate: true,
      hint: 'points each place earns for its house / team; tied places share',
      options: [
        { value: '8,7,6,5,4,3,2,1', label: '8-7-6-5-4-3-2-1' },
        { value: '10,8,6,5,4,3,2,1', label: '10-8-6-5-4-3-2-1' },
        { value: '5,3,1', label: '5-3-1 (medals only)' },
        { value: '7,5,4,3,2,1', label: '7-5-4-3-2-1' },
      ],
    },
    {
      key: 'relayFactor', label: 'Relay points', type: 'choice', default: 1,
      options: [{ value: 1, label: 'Same as individual' }, { value: 2, label: 'Double' }],
    },
    { key: 'handTimed', label: 'Manual timing', type: 'toggle', default: false, onCreate: true, hint: 'stopwatches, no touchpads: times to 1/100 from the lane’s watches (SW 11.3) count for meet records' },
    // SD-130: who is the individual champion when two athletes have the same points
    {
      key: 'champTie', label: 'Champion tie-break', type: 'choice', default: 'medals', advanced: true,
      hint: 'the individual champion of each age group: most position points; if level…',
      options: [{ value: 'medals', label: 'More golds, then silvers, bronzes' }, { value: 'share', label: 'Joint champions' }],
    },
    // deep wave (timed races): "Stats to track" — optional depth the meet switches on
    { key: 'splits', label: '50 m splits', type: 'toggle', default: true, advanced: true, group: 'Stats to track', hint: 'record the time at every 50 m (races over 50 m) — lap times, places at each split; a relay’s lead-off time goes on the swimmer’s profile' },
    { key: 'reaction', label: 'Reaction times', type: 'toggle', default: false, advanced: true, group: 'Stats to track', hint: 'touchpad timing reads each start' },
    { key: 'takeovers', label: 'Relay take-over times', type: 'toggle', default: false, advanced: true, group: 'Stats to track', hint: 'the pads’ take-over reading for legs 2–4 (earlier than −0.03 s is flagged for the take-off judge)' },
  ],
};
