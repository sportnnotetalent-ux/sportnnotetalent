/**
 * Perf F-15 — Rugby's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';
import { ruledOutField } from '../invasion/ruledOut.ts';
import { restartField } from '../invasion/restarts.ts';

export const RUGBY_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  senior: { label: '15s · 2 × 40', set: { variant: '15s', playersPerSide: 15, periodMinutes: 40, sinBinMinutes: 10, maxSubs: 8, rolling: false, etMinutes: 10, sdMinutes: 10 } },
  u18: { label: 'U18 15s · 2 × 35', set: { variant: '15s', playersPerSide: 15, periodMinutes: 35, sinBinMinutes: 10, maxSubs: 8, rolling: false, etMinutes: 10, sdMinutes: 10 } },
  u16: { label: 'U16 15s · 2 × 30', set: { variant: '15s', playersPerSide: 15, periodMinutes: 30, sinBinMinutes: 10, maxSubs: 0, rolling: true, etMinutes: 10, sdMinutes: 10 } },
  u14: { label: 'U14 · 2 × 25, rolling subs', set: { variant: '15s', playersPerSide: 15, periodMinutes: 25, sinBinMinutes: 10, maxSubs: 0, rolling: true, etMinutes: 10, sdMinutes: 10 } },
  tens: { label: '10s · 2 × 10', set: { variant: '10s', playersPerSide: 10, periodMinutes: 10, sinBinMinutes: 2, maxSubs: 5, rolling: false, etMinutes: 5, sdMinutes: 5 } },
  sevens: { label: 'Sevens · 2 × 7', set: { variant: '7s', playersPerSide: 7, periodMinutes: 7, sinBinMinutes: 2, maxSubs: 5, rolling: false, etMinutes: 5, sdMinutes: 5 } },
  sevensFinal: { label: 'Sevens final · 2 × 10', set: { variant: '7s', playersPerSide: 7, periodMinutes: 10, sinBinMinutes: 2, maxSubs: 5, rolling: false, etMinutes: 5, sdMinutes: 5 } },
};

/** Deep wave — the "Stats to track" toggles (live settings + the match format). */
export const TRACK_FIELDS: FormatField[] = [
  // batch 3 (founder, 2026-11-02): on for a new match; a saved match keeps its own (engine init)
  { key: 'trackPenalties', label: 'Penalties by offence & free kicks', type: 'toggle', default: true, group: 'Stats to track', hint: 'A ⚖ Penalty button: the offence and the player (both optional); a Free kick button: the player (optional)' },
  { key: 'trackTurnovers', label: 'Turnovers conceded', type: 'toggle', default: false, group: 'Stats to track', hint: 'Knock-ons, forward passes, handling errors… the cause and the player (both optional)' },
  { key: 'trackEntries', label: '22 entries', type: 'toggle', default: false, group: 'Stats to track', hint: 'One tap when a team gets into the opposition 22 — points per entry' },
  { key: 'trackPossession', label: 'Possession & territory', type: 'toggle', default: false, group: 'Stats to track', hint: 'Tap who has the ball and which half play is in — % on the playing clock; "Ball dead" pauses both at stoppages' },
  { key: 'trackOffloads', label: 'Offloads', type: 'toggle', default: false, group: 'Stats to track', hint: 'An Offload button — who made it (optional)' },
];

export const RUGBY_META: SportMeta = {
  id: 'rugby',
  name: 'Rugby',
  icon: '🏉',
  archetype: 'goal-time',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'senior', onCreate: true,
      options: [
        ...Object.entries(RUGBY_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 15, min: 7, max: 15, advanced: true },
    { key: 'periodMinutes', label: 'Minutes per half', type: 'number', default: 40, min: 1, max: 40, advanced: true },
    { key: 'sinBinMinutes', label: 'Yellow card (sin-bin) minutes', type: 'number', default: 10, min: 1, max: 10, advanced: true, hint: 'Law 9: 10 · sevens: 2' },
    { key: 'maxSubs', label: 'Replacements allowed (0 = no limit)', type: 'number', default: 8, min: 0, max: 30, advanced: true },
    { key: 'rolling', label: 'Rolling replacements (age-grade)', type: 'toggle', default: false, advanced: true, hint: 'a replaced player may come back on' },
    { key: 'red20', label: '20-minute red card (World Rugby trial)', type: 'toggle', default: false, advanced: true, hint: 'the scorer can give a 20-minute red: replaceable after 20 minutes; two yellows = a 20-minute red' },
    { key: 'trackDetail', label: 'Track tackles, carries and set pieces', type: 'toggle', default: false, advanced: true },
    ...TRACK_FIELDS.map((f) => ({ ...f, advanced: true })),
    // invasion batch 6: goal / try ruled out (off by default)
    { ...ruledOutField('rugby'), advanced: true },
    // invasion batch 6: restart and penalty-use depth (off by default)
    { ...restartField('rugby'), advanced: true },
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Draw stands (league)' },
        { value: 'standard', label: 'Standard knockout (15s: extra time, sudden death, kicks · sevens: sudden death)' },
        { value: 'et', label: 'Extra time 2 × 10, then 10 min sudden death, then kicks (RWC)' },
        { value: 'etKicks', label: 'Extra time 2 × 10, then kicks' },
        { value: 'sd', label: 'Sudden-death periods until someone scores (sevens)' },
        { value: 'kicks', label: 'Kicking competition straight away' },
      ],
      hint: 'a knockout match needs a winner — competition rules differ, so pick yours',
    },
    { key: 'etMinutes', label: 'Extra time minutes per half', type: 'number', default: 10, min: 1, max: 20, advanced: true },
    { key: 'sdMinutes', label: 'Sudden-death period minutes', type: 'number', default: 10, min: 1, max: 20, advanced: true },
  ],
};
