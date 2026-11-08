/** "Your sports" (founder 2026-11-08, docs/security/breaks/home-sports.md): the
 *  folded row on Home opens this page, with a back arrow, as "Try a new sport"
 *  does. A sport opens the same place as on Home (sportTarget, HS3). Works out
 *  the sports itself, so an old link or a fresh account still works (HS4). */
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, LoadingState, ScreenTitle, textStyles } from '../components/ui';
import { SPORT_LIST, getSportMeta } from '../sports/sportMeta';
import { useAuth } from '../core/auth';
import { yourSports } from '../core/playedSports';
import { sportTarget } from '../core/homeHero';
import { useMyTournaments, useScopedMatches, usePlayerLite } from '../data/hooks';
import { getMyPlayerId } from '../data/repos';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function YourSportsScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const tournaments = useMyTournaments(profile?.id);
  const { feed, loading } = useScopedMatches(profile?.id);
  const [playerId, setPlayerId] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let on = true;
    getMyPlayerId(profile?.id).then((id) => on && setPlayerId(id));
    return () => { on = false; };
  }, [profile?.id]));
  const { player } = usePlayerLite(playerId);
  const all = SPORT_LIST.map((s) => s.id);
  const mine = yourSports(player?.sports, feed, playerId).filter((s) => all.includes(s));
  const open = (sport: SportId) => {
    const to = sportTarget(sport, tournaments, playerId);
    (nav.navigate as (name: string, params: object) => void)(to.name, to.params);
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Your sports" subtitle="Schedule, standings and stats for each" />
        {mine.length ? (
          <View style={st.grid}>
            {mine.map((s) => (
              <TouchableOpacity key={s} accessibilityRole="button" accessibilityLabel={`Open ${getSportMeta(s).name}`}
                activeOpacity={0.85} style={st.tile} onPress={() => open(s)}>
                <Text style={st.tileIcon}>{getSportMeta(s).icon}</Text>
                <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{getSportMeta(s).name}</Text>
                <Text style={st.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : loading ? (
          <LoadingState />
        ) : (
          <EmptyState title="No sports yet" hint="Sports you play, score or host show up here."
            action={{ label: 'Try a new sport', onPress: () => nav.navigate('TryNewSport', undefined) }} />
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3), width: '48%',
  },
  tileIcon: { fontSize: 22 },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h3 },
});
