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
  return [[field.key, value], ...Object.entries(opt?.set ?? {})];
};
