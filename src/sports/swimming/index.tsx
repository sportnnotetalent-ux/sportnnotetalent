/**
 * Swimming plugin (SD-94, World Aquatics Swimming Rules). Like athletics, a
 * swim meet is a programme of EVENTS (50 m freestyle U12 Girls, 4 × 50 m
 * medley relay U14 Boys …), each swum as a straight / timed final or heats →
 * (semi-finals →) final on the results engine (data/results/swimming.ts,
 * the shared measured-event setup, results and hub screens). The plugin
 * registers the sport and its meet settings; the match-scoring members are
 * inert placeholders so the generic match screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';
import { SWIMMING_META } from './meta';

export interface SwimmingMatchState { ended: boolean }

const ScoringControls: SportPlugin<SwimmingMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🏊 Swimming runs as events</Text>
    <Text style={textStyles.muted}>Set up each race from the tournament’s Swimming page: add the event, its swimmers and rounds, then enter times heat by heat.</Text>
  </View>
);

export const swimmingPlugin: SportPlugin<SwimmingMatchState> = {
  ...SWIMMING_META,
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Swimming event', detailLine: 'Results are entered per heat on the event page' }),
  ScoringControls,
  correctable: false,
};
