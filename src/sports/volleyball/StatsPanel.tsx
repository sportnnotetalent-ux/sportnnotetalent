/**
 * Deep wave (volleyball-kabaddi) — volleyball's match stats card (FIVB VIS
 * depth): Match / Set N filter, category chips, team-vs-team rows
 * (matchStats.ts), then rotation analysis (points won with each player at
 * position I: side-out % / break-point %) and the by-server line when the
 * toss and rotation are recorded.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { CompareCard } from '../netraid/CompareCard';
import { volleyballMatchStats, type VbScope, type VbRotationRow } from './matchStats';
import type { VolleyballState } from './engine';
import { useMask } from '../../core/disputeMask';

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : '–');

export function VolleyballStatsPanel({ state, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away }: {
  state: VolleyballState; homeName: string; awayName: string; homeColor?: string; awayColor?: string;
}) {
  const [scope, setScope] = useState<VbScope>('all');
  const sets = state.ended ? state.sets.length : state.setsWon.home + state.setsWon.away + 1;
  const active: VbScope = scope !== 'all' && scope > sets ? 'all' : scope;
  const st0 = useMemo(() => volleyballMatchStats(state, active), [state, active]);
  // IDs-only scoring: players by id for this viewer (an older stamp's name as the fallback)
  const { nameOf } = useMask();
  if (st0.rallies === 0 && active === 'all') return null;
  const scopes = [{ value: 'all' as const, label: 'Match' }, ...Array.from({ length: sets }, (_, i) => ({ value: i + 1, label: `Set ${i + 1}` }))];
  const rot = (side: 'home' | 'away', rows: VbRotationRow[]) => (
    <View key={side} style={{ gap: 2 }}>
      <View style={s.rotHead}>
        <View style={[s.dot, { backgroundColor: side === 'home' ? homeColor : awayColor }]} />
        <Text style={s.rotTitle} numberOfLines={1}>{side === 'home' ? homeName : awayName}</Text>
        <Text style={s.rotCol}>W-L</Text><Text style={s.rotCol}>Break</Text><Text style={s.rotCol}>Side-out</Text>
      </View>
      {rows.map((r) => (
        <View key={r.id} style={s.rotRow} accessible accessibilityLabel={`${nameOf(r.id, r.name)} at position one: won ${r.won} of ${r.played}; on serve ${r.srvWon} of ${r.srvPlayed}; on receive ${r.rcvWon} of ${r.rcvPlayed}`}>
          <Text style={s.rotName} numberOfLines={1}>{nameOf(r.id, r.name)} at I</Text>
          <Text style={s.rotCol}>{r.won}-{r.played - r.won}</Text>
          <Text style={s.rotCol}>{pct(r.srvWon, r.srvPlayed)}</Text>
          <Text style={s.rotCol}>{pct(r.rcvWon, r.rcvPlayed)}</Text>
        </View>
      ))}
    </View>
  );
  const sides = (['home', 'away'] as const).filter((x) => st0.rotations[x]?.length);
  return (
    <CompareCard
      homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
      scopes={scopes} scope={active} onScope={setScope} cats={st0.cats}
      footer={`From the point log${sides.length ? ' · serve order from the toss and rotation' : ''}. Rows show only what this match captured.`}
    >
      {sides.length > 0 && (
        <View style={{ gap: theme.spacing(2), marginTop: theme.spacing(1) }} accessibilityLabel="Rotation analysis">
          <Text style={s.sub}>ROTATION ANALYSIS · player at position I (break = won on serve, side-out = won on receive)</Text>
          {sides.map((x) => rot(x, st0.rotations[x]!))}
        </View>
      )}
      {st0.servers.length > 0 && (
        <View style={{ gap: 2, marginTop: theme.spacing(1) }} accessibilityLabel="By server">
          <Text style={s.sub}>BY SERVER · serves, won on serve, aces, errors</Text>
          {st0.servers.map((x) => (
            <View key={x.id} style={s.rotRow}>
              <View style={[s.dot, { backgroundColor: x.side === 'home' ? homeColor : awayColor }]} />
              <Text style={s.rotName} numberOfLines={1}>{nameOf(x.id, x.name)}</Text>
              <Text style={s.srvVal}>{x.serves} · {x.won} ({pct(x.won, x.serves)}) · {x.aces} A · {x.errors} SE</Text>
            </View>
          ))}
        </View>
      )}
    </CompareCard>
  );
}

const s = StyleSheet.create({
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rotHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5) },
  rotTitle: { flex: 1, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  rotRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5), paddingVertical: 1 },
  rotName: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  rotCol: { width: 58, textAlign: 'right', color: theme.colors.text, fontSize: theme.font.tiny, fontVariant: ['tabular-nums'] },
  srvVal: { color: theme.colors.text, fontSize: theme.font.tiny, fontVariant: ['tabular-nums'] },
});
