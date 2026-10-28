import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { ProfileView } from '../components/ProfileView';
import { MineCard } from '../components/MineCard';
import { useAuth } from '../core/auth';
import { getMyPlayerId, createMyPlayer } from '../data/repos';
import type { RootStackParamList } from '../navigation/types';
import { useProfileShare } from '../data/useProfileShare';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  const nav = useNavigation<Nav>();
  // undefined = still finding this account's player (not "none": the screen
  // must not offer "Set up your profile" while it looks — 2026-10-29)
  const [playerId, setPlayerId] = useState<string | null | undefined>(undefined);
  const [idFailed, setIdFailed] = useState(false);
  const [lookup, setLookup] = useState(0);
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      getMyPlayerId(profile?.id)
        .then((id) => { if (on) { setPlayerId(id); setIdFailed(false); } })
        .catch(() => { if (on) setIdFailed(true); });
      return () => {
        on = false;
      };
    }, [profile?.id, lookup])
  );

  // First-time setup: create the account's own player profile, then open the
  // editor so they can fill in their details.
  const createProfile = async () => {
    if (!profile?.id || creating) return;
    setCreating(true);
    try {
      const id = await createMyPlayer(profile.id);
      setPlayerId(id);
      nav.navigate('EditProfile', { playerId: id });
    } finally {
      setCreating(false);
    }
  };

  const shareProfile = useProfileShare(playerId);

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ProfileView
        playerId={playerId}
        lookupFailed={idFailed}
        onRetryLookup={() => setLookup((n) => n + 1)}
        onShare={playerId ? shareProfile : undefined}
        onOpenSport={playerId ? (sport) => nav.navigate('SportProfile', { playerId, sport }) : undefined}
        onEditProfile={playerId ? () => nav.navigate('EditProfile', { playerId }) : undefined}
        onOpenOrg={(orgId) => nav.navigate('Organization', { orgId })}
        onOpenSettings={() => nav.navigate('Settings')}
        onOpenVerificationReview={() => nav.navigate('VerificationReview')}
        onCreateProfile={createProfile}
        creating={creating}
        onSignOut={signOut}
        mine={(
          <MineCard
            onTeams={() => nav.navigate('Clubs')}
            onTournaments={() => nav.navigate('MyTournaments')}
            onMatches={() => nav.navigate('Tabs', { screen: 'Matches' })}
            onCalendar={() => nav.navigate('Calendar')}
            onInvite={() => nav.navigate('InviteFriend')}
          />
        )}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
});
