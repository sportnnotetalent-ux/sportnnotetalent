/** Link an earlier edition (2026-10-27): a tournament run before "Run it again"
 *  existed (last year's school meet) is linked as the edition before this one,
 *  so both pages list every edition. Only tournaments the organiser also runs,
 *  that started earlier and aren't already followed by another edition; the
 *  same event by name is suggested first. The server re-checks all of it
 *  (link_tournament_edition). */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { Button, Card, EmptyState, FormError, LoadingState, ScreenTitle, TextField, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { canManageTournament } from '../core/org';
import { spelledDate } from '../core/region';
import { useOrganizations, useTournamentById } from '../data/hooks';
import { getMyPlayerId, getTournaments, isNeedsDbUpdate } from '../data/repos';
import { followedTournamentIds, getEditions, linkEdition } from '../data/tournamentCopy';
import { editionCandidates, previousEditionOf, type EditionRow } from '../data/tournamentCopyPlan';
import type { Tournament } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const SHOW = 8;

export default function LinkEditionScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'LinkEdition'>>();
  const { profile } = useAuth();
  const orgs = useOrganizations();
  const tournament = useTournamentById(params.tournamentId);
  const [myId, setMyId] = useState<string | null>(null);
  const [all, setAll] = useState<Tournament[] | null>(null);
  const [editions, setEditions] = useState<(EditionRow & { label: string })[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!tournament) return;
    void getMyPlayerId(profile?.id).then(setMyId).catch(() => setMyId(null));
    void Promise.all([getTournaments(), followedTournamentIds(), getEditions(tournament)])
      .then(([list, f, eds]) => { setAll(list); setFollowed(f); setEditions(eds); })
      .catch(() => setAll([]));
  }, [tournament?.id, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canManage = useCallback((t: Tournament) => canManageTournament(t, orgs, myId, profile?.id), [orgs, myId, profile?.id]);
  const candidates = useMemo(() => {
    if (!tournament || !all) return [];
    return editionCandidates(tournament, all, { canManage, inSeries: new Set(editions.map((e) => e.id)), followed });
  }, [tournament, all, canManage, editions, followed]);
  const q = query.trim().toLowerCase();
  const shown = candidates.filter((c) => !q || c.t.name.toLowerCase().includes(q));

  if (!tournament || !all) return <LoadingState />;
  const prev = previousEditionOf(editions, tournament.id);
  const mine = canManage(tournament);

  const failed = (e: unknown) => setError(isNeedsDbUpdate(e) ? 'Linking editions needs a server update first — ask SportnNote support.' : e instanceof Error ? e.message : 'Couldn’t save that. Please try again.');
  const link = async (t: Tournament) => {
    const ok = await askConfirm({
      title: `Link ${t.name}?`,
      message: `It becomes the edition before ${tournament.name}, and both pages list every edition. You can unlink it later.`,
      yesLabel: 'Yes, link it', noLabel: 'No, go back', tone: 'caution',
    });
    if (!ok) return;
    setError(null); setBusy(true);
    try {
      await linkEdition(tournament.id, t.id, { playerId: myId ?? undefined, name: profile?.fullName, previousName: t.name });
      setDone(`🔗 Linked — ${t.name} is now the edition before this one.`);
      load();
    } catch (e) { failed(e); } finally { setBusy(false); }
  };
  const unlink = async () => {
    if (!prev) return;
    const ok = await askConfirm({
      title: `Unlink ${prev.name}?`,
      message: `${tournament.name} stops showing it as the earlier edition (and the other way round). Nothing else changes.`,
      yesLabel: 'Yes, unlink', noLabel: 'No, keep it', tone: 'caution',
    });
    if (!ok) return;
    setError(null); setBusy(true);
    try {
      await linkEdition(tournament.id, null, { playerId: myId ?? undefined, name: profile?.fullName });
      setDone('Unlinked.');
      load();
    } catch (e) { failed(e); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🔗 Link an earlier edition" subtitle={tournament.name} />
        {!mine ? (
          <Card><Text style={textStyles.body}>Only this tournament’s organisers can link its editions.</Text></Card>
        ) : (
          <>
            <Text style={textStyles.muted}>Ran this event before, without 🔁 Run it again? Link last time’s tournament, and both pages show 📅 Every edition.</Text>
            {done ? <Text style={st.done} accessibilityRole="alert">{done}</Text> : null}
            <FormError message={error} />

            {prev ? (
              <Card style={st.card}>
                <Text style={textStyles.h3}>Earlier edition</Text>
                <Text style={textStyles.body}>{prev.name}</Text>
                <Text style={textStyles.muted}>Started {spelledDate(prev.startDate)}</Text>
                <View style={st.row}>
                  <Button label="Open it" variant="ghost" onPress={() => nav.push('Tournament', { tournamentId: prev.id })} />
                  <Button label={busy ? 'Saving…' : 'Unlink'} variant="ghost" onPress={() => void unlink()} disabled={busy} />
                </View>
                <Text style={textStyles.muted}>To link a different one, unlink this first.</Text>
              </Card>
            ) : candidates.length === 0 ? (
              <Card>
                <EmptyState icon="🔗" title="No earlier tournaments to link" hint="You can link a tournament you also organise, that started before this one and isn’t already followed by another edition." compact />
              </Card>
            ) : (
              <>
                {candidates.length > SHOW ? <TextField label="Find a tournament" value={query} onChange={setQuery} placeholder="Name" /> : null}
                {(more || q ? shown : shown.slice(0, SHOW)).map(({ t, sameName }) => (
                  <Card key={t.id} style={st.card}>
                    {sameName ? <Text style={st.same}>Looks like the same event</Text> : null}
                    <Text style={textStyles.body}>{t.name}</Text>
                    <Text style={textStyles.muted}>{spelledDate(t.startDate)} · {t.hostName}</Text>
                    <Button label={busy ? 'Saving…' : '🔗 Link as the earlier edition'} variant={sameName ? 'primary' : 'ghost'} onPress={() => void link(t)} disabled={busy} />
                  </Card>
                ))}
                {!more && !q && shown.length > SHOW ? <Text style={st.link} accessibilityRole="button" onPress={() => setMore(true)}>Show all {shown.length} ›</Text> : null}
                {q && !shown.length ? <Text style={textStyles.muted}>No tournament of yours matches “{query.trim()}”.</Text> : null}
              </>
            )}
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  card: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  same: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  done: { color: theme.colors.primary, fontWeight: '700' },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
});
