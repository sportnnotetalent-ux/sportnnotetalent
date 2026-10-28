/**
 * 2026-10-29 redesign — a label's leading emoji, split off so the shared
 * components can draw a line icon (or a sport's colour dot) in its place.
 * PURE. Plain string checks (no Unicode property escapes), so it runs the same
 * on Hermes, the web and in the node tests.
 */

const VS16 = '️';
const ZWJ = '‍';

/** The label's leading emoji when it is one of `keys` (longest match first,
 *  a trailing variation selector ignored), and the words after it. */
export function splitLeading(label: string, keys: readonly string[]): { key: string; rest: string } | null {
  if (typeof label !== 'string' || !label) return null;
  let best: string | null = null;
  for (const k of keys) {
    if (label.startsWith(k) && (!best || k.length > best.length)) best = k;
  }
  if (!best) return null;
  let i = best.length;
  while (label[i] === VS16) i++;
  return { key: best, rest: label.slice(i).trimStart() };
}

/** Is this code point a pictograph, a dingbat / symbol, or an arrow? */
function isEmojiCodePoint(cp: number): boolean {
  return (cp >= 0x1F000 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x2190 && cp <= 0x21FF)
    || (cp >= 0x2300 && cp <= 0x23FF) || (cp >= 0x2B00 && cp <= 0x2BFF) || (cp >= 0x25A0 && cp <= 0x25FF);
}

/** The label without its leading emoji (a joined sequence included) — for
 *  section titles drawn in capitals. Never returns an empty title. */
export function stripLeadingEmoji(title: string): string {
  if (typeof title !== 'string') return title;
  let i = 0;
  let took = false;
  while (i < title.length) {
    const cp = title.codePointAt(i)!;
    if (isEmojiCodePoint(cp)) { i += cp > 0xFFFF ? 2 : 1; took = true; continue; }
    if (took && (title[i] === VS16 || title[i] === ZWJ || (cp >= 0x1F3FB && cp <= 0x1F3FF))) { i += 1; continue; }
    break;
  }
  if (!took) return title;
  const rest = title.slice(i).trimStart();
  return rest || title;
}

/** "⚽ Football" → the sport, when the words are exactly a sport's name (a
 *  scoring chip like "🎯 On target" is not the shooting sport). */
export function sportChip(label: string, sports: readonly { id: string; name: string; icon: string }[]): { id: string; name: string } | null {
  if (typeof label !== 'string') return null;
  for (const s of sports) {
    const lead = splitLeading(label, [s.icon.replace(VS16, ''), s.icon]);
    if (lead && lead.rest === s.name) return { id: s.id, name: s.name };
  }
  return null;
}

/** A run of sports ("⚽ 🏏 🏀 …") as the badges to draw: the first `max`,
 *  each once, and how many more there are. */
export function sportStack(sports: readonly string[], max: number): { shown: string[]; more: number } {
  const all = Array.isArray(sports) ? [...new Set(sports)] : [];
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** Style keys that only mean something to text. */
const TEXT_ONLY = new Set([
  'color', 'fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'fontVariant', 'lineHeight', 'letterSpacing', 'textAlign',
  'textAlignVertical', 'textTransform', 'textDecorationLine', 'textDecorationColor', 'textDecorationStyle',
  'textShadowColor', 'textShadowOffset', 'textShadowRadius', 'includeFontPadding', 'writingDirection', 'verticalAlign',
]);

/** An emoji slot's (flattened) Text style, split for a line icon: the layout
 *  stays on the icon's box, the font size becomes the icon's size and the text
 *  colour its colour (an explicit `color` wins; else `fallback`). */
export function iconBox(style: Record<string, unknown> | null | undefined, fallback = '#14181D', color?: string): {
  box: Record<string, unknown>; size: number; color: string;
} {
  const flat = style ?? {};
  const box: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) if (!TEXT_ONLY.has(k)) box[k] = v;
  return { box, size: Math.round(Number(flat.fontSize ?? 20) * 0.95), color: color ?? (typeof flat.color === 'string' ? flat.color : fallback) };
}
