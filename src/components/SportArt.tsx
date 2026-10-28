/**
 * 2026-10-29 redesign — every sport's tile: its court, pitch, table or board
 * seen from above, in its own colour, drawn in SVG (sharp at any size, and
 * recoloured in one place). `SportTile` adds the name band: "FOOTBALL ⚽".
 * Decorative: the tile's label carries the meaning for screen readers.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Rect, Circle, Line, Path, G, Ellipse } from 'react-native-svg';
import { theme } from '../core/theme';
import type { SportId } from '../core/types';

/** Each sport's tile colour (also its accent wherever the sport is shown). */
export const SPORT_COLORS: Record<string, string> = {
  football: '#3F8F3A', cricket: '#5E9E3A', basketball: '#2F5DC9', badminton: '#2F8F57', tennis: '#3E8E4A',
  volleyball: '#D9902F', kabaddi: '#C2533A', pickleball: '#23807F', padel: '#2E6AAE', squash: '#B98950',
  tabletennis: '#4F86D3', chess: '#6E5236', carrom: '#C4904A', pool: '#1E5FA8', snooker: '#1D6B3A',
  billiards: '#2B7A4B', golf: '#5F9A37', athletics: '#B9432C', hockey: '#2D73BA', swimming: '#2A93C6',
  weightlifting: '#4A4F57', shooting: '#3B4A5C', archery: '#2E7D4F', rowing: '#28749F', canoe: '#1C8494',
  cycling: '#B8722F', handball: '#2F67B8', ice_hockey: '#8FB3C9', netball: '#3A79BC', american_football: '#3C8C3F',
  rugby: '#4B9A3E', rugby_league: '#3F8A45', baseball: '#4F9440',
};
const FALLBACK = theme.colors.primary;

const W = '#FFFFFF';
const lines = { stroke: W, strokeWidth: 1.3, fill: 'none', strokeOpacity: 0.9 } as const;
const stripes = (n: number, color = '#000000', op = 0.07) =>
  Array.from({ length: n }, (_, i) => (i % 2 ? <Rect key={`s${i}`} x={0} y={(100 / n) * i} width={100} height={100 / n} fill={color} opacity={op} /> : null));

/** A rectangular pitch: border, halfway, centre circle. */
const pitch = (extra?: React.ReactNode) => (
  <G {...lines}>
    <Rect x={10} y={6} width={80} height={88} />
    <Line x1={10} y1={50} x2={90} y2={50} />
    <Circle cx={50} cy={50} r={10} />
    {extra}
  </G>
);
const pockets = (inset: number, r: number) => [
  [inset, inset], [100 - inset, inset], [inset, 50], [100 - inset, 50], [inset, 100 - inset], [100 - inset, 100 - inset],
].map(([x, y], i) => <Circle key={`p${i}`} cx={x} cy={y} r={r} fill="#111" />);

function draw(sport: string): React.ReactNode {
  switch (sport) {
    case 'football':
      return <>{stripes(8)}{pitch(<>
        <Rect x={28} y={6} width={44} height={15} /><Rect x={40} y={6} width={20} height={6} />
        <Rect x={28} y={79} width={44} height={15} /><Rect x={40} y={88} width={20} height={6} />
        <Path d="M42 21 A9 9 0 0 0 58 21" /><Path d="M42 79 A9 9 0 0 1 58 79" />
      </>)}</>;
    case 'hockey':
      return pitch(<>
        <Line x1={10} y1={28} x2={90} y2={28} /><Line x1={10} y1={72} x2={90} y2={72} />
        <Path d="M30 6 A20 16 0 0 0 70 6" /><Path d="M30 94 A20 16 0 0 1 70 94" />
      </>);
    case 'handball':
      return <>
        <Path d="M22 6 A28 18 0 0 0 78 6 Z" fill="#E07A3A" opacity={0.85} />
        <Path d="M22 94 A28 18 0 0 1 78 94 Z" fill="#E07A3A" opacity={0.85} />
        {pitch(<><Path d="M16 6 A34 24 0 0 0 84 6" strokeDasharray="3 3" /><Path d="M16 94 A34 24 0 0 1 84 94" strokeDasharray="3 3" /></>)}
      </>;
    case 'rugby':
    case 'rugby_league':
      return <>{stripes(10)}<G {...lines}>
        <Rect x={10} y={6} width={80} height={88} />
        <Line x1={10} y1={14} x2={90} y2={14} /><Line x1={10} y1={86} x2={90} y2={86} />
        <Line x1={10} y1={50} x2={90} y2={50} />
        <Line x1={10} y1={30} x2={90} y2={30} /><Line x1={10} y1={70} x2={90} y2={70} />
        <Line x1={10} y1={41} x2={90} y2={41} strokeDasharray="3 3" /><Line x1={10} y1={59} x2={90} y2={59} strokeDasharray="3 3" />
        <Path d="M45 14 L45 4 M55 14 L55 4 M45 9 L55 9" /><Path d="M45 86 L45 96 M55 86 L55 96 M45 91 L55 91" />
      </G></>;
    case 'american_football':
      return <>
        <Rect x={0} y={0} width={100} height={14} fill="#000" opacity={0.15} />
        <Rect x={0} y={86} width={100} height={14} fill="#000" opacity={0.15} />
        <G {...lines}>
          <Rect x={8} y={4} width={84} height={92} />
          {Array.from({ length: 11 }, (_, i) => <Line key={i} x1={8} y1={14 + i * 7.2} x2={92} y2={14 + i * 7.2} />)}
          {Array.from({ length: 11 }, (_, i) => <G key={`h${i}`}><Line x1={38} y1={17.6 + i * 7.2} x2={40} y2={17.6 + i * 7.2} /><Line x1={60} y1={17.6 + i * 7.2} x2={62} y2={17.6 + i * 7.2} /></G>)}
        </G>
      </>;
    case 'basketball':
      return <>
        <Rect x={36} y={6} width={28} height={26} fill="#D9542B" />
        <Rect x={36} y={68} width={28} height={26} fill="#D9542B" />
        <G {...lines}>
          <Rect x={10} y={6} width={80} height={88} />
          <Line x1={10} y1={50} x2={90} y2={50} /><Circle cx={50} cy={50} r={9} />
          <Rect x={36} y={6} width={28} height={26} /><Circle cx={50} cy={32} r={9} />
          <Path d="M16 6 L16 16 A34 30 0 0 0 84 16 L84 6" />
          <Rect x={36} y={68} width={28} height={26} /><Circle cx={50} cy={68} r={9} />
          <Path d="M16 94 L16 84 A34 30 0 0 1 84 84 L84 94" />
        </G>
      </>;
    case 'netball':
      return <G {...lines}>
        <Rect x={10} y={6} width={80} height={88} />
        <Line x1={10} y1={35} x2={90} y2={35} /><Line x1={10} y1={65} x2={90} y2={65} />
        <Circle cx={50} cy={50} r={4} />
        <Path d="M32 6 A18 16 0 0 0 68 6" /><Path d="M32 94 A18 16 0 0 1 68 94" />
      </G>;
    case 'volleyball':
      return <>
        <Rect x={14} y={10} width={72} height={80} fill="#C26A1F" opacity={0.55} />
        <G {...lines}>
          <Rect x={14} y={10} width={72} height={80} />
          <Line x1={14} y1={37} x2={86} y2={37} /><Line x1={14} y1={63} x2={86} y2={63} />
        </G>
        <Line x1={6} y1={50} x2={94} y2={50} stroke="#1B2A48" strokeWidth={2.6} />
      </>;
    case 'badminton':
      return <G {...lines}>
        <Rect x={14} y={6} width={72} height={88} /><Rect x={19} y={10} width={62} height={80} />
        <Line x1={14} y1={50} x2={86} y2={50} strokeWidth={2.2} />
        <Line x1={14} y1={42} x2={86} y2={42} /><Line x1={14} y1={58} x2={86} y2={58} />
        <Line x1={50} y1={6} x2={50} y2={42} /><Line x1={50} y1={58} x2={50} y2={94} />
      </G>;
    case 'tennis':
      return <>
        <Rect x={16} y={8} width={68} height={84} fill="#2F6E3A" opacity={0.6} />
        <G {...lines}>
          <Rect x={16} y={8} width={68} height={84} /><Line x1={24} y1={8} x2={24} y2={92} /><Line x1={76} y1={8} x2={76} y2={92} />
          <Line x1={24} y1={30} x2={76} y2={30} /><Line x1={24} y1={70} x2={76} y2={70} /><Line x1={50} y1={30} x2={50} y2={70} />
          <Line x1={10} y1={50} x2={90} y2={50} strokeWidth={2.2} />
        </G>
      </>;
    case 'padel':
      return <G {...lines}>
        <Rect x={14} y={6} width={72} height={88} strokeWidth={3.2} strokeOpacity={0.5} />
        <Line x1={14} y1={50} x2={86} y2={50} strokeWidth={2.2} />
        <Line x1={14} y1={28} x2={86} y2={28} /><Line x1={14} y1={72} x2={86} y2={72} />
        <Line x1={50} y1={28} x2={50} y2={72} />
      </G>;
    case 'pickleball':
      return <>
        <Rect x={16} y={38} width={68} height={24} fill="#7FD3B0" opacity={0.45} />
        <G {...lines}>
          <Rect x={16} y={8} width={68} height={84} />
          <Line x1={16} y1={38} x2={84} y2={38} /><Line x1={16} y1={62} x2={84} y2={62} />
          <Line x1={50} y1={8} x2={50} y2={38} /><Line x1={50} y1={62} x2={50} y2={92} />
          <Line x1={10} y1={50} x2={90} y2={50} strokeWidth={2.2} />
        </G>
      </>;
    case 'squash':
      return <>{stripes(14, '#000', 0.05)}<G {...lines} stroke="#B3262C" strokeOpacity={0.95}>
        <Rect x={12} y={6} width={76} height={88} stroke={W} />
        <Line x1={12} y1={56} x2={88} y2={56} /><Line x1={50} y1={56} x2={50} y2={94} />
        <Rect x={12} y={56} width={18} height={18} /><Rect x={70} y={56} width={18} height={18} />
      </G></>;
    case 'kabaddi':
      return <G {...lines}>
        <Rect x={8} y={8} width={84} height={84} />
        <Line x1={16} y1={8} x2={16} y2={92} strokeDasharray="2 2" /><Line x1={84} y1={8} x2={84} y2={92} strokeDasharray="2 2" />
        <Line x1={8} y1={50} x2={92} y2={50} strokeWidth={2.2} />
        <Line x1={16} y1={34} x2={84} y2={34} /><Line x1={16} y1={66} x2={84} y2={66} />
        <Line x1={16} y1={26} x2={84} y2={26} strokeDasharray="4 2" /><Line x1={16} y1={74} x2={84} y2={74} strokeDasharray="4 2" />
      </G>;
    case 'tabletennis':
      return <>
        <Rect x={26} y={14} width={48} height={72} fill="#1E3E8A" rx={1} />
        <G {...lines}>
          <Rect x={26} y={14} width={48} height={72} />
          <Line x1={50} y1={14} x2={50} y2={86} strokeWidth={0.8} />
          <Line x1={20} y1={50} x2={80} y2={50} strokeWidth={2.4} />
        </G>
      </>;
    case 'chess':
      return <>
        <Rect x={10} y={10} width={80} height={80} fill="#3E2C1C" />
        {Array.from({ length: 64 }, (_, i) => {
          const r = Math.floor(i / 8), c = i % 8;
          return (r + c) % 2 === 0 ? <Rect key={i} x={10 + c * 10} y={10 + r * 10} width={10} height={10} fill="#E9D3AE" /> : null;
        })}
      </>;
    case 'carrom':
      return <>
        <Rect x={6} y={6} width={88} height={88} fill="#4A2E1A" />
        <Rect x={12} y={12} width={76} height={76} fill="#E2BC7A" />
        {[[16, 16], [84, 16], [16, 84], [84, 84]].map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={3.6} fill="#1A1A1A" />)}
        <G stroke="#5A3A20" strokeWidth={1} fill="none">
          <Circle cx={50} cy={50} r={11} /><Circle cx={50} cy={50} r={3} fill="#B3262C" />
          <Line x1={24} y1={24} x2={24} y2={76} /><Line x1={76} y1={24} x2={76} y2={76} />
          <Line x1={24} y1={24} x2={76} y2={24} /><Line x1={24} y1={76} x2={76} y2={76} />
        </G>
      </>;
    case 'pool':
    case 'snooker':
    case 'billiards':
      return <>
        <Rect x={10} y={4} width={80} height={92} fill="#5A3416" rx={4} />
        <Rect x={16} y={10} width={68} height={80} fill={SPORT_COLORS[sport]} />
        {pockets(14, 3.4)}
        <G {...lines} strokeWidth={1}>
          <Line x1={16} y1={70} x2={84} y2={70} />
          {sport !== 'pool' ? <Path d="M40 70 A10 10 0 0 0 60 70" /> : null}
        </G>
        {sport === 'snooker' ? [[50, 32], [47.5, 28], [52.5, 28], [45, 24], [50, 24], [55, 24]].map(([x, y], i) => <Circle key={`b${i}`} cx={x} cy={y} r={1.9} fill="#C62828" />) : null}
        {sport === 'pool' ? <Path d="M42 22 L58 22 L50 35 Z" fill="#F2C230" opacity={0.9} /> : null}
        {sport === 'billiards' ? <><Circle cx={46} cy={40} r={2.2} fill="#FFFFFF" /><Circle cx={55} cy={34} r={2.2} fill="#F2C230" /><Circle cx={50} cy={24} r={2.2} fill="#C62828" /></> : null}
        <Circle cx={50} cy={78} r={2.2} fill="#FFFFFF" />
      </>;
    case 'golf':
      return <>
        <Ellipse cx={58} cy={46} rx={30} ry={24} fill="#86C25A" />
        <Ellipse cx={24} cy={76} rx={14} ry={8} fill="#E8D7A8" />
        <Circle cx={60} cy={44} r={2} fill="#111" />
        <Line x1={60} y1={44} x2={60} y2={18} stroke={W} strokeWidth={1.4} />
        <Path d="M60 18 L74 22 L60 26 Z" fill="#D63A2F" />
        <Circle cx={40} cy={66} r={1.6} fill={W} />
      </>;
    case 'athletics':
      return <>
        <Path d="M0 40 L64 40 A40 40 0 0 1 64 120 L0 120 Z" fill="#7FB04D" opacity={0.9} />
        <G {...lines} strokeWidth={1}>
          {[0, 6, 12, 18, 24, 30].map((d, i) => <Path key={i} d={`M0 ${34 - d} L64 ${34 - d} A${46 + d} ${46 + d} 0 0 1 ${110 + d} 80`} />)}
        </G>
      </>;
    case 'swimming':
      return <>
        {[20, 40, 60, 80].map((x) => <Line key={`t${x}`} x1={x - 10} y1={12} x2={x - 10} y2={88} stroke="#14324A" strokeWidth={2} opacity={0.35} />)}
        {[20, 40, 60, 80].map((x, i) => <Line key={x} x1={x} y1={0} x2={x} y2={100} stroke={i % 2 ? '#F2C230' : '#D63A2F'} strokeWidth={2.2} strokeDasharray="3 2" />)}
        <Rect x={0} y={0} width={100} height={6} fill={W} opacity={0.5} />
      </>;
    case 'weightlifting':
      return <>
        <Rect x={14} y={14} width={72} height={72} fill="#2E3238" />
        <Rect x={30} y={14} width={40} height={72} fill="#B5895A" />
        <Line x1={12} y1={50} x2={88} y2={50} stroke="#D0D4DA" strokeWidth={2.4} />
        {[18, 23, 77, 82].map((x) => <Rect key={x} x={x - 2} y={38} width={4} height={24} rx={1} fill={x < 50 ? '#D63A2F' : '#2F6FD1'} />)}
      </>;
    case 'shooting':
      return <G>
        <Circle cx={50} cy={46} r={34} fill="#F1EFE8" />
        {[28, 22, 16, 10].map((r, i) => <Circle key={r} cx={50} cy={46} r={r} fill={i >= 2 ? '#14181D' : 'none'} stroke="#14181D" strokeWidth={1} />)}
        <Circle cx={50} cy={46} r={3} fill="#F1EFE8" />
      </G>;
    case 'archery':
      return <G>
        {[['#F1EFE8', 34], ['#14181D', 28], ['#2F6FD1', 22], ['#D63A2F', 15], ['#F2C230', 8]].map(([c, r]) => <Circle key={String(r)} cx={50} cy={46} r={Number(r)} fill={String(c)} />)}
        <Line x1={50} y1={46} x2={82} y2={22} stroke="#5A3416" strokeWidth={1.6} />
      </G>;
    case 'rowing':
      return <>
        {[18, 38, 58, 78].map((x) => <Line key={x} x1={x} y1={0} x2={x} y2={100} stroke={W} strokeWidth={1.6} strokeDasharray="1.5 4" strokeLinecap="round" />)}
        <Path d="M28 30 L30 22 L32 30 L31 62 L29 62 Z" fill="#F1EFE8" />
        <Path d="M48 44 L50 36 L52 44 L51 76 L49 76 Z" fill="#F2C230" />
        <Path d="M68 24 L70 16 L72 24 L71 56 L69 56 Z" fill="#F1EFE8" />
      </>;
    case 'canoe':
      return <>
        {[30, 50, 70].map((y) => <Path key={y} d={`M0 ${y} Q25 ${y - 6} 50 ${y} T100 ${y}`} stroke={W} strokeOpacity={0.5} strokeWidth={1.2} fill="none" />)}
        <Line x1={30} y1={16} x2={30} y2={40} stroke="#2E9D4F" strokeWidth={2.4} /><Line x1={50} y1={16} x2={50} y2={40} stroke="#2E9D4F" strokeWidth={2.4} />
        <Line x1={56} y1={54} x2={56} y2={78} stroke="#D63A2F" strokeWidth={2.4} /><Line x1={76} y1={54} x2={76} y2={78} stroke="#D63A2F" strokeWidth={2.4} />
        <Line x1={26} y1={16} x2={54} y2={16} stroke={W} strokeWidth={1} /><Line x1={52} y1={54} x2={80} y2={54} stroke={W} strokeWidth={1} />
      </>;
    case 'cycling':
      return <>
        <Rect x={8} y={14} width={84} height={72} rx={36} fill="#9C5C22" />
        <Rect x={16} y={22} width={68} height={56} rx={28} fill="#2F6FD1" opacity={0.85} />
        <Rect x={22} y={28} width={56} height={44} rx={22} fill="#3C8C3F" />
        <G fill="none" strokeWidth={1.2}>
          <Rect x={13} y={19} width={74} height={62} rx={31} stroke="#D63A2F" />
          <Rect x={11} y={17} width={78} height={66} rx={33} stroke={W} strokeOpacity={0.7} />
        </G>
      </>;
    case 'ice_hockey':
      return <>
        <Rect x={10} y={6} width={80} height={88} rx={16} fill="#EEF4F8" stroke="#3B4A5C" strokeWidth={1.6} />
        <Line x1={10} y1={50} x2={90} y2={50} stroke="#C62828" strokeWidth={2.2} />
        <Line x1={10} y1={35} x2={90} y2={35} stroke="#2F6FD1" strokeWidth={2.2} /><Line x1={10} y1={65} x2={90} y2={65} stroke="#2F6FD1" strokeWidth={2.2} />
        <Line x1={10} y1={14} x2={90} y2={14} stroke="#C62828" strokeWidth={0.9} /><Line x1={10} y1={86} x2={90} y2={86} stroke="#C62828" strokeWidth={0.9} />
        {[[30, 24], [70, 24], [30, 76], [70, 76]].map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={7} stroke="#C62828" strokeWidth={0.9} fill="none" />)}
        <Circle cx={50} cy={50} r={8} stroke="#2F6FD1" strokeWidth={0.9} fill="none" />
        <Path d="M44 14 A6 5 0 0 0 56 14 Z" fill="#7FB3E8" /><Path d="M44 86 A6 5 0 0 1 56 86 Z" fill="#7FB3E8" />
      </>;
    case 'baseball':
      return <>{stripes(10)}
        <Path d="M50 88 L20 58 L50 28 L80 58 Z" fill="#C98C55" />
        <Path d="M50 82 L28 60 L50 38 L72 60 Z" fill="#5C9E43" />
        <G {...lines}><Line x1={50} y1={88} x2={2} y2={40} /><Line x1={50} y1={88} x2={98} y2={40} /><Path d="M6 40 A62 62 0 0 1 94 40" /></G>
        <Circle cx={50} cy={60} r={4} fill="#C98C55" />
        {[[50, 86], [24, 60], [50, 34], [76, 60]].map(([x, y], i) => <Rect key={i} x={x - 2} y={y - 2} width={4} height={4} fill={W} transform={`rotate(45 ${x} ${y})`} />)}
      </>;
    case 'cricket':
      return <>
        <Circle cx={50} cy={50} r={46} fill="#4C8A2E" />
        <Circle cx={50} cy={50} r={46} {...lines} />
        <Circle cx={50} cy={50} r={26} {...lines} strokeDasharray="3 3" />
        <Rect x={45} y={36} width={10} height={28} fill="#D9C08A" />
        <G {...lines} strokeWidth={0.9}><Line x1={44} y1={40} x2={56} y2={40} /><Line x1={44} y1={60} x2={56} y2={60} /></G>
      </>;
    default:
      return pitch();
  }
}

export function SportArt({ sport, style }: { sport: SportId | string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: SPORT_COLORS[sport] ?? FALLBACK, overflow: 'hidden' }, style]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">{draw(sport)}</Svg>
    </View>
  );
}

/** A sport's tile: the art, with its name on a band at the foot. */
export function SportTile({ sport, name, icon, onPress, width, height, accessibilityHint }: {
  sport: SportId | string;
  name: string;
  icon?: string;
  onPress?: () => void;
  width: number;
  height: number;
  accessibilityHint?: string;
}) {
  const body = (
    <View style={[st.tile, { width, height }]}>
      <SportArt sport={sport} style={StyleSheet.absoluteFill} />
      <View style={st.band}>
        <Text style={[st.name, name.length > 12 && width < 140 && st.nameLong]} numberOfLines={2}>{name}</Text>
        {icon && width >= 140 ? <Text style={st.icon}>{icon}</Text> : null}
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={name} accessibilityHint={accessibilityHint}>
      {body}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  tile: { borderRadius: theme.radius.lg - 6, overflow: 'hidden', backgroundColor: theme.colors.primary, ...theme.shadow.card },
  band: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1),
    paddingHorizontal: theme.spacing(2.5), paddingVertical: theme.spacing(2), backgroundColor: 'rgba(0,0,0,0.32)',
  },
  name: { flex: 1, color: '#FFFFFF', fontFamily: theme.fonts.heading, fontSize: 16, letterSpacing: 0.3, textTransform: 'uppercase' },
  nameLong: { fontSize: 13, lineHeight: 14 },
  icon: { fontSize: 14 },
});
