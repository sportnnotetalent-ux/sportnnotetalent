/** A list row's avatar letters (reference-video B4): the first letters of the
 *  first two words of the name as the app already shows it (an under-18's
 *  masked name stays masked). Symbols and emoji are skipped. */
export function initialsOf(name: string | null | undefined): string {
  const words = String(name ?? '').split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  if (!words.length) return '?';
  const first = [...words[0]][0] ?? '';
  const second = words.length > 1 ? [...words[words.length - 1]][0] ?? '' : '';
  return (first + second).toUpperCase() || '?';
}
