/** Usage dashboard (founder 2026-11-06, docs/security/breaks/usage-dashboard.md):
 *  support / admin only, live on every open and Refresh. Eight numbers with a
 *  trend, today's counts, games by sport — and the people behind them: tap New
 *  sign-ups, Activation, Games scored or Active users for the list, then a
 *  person's profile or a game. Under-18s are marked; no contact details.
 *  Sign-ups show which link they came from (signup-source.md).
 *  Filters (usage-filters.md): a period, and any sports and places. */
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { Button, Card, EmptyState, FormError, LoadingState, ScreenTitle, SelectChip, textStyles } from '../components/ui';
import { DateField } from '../components/DateTimeField';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { isSupport } from '../core/roles';
import { reportTiles, type Tile } from '../core/usageKpis';
import { PERIOD_PRESETS, filterSummary, periodRange, rangeProblem, toggleIn, todayIST, type PeriodPreset } from '../core/usageFilters';
import { getUsageReport, getUsageReportPeople, type UsageFilter, type UsageGame, type UsageKind, type UsagePerson, type UsageReport } from '../data/usage';
import { SPORT_LIST, getSportMeta } from '../sports/sportMeta';
import { sourceLabel } from '../core/signupSource';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const LIST_TITLE: Record<UsageKind, string> = {
  signups: 'New sign-ups', inactive: 'Not activated yet (joined 7+ days ago, no game)',
  games: 'Games scored', active: 'Active (people who share usage data)',
};
const plural = (n: number | undefined, one: string) => `${n ?? 0} ${one}${(n ?? 0) === 1 ? '' : 's'}`;
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** A small bar trend (oldest → newest); "—" points draw nothing. */
function Trend({ values }: { values: (number | null)[] }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  const w = values.length > 16 ? 3 : 8;
  return (
    <View style={st.trend} accessible={false}>
      {values.map((v, i) => (
        <View key={i} style={[st.bar, { width: w, height: v === null ? 2 : Math.max(2, Math.round((24 * v) / max)), opacity: i === values.length - 1 ? 1 : 0.45 }]} />
      ))}
    </View>
  );
}

export default function UsageDashboardScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const [preset, setPreset] = useState<PeriodPreset>('7d');
  const [custom, setCustom] = useState(() => periodRange('30d', todayIST()));
  const [draft, setDraft] = useState(custom);
  const [sports, setSports] = useState<string[]>([]);
  const [cities, setCities] = useState<number[]>([]);
  const [open, setOpen] = useState<'sports' | 'places' | null>(null);
  const [data, setData] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<Date | null>(null);
  const [list, setList] = useState<UsageKind | null>(null);
  const [rows, setRows] = useState<(UsagePerson | UsageGame)[] | null>(null);

  const range = periodRange(preset, todayIST(), custom);
  const filter: UsageFilter = { ...range, sports, cities };
  const key = JSON.stringify(filter);

  const load = useCallback(async () => {
    const f = JSON.parse(key) as UsageFilter;
    setBusy(true); setError(null);
    try {
      setData(await getUsageReport(f));
      setAt(new Date());
      if (list) setRows(await getUsageReportPeople(list, f));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load usage.');
    } finally { setBusy(false); }
  }, [key, list]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const showList = async (k: UsageKind) => {
    if (list === k) { setList(null); setRows(null); return; }
    setList(k); setRows(null);
    try { setRows(await getUsageReportPeople(k, filter)); } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t load the list.'); }
  };

  if (!isSupport(profile?.role)) {
    return <SafeAreaView style={st.safe}><EmptyState icon="🔒" title="Support only" hint="The usage dashboard is for the SportnNote team." /></SafeAreaView>;
  }
  const filtered = sports.length > 0 || cities.length > 0;
  const tiles: Tile[] = data ? reportTiles(data, filtered) : [];
  const today = data?.today ?? {};
  const places = data?.places ?? [];
  const draftProblem = rangeProblem(draft.from, draft.to, todayIST());
  const periodLabel = preset === 'custom' ? `${day(range.from)} – ${day(range.to)}` : PERIOD_PRESETS.find((p) => p.key === preset)?.label ?? '';
  const sportNames = sports.map((s) => getSportMeta(s as SportId)?.name ?? s);
  const placeNames = cities.map((c) => places.find((p) => p.id === c)?.name ?? 'Unknown');

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="📈 Usage" subtitle={at ? `Live · updated ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Live from the app'} />

        <Card style={st.filters}>
          <Text style={textStyles.h3}>Period</Text>
          <View style={st.chips}>
            {PERIOD_PRESETS.map((p) => (
              <SelectChip key={p.key} label={p.label} active={preset === p.key} onPress={() => { setPreset(p.key); if (p.key === 'custom') setDraft(custom); }} />
            ))}
          </View>
          {preset === 'custom' ? (
            <View style={st.custom}>
              <DateField label="From" value={draft.from} onChange={(from) => setDraft((d) => ({ ...d, from }))} />
              <DateField label="To" value={draft.to} onChange={(to) => setDraft((d) => ({ ...d, to }))} />
              <FormError message={draftProblem} />
              <Button variant="primary" label="Show this period" disabled={!!draftProblem || (draft.from === custom.from && draft.to === custom.to)} onPress={() => setCustom(draft)} />
            </View>
          ) : null}

          <TouchableOpacity style={st.pick} accessibilityRole="button" accessibilityState={{ expanded: open === 'sports' }} onPress={() => setOpen(open === 'sports' ? null : 'sports')}>
            <Text style={textStyles.h3}>Sport</Text>
            <Text style={st.pickValue}>{sports.length ? sportNames.join(', ') : 'All sports'} {open === 'sports' ? '▴' : '▾'}</Text>
          </TouchableOpacity>
          {open === 'sports' ? (
            <View style={st.chips}>
              <SelectChip label="All sports" active={!sports.length} onPress={() => setSports([])} />
              {SPORT_LIST.map((m) => (
                <SelectChip key={m.id} label={`${m.icon} ${m.name}`} active={sports.includes(m.id)} onPress={() => setSports((s) => toggleIn(s, m.id))} />
              ))}
            </View>
          ) : null}

          <TouchableOpacity style={st.pick} accessibilityRole="button" accessibilityState={{ expanded: open === 'places' }} onPress={() => setOpen(open === 'places' ? null : 'places')}>
            <Text style={textStyles.h3}>Location</Text>
            <Text style={st.pickValue}>{cities.length ? placeNames.join(', ') : 'All places'} {open === 'places' ? '▴' : '▾'}</Text>
          </TouchableOpacity>
          {open === 'places' ? (
            <View style={st.chips}>
              <SelectChip label="All places" active={!cities.length} onPress={() => setCities([])} />
              {places.map((p) => (
                <SelectChip key={p.id} label={`${p.name} · ${p.people}`} accessibilityLabel={`${p.name}, ${p.people} ${p.people === 1 ? 'person' : 'people'}, ${plural(p.games, 'game')}`}
                  active={cities.includes(p.id)} onPress={() => setCities((c) => toggleIn(c, p.id))} />
              ))}
              <Text style={st.note}>Number = people based there. A game counts where its tournament is, else where the people running it are.</Text>
            </View>
          ) : null}

          <Text style={textStyles.muted}>{periodLabel} · {filterSummary(sportNames, placeNames)}</Text>
          <Button label={busy ? 'Refreshing…' : '↻ Refresh'} variant="ghost" disabled={busy} onPress={() => void load()} />
        </Card>

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
                  <TouchableOpacity key={t.key} style={st.cell} accessibilityRole="button" accessibilityLabel={`${t.label}: ${t.value}. Show the list`} onPress={() => void showList(k)}>{body}</TouchableOpacity>
                ) : <View key={t.key} style={st.cell}>{body}</View>;
              })}
            </View>

            {list ? (
              <Card style={st.list}>
                <Text style={textStyles.h3}>{LIST_TITLE[list]} · {periodLabel}</Text>
                {rows === null ? <LoadingState /> : rows.length === 0 ? <Text style={textStyles.muted}>No one yet.</Text> : rows.map((r, i) => {
                  if (list === 'games') {
                    const g = r as UsageGame;
                    const meta = getSportMeta(g.sport as SportId);
                    return (
                      <TouchableOpacity key={g.match_id ?? i} accessibilityRole="button" style={st.row}
                        onPress={() => nav.navigate('LiveScoring', { matchId: g.match_id, sport: g.sport as SportId, homeName: g.home ?? '', awayName: g.away ?? '', canScore: false })}>
                        <Text style={textStyles.body}>{meta?.icon ?? ''} {g.home ?? '?'} v {g.away ?? '?'}</Text>
                        <Text style={textStyles.muted}>{[when(g.at), g.tournament, g.city, `${g.steps ?? 0} steps scored ›`].filter(Boolean).join(' · ')}</Text>
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

            <Card style={st.list}>
              <Text style={textStyles.h3}>Where sign-ups came from · {periodLabel}</Text>
              {data.by_source.length ? data.by_source.map((x) => (
                <Text key={x.kind} style={textStyles.body}>{sourceLabel(x.kind)} · {x.signups}</Text>
              )) : <Text style={textStyles.muted}>No sign-ups in this period.</Text>}
            </Card>

            <Card style={st.list}>
              <Text style={textStyles.h3}>Games by sport · {periodLabel}</Text>
              {data.by_sport.length ? data.by_sport.map((x) => (
                <Text key={x.sport} style={textStyles.body}>{getSportMeta(x.sport as SportId)?.icon ?? ''} {getSportMeta(x.sport as SportId)?.name ?? x.sport} · {x.games}</Text>
              )) : <Text style={textStyles.muted}>No games scored in this period.</Text>}
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
  filters: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1.5) },
  custom: { gap: theme.spacing(2) },
  pick: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1),
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  pickValue: { color: theme.colors.primary, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  today: { gap: theme.spacing(1) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  cell: { flexBasis: '47%', flexGrow: 1 },
  tile: { gap: theme.spacing(1), minHeight: 150 },
  tileOn: { borderWidth: 2, borderColor: theme.colors.primary },
  tileLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  tileValue: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900' },
  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 26 },
  bar: { borderRadius: 2, backgroundColor: theme.colors.primary },
  delta: { color: theme.colors.text, fontSize: theme.font.small },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  list: { gap: theme.spacing(2) },
  row: { paddingVertical: theme.spacing(1.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, gap: 2 },
});
