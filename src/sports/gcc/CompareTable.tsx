/**
 * Deep wave (golf · chess · carrom) — the broadcast stats panel: a header with
 * both names, unit filter chips (game / set / phase / nine), category selector
 * chips (where the standard has them), and rows with a value each side and a
 * proportion bar. Display only (data from the gcc/model.ts builders).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip, textStyles } from '../../components/ui';
import type { CompareCategory } from './model';

export function CompareTable({
  homeName, awayName, homeColor, awayColor, categories, units, unit, onUnit, title = '📊 Match stats', empty = 'No stats yet.', footnote, single = false,
}: {
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  categories: CompareCategory[];
  /** unit filter chips (All / G1 / G2…) */
  units?: { key: string; label: string }[];
  unit?: string;
  onUnit?: (key: string) => void;
  title?: string | null;
  empty?: string;
  footnote?: string;
  /** one column only (a golfer alone on the card): label · value, no bars */
  single?: boolean;
}) {
  const [cat, setCat] = useState<string>('all');
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  const shown = cat === 'all' ? categories : categories.filter((c) => c.id === cat);
  const any = categories.some((c) => c.rows.length);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {title ? <Text style={st.title}>{title}</Text> : null}
      {units && units.length > 1 ? (
        <View style={st.chips}>
          {units.map((u) => <SelectChip key={u.key} label={u.label} active={unit === u.key} onPress={() => onUnit?.(u.key)} />)}
        </View>
      ) : null}
      {categories.length > 1 ? (
        <View style={st.chips}>
          <SelectChip label="All" active={cat === 'all'} onPress={() => setCat('all')} />
          {categories.map((c) => <SelectChip key={c.id} label={c.title} active={cat === c.id} onPress={() => setCat(c.id)} />)}
        </View>
      ) : null}
      {!any ? <Text style={textStyles.muted}>{empty}</Text> : (
        <View style={st.card}>
          <View style={st.head}>
            <Text style={[st.name, { color: hc }]} numberOfLines={1}>{homeName}</Text>
            {single ? null : <Text style={[st.name, st.right, { color: ac }]} numberOfLines={1}>{awayName}</Text>}
          </View>
          {shown.filter((c) => c.rows.length).map((c) => (
            <View key={c.id}>
              {categories.length > 1 ? <Text style={st.section}>{c.title}</Text> : null}
              {c.rows.map((r) => {
                if (single) {
                  return (
                    <View key={r.key} style={[st.vals, st.row]} accessibilityLabel={`${r.label}: ${r.home}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.label, st.left]}>{r.label}</Text>
                        {r.note ? <Text style={[st.note, st.left]} numberOfLines={1}>{r.note}</Text> : null}
                      </View>
                      <Text style={[st.val, st.right, st.lead]}>{r.home}</Text>
                    </View>
                  );
                }
                const total = (r.hv ?? 0) + (r.av ?? 0);
                const bars = r.hv != null && r.av != null && total > 0;
                const hBetter = bars && (r.better === 'lower' ? r.hv! < r.av! : r.hv! > r.av!);
                const aBetter = bars && (r.better === 'lower' ? r.av! < r.hv! : r.av! > r.hv!);
                return (
                  <View key={r.key} style={st.row} accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
                    <View style={st.vals}>
                      <Text style={[st.val, hBetter && st.lead]}>{r.home}</Text>
                      <View style={st.mid}>
                        <Text style={st.label} numberOfLines={2}>{r.label}</Text>
                        {r.note ? <Text style={st.note} numberOfLines={1}>{r.note}</Text> : null}
                      </View>
                      <Text style={[st.val, st.right, aBetter && st.lead]}>{r.away}</Text>
                    </View>
                    {bars ? (
                      <View style={st.barRow}>
                        <View style={st.barHalf}><View style={[st.bar, { width: `${Math.round((r.hv! / total) * 100)}%`, backgroundColor: hc, alignSelf: 'flex-end', opacity: hBetter ? 1 : 0.55 }]} /></View>
                        <View style={st.barHalf}><View style={[st.bar, { width: `${Math.round((r.av! / total) * 100)}%`, backgroundColor: ac, opacity: aBetter ? 1 : 0.55 }]} /></View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
      {footnote ? <Text style={st.foot}>{footnote}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  card: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, padding: theme.spacing(3), gap: theme.spacing(1) },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2), paddingBottom: theme.spacing(1) },
  name: { flex: 1, fontSize: theme.font.small, fontWeight: '900' },
  right: { textAlign: 'right' },
  left: { textAlign: 'left' },
  section: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: theme.spacing(2), marginBottom: theme.spacing(1), textAlign: 'center' },
  row: { paddingVertical: theme.spacing(1), gap: 3 },
  vals: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  val: { width: 84, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  lead: { fontWeight: '900', color: theme.colors.text },
  mid: { flex: 1, alignItems: 'center' },
  label: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textAlign: 'center' },
  note: { color: theme.colors.textMuted, fontSize: 10, textAlign: 'center' },
  barRow: { flexDirection: 'row', gap: 4 },
  barHalf: { flex: 1, height: 4, backgroundColor: theme.colors.surfaceAlt, borderRadius: 2, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2 },
  foot: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
