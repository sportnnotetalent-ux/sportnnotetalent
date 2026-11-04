/**
 * Doubles in snooker and English billiards (founder 2026-11-06,
 * docs/security/breaks/cue-doubles.md). Partners take alternate visits; the
 * rule engines stay as they are and this layer wraps them:
 *  - `withDoubles` — the state carries `perSide` (from the format's
 *    playersPerSide) and, in doubles, tags the VISIT a stroke belonged to with
 *    the player at the table (`payload.pid`, as pool's scotch doubles sends) —
 *    whether the visit goes on, ends, or ends the frame. The first player stays;
 *    two ids per side, never one on both sides. Singles is untouched.
 *  - `atTable` — who is at the table: the same player mid-visit, else the
 *    partner of the side's last visit (A1, B1, A2, B2 …).
 *  - `playerBreaks` — each player's visits: breaks, points from pots, pots.
 * PURE: the same log always gives the same tags.
 */
type Side = 'home' | 'away';
type V = { side: Side; pts: number; shots: number; pots?: number; p?: string };
type Frame = { n: number; visit: V; visits: V[] };
type Cue = { frame: Frame | null; frames: { visits?: V[] }[]; perSide?: 1 | 2; dbl?: Record<Side, string[]> };

const PID = /^[A-Za-z0-9_-]{1,64}$/;
/** The strokes a player makes at the table (a break-off pick or a toss is not one). */
export const STROKES: ReadonlySet<string> = new Set(['POT', 'MISS', 'SAFETY', 'FOUL', 'SCORE']);
const validPid = (v: unknown): string | null => (typeof v === 'string' && PID.test(v) && v !== '__proto__' ? v : null);
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const perSideOf = (s: unknown): 1 | 2 => (isObj(s) && s.perSide === 2 ? 2 : 1);

/** The engine, with doubles: init reads playersPerSide; reduce tags visits. */
export function withDoubles<S, A extends { payload?: Record<string, unknown> }>(
  init: (config?: Record<string, unknown>) => S,
  reduce: (s: S, a: A) => S,
) {
  return {
    init: (config?: Record<string, unknown>): S => {
      const base = init(config) as unknown as Cue;
      const two = isObj(config) && Number(config.playersPerSide) === 2;
      return (two ? { ...base, perSide: 2, dbl: { home: [], away: [] } } : { ...base, perSide: 1 }) as unknown as S;
    },
    reduce: (s: S, a: A): S => {
      const next = reduce(s, a);
      if (next === s || perSideOf(next) !== 2 || !isObj(a) || !STROKES.has(String((a as { type?: unknown }).type))) return next;
      const pid = validPid(isObj(a) && isObj(a.payload) ? a.payload.pid : undefined);
      const before = (s as unknown as Cue).frame;
      if (!pid || !before?.visit) return next;
      const side = before.visit.side;
      const n = next as unknown as Cue;
      const dbl = n.dbl ?? { home: [], away: [] };
      // two players a side, never one on both sides (CD4)
      const mine = dbl[side].includes(pid) || (dbl[side].length < 2 && !dbl[other(side)].includes(pid));
      if (!mine) return next;
      const ids = dbl[side].includes(pid) ? dbl : { ...dbl, [side]: [...dbl[side], pid] };
      const tag = (v: V): V => (v.side === side && !v.p ? { ...v, p: pid } : v);
      const at = before.visits.length;
      let out: Cue = { ...n, dbl: ids };
      if (n.frame && n.frame.n === before.n) {
        if (n.frame.visits.length === at) {
          // the visit goes on
          out = { ...out, frame: { ...n.frame, visit: tag(n.frame.visit) } };
        } else if (n.frame.visits[at]) {
          const visits = [...n.frame.visits];
          visits[at] = tag(visits[at]);
          out = { ...out, frame: { ...n.frame, visits } };
        }
      } else {
        // the stroke ended the frame: its visit is in the frame just recorded
        const frames = [...n.frames];
        const last = frames[frames.length - 1];
        if (last?.visits?.[at]) {
          const visits = [...last.visits];
          visits[at] = tag(visits[at]);
          frames[frames.length - 1] = { ...last, visits };
          out = { ...out, frames };
        }
      }
      return out as unknown as S;
    },
  };
}

/** Every visit so far, in order (finished frames, this frame, the one in play). */
function allVisits(s: unknown): V[] {
  if (!isObj(s)) return [];
  const c = s as unknown as Cue;
  const done = (Array.isArray(c.frames) ? c.frames : []).flatMap((f) => (Array.isArray(f?.visits) ? f.visits : []));
  const fr = c.frame;
  return [...done, ...(fr && Array.isArray(fr.visits) ? fr.visits : []), ...(fr?.visit && fr.visit.shots > 0 ? [fr.visit] : [])];
}

/** Who is at the table for `side` (CD7): mid-visit the same player; else the
 *  partner of the side's last visit; the first visit goes to the first player. */
export function atTable(s: unknown, side: Side, ids: readonly string[]): { ids: string[]; suggested: string | null; keeps: boolean } {
  const two = [...new Set(ids.map(validPid).filter((x): x is string => !!x))].slice(0, 2);
  if (!two.length) return { ids: [], suggested: null, keeps: false };
  const cur = isObj(s) ? (s as unknown as Cue).frame?.visit : undefined;
  if (cur && cur.side === side && cur.p && two.includes(cur.p)) return { ids: two, suggested: cur.p, keeps: true };
  const last = allVisits(s).filter((v) => v.side === side && v.p && two.includes(v.p)).pop();
  const partner = last && two.length > 1 ? two.find((x) => x !== last.p)! : null;
  return { ids: two, suggested: partner ?? two[0], keeps: false };
}

export interface PlayerBreaks { side: Side; visits: number; potted: number; pots: number; highestBreak: number; fiftyPlus: number; centuries: number }

/** Each tagged player's own visits (CD8). */
export function playerBreaks(s: unknown): Record<string, PlayerBreaks> {
  const out: Record<string, PlayerBreaks> = Object.create(null);
  for (const v of allVisits(s)) {
    if (!v.p) continue;
    const b = out[v.p] ?? (out[v.p] = { side: v.side, visits: 0, potted: 0, pots: 0, highestBreak: 0, fiftyPlus: 0, centuries: 0 });
    const pts = typeof v.pts === 'number' && v.pts > 0 ? v.pts : 0;
    b.visits += 1;
    b.potted += pts;
    b.pots += typeof v.pots === 'number' && v.pots > 0 ? v.pots : 0;
    b.highestBreak = Math.max(b.highestBreak, pts);
    // as the engines count them: every 50+ break (centuries included), and the centuries
    if (pts >= 50) b.fiftyPlus += 1;
    if (pts >= 100) b.centuries += 1;
  }
  return out;
}

type Ctx = { players?: Partial<Record<Side, { id: string }[]>> } | undefined;
type Entry = { side: Side; stats: Record<string, number> };

/**
 * The plugin's statTotals with doubles (CD8): singles as before; in doubles
 * each partner gets the pair's record (frames, points — `shared`) and their own
 * breaks from their own visits. `keys` names the sport's points-from-breaks
 * key ('potted' / 'scored') and its pots key, if it has one.
 */
export function doublesStatTotals<S>(
  base: (s: S, ctx?: Ctx) => Record<string, Entry>,
  sideRecord: (s: S, side: Side) => Record<string, number>,
  shared: readonly string[],
  keys: { potted: string; pots?: string },
) {
  return (s: S, ctx?: Ctx): Record<string, Entry> => {
    if (perSideOf(s) !== 2) return base(s, ctx);
    const out: Record<string, Entry> = Object.create(null);
    const breaks = playerBreaks(s);
    const dbl = (s as unknown as Cue).dbl ?? { home: [], away: [] };
    for (const side of ['home', 'away'] as const) {
      const rec = sideRecord(s, side);
      const ids = [...new Set([...(dbl[side] ?? []), ...((ctx?.players?.[side] ?? []).map((p) => p?.id))]
        .map(validPid).filter((x): x is string => !!x))].slice(0, 2);
      for (const id of ids) {
        if (Object.prototype.hasOwnProperty.call(out, id)) continue;
        const stats: Record<string, number> = {};
        for (const k of shared) if (typeof rec[k] === 'number') stats[k] = rec[k];
        if ((rec.shotFrames ?? 0) > 0) {
          const b = breaks[id];
          stats.shotFrames = rec.shotFrames;
          stats.highestBreak = b?.highestBreak ?? 0;
          stats.fiftyPlus = b?.fiftyPlus ?? 0;
          stats.centuries = b?.centuries ?? 0;
          stats.visits = b?.visits ?? 0;
          stats[keys.potted] = b?.potted ?? 0;
          if (keys.pots) stats[keys.pots] = b?.pots ?? 0;
        }
        out[id] = { side, stats };
      }
    }
    return out;
  };
}
