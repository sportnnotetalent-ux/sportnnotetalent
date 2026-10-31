/**
 * The pieces every racket "Match stats" panel shares (MatchStatsPanel.tsx for
 * badminton / table tennis / squash / padel / pickleball, and
 * tennis/StatsPanel.tsx): the two-sided stat row, the team header and the
 * style sheet. Kept free of any sport's stats engine, so a sport's on-demand
 * download doesn't pull in another's.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import type { ServeRow } from './serveStats';

/** One two-sided row: home value · label · away value, with a share bar. */
export function StatBar({ r, homeName, awayName, homeColor, awayColor }: { r: ServeRow; homeName: string; awayName: string; homeColor: string; awayColor: string }) {
  const tot = r.hv + r.av;
  const hw = tot > 0 ? r.hv / tot : 0.5;
  return (
    <View style={statStyles.row} accessible accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
      <View style={statStyles.vals}>
        <Text style={[statStyles.val, r.hv > r.av && statStyles.lead]}>{r.home}</Text>
        <Text style={statStyles.label}>{r.label}</Text>
        <Text style={[statStyles.val, statStyles.right, r.av > r.hv && statStyles.lead]}>{r.away}</Text>
      </View>
      <View style={statStyles.bar}>
        <View style={{ flex: hw, backgroundColor: homeColor, opacity: tot > 0 ? 1 : 0.25 }} />
        <View style={{ flex: 1 - hw, backgroundColor: awayColor, opacity: tot > 0 ? 1 : 0.25 }} />
      </View>
    </View>
  );
}

/** The card's top line: home name and colour dot · away name and colour dot. */
export function StatsHead({ homeName, awayName, homeColor, awayColor }: { homeName: string; awayName: string; homeColor: string; awayColor: string }) {
  return (
    <View style={statStyles.head}>
      <View style={statStyles.side}><View style={[statStyles.dot, { backgroundColor: homeColor }]} /><Text style={statStyles.team} numberOfLines={1}>{homeName}</Text></View>
      <View style={[statStyles.side, { justifyContent: 'flex-end' }]}><Text style={statStyles.team} numberOfLines={1}>{awayName}</Text><View style={[statStyles.dot, { backgroundColor: awayColor }]} /></View>
    </View>
  );
}

export const statStyles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
  side: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5), flex: 1, minWidth: 0 },
  team: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  section: { gap: theme.spacing(1), marginTop: theme.spacing(1) },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  row: { gap: 3, paddingVertical: 2 },
  vals: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  val: { color: theme.colors.text, fontSize: theme.font.small, width: 92, fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
  lead: { fontWeight: '800' },
  label: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.tiny, textAlign: 'center' },
  bar: { flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  pName: { color: theme.colors.text, fontSize: theme.font.small, flex: 1 },
  pVal: { color: theme.colors.text, fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  table: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tCell: { flex: 1, color: theme.colors.text, fontSize: theme.font.small, textAlign: 'center', fontVariant: ['tabular-nums'] },
  tHead: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.tiny },
  tLabel: { flex: 1.6, textAlign: 'left', color: theme.colors.textMuted },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
