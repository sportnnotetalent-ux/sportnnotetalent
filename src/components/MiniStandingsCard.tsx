/** Stitch pick 8 (docs/security/breaks/stitch-tournament-page.md): the top of
 *  the table on the tournament's Matches tab — rank, colour dot, name, the
 *  record and points; Q only for a team that is through (TP4). */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, textStyles } from './ui';
import { SideName } from './SideName';
import type { MiniTable } from '../core/tournamentPage';

export function MiniStandingsCard({ title, table, onMore, onTeam }: { title: string; table: MiniTable; onMore: () => void; onTeam?: (teamId: string) => void }) {
  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={st.title}>🏆 {title}</Text>
        <Text style={st.more} accessibilityRole="link" onPress={onMore}>Full standings ›</Text>
      </View>
      <View style={st.row}>
        <Text style={[st.h, st.rank]}>#</Text>
        <Text style={[st.h, st.name]}>{table.kind === 'medal' ? 'House' : 'Team'}</Text>
        {table.head.map((h) => <Text key={h} style={[st.h, st.cell, h === 'Pts' && st.pts]}>{h}</Text>)}
      </View>
      {table.rows.map((r) => (
        <View key={r.teamId} style={[st.row, st.line]} accessible accessibilityLabel={`${r.rank}. ${r.name}, ${r.pts} points${r.q ? ', through' : ''}`}>
          <Text style={st.rank}>{r.rank}</Text>
          <View style={[st.name, st.nameRow]}>
            <View style={[st.dot, { backgroundColor: r.color ?? theme.colors.border }]} />
            <View style={st.flex}><SideName name={r.name} style={st.team} /></View>
            {r.q ? <Text style={st.q}>Q</Text> : null}
          </View>
          {r.cells.map((c, i) => <Text key={i} style={st.cell}>{c}</Text>)}
          <Text style={[st.cell, st.pts, st.ptsVal]} onPress={onTeam ? () => onTeam(r.teamId) : undefined}>{r.pts}</Text>
        </View>
      ))}
      {table.rows.some((r) => r.q) ? <Text style={textStyles.muted}>Q = through to the next stage</Text> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(1), padding: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing(1) },
  title: { fontFamily: theme.fonts.heading, fontSize: theme.font.h3 + 2, color: theme.colors.text, textTransform: 'uppercase' },
  more: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  line: { borderTopWidth: 1, borderTopColor: theme.colors.surfaceAlt, paddingVertical: theme.spacing(1.5) },
  h: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  rank: { width: 20, color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  name: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5) },
  flex: { flex: 1, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  team: { fontWeight: '600' },
  q: { backgroundColor: theme.colors.lime, color: theme.colors.onLime, fontSize: theme.font.tiny, fontWeight: '800', paddingHorizontal: 5, borderRadius: 4, overflow: 'hidden' },
  cell: { width: 26, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  pts: { width: 34 },
  ptsVal: { fontFamily: theme.fonts.numeral, fontSize: theme.font.h3, color: theme.colors.primary },
});
