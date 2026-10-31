/**
 * What picking one value of a format field changes. A preset or choice option
 * may name sibling values (`set`) that go with it — tennis "Best of 3" snaps
 * every rule, and "Games per set: 4" moves the tiebreak to 4-4 (MVP T1).
 * PURE (no React Native), so the format editor and tests share it.
 */
import type { FormatField } from './types';

type Val = number | string | boolean;

export const fieldChanges = (field: FormatField, value: Val): Array<[string, Val]> => {
  const opt = field.options?.find((o) => o.value === value);
  return [[field.key, value], ...Object.entries(opt?.set ?? {}), ...Object.entries(field.derive?.(value) ?? {})];
};

/** MVP B7 — a number field's value when the box is left: blank (0 or not a
 *  number, where 0 isn't allowed) → the default; otherwise kept within min–max. */
export const clampNumber = (field: FormatField, v: number): number => {
  const min = field.min ?? -Infinity, max = field.max ?? Infinity;
  if (!Number.isFinite(v) || (v === 0 && min > 0)) return Number(field.default);
  return Math.min(max, Math.max(min, v));
};

/** MVP PD1 — a field that doesn't apply to the current values (hideWhen). */
export const isHidden = (field: FormatField, values: Record<string, Val | undefined>): boolean =>
  !!field.hideWhen && values[field.hideWhen.key] === field.hideWhen.value;
