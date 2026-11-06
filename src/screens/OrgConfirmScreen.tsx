/** The page an organisation's head (Principal, President, Director …) opens
 *  from the email (…/org-confirm?c=CODE) to confirm — or deny — that someone
 *  may manage their organisation's community on
 *  SportnNote. Works without an account. Server: org_head_preview /
 *  org_head_decide (migration 20261025190000_org_verification). */
import React, { useEffect, useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { theme } from '../core/theme';
import { SUPPORT_EMAIL } from '../core/hosts';
import { Button, Card, FormError, LoadingState, ScreenTitle, TextField, textStyles } from '../components/ui';
import { OFFICIAL_ID_RULES, ORG_VERIFY, verifiableType } from '../core/orgVerification';
import { decideHeadConfirm, previewHeadConfirm, type HeadPreview } from '../data/orgVerification';
import type { RootStackParamList } from '../navigation/types';
import { IconText } from '../components/Icon';

export default function OrgConfirmScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'OrgConfirm'>>();
  const [code, setCode] = useState(params?.c ?? '');
  const [preview, setPreview] = useState<HeadPreview | null>(null);
  const [checking, setChecking] = useState(!!params?.c);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<boolean | null>(null);

  const check = async (c: string) => {
    setChecking(true); setError(null);
    try { const p = await previewHeadConfirm(c); setPreview(p); if (p.headName) setName(p.headName); }
    catch (e) { setPreview(null); setError(e instanceof Error ? e.message : 'That link didn’t work.'); }
    finally { setChecking(false); }
  };
  useEffect(() => { if (params?.c) void check(params.c); }, [params?.c]);

  const decide = async (approve: boolean) => {
    if (approve && !name.trim()) { setError('Type your name to confirm.'); return; }
    setBusy(true); setError(null);
    try { setDone((await decideHeadConfirm(code, approve, name.trim() || undefined)).confirmed); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    finally { setBusy(false); }
  };

  // the organisation's own words: "school" + "Principal / Head", "club" + "President / Secretary" …
  const cfg = ORG_VERIFY[verifiableType(preview?.type) ? preview!.type as keyof typeof ORG_VERIFY : 'School'];
  const noun = preview ? cfg.noun : 'organisation';
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={`Confirm who manages your ${noun}`} subtitle="SportnNote — school and club sports scores" />
        {checking ? <LoadingState label="Checking the link…" /> : done !== null ? (
          <Card style={{ gap: theme.spacing(2) }}>
            <IconText label={done ? '✓ Thank you — confirmed' : 'Thank you — noted'} style={textStyles.h3} />
            <Text style={textStyles.muted}>
              {done
                ? `SportnNote support will finish checking ${preview?.orgName ?? `the ${noun}`} and let the person know.`
                : `SportnNote won’t verify ${preview?.orgName ?? `the ${noun}`} on their word. If you think someone is pretending to be the ${noun}, write to ${SUPPORT_EMAIL}.`}
            </Text>
          </Card>
        ) : preview ? (
          <Card style={{ gap: theme.spacing(3) }}>
            <Text style={textStyles.body}>
              <Text style={{ fontWeight: '800' }}>{preview.requesterName}</Text> has asked to manage <Text style={{ fontWeight: '800' }}>{preview.orgName}</Text>’s community on SportnNote — its sports events, results and members — and named you as the {cfg.head}.
            </Text>
            {preview.ids.length ? (
              <View style={{ gap: 2 }}>
                {preview.ids.map((i) => <Text key={i.type} style={textStyles.muted}>{OFFICIAL_ID_RULES[i.type]?.label ?? i.type}: {i.value}</Text>)}
              </View>
            ) : null}
            <Text style={textStyles.body}>Is this person authorised by the {noun} to do this?</Text>
            <TextField label="Your name" value={name} onChange={setName} placeholder={`As ${cfg.head}`} autoCapitalize="words" />
            <FormError message={error} />
            <Button variant="primary" label={busy ? 'Saving…' : '✓ Yes, they’re authorised'} onPress={() => void decide(true)} disabled={busy} />
            <Button label="No, I don’t know them" variant="ghost" onPress={() => void decide(false)} disabled={busy} />
          </Card>
        ) : (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.muted}>Type the code from the email.</Text>
            <TextField label="Code" value={code} onChange={setCode} placeholder="ABCD-EFGH-JKLM-NPQR" autoCapitalize="characters" />
            <FormError message={error} />
            <Button label="Continue" onPress={() => void check(code)} disabled={!code.trim()} />
          </Card>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
});
