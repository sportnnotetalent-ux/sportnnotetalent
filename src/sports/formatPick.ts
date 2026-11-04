/**
 * What picking one value of a format field changes. A preset or choice option
 * may name sibling values (`set`) that go with it — tennis "Best of 3" snaps
 * every rule, and "Games per set: 4" moves the tiebreak to 4-4 (MVP T1).
 * PURE (no React Native), so the format editor and tests share it.
 */
import type { FormatField } from './types';

type Val = number | string | boolean;

/** Today's date in India, 'YYYY-MM-DD'. */
const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** Default values for a field set, e.g. to seed a fresh format map. Applies the
 *  DEFAULT preset's `set{}` on top of the per-field defaults, so a fresh format
 *  actually matches the preset shown as selected (otherwise a sport whose preset
 *  default names non-default siblings — e.g. padel "Premier" ⇒ golden point —
 *  would silently seed the wrong rules). A preset's dated default
 *  (`defaultFrom`) applies from its date (badminton 3×15). */
export const formatDefaults = (fields: FormatField[], ctx?: 'tournament', today: string = todayIST()): Record<string, Val> => {
  const preset = fields.find((f) => f.type === 'preset');
  // A preset may name a different default for tournaments (SD-06: pickleball).
  let presetDefault = ctx === 'tournament' && preset?.tournamentDefault != null ? preset.tournamentDefault : preset?.default;
  if (preset?.defaultFrom && today >= preset.defaultFrom.date) presetDefault = preset.defaultFrom.value;
  // A field may name its own tournament default too (MVP B2: basketball's clock mode)
  const out: Record<string, Val> = Object.fromEntries(fields.map((f) => [f.key, f === preset ? presetDefault! : (ctx === 'tournament' && f.tournamentDefault != null ? f.tournamentDefault : f.default)]));
  const chosen = preset?.options?.find((o) => o.value === presetDefault);
  if (chosen?.set) Object.assign(out, chosen.set);
  return out;
};

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

/** Does a `hideWhen` rule hide its field, given the other field's value?
 *  `{ value }`: hidden while equal (MVP PD1). `{ unless: [...] }` (cue batch 5):
 *  hidden unless the value is one of the list — a malformed list hides. */
export const hideRuleHolds = (rule: NonNullable<FormatField['hideWhen']>, v: unknown): boolean => {
  if ('unless' in rule) return !Array.isArray(rule.unless) || !rule.unless.includes(v as Val);
  return v === rule.value;
};

/** MVP PD1 — a field that doesn't apply to the current values (hideWhen).
 *  `fields` (optional): a value not set yet reads its field's default. */
export const isHidden = (field: FormatField, values: Record<string, Val | undefined>, fields?: readonly FormatField[]): boolean => {
  const rule = field.hideWhen;
  if (!rule) return false;
  const v = values[rule.key] ?? fields?.find((f) => f.key === rule.key)?.default;
  return hideRuleHolds(rule, v);
};
