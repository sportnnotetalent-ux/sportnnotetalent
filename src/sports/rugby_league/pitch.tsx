/** Rugby league's field (shared CourtMap) and one side's line-up by shirt
 *  number: 13s (1 fullback, 2–5 wingers and centres, 6 five-eighth /
 *  stand-off, 7 halfback / scrum-half, 8 & 10 props, 9 hooker, 11–12 second
 *  row, 13 lock / loose forward) and Nines.
 *  x: 0 left → 1 right; y: 0 own try line → 1 halfway. */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CourtMap, COURT_LINE, type CourtProps } from '../../components/CourtMap';
import type { LineupSlot } from '../../core/types';

type Slot = Omit<LineupSlot, 'playerId' | 'playerName'>;

const THIRTEEN: Slot[] = [
  { position: '1 FB', x: 0.5, y: 0.14 },
  { position: '2 W', x: 0.92, y: 0.36 }, { position: '3 C', x: 0.72, y: 0.42 }, { position: '4 C', x: 0.28, y: 0.42 }, { position: '5 W', x: 0.08, y: 0.36 },
  { position: '6 FE', x: 0.4, y: 0.54 }, { position: '7 HB', x: 0.58, y: 0.6 },
  { position: '8 P', x: 0.36, y: 0.84 }, { position: '9 HK', x: 0.5, y: 0.8 }, { position: '10 P', x: 0.64, y: 0.84 },
  { position: '11 SR', x: 0.22, y: 0.74 }, { position: '12 SR', x: 0.78, y: 0.74 }, { position: '13 L', x: 0.5, y: 0.68 },
];
const NINE: Slot[] = [
  { position: '1 FB', x: 0.5, y: 0.16 },
  { position: '2 W', x: 0.9, y: 0.36 }, { position: '3 C', x: 0.62, y: 0.44 }, { position: '4 W', x: 0.1, y: 0.36 },
  { position: '5 FE', x: 0.38, y: 0.54 }, { position: '6 HB', x: 0.56, y: 0.6 },
  { position: '7 P', x: 0.36, y: 0.82 }, { position: '8 HK', x: 0.5, y: 0.78 }, { position: '9 L', x: 0.64, y: 0.82 },
];

export function leagueFormation(perSide = 13): LineupSlot[] {
  const base = perSide <= 9 ? NINE : THIRTEEN;
  return base.slice(0, Math.max(1, Math.min(base.length, perSide))).map((s) => ({ ...s }));
}

export const LeaguePitch: React.FC<CourtProps> = (props) => (
  <CourtMap {...props} surfaceColor="#2f7d32" aspectRatio={0.66}>
    <View style={m.half} />
    <View style={[m.line, { top: '20%' }]} />
    <View style={[m.line, { bottom: '20%' }]} />
    <View style={[m.dash, { top: '40%' }]} />
    <View style={[m.dash, { bottom: '40%' }]} />
  </CourtMap>
);

const m = StyleSheet.create({
  half: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE },
  // the 20 m lines and (dashed) 40 m lines
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COURT_LINE, opacity: 0.7 },
  dash: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1, borderColor: COURT_LINE, borderStyle: 'dashed', opacity: 0.5 },
});
