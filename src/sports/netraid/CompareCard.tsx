/**
 * Deep wave (volleyball-kabaddi) — the broadcast match-stats card: a period
 * filter (Match / Set 1 … / 1st half …), category chips (All, Scoring,
 * Attack, Serve … / Points, Raiding, Defending …) and two-column rows with a
 * bar, the better side highlighted (errors: the lower). Children render under
 * the rows (rotation tables, team leaders). Pure rows come from the sport's
 * matchStats.ts (feed.ts shapes).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { readableOn } from '../../core/contrast';
import { SelectChip } from '../../components/ui';
import { rowLeader, rowShares, type CmpCat } from './feed';

export function CompareCard({
  title = 'Match stats', homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away,
  scopes, scope, onScope, cats, footer, children,
}: {
  title?: string;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  /** the period filter (shown with ≥ 2 periods); value 'all' = the match */
  scopes: { value: 'all' | number; label: string }[];
  scope: 'all' | number;
  onScope: (v: 'all' | number) => void;
  cats: CmpCat[];
  /** a line under the card ("From the point log · …") */
  footer?: string;
  children?: React.ReactNode;
}) {
  const [cat, setCat] = useState<string>('all');
  const active = cat !== 'all' && !cats.some((c) => c.id === cat) ? 'all' : cat;
  const shown = active === 'all' ? cats : cats.filter((c) => c.id === active);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={st.title}>{title}</Text>
      <View style={st.card} accessibilityLabel={title}>
        <View style={st.head}>
          <View style={st.side}><View style={[st.dot, { backgroundColor: homeColor }]} /><Text style={st.team} numberOfLines={1}>{homeName}</Text></View>
          <View style={[st.side, { justifyContent: 'flex-end' }]}><Text style={st.team} numberOfLines={1}>{awayName}</Text><View style={[st.dot, { backgroundColor: awayColor }]} /></View>
        </View>
        {scopes.length >= 3 && (
          <View style={st.chips}>
            {scopes.map((x) => <SelectChip key={String(x.value)} label={x.label} active={scope === x.value} onPress={() => onScope(x.value)} />)}
          </View>
        )}
        {cats.length > 1 && (
          <View style={st.chips}>
            <SelectChip label="All" active={active === 'all'} onPress={() => setCat('all')} />
            {cats.map((c) => <SelectChip key={c.id} label={c.title} active={active === c.id} onPress={() => setCat(c.id)} />)}
          </View>
        )}
        {shown.map((c) => (
          <View key={c.id} style={{ gap: theme.spacing(1) }}>
            {(cats.length > 1) && <Text style={st.cat}>{c.title.toUpperCase()}</Text>}
            {c.rows.map((r) => {
              const lead = rowLeader(r);
              const share = rowShares(r);
              const empty = r.h <= 0 && r.a <= 0;
              const cell = (v: string, side: 'home' | 'away') => {
                const bg = side === 'home' ? homeColor : awayColor;
                return (
                  <View style={[st.cell, lead === side && { backgroundColor: bg }]}>
                    <Text style={[st.cellText, lead === side && { color: readableOn(bg), fontWeight: '800' }]} numberOfLines={1}>{v}</Text>
                  </View>
                );
              };
              return (
                <View key={r.key} style={[st.row, r.sub && st.subRow]} accessible accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
                  <View style={st.vals}>
                    {cell(r.home, 'home')}
                    <Text style={[st.label, r.sub && st.subLabel]}>{r.label}</Text>
                    {cell(r.away, 'away')}
                  </View>
                  {!r.sub && (
                    <View style={st.bar}>
                      {empty ? <View style={{ flex: 1, backgroundColor: theme.colors.surfaceAlt }} /> : (
                        <>
                          <View style={{ flex: share.home, backgroundColor: homeColor }} />
                          <View style={{ flex: share.away, backgroundColor: awayColor }} />
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            {c.note ? <Text style={st.note}>{c.note}</Text> : null}
          </View>
        ))}
        {children}
        {footer ? <Text style={st.note}>{footer}</Text> : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
  side: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5), flex: 1, minWidth: 0 },
  team: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  cat: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.6, marginTop: theme.spacing(1) },
  row: { gap: 3, paddingVertical: 2 },
  subRow: { paddingLeft: theme.spacing(3) },
  vals: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  cell: { minWidth: 56, maxWidth: 104, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1.5), paddingVertical: 2 },
  cellText: { color: theme.colors.text, fontSize: theme.font.small, fontVariant: ['tabular-nums'], textAlign: 'center' },
  label: { flex: 1, color: theme.colors.text, fontSize: theme.font.tiny, textAlign: 'center' },
  subLabel: { color: theme.colors.textMuted, fontStyle: 'italic' },
  bar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
