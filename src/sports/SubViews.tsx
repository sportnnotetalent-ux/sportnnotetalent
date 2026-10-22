/**
 * Match tabs (2026-10-22) — a small chip switch between a tab's own views, e.g.
 * the Stats tab's "Match stats · Box score" or cricket's "Scorecard · Match
 * stats". Only the chosen view is mounted; one view → no chips. Each `render`
 * returns the existing component unchanged (views are moved, not rewritten).
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';

export interface SubView {
  key: string;
  label: string;
  render: () => React.ReactNode;
}

export function SubViews({ views, label }: {
  /** in order; the first is open by default */
  views: SubView[];
  /** what the chips switch between, for screen readers ("Stats view") */
  label?: string;
}) {
  const [key, setKey] = useState<string | undefined>(views[0]?.key);
  // a view that went away (e.g. Drives before the first drive) falls back to the first
  const active = views.find((v) => v.key === key) ?? views[0];
  if (!active) return null;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {views.length > 1 ? (
        <View style={st.chips} accessibilityRole="tablist" accessibilityLabel={label}>
          {views.map((v) => <SelectChip key={v.key} label={v.label} active={active.key === v.key} onPress={() => setKey(v.key)} />)}
        </View>
      ) : null}
      {active.render()}
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
