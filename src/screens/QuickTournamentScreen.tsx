/**
 * Quick tournament (MVP, founder 2026-10-31): for a community organiser, a
 * name, a sport, the teams (paste a WhatsApp list) and a format. It makes the
 * tournament and its teams, then opens the fixtures screen with everything
 * picked: one more tap and the fixtures are there. "More options" opens the
 * full form (divisions, co-hosts, registration, banner…).
 */
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
import { addTournamentTeams, createTeam, createTournament, createTournamentSlots, getMyPlayerId, getPlayer } from '../data/repos';
import { slotNames } from '../core/slots';
import { getMyPersonalisation } from '../data/personalise';
import { useAuth } from '../core/auth';
import { notice } from '../core/confirm';
import { LAST_SPORT_KEY, startSport } from '../core/quickGame';
import { groupCount, matchCount, parseEntrantList, quickName, structureFor, suggestFormat, type QuickFormat } from '../core/quickTournament';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The MVP's sports lead the chips (docs/product/MVP.md). */
const MVP_SPORTS: SportId[] = ['football', 'basketball', 'kabaddi', 'badminton', 'tennis', 'pickleball', 'padel'];
const PALETTE = ['#FF5C5C', '#4DA3FF', '#4CD964', '#FFD60A', '#BF5AF2', '#FF9F0A', '#5AC8FA', '#FF375F'];
const FORMATS: { id: QuickFormat; label: string; hint: string }[] = [
  { id: 'league', label: 'League', hint: 'Everyone plays everyone; the table decides' },
  { id: 'knockout', label: 'Knockout', hint: 'Lose and you’re out, to a final' },
  { id: 'groups', label: 'Groups + knockout', hint: 'Small groups, the top 2 go through' },
];
const shortFrom = (name: string) => {
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase();
  return ((initials.length >= 2 ? initials : name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) || 'TM').slice(0, 4);
};
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function QuickTournamentScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'QuickTournament'>>();
  const { profile } = useAuth();
  const [sport, setSport] = useState<SportId | null>(params?.sport ?? null);
  const [mine, setMine] = useState<SportId[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [name, setName] = useState('');
  const nameTouched = useRef(false);
  const [list, setList] = useState('');
  // The organiser's pick; until then the suggestion for the list's size, worked
  // out on every render (an effect lagged a render, so a fast tap saw no format).
  const [chosenFmt, setChosenFmt] = useState<QuickFormat | null>(null);
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [homeCity, setHomeCity] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Teams not known yet (TS1): fixtures between slots (A1…, B1… / Team 1…), filled in later
  const [slotMode, setSlotMode] = useState(false);
  const [slotCount, setSlotCount] = useState('8');

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
  const typed = useMemo(() => parseEntrantList(list), [list]);
  const slotN = Math.max(0, Math.min(128, parseInt(slotCount, 10) || 0));
  const noun = meta?.participantKind === 'individual' ? 'players' : meta?.participantKind === 'both' ? 'players or pairs' : 'teams';
  // Suggested name and format until the organiser changes them.
  useEffect(() => { if (meta && !nameTouched.current) setName(quickName(meta.name, new Date())); }, [meta]);
  const fmt: QuickFormat | null = chosenFmt ?? suggestFormat(slotMode ? slotN : typed.length);
  // the entrants: typed names, or slots named by their group when the teams aren't known yet
  const entrants = useMemo(
    () => (slotMode ? (slotN >= 2 ? slotNames(slotN, fmt === 'groups' ? groupCount(slotN) : 0) : []) : typed),
    [slotMode, slotN, fmt, typed],
  );

  const chips = useMemo(() => {
    const lead = [...new Set<SportId>([...mine, ...(sport ? [sport] : []), ...MVP_SPORTS])];
    return showAll ? [...lead, ...SPORT_LIST.map((m) => m.id as SportId).filter((s) => !lead.includes(s))] : lead;
  }, [mine, sport, showAll]);

  async function create() {
    if (!sport || !meta) return setError('Pick a sport.');
    if (!name.trim()) return setError('Give the tournament a name.');
    if (entrants.length < 2) return setError(`Add at least 2 ${noun}, one per line.`);
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
        formats: { [sport]: { ...withNewTournamentPoints(sport, fields.length ? defaultsFor(fields, 'tournament') : {}), ...regionFormatDefaults(sport, regionStore.get().units) } },
        structure: structureFor(fmt),
        // their home city puts the matches on the map for "Near you"
        city: homeCity,
      });
      createdId = created.id;
      if (slotMode) {
        setBusy(`Making ${entrants.length} slots…`);
        await createTournamentSlots(created.id, sport, entrants);
      } else {
        const ids: string[] = [];
        for (let i = 0; i < entrants.length; i++) {
          setBusy(`Adding ${noun} ${i + 1} of ${entrants.length}…`);
          const t = await createTeam({ name: entrants[i], shortName: shortFrom(entrants[i]), sport, colorHex: PALETTE[i % PALETTE.length], adhoc: true });
          ids.push(t.id);
        }
        await addTournamentTeams(created.id, ids, 'confirmed');
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

  const summary = fmt && entrants.length >= 2
    ? `${entrants.length} ${noun} · ${FORMATS.find((f) => f.id === fmt)!.label} · ${matchCount(fmt, entrants.length)} matches`
    : `${entrants.length} ${noun}`;

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
            <View style={st.chips}>
              {chips.map((s) => (
                <SelectChip key={s} label={`${getSportMeta(s).icon} ${getSportMeta(s).name}`} active={sport === s}
                  onPress={() => { setSport(s); nameTouched.current = nameTouched.current && !!name.trim(); }} />
              ))}
              {!showAll ? <SelectChip label="More sports…" active={false} onPress={() => setShowAll(true)} /> : null}
            </View>
          </View>

          <TextField label="Name" value={name} onChange={(v) => { nameTouched.current = true; setName(v); }} placeholder="e.g. Sunday Turf Cup" autoCapitalize="words" />

          <View style={st.block}>
            <View style={st.chips}>
              <SelectChip label={`I have the ${noun}`} active={!slotMode} onPress={() => setSlotMode(false)} />
              <SelectChip label={`${noun[0].toUpperCase()}${noun.slice(1)} not known yet`} active={slotMode} onPress={() => setSlotMode(true)} />
            </View>
            {slotMode ? (
              <>
                <TextField label={`How many ${noun}?`} value={slotCount} onChange={(v) => setSlotCount(v.replace(/[^0-9]/g, '').slice(0, 3))} />
                <Text style={textStyles.muted}>
                  {entrants.length >= 2 ? `Slots ${entrants[0]} … ${entrants[entrants.length - 1]}. ` : ''}The fixtures are made between the slots; when a team comes in, open the tournament’s teams and fill its slot.
                </Text>
                <Text style={textStyles.muted}>{summary}.</Text>
              </>
            ) : (
              <>
                <TextField label={`The ${noun}, one per line`} value={list} onChange={setList} multiline
                  placeholder={'Paste from WhatsApp:\nLions\nTigers\nPanthers\nCheetahs'} />
                <Text style={textStyles.muted}>{summary}. Players can be added to each later.</Text>
              </>
            )}
          </View>

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
