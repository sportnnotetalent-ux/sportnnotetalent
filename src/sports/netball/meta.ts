/**
 * Perf F-15 — Netball's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

/** defaults-on DOC3 / DOC5 (wave 3, docs/security/breaks/defaults-on-court-team.md):
 *  the one source for netball's "Stats to track" on a NEW match — the format
 *  fields' defaults and the live card's Standard (Reset). Every one is
 *  tap-optional since wave 2 (the play lands on the tap; feeds, rebounds,
 *  gains and turnover types are described after on a "Last play" card), and
 *  wave 1 made "tracked" mean "captured", so a scorer who skips them gets no
 *  zeros. The presets no longer name these keys: a preset sets the format
 *  (periods, minutes), never the stats, so every preset starts with all four
 *  on and picking a preset keeps what the organiser chose. A stored format
 *  without the keys (every older match) keeps them off (init). */
export const NETBALL_STATS_DEFAULTS: Readonly<{ detail: boolean; trackCpr: boolean; trackGains: boolean; trackTurnovers: boolean }> = {
  detail: true, trackCpr: true, trackGains: true, trackTurnovers: true,
};

export const NETBALL_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  international: { label: 'International 4 × 15', set: { periods: 4, periodMinutes: 15 } },
  school: { label: 'School 4 × 10', set: { periods: 4, periodMinutes: 10 } },
  halves: { label: 'Halves 2 × 20', set: { periods: 2, periodMinutes: 20 } },
};

/** Court-team round 2 — the 2-point super-shot rule, an organiser choice
 *  (format key `superShotRule`). 'off' (the default) = the World Netball
 *  rules: the Netball World Cup, the Commonwealth Games and most leagues
 *  score every goal 1. The league presets as each league publishes them
 *  (verify each season): */
export type SuperShotRule = 'off' | 'ssn' | 'nsl' | 'anz' | 'custom';

export interface SuperShotPreset {
  label: string;
  /** what the scorer sees on the arm chip */
  name: string;
  /** where a 2-pointer is taken from (accessibility / hints) */
  zone: string;
  /** the window: the last N minutes of each regular quarter */
  minutes: number;
  /** also all through extra time (and the play-on after it) */
  extraTime: boolean;
}

export const SUPER_SHOT_PRESETS: Record<'ssn' | 'nsl' | 'anz', SuperShotPreset> = {
  // Suncorp Super Netball (Australia, since 2020): the "Super Shot" from the
  // outer 1.9 m of the circle (the super-shot zone), last 5 minutes of each
  // quarter (the "Power 5"), and all of extra time.
  ssn: { label: 'Super Netball (AUS)', name: 'Super shot', zone: 'the super-shot zone', minutes: 5, extraTime: true },
  // Netball Super League (UK, since 2025): two goals from the outer part of
  // the circle, last 5 minutes of each quarter, and all of extra time.
  nsl: { label: 'Super League (UK)', name: 'Super shot', zone: 'the outer circle', minutes: 5, extraTime: true },
  // ANZ Premiership (New Zealand, since 2025): two points for a shot from
  // 3.5 m or further (the FAST5 line), last 5 minutes of each quarter.
  anz: { label: 'ANZ Premiership (NZ)', name: '2-point shot', zone: '3.5 m or further from the post', minutes: 5, extraTime: false },
};

/** The organiser's choices, in the order the format editor shows them. */
export const SUPER_SHOT_RULE_OPTIONS: { value: SuperShotRule; label: string }[] = [
  { value: 'off', label: 'Off (World Netball)' },
  ...(Object.entries(SUPER_SHOT_PRESETS) as [SuperShotRule, SuperShotPreset][]).map(([value, p]) => ({ value, label: p.label })),
  { value: 'custom', label: 'Custom window' },
];

export const NETBALL_META: SportMeta = {
  id: 'netball',
  name: 'Netball',
  icon: '🥅',
  archetype: 'goal-time',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'international', onCreate: true,
      options: [
        ...Object.entries(NETBALL_PRESETS).map(([value, p]) => ({ value, label: p.label, set: p.set })),
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'periods', label: 'Periods', type: 'choice', default: 4, options: [{ value: 4, label: '4 quarters' }, { value: 2, label: '2 halves' }], advanced: true },
    { key: 'periodMinutes', label: 'Minutes per period', type: 'number', default: 15, min: 1, max: 20, advanced: true },
    { key: 'suspensionMinutes', label: 'Suspension (minutes of play)', type: 'number', default: 2, min: 1, max: 10, advanced: true, hint: 'World Netball: 2 — check your competition' },
    { key: 'timeoutsPerHalf', label: 'Team time-outs a half', type: 'count', default: 0, min: 0, max: 3, advanced: true, hint: 'none in the international rules; some leagues allow 2' },
    // Wave 3: every "Stats to track" switch defaults from NETBALL_STATS_DEFAULTS
    // (the live settings' Standard reads the same constant), in every preset.
    { key: 'detail', label: 'Ask for feeds & rebounds', type: 'toggle', default: NETBALL_STATS_DEFAULTS.detail, advanced: true, group: 'Stats to track', hint: 'goal assists, feeds and rebounds (optional, after the goal or miss is on the board)' },
    { key: 'trackCpr', label: 'Track centre pass receives', type: 'toggle', default: NETBALL_STATS_DEFAULTS.trackCpr, advanced: true, group: 'Stats to track', hint: 'who caught each centre pass (one tap, optional)' },
    { key: 'trackGains', label: 'Track gains & pick-ups', type: 'toggle', default: NETBALL_STATS_DEFAULTS.trackGains, advanced: true, group: 'Stats to track', hint: 'deflection with / without gain, pick-ups — gains and gain-to-goal % (optional)' },
    { key: 'trackTurnovers', label: 'Track turnover types', type: 'toggle', default: NETBALL_STATS_DEFAULTS.trackTurnovers, advanced: true, group: 'Stats to track', hint: 'bad pass, footwork, held ball, offside… (optional)' },
    // Deep wave — the 2-point super shot, an organiser rule, off by default.
    // Round 2: the league presets (engine SUPER_SHOT_PRESETS) or a custom window.
    // An older format's plain `superShot` toggle still replays (superShotConfig).
    {
      key: 'superShotRule', label: '2-point super shots', type: 'choice', default: 'off', advanced: true, options: SUPER_SHOT_RULE_OPTIONS,
      hint: 'Off in the World Netball rules · Super Netball & UK Super League: 2 from the outer circle, last 5 min of each quarter + extra time · ANZ Premiership: 2 from 3.5 m+, last 5 min of each quarter',
    },
    { key: 'ssMinutes', label: 'Custom super-shot window (last N min of a quarter)', type: 'number', default: 5, min: 0, max: 15, advanced: true, hint: 'Custom window only · 0 = the whole quarter' },
    { key: 'ssExtraTime', label: 'Custom: super shots all through extra time', type: 'toggle', default: false, advanced: true, hint: 'Custom window only' },
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Draw stands (league)' },
        { value: 'et', label: 'Extra time, then play on (World Netball)' },
      ],
      hint: 'a knockout match needs a winner',
    },
    { key: 'etMinutes', label: 'Extra time halves (min)', type: 'choice', default: 7, options: [{ value: 7, label: '2 × 7 (World Netball)' }, { value: 5, label: '2 × 5' }], advanced: true },
    { key: 'etThen', label: 'Still level after extra time', type: 'choice', default: 'twoGoal', options: [{ value: 'twoGoal', label: 'Play on to a 2-goal lead (World Netball)' }, { value: 'golden', label: 'Golden goal' }], advanced: true },
  ],
};
