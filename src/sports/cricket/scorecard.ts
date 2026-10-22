/**
 * Cricket scorecard depth (parity #19) — PURE selectors over the reducer's
 * derived ball log (`state.log`): extras breakdown, fall of wickets,
 * partnerships, over history (Manhattan / worm), maidens / wides / no-balls per
 * bowler, and `statTotals` — the absolute per-player match figures the stat
 * sync writes at completion and on a correction.
 *
 * A persisted snapshot has no `log` (it is rebuilt by replaying the event log),
 * so every selector degrades to an empty result and the UI hides those rows.
 * No React Native imports — node tests load this file (note the `.ts` imports).
 */
import { oversStr, other, NO_BOWLER, type BallRec, type CricketState, type FieldNote } from './engine.ts';
import { detailByRec, isDeliveryRec as isDeliveryRec2, isPace } from './detail.ts';
import { phasePlan, phaseOf, type Phase } from './phases.ts';

type Side = 'home' | 'away';

/** Does this state carry a ball log (i.e. was it rebuilt by replay)? */
export const hasLog = (s: Pick<CricketState, 'log'>): boolean => Array.isArray(s.log);

const recs = (s: Pick<CricketState, 'log'>, side: Side): BallRec[] => (s.log ?? []).filter((r) => r.side === side);

/** Dismissals that are a wicket (retired hurt ends a partnership but isn't one). */
const isWicket = (r: BallRec) => !!r.out && r.out.kind !== 'retired';

/** A real delivery (chip in the over strip) — not a penalty, retirement or Mankad. */
const isDelivery = (r: BallRec) => r.sym !== undefined && r.out?.kind !== 'mankad';

/** Runs the bowler is charged on this ball (mirrors BowlCard: never byes, leg byes or penalties). */
export const charged = (r: BallRec) => r.bat + r.wd + r.nb;

/** Team runs on this ball, extras included (and a #20 bonus / deduction, so an
 *  over's runs always add up to the worm's `cum`). */
const teamRuns = (r: BallRec) => r.bat + r.wd + r.nb + r.b + r.lb + (r.pen ?? 0) + (r.adj ?? 0);

/** A boundary off the bat: a '4' / '6' chip, or 4 / 6 off the bat on a no-ball
 *  (the log doesn't keep a no-ball's all-run flag — read as a boundary). The
 *  match Stats tab (matchStats.ts re-exports it) and the new-era careers. */
export const boundaryOf = (r: BallRec): 0 | 4 | 6 => {
  if (r.sym === '4' || r.sym === '6') return Number(r.sym) as 4 | 6;
  if (r.ext === 'nb' && (r.bat === 4 || r.bat === 6) && r.b + r.lb === 0) return r.bat as 4 | 6;
  return 0;
};

export interface Extras { b: number; lb: number; wd: number; nb: number; pen: number }

/** Byes, leg byes, wides, no-balls and penalty runs conceded while `side` batted. */
export function extrasBreakdown(s: Pick<CricketState, 'log'>, side: Side): Extras {
  const out: Extras = { b: 0, lb: 0, wd: 0, nb: 0, pen: 0 };
  for (const r of recs(s, side)) {
    out.b += r.b; out.lb += r.lb; out.wd += r.wd; out.nb += r.nb; out.pen += r.pen ?? 0;
  }
  return out;
}

/** "b 1, lb 2, wd 6, nb 3" — only the non-zero parts ('' when none). */
export function extrasText(e: Extras): string {
  return ([['b', e.b], ['lb', e.lb], ['wd', e.wd], ['nb', e.nb], ['pen', e.pen]] as const)
    .filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ');
}

export interface FallOfWicket { n: number; runs: number; overs: string; name: string }

/** Each wicket in order: "1-12 (Asha, 2.3 ov)". Retired hurt isn't a wicket. */
export function fallOfWickets(s: Pick<CricketState, 'log' | 'ballsPerOver'>, side: Side): FallOfWicket[] {
  return recs(s, side).filter(isWicket).map((r) => ({ n: r.tw, runs: r.tr, overs: oversStr(r.lb6, s.ballsPerOver), name: r.out!.name }));
}

export const fowText = (f: FallOfWicket[]): string => f.map((w) => `${w.n}-${w.runs} (${w.name}, ${w.overs} ov)`).join(', ');

export interface Partnership {
  /** for the Nth wicket (a retired-hurt break keeps the same N) */
  wkt: number;
  runs: number;
  balls: number;
  a: { id?: string; name: string; runs: number; balls: number };
  b: { id?: string; name: string; runs: number; balls: number };
  unbroken: boolean;
}

/** Partnerships in order. One breaks at every dismissal (incl. retired hurt)
 *  or when the pair at the crease changes. `runs`/`balls` are the team's
 *  (extras included, legal balls); each batter's share is runs off the bat and
 *  balls faced (a no-ball is faced, a wide is not). */
export function partnerships(s: Pick<CricketState, 'log' | 'batting'>, side: Side): Partnership[] {
  const out: Partnership[] = [];
  const nameOf = (id?: string) => (id ? s.batting[id]?.name : undefined) || 'Batter';
  let cur: Partnership | null = null;
  let wkts = 0;
  const start = (r: BallRec): Partnership => ({
    wkt: wkts + 1, runs: 0, balls: 0, unbroken: true,
    a: { id: r.strikerId, name: nameOf(r.strikerId), runs: 0, balls: 0 },
    b: { id: r.nonStrikerId, name: nameOf(r.nonStrikerId), runs: 0, balls: 0 },
  });
  const samePair = (p: Partnership, r: BallRec) => {
    const ids = new Set([p.a.id, p.b.id]);
    return ids.has(r.strikerId) && ids.has(r.nonStrikerId);
  };
  for (const r of recs(s, side)) {
    // A bonus / deduction, or a penalty awarded while the other side batted
    // (parity #20), belongs to no partnership.
    if (r.adj !== undefined || r.cross) continue;
    if (cur && !samePair(cur, r)) { out.push(cur); cur = null; } // a substitution without a dismissal
    if (!cur) cur = start(r);
    cur.runs += teamRuns(r);
    if (r.legal) cur.balls += 1;
    const who = r.strikerId === cur.a.id ? cur.a : r.strikerId === cur.b.id ? cur.b : null;
    if (who) {
      who.runs += r.bat;
      // faced: any legal ball that isn't a wide, and every no-ball
      if (r.ext === 'nb' || (r.legal && r.ext !== 'wd' && isDelivery(r))) who.balls += 1;
    }
    if (r.out) {
      cur.unbroken = false;
      out.push(cur);
      cur = null;
      if (isWicket(r)) wkts = r.tw;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export interface OverRow {
  /** 1-based over number */
  over: number;
  bowlerName: string;
  /** team runs in the over (Manhattan) */
  runs: number;
  wkts: number;
  syms: string[];
  /** team total at the end of the over (worm) */
  cum: number;
  /** wickets down at the end of the over ("54/2") */
  cumW: number;
}

/** 0-based over each record belongs to. Wides / no-balls belong to the over in
 *  progress; a penalty or retirement (no chip) to the over of the last chip. */
function overIndexes(list: BallRec[], bpo: number): number[] {
  let last = 0;
  return list.map((r) => {
    if (r.sym === undefined) return last;
    last = r.legal ? Math.floor((r.lb6 - 1) / bpo) : Math.floor(r.lb6 / bpo);
    return last;
  });
}

/** Over-by-over history of `side`'s innings. */
export function overHistory(s: Pick<CricketState, 'log' | 'ballsPerOver'>, side: Side): OverRow[] {
  const list = recs(s, side);
  const ix = overIndexes(list, s.ballsPerOver);
  const rows = new Map<number, OverRow & { bowlers: string[] }>();
  list.forEach((r, i) => {
    let row = rows.get(ix[i]);
    if (!row) { row = { over: ix[i] + 1, bowlerName: '', bowlers: [], runs: 0, wkts: 0, syms: [], cum: 0, cumW: 0 }; rows.set(ix[i], row); }
    row.runs += teamRuns(r);
    if (isWicket(r)) row.wkts += 1;
    if (r.sym !== undefined) row.syms.push(r.sym);
    if (isDelivery(r) && r.bowlerName && !row.bowlers.includes(r.bowlerName)) row.bowlers.push(r.bowlerName);
    row.cum = r.tr;
    row.cumW = r.tw;
  });
  return [...rows.values()].sort((a, b) => a.over - b.over).map(({ bowlers, ...row }) => ({ ...row, bowlerName: bowlers.join(' / ') }));
}

export interface BowlerSplit { maidens: number; wides: number; noBalls: number }

/** Maidens, wides and no-balls per bowler id for the bowling side against
 *  `side`'s innings. A maiden is a complete over (`bpo` legal balls) bowled by
 *  ONE bowler with nothing charged to him (`bat + wd + nb = 0`; byes / leg byes
 *  don't spoil it). An over shared after a mid-over replacement is no maiden
 *  for either bowler. */
export function bowlerSplits(s: Pick<CricketState, 'log' | 'ballsPerOver'>, side: Side): Record<string, BowlerSplit> {
  const out: Record<string, BowlerSplit> = {};
  const get = (id: string) => (out[id] ??= { maidens: 0, wides: 0, noBalls: 0 });
  const list = recs(s, side);
  const ix = overIndexes(list, s.ballsPerOver);
  const overs = new Map<number, BallRec[]>();
  list.forEach((r, i) => {
    if (!isDelivery(r)) return;
    if (r.bowlerId) {
      if (r.ext === 'wd') get(r.bowlerId).wides += 1;
      if (r.ext === 'nb') get(r.bowlerId).noBalls += 1;
    }
    const o = overs.get(ix[i]) ?? [];
    o.push(r);
    overs.set(ix[i], o);
  });
  for (const balls of overs.values()) {
    const ids = new Set(balls.map((r) => r.bowlerId));
    const id = balls[0].bowlerId;
    if (!id || ids.size !== 1) continue;
    if (balls.filter((r) => r.legal).length < s.ballsPerOver) continue;
    if (balls.some((r) => charged(r) !== 0)) continue;
    get(id).maidens += 1;
  }
  return out;
}

/** Deep wave — the optional-depth keys (see `deepTotals`). */
export const DEEP_TOTAL_KEYS = [
  'bPace', 'rPace', 'oPace', 'bSpin', 'rSpin', 'oSpin',
  'ctlBalls', 'falseShots', 'ctlBowled', 'fsInduced',
  'kphN', 'kphSum', 'kphMax',
] as const;

/** Round 2 — the new-era keys (see `eraTotals`). */
export const ERA_TOTAL_KEYS = [
  'newEra', 'dotsF', 'bndRuns',
  'ballsPP', 'runsPP', 'ballsMid', 'runsMid', 'ballsDeath', 'runsDeath',
] as const;
/** Round 2 — direct-hit run outs (a fielder with one). */
export const DIRECT_HIT_KEY = 'directHits';

/** The stat keys `statTotals` owns (absolute at sync time). */
export const CRICKET_TOTAL_KEYS = [
  'runs', 'ballsFaced', 'fours', 'sixes', 'innings', 'notOut',
  'wickets', 'ballsBowled', 'runsConceded', 'maidens', 'dots', 'wides', 'noBalls',
  'catches', 'stumpings', 'runouts',
  // parity #20 — only on fielders with a fielding note
  'dropped', 'runsSaved', 'runsMissed',
  // SD-69 — only on the captains / keepers (from SET_CAPTAIN / SET_KEEPER)
  'capt', 'wk', 'wkCatches',
  // SD-133 (CK-11) — wagon wheel: runs per zone + tagged shots; only in a match
  // that tagged any shot (every batter then carries them, 0 when none)
  'wz1', 'wz2', 'wz3', 'wz4', 'wz5', 'wz6', 'wz7', 'wz8', 'wwShots',
  // Deep wave — only in a match that captured them (`deepTotals`): batting vs
  // pace / spin (bowler types), shot control (false shots), ball speed
  ...DEEP_TOTAL_KEYS,
  // Round 2 — only on a new-era match (`eraTotals`); direct hits only on a
  // fielder who made one
  ...ERA_TOTAL_KEYS, DIRECT_HIT_KEY,
] as const;

/**
 * Round 2 — the NEW-ERA marker. A match is "new-era" when its ball log carries
 * the scorer's device time stamps (`BallRec.t`, `payload.at`): every ball
 * tapped on the app from the deep wave on is stamped; no older match has one.
 * Only a new-era match writes the figures below to careers, so the totals of
 * every older match stay byte-identical (the frozen replay test pins that) and
 * the career rows built on them count only the matches that carry them.
 * (Voice-scored balls aren't stamped yet: a match scored ONLY by voice reads as
 * an older one.)
 */
export const isNewEra = (s: Pick<CricketState, 'log'>): boolean => (s.log ?? []).some((r) => r.t !== undefined && !r.cross);

/**
 * Round 2 — the new-era career figures, absolute, for a new-era match only
 * (`{}` otherwise):
 *   - every player in the match: `newEra` = 1 (the marker on the line);
 *   - batters: dot balls faced (`dotsF`: a ball faced with no run off the bat)
 *     and runs in boundaries (`bndRuns`: 4s and 6s off the bat) — career dot %
 *     = dotsF ÷ balls faced, boundary % = bndRuns ÷ runs, over new-era lines;
 *   - bowlers: legal balls and runs conceded in each PHASE the match has
 *     (powerplay / middle / death — the organiser's phases, phases.ts):
 *     `ballsPP runsPP`, `ballsMid runsMid`, `ballsDeath runsDeath` (0 when the
 *     bowler didn't bowl in that phase; left out when the match has no such
 *     phase — a Test, a match with "None").
 * Regulation innings only (a Super Over is a separate state).
 */
export function eraTotals(s: CricketState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  if (!isNewEra(s)) return out;
  const log = s.log ?? [];
  const entry = (id: string, side: Side) => (out[id] ??= { side, stats: { newEra: 1 } }).stats;
  const PK: Record<Phase, [string, string]> = { pp: ['ballsPP', 'runsPP'], middle: ['ballsMid', 'runsMid'], death: ['ballsDeath', 'runsDeath'] };
  const plans = { 1: phasePlan(s, 1), 2: phasePlan(s, 2) };
  const phases = new Set<Phase>([...(plans[1]?.phases ?? []), ...(plans[2]?.phases ?? [])]);
  for (const [id, c] of Object.entries(s.batting)) Object.assign(entry(id, c.side), { dotsF: 0, bndRuns: 0 });
  for (const [id, c] of Object.entries(s.bowling)) {
    if (!c.balls && !c.runs && !c.wickets && !(c.overs?.length)) continue;
    const st = entry(id, c.side);
    for (const p of phases) { st[PK[p][0]] = 0; st[PK[p][1]] = 0; }
  }
  const faced = (r: BallRec) => r.ext === 'nb' || (r.legal && r.ext !== 'wd');
  for (const r of log) {
    if (r.cross || !isDeliveryRec2(r)) continue;
    const bat = r.strikerId ? out[r.strikerId]?.stats : undefined;
    if (bat && 'dotsF' in bat) {
      if (faced(r) && r.bat === 0) bat.dotsF += 1;
      bat.bndRuns += boundaryOf(r);
    }
    const bowl = r.bowlerId ? out[r.bowlerId]?.stats : undefined;
    const plan = plans[r.inn];
    if (!bowl || !plan) continue;
    const [bk, rk] = PK[phaseOf(r, plan)];
    if (!(bk in bowl)) continue;
    if (r.legal) bowl[bk] += 1;
    bowl[rk] += charged(r);
  }
  return out;
}

/**
 * Deep wave — the optional depth as absolute per-player figures, ONLY for a
 * match that captured it (an older match has none of it, so its totals are
 * unchanged — the frozen replay test pins that):
 *   - bowler types known → every batter: balls / runs off the bat / dismissals
 *     vs pace (bPace rPace oPace) and vs spin (bSpin rSpin oSpin), over the
 *     balls bowled by a typed bowler (an untyped bowler's balls aren't counted);
 *   - shot control tracked → batters: tracked balls faced + false shots
 *     (ctlBalls, falseShots); bowlers: tracked balls bowled + false shots
 *     induced (ctlBowled, fsInduced). An untagged tracked ball = in control;
 *   - speed clocked → bowlers: balls clocked, their sum and the fastest (kphN,
 *     kphSum, kphMax).
 * Regulation innings only (a Super Over is a separate state).
 */
export function deepTotals(s: CricketState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const log = s.log ?? [];
  if (!log.length) return out;
  const types = s.bowlTypes ?? {};
  const typed = Object.keys(types).length > 0;
  const det = detailByRec(log, s.detail, s.ballsPerOver);
  const ctlOn = log.some((r) => r.trk?.ctrl);
  const clocked = det.some((d) => d?.kph);
  if (!typed && !ctlOn && !clocked) return out;
  const entry = (id: string, side: Side) => (out[id] ??= { side, stats: {} }).stats;
  if (typed) {
    for (const [id, c] of Object.entries(s.batting)) Object.assign(entry(id, c.side), { bPace: 0, rPace: 0, oPace: 0, bSpin: 0, rSpin: 0, oSpin: 0 });
  }
  const faced = (r: BallRec) => r.ext === 'nb' || (r.legal && r.ext !== 'wd' && isDeliveryRec2(r));
  log.forEach((r, i) => {
    if (r.cross || !isDeliveryRec2(r)) return;
    const d = det[i];
    const bat = r.strikerId && s.batting[r.strikerId] ? entry(r.strikerId, s.batting[r.strikerId].side) : undefined;
    const bowlSide = other(r.side);
    const bowl = r.bowlerId ? entry(r.bowlerId, s.bowling[r.bowlerId]?.side ?? bowlSide) : undefined;
    const t = r.bowlerId ? types[r.bowlerId] : undefined;
    if (typed && t && bat) {
      const k = isPace(t) ? 'Pace' : 'Spin';
      bat[`r${k}`] += r.bat;
      if (faced(r)) bat[`b${k}`] += 1;
      if (r.out && r.out.kind !== 'retired' && !NO_BOWLER.includes(r.out.kind) && r.out.id === r.strikerId) bat[`o${k}`] += 1;
    }
    if (r.trk?.ctrl && faced(r)) {
      const fs = d?.ctrl ? 1 : 0;
      if (bat) { bat.ctlBalls = (bat.ctlBalls ?? 0) + 1; bat.falseShots = (bat.falseShots ?? 0) + fs; }
      if (bowl) { bowl.ctlBowled = (bowl.ctlBowled ?? 0) + 1; bowl.fsInduced = (bowl.fsInduced ?? 0) + fs; }
    }
    if (d?.kph && bowl) {
      bowl.kphN = (bowl.kphN ?? 0) + 1;
      bowl.kphSum = (bowl.kphSum ?? 0) + d.kph;
      bowl.kphMax = Math.max(bowl.kphMax ?? 0, d.kph);
    }
  });
  // drop entries that ended up empty (a bowler entry touched by nothing)
  for (const [id, e] of Object.entries(out)) if (!Object.keys(e.stats).length) delete out[id];
  return out;
}

/** FIELD_NOTE kind → the fielder stat it credits (parity #20). */
export const FIELD_NOTE_STAT = { drop: 'dropped', saved: 'runsSaved', missed: 'runsMissed' } as const;
/** What a note credits: one per drop; the runs for saved / missed. */
export const fieldNoteCredit = (n: Pick<FieldNote, 'kind' | 'runs'>): number => (n.kind === 'drop' ? 1 : n.runs ?? 0);

/** "+2, −5 (hit the net; out-of-arena)" — `side`'s bonus / deductions ('' when none). */
export function adjustmentsText(s: Pick<CricketState, 'adj'>, side: Side): string {
  const list = (s.adj ?? []).filter((x) => x.side === side);
  if (!list.length) return '';
  const nums = list.map((x) => (x.runs > 0 ? `+${x.runs}` : `\u2212${-x.runs}`)).join(', ');
  const why = list.map((x) => x.reason).filter(Boolean).join('; ');
  return `${nums}${why ? ` (${why})` : ''}`;
}

/** "Ravi 1 drop · Asha 6 saved · Veer 4 missed" — fielding notes by the side
 *  fielding against `side`'s innings ('' when none). */
export function fieldingNotesText(s: Pick<CricketState, 'fieldNotes'>, side: Side): string {
  const by = new Map<string, { name: string; drop: number; saved: number; missed: number }>();
  for (const n of s.fieldNotes ?? []) {
    if (n.side !== other(side)) continue;
    const e = by.get(n.fielderId) ?? { name: n.fielderName || 'Fielder', drop: 0, saved: 0, missed: 0 };
    e[n.kind] += fieldNoteCredit(n);
    by.set(n.fielderId, e);
  }
  return [...by.values()].map((e) => [
    e.drop ? `${e.drop} drop${e.drop === 1 ? '' : 's'}` : '',
    e.saved ? `${e.saved} saved` : '',
    e.missed ? `${e.missed} missed` : '',
  ].filter(Boolean).map((p, i) => (i === 0 ? `${e.name} ${p}` : p)).join(', ')).join(' \u00b7 ');
}

/** Absolute per-player match figures (regulation innings only — a Super Over is
 *  a tie-breaker and isn't counted in careers). Batting from BatCard (no-ball
 *  and run-out runs already right; `runsAs` respected), bowling from BowlCard
 *  plus `bowlerSplits`, fielding from `dismissals` (+ #20 fielding notes). Maidens / wides / no-balls
 *  need the log; without it those keys are left out (never zeroed). */
export function statTotals(s: CricketState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const entry = (id: string, side: Side) => (out[id] ??= { side, stats: {} });
  const sideOfBatter = new Map<string, Side>();
  for (const [id, c] of Object.entries(s.batting)) {
    sideOfBatter.set(id, c.side);
    Object.assign(entry(id, c.side).stats, {
      runs: c.runs, ballsFaced: c.balls, fours: c.fours, sixes: c.sixes, innings: 1, notOut: c.out ? 0 : 1,
    });
  }
  // SD-133 (CK-11) — the wagon wheel per batter, absolute like everything else.
  if (s.shots?.length) {
    for (const id of Object.keys(s.batting)) {
      const st = out[id].stats;
      for (let z = 1; z <= 8; z++) st[`wz${z}`] = 0;
      st.wwShots = 0;
    }
    for (const x of s.shots) {
      const st = out[x.batterId]?.stats;
      if (!st || !x.zone) continue;
      st[`wz${x.zone}`] += x.runs;
      st.wwShots += 1;
    }
  }
  const log = hasLog(s);
  const splits = { ...bowlerSplits(s, 'home'), ...bowlerSplits(s, 'away') };
  for (const [id, c] of Object.entries(s.bowling)) {
    // a bowler named but who never bowled a ball has no figures
    if (!c.balls && !c.runs && !c.wickets && !(c.overs?.length)) continue;
    const st = entry(id, c.side).stats;
    Object.assign(st, { wickets: c.wickets, ballsBowled: c.balls, runsConceded: c.runs, dots: c.dots });
    if (log) Object.assign(st, { maidens: splits[id]?.maidens ?? 0, wides: splits[id]?.wides ?? 0, noBalls: splits[id]?.noBalls ?? 0 });
  }
  const fielding: Record<string, { catches: number; stumpings: number; runouts: number; side?: Side }> = {};
  for (const d of s.dismissals) {
    const stat = d.kind === 'caught' ? 'catches' : d.kind === 'stumped' ? 'stumpings' : d.kind === 'runout' || d.kind === 'mankad' ? 'runouts' : null;
    if (!stat || !d.fielderId) continue;
    const f = (fielding[d.fielderId] ??= { catches: 0, stumpings: 0, runouts: 0 });
    f[stat] += 1;
    const outSide = d.outId ? sideOfBatter.get(d.outId) : undefined;
    if (outSide) f.side = other(outSide);
  }
  for (const [id, f] of Object.entries(fielding)) {
    const side = out[id]?.side ?? f.side ?? s.bowling[id]?.side;
    if (!side) continue;
    Object.assign(entry(id, side).stats, { catches: f.catches, stumpings: f.stumpings, runouts: f.runouts });
  }
  // Round 2 — direct-hit run outs: only on a fielder who made one (the chip is
  // optional, so a run out without it isn't "not a direct hit").
  for (const d of s.dismissals) {
    if (!d.direct || !d.fielderId || !out[d.fielderId]) continue;
    const st = out[d.fielderId].stats;
    st[DIRECT_HIT_KEY] = (st[DIRECT_HIT_KEY] ?? 0) + 1;
  }
  // Fielding notes (parity #20): a fielder with any note carries all three
  // keys (absolute, so they agree with the FIELD_NOTE attribution increments).
  for (const n of s.fieldNotes ?? []) {
    const st = entry(n.fielderId, out[n.fielderId]?.side ?? n.side).stats;
    for (const k of Object.values(FIELD_NOTE_STAT)) st[k] ??= 0;
    st[FIELD_NOTE_STAT[n.kind]] += fieldNoteCredit(n);
  }
  // SD-69 — captain / keeper flags (SET_CAPTAIN / SET_KEEPER, no reducer
  // change) and keeper catches: a catch taken by the fielding side's keeper.
  // `keepers` holds each side's keeper at the end, so after a mid-match change
  // of gloves the last keeper is the one flagged and credited (the reducer
  // keeps no per-ball keeper; stumpings already go to the keeper of the time).
  for (const side of ['home', 'away'] as const) {
    const c = s.captains?.[side];
    if (c?.id) entry(c.id, out[c.id]?.side ?? side).stats.capt = 1;
    const k = s.keepers?.[side];
    if (!k?.id) continue;
    const st = entry(k.id, out[k.id]?.side ?? side).stats;
    st.wk = 1;
    st.wkCatches = s.dismissals.filter((d) => d.kind === 'caught' && d.fielderId === k.id
      && (d.outId ? sideOfBatter.get(d.outId) !== side : true)).length;
  }
  // Every involved player carries the fielding keys (0 when none), so a
  // correction that moves a catch away zeroes it.
  for (const e of Object.values(out)) for (const k of ['catches', 'stumpings', 'runouts']) e.stats[k] ??= 0;
  // Deep wave — the optional depth (only a match that captured it has any).
  for (const [id, e] of Object.entries(deepTotals(s))) {
    const st = entry(id, out[id]?.side ?? e.side).stats;
    Object.assign(st, e.stats);
    for (const k of ['catches', 'stumpings', 'runouts']) st[k] ??= 0;
  }
  // Round 2 — the new-era figures (a new-era match only), and its marker on
  // every line of the match.
  const era = eraTotals(s);
  if (Object.keys(era).length) {
    for (const [id, e] of Object.entries(era)) Object.assign(entry(id, out[id]?.side ?? e.side).stats, e.stats);
    for (const e of Object.values(out)) e.stats.newEra = 1;
  }
  return out;
}
