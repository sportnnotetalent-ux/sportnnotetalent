/**
 * Perf F-15 — Football's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';

/** Deep wave — the optional depth toggles (format key `track` + Capitalised). */
export const DEEP_TRACK_KEYS = ['shotDetail', 'keyPasses', 'clearances', 'setPieces', 'cardReasons', 'ruledOut'] as const;

export type DeepTrackKey = typeof DEEP_TRACK_KEYS[number];

/** Deep wave — "Deeper stats (optional)": off by default; each adds a chip or
 *  a step only when on. */
export const DEEP_TRACKABLE: [DeepTrackKey, string, string][] = [
  ['shotDetail', 'Shot detail', 'inside / outside the box, big chances, woodwork'],
  ['keyPasses', 'Key passes', 'who set up each shot'],
  ['clearances', 'Clearances', 'a defensive action button'],
  ['setPieces', 'Goal kicks & throw-ins', 'team counts (FIFA)'],
  ['cardReasons', 'Card reasons', 'foul, dissent, time-wasting…'],
  // round 2 (founder): behind a toggle — school matches have no VAR
  ['ruledOut', 'Goals ruled out', 'offside, foul or VAR — the score never moves'],
];

export const trackKey = (k: string) => `track${k[0].toUpperCase()}${k.slice(1)}`;

/** The stats a scorer can switch on/off (parity #14 live settings, in the old
 *  card's order; FB-17 added crosses, dribbles and handballs), with each one's
 *  full-set default (passes off: too fast for one scorer). */
export const BASE_TRACKABLE: [string, string, boolean][] = [
  ['shots', 'Shots', true], ['possession', 'Possession', true], ['passes', 'Passes', false], ['fouls', 'Fouls', true],
  ['cards', 'Cards', true], ['offsides', 'Offsides', true], ['corners', 'Corners', true], ['tackles', 'Tackles', true],
  ['interceptions', 'Interceptions', true], ['saves', 'Saves', true],
  ['attackContribution', 'Attacking play', true], ['defenceContribution', 'Defensive play', true],
  ['crosses', 'Crosses', true], ['dribbles', 'Dribbles', true], ['handball', 'Handballs', true],
];

/** "Quick" (founder, 2026-10-31; MVP F8): a friendly tracks goals, assists,
 *  subs (always) and cards; everything else is opt-in. Tournaments keep the
 *  full set. Stamped on new matches only — a saved match has no `track*` keys
 *  and keeps the full set (engine `readTrack`). */
export const TRACK_FIELDS: FormatField[] = BASE_TRACKABLE.map(([k, label, full]) => ({
  key: trackKey(k), label: `Track ${label.toLowerCase()}`, type: 'toggle', group: 'Stats to track', advanced: true,
  default: k === 'cards', tournamentDefault: full,
}));

/** Deep wave — the optional toggles as format fields (live settings group;
 *  also an organiser's advanced format options). */
export const DEEP_TRACK_FIELDS: FormatField[] = DEEP_TRACKABLE.map(([k, label, hint]) => ({ key: trackKey(k), label, type: 'toggle', default: false, group: 'Deeper stats (optional)', hint }));

export const FOOTBALL_META: SportMeta = {
  id: 'football',
  name: 'Football',
  icon: '⚽',
  archetype: 'goal-time',
  formatFields: [
    {
      // MVP F3 (founder, 2026-10-31): friendlies start on 5s turf; tournaments keep 11-a-side
      key: 'preset', label: 'Format', type: 'preset', default: 'fives', tournamentDefault: 'eleven',
      options: [
        { value: 'eleven', label: '11-a-side', set: { playersPerSide: 11, halfMinutes: 45, substitutes: 5, subType: 'rolling', stoppedClock: false, futsal: false } },
        { value: 'sevens', label: '7-a-side', set: { playersPerSide: 7, halfMinutes: 25, substitutes: 5, subType: 'rolling', stoppedClock: false, futsal: false } },
        { value: 'fives', label: '5s turf', set: { playersPerSide: 5, halfMinutes: 20, substitutes: 5, subType: 'rolling', stoppedClock: false, futsal: false } },
        // SD-132: futsal — stopped clock (Law 7), time-outs + accumulated fouls, 2 × 5 extra time
        { value: 'futsal', label: 'Futsal', set: { playersPerSide: 5, halfMinutes: 20, substitutes: 9, subType: 'rolling', stoppedClock: true, futsal: true, extraTimeMinutes: 5 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 11, min: 1, max: 11, advanced: true },
    { key: 'halfMinutes', label: 'Minutes per half', type: 'number', default: 45, min: 1, max: 60, hint: 'the whole period with 1 period' },
    // MVP F4: a single-period game (no half-time)
    {
      key: 'periods', label: 'Periods', type: 'choice', default: 2,
      options: [
        { value: 2, label: '2 halves' },
        { value: 1, label: '1 period (no half-time)' },
      ],
    },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 5, min: 0, max: 11 },
    {
      key: 'subType', label: 'Substitutions', type: 'choice', default: 'rolling',
      options: [
        { value: 'rolling', label: 'Rolling (can return)' },
        { value: 'fixed', label: 'Fixed (no return)' },
      ],
    },
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Draw stands — no extra time or penalties' },
        { value: 'extra_time', label: 'Extra time, then penalties' },
        { value: 'penalties', label: 'Penalties straightaway (no extra time)' },
      ],
    },
    { key: 'extraTimeMinutes', label: 'Extra-time half length', type: 'number', default: 15, min: 1, max: 30, advanced: true, hint: 'used only when the decider is “Extra time, then penalties”' },
    { key: 'extraTimeSubs', label: 'Extra substitutions in extra time', type: 'count', default: 1, min: 0, max: 3, advanced: true },
    // SD-29: grassroots / youth sin-bin (IFAB trial: 10 minutes). 0 = none.
    { key: 'sinBinMinutes', label: 'Sin-bin (minutes)', type: 'number', default: 0, min: 0, max: 15, advanced: true, hint: '0 = none · the player returns by himself' },
    // SD-132: futsal (FIFA Futsal Laws 7, 12, 13)
    { key: 'stoppedClock', label: 'Stopped clock', type: 'toggle', default: false, advanced: true, hint: 'Futsal: stop and restart the clock on every stoppage' },
    { key: 'futsal', label: 'Futsal time-outs and accumulated fouls', type: 'toggle', default: false, advanced: true, hint: '1 time-out a half · 6th foul a half = 10 m free kick' },
    ...TRACK_FIELDS,
    // deep wave: the optional "Deeper stats" an organiser can switch on for an event
    ...DEEP_TRACK_FIELDS.map((f) => ({ ...f, label: `Track ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)}`, advanced: true })),
  ],
};
