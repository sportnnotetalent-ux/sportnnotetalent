/**
 * Student lists (2026-10-27, founder 1A) — the page a parent opens from a
 * school's email (…/school-request?c=CODE): the school put its student list on
 * SportnNote and their child, already on SportnNote, is on it. No account
 * needed. Shows the school, the class and House it gave, what agreeing means,
 * and two equal choices. Nothing changes unless they agree; the school never
 * saw the child's profile. An adult student is asked themselves.
 * Server: school_request_preview / school_request_decide (migration
 * 20261028100000_student_lists.sql); email: edge function school-parent-request.
 */
import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, LoadingState, ScreenTitle, TextField, textStyles } from '../components/ui';
import { spelledDate } from '../core/region';
import { decideSchoolRequest, previewSchoolRequest, type SchoolRequestPreview } from '../data/studentListStore';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SchoolRequestScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SchoolRequest'>>();
  const [code, setCode] = useState(params?.c ?? '');
  const [preview, setPreview] = useState<SchoolRequestPreview | null>(null);
  const [checking, setChecking] = useState(!!params?.c);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const check = async (c: string) => {
    setChecking(true); setError(null);
    try { setPreview(await previewSchoolRequest(c)); }
    catch (e) { setPreview(null); setError(e instanceof Error ? e.message : 'That code didn’t work.'); }
    finally { setChecking(false); }
  };
  useEffect(() => { if (params?.c) void check(params.c); }, [params?.c]);

  const decide = async (approve: boolean) => {
    setBusy(true); setError(null);
    try { setDone(await decideSchoolRequest(code, approve)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    finally { setBusy(false); }
  };

  const adult = !!preview?.adult;
  const child = adult ? 'you' : preview?.childFirstName || 'your child';
  const Child = adult ? 'You' : preview?.childFirstName || 'Your child';
  const where = [preview?.standard, preview?.house ? `${preview.house} House` : ''].filter(Boolean).join(', ');
  const status = done ?? preview?.status;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="A school’s request" subtitle="SportnNote — school and club sports scores" />

        {checking ? (
          <LoadingState label="Checking the link…" />
        ) : preview && status && status !== 'pending' ? (
          <Card style={st.gap}>
            <Text style={textStyles.h3}>
              {status === 'accepted' ? `Done — ${child} ${adult ? 'are' : 'is'} now on ${preview.school}’s student list`
                : status === 'rejected' ? `Done — ${child} won’t be added`
                : status === 'expired' ? 'This request has expired'
                : 'The school withdrew this request'}
            </Text>
            <Text style={textStyles.body}>
              {status === 'accepted'
                ? `${preview.school} can now put ${child} in its teams and events${where ? ` (${where})` : ''}, and confirm ${adult ? 'your' : 'their'} date of birth from its records.`
                : status === 'rejected'
                  ? `Nothing changed. ${preview.school} still can’t see ${adult ? 'your' : `${child}’s`} profile.`
                  : `Nothing changed. If it’s still wanted, ask ${preview.school} to send it again.`}
            </Text>
            <Button label="🔒 Read the Privacy Policy" variant="ghost" onPress={() => nav.navigate('Legal', { doc: 'privacy' })} />
          </Card>
        ) : preview ? (
          <>
            <Card style={st.gap}>
              <Text style={textStyles.h3}>{preview.school}{preview.schoolVerified ? ' ✓' : ''} would like to add {child} to its students</Text>
              {preview.city ? <Text style={textStyles.muted}>{preview.city}{preview.schoolVerified ? ' · verified by SportnNote' : ''}</Text> : null}
              <Text style={textStyles.body}>
                The school put its student list on SportnNote, and {child} {adult ? 'are' : 'is'} on it{where ? ` (${where})` : ''}. {Child} already {adult ? 'have' : 'has'} a SportnNote profile, so instead of making a second one, the school asks {adult ? 'you' : 'you, as their parent or guardian,'} first.
              </Text>
              <Text style={[textStyles.body, st.bold]}>If you agree</Text>
              <Text style={textStyles.muted}>• {Child} {adult ? 'join' : 'joins'} the school’s students in that class and House</Text>
              <Text style={textStyles.muted}>• The school can pick {child} for its teams and sports events</Text>
              <Text style={textStyles.muted}>• The school can confirm {adult ? 'your' : `${child}’s`} date of birth from its records, for age-group events</Text>
              <Text style={[textStyles.body, st.bold]}>If you don’t</Text>
              <Text style={textStyles.muted}>• Nothing changes. The school hasn’t seen {adult ? 'your' : `${child}’s`} profile and won’t.</Text>
              {preview.expiresAt ? <Text style={textStyles.muted}>This request is open until {spelledDate(preview.expiresAt.slice(0, 10))}.</Text> : null}
            </Card>
            <FormError message={error} />
            <View style={st.row}>
              <Button label="No" variant="ghost" style={st.flex} onPress={() => void decide(false)} disabled={busy} />
              <Button label={busy ? 'Saving…' : adult ? 'Yes, add me' : 'Yes, add them'} style={st.flex} onPress={() => void decide(true)} disabled={busy} />
            </View>
            {!adult ? <Text style={textStyles.muted}>By agreeing you confirm you are {child}’s parent or legal guardian.</Text> : null}
          </>
        ) : (
          <>
            <Text style={textStyles.body}>Enter the code from the school’s email.</Text>
            <TextField label="Code" value={code} onChange={setCode} placeholder="e.g. 7KQ2-XH9M-…" autoCapitalize="characters" />
            <FormError message={error} />
            <Button label="Continue" onPress={() => void check(code)} disabled={!code.trim()} />
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10), maxWidth: 720, width: '100%', alignSelf: 'center' },
  gap: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
});
