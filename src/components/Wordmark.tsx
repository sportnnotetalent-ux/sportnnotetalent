/** The SportnNote wordmark, as on the launch screen (founder 2026-11-08,
 *  docs/security/breaks/wordmark.md): "Sport" and "Note" in one colour, the
 *  "n" between them in another, in the italic display face. `dark` is the
 *  launch look (lime + white) for the green screens; `light` is the same
 *  pattern for cream / white (deep green + near-black). */
import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { theme } from '../core/theme';

export const WORDMARK_TONES = {
  dark: { word: theme.colors.lime, n: '#FFFFFF' },
  light: { word: theme.colors.primary, n: theme.colors.text },
} as const;

export function Wordmark({ tone, style, numberOfLines = 1 }: {
  tone: keyof typeof WORDMARK_TONES;
  /** size, font, spacing — the colours come from the tone */
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const c = WORDMARK_TONES[tone];
  return (
    <Text style={style} numberOfLines={numberOfLines} accessibilityLabel="SportnNote">
      <Text style={{ color: c.word }}>Sport</Text><Text style={{ color: c.n }}>n</Text><Text style={{ color: c.word }}>Note</Text>
    </Text>
  );
}
