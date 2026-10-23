/**
 * Perf F-15 — Rugby league's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';

/** Format presets. Junior / school halves are house values (organiser-editable;
 *  check your league's age-grade rules). Nines: Rugby League Nines 9-a-side,
 *  2 × 9 min, unlimited interchange, a shorter sin bin (3 min — verify). */
export const LEAGUE_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  senior: { label: '13s · 2 × 40', set: { variant: '13s', playersPerSide: 13, periodMinutes: 40, sinBinMinutes: 10, maxInterchanges: 8, setTackles: 6, gpMinutes: 5 } },
  u18: { label: 'U18 13s · 2 × 35, unlimited interchange', set: { variant: '13s', playersPerSide: 13, periodMinutes: 35, sinBinMinutes: 10, maxInterchanges: 0, setTackles: 6, gpMinutes: 5 } },
  u16: { label: 'U16 13s · 2 × 30, unlimited interchange', set: { variant: '13s', playersPerSide: 13, periodMinutes: 30, sinBinMinutes: 10, maxInterchanges: 0, setTackles: 6, gpMinutes: 5 } },
  u14: { label: 'U14 13s · 2 × 25, unlimited interchange', set: { variant: '13s', playersPerSide: 13, periodMinutes: 25, sinBinMinutes: 10, maxInterchanges: 0, setTackles: 6, gpMinutes: 5 } },
  nines: { label: 'Nines · 2 × 9', set: { variant: '9s', playersPerSide: 9, periodMinutes: 9, sinBinMinutes: 3, maxInterchanges: 0, setTackles: 6, gpMinutes: 5 } },
};

/** The "Stats to track" toggles (live settings + the match format). */
export const TRACK_FIELDS: FormatField[] = [
  { key: 'trackSets', label: 'Six-tackle sets', type: 'toggle', default: false, group: 'Stats to track', hint: 'A Tackle button and the tackle count: sets, completion rate, tackles per set, possession' },
  { key: 'trackDefence', label: 'Tackles & missed tackles', type: 'toggle', default: false, group: 'Stats to track', hint: 'Per player, from the Detail button' },
  { key: 'trackAttack', label: 'Runs, line breaks & offloads', type: 'toggle', default: false, group: 'Stats to track', hint: 'Per player, from the Detail button' },
  { key: 'trackErrors', label: 'Errors & penalties conceded', type: 'toggle', default: false, group: 'Stats to track', hint: 'The player or Team (no name)' },
];

export const RUGBY_LEAGUE_META: SportMeta = {
  id: 'rugby_league',
  name: 'Rugby league',
  icon: '🏉',
  archetype: 'goal-time',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'senior', onCreate: true,
      options: [
        ...Object.entries(LEAGUE_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 13, min: 9, max: 13, advanced: true },
    { key: 'periodMinutes', label: 'Minutes per half', type: 'number', default: 40, min: 1, max: 40, advanced: true },
    { key: 'sinBinMinutes', label: 'Sin bin minutes', type: 'number', default: 10, min: 1, max: 10, advanced: true, hint: 'IRL / NRL: 10 · Nines: 3' },
    { key: 'maxInterchanges', label: 'Interchanges allowed (0 = unlimited)', type: 'number', default: 8, min: 0, max: 30, advanced: true, hint: 'NRL: 8 · juniors and Nines: unlimited' },
    { key: 'setTackles', label: 'Tackles in a set', type: 'number', default: 6, min: 3, max: 6, advanced: true, hint: 'the laws: 6 (some Nines events play 5) — used by six-tackle sets' },
    { key: 'fg2', label: 'Two-point field goal from 40 m (NRL)', type: 'toggle', default: false, advanced: true, hint: 'a successful field goal asks 1 or 2 points' },
    { key: 'bonusTry', label: 'Bonus try zone (Nines)', type: 'toggle', default: false, advanced: true, hint: 'a try under the posts is worth 5 — the try asks which' },
    ...TRACK_FIELDS.map((f) => ({ ...f, advanced: true })),
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Draw stands' },
        { value: 'gp', label: 'Golden point 2 × 5 min, then the draw stands (NRL / Super League regular season)' },
        { value: 'gpFinal', label: 'Golden point until someone scores (finals)' },
      ],
      hint: 'golden point: the first score of any kind wins at once',
    },
    { key: 'gpMinutes', label: 'Golden point period minutes', type: 'number', default: 5, min: 1, max: 10, advanced: true },
    { key: 'goldenTry', label: 'Golden try: only a try ends extra time (Nines)', type: 'toggle', default: false, advanced: true },
  ],
};
