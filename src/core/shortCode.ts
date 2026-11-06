/** A team's 2–4 letter short code, worked out from its name when the
 *  organiser leaves it empty (reference-video C5): "Red House" → "RH",
 *  "Sunday Football Club" → "SFC", "Strikers" → "STR". */
export function shortCodeFrom(name: string): string {
  const words = name.toUpperCase().split(/\s+/).map((w) => w.replace(/[^A-Z0-9]/g, '')).filter(Boolean);
  if (!words.length) return 'TM';
  if (words.length === 1) return words[0].slice(0, 3).padEnd(2, 'X');
  return words.slice(0, 4).map((w) => w[0]).join('');
}

/** What gets saved: the organiser's own code (cleaned), else one from the name. */
export function shortCodeToSave(typed: string, name: string): string {
  const own = typed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return own.length >= 2 ? own : shortCodeFrom(name);
}
