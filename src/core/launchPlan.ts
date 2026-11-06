/**
 * The launch animation (docs/design/reference-video, A1): the full scoreline
 * animation once, after install; a short one on later launches; a plain fade
 * for reduced motion; never on the TV overlay. It runs over the app, which
 * loads underneath, so it never makes the app slower to use.
 */
export const LAUNCH_FULL_MS = 1900;
export const LAUNCH_SHORT_MS = 600;
export const LAUNCH_FADE_MS = 250;
export const LAUNCH_SEEN_KEY = 'sn.launch.seen.v1';

export interface LaunchPlan { show: boolean; full: boolean; ms: number }

/** `seen`: whether the full version has played on this device (null = unknown). */
export function launchPlan(o: { seen: boolean | null; reducedMotion: boolean; overlay: boolean }): LaunchPlan {
  if (o.overlay) return { show: false, full: false, ms: 0 };
  if (o.reducedMotion) return { show: true, full: false, ms: LAUNCH_FADE_MS };
  if (o.seen === false) return { show: true, full: true, ms: LAUNCH_FULL_MS };
  return { show: true, full: false, ms: LAUNCH_SHORT_MS };
}

/** One property's keyframes: times in ms from the start, and the values. */
export interface Track { t: number[]; v: number[] }
export interface LaunchTracks {
  overlay: Track; grow: Track; dot1: Track; dot2: Track; slide: Track; word: Track; wordX: Track; line: Track;
}

const flat = (ms: number, v: number): Track => ({ t: [0, ms], v: [v, v] });
const tick = (at: number, ms: number): Track => ({ t: [0, at, at + 140, at + 300, Math.max(ms, at + 300)], v: [1, 1, 1.35, 1, 1] });

/** The whole timeline as data: phones run it as one native-driven value, the
 *  web as CSS keyframes, so neither depends on the busy start-up JS thread.
 *  `shift`: how far (px) the row starts right so the mark is centred. */
export function launchTracks(plan: LaunchPlan, shift: number): LaunchTracks {
  const ms = Math.max(plan.ms, 1);
  if (plan.full) {
    return {
      overlay: { t: [0, 1600, 1900], v: [1, 1, 0] },
      grow: { t: [0, 1600, 1900], v: [1, 1, 1.08] },
      dot1: tick(200, ms),
      dot2: tick(280, ms),
      slide: { t: [0, 580, 960, 1900], v: [shift, shift, 0, 0] },
      word: { t: [0, 580, 960, 1900], v: [0, 0, 1, 1] },
      wordX: { t: [0, 580, 960, 1900], v: [-16, -16, 0, 0] },
      line: { t: [0, 960, 1300, 1900], v: [0, 0, 1, 1] },
    };
  }
  const ticks = ms > 300;
  return {
    overlay: { t: [0, ticks ? 300 : 0, ms], v: [1, 1, 0] },
    grow: { t: [0, ticks ? 300 : 0, ms], v: [1, 1, ticks ? 1.05 : 1] },
    dot1: ticks ? tick(0, ms) : flat(ms, 1),
    dot2: ticks ? tick(60, ms) : flat(ms, 1),
    slide: flat(ms, shift),
    word: flat(ms, 0),
    wordX: flat(ms, -16),
    line: flat(ms, 0),
  };
}
