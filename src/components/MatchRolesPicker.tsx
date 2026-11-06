/**
 * Match-day roles (reference-video C6): the captain, and the sport's keeper
 * where it has one, picked from the players in this match's squad. Tapping the
 * chosen player again clears the role. Used in "Who's playing" at setup and on
 * the Matchday Squad screen.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { SelectChip, textStyles } from './ui';
import { theme } from '../core/theme';
import { keeperLabel, pickRole } from '../core/matchRoles';
import type { SportId } from '../core/types';

export function MatchRolesPicker({
  sport, players, captainId, keeperId, onCaptain, onKeeper,
}: {
  sport: SportId;
  /** the squad (starters first), as the app shows their names */
  players: { id: string; name: string }[];
  captainId?: string;
  keeperId?: string;
  onCaptain: (id: string | undefined) => void;
  onKeeper: (id: string | undefined) => void;
}) {
  if (!players.length) return null;
  const keeper = keeperLabel(sport);
  const row = (label: string, current: string | undefined, set: (id: string | undefined) => void) => (
    <View style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.muted}>{label} (optional)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) }}>
        {players.map((p) => (
          <SelectChip key={p.id} label={p.name} active={current === p.id} onPress={() => set(pickRole(current, p.id))} accessibilityLabel={`${p.name} as ${label}`} />
        ))}
      </View>
    </View>
  );
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {row('Captain', captainId, onCaptain)}
      {keeper ? row(keeper, keeperId, onKeeper) : null}
    </View>
  );
}
