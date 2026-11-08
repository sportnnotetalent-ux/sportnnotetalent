/**
 * Perf F-15 — Baseball & softball's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';

export const BASEBALL_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  baseball: { label: 'Baseball 9 inn (WBSC)', set: { innings: 9, mercy: '15@5,10@7', tiebreak: 'r12', tbFrom: 10, dh: true, lineupSize: 9, startCount: '0-0', foulOut: false } },
  softball: { label: 'Softball fast pitch 7 inn (WBSC)', set: { innings: 7, mercy: '15@3,10@4,7@5', tiebreak: 'r2', tbFrom: 8, dh: false, lineupSize: 9, startCount: '0-0', foulOut: false } },
  slowpitch: { label: 'Slow pitch 7 inn', set: { innings: 7, mercy: '20@3,15@4,10@5', tiebreak: 'r2', tbFrom: 8, dh: false, lineupSize: 10, startCount: '1-1', foulOut: true } },
  youth: { label: 'Youth 6 inn', set: { innings: 6, mercy: '10@4', tiebreak: 'none', tbFrom: 7, dh: true, lineupSize: 9, startCount: '0-0', foulOut: false } },
  school: { label: 'School 7 inn', set: { innings: 7, mercy: '10@5', tiebreak: 'none', tbFrom: 8, dh: true, lineupSize: 9, startCount: '0-0', foulOut: false } },
};

/** Defaults-on wave 3 (docs/security/breaks/defaults-on-us.md): the "Stats to
 *  track" standards for a NEW match — the ONE source the format fields and the
 *  live settings' `defaults` (engine.ts) both read. Spray and batted-ball type
 *  are optional pre-play chips (outs fill the type in themselves); ask for
 *  fielders is an optional chip card after the out. Pitch types stay off: a
 *  school scorer can't call a slider from a curveball, and wrong labels are
 *  worse than none. `init` never applies these: a stored format without the
 *  key — every match made before — keeps what it was scored with (off). */
export const BASEBALL_TRACK_DEFAULTS = { askFielders: true, pitchTypes: false, sprayZones: true, battedBallTypes: true } as const;

/** US batch 5: optional fielder chips after an out is recorded (never a
 *  blocking step). Defaults-on DOU9: under "Stats to track" with the others. */
export const FIELDERS_FIELD: FormatField = { key: 'askFielders', label: 'Ask for fielders (6-3)', type: 'toggle', default: BASEBALL_TRACK_DEFAULTS.askFielders, group: 'Stats to track', hint: 'optional 1–9 chips after an out is recorded — putouts and assists' };

/** Deep wave — the "Stats to track" toggles (live settings + the match format). */
export const TRACK_FIELDS: FormatField[] = [
  // US batch 6 (audit P2 #18): only acts with pitch-by-pitch, so hidden while it is off
  { key: 'pitchTypes', label: 'Pitch types', type: 'toggle', default: BASEBALL_TRACK_DEFAULTS.pitchTypes, group: 'Stats to track', hint: 'A chip row over the pitch pad (FB SL CH … / softball Rise Drop …): tap the type, then the pitch — pitch mix per pitcher. Needs pitch-by-pitch', hideWhen: { key: 'pitches', value: false } },
  { key: 'sprayZones', label: 'Where the ball went (spray)', type: 'toggle', default: BASEBALL_TRACK_DEFAULTS.sprayZones, group: 'Stats to track', hint: 'Optional LF · CF · RF … chips when the ball is put in play — hits and balls in play by zone' },
  { key: 'battedBallTypes', label: 'Batted-ball type', type: 'toggle', default: BASEBALL_TRACK_DEFAULTS.battedBallTypes, group: 'Stats to track', hint: 'Optional Grounder · Liner · Fly ball · Popup chips when the ball is put in play (outs fill it in themselves) — GB / LD / FB % for batters and pitchers' },
];

export const BASEBALL_META: SportMeta = {
  id: 'baseball',
  name: 'Baseball & softball',
  icon: '⚾',
  archetype: 'running-points',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'baseball', onCreate: true,
      options: [
        ...Object.entries(BASEBALL_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'innings', label: 'Innings', type: 'number', default: 9, min: 3, max: 12, advanced: true },
    {
      key: 'mercy', label: 'Run rule (mercy)', type: 'choice', default: '15@5,10@7', advanced: true,
      options: [
        { value: '15@5,10@7', label: '15 after 5, 10 after 7 (WBSC baseball)' },
        { value: '15@3,10@4,7@5', label: '15 after 3, 10 after 4, 7 after 5 (WBSC softball)' },
        { value: '20@3,15@4,10@5', label: '20 after 3, 15 after 4, 10 after 5 (slow pitch)' },
        { value: '10@5', label: '10 after 5' },
        { value: '10@4', label: '10 after 4' },
        { value: '15@3,10@4', label: '15 after 3, 10 after 4' },
        { value: '', label: 'None' },
      ],
      hint: 'a lead this big after that many innings ends the game — check your competition',
    },
    {
      key: 'tiebreak', label: 'Extra innings', type: 'choice', default: 'r12', advanced: true,
      options: [
        { value: 'r12', label: 'Runners on 1st + 2nd (WBSC baseball)' },
        { value: 'r2', label: 'Runner on 2nd (WBSC softball, MLB)' },
        { value: 'none', label: 'Play on, bases empty' },
      ],
    },
    { key: 'tbFrom', label: 'Tie-break from inning', type: 'number', default: 10, min: 2, max: 15, advanced: true },
    { key: 'dh', label: 'Designated hitter', type: 'toggle', default: true, advanced: true },
    { key: 'lineupSize', label: 'Batters in the order', type: 'count', default: 9, min: 9, max: 15, advanced: true, hint: '10 in slow pitch; more for a continuous batting order' },
    { key: 'startCount', label: 'Count starts at', type: 'choice', default: '0-0', options: [{ value: '0-0', label: '0-0' }, { value: '1-1', label: '1-1 (slow pitch)' }], advanced: true },
    { key: 'foulOut', label: 'Foul with two strikes is out', type: 'toggle', default: false, advanced: true, hint: 'slow pitch' },
    { key: 'allowTies', label: 'A tied game may stand', type: 'toggle', default: false, advanced: true, hint: 'time-limited league games; never in a knockout' },
    { key: 'maxInnings', label: 'Stop after inning (0 = play on)', type: 'number', default: 0, min: 0, max: 20, advanced: true },
    { key: 'pitches', label: 'Pitch-by-pitch (balls & strikes)', type: 'toggle', default: true, advanced: true },
    // US batch 5: optional fielder chips after an out is recorded (never a blocking step) — on for
    // new matches; a stored format without the key reads off (readConfig), so old games are unchanged
    { ...FIELDERS_FIELD, advanced: true },
    // deep wave: "Stats to track" (defaults: BASEBALL_TRACK_DEFAULTS)
    ...TRACK_FIELDS.map((f) => ({ ...f, advanced: true })),
  ],
};
