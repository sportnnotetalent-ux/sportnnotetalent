/**
 * Security W3 (CL-16): a photo picked in a browser is uploaded as the original
 * file — EXIF and GPS included (expo-image-picker's web side ignores quality
 * and editing). Re-encoding it through a canvas drops all of that. PURE: the
 * decision; core/photo.ts does the drawing.
 */
export const MAX_SIDE = 2048;

/** The format to re-encode to, or null to keep the file (a GIF: no EXIF, and
 *  re-encoding would stop an animation). PNG stays PNG (transparent logos). */
export function reencodeAs(mime: string | null | undefined): 'image/jpeg' | 'image/png' | null {
  const m = (mime ?? '').toLowerCase();
  if (m === 'image/gif') return null;
  if (m === 'image/png') return 'image/png';
  return 'image/jpeg';   // jpeg, webp, heic, or unknown
}

/** Fit inside MAX_SIDE, keeping the shape (never enlarged). */
export function fitSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  if (!(w > 0 && h > 0)) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
