/** Profile sections (founder 2026-11-05, docs/security/breaks/pairs-and-my-teams.md):
 *  • PairsSection — a player's doubles pairs, one per partner across sports;
 *    each opens the pair's page (core/pairs).
 *  • FollowingSection — on your OWN profile only: the teams, players and
 *    tournaments you follow, each opening its page (PT10). */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, textStyles } from './ui';
import { Glyph } from './Icon';
import { SectionHeader, SECTION_CAP } from './SectionHeader';
import { SportLine } from './SportSymbol';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { pairsFromTeams, type PairTeam } from '../core/pairs';
import { collapseClubs } from '../core/teamPage';
import { isPairSport } from '../data/pairSport';
import { useFollow, usePlayers, useTeams } from '../data/hooks';
import { getEntryTeamsWith, getPlayerNamesById, getTournaments } from '../data/repos';
import type { Tournament } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PairsSection({ playerId }: { playerId: string }) {
  const nav = useNavigation<Nav>();
  const [pairs, setPairs] = useState<PairTeam[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [all, setAll] = useState(false);
  useEffect(() => {
    let on = true;
    void getEntryTeamsWith([playerId]).then(async (rows) => {
      const ps = pairsFromTeams(rows, playerId, isPairSport);
      if (!on) return;
      setPairs(ps);
      const n = await getPlayerNamesById(ps.flatMap((p) => [p.a, p.b]));
      if (on) setNames(n);
    }).catch(() => {});
    return () => { on = false; };
  }, [playerId]);
  if (!pairs.length) return null;
  const shown = all ? pairs : pairs.slice(0, SECTION_CAP);
  return (
    <>
      <SectionHeader title="Pairs" count={pairs.length} onSeeAll={pairs.length > SECTION_CAP ? () => setAll((v) => !v) : undefined} expanded={all} />
      {shown.map((p) => {
        const partner = p.a === playerId ? p.b : p.a;
        return (
          <TouchableOpacity key={p.key} accessibilityRole="button" accessibilityLabel={`Open pair with ${names.get(partner) ?? 'partner'}`}
            onPress={() => nav.navigate('Pair', { a: p.a, b: p.b })}>
            <Card style={st.row}>
              <Glyph emoji="🤝" style={st.icon} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={textStyles.body}>with {names.get(partner) ?? 'Partner'}</Text>
                <SportLine sports={p.sports} />
              </View>
              <Text style={st.chev}>›</Text>
            </Card>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

export function FollowingSection() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const { idsOfType } = useFollow(profile?.id);
  const players = usePlayers();
  const teams = useTeams();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  useEffect(() => { let on = true; getTournaments().then((t) => on && setTournaments(t)).catch(() => {}); return () => { on = false; }; }, []);
  const teamIds = idsOfType('team'), playerIds = idsOfType('player'), tourIds = idsOfType('tournament');
  const fTeams = useMemo(() => collapseClubs(teams.filter((t) => teamIds.includes(t.id))), [teams, teamIds]);
  const fPlayers = players.filter((p) => playerIds.includes(p.id));
  const fTours = tournaments.filter((t) => tourIds.includes(t.id));
  const total = fTeams.length + fPlayers.length + fTours.length;
  if (!total) return null;
  type Item = { key: string; icon: string; title: string; sub?: React.ReactNode; open: () => void };
  const items: Item[] = [
    ...fTeams.map((t) => ({ key: `t:${t.id}`, icon: '🛡️', title: t.name, sub: <SportLine sports={t.sports} />,
      open: () => (t.clubId ? nav.navigate('ClubHome', { clubId: t.clubId }) : nav.navigate('Team', { teamId: t.id })) })),
    ...fPlayers.map((p) => ({ key: `p:${p.id}`, icon: '👤', title: p.fullName, sub: p.houseName ? <Text style={textStyles.muted}>{p.houseName}</Text> : undefined,
      open: () => nav.navigate('PlayerProfile', { playerId: p.id }) })),
    ...fTours.map((t) => ({ key: `r:${t.id}`, icon: '🏆', title: t.name, sub: <Text style={textStyles.muted}>{t.hostName}</Text>,
      open: () => nav.navigate('Tournament', { tournamentId: t.id }) })),
  ];
  return (
    <>
      <SectionHeader title="Following" count={total} onSeeAll={() => nav.navigate('Following')} expanded={false} />
      {items.slice(0, SECTION_CAP).map((it) => (
        <TouchableOpacity key={it.key} accessibilityRole="button" accessibilityLabel={`Open ${it.title}`} onPress={it.open}>
          <Card style={st.row}>
            <Glyph emoji={it.icon} style={st.icon} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={textStyles.body} numberOfLines={1}>{it.title}</Text>
              {it.sub}
            </View>
            <Text style={st.chev}>›</Text>
          </Card>
        </TouchableOpacity>
      ))}
    </>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  icon: { fontSize: 22, width: 32, textAlign: 'center' },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '800' },
});
