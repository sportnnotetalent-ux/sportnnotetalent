/**
 * SD-22 — the per-game match-stats panel of badminton, table tennis, squash,
 * padel and pickleball (tennis has its own, tennis/StatsPanel.tsx).
 *
 * Deep wave (racket) — at broadcast depth (BWF, ITTF / WTT, PSA SquashTV,
 * Premier Padel, PPA), as tennis' SD-157 panel: a Match / Game N (padel:
 * Set N) filter and category tabs —
 *   Key stats     Serve · Winners & errors · Referee decisions (squash) ·
 *                 Points won · Games / game & match points
 *   Serve         the SD-22 serve / receive rows + each named server's line
 *   Shots         winners / unforced / forced errors by shot, either wing or
 *                 forehand / backhand; the stroke summary; errors and
 *                 service faults by type (point detail)
 *   Rally length  points won per bucket, on serve / on receive; table tennis
 *                 the three phases (rally length)
 *   3rd shot      pickleball drop / drive / lob (3rd shot)
 * Tabs and rows appear only for what the match tracked (D8). Every figure is
 * replayed from the point log (racketMatchStats.ts) — old and corrected
 * matches included. Round 2: rally length follows the match's bucket scheme
 * (table tennis: three or four phases); pickleball's Key stats add kitchen
 * arrival (overall / serving / returning) once a rally was marked "Nobody".
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import { playerServeLine, type ServeRow } from './serveStats';
import type { DepthSport } from './pointDetail';
import { useMask } from '../core/disputeMask';
import {
  HOW_SELS, WING_SELS, blockOf, errorTypeRows, keyStats, phaseRows, racketView, rallyLengthRows, serveTabRows, shotRows, strokeSummary, thirdShotRows,
  type HowSel, type Scope, type WingSel,
} from './racketMatchStats';

type Tab = 'key' | 'serve' | 'shots' | 'rally' | 'third';

export function MatchStatsPanel({
  sport, state, homeName, awayName, homeRoster = [], awayRoster = [],
  homeColor = theme.colors.home, awayColor = theme.colors.away,
}: {
  sport: DepthSport;
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
  // Re-derived when the state (log) or the roster that names the server changes.
  const v = useMemo(
    () => racketView(sport, state, { home: hIds ? hIds.split(',') : [], away: aIds ? aIds.split(',') : [] }),
    [sport, state, hIds, aIds],
  );
  const [scope, setScope] = useState<Scope>('all');
  const [tab, setTab] = useState<Tab>('key');
  const [how, setHow] = useState<HowSel>('winner');
  const [wing, setWing] = useState<WingSel>('all');
  // IDs-only scoring: servers by id for this viewer (the squad's name as the fallback)
  const mask = useMask();
  if (!v || v.st.match.rallies === 0) return null;
  const periods = v.st.periods.length;
  const active: Scope = scope !== 'all' && scope > periods ? 'all' : scope;
  const block = blockOf(v, active);
  const word = v.st.unit === 'set' ? 'Set' : 'Game';
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'key', label: 'Key stats' },
    { key: 'serve', label: 'Serve' },
    ...(v.cov.detail === 'full' ? [{ key: 'shots' as const, label: 'Shots' }] : []),
    ...(v.cov.rally ? [{ key: 'rally' as const, label: sport === 'tabletennis' ? 'Rally phases' : 'Rally length' }] : []),
    ...(v.cov.third ? [{ key: 'third' as const, label: '3rd shot' }] : []),
  ];
  const cur: Tab = tabs.some((t) => t.key === tab) ? tab : 'key';
  const nameOf = (id: string) => mask.nameOf(id, [...homeRoster, ...awayRoster].find((p) => p.id === id)?.fullName);
  const players = block ? Object.entries(block.players).filter(([, p]) => p.srvPlayed > 0)
    .sort(([, x], [, y]) => (x.side === y.side ? 0 : x.side === 'home' ? -1 : 1)) : [];
  const bar = (r: ServeRow) => <StatBar key={r.key} r={r} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />;
  const shots = cur === 'shots' ? shotRows(v, active, how, wing) : [];
  const types = cur === 'shots' ? errorTypeRows(v, active) : [];

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
            {v.st.periods.map((_, i) => <SelectChip key={i} label={`${word} ${i + 1}`} active={active === i + 1} onPress={() => setScope(i + 1)} />)}
          </View>
        )}
        {tabs.length > 1 && (
          <View style={st.chips}>
            {tabs.map((t) => <SelectChip key={t.key} label={t.label} active={cur === t.key} onPress={() => setTab(t.key)} />)}
          </View>
        )}

        {cur === 'key' && keyStats(v, active).map((sec) => (
          <View key={sec.id} style={st.section} accessibilityLabel={sec.title}>
            <Text style={st.sub}>{sec.title.toUpperCase()}</Text>
            {sec.rows.map(bar)}
          </View>
        ))}

        {cur === 'serve' && (
          <View style={st.section}>
            {serveTabRows(v, active).map(bar)}
            {players.length > 0 && v.st.doubles && (
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
          </View>
        )}

        {cur === 'shots' && (
          <View style={st.section}>
            <View style={st.chips}>
              {HOW_SELS.map((h) => <SelectChip key={h.how} label={h.label} active={how === h.how} onPress={() => setHow(h.how)} />)}
            </View>
            <View style={st.chips}>
              {WING_SELS.map((w) => <SelectChip key={w.wing} label={w.label} active={wing === w.wing} onPress={() => setWing(w.wing)} />)}
            </View>
            {shots.filter((r, i) => i === 0 || r.hv + r.av > 0).map(bar)}
            {shots.length > 1 && shots.slice(1).every((r) => r.hv + r.av === 0) && (
              <Text style={st.note}>No shot described for these yet.</Text>
            )}
            <Text style={[st.sub, { marginTop: theme.spacing(2) }]}>STROKE SUMMARY</Text>
            <View style={st.table} accessibilityLabel="Stroke summary">
              <View style={st.tRow}>
                <Text style={[st.tCell, st.tHead, st.tLabel]} />
                <Text style={[st.tCell, st.tHead]} numberOfLines={1}>{homeName}</Text>
                <Text style={[st.tCell, st.tHead]} numberOfLines={1}>{awayName}</Text>
              </View>
              {strokeSummary(v, active).map((r) => (
                <View key={r.key} style={st.tRow} accessible accessibilityLabel={`${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`}>
                  <Text style={[st.tCell, st.tLabel]}>{r.label}</Text>
                  <Text style={[st.tCell, r.home > r.away && st.lead]}>{r.home}</Text>
                  <Text style={[st.tCell, r.away > r.home && st.lead]}>{r.away}</Text>
                </View>
              ))}
            </View>
            {types.length > 0 && (
              <>
                <Text style={[st.sub, { marginTop: theme.spacing(2) }]}>ERRORS BY TYPE</Text>
                {types.map(bar)}
              </>
            )}
          </View>
        )}

        {cur === 'rally' && (
          <View style={st.section}>
            <Text style={st.sub}>{sport === 'tabletennis' ? 'POINTS WON BY PHASE (SHOTS IN THE RALLY)' : 'POINTS WON BY RALLY LENGTH'}</Text>
            {rallyLengthRows(v, active).map(bar)}
            <Text style={[st.sub, { marginTop: theme.spacing(2) }]}>
              {sport !== 'tabletennis' ? 'ON SERVE / ON RECEIVE' : v.buckets.includes('7+') ? 'FOUR-PHASE ANALYSIS' : 'THREE-PHASE ANALYSIS'}
            </Text>
            {phaseRows(v, active).map(bar)}
          </View>
        )}

        {cur === 'third' && (
          <View style={st.section}>
            <Text style={st.sub}>THE SERVING TEAM’S 3RD SHOT</Text>
            {thirdShotRows(v, active).map(bar)}
          </View>
        )}

        <Text style={st.note}>
          From the point log · rows show only for the stats this match tracked{v.st.doubles && !v.st.serverKnown ? ' · doubles: the serving player isn’t named here, so serve figures are per side' : ''}.
        </Text>
      </View>
    </View>
  );
}

/** One two-sided row: home value · label · away value, with a share bar. */
export function StatBar({ r, homeName, awayName, homeColor, awayColor }: { r: ServeRow; homeName: string; awayName: string; homeColor: string; awayColor: string }) {
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
