/**
 * English billiards' light metadata (perf F-15): name, icon, who competes and
 * the format options, without the engine or the scorer UI (they load on
 * demand). PURE. Options and defaults: docs/sports/SNOOKER_BILLIARDS_DESIGN.md
 * §7 (WPBSA rules; IBSF short format, points and timed games).
 */
import type { SportMeta } from '../types';

export const BILLIARDS_META: SportMeta = {
  id: 'billiards',
  name: 'Billiards',
  icon: '⚪',
  archetype: 'set-game-point',
  // Four-handed billiards isn't modelled: a side is one player (design §8.11)
  // singles, or doubles (partners take alternate visits, cue/doubles.ts)
  participantKind: 'both',
  formatFields: [
    // founder 2026-11-06 — doubles: partners take alternate visits (docs/security/breaks/cue-doubles.md)
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 1,
      options: [
        { value: 1, label: 'Singles' },
        { value: 2, label: 'Doubles' },
      ],
    },
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'short',
      options: [
        { value: 'short', label: 'Short format (150-up · best of 5)', set: { format: 'points', target: 150, bestOf: 5 } },
        { value: 'single150', label: 'One game 150-up', set: { format: 'points', target: 150, bestOf: 1 } },
        { value: 'single100', label: 'One game 100-up', set: { format: 'points', target: 100, bestOf: 1 } },
        { value: 'long1000', label: 'Long-up 1000', set: { format: 'points', target: 1000, bestOf: 1 } },
        { value: 'timed', label: 'Timed game', set: { format: 'timed', bestOf: 1 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'format', label: 'Game', type: 'choice', default: 'points', advanced: true,
      options: [
        { value: 'points', label: 'Points (first to the target)' },
        { value: 'timed', label: 'Timed (most points when time is called)' },
      ],
    },
    { key: 'target', label: 'Points to win a game', type: 'number', default: 150, min: 10, max: 5000, advanced: true },
    { key: 'bestOf', label: 'Best of (games)', type: 'number', default: 5, min: 1, max: 35, advanced: true, hint: 'an odd number; a timed match is one game' },
    {
      key: 'timedTie', label: 'Timed: level when time is called', type: 'choice', default: 'sudden', advanced: true,
      options: [
        { value: 'sudden', label: 'Next score or foul wins' },
        { value: 'draw', label: 'A draw' },
      ],
    },
    { key: 'foulPoints', label: 'Points for a foul', type: 'number', default: 2, min: 1, max: 7, advanced: true },
    { key: 'hazardLimit', label: 'Consecutive hazards allowed', type: 'number', default: 15, min: 0, max: 999, advanced: true, hint: '0 = no limit' },
    { key: 'cannonLimit', label: 'Consecutive cannons allowed', type: 'number', default: 75, min: 0, max: 999, advanced: true, hint: '0 = no limit' },
    {
      key: 'scoringMode', label: 'Scoring', type: 'choice', default: 'shot',
      options: [
        { value: 'shot', label: 'Shot by shot (breaks and stats)' },
        { value: 'quick', label: 'Frame (or game) scores only' },
      ],
    },
  ],
};
