/** School hall of fame (app.sportnnote.in/h/ORG) — a school's / club's honours
 *  year by year: verified ones from certificates its students earned, ones the
 *  school added itself, and the events it hosted. Private until an Owner /
 *  Admin publishes it; under-18s show as initials to the public.
 *  Migration 20261025130000_hall_of_fame. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { theme } from '../core/theme';
import { Button, Card, EmptyState, FormError, LoadingState, SelectChip, TextField, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import { APP_URL } from '../core/hosts';
import { shareMessage } from '../core/share';
import { readableDob } from '../core/verificationReview';
import {
  HONOUR_KINDS, HONOUR_KIND_LABEL, HONOUR_LEVELS, HONOUR_LEVEL_LABEL, entryMeta, filterBySport, hallCounts, hallSports,
  hallUrl, hallYears, honourIcon, peopleLine, type HallEntry, type HonourKind, type HonourLevel,
} from '../core/hallOfFame';
import { SPORT_LIST } from '../sports/sportMeta';
import { deleteHonour, getHallOfFame, printHall, saveHonour, setHallPublic, sportName, type Hall, type HonourDraft } from '../data/hallOfFame';
import { getOrganization, getPlayerNamesById } from '../data/repos';
import type { RootStackParamList } from '../navigation/types';

const HOSTED_CAP = 8;

export default function HallOfFameScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'HallOfFame'>>();
  const orgId = params?.orgId ?? '';
  const [hall, setHall] = useState<Hall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [busy, setBusy] = useState<'publish' | 'print' | null>(null);
  const [editing, setEditing] = useState<HallEntry | 'new' | null>(null);
  const [allHosted, setAllHosted] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { setHall(await getHallOfFame(orgId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t open it just now.'); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  const sports = useMemo(() => hallSports(hall?.entries ?? []), [hall]);
  const shown = useMemo(() => filterBySport(hall?.entries ?? [], sport), [hall, sport]);
  const counts = hallCounts(shown);
  const nameOf = (id: string) => hall?.names.get(id);

  if (!hall) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        {error ? <View style={st.content}><FormError message={error} /><Button label="Try again" onPress={() => void load()} /></View> : <LoadingState label="Opening the hall of fame…" />}
      </SafeAreaView>
    );
  }
  if (!hall.found || !hall.org) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><EmptyState icon="🏛️" title="No school or club here" hint="The link may be wrong — ask the school for theirs." /></SafeAreaView>;
  }
  const org = hall.org;
  const link = hallUrl(org.id, APP_URL);

  const publish = async (on: boolean) => {
    if (on && !(await askConfirm({ title: 'Publish the hall of fame?', message: 'Anyone with the link will see it — students who may be under 18 show as initials.', yesLabel: 'Yes, publish', noLabel: 'Not now', tone: 'caution' }))) return;
    setBusy('publish');
    try { await setHallPublic(org.id, on); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t change it.'); }
    finally { setBusy(null); }
  };
  const print = async () => {
    setBusy('print');
    try { await printHall(hall, shown); } finally { setBusy(null); }
  };
  const share = () => void shareMessage(`${org.name} — hall of fame on SportnNote: our titles, medals and awards. ${link}`, 'results');

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <Card style={[{ gap: theme.spacing(2) }, st.gold]}>
          <View style={st.headRow}>
            {org.logoUrl ? <Image source={{ uri: org.logoUrl }} style={st.logo} /> : <Text style={st.logoEmoji}>🏛️</Text>}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={st.kicker}>🏆 HALL OF FAME</Text>
              <Text style={textStyles.h1}>{org.name}</Text>
              <Text style={textStyles.muted}>{[org.type, org.city, org.verified ? '✓ Verified school / club' : ''].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          {hall.visible ? (
            <View style={st.tiles}>
              <Tile value={counts.titles} label="Titles" />
              <Tile value={counts.podiums} label="Runners-up & third" />
              <Tile value={counts.medals} label="Medals" />
              <Tile value={counts.awards} label="Awards" />
              <Tile value={hall.hosted.length} label="Events hosted" />
            </View>
          ) : null}
        </Card>

        {!hall.visible ? (
          <Card style={{ gap: theme.spacing(1) }}>
            <Text style={textStyles.h3}>🔒 Not published yet</Text>
            <Text style={textStyles.muted}>{org.name} hasn’t made its hall of fame public. Its members can see it in the app.</Text>
          </Card>
        ) : null}

        {hall.canEdit ? (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>{hall.public ? '🌐 Published' : '🔒 Private'}</Text>
            <Text style={textStyles.muted}>
              {hall.public
                ? 'Anyone with the link sees it — share it on your website, WhatsApp groups and newsletters.'
                : 'Only your school’s members see it. Publish it to share the link with parents and the public.'}
            </Text>
            {hall.public ? <Button label="↗ Share the link" onPress={share} /> : <Button label={busy === 'publish' ? 'Publishing…' : '🌐 Publish'} onPress={() => void publish(true)} disabled={!!busy} />}
            <Button label={busy === 'print' ? 'Opening…' : '🖨 Print honours board'} variant="ghost" onPress={() => void print()} disabled={!!busy} />
            <Button label="＋ Add an honour" variant="ghost" onPress={() => setEditing('new')} disabled={!!editing} />
            {hall.public ? <Button label={busy === 'publish' ? 'Saving…' : 'Make private'} variant="ghost" onPress={() => void publish(false)} disabled={!!busy} /> : null}
            <FormError message={error} />
          </Card>
        ) : hall.member && !hall.public ? (
          <Text style={textStyles.muted}>Only the school’s members see this until an admin publishes it.</Text>
        ) : null}

        {editing ? (
          <HonourEditor
            orgId={org.id}
            entry={editing === 'new' ? undefined : editing}
            onDone={async (changed) => { setEditing(null); if (changed) await load(); }}
          />
        ) : null}

        {hall.visible && sports.length > 1 ? (
          <View style={st.chips}>
            <SelectChip label="All sports" active={!sport} onPress={() => setSport(null)} />
            {sports.map((s) => <SelectChip key={s} label={sportName(s)} active={sport === s} onPress={() => setSport(sport === s ? null : s)} />)}
          </View>
        ) : null}

        {hall.visible && !shown.length ? (
          <EmptyState
            icon="🏆"
            title="No honours yet"
            hint={hall.canEdit ? 'Issue certificates after your tournaments — your students’ titles and medals appear here by themselves. Add past honours with “Add an honour”.' : undefined}
          />
        ) : null}

        {hall.visible ? hallYears(shown).map((y) => (
          <View key={y.year} style={{ gap: theme.spacing(2) }}>
            <Text style={st.year}>{y.year || 'Earlier'}</Text>
            {y.entries.map((e) => (
              <Card key={e.key} style={st.entry}>
                <Text style={st.icon}>{honourIcon(e.kind, e.title)}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[textStyles.body, { fontWeight: '700' }]}>{e.title}</Text>
                  {entryMeta(e, sportName) ? <Text style={textStyles.muted}>{entryMeta(e, sportName)}</Text> : null}
                  {e.playerIds.length ? <Text style={textStyles.body}>{peopleLine(e.playerIds, nameOf)}</Text> : null}
                  {e.note ? <Text style={textStyles.muted}>{e.note}</Text> : null}
                  <View style={st.tagRow}>
                    <Text style={e.source === 'verified' ? st.verified : st.added}>{e.source === 'verified' ? '✓ Verified certificate' : 'Added by the school'}</Text>
                    {e.date ? <Text style={textStyles.muted}>{readableDob(e.date)}</Text> : null}
                    {e.tournamentId ? <Text style={st.link} accessibilityRole="link" onPress={() => nav.navigate('Tournament', { tournamentId: e.tournamentId! })}>See event ›</Text> : null}
                    {hall.canEdit && e.source === 'school' ? <Text style={st.link} accessibilityRole="button" onPress={() => setEditing(e)}>✎ Edit</Text> : null}
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )) : null}

        {hall.visible && hall.hosted.length ? (
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>Events hosted · {hall.hosted.length}</Text>
            {(allHosted ? hall.hosted : hall.hosted.slice(0, HOSTED_CAP)).map((t) => (
              <Card key={t.id} style={st.hosted}>
                <View style={{ flex: 1 }}>
                  <Text style={[textStyles.body, { fontWeight: '700' }]} onPress={() => nav.navigate('Tournament', { tournamentId: t.id })}>{t.name}</Text>
                  <Text style={textStyles.muted}>{[t.startDate ? readableDob(t.startDate) : '', (t.sports ?? []).map(sportName).join(', ')].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={st.link} onPress={() => nav.navigate('Tournament', { tournamentId: t.id })}>›</Text>
              </Card>
            ))}
            {hall.hosted.length > HOSTED_CAP ? <Button label={allHosted ? 'Show fewer' : `Show all ${hall.hosted.length}`} variant="ghost" onPress={() => setAllHosted((v) => !v)} /> : null}
          </View>
        ) : null}

        {hall.visible ? (
          <Text style={textStyles.muted}>
            “Verified” honours come from certificates the organisers issued on SportnNote to the school’s students. Under-18s show as initials to the public.
          </Text>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <View style={st.tile}>
      <Text style={st.tileValue}>{value}</Text>
      <Text style={[textStyles.muted, { textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

/** Add / edit an honour the school records itself (past years, outside events). */
function HonourEditor({ orgId, entry, onDone }: { orgId: string; entry?: HallEntry; onDone: (changed: boolean) => void | Promise<void> }) {
  const [year, setYear] = useState(String(entry?.year || new Date().getFullYear()));
  const [kind, setKind] = useState<HonourKind>(entry?.kind ?? 'champion');
  const [title, setTitle] = useState(entry?.title ?? '');
  const [sport, setSport] = useState<string | undefined>(entry?.sport);
  const [level, setLevel] = useState<HonourLevel | undefined>(entry?.level);
  const [team, setTeam] = useState(entry?.team ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [picked, setPicked] = useState<string[]>(entry?.playerIds ?? []);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    void (async () => {
      const org = await getOrganization(orgId);
      const ids = [...new Set((org?.members ?? []).map((m) => m.playerId))];
      const names = await getPlayerNamesById(ids);
      if (on) setMembers(ids.map((id) => ({ id, name: names.get(id) ?? 'Member' })).sort((a, b) => a.name.localeCompare(b.name)));
    })();
    return () => { on = false; };
  }, [orgId]);

  const q = search.trim().toLowerCase();
  const matches = members.filter((m) => !picked.includes(m.id) && (!q || m.name.toLowerCase().includes(q))).slice(0, 12);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Member';

  const save = async () => {
    if (!/^\d{4}$/.test(year.trim())) { setError('Type the year, e.g. 2019.'); return; }
    if (!title.trim()) { setError('Give the honour a title, e.g. “District Football Champions — U14 Boys”.'); return; }
    setBusy(true); setError(null);
    const draft: HonourDraft = { year: Number(year.trim()), kind, title, sport, level, teamLabel: team, playerIds: picked, note };
    try { await saveHonour(orgId, draft, entry?.id); await onDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t save it.'); setBusy(false); }
  };
  const remove = async () => {
    if (!entry?.id) return;
    if (!(await askConfirm({ title: 'Remove this honour?', message: `“${entry.title}” comes off the hall of fame.`, yesLabel: 'Yes, remove', noLabel: 'No, keep it', tone: 'danger' }))) return;
    setBusy(true);
    try { await deleteHonour(orgId, entry.id); await onDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t remove it.'); setBusy(false); }
  };

  return (
    <Card style={{ gap: theme.spacing(3) }}>
      <Text style={textStyles.h3}>{entry ? 'Edit honour' : 'Add an honour'}</Text>
      <TextField label="Year" value={year} onChange={setYear} placeholder="e.g. 2019" autoCapitalize="none" />
      <View style={st.chips}>
        {HONOUR_KINDS.map((k) => <SelectChip key={k} label={`${honourIcon(k)} ${HONOUR_KIND_LABEL[k]}`} active={kind === k} onPress={() => setKind(k)} />)}
      </View>
      <TextField label="Title" value={title} onChange={setTitle} placeholder="e.g. District Football Champions" />
      <Text style={textStyles.muted}>Sport</Text>
      <View style={st.chips}>
        {SPORT_LIST.map((s) => <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={sport === s.id} onPress={() => setSport(sport === s.id ? undefined : s.id)} />)}
      </View>
      <Text style={textStyles.muted}>Level</Text>
      <View style={st.chips}>
        {HONOUR_LEVELS.map((l) => <SelectChip key={l} label={HONOUR_LEVEL_LABEL[l]} active={level === l} onPress={() => setLevel(level === l ? undefined : l)} />)}
      </View>
      <TextField label="Team (optional)" value={team} onChange={setTeam} placeholder="e.g. U14 Boys" />
      <Text style={textStyles.muted}>Students (optional) — pick them from your members; don’t type names into the title.</Text>
      {picked.length ? (
        <View style={st.chips}>
          {picked.map((id) => <SelectChip key={id} label={`✓ ${nameOf(id)}`} active onPress={() => setPicked(picked.filter((x) => x !== id))} />)}
        </View>
      ) : null}
      <TextField label="" value={search} onChange={setSearch} placeholder="Search your members" autoCapitalize="words" />
      <View style={st.chips}>
        {matches.map((m) => <SelectChip key={m.id} label={m.name} active={false} onPress={() => setPicked([...picked, m.id])} />)}
      </View>
      <TextField label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. Beat Delhi Public School 2–1 in the final" multiline />
      <FormError message={error} />
      <Button label={busy ? 'Saving…' : entry ? 'Save changes' : 'Add to the hall of fame'} onPress={() => void save()} disabled={busy} />
      <Button label="Cancel" variant="ghost" onPress={() => void onDone(false)} disabled={busy} />
      {entry?.id ? <Button label="Remove this honour" variant="danger" onPress={() => void remove()} disabled={busy} /> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), maxWidth: 720, width: '100%', alignSelf: 'center' },
  gold: { borderColor: '#C9A227' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  logo: { width: 56, height: 56, borderRadius: theme.radius.md },
  logoEmoji: { fontSize: 40 },
  kicker: { color: '#C9A227', fontWeight: '800', letterSpacing: 1, fontSize: theme.font.small },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  tile: { flexGrow: 1, flexBasis: '18%', minWidth: 90, alignItems: 'center', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt },
  tileValue: { fontSize: 22, fontWeight: '800', color: '#C9A227' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  year: { fontSize: 22, fontWeight: '800', color: '#C9A227', marginTop: theme.spacing(2) },
  entry: { flexDirection: 'row', gap: theme.spacing(3), alignItems: 'flex-start' },
  icon: { fontSize: 26 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3), alignItems: 'center', marginTop: 2 },
  verified: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  added: { color: theme.colors.textMuted, fontWeight: '700', fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontWeight: '700' },
  hosted: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
});
