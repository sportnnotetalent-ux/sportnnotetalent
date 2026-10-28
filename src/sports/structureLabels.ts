/**
 * The match and tournament setup's structure chips, in the sport's own words
 * (its `playersPerSide` options): "Singles" / "Doubles"; pool says "Scotch
 * doubles" (usability follow-up, founder 2026-10-28). PURE.
 */
import type { SportMeta } from './types';

export function structureLabels(meta: Pick<SportMeta, 'formatFields'> | undefined): { one: string; two: string } {
  const f = meta?.formatFields?.find((x) => x.key === 'playersPerSide');
  const label = (n: number, fallback: string) => {
    const o = f?.options?.find((x) => x.value === n);
    return typeof o?.label === 'string' ? o.label : fallback;
  };
  return { one: label(1, 'Singles'), two: label(2, 'Doubles') };
}
