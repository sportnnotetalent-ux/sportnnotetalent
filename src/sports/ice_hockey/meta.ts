/**
 * Perf F-15 — Ice hockey's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';

export const ICE_HOCKEY_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  iihf: { label: 'IIHF 3 × 20', set: { periodMinutes: 20, skaters: 5, otMinutes: 5, otSkaters: 3, poOtMinutes: 10, poOtSkaters: 3, poShootout: true, soRounds: 5, pimScale: 'iihf' } },
  nhl: { label: 'NHL 3 × 20', set: { periodMinutes: 20, skaters: 5, otMinutes: 5, otSkaters: 3, poOtMinutes: 20, poOtSkaters: 5, poShootout: false, soRounds: 3, pimScale: 'nhl' } },
  // NFHS: periods of 17 (some states 15) minutes; overtime is a state choice — verify
  nfhs: { label: 'US high school 3 × 17', set: { periodMinutes: 17, skaters: 5, otMinutes: 8, otSkaters: 4, poOtMinutes: 8, poOtSkaters: 4, poShootout: true, soRounds: 3, pimScale: 'nhl' } },
  youth15: { label: 'Youth 3 × 15', set: { periodMinutes: 15, skaters: 5, otMinutes: 5, otSkaters: 3, poOtMinutes: 5, poOtSkaters: 3, poShootout: true, soRounds: 3, pimScale: 'iihf' } },
  youth12: { label: 'Youth 3 × 12', set: { periodMinutes: 12, skaters: 5, otMinutes: 5, otSkaters: 3, poOtMinutes: 5, poOtSkaters: 3, poShootout: true, soRounds: 3, pimScale: 'iihf' } },
};

/** Deep wave — the "Stats to track" toggles (live settings + the match format). */
export const TRACK_FIELDS: FormatField[] = [
  { key: 'trackFaceoffs', label: 'Faceoffs', type: 'toggle', default: false, group: 'Stats to track', hint: 'One tap per draw for the team that won it (name the centres once) — FO% by player' },
  { key: 'trackFaceoffZones', label: 'Faceoff zones', type: 'toggle', default: false, group: 'Stats to track', hint: 'With Faceoffs on: one more tap per draw — in whose end it was (or neutral) — FO% by zone' },
  { key: 'trackPhysical', label: 'Hits & blocked shots', type: 'toggle', default: false, group: 'Stats to track', hint: 'Hit / Block buttons — who made it (optional)' },
  { key: 'trackPuck', label: 'Giveaways & takeaways', type: 'toggle', default: false, group: 'Stats to track', hint: 'Who lost / won the puck (optional)' },
  { key: 'trackAttempts', label: 'Missed shots (shot attempts)', type: 'toggle', default: false, group: 'Stats to track', hint: 'Shots wide / over the net — shot attempts with blocks' },
];

export const ICE_HOCKEY_META: SportMeta = {
  id: 'ice_hockey',
  name: 'Ice hockey',
  icon: '🏒',
  archetype: 'goal-time',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'iihf', onCreate: true,
      options: [
        ...Object.entries(ICE_HOCKEY_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'periodMinutes', label: 'Minutes per period', type: 'number', default: 20, min: 1, max: 30, advanced: true },
    { key: 'skaters', label: 'Skaters a side (plus the goalie)', type: 'count', default: 5, min: 3, max: 6, advanced: true },
    {
      key: 'decider', label: 'If tied after regulation', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Tie stands' },
        { value: 'otso', label: 'Overtime, then a shoot-out (round robin)' },
        { value: 'playoff', label: 'Play-off overtime (sudden death)' },
        { value: 'so', label: 'Shoot-out straight away' },
      ],
      hint: 'tournaments set this by stage: groups → overtime + shoot-out, knockouts → play-off overtime',
    },
    { key: 'otMinutes', label: 'Overtime minutes (round robin)', type: 'number', default: 5, min: 0, max: 20, advanced: true, hint: 'IIHF / NHL: 5, 3 on 3' },
    { key: 'otSkaters', label: 'Overtime skaters (round robin)', type: 'count', default: 3, min: 3, max: 5, advanced: true },
    { key: 'poOtMinutes', label: 'Play-off overtime minutes', type: 'number', default: 10, min: 1, max: 20, advanced: true, hint: 'IIHF 10 (final 20), NHL 20' },
    { key: 'poOtSkaters', label: 'Play-off overtime skaters', type: 'count', default: 3, min: 3, max: 5, advanced: true },
    { key: 'poShootout', label: 'Shoot-out after play-off overtime', type: 'toggle', default: true, advanced: true, hint: 'IIHF yes; NHL plays more overtime until a goal' },
    { key: 'soRounds', label: 'Shoot-out shooters a side', type: 'count', default: 5, min: 1, max: 5, advanced: true, hint: 'IIHF 5, NHL 3' },
    { key: 'stopClock', label: 'Stop the clock on goals and penalties', type: 'toggle', default: true, advanced: true },
    { key: 'plusMinus', label: 'Track +/- (pick who was on the ice at each goal)', type: 'toggle', default: false, advanced: true },
    ...TRACK_FIELDS.map((f) => ({ ...f, advanced: true })),
    { key: 'allowTies', label: 'League games may end tied (no overtime)', type: 'toggle', default: false, advanced: true, hint: 'groups otherwise play overtime + a shoot-out' },
  ],
};
