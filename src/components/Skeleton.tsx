/**
 * Loading placeholders (reference-video B6): grey shapes like the cards about
 * to appear, instead of a spinner. They show only after a short delay (no
 * flicker on fast loads) and only while loading. If loading takes too long, a
 * plain message replaces them, so the screen never spins forever.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../core/theme';
import { skeletonVisible } from '../core/skeleton';

export function SkeletonList({
  loading,
  rows = 3,
  slowAfterMs,
  slowLabel = 'This is taking longer than usual. Check your connection, then go back and try again.',
  label = 'Loading',
}: {
  loading: boolean;
  rows?: number;
  /** past this, the message replaces the placeholders */
  slowAfterMs?: number;
  slowLabel?: string;
  /** what a screen reader hears */
  label?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Date.now() - t0), 150);
    return () => clearInterval(iv);
  }, [loading]);
  if (!skeletonVisible({ loading, elapsedMs: elapsed })) return null;
  if (slowAfterMs && elapsed >= slowAfterMs) return <Text style={st.slow}>{slowLabel}</Text>;
  return (
    <View style={st.wrap} accessibilityRole="progressbar" accessibilityLabel={label}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={st.card}>
          <View style={[st.line, { width: '35%' }]} />
          <View style={[st.line, st.big, { width: '80%' }]} />
          <View style={[st.line, { width: '55%' }]} />
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4), gap: theme.spacing(2) },
  line: { height: 10, borderRadius: 5, backgroundColor: theme.colors.surfaceAlt },
  big: { height: 18, borderRadius: 6 },
  slow: { color: theme.colors.textMuted, fontSize: theme.font.small, padding: theme.spacing(4), textAlign: 'center' },
});
