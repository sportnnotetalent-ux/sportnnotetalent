/**
 * Snooker's light metadata (perf F-15): name, icon, who competes and the
 * format options, without the engine or the scorer UI (they load on demand).
 * PURE. Options and defaults: docs/sports/SNOOKER_BILLIARDS_DESIGN.md §7
 * (WPBSA Official Rules; 10- and 6-red as played at IBSF / WSF events).
 */
import type { SportMeta } from '../types';

export const SNOOKER_META: SportMeta = {
  id: 'snooker',
  name: 'Snooker',
  icon: '🔴',
  archetype: 'set-game-point',
  // Four-handed snooker isn't modelled: a side is one player (design §8.11)
  participantKind: 'individual',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'r15b5',
      options: [
        { value: 'r15b5', label: '15 reds · best of 5', set: { reds: 15, bestOf: 5 } },
        { value: 'r15b7', label: '15 reds · best of 7', set: { reds: 15, bestOf: 7 } },
        { value: 'r15b9', label: '15 reds · best of 9', set: { reds: 15, bestOf: 9 } },
        { value: 'r15b1', label: '15 reds · one frame', set: { reds: 15, bestOf: 1 } },
        { value: 'r10b5', label: '10 reds · best of 5', set: { reds: 10, bestOf: 5 } },
        { value: 'r6b7', label: '6 reds · best of 7', set: { reds: 6, bestOf: 7 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'reds', label: 'Reds', type: 'choice', default: 15, advanced: true,
      options: [
        { value: 15, label: '15 reds' },
        { value: 10, label: '10 reds' },
        { value: 6, label: '6 reds' },
      ],
    },
    { key: 'bestOf', label: 'Best of (frames)', type: 'number', default: 5, min: 1, max: 35, advanced: true, hint: 'an odd number; an even one rounds up' },
    {
      key: 'scoringMode', label: 'Scoring', type: 'choice', default: 'shot',
      options: [
        { value: 'shot', label: 'Shot by shot (breaks and stats)' },
        { value: 'quick', label: 'Frame scores only' },
      ],
    },
    // cue batch 6 (audit row 19) — WST broadcast stats, optional chips on the pot buttons
    { key: 'trackLongRest', label: 'Long pots and rest shots', type: 'toggle', default: false, advanced: true, group: 'Stats to track',
      hint: 'two optional chips by the pot buttons: tag a long pot (made or missed) or a stroke with the rest' },
  ],
};
