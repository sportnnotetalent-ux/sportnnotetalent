/** Run it again / copy a tournament (2026-10-27): "🔁 Run it again" makes the
 *  next edition of your tournament (linked, so every edition's page shows the
 *  series); "📋 Copy this setup" makes anyone's set-up into a new tournament of
 *  your own. Sports, formats, rules, age groups, venues, the events
 *  programme and golf rounds come across; teams, fixtures, entries and
 *  results don't. The
 *  plan is pure: data/tournamentCopyPlan.ts. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView, KeyboardFooterLayout } from '../components/keyboard';
import { Button, Card, EmptyState, FieldLabel, FormError, LoadingState, ScreenTitle, SelectChip, TextField, textStyles } from '../components/ui';
import { DateField } from '../components/DateTimeField';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { notice } from '../core/confirm';
import { spelledDate } from '../core/region';
import { canManageTournament, organizableOrgsForPlayer } from '../core/org';
import { useOrganizations } from '../data/hooks';
import { getMyPlayerId, getPlayer } from '../data/repos';
import { copyTournament, loadCopySource } from '../data/tournamentCopy';
import { copyProblem, planCopy } from '../data/tournamentCopyPlan';
import { getSportMeta } from '../sports/sportMeta';
import type { RootStackParamList } from '../navigation/types';
import { IconText } from '../components/Icon';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const pad = (n: number) => String(n).padStart(2, '0');
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const AGE_RULE: Record<string, string> = { confirmed: 'confirmed by a school or club', verified: 'verified by SportnNote' };

export default function CopyTournamentScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CopyTournament'>>();
  const { profile } = useAuth();
  const orgs = useOrganizations();
  const [src, setSrc] = useState<Awaited<ReturnType<typeof loadCopySource>> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [myName, setMyName] = useState(profile?.fullName ?? '');

  useEffect(() => {
    let on = true;
    loadCopySource(params.tournamentId).then((s) => { if (on) setSrc(s); }).catch((e) => { if (on) setLoadError(e instanceof Error ? e.message : 'Couldn’t load the tournament.'); });
    getMyPlayerId(profile?.id).then(async (id) => {
      if (!on || !id) return;
      setMyId(id);
      const p = await getPlayer(id);
      if (on && p?.fullName) setMyName(p.fullName);
    }).catch(() => {});
    return () => { on = false; };
  }, [params.tournamentId, profile?.id]);

  const own = !!src && canManageTournament(src.tournament, orgs, myId, profile?.id);
  // Only its organisers run a tournament again; anyone else gets a copy.
  const mode = params.mode === 'next' && own ? 'next' : 'clone';
  const [withAbout, setWithAbout] = useState(false);
  const plan = useMemo(
    () => (src ? planCopy(src, { mode, own, withAbout, today: todayKey() }) : null),
    [src, mode, own, withAbout],
  );

  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const seeded = useRef('');
  useEffect(() => {
    if (!plan || seeded.current === plan.mode) return;
    seeded.current = plan.mode;
    setName(plan.name); setStart(plan.startDate); setEnd(plan.endDate);
  }, [plan]);
  // A new start date keeps the tournament's length.
  const changeStart = (d: string) => {
    if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(d)) setEnd(addDays(d, Math.max(0, dayDiff(start, end))));
    setStart(d);
  };

  const myOrgs = organizableOrgsForPlayer(orgs, myId);
  const [hostChoice, setHostChoice] = useState<'self' | string>('self');
  useEffect(() => {
    // The next edition stays with the community that ran this one.
    const org = src?.tournament.hostOrgId;
    if (mode === 'next' && org && myOrgs.some((o) => o.id === org)) setHostChoice(org);
  }, [mode, src?.tournament.hostOrgId, myOrgs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const hostOrg = hostChoice !== 'self' ? myOrgs.find((o) => o.id === hostChoice) : undefined;

  const lastTeams = (src?.entries ?? []).filter((e) => e.status === 'confirmed').length;
  // The next edition of a personally hosted tournament keeps its other hosts.
  const coHosts = mode === 'next' && hostChoice === 'self' ? (src?.tournament.hostIds ?? []).filter((id) => id !== myId) : [];
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loadError) return <SafeAreaView style={st.safe} edges={['bottom']}><EmptyState icon="🏆" title={loadError} /></SafeAreaView>;
  if (!src || !plan) return <LoadingState />;
  const t = src.tournament;
  const s = plan.summary;
  const next = mode === 'next';

  const comes: string[] = [
    `🏆 ${s.sports.map((sp) => getSportMeta(sp).name).join(', ')}`,
    ...(s.rules ? ['📏 Formats, points and rules for each sport'] : []),
    ...(s.categories ? [`👥 ${s.categories} age group${s.categories === 1 ? '' : 's'}`] : []),
    ...(s.events ? [`🏃 ${s.events} event${s.events === 1 ? '' : 's'} — set each one up when its entries are in`] : []),
    ...(s.golfRounds ? [`⛳ ${s.golfRounds} golf round${s.golfRounds === 1 ? '' : 's'} — course, tees, format and tee times; set each up when the players are in`] : []),
    ...(s.venues || plan.fields.city ? [`📍 ${s.venues ? `${s.venues} venue${s.venues === 1 ? '' : 's'}` : 'Venue'}${plan.fields.city ? ` in ${plan.fields.city}` : ''}`] : []),
    ...(s.registration ? ['📝 Registration settings (team limits and deadline)'] : []),
    ...(s.records ? [`🏆 ${s.records} meet record${s.records === 1 ? '' : 's'} — they stand until broken`] : []),
    ...(s.ageRule ? [`🛡️ Players’ ages must be ${AGE_RULE[s.ageRule] ?? s.ageRule}`] : []),
    ...(s.about ? ['📄 About & rules text'] : []),
    ...(s.branding ? ['🖼️ Logo and banner'] : []),
    ...(s.contact ? ['📞 Organiser contact'] : []),
    ...(coHosts.length ? [`🤝 ${coHosts.length} co-host${coHosts.length === 1 ? '' : 's'}`] : []),
  ];

  async function submit() {
    if (!plan) return;
    const problem = copyProblem({ name, startDate: start, endDate: end, mode, previousStart: t.startDate });
    if (problem) { setError(problem); return; }
    setError(null); setBusy(true);
    try {
      const res = await copyTournament(src!, plan, {
        name, startDate: start, endDate: end,
        hostName: hostOrg ? hostOrg.name : (myName || profile?.fullName || 'Organiser'),
        hostOrgId: hostOrg?.id,
        coHostIds: coHosts.length ? coHosts : undefined,
        invite: next && invite,
      });
      if (!res.editionLinked) notice('Created', 'It’s saved as a separate tournament — linking editions needs a server update first.');
      else if (!res.profileSaved) notice('Created', 'Venues and contact will save after the server update.');
      nav.replace('Tournament', { tournamentId: res.id, tab: 'Settings' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t create the tournament.');
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardFooterLayout
        safeBottom={false}
        footer={(
          <>
            <FormError message={error} />
            <Button variant="primary" label={busy ? 'Creating…' : next ? `🔁 Create the ${start.slice(0, 4) || 'next'} edition` : '📋 Create my tournament'} onPress={submit} disabled={busy} />
          </>
        )}
      >
        <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <ScreenTitle
            title={next ? '🔁 Run it again' : '📋 Copy this setup'}
            subtitle={next ? `The next edition of ${t.name}` : own ? `A new tournament with ${t.name}’s set-up` : `${t.name}’s set-up, as a tournament of your own`}
          />

          <TextField label="Name" value={name} onChange={setName} placeholder={own ? t.name : `Your tournament’s name (not “${t.name}”)`} />
          <View style={st.row}>
            <View style={st.flex}><DateField label="Start date" value={start} onChange={changeStart} /></View>
            <View style={st.flex}><DateField label="End date" value={end} onChange={setEnd} /></View>
          </View>
          {plan.years > 0 ? (
            <Text style={st.hint}>{`Moved on ${plan.years === 1 ? 'a year' : `${plan.years} years`} from ${spelledDate(t.startDate)} — change the dates if this time they fall differently.`}</Text>
          ) : null}

          <FieldLabel>Host</FieldLabel>
          <View style={st.chips}>
            <SelectChip label={myName ? `🙋 Myself (${myName})` : '🙋 Myself'} active={hostChoice === 'self'} onPress={() => setHostChoice('self')} />
            {myOrgs.map((o) => (
              <SelectChip key={o.id} label={`🏛️ ${o.name}`} active={hostChoice === o.id} onPress={() => setHostChoice(o.id)} />
            ))}
          </View>

          <Card style={st.card}>
            <Text style={textStyles.h3}>Comes across</Text>
            {comes.map((line) => <IconText key={line} label={line} style={textStyles.body} />)}
            {!own && t.about ? (
              <View style={st.chips}>
                <SelectChip label={withAbout ? '✓ About & rules text' : '＋ Also copy the About & rules text'} active={withAbout} onPress={() => setWithAbout((v) => !v)} />
              </View>
            ) : null}
          </Card>

          <Card style={st.card}>
            <Text style={textStyles.h3}>Starts fresh</Text>
            <Text style={textStyles.muted}>
              Teams and players, fixtures, entries and results. Registration starts closed — open it on the tournament page when you’re ready.
              {!own ? ' The logo, banner and contact details stay with the original.' : ''}
            </Text>
          </Card>

          {next && lastTeams > 0 ? (
            <Card style={st.card}>
              <Text style={textStyles.h3}>Last time’s participants</Text>
              <View style={st.chips}>
                <SelectChip label={invite ? `✓ Invite all ${lastTeams}` : `📨 Invite all ${lastTeams}`} active={invite} onPress={() => setInvite((v) => !v)} />
              </View>
              <Text style={st.hint}>
                {invite
                  ? 'Each captain gets a notification and accepts. They go into the same age group as last time.'
                  : 'Leave it off to add or invite teams yourself later.'}
              </Text>
            </Card>
          ) : null}

          {next ? (
            <Text style={st.hint}>Both editions’ pages will list the series, so players and parents can look back.</Text>
          ) : (
            <Text style={st.hint}>Change anything after it’s created — Manage › Edit details.</Text>
          )}
        </KeyboardAwareScrollView>
      </KeyboardFooterLayout>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  card: { gap: theme.spacing(2) },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
});
