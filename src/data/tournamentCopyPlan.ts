/**
 * Run it again / copy a tournament (2026-10-27) — the pure plan.
 *
 * "🔁 Run it again" (a tournament's organisers): the next edition — the same
 * sports, formats, rules, age groups, venues, registration settings, events
 * programme, meet records, logo and contact, the dates moved on a year (or
 * more, so it starts today or later), linked to this edition
 * (tournaments.previous_edition_id, migration 20261027140000_tournament_editions).
 *
 * "📋 Copy this setup" (anyone, any tournament): the same set-up as a new,
 * unlinked tournament of their own. Someone else's tournament comes without
 * its logo, banner, contact details and records, and its About & rules text
 * only when asked for.
 *
 * Neither copies teams, players, fixtures, entries or results. A meet's events
 * can't exist without a start list, so they come across as the meet's
 * programme (formats[sport].programme): the hub lists them and "Set up" opens
 * each one pre-filled, once its entries are in.
 *
 * PURE (no React Native) — node tests load it.
 */
import type { FieldEvent, NewTournamentCategory, SportId, Tournament, TournamentCategory } from '../core/types';
import { categoryKey, type Category, type PhaseFormat, type PhaseKind, type PhaseSched } from './results/model.ts';

export type CopyMode = 'next' | 'clone';

/* --------------------------------- dates --------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** "2026-07-14" (or an ISO date-time) moved on n years; 29 Feb → 28 Feb in a
 *  common year. A time of day is kept as it was. */
export function addYears(day: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m || !n) return day;
  const y = Number(m[1]) + n, mo = Number(m[2]);
  const d = mo === 2 && Number(m[3]) === 29 && !leap(y) ? 28 : Number(m[3]);
  return `${y}-${pad(mo)}-${pad(d)}${day.slice(10)}`;
}

/** How many years the copy moves on: the next edition at least one; either
 *  far enough that it starts today or later. */
export function yearsAhead(startDate: string, today: string, mode: CopyMode): number {
  let n = mode === 'next' ? 1 : 0;
  while (addYears(startDate, n).slice(0, 10) < today && n < 50) n += 1;
  return n;
}

const YEAR_RE = /\b((?:19|20)\d{2})(?:([-–/])(\d{4}|\d{2}))?\b/g;

/** The name with its year moved on: "Inter-School Meet 2026" → "… 2027",
 *  a season "2025-26" → "2026-27". A next edition of a name without a year
 *  gets the new year added, so the two editions read apart. */
export function nextName(name: string, years: number, newStartYear: number, mode: CopyMode): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!years) return clean;
  let hit = false;
  const out = clean.replace(YEAR_RE, (_all, y: string, sep?: string, y2?: string) => {
    hit = true;
    const a = Number(y) + years;
    if (!sep || !y2) return String(a);
    return `${a}${sep}${y2.length === 4 ? String(Number(y2) + years) : pad((Number(y2) + years) % 100)}`;
  });
  return hit || mode === 'clone' ? out : `${clean} ${newStartYear}`;
}

/* -------------------------------- formats -------------------------------- */

/** The meet's events carried from an earlier edition (formats[sport].programme). */
export const PROGRAMME_KEY = 'programme';

/** This edition's own data inside a sport's format — never copied: the entries
 *  desk, hand-kept standings, an Americano field, points deductions, when the
 *  rules were set and how Swiss round 1 was seeded. */
export const EDITION_KEYS = ['meetEntries', 'manualRows', 'americano', 'pointsAdj', 'rulesSetAt', 'swissSeed'] as const;

const asObject = (v: unknown): Record<string, unknown> | null => {
  try {
    const o = typeof v === 'string' ? (v ? JSON.parse(v) : null) : v;
    return o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, unknown> : null;
  } catch { return null; }
};

/** Every sport's format, rules and settings without this edition's data. The
 *  meet record book stays only for the next edition (a record stands until
 *  it's broken); the programme is replaced by `programme`. */
export function copyFormats(
  formats: Tournament['formats'] | undefined,
  opts: { records: boolean; programme?: Partial<Record<string, ProgrammeEvent[]>> },
): NonNullable<Tournament['formats']> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [sport, raw] of Object.entries(formats ?? {})) {
    if (!raw || typeof raw !== 'object') continue;
    const f: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    for (const k of EDITION_KEYS) delete f[k];
    delete f[PROGRAMME_KEY];
    if (!opts.records) delete f.records;
    // Swiss: the ½-point-bye limit is a rule; withdrawals, byes and late entries are this edition's.
    if (f.swissOps !== undefined) {
      const lim = asObject(f.swissOps)?.hpbLimit;
      if (typeof lim === 'number') f.swissOps = JSON.stringify({ v: 1, hpbLimit: lim });
      else delete f.swissOps;
    }
    // Prize categories: the categories and places are rules; the hand edits name this edition's players.
    if (f.prizeCats !== undefined) {
      const o = asObject(f.prizeCats);
      if (o && Array.isArray(o.cats) && o.cats.length) {
        const { add: _add, drop: _drop, ...rules } = o;
        f.prizeCats = JSON.stringify(rules);
      } else delete f.prizeCats;
    }
    out[sport] = f;
  }
  for (const [sport, list] of Object.entries(opts.programme ?? {})) {
    if (list?.length) out[sport] = { ...(out[sport] ?? {}), [PROGRAMME_KEY]: JSON.stringify(list) };
  }
  return out as NonNullable<Tournament['formats']>;
}

/* ------------------------------- programme ------------------------------- */

/** The set-up choices an event keeps from one edition to the next. */
export const PROGRAMME_SETTING_KEYS = [
  'handTimed', 'reaction', 'noWindGauge', 'implement', 'board', 'bar', 'lanes', 'splits',
  'shootEntry', 'shootFinal', 'cyc', 'road', 'track', 'shootMatch',
] as const;
export type ProgrammeSettings = Partial<Pick<PhaseFormat, typeof PROGRAMME_SETTING_KEYS[number]>>;

/** One event of a meet's programme, before its start list exists. */
export interface ProgrammeEvent {
  sport: string;
  /** the discipline ('ath.100m'), or the combined one ('ath.ce_dec') */
  discipline: string;
  category?: Category;
  /** "100 m U14 Boys" */
  title: string;
  /** athletics: a road race / race walk / cross-country, or a combined event */
  mode?: 'road' | 'combined';
  /** the rounds last time; the new heats come from the new entries */
  rounds?: PhaseKind[];
  /** how many went through from the first round (a shooting final's 8, an archery bracket of 16) */
  fieldSize?: number;
  settings?: ProgrammeSettings;
  /** the timetable slots, moved on with the dates */
  sched?: PhaseSched;
  /** a combined event's events, scoring table and day 2 */
  combined?: { table?: string; events: string[]; day2?: number; implements?: Record<string, string> };
}

const shiftSched = (s: PhaseSched, years: number): PhaseSched => ({ rounds: s.rounds.map((r) => ({ ...r, at: addYears(r.at, years) })) });

function pickSettings(f: PhaseFormat): ProgrammeSettings {
  const out: Record<string, unknown> = {};
  for (const k of PROGRAMME_SETTING_KEYS) {
    const v = f[k];
    if (v === undefined || v === null || v === false || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out as ProgrammeSettings;
}

const eventId = (e: Pick<ProgrammeEvent, 'sport' | 'discipline' | 'category'>) => `${e.sport}|${e.discipline}|${categoryKey(e.category)}`;

/** The meet's programme for the copy: every results-engine event (its first
 *  round — golf rounds and other field events aren't part of it), then the
 *  events carried here earlier and never set up. Times move on `years`. */
export function programmeFrom(
  phases: Pick<FieldEvent, 'sport' | 'format'>[],
  years: number,
  carried: Partial<Record<string, ProgrammeEvent[]>> = {},
): Partial<Record<string, ProgrammeEvent[]>> {
  const firsts = new Map<string, { f: PhaseFormat; sport: string }>();
  for (const p of phases) {
    const f = (p.format as { results?: PhaseFormat } | undefined)?.results;
    if (!f?.eventKey || !f.discipline) continue;
    const cur = firsts.get(f.eventKey);
    if (!cur || (f.phaseNo ?? 1) < (cur.f.phaseNo ?? 1)) firsts.set(f.eventKey, { f, sport: p.sport });
  }
  const out: Record<string, ProgrammeEvent[]> = {};
  const seen = new Set<string>();
  const push = (e: ProgrammeEvent) => {
    const id = eventId(e);
    if (seen.has(id)) return;
    seen.add(id);
    (out[e.sport] ??= []).push(e);
  };
  for (const { f, sport } of firsts.values()) {
    const settings = pickSettings(f);
    const cf = f.combined;
    push({
      sport,
      discipline: cf?.key ?? f.discipline,
      ...(f.category ? { category: f.category } : {}),
      title: f.eventTitle ?? f.discipline,
      ...(f.road ? { mode: 'road' as const } : cf ? { mode: 'combined' as const } : {}),
      ...(f.plan?.length && !cf ? { rounds: f.plan.map((r) => r.phase) } : {}),
      ...(f.plan && f.plan.length > 1 && f.plan[0].progression?.fillTo ? { fieldSize: f.plan[0].progression.fillTo } : {}),
      ...(Object.keys(settings).length ? { settings } : {}),
      ...(f.sched?.rounds.length ? { sched: shiftSched(f.sched, years) } : {}),
      ...(cf ? { combined: { table: cf.table, events: cf.events, ...(cf.day2 != null ? { day2: cf.day2 } : {}), ...(cf.implements ? { implements: cf.implements } : {}) } } : {}),
    });
  }
  for (const [sport, list] of Object.entries(carried)) {
    for (const e of list ?? []) push({ ...e, sport, ...(e.sched ? { sched: shiftSched(e.sched, years) } : {}) });
  }
  return out;
}

/** The programme's slots moved by `days` (the organiser picked other dates
 *  than the plan's) — same weekday gaps, same times. */
export function shiftProgrammeDays(programme: Partial<Record<string, ProgrammeEvent[]>>, days: number): Partial<Record<string, ProgrammeEvent[]>> {
  if (!days) return programme;
  const ms = days * 86_400_000;
  const out: Partial<Record<string, ProgrammeEvent[]>> = {};
  for (const [sport, list] of Object.entries(programme)) {
    out[sport] = (list ?? []).map((e) => (e.sched
      ? { ...e, sched: { rounds: e.sched.rounds.map((r) => { const t = Date.parse(r.at); return Number.isNaN(t) ? r : { ...r, at: new Date(t + ms).toISOString() }; }) } }
      : e));
  }
  return out;
}

/** A sport's carried programme (a JSON string or a list); bad items dropped. */
export function readProgramme(fmt: Record<string, unknown> | null | undefined, sport: string): ProgrammeEvent[] {
  const raw = fmt?.[PROGRAMME_KEY];
  let list: unknown = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(list)) return [];
  return list
    .filter((e): e is ProgrammeEvent => !!e && typeof e === 'object' && typeof (e as ProgrammeEvent).discipline === 'string' && typeof (e as ProgrammeEvent).title === 'string')
    .map((e) => ({ ...e, sport }));
}

/** Programme events not set up yet (no event with the same discipline and category). */
export function pendingProgramme(programme: ProgrammeEvent[], setUp: { discipline: string; category?: Category }[]): ProgrammeEvent[] {
  const done = new Set(setUp.map((e) => `${e.discipline}|${categoryKey(e.category)}`));
  return programme.filter((e) => !done.has(`${e.discipline}|${categoryKey(e.category)}`));
}

/** A vertical jump's bar heights back into the set-up screen's opening height,
 *  raise, and where the raise changes ("1.10 by 5 cm, then 3 cm from 1.40"). */
export function barSettings(bar: number[]): { start: number; step: number; changeAt: number; step2: number } {
  const r = (n: number) => Math.round(n * 100) / 100;
  const start = bar[0] ?? 0;
  const step = bar.length > 1 ? r(bar[1] - bar[0]) : 0.05;
  for (let i = 2; i < bar.length; i++) {
    const d = r(bar[i] - bar[i - 1]);
    if (d !== step) return { start, step, changeAt: bar[i - 1], step2: d };
  }
  return { start, step, changeAt: bar[bar.length - 1] ?? start, step2: step };
}

/** The programme slot a set-up screen opens for — the same key as the entries
 *  desk's columns (data/results slotKey): "sh.10ar@U16-F-40sh". */
export const programmeSlot = (e: Pick<ProgrammeEvent, 'discipline' | 'category'>): string => `${e.discipline}@${categoryKey(e.category)}`;

/** The programme event a set-up screen opened for (discipline + category). */
export function programmeEventFor(programme: ProgrammeEvent[], discipline: string, category?: Category): ProgrammeEvent | undefined {
  const k = categoryKey(category);
  return programme.find((e) => e.discipline === discipline && categoryKey(e.category) === k)
    ?? programme.find((e) => e.discipline === discipline && (e.category?.age ?? 'Open') === (category?.age ?? 'Open') && (e.category?.gender ?? 'X') === (category?.gender ?? 'X'));
}

/* ---------------------------------- plan ---------------------------------- */

export interface CopySource {
  tournament: Tournament;
  categories: TournamentCategory[];
  phases: Pick<FieldEvent, 'sport' | 'format'>[];
}

export interface CopyPlan {
  mode: CopyMode;
  years: number;
  name: string;
  startDate: string;
  endDate: string;
  /** what the new tournament is created with (owner and host come from the screen) */
  fields: {
    sports: SportId[];
    formats: NonNullable<Tournament['formats']>;
    structure?: Tournament['structure'];
    knockoutFormat?: Tournament['knockoutFormat'];
    participation?: Tournament['participation'];
    scoring?: Tournament['scoring'];
    reminderLeadMinutes?: number[];
    registrationDeadline?: string;
    minTeams?: number;
    maxTeams?: number;
    city?: string;
    grounds?: string[];
    timeZone?: string;
    eventCategory?: Tournament['eventCategory'];
    about?: string;
    logoUrl?: string;
    bannerUrl?: string;
    organiserPhone?: string;
    organiserEmail?: string;
  };
  categories: NewTournamentCategory[];
  ageVerification?: Tournament['ageVerification'];
  programme: Partial<Record<string, ProgrammeEvent[]>>;
  /** what the screen lists under "Comes across" */
  summary: {
    sports: SportId[];
    rules: boolean;
    categories: number;
    events: number;
    venues: number;
    records: number;
    registration: boolean;
    about: boolean;
    branding: boolean;
    contact: boolean;
    ageRule?: Tournament['ageVerification'];
  };
}

const countRecords = (formats: Tournament['formats'] | undefined): number => {
  let n = 0;
  for (const f of Object.values(formats ?? {})) {
    const raw = (f as Record<string, unknown> | undefined)?.records;
    try { const list = typeof raw === 'string' ? JSON.parse(raw) : raw; if (Array.isArray(list)) n += list.length; } catch { /* a broken book counts as empty */ }
  }
  return n;
};

/**
 * The copy of `src`.
 * - `own`: the copier runs the source (its branding and contact are theirs).
 * - `withAbout`: copy someone else's About & rules text (own: always).
 * `today` is the copier's "YYYY-MM-DD".
 */
export function planCopy(src: CopySource, opts: { mode: CopyMode; own: boolean; withAbout?: boolean; today: string }): CopyPlan {
  const t = src.tournament;
  const next = opts.mode === 'next';
  const mine = next || opts.own;
  const years = yearsAhead(t.startDate, opts.today, opts.mode);
  const startDate = addYears(t.startDate, years);
  const endDate = addYears(t.endDate < t.startDate ? t.startDate : t.endDate, years);
  const carried: Partial<Record<string, ProgrammeEvent[]>> = {};
  for (const sp of t.sports) {
    const list = readProgramme(t.formats?.[sp] as Record<string, unknown> | undefined, sp);
    if (list.length) carried[sp] = list;
  }
  const programme = programmeFrom(src.phases, years, carried);
  const formats = copyFormats(t.formats, { records: next, programme });
  const about = mine || opts.withAbout ? t.about?.trim() || undefined : undefined;
  const grounds = (t.grounds ?? []).filter((g) => g.trim());
  const registration = t.registrationDeadline != null || t.minTeams != null || t.maxTeams != null;
  const fields: CopyPlan['fields'] = {
    sports: [...t.sports],
    formats,
    ...(t.structure ? { structure: t.structure } : {}),
    ...(t.knockoutFormat ? { knockoutFormat: t.knockoutFormat } : {}),
    ...(t.participation ? { participation: t.participation } : {}),
    ...(t.scoring ? { scoring: t.scoring } : {}),
    ...(t.reminderLeadMinutes?.length ? { reminderLeadMinutes: [...t.reminderLeadMinutes] } : {}),
    ...(t.registrationDeadline ? { registrationDeadline: addYears(t.registrationDeadline, years) } : {}),
    ...(t.minTeams != null ? { minTeams: t.minTeams } : {}),
    ...(t.maxTeams != null ? { maxTeams: t.maxTeams } : {}),
    ...(t.city ? { city: t.city } : {}),
    ...(grounds.length ? { grounds } : {}),
    ...(t.timeZone ? { timeZone: t.timeZone } : {}),
    ...(t.eventCategory ? { eventCategory: t.eventCategory } : {}),
    ...(about ? { about } : {}),
    ...(mine && t.logoUrl ? { logoUrl: t.logoUrl } : {}),
    ...(mine && t.bannerUrl ? { bannerUrl: t.bannerUrl } : {}),
    ...(mine && t.organiserPhone ? { organiserPhone: t.organiserPhone } : {}),
    ...(mine && t.organiserEmail ? { organiserEmail: t.organiserEmail } : {}),
  };
  const categories = [...src.categories]
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((c, i) => ({ label: c.label, ...(c.ageGroup ? { ageGroup: c.ageGroup } : {}), ...(c.gender ? { gender: c.gender } : {}), sort: i }));
  const ageRule = t.ageVerification && t.ageVerification !== 'none' ? t.ageVerification : undefined;
  const ownName = next || opts.own;
  const bumped = nextName(t.name, years, Number(startDate.slice(0, 4)), opts.mode);
  return {
    mode: opts.mode,
    years,
    // Someone else's tournament: the copier names their own.
    name: !ownName ? '' : opts.mode === 'clone' && bumped === t.name.trim().replace(/\s+/g, ' ') ? `${bumped} (copy)` : bumped,
    startDate,
    endDate,
    fields,
    categories,
    ...(ageRule ? { ageVerification: ageRule } : {}),
    programme,
    summary: {
      sports: [...t.sports],
      rules: Object.keys(formats).length > 0 || !!t.structure,
      categories: categories.length,
      events: Object.values(programme).reduce((n, l) => n + (l?.length ?? 0), 0),
      venues: grounds.length,
      records: next ? countRecords(t.formats) : 0,
      registration,
      about: !!about,
      branding: !!(fields.logoUrl || fields.bannerUrl),
      contact: !!(fields.organiserPhone || fields.organiserEmail),
      ...(ageRule ? { ageRule } : {}),
    },
  };
}

/** The copy's dates and name must make sense before it's created. */
export function copyProblem(p: { name: string; startDate: string; endDate: string; mode: CopyMode; previousStart?: string }): string | null {
  if (!p.name.trim()) return 'Give the tournament a name.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(p.endDate)) return 'Pick the start and end dates.';
  if (p.endDate < p.startDate) return 'The end date must be on or after the start date.';
  if (p.mode === 'next' && p.previousStart && p.startDate <= p.previousStart) return 'The next edition has to start after this one.';
  return null;
}

/* -------------------------------- editions -------------------------------- */

export interface EditionRow { id: string; name: string; startDate: string; deletedAt?: string | null }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A tournament's editions, oldest first, each labelled by its year — or
 *  month and year when two editions share a year. Deleted ones are left out. */
export function editionList(rows: EditionRow[]): (EditionRow & { label: string })[] {
  const live = rows.filter((r) => !r.deletedAt && /^\d{4}-\d{2}/.test(r.startDate));
  const uniq = [...new Map(live.map((r) => [r.id, r])).values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  const perYear = new Map<string, number>();
  for (const r of uniq) perYear.set(r.startDate.slice(0, 4), (perYear.get(r.startDate.slice(0, 4)) ?? 0) + 1);
  return uniq.map((r) => {
    const y = r.startDate.slice(0, 4);
    return { ...r, label: (perYear.get(y) ?? 0) > 1 ? `${MONTHS[Number(r.startDate.slice(5, 7)) - 1] ?? ''} ${y}`.trim() : y };
  });
}
