/**
 * Timed races round 2 — follower alerts for HEAT WINS and PERSONAL BESTS (the
 * founder: yes; until now only finals and records pushed).
 *
 * When a round is closed or a final locked, the app leaves the round's
 * highlights on the field_events row (`format.highlights`, next to the final's
 * podium in `format.alert`); the notify-followers edge function reads them when
 * the row turns 'completed' (the existing field_event_status_notify trigger —
 * no migration) and pushes each follower ONE message about the athletes they
 * follow, respecting each follow's alert choices:
 *   - a heat won → the "Result" switch: "🏁 Asha Rao won Heat 2 — U14 Girls 100 m";
 *   - a PB       → the "big moments" (scores) switch: "📈 PB for Asha Rao — …".
 * Who hears it: followers of the athlete (a relay's / crew's members for a
 * team's heat win) — not team / tournament followers, who keep the one final
 * push per event (a meet has hundreds of heats).
 *
 * Same shape as supabase/functions/_shared/resultHighlights.ts (the function
 * validates it, checks every id against the event's entries and takes names
 * from the database). Pure.
 */
import type { DisciplineDef, PhaseFormat, RankedEntry, ResultFlag } from './model.ts';
import { heatWinnerIds } from './heatWins.ts';
import { heatName, isTimedRaceSport } from './raceDepth.ts';

export interface Highlight {
  /** 'heat' = won a heat / semi-final / repechage / a timed final's heat; 'pb' = a personal best (not a heat winner) */
  kind: 'heat' | 'pb';
  /** an individual (players.id) */
  playerId?: string;
  /** a relay / crew (teams.id) and its members — the members' followers hear it */
  teamId?: string;
  memberIds?: string[];
  name: string;
  /** "13.42", "1:58.40", "5.42 m" */
  mark?: string;
  /** "Heat 2", "Semi-final 1", "Final, heat 3" */
  heat?: string;
  /** a heat winner who also set a PB */
  pb?: boolean;
}

/** Stored on field_events.format.highlights when a round closes / a final locks. */
export interface ResultHighlights { v: 1; event?: string; items: Highlight[] }

/** Sports whose rounds have heat wins (cycling counts race wins; its heats are solo or pairs). */
const HEAT_SPORTS = ['athletics', 'swimming', 'rowing', 'canoe'];

const markOf = (r: RankedEntry, def: Pick<DisciplineDef, 'unit'>): string | undefined =>
  r.bestText ? `${r.bestText}${def.unit === 'distance' || def.unit === 'height' ? ' m' : ''}` : undefined;

/**
 * A closed round's / locked final's highlights, or null (nothing to tell, not
 * a timed-race sport, a combined event). `rows` = the whole phase as the lock
 * ranks it (per heat for a round, across the heats for a final); `flags` = the
 * PB / SB / record flags the official saw, per entry id (the screen's — an
 * unconfirmed out-of-range mark has none). In a FINAL the gold medallists are
 * left out: their own medal push names them (and says PB — finalAlert).
 */
export function raceHighlights(
  f: Pick<PhaseFormat, 'phase' | 'heats' | 'discipline' | 'phaseNo' | 'eventTitle'> & Partial<Pick<PhaseFormat, 'races' | 'combined'>>,
  def: Pick<DisciplineDef, 'sport' | 'capture' | 'unit'>,
  rows: RankedEntry[],
  o: { final: boolean; flags?: Map<string, ResultFlag[]> },
): ResultHighlights | null {
  if (!isTimedRaceSport(def.sport) || f.combined) return null;
  const golds = o.final ? new Set(rows.filter((r) => r.position === 1).map((r) => r.id)) : new Set<string>();
  const won = def.capture === 'single' && HEAT_SPORTS.includes(def.sport) ? heatWinnerIds(f, rows) : new Set<string>();
  const pbOf = (r: RankedEntry) => !!r.entry.athleteId && r.status === 'ok' && (o.flags?.get(r.id) ?? r.flags).includes('PB');
  const items: Highlight[] = [];
  for (const r of rows) {
    if (golds.has(r.id)) continue;
    const heatWin = won.has(r.id);
    const pb = pbOf(r);
    if (!heatWin && !pb) continue;
    const e = r.entry;
    const members = e.athleteId ? [] : [...new Set((e.result.members ?? []).map((m) => m.playerId).filter((x): x is string => !!x))];
    if (!e.athleteId && !members.length) continue; // nobody to tell
    items.push({
      kind: heatWin ? 'heat' : 'pb',
      ...(e.athleteId ? { playerId: e.athleteId } : { ...(e.team?.id ? { teamId: e.team.id } : {}), memberIds: members }),
      name: e.name,
      ...(markOf(r, def) ? { mark: markOf(r, def) } : {}),
      // a single heat / final reads as the round ("Semi-final"); a timed final's heat as "Final, heat 2"
      ...(heatWin || f.heats > 1 ? { heat: heatName({ ...f, races: f.races }, e.heat) } : {}),
      ...(heatWin && pb ? { pb: true } : {}),
    });
  }
  return items.length ? { v: 1, ...(f.eventTitle ? { event: f.eventTitle } : {}), items } : null;
}

/** The gold medallists of a final who set a PB (their medal push says so). */
export function goldPbIds(rows: RankedEntry[], flags?: Map<string, ResultFlag[]>): Set<string> {
  return new Set(rows.filter((r) => r.position === 1 && !!r.entry.athleteId && (flags?.get(r.id) ?? r.flags).includes('PB')).map((r) => r.entry.athleteId as string));
}
