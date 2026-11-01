/**
 * Score first, sign up later (growth plan, 2026-10-31;
 * docs/security/breaks/guest-scoring.md). A signed-out person picks a sport,
 * optionally names the two sides and the format, and scores at once. The game
 * stays on this phone; "Save & share" on the scoring screen asks for an
 * account and uploads it. Tests: tests/guest-scoring-wiring.test.mts.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView, KeyboardFooterLayout } from '../components/keyboard';
import { theme } from '../core/theme';
import { Button, FieldLabel, ScreenTitle, SelectChip, TextField, textStyles } from '../components/ui';
import { SportFormatEditor, defaultsFor, type FormatVal } from '../components/FormatEditor';
import { getSportMeta } from '../sports/sportMeta';
import { newGuestMatch, cleanFrom } from '../core/guestMatch';
import { shortFrom, uniqueShort } from '../core/teamShort';
import { newUuid } from '../core/deviceId';
import { confirmAction } from '../core/confirm';
import { guestStore } from '../data/guestStore';
import { track } from '../core/telemetry';
import { useAuth } from '../core/auth';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

/** The MVP sports (docs/product/MVP.md); every other sport after signing up. */
export const GUEST_SPORTS: SportId[] = ['football', 'basketball', 'kabaddi', 'badminton', 'tennis', 'pickleball', 'padel'];
const COLOURS = ['#FF5C5C', '#4DA3FF'];

export default function GuestGameScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'GuestGame'>>();
  // Growth plan #6: where the visitor came from (the light page, the guest bar, sign-in)
  const from = cleanFrom(route.params?.from);
  const { authed } = useAuth();
  const [sport, setSport] = useState<SportId>('football');
  useEffect(() => {
    // V4: a signed-in visitor scores a normal friendly instead
    if (authed) nav.replace('ScheduleMatch', { sport });
    else track('onboarding_step', { step: 'guest_game_open', from });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const fields = getSportMeta(sport).formatFields ?? [];
  const [format, setFormat] = useState<Record<string, FormatVal>>(() => defaultsFor(fields));
  const pickSport = (s: SportId) => { setSport(s); setFormat(defaultsFor(getSportMeta(s).formatFields ?? [])); };
  const noun = (getSportMeta(sport).participantKind ?? 'team') === 'team' ? 'Team' : 'Player';

  const start = async () => {
    const old = await guestStore.get();
    if (old && old.events.length && !(await confirmAction('Start a new game?', 'Your unsaved game on this phone will be lost.', 'Start new'))) return;
    const homeTeamName = home.trim() || `${noun} A`;
    const awayTeamName = away.trim() || `${noun} B`;
    const homeName = shortFrom(homeTeamName);
    const awayName = uniqueShort(awayTeamName, [homeName]);
    const g = newGuestMatch({ sport, homeName, awayName, homeTeamName, awayTeamName, homeColor: COLOURS[0], awayColor: COLOURS[1], config: format }, Date.now(), newUuid);
    await guestStore.set(g);
    track('onboarding_step', { step: 'guest_game_start', from, sport });
    nav.replace('LiveScoring', { guestId: g.id, sport, homeName, awayName, homeTeamName, awayTeamName, homeColor: COLOURS[0], awayColor: COLOURS[1], canScore: true });
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardFooterLayout safeBottom={false} footer={<Button label="Start scoring" onPress={() => void start()} />}>
        <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <ScreenTitle title="Score a game" subtitle="No sign-up needed to start. Sign up when you want to share the live link." />
          <View style={st.block}>
            <FieldLabel>Sport</FieldLabel>
            <View style={st.chips}>
              {GUEST_SPORTS.map((s) => (
                <SelectChip key={s} label={`${getSportMeta(s).icon} ${getSportMeta(s).name}`} active={sport === s} onPress={() => pickSport(s)} />
              ))}
            </View>
            <Text style={textStyles.muted}>Every other sport is there once you sign up.</Text>
          </View>
          <TextField label={`${noun} 1 (optional)`} value={home} onChange={setHome} placeholder={`${noun} A`} autoCapitalize="words" />
          <TextField label={`${noun} 2 (optional)`} value={away} onChange={setAway} placeholder={`${noun} B`} autoCapitalize="words" />
          {fields.length > 0 && (
            <SportFormatEditor sport={sport} value={format} onChange={(k, v) => setFormat((f) => ({ ...f, [k]: v }))} heading="format" />
          )}
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
});
