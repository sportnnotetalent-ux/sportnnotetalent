/**
 * The chain, link 1 (founder 2026-11-02, docs/security/breaks/info-chain.md):
 * a match's Info lists every rule it is played under and every kind of stat
 * it captures — the same settings Scoring offers, in every sport. PURE.
 *
 *   matchRules     every format field, as "label: value" (the match's value,
 *                  else the field's standard — what the engine plays it under);
 *                  a field its `hideWhen` hides is left out, and so are stats
 *                  switches (they are captures) and keys Scoring settings owns
 *   matchCaptures  every stats switch on / off: Scoring settings' toggles (read
 *                  from the match: the log in event mode, the format in config
 *                  mode) and any stats switch among the format fields; the
 *                  settings' other options (units, buckets, half length …) as rules
 *   liveOwnedKeys  the keys Scoring settings owns — Edit format leaves them out,
 *                  so a switch lives in one place only
 *   settingsUnit   the sport's word for what the settings apply from
 */
import type { FormatField, FormatValue, LiveSettings } from './types';
import { hideRuleHolds } from './formatPick.ts';

export interface RuleLine { key: string; label: string; value: string }
export interface CaptureLine { key: string; label: string; on: boolean }

/** A stats-to-track switch among format fields (football "Stats captured",
 *  "Stats to track" …). */
const isCapture = (f: FormatField) => f.type === 'toggle' && /stat/i.test(f.group ?? '');

const valueOf = (f: FormatField, fmt: Record<string, unknown>): unknown => (fmt[f.key] === undefined || fmt[f.key] === null ? f.default : fmt[f.key]);

/** A value as people read it: its option's label, On / Off, or the number. */
function valueText(f: FormatField, v: unknown): string {
  const opt = f.options?.find((o) => o.value === v);
  if (opt) return opt.label;
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  // screen sweep: a zero the field gives a meaning ("0 = auto (…)", "0 = no limit")
  // reads as that meaning, never a bare 0
  const zero = v === 0 ? /^0 = ([^(·.—]+)/.exec(f.hint ?? '')?.[1]?.trim() : undefined;
  if (zero) return zero.charAt(0).toUpperCase() + zero.slice(1);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && v.trim()) return v.trim();
  return String(f.default);
}

const hidden = (f: FormatField, fields: readonly FormatField[], fmt: Record<string, unknown>): boolean => {
  if (!f.hideWhen) return false;
  const dep = fields.find((x) => x.key === f.hideWhen!.key);
  return hideRuleHolds(f.hideWhen, dep ? valueOf(dep, fmt) : fmt[f.hideWhen.key]);
};

/** Every rule of the match, in the format's order. */
export function matchRules(fields: readonly FormatField[], fmt: Record<string, unknown> | null | undefined, opts: { omit?: readonly string[] } = {}): RuleLine[] {
  const f0 = fmt ?? {};
  return fields
    .filter((f) => !isCapture(f) && !opts.omit?.includes(f.key) && !hidden(f, fields, f0))
    .map((f) => ({ key: f.key, label: f.label, value: valueText(f, valueOf(f, f0)) }));
}

/** What the match captures (and the settings' other options, as rules). */
export function matchCaptures(
  ls: LiveSettings<unknown> | undefined, state: unknown,
  formatFields: readonly FormatField[] = [], fmt: Record<string, unknown> = {},
): { captures: CaptureLine[]; rules: RuleLine[] } {
  const captures: CaptureLine[] = [];
  const rules: RuleLine[] = [];
  if (ls) {
    let cur: Record<string, FormatValue> = {};
    try { cur = ls.read(state) ?? {}; } catch { cur = {}; }
    for (const f of ls.fields) {
      const v = cur[f.key] ?? f.default;
      if (f.type === 'toggle') captures.push({ key: f.key, label: f.label, on: v === true });
      else rules.push({ key: f.key, label: f.label, value: valueText(f, v) });
    }
  }
  const owned = new Set(captures.map((c) => c.key));
  for (const f of formatFields) {
    if (isCapture(f) && !owned.has(f.key)) captures.push({ key: f.key, label: f.label, on: valueOf(f, fmt) === true });
  }
  return { captures, rules };
}

/** Shared scoring (docs/security/breaks/shared-scoring.md): how the match is
 *  scored, as an Info rule line. */
export const scoringRule = (shared: boolean): RuleLine => ({
  key: '__scoring', label: 'Scoring', value: shared ? 'Shared — several phones at once' : 'One phone at a time',
});

/** The keys Scoring settings owns (Edit format leaves them out). */
export const liveOwnedKeys = (ls: LiveSettings<unknown> | undefined): string[] => (ls ? ls.fields.map((f) => f.key) : []);

/** The sport's word for what new settings apply from ("the next ball / point …"). */
export function settingsUnit(sport: string): { one: string; many: string; done: string } {
  switch (sport) {
    case 'cricket': return { one: 'ball', many: 'Balls', done: 'bowled' };
    case 'carrom': return { one: 'board', many: 'Boards', done: 'played' };
    case 'kabaddi': return { one: 'raid', many: 'Raids', done: 'made' };
    case 'volleyball': return { one: 'rally', many: 'Rallies', done: 'played' };
    case 'chess': return { one: 'game', many: 'Games', done: 'played' };
    default: return { one: 'point', many: 'Points', done: 'played' };
  }
}
