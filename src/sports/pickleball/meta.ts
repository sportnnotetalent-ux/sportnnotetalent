/**
 * Perf F-15 — Pickleball's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { FormatField, SportMeta } from '../types';
import { PAIR_TYPE_FIELD } from '../pairType.ts';
import { trackFormatFields } from '../pointDetailSettings.ts';
import { timeUpRuleField } from '../../core/timeUp.ts';

/** The sport's own format options (makeRallyPlugin adds the shared "Stats to
 *  track" defaults after them, exactly as `formatFields` below does). */
export const PICKLEBALL_FORMAT_FIELDS: FormatField[] = [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'rec11', tournamentDefault: 'traditional',
      // SD-06 / D4: the old rally "Tournament (best of 5)" preset (value
      // 'tournament') is gone — a stored format keeps its own scoring keys, so
      // matches made with it still play rally. 'traditional' keeps its value
      // (it was already side-out best of 3 to 11) and is now the Tournament preset.
      options: [
        { value: 'traditional', label: 'Tournament (side-out · best of 3 to 11)', set: { scoring: 'sideout', pointsPerGame: 11, winBy: 2, gamesToWin: 2 } },
        { value: 'sideout15', label: 'Tournament (side-out · 1 game to 15)', set: { scoring: 'sideout', pointsPerGame: 15, winBy: 2, gamesToWin: 1 } },
        { value: 'sideout21', label: 'Tournament (side-out · 1 game to 21)', set: { scoring: 'sideout', pointsPerGame: 21, winBy: 2, gamesToWin: 1 } },
        { value: 'medal', label: 'Medal match (side-out · best of 5 to 11)', set: { scoring: 'sideout', pointsPerGame: 11, winBy: 2, gamesToWin: 3 } },
        // SD-117c — a rally-scored game to 21 (MLP's game length / the
        // DreamBreaker), named for what it plays: MLP's "freeze" at 20 (PB-09)
        // and the DreamBreaker rotation aren't tracked yet, so it isn't called
        // "MLP". The value stays 'dreambreaker' (stored formats keep working).
        { value: 'dreambreaker', label: 'Rally to 21 (1 game)', set: { scoring: 'rally', pointsPerGame: 21, winBy: 2, gamesToWin: 1 } },
        // MVP PB1: the common rec game — ONE game to 11 — is the friendly default.
        { value: 'rec11', label: 'Rally · 1 game to 11', set: { scoring: 'rally', pointsPerGame: 11, winBy: 2, gamesToWin: 1 } },
        { value: 'sideout11', label: 'Side-out · 1 game to 11', set: { scoring: 'sideout', pointsPerGame: 11, winBy: 2, gamesToWin: 1 } },
        { value: 'rec', label: 'Rally · best of 3 to 11', set: { scoring: 'rally', pointsPerGame: 11, winBy: 2, gamesToWin: 2 } },
        // USAP 2026 15.C.2.b: rally scoring is a sanctioned (provisional) tournament
        // format — plain "Rally" labels, values kept (pickleball-usap-2026.md PU-7)
        { value: 'rally15', label: 'Rally · best of 3 to 15', set: { scoring: 'rally', pointsPerGame: 15, winBy: 2, gamesToWin: 2 } },
        { value: 'rec1', label: 'Rally · best of 3 to 11 · win by 1', set: { scoring: 'rally', pointsPerGame: 11, winBy: 1, gamesToWin: 2 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    {
      key: 'playersPerSide', label: 'Players', type: 'choice', default: 2,
      options: [
        { value: 2, label: 'Doubles' },
        { value: 1, label: 'Singles' },
      ],
    },
    // doubles pair type (doubles-picker DP8): Open / Men's / Women's / Mixed, doubles only
    PAIR_TYPE_FIELD,
    {
      key: 'scoring', label: 'Scoring', type: 'choice', default: 'rally',
      hint: 'how points are won',
      options: [
        { value: 'sideout', label: 'Side-out (tournament)' },
        { value: 'rally', label: 'Rally (every rally scores)' },
      ],
    },
    {
      key: 'pointsPerGame', label: 'Points to win', type: 'choice', default: 11, advanced: true,
      options: [
        { value: 11, label: '11' },
        { value: 15, label: '15' },
        { value: 21, label: '21' },
      ],
    },
    {
      key: 'winBy', label: 'Win by', type: 'choice', default: 2, advanced: true,
      hint: '2 is standard; 1 is a casual hard cap',
      options: [
        { value: 2, label: 'Win by 2' },
        { value: 1, label: 'Win by 1' },
      ],
    },
    {
      key: 'gamesToWin', label: 'Match length', type: 'choice', default: 2, // MVP PB1: shown without Customize
      options: [
        { value: 2, label: 'Best of 3' },
        { value: 3, label: 'Best of 5' },
        { value: 1, label: 'Single game' },
      ],
    },
  ];

export const PICKLEBALL_META: SportMeta = {
  id: 'pickleball',
  name: 'Pickleball',
  icon: '🥒',
  // as makeRallyPlugin (../rallyCore.tsx) builds the plugin
  archetype: 'set-game-point',
  participantKind: 'both', // Singles = individual, Doubles = a pair
  retireTerms: true,
  formatFields: [...PICKLEBALL_FORMAT_FIELDS, timeUpRuleField('game'), ...trackFormatFields('pickleball')],
};
