/**
 * Design tokens for the whole app. Keep all colors / spacing here so screens
 * stay consistent and re-theming is a one-file change.
 *
 * 2026-10-29 redesign — the light "court" theme: a warm cream page, white
 * cards, a deep pitch-green brand (hero panels, primary buttons) with a lime
 * highlight, and bold condensed headlines (Barlow Condensed). Every text /
 * background pair is checked in tests/a11y-contrast.test.mts (WCAG 2.1 AA).
 */
export const theme = {
  colors: {
    bg: '#F3F0E8', // warm cream page
    surface: '#FFFFFF',
    surfaceAlt: '#E9E5DA',
    border: '#DDD8CB',
    primary: '#0D5A3F', // pitch green — links, primary buttons, active tab
    primaryDark: '#0A3A2B', // the hero panels
    /** the highlight: active chips, call-to-action buttons, the hero's accent */
    lime: '#C6EE3E',
    /** ink on the lime highlight */
    onLime: '#14181D',
    accent: '#984600', // amber — notes and warnings
    /** the small coloured labels: dates, "View all" */
    hot: '#B2235A',
    text: '#14181D',
    textMuted: '#59616C',
    danger: '#B32525',
    home: '#1D56C9',
    away: '#A6380A',
    // SD-155 (WCAG 2.1 AA). Measured in tests/a11y-contrast.test.mts — keep ≥ the
    // ratios noted when changing any of these.
    /** Ink on every brand fill (primary / accent / danger / home / away): white. */
    onFill: '#FFFFFF',
    /** Red fill that carries WHITE text (LIVE / UNDER REVIEW / badges). */
    dangerStrong: '#B32525',
    /** Text-field / outline-control boundary (1.4.11 non-text ≥3:1 on bg/surface/surfaceAlt). */
    inputBorder: '#757B84',
    /** Keyboard focus ring on web. */
    focus: '#0D5A3F',
    /** text on the pitch-green hero */
    heroText: '#F3F0E8',
    heroMuted: '#B9C9BF',
  },
  spacing: (n: number) => n * 4,
  radius: { sm: 10, md: 16, lg: 24, xl: 28, pill: 999 },
  font: {
    h1: 30,
    h2: 22,
    h3: 18,
    body: 15,
    small: 13,
    // SD-155: 11 → 12 so badges stay legible (and scale with the OS text size).
    tiny: 12,
    /** the hero headline ("READY TO PLAY?") */
    display: 44,
  },
  /** Reference-video B3: one calm type ramp. Bold (800/900) is for scores,
   *  numbers and the display face only; everyday text uses these. */
  type: {
    title: { fontSize: 18, fontWeight: '700' as const },
    body: { fontSize: 15, fontWeight: '400' as const },
    label: { fontSize: 13, fontWeight: '600' as const },
    meta: { fontSize: 12, fontWeight: '400' as const },
    button: { fontSize: 15, fontWeight: '700' as const },
  },
  /** Barlow Condensed, loaded at start-up (App.tsx). Until it has loaded (or if it
   *  can't), the platform font is used — never a blank screen. */
  fonts: {
    display: 'BarlowCondensed_800ExtraBold_Italic',
    heading: 'BarlowCondensed_700Bold',
    numeral: 'BarlowCondensed_700Bold',
  },
  // Soft elevation so white cards lift off the cream page. Cross-platform:
  // shadow* applies on iOS/web, elevation on Android. `live` is a red glow
  // reserved for in-progress matches.
  shadow: {
    card: {
      shadowColor: '#2B2414',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    live: {
      shadowColor: '#B32525',
      shadowOpacity: 0.22,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
  },
} as const;

export type Theme = typeof theme;
