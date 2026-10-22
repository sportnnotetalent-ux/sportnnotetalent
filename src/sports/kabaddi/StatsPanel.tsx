/**
 * Deep wave (volleyball-kabaddi) — kabaddi's match centre card (PKL depth):
 * Match / 1st half / 2nd half (/ extra time) filter, category chips, team-vs-
 * team rows (matchStats.ts), then each team's top raider and top defender.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { CompareCard } from '../netraid/CompareCard';
import { kabaddiMatchStats, type KbScope } from './matchStats';
import type { KabaddiState } from './engine';

const PERIOD = (h: number) => (h === 1 ? '1st half' : h === 2 ? '2nd half' : h === 3 ? 'ET 1' : 'ET 2');

export function KabaddiStatsPanel({ state, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away }: {
  state: KabaddiState; homeName: string; awayName: string; homeColor?: string; awayColor?: string;
}) {
  const [scope, setScope] = useState<KbScope>('all');
  const halves = Math.max(1, state.half ?? 1);
  const active: KbScope = scope !== 'all' && scope > halves ? 'all' : scope;
  const st0 = useMemo(() => kabaddiMatchStats(state, active), [state, active]);
  if (st0.moments === 0 && active === 'all') return null;
  const scopes = [{ value: 'all' as const, label: 'Match' }, ...Array.from({ length: halves }, (_, i) => ({ value: i + 1, label: PERIOD(i + 1) }))];
  const leaderLine = (side: 'home' | 'away') => {
    const l = st0.leaders[side];
    const bits = [
      l.raider ? `🤼 ${l.raider.name} ${l.raider.pts} raid pts${l.raider.note ? ` (${l.raider.note})` : ''}` : null,
      l.defender ? `🛡️ ${l.defender.name} ${l.defender.pts} tackle pts${l.defender.note ? ` (${l.defender.note})` : ''}` : null,
    ].filter(Boolean);
    if (!bits.length) return null;
    return (
      <View key={side} style={s.leadRow}>
        <View style={[s.dot, { backgroundColor: side === 'home' ? homeColor : awayColor }]} />
        <Text style={s.leadText}>{side === 'home' ? homeName : awayName}: {bits.join(' · ')}</Text>
      </View>
    );
  };
  const lines = (['home', 'away'] as const).map(leaderLine).filter(Boolean);
  return (
    <CompareCard
      title="Match centre" homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
      scopes={scopes} scope={active} onScope={setScope} cats={st0.cats}
      footer="From the raid log — corrections re-derive it. Shootout raids stay out (PKL)."
    >
      {lines.length > 0 && (
        <View style={{ gap: 2, marginTop: theme.spacing(1) }} accessibilityLabel="Top performers">
          <Text style={s.sub}>TOP PERFORMERS</Text>
          {lines}
        </View>
      )}
    </CompareCard>
  );
}

const s = StyleSheet.create({
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  leadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(1.5) },
  leadText: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});
