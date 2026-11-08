/** Reading the one contact the user picked (docs/security/breaks/sport-row-contacts.md).
 *  Android's picker grants access to that contact's link only; reading its name
 *  and numbers needs the contacts permission. So: read; if that fails or comes
 *  back empty, ask for the permission once (only now, after they picked) and read
 *  again. PURE — the contact and the permission prompt are passed in. */
export type PickedContact = { name?: string; phones: string[] };
type Readable = { getFullName: () => Promise<string>; getPhones: () => Promise<{ number?: string | null }[]> };

const readOnce = async (c: Readable): Promise<PickedContact | null> => {
  try {
    const [name, phones] = await Promise.all([c.getFullName(), c.getPhones()]);
    const out = { name: name?.trim() || undefined, phones: phones.map((p) => p.number ?? '').filter(Boolean) };
    // PC1: nothing at all is a failed read, not a contact without a number
    return out.name || out.phones.length ? out : null;
  } catch {
    return null;
  }
};

export async function readPicked(c: Readable, askPermission: () => Promise<boolean>): Promise<{ kind: 'ok'; contact: PickedContact } | { kind: 'denied' }> {
  const first = await readOnce(c);
  if (first) return { kind: 'ok', contact: first };
  if (!(await askPermission())) return { kind: 'denied' };
  const again = await readOnce(c);
  return again ? { kind: 'ok', contact: again } : { kind: 'denied' };
}
