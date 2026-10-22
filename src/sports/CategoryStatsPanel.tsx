/**
 * Deep wave — the broadcast "Team stats" panel (model: statPanel.ts): a
 * home-vs-away comparison by category (Shooting, Scoring, …) with a period
 * filter (Match / Q1 …) and category chips, the better side highlighted and
 * a bar per row. Coverage notes sit under it ("Shot zones charted on 30 of
 * 42 field goals"). `children` render under the rows (a shot chart).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import { betterSide, type StatPanelData } from './statPanel';

type Scope = 'all' | number;

export function CategoryStatsPanel({
  title = 'Team stats', periods, data, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, matchLabel = 'Match', children,
}: {
  title?: string;
  /** the period filter (shown once there are two) */
  periods: { value: number; label: string }[];
  data: (scope: Scope) => StatPanelData;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  matchLabel?: string;
  children?: (scope: Scope) => React.ReactNode;
}) {
  const [scope, setScope] = useState<Scope>('all');
  const [cat, setCat] = useState<string>('all');
  const active: Scope = scope !== 'all' && !periods.some((p) => p.value === scope) ? 'all' : scope;
  const d = data(active);
  if (!d.categories.length) return null;
  const shownCat = cat !== 'all' && !d.categories.some((c) => c.key === cat) ? 'all' : cat;
  const cats = shownCat === 'all' ? d.categories : d.categories.filter((c) => c.key === shownCat);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={st.title}>{title}</Text>
      {periods.length >= 2 ? (
        <View style={st.chips}>
          <SelectChip label={matchLabel} active={active === 'all'} onPress={() => setScope('all')} />
          {periods.map((p) => <SelectChip key={p.value} label={p.label} active={active === p.value} onPress={() => setScope(p.value)} />)}
        </View>
      ) : null}
      {d.categories.length >= 2 ? (
        <View style={st.chips}>
          <SelectChip label="All stats" active={shownCat === 'all'} onPress={() => setCat('all')} />
          {d.categories.map((c) => <SelectChip key={c.key} label={c.title} active={shownCat === c.key} onPress={() => setCat(c.key)} />)}
        </View>
      ) : null}
      <View style={st.card} accessibilityLabel={title}>
        <View style={st.head}>
          <View style={st.side}><View style={[st.dot, { backgroundColor: homeColor }]} /><Text style={st.team} numberOfLines={1}>{homeName}</Text></View>
          <View style={[st.side, { justifyContent: 'flex-end' }]}><Text style={[st.team, { textAlign: 'right' }]} numberOfLines={1}>{awayName}</Text><View style={[st.dot, { backgroundColor: awayColor }]} /></View>
        </View>
        {cats.map((c) => (
          <View key={c.key} style={{ gap: theme.spacing(1) }}>
            <Text style={st.section} accessibilityRole="header">{c.title}</Text>
            {c.rows.map((r) => {
              const lead = betterSide(r);
              const tot = Math.max(0, r.h) + Math.max(0, r.a);
              return (
                <View key={r.key} style={st.row} accessible accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
                  <View style={st.vals}>
                    <Text style={[st.val, lead === 'home' && { color: homeColor, fontWeight: '900' }]} numberOfLines={1}>{r.home}</Text>
                    <Text style={st.label} numberOfLines={2}>{r.label}</Text>
                    <Text style={[st.val, st.right, lead === 'away' && { color: awayColor, fontWeight: '900' }]} numberOfLines={1}>{r.away}</Text>
                  </View>
                  {r.sub ? (
                    <View style={st.vals}>
                      <Text style={st.sub} numberOfLines={1}>{r.sub.home ?? ''}</Text>
                      <Text style={[st.sub, st.right]} numberOfLines={1}>{r.sub.away ?? ''}</Text>
                    </View>
                  ) : null}
                  {!r.noBar ? (
                    <View style={st.bar}>
                      {tot > 0 ? (
                        <>
                          <View style={{ flex: Math.max(0, r.h) / tot, backgroundColor: homeColor }} />
                          <View style={{ flex: Math.max(0, r.a) / tot, backgroundColor: awayColor }} />
                        </>
                      ) : <View style={{ flex: 1, backgroundColor: theme.colors.surfaceAlt }} />}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
        {children?.(active)}
      </View>
      {d.notes.map((n) => <Text key={n} style={st.note}>☁ {n}</Text>)}
    </View>
  );
}

const st = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  team: { flexShrink: 1, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  section: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: theme.spacing(2) },
  row: { gap: theme.spacing(1), paddingVertical: theme.spacing(1) },
  vals: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  val: { width: 96, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
  label: { flex: 1, textAlign: 'center', color: theme.colors.textMuted, fontSize: theme.font.small },
  sub: { width: 120, color: theme.colors.textMuted, fontSize: theme.font.tiny, flexShrink: 1 },
  bar: { flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
