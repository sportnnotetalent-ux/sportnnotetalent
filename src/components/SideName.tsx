/** A side's name on a scorecard (founder 2026-11-08, docs/security/breaks/pair-names.md):
 *  a pair on two lines — "Aanya Verma /" over "Divya Nair" — one size smaller
 *  than a single name; a team or single player on one line. The sizes live
 *  only here (PN2): a scorecard passes colour / weight, never a font size. */
import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { theme } from '../core/theme';
import { sideLines, sideSpoken } from '../core/sideName';

/** `card`: lists and match cards · `board`: the big score panels. */
export const SIDE_TYPE = {
  card: {
    single: { fontSize: theme.font.body, lineHeight: theme.font.body * 1.3 },
    pair: { fontSize: theme.font.small, lineHeight: theme.font.small * 1.3 },
  },
  board: {
    single: { fontSize: theme.font.h3, lineHeight: theme.font.h3 * 1.25 },
    pair: { fontSize: theme.font.body, lineHeight: theme.font.body * 1.3 },
  },
} as const;

export function SideName({ name, size = 'card', align = 'left', style }: {
  name: string;
  size?: keyof typeof SIDE_TYPE;
  align?: 'left' | 'right' | 'center';
  /** colour, weight, opacity — the font size comes from SIDE_TYPE */
  style?: StyleProp<TextStyle>;
}) {
  const lines = sideLines(name);
  const pair = lines.length === 2;
  const type = pair ? SIDE_TYPE[size].pair : SIDE_TYPE[size].single;
  return (
    <View style={[st.wrap, align === 'right' && st.right, align === 'center' && st.center]} accessible accessibilityLabel={sideSpoken(name)}>
      {lines.map((l, i) => (
        <Text key={i} style={[st.text, style, type, { textAlign: align }]} numberOfLines={pair ? 1 : 2}>{l}</Text>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexShrink: 1, minWidth: 0 },
  right: { alignItems: 'flex-end' },
  center: { alignItems: 'center' },
  text: { color: theme.colors.text, fontWeight: '700' },
});
