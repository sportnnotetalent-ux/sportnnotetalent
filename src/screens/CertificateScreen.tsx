/** The page a certificate's QR opens (app.sportnnote.in/c/CODE) — anyone, signed
 *  in or out, sees whether it's genuine: what was won, where, when and who
 *  issued it. An under-18 holder shows as initials (the paper certificate has
 *  the full name to compare). QR-verified certificates. */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { theme } from '../core/theme';
import { Button, Card, FormError, LoadingState, ScreenTitle, TextField, textStyles } from '../components/ui';
import { formatCode, KIND_LABEL } from '../core/certificates';
import { readableDob } from '../core/verificationReview';
import { verifyCertificate, type VerifiedCertificate } from '../data/certificates';
import type { RootStackParamList } from '../navigation/types';

export default function CertificateScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Certificate'>>();
  const [code, setCode] = useState(params?.code ?? '');
  const [res, setRes] = useState<VerifiedCertificate | null>(null);
  const [checking, setChecking] = useState(!!params?.code);
  const [error, setError] = useState<string | null>(null);

  const check = async (c: string) => {
    setChecking(true); setError(null);
    try { setRes(await verifyCertificate(c)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t check it just now.'); }
    finally { setChecking(false); }
  };
  useEffect(() => { if (params?.code) void check(params.code); }, [params?.code]);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Check a certificate" subtitle="SportnNote — verified sports certificates" />
        {checking ? <LoadingState label="Checking…" /> : res?.found ? (
          <Card style={[{ gap: theme.spacing(2) }, res.revoked ? st.bad : st.good]}>
            <Text style={[textStyles.h2, { color: res.revoked ? theme.colors.danger : theme.colors.primary }]}>
              {res.revoked ? '⚠ This certificate was revoked' : '✓ Genuine SportnNote certificate'}
            </Text>
            {res.revoked && res.revokedReason ? <Text style={textStyles.body}>Reason: {res.revokedReason}</Text> : null}
            <Row label="Awarded to" value={res.holder ?? '—'} />
            <Row label={res.kind === 'participation' ? 'For' : 'Achievement'} value={res.kind === 'participation' ? 'Participation' : res.title ?? KIND_LABEL[res.kind ?? 'award']} />
            {res.detail || res.tournament ? <Row label="Event" value={res.detail ?? res.tournament ?? ''} /> : null}
            {res.teamName ? <Row label="Team" value={res.teamName} /> : null}
            {res.eventDate ? <Row label="Date" value={readableDob(res.eventDate)} /> : null}
            <Row label="Issued by" value={`${res.issuer ?? 'The organisers'}${res.issuerVerified ? ' ✓ verified school / club' : ''}`} />
            {res.issuedAt ? <Row label="Issued on" value={readableDob(res.issuedAt.slice(0, 10))} /> : null}
            <Row label="Code" value={formatCode(res.code ?? '')} />
            <Text style={textStyles.muted}>Under-18s show as initials here; the printed certificate has their full name. Check the details match the paper.</Text>
            {res.tournamentId ? <Button label="See the tournament" variant="ghost" onPress={() => nav.navigate('Tournament', { tournamentId: res.tournamentId! })} /> : null}
          </Card>
        ) : (
          <>
            {res && !res.found ? (
              <Card style={[{ gap: theme.spacing(1) }, st.bad]}>
                <Text style={[textStyles.h3, { color: theme.colors.danger }]}>No certificate with that code</Text>
                <Text style={textStyles.muted}>Check the code on the certificate (letters and numbers only — no O or I). A certificate that isn’t found here wasn’t issued on SportnNote.</Text>
              </Card>
            ) : null}
            <TextField label="Certificate code" value={code} onChange={setCode} placeholder="e.g. ABCD-E234-56" autoCapitalize="characters" />
            <FormError message={error} />
            <Button label="Check" onPress={() => void check(code)} disabled={!code.trim()} />
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.row}>
      <Text style={textStyles.muted}>{label}</Text>
      <Text style={[textStyles.body, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(3) },
  good: { borderColor: theme.colors.primary },
  bad: { borderColor: theme.colors.danger },
});
