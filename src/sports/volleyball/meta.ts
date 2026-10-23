/**
 * Perf F-15 — Volleyball's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';
import { VOLLEYBALL_LIVE_SETTINGS } from './settings.ts';

export const VOLLEYBALL_META: SportMeta = {
  id: 'volleyball',
  name: 'Volleyball',
  icon: '🏐',
  archetype: 'running-points',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'indoor',
      options: [
        { value: 'indoor', label: 'Indoor (25 · dec 15)', set: { playersPerSide: 6, substitutes: 6, setsToWin: 3, pointsPerSet: 25, deciderPoints: 15, winByTwo: true, timeoutsPerSet: 2 } },
        { value: 'beach', label: 'Beach (21 · dec 15)', set: { playersPerSide: 2, substitutes: 0, setsToWin: 2, pointsPerSet: 21, deciderPoints: 15, winByTwo: true, timeoutsPerSet: 1 } },
        // SD-136: 9-a-side — a serving order of 9 (no I–VI positions / libero) and 3 subs a set (verify: national 9-a-side rules vary)
        { value: 'nineaside', label: '9-a-side (21 · best of 3)', set: { playersPerSide: 9, substitutes: 3, setsToWin: 2, pointsPerSet: 21, deciderPoints: 15, winByTwo: true, timeoutsPerSet: 2 } },
        { value: 'single', label: 'Single set to 25', set: { playersPerSide: 6, substitutes: 6, setsToWin: 1, pointsPerSet: 25, deciderPoints: 25, winByTwo: true, timeoutsPerSet: 2 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 6, min: 1, max: 11, hint: '6 indoor · 2 beach · 9 nine-a-side — the rotation / serving order is this long' },
    // SD-136: read by the scorer — the sub counter, its warning and the 🔁 Sub button (0 = no subs, beach)
    { key: 'substitutes', label: 'Substitutions per team per set', type: 'count', default: 6, min: 0, max: 12, advanced: true, hint: '6 indoor (FIVB 15.6) · 0 beach · 3 nine-a-side' },
    {
      key: 'setsToWin', label: 'Match length', type: 'choice', default: 3,
      options: [
        { value: 3, label: 'Best of 5' },
        { value: 2, label: 'Best of 3' },
        { value: 1, label: 'Single set' },
      ],
    },
    { key: 'pointsPerSet', label: 'Points per set', type: 'number', default: 25, min: 10, max: 30 },
    { key: 'deciderPoints', label: 'Deciding-set points', type: 'number', default: 15, min: 10, max: 25, hint: 'the final set is a shorter race' },
    {
      key: 'winByTwo', label: 'Set ending', type: 'choice', default: true,
      options: [
        { value: true, label: 'Win by 2 (standard)' },
        { value: false, label: 'First to target (win by 1)' },
      ],
    },
    // SD-117b: FIVB indoor 2 per team per set; beach 1 (+ a technical timeout
    // at 21 points in sets 1–2, shown as a cue)
    { key: 'timeoutsPerSet', label: 'Timeouts per team per set', type: 'count', default: 2, min: 0, max: 3, advanced: true, hint: '2 indoor · 1 beach' },
    // deep wave — "Stats to track" defaults for every match of this format
    // (the scorer can still change them per match in ⚙️ Stats to track)
    ...VOLLEYBALL_LIVE_SETTINGS.fields.map((f) => ({ ...f, advanced: true })),
  ],
};
