/**
 * Perf F-15 — Chess's light metadata: what lists, pickers and forms
 * need (name, icon, who competes, the format options) without the scoring
 * engine or the scorer UI, which load on demand (see ../registry.ts).
 * PURE (no React Native): the sport list is in the first download.
 */
import type { SportMeta } from '../types';

export const CHESS_META: SportMeta = {
  id: 'chess',
  name: 'Chess',
  icon: '♟️',
  archetype: 'result',
  participantKind: 'individual',
  formatFields: [
    {
      key: 'timeControl', label: 'Time control', type: 'choice', default: 'rapid',
      hint: 'for the record — the clock is on the board',
      options: [
        { value: 'classical', label: 'Classical (60+ min)' },
        { value: 'rapid', label: 'Rapid (10–60 min)' },
        { value: 'blitz', label: 'Blitz (3–10 min)' },
        { value: 'bullet', label: 'Bullet (< 3 min)' },
        { value: 'untimed', label: 'Untimed' },
      ],
    },
    // SD-67 — the exact time control, FIDE style (base + increment): 90+30
    { key: 'tcBase', label: 'Clock: minutes each', type: 'number', default: 0, min: 0, max: 600, advanced: true,
      hint: 'optional — e.g. 90 for 90+30; 0 = not set' },
    { key: 'tcInc', label: 'Clock: seconds added per move', type: 'number', default: 0, min: 0, max: 600, advanced: true,
      hint: 'the increment — e.g. 30 for 90+30' },
    // SD-121 — knockout tie-breaks (FIDE World Cup style): used only in knockout
    // matches; a level match goes on to rapid, then blitz pairs, then Armageddon.
    { key: 'koGames', label: 'Knockout: games per match', type: 'number', default: 1, min: 1, max: 12, advanced: true,
      hint: 'e.g. 2 for a 2-game mini-match; level after these → tie-breaks' },
    { key: 'koRapidPairs', label: 'Knockout: rapid tie-break pairs', type: 'number', default: 1, min: 0, max: 4, advanced: true,
      hint: '2 games each, then blitz' },
    { key: 'koBlitzPairs', label: 'Knockout: blitz tie-break pairs', type: 'number', default: 1, min: 0, max: 4, advanced: true,
      hint: '2 games each; still level → one Armageddon game (a draw = Black goes through)' },
    // Deep wave — the organiser can switch the move list on for every game
    { key: 'trackMoves', label: 'Track the move list', type: 'toggle', default: false, advanced: true, group: 'Stats to track', hint: 'scorers type each move (or paste the PGN)' },
    { key: 'trackClock', label: 'Track the clock after each move', type: 'toggle', default: false, advanced: true, group: 'Stats to track' },
  ],
};
