/** "Try a new sport" — pick one of the sports the user hasn't played yet, then
 *  choose how to get started: organize a game, organize a tournament, or watch
 *  the upcoming games of the teams/tournaments they follow in that sport. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Glyph } from '../components/Icon';
import { EmptyState, Card, ScreenTitle, textStyles } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { SportTile } from '../components/SportArt';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { SPORT_LIST, getSportMeta } from '../sports/sportMeta';
import { useAuth } from '../core/auth';
import { canScoreByRole } from '../core/roles';
import { useMyTournaments, useMatches, useFollow } from '../data/hooks';
import type { Match, SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TryNewSportScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'TryNewSport'>>();
  const { profile } = useAuth();
  const tournaments = useMyTournaments(profile?.id);
  const { matches } = useMatches();
  const { idsOfType } = useFollow(profile?.id);

  // Sports to offer: those passed in (the user's unplayed sports), else all.
  const options: SportId[] = params?.sports?.length ? params.sports : SPORT_LIST.map((s) => s.id);
  const [chosen, setChosen] = useState<SportId | null>(null);
  const [showFollowedGames, setShowFollowedGames] = useState(false);
  // 2026-10-29 redesign: three court tiles a row; the chosen sport as a banner
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 720) - theme.spacing(8);
  const tileW = Math.floor((contentW - theme.spacing(2) * 2) / 3);

  const followedTeams = idsOfType('team');
  const followedTours = idsOfType('tournament');
  const followedGames = useMemo(() => {
    if (!chosen) return [];
    return matches.filter(
      (m) =>
        m.sport === chosen &&
        m.status !== 'completed' &&
        ((m.tournamentId != null && followedTours.includes(m.tournamentId)) ||
          followedTeams.includes(m.homeTeam.id) ||
          followedTeams.includes(m.awayTeam.id))
    );
  }, [matches, chosen, followedTeams, followedTours]);

  const canScore = canScoreByRole(profile?.role);
  const openScorer = (m: Match) =>
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore,
    });

  const organize = () => {
    if (!chosen) return;
    // Into one of MY tournaments that has the sport, else a friendly — never
    // someone else's tournament (tournaments[0] used to be anyone's).
    const t = tournaments.find((x) => x.sports.includes(chosen));
    nav.navigate('ScheduleMatch', t ? { tournamentId: t.id, sport: chosen } : { sport: chosen });
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <ScreenTitle
          title="Try a new sport"
          subtitle={chosen ? `Get started with ${getSportMeta(chosen).name}` : 'Pick a sport you haven’t played yet'}
        />

        {/* Step 1 — choose the sport (then it stands alone, as a banner) */}
        {chosen ? (
          <View style={{ gap: theme.spacing(2) }}>
            <SportTile sport={chosen} name={getSportMeta(chosen).name} icon={getSportMeta(chosen).icon} width={contentW} height={150} />
            <Text style={st.change} accessibilityRole="button" onPress={() => setChosen(null)}>‹ Change sport</Text>
          </View>
        ) : (
          <View style={st.grid}>
            {options.map((s) => (
              <SportTile key={s} sport={s} name={getSportMeta(s).name} width={tileW} height={Math.round(tileW * 1.15)}
                onPress={() => setChosen(s)} accessibilityHint="Choose this sport" />
            ))}
          </View>
        )}

        {/* Step 2 — what to do with the chosen sport */}
        {chosen && (
          <>
            <Text style={[textStyles.h3, st.section]}>Get started</Text>

            <ActionRow
              icon="🗓️"
              title="Organize a game"
              subtitle={`Schedule a ${getSportMeta(chosen).name} match`}
              onPress={organize}
            />
            <ActionRow
              icon="🏆"
              title="Organize a tournament"
              subtitle={`Set up a ${getSportMeta(chosen).name} competition`}
              onPress={() => nav.navigate('CreateTournament', { sport: chosen })}
            />

            <SectionHeader
              title="👀 From people you follow"
              count={followedGames.length}
              onSeeAll={followedGames.length > SECTION_CAP ? () => setShowFollowedGames((v) => !v) : undefined}
              expanded={showFollowedGames}
            />
            {followedGames.length > 0 ? (
              (showFollowedGames ? followedGames : followedGames.slice(0, SECTION_CAP)).map((m) => (
                <MatchCard key={m.id} match={m} onPress={() => openScorer(m)} />
              ))
            ) : (
              <Card>
                <EmptyState
                  icon={getSportMeta(chosen).icon}
                  title={`No upcoming ${getSportMeta(chosen).name.toLowerCase()} games yet`}
                  hint="Follow teams or tournaments from Discover to see their fixtures here."
                  compact
                />
              </Card>
            )}
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function ActionRow({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={onPress}>
      <Card style={st.actionRow}>
        <Glyph emoji={icon} style={st.actionIcon} color={theme.colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={textStyles.body}>{title}</Text>
          <Text style={textStyles.muted}>{subtitle}</Text>
        </View>
        <Text style={st.chevron}>›</Text>
      </Card>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  change: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  section: { marginTop: theme.spacing(2) },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  actionIcon: { fontSize: 24 },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
});
