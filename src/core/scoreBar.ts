/** The shared score bar (UI audit step 1, docs/security/breaks/score-bar.md):
 *  one score strip for every sport above the scoring controls, with the side
 *  or player in play highlighted. Pure. */

export type Side = 'home' | 'away';
/** Who is in play right now — supplied by a sport's `inPlay` (null = can't tell). */
export interface InPlay {
  side: Side; playerId?: string | null; verb: string;
  /** something due now, shown on the bar (UI audit #25): "MATCH POINT" for a side, "Added time due" */
  due?: { side?: Side; text: string } | null;
}
export interface BarRow { side: Side; name: string; score: string; active: boolean; who: string | null }

const isSide = (v: unknown): v is Side => v === 'home' || v === 'away';

/** "Rohan Nair at the table", else the side ("Green serving") when the player
 *  isn't known (SB2); null when nothing is in play (SB3). */
export function inPlayText(p: InPlay | null | undefined, names: Record<Side, string>, nameOf: (id: string) => string | undefined): string | null {
  if (!p || !isSide(p.side) || !p.verb) return null;
  const who = (p.playerId && nameOf(p.playerId)) || names[p.side];
  return `${who} ${p.verb}`;
}

export function scoreBarRows(
  summary: { homeScore: string; awayScore: string },
  names: Record<Side, string>,
  p: InPlay | null | undefined,
  nameOf: (id: string) => string | undefined,
): BarRow[] {
  const text = inPlayText(p, names, nameOf);
  // on the row itself the side's name is already there: no player → just the verb ("Serving")
  const player = p?.playerId ? nameOf(p.playerId) : undefined;
  const short = text ? (player ? text : p!.verb.charAt(0).toUpperCase() + p!.verb.slice(1)) : null;
  return (['home', 'away'] as const).map((side) => ({
    side, name: names[side], score: side === 'home' ? summary.homeScore : summary.awayScore,
    active: !!text && p!.side === side, who: short && p!.side === side ? short : null,
  }));
}

/** The due-now note, with the side's name when it belongs to one ("MATCH POINT · Red House"). */
export function dueText(p: InPlay | null | undefined, names: Record<Side, string>): string | null {
  const d = p?.due;
  if (!d || typeof d.text !== 'string' || !d.text.trim()) return null;
  return isSide(d.side) ? `${d.text} · ${names[d.side]}` : d.text;
}

/** Which side's score text changed (SB6) — the bar flashes that row. */
export function changedSide(prev: Record<Side, string> | null, next: Record<Side, string>): Side | null {
  if (!prev) return null;
  if (prev.home !== next.home) return 'home';
  if (prev.away !== next.away) return 'away';
  return null;
}

/** The last thing scored, from the undo label ("Undo: red · break 1" → "red · break 1"). */
export const lastAction = (undo: string | null | undefined): string | null => {
  const t = (undo ?? '').replace(/^\s*Undo:\s*/i, '').trim();
  return t || null;
};
