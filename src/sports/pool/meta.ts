/**
 * Pool's light metadata (perf F-15): name, icon, who competes and the format
 * options, without the engine or the scorer UI (they load on demand). PURE.
 * Options and defaults: docs/sports/POOL_DESIGN.md §6 (WPA Rules of Play).
 */
import type { SportMeta } from '../types';

export const POOL_META: SportMeta = {
  id: 'pool',
  name: 'Pool',
  icon: '🎱',
  archetype: 'set-game-point',
  // Singles, or scotch doubles (partners alternate shots)
  participantKind: 'both',
  formatFields: [
    {
      key: 'game', label: 'Game', type: 'choice', default: 'eight', onCreate: true,
      options: [
        { value: 'eight', label: '8-Ball' },
        { value: 'nine', label: '9-Ball' },
        { value: 'ten', label: '10-Ball' },
      ],
    },
    { key: 'raceTo', label: 'Race to', type: 'number', default: 5, min: 1, max: 99, onCreate: true, hint: 'racks — the first to win this many wins' },
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 1,
      options: [
        { value: 1, label: 'Singles' },
        { value: 2, label: 'Scotch doubles' },
      ],
    },
    {
      key: 'setsToWin', label: 'Sets', type: 'choice', default: 1, advanced: true,
      options: [
        { value: 1, label: 'One race' },
        { value: 2, label: 'Best of 3 sets' },
        { value: 3, label: 'Best of 5 sets' },
      ],
    },
    {
      key: 'breakFormat', label: 'Who breaks', type: 'choice', default: 'alternate', advanced: true,
      options: [
        { value: 'alternate', label: 'Alternate (WPA)' },
        { value: 'winner', label: 'Winner breaks' },
        { value: 'loser', label: 'Loser breaks' },
      ],
    },
    {
      key: 'threeFoul', label: 'Three fouls in a row lose the rack', type: 'choice', default: 'auto', advanced: true,
      options: [
        { value: 'auto', label: 'Game standard (9- and 10-ball on, 8-ball off)' },
        { value: true, label: 'On' },
        { value: false, label: 'Off' },
      ],
    },
    { key: 'threeBallRule', label: '9-ball: three-ball rule on the break', type: 'toggle', default: true, advanced: true, hint: 'an open break must pocket a ball or drive 3 balls to the rail (WPA 5.3(c))' },
    { key: 'tenEarly', label: '10-ball: an early called 10 wins', type: 'toggle', default: false, advanced: true, hint: 'the older practice; WPA 2026 spots it, and the 10 wins only as the last ball' },
  ],
};
