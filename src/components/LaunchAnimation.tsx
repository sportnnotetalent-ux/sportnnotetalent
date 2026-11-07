/**
 * The launch animation (docs/design/reference-video, A1): the S:N mark as a
 * scoreline. The colon dots "tick" like a score change, "SportnNote" slides
 * in, a lime court line sweeps under it, then it fades into the app.
 *
 * - Full (1.9 s) once per device; a short tick-and-fade (0.6 s) after that;
 *   a plain fade for reduced motion; never on the TV overlay or a shared link
 *   opened on the web (core/launchPlan.ts).
 * - The timeline is data (launchTracks). Phones run it as ONE native-driven
 *   value and the web as CSS keyframes, so the app's busy start-up never
 *   slows or freezes it.
 * - It sits over the app, which loads underneath, and never takes touches
 *   (pointerEvents="none"). A hard stop always removes it, so it can never
 *   hang.
 * - The "Sport n Note" voice plays with the full version on app builds that
 *   have expo-audio (1.1.0+), once the real recording is in (data/launchVoice).
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAUNCH_FADE_MS, LAUNCH_FULL_MS, LAUNCH_SEEN_KEY, LAUNCH_SHORT_MS, launchPlan, launchTracks, type LaunchPlan, type Track } from '../core/launchPlan';
import { theme } from '../core/theme';
import { shouldPlayVoice, VOICE_AT_MS } from '../core/launchVoice';
import { hydrateLaunchSoundPref, launchSoundPref } from '../core/launchSoundPref';
import { VOICE_CLIP_READY, audioModuleReady, playLaunchVoice } from '../data/launchVoice';

const TILE = '#0D5A3F'; // the app icon's green, so icon → launch is seamless
const LIME = '#C6EE3E';
const MARK = 96; // px
const K = MARK / 200; // the mark's 200-unit drawing → px
const SKEW = -8;
const lean = Math.tan((SKEW * Math.PI) / 180);
const DOT_R = 8.5 * K;
const GAP = 14;
const WORD_W = 196; // the wordmark's width at this size (fixed, so the start is centred)
const SHIFT = (WORD_W + GAP) / 2;
const WEB = Platform.OS === 'web';
const FIRST_FRAME: LaunchPlan = { show: true, full: true, ms: LAUNCH_FULL_MS };

/** Skip it where a viewer wants the content at once. */
function skipHere(): boolean {
  if (!WEB || typeof window === 'undefined') return false;
  const p = window.location.pathname;
  return /^\/o\/[^/]+/.test(p) || (p !== '/' && p !== '');
}

/** A track's value at time t (linear between keyframes). */
function at(tr: Track, t: number): number {
  if (t <= tr.t[0]) return tr.v[0];
  for (let i = 1; i < tr.t.length; i++) {
    if (t <= tr.t[i]) {
      const span = tr.t[i] - tr.t[i - 1];
      return span <= 0 ? tr.v[i] : tr.v[i - 1] + ((tr.v[i] - tr.v[i - 1]) * (t - tr.t[i - 1])) / span;
    }
  }
  return tr.v[tr.v.length - 1];
}

type Style = Record<string, unknown>;
/** Web: CSS keyframes for one element from its tracks (run by the browser). */
function cssAnim(ms: number, tracks: Track[], toStyle: (vals: number[]) => Style): Style {
  const times = [...new Set(tracks.flatMap((tr) => tr.t))].sort((a, b) => a - b);
  const frames: Record<string, Style> = {};
  for (const t of times) frames[`${Math.min(100, (t / ms) * 100).toFixed(2)}%`] = toStyle(tracks.map((tr) => at(tr, t)));
  return { animationKeyframes: [frames], animationDuration: `${ms}ms`, animationTimingFunction: 'linear', animationFillMode: 'forwards', animationIterationCount: 1 };
}

/** Web: react-native-web builds @keyframes only from StyleSheet.create, so
 *  each of the three versions gets its sheet up front. */
const PLANS: Record<'full' | 'short' | 'fade', LaunchPlan> = {
  full: FIRST_FRAME,
  short: { show: true, full: false, ms: LAUNCH_SHORT_MS },
  fade: { show: true, full: false, ms: LAUNCH_FADE_MS },
};
const kind = (p: LaunchPlan) => (p.full ? 'full' : p.ms === LAUNCH_FADE_MS ? 'fade' : 'short');
function webSheet(p: LaunchPlan) {
  const tr = launchTracks(p, SHIFT);
  const a = (tracks: Track[], toStyle: (vals: number[]) => Style) => cssAnim(p.ms, tracks, toStyle);
  // keyframes take CSS transform text (react-native-web leaves arrays out of @keyframes)
  return StyleSheet.create({
    overlay: a([tr.overlay], ([o]) => ({ opacity: o })),
    grow: a([tr.grow], ([g]) => ({ transform: `scale(${g})` })),
    row: a([tr.slide], ([x]) => ({ transform: `translateX(${x}px)` })),
    word: a([tr.word, tr.wordX], ([o, x]) => ({ opacity: o, transform: `translateX(${x}px)` })),
    line: a([tr.line], ([v]) => ({ transform: `scaleX(${v})` })),
    dot1: a([tr.dot1], ([v]) => ({ transform: `scale(${v})` })),
    dot2: a([tr.dot2], ([v]) => ({ transform: `scale(${v})` })),
  } as never) as Record<'overlay' | 'grow' | 'row' | 'word' | 'line' | 'dot1' | 'dot2', object>;
}
const WEB_SHEETS = WEB ? { full: webSheet(PLANS.full), short: webSheet(PLANS.short), fade: webSheet(PLANS.fade) } : null;

/** `fontsReady`: the wordmark's font has loaded (App.tsx). The timeline waits
 *  for it up to FONT_WAIT_MS (the app itself waits for it anyway); past that,
 *  the platform font is used at a size that still fits the box. */
const FONT_WAIT_MS = 1000;

export function LaunchAnimation({ fontsReady = true }: { fontsReady?: boolean }) {
  const [gone, setGone] = useState(false);
  const [plan, setPlan] = useState<LaunchPlan | null>(null);
  // the voice is decided with the plan, but timed from the moment the animation starts
  const voice = useRef(false);
  const [fontWaitOver, setFontWaitOver] = useState(false);
  useEffect(() => { const t = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS); return () => clearTimeout(t); }, []);
  const go = fontsReady || fontWaitOver;
  const progress = useRef(new Animated.Value(0)).current;
  const skip = useRef(skipHere()).current;

  // Work out which version to play (storage and the motion setting are async).
  useEffect(() => {
    if (skip) { setGone(true); return; }
    let on = true;
    (async () => {
      let seen: boolean | null = null;
      try { seen = (await AsyncStorage.getItem(LAUNCH_SEEN_KEY)) === '1'; } catch { seen = null; }
      let reducedMotion = false;
      try { reducedMotion = await AccessibilityInfo.isReduceMotionEnabled(); } catch { /* assume motion is fine */ }
      const next = launchPlan({ seen, reducedMotion, overlay: false });
      // A2: the "Sport n Note" voice with the full animation, every launch
      await hydrateLaunchSoundPref();
      voice.current = next.full && shouldPlayVoice({ web: WEB, reducedMotion, soundOn: launchSoundPref.get(), moduleReady: audioModuleReady(), clipReady: VOICE_CLIP_READY });
      if (on) setPlan(next);
    })();
    // Hard stop: whatever happens, the overlay is gone after 4.5 s.
    const stop = setTimeout(() => on && setGone(true), 4500);
    return () => { on = false; clearTimeout(stop); };
  }, [skip]);

  useEffect(() => {
    if (!plan || !go) return;
    if (!plan.show) { setGone(true); return; }
    if (plan.full) {
      try { void AsyncStorage.setItem(LAUNCH_SEEN_KEY, '1').catch(() => {}); } catch { /* storage blocked: harmless */ }
    }
    // S:N first, then the voice as "SportnNote" slides in (core/launchVoice) —
    // timed from the animation's own start, so a slow font never makes it early
    const voiceTimer = voice.current ? setTimeout(() => void playLaunchVoice(), VOICE_AT_MS) : null;
    const stopVoiceTimer = () => { if (voiceTimer) clearTimeout(voiceTimer); };
    if (WEB) {
      const t = setTimeout(() => setGone(true), plan.ms + 50);
      return () => { clearTimeout(t); stopVoiceTimer(); };
    }
    const anim = Animated.timing(progress, { toValue: plan.ms, duration: plan.ms, easing: Easing.linear, useNativeDriver: true });
    anim.start(() => setGone(true));
    return () => { anim.stop(); stopVoiceTimer(); };
  }, [plan, go, progress]);

  if (gone) return null;
  const p = plan ?? FIRST_FRAME;
  const tr = launchTracks(p, SHIFT);
  const playing = !!plan && go;
  // Phones: every property follows the one native progress value.
  const n = (track: Track) => (playing ? progress.interpolate({ inputRange: track.t, outputRange: track.v, extrapolate: 'clamp' }) : track.v[0]);
  // Web: the version's CSS keyframes once the plan is known; the first frame until then.
  const sheet = WEB_SHEETS && playing ? WEB_SHEETS[kind(p)] : null;
  const first = (tracks: Track[], toStyle: (vals: number[]) => Style): object => toStyle(tracks.map((x) => x.v[0])) as object;
  const web = (key: keyof NonNullable<typeof sheet>, tracks: Track[], toStyle: (vals: number[]) => Style) => (sheet ? sheet[key] : first(tracks, toStyle));

  const overlayStyle = WEB ? web('overlay', [tr.overlay], ([o]) => ({ opacity: o })) : { opacity: n(tr.overlay) };
  const growStyle = WEB ? web('grow', [tr.grow], ([g]) => ({ transform: [{ scale: g }] })) : { transform: [{ scale: n(tr.grow) }] };
  const rowStyle = WEB ? web('row', [tr.slide], ([x]) => ({ transform: [{ translateX: x }] })) : { transform: [{ translateX: n(tr.slide) }] };
  const wordStyle = WEB
    ? web('word', [tr.word, tr.wordX], ([o, x]) => ({ opacity: o, transform: [{ translateX: x }] }))
    : { opacity: n(tr.word), transform: [{ translateX: n(tr.wordX) }] };
  const lineStyle = WEB ? web('line', [tr.line], ([v]) => ({ transform: [{ scaleX: v }] })) : { transform: [{ scaleX: n(tr.line) }] };
  const dotStyle = (key: 'dot1' | 'dot2', track: Track) => (WEB ? web(key, [track], ([v]) => ({ transform: [{ scale: v }] })) : { transform: [{ scale: n(track) }] });
  const dot = (key: 'dot1' | 'dot2', cx: number, cy: number, track: Track) => (
    <Animated.View style={[st.dot, { left: (cx + lean * (cy - 100) - 8.5) * K, top: (cy - 8.5) * K }, dotStyle(key, track) as object]} />
  );
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st.wrap, overlayStyle as object]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={growStyle as object}>
        <Animated.View style={[st.row, rowStyle as object]}>
          <View style={{ width: MARK, height: MARK }}>
            <Svg width={MARK} height={MARK} viewBox="0 0 200 200">
              <G transform={`translate(100 100) skewX(${SKEW}) translate(-100 -100)`}>
                <Path d="M80 68 H52 a16 16 0 0 0 0 32 h12 a16 16 0 0 1 0 32 H34" fill="none" stroke={LIME} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M122 132 V68 L166 132 V68" fill="none" stroke="#FFFFFF" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
              </G>
            </Svg>
            {dot('dot1', 100, 86, tr.dot1)}
            {dot('dot2', 100, 114, tr.dot2)}
          </View>
          <Animated.View style={[{ width: WORD_W }, wordStyle as object]}>
            <Text style={[st.word, !fontsReady && st.wordFallback]} numberOfLines={1}>
              <Text style={{ color: LIME }}>Sport</Text>n<Text style={{ color: LIME }}>Note</Text>
            </Text>
            <Animated.View style={[st.line, lineStyle as object]} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: { backgroundColor: TILE, alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
  row: { flexDirection: 'row', alignItems: 'center', gap: GAP },
  dot: { position: 'absolute', width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: LIME },
  word: { color: '#FFFFFF', fontFamily: theme.fonts.display, fontSize: 44, letterSpacing: 0.5, fontStyle: 'italic' },
  // the platform font is ~25% wider: smaller, so "SportnNote" still fits WORD_W
  wordFallback: { fontSize: 36, fontWeight: '800' },
  line: { height: 6, borderRadius: 3, backgroundColor: LIME, marginTop: 4, transformOrigin: 'left' },
});
