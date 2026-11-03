/** Doubles pair type (docs/security/breaks/doubles-picker.md DP8–DP12): Open
 *  (default) / Men's / Women's / Mixed, stored as the format's `category`
 *  (lineContext reads 'mixed' as the Mixed career split). Shown only in
 *  doubles. A format without it reads Open. Friendlies never check genders.
 *
 *  PURE (no React Native). */
import type { FormatField } from './types';

export type PairType = 'open' | 'men' | 'women' | 'mixed';
export const PAIR_TYPES: readonly PairType[] = ['open', 'men', 'women', 'mixed'];

/** The racket sports that play doubles and carry the field. */
export const PAIR_TYPE_SPORTS: readonly string[] = ['tennis', 'badminton', 'tabletennis', 'squash', 'pickleball', 'padel'];

export const PAIR_TYPE_FIELD: FormatField = {
  key: 'category', label: 'Pair type', type: 'choice', default: 'open',
  hideWhen: { key: 'playersPerSide', value: 1 },
  options: [
    { value: 'open', label: 'Open' },
    { value: 'men', label: 'Men’s' },
    { value: 'women', label: 'Women’s' },
    { value: 'mixed', label: 'Mixed' },
  ],
  hint: 'any pair may play any pair in a friendly',
};

/** The format's pair type; anything missing or unknown reads Open. */
export const pairTypeOf = (fmt: Record<string, unknown> | null | undefined): PairType => {
  const v = fmt?.category;
  return PAIR_TYPES.includes(v as PairType) ? (v as PairType) : 'open';
};

/** On save: a singles match never keeps a pair type (it would file under
 *  "Mixed"); an unknown value becomes Open. A format without the key (a
 *  sport without the field) is left alone. */
export function settlePairType<T extends Record<string, unknown>>(fmt: T, doubles: boolean): T {
  if (!('category' in fmt)) return fmt;
  return { ...fmt, category: doubles ? pairTypeOf(fmt) : 'open' };
}

const FROM_GENDER: Record<string, PairType> = { boys: 'men', girls: 'women', mixed: 'mixed' };

/** A tournament's divisions → its doubles pair type, only when they agree:
 *  the picked sides' own divisions first (when they have one), else every
 *  gendered division of the tournament. Undefined = don't guess. */
export function pairTypeFromDivisions(
  categories: readonly { id: string; gender?: string | null }[],
  entries: readonly { team: { id: string }; categoryId?: string | null }[] = [],
  sideIds: readonly (string | null | undefined)[] = [],
): PairType | undefined {
  const genderOf = new Map(categories.map((c) => [c.id, c.gender ?? undefined] as const));
  const sideCats = sideIds
    .map((id) => (id ? entries.find((e) => e.team.id === id)?.categoryId : undefined))
    .filter((c): c is string => !!c);
  const pool = sideCats.length ? sideCats.map((c) => genderOf.get(c)) : categories.map((c) => c.gender ?? undefined);
  const types = new Set(pool.filter((g): g is string => !!g).map((g) => FROM_GENDER[g]).filter(Boolean));
  if (sideCats.length && pool.some((g) => !g)) return undefined;
  return types.size === 1 ? [...types][0] : undefined;
}
