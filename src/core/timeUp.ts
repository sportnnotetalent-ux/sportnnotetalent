/** MVP PD2 — who leads when a racket match stops on time (a court booking ran
 *  out). Pure. Sets (games in badminton / pickleball / squash / TT) first; if
 *  level, the organiser's rule (founder 2026-10-31, a format option): every
 *  game (point) played, finished and current — the default — or only the set
 *  (game) in play. Never the live "40" / "Ad". null = level, or nothing known. */
import type { LineScore } from '../sports/scoreline';
import type { FormatField } from '../sports/types';

export type TimeUpRule = 'games' | 'set';
export const TIME_UP_RULE_KEY = 'timeUpRule';

/** The match's rule from its format; anything unknown is the default. */
export const timeUpRuleOf = (config: Record<string, unknown> | null | undefined): TimeUpRule =>
  config?.[TIME_UP_RULE_KEY] === 'set' ? 'set' : 'games';

/** The organiser's option, for each racket sport with "Time up" (under Customize).
 *  `unit` names the columns: tennis / padel sets of games, the rest games of points. */
export function timeUpRuleField(unit: 'set' | 'game'): FormatField {
  const inner = unit === 'set' ? 'games' : 'points';
  return {
    key: TIME_UP_RULE_KEY, label: `Time up, ${unit}s level`, type: 'choice', default: 'games', advanced: true,
    hint: `If time runs out with the ${unit}s level, who wins`,
    options: [
      { value: 'games', label: `Most ${inner} in the match` },
      { value: 'set', label: `Most ${inner} in the ${unit} in play` },
    ],
  };
}

export function timeUpLeader(ls: LineScore | null | undefined, rule: TimeUpRule = 'games'): 'home' | 'away' | null {
  if (!ls) return null;
  if (ls.won.home !== ls.won.away) return ls.won.home > ls.won.away ? 'home' : 'away';
  const cells = rule === 'set' ? (ls.current ? [ls.current] : []) : ls.current ? [...ls.done, ls.current] : ls.done;
  const h = cells.reduce((n, c) => n + c.home, 0);
  const a = cells.reduce((n, c) => n + c.away, 0);
  return h === a ? null : h > a ? 'home' : 'away';
}
