/**
 * Security W4 (CL-25): console helpers (`__sportfolioOutbox`, `__sportfolioGroups`,
 * `__sportnnoteAdmin`…) are registered only where they belong:
 *  - test / preview hooks: development builds and the demo (no backend);
 *  - the founder's admin tools: once a SportnNote support account is signed in.
 * A live build for everyone else carries none. PURE: modules call
 * `exposeGlobal` at load; the app turns them on (RootNavigator / auth).
 */
type Kind = 'test' | 'admin';
const held = new Map<string, { kind: Kind; value: Record<string, unknown> }>();
const on: Record<Kind, boolean> = { test: typeof __DEV__ !== 'undefined' && !!__DEV__, admin: false };

const g = () => globalThis as unknown as Record<string, unknown>;

function apply(name: string): void {
  const h = held.get(name);
  if (!h) return;
  if (on[h.kind]) g()[name] = h.value;
  else delete g()[name];
}

/** Register a console helper (merged with any earlier one of the same name). */
export function exposeGlobal(name: string, value: Record<string, unknown>, kind: Kind = 'test'): void {
  const prev = held.get(name)?.value ?? {};
  held.set(name, { kind, value: { ...prev, ...value } });
  apply(name);
}

/** Turn a kind on or off (demo / development: 'test'; a support sign-in: 'admin'). */
export function allowGlobals(kind: Kind, allowed: boolean): void {
  on[kind] = allowed;
  for (const name of held.keys()) apply(name);
}

export const globalsAllowed = (kind: Kind): boolean => on[kind];
