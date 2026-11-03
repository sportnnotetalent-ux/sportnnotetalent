/**
 * Tap feedback (2026-11-03, founder): the shared "it responded" pieces, built on
 * React Native's own Animated (no new native module).
 *  • usePressFeedback — a quick scale-down + dim while pressed (Button,
 *    SelectChip, the point buttons), nothing while disabled.
 *  • useSelectAnim — a chip fades into its selected look instead of switching.
 *  • PopNumber — a scoreboard number pops when it changes.
 *  • FadeInLine — a "✓ …" summary line fades in when it changes.
 *  • CapturedFlash — the Undo bar pulses and shows a ✓ when a step is captured.
 * Reduce motion on: no scale and no pulse; the ✓ still shows (break T3).
 * Rules and timings: src/core/tapCapture.ts.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle, type TextProps } from 'react-native';
import { theme } from '../core/theme';
import { useReduceMotion } from '../core/reduceMotion';
import { captureBus, motionPlan, nativeDriver, scorePopped, POP_MS, PRESS_IN_MS, PRESS_OUT_MS, PULSE_MS, TICK_MS } from '../core/tapCapture';
import { Glyph } from './Icon';

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const driver = nativeDriver(Platform.OS);

/** Press state for a pressable: spread the handlers on it and add `style`. */
export function usePressFeedback({ disabled }: { disabled?: boolean }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  const to = (n: number, ms: number) => Animated.timing(v, { toValue: n, duration: ms, useNativeDriver: driver }).start();
  const plan = motionPlan(reduce);
  const style = {
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, plan.pressScale] }) }],
  };
  return {
    onPressIn: () => {
      if (disabled) return;
      to(1, PRESS_IN_MS);
    },
    onPressOut: () => to(0, PRESS_OUT_MS),
    style,
  };
}

/** 0 → 1 as a chip becomes selected (and back); instant on first draw and with
 *  reduce motion. Drives the selected fill's opacity. */
export function useSelectAnim(active: boolean) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(active ? 1 : 0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduce) { v.setValue(active ? 1 : 0); return; }
    Animated.timing(v, { toValue: active ? 1 : 0, duration: 140, useNativeDriver: driver }).start();
  }, [active, reduce, v]);
  return v;
}

/** A score that pops (scales up and back) when its value changes. */
export function PopNumber({ text, style, ...rest }: { text: string; style?: StyleProp<TextStyle> } & Omit<TextProps, 'style' | 'children'>) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(1)).current;
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    const was = prev.current;
    prev.current = text;
    if (!scorePopped(was, text)) return;
    const { popScale } = motionPlan(reduce);
    if (popScale === 1) return;
    v.stopAnimation();
    v.setValue(1);
    Animated.sequence([
      Animated.timing(v, { toValue: popScale, duration: Math.round(POP_MS * 0.4), useNativeDriver: driver }),
      Animated.timing(v, { toValue: 1, duration: Math.round(POP_MS * 0.6), useNativeDriver: driver }),
    ]).start();
  }, [text, reduce, v]);
  return <Animated.Text {...rest} style={[style, { transform: [{ scale: v }] }]}>{text}</Animated.Text>;
}

/** Fades its children in whenever `id` changes (a "✓ Winner · Forehand" line). */
export function FadeInLine({ id, children }: { id: string; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0.2)).current;
  useEffect(() => {
    if (reduce) { v.setValue(1); return; }
    v.setValue(0.2);
    Animated.timing(v, { toValue: 1, duration: 180, useNativeDriver: driver }).start();
  }, [id, reduce, v]);
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>;
}

/** The Undo bar's "captured" sign: a short lime pulse and a ✓ badge on every
 *  captured step (captureBus), without re-rendering the scoring screen. The
 *  badge sits on the corner, so nothing moves (break T8). */
export function CapturedFlash({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  const [tick, setTick] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const play = () => {
      setTick(true);
      if (t) clearTimeout(t);
      t = setTimeout(() => setTick(false), TICK_MS);
      if (!motionPlan(reduce).pulse) return;
      v.stopAnimation();
      v.setValue(0);
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: Math.round(PULSE_MS * 0.4), useNativeDriver: driver }),
        Animated.timing(v, { toValue: 0, duration: Math.round(PULSE_MS * 0.6), useNativeDriver: driver }),
      ]).start();
    };
    // the bar can mount on the very step that started the match
    if (Date.now() - captureBus.lastAt() < 300) play();
    const off = captureBus.subscribe(play);
    return () => { off(); if (t) clearTimeout(t); };
  }, [reduce, v]);
  return (
    <Animated.View style={[style, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }] }]}>
      {children}
      <Animated.View pointerEvents="none" style={[fx.wash, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) }]} />
      {tick ? (
        <View pointerEvents="none" style={fx.badge} accessible={false} importantForAccessibility="no">
          <Glyph emoji="✓" style={fx.badgeText} color={theme.colors.onLime} />
        </View>
      ) : null}
    </Animated.View>
  );
}

const fx = StyleSheet.create({
  wash: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.colors.lime, borderRadius: theme.radius.md },
  badge: {
    position: 'absolute', top: -7, right: -5, width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.colors.lime, alignItems: 'center', justifyContent: 'center', ...theme.shadow.card,
  },
  badgeText: { fontSize: 13, fontWeight: '900', color: theme.colors.onLime },
});
