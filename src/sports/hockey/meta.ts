/**
 * Perf F-15 — Hockey's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';

export const HOCKEY_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  fih: { label: 'FIH 4 × 15', set: { playersPerSide: 11, periods: 4, periodMinutes: 15, stopClock: true, penaltyCorners: true } },
  school: { label: 'School 2 × 25', set: { playersPerSide: 11, periods: 2, periodMinutes: 25, stopClock: false, penaltyCorners: true } },
  junior: { label: 'Junior 4 × 10', set: { playersPerSide: 11, periods: 4, periodMinutes: 10, stopClock: false, penaltyCorners: true } },
  indoor: { label: 'Indoor 6-a-side', set: { playersPerSide: 6, periods: 2, periodMinutes: 20, stopClock: false, penaltyCorners: true } },
  fives: { label: 'Hockey5s', set: { playersPerSide: 5, periods: 2, periodMinutes: 10, stopClock: false, penaltyCorners: false } },
};

/** Deep wave — the optional "Stats to track" (off by default: one tap per
 *  event stays the default; these add their own buttons when on). */
export const HOCKEY_TRACK_FIELDS: FormatField[] = [
  { key: 'trackPossession', label: 'Possession', type: 'toggle', default: false, group: 'Stats to track', hint: 'tap who has the ball; % on the game clock' },
  { key: 'trackReferrals', label: 'Video referrals', type: 'toggle', default: false, group: 'Stats to track', hint: 'per team, upheld or not' },
];

export const HOCKEY_META: SportMeta = {
  id: 'hockey',
  name: 'Hockey',
  icon: '🏑',
  archetype: 'goal-time',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'fih', onCreate: true,
      options: [
        ...Object.entries(HOCKEY_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 11, min: 4, max: 11, advanced: true },
    { key: 'periods', label: 'Periods', type: 'choice', default: 4, advanced: true, options: [{ value: 4, label: '4 quarters' }, { value: 2, label: '2 halves' }] },
    { key: 'periodMinutes', label: 'Minutes per period', type: 'number', default: 15, min: 1, max: 45, advanced: true },
    { key: 'stopClock', label: 'Stop the clock for goals & penalty corners', type: 'toggle', default: true, advanced: true, hint: 'as international matches do; you restart it' },
    { key: 'penaltyCorners', label: 'Penalty corners', type: 'toggle', default: true, advanced: true, hint: 'off for Hockey5s' },
    // deep wave: the optional "Stats to track" an organiser can switch on for an event
    ...HOCKEY_TRACK_FIELDS.map((f) => ({ ...f, label: `Track ${f.label.toLowerCase()}`, advanced: true })),
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Draw stands' },
        { value: 'shootout', label: 'Shoot-out (5 each, then sudden death)' },
      ],
      hint: 'always a shoot-out in a tournament on “FIH + shoot-out bonus”',
    },
  ],
};
