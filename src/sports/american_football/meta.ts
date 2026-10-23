/**
 * Perf F-15 — American football's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';

export const AF_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  flag: { label: 'Flag 5v5 (IFAF) · 2 × 20', set: { variant: 'flag', rules: 'ifaf', playersPerSide: 5, periods: 2, periodMinutes: 20, timeoutsPerHalf: 2, twoMinute: false, decider: 'flag' } },
  flagSchool: { label: 'Flag 5v5 school · 2 × 15', set: { variant: 'flag', rules: 'ifaf', playersPerSide: 5, periods: 2, periodMinutes: 15, timeoutsPerHalf: 1, twoMinute: false, decider: 'flag' } },
  nfl: { label: 'Tackle · NFL 4 × 15', set: { variant: 'tackle', rules: 'nfl', playersPerSide: 11, periods: 4, periodMinutes: 15, timeoutsPerHalf: 3, twoMinute: true, decider: 'nfl', otMinutes: 10 } },
  ncaa: { label: 'Tackle · College 4 × 15', set: { variant: 'tackle', rules: 'ncaa', playersPerSide: 11, periods: 4, periodMinutes: 15, timeoutsPerHalf: 3, twoMinute: false, decider: 'kansas', otSpot: 25 } },
  nfhs: { label: 'Tackle · High school (NFHS) 4 × 12', set: { variant: 'tackle', rules: 'nfhs', playersPerSide: 11, periods: 4, periodMinutes: 12, timeoutsPerHalf: 3, twoMinute: false, decider: 'kansas', otSpot: 10 } },
};

/** Deep wave — the "Stats to track" toggles (live settings + the match format;
 *  they act in play-by-play mode). */
export const TRACK_FIELDS: FormatField[] = [
  { key: 'trackTargets', label: 'Targets (who a pass was meant for)', type: 'toggle', default: false, group: 'Stats to track', hint: 'Play by play: one optional tap after ✗ Incomplete — receivers get targets (complete + incomplete)' },
  { key: 'trackDefence', label: 'Pass breakups & tackles for loss', type: 'toggle', default: false, group: 'Stats to track', hint: 'Play by play: who broke up an incomplete pass (optional tap) — an interception counts as a pass defended too (NFL); with tackles asked, a run or catch that lost yards is a tackle for loss' },
];

export const AMERICAN_FOOTBALL_META: SportMeta = {
  id: 'american_football',
  name: 'American football',
  icon: '🏈',
  archetype: 'goal-time',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'flag', onCreate: true,
      options: [
        ...Object.entries(AF_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'mode', label: 'Scoring detail', type: 'choice', default: 'score', onCreate: true,
      options: [
        { value: 'score', label: 'Scores only (fast)' },
        { value: 'pbp', label: 'Play by play (downs, yards, stats)' },
      ],
    },
    { key: 'variant', label: 'Game', type: 'choice', default: 'flag', advanced: true, options: [{ value: 'flag', label: 'Flag (no contact)' }, { value: 'tackle', label: 'Tackle' }] },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 5, min: 4, max: 11, advanced: true },
    { key: 'periods', label: 'Periods', type: 'choice', default: 2, advanced: true, options: [{ value: 2, label: '2 halves' }, { value: 4, label: '4 quarters' }] },
    { key: 'periodMinutes', label: 'Minutes per half / quarter', type: 'number', default: 20, min: 1, max: 30, advanced: true },
    { key: 'timeoutsPerHalf', label: 'Timeouts per team per half', type: 'number', default: 2, min: 0, max: 5, advanced: true, hint: 'NFL / NCAA / NFHS: 3 · IFAF flag: 2 (verify)' },
    { key: 'twoMinute', label: 'Two-minute warning (NFL)', type: 'toggle', default: false, advanced: true, hint: 'the clock stops at 2:00 of the 2nd and 4th quarters' },
    { key: 'trackTackles', label: 'Ask who made the tackle / flag pull (play by play)', type: 'toggle', default: false, advanced: true },
    // deep wave — "Stats to track" (off by default)
    ...TRACK_FIELDS.map((f) => ({ ...f, advanced: true })),
    {
      key: 'decider', label: 'If tied at the end of regulation', type: 'choice', default: 'flag',
      options: [
        { value: 'none', label: 'The tie stands' },
        { value: 'standard', label: 'Standard for these rules' },
        { value: 'flag', label: 'Flag: conversion tries' },
        { value: 'kansas', label: 'Kansas (NFHS / college)' },
        { value: 'nfl', label: 'NFL regular season (may tie)' },
        { value: 'nfl_playoff', label: 'NFL playoffs' },
      ],
      hint: 'flag: one try each (1 from the 5 / 2 from the 12) until one leads · Kansas: one possession each from the 10 (college 25) · NFL: 10 min, both get the ball, then sudden death · a knockout game always needs a winner',
    },
    { key: 'otSpot', label: 'Kansas overtime: start yards from goal', type: 'number', default: 10, min: 1, max: 50, advanced: true, hint: 'NFHS 10 · NCAA 25' },
    { key: 'otMinutes', label: 'NFL overtime minutes', type: 'number', default: 10, min: 1, max: 15, advanced: true },
    {
      key: 'flagTurnover', label: 'Flag: after a failed series the other team starts', type: 'choice', default: 'own5', advanced: true,
      options: [{ value: 'own5', label: 'On its own 5-yard line' }, { value: 'spot', label: 'Where the ball was dead' }],
    },
  ],
};
