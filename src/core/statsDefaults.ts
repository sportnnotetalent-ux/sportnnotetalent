/** Each sport's "Stats to track" defaults, for tournaments
 *  (docs/security/breaks/tournament-stats-defaults.md). A tournament stores only
 *  what the organiser set and its matches read a missing stats key as OFF, so
 *  the defaults are written in when a tournament is created, and older ones get
 *  them through Edit tournament → "Use the new defaults". Only missing keys;
 *  only toggles in the "Stats to track" group (TS2 / TS7). PURE. */
type Field = { key: string; type: string; default?: unknown; tournamentDefault?: unknown; group?: string; label?: string };
/** TS8: a tournament's value — the field's tournament default if it has one */
const tourValue = (f: Field) => (f.tournamentDefault !== undefined && f.tournamentDefault !== null ? f.tournamentDefault : f.default) === true;
type Formats = Partial<Record<string, Record<string, unknown>>>;
export const STATS_GROUP = 'Stats to track';

export function statsDefaults(fields: readonly Field[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of fields) if (f.type === 'toggle' && f.group === STATS_GROUP) out[f.key] = tourValue(f);
  return out;
}

/** per sport, the stats keys its format doesn't have yet (empty sports left out) */
export function missingStatsDefaults<S extends string>(sports: readonly S[], formats: Formats | null | undefined, fieldsOf: (sport: S) => readonly Field[]): Partial<Record<S, Record<string, boolean>>> {
  const out: Partial<Record<S, Record<string, boolean>>> = {};
  for (const sp of sports) {
    const have = formats?.[sp] ?? {};
    const miss = Object.fromEntries(Object.entries(statsDefaults(fieldsOf(sp))).filter(([k]) => !Object.hasOwn(have, k)));
    if (Object.keys(miss).length) out[sp] = miss;
  }
  return out;
}

/** `formats` with each sport's missing stats defaults added (chosen values kept) */
export function withStatsDefaults<S extends string, F extends Record<string, unknown>>(sports: readonly S[], formats: Partial<Record<S, F>> | null | undefined, fieldsOf: (sport: S) => readonly Field[]): Partial<Record<S, F>> {
  const out: Partial<Record<S, F>> = { ...(formats ?? {}) } as Partial<Record<S, F>>;
  const miss = missingStatsDefaults(sports, formats as Formats, fieldsOf);
  for (const sp of Object.keys(miss) as S[]) out[sp] = { ...((out[sp] ?? {}) as F), ...miss[sp] } as F;
  return out;
}

/** TS3 / TS4: what "Use the new defaults" would change on an existing tournament —
 *  every stats toggle whose saved value is missing or differs from today's
 *  default (older tournaments made with the full form saved that day's defaults,
 *  which can't be told apart from choices, so the card names each one). */
export function statsUpdates<S extends string>(sports: readonly S[], formats: Formats | null | undefined, fieldsOf: (sport: S) => readonly Field[]): { sport: S; key: string; value: boolean; label: string }[] {
  const out: { sport: S; key: string; value: boolean; label: string }[] = [];
  for (const sp of sports) {
    const have = formats?.[sp] ?? {};
    for (const f of fieldsOf(sp)) {
      if (f.type !== 'toggle' || f.group !== STATS_GROUP) continue;
      const value = tourValue(f);
      if (have[f.key] !== value) out.push({ sport: sp, key: f.key, value, label: f.label ?? f.key });
    }
  }
  return out;
}
