/** Matches — the games I play in (default), or the ones I host / score /
 *  organise ("Running"), split into Live, Upcoming and Completed. Followed
 *  games live on Home, not here (founder 2026-11-04, src/core/myMatches.ts).
 *  Completed matches open the same full page as a live game (final score, info,
 *  lineups, summary) so the app keeps a browsable history of every game. */
import { SportPicker } from '../components/SportPicker';
import { useMySports } from '../data/useMySports';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, LoadingState, ScreenTitle, SelectChip, textStyles } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { useScopedMatches } from '../data/hooks';
import { getMyPlayerId, getOrganizations, getTournaments } from '../data/repos';
import { canScoreMatch } from '../core/scoringAccess';
import { tournamentHostPlayerIds } from '../core/org';
import { useAuth } from '../core/auth';
import { canScoreByRole } from '../core/roles';
import { getSportMeta } from '../sports/sportMeta';
import type { Match, SportId } from '../core/types';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useParamState } from '../navigation/useParamState';
import { matchesView, normalView, VIEW_LABEL, hostingNote, type MatchesView } from '../core/myMatches';
import { overdueHint } from '../core/overdue';
import { BrandBar } from '../components/BrandBar';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TABS = [
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default function MatchesScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabParamList, 'Matches'>>();
  const { profile } = useAuth();
  const [tab, setTab] = useParamState<Tab>('tab', params?.initialTab ?? 'upcoming');
  const [filter, setFilter] = useState<SportId | 'all'>(params?.initialSport ?? 'all');
  const [sportsOpen, setSportsOpen] = useState(false);
  const mySports = useMySports();
  const [rawView, setView] = useParamState<MatchesView>('view', 'playing');
  const view = normalView(rawView);
  // A "See all" link can re-open this tab with a different section/sport.
  useEffect(() => {
    if (params?.initialTab) setTab(params.initialTab);
    if (params?.initialSport) setFilter(params.initialSport);
  }, [params?.initialTab, params?.initialSport]);
  // The Matches tab is only YOUR games — Playing, or Running (organize/score).
  const { mine, playingTeamIds, loading } = useScopedMatches(profile?.id);
  const canScore = canScoreByRole(profile?.role);
  // Which of these I can score (scorer or host) → a "▶ Start scoring" shortcut on the card.
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void getMyPlayerId(profile?.id).then((id) => on && setMyPlayerId(id));
    return () => { on = false; };
  }, [profile?.id]);
  // Tournament hosts (incl. an org-hosted event's Owner/Admin/Organizer) score its matches too.
  const [tourHosts, setTourHosts] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let on = true;
    void Promise.all([getTournaments(), getOrganizations()]).then(([ts, orgs]) => {
      if (on) setTourHosts(Object.fromEntries(ts.map((t) => [t.id, tournamentHostPlayerIds(t, orgs)])));
    }).catch(() => {});
    return () => { on = false; };
  }, [profile?.id]);
  // Listed scorers AND hosts get the shortcut — hosts score by default.
  const iScore = (m: Match) => canScoreMatch({
    myPlayerId, scorerIds: m.scorerIds, scorerId: m.scorerId, hostIds: m.hostIds,
    tournamentHostIds: m.tournamentId ? tourHosts[m.tournamentId] : undefined,
  });

  // Live = in progress (idle 12 h+ → "Not finished" under Completed); Upcoming =
  // scheduled, postponed or cancelled (soonest first); Completed = newest first.
  const v = matchesView(mine, { playingTeamIds, playerId: myPlayerId, view, sport: filter, now: Date.now() });
  const list = tab === 'live' ? v.live : tab === 'upcoming' ? v.upcoming : v.completed;
  const notFinished = tab === 'completed' ? v.notFinished : [];
  const overdue = tab === 'upcoming' ? v.overdue : [];
  const countFor = (key: Tab) => v.tabCounts[key];

  const open = (m: Match, tab?: string) =>
    nav.navigate('LiveScoring', {
      matchId: m.id,
      sport: m.sport,
      homeName: m.homeTeam.shortName,
      awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name,
      awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex,
      awayColor: m.awayTeam.colorHex,
      canScore,
      ...(tab ? { tab } : {}),
    });

  return (
    <SafeAreaView style={st.safe} edges={[]}>
      {/* brand-bar.md: the shared top bar (name → Home, search, alerts, menu) */}
      <BrandBar tab />
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Matches" subtitle={view === 'playing' ? 'Games you play in' : 'Games you host, organize or score'} />

        <View style={st.views}>
          <SelectChip label={`${VIEW_LABEL.playing}${v.counts.playing ? ` ${v.counts.playing}` : ''}`} active={view === 'playing'} onPress={() => setView('playing')} />
          <SelectChip label={`${VIEW_LABEL.running}${v.counts.running ? ` ${v.counts.running}` : ''}`} active={view === 'running'} onPress={() => setView('running')} />
        </View>

        <View style={st.segment}>
          {TABS.map((t) => {
            const n = countFor(t.key);
            const on = tab === t.key;
            return (
              <TouchableOpacity accessibilityRole="button"
                key={t.key}
                style={[st.segBtn, on && st.segBtnActive]}
                activeOpacity={0.8}
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t.label}, ${n} ${n === 1 ? 'match' : 'matches'}`}
                onPress={() => setTab(t.key)}
              >
                {t.key === 'live' ? <View style={st.liveDot} /> : null}
                <Text style={[st.segText, on && st.segTextActive]} numberOfLines={1}>
                  {t.label}{n > 0 ? ` ${n}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* UI audit step 5: one compact "Sport" control instead of a third row of chips */}
        <Text style={st.sportToggle} accessibilityRole="button" accessibilityState={{ expanded: sportsOpen }} onPress={() => setSportsOpen((o) => !o)}>
          Sport: {filter === 'all' ? 'All' : `${getSportMeta(filter).icon} ${getSportMeta(filter).name}`} {sportsOpen ? '▴' : '▾'}
        </Text>
        {sportsOpen ? (
          <View style={st.sportWrap}>
            <SelectChip label="All" active={filter === 'all'} onPress={() => { setFilter('all'); setSportsOpen(false); }} />
            <SportPicker mine={mySports} value={filter === 'all' ? null : filter} onChange={(id) => { setFilter(id); setSportsOpen(false); }} />
          </View>
        ) : null}

        {loading ? (
          <LoadingState label="Loading matches…" />
        ) : list.length === 0 && notFinished.length === 0 && overdue.length === 0 ? (
          <EmptyState
            icon={tab === 'live' ? '📡' : tab === 'upcoming' ? '📅' : '🏁'}
            title={tab === 'live' ? 'No matches are live right now' : tab === 'upcoming' ? 'No upcoming matches' : 'No completed matches yet'}
            hint={view === 'playing' && v.counts.running > 0
              ? `Games you host or score but don’t play in are under ${VIEW_LABEL.running}.`
              : tab === 'live' ? 'Live games will show here the moment scoring starts.' : tab === 'upcoming' ? 'Scheduled games will appear here.' : 'Finished games land here once scored.'}
          />
        ) : (
          <>
            {notFinished.length ? (
              <>
                <Text style={[textStyles.label, st.groupHead]}>Not finished · no score for 12+ hours</Text>
                {notFinished.map((m) => (
                  <MatchCard key={m.id} match={m} note={hostingNote(m, myPlayerId, view)} onPress={() => open(m)} onStart={iScore(m) ? () => open(m, 'scoring') : undefined} />
                ))}
                {list.length ? <Text style={[textStyles.label, st.groupHead]}>Completed</Text> : null}
              </>
            ) : null}
            {list.map((m) => (
              <MatchCard key={m.id} match={m} note={hostingNote(m, myPlayerId, view)} onPress={() => open(m)} onStart={iScore(m) ? () => open(m, 'scoring') : undefined} />
            ))}
            {overdue.length ? (
              <>
                <Text style={[textStyles.label, st.groupHead]}>Overdue · date passed, not played</Text>
                {/* UI audit step 5: the explanation once, not on every card */}
                <Text style={textStyles.muted}>{overdueHint(overdue.length)}</Text>
                {overdue.map((m) => (
                  <MatchCard key={m.id} match={m} note={hostingNote(m, myPlayerId, view)} onPress={() => open(m)} onStart={iScore(m) ? () => open(m, 'scoring') : undefined} />
                ))}
              </>
            ) : null}
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  sportToggle: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small, paddingVertical: theme.spacing(1) },
  sportWrap: { gap: theme.spacing(2) },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  segment: { flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: 3 },
  segBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: theme.spacing(1.5), paddingVertical: theme.spacing(2), borderRadius: theme.radius.pill, alignItems: 'center' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.danger },
  segBtnActive: { backgroundColor: theme.colors.primary },
  segText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  segTextActive: { color: theme.colors.onFill, fontWeight: '800' },
  views: { flexDirection: 'row', gap: theme.spacing(2) },
  groupHead: { color: theme.colors.textMuted, marginTop: theme.spacing(1) },
  filters: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
});
