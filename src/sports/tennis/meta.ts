/**
 * Perf F-15 — Tennis's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';
import { trackFormatFields } from '../pointDetailSettings.ts';

export const TENNIS_META: SportMeta = {
  id: 'tennis',
  name: 'Tennis',
  icon: '🎾',
  archetype: 'set-game-point',
  participantKind: 'both', // Singles = individual, Doubles = a pair,
  retireTerms: true,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'bo3',
      options: [
        { value: 'bo3', label: 'Best of 3 sets', set: { setsToWin: 2, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        // MVP T2: the club format — two sets, then a 10-point match tiebreak (advantage games)
        { value: 'two_sets_mtb', label: '2 sets + match tiebreak (3rd to 10)', set: { setsToWin: 2, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 10, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        { value: 'one_set', label: 'One set', set: { setsToWin: 1, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        { value: 'short4', label: 'Short sets (to 4, best of 3)', set: { setsToWin: 2, gamesPerSet: 4, setWinByTwo: true, tiebreakAt: 4, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        { value: 'fast4', label: 'Fast4', set: { setsToWin: 2, gamesPerSet: 4, setWinByTwo: false, tiebreakAt: 3, setTiebreak: true, tiebreakPoints: 5, noAd: true, finalSetTiebreak: 0, finalSetTBAt: 0, tbSuddenDeathAt: 4 } },
        { value: 'proset', label: 'Pro set (to 8)', set: { setsToWin: 1, gamesPerSet: 8, setWinByTwo: true, tiebreakAt: 8, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        // SD-135 (TN-a) — the ITF / ATP / WTA doubles format (ITF Rules of
        // Tennis, Appendix V): no-ad games, two tiebreak sets, and a 10-point
        // match tiebreak in place of the 3rd set.
        { value: 'itf_dbl', label: 'Doubles (no-ad · match TB to 10 for the 3rd set)', set: { setsToWin: 2, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: true, finalSetTiebreak: 10, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        { value: 'match_tb', label: 'Match tiebreak only (first to 10)', set: { setsToWin: 1, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: true, finalSetTiebreak: 10, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        { value: 'bo5', label: 'Best of 5 sets', set: { setsToWin: 3, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 0, tbSuddenDeathAt: 0 } },
        // SD-02: a Slam plays the 5th set in games and a 10-point tiebreak at 6-6
        // (since 2022). Matches already created with the old gs5 stored
        // finalSetTiebreak: 10 in their own format, so they keep their rules.
        { value: 'gs5', label: 'Grand Slam (Bo5, 10-pt TB at 6-6 in set 5)', set: { setsToWin: 3, gamesPerSet: 6, setWinByTwo: true, tiebreakAt: 6, setTiebreak: true, tiebreakPoints: 7, noAd: false, finalSetTiebreak: 0, finalSetTBAt: 6, tbSuddenDeathAt: 0 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 1,
      options: [
        { value: 1, label: 'Singles' },
        { value: 2, label: 'Doubles' },
      ],
    },
    {
      key: 'setsToWin', label: 'Match length', type: 'choice', default: 2, advanced: true,
      options: [
        { value: 2, label: 'Best of 3' },
        { value: 3, label: 'Best of 5' },
        // MVP PD1 (tennis too): one set is a set — the deciding-set tiebreaks clear
        { value: 1, label: 'Single set', set: { finalSetTiebreak: 0, finalSetTBAt: 0 } },
      ],
    },
    {
      key: 'gamesPerSet', label: 'Games per set', type: 'choice', default: 6, advanced: true,
      options: [
        // MVP T1 — the tiebreak moves with the games: 4-4, 6-6 or 8-8, to 7, win by 2.
        { value: 6, label: '6 (standard)', set: { tiebreakAt: 6, setWinByTwo: true, tiebreakPoints: 7, tbSuddenDeathAt: 0 } },
        { value: 4, label: '4 (short)', set: { tiebreakAt: 4, setWinByTwo: true, tiebreakPoints: 7, tbSuddenDeathAt: 0 } },
        { value: 8, label: '8 (pro set)', set: { tiebreakAt: 8, setWinByTwo: true, tiebreakPoints: 7, tbSuddenDeathAt: 0 } },
      ],
    },
    {
      key: 'noAd', label: 'At deuce', type: 'choice', default: false,
      options: [
        { value: false, label: 'Advantage (classic)' },
        { value: true, label: 'No-ad (deciding point)' },
      ],
    },
    { key: 'setTiebreak', label: 'Set tiebreak at N-N', type: 'toggle', default: true, advanced: true, hint: 'off = advantage set (win by 2)' },
    {
      // SD-115 — ITF Fast4: the tiebreak (to 5) is sudden death at 4-4.
      key: 'tbSuddenDeathAt', label: 'Set tiebreak at the end', type: 'choice', default: 0, advanced: true,
      options: [
        { value: 0, label: 'Win by 2' },
        { value: 4, label: 'Sudden death at 4-4 (Fast4)' },
      ],
    },
    {
      key: 'finalSetTiebreak', label: 'Deciding set', type: 'choice', default: 0, advanced: true,
      hideWhen: { key: 'setsToWin', value: 1 },
      options: [
        { value: 0, label: 'Full set' },
        { value: 10, label: '10-point match tiebreak' },
      ],
    },
    {
      key: 'finalSetTBAt', label: 'Deciding-set tiebreak', type: 'choice', default: 0, advanced: true,
      hideWhen: { key: 'setsToWin', value: 1 },
      hint: 'when the deciding set is a full set',
      options: [
        { value: 0, label: 'Same as other sets' },
        { value: 6, label: '10-point at 6-6 (Grand Slam)' },
      ],
    },
    // racket round 2 — "Stats to track", the serve-speed unit (km/h / mph) and
    // the rally-length buckets as advanced format fields (an organiser's
    // default for every match of the format; the scorer can still change them)
    ...trackFormatFields('tennis'),
  ],
};
