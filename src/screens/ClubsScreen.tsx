/** "My teams" — the teams I'm part of (founder 2026-11-05): multi-sport teams I'm
 *  a member of, single-sport teams whose squad lists me or I've played for, my
 *  pairs (core/pairs), and — apart — teams I only run. The entry point to create
 *  or join one (spec §12). */
import React, { useCallback, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { readableOn } from '../core/contrast';
import { Card, Button, ScreenTitle, LoadingState, EmptyState, textStyles } from '../components/ui';
import { SportLine } from '../components/SportSymbol';
import { Glyph } from '../components/Icon';
import { getSportMeta } from '../sports/sportMeta';
import { getClubsForPlayer, getClubSports, getMyPlayerId, getMyScope, getMyTeams, getPlayerNamesById, getTeams, getTeamsPlayedFor } from '../data/repos';
import { myTeamsView, type PairTeam } from '../core/pairs';
import { isPairSport } from '../data/pairSport';
import { useAuth } from '../core/auth';
import type { Club, SportId, Team } from '../core/types';
import type { RootStackParamList } from '../navigation/types';
import { displayableImage } from '../core/imageUrl';
import { isSupabaseConfigured } from '../core/supabase';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ClubsScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [sportsByClub, setSportsByClub] = useState<Record<string, SportId[]>>({});
  // per-sport teams that are mine but not part of a club (made for a match or a
  // tournament, or ones I captain / play on)
  const [single, setSingle] = useState<Team[]>([]);
  const [run, setRun] = useState<Team[]>([]);
  const [pairs, setPairs] = useState<PairTeam[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Only the teams you're a member of or created — not every team on the platform.
  const load = useCallback(async () => {
    const myId = await getMyPlayerId(profile?.id);
    const [list, mine, scope, played] = await Promise.all([
      getClubsForPlayer(myId, profile?.id), getMyTeams(profile?.id), getMyScope(profile?.id), getTeamsPlayedFor(myId),
    ]);
    // teams I played for but am not listed on (a match squad only)
    const missing = [...played].filter((id) => !mine.some((t) => t.id === id));
    const extra = missing.length ? (await getTeams()).filter((t) => missing.includes(t.id)) : [];
    const v = myTeamsView({ me: myId, teams: [...mine, ...extra], playingIds: scope.playingTeamIds, playedIds: played, managedIds: scope.managedTeamIds, pairSport: isPairSport });
    const clubSports = await Promise.all(list.map(async (c) => [c.id, await getClubSports(c.id)] as const));
    setClubs(list);
    setSportsByClub(Object.fromEntries(clubSports));
    setSingle(v.playFor);
    setRun(v.run);
    setPairs(v.pairs);
    setMe(myId);
    setNames(await getPlayerNamesById(v.pairs.flatMap((p) => [p.a, p.b])));
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Teams" subtitle="One team, many sports" />
        <Button label="+ Create a team" onPress={() => nav.navigate('CreateClub')} />
        <Button label="Have an invite code? Join a team" variant="ghost" onPress={() => nav.navigate('JoinClub')} />

        {loading ? (
          <LoadingState />
        ) : clubs.length === 0 && single.length === 0 && pairs.length === 0 && run.length === 0 ? (
          <EmptyState icon="🛡️" title="No teams yet" hint="Create your team, pick the sports it plays, and add your teammates." />
        ) : (
          clubs.map((c) => {
            const sports = sportsByClub[c.id] ?? [];
            return (
              <TouchableOpacity key={c.id} accessibilityRole="button" accessibilityLabel={`Open ${c.name}`}
                onPress={() => nav.navigate('ClubHome', { clubId: c.id })}>
                <Card style={st.row}>
                  {displayableImage(c.logoUrl, !isSupabaseConfigured) ? (
                    <Image source={{ uri: c.logoUrl! }} style={st.badgeImg} resizeMode="cover" />
                  ) : (
                    <View style={[st.badge, { backgroundColor: c.colorHex ?? theme.colors.primary }]}>
                      <Text style={[st.badgeText, { color: readableOn(c.colorHex ?? theme.colors.primary) }]}>{c.shortName?.slice(0, 3) || c.name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{c.name}</Text>
                    {sports.length ? <SportLine sports={sports}>{c.city || null}</SportLine>
                      : <Text style={textStyles.muted}>{c.city ? `${c.city} · ` : ''}No sports yet</Text>}
                  </View>
                  <Text style={st.chev}>›</Text>
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        {!loading && single.length > 0 && (
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>Single-sport teams</Text>
            <Text style={textStyles.muted}>Teams whose squad you’re in, or you’ve played for.</Text>
            {single.map((t) => (
              <TouchableOpacity key={t.id} accessibilityRole="button" accessibilityLabel={`Open ${t.name}`}
                onPress={() => nav.navigate('Team', { teamId: t.id })}>
                <Card style={st.row}>
                  <View style={[st.badge, { backgroundColor: t.colorHex ?? theme.colors.primary }]}>
                    <Text style={[st.badgeText, { color: readableOn(t.colorHex ?? theme.colors.primary) }]}>{t.shortName?.slice(0, 3) || t.name.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{t.name}</Text>
                    <SportLine sports={[t.sport]} />
                  </View>
                  <Text style={st.chev}>›</Text>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!loading && pairs.length > 0 && (
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>Your pairs</Text>
            <Text style={textStyles.muted}>Everyone you’ve partnered in doubles — one record across every sport.</Text>
            {pairs.map((p) => {
              const partner = p.a === me ? p.b : p.a;
              return (
                <TouchableOpacity key={p.key} accessibilityRole="button" accessibilityLabel={`Open pair with ${names.get(partner) ?? 'partner'}`}
                  onPress={() => nav.navigate('Pair', { a: p.a, b: p.b })}>
                  <Card style={st.row}>
                    <View style={[st.badge, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <Glyph emoji="🤝" style={[st.badgeText, { color: theme.colors.text }]} color={theme.colors.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body}>{names.get(p.a) ?? 'Player'} & {names.get(p.b) ?? 'Player'}</Text>
                      <SportLine sports={p.sports} />
                    </View>
                    <Text style={st.chev}>›</Text>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!loading && run.length > 0 && (
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>Teams you run</Text>
            <Text style={textStyles.muted}>You created or manage these but aren’t in their squad.</Text>
            {run.map((t) => (
              <TouchableOpacity key={t.id} accessibilityRole="button" accessibilityLabel={`Open ${t.name}`}
                onPress={() => nav.navigate('Team', { teamId: t.id })}>
                <Card style={st.row}>
                  <View style={[st.badge, { backgroundColor: t.colorHex ?? theme.colors.primary }]}>
                    <Text style={[st.badgeText, { color: readableOn(t.colorHex ?? theme.colors.primary) }]}>{t.shortName?.slice(0, 3) || t.name.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{t.name}</Text>
                    <SportLine sports={[t.sport]} />
                  </View>
                  <Text style={st.chev}>›</Text>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  badge: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeImg: { width: 44, height: 44, borderRadius: 10 },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '800' },
});
