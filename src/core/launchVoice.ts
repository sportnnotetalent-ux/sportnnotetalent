/**
 * Reference-video A2: when the "Sport n Note" voice plays. Only with the full
 * launch animation (the first launch on a device), never on the web (browsers
 * block autoplay), never with reduced motion, only if the person hasn't
 * switched it off, only on an app build that has the audio module (1.1.0 and
 * later — older builds receive the same code over the air and stay silent),
 * and only once the real recording is in place.
 */
export function shouldPlayVoice(o: {
  full: boolean;
  web: boolean;
  reducedMotion: boolean;
  soundOn: boolean;
  moduleReady: boolean;
  clipReady: boolean;
}): boolean {
  return o.full && !o.web && !o.reducedMotion && o.soundOn && o.moduleReady && o.clipReady;
}
