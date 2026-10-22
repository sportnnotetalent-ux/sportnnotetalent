/**
 * SD-144 — baseball / softball absolute statTotals (SD-19). PURE.
 *
 * Owns the WHOLE line: every live key is the sum of `eventCredits` over the
 * log (the same credits the controls attach), plus the keys only the derived
 * game can know (never credited live):
 *  - `runs` (the runner who crossed the plate — a run that didn't count,
 *    e.g. after a walk-off's winning run, isn't one),
 *  - pitchers: `pitches`, `runsAllowed`, `earnedRuns`, `erN` (earned runs ×
 *    the format's innings — the ERA numerator, so a softball 7-inning ERA and
 *    a 9-inning baseball ERA each read on their own scale), `pitchWins`,
 *    `pitchLosses`, `pitchSaves`, `gamesPitched`,
 *  - fielding from the scorer's notation (when asked): `putouts`,
 *    `fieldAssists`, `fieldErrors` (the last fielder in "6-3" makes the
 *    putout, the others assist; "E5" is the third baseman's error).
 * Deep wave (./situational.ts — derived from the log, never credited live):
 *  - batters: `rispAb` / `rispHits` (at bats and hits with runners in scoring
 *    position), `twoOutRbi` — every batter who came up (0 = a true 0);
 *  - pitchers: `pitchGroundOuts` / `pitchFlyOuts` (GO-AO) for every pitcher;
 *    `inheritedRunners` / `inheritedScored` for relievers; and ONLY with
 *    pitch-by-pitch on: `strikesThrown`, `ballsThrown`, `firstPitchStrikes`,
 *    `firstPitches` (a game scored outcomes-only never gets false zeros).
 */
import {
  eventCredits, whoKey, other, withAnn, POS_NUM, LIVE_KEYS,
  type BaseballEvent, type BaseballState, type Side, type Who,
} from './engine.ts';
import { batterFigures, notation, pitcherFigures } from './situational.ts';

/** deep wave: free situational keys (any log) and the pitch-by-pitch ones */
export const SITUATIONAL_KEYS = ['rispAb', 'rispHits', 'twoOutRbi', 'pitchGroundOuts', 'pitchFlyOuts', 'inheritedRunners', 'inheritedScored'] as const;
export const PITCH_COUNT_KEYS = ['strikesThrown', 'ballsThrown', 'firstPitchStrikes', 'firstPitches'] as const;

export const DERIVED_KEYS = [
  'runs', 'pitches', 'runsAllowed', 'earnedRuns', 'erN', 'pitchWins', 'pitchLosses', 'pitchSaves', 'gamesPitched',
  'putouts', 'fieldAssists', 'fieldErrors',
  ...SITUATIONAL_KEYS, ...PITCH_COUNT_KEYS,
] as const;
export const OWNED_LIVE_KEYS = LIVE_KEYS;

type Line = { side: Side; stats: Record<string, number> };

/** The player at a scorer's position number for the fielding team (the
 *  pitcher on the mound for 1; the order's positions for the rest). */
export function fielderAt(s: BaseballState, side: Side, n: number, pitcher?: Who): Who | undefined {
  if (n === 1) return pitcher ?? s.g.pitcher[side];
  const pos = Object.entries(POS_NUM).find(([, v]) => v === n)?.[0];
  if (!pos) return undefined;
  const e = s.g.order[side].find((x) => x.pos === pos) ?? s.lineup[side]?.find((x) => x.pos === pos);
  return e ? { ...(e.id ? { id: e.id } : {}), name: e.name } : undefined;
}

export { notation };

export function baseballTotals(s: BaseballState): Record<string, Line> {
  const out: Record<string, Line> = {};
  const line = (id: string, side: Side) => (out[id] ??= { side, stats: {} });
  const add = (id: string | undefined, side: Side, stats: Record<string, number>) => {
    if (!id || id.startsWith('name:')) return;
    const l = line(id, side);
    for (const [k, v] of Object.entries(stats)) l.stats[k] = (l.stats[k] ?? 0) + v;
  };
  for (const e of s.events) {
    if (!e.side || (e.type !== 'pa' && e.type !== 'runner')) continue;
    const c = eventCredits(e);
    if (c.first) add(c.first.playerId, e.side, c.first.stats);
    if (c.second) add(c.second.playerId, other(e.side), c.second.stats);
    // fielding from the notation
    if (e.type === 'pa' && e.fielders) {
      const field = other(e.side);
      const n = notation(e.fielders);
      for (const x of n.po) add(fielderAt(s, field, x, e.pitcher)?.id, field, { putouts: 1 });
      for (const x of n.a) add(fielderAt(s, field, x, e.pitcher)?.id, field, { fieldAssists: 1 });
      for (const x of n.e) add(fielderAt(s, field, x, e.pitcher)?.id, field, { fieldErrors: 1 });
    }
  }
  // runs scored and charged
  for (const r of s.g.runs) {
    add(r.runnerId, r.side, { runs: 1 });
    add(r.resp, other(r.side), { runsAllowed: 1, ...(r.earned ? { earnedRuns: 1, erN: s.cfg.innings } : {}) });
  }
  // pitchers: pitches, games pitched, decisions
  const pitchers = new Map<string, Side>();
  for (const sp of s.g.spells) pitchers.set(sp.key, sp.side);
  for (const e of s.events) if (e.type === 'pa' && e.side) { const k = whoKey(e.pitcher); if (k) pitchers.set(k, other(e.side)); }
  for (const [k, side] of pitchers) {
    if (k.startsWith('name:')) continue;
    const l = line(k, side).stats;
    l.pitches = s.g.pitches[k] ?? 0;
    l.gamesPitched = 1;
    for (const x of ['runsAllowed', 'earnedRuns', 'erN', 'outsPitched'] as const) l[x] ??= 0;
    l.pitchWins = s.g.decisions?.w === k ? 1 : 0;
    l.pitchLosses = s.g.decisions?.l === k ? 1 : 0;
    l.pitchSaves = s.g.decisions?.sv === k ? 1 : 0;
  }
  // every batter who came up: the counting keys read 0, not "not tracked"
  for (const e of s.events) {
    if (e.type !== 'pa' || !e.side || !e.batter?.id) continue;
    const l = line(e.batter.id, e.side).stats;
    for (const k of ['plateAppearances', 'atBats', 'hits', 'runs', 'rbi'] as const) l[k] ??= 0;
  }
  // deep wave: situational figures — derived from the log, never credited live
  const st = withAnn(s);
  for (const b of batterFigures(st)) {
    if (!b.id) continue;
    const l = line(b.id, b.side).stats;
    l.rispAb = b.rispAb;
    l.rispHits = b.rispHits;
    l.twoOutRbi = b.twoOutRbi;
  }
  for (const p of pitcherFigures(st)) {
    if (p.key.startsWith('name:')) continue;
    const l = line(p.key, p.side).stats;
    l.pitchGroundOuts = p.go;
    l.pitchFlyOuts = p.ao;
    const sp = st.g.spells.find((x) => x.key === p.key);
    if ((sp && !sp.first) || p.ir > 0) { l.inheritedRunners = p.ir; l.inheritedScored = p.irs; }
    // pitch counts mean something only pitch by pitch (else: absent, "not tracked")
    if (st.cfg.pitches) {
      l.strikesThrown = p.strikes;
      l.ballsThrown = p.balls;
      l.firstPitchStrikes = p.firstStrikes;
      l.firstPitches = p.firstPitches;
    }
  }
  return out;
}

/** A side's team figures for the comparison and the line score. */
export function teamFigures(s: BaseballState, side: Side): { runs: number; hits: number; errors: number; lob: number; homeRuns: number; strikeouts: number; walks: number; stolenBases: number; pitches: number } {
  const f = { runs: s.g.score[side], hits: s.g.hits[side], errors: s.g.errors[side], lob: s.g.lob[side], homeRuns: 0, strikeouts: 0, walks: 0, stolenBases: 0, pitches: 0 };
  for (const e of s.events) {
    if (e.side !== side) continue;
    const a = s.g.ann[e.id];
    if (a?.ignored) continue;
    if (e.type === 'pa') {
      if (e.outcome === 'HR') f.homeRuns++;
      if (e.outcome === 'K') f.strikeouts++;
      if (e.outcome === 'BB' || e.outcome === 'IBB') f.walks++;
    } else if (e.type === 'runner' && e.kind === 'SB') f.stolenBases++;
  }
  for (const sp of s.g.spells) if (sp.side === side) f.pitches += s.g.pitches[sp.key] ?? 0;
  return f;
}

/** The plays where the batter reached base by any means (perfect game check). */
export const reachedBase = (e: BaseballEvent): boolean => e.type === 'pa' && !!e.moves?.some((m) => m.from === 0 && m.to !== -1);
