/** Tournament page, Stitch picks 7–8 (docs/security/breaks/stitch-tournament-page.md):
 *  the count strip under the title and the small standings card at the top of
 *  Matches. Pure. */

const plural = (n: number, word: string) => `${n} ${n === 1 ? word.replace(/s$/, '') : word}`;

/** TP1/TP2: "23 Fixtures · 4 Sports · 8 Teams" — zeros left out, one sport not said. */
export function countStrip(o: { fixtures: number; sports: number; teams: number; fixturesWord: string; teamsWord?: string }): string[] {
  const out: string[] = [];
  if (o.fixtures > 0) out.push(plural(o.fixtures, o.fixturesWord));
  if (o.sports > 1) out.push(plural(o.sports, 'Sports'));
  if (o.teams > 0) out.push(plural(o.teams, o.teamsWord ?? 'Teams'));
  return out;
}

export interface MiniRow { teamId: string; rank: number; name: string; color?: string; cells: number[]; pts: number; q: boolean }
export interface MiniTable { kind: 'table' | 'medal'; head: string[]; rows: MiniRow[]; more: boolean }

type TableRow = { teamId: string; name: string; colorHex?: string; played: number; won: number; drawn: number; lost: number; points: number };
type MedalRow = { teamId: string; name: string; colorHex?: string; total: number; golds: number; silvers: number; bronzes: number };

/** TP3–TP5: the top 4 of a real table, or null when there's nothing to show. */
export function miniStandings(o: { rows?: TableRow[]; medal?: MedalRow[]; marks?: ReadonlyMap<string, string>; top?: number }): MiniTable | null {
  const top = o.top ?? 4;
  if (o.medal && o.medal.length && o.medal.some((r) => r.total > 0 || r.golds + r.silvers + r.bronzes > 0)) {
    return {
      kind: 'medal', head: ['🥇', '🥈', '🥉', 'Pts'], more: o.medal.length > top,
      rows: o.medal.slice(0, top).map((r, i) => ({ teamId: r.teamId, rank: i + 1, name: r.name, color: r.colorHex, cells: [r.golds, r.silvers, r.bronzes], pts: r.total, q: false })),
    };
  }
  const rows = o.rows ?? [];
  if (!rows.some((r) => r.played > 0)) return null;
  return {
    kind: 'table', head: ['P', 'W', 'D', 'L', 'Pts'], more: rows.length > top,
    rows: rows.slice(0, top).map((r, i) => ({
      teamId: r.teamId, rank: i + 1, name: r.name, color: r.colorHex, cells: [r.played, r.won, r.drawn, r.lost], pts: r.points,
      q: o.marks?.get(r.teamId) === 'qualified',
    })),
  };
}
