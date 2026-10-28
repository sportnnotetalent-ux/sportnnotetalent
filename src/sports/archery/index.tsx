/**
 * Archery plugin (SD-95, World Archery rules). Like athletics, swimming,
 * weightlifting and shooting, a meet is a programme of EVENTS — Recurve 70 m
 * U21 Men, Compound 50 m Women … — each a ranking round on the results engine
 * (data/results/archery.ts) and, optionally, a seeded match-play bracket with a
 * bronze medal match. The plugin registers the sport and its meet settings;
 * the match-scoring members are inert placeholders so the generic match
 * screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';
import { ARCHERY_META } from './meta';

export interface ArcheryMatchState { ended: boolean }

const ScoringControls: SportPlugin<ArcheryMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>Archery runs as events</Text>
    <Text style={textStyles.muted}>Set up each event from the tournament’s Archery page: add the archers, enter each end of the ranking round, then shoot the match-play bracket.</Text>
  </View>
);

export const archeryPlugin: SportPlugin<ArcheryMatchState> = {
  ...ARCHERY_META,
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Archery event', detailLine: 'Scores are entered on the event page' }),
  ScoringControls,
  correctable: false,
};
