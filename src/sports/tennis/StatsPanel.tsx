/**
 * SD-157 — tennis "Match stats" at ATP / Infosys depth: KEY STATS (Service ·
 * Winners & errors · Points won · Games), SERVE & RETURN with a Total / 1st
 * serve / 2nd serve selector, RALLY (FH / BH winners, unforced and forced
 * errors by shot type + the stroke summary) and RALLY LENGTH, per match or
 * set. Rows and panels appear only for what the match tracked (D8). Every
 * figure is replayed from the point log (tennis/matchStats.ts) — old and
 * corrected matches included.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import type { Player } from '../../core/types';
import { playerServeLine, type ServeRow } from '../serveStats';
import {
  RALLY_CATS, blockOf, keyStats, rallyLengthRows, rallyRows, serveFilters, serveReturnRows, strokeSummary, tennisView,
  type RallyCat, type Scope, type ServeFilter,
} from './matchStats';

type Tab = 'key' | 'serve' | 'rally' | 'length';

export function TennisStatsPanel({
  state, homeName, awayName, homeRoster = [], awayRoster = [],
  homeColor = theme.colors.home, awayColor = theme.colors.away,
}: {
  state: unknown;
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  homeColor?: string;
  awayColor?: string;
}) {
  const hIds = homeRoster.map((p) => p.id).join(',');
  const aIds = awayRoster.map((p) => p.id).join(',');
  const v = useMemo(
    () => tennisView(state, { home: hIds ? hIds.split(',') : [], away: aIds ? aIds.split(',') : [] }),
    [state, hIds, aIds],
  );
  const [scope, setScope] = useState<Scope>('all');
  const [tab, setTab] = useState<Tab>('key');
  const [filter, setFilter] = useState<ServeFilter>('all');
  const [cat, setCat] = useState<RallyCat>('fhW');
  if (!v || v.st.match.rallies === 0) return null;
  const periods = v.st.periods.length;
  const active: Scope = scope !== 'all' && scope > periods ? 'all' : scope;
  const block = blockOf(v, active);
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'key', label: 'Key stats' },
    { key: 'serve', label: 'Serve & return' },
    ...(v.cov.detail ? [{ key: 'rally' as const, label: 'Rally' }] : []),
    ...(v.cov.rally ? [{ key: 'length' as const, label: 'Rally length' }] : []),
  ];
  const cur: Tab = tabs.some((t) => t.key === tab) ? tab : 'key';
  const filters = serveFilters(v);
  const f: ServeFilter = filters.includes(filter) ? filter : 'all';
  const nameOf = (id: string) => [...homeRoster, ...awayRoster].find((p) => p.id === id)?.fullName ?? id;
  const players = block ? Object.entries(block.players).filter(([, p]) => p.srvPlayed > 0)
    .sort(([, x], [, y]) => (x.side === y.side ? 0 : x.side === 'home' ? -1 : 1)) : [];
  const bar = (r: ServeRow) => <StatBar key={r.key} r={r} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />;

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={st.title}>Match stats</Text>
      <View style={st.card} accessibilityLabel="Match stats">
        <View style={st.head}>
          <View style={st.side}><View style={[st.dot, { backgroundColor: homeColor }]} /><Text style={st.team} numberOfLines={1}>{homeName}</Text></View>
          <View style={[st.side, { justifyContent: 'flex-end' }]}><Text style={st.team} numberOfLines={1}>{awayName}</Text><View style={[st.dot, { backgroundColor: awayColor }]} /></View>
        </View>
        {periods >= 2 && (
          <View style={st.chips}>
            <SelectChip label="Match" active={active === 'all'} onPress={() => setScope('all')} />
            {v.st.periods.map((_, i) => <SelectChip key={i} label={`Set ${i + 1}`} active={active === i + 1} onPress={() => setScope(i + 1)} />)}
          </View>
        )}
        <View style={st.chips}>
          {tabs.map((t) => <SelectChip key={t.key} label={t.label} active={cur === t.key} onPress={() => setTab(t.key)} />)}
        </View>

        {cur === 'key' && keyStats(v, active).map((sec) => (
          <View key={sec.id} style={st.section} accessibilityLabel={sec.title}>
            <Text style={st.sub}>{sec.title.toUpperCase()}</Text>
            {sec.rows.map(bar)}
          </View>
        ))}

        {cur === 'serve' && (
          <View style={st.section}>
            {filters.length > 1 && (
              <View style={st.chips}>
                {filters.map((x) => <SelectChip key={String(x)} label={x === 'all' ? 'Total' : x === 1 ? '1st serve' : '2nd serve'} active={f === x} onPress={() => setFilter(x)} />)}
              </View>
            )}
            {serveReturnRows(v, active, f).map(bar)}
            {players.length > 0 && v.st.doubles && f === 'all' && (
              <View style={{ gap: theme.spacing(1), marginTop: theme.spacing(1) }}>
                <Text style={st.sub}>Service points won, by server</Text>
                {players.map(([id, p]) => (
                  <View key={id} style={st.pRow}>
                    <View style={[st.dot, { backgroundColor: p.side === 'home' ? homeColor : awayColor }]} />
                    <Text style={st.pName} numberOfLines={1}>{nameOf(id)}</Text>
                    <Text style={st.pVal}>{playerServeLine(v.st, p)}</Text>
                  </View>
                ))}
              </View>
            )}
            {f !== 'all' && <Text style={st.note}>Return figures here are the points returning the opponent’s {f === 1 ? '1st' : '2nd'} serve.</Text>}
          </View>
        )}

        {cur === 'rally' && (
          <View style={st.section}>
            <View style={st.chips}>
              {RALLY_CATS.map((c) => <SelectChip key={c.id} label={c.label} active={cat === c.id} onPress={() => setCat(c.id)} />)}
            </View>
            {rallyRows(v, active, cat).map(bar)}
            <Text style={[st.sub, { marginTop: theme.spacing(2) }]}>STROKE SUMMARY</Text>
            <View style={st.table} accessibilityLabel="Stroke summary">
              <View style={st.tRow}>
                <Text style={[st.tCell, st.tHead, st.tLabel]} />
                <Text style={[st.tCell, st.tHead]} numberOfLines={1}>{homeName}</Text>
                <Text style={[st.tCell, st.tHead]} numberOfLines={1}>{awayName}</Text>
              </View>
              {strokeSummary(v, active).map((r) => (
                <View key={r.cat} style={st.tRow} accessible accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
                  <Text style={[st.tCell, st.tLabel]}>{r.label}</Text>
                  <Text style={[st.tCell, r.home > r.away && st.lead]}>{r.home}</Text>
                  <Text style={[st.tCell, r.away > r.home && st.lead]}>{r.away}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {cur === 'length' && (
          <View style={st.section}>
            <Text style={st.sub}>POINTS WON BY RALLY LENGTH</Text>
            {rallyLengthRows(v, active).map(bar)}
          </View>
        )}

        <Text style={st.note}>
          From the point log · rows show only for the stats this match tracked{v.st.doubles && !v.st.serverKnown ? ' · doubles: the serving player isn’t named, so serve figures are per side' : ''}.
        </Text>
      </View>
    </View>
  );
}

/** One two-sided row: home value · label · away value, with a share bar. */
function StatBar({ r, homeName, awayName, homeColor, awayColor }: { r: ServeRow; homeName: string; awayName: string; homeColor: string; awayColor: string }) {
  const tot = r.hv + r.av;
  const hw = tot > 0 ? r.hv / tot : 0.5;
  return (
    <View style={st.row} accessible accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
      <View style={st.vals}>
        <Text style={[st.val, r.hv > r.av && st.lead]}>{r.home}</Text>
        <Text style={st.label}>{r.label}</Text>
        <Text style={[st.val, st.right, r.av > r.hv && st.lead]}>{r.away}</Text>
      </View>
      <View style={st.bar}>
        <View style={{ flex: hw, backgroundColor: homeColor, opacity: tot > 0 ? 1 : 0.25 }} />
        <View style={{ flex: 1 - hw, backgroundColor: awayColor, opacity: tot > 0 ? 1 : 0.25 }} />
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
