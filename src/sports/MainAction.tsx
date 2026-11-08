/** Stitch pick 3 (docs/security/breaks/stitch-live-scoring.md LS9/LS10): a
 *  team's one main scoring action — tall, in the team's own colour, the label
 *  big ("🏑 GOAL +1"). The other actions (shot, card, sub …) stay as they are
 *  below it. Ink is picked for contrast on the kit colour. */
import React from 'react';
import { Text, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../core/theme';
import { readableOn } from '../core/contrast';
import { AnimatedPressable, usePressFeedback } from '../components/pressFeedback';

export function MainAction({ label, plus, color, onPress, disabled, accessibilityLabel, team, style }: {
  /** "🏑 Goal" */
  label: string;
  /** "+1" — only where the action is always worth that */
  plus?: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** the team's name on the button (when it isn't already above it in the team's column) */
  team?: string;
  /** e.g. flex: 1 in a row of two */
  style?: StyleProp<ViewStyle>;
}) {
  const ink = readableOn(color);
  const fb = usePressFeedback({ disabled });
  return (
    <AnimatedPressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}${team ? ` — ${team}` : ''}`} accessibilityState={{ disabled: !!disabled }}
      onPressIn={fb.onPressIn} onPressOut={fb.onPressOut}
      style={[st.btn, { backgroundColor: color }, disabled && st.off, style, fb.style]}>
      {team ? <Text style={[st.team, { color: ink }]} numberOfLines={1}>{team}</Text> : null}
      <View style={st.row}>
        <Text style={[st.label, { color: ink }]} numberOfLines={1}>{label.toUpperCase()}</Text>
        {plus ? <Text style={[st.label, { color: ink }]}>{plus}</Text> : null}
      </View>
    </AnimatedPressable>
  );
}

const st = StyleSheet.create({
  btn: { minHeight: 64, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2), ...theme.shadow.card },
  off: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5) },
  team: { fontSize: theme.font.small, fontWeight: '700', marginBottom: 2 },
  label: { fontFamily: theme.fonts.heading, fontSize: theme.font.h2 },
});
