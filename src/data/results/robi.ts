/**
 * Round 2 (precision-strength) — Robi points, the IWF's best-lifter formula
 * (by Róbert Nagy), the core shared by the stat lines (weightlifting.ts) and
 * the best-lifter lists (liftingPoints.ts). Pure; no import of weightlifting.ts.
 *
 *     Robi = A × total^b,  b = log(10) / log(2) ≈ 3.3219,  A = 1000 / WR^b
 *
 * i.e. 1000 × (total / WR)^b — a total equal to the category's world-record
 * total scores 1000 points, half of it 100. The reference total ("WR") is the
 * organiser's choice per category (Competition rules `robiRefM` / `robiRefF`);
 * left empty, the IWF senior world-record totals below are used for the IWF
 * senior categories (youth / school categories: the organiser's reference only). A category with no reference has no Robi points (never a
 * false 0 — "–" on the sheet). Sources: docs/sport-depth/deep-wave/precision-strength-round2.md.
 */
import type { Category } from './model.ts';
import { ruleOf, type CompRules } from './competitionRules.ts';

/** b = log(10) / log(2): halving the total divides the points by ten. */
export const ROBI_B = Math.log(10) / Math.log(2);

/** Robi points to 0.01 (1000 × (total / reference)^b), or null without both inputs. */
export function robiPoints(total: number | null | undefined, ref: number | null | undefined): number | null {
  if (total == null || !(total > 0) || ref == null || !(ref > 0)) return null;
  return Math.round(1000 * (total / ref) ** ROBI_B * 100) / 100;
}

/**
 * The default Robi reference: the IWF senior world-record total of each
 * category (kg) — or the IWF "world standard" where no record has been set yet
 * (marked WS). Two category lists are covered, so a session keeps a default
 * whichever list it was set up with:
 *  - the categories in force from 1 August 2026 (IWF, 3 Nov 2025): men 60, 65,
 *    70, 75, 85, 95, 110, +110; women 49, 53, 57, 61, 69, 77, 86, +86;
 *  - the retired 1 June 2025 – 31 July 2026 categories the app still offers
 *    (men 71, 79, 88, 94; women 48, 58, 63) at their final record totals.
 * Read on 22 Oct 2026 from the world-records list (not cross-checked against
 * iwf.sport — verify before a championship; the 2026 Worlds start 27 Oct).
 * The organiser can replace any of them (`robiRefM` / `robiRefF`).
 */
export const ROBI_WR: { asOf: string; source: string; M: Record<string, number>; F: Record<string, number> } = {
  asOf: '22 Oct 2026',
  source: 'IWF senior world records / world standards (WS) as listed on 22 Oct 2026 — verify at iwf.sport',
  M: {
    '60 kg': 307, // WS
    '65 kg': 329,
    '70 kg': 349,
    '71 kg': 351, // retired 31 Jul 2026
    '75 kg': 366,
    '79 kg': 365, // retired
    '85 kg': 379, // 383 (6 Oct 2026) awaiting ratification
    '88 kg': 397, // retired
    '94 kg': 396, // retired, WS
    '95 kg': 398,
    '110 kg': 428,
    '+110 kg': 477, // WS
  },
  F: {
    '48 kg': 213, // retired
    '49 kg': 215,
    '53 kg': 223, // WS
    '57 kg': 238,
    '58 kg': 236, // retired
    '61 kg': 251,
    '63 kg': 254, // retired
    '69 kg': 273,
    '77 kg': 278,
    '86 kg': 289, // WS
    '+86 kg': 325, // WS
  },
};

/** "60 kg" / "+110 kg" from "60", "60kg", "+110", "110+". */
export function normClass(t: string): string | null {
  const m = /^\s*(\+)?\s*(\d+(?:\.\d+)?)\s*(?:kg)?\s*(\+)?\s*$/i.exec(t);
  if (!m) return null;
  return `${m[1] || m[3] ? '+' : ''}${Number(m[2])} kg`;
}

/**
 * The organiser's reference totals: "60: 290, 65 312, +110: 470" → { '60 kg': 290, … }.
 * null when empty or unreadable (the defaults apply).
 */
export function parseRobiRefs(text: unknown): Record<string, number> | null {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const out: Record<string, number> = {};
  for (const part of s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(?:kg)?$/i.exec(part) ?? /^(\+?\s*\d+(?:\.\d+)?\s*(?:kg)?\s*\+?)\s+(\d+(?:\.\d+)?)\s*(?:kg)?$/i.exec(part);
    if (!m) return null;
    const cls = normClass(m[1]);
    const kg = Number(m[2]);
    if (!cls || !(kg > 0)) return null;
    out[cls] = kg;
  }
  return Object.keys(out).length ? out : null;
}

/** The reference total for a session's category: the meet's own, else the IWF senior world record. */
export function robiRef(category: Pick<Category, 'gender' | 'weightClass' | 'age'> | undefined, rules?: CompRules | Record<string, unknown> | null): { kg: number; from: 'meet' | 'iwf' } | null {
  const g = category?.gender;
  const cls = category?.weightClass ? normClass(category.weightClass) : null;
  if ((g !== 'M' && g !== 'F') || !cls) return null;
  const own = parseRobiRefs(ruleOf(rules as CompRules, g === 'F' ? 'robiRefF' : 'robiRefM'));
  if (own?.[cls]) return { kg: own[cls], from: 'meet' };
  // the senior world records are the default for senior / junior (open) categories only —
  // a youth or school category of the same name is not measured against them
  if (!SENIOR_AGES.has(category?.age ?? '')) return null;
  const wr = ROBI_WR[g][cls];
  return wr ? { kg: wr, from: 'iwf' } : null;
}
const SENIOR_AGES = new Set(['', 'Senior', 'Junior', 'Open']);
