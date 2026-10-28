/** Everything the user follows — players, teams and tournaments — in one place. */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Glyph } from '../components/Icon';
import { Card, Pill, ScreenTitle, textStyles } from '../components/ui';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { FollowBell } from '../components/FollowBell';
import { useAuth } from '../core/auth';
import { useFollow, usePlayers, useTeams } from '../data/hooks';
import { getTournaments } from '../data/repos';
import type { Tournament } from '../core/types';
import { getSportMeta } from '../sports/sportMeta';
import type { RootStackParamList } from '../navigation/types';
import { SportLine } from '../components/SportArt';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function FollowingScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const { idsOfType, toggle } = useFollow(profile?.id);
  const players = usePlayers();
  const teams = useTeams();
  const [tournaments, setTournaments] = React.useState<Tournament[]>([]);
  React.useEffect(() => { let on = true; getTournaments().then((t) => on && setTournaments(t)); return () => { on = false; }; }, []);

  const playerIds = idsOfType('player');
  const teamIds = idsOfType('team');
  const tournamentIds = idsOfType('tournament');

  const followedPlayers = players.filter((p) => playerIds.includes(p.id));
  const followedTeams = teams.filter((t) => teamIds.includes(t.id));
  // every followed tournament (this used to show only the app's oldest one, and only if followed)
  const followedTournaments = tournaments.filter((t) => tournamentIds.includes(t.id));
  const total = followedPlayers.length + followedTeams.length + followedTournaments.length;

  const [showAllTournaments, setShowAllTournaments] = React.useState(false);
  const [showAllTeams, setShowAllTeams] = React.useState(false);
  const [showAllPlayers, setShowAllPlayers] = React.useState(false);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Following" subtitle={`${total} followed`} />

        {total === 0 && (
          <Card>
            <Text style={textStyles.body}>You’re not following anything yet.</Text>
            <Text style={textStyles.muted}>Follow players, teams and tournaments to get their updates here.</Text>
          </Card>
        )}

        {followedTournaments.length > 0 && (
          <>
            <SectionHeader title="Tournaments" count={followedTournaments.length} onSeeAll={followedTournaments.length > SECTION_CAP ? () => setShowAllTournaments((v) => !v) : undefined} expanded={showAllTournaments} />
            {(showAllTournaments ? followedTournaments : followedTournaments.slice(0, SECTION_CAP)).map((t) => (
              <Card key={t.id} style={st.row}>
                <Glyph emoji="🏆" style={st.icon} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={textStyles.body}>{t.name}</Text>
                  <Text style={textStyles.muted}>{t.hostName}</Text>
                </View>
                <Unfollow onPress={() => toggle('tournament', t.id)} />
                <FollowBell type="tournament" id={t.id} name={t.name} />
              </Card>
            ))}
          </>
        )}

        {followedTeams.length > 0 && (
          <>
            <SectionHeader title="Teams" count={followedTeams.length} onSeeAll={followedTeams.length > SECTION_CAP ? () => setShowAllTeams((v) => !v) : undefined} expanded={showAllTeams} />
            {(showAllTeams ? followedTeams : followedTeams.slice(0, SECTION_CAP)).map((t) => (
              <Card key={t.id} style={st.row}>
                <View style={[st.dot, { backgroundColor: t.colorHex ?? theme.colors.surfaceAlt }]} />
                <View style={{ flex: 1 }}>
                  <Text style={textStyles.body}>{t.name}</Text>
                  <SportLine sports={[t.sport]} />
                </View>
                <Unfollow onPress={() => toggle('team', t.id)} />
                <FollowBell type="team" id={t.id} name={t.name} />
              </Card>
            ))}
          </>
        )}

        {followedPlayers.length > 0 && (
          <>
            <SectionHeader title="Players" count={followedPlayers.length} onSeeAll={followedPlayers.length > SECTION_CAP ? () => setShowAllPlayers((v) => !v) : undefined} expanded={showAllPlayers} />
            {(showAllPlayers ? followedPlayers : followedPlayers.slice(0, SECTION_CAP)).map((p) => (
              <TouchableOpacity accessibilityRole="button" key={p.id} activeOpacity={0.85} onPress={() => nav.navigate('PlayerProfile', { playerId: p.id })}>
                <Card style={st.row}>
                  <View style={[st.avatar, { backgroundColor: (p.houseColor ?? theme.colors.surfaceAlt) + '33' }]}>
                    <Text style={[st.avatarText, { color: p.houseColor ?? theme.colors.primary }]}>
                      {p.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{p.fullName}</Text>
                    <Text style={textStyles.muted}>{p.houseName ?? 'Independent'}{p.city ? ` · ${p.city}` : ''}</Text>
                  </View>
                  <Unfollow onPress={() => toggle('player', p.id)} />
                  <FollowBell type="player" id={p.id} name={p.fullName} />
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const Unfollow = ({ onPress }: { onPress: () => void }) => (
  <TouchableOpacity accessibilityRole="button" onPress={onPress} activeOpacity={0.8}>
    <Pill label="★ Following" color={theme.colors.primary} textColor="#06120D" />
  </TouchableOpacity>
);

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  section: { marginTop: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  icon: { fontSize: 24 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
});
