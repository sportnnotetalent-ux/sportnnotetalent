/**
 * Register lookup (2026-10-27) — comparing what a school entered with its
 * public record (register-lookup: CBSE SARAS today). Names on registers are
 * written differently ("THE LAWRENCE SCHOOL, LOVEDALE" vs "Lawrence School"),
 * so the check ignores case, punctuation and filler words, and says "matches",
 * "close" or "differs" — support still decides.
 *
 * PURE (no React Native) — node tests load it.
 */

export interface RegisterRecord {
  name: string;
  affiliation?: string;
  state?: string;
  district?: string;
  address?: string;
  pin?: string;
  head?: string;
  status?: string;
  schoolType?: string;
  trust?: string;
  /** affiliation period, YYYY-MM-DD */
  from?: string;
  to?: string;
}

export interface RegisterResult { found: boolean; source: string; url: string; record?: RegisterRecord }

export type NameMatch = 'match' | 'close' | 'differs';

/** Words a school's name often has or drops ("Sr. Sec.", "Public", "English Medium"). */
const FILLER = new Set([
  'the', 'school', 'schools', 'sr', 'sec', 'senior', 'secondary', 'higher', 'high', 'public', 'english', 'medium',
  'co', 'ed', 'of', 'and', 'vidyalaya', 'vidyalay', 'academy', 'international', 'residential', 'convent', 'institute',
]);

const words = (s: string): string[] =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9ऀ-෿]+/g, ' ').split(' ').filter(Boolean);
const core = (s: string): string[] => {
  const all = words(s);
  const kept = all.filter((w) => !FILLER.has(w));
  return kept.length ? kept : all;
};

/** Does the register's name match the community's? */
export function compareNames(entered: string, register: string): NameMatch {
  const a = new Set(core(entered)), b = new Set(core(register));
  if (!a.size || !b.size) return 'differs';
  const shared = [...a].filter((w) => b.has(w)).length;
  if (shared === a.size && shared === b.size) return 'match';
  const smaller = Math.min(a.size, b.size);
  return shared >= Math.max(1, smaller) || shared / new Set([...a, ...b]).size >= 0.5 ? 'close' : 'differs';
}

/** Is the person who confirmed the head the register's principal? (surname or
 *  most of the name in common — titles and initials ignored) */
export function compareHeads(confirmed: string | undefined, register: string | undefined): NameMatch | undefined {
  if (!confirmed?.trim() || !register?.trim()) return undefined;
  const titles = new Set(['dr', 'mr', 'mrs', 'ms', 'shri', 'smt', 'sri', 'prof', 'rev', 'fr', 'sr']);
  const name = (s: string) => words(s).filter((w) => w.length > 1 && !titles.has(w));
  const a = name(confirmed), b = new Set(name(register));
  if (!a.length || !b.size) return undefined;
  const shared = a.filter((w) => b.has(w)).length;
  if (shared === a.length && shared === b.size) return 'match';
  return shared >= 1 ? 'close' : 'differs';
}

/** Is the affiliation still current on `today` (YYYY-MM-DD)? */
export function affiliationCurrent(r: Pick<RegisterRecord, 'to'>, today: string): boolean | undefined {
  return r.to ? r.to >= today : undefined;
}
