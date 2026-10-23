/**
 * Canoe sprint plugin (SD-100, ICF Canoe Sprint Competition Rules). Like athletics and swimming, a regatta is a
 * programme of EVENTS (K1 500 m Women, C2 1000 m Men …), each raced in lanes as a straight final or
 * through a progression (heats → semi-finals → Finals A / B) on the results engine
 * (data/results/crews.ts, the shared event setup, results and hub screens).
 * The plugin registers the sport and its regatta settings; the match-scoring
 * members are inert placeholders so the generic match screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';
import { CANOE_META } from './meta';

export interface CanoeMatchState { ended: boolean }

const ScoringControls: SportPlugin<CanoeMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🛶 Canoe sprint runs as events</Text>
    <Text style={textStyles.muted}>Set up each race from the tournament’s Canoe sprint page: add the boat (K1 … C4) and distance, the boats and their paddlers and the progression, then enter the finish times race by race.</Text>
  </View>
);

export const canoePlugin: SportPlugin<CanoeMatchState> = {
  ...CANOE_META,
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Canoe sprint event', detailLine: 'Times are entered per race on the event page' }),
  ScoringControls,
  correctable: false,
};
