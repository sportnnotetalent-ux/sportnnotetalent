/**
 * Deep wave — baseball / softball figures DERIVED from the log (PURE), the
 * MLB / WBSC box-score notes (OBR 9.00) a scorer gets for free:
 *  - batting with runners in scoring position (RISP: a runner on 2nd or 3rd
 *    when the plate appearance ended — "2-for-9"), two-out RBI, left on base
 *    per half-inning, grounded into double plays;
 *  - pitchers: pitches–strikes ("98-62"), strike %, first-pitch strikes (the
 *    first pitch of a plate appearance is a strike: called, swinging, foul or
 *    put in play), batters faced, ground outs – fly outs (GO-AO from the
 *    outcomes: groundout / double play vs flyout / lineout / sac fly),
 *    inherited runners – scored, the pitch mix (when pitch types are tracked);
 *  - fielding: errors, double plays turned (a play that made 2+ outs), putouts
 *    / assists from the notation;
 *  - spray: balls in play and hits by zone (the scorer's tap, else the
 *    fielders' notation).
 * Pitch-count figures mean something only with pitch-by-pitch on
 * (`cfg.pitches`) — readers gate on it (never a false 0).
 */
import {
  HITS, NO_AB, inningOf, other, whoKey, withAnn, zoneOf,
  type Ann, type BaseballEvent, type BaseballState, type Outcome, type Side, type Zone,
} from './engine.ts';

export type Scope = 'all' | number;

/** "6-4-3" → putout 3, assists 6 and 4; "F8" → putout 8; "E5" → error 5. */
export function notation(f?: string): { po: number[]; a: number[]; e: number[] } {
  const out = { po: [] as number[], a: [] as number[], e: [] as number[] };
  if (!f) return out;
  const err = /^E(\d{1,2})$/i.exec(f.trim());
  if (err) { out.e.push(Number(err[1])); return out; }
  const nums = (f.match(/\d{1,2}/g) ?? []).map(Number).filter((n) => n >= 1 && n <= 10);
  if (!nums.length) return out;
  out.po.push(nums[nums.length - 1]);
  out.a.push(...nums.slice(0, -1).filter((n, i, xs) => xs.indexOf(n) === i && n !== nums[nums.length - 1]));
  return out;
}

/** a strike for the pitch count: called, swinging, foul or put in play (a
 *  hit batter is a ball — MLB pitch-count convention) */
const STRIKE = new Set(['called', 'swinging', 'foul', 'inplay']);
export const GROUND_OUT: Outcome[] = ['GO', 'DP'];
export const AIR_OUT: Outcome[] = ['FO', 'LO', 'SF'];

/** Did this event carry a pitch (a PITCH, or a plate appearance's final pitch)? */
export const carriesPitch = (e: BaseballEvent): boolean => e.type === 'pitch' || (e.type === 'pa' && !!e.pitch && e.outcome !== 'IBB');
export const isStrike = (e: BaseballEvent): boolean => !!e.pitch && STRIKE.has(e.pitch);
/** runners in scoring position before the play (2nd and / or 3rd) */
export const risp = (a?: Ann): boolean => !!a && ((a.on ?? 0) & 6) !== 0;
/** a plate appearance that counts as an at bat */
export const isAb = (o?: Outcome): boolean => !!o && !NO_AB.includes(o);

/** The live annotation of an event, if it counts in the scope. */
export function annIn(s: BaseballState, e: BaseballEvent, scope: Scope = 'all'): Ann | undefined {
  const a = s.g.ann[e.id];
  if (!a || a.ignored) return undefined;
  return scope === 'all' || inningOf(a.half) === scope ? a : undefined;
}

/** the pitcher charged with an event's pitch / plate appearance */
export const pitcherKeyOf = (e: BaseballEvent, a?: Ann): string | undefined => whoKey(e.pitcher) ?? a?.pk;

/* --------------------------------- pitchers -------------------------------- */

export interface PitcherFigures {
  key: string; id?: string; name?: string; side: Side; first: boolean;
  pitches: number; strikes: number; balls: number; firstPitches: number; firstStrikes: number;
  bf: number; k: number; bb: number; go: number; ao: number; ir: number; irs: number;
  mix: Record<string, number>;
}

/** Each pitcher's figures (in order of appearance) over a scope. */
export function pitcherFigures(state: BaseballState, scope: Scope = 'all'): PitcherFigures[] {
  const s = withAnn(state);
  const out = new Map<string, PitcherFigures>();
  const get = (key: string | undefined, side: Side, w?: { id?: string; name?: string }): PitcherFigures | undefined => {
    if (!key) return undefined;
    let p = out.get(key);
    if (!p) {
      const sp = s.g.spells.find((x) => x.key === key);
      p = {
        key, ...(sp?.id ?? w?.id ? { id: sp?.id ?? w?.id } : {}), ...(sp?.name ?? w?.name ? { name: sp?.name ?? w?.name } : {}), side, first: sp?.first ?? false,
        pitches: 0, strikes: 0, balls: 0, firstPitches: 0, firstStrikes: 0, bf: 0, k: 0, bb: 0, go: 0, ao: 0, ir: 0, irs: 0, mix: {},
      };
      out.set(key, p);
    }
    return p;
  };
  // in the order they pitched
  for (const sp of s.g.spells) get(sp.key, sp.side, sp);
  for (const e of s.events) {
    const a = annIn(s, e, scope);
    if (!a) continue;
    if (e.type === 'sub' && e.kind === 'p' && e.side && a.inh) {
      const p = get(whoKey(e.on), e.side, e.on);
      if (p) p.ir += a.inh;
      continue;
    }
    if ((e.type !== 'pitch' && e.type !== 'pa') || !e.side) continue;
    const p = get(pitcherKeyOf(e, a), other(e.side), e.pitcher);
    if (!p) continue;
    if (carriesPitch(e)) {
      p.pitches++;
      if (isStrike(e)) p.strikes++; else p.balls++;
      if (a.fp) { p.firstPitches++; if (isStrike(e)) p.firstStrikes++; }
      if (e.ptype) p.mix[e.ptype] = (p.mix[e.ptype] ?? 0) + 1;
    }
    if (e.type === 'pa' && e.outcome) {
      p.bf++;
      if (e.outcome === 'K') p.k++;
      if (e.outcome === 'BB' || e.outcome === 'IBB') p.bb++;
      if (GROUND_OUT.includes(e.outcome)) p.go++;
      if (AIR_OUT.includes(e.outcome)) p.ao++;
    }
  }
  for (const r of s.g.runs) {
    if (!r.ir) continue;
    const ev = s.events.find((e) => e.id === r.event);
    if (!ev || !annIn(s, ev, scope)) continue;
    const p = out.get(r.ir);
    if (p) p.irs++;
  }
  return [...out.values()];
}

/** "FB 40 · SL 20 · CH 13" — a pitch mix, most thrown first. */
export function mixText(mix: Record<string, number>, label: (t: string) => string = (t) => t): string {
  return Object.entries(mix).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${label(t)} ${n}`).join(' · ');
}

/* --------------------------------- batters --------------------------------- */

export interface BatterFigures { key: string; id?: string; name?: string; side: Side; rispAb: number; rispHits: number; twoOutRbi: number }

/** Each batter's situational figures over a scope. */
export function batterFigures(state: BaseballState, scope: Scope = 'all'): BatterFigures[] {
  const s = withAnn(state);
  const out = new Map<string, BatterFigures>();
  for (const e of s.events) {
    if (e.type !== 'pa' || !e.side || !e.outcome) continue;
    const a = annIn(s, e, scope);
    const key = whoKey(e.batter);
    if (!a || !key) continue;
    let b = out.get(key);
    if (!b) { b = { key, ...(e.batter?.id ? { id: e.batter.id } : {}), ...(e.batter?.name ? { name: e.batter.name } : {}), side: e.side, rispAb: 0, rispHits: 0, twoOutRbi: 0 }; out.set(key, b); }
    if (risp(a) && isAb(e.outcome)) { b.rispAb++; if (HITS.includes(e.outcome)) b.rispHits++; }
    if (a.outs === 2 && (e.rbi ?? 0) > 0) b.twoOutRbi += e.rbi!;
  }
  return [...out.values()];
}

/* ---------------------------------- teams ---------------------------------- */

export interface TeamSplit {
  // at bat
  runs: number; pa: number; ab: number; hits: number; doubles: number; triples: number; homeRuns: number;
  bb: number; hbp: number; so: number; sf: number; sh: number; rbi: number;
  rispAb: number; rispHits: number; twoOutRbi: number; lob: number; gidp: number;
  sb: number; cs: number; pickedOff: number;
  // in the field (this side's pitchers / fielders)
  pitches: number; strikes: number; firstPitches: number; firstStrikes: number; bf: number; kPitched: number; bbAllowed: number;
  go: number; ao: number; wp: number; bk: number; pb: number; ir: number; irs: number;
  errors: number; dp: number; putouts: number; assists: number;
  mix: Record<string, number>;
  /** this side's balls in play by zone (at bat) */
  zones: Partial<Record<Zone, { bip: number; hits: number }>>;
}

/** A side's figures over a scope: at bat, and the other side's turns in the field. */
export function teamSplit(state: BaseballState, side: Side, scope: Scope = 'all'): TeamSplit {
  const s = withAnn(state);
  const t: TeamSplit = {
    runs: 0, pa: 0, ab: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, bb: 0, hbp: 0, so: 0, sf: 0, sh: 0, rbi: 0,
    rispAb: 0, rispHits: 0, twoOutRbi: 0, lob: 0, gidp: 0, sb: 0, cs: 0, pickedOff: 0,
    pitches: 0, strikes: 0, firstPitches: 0, firstStrikes: 0, bf: 0, kPitched: 0, bbAllowed: 0, go: 0, ao: 0, wp: 0, bk: 0, pb: 0, ir: 0, irs: 0,
    errors: 0, dp: 0, putouts: 0, assists: 0, mix: {}, zones: {},
  };
  s.g.line.forEach((r, h) => { if ((h % 2 === 0 ? 'away' : 'home') === side && (scope === 'all' || inningOf(h) === scope)) t.runs += r ?? 0; });
  for (const e of s.events) {
    const a = annIn(s, e, scope);
    if (!a) continue;
    if (e.type === 'sub') { if (e.kind === 'p' && e.side === side && a.inh) t.ir += a.inh; continue; }
    if (!e.side) continue;
    const atBat = e.side === side;
    if (a.lob !== undefined && atBat) t.lob += a.lob;
    if ((e.type === 'pa' || e.type === 'runner') && !atBat && a.outsMade >= 2) t.dp++;
    if (carriesPitch(e) && !atBat) {
      t.pitches++;
      if (isStrike(e)) t.strikes++;
      if (a.fp) { t.firstPitches++; if (isStrike(e)) t.firstStrikes++; }
      if (e.ptype) t.mix[e.ptype] = (t.mix[e.ptype] ?? 0) + 1;
    }
    if (e.type === 'runner') {
      if (atBat) {
        if (e.kind === 'SB') t.sb++;
        if (e.kind === 'CS') t.cs++;
        if (e.kind === 'PO') t.pickedOff++;
      } else {
        if (e.kind === 'WP') t.wp++;
        if (e.kind === 'BK') t.bk++;
        if (e.kind === 'PB') t.pb++;
      }
      continue;
    }
    if (e.type !== 'pa' || !e.outcome) continue;
    const o = e.outcome;
    if (atBat) {
      t.pa++;
      if (isAb(o)) t.ab++;
      if (HITS.includes(o)) t.hits++;
      if (o === '2B') t.doubles++;
      if (o === '3B') t.triples++;
      if (o === 'HR') t.homeRuns++;
      if (o === 'BB' || o === 'IBB') t.bb++;
      if (o === 'HBP') t.hbp++;
      if (o === 'K') t.so++;
      if (o === 'SF') t.sf++;
      if (o === 'SH') t.sh++;
      if (o === 'DP') t.gidp++;
      t.rbi += e.rbi ?? 0;
      if (risp(a) && isAb(o)) { t.rispAb++; if (HITS.includes(o)) t.rispHits++; }
      if (a.outs === 2) t.twoOutRbi += e.rbi ?? 0;
      const z = zoneOf(e);
      if (z) { const c = (t.zones[z] ??= { bip: 0, hits: 0 }); c.bip++; if (HITS.includes(o)) c.hits++; }
    } else {
      t.bf++;
      if (o === 'K') t.kPitched++;
      if (o === 'BB' || o === 'IBB') t.bbAllowed++;
      if (GROUND_OUT.includes(o)) t.go++;
      if (AIR_OUT.includes(o)) t.ao++;
      if (o === 'E') t.errors++;
      if (e.fielders) { const n = notation(e.fielders); t.putouts += n.po.length; t.assists += n.a.length; }
    }
  }
  for (const r of s.g.runs) {
    if (!r.ir || r.side === side) continue;
    const ev = s.events.find((e) => e.id === r.event);
    if (ev && annIn(s, ev, scope)) t.irs++;
  }
  return t;
}

/** Was any play noted with its fielders (6-3, F8, E5)? */
export const fieldersNoted = (s: BaseballState): boolean => s.cfg.askFielders || s.events.some((e) => e.type === 'pa' && !!e.fielders);

/** The innings the game has reached (1 … the current / last). */
export function inningsPlayed(state: BaseballState): number {
  const s = state;
  let h = -1;
  for (const e of s.events) { const a = s.g.ann[e.id]; if (a && !a.ignored && (e.type === 'pitch' || e.type === 'pa' || e.type === 'runner')) h = Math.max(h, a.half); }
  if (h < 0) return 0;
  return inningOf(s.g.ended ? h : Math.max(h, s.g.half));
}
