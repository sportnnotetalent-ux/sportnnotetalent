/**
 * Perf F-15 — Basketball's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

/** Court-team round 2 — the "Stats to track" standards for a NEW match: the
 *  format editor's defaults and the live settings' "Standard". The shot-zone
 *  buttons (+2 Paint · +2 Mid · +3 Corner · +3 Top; 3×3: +1 / +2) are the
 *  default scoring layout (founder 2026-10-22); switched off, the plain
 *  +2 / +3 row comes back. Batch 3 (founder 2026-11-02, only what is captured
 *  in scoring reaches the stats): missed shots are on for a new match too
 *  (FG%, 3P%, EFF; a miss is one tap, like a make). Defaults-on wave 3
 *  (docs/security/breaks/defaults-on-us.md): fast breaks and fouls drawn are
 *  on too — both are optional chips on a card that never blocks the next play,
 *  and nothing reads as tracked until one is tagged (no false zeros).
 *  `init` never applies these: a stored config without the key — every
 *  match made before — keeps what it was scored with. */
export const BB_TRACK_DEFAULTS = { trackMisses: true, trackZones: true, trackFastBreak: true, trackFoulsDrawn: true } as const;

export const BASKETBALL_META: SportMeta = {
  id: 'basketball',
  name: 'Basketball',
  icon: '🏀',
  archetype: 'running-points',
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'fiba',
      options: [
        { value: 'fiba', label: 'FIBA (4×10)', set: { possArrow: true, nbaBonus: false, playersPerSide: 5, substitutes: 5, regPeriods: 4, periodMinutes: 10, foulsToFoulOut: 5, foulsForBonus: 4, techIsTeamFoul: true, otFoulsCarry: true, offTeamFoul: true, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 5, timeoutRule: 'fiba', gameClock: true, otTarget: 0, foulLadder: 'fiba' } },
        { value: 'nba', label: 'NBA (4×12)', set: { possArrow: false, nbaBonus: true, playersPerSide: 5, substitutes: 5, regPeriods: 4, periodMinutes: 12, foulsToFoulOut: 6, foulsForBonus: 4, techIsTeamFoul: false, otFoulsCarry: false, offTeamFoul: false, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 7, timeoutRule: 'nba', gameClock: true, otTarget: 0, foulLadder: 'fiba' } },
        { value: 'ncaa', label: 'NCAA (2×20 halves)', set: { possArrow: true, nbaBonus: false, playersPerSide: 5, substitutes: 7, regPeriods: 2, periodMinutes: 20, foulsToFoulOut: 5, foulsForBonus: 6, techIsTeamFoul: true, otFoulsCarry: true, offTeamFoul: true, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 30, timeouts: 4, timeoutRule: 'game', gameClock: true, otTarget: 0, foulLadder: 'fiba' } },
        { value: '3x3', label: '3×3 (first to 21)', set: { possArrow: false, nbaBonus: false, playersPerSide: 3, substitutes: 1, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 6, techIsTeamFoul: true, otFoulsCarry: true, offTeamFoul: true, overtimeMinutes: 0, targetPoints: 21, winBy: 1, shotClock: 12, timeouts: 1, timeoutRule: 'game', gameClock: true, otTarget: 2, foulLadder: '3x3' } },
        { value: '2v2', label: '2v2 (first to 15)', set: { possArrow: false, nbaBonus: false, playersPerSide: 2, substitutes: 1, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 7, techIsTeamFoul: true, otFoulsCarry: true, offTeamFoul: true, overtimeMinutes: 0, targetPoints: 15, winBy: 2, shotClock: 0, timeouts: 0, timeoutRule: 'game', gameClock: false, otTarget: 0, foulLadder: 'fiba' } },
        { value: '1v1', label: '1v1 (first to 11)', set: { possArrow: false, nbaBonus: false, playersPerSide: 1, substitutes: 0, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 0, overtimeMinutes: 0, targetPoints: 11, winBy: 2, shotClock: 0, timeouts: 0, timeoutRule: 'game', gameClock: false, otTarget: 0, foulLadder: 'fiba' } },
        { value: 'school', label: 'School (4×8)', set: { possArrow: true, nbaBonus: false, playersPerSide: 5, substitutes: 7, regPeriods: 4, periodMinutes: 8, foulsToFoulOut: 5, foulsForBonus: 4, techIsTeamFoul: true, otFoulsCarry: true, offTeamFoul: true, overtimeMinutes: 4, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 4, timeoutRule: 'fiba', gameClock: true, otTarget: 0, foulLadder: 'fiba' } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 5, min: 1, max: 11, hint: '5 standard · 3 for 3×3' },
    {
      key: 'regPeriods', label: 'Period structure', type: 'choice', default: 4,
      options: [
        { value: 4, label: '4 quarters' },
        { value: 2, label: '2 halves' },
        { value: 1, label: 'Single period (3×3)' },
      ],
    },
    { key: 'periodMinutes', label: 'Minutes per period', type: 'number', default: 10, min: 1, max: 24 },
    { key: 'targetPoints', label: 'First-to-N points', type: 'number', default: 0, min: 0, max: 50, advanced: true, hint: '0 = timed game · 21 for 3×3/streetball' },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 5, min: 0, max: 11, advanced: true },
    { key: 'foulsToFoulOut', label: 'Fouls to foul out', type: 'number', default: 5, min: 0, max: 10, advanced: true, hint: '0 = no foul-out (3×3)' },
    // SD-05: the number of team fouls AFTER which the opponent shoots — FIBA/NBA 4
    // (free throws from the 5th). Old matches stored 5 and keep their behaviour.
    { key: 'foulsForBonus', label: 'Team fouls before free throws', type: 'number', default: 4, min: 1, max: 10, advanced: true, hint: 'FIBA 4: free throws from the 5th team foul in a quarter' },
    { key: 'techIsTeamFoul', label: 'Technical fouls count as team fouls', type: 'toggle', default: true, advanced: true, hint: 'FIBA yes · NBA no' },
    // US batch 5: NBA doesn't count an offensive foul as a team foul (old formats: absent = counted)
    { key: 'offTeamFoul', label: 'Offensive fouls count as team fouls', type: 'toggle', default: true, advanced: true, hint: 'FIBA yes · NBA no' },
    // US batch 6: NBA's penalty rules (last 2 minutes: the 2nd foul; overtime quota 3); absent = the plain count
    { key: 'nbaBonus', label: 'NBA bonus rules (last 2 minutes, overtime)', type: 'toggle', default: false, advanced: true, hint: 'NBA: one free team foul in the last 2:00 of a period, then free throws; overtime from the 4th foul' },
    // US batch 6: FIBA's alternating-possession arrow (held balls, period starts); NBA jumps every held ball
    { key: 'possArrow', label: 'Alternating-possession arrow', type: 'toggle', default: true, advanced: true, hint: 'FIBA / NCAA: held balls and period starts go by the arrow · NBA / 3×3: off' },
    { key: 'otFoulsCarry', label: 'Overtime team fouls carry over from the last quarter', type: 'toggle', default: true, advanced: true, hint: 'FIBA yes · NBA resets' },
    { key: 'overtimeMinutes', label: 'Overtime length (min)', type: 'number', default: 5, min: 1, max: 10, advanced: true, hint: 'played when tied after regulation; repeats until decided' },
    { key: 'trackMisses', label: 'Track missed shots', type: 'toggle', default: BB_TRACK_DEFAULTS.trackMisses, group: 'Stats to track', hint: 'Miss 2 / Miss 3 buttons — FG%, 3P% and full EFF' },
    // Deep wave — "Stats to track" (the scorer can also switch them in ⚙️ Scoring settings).
    // Round 2: the shot-zone buttons are the default layout for a new match and
    // shown without Customize, so switching back to plain +2 / +3 is one tap.
    { key: 'trackZones', label: 'Shot-zone scoring buttons', type: 'toggle', default: BB_TRACK_DEFAULTS.trackZones, group: 'Stats to track', hint: 'On (standard): +2 Paint · +2 Mid · +3 Corner · +3 Top — shot chart, points in the paint · Off: plain +2 / +3' },
    { key: 'trackFastBreak', label: 'Tag fast-break points', type: 'toggle', default: BB_TRACK_DEFAULTS.trackFastBreak, advanced: true, group: 'Stats to track', hint: '⚡ Fast break after a basket (and-one free throw included)' },
    { key: 'trackFoulsDrawn', label: 'Track fouls drawn', type: 'toggle', default: BB_TRACK_DEFAULTS.trackFoulsDrawn, advanced: true, group: 'Stats to track', hint: 'who was fouled (FD in the box score)' },
    // SD-132: the stoppable game clock (start / stop on whistles, set time)
    { key: 'gameClock', label: 'Game clock', type: 'toggle', default: true, hint: 'a countdown each period — exact minutes, +/- and timeout limits' },
    // MVP B2: a lone scorer forgets to restart a clock that stops on every whistle
    {
      key: 'clockMode', label: 'Clock stops on', type: 'choice', default: 'run', tournamentDefault: 'stop',
      hideWhen: { key: 'gameClock', value: false },
      options: [
        { value: 'run', label: 'Time-outs only (running clock)' },
        { value: 'stop', label: 'Every whistle (fouls, late baskets)' },
      ],
    },
    { key: 'otTarget', label: 'Overtime: first to N points', type: 'number', default: 0, min: 0, max: 5, advanced: true, hint: '0 = timed overtime · 3×3: 2' },
    {
      key: 'foulLadder', label: 'Team-foul penalties', type: 'choice', default: 'fiba', advanced: true,
      options: [
        { value: 'fiba', label: '5×5: free throws from the bonus' },
        { value: '3x3', label: '3×3: 7–9 → 2 FTs · 10+ → 2 FTs + ball' },
      ],
    },
    { key: 'shotClock', label: 'Shot clock (sec)', type: 'number', default: 24, min: 0, max: 35, advanced: true, hint: 'shown for reference' },
    {
      key: 'timeoutRule', label: 'Timeouts', type: 'choice', default: 'fiba', advanced: true,
      options: [
        { value: 'fiba', label: 'FIBA: 2 first half · 3 second half · 1 per OT' },
        { value: 'nba', label: 'NBA: 7 per game · 2 per OT' },
        { value: 'game', label: 'A set number per game' },
      ],
      hint: 'FIBA: at most 2 in the last 2 minutes; unused timeouts don’t carry over',
    },
    { key: 'timeouts', label: 'Timeouts per team (per game)', type: 'number', default: 0, min: 0, max: 9, advanced: true, hint: 'used when Timeouts = a set number per game · 0 = don’t track · 3×3: 1' },
    // SD-57: basketball never ends level unless the organiser's format says so
    { key: 'allowDraw', label: 'Allow a draw (league / friendly)', type: 'toggle', default: false, hint: 'Off: a level game goes to overtime' },
  ],
};
