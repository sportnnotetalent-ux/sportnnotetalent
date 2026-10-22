/**
 * Deep wave (timed races) — the live RESULTS COMMENTARY for athletics,
 * swimming, rowing, canoe sprint and cycling: a feed of short lines per heat,
 * round, attempt and bar height, newest first, the way a stadium announcer /
 * a federation live-results page reads them:
 *
 *   "100 m U14 Girls · Heat 2: Priya Sharma wins in 12.48 (wind +0.8) Q; Asha Rao 12.61 PB Q"
 *   "High jump U16 Boys: Ravi Kumar clears 1.75 at the second attempt (XO)"
 *   "Long jump U14 Girls · round 3: Asha Rao 5.42 (+0.4) — takes the lead"
 *   "🏅 100 m U14 Girls final — 🥇 Priya Sharma 12.31 MR · 🥈 … · 🥉 …"
 *   "🏆 New meet record: Priya Sharma 12.31 — 100 m U14 Girls (was 12.40, A. Rao)"
 *
 * Every line is DERIVED from the stored results each time it is shown (no
 * commentary is stored), so a corrected mark corrects its line, and an old
 * event reads from exactly what it holds (no splits → no split story). Order:
 * the phase's scheduled time, then round, heat, attempt / height, start order.
 * Pure.
 */
import type { DisciplineDef, PhaseFormat, RankedEntry, ResultEntry, ResultFlag } from './model.ts';
import { disciplineOf, phaseDiscipline } from './model.ts';
import { formatMark, summarizeHeights } from './marks.ts';
import { betterMark } from './rank.ts';
import { attemptOrder } from './progression.ts';
import { phaseLabel } from './plan.ts';
import { phasePoints, combinedStandings } from './combined.ts';
import { phaseTeams } from './road.ts';
import { rowsForRecords } from './safety.ts';
import type { RecordMark } from './records.ts';
import type { MeetEvent } from './athletics.ts';
import { heatName, isTimedRaceSport, raceOrdinal, phaseRanking, winnerSplitStory, type PhaseRanking } from './raceDepth.ts';

export type CommentaryKind = 'heat' | 'round' | 'final' | 'record' | 'attempt' | 'height' | 'standings' | 'team';

export interface CommentaryItem {
  /** stable key (phase · heat · step) */
  id: string;
  eventKey: string;
  phaseId: string;
  /** sort key — compared position by position, bigger = newer */
  seq: number[];
  icon: string;
  text: string;
  kind: CommentaryKind;
  /** a heat / round still being entered */
  provisional?: boolean;
}

export interface CommentaryOptions {
  /** PB / SB / MR / SR flags the caller already worked out, per phase id → entry id
   *  (the event screen passes its live phase's flags) */
  flags?: Map<string, Map<string, ResultFlag[]>>;
}

type Phase = MeetEvent['phases'][number];

const SHOWN_FLAGS: ResultFlag[] = ['Q', 'q', 'PB', '=PB', 'SB', '=SB', 'MR', '=MR', 'SR', '=SR', 'w', 'h'];
const flagText = (flags: ResultFlag[]): string => {
  const f = SHOWN_FLAGS.filter((x) => flags.includes(x));
  return f.length ? ` ${f.join(' ')}` : '';
};
const windText = (w?: number) => (w == null ? '' : `${w > 0 ? '+' : w < 0 ? '−' : ''}${Math.abs(w).toFixed(1)}`);
const timeOf = (p: Phase) => { const t = Date.parse(p.date ?? ''); return Number.isFinite(t) ? t : 0; };
const MEDAL = ['🥇', '🥈', '🥉'];
const NTH = ['first', 'second', 'third'];

/** Newest first: compare two items' sort keys (bigger = newer). */
export function compareItems(a: CommentaryItem, b: CommentaryItem): number {
  for (let i = 0; i < Math.max(a.seq.length, b.seq.length); i++) {
    const x = a.seq[i] ?? 0, y = b.seq[i] ?? 0;
    if (x !== y) return y - x;
  }
  return a.id.localeCompare(b.id);
}

/** Rows with any flags the caller passed for this phase merged in. */
function withFlags(rows: RankedEntry[], extra?: Map<string, ResultFlag[]>): RankedEntry[] {
  if (!extra?.size) return rows;
  return rows.map((r) => { const add = (extra.get(r.id) ?? []).filter((x) => !r.flags.includes(x)); return add.length ? { ...r, flags: [...r.flags, ...add] } : r; });
}

/** One phase's lines (every heat / round / attempt it holds). */
function phaseItems(ev: MeetEvent, p: Phase, o: CommentaryOptions, allPhases: Phase[]): CommentaryItem[] {
  const pr = phaseRanking(p);
  if (!pr) return [];
  const f = p.format;
  const def = pr.def;
  const t = timeOf(p);
  const base = (heat: number, step: number[], kind: CommentaryKind, icon: string, text: string, provisional?: boolean): CommentaryItem => ({
    id: `${p.id}:${heat}:${step.join('.')}:${kind}`, eventKey: ev.eventKey, phaseId: p.id, seq: [t, f.phaseNo, heat, ...step], icon, text, kind, ...(provisional ? { provisional } : {}),
  });
  const out: CommentaryItem[] = [];
  const extra = o.flags?.get(p.id);
  const title = ev.title;
  const name = (r: { entry: ResultEntry }) => r.entry.name;
  const points = f.combined ? phasePoints(p.entries, f) : null;

  if (def.capture === 'attempts') out.push(...attemptItems(title, p, def, base));
  else if (def.capture === 'heights') out.push(...heightItems(title, p, def, base));
  else {
    for (const [heat, raw] of pr.heats) {
      const rows = withFlags(raw, extra);
      const placed = rows.filter((r) => r.position != null).sort((a, b) => (a.position as number) - (b.position as number));
      const statuses = rows.filter((r) => r.status === 'DQ' || r.status === 'FS' || r.status === 'DNF' || r.status === 'OTL');
      if (!placed.length && !statuses.length) continue;
      const complete = rows.every((r) => r.status !== 'ok' || r.position != null);
      const provisional = !complete && p.status !== 'completed';
      const hName = f.combined ? `${heatName(f, heat)}` : heatName(f, heat);
      const mark = (r: RankedEntry) => {
        const pts = points?.get(r.id);
        return `${r.bestText}${pts?.state === 'ok' ? ` (${pts.points} pts)` : ''}`;
      };
      let text: string;
      if (def.capture === 'order') {
        // road / walk / XC and cycling order events: the order on the line
        text = placed.slice(0, 3).map((r) => `${raceOrdinal(r.position as number)} ${name(r)}${r.bestText ? ` (${r.bestText})` : ''}`).join(' · ') + (placed.length > 3 ? ` · ${placed.length} finished` : '');
      } else {
        const win = placed[0];
        const winWord = pr.timedFinal ? 'fastest' : win && placed[1]?.position === win.position ? 'dead heat with' : 'wins';
        const story = win ? winnerSplitStory(def, rows) : null;
        const qualifiers = placed.filter((r) => r.flags.includes('Q') || r.flags.includes('q') || pr.dest.has(r.id));
        const others = (qualifiers.length > 1 ? qualifiers : placed.slice(0, 3)).filter((r) => r !== win);
        const shownOthers = others.slice(0, 4);
        const dest = (r: RankedEntry) => (pr.dest.get(r.id) ? ` → ${pr.dest.get(r.id)}` : '');
        const head = win
          ? winWord === 'dead heat with'
            ? `${name(win)} and ${name(placed[1])} dead-heat in ${mark(win)}${flagText(win.flags)}${dest(win)}`
            : `${name(win)} ${winWord} in ${mark(win)}${flagText(win.flags)}${dest(win)}${story ? ` — ${story}` : ''}`
          : '';
        const rest = (winWord === 'dead heat with' ? shownOthers.filter((r) => r !== placed[1]) : shownOthers)
          .map((r) => `${name(r)} ${mark(r)}${flagText(r.flags)}${dest(r)}`);
        text = [head, ...rest].filter(Boolean).join('; ') + (others.length > shownOthers.length ? ' …' : '');
        const wind = def.wind === 'race' ? rows.find((r) => r.entry.result.wind != null)?.entry.result.wind : undefined;
        if (wind != null) text += ` (wind ${windText(wind)})`;
      }
      const st = statuses.map((r) => `${name(r)} ${r.status}${r.entry.result.ruleRef && r.status !== 'DNF' ? ` (${r.entry.result.ruleRef}${r.entry.result.reason ? ` ${r.entry.result.reason}` : ''})` : ''}`);
      if (st.length) text += `${text ? ' · ' : ''}${st.join(', ')}`;
      out.push(base(heat, [0], 'heat', def.capture === 'order' ? '🏁' : '⏱', `${title} · ${hName}${provisional ? ' (so far)' : ''}: ${text}`, provisional));
    }
  }

  // a road / XC team score
  if (f.road?.team) {
    const teams = phaseTeams(f, [...pr.heats.values()].flat()).filter((x) => x.position != null);
    if (teams.length) out.push(base(1, [1], 'team', '👥', `${title} — teams: ${teams.slice(0, 3).map((x) => `${raceOrdinal(x.position as number)} ${x.name} (${x.total} pts)`).join(' · ')}`, p.status !== 'completed'));
  }

  // a round closed: who went through
  if (p.status === 'completed' && f.phase !== 'final' && !f.combined) out.push(...roundItem(title, p, pr, base));
  // the final locked: medals and records
  if (p.status === 'completed' && f.phase === 'final' && !f.combined) out.push(...finalItems(title, p, pr, base, extra));
  // combined events: the standings after each event, the medals at the end
  if (f.combined && p.status === 'completed') out.push(...combinedItems(title, p, allPhases, base));
  return out;
}

type Base = (heat: number, step: number[], kind: CommentaryKind, icon: string, text: string, provisional?: boolean) => CommentaryItem;

/** "Heats done — 8 through to the final (6 Q, 2 q); fastest: Priya Sharma 12.48". */
function roundItem(title: string, p: Phase, pr: PhaseRanking, base: Base): CommentaryItem[] {
  const rows = [...pr.heats.values()].flat();
  const next = p.format.plan?.[p.format.phaseNo];
  const nextName = next ? phaseLabel(next.phase).toLowerCase().replace(/s$/, '') : 'next round';
  const Q = rows.filter((r) => r.flags.includes('Q')).length, q = rows.filter((r) => r.flags.includes('q')).length;
  const best = rows.filter((r) => r.position != null && r.best != null).sort((a, b) => (betterMark(a.best!, b.best!, pr.def) ? -1 : betterMark(b.best!, a.best!, pr.def) ? 1 : 0))[0];
  const bestWord = pr.def.unit === 'time' ? 'fastest' : 'best';
  let through = '';
  if (pr.dest.size) {
    const by = new Map<string, number>();
    for (const d of pr.dest.values()) by.set(d, (by.get(d) ?? 0) + 1);
    through = [...by].map(([d, n]) => `${n} to ${d}`).join(', ');
  } else if (Q + q) through = `${Q + q} through to the ${nextName}${q ? ` (${Q} Q, ${q} q)` : ''}`;
  if (!through && !best) return [];
  const label = phaseLabel(p.format.phase);
  return [base(999, [0], 'round', '✅', `${title} — ${label} done${through ? `: ${through}` : ''}${best ? `; ${bestWord}: ${best.entry.name} ${best.bestText}` : ''}`)];
}

/** The medal line and any record the final set (against the book as it stood before the lock). */
function finalItems(title: string, p: Phase, pr: PhaseRanking, base: Base, extra?: Map<string, ResultFlag[]>): CommentaryItem[] {
  const rows = withFlags(pr.overall ?? [...pr.heats.values()].flat(), extra);
  const medals = rows.filter((r) => r.position != null && r.position <= 3).sort((a, b) => (a.position as number) - (b.position as number));
  const out: CommentaryItem[] = [];
  if (medals.length) {
    out.push(base(999, [0], 'final', '🏅', `${title} final — ${medals.map((r) => `${MEDAL[(r.position as number) - 1]} ${r.entry.name}${r.bestText ? ` ${r.bestText}` : ''}${flagText(r.flags.filter((x) => x !== 'Q' && x !== 'q'))}`).join(' · ')}`));
  }
  out.push(...recordItems(title, p, pr.def, rows, base));
  return out;
}

/** A record the final broke: its best legal mark beats the book's mark from before the lock (SD-112 `recordsBefore`). */
function recordItems(title: string, p: Phase, def: DisciplineDef, rows: RankedEntry[], base: Base): CommentaryItem[] {
  const before = (p.format.recordsBefore ?? []).filter((r: RecordMark) => r.discipline === def.key);
  if (!before.length) return [];
  const legal = rowsForRecords(rows, def, p.format.category?.course).filter((r) => r.position != null && r.bestLegal != null);
  const best = legal.reduce<RankedEntry | null>((b, r) => (!b || betterMark(r.bestLegal!, b.bestLegal!, def) ? r : b), null);
  if (!best) return [];
  const out: CommentaryItem[] = [];
  for (const rec of before) {
    if (!betterMark(best.bestLegal!, rec.value, def)) continue;
    const scope = rec.scope === 'SR' ? 'school record' : 'meet record';
    out.push(base(999, [1, rec.scope === 'SR' ? 1 : 0], 'record', '🏆',
      `New ${scope}: ${best.entry.name} ${formatMark(best.bestLegal, def)} — ${title} (was ${formatMark(rec.value, def)}${rec.holder ? `, ${rec.holder}` : ''}${rec.year ? ` ${rec.year}` : ''})`));
  }
  return out;
}

/** Field events (horizontal jumps / throws): one line per trial, in competition order, with lead changes. */
function attemptItems(title: string, p: Phase, def: DisciplineDef, base: Base): CommentaryItem[] {
  const out: CommentaryItem[] = [];
  const heats = [...new Set(p.entries.map((e) => e.heat))].sort((a, b) => a - b);
  for (const heat of heats) {
    const entries = p.entries.filter((e) => e.heat === heat);
    const rounds = Math.max(0, ...entries.map((e) => e.result.attempts?.length ?? 0));
    const bests = new Map<string, number>();
    let leader: { id: string; v: number } | null = null;
    const group = heats.length > 1 ? ` · ${heatName(p.format, heat)}` : '';
    for (let round = 1; round <= rounds; round++) {
      attemptOrder(entries, def, round).forEach((e, idx) => {
        const a = e.result.attempts?.[round - 1];
        if (!a || (!a.foul && !a.pass && a.mark == null)) return;
        let what: string;
        if (a.pass) what = `${e.name} passes`;
        else if (a.foul || a.mark == null) what = `${e.name} fouls (X)`;
        else {
          const v = a.mark;
          const prev = bests.get(e.id);
          const improved = prev == null || betterMark(v, prev, def);
          if (improved) bests.set(e.id, v);
          let note = '';
          if (!leader) { note = 'leads'; leader = { id: e.id, v }; }
          else if (betterMark(v, leader.v, def)) { note = leader.id === e.id ? 'extends the lead' : 'takes the lead'; leader = { id: e.id, v }; }
          else if (improved) {
            const place = 1 + [...bests].filter(([id, b]) => id !== e.id && betterMark(b, v, def)).length;
            note = `moves to ${raceOrdinal(place)}`;
          }
          what = `${e.name} ${formatMark(v, def)}${def.wind === 'attempt' && a.wind != null ? ` (${windText(a.wind)})` : ''}${note ? ` — ${note}` : ''}`;
        }
        out.push(base(heat, [round, idx], 'attempt', def.unit === 'height' ? '🦘' : '📏', `${title}${group} · round ${round}: ${what}`, p.status !== 'completed'));
      });
    }
  }
  return out;
}

/** Vertical jumps: one line per athlete per bar height ("clears 1.75 at the second attempt (XO)"), and the jump-off. */
function heightItems(title: string, p: Phase, def: DisciplineDef, base: Base): CommentaryItem[] {
  const out: CommentaryItem[] = [];
  const heats = [...new Set(p.entries.map((e) => e.heat))].sort((a, b) => a - b);
  for (const heat of heats) {
    const entries = p.entries.filter((e) => e.heat === heat).sort((a, b) => (a.result.order ?? 999) - (b.result.order ?? 999));
    const bar = [...new Set(entries.flatMap((e) => (e.result.heights ?? []).filter((h) => h.tries).map((h) => h.height)))].sort((a, b) => a - b);
    bar.forEach((height, hi) => {
      entries.forEach((e, idx) => {
        const h = (e.result.heights ?? []).find((x) => x.height === height);
        const tries = (h?.tries ?? '').toUpperCase();
        if (!tries) return;
        const ht = formatMark(height, def);
        const xs = (tries.match(/X/g) ?? []).length;
        const upTo = (e.result.heights ?? []).filter((x) => x.height <= height);
        const sum = summarizeHeights(upTo);
        let what: string;
        if (tries.endsWith('O')) what = `clears ${ht} at the ${NTH[tries.length - 1] ?? `${tries.length}th`} attempt (${tries})`;
        else if (tries === '-') what = `passes ${ht}`;
        else if (tries.endsWith('-')) what = `${xs === 1 ? 'misses once' : 'misses twice'} at ${ht}, passes to the next height (${tries})`;
        else if (sum.eliminated) what = `${xs === 3 ? 'fails three times' : 'fails'} at ${ht} (${tries}) — out, ${sum.best != null ? `best ${formatMark(sum.best, def)}` : 'no height cleared'}`;
        else what = `misses at ${ht} (${tries})`;
        out.push(base(heat, [hi, idx], 'height', '🦘', `${title}: ${e.name} ${what}`, p.status !== 'completed'));
      });
    });
    const jo = p.format.jumpOff;
    if (jo && heat === heats[0]) {
      const nameOf = (id: string) => p.entries.find((x) => x.id === id)?.name ?? 'Athlete';
      if (jo.shared) out.push(base(heat, [10000, 0], 'height', '🤝', `${title}: ${jo.athletes.map(nameOf).join(' and ')} agree to share 1st place`));
      jo.rounds.forEach((r, i) => {
        const tries = Object.entries(r.tries);
        if (!tries.length) return;
        out.push(base(heat, [10000, i + 1], 'height', '🦘', `${title} — jump-off at ${formatMark(r.height, def)}: ${tries.map(([id, x]) => `${nameOf(id)} ${x === 'O' ? 'clears' : 'fails'}`).join(', ')}`));
      });
    }
  }
  return out;
}

/** Combined events: the standings after each locked event; the medals after the last. */
function combinedItems(title: string, p: Phase, all: Phase[], base: Base): CommentaryItem[] {
  const c = p.format.combined!;
  const upTo = all.filter((x) => x.format.combined && x.format.combined.index <= c.index);
  const last = c.index === c.events.length - 1;
  const rows = combinedStandings(upTo, { final: last }).filter((r) => r.position != null);
  if (!rows.length) return [];
  const evName = disciplineOf(p.format.discipline)?.label ?? '';
  if (last) return [base(999, [0], 'final', '🏅', `${title} final — ${rows.filter((r) => (r.position as number) <= 3).map((r) => `${MEDAL[(r.position as number) - 1]} ${r.name} ${r.total} pts`).join(' · ')}`)];
  return [base(999, [0], 'standings', '📊', `${title} after ${c.index + 1} of ${c.events.length} (${evName.toLowerCase()}): ${rows.slice(0, 3).map((r) => `${raceOrdinal(r.position as number)} ${r.name} ${r.total} pts`).join(' · ')}`)];
}

/**
 * The commentary for one event (every round), newest first. Events of the
 * other event sports (weightlifting, shooting, archery) have their own
 * screens' feeds — none here.
 */
export function eventCommentary(ev: MeetEvent, o: CommentaryOptions = {}): CommentaryItem[] {
  if (!isTimedRaceSport(disciplineOf(ev.discipline)?.sport)) return [];
  const out = ev.phases.flatMap((p) => phaseItems(ev, p, o, ev.phases));
  return out.sort(compareItems);
}

/** The whole meet's commentary, newest first (the hub's "Latest results"). */
export function meetCommentary(events: MeetEvent[], o: CommentaryOptions & { limit?: number } = {}): CommentaryItem[] {
  const all = events.flatMap((e) => eventCommentary(e, o)).sort(compareItems);
  return o.limit != null ? all.slice(0, o.limit) : all;
}

/** "Heat 2", "Final B" … for a phase's heat (re-exported for the screens). */
export const commentaryHeatName = (f: Pick<PhaseFormat, 'phase' | 'heats' | 'races' | 'discipline' | 'combined' | 'phaseNo'>, heat: number): string => heatName(f, heat);

/** The discipline as raced in a phase (for callers that format marks next to a line). */
export const phaseDef = (f: PhaseFormat): DisciplineDef | null => { const d = disciplineOf(f.discipline); return d ? phaseDiscipline(d, f) : null; };
