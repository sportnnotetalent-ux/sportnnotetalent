/**
 * Perf F-15 — Kabaddi's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';
import { KABADDI_LIVE_SETTINGS } from './settings.ts';

export const KABADDI_META: SportMeta = {
  id: 'kabaddi',
  name: 'Kabaddi',
  icon: '🤼',
  archetype: 'raid',
  formatFields: [
    {
      key: 'preset', label: 'Rule set', type: 'preset', default: 'pro',
      options: [
        // SD-136: super tackle is an AKFI / IKF rule (not PKL-only), so every
        // preset keeps it; do-or-die is on for senior and women / junior play.
        { value: 'pro', label: 'Standard / Pro (7 · 2×20)', set: { playersPerSide: 7, substitutes: 5, halfMinutes: 20, extraTimeMinutes: 5, decider: 'extra_time', style: 'sanjeevani', superTackle: true, doOrDie: true, subReturn: true, caughtTouches: 'void' } },
        // stored value stays 'circle' (saved formats) — it was always standard 7-a-side over 2×15
        { value: 'circle', label: 'Women / Junior (7 · 2×15)', set: { playersPerSide: 7, substitutes: 5, halfMinutes: 15, extraTimeMinutes: 5, decider: 'golden_raid', style: 'sanjeevani', superTackle: true, doOrDie: true, subReturn: true, caughtTouches: 'void' } },
        { value: 'school', label: 'School (7 · 2×10)', set: { playersPerSide: 7, substitutes: 5, halfMinutes: 10, extraTimeMinutes: 5, decider: 'extra_time', style: 'sanjeevani', superTackle: true, doOrDie: false, subReturn: true, caughtTouches: 'void' } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 7, min: 1, max: 11 },
    {
      key: 'style', label: 'Revival style', type: 'choice', default: 'sanjeevani',
      options: [
        { value: 'sanjeevani', label: 'Sanjeevani (revival)' },
        { value: 'amar', label: 'Amar (points only)' },
        { value: 'gaminee', label: 'Gaminee (all-out ends)' },
      ],
    },
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'extra_time',
      options: [
        { value: 'none', label: 'Draw stands' },
        { value: 'extra_time', label: 'Extra time, then Golden Raid' },
        { value: 'golden_raid', label: 'Golden Raid straightaway' },
      ],
    },
    // SD-136: was one "Pro rules (do-or-die, super tackle, bonus)" toggle (`proRules`,
    // still read for older formats). The bonus line always applies (6+ defenders).
    { key: 'superTackle', label: 'Super tackle (3 or fewer defenders: +2)', type: 'toggle', default: true, hint: 'AKFI / IKF / PKL' },
    { key: 'doOrDie', label: 'Do-or-die raid (3rd empty raid: raider out)', type: 'toggle', default: true },
    // SD-83 (D6): AKFI / IKF — and PKL — a raider caught before getting back loses his touches
    {
      key: 'caughtTouches', label: 'Raider caught after touching', type: 'choice', default: 'void', advanced: true,
      options: [
        { value: 'void', label: 'Touches don’t score (AKFI / PKL)' },
        { value: 'count', label: 'Touches still score (house rule)' },
      ],
    },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 5, min: 0, max: 11, advanced: true },
    // SD-117b: AKFI / PKL let a substituted player come back on (within the limit)
    { key: 'subReturn', label: 'Substituted players may return', type: 'toggle', default: true, advanced: true },
    { key: 'halfMinutes', label: 'Minutes per half', type: 'number', default: 20, min: 5, max: 30 },
    { key: 'extraTimeMinutes', label: 'Extra-time half (min)', type: 'number', default: 5, min: 1, max: 15, advanced: true, hint: 'used only for the “extra time” decider' },
    // deep wave — "Stats to track" defaults for every match of this format
    // (the scorer can still change them per match in ⚙️ Stats to track)
    ...KABADDI_LIVE_SETTINGS.fields.map((f) => ({ ...f, advanced: true })),
  ],
};
