/** Stat leaders (UI audit #48): pick a stat (Goals, Assists, Clean sheets, …)
 *  from a row of chips; one full-width list ranks the top players for it —
 *  no sideways swiping. Tapping a player opens their profile. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { EmptyState, SelectChip, textStyles } from './ui';
import { pickedCategory } from '../core/leaderPick';
import type { LeaderCategory } from '../data/standings';

const MEDAL = ['🥇', '🥈', '🥉'];

export function StatLeaderRail({
  categories,
  onPlayer,
  topN = 5,
}: {
  categories: LeaderCategory[];
  onPlayer?: (playerId: string) => void;
  topN?: number;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  if (categories.length === 0) {
    return <EmptyState icon="📊" title="No statistics recorded yet" compact />;
  }
  const cat = pickedCategory(categories, picked)!;

  return (
    <View style={st.wrap}>
      {categories.length > 1 ? (
        <View style={st.chips}>
          {categories.map((c) => <SelectChip key={c.key} label={c.label} active={c.key === cat.key} onPress={() => setPicked(c.key)} />)}
        </View>
      ) : null}
      {[cat].map((cat) => (
        <View key={cat.key} style={st.card}>
          <View style={st.titleRow}>
            <Text style={st.cardTitle} numberOfLines={1}>{cat.label}</Text>
            {cat.qualifier ? <Text style={st.qualifier} numberOfLines={1}>{cat.qualifier}</Text> : null}
          </View>
          {cat.leaders.slice(0, topN).map((l, i) => (
            <TouchableOpacity accessibilityRole="button"
              key={l.playerId}
              activeOpacity={onPlayer ? 0.8 : 1}
              onPress={() => onPlayer?.(l.playerId)}
              style={[st.row, i > 0 && st.divider]}
            >
              <Text style={st.rankCell}>{MEDAL[i] ?? i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={textStyles.body} numberOfLines={1}>{l.name}</Text>
                {l.houseName ? <Text style={st.house} numberOfLines={1}>{l.houseName}</Text> : null}
                {l.trackedGames != null && l.totalGames != null && l.trackedGames < l.totalGames ? (
                  <Text style={st.coverage} numberOfLines={1}>☁ {l.trackedGames} of {l.totalGames} games</Text>
                ) : null}
              </View>
              <Text style={st.value}>{l.display ?? l.value}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(4),
    gap: theme.spacing(1),
  },
  titleRow: { marginBottom: theme.spacing(2), gap: 2 },
  cardTitle: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  // SD-16: the minimum to rank on a rate leaderboard ("min 30 balls")
  qualifier: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2) },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  rankCell: { width: 24, textAlign: 'center', fontSize: theme.font.body, fontWeight: '800', color: theme.colors.textMuted },
  house: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginTop: 1 },
  coverage: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', marginTop: 1 },
  value: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900' },
});
