/**
 * Perf F-15 — Cricket's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';
import { LOCAL_RULE_FIELDS } from './rules.ts';

export const CRICKET_META: SportMeta = {
  id: 'cricket',
  name: 'Cricket',
  icon: '🏏',
  archetype: 'running-points',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 't20',
      options: [
        { value: 't20', label: 'T20', set: { overs: 20, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 6, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true, bowlerMaxOvers: 0, hundred: false } },
        { value: 'odi', label: 'ODI (50)', set: { overs: 50, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 10, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true, bowlerMaxOvers: 0, hundred: false } },
        { value: 't10', label: 'T10', set: { overs: 10, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 3, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true, bowlerMaxOvers: 0, hundred: false } },
        // SD-133 — ECB rules: 5-ball sets, 25-ball powerplay, 20 balls a bowler, Super Five.
        { value: 'hundred', label: 'The Hundred (100 balls)', set: { overs: 10, ballsPerOver: 10, playersPerSide: 11, powerplayOvers: 0, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true, bowlerMaxOvers: 0, hundred: true } },
        { value: 'sixes', label: 'Sixes (6-a-side · 6 ov)', set: { overs: 6, ballsPerOver: 6, playersPerSide: 6, powerplayOvers: 0, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: false, bowlerMaxOvers: 0, hundred: false } },
        { value: 'box', label: 'Box cricket', set: { overs: 5, ballsPerOver: 6, playersPerSide: 6, powerplayOvers: 0, impactPlayer: false, tieBreak: 'super_over', ballType: 'tennis', dls: false, bowlerMaxOvers: 0, hundred: false } },
        { value: 'test', label: 'Test / timeless', set: { overs: 999, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 0, impactPlayer: false, tieBreak: 'shared', ballType: 'leather', dls: false, bowlerMaxOvers: 0, hundred: false } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 11, min: 1, max: 11, hint: 'wickets = players − 1 · set any number for box' },
    {
      key: 'ballType', label: 'Ball', type: 'choice', default: 'leather', onCreate: true,
      options: [
        { value: 'leather', label: 'Leather (match ball)' },
        { value: 'tennis', label: 'Tennis ball' },
      ],
    },
    {
      // Informational only (parity #09) — shown on the tournament page; the engine ignores it.
      key: 'pitchType', label: 'Pitch', type: 'choice', default: 'turf', onCreate: true,
      options: [
        { value: 'turf', label: 'Turf' },
        { value: 'matting', label: 'Matting' },
        { value: 'cement', label: 'Cement' },
        { value: 'astroturf', label: 'Astroturf' },
        { value: 'rough', label: 'Rough' },
      ],
    },
    {
      key: 'tieBreak', label: 'If the match ties', type: 'choice', default: 'super_over',
      options: [
        { value: 'super_over', label: 'Super Over' },
        { value: 'shared', label: 'Tie stands / shared' },
      ],
    },
    { key: 'overs', label: 'Overs per innings', type: 'number', default: 20, min: 1, max: 999 },
    {
      key: 'ballsPerOver', label: 'Balls per over', type: 'choice', default: 6, advanced: true,
      options: [
        { value: 6, label: '6 (standard)' },
        { value: 10, label: '10 (The Hundred)' },
      ],
    },
    // SD-133 — The Hundred's own rules (the preset turns it on)
    { key: 'hundred', label: 'The Hundred rules', type: 'toggle', default: false, advanced: true, hint: '5-ball sets (free bowler change after 5), 25-ball powerplay, 20 balls a bowler, Super Five for a tie' },
    { key: 'bowlerMaxOvers', label: 'Max overs per bowler', type: 'number', default: 0, min: 0, max: 999, advanced: true, hint: '0 = auto (overs ÷ 5, rounded up; none for Test)' },
    { key: 'powerplayOvers', label: 'Powerplay overs', type: 'number', default: 0, min: 0, max: 10, advanced: true, hint: '0 = none' },
    { key: 'dls', label: 'DLS (rain-revised targets)', type: 'toggle', default: false, advanced: true, hint: 'reduce overs on a rain break; the chase target auto-revises' },
    // SD-121 — the overs the chase must face for a rain-stopped match to have a result
    { key: 'minOvers', label: 'Minimum overs for a result', type: 'number', default: 0, min: 0, max: 50, advanced: true,
      hint: '0 = auto (T20 5, ODI 20 — ICC; shorter games ¼ of the overs). The chase must face this many before rain can decide it on DLS par' },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 0, min: 0, max: 5, advanced: true, hint: '12th man, etc.' },
    { key: 'impactPlayer', label: 'Impact Player (IPL-style)', type: 'toggle', default: false, hint: 'one named sub can come in to bat or bowl mid-match' },
    // Local rules (parity #14) — also editable mid-match via liveSettings.
    ...LOCAL_RULE_FIELDS,
  ],
};
