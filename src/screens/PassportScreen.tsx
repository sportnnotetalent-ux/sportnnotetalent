/** Career passport (app.sportnnote.in/pp/CODE) — a player's verified record:
 *  official matches by sport, honours from organiser-issued certificates and
 *  how their age was verified. Anyone with the link sees it (a possible minor
 *  by initials); the player or their parent shares, prints or resets the link.
 *  Migration 20261025110000_career_passport. */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { theme } from '../core/theme';
import { Button, Card, FormError, LoadingState, Pill, ScreenTitle, TextField, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import { APP_URL } from '../core/hosts';
import { shareMessage } from '../core/share';
import { formatCode } from '../core/certificates';
import { AGE_VERIFIED_TEXT, honourCounts, passportUrl } from '../core/passport';
import { readableDob } from '../core/verificationReview';
import { recordText } from '../data/stats';
import { getPassportCode, passportRows, printPassport, resetPassportCode, resolvePassport, type Passport } from '../data/passport';
import type { RootStackParamList } from '../navigation/types';
import { IconText } from '../components/Icon';

export default function PassportScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Passport'>>();
  const [code, setCode] = useState(params?.code ?? '');
  const [typed, setTyped] = useState('');
  const [pp, setPp] = useState<Passport | null>(null);
  const [loading, setLoading] = useState(!!(params?.code || params?.playerId));
  const [busy, setBusy] = useState<'print' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (c: string) => {
    setLoading(true); setError(null);
    try { setCode(c); setPp(await resolvePassport(c)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t open it just now.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (params?.code) { void open(params.code); return; }
    if (!params?.playerId) return;
    // From the profile / a parent's child page: make (or fetch) the code first.
    void getPassportCode(params.playerId).then(open).catch((e) => {
      setError(e instanceof Error ? e.message : 'Couldn’t make the passport link.');
      setLoading(false);
    });
  }, [params?.code, params?.playerId, open]);

  const link = code ? passportUrl(code, APP_URL) : '';
  const share = () => void shareMessage(`${pp?.name ?? 'My'} — career passport on SportnNote: official record and verified honours. ${link}`, 'profile');
  const print = async () => {
    if (!pp) return;
    setBusy('print');
    try {
      const r = await printPassport(pp, code);
      if (r === 'failed') setError('Printing isn’t available here — update the app, or open app.sportnnote.in on a computer to print.');
    } finally { setBusy(null); }
  };
  const reset = async () => {
    if (!pp?.playerId) return;
    const ok = await askConfirm({ title: 'Make a new link?', message: 'The old link and QR stop working — anyone you sent them to will need the new one.', yesLabel: 'Yes, new link', noLabel: 'No, keep it', tone: 'caution' });
    if (!ok) return;
    setBusy('reset');
    try { await open(await resetPassportCode(pp.playerId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t reset the link.'); }
    finally { setBusy(null); }
  };

  if (loading) return <SafeAreaView style={st.safe} edges={['bottom']}><LoadingState label="Opening the passport…" /></SafeAreaView>;

  if (!pp?.found) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <ScreenTitle title="Career passport" subtitle="A player’s verified record on SportnNote" />
          {pp && !pp.found ? (
            <Card style={[{ gap: theme.spacing(1) }, st.bad]}>
              <Text style={[textStyles.h3, { color: theme.colors.danger }]}>No passport with that code</Text>
              <Text style={textStyles.muted}>The link may have been replaced by a newer one — ask the player for their current link.</Text>
            </Card>
          ) : null}
          <TextField label="Passport code" value={typed} onChange={setTyped} placeholder="e.g. ABCD-E234-56" autoCapitalize="characters" />
          <FormError message={error} />
          <Button label="Open" onPress={() => void open(typed)} disabled={!typed.trim()} />
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  const counts = honourCounts(pp.honours);
  const rows = passportRows(pp.official);
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <Card style={[{ gap: theme.spacing(2) }, st.good]}>
          <IconText label={"🪪 SportnNote career passport"} style={textStyles.muted} />
          <Text style={textStyles.h1}>{pp.name}</Text>
          <View style={st.pills}>
            {pp.ageVerifiedBy ? <Pill label={`✓ ${AGE_VERIFIED_TEXT[pp.ageVerifiedBy]}`} /> : null}
            {pp.since ? <Pill label={`On SportnNote since ${pp.since.slice(0, 4)}`} /> : null}
          </View>
          <View style={st.tiles}>
            <Tile value={pp.official.matches} label="Official matches" />
            <Tile value={counts.titles} label="Titles" />
            <Tile value={counts.medals} label="Podiums & medals" />
            <Tile value={counts.awards} label="Awards" />
          </View>
          {pp.official.matches ? <Text style={textStyles.muted}>Overall record {recordText(pp.official)}</Text> : null}
        </Card>

        {pp.owner ? (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>Share it</Text>
            <Text style={textStyles.muted}>Send the link to a selector, coach or scholarship panel — or print it. It shows the honours on your certificates; reset the link any time to stop an old one working.</Text>
            <View style={st.qr}>
              <QRCode value={link} size={168} backgroundColor="#ffffff" color="#04150F" quietZone={8} />
              <Text style={st.code}>{formatCode(code)}</Text>
            </View>
            <Button label="↗ Share passport link" onPress={share} />
            <Button label={busy === 'print' ? 'Opening…' : '🖨 Print / Save as PDF'} variant="ghost" onPress={() => void print()} disabled={!!busy} />
            <Button label={busy === 'reset' ? 'Making a new link…' : 'Make a new link'} variant="ghost" onPress={() => void reset()} disabled={!!busy} />
            <FormError message={error} />
          </Card>
        ) : null}

        <Text style={textStyles.h3}>Official record by sport</Text>
        {rows.length ? rows.map((r) => (
          <Card key={r.name} style={st.sportRow}>
            <Text style={st.sportIcon}>{r.icon}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[textStyles.body, { fontWeight: '700' }]}>{r.name}</Text>
              <Text style={textStyles.muted}>{[`${r.matches} ${r.matches === 1 ? 'match' : 'matches'}`, r.record].filter(Boolean).join(' · ')}</Text>
              {r.summary ? <Text style={textStyles.body}>{r.summary}</Text> : null}
            </View>
          </Card>
        )) : <Text style={textStyles.muted}>No tournament matches scored on SportnNote yet.</Text>}

        <Text style={textStyles.h3}>Honours</Text>
        {pp.honours.length ? pp.honours.map((h) => (
          <Card key={h.code} style={{ gap: 2 }}>
            <Text style={[textStyles.body, { fontWeight: '700' }]}>{h.title}</Text>
            {h.detail ? <Text style={textStyles.body}>{h.detail}</Text> : null}
            <Text style={textStyles.muted}>{[h.teamName, h.eventDate ? readableDob(h.eventDate) : '', h.issuer ? `issued by ${h.issuer}` : ''].filter(Boolean).join(' · ')}</Text>
            <Text style={{ color: theme.colors.primary, fontWeight: '700', marginTop: 4 }} accessibilityRole="button" onPress={() => nav.navigate('Certificate', { code: h.code })}>
              ✓ Check certificate {formatCode(h.code)}
            </Text>
          </Card>
        )) : <Text style={textStyles.muted}>No certificates yet — organisers issue them after a tournament.</Text>}

        <Text style={textStyles.muted}>
          Official matches are tournament matches scored live on SportnNote. Honours are certificates issued by the organisers — each one checks against its code.
          {pp.owner ? '' : ' Under-18s show as initials here.'}
        </Text>
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

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  good: { borderColor: theme.colors.primary },
  bad: { borderColor: theme.colors.danger },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  tile: { flexGrow: 1, flexBasis: '22%', minWidth: 70, alignItems: 'center', paddingVertical: theme.spacing(2), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt },
  tileValue: { fontSize: 22, fontWeight: '800', color: theme.colors.primary },
  qr: { alignItems: 'center', gap: theme.spacing(1) },
  code: { fontFamily: 'monospace', fontWeight: '700', letterSpacing: 1, color: theme.colors.text },
  sportRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  sportIcon: { fontSize: 26 },
});
