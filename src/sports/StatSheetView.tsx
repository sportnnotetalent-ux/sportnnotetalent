/**
 * Deep wave — the broadcast "Match stats" sheet (ice hockey, rugby, American
 * football, baseball / softball): scope chips (Overall / P1 / H2 / Q3 …),
 * category chips (All / Scoring / Power play / Set piece …), then per section
 * the team-vs-team rows with a split bar and the leader highlighted. The rows
 * come from the sport (./compareSheet — only what the match tracked).
 */
import { ensureContrast } from '../core/contrast';
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import { pickCategory, rowLeader, rowShares, rowSpoken, sheetCategories, type StatSheet } from './compareSheet';

export function StatSheetView({
  build, scopes = [], homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away,
  emptyText = 'No stats yet.',
}: {
  /** the sheet for a scope ('all' = the whole match) */
  build: (scope: 'all' | number) => StatSheet;
  /** the periods the match has reached (the chips show from two) */
  scopes?: { value: number; label: string }[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  emptyText?: string;
}) {
  const [scope, setScope] = useState<'all' | number>('all');
  const [cat, setCat] = useState('all');
  const active = scope !== 'all' && !scopes.some((x) => x.value === scope) ? 'all' : scope;
  const full = build(active);
  const cats = sheetCategories(full);
  const activeCat = cats.some((c) => c.key === cat) ? cat : 'all';
  const sh = pickCategory(full, activeCat);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {scopes.length >= 2 ? (
        <View style={st.chips}>
          <SelectChip label="Overall" active={active === 'all'} onPress={() => setScope('all')} />
          {scopes.map((x) => <SelectChip key={x.value} label={x.label} active={active === x.value} onPress={() => setScope(x.value)} />)}
        </View>
      ) : null}
      {cats.length ? (
        <View style={st.chips}>
          {cats.map((c) => <SelectChip key={c.key} label={c.label} active={activeCat === c.key} onPress={() => setCat(c.key)} />)}
        </View>
      ) : null}
      {sh.sections.length === 0 ? <Text style={st.empty}>{emptyText}</Text> : (
        <View style={st.card}>
          <View style={st.headRow}>
            <View style={st.headSide}><View style={[st.dot, { backgroundColor: homeColor }]} /><Text style={st.team} numberOfLines={1}>{homeName}</Text></View>
            <View style={[st.headSide, { justifyContent: 'flex-end' }]}><Text style={[st.team, { textAlign: 'right' }]} numberOfLines={1}>{awayName}</Text><View style={[st.dot, { backgroundColor: awayColor }]} /></View>
          </View>
          {sh.sections.map((sec) => (
            <View key={sec.key} style={st.section}>
              <Text style={st.secTitle} accessibilityRole="header">{sec.title}</Text>
              {sec.rows.map((r) => {
                const lead = rowLeader(r);
                const share = rowShares(r);
                return (
                  <View key={r.key} style={st.row} accessible accessibilityLabel={rowSpoken(r, homeName, awayName)}>
                    <View style={st.vals}>
                      <Text style={[st.val, lead === 'home' && { color: ensureContrast(homeColor, theme.colors.bg) }]}>{r.home}</Text>
                      <Text style={st.label} numberOfLines={2}>{r.label}</Text>
                      <Text style={[st.val, { textAlign: 'right' }, lead === 'away' && { color: ensureContrast(awayColor, theme.colors.bg) }]}>{r.away}</Text>
                    </View>
                    {r.plain ? null : (
                      <View style={st.bar}>
                        <View style={{ flex: share.home, backgroundColor: lead === 'away' ? theme.colors.border : homeColor, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }} />
                        <View style={{ width: 2 }} />
                        <View style={{ flex: share.away, backgroundColor: lead === 'home' ? theme.colors.border : awayColor, borderTopRightRadius: 3, borderBottomRightRadius: 3 }} />
                      </View>
                    )}
                  </View>
                );
              })}
              {sec.note ? <Text style={st.note}>{sec.note}</Text> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1) },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(3) },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
  headSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  team: { flexShrink: 1, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  section: { gap: theme.spacing(2) },
  secTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { gap: 4 },
  vals: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  val: { width: 92, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
  label: { flex: 1, textAlign: 'center', color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600' },
  bar: { flexDirection: 'row', height: 5 },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontStyle: 'italic' },
});
