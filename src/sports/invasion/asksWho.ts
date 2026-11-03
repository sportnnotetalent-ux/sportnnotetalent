/**
 * Screen sweep (docs/security/breaks/screen-sweep-invasion.md): an outcome tap
 * ("Saved", "Missed", a card colour) asks "who?" only when the side lists
 * somebody. With nobody listed (a quick friendly with no squad) the "who?" step
 * is a dead end the scorer reads as done, so the tap records at once, unnamed:
 * one tap stays one tap. PURE.
 */
export const asksWho = (listed: readonly unknown[] | null | undefined): boolean => !!listed && listed.length > 0;
