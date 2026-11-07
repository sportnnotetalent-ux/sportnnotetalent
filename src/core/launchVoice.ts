/**
 * Reference-video A2: when the "Sport n Note" voice plays. Founder 2026-11-07:
 * on every launch, so the name rings each time the app opens (off in Settings),
 * never on the web (browsers
 * block autoplay), never with reduced motion, only if the person hasn't
 * switched it off, only on an app build that has the audio module (1.1.0 and
 * later — older builds receive the same code over the air and stay silent),
 * and only once the real recording is in place.
 */
/** S:N shows first; the voice starts as "SportnNote" slides in (580–960 ms)
 *  and, at 1.75 s long, ends before the screen fades into Home. */
export const VOICE_AT_MS = 600;
export const VOICE_MS = 1750;

export function shouldPlayVoice(o: {
  web: boolean;
  reducedMotion: boolean;
  soundOn: boolean;
  moduleReady: boolean;
  clipReady: boolean;
}): boolean {
  return !o.web && !o.reducedMotion && o.soundOn && o.moduleReady && o.clipReady;
}
