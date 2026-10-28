/**
 * Rowing plugin (SD-99, World Rowing Rules of Racing). Like athletics and swimming, a regatta is a
 * programme of EVENTS (Men’s 1x 2000 m, U16 Girls 4x 1000 m …), each raced in lanes as a straight final or
 * through a progression (heats → repechage → semi-finals → Finals A / B) on the results engine
 * (data/results/crews.ts, the shared event setup, results and hub screens).
 * The plugin registers the sport and its regatta settings; the match-scoring
 * members are inert placeholders so the generic match screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';
import { ROWING_META } from './meta';

export interface RowingMatchState { ended: boolean }

const ScoringControls: SportPlugin<RowingMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>Rowing runs as events</Text>
    <Text style={textStyles.muted}>Set up each race from the tournament’s Rowing page: add the boat class, the crews (seat by seat, with the cox) and the progression, then enter the finish times race by race.</Text>
  </View>
);

export const rowingPlugin: SportPlugin<RowingMatchState> = {
  ...ROWING_META,
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Rowing event', detailLine: 'Times are entered per race on the event page' }),
  ScoringControls,
  correctable: false,
};
