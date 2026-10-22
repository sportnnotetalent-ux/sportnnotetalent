/**
 * Keyboard-safe fields (2026-10-22). On Android the app draws edge-to-edge
 * (Expo SDK 56 / RN 0.85), so the window no longer shrinks for the keyboard: a
 * field low on the screen sat under it and was typed blind (the sign-in
 * password). iOS never shrank the window either.
 *
 *   KeyboardAwareScrollView  drop-in ScrollView for screens. While the keyboard
 *       is up and the focused field is inside it, the scroll area ends at the
 *       keyboard's top (everything can scroll above it) and the field is
 *       scrolled into view. Android also keeps a newly focused field in view
 *       by itself once the area is short (ScrollView.requestChildFocus).
 *   KeyboardAvoidingBox      a View whose bottom stays above the keyboard while
 *       a field inside it is focused (the chat composer).
 *   useKeyboardSheet         pop-up sheets (Modal). iOS reports the keyboard,
 *       so the sheet is lifted above it. An Android Modal is its own window and
 *       reports no keyboard, so while a field in the sheet is focused the sheet
 *       is pinned to the top and kept short enough to clear the keyboard.
 *   useKeyboardFocus         onFocus / onBlur for an input, so the enclosing
 *       scroll view or sheet reacts at once (others are noticed within 250 ms).
 *
 * Web: the browser does it — public/index.html asks Android Chrome to resize
 * the page for the keyboard (interactive-widget=resizes-content); Safari
 * scrolls the field into view itself. Everything here is a no-op on web.
 */
import React, { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Dimensions, Keyboard, Platform, ScrollView, StatusBar, StyleSheet, TextInput, View,
  useWindowDimensions,
  type KeyboardEvent, type LayoutChangeEvent, type ScrollViewProps, type StyleProp, type TextInputProps, type ViewProps, type ViewStyle,
} from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { keyboardTopOf, revealTarget, sheetPlacement } from './keyboardMath.ts';

const NATIVE = Platform.OS !== 'web';

/* ------------------------------ the keyboard ------------------------------ */

/** Where the keyboard's top edge is (window coordinates), or null when it is
 *  down. `seq` changes on every keyboard event and every focus change while
 *  the keyboard is up, so views can re-check the focused field. */
export interface KeyboardState { top: number | null; seq: number }

type Measurable = {
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void;
  measureLayout: (rel: unknown, ok: (x: number, y: number, w: number, h: number) => void, fail?: () => void) => void;
};

let kbState: KeyboardState = { top: null, seq: 0 };
const subscribers = new Set<(s: KeyboardState) => void>();
let started = false;
let poll: ReturnType<typeof setInterval> | null = null;
let lastFocused: unknown = null;
/** Pop-up sheets whose field has focus: the screen behind (which still holds
 *  the sheet in its tree) leaves the keyboard to the sheet. */
let sheetsFocused = 0;

function emit(top: number | null) {
  kbState = { top, seq: kbState.seq + 1 };
  subscribers.forEach((f) => f(kbState));
  // While the keyboard is up, a focus change (tapping the next field, "Next"
  // on the keyboard) must re-check too — Android sends no event for it.
  if (top != null && !poll) {
    lastFocused = TextInput.State.currentlyFocusedInput();
    poll = setInterval(() => {
      const now = TextInput.State.currentlyFocusedInput();
      if (now !== lastFocused) { lastFocused = now; if (now) emit(kbState.top); }
    }, 250);
  } else if (top == null && poll) {
    clearInterval(poll);
    poll = null;
  }
}

function start() {
  if (started || !NATIVE) return;
  started = true;
  // Android measures views from just under the status bar (see keyboardTopOf)
  const androidTopOffset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? initialWindowMetrics?.insets.top ?? 0) : 0;
  const on = (e: KeyboardEvent) => emit(keyboardTopOf(e, Platform.OS, Dimensions.get('screen').height, androidTopOffset));
  if (Platform.OS === 'ios') {
    Keyboard.addListener('keyboardWillShow', on);
    Keyboard.addListener('keyboardWillChangeFrame', on);
    Keyboard.addListener('keyboardWillHide', () => emit(null));
  } else {
    Keyboard.addListener('keyboardDidShow', on);
    Keyboard.addListener('keyboardDidHide', () => emit(null));
  }
}

export function useKeyboardState(): KeyboardState {
  const [s, set] = useState(kbState);
  useEffect(() => {
    start();
    subscribers.add(set);
    set(kbState);
    return () => { subscribers.delete(set); };
  }, []);
  return s;
}

/* ------------------------------ input focus ------------------------------- */

interface FocusSink { onInputFocus: () => void; onInputBlur: () => void }
const FocusContext = createContext<FocusSink | null>(null);
/** Inside a keyboard-aware view: a nested one leaves the work to the outer. */
const InsideAware = createContext(false);
/** Inside a pop-up sheet: the sheet itself moves clear of the keyboard, so a
 *  scroll view in it only scrolls the field into view (no extra shrinking). */
const InSheet = createContext(false);

type FocusEvent = Parameters<NonNullable<TextInputProps['onFocus']>>[0];
/** onFocus / onBlur for a TextInput: tells the enclosing scroll view or sheet
 *  at once, then calls the input's own handlers. */
export function useKeyboardFocus(onFocus?: (e: FocusEvent) => void, onBlur?: (e: FocusEvent) => void) {
  const sink = useContext(FocusContext);
  return {
    onFocus: (e: FocusEvent) => { sink?.onInputFocus(); onFocus?.(e); },
    onBlur: (e: FocusEvent) => { sink?.onInputBlur(); onBlur?.(e); },
  };
}

/** Is the focused field inside `container`? (measureLayout fails otherwise.) */
function focusedInside(container: Measurable | null, then: (inside: boolean, input: Measurable | null) => void) {
  const input = TextInput.State.currentlyFocusedInput() as unknown as Measurable | null;
  if (!input || !container) { then(false, null); return; }
  input.measureLayout(container, () => then(true, input), () => then(false, input));
}

/* --------------------------- the avoiding box ----------------------------- */

/** How far `box` (window coordinates) reaches below the keyboard's top, while
 *  the focused field is inside it. The box is measured, never the padding we
 *  add inside it, so the figure is stable. */
function useKeyboardOverlap(box: React.RefObject<View | null>, onChange?: () => void) {
  const kb = useKeyboardState();
  const inSheet = useContext(InSheet);
  const [overlap, setOverlap] = useState(0);
  const cur = useRef(0);
  const measure = useCallback(() => {
    const top = kb.top;
    const node = box.current as unknown as Measurable | null;
    const set = (n: number) => {
      if (n !== cur.current) { cur.current = n; setOverlap(n); }
      onChange?.();
    };
    if (top == null || !node || (sheetsFocused > 0 && !inSheet)) { set(0); return; }
    focusedInside(node, (inside) => {
      if (!inside) { set(0); return; }
      node.measureInWindow((_x, y, _w, h) => set(Math.max(0, Math.round(y + h - top))));
    });
  }, [kb.top, box, onChange, inSheet]);
  useEffect(() => { if (NATIVE) measure(); }, [kb.seq, measure]);
  const latest = useRef(measure);
  latest.current = measure;
  const focus = useMemo<FocusSink>(() => ({ onInputFocus: () => { setTimeout(() => latest.current(), 60); }, onInputBlur: () => {} }), []);
  return { overlap, focus };
}

/** A View whose bottom stays above the keyboard while a field inside it is
 *  focused — e.g. a chat composer under its message list. */
export function KeyboardAvoidingBox({ style, children, ...rest }: ViewProps) {
  const box = useRef<View>(null);
  const { overlap, focus } = useKeyboardOverlap(box);
  if (!NATIVE) return <View style={style} {...rest}>{children}</View>;
  return (
    <View ref={box} style={[style, overlap ? { paddingBottom: overlap } : null]} collapsable={false} {...rest}>
      <InsideAware.Provider value={true}>
        <FocusContext.Provider value={focus}>{children}</FocusContext.Provider>
      </InsideAware.Provider>
    </View>
  );
}

/* ------------------------ the keyboard-aware scroll ------------------------ */

/** A scroll view sized by something other than its parent (a fixed or capped
 *  height, absolute) keeps the plain behaviour. */
function sizedByItself(style: StyleProp<ViewStyle>): boolean {
  const s = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  return s.height != null || s.maxHeight != null || s.position === 'absolute' || s.flex === 0 || s.flexGrow === 0;
}

/** Drop-in for a screen's ScrollView: see the file header. Horizontal and
 *  nested scroll views (and web) behave as a plain ScrollView. */
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScrollView(props, ref) {
  const nested = useContext(InsideAware);
  const keyboardShouldPersistTaps = props.keyboardShouldPersistTaps ?? 'handled';
  if (!NATIVE || props.horizontal || nested || sizedByItself(props.style)) {
    return <ScrollView ref={ref} {...props} keyboardShouldPersistTaps={keyboardShouldPersistTaps} />;
  }
  return <AwareScrollView ref={ref} {...props} keyboardShouldPersistTaps={keyboardShouldPersistTaps} />;
});

const AwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function AwareScrollView({ onLayout, ...props }, ref) {
  const sv = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => sv.current as ScrollView, []);
  const box = useRef<View>(null);
  const kbTop = useRef<number | null>(null);
  const revealNext = useRef(false);
  const inSheet = useContext(InSheet);
  const inSheetRef = useRef(inSheet);
  inSheetRef.current = inSheet;

  /** Scroll the focused field (if it's in here) to just above the keyboard. */
  const reveal = useCallback(() => {
    const top = kbTop.current;
    // (getInnerViewRef is public on RN's ScrollView but missing from its TS types)
    const inner = (sv.current as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.() as Measurable | null;
    const frame = sv.current?.getNativeScrollRef() as unknown as Measurable | null;
    if (top == null || !inner || !frame || (sheetsFocused > 0 && !inSheetRef.current)) return;
    focusedInside(inner, (inside, input) => {
      if (!inside || !input) return;
      input.measureLayout(inner, (_x, y, _w, h) => {
        frame.measureInWindow((_fx, fy, _fw, fh) => {
          inner.measureInWindow((_ix, iy) => {
            const offset = fy - iy; // how far the content is scrolled
            const visible = Math.min(fh, top - fy); // the part above the keyboard
            if (visible <= 0) return;
            const target = revealTarget(y, h, offset, visible);
            if (target != null) sv.current?.scrollTo({ y: target, animated: true });
          });
        });
      });
    });
  }, []);

  const onKeyboardChange = useCallback(() => {
    revealNext.current = true;
    // the frame may not change (already short enough): reveal anyway
    setTimeout(() => { if (revealNext.current) { revealNext.current = false; reveal(); } }, 120);
  }, [reveal]);

  const { overlap: kbOverlap, focus } = useKeyboardOverlap(box, onKeyboardChange);
  const overlap = inSheet ? 0 : kbOverlap;
  kbTop.current = useKeyboardState().top;

  const handleLayout = (e: LayoutChangeEvent) => {
    onLayout?.(e);
    if (revealNext.current) { revealNext.current = false; reveal(); }
  };

  return (
    <View ref={box} style={[st.box, overlap ? { paddingBottom: overlap } : null]} collapsable={false}>
      <InsideAware.Provider value={true}>
        <FocusContext.Provider value={focus}>
          <ScrollView ref={sv} {...props} onLayout={handleLayout} />
        </FocusContext.Provider>
      </InsideAware.Provider>
    </View>
  );
});

/* -------------------------------- sheets ---------------------------------- */

/** Pop-up sheet (Modal) handling — see the file header. Spread `backdrop`
 *  onto the full-screen backdrop and `sheet` onto the panel, and wrap the
 *  panel's content in <KeyboardSheetScope value={kb.scope}>. */
export function useKeyboardSheet(visible: boolean) {
  const kb = useKeyboardState();
  const panel = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) return;
    sheetsFocused += 1;
    emit(kbState.top); // re-check the screens behind
    return () => { sheetsFocused -= 1; emit(kbState.top); };
  }, [focused]);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(() => {
    focusedInside(panel.current as unknown as Measurable | null, (inside) => setFocused(inside));
  }, []);
  // An input wired with useKeyboardFocus reports at once; any other is
  // noticed within 250 ms while the sheet is open.
  useEffect(() => {
    if (!NATIVE || !visible) { setFocused(false); return; }
    const t = setInterval(check, 250);
    return () => clearInterval(t);
  }, [visible, check]);
  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  const scope = useMemo<FocusSink>(() => ({
    onInputFocus: () => { if (blurTimer.current) clearTimeout(blurTimer.current); setFocused(true); },
    onInputBlur: () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      blurTimer.current = setTimeout(check, 150);
    },
  }), [check]);

  return { panel, scope, ...sheetPlacement({ os: Platform.OS, focused, top: kb.top, winH: win.height, safeTop: insets.top }) };
}

/** Wrap a sheet panel's content: its fields report focus to the sheet, and a
 *  KeyboardAwareScrollView inside works on its own (not as "nested"). */
export function KeyboardSheetScope({ value, children }: { value: FocusSink; children: React.ReactNode }) {
  return (
    <InsideAware.Provider value={false}>
      <InSheet.Provider value={true}>
        <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
      </InSheet.Provider>
    </InsideAware.Provider>
  );
}

const st = StyleSheet.create({
  // like a ScrollView's own default: fill the parent, shrink to fit a capped one
  box: { flexGrow: 1, flexShrink: 1 },
});
