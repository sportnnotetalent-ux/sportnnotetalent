/**
 * Security W3 (CL-09): the sign-up form passes the date of birth, phone and
 * guardian contact as auth user_metadata so the database can create the
 * profile. Supabase copies that metadata into every access token and the
 * stored session, so once the profile exists those keys are cleared (the
 * name and role stay: Home renders from them on a fresh sign-in). PURE.
 */
// phone_ticket: the spent one-time sign-up ticket (2026-10-29, SMS at sign-up)
const PRIVATE_KEYS = ['dob', 'phone', 'guardian', 'phone_ticket'] as const;

/** The patch for `auth.updateUser({ data })`, or null when nothing's left. */
export function metadataToClear(meta: Record<string, unknown> | null | undefined): Record<string, null> | null {
  if (!meta) return null;
  const out: Record<string, null> = {};
  for (const k of PRIVATE_KEYS) if (meta[k] != null && meta[k] !== '') out[k] = null;
  return Object.keys(out).length ? out : null;
}
