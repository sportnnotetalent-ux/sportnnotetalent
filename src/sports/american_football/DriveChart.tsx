/**
 * Deep wave — American football's drive chart (the NFL Game Book drive
 * summaries): one row per drive, newest first — the quarter and team, how the
 * ball was obtained and where, plays – yards – time, and how it ended. The
 * rows come from ./drives.ts (pure); a score-only game has none.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { downText } from './engine';
import { driveRows } from './drives';
import type { AFState } from './engine';

export function DriveChart({ s, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away }: {
  s: AFState; homeName: string; awayName: string; homeColor?: string; awayColor?: string;
}) {
  const names = { home: homeName, away: awayName };
  const rows = driveRows(s, names);
  const color = (sd: 'home' | 'away') => (sd === 'home' ? homeColor : awayColor);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {!s.ended && s.drive ? (
        <Text style={st.now} accessibilityLiveRegion="polite">🏈 {names[s.drive.off]} ball · {downText(s, s.drive, true)}</Text>
      ) : null}
      {rows.length === 0 ? <Text style={st.empty}>No drives yet — they build from the play-by-play snaps.</Text> : (
        <View style={st.card}>
          {rows.map((r, i) => (
            <View key={r.key} style={[st.row, i > 0 && st.sep]} accessible accessibilityLabel={`${r.title}. ${r.detail}. ${r.result}`}>
              <View style={[st.rail, { backgroundColor: color(r.side) }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={st.top}>
                  <Text style={st.title} numberOfLines={1}>{r.title}</Text>
                  <Text style={[st.result, r.scored && st.scored]} numberOfLines={1}>{r.result}{r.points ? ` · +${r.points}` : ''}</Text>
                </View>
                <Text style={st.detail}>{r.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  now: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: theme.spacing(2), paddingVertical: theme.spacing(2), paddingRight: theme.spacing(3), minHeight: 44 },
  sep: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  rail: { width: 4, alignSelf: 'stretch' },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
  title: { flexShrink: 1, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  result: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  scored: { color: theme.colors.text },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '600' },
});
