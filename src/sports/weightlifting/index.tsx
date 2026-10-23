/**
 * Weightlifting plugin (SD-97, IWF Technical & Competition Rules). Like
 * athletics and swimming, a meet is a programme of EVENTS — one per bodyweight
 * category (Men 79 kg, Youth Girls 53 kg …) — each a single session on the
 * results engine (data/results/weightlifting.ts): weigh-in, the snatch then
 * the clean & jerk with three attempts each, the IWF calling order, good lift /
 * no lift, the total. The plugin registers the sport and its meet settings;
 * the match-scoring members are inert placeholders so the generic match
 * screens never break.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';
import { WEIGHTLIFTING_META } from './meta';

export interface WeightliftingMatchState { ended: boolean }

const ScoringControls: SportPlugin<WeightliftingMatchState>['ScoringControls'] = () => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={textStyles.h3}>🏋️ Weightlifting runs as events</Text>
    <Text style={textStyles.muted}>Set up each bodyweight category from the tournament’s Weightlifting page: add the lifters, weigh them in, then enter each attempt as it is lifted.</Text>
  </View>
);

export const weightliftingPlugin: SportPlugin<WeightliftingMatchState> = {
  ...WEIGHTLIFTING_META,
  createInitialState: () => ({ ended: false }),
  reducer: (s) => s,
  isComplete: (s) => s.ended,
  result: () => null,
  summary: () => ({ homeScore: '', awayScore: '', statusLine: 'Weightlifting event', detailLine: 'Attempts are entered on the event page' }),
  ScoringControls,
  correctable: false,
};
