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
 *   KeyboardFooterLayout     a form's primary action pinned at the bottom of
 *       the screen; while typing it rides on top of the keyboard and the field
 *       stays in view above it (the top-app form pattern).
 *   useFormField             keyboard "Next" moves to the next field down the
 *       form; the last field's key is "Done" and closes the keyboard.
 * Dragging a form closes the keyboard (on-drag / iOS interactive).
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
import { theme } from '../core/theme';
import { fieldOrder, keyboardTopOf, revealTarget, sheetPlacement } from './keyboardMath.ts';

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
/** Inside a pop-up sheet: the sheet itself moves clear of the keyboard. */
const InSheet = createContext(false);
/** Something around it (a sheet, a footer layout) already moves clear of the
 *  keyboard, so a scroll view only scrolls the field into view — no extra
 *  shrinking. */
const RevealOnly = createContext(false);

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
  const outerFields = useContext(FieldsContext);
  const own = useMemo(() => createFieldRegistry(), []);
  const defaults = {
    keyboardShouldPersistTaps: props.keyboardShouldPersistTaps ?? ('handled' as const),
    // dragging the form closes the keyboard, as in the top apps (not a sideways chip row).
    // Not on web: react-native-web's "on-drag" closes it on ANY scroll — including the
    // browser bringing the tapped field into view — so a tap's keyboard shut at once.
    keyboardDismissMode: props.keyboardDismissMode ?? (props.horizontal || !NATIVE ? undefined : Platform.OS === 'ios' ? 'interactive' as const : 'on-drag' as const),
  };
  const plain = !NATIVE || props.horizontal || nested || sizedByItself(props.style);
  const body = plain
    ? <ScrollView ref={ref} {...props} {...defaults} />
    : <AwareScrollView ref={ref} {...props} {...defaults} />;
  // one "Next" chain per form (a nested scroll view joins its parent's)
  if (props.horizontal || (nested && outerFields)) return body;
  return <FieldsContext.Provider value={own}>{body}</FieldsContext.Provider>;
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
  const overlap = useContext(RevealOnly) ? 0 : kbOverlap;
  kbTop.current = useKeyboardState().top;

  const handleLayout = (e: LayoutChangeEvent) => {
    onLayout?.(e);
    // the frame changed (we, or a footer layout / sheet around us, made room
    // for the keyboard): bring the field into view in the new frame
    if (revealNext.current || kbTop.current != null) { revealNext.current = false; reveal(); }
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
        <RevealOnly.Provider value={true}>
          {/* a sheet's fields are their own "Next" chain, not the form's behind it */}
          <FieldsContext.Provider value={null}>
            <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
          </FieldsContext.Provider>
        </RevealOnly.Provider>
      </InSheet.Provider>
    </InsideAware.Provider>
  );
}

/* ------------------------- the form footer layout ------------------------- */

/** A form screen: its scroll view (a KeyboardAwareScrollView) plus the
 *  primary action pinned underneath. While typing, the whole layout ends at
 *  the keyboard's top, so the action rides on the keyboard and the field
 *  stays in view above it. `safeBottom`: clear the home indicator / gesture
 *  bar when the keyboard is down (off when the screen's SafeAreaView already
 *  does). */
export function KeyboardFooterLayout({ footer, children, style, safeBottom = true }: {
  footer: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  safeBottom?: boolean;
}) {
  const box = useRef<View>(null);
  const { overlap } = useKeyboardOverlap(box);
  const insets = useSafeAreaInsets();
  const up = NATIVE && overlap > 0;
  return (
    <View ref={box} style={[st.layout, style, up ? { paddingBottom: overlap } : null]} collapsable={false}>
      <RevealOnly.Provider value={true}>{children}</RevealOnly.Provider>
      {footer ? <View style={[st.footer, { paddingBottom: theme.spacing(3) + (safeBottom && !up ? insets.bottom : 0) }]}>{footer}</View> : null}
    </View>
  );
}

/* ---------------------------- keyboard "Next" ----------------------------- */

interface FieldRegistry {
  add: (f: React.RefObject<TextInput | null>) => () => void;
  subscribe: (f: () => void) => () => void;
  isLast: (f: React.RefObject<TextInput | null>) => boolean;
  next: (from: React.RefObject<TextInput | null>) => void;
}
const FieldsContext = createContext<FieldRegistry | null>(null);

/** Where each field sits on screen (in reading order), measured on demand. */
function measureFields(fields: React.RefObject<TextInput | null>[], then: (placed: { f: React.RefObject<TextInput | null>; x: number; y: number }[]) => void) {
  const placed: { f: React.RefObject<TextInput | null>; x: number; y: number }[] = [];
  let pending = fields.length;
  if (!pending) { then(placed); return; }
  for (const f of fields) {
    const node = f.current as unknown as Measurable | null;
    if (!node) { if (--pending === 0) then(placed); continue; }
    node.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) placed.push({ f, x, y });
      if (--pending === 0) then(placed.sort((a, b) => fieldOrder(a, b)));
    });
  }
}

function createFieldRegistry(): FieldRegistry {
  const fields = new Set<React.RefObject<TextInput | null>>();
  const listeners = new Set<() => void>();
  let last: React.RefObject<TextInput | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // which field is last moves when fields come and go (conditional fields)
  const recompute = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => measureFields([...fields], (placed) => {
      const now = placed.length ? placed[placed.length - 1].f : null;
      if (now !== last) { last = now; listeners.forEach((l) => l()); }
    }), 80);
  };
  return {
    add: (f) => { fields.add(f); recompute(); return () => { fields.delete(f); recompute(); }; },
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    isLast: (f) => last === f,
    next: (from) => measureFields([...fields], (placed) => {
      const i = placed.findIndex((p) => p.f === from);
      const to = i >= 0 ? placed[i + 1] : undefined;
      if (to?.f.current) to.f.current.focus();
      else Keyboard.dismiss();
    }),
  };
}

/** For a single-line field in a form: keyboard "Next" moves to the next field
 *  down the form; the last field shows "Done" and closes the keyboard. Spread
 *  the result onto the TextInput (it includes the ref). */
export function useFormField(multiline = false) {
  const reg = useContext(FieldsContext);
  const ref = useRef<TextInput>(null);
  const [last, setLast] = useState(false);
  useEffect(() => {
    if (!reg || multiline) return;
    const off = reg.add(ref);
    const unsub = reg.subscribe(() => setLast(reg.isLast(ref)));
    return () => { off(); unsub(); };
  }, [reg, multiline]);
  if (!reg || multiline) return { ref };
  return last
    ? { ref, returnKeyType: 'done' as const, submitBehavior: 'blurAndSubmit' as const }
    : { ref, returnKeyType: 'next' as const, submitBehavior: 'submit' as const, onSubmitEditing: () => reg.next(ref) };
}

const st = StyleSheet.create({
  // like a ScrollView's own default: fill the parent, shrink to fit a capped one
  box: { flexGrow: 1, flexShrink: 1 },
  layout: { flex: 1 },
  footer: {
    paddingHorizontal: theme.spacing(4), paddingTop: theme.spacing(3), gap: theme.spacing(2),
    backgroundColor: theme.colors.bg, borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
});
