/**
 * Athletics plugin (SD-90: track). Athletics isn't a head-to-head match: a
 * meet is a programme of EVENTS (100 m U14 Boys, 4 × 100 m U14 Girls …), each
 * run as heats → (semi-finals →) final on the results engine
 * (data/results/*, screens/AthleticsEventSetupScreen + ResultsEventScreen).
 * The plugin registers the sport (picker, hub, profile, stat schema) and its
 * meet settings; the match-scoring members are inert placeholders so the
 * generic match screens never break if an athletics "match" is opened.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';
import { ATHLETICS_META } from './meta';

export interface AthleticsMatchState { ended: boolean }

const ScoringControls: SportPlugin<AthleticsMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>Athletics runs as events</Text>
    <Text style={textStyles.muted}>Set up each race from the tournament’s Athletics page: add the event, its entrants and rounds, then enter times heat by heat.</Text>
  </View>
);

export const athleticsPlugin: SportPlugin<AthleticsMatchState> = {
  ...ATHLETICS_META,
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Athletics event', detailLine: 'Results are entered per heat on the event page' }),
  ScoringControls,
  correctable: false,
};
