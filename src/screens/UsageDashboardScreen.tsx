/** Usage dashboard (founder 2026-11-06, docs/security/breaks/usage-dashboard.md):
 *  support / admin only, live on every open and Refresh. Eight numbers with an
 *  8-week trend, today's counts, games by sport — and the people behind them:
 *  tap New sign-ups, Activation, Games scored or Weekly active users for the
 *  list, then a person's profile or a game. Under-18s are marked; no contact
 *  details. Sign-ups show which link they came from (signup-source.md). */
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { Button, Card, EmptyState, FormError, LoadingState, ScreenTitle, textStyles } from '../components/ui';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { isSupport } from '../core/roles';
import { usageTiles, type Tile } from '../core/usageKpis';
import { getUsageDashboard, getUsagePeople, type UsageDashboard, type UsageGame, type UsageKind, type UsagePerson } from '../data/usage';
import { getSportMeta } from '../sports/sportMeta';
import { sourceLabel } from '../core/signupSource';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const LIST_TITLE: Record<UsageKind, string> = {
  signups: 'New sign-ups this week', inactive: 'Not activated yet (joined 7+ days ago, no game)',
  games: 'Games scored this week', active: 'Active this week (people who share usage data)',
};
const plural = (n: number | undefined, one: string) => `${n ?? 0} ${one}${(n ?? 0) === 1 ? '' : 's'}`;
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

/** A small 8-week bar trend (oldest → newest); "—" weeks draw nothing. */
function Trend({ values }: { values: (number | null)[] }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <View style={st.trend} accessible={false}>
      {values.map((v, i) => (
        <View key={i} style={[st.bar, { height: v === null ? 2 : Math.max(2, Math.round((24 * v) / max)), opacity: i === values.length - 1 ? 1 : 0.45 }]} />
      ))}
    </View>
  );
}

export default function UsageDashboardScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const [data, setData] = useState<UsageDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<Date | null>(null);
  const [list, setList] = useState<UsageKind | null>(null);
  const [rows, setRows] = useState<(UsagePerson | UsageGame)[] | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      setData(await getUsageDashboard(8));
      setAt(new Date());
      if (list) setRows(await getUsagePeople(list));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load usage.');
    } finally { setBusy(false); }
  }, [list]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = async (k: UsageKind) => {
    if (list === k) { setList(null); setRows(null); return; }
    setList(k); setRows(null);
    try { setRows(await getUsagePeople(k)); } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t load the list.'); }
  };

  if (!isSupport(profile?.role)) {
    return <SafeAreaView style={st.safe}><EmptyState icon="🔒" title="Support only" hint="The usage dashboard is for the SportnNote team." /></SafeAreaView>;
  }
  const tiles: Tile[] = data ? usageTiles(data.weeks) : [];
  const today = data?.today ?? {};

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="📈 Usage" subtitle={at ? `Live · updated ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Live from the app'} />
        <Button label={busy ? 'Refreshing…' : '↻ Refresh'} variant="ghost" disabled={busy} onPress={() => void load()} />
        <FormError message={error} />
        {!data && busy ? <LoadingState label="Counting…" /> : null}

        {data ? (
          <>
            <Card style={st.today}>
              <Text style={textStyles.h3}>Today</Text>
              <Text style={textStyles.body}>
                {[plural(today.sign_ups, 'sign-up'), `${plural(today.games_scored, 'game')} scored`, `${today.active_users ?? 0} active`, `${plural(today.tournaments, 'tournament')} made`].join(' · ')}
              </Text>
            </Card>

            <View style={st.grid}>
              {tiles.map((t) => {
                const k = t.list;
                const body = (
                  <Card style={[st.tile, k && list === k ? st.tileOn : null]}>
                    <Text style={st.tileLabel}>{t.label}</Text>
                    <Text style={st.tileValue}>{t.value}</Text>
                    <Trend values={t.trend} />
                    {t.delta ? <Text style={st.delta}>{t.delta}</Text> : null}
                    {t.note ? <Text style={st.note}>{t.note}</Text> : null}
                    {k ? <Text style={st.link}>{list === k ? 'Hide list' : 'See who ›'}</Text> : null}
                  </Card>
                );
                return k ? (
                  <TouchableOpacity key={t.key} style={st.cell} accessibilityRole="button" accessibilityLabel={`${t.label}: ${t.value}. Show the list`} onPress={() => void open(k)}>{body}</TouchableOpacity>
                ) : <View key={t.key} style={st.cell}>{body}</View>;
              })}
            </View>

            {list ? (
              <Card style={st.list}>
                <Text style={textStyles.h3}>{LIST_TITLE[list]}</Text>
                {rows === null ? <LoadingState /> : rows.length === 0 ? <Text style={textStyles.muted}>No one yet.</Text> : rows.map((r, i) => {
                  if (list === 'games') {
                    const g = r as UsageGame;
                    const meta = getSportMeta(g.sport as SportId);
                    return (
                      <TouchableOpacity key={g.match_id ?? i} accessibilityRole="button" style={st.row}
                        onPress={() => nav.navigate('LiveScoring', { matchId: g.match_id, sport: g.sport as SportId, homeName: g.home ?? '', awayName: g.away ?? '', canScore: false })}>
                        <Text style={textStyles.body}>{meta?.icon ?? ''} {g.home ?? '?'} v {g.away ?? '?'}</Text>
                        <Text style={textStyles.muted}>{when(g.at)}{g.tournament ? ` · ${g.tournament}` : ''} · {g.steps ?? 0} steps scored ›</Text>
                      </TouchableOpacity>
                    );
                  }
                  const p = r as UsagePerson;
                  const line = list === 'active'
                    ? `last seen ${when(p.last_seen)} · ${p.opens ?? 0} opens`
                    : [`joined ${when(p.joined)}`, p.city, (p.sports ?? []).map((s) => getSportMeta(s as SportId)?.icon ?? '').join(' '),
                      p.phone_verified ? '📱 verified' : 'phone not verified', plural(p.games, 'game'),
                      `from: ${sourceLabel(p.source)}${p.source_detail ? ` (${p.source_detail})` : ''}`].filter(Boolean).join(' · ');
                  return (
                    <TouchableOpacity key={p.player_id ?? `${p.name}-${i}`} accessibilityRole="button" style={st.row} disabled={!p.player_id}
                      onPress={() => p.player_id && nav.navigate('PlayerProfile', { playerId: p.player_id })}>
                      <Text style={textStyles.body}>{p.name ?? 'Unnamed'}{p.minor ? '  · under 18' : ''}</Text>
                      <Text style={textStyles.muted}>{line}{p.player_id ? ' ›' : ' · no player profile yet'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </Card>
            ) : null}

            {data.by_source ? (
              <Card style={st.list}>
                <Text style={textStyles.h3}>Where sign-ups came from · last 4 weeks</Text>
                {data.by_source.length ? data.by_source.map((x) => (
                  <Text key={x.kind} style={textStyles.body}>{sourceLabel(x.kind)} · {x.signups}</Text>
                )) : <Text style={textStyles.muted}>No sign-ups yet.</Text>}
              </Card>
            ) : null}

            <Card style={st.list}>
              <Text style={textStyles.h3}>Games by sport · last 4 weeks</Text>
              {data.by_sport.length ? data.by_sport.map((x) => (
                <Text key={x.sport} style={textStyles.body}>{getSportMeta(x.sport as SportId)?.icon ?? ''} {getSportMeta(x.sport as SportId)?.name ?? x.sport} · {x.games}</Text>
              )) : <Text style={textStyles.muted}>No games scored yet.</Text>}
            </Card>
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10) },
  today: { gap: theme.spacing(1) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  cell: { flexBasis: '47%', flexGrow: 1 },
  tile: { gap: theme.spacing(1), minHeight: 150 },
  tileOn: { borderWidth: 2, borderColor: theme.colors.primary },
  tileLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  tileValue: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900' },
  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26 },
  bar: { width: 8, borderRadius: 2, backgroundColor: theme.colors.primary },
  delta: { color: theme.colors.text, fontSize: theme.font.small },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  list: { gap: theme.spacing(2) },
  row: { paddingVertical: theme.spacing(1.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, gap: 2 },
});
