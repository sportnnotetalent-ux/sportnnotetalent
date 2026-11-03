/** A pair's page (founder 2026-11-05, docs/security/breaks/pairs-and-my-teams.md):
 *  two people as one team across every sport — overall and per-sport record,
 *  their combined numbers, recent games. Only games the two played together on
 *  the same side count (src/core/pairs.ts). */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { Card, EmptyState, LoadingState, Pill, textStyles } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { theme } from '../core/theme';
import { getSportMeta } from '../sports/sportMeta';
import { statLabel } from '../data/ratings';
import { useMatches } from '../data/hooks';
import { getEntryTeamsWith, getPlayerNamesById, getStatLinesForMatches } from '../data/repos';
import { pairKey, pairRecord, pairStats, pairsFromTeams } from '../core/pairs';
import { openMatchViewer } from '../navigation/openMatch';
import { isPairSport } from '../data/pairSport';
import type { SportId, StatLine } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const initials = (n: string) => n.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

export default function PairProfileScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Pair'>>();
  const key = pairKey([params.a, params.b]);
  const [a, b] = key ? key.split('|') : [params.a, params.b];
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [teamIds, setTeamIds] = useState<string[] | null>(null);
  const [lines, setLines] = useState<StatLine[]>([]);
  const { matches } = useMatches();

  useEffect(() => {
    let on = true;
    void getPlayerNamesById([a, b]).then((n) => on && setNames(n));
    void getEntryTeamsWith([a, b]).then((rows) => {
      if (!on) return;
      setTeamIds(pairsFromTeams(rows, undefined, isPairSport).find((p) => p.key === key)?.teamIds ?? []);
    });
    return () => { on = false; };
  }, [a, b, key]);

  const rec = useMemo(() => pairRecord(new Set(teamIds ?? []), matches), [teamIds, matches]);
  const doneIds = useMemo(() => rec.matchIds.filter((id) => matches.find((m) => m.id === id)?.status === 'completed'), [rec, matches]);
  const doneKey = doneIds.join(',');
  useEffect(() => {
    let on = true;
    if (!doneIds.length) { setLines([]); return; }
    void getStatLinesForMatches(doneIds.slice(0, 200)).then((l) => on && setLines(l));
    return () => { on = false; };
  }, [doneKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => pairStats(lines, [a, b], new Set(doneIds)), [lines, a, b, doneKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameA = names.get(a) ?? 'Player', nameB = names.get(b) ?? 'Player';
  const title = `${nameA} & ${nameB}`;
  useEffect(() => { nav.setOptions({ title }); }, [nav, title]);

  if (!key) return <SafeAreaView style={st.safe}><EmptyState icon="🤝" title="Not a pair" hint="A pair is two different players." /></SafeAreaView>;
  if (teamIds === null) return <SafeAreaView style={st.safe}><LoadingState label="Loading pair…" /></SafeAreaView>;

  const recent = rec.matchIds.slice(0, 10).map((id) => matches.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  const sports = rec.bySport.map((s) => s.sport);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <View style={st.header}>
          <View style={st.avatars}>
            <View style={st.avatar}><Text style={st.avatarText}>{initials(nameA)}</Text></View>
            <View style={[st.avatar, st.avatarB]}><Text style={st.avatarText}>{initials(nameB)}</Text></View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={textStyles.h2}>{title}</Text>
            <View style={st.tags}>
              {(sports.length ? sports : []).map((s) => <Pill key={s} label={`${getSportMeta(s as SportId).icon} ${getSportMeta(s as SportId).name}`} />)}
            </View>
          </View>
        </View>

        <View style={st.tiles}>
          {[['Played', rec.overall.played], ['Won', rec.overall.won], ['Lost', rec.overall.lost], ['Win %', `${rec.overall.winPct}%`]].map(([l, v]) => (
            <Card key={String(l)} style={st.tile}>
              <Text style={st.tileVal}>{v}</Text>
              <Text style={textStyles.muted}>{l}</Text>
            </Card>
          ))}
        </View>
        {rec.overall.played === 0 ? <Text style={textStyles.muted}>No finished games together yet.</Text> : null}

        {rec.bySport.length ? <Text style={textStyles.h3}>By sport</Text> : null}
        {rec.bySport.map((s) => {
          const meta = getSportMeta(s.sport as SportId);
          const top = Object.entries(stats[s.sport] ?? {}).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).slice(0, 6);
          return (
            <Card key={s.sport} style={st.gap}>
              <Text style={textStyles.body}>{meta.icon} {meta.name}</Text>
              <Text style={textStyles.muted}>{s.played} played · {s.won} won · {s.drawn ? `${s.drawn} drawn · ` : ''}{s.lost} lost · {s.winPct}% wins</Text>
              {top.length ? (
                <View style={st.tags}>
                  {top.map(([k, v]) => <Pill key={k} label={`${v} ${statLabel(k, v, s.sport as SportId)}`} />)}
                </View>
              ) : null}
            </Card>
          );
        })}

        <Text style={textStyles.h3}>Players</Text>
        {[a, b].map((id) => (
          <TouchableOpacity key={id} accessibilityRole="button" accessibilityLabel={`Open ${names.get(id) ?? 'player'}`} onPress={() => nav.navigate('PlayerProfile', { playerId: id })}>
            <Card style={st.row}>
              <View style={st.avatar}><Text style={st.avatarText}>{initials(names.get(id) ?? '')}</Text></View>
              <Text style={[textStyles.body, { flex: 1 }]}>{names.get(id) ?? 'Player'}</Text>
              <Text style={st.chev}>›</Text>
            </Card>
          </TouchableOpacity>
        ))}

        {recent.length ? <Text style={textStyles.h3}>Games together</Text> : null}
        {recent.map((m) => <MatchCard key={m.id} match={m} onPress={() => openMatchViewer(nav, m)} />)}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10) },
  gap: { gap: theme.spacing(1.5) },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  avatars: { flexDirection: 'row' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.colors.bg },
  avatarB: { marginLeft: -12 },
  avatarText: { fontWeight: '800', color: theme.colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1.5), marginTop: theme.spacing(1) },
  tiles: { flexDirection: 'row', gap: theme.spacing(2) },
  tile: { flex: 1, alignItems: 'center', gap: 2 },
  tileVal: { fontSize: theme.font.h3, fontWeight: '900', color: theme.colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '800' },
});
