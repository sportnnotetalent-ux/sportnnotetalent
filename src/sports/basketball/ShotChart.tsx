/**
 * Deep wave — the team shot chart by zone (NBA.com / FIBA LiveStats): a
 * schematic half court split into the paint, mid-range, the corner 3s and
 * the 3 above the break, each shaded by that team's FG% there (when misses
 * were tracked) and labelled made / attempted. Only charted shots count
 * (plays logged with "Shot zones" on); a list under it says the same in
 * words for screen readers and the web.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import { SHOT_ZONES, zoneLabel, type ShotZone } from './events';
import { bbCoverage, bbTeamFigures, type BbScope } from './deep';
import type { BasketballState } from './engine';

const W = 300, H = 210;
const BX = 150, BY = 26, R3 = 120;
// the corner 3 lines meet the arc at the break (x = 40 / 260)
const BREAK_Y = BY + Math.sqrt(R3 * R3 - 110 * 110);
const INSIDE = `M 40 0 L 40 ${BREAK_Y.toFixed(1)} A ${R3} ${R3} 0 0 0 260 ${BREAK_Y.toFixed(1)} L 260 0 Z`;

/** Fill for a zone: muted when nothing was taken, else the team colour with
 *  opacity by FG% (or by volume when misses weren't tracked). */
function shade(made: number, att: number, tracked: boolean, maxMade: number): number {
  if (!att) return 0.08;
  const v = tracked ? made / att : maxMade > 0 ? made / maxMade : 0;
  return 0.15 + 0.7 * Math.max(0, Math.min(1, v));
}

export function ShotChart({ state, scope = 'all', homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away }: {
  state: BasketballState; scope?: BbScope; homeName: string; awayName: string; homeColor?: string; awayColor?: string;
}) {
  const [side, setSide] = useState<'home' | 'away'>('home');
  const cov = bbCoverage(state);
  if (!cov.zones.charted) return null;
  const halfCourt = state.targetPoints > 0;
  const z = bbTeamFigures(state, side, scope).zones;
  const color = side === 'home' ? homeColor : awayColor;
  const maxMade = Math.max(...SHOT_ZONES.map((k) => z[k].made));
  const text = (k: ShotZone) => (z[k].att ? (cov.shots ? `${z[k].made}/${z[k].att}` : `${z[k].made} made`) : '–');
  const pct = (k: ShotZone) => (cov.shots && z[k].att ? `${Math.round((z[k].made / z[k].att) * 100)}%` : '');
  const op = (k: ShotZone) => shade(z[k].made, z[k].att, cov.shots, maxMade);
  const label = (k: ShotZone, x: number, y: number, small = false) => (
    <>
      <SvgText x={x} y={y} fill={theme.colors.text} fontSize={small ? 10 : 13} fontWeight="800" textAnchor="middle">{small && !cov.shots ? String(z[k].made) : text(k)}</SvgText>
      {pct(k) ? <SvgText x={x} y={y + (small ? 12 : 15)} fill={theme.colors.text} fontSize={small ? 9 : 11} textAnchor="middle">{pct(k)}</SvgText> : null}
    </>
  );
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={st.title}>Shot chart</Text>
      <View style={st.chips}>
        <SelectChip label={homeName} active={side === 'home'} dotColor={homeColor} onPress={() => setSide('home')} />
        <SelectChip label={awayName} active={side === 'away'} dotColor={awayColor} onPress={() => setSide('away')} />
      </View>
      <View style={st.court} accessibilityLabel={`${side === 'home' ? homeName : awayName} shot chart`}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* above the break: the whole court, then the rest drawn over it */}
          <Rect x={0} y={0} width={W} height={H} fill={color} fillOpacity={op('ab3')} />
          <Rect x={0} y={0} width={40} height={BREAK_Y} fill={color} fillOpacity={op('c3')} />
          <Rect x={260} y={0} width={40} height={BREAK_Y} fill={color} fillOpacity={op('c3')} />
          <Path d={INSIDE} fill={theme.colors.surface} />
          <Path d={INSIDE} fill={color} fillOpacity={op('mid')} stroke={theme.colors.textMuted} strokeWidth={1.5} />
          <Rect x={105} y={0} width={90} height={110} fill={theme.colors.surface} />
          <Rect x={105} y={0} width={90} height={110} fill={color} fillOpacity={op('paint')} stroke={theme.colors.textMuted} strokeWidth={1.5} />
          <Circle cx={BX} cy={BY} r={6} fill="none" stroke={theme.colors.accent} strokeWidth={2} />
          <Rect x={0} y={0} width={W} height={H} fill="none" stroke={theme.colors.textMuted} strokeWidth={1.5} />
          {label('paint', 150, 72)}
          {label('mid', 72, 70)}
          {label('c3', 20, 26, true)}
          {label('c3', 280, 26, true)}
          {label('ab3', 150, 182)}
        </Svg>
      </View>
      {SHOT_ZONES.map((k) => (
        <Text key={k} style={st.line}>{zoneLabel(k, halfCourt)}: {text(k)}{pct(k) ? ` · ${pct(k)}` : ''}</Text>
      ))}
      <Text style={st.note}>Charted shots only{cov.zones.charted < cov.zones.of ? ` (${cov.zones.charted} of ${cov.zones.of} field goals)` : ''}. Both corners count together.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', marginTop: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  court: { borderRadius: theme.radius.sm, overflow: 'hidden', backgroundColor: theme.colors.surface },
  line: { color: theme.colors.text, fontSize: theme.font.small },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
