/** A whole mobile number (8+ digits) or an email — searched in Discover as an
 *  exact contact match (migration 0034), never as a partial. Pure. */
export function looksLikeContact(q: string): 'phone' | 'email' | null {
  const t = q.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'email';
  if (/^[+\d(][\d\s()+-]*$/.test(t) && t.replace(/\D/g, '').length >= 8) return 'phone'; // SG/QA mobiles are 8 digits
  return null;
}

/** MVP F6 — a typed name that can be added as a name-only player: 2+
 *  characters, not a number or an email (nor half of one). Pure. */
export function nameOnlyOk(q: string): boolean {
  const t = q.trim();
  return t.length >= 2 && !looksLikeContact(t) && !t.includes('@') && !/^[+\d\s()-]+$/.test(t);
}
