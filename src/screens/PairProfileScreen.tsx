/** An old "Pair" link (a, b) — teams for doubles, phase 5
 *  (docs/security/breaks/team-pages.md): a doubles side is a team now, so this
 *  only forwards to the two players' team — their club page when they have one
 *  (one team, any sport), else the team of exactly those two, else any team
 *  with both (PG2 / PG3 / PG5). Shared links and notifications keep working. */
import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EmptyState, LoadingState } from '../components/ui';
import { theme } from '../core/theme';
import { getTeamsWithPlayers } from '../data/repos';
import { pairTarget } from '../core/teamPage';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function PairProfileScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Pair'>>();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let on = true;
    void getTeamsWithPlayers([params.a, params.b]).then((rows) => {
      if (!on) return;
      const exact = rows.filter((t) => new Set(t.roster ?? []).size === 2);
      const to = pairTarget(exact.length ? exact : rows);
      if (!to) { setMissing(true); return; }
      if (to.route === 'ClubHome') nav.replace('ClubHome', { clubId: to.clubId });
      else nav.replace('Team', { teamId: to.teamId });
    }).catch(() => on && setMissing(true));
    return () => { on = false; };
  }, [params.a, params.b, nav]);

  // PG6
  if (missing) return <SafeAreaView style={st.safe}><EmptyState icon="🤝" title="No team found for these two players" hint="They may not have played together yet." /></SafeAreaView>;
  return <SafeAreaView style={st.safe}><LoadingState label="Opening their team…" /></SafeAreaView>;
}

const st = StyleSheet.create({ safe: { flex: 1, backgroundColor: theme.colors.bg } });
