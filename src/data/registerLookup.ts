/** Register lookup (2026-10-27): a school's official ID checked against the
 *  public register for support (register-lookup edge function; CBSE SARAS
 *  today). Each number is read once per session. */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { fnPath } from '../core/functionPath';
import { OFFICIAL_ID_RULES } from '../core/orgVerification';
import type { RegisterResult } from '../core/registerLookup';

const seen = new Map<string, Promise<RegisterResult>>();

/** Can this ID type be checked automatically? */
export const canLookUp = (type: string): type is 'cbse' => type === 'cbse';

export function lookupRegister(type: 'cbse', value: string, demoName?: string): Promise<RegisterResult> {
  const key = `${type}:${value}`;
  const cached = seen.get(key);
  if (cached) return cached;
  const url = OFFICIAL_ID_RULES.cbse.record!(value);
  const p: Promise<RegisterResult> = !isSupabaseConfigured || !supabase
    ? Promise.resolve({
      found: true, source: 'CBSE SARAS (demo)', url,
      record: { name: (demoName ?? 'Demo School').toUpperCase(), affiliation: value, state: 'KARNATAKA', district: 'BENGALURU URBAN', head: 'Dr. Vikram Rao', status: 'Senior Secondary Level', from: '2024-04-01', to: '2029-03-31' },
    })
    : supabase.functions.invoke(fnPath('register-lookup'), { body: { type, value } }).then(async ({ data, error }) => {
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
        throw new Error((body as { error?: string } | null)?.error ?? 'The register check didn’t work — open the register directly.');
      }
      return data as RegisterResult;
    });
  seen.set(key, p);
  p.catch(() => seen.delete(key));
  return p;
}
