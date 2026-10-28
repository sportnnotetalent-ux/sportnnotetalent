/**
 * Billiards plugin — archetype: set-game-point. The engine is ./engine.ts (pure,
 * tested on its own); this file wires it into the app. BASE WIRING ONLY: the
 * scorer controls, match tabs, stat totals and records are being built.
 */
import React from 'react';
import { Text } from 'react-native';
import { textStyles } from '../../components/ui';
import type { SportPlugin } from '../types';
import { createInitialState, reducer, isComplete, result, summary, scoreLine, lineScore, standingsUnits, type BilliardsState } from './engine';
import { BILLIARDS_META } from './meta';

const ScoringControls: SportPlugin<BilliardsState>['ScoringControls'] = () => <Text style={textStyles.muted}>Scoring for Billiards is coming soon.</Text>;

export const billiardsPlugin: SportPlugin<BilliardsState> = {
  ...BILLIARDS_META,
  createInitialState,
  reducer: (s, a) => reducer(s, a as never),
  isComplete,
  result: (s) => result(s),
  summary,
  scoreLine,
  lineScore,
  standingsUnits,
  ScoringControls,
};
