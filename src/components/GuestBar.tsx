/**
 * Shown under a shared page when the visitor isn't signed in: what SportnNote
 * is, and one tap to join (they come back to this page after signing up).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../core/theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { promptSignIn } from '../core/guest';
import type { RootStackParamList } from '../navigation/types';

export function GuestBar() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View style={[st.bar, { paddingBottom: Math.max(insets.bottom, theme.spacing(3)) }]}>
      <View style={st.flex}>
        <Text style={st.title}>Follow live scores on SportnNote</Text>
        {/* Growth plan #6: a viewer's own game, straight away (no sign-up to start) */}
        <Text style={st.own} accessibilityRole="link" onPress={() => nav.navigate('GuestGame', { from: 'guest_bar' })}>Score your own game, free ›</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sign in" onPress={() => promptSignIn('in')} hitSlop={8}>
        <Text style={st.link}>Sign in</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sign up free" onPress={() => promptSignIn('up')} style={st.btn} activeOpacity={0.85}>
        <Text style={st.btnText}>Join free</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    paddingHorizontal: theme.spacing(4), paddingTop: theme.spacing(3),
    backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  flex: { flex: 1, minWidth: 0 },
  title: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  own: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '800' },
  link: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  btn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3) },
  btnText: { color: theme.colors.onFill, fontSize: theme.font.small, fontWeight: '800' },
});
