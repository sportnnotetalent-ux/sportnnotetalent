/**
 * Perf F-15 — Handball's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';

export const HANDBALL_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  senior: { label: 'Senior 2 × 30', set: { playersPerSide: 7, periodMinutes: 30 } },
  youth25: { label: 'Youth 2 × 25 (12–16)', set: { playersPerSide: 7, periodMinutes: 25 } },
  youth20: { label: 'Youth 2 × 20 (8–12)', set: { playersPerSide: 7, periodMinutes: 20 } },
};

/** Deep wave — the optional "Stats to track" (off by default: one tap per
 *  event stays the default; these add a chip / a step when on). */
export const HANDBALL_TRACK_FIELDS: FormatField[] = [
  { key: 'trackFaultTypes', label: 'Technical fault types', type: 'toggle', default: false, group: 'Stats to track', hint: 'steps, double dribble, area, offensive foul, passive play…' },
  { key: 'trackSevenMDrawn', label: '7 m won by', type: 'toggle', default: false, group: 'Stats to track', hint: 'who won each 7-metre throw' },
];

export const HANDBALL_META: SportMeta = {
  id: 'handball',
  name: 'Handball',
  icon: '🤾',
  archetype: 'goal-time',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'senior', onCreate: true,
      options: [
        ...Object.entries(HANDBALL_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side (incl. keeper)', type: 'count', default: 7, min: 4, max: 7, advanced: true },
    { key: 'periodMinutes', label: 'Minutes per half', type: 'number', default: 30, min: 1, max: 45, advanced: true },
    { key: 'stopClock', label: 'Stop the clock for suspensions', type: 'toggle', default: true, advanced: true, hint: 'IHF 2:9 — the clock always stops for a team time-out' },
    // deep wave: the optional "Stats to track" an organiser can switch on for an event
    ...HANDBALL_TRACK_FIELDS.map((f) => ({ ...f, label: `Track ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)}`, advanced: true })),
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Draw stands (league)' },
        { value: 'et2', label: 'Extra time 2 × 5, again if level, then 7 m throws (IHF)' },
        { value: 'et', label: 'Extra time 2 × 5, then 7 m throws' },
        { value: 'shootout', label: '7 m throws straight away' },
      ],
      hint: 'a knockout match needs a winner',
    },
  ],
};
