/**
 * Security W3 (CL-05 / CL-06). PURE.
 *  - CL-05: a sign-out that fails (offline at a ground) still removes the
 *    session from this device: supabase-js gives up on a network error without
 *    clearing it, so fall back to a local sign-out.
 *  - CL-06: every way a session ends (the button, a revoked or expired token,
 *    the account deleted elsewhere) cleans the device. An account switch cleans
 *    only what's local — the new account's push registration must stay.
 */
export type SignOutAuth = { signOut: (o?: { scope?: 'global' | 'local' | 'others' }) => Promise<{ error: unknown }> };

export async function signOutSafely(auth: SignOutAuth): Promise<'global' | 'local'> {
  const { error } = await auth.signOut().catch((e: unknown) => ({ error: e }));
  if (!error) return 'global';
  await auth.signOut({ scope: 'local' }).catch(() => undefined);
  return 'local';
}

export type AuthPlan = 'signed-out' | 'switch' | 'ignore' | string;

/** 'full' = release push, alerts, reminders, web push and the offline copies;
 *  'local' = alerts, reminders and offline copies only; 'none'. */
export function cleanupFor(plan: AuthPlan, prevUser: string | null, nextUser: string | null): 'full' | 'local' | 'none' {
  if (plan === 'signed-out') return prevUser ? 'full' : 'none';
  if (plan === 'switch') return prevUser && nextUser && prevUser !== nextUser ? 'local' : 'none';
  return 'none';
}
