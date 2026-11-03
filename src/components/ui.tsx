/** Small shared UI primitives so screens and sport plugins stay consistent. */
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { theme } from '../core/theme';
import { useFormField, useKeyboardFocus } from './keyboard';
import { readableOn } from '../core/contrast';
import { toggleA11y } from '../core/a11y';
import { splitLeading, stripLeadingEmoji } from '../core/leadingEmoji';
import { EMOJI_ICONS, EMOJI_KEYS, EmojiIcon } from './Icon';
import { SportBadge } from './SportSymbol';
import { SPORT_LIST } from '../sports/sportMeta';
import { AnimatedPressable, usePressFeedback, useSelectAnim } from './pressFeedback';

/** Every sport's emoji, so a chip like "⚽ Football" draws it apart from the
 *  words with the same gap as an icon (not glued on: "⚽Football"). */
const SPORT_EMOJI = SPORT_LIST.map((s) => s.icon.replace(/\uFE0F/g, ''));

/** 2026-10-29 redesign: a chip's mapped leading emoji → its line icon. A
 *  sport's own emoji ("⚽ Football") stays as it is — the same symbol the sport
 *  has everywhere else. */
function chipParts(label: string): { text: string; spec?: (typeof EMOJI_ICONS)[string]; emoji?: string } {
  const sport = splitLeading(label, SPORT_EMOJI);
  if (sport && sport.rest) return { text: sport.rest, emoji: sport.key };
  const lead = splitLeading(label, EMOJI_KEYS);
  const spec = lead ? EMOJI_ICONS[lead.key] : undefined;
  return spec && lead!.rest ? { text: lead!.rest, spec } : { text: label };
}

/** Count + correctly-pluralized noun, e.g. plural(1,'match','matches') → "1 match".
 *  Keeps stat lines grammatical ("1 match · 1 win", not "1 matches · 1 wins"). */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Shown while data is still being fetched, so a list never flashes its
 *  "nothing here yet" empty state before the real content arrives. */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={loadingStyles.wrap} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={theme.colors.primary} />
      <Text style={loadingStyles.label}>{label}</Text>
    </View>
  );
}

const loadingStyles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(6) },
  label: { color: theme.colors.textMuted, fontSize: theme.font.small },
});

/** A friendly placeholder for a section with no data yet — an icon, a primary
 *  line, and an optional hint about when it'll fill in. Replaces the bare grey
 *  "No … yet" sentences so an empty screen still feels intentional, not broken.
 *  `compact` tightens the padding for use inside a card/table. */
export function EmptyState({
  icon,
  sport,
  title,
  hint,
  compact = false,
}: {
  icon?: string;
  /** a sport's empty page: its drawn badge instead of an icon */
  sport?: string;
  title: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <View style={[emptyStyles.wrap, compact && emptyStyles.compact]}>
      {sport ? <SportBadge sport={sport} size={48} /> : icon ? (EMOJI_ICONS[icon.replace('\uFE0F', '')] ? (
        <View style={emptyStyles.iconCircle}><EmojiIcon spec={EMOJI_ICONS[icon.replace('\uFE0F', '')]} color={theme.colors.primary} size={26} /></View>
      ) : <Text style={emptyStyles.icon}>{icon}</Text>) : null}
      <Text style={emptyStyles.title}>{title}</Text>
      {hint ? <Text style={emptyStyles.hint}>{hint}</Text> : null}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(6), paddingHorizontal: theme.spacing(4) },
  compact: { paddingVertical: theme.spacing(4) },
  icon: { fontSize: 30 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center' },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', textAlign: 'center' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.small, textAlign: 'center', lineHeight: theme.font.small * 1.4 },
});

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  color,
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  selected,
}: {
  label: string;
  onPress: () => void;
  /** 2026-10-29 redesign: `primary` is the lime call to action (dark ink);
   *  `brand` the solid pitch green (white ink) for a second strong action. */
  variant?: 'primary' | 'brand' | 'ghost' | 'home' | 'away' | 'danger';
  /** Override the solid background (e.g. a team's kit colour on a home/away
   *  button). Ignored for the transparent `ghost` variant. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** Override when the visible label is too terse to stand alone (e.g. "+1", "↻"). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** SD-155: a toggle button (e.g. cricket's Wide / No ball panels) — read as
   *  "selected" by VoiceOver/TalkBack, aria-pressed on the web. */
  selected?: boolean;
}) {
  const variantBg =
    variant === 'primary'
      ? theme.colors.lime
      : variant === 'brand'
      ? theme.colors.primary
      : variant === 'home'
      ? theme.colors.home
      : variant === 'away'
      ? theme.colors.away
      : variant === 'danger'
      ? theme.colors.danger
      : 'transparent';
  const bg = variant === 'ghost' ? 'transparent' : color ?? variantBg;
  // SD-155: a custom kit colour gets whichever ink reads on it (dark kits → white).
  const fg = variant === 'ghost' ? theme.colors.text : color ? readableOn(color) : variant === 'primary' ? theme.colors.onLime : theme.colors.onFill;
  // a leading emoji → its line icon (the words read alone to a screen reader)
  const lead = splitLeading(label, EMOJI_KEYS);
  const spec = lead ? EMOJI_ICONS[lead.key] : undefined;
  const text = spec ? lead!.rest : label;
  // Tap feedback (2026-11-03): a quick scale-down + dim while pressed
  const press = usePressFeedback({ disabled });
  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (spec ? text || spec.name || label : label)}
      accessibilityHint={accessibilityHint}
      {...toggleA11y(selected, disabled)}
      style={[
        styles.btn,
        { backgroundColor: bg },
        // Solid buttons lift; the ghost/transparent variant stays flat.
        variant !== 'ghost' && theme.shadow.card,
        variant === 'ghost' && styles.btnGhost,
        disabled && styles.btnDisabled,
        style,
        disabled ? null : press.style,
      ]}
    >
      <View style={styles.btnRow}>
        {spec ? <EmojiIcon spec={spec} color={fg} size={18} /> : null}
        {text ? <Text style={[styles.btnText, { color: fg }]}>{text}</Text> : null}
      </View>
    </AnimatedPressable>
  );
}

export function Pill({
  label,
  color = theme.colors.surfaceAlt,
  textColor = theme.colors.textMuted,
}: {
  label: string;
  color?: string;
  textColor?: string;
}) {
  const p = chipParts(label);
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      {p.spec ? <EmojiIcon spec={p.spec} color={textColor} size={12} /> : null}
      {p.emoji ? <Text style={styles.pillEmoji}>{p.emoji}</Text> : null}
      <Text style={[styles.pillText, { color: textColor }]}>{p.text}</Text>
    </View>
  );
}

export function ScreenTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ marginBottom: theme.spacing(4) }}>
      <Text style={textStyles.h1} accessibilityRole="header">
        {stripLeadingEmoji(title)}
      </Text>
      {subtitle ? <Text style={textStyles.muted}>{subtitle}</Text> : null}
    </View>
  );
}

/** A big coloured shortcut tile: an icon above a caps label (Home's quick actions). */
export function QuickTile({ label, icon, color, ink, onPress, accessibilityHint }: {
  label: string;
  icon: React.ReactNode;
  color: string;
  /** the label colour on `color` */
  ink: string;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint}
      style={[sectionStyles.tile, { backgroundColor: color }]}>
      {icon}
      <Text style={[sectionStyles.tileLabel, { color: ink }]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A white action card for a grid of secondary actions: an icon in a tinted
 *  circle, a bold label and an optional one-line hint (2026-10-29). */
export function ActionTile({ label, hint, icon, tint, onPress }: {
  label: string;
  hint?: string;
  icon: React.ReactNode;
  /** the icon circle's colour */
  tint: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
      style={sectionStyles.action}>
      <View style={[sectionStyles.actionIcon, { backgroundColor: tint + '1F' }]}>{icon}</View>
      <Text style={sectionStyles.actionLabel} numberOfLines={2}>{label}</Text>
      {hint ? <Text style={sectionStyles.actionHint} numberOfLines={2}>{hint}</Text> : null}
    </TouchableOpacity>
  );
}

const sectionStyles = StyleSheet.create({
  action: {
    flexGrow: 1, flexBasis: '45%', minHeight: 112, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg - 4,
    borderWidth: 1, borderColor: theme.colors.surfaceAlt, padding: theme.spacing(4), gap: theme.spacing(1.5), ...theme.shadow.card,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing(1) },
  actionLabel: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  actionHint: { color: theme.colors.textMuted, fontSize: theme.font.tiny, lineHeight: theme.font.tiny * 1.35 },
  tile: {
    flex: 1, minHeight: 108, borderRadius: theme.radius.lg, padding: theme.spacing(3),
    alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2), ...theme.shadow.card,
  },
  tileLabel: { fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
});

/** A form field-group label — stronger than muted body text so a form reads as a
 *  form (labels stand out from hints/descriptions). Use above a control group
 *  (chips, date fields…). `hint` renders a muted sub-line beneath it. */
export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={fieldLabelStyles.label}>{children}</Text>
      {hint ? <Text style={fieldLabelStyles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** A visible, consistent error banner for forms — replaces bare red text so a
 *  validation/save failure is hard to miss. Renders nothing when message is empty. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={fieldLabelStyles.errorBox} accessibilityRole="alert" accessibilityLabel={`Error: ${message}`}>
      <Text style={fieldLabelStyles.errorText}>⚠  {message}</Text>
    </View>
  );
}

const fieldLabelStyles = StyleSheet.create({
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.tiny, lineHeight: theme.font.tiny * 1.4 },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: theme.colors.danger + '1A',
    borderWidth: 1,
    borderColor: theme.colors.danger + '55',
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2.5),
    paddingHorizontal: theme.spacing(3),
  },
  errorText: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '600', flex: 1 },
});

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize = 'sentences',
  multiline = false,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  /** when the box is left (e.g. tidy a number) */
  onBlur?: () => void;
}) {
  // keeps the field above the keyboard (the scroll view / sheet it sits in);
  // keyboard "Next" moves down the form, "Done" on the last field
  const kbFocus = useKeyboardFocus(undefined, onBlur ? () => onBlur() : undefined);
  const formField = useFormField(multiline);
  return (
    <View style={{ gap: theme.spacing(1) }}>
      {/* Empty label (e.g. a bare search box) renders nothing, so no empty gap. */}
      {label ? <Text style={fieldLabelStyles.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        // The <Text> above is visually a label but isn't associated with the
        // input, so a screen reader would otherwise read this field as unnamed.
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={multiline ? 4 : undefined}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...kbFocus}
        {...formField}
      />
    </View>
  );
}

/** A toggleable chip for single/multi selects in forms. `disabled` grays it out
 *  and blocks taps (e.g. a dismissed batsman who can't be picked again). */
export function SelectChip({
  label,
  active,
  onPress,
  dotColor,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  dotColor?: string;
  disabled?: boolean;
  /** SD-155: required when the visible label is a symbol ("‹", "✕", "✓"). */
  accessibilityLabel?: string;
}) {
  const p = dotColor ? { text: label } : chipParts(label);
  const dot = dotColor;
  const ink = active ? theme.colors.onLime : theme.colors.textMuted;
  // Tap feedback (2026-11-03): pressed = a quick scale-down; becoming selected
  // fades the lime fill in (not a hard switch)
  const press = usePressFeedback({ disabled });
  const fill = useSelectAnim(active && !disabled);
  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? p.text}
      // `selected` is what a screen reader announces as "selected"/"not selected" —
      // without it a chip is indistinguishable from its neighbours by voice.
      {...toggleA11y(active, disabled)}
      // ≥44pt touch target without making every chip row taller.
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      style={[styles.selChip, active && styles.selChipActiveEdge, disabled && styles.selChipDisabled, disabled ? null : press.style]}
    >
      <Animated.View pointerEvents="none" style={[styles.selFill, { opacity: fill }]} />
      {dot ? <View style={[styles.selDot, { backgroundColor: dot }]} /> : null}
      {p.spec ? <EmojiIcon spec={p.spec} color={ink} size={15} /> : null}
      {p.emoji ? <Text style={styles.selEmoji}>{p.emoji}</Text> : null}
      <Text style={[styles.selChipText, active && styles.selChipTextActive, disabled && styles.selChipTextDisabled]}>{p.text}</Text>
    </AnimatedPressable>
  );
}

export const textStyles: Record<string, TextStyle> = StyleSheet.create({
  // Tighter tracking + generous line-height give headings a more composed,
  // intentional feel than the platform defaults.
  // 2026-10-29: screen titles in the condensed italic display face, in capitals;
  // section titles in the condensed upright (no fontWeight: the face is the weight)
  h1: { color: theme.colors.text, fontSize: theme.font.h1 + 4, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 0.2, lineHeight: (theme.font.h1 + 4) * 1.05 },
  h2: { color: theme.colors.text, fontSize: theme.font.h2 + 4, fontFamily: theme.fonts.heading, letterSpacing: 0.2, lineHeight: (theme.font.h2 + 4) * 1.1 },
  h3: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700', letterSpacing: -0.2 },
  body: { color: theme.colors.text, fontSize: theme.font.body, lineHeight: theme.font.body * 1.4 },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.small, lineHeight: theme.font.small * 1.4 },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg - 4,
    borderWidth: 1,
    borderColor: theme.colors.surfaceAlt,
    padding: theme.spacing(4),
    ...theme.shadow.card,
  },
  btn: {
    minHeight: 44, // SD-155: ≥44pt target
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(5),
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1.5, borderColor: theme.colors.inputBorder },
  btnDisabled: { opacity: 0.4 },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2), maxWidth: '100%' },
  btnText: { fontSize: theme.font.body, fontWeight: '800', letterSpacing: 0.2, textAlign: 'center', flexShrink: 1 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(2.5),
    borderRadius: theme.radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: theme.font.tiny, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    // SD-155: field edge must be ≥3:1 against the page (1.4.11) — `border` was 1.3:1.
    borderColor: theme.colors.inputBorder,
    borderRadius: theme.radius.md,
    minHeight: 44,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(3),
    color: theme.colors.text,
    fontSize: theme.font.body,
  },
  inputMultiline: { minHeight: 96, paddingTop: theme.spacing(3) },
  selChip: {
    minHeight: 36, // + hitSlop → 44pt
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(2),
    paddingVertical: theme.spacing(2),
    paddingHorizontal: theme.spacing(3.5),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  /** the selected look: the edge at once, the lime fill fades in (selFill) */
  selChipActiveEdge: { borderColor: theme.colors.lime },
  selFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.colors.lime, borderRadius: theme.radius.pill },
  selChipDisabled: { opacity: 0.4, backgroundColor: theme.colors.surfaceAlt },
  selChipText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  selChipTextActive: { color: theme.colors.onLime },
  selChipTextDisabled: { textDecorationLine: 'line-through' },
  selDot: { width: 10, height: 10, borderRadius: 5 },
  selEmoji: { fontSize: 15 },
  pillEmoji: { fontSize: 12 },
});
