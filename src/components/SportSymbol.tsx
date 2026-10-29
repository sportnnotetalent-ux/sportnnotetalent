/**
 * A sport's symbol: its emoji — the same kind of icon in every list, chip,
 * picker and heading (founder 2026-10-29). One emoji per sport (carrom 🟤, not
 * pool's 🎱; tests/sport-identity.test.mts). The drawn court badges these
 * replaced were found too playful. Decorative: the name beside it carries the
 * meaning for screen readers.
 */
import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { theme } from '../core/theme';
import type { SportId } from '../core/types';
import { getSportMeta } from '../sports/sportMeta';
import { sportStack } from '../core/leadingEmoji';

/** A sport's emoji in a `size`-point square (where a list row shows the sport). */
export function SportBadge({ sport, size = 30 }: { sport: SportId | string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text style={{ fontSize: Math.round(size * 0.78), lineHeight: Math.round(size * 0.98) }}>{getSportMeta(sport as SportId).icon}</Text>
    </View>
  );
}

/** A run of sports as their emoji (the first few, then "+N"), then the line's
 *  words. One sport also shows its name. */
export function SportLine({ sports, children, size = 18, max = 4, style, textStyle, numberOfLines = 2 }: {
  sports: readonly (SportId | string)[];
  children?: React.ReactNode;
  size?: number;
  max?: number;
  style?: StyleProp<ViewStyle>;
  /** the words' style (a heading, a body line); muted small by default */
  textStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { shown, more } = sportStack(sports, max);
  const names = shown.length === 1 && !more ? getSportMeta(shown[0] as SportId).name : '';
  const words = [names, children].filter((w) => w !== '' && w != null && w !== false);
  return (
    <View style={[st.line, style]}>
      {shown.length ? (
        <View style={st.stack} accessible accessibilityLabel={[...new Set(sports)].map((s) => getSportMeta(s as SportId).name).join(', ')}>
          {shown.map((s) => <SportBadge key={s} sport={s} size={size} />)}
          {more ? <Text style={st.more}>+{more}</Text> : null}
        </View>
      ) : null}
      {words.length ? (
        <Text style={[st.lineText, textStyle]} numberOfLines={numberOfLines}>
          {words.map((w, i) => <React.Fragment key={i}>{i ? ' · ' : ''}{w}</React.Fragment>)}
        </Text>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5), marginTop: 2 },
  stack: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  more: { marginLeft: 4, color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  lineText: { flexShrink: 1, color: theme.colors.textMuted, fontSize: theme.font.small, lineHeight: theme.font.small * 1.4 },
});
