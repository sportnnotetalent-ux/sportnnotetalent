/**
 * SD-96 — shooting (ISSF) on the results engine. Pure.
 *
 *  - an event = a qualification (match) phase, then — for 10 m air rifle /
 *    pistol and 50 m 3 positions — an elimination final of the best 8 (or a
 *    smaller final at a school meet); without a final the match decides medals;
 *  - entry by series (the total of 10 shots + its inner tens — how school
 *    ranges score paper targets) or shot by shot (decimal 10.9 … or integer
 *    0–10 / X); a series can never exceed 10.9 × shots (decimal) or 10 × shots,
 *    and an unusually low one asks first (SD-112 pattern);
 *  - ranking and the final's eliminations / shoot-offs are in shootingRank.ts;
 *  - stat lines (best match score, points and shots for the average per
 *    series, inner tens, finals reached, medals), the career, records (on the
 *    qualification / match score — a final score is not a record), meet points.
 */
import type { Category, DisciplineDef, EntryResult, PhaseFormat, RankedEntry, ResultEntry } from './model.ts';
import { categoryLabel, disciplineOf } from './model.ts';
import type { Award } from './medals.ts';
import { finalState, isFinalRows, type FinalState } from './shootingRank.ts';
import { isShootMatchRows, shootMatchState } from './shootMatch.ts';
import { isTeamRow, teamLines, teamCareer } from './teamEvents.ts';
import { shootTeamOf } from './shootingDefs.ts';
import { maxShot, seriesCount, shootEventOf, sumTenths, fromTenths, tenths, positionOf, finalPenaltyTotal, POSITION_LABEL, type ShootEventDef, type ShotScoring } from './shootingDefs.ts';

export * from './shootingDefs.ts';
export { finalState, isFinalRows, qualKeys, rankShootFinal, type FinalState, type FinalElimination } from './shootingRank.ts';

/* --------------------------------- format --------------------------------- */

/** "586" / "629.4" / "118" — a score at its scoring precision. */
export const scoreText = (v: number | null | undefined, s: ShotScoring): string => (v == null ? '–' : s === 'decimal' ? v.toFixed(1) : String(Math.round(v)));

/** ISSF style: "586-24x" (integer with inner tens), "629.4", "118". */
export const totalText = (mark: number | null | undefined, xs: number | undefined, s: ShotScoring): string =>
  (mark == null ? '–' : s === 'integer' && xs != null ? `${scoreText(mark, s)}-${xs}x` : scoreText(mark, s));

/** The shot count of a match (the category's shorter match, or the standard). */
export const shotsOf = (ev: ShootEventDef, cat?: Category): number => cat?.shots ?? ev.shots;

/** The ISSF event behind a discipline. */
export const shootEvent = (def?: Pick<DisciplineDef, 'key'> | null): ShootEventDef | undefined => shootEventOf(def?.key);

/* -------------------------------- validation ------------------------------- */

const isTenth = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-6;

/** A qualification shot as typed: "10.4", "9", "X" (an inner ten, integer). Error text or the value. */
export function parseShot(text: string, s: ShotScoring): { value: number | 'X' } | { error: string } {
  const t = text.trim().toUpperCase().replace(',', '.');
  if (!t) return { error: 'Type the shot.' };
  if (s === 'integer' && (t === 'X' || t === '10X' || t === 'X10')) return { value: 'X' };
  const v = Number(t);
  if (!Number.isFinite(v)) return { error: `Can't read "${text}".` };
  return shotError(v, s) ? { error: shotError(v, s)! } : { value: v };
}

/** Is this a possible shot value? decimal: 0 or 1.0–10.9 in tenths; integer: 0–10; hits: 0 / 1. */
export function shotError(v: number, s: ShotScoring): string | null {
  if (s === 'hits') return v === 0 || v === 1 ? null : 'A target is hit (1) or missed (0).';
  if (s === 'integer') return Number.isInteger(v) && v >= 0 && v <= 10 ? null : 'Integer scoring: 0 to 10 (X for an inner ten).';
  if (!isTenth(v)) return 'Decimal scoring: one decimal (10.4).';
  if (v === 0 || (v >= 1 && v <= 10.9)) return null;
  return 'Decimal scoring: 0 (a miss) or 1.0 to 10.9.';
}

/** A final shot is always decimal (ISSF finals, rifle and pistol). */
export const finalShotError = (v: number): string | null => shotError(v, 'decimal');

/** The hard limits of a series of `n` shots: never over 10.9 × n (decimal), 10 × n, or n targets. */
export function seriesError(total: number, xs: number | undefined, n: number, s: ShotScoring): string | null {
  if (!Number.isFinite(total) || total < 0) return 'Type the series total.';
  const max = tenths(maxShot(s)) * n;
  if (s === 'decimal' && !isTenth(total)) return 'Decimal scoring: one decimal (98.6).';
  if (s !== 'decimal' && !Number.isInteger(total)) return 'Whole points only.';
  if (tenths(total) > max) return `A series of ${n} can't be more than ${scoreText(max / 10, s)}.`;
  if (xs != null) {
    if (!Number.isInteger(xs) || xs < 0 || xs > n) return `Inner tens: 0 to ${n}.`;
    if (s === 'integer' && xs * 10 > total) return `${xs} inner tens make at least ${xs * 10} — more than ${total}.`;
  }
  return null;
}

/** The usual floor of a series (asks first below it): under half the maximum. */
export function seriesLow(total: number, n: number, s: ShotScoring): string | null {
  const max = maxShot(s) * n;
  if (total >= max * 0.5) return null;
  return `${scoreText(total, s)} looks low for a series of ${n} (the maximum is ${scoreText(max, s)}). Check the digits before saving.`;
}

/* ---------------------------------- entry ---------------------------------- */

/** A series from its shots: the total and the inner tens ('X'). */
export function seriesFromShots(shots: (number | 'X')[]): { total: number; xs: number } {
  return { total: fromTenths(sumTenths(shots.map((v) => (v === 'X' ? 10 : v)))), xs: shots.filter((v) => v === 'X').length };
}

/** Recompute the match total (`mark`) and inner tens (`xs`) from the series
 *  (deep wave: net of any penalty deductions, `pen`). */
export function withTotals(r: EntryResult, s: ShotScoring): EntryResult {
  const series = r.series ?? [];
  const filled = series.filter((v) => v != null);
  const xs = s === 'integer' || (r.seriesX ?? []).some((x) => x != null) ? (r.seriesX ?? []).reduce((a: number, x) => a + (x ?? 0), 0) : undefined;
  const pen = penaltyTotal(r);
  const mark = filled.length ? fromTenths(sumTenths(filled) - tenths(pen)) : undefined;
  return { ...r, mark, xs };
}

/** Deep wave: penalty points deducted over the whole match (0 without any). */
export const penaltyTotal = (r: Pick<EntryResult, 'pen'>): number => (r.pen ?? []).reduce((a: number, v) => a + (v ?? 0), 0);

/** Deep wave: series `i` net of its penalty (what ties and the sheet compare). */
export const netSeries = (r: Pick<EntryResult, 'series' | 'pen'>): number[] => (r.series ?? []).map((v, i) => fromTenths(tenths(v) - tenths(r.pen?.[i] ?? 0)));

/** The deduction for one penalty (ISSF: 2 points). */
export const PENALTY_POINTS = 2;

/**
 * Deep wave: set the penalty deducted from series `i` (0, 2, 4 … points); the
 * match total follows. A series not entered yet can't carry one.
 */
export function setPenalty(r: EntryResult, i: number, points: number, s: ShotScoring): EntryResult {
  if ((r.series ?? []).length <= i || !(points >= 0)) return r;
  const pen = [...(r.pen ?? [])];
  while (pen.length <= i) pen.push(0);
  pen[i] = points;
  const any = pen.some((v) => v > 0);
  return withTotals({ ...r, pen: any ? pen : undefined }, s);
}

/**
 * Set series `i` (0-based) of a qualification result: its total + inner tens,
 * or its shots (the total and X follow). `null` clears it (and any series after
 * it stays — a corrected middle series is fine).
 */
export function setSeries(r: EntryResult, i: number, s: ShotScoring, v: { total: number; xs?: number; shots?: (number | 'X')[] } | null): EntryResult {
  const series = [...(r.series ?? [])];
  const sx = [...(r.seriesX ?? [])];
  const shots = [...(r.shots ?? [])];
  const pen = r.pen ? [...r.pen] : undefined;
  if (v == null) {
    series.splice(i, 1); sx.splice(i, 1); shots.splice(i, 1); pen?.splice(i, 1);
    // keep later series in place: only the last series can really be cleared
  } else {
    const fromShots = v.shots ? seriesFromShots(v.shots) : null;
    while (series.length < i) series.push(0);
    series[i] = fromShots ? fromShots.total : v.total;
    const x = fromShots ? (s === 'integer' ? fromShots.xs : v.xs) : v.xs;
    while (sx.length < i) sx.push(0);
    sx[i] = x ?? 0;
    if (v.shots) { while (shots.length < i) shots.push([]); shots[i] = v.shots; }
    else if (shots[i]) shots[i] = [];
  }
  const next: EntryResult = { ...r, series, seriesX: sx, ...(shots.some((x) => x?.length) ? { shots } : { shots: undefined }), ...(r.pen ? { pen: pen?.some((x) => x > 0) ? pen : undefined } : {}) };
  return withTotals(next, s);
}

/** Series entered / due. */
export const seriesDone = (r: EntryResult): number => (r.series ?? []).length;

/** Shots in series `i` of a match of `shots` (the last series of a 25-shot round may be short). */
export const shotsInSeries = (ev: ShootEventDef, shots: number, i: number): number => Math.max(0, Math.min(ev.seriesOf, shots - i * ev.seriesOf));

/**
 * Deep wave: series shot "clean" — every shot a 10 (integer scoring: 100 in a
 * series of 10, 50 in a series of 5) or every target hit (shotgun). Decimal
 * scoring has no perfect series (10.9 every shot). As shot, before penalties.
 */
export function perfectSeries(r: Pick<EntryResult, 'series'>, ev: ShootEventDef, shots: number): number {
  if (ev.scoring === 'decimal') return 0;
  return (r.series ?? []).filter((v, i) => { const n = shotsInSeries(ev, shots, i); return n > 0 && v === n * (ev.scoring === 'hits' ? 1 : 10); }).length;
}

/** "S1 98 · S2 97 …" or with positions "K 195 · P 199 · S 190". */
export function seriesLine(r: EntryResult, ev: ShootEventDef, shots: number): string {
  const series = r.series ?? [];
  if (!series.length) return '';
  const xs = r.seriesX ?? [];
  const one = (v: number, i: number) => `${scoreText(v, ev.scoring)}${ev.scoring === 'integer' && xs[i] ? `·${xs[i]}x` : ''}${r.pen?.[i] ? `−${r.pen[i]}` : ''}`;
  if (ev.positions) {
    const by = new Map<string, number[]>();
    series.forEach((v, i) => { const p = positionOf(ev, shots, i)!; by.set(p, [...(by.get(p) ?? []), v]); });
    return [...by].map(([p, vs]) => `${POSITION_LABEL[p as 'K'].slice(0, 1)} ${vs.map((v) => scoreText(v, ev.scoring)).join(' ')}`).join(' · ');
  }
  return series.map(one).join(' ');
}

/** The final row of a qualifier: shots start from zero; the qualification score is kept for the sheet and records. */
export function finalistResult(q: EntryResult): Pick<EntryResult, 'fshots' | 'qual'> {
  return { fshots: [], qual: { mark: q.mark ?? 0, ...(q.xs != null ? { xs: q.xs } : {}), ...(q.series ? { series: q.series } : {}) } };
}

/** Add / correct final shot `i` (0-based) for a finalist (round 2: removing
 *  shots takes their penalties off too). */
export function setFinalShot(r: EntryResult, i: number, v: number | null): EntryResult {
  const f = [...(r.fshots ?? [])];
  if (v == null) {
    f.splice(i);
    if (r.fpen) {
      const p = r.fpen.slice(0, i);
      const { fpen: _p, ...rest } = r;
      return { ...rest, fshots: f, ...(p.some((x) => x > 0) ? { fpen: p } : {}) };
    }
  } else { if (i > f.length) return r; f[i] = v; }
  return { ...r, fshots: f };
}

/**
 * Round 2: a penalty in the final — `points` deducted from final shot `i`
 * (ISSF: 2 points, from the shot it was given on; 0 clears it). The final's
 * totals and eliminations use the net shot. A shot not fired yet can't carry one.
 */
export function setFinalPenalty(r: EntryResult, i: number, points: number): EntryResult {
  if ((r.fshots ?? []).length <= i || i < 0 || !(points >= 0)) return r;
  const pen = [...(r.fpen ?? [])];
  while (pen.length <= i) pen.push(0);
  pen[i] = points;
  while (pen.length && !pen[pen.length - 1]) pen.pop();
  const { fpen: _p, ...rest } = r;
  return pen.some((x) => x > 0) ? { ...rest, fpen: pen } : rest;
}

/** Add a shoot-off shot at elimination point `after` (round = its index + 1). */
export function addShootOff(r: EntryResult, after: number, round: number, v: number): EntryResult {
  const so = { ...(r.so ?? {}) };
  const list = [...(so[String(after)] ?? [])];
  list[round - 1] = v;
  so[String(after)] = list;
  return { ...r, so };
}

/** For records / PBs: a final's rows read as their qualification scores. */
export function qualView(entries: ResultEntry[]): ResultEntry[] {
  // SD-137b: the mixed team medal matches read as their qualification scores too
  if (!isFinalRows(entries) && !isShootMatchRows(entries)) return entries;
  return entries.map((e) => ({ ...e, result: { status: e.result.status, order: e.result.order, mark: e.result.qual?.mark, xs: e.result.qual?.xs, series: e.result.qual?.series } }));
}

/** "Shot 13 of 24 · next elimination after shot 14" / "Shoot-off for 7th …" / "Final complete". */
export function finalStatusText(st: FinalState, nameOf: (id: string) => string): string {
  if (st.done) return 'Final complete — check the places, then Finish & lock.';
  if (st.shootOff) {
    const names = st.shootOff.ids.map(nameOf).join(' and ');
    const what = st.shootOff.after === st.last ? 'for gold' : `at the elimination after shot ${st.shootOff.after}`;
    return `Shoot-off ${what}: ${names} — round ${st.shootOff.round}, one shot each (not added to the total).`;
  }
  return `Shot ${st.nextShot} of ${st.last}${st.nextElim != null && st.nextElim < st.last ? ` · next elimination after shot ${st.nextElim}` : st.nextElim === st.last ? ' · the last shot decides gold' : ''}`;
}

/* ------------------------------ meet settings ------------------------------ */

export interface ShootMeetSettings { positionPoints: number[]; relayFactor: number; handTimed: false; reaction: false }

export function shootMeetSettings(fmt?: Record<string, unknown>): ShootMeetSettings {
  const scheme = String(fmt?.pointsScheme ?? '8,7,6,5,4,3,2,1').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return { positionPoints: scheme.length ? scheme : [8, 7, 6, 5, 4, 3, 2, 1], relayFactor: 1, handTimed: false, reaction: false };
}

/* -------------------------------- stat lines ------------------------------- */

/** The stat key of a match score: 'm_sh_10mar' (standard), 'm_sh_10mar_40' (a 40-shot match). */
export const shootMarkKey = (discipline: string, shots?: number): string => {
  const ev = shootEventOf(discipline);
  const base = `m_sh_${discipline.replace(/^shoot\./, '')}`;
  return ev && shots && shots !== ev.shots ? `${base}_${shots}` : base;
};

export interface ShootLine { playerId: string; stats: Record<string, number>; won: boolean }

/**
 * The stat lines a closed phase writes (one per shooter; a mixed team's two members each get one):
 *   match / qualification: comps, place (no final: the result), m_sh_* (the
 *   score), pts + shots (average per series), xs + xShots (inner-ten rate,
 *   integer scoring), qualified (made the final), dq;
 *   final: finals, place, fpts (final score), golds / silvers / bronzes, posPoints.
 * `kind`: 'qual' (a qualification with a final after it), 'match' (no final), 'final'.
 * Deep wave (free — from what is stored): bestSer (the best series as shot),
 * perfect (series of all tens / all targets — integer and hits scoring, only
 * when there is one), pen (penalty points, only when deducted), fShots (the
 * final shots counted in fpts — the average final shot). Round 2: a final's
 * penalties (`fpen`, on the shots that count) are written as `pen` too.
 */
export function shootLines(f: Pick<PhaseFormat, 'discipline' | 'category'> & Partial<Pick<PhaseFormat, 'shootMatch'>>, ranked: RankedEntry[], kind: 'qual' | 'match' | 'final', awards: Award[] = []): ShootLine[] {
  const ev = shootEventOf(f.discipline);
  if (!ev) return [];
  const byEntry = new Map(awards.map((a) => [a.entryId, a]));
  const out: ShootLine[] = [];
  // SD-137b: a team of 3, or a mixed team event with medal matches — each
  // member gets a team line (place, medal, points, team matches) at the end;
  // the team's qualification writes nothing (the team score is not a member's PB)
  const rows = ranked.map((r) => r.entry);
  const matches = isShootMatchRows(rows) ? shootMatchState(rows) : null;
  const teamEvent = !!shootTeamOf(f.discipline) || !!matches || !!f.shootMatch;
  // deep wave: each finalist's counted shots (to the elimination shot, or the last)
  const fin = kind === 'final' && isFinalRows(rows) ? finalState(rows, ev) : null;
  for (const r of ranked) {
    // batch 5: a shooter withdrawn after firing (`wdKeep`) keeps the series fired
    if (r.status === 'DNS' || (r.status === 'WD' && r.entry.result?.wdKeep !== true)) continue;
    if (teamEvent && isTeamRow(r.entry)) {
      if (kind === 'qual') continue;
      const extra: Record<string, number> = {};
      if (matches) {
        let w = 0, l = 0;
        for (const m of matches.matches) {
          if (!m.out || m.out.walkover || !m.decided) continue;
          if (m.winner === r.id) w += 1; else if (m.loser === r.id) l += 1;
        }
        extra.tmW = w; extra.tmL = l;
      }
      if (r.status === 'DQ') extra.dq = 1;
      out.push(...teamLines(r, extra, byEntry.get(r.id)));
      continue;
    }
    const s: Record<string, number> = {};
    const res = r.entry.result ?? {};
    if (r.status === 'DQ') s.dq = 1;
    if (kind === 'final') {
      s.finals = 1;
      if (r.position != null) s.place = r.position;
      if (r.best != null) {
        s.fpts = r.best;
        const out = fin?.out.find((o) => o.id === r.id);
        const n = out ? out.after : Math.min((res.fshots ?? []).length, fin?.last ?? (res.fshots ?? []).length);
        if (n > 0) s.fShots = n;
        // round 2: penalties given in the final (on the shots that count) — the same `pen` key as the match
        const fp = finalPenaltyTotal({ fpen: (res.fpen ?? []).slice(0, n) });
        if (fp > 0) s.pen = fp;
      }
    } else {
      s.comps = 1;
      if (kind === 'match' && r.position != null) s.place = r.position;
      if (kind === 'qual' && r.position != null) s.qPlace = r.position;
      const nSeries = (res.series ?? []).length;
      if (nSeries) {
        s.pts = res.mark ?? 0;
        s.shots = Math.min(nSeries * ev.seriesOf, shotsOf(ev, f.category));
        if (ev.scoring === 'integer') { s.xs = res.xs ?? 0; s.xShots = s.shots; }
        // a complete match counts as the score (PB / record line)
        // batch 5: a shooter who didn't finish / withdrew never sets a PB or record line
        if (r.bestLegal != null && r.status !== 'DNF' && r.status !== 'WD' && nSeries >= seriesCount(ev, shotsOf(ev, f.category))) s[shootMarkKey(ev.key, f.category?.shots)] = r.bestLegal;
        // deep wave: the best series as shot, perfect series, penalty points
        const raw = res.series ?? [];
        s.bestSer = Math.max(...raw);
        const perfect = perfectSeries(res, ev, shotsOf(ev, f.category));
        if (perfect) s.perfect = perfect;
        const pen = penaltyTotal(res);
        if (pen > 0) s.pen = pen;
      }
      if (r.flags.includes('Q') || r.flags.includes('q')) s.qualified = 1;
    }
    const a = byEntry.get(r.id);
    if (a?.medal === 'gold') s.golds = 1; else if (a?.medal === 'silver') s.silvers = 1; else if (a?.medal === 'bronze') s.bronzes = 1;
    if (a && a.points > 0) s.posPoints = a.points;
    if (r.entry.athleteId) out.push({ playerId: r.entry.athleteId, stats: s, won: a?.medal === 'gold' });
    else for (const m of res.members ?? []) if (m.playerId) out.push({ playerId: m.playerId, stats: { ...s }, won: a?.medal === 'gold' });
  }
  return out;
}

/* ---------------------------------- career --------------------------------- */

export interface ShootBest { value: number; text: string; date: string; eventId: string; category?: string }
export interface ShootingCareer {
  comps: number; finals: number; golds: number; silvers: number; bronzes: number; points: number;
  /** inner tens ÷ shots in integer-scored matches, 0–100 (null without any) */
  innerRate: number | null;
  xs: number; xShots: number;
  /** best match score per event + match length, with the average per 10 shots
   *  (deep wave: and the best series shot in that event, when recorded) */
  bests: { key: string; label: string; pb: ShootBest; sb?: ShootBest; avg10?: number; avgText?: string; matches: number; bestSeries?: number; bestSeriesText?: string }[];
  /** Deep wave: perfect series (all tens / all targets), penalty points, and
   *  the average final shot over finals that recorded their shot count (null = none) */
  perfect: number;
  penalties: number;
  finalAvg: number | null;
  finalShots: number;
  history: { eventId: string; title: string; date: string; text: string; place?: number; medal?: 'gold' | 'silver' | 'bronze'; flags: string[] }[];
  /** SD-137b: team events (teams of 3, mixed team medal matches), their medals (also counted above) and team matches */
  team: { events: number; golds: number; silvers: number; bronzes: number; won: number; lost: number };
}

const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th'}`;

/** A shooter's career from their shooting stat lines (`eventId` = the phase). History newest first. */
export function shootingCareer(
  lines: { eventId?: string; stats: Record<string, number>; date?: string; opponent?: string }[],
  phases: Map<string, { discipline: string; title: string; date: string; category?: Category; eventTitle?: string; phase?: string }>,
  seasonFrom: string,
): ShootingCareer {
  const c: ShootingCareer = { comps: 0, finals: 0, golds: 0, silvers: 0, bronzes: 0, points: 0, innerRate: null, xs: 0, xShots: 0, bests: [], history: [], team: teamCareer(lines), perfect: 0, penalties: 0, finalAvg: null, finalShots: 0 };
  let finalPts = 0;
  const bests = new Map<string, ShootingCareer['bests'][number] & { ptsSum: number; shotSum: number; scoring: ShotScoring }>();
  const sorted = [...lines].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const pbSoFar = new Map<string, number>();
  for (const l of sorted) {
    const s = l.stats ?? {};
    const info = l.eventId ? phases.get(l.eventId) : undefined;
    const key = Object.keys(s).find((k) => k.startsWith('m_sh_'));
    const disc = info?.discipline ?? (key ? `shoot.${key.slice(5).replace(/_\d+$/, '')}` : undefined);
    const ev = shootEventOf(disc);
    c.comps += s.comps ?? 0; c.finals += s.finals ?? 0;
    c.golds += s.golds ?? 0; c.silvers += s.silvers ?? 0; c.bronzes += s.bronzes ?? 0;
    c.points += s.posPoints ?? 0; c.xs += s.xs ?? 0; c.xShots += s.xShots ?? 0;
    c.perfect += s.perfect ?? 0; c.penalties += s.pen ?? 0;
    if (s.fShots && s.fpts != null) { c.finalShots += s.fShots; finalPts += s.fpts; }
    const date = info?.date ?? l.date ?? '';
    const flags: string[] = [];
    if (ev && s.pts != null && s.shots) {
      const shots = info?.category?.shots ?? ev.shots;
      const bk = `${ev.key}|${shots}`;
      const row = bests.get(bk) ?? { key: bk, label: `${ev.label}${shots !== ev.shots ? ` (${shots} shots)` : ''}`, pb: { value: -1, text: '', date: '', eventId: '' }, matches: 0, ptsSum: 0, shotSum: 0, scoring: ev.scoring };
      row.ptsSum += s.pts; row.shotSum += s.shots;
      if (s.bestSer != null && (row.bestSeries == null || s.bestSer > row.bestSeries)) { row.bestSeries = s.bestSer; row.bestSeriesText = scoreText(s.bestSer, ev.scoring); }
      const v = key ? s[key] : undefined;
      if (v != null) {
        row.matches += 1;
        const best: ShootBest = { value: v, text: totalText(v, ev.scoring === 'integer' ? s.xs : undefined, ev.scoring), date, eventId: l.eventId ?? '', category: info?.category ? categoryLabel(info.category) : undefined };
        const prev = pbSoFar.get(bk);
        if (prev == null || v > prev) { if (prev != null) flags.push('PB'); pbSoFar.set(bk, v); }
        if (v > row.pb.value) row.pb = best;
        if (date.slice(0, 10) >= seasonFrom && (!row.sb || v > row.sb.value)) row.sb = best;
      }
      bests.set(bk, row);
    }
    if (s.qualified) flags.push('final');
    if (s.perfect) flags.push(`${s.perfect} perfect series`);
    if (s.pen) flags.push(`−${s.pen} penalty`);
    const medal = s.golds ? 'gold' : s.silvers ? 'silver' : s.bronzes ? 'bronze' : undefined;
    const sc = ev?.scoring ?? 'integer';
    const text = s.teamEv
      ? ['team', s.place ? ord(s.place) : '', s.tmW != null ? `medal match ${s.tmW ? 'won' : 'lost'}` : ''].filter(Boolean).join(' · ')
      : s.finals
      ? [s.place ? `${ord(s.place)} in the final` : 'final', s.fpts != null ? scoreText(s.fpts, 'decimal') : ''].filter(Boolean).join(' · ')
      : [s.place ? ord(s.place) : s.qPlace ? `${ord(s.qPlace)} in qualification` : s.dq ? 'DQ' : '', s.pts != null ? totalText(s.pts, sc === 'integer' ? s.xs : undefined, sc) : '', s.shots ? `${s.shots} shots` : ''].filter(Boolean).join(' · ');
    c.history.push({ eventId: l.eventId ?? '', title: info?.title ?? l.opponent ?? 'Shooting', date, text, place: s.place, medal, flags });
  }
  c.points = Math.round(c.points * 100) / 100;
  c.innerRate = c.xShots ? Math.round((c.xs / c.xShots) * 1000) / 10 : null;
  c.finalAvg = c.finalShots ? Math.round((finalPts / c.finalShots) * 100) / 100 : null;
  c.penalties = Math.round(c.penalties * 10) / 10;
  c.bests = [...bests.values()].filter((b) => b.shotSum > 0).map(({ ptsSum, shotSum, scoring, ...b }) => {
    const per = scoring === 'hits' ? 25 : 10;
    const avg = Math.round((ptsSum / shotSum) * per * 10) / 10;
    return { ...b, pb: b.pb.value >= 0 ? b.pb : { ...b.pb, value: 0, text: '–' }, avg10: avg, avgText: `${scoring === 'decimal' ? avg.toFixed(1) : avg.toFixed(1)} per ${per === 25 ? 'round' : '10 shots'}` };
  });
  c.history.reverse();
  return c;
}

/* --------------------------------- presets --------------------------------- */

export type ShootAge = 'Youth' | 'Junior' | 'Senior' | 'School';
export const SHOOT_AGES: { key: ShootAge; label: string; note: string }[] = [
  { key: 'Senior', label: 'Senior', note: 'ISSF senior' },
  { key: 'Junior', label: 'Junior', note: 'ISSF junior: under 21 on 31 December' },
  { key: 'Youth', label: 'Youth', note: 'youth / sub-youth — the national federation sets the ages' },
  { key: 'School', label: 'School', note: 'school championships (a house choice — check your school board)' },
];

/** The default match length for an age group: seniors and juniors the full match; youth / school the event's shorter one. */
export function defaultShots(ev: ShootEventDef, age: ShootAge): number {
  if (age === 'Senior' || age === 'Junior') return ev.shots;
  return ev.shotOptions.find((n) => n < ev.shots && n >= 30) ?? ev.shots;
}

/** The default final size for `n` shooters: 8 when there are 10 or more; a smaller final at a small meet; none under 5. */
export function defaultFinalists(ev: ShootEventDef, n: number): number {
  if (!ev.final) return 0;
  if (n >= 10) return ev.final.finalists;
  if (n >= 7) return 6;
  if (n >= 5) return 4;
  return 0;
}

/** The event's discipline def ('shoot.10mar' …). */
export const shootDiscipline = (key: string): DisciplineDef | undefined => disciplineOf(key);
