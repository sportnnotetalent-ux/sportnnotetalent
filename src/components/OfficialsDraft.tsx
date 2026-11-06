/**
 * Officials at match setup (reference-video C7), optional: one name per slot,
 * in the sport's own titles (referee, umpire, judge…). Kept as a draft and
 * saved once the match exists (ScheduleMatchScreen). People can be linked to
 * their app account later from the match's Info tab.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { TextField, textStyles } from './ui';
import { theme } from '../core/theme';
import { slotsFor, type MatchOfficial } from '../data/matchOfficials';
import type { SportId } from '../core/types';

export function OfficialsDraft({ sport, value, onChange }: { sport: SportId; value: MatchOfficial[]; onChange: (next: MatchOfficial[]) => void }) {
  const slots = slotsFor(sport);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.muted}>Officials (optional)</Text>
      {slots.map((sl) => {
        const cur = value.find((o) => o.slot === sl.key)?.name ?? '';
        return (
          <TextField
            key={sl.key}
            label={sl.label}
            value={cur}
            // raw while typing (spaces kept); cleaned by cleanOfficials when saved
            onChange={(name) => onChange([...value.filter((o) => o.slot !== sl.key), ...(name ? [{ slot: sl.key, name }] : [])])}
            placeholder="Name"
            autoCapitalize="words"
          />
        );
      })}
    </View>
  );
}
