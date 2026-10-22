/** "My tournaments" — every tournament that's the signed-in person's own, in one
 *  place (2026-10-22): Hosting (incl. through their community), Playing (one of
 *  their teams is entered), Officiating (scorer / referee) and Following. Same
 *  rule as Home, Matches and Calendar (repos getMyScope). Live first, then
 *  upcoming, then finished. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, EmptyState, LoadingState, ScreenTitle, SelectChip, Button, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { useFollow } from '../data/hooks';
import { getMyScope, getTournaments } from '../data/repos';
import { getSport } from '../sports/registry';
import { formatDayShort } from '../core/dates';
import { todayIn, useUserTimeZone } from '../core/time';
import type { Tournament } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Role = 'hosting' | 'playing' | 'officiating' | 'following';
const ROLE_LABEL: Record<Role, string> = { hosting: 'Hosting', playing: 'Playing', officiating: 'Officiating', following: 'Following' };

export default function MyTournamentsScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const { idsOfType } = useFollow(profile?.id);
  const followed = idsOfType('tournament');
  const zone = useUserTimeZone();
  const [rows, setRows] = useState<{ t: Tournament; roles: Role[] }[] | null>(null);
  const [filter, setFilter] = useState<Role | 'all'>('all');

  useFocusEffect(useCallback(() => {
    let on = true;
    Promise.all([getTournaments(), getMyScope(profile?.id)]).then(([all, scope]) => {
      if (!on) return;
      const fol = new Set(followed);
      const out: { t: Tournament; roles: Role[] }[] = [];
      for (const t of all) {
        const roles: Role[] = [];
        if (scope.hostedTournamentIds.has(t.id)) roles.push('hosting');
        if (scope.playingTournamentIds.has(t.id)) roles.push('playing');
        if (scope.officiatingTournamentIds.has(t.id)) roles.push('officiating');
        if (fol.has(t.id)) roles.push('following');
        if (roles.length) out.push({ t, roles });
      }
      setRows(out);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, followed.join(',')]));

  const today = todayIn(zone);
  const phase = (t: Tournament): 0 | 1 | 2 => ((t.endDate ?? t.startDate ?? '') < today ? 2 : (t.startDate ?? '') <= today ? 0 : 1);
  const PHASE = ['Live now', 'Upcoming', 'Finished'] as const;
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.roles.includes(filter))
    .sort((a, b) => phase(a.t) - phase(b.t) || (phase(a.t) === 2 ? (b.t.startDate ?? '').localeCompare(a.t.startDate ?? '') : (a.t.startDate ?? '').localeCompare(b.t.startDate ?? '')));
  const counts = (r: Role) => (rows ?? []).filter((x) => x.roles.includes(r)).length;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="My tournaments" subtitle="Hosting, playing, officiating & following" />
        {rows === null ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <>
            <EmptyState icon="🏆" title="No tournaments yet" hint="Tournaments you host, play in (through your team), officiate or follow show up here." />
            <Button label="🔎 Find tournaments" variant="ghost" onPress={() => nav.navigate('Tabs', { screen: 'Discover', params: { in: 'tournaments' } })} />
          </>
        ) : (
          <>
            <View style={st.chips}>
              <SelectChip label={`All · ${rows.length}`} active={filter === 'all'} onPress={() => setFilter('all')} />
              {(Object.keys(ROLE_LABEL) as Role[]).filter((r) => counts(r) > 0).map((r) => (
                <SelectChip key={r} label={`${ROLE_LABEL[r]} · ${counts(r)}`} active={filter === r} onPress={() => setFilter(r)} />
              ))}
            </View>
            {shown.map(({ t, roles }, i) => (
              <View key={t.id} style={{ gap: theme.spacing(2) }}>
                {(i === 0 || phase(shown[i - 1].t) !== phase(t)) && <Text style={st.eyebrow}>{PHASE[phase(t)]}</Text>}
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${t.name}`} onPress={() => nav.navigate('Tournament', { tournamentId: t.id })}>
                  <Card style={{ gap: theme.spacing(1) }}>
                    <Text style={textStyles.body}>{t.name}</Text>
                    <Text style={textStyles.muted}>
                      {t.sports.map((s) => getSport(s).icon).join(' ')} · {formatDayShort(t.startDate)} → {formatDayShort(t.endDate)}
                    </Text>
                    <Text style={st.roles}>{roles.map((r) => ROLE_LABEL[r]).join(' · ')}</Text>
                  </Card>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  eyebrow: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', marginTop: theme.spacing(1) },
  roles: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
});
