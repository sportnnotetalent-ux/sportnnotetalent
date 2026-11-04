/**
 * Quick tournament (MVP, founder 2026-10-31): for a community organiser, a
 * name, a sport, who plays and a format. It makes the tournament and enters
 * them, then opens the fixtures screen with everything picked: one more tap and
 * the fixtures are there. "More options" opens the full form (divisions,
 * co-hosts, registration, banner…).
 * Who plays is PICKED, never typed (founder 2026-11-06): teams from the sport's
 * list (or a new team with its captain invited, TournamentTeamPicker); players
 * and pairs with the people picker (EntrantPicker), each reusing their own
 * record; plus slots for anyone not known yet.
 */
import { SportPicker } from '../components/SportPicker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAwareScrollView, KeyboardFooterLayout } from '../components/keyboard';
import { theme } from '../core/theme';
import { Button, FieldLabel, FormError, ScreenTitle, SelectChip, TextField, textStyles } from '../components/ui';
import { SPORT_LIST, getSportMeta } from '../sports/sportMeta';
import { defaultsFor } from '../components/FormatEditor';
import { withNewTournamentPoints } from '../data/standings';
import { regionFormatDefaults } from '../core/units';
import { regionStore } from '../core/region';
import { addTournamentTeams, createTournament, createTournamentSlots, getMyEntrant, getMyPlayerId, getPlayer, getTournamentEntries, setTeamLeaders } from '../data/repos';
import { nextSlotNames, slotNames } from '../core/slots';
import { EntrantPicker } from '../components/EntrantPicker';
import { sideForEntrants } from '../data/entrants';
import { entryName, slotId, slotName, type EntrantSlot } from '../data/participantEntry';
import { entryClash } from '../core/entryPick';
import { useTeams } from '../data/hooks';
import { playerInviteText } from '../core/inviteText';
import { SHARE_BASE } from '../core/shareText';
import { TournamentTeamPicker, type PickedTeam } from '../components/TournamentTeamPicker';
import { getMyPersonalisation } from '../data/personalise';
import { useAuth } from '../core/auth';
import { notice } from '../core/confirm';
import { LAST_SPORT_KEY, startSport } from '../core/quickGame';
import { groupCount, matchCount, quickName, structureFor, suggestFormat, type QuickFormat } from '../core/quickTournament';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The MVP's sports lead the chips (docs/product/MVP.md). */
const PALETTE = ['#FF5C5C', '#4DA3FF', '#4CD964', '#FFD60A', '#BF5AF2', '#FF9F0A', '#5AC8FA', '#FF375F'];
const FORMATS: { id: QuickFormat; label: string; hint: string }[] = [
  { id: 'league', label: 'League', hint: 'Everyone plays everyone; the table decides' },
  { id: 'knockout', label: 'Knockout', hint: 'Lose and you’re out, to a final' },
  { id: 'groups', label: 'Groups + knockout', hint: 'Small groups, the top 2 go through' },
];
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function QuickTournamentScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'QuickTournament'>>();
  const { profile } = useAuth();
  const [sport, setSport] = useState<SportId | null>(params?.sport ?? null);
  const [mine, setMine] = useState<SportId[]>([]);
  const [name, setName] = useState('');
  const nameTouched = useRef(false);
  // The organiser's pick; until then the suggestion for the list's size, worked
  // out on every render (an effect lagged a render, so a fast tap saw no format).
  const [chosenFmt, setChosenFmt] = useState<QuickFormat | null>(null);
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [homeCity, setHomeCity] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // team sports (PK1): real teams picked from the list
  const [pickedTeams, setPickedTeams] = useState<PickedTeam[]>([]);
  // individual sports (PP1): players or pairs picked as people; Singles / Doubles for "both" sports
  const [people, setPeople] = useState<EntrantSlot[][]>([]);
  const [pairs, setPairs] = useState(false);
  // anyone not known yet (TS1/TS12): slots, filled in later
  const [unknownCount, setUnknownCount] = useState('0');

  // The sport a person most likely means: the route's, else the last friendly's, else their first.
  useEffect(() => {
    let on = true;
    (async () => {
      const p = await getMyPersonalisation().catch(() => null);
      const last = await AsyncStorage.getItem(LAST_SPORT_KEY).catch(() => null);
      if (!on) return;
      setMine((p?.sports ?? []) as SportId[]);
      setHomeCity(p?.homeCity?.name ?? null);
      if (!params?.sport) {
        const s = startSport({ last, mine: p?.sports ?? [], known: SPORT_LIST.map((x) => x.id) });
        if (s) setSport((cur) => cur ?? (s as SportId));
      }
    })();
    return () => { on = false; };
  }, [params?.sport]);

  const meta = sport ? getSportMeta(sport) : null;
  const noun = meta?.participantKind === 'individual' ? 'players' : meta?.participantKind === 'both' ? 'players or pairs' : 'teams';
  const teamSport = (meta?.participantKind ?? 'team') === 'team';
  const kind = meta?.participantKind ?? 'team';
  const perEntry: 1 | 2 = kind === 'both' && pairs ? 2 : 1;
  const sportTeams = useTeams(sport ?? undefined);
  const pickedNames = teamSport ? pickedTeams.map((t) => t.name) : people.map((e) => entryName(e.map(slotName)));
  const unknownN = Math.max(0, Math.min(128, parseInt(unknownCount, 10) || 0));
  // Suggested name and format until the organiser changes them.
  useEffect(() => { if (meta && !nameTouched.current) setName(quickName(meta.name, new Date())); }, [meta]);
  const fmt: QuickFormat | null = chosenFmt ?? suggestFormat(pickedNames.length + unknownN);
  // the picked teams / players / pairs, then a slot for each one not known yet
  // (all slots → named by group A1…; next to real entries → Slot 1…)
  const teamSlots = useMemo(() => {
    if (!unknownN) return [];
    if (!pickedNames.length) return unknownN >= 2 ? slotNames(unknownN, fmt === 'groups' ? groupCount(unknownN) : 0) : ['Slot 1'];
    return nextSlotNames(pickedNames, unknownN);
  }, [unknownN, pickedNames.join('|'), fmt]); // eslint-disable-line react-hooks/exhaustive-deps
  const entrants = useMemo(() => [...pickedNames, ...teamSlots], [pickedNames.join('|'), teamSlots]); // eslint-disable-line react-hooks/exhaustive-deps
  // PP2–PP4: nobody twice, alone or in a pair
  const addPeople = async (slots: EntrantSlot[]): Promise<boolean> => {
    const why = entryClash(people, slots);
    if (why) { setError(why); return false; }
    setError(null);
    setPeople((p) => [...p, slots]);
    return true;
  };


  async function create() {
    if (!sport || !meta) return setError('Pick a sport.');
    if (!name.trim()) return setError('Give the tournament a name.');
    if (entrants.length < 2) return setError(`Pick at least 2 ${teamSport ? 'teams' : perEntry === 2 ? 'pairs' : 'players'} (or add the ones not known yet).`);
    if (!fmt) return setError('Pick a format.');
    setError(null);
    let createdId: string | null = null;
    try {
      setBusy('Creating the tournament…');
      const myId = await getMyPlayerId(profile?.id);
      const me = myId ? await getPlayer(myId).catch(() => null) : null;
      const start = new Date();
      if (day === 'tomorrow') start.setDate(start.getDate() + 1);
      const fields = meta.formatFields ?? [];
      const created = await createTournament({
        name: name.trim(),
        hostName: me?.fullName || profile?.fullName || 'Organiser',
        sports: [sport],
        startDate: isoDay(start),
        endDate: isoDay(start),
        formats: { [sport]: {
          ...withNewTournamentPoints(sport, fields.length ? defaultsFor(fields, 'tournament') : {}), ...regionFormatDefaults(sport, regionStore.get().units),
          // PP6: singles or doubles, as picked
          ...(kind === 'both' ? { playersPerSide: perEntry } : {}),
        } },
        structure: structureFor(fmt),
        // their home city puts the matches on the map for "Near you"
        city: homeCity,
      });
      createdId = created.id;
      if (teamSport) {
        // PK1/PK7: the picked teams are entered (one the organiser doesn't run is invited); then the slots
        if (pickedTeams.length) {
          setBusy(`Adding ${pickedTeams.length} teams…`);
          await addTournamentTeams(created.id, pickedTeams.map((t) => t.id), 'confirmed');
        }
        if (teamSlots.length) {
          setBusy(`Making ${teamSlots.length} slot${teamSlots.length === 1 ? '' : 's'}…`);
          await createTournamentSlots(created.id, sport, teamSlots);
        }
        // PK7: a team someone else runs is invited — it joins the fixtures when its captain accepts
        const waiting = (await getTournamentEntries(created.id, sport).catch(() => []))
          .filter((e) => e.status === 'invited').map((e) => e.team.name);
        if (waiting.length) {
          notice(`${waiting.length === 1 ? waiting[0] : `${waiting.length} teams`} invited`,
            `${waiting.join(', ')} ${waiting.length === 1 ? 'is' : 'are'} run by someone else, so ${waiting.length === 1 ? 'it joins' : 'they join'} the fixtures once ${waiting.length === 1 ? 'its captain accepts' : 'their captains accept'}. To make the fixtures now, add a slot for ${waiting.length === 1 ? 'it' : 'each'} and fill it later.`);
        }
      } else {
        // PP5: each player / pair reuses their own record in this sport (else one is made, its first person captain)
        const ids: string[] = [];
        for (let i = 0; i < people.length; i++) {
          setBusy(`Adding ${perEntry === 2 ? 'pair' : 'player'} ${i + 1} of ${people.length}…`);
          const entry = await sideForEntrants(people[i], { sport, teams: sportTeams, colorHex: PALETTE[i % PALETTE.length], adhoc: true });
          const lead = people[i].map(slotId).find(Boolean);
          if (entry.created && lead) await setTeamLeaders(entry.id, { captainId: lead }).catch(() => {});
          ids.push(entry.id);
        }
        if (ids.length) await addTournamentTeams(created.id, ids, 'confirmed');
        if (teamSlots.length) {
          setBusy(`Making ${teamSlots.length} slot${teamSlots.length === 1 ? '' : 's'}…`);
          await createTournamentSlots(created.id, sport, teamSlots);
        }
      }
      void AsyncStorage.setItem(LAST_SPORT_KEY, sport).catch(() => {});
      // The tournament page underneath, so making the fixtures lands on it.
      nav.replace('Tournament', { tournamentId: created.id });
      nav.navigate('GenerateFixtures', { tournamentId: created.id, sport, structure: fmt, day, groups: fmt === 'groups' ? groupCount(entrants.length) : undefined });
    } catch (e) {
      // QT-01: the tournament exists but not every team saved: open it rather than
      // invite a second try that would make a duplicate tournament.
      if (createdId) {
        notice('Some teams didn’t save', 'The tournament is made. Open its Teams to add the rest, then make the fixtures.');
        nav.replace('Tournament', { tournamentId: createdId });
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not create the tournament. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  // what's being counted: teams, players or pairs (and one, not "1 players")
  const unit = teamSport ? 'team' : perEntry === 2 ? 'pair' : 'player';
  const counted = `${entrants.length} ${unit}${entrants.length === 1 ? '' : 's'}`;
  const summary = fmt && entrants.length >= 2
    ? `${counted} · ${FORMATS.find((f) => f.id === fmt)!.label} · ${matchCount(fmt, entrants.length)} matches`
    : counted;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardFooterLayout
        safeBottom={false}
        footer={(
          <>
            <FormError message={error} />
            <Button label={busy ?? 'Create & make fixtures'} onPress={create} disabled={!!busy} />
          </>
        )}
      >
        <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <ScreenTitle title="Quick tournament" subtitle="Name, sport and teams. The fixtures come next." />

          <View style={st.block}>
            <FieldLabel>Sport</FieldLabel>
            <SportPicker mine={mine} value={sport} onChange={(s) => { setSport(s); nameTouched.current = nameTouched.current && !!name.trim(); }} />
          </View>

          <TextField label="Name" value={name} onChange={(v) => { nameTouched.current = true; setName(v); }} placeholder="e.g. Sunday Turf Cup" autoCapitalize="words" />

          {teamSport && sport ? (
            <View style={st.block}>
              <FieldLabel>Teams</FieldLabel>
              <TournamentTeamPicker sport={sport} picked={pickedTeams} onChange={setPickedTeams} context={name.trim() || undefined} />
              <TextField label="Teams not known yet" value={unknownCount} onChange={(v) => setUnknownCount(v.replace(/[^0-9]/g, '').slice(0, 3))} />
              <Text style={textStyles.muted}>
                {summary}{teamSlots.length ? ` · slots ${teamSlots[0]}${teamSlots.length > 1 ? ` … ${teamSlots[teamSlots.length - 1]}` : ''}, filled in later from the tournament’s teams` : ''}.
              </Text>
            </View>
          ) : sport ? (
            <View style={st.block}>
              {kind === 'both' ? (
                <View style={st.chips}>
                  <SelectChip label="Singles" active={!pairs} onPress={() => { if (pairs) { setPairs(false); setPeople([]); } }} />
                  <SelectChip label="Doubles (pairs)" active={pairs} onPress={() => { if (!pairs) { setPairs(true); setPeople([]); } }} />
                </View>
              ) : null}
              <FieldLabel>{perEntry === 2 ? 'Pairs' : 'Players'}</FieldLabel>
              {people.length ? (
                <View style={st.chips}>
                  {people.map((e, i) => {
                    const label = entryName(e.map(slotName));
                    return <SelectChip key={`${i}-${label}`} label={`${label}  ✕`} active accessibilityLabel={`Remove ${label}`}
                      onPress={() => setPeople((p) => p.filter((_, k) => k !== i))} />;
                  })}
                </View>
              ) : null}
              <EntrantPicker key={`${perEntry}-${people.length}`} count={perEntry} sport={sport}
                inviteText={(who) => playerInviteText({ name: who, inviterName: profile?.fullName, link: SHARE_BASE })}
                onSubmit={addPeople}
                submitLabel={perEntry === 2 ? '＋ Add pair' : undefined}
                resolveMe={profile?.fullName ? () => getMyEntrant(profile) : undefined}
                meName={profile?.fullName} />
              <TextField label={`${perEntry === 2 ? 'Pairs' : 'Players'} not known yet`} value={unknownCount} onChange={(v) => setUnknownCount(v.replace(/[^0-9]/g, '').slice(0, 3))} />
              <Text style={textStyles.muted}>
                {summary}{teamSlots.length ? ` · slots ${teamSlots[0]}${teamSlots.length > 1 ? ` … ${teamSlots[teamSlots.length - 1]}` : ''}, filled in later` : ''}.
              </Text>
            </View>
          ) : null}

          <View style={st.block}>
            <FieldLabel>Format</FieldLabel>
            <View style={st.chips}>
              {FORMATS.map((f) => (
                <SelectChip key={f.id} label={f.label} active={fmt === f.id} onPress={() => setChosenFmt(f.id)} />
              ))}
            </View>
            {fmt ? <Text style={textStyles.muted}>{FORMATS.find((f) => f.id === fmt)!.hint}</Text> : null}
          </View>

          <View style={st.block}>
            <FieldLabel>When</FieldLabel>
            <View style={st.chips}>
              <SelectChip label="Today" active={day === 'today'} onPress={() => setDay('today')} />
              <SelectChip label="Tomorrow" active={day === 'tomorrow'} onPress={() => setDay('tomorrow')} />
            </View>
            <Text style={textStyles.muted}>You set the kick-off times on the next screen.</Text>
          </View>

          <Text style={st.more} accessibilityRole="link" onPress={() => nav.navigate('CreateTournament', sport ? { sport } : undefined)}>
            More options (divisions, co-hosts, registration, banner) →
          </Text>
        </KeyboardAwareScrollView>
      </KeyboardFooterLayout>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4) },
  block: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  more: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small, paddingVertical: theme.spacing(2) },
});
