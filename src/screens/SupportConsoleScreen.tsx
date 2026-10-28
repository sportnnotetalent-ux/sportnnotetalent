/** Support console (2026-10-27) — docs/verification/org-verification.md, "when
 *  there is a support team": every queue on one screen, so several people can
 *  share the work. Tiles for organisations, age proofs and message reports
 *  (waiting, oldest, over a day); the queue, oldest first, with filters; "✋ I'll
 *  check this" claims, so two people don't check the same one (the server
 *  refuses someone else's decision while a claim is fresh); the review card
 *  beside the list on a wide screen; J / K / C / Esc on a desktop browser; and
 *  this week's reviews per person. SportnNote support only. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { Button, Card, EmptyState, FormError, ScreenTitle, SelectChip, TextField, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { isSupport } from '../core/roles';
import { isOverdue, waitedLabel } from '../core/verificationReview';
import {
  NO_FILTER, ORG_GROUP_LABEL, claimStateOf, claimedAgo, filterQueue, moveSelection, shortcutFor,
  type ClaimKind, type ClaimState, type OrgGroup, type QueueFilter, type QueueKey,
} from '../core/supportConsole';
import { getPendingVerifications, type PendingVerification } from '../data/repos';
import { getOrgVerificationQueue, type OrgQueueItem } from '../data/orgVerification';
import { claimItem, getSupportOverview, releaseDemoClaim, releaseItem, type QueueStat, type SupportOverview } from '../data/supportConsole';
import { OrgReview, Submission } from './VerificationReviewScreen';
import type { RootStackParamList } from '../navigation/types';
import { LinkReportsCard } from '../components/LinkReportsCard';
import { IconText } from '../components/Icon';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const REFRESH_MS = 60_000;

const orgKey = (o: OrgQueueItem): QueueKey => ({
  ref: o.orgId, name: o.name, type: o.type,
  waitingSince: o.requestedAt ? Date.parse(o.requestedAt) : undefined,
  text: [o.city, o.type, ...o.ids.map((i) => i.value)].filter(Boolean).join(' '),
});
const ageKey = (p: PendingVerification): QueueKey => ({ ref: p.playerId, name: p.fullName, waitingSince: p.submittedAt, text: p.guardianName });

export default function SupportConsoleScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const staff = isSupport(profile?.role);
  const me = profile?.id;
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [overview, setOverview] = useState<SupportOverview | 'needs-update' | null>(null);
  const [orgs, setOrgs] = useState<OrgQueueItem[]>([]);
  const [ages, setAges] = useState<PendingVerification[]>([]);
  const [tab, setTab] = useState<ClaimKind>('org');
  const [filter, setFilter] = useState<QueueFilter>(NO_FILTER);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshOverview = useCallback(async () => {
    setNow(Date.now());
    try { setOverview(await getSupportOverview()); } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t load the console.'); }
  }, []);
  const load = useCallback(async () => {
    if (!staff) return;
    const [oq, aq] = await Promise.all([getOrgVerificationQueue().catch(() => []), getPendingVerifications().catch(() => [])]);
    setOrgs(oq); setAges(aq);
    await refreshOverview();
  }, [staff, refreshOverview]);
  // On focus, then every minute while open: new requests, colleagues' claims.
  useFocusEffect(useCallback(() => {
    void load();
    const t = setInterval(() => { void load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]));

  // Open on the first queue with something waiting, until support picks one.
  const pickedTab = useRef(false);
  useEffect(() => { if (!pickedTab.current && orgs.length === 0 && ages.length > 0) setTab('age'); }, [orgs.length, ages.length]);
  const pickTab = (k: ClaimKind) => { pickedTab.current = true; setTab(k); setSelected(null); };

  const ov = overview && overview !== 'needs-update' ? overview : null;
  const claims = ov?.claims ?? [];
  const orgList = useMemo(() => filterQueue(orgs, orgKey, filter, claims, 'org', me, now), [orgs, filter, claims, me, now]);
  const ageList = useMemo(() => filterQueue(ages, ageKey, filter, claims, 'age', me, now), [ages, filter, claims, me, now]);
  const refs = tab === 'org' ? orgList.map((o) => o.orgId) : ageList.map((p) => p.playerId);

  const claim = useCallback(async (ref: string, takeOver: boolean, byName?: string) => {
    if (takeOver && !(await askConfirm({
      title: 'Take this over?',
      message: `${byName ?? 'A colleague'} is checking it. It becomes yours, and they’ll see that on their console.`,
      yesLabel: 'Yes, take it over', noLabel: 'No, leave it', tone: 'caution',
    }))) return;
    setError(null); setBusy(true);
    try { await claimItem(tab, ref, takeOver, { id: me, name: profile?.fullName }); await refreshOverview(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t claim it.'); }
    finally { setBusy(false); }
  }, [tab, me, profile?.fullName, refreshOverview]);
  const release = async (ref: string) => {
    setError(null); setBusy(true);
    try { await releaseItem(tab, ref); await refreshOverview(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t release it.'); }
    finally { setBusy(false); }
  };
  const decided = (kind: ClaimKind, ref: string, message: string) => {
    const list = kind === 'org' ? orgList.map((o) => o.orgId) : ageList.map((p) => p.playerId);
    const next = list[list.indexOf(ref) + 1] ?? null;
    if (kind === 'org') setOrgs((l) => l.filter((o) => o.orgId !== ref)); else setAges((l) => l.filter((p) => p.playerId !== ref));
    releaseDemoClaim(kind, ref);
    setNotice(message);
    setSelected(next);
    void refreshOverview();
  };

  // A desktop browser: J / K move through the queue, C claims, Esc closes.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !staff) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      const sc = shortcutFor(e.key, { typing, modified: e.metaKey || e.ctrlKey || e.altKey });
      if (!sc) return;
      e.preventDefault();
      if (sc === 'close') { setSelected(null); return; }
      if (sc === 'claim') { if (selected) void claim(selected, false); return; }
      const j = moveSelection(refs.indexOf(selected ?? ''), refs.length, sc);
      if (j >= 0) setSelected(refs[j]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [refs.join('|'), selected, staff, claim]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!staff) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.content}>
          <ScreenTitle title="🧑‍💼 Support console" />
          <Card><IconText label={"🔒 SportnNote support only"} style={textStyles.body} /></Card>
        </View>
      </SafeAreaView>
    );
  }

  const tileStat = (s: QueueStat | undefined, fallback: number): QueueStat => s ?? { waiting: fallback, overDay: 0 };
  const selOrg = tab === 'org' ? orgs.find((o) => o.orgId === selected) : undefined;
  const selAge = tab === 'age' ? ages.find((p) => p.playerId === selected) : undefined;
  const selState: ClaimState = selected ? claimStateOf(claims, tab, selected, me, now) : { state: 'none' };
  const detail = selected && (selOrg || selAge) ? (
    <View style={st.detail}>
      {overview === 'needs-update' ? null : (
        <ClaimBar state={selState} now={now} busy={busy}
          onClaim={() => void claim(selected, false)}
          onTakeOver={() => void claim(selected, true, selState.state === 'theirs' ? selState.byName : undefined)}
          onRelease={() => void release(selected)} />
      )}
      {selOrg ? (
        <OrgReview key={selOrg.orgId} o={selOrg} now={now}
          onDone={(ok) => decided('org', selOrg.orgId, ok ? `✓ ${selOrg.name} verified — its admins have been told.` : `${selOrg.name} sent back — its admins have been told.`)} />
      ) : null}
      {selAge ? (
        <Submission key={selAge.playerId} p={selAge} now={now}
          onDecided={(s) => decided('age', selAge.playerId, `${s === 'approved' ? '☑️ Approved' : '✗ Sent back'} — ${selAge.fullName} has been notified.`)} />
      ) : null}
    </View>
  ) : null;

  const row = (k: QueueKey, sub: string) => {
    const sel = selected === k.ref;
    const cs = claimStateOf(claims, tab, k.ref, me, now);
    return (
      <View key={k.ref} style={{ gap: theme.spacing(2) }}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: sel }} activeOpacity={0.85}
          onPress={() => setSelected(sel ? null : k.ref)} style={[st.row, sel && st.rowSel]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.rowName} numberOfLines={1}>{k.name}</Text>
            <Text style={st.rowSub} numberOfLines={1}>{sub}</Text>
          </View>
          <View style={st.rowSide}>
            <Text style={[st.wait, isOverdue(k.waitingSince, now) && st.late]}>⏳ {waitedLabel(k.waitingSince, now)}</Text>
            {cs.state !== 'none' ? <Text style={[st.claimTag, cs.state === 'mine' && st.claimMine]} numberOfLines={1}>✋ {cs.state === 'mine' ? 'You' : cs.byName}</Text> : null}
          </View>
        </TouchableOpacity>
        {!wide && sel ? detail : null}
      </View>
    );
  };
  const rows = tab === 'org'
    ? orgList.map((o) => row(orgKey(o), `${o.type ?? 'Organisation'}${o.city ? ` · ${o.city}` : ''}${o.verification?.sentBackBefore ? ` · sent back ${o.verification.sentBackBefore}×` : ''}`))
    : ageList.map((p) => row(ageKey(p), `Age proof${p.guardianName ? ` · guardian ${p.guardianName}` : ''}`));
  const total = tab === 'org' ? orgs.length : ages.length;
  const set = (patch: Partial<QueueFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={[st.content, wide && st.contentWide]} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🧑‍💼 Support console" subtitle="Everything waiting, in one place · aim for the same day" />
        {overview === 'needs-update' ? (
          <Card><Text style={textStyles.muted}>Claims and this week’s counts need the server update (support console). The queues below work as usual.</Text></Card>
        ) : null}

        <View style={st.tiles}>
          <Tile icon="🏛️" label="Organisations" s={tileStat(ov?.orgs, orgs.length)} now={now} active={tab === 'org'} onPress={() => pickTab('org')} />
          <Tile icon="🎂" label="Age proofs" s={tileStat(ov?.age, ages.length)} now={now} active={tab === 'age'} onPress={() => pickTab('age')} />
          {ov?.reports ? <Tile icon="🚩" label="Message reports" s={ov.reports} now={now} onPress={() => nav.navigate('MessageReports')} /> : null}
        </View>

        {notice ? <Text style={st.notice} accessibilityRole="alert">{notice}</Text> : null}
        <FormError message={error} />

        <View style={st.chips}>
          <SelectChip label="All waiting" active={filter.waiting === 'all'} onPress={() => set({ waiting: 'all' })} />
          <SelectChip label="Over a day" active={filter.waiting === 'day'} onPress={() => set({ waiting: 'day' })} />
          {overview === 'needs-update' ? null : (
            <>
              <SelectChip label="Not claimed" active={filter.claimed === 'unclaimed'} onPress={() => set({ claimed: filter.claimed === 'unclaimed' ? 'all' : 'unclaimed' })} />
              <SelectChip label="Mine" active={filter.claimed === 'mine'} onPress={() => set({ claimed: filter.claimed === 'mine' ? 'all' : 'mine' })} />
            </>
          )}
        </View>
        {tab === 'org' ? (
          <View style={st.chips}>
            <SelectChip label="Every kind" active={filter.group === 'all'} onPress={() => set({ group: 'all' })} />
            {(['education', 'sports', 'other'] as OrgGroup[]).map((g) => (
              <SelectChip key={g} label={ORG_GROUP_LABEL[g]} active={filter.group === g} onPress={() => set({ group: g })} />
            ))}
          </View>
        ) : null}
        {total > 6 ? <TextField label="Find" value={filter.q} onChange={(q) => set({ q })} placeholder={tab === 'org' ? 'Name, city or official ID' : 'Name'} /> : null}

        {total === 0 ? (
          <Card><EmptyState icon="🎉" title={tab === 'org' ? 'No organisations waiting' : 'No age proofs waiting'} hint="New requests notify support straight away." compact /></Card>
        ) : rows.length === 0 ? (
          <Text style={textStyles.muted}>Nothing matches these filters.</Text>
        ) : wide ? (
          <View style={st.split}>
            <View style={st.listCol}>{rows}</View>
            <View style={st.detailCol}>{detail ?? <Card><Text style={textStyles.muted}>Pick one from the list (or press J).</Text></Card>}</View>
          </View>
        ) : rows}

        {/* Security Wave 3F: requests a player's side reported */}
        <LinkReportsCard />
        {ov?.week ? (
          <Card style={st.card}>
            <Text style={textStyles.h3}>This week (7 days)</Text>
            {ov.week.length === 0 ? <Text style={textStyles.muted}>No decisions yet this week.</Text> : ov.week.map((w) => (
              <View key={w.by ?? w.name} style={st.weekRow}>
                <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{w.name}</Text>
                <Text style={st.weekNums}>🏛️ {w.orgs} · 🎂 {w.age} · 🚩 {w.reports}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        {Platform.OS === 'web' && wide ? <Text style={st.hint}>Keys: J / K next / previous · C claim · Esc close</Text> : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Tile({ icon, label, s, now, active, onPress }: { icon: string; label: string; s: QueueStat; now: number; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !!active }} activeOpacity={0.85} onPress={onPress}
      style={[st.tile, active && st.tileActive, s.overDay > 0 && st.tileLate]}>
      <Text style={st.tileLabel}>{icon} {label}</Text>
      <Text style={st.tileNum}>{s.waiting}</Text>
      <Text style={[st.tileSub, s.overDay > 0 && st.late]} numberOfLines={1}>
        {s.waiting === 0 ? 'Nothing waiting' : s.overDay > 0 ? `⚠ ${s.overDay} over a day` : `Oldest ${waitedLabel(s.oldest, now)}`}
      </Text>
    </TouchableOpacity>
  );
}

function ClaimBar({ state, now, busy, onClaim, onTakeOver, onRelease }: { state: ClaimState; now: number; busy: boolean; onClaim: () => void; onTakeOver: () => void; onRelease: () => void }) {
  if (state.state === 'none') {
    return (
      <View style={st.claimBar}>
        <Text style={[textStyles.muted, { flex: 1 }]}>Nobody is checking this yet.</Text>
        <Button label={busy ? '…' : '✋ I’ll check this'} onPress={onClaim} disabled={busy} />
      </View>
    );
  }
  if (state.state === 'mine') {
    return (
      <View style={st.claimBar}>
        <Text style={[st.claimText, { flex: 1 }]}>✋ You’re checking this · {claimedAgo(state.at, now)}</Text>
        <Button label="Release" variant="ghost" onPress={onRelease} disabled={busy} />
      </View>
    );
  }
  return (
    <View style={[st.claimBar, st.claimTheirs]}>
      <Text style={[st.claimText, { flex: 1 }]}>✋ Being checked by {state.byName} · {claimedAgo(state.at, now)}. Take it over before deciding.</Text>
      <Button label="Take over" variant="ghost" onPress={onTakeOver} disabled={busy} />
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  contentWide: { maxWidth: 1280, width: '100%', alignSelf: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  tile: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 2, padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  tileActive: { borderColor: theme.colors.primary },
  tileLate: { borderColor: theme.colors.danger },
  tileLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  tileNum: { color: theme.colors.text, fontSize: 28, fontWeight: '800' },
  tileSub: { color: theme.colors.textMuted, fontSize: theme.font.small },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  notice: { color: theme.colors.primary, fontWeight: '700' },
  split: { flexDirection: 'row', gap: theme.spacing(3), alignItems: 'flex-start' },
  listCol: { flex: 1, maxWidth: 440, gap: theme.spacing(2) },
  detailCol: { flex: 1.5, minWidth: 0 },
  detail: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  rowSel: { borderColor: theme.colors.primary },
  rowName: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body },
  rowSub: { color: theme.colors.textMuted, fontSize: theme.font.small },
  rowSide: { alignItems: 'flex-end', gap: 2, maxWidth: 130 },
  wait: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  late: { color: theme.colors.danger },
  claimTag: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  claimMine: { color: theme.colors.primary },
  claimBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  claimTheirs: { borderColor: theme.colors.danger },
  claimText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  card: { gap: theme.spacing(2) },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  weekNums: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
});
