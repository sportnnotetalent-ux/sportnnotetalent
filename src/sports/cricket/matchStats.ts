/**
 * Deep wave (cricket) — the match-centre STATS a broadcaster shows (ESPNcricinfo
 * match centre / CricViz / CricHeroes): a team-vs-team comparison by phase
 * (powerplay / middle / death), batting and bowling tables with dot-ball %,
 * boundary %, scoring-shot %, economy by phase, batter-vs-bowler matchups, a
 * worm and Manhattan for both innings, and — only when the scorer tracked them
 * — shot control, the pitch map, ball speed and pace vs spin.
 *
 * DERIVED ONLY from the replayed ball log and the optional detail (a
 * correction replays, so these are always the corrected figures). Nothing here
 * shows a 0 for something that wasn't tracked: tracked figures come back as
 * `null` when the match didn't capture them. Pure and JSX-free (node tests).
 */
import { oversStr, runRate, other, NO_BOWLER, HUNDRED_PP_BALLS, type BallRec, type CricketState } from './engine.ts';
import {
  detailByRec, isDeliveryRec, isPace, LENGTHS, LINES, BOWL_TYPE_LABEL,
  type BallDetailRec, type BowlType, type Length, type Line,
} from './detail.ts';
import { partnerships, overHistory } from './scorecard.ts';

type Side = 'home' | 'away';
export type Phase = 'pp' | 'middle' | 'death';
export type PhaseFilter = 'all' | Phase;

// ─── Phases ───────────────────────────────────────────────────────────────────

/** An innings' length in overs as it was played (rain cuts included, best known). */
export function inningsOvers(s: CricketState, inn: 1 | 2): number {
  if (inn === 2 || s.innings === 1) return s.oversLimit;
  if (s.inn1Rain) return Math.ceil(s.inn1Rain.balls / s.ballsPerOver);
  if (s.r1Lost !== 0) return s.inn2Overs ?? s.oversLimit;
  return s.inn1Overs ?? s.oversLimit;
}

export interface PhasePlan {
  /** legal balls in the powerplay (0 = none) */
  pp: number;
  /** the death phase starts after this many legal balls */
  deathFrom: number;
  /** "Overs 1–6" … */
  labels: Record<Phase, string>;
}

/**
 * Powerplay / middle / death (CricViz / Cricinfo phases): the powerplay is the
 * format's own (The Hundred: 25 balls; none when the format has none); the
 * death is the last quarter of the innings (T20: 16–20, T10: 8–10), the last
 * 10 overs from 40 overs up (ODI: 41–50). Null for a timeless / Test-style
 * innings or one too short to split (under 4 overs).
 */
export function phasePlan(s: CricketState, inn: 1 | 2): PhasePlan | null {
  const bpo = s.ballsPerOver;
  const len = inningsOvers(s, inn);
  if (len >= 100 || len < 4) return null;
  const total = len * bpo;
  const pp = s.hundred ? HUNDRED_PP_BALLS : Math.min(s.powerplayOvers * bpo, total);
  const deathBalls = s.hundred ? 25 : (len >= 40 ? 10 : Math.max(1, Math.round(len / 4))) * bpo;
  const deathFrom = Math.max(pp, total - deathBalls);
  const span = (a: number, b: number) => (s.hundred || a % bpo !== 0 || b % bpo !== 0
    ? `Balls ${a + 1}–${b}` : a / bpo + 1 === b / bpo ? `Over ${b / bpo}` : `Overs ${a / bpo + 1}–${b / bpo}`);
  return {
    pp, deathFrom,
    labels: { pp: pp > 0 ? `Powerplay · ${span(0, pp)}` : 'Powerplay', middle: `Middle · ${span(pp, deathFrom)}`, death: `Death · ${span(deathFrom, total)}` },
  };
}

/** The (1-based) legal ball a record belongs to: a wide / no-ball / penalty
 *  belongs to the ball being bowled. */
const ballNo = (r: BallRec) => (r.legal ? r.lb6 : r.lb6 + 1);
export function phaseOf(r: BallRec, plan: PhasePlan | null): Phase {
  if (!plan) return 'middle';
  const n = ballNo(r);
  if (n <= plan.pp) return 'pp';
  if (n > plan.deathFrom) return 'death';
  return 'middle';
}

// ─── Per-ball helpers ─────────────────────────────────────────────────────────

const faced = (r: BallRec) => r.ext === 'nb' || (r.legal && r.ext !== 'wd' && isDeliveryRec(r));
const charged = (r: BallRec) => r.bat + r.wd + r.nb;
const teamRuns = (r: BallRec) => r.bat + r.wd + r.nb + r.b + r.lb + (r.pen ?? 0) + (r.adj ?? 0);
/** A boundary off the bat: a '4' / '6' chip, or 4 / 6 off the bat on a no-ball
 *  (the log doesn't keep a no-ball's all-run flag — read as a boundary). */
export const boundaryOf = (r: BallRec): 0 | 4 | 6 => {
  if (r.sym === '4' || r.sym === '6') return Number(r.sym) as 4 | 6;
  if (r.ext === 'nb' && (r.bat === 4 || r.bat === 6) && r.b + r.lb === 0) return r.bat as 4 | 6;
  return 0;
};
const wicketFor = (r: BallRec) => !!r.out && r.out.kind !== 'retired';
const bowlersWicket = (r: BallRec) => wicketFor(r) && !NO_BOWLER.includes(r.out!.kind);

interface Joined { r: BallRec; d?: BallDetailRec; phase: Phase }
/** One side's innings records (regulation only; not the cross penalties), with detail and phase. */
export function inningsRecs(s: CricketState, side: Side): Joined[] {
  const log = s.log ?? [];
  const det = detailByRec(log, s.detail, s.ballsPerOver);
  const plans = { 1: phasePlan(s, 1), 2: phasePlan(s, 2) };
  const out: Joined[] = [];
  log.forEach((r, i) => {
    if (r.side !== side || r.cross) return;
    out.push({ r, d: det[i], phase: phaseOf(r, plans[r.inn]) });
  });
  return out;
}
const inPhase = (j: Joined, f: PhaseFilter) => f === 'all' || j.phase === f;

// ─── Team aggregates ──────────────────────────────────────────────────────────

export interface TeamBat {
  runs: number; wkts: number; legal: number; faced: number;
  /** legal deliveries off which no run of any kind came */
  dots: number;
  fours: number; sixes: number; boundaryRuns: number;
  /** balls faced that scored off the bat */
  scoring: number;
  extras: { b: number; lb: number; wd: number; nb: number; pen: number };
  /** tracked only — null when the innings didn't track it */
  control: { balls: number; falseShots: number; beaten: number; edged: number; mistimed: number } | null;
  pitch: { tagged: number; deliveries: number; lengths: Record<Length, number>; lines: Record<Line, number> } | null;
  speed: { n: number; avg: number; max: number } | null;
  /** runs / balls / outs vs typed bowlers — null when no bowler has a type */
  pace: { runs: number; balls: number; outs: number } | null;
  spin: { runs: number; balls: number; outs: number } | null;
}

/** `side`'s batting innings (the opposition's bowling), for one phase or all. */
export function teamBatting(s: CricketState, side: Side, f: PhaseFilter = 'all'): TeamBat {
  const recs = inningsRecs(s, side).filter((j) => inPhase(j, f));
  const t: TeamBat = {
    runs: 0, wkts: 0, legal: 0, faced: 0, dots: 0, fours: 0, sixes: 0, boundaryRuns: 0, scoring: 0,
    extras: { b: 0, lb: 0, wd: 0, nb: 0, pen: 0 }, control: null, pitch: null, speed: null, pace: null, spin: null,
  };
  const types = s.bowlTypes ?? {};
  const typed = Object.keys(types).length > 0;
  for (const { r, d } of recs) {
    t.runs += teamRuns(r);
    if (wicketFor(r)) t.wkts += 1;
    if (r.legal) t.legal += 1;
    if (faced(r)) t.faced += 1;
    if (r.legal && isDeliveryRec(r) && teamRuns(r) === 0) t.dots += 1;
    const bd = boundaryOf(r);
    if (bd === 4) t.fours += 1;
    if (bd === 6) t.sixes += 1;
    t.boundaryRuns += bd;
    if (faced(r) && r.bat > 0) t.scoring += 1;
    t.extras.b += r.b; t.extras.lb += r.lb; t.extras.wd += r.wd; t.extras.nb += r.nb; t.extras.pen += r.pen ?? 0;
    if (!isDeliveryRec(r)) continue;
    if (r.trk?.ctrl && faced(r)) {
      const c = (t.control ??= { balls: 0, falseShots: 0, beaten: 0, edged: 0, mistimed: 0 });
      c.balls += 1;
      if (d?.ctrl) { c.falseShots += 1; c[d.ctrl] += 1; }
    }
    if (r.trk?.pitch || d?.len || d?.line) {
      const p = (t.pitch ??= { tagged: 0, deliveries: 0, lengths: zeroes(LENGTHS), lines: zeroes(LINES) });
      p.deliveries += 1;
      if (d?.len || d?.line) p.tagged += 1;
      if (d?.len) p.lengths[d.len] += 1;
      if (d?.line) p.lines[d.line] += 1;
    }
    if (d?.kph) {
      const sp = (t.speed ??= { n: 0, avg: 0, max: 0 });
      sp.avg = (sp.avg * sp.n + d.kph) / (sp.n + 1);
      sp.n += 1;
      sp.max = Math.max(sp.max, d.kph);
    }
    if (typed) {
      const bt = r.bowlerId ? types[r.bowlerId] : undefined;
      if (bt) {
        const k = isPace(bt) ? 'pace' : 'spin';
        const v = (t[k] ??= { runs: 0, balls: 0, outs: 0 });
        v.runs += r.bat;
        if (faced(r)) v.balls += 1;
        if (bowlersWicket(r)) v.outs += 1;
      }
    }
  }
  if (typed) { t.pace ??= { runs: 0, balls: 0, outs: 0 }; t.spin ??= { runs: 0, balls: 0, outs: 0 }; }
  return t;
}
function zeroes<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

const pct = (n: number, d: number, dp = 0): string => (d > 0 ? `${((n / d) * 100).toFixed(dp)}%` : '–');
const ratio = (n: number, d: number, dp = 1): string => (d > 0 ? (n / d).toFixed(dp) : '–');

// ─── The comparison panel ─────────────────────────────────────────────────────

export interface CompareRow {
  label: string;
  home: string;
  away: string;
  /** numbers behind the bar (absent = no bar) */
  h?: number;
  a?: number;
  better?: 'higher' | 'lower';
  /** a coverage note ("120 of 120 balls tracked") */
  note?: string;
}
export interface CompareSection { title: string; rows: CompareRow[] }

/** Has `side` batted at all (a ball, a run or a wicket in its innings)? */
const batted = (s: CricketState, side: Side) => (s.log ?? []).some((r) => r.side === side && !r.cross);

/**
 * Team vs team, ATP-panel style: each column is that TEAM's figure — batting
 * from its own innings, bowling and fielding from the innings it bowled at.
 * `f` = a phase (powerplay / middle / death) or all. Fielding, partnerships
 * and the best over are whole-match rows (all only).
 */
export function compareSections(s: CricketState, f: PhaseFilter = 'all'): CompareSection[] {
  const bh = teamBatting(s, 'home', f);
  const ba = teamBatting(s, 'away', f);
  const bpo = s.ballsPerOver;
  const row = (label: string, h: number, a: number, fmt: (n: number) => string, better?: 'higher' | 'lower', bar = true): CompareRow =>
    ({ label, home: fmt(h), away: fmt(a), ...(bar ? { h, a } : {}), ...(better ? { better } : {}) });
  const txt = (label: string, home: string, away: string, better?: 'higher' | 'lower', h?: number, a?: number): CompareRow =>
    ({ label, home, away, ...(h !== undefined && a !== undefined ? { h, a } : {}), ...(better ? { better } : {}) });
  const n0 = (n: number) => String(n);
  const rr = (t: TeamBat) => (t.legal ? (t.runs / t.legal) * bpo : 0);
  const out: CompareSection[] = [];

  out.push({ title: 'Batting', rows: [
    row('Runs', bh.runs, ba.runs, n0, 'higher'),
    txt('Overs', oversStr(bh.legal, bpo), oversStr(ba.legal, bpo)),
    txt('Run rate', runRate(bh.runs, bh.legal, bpo), runRate(ba.runs, ba.legal, bpo), 'higher', rr(bh), rr(ba)),
    row('Wickets lost', bh.wkts, ba.wkts, n0, 'lower'),
    row('4s', bh.fours, ba.fours, n0, 'higher'),
    row('6s', bh.sixes, ba.sixes, n0, 'higher'),
    txt('Boundary %', pct(bh.boundaryRuns, bh.runs), pct(ba.boundaryRuns, ba.runs), 'higher', bh.runs ? bh.boundaryRuns / bh.runs : 0, ba.runs ? ba.boundaryRuns / ba.runs : 0),
    txt('Dot-ball %', pct(bh.dots, bh.legal), pct(ba.dots, ba.legal), 'lower', bh.legal ? bh.dots / bh.legal : 0, ba.legal ? ba.dots / ba.legal : 0),
    txt('Scoring-shot %', pct(bh.scoring, bh.faced), pct(ba.scoring, ba.faced), 'higher', bh.faced ? bh.scoring / bh.faced : 0, ba.faced ? ba.scoring / ba.faced : 0),
    txt('Balls per boundary', ratio(bh.faced, bh.fours + bh.sixes), ratio(ba.faced, ba.fours + ba.sixes), 'lower'),
    ...(f === 'all' ? (() => {
      const best = (side: Side) => Math.max(0, ...partnerships(s, side).map((p) => p.runs));
      const top = (side: Side) => Math.max(0, ...overHistory(s, side).map((o) => o.runs));
      return [row('Best partnership', best('home'), best('away'), n0, 'higher'), row('Best over (runs)', top('home'), top('away'), n0, 'higher')];
    })() : []),
  ] });

  // Bowling: a team's figures come from the OTHER side's innings.
  const ex = (t: TeamBat) => t.extras.b + t.extras.lb + t.extras.wd + t.extras.nb + t.extras.pen;
  const econ = (t: TeamBat) => (t.legal ? (t.runs / t.legal) * bpo : 0);
  const maidens = (side: Side) => bowlingRows(s, side).reduce((a, b) => a + b.maidens, 0);
  out.push({ title: 'Bowling', rows: [
    txt('Economy', runRate(ba.runs, ba.legal, bpo), runRate(bh.runs, bh.legal, bpo), 'lower', econ(ba), econ(bh)),
    row('Wickets', ba.wkts, bh.wkts, n0, 'higher'),
    row('Dot balls', ba.dots, bh.dots, n0, 'higher'),
    ...(f === 'all' ? [row('Maidens', maidens('away'), maidens('home'), n0, 'higher')] : []),
    ...(f === 'all' && (bh.wkts || ba.wkts) ? [txt('How the wickets fell', howOut(s, 'away'), howOut(s, 'home'))] : []),
    row('Extras conceded', ex(ba), ex(bh), n0, 'lower'),
    row('Wides', ba.extras.wd, bh.extras.wd, n0, 'lower'),
    row('No balls', ba.extras.nb, bh.extras.nb, n0, 'lower'),
  ] });

  if (f === 'all') {
    const fh = fielding(s, 'home');
    const fa = fielding(s, 'away');
    const rows: CompareRow[] = [
      row('Catches', fh.catches, fa.catches, n0, 'higher'),
      row('Run outs', fh.runOuts, fa.runOuts, n0, 'higher'),
      row('Stumpings', fh.stumpings, fa.stumpings, n0, 'higher'),
    ];
    if (fh.notes || fa.notes) {
      rows.push(row('Drops', fh.drops, fa.drops, n0, 'lower'), row('Runs saved', fh.saved, fa.saved, n0, 'higher'), row('Runs missed', fh.missed, fa.missed, n0, 'lower'));
    }
    out.push({ title: 'Fielding', rows });
  }

  // Tracked only.
  if (bh.control || ba.control) {
    const c = (t: TeamBat) => t.control;
    const cp = (t: TeamBat) => (c(t) && c(t)!.balls ? 1 - c(t)!.falseShots / c(t)!.balls : 0);
    const shown = (t: TeamBat, fn: (x: NonNullable<TeamBat['control']>) => string) => (c(t) ? fn(c(t)!) : 'not tracked');
    out.push({ title: 'Shot control (tracked)', rows: [
      txt('Control %', shown(bh, (x) => pct(x.balls - x.falseShots, x.balls)), shown(ba, (x) => pct(x.balls - x.falseShots, x.balls)), 'higher', cp(bh), cp(ba)),
      txt('False shots', shown(bh, (x) => String(x.falseShots)), shown(ba, (x) => String(x.falseShots)), 'lower', c(bh)?.falseShots, c(ba)?.falseShots),
      txt('Beaten', shown(bh, (x) => String(x.beaten)), shown(ba, (x) => String(x.beaten)), 'lower', c(bh)?.beaten, c(ba)?.beaten),
      txt('Edged', shown(bh, (x) => String(x.edged)), shown(ba, (x) => String(x.edged)), 'lower', c(bh)?.edged, c(ba)?.edged),
      txt('Mistimed', shown(bh, (x) => String(x.mistimed)), shown(ba, (x) => String(x.mistimed)), 'lower', c(bh)?.mistimed, c(ba)?.mistimed),
    ] });
  }
  if (bh.speed || ba.speed) {
    // the BOWLING team's pace: home bowled at away's innings
    const sh = ba.speed;
    const sa = bh.speed;
    out.push({ title: 'Pace (speed gun)', rows: [
      txt('Fastest ball (km/h)', sh ? String(sh.max) : 'not tracked', sa ? String(sa.max) : 'not tracked', 'higher', sh?.max, sa?.max),
      txt('Average speed (km/h)', sh ? sh.avg.toFixed(1) : 'not tracked', sa ? sa.avg.toFixed(1) : 'not tracked', 'higher', sh?.avg, sa?.avg),
      txt('Balls clocked', sh ? String(sh.n) : '–', sa ? String(sa.n) : '–'),
    ] });
  }
  if (bh.pace || ba.pace) {
    const line = (v: TeamBat['pace']) => (v && v.balls ? `${v.runs} (${v.balls}) · SR ${((v.runs / v.balls) * 100).toFixed(0)}${v.outs ? ` · ${v.outs} out` : ''}` : '–');
    out.push({ title: 'Pace vs spin (batting)', rows: [
      txt('vs pace', line(bh.pace), line(ba.pace)),
      txt('vs spin', line(bh.spin), line(ba.spin)),
    ] });
  }
  return out.filter((sec) => sec.rows.length > 0 && (batted(s, 'home') || batted(s, 'away')));
}

/** "c 4 · b 2 · lbw 1 · ro 1" — how `side`'s wickets fell (the bowling side's
 *  haul in the other column of the comparison). '–' when none. */
export function howOut(s: CricketState, side: Side): string {
  const SHORT: Partial<Record<string, string>> = {
    caught: 'c', bowled: 'b', lbw: 'lbw', runout: 'ro', mankad: 'ro', stumped: 'st', hitwicket: 'hw',
  };
  const n: Record<string, number> = {};
  for (const r of s.log ?? []) {
    if (r.side !== side || r.cross || !r.out || r.out.kind === 'retired') continue;
    const k = SHORT[r.out.kind] ?? 'other';
    n[k] = (n[k] ?? 0) + 1;
  }
  const order = ['c', 'b', 'lbw', 'ro', 'st', 'hw', 'other'];
  const parts = order.filter((k) => n[k]).map((k) => `${k} ${n[k]}`);
  return parts.length ? parts.join(' · ') : '–';
}

// ─── Fielding ─────────────────────────────────────────────────────────────────

export interface Fielding { catches: number; runOuts: number; stumpings: number; drops: number; saved: number; missed: number; notes: number }
/** `side`'s fielding (in the innings it bowled at). */
export function fielding(s: CricketState, side: Side): Fielding {
  const f: Fielding = { catches: 0, runOuts: 0, stumpings: 0, drops: 0, saved: 0, missed: 0, notes: 0 };
  for (const r of s.log ?? []) {
    if (r.side !== other(side) || r.cross || !r.out) continue;
    if (r.out.kind === 'caught') f.catches += 1;
    else if (r.out.kind === 'stumped') f.stumpings += 1;
    else if (r.out.kind === 'runout' || r.out.kind === 'mankad') f.runOuts += 1;
  }
  for (const n of s.fieldNotes ?? []) {
    if (n.side !== side) continue;
    f.notes += 1;
    if (n.kind === 'drop') f.drops += 1;
    else if (n.kind === 'saved') f.saved += n.runs ?? 0;
    else f.missed += n.runs ?? 0;
  }
  return f;
}

// ─── Batting & bowling tables ─────────────────────────────────────────────────

export interface BatterRow {
  id: string; name: string; runs: number; balls: number; fours: number; sixes: number; out: boolean;
  sr: string; dots: number; dotPct: string; boundaryPct: string;
  /** tracked only */
  control?: string;
  vsPace?: string; vsSpin?: string;
  /** minutes at the crease (stamped balls only) */
  minutes?: number;
}

/** `side`'s batters in batting order, with the deeper figures. */
export function battingRows(s: CricketState, side: Side): BatterRow[] {
  const recs = inningsRecs(s, side);
  const types = s.bowlTypes ?? {};
  const typed = Object.keys(types).length > 0;
  const mins = minutesBatted(s, side);
  return Object.entries(s.batting).filter(([, c]) => c.side === side).map(([id, c]) => {
    const mine = recs.filter((j) => j.r.strikerId === id && isDeliveryRec(j.r));
    const dots = mine.filter((j) => faced(j.r) && j.r.bat === 0).length;
    const bRuns = mine.reduce((a, j) => a + boundaryOf(j.r), 0);
    const row: BatterRow = {
      id, name: c.name || 'Batter', runs: c.runs, balls: c.balls, fours: c.fours, sixes: c.sixes, out: c.out,
      sr: c.balls ? ((c.runs / c.balls) * 100).toFixed(1) : '–',
      dots, dotPct: pct(dots, c.balls), boundaryPct: pct(bRuns, c.runs),
    };
    const ctl = mine.filter((j) => j.r.trk?.ctrl && faced(j.r));
    if (ctl.length) row.control = pct(ctl.filter((j) => !j.d?.ctrl).length, ctl.length);
    if (typed) {
      const vs = (pace: boolean) => {
        const b = mine.filter((j) => { const t = j.r.bowlerId ? types[j.r.bowlerId] : undefined; return t && isPace(t) === pace; });
        const balls = b.filter((j) => faced(j.r)).length;
        const runs = b.reduce((a, j) => a + j.r.bat, 0);
        return balls ? `${runs} (${balls})` : '–';
      };
      row.vsPace = vs(true);
      row.vsSpin = vs(false);
    }
    if (mins[id] !== undefined) row.minutes = mins[id];
    return row;
  });
}

export interface BowlerRow {
  id: string; name: string; type?: string;
  balls: number; overs: string; maidens: number; runs: number; wkts: number; econ: string;
  dots: number; dotPct: string; fours: number; sixes: number; wides: number; noBalls: number;
  /** economy in each phase that the bowler bowled in ('–' = didn't bowl then) */
  phaseEcon: Record<Phase, string>;
  /** tracked only */
  falseShotPct?: string;
  speed?: { avg: string; max: number; n: number };
}

/** The bowlers who bowled at `side`'s innings. */
export function bowlingRows(s: CricketState, side: Side): BowlerRow[] {
  const recs = inningsRecs(s, side).filter((j) => isDeliveryRec(j.r) || j.r.out?.kind === 'mankad');
  const bpo = s.ballsPerOver;
  const ids = [...new Set(recs.map((j) => j.r.bowlerId).filter((x): x is string => !!x))];
  // maidens: complete overs by one bowler with nothing charged
  const overs = new Map<string, BallRec[]>();
  for (const { r } of recs) {
    if (!isDeliveryRec(r)) continue;
    const k = `${r.inn}:${r.legal ? Math.floor((r.lb6 - 1) / bpo) : Math.floor(r.lb6 / bpo)}`;
    overs.set(k, [...(overs.get(k) ?? []), r]);
  }
  const maidens: Record<string, number> = {};
  for (const balls of overs.values()) {
    const who = new Set(balls.map((r) => r.bowlerId));
    if (who.size !== 1 || !balls[0].bowlerId) continue;
    if (balls.filter((r) => r.legal).length < bpo || balls.some((r) => charged(r) !== 0)) continue;
    maidens[balls[0].bowlerId] = (maidens[balls[0].bowlerId] ?? 0) + 1;
  }
  return ids.map((id) => {
    const mine = recs.filter((j) => j.r.bowlerId === id && isDeliveryRec(j.r));
    const balls = mine.filter((j) => j.r.legal).length;
    const runs = mine.reduce((a, j) => a + charged(j.r), 0);
    const wkts = recs.filter((j) => j.r.bowlerId === id && bowlersWicket(j.r)).length;
    const dots = mine.filter((j) => j.r.legal && charged(j.r) === 0).length;
    const econ = (b: number, r: number) => (b ? ((r / b) * bpo).toFixed(2) : '–');
    const phaseEcon = (['pp', 'middle', 'death'] as Phase[]).reduce((acc, ph) => {
      const p = mine.filter((j) => j.phase === ph);
      acc[ph] = econ(p.filter((j) => j.r.legal).length, p.reduce((a, j) => a + charged(j.r), 0));
      return acc;
    }, {} as Record<Phase, string>);
    const t = (s.bowlTypes ?? {})[id] as BowlType | undefined;
    const row: BowlerRow = {
      id, name: s.bowling[id]?.name || mine[0]?.r.bowlerName || 'Bowler', ...(t ? { type: BOWL_TYPE_LABEL[t] } : {}),
      balls, overs: oversStr(balls, bpo), maidens: maidens[id] ?? 0, runs, wkts, econ: econ(balls, runs),
      dots, dotPct: pct(dots, balls),
      fours: mine.filter((j) => boundaryOf(j.r) === 4).length, sixes: mine.filter((j) => boundaryOf(j.r) === 6).length,
      wides: mine.filter((j) => j.r.ext === 'wd').length, noBalls: mine.filter((j) => j.r.ext === 'nb').length,
      phaseEcon,
    };
    const ctl = mine.filter((j) => j.r.trk?.ctrl && faced(j.r));
    if (ctl.length) row.falseShotPct = pct(ctl.filter((j) => j.d?.ctrl).length, ctl.length);
    const kph = mine.map((j) => j.d?.kph).filter((k): k is number => !!k);
    if (kph.length) row.speed = { avg: (kph.reduce((a, b) => a + b, 0) / kph.length).toFixed(1), max: Math.max(...kph), n: kph.length };
    return row;
  });
}

// ─── Matchups ─────────────────────────────────────────────────────────────────

export interface Matchup { bowlerId: string; bowler: string; runs: number; balls: number; outs: number; dots: number; fours: number; sixes: number }
/** Batter vs bowler in `side`'s innings: batterId → one line per bowler faced. */
export function matchups(s: CricketState, side: Side): Record<string, Matchup[]> {
  const out: Record<string, Record<string, Matchup>> = {};
  for (const { r } of inningsRecs(s, side)) {
    if (!isDeliveryRec(r) || !r.strikerId || !r.bowlerId) continue;
    const m = ((out[r.strikerId] ??= {})[r.bowlerId] ??= {
      bowlerId: r.bowlerId, bowler: s.bowling[r.bowlerId]?.name || r.bowlerName || 'Bowler', runs: 0, balls: 0, outs: 0, dots: 0, fours: 0, sixes: 0,
    });
    m.runs += r.bat;
    if (faced(r)) m.balls += 1;
    if (faced(r) && r.bat === 0) m.dots += 1;
    const bd = boundaryOf(r);
    if (bd === 4) m.fours += 1;
    if (bd === 6) m.sixes += 1;
    if (bowlersWicket(r) && r.out!.id === r.strikerId) m.outs += 1;
  }
  return Object.fromEntries(Object.entries(out).map(([id, by]) => [id, Object.values(by).sort((a, b) => b.balls - a.balls)]));
}

// ─── Pitch map ────────────────────────────────────────────────────────────────

export interface PitchDot { len?: Length; line?: Line; tone: 'wicket' | 'boundary' | 'dot' | 'run' | 'extra'; bowlerId?: string; kph?: number }
/** The tagged deliveries bowled at `side`'s innings (optionally one bowler's). */
export function pitchDots(s: CricketState, side: Side, bowlerId?: string): PitchDot[] {
  return inningsRecs(s, side)
    .filter((j) => isDeliveryRec(j.r) && (j.d?.len || j.d?.line) && (!bowlerId || j.r.bowlerId === bowlerId))
    .map(({ r, d }) => ({
      len: d!.len, line: d!.line, bowlerId: r.bowlerId, ...(d!.kph ? { kph: d!.kph } : {}),
      tone: wicketFor(r) ? 'wicket' : boundaryOf(r) ? 'boundary' : r.ext ? 'extra' : r.bat > 0 ? 'run' : 'dot',
    }));
}
/** Counts per length × line cell ("good:off" → 12), for the grid. */
export function pitchGrid(dots: PitchDot[]): Record<string, number> {
  const g: Record<string, number> = {};
  for (const d of dots) if (d.len && d.line) g[`${d.len}:${d.line}`] = (g[`${d.len}:${d.line}`] ?? 0) + 1;
  return g;
}

// ─── Time at the crease ───────────────────────────────────────────────────────

/**
 * Minutes each batter spent at the crease (Statsguru "M"), from stamped balls:
 * in when the previous batter was out (or the innings' first ball), out at
 * their own dismissal (or the innings' last ball). Only for batters whose
 * whole stay is stamped — never a guess.
 */
export function minutesBatted(s: CricketState, side: Side): Record<string, number> {
  const recs = (s.log ?? []).filter((r) => r.side === side && !r.cross);
  if (!recs.length || recs.some((r) => isDeliveryRec(r) && !r.t)) return {};
  const inAt: Record<string, number> = {};
  const outAt: Record<string, number> = {};
  let lastOutT = recs[0].t!;
  for (const r of recs) {
    for (const id of [r.strikerId, r.nonStrikerId]) if (id && inAt[id] === undefined) inAt[id] = lastOutT;
    if (r.out && r.t) { outAt[r.out.id] = r.t; lastOutT = r.t; }
  }
  const end = recs[recs.length - 1].t!;
  const out: Record<string, number> = {};
  for (const id of Object.keys(inAt)) {
    const card = s.batting[id];
    const stop = card?.out || card?.retired ? outAt[id] : end;
    if (stop === undefined) continue;
    out[id] = Math.max(0, Math.round((stop - inAt[id]) / 60000));
  }
  return out;
}

// ─── Charts ───────────────────────────────────────────────────────────────────

export interface WormPoint { over: number; cum: number; wkts: number; runs: number; wktsInOver: number }
/** Cumulative runs per over for a side's innings (the worm) — also the Manhattan. */
export function worm(s: CricketState, side: Side): WormPoint[] {
  return overHistory(s, side).map((o) => ({ over: o.over, cum: o.cum, wkts: o.cumW, runs: o.runs, wktsInOver: o.wkts }));
}

// ─── Summary card (Cricinfo "match summary") ──────────────────────────────────

export interface InningsTop {
  side: Side;
  total: string;
  bat: { id: string; name: string; line: string }[];
  bowl: { id: string; name: string; line: string }[];
}
/** The top 3 batters (runs, then fewer balls) and bowlers (wickets, then fewer runs) of `side`'s innings. */
export function inningsTop(s: CricketState, side: Side, n = 3): InningsTop {
  const bpo = s.ballsPerOver;
  const sc = s.scores[side];
  const bat = Object.entries(s.batting).filter(([, c]) => c.side === side && (c.balls > 0 || c.runs > 0 || c.out))
    .sort(([, a], [, b]) => b.runs - a.runs || a.balls - b.balls).slice(0, n)
    .map(([id, c]) => ({ id, name: c.name || 'Batter', line: `${c.runs}${c.out ? '' : '*'} (${c.balls})` }));
  const bowl = Object.entries(s.bowling).filter(([, b]) => b.side === other(side) && b.balls + b.runs > 0)
    .sort(([, a], [, b]) => b.wickets - a.wickets || a.runs - b.runs || b.balls - a.balls).slice(0, n)
    .map(([id, b]) => ({ id, name: b.name || 'Bowler', line: `${b.wickets}/${b.runs} (${oversStr(b.balls, bpo)})` }));
  return { side, total: `${sc.runs}/${sc.wickets} (${oversStr(sc.balls, bpo)} ov)`, bat, bowl };
}

/** Does the match carry any of the optional detail (for the Stats tab's chips)? */
export function trackedKinds(s: CricketState): { pitch: boolean; control: boolean; speed: boolean; types: boolean; shots: boolean } {
  const log = s.log ?? [];
  return {
    pitch: (s.detail ?? []).some((d) => d.len || d.line),
    control: log.some((r) => r.trk?.ctrl),
    speed: (s.detail ?? []).some((d) => d.kph),
    types: Object.keys(s.bowlTypes ?? {}).length > 0,
    shots: (s.shots ?? []).length > 0,
  };
}
