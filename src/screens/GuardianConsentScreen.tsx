/**
 * SD-152 / CL-03 — the page a parent/guardian opens from the link their child
 * sent (…/guardian-consent?c=CODE). Shows the child's first name and age band,
 * what SportnNote keeps and shows, then:
 *   • "I don't agree" — works signed out, as before (the account is locked);
 *   • approving — from the parent's OWN account (18+): signed out, they sign in
 *     or create one and come back here; signed in, they send a photo ID and a
 *     document showing the relationship, which a reviewer checks
 *     (docs/security/cl03-parental-proof-design.md, founder 2026-10-29).
 * Server: guardian_consent_preview / guardian_consent_decide / guardian_proof_*.
 */
import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, LoadingState, ScreenTitle, TextField, textStyles } from '../components/ui';
import { GuardianProofForm } from '../components/GuardianProofForm';
import { useAuth } from '../core/auth';
import { promptSignIn } from '../core/guest';
import { REVIEW_PROMISE } from '../core/guardianProof';
import { decideGuardianConsent, previewGuardianConsent, type ConsentPreview } from '../data/privacy';
import { guardianProofChild } from '../data/guardianProof';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function GuardianConsentScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'GuardianConsent'>>();
  const { profile, demo } = useAuth();
  const signedIn = !!profile && !demo;
  const [code, setCode] = useState(params?.c ?? '');
  const [preview, setPreview] = useState<ConsentPreview | null>(null);
  const [checking, setChecking] = useState(!!params?.c);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'withdrawn' | 'submitted' | null>(null);
  const [childId, setChildId] = useState<string | null>(null);

  const check = async (c: string) => {
    setChecking(true); setError(null);
    try { setPreview(await previewGuardianConsent(c)); }
    catch (e) { setPreview(null); setError(e instanceof Error ? e.message : 'That code didn’t work.'); }
    finally { setChecking(false); }
  };
  useEffect(() => { if (params?.c) void check(params.c); }, [params?.c]);

  // Signed in with a valid link → which child (the upload goes in their folder).
  useEffect(() => {
    if (!signedIn || !preview || !code.trim()) return;
    let on = true;
    guardianProofChild(code).then((id) => { if (on) setChildId(id); })
      .catch((e) => { if (on) setError(e instanceof Error ? e.message : 'That link didn’t work.'); });
    return () => { on = false; };
  }, [signedIn, preview, code]);

  const decline = async () => {
    setBusy(true); setError(null);
    try { await decideGuardianConsent(code, false); setDone('withdrawn'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    finally { setBusy(false); }
  };

  const child = preview?.childFirstName || 'Your child';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Parent or guardian approval" subtitle="SportnNote — school and club sports scores" />

        {done === 'submitted' ? (
          <Card style={st.gap}>
            <Text style={textStyles.h3}>Thank you — your documents are sent</Text>
            <Text style={textStyles.body}>{REVIEW_PROMISE} You and {child} will be told. Until then {child} can play and be scored, but stays hidden from search and public lists.</Text>
            <Text style={textStyles.muted}>See where it stands any time in Settings → Parental approvals.</Text>
            <Button label="Parental approvals" variant="ghost" onPress={() => nav.navigate('GuardianProof')} />
          </Card>
        ) : done === 'withdrawn' ? (
          <Card style={st.gap}>
            <Text style={textStyles.h3}>Done — {child}’s account is locked</Text>
            <Text style={textStyles.body}>Their profile is hidden and following and messages are off. The account and its data will be deleted in 30 days unless you change your mind (ask them to send a new link).</Text>
            <Button label="🔒 Read the Privacy Policy" variant="ghost" onPress={() => nav.navigate('Legal', { doc: 'privacy' })} />
          </Card>
        ) : checking ? (
          <LoadingState label="Checking the link…" />
        ) : preview ? (
          <>
            <Card style={st.gap}>
              <Text style={textStyles.h3}>{child}{preview.ageBand ? ` (${preview.ageBand})` : ''} wants to use SportnNote</Text>
              <Text style={textStyles.body}>You got this because {child} gave your email as their parent or guardian.</Text>
              <Text style={[textStyles.body, { fontWeight: '700' }]}>What SportnNote keeps</Text>
              <Text style={textStyles.muted}>• Name, date of birth, mobile or email, and your contact details as their guardian</Text>
              <Text style={textStyles.muted}>• Their sports profile, matches, scores and stats</Text>
              <Text style={[textStyles.body, { fontWeight: '700' }]}>Who sees it</Text>
              <Text style={textStyles.muted}>• Their full name and profile only to you and to people on their teams, clubs and tournaments; everyone else — signed in or not — sees only their initials</Text>
              <Text style={textStyles.muted}>• Coaches and scouts can’t message them — messages about them come to you</Text>
              <Text style={textStyles.muted}>• No ads, no selling of data, and their activity is never linked to analytics</Text>
              <Text style={textStyles.muted}>Data is stored in India (Mumbai). You can view, download or delete it, or withdraw consent, at any time.</Text>
              <Button label="🔒 Read the Privacy Policy" variant="ghost" onPress={() => nav.navigate('Legal', { doc: 'privacy' })} />
            </Card>

            {!signedIn ? (
              <Card style={st.gap}>
                <Text style={textStyles.h3}>To approve, use your own SportnNote account</Text>
                <Text style={textStyles.body}>It must be your account (18 or over), not {child}’s. You’ll then send a photo ID and a document showing you’re the parent or guardian — so nobody else can approve in your name.</Text>
                <View style={st.row}>
                  <Button label="Sign in" variant="ghost" style={st.flex} onPress={() => promptSignIn('in')} />
                  <Button variant="primary" label="Create an account" style={st.flex} onPress={() => promptSignIn('up')} />
                </View>
              </Card>
            ) : childId ? (
              <GuardianProofForm code={code} childProfileId={childId} childFirstName={child} dob={preview.dob} onDone={() => setDone('submitted')} />
            ) : !error ? (
              <LoadingState label="Getting the form ready…" />
            ) : null}

            <FormError message={error} />
            <Button label={busy ? 'Saving…' : 'I don’t agree'} variant="ghost" onPress={() => void decline()} disabled={busy} />
          </>
        ) : (
          <>
            <Text style={textStyles.body}>Enter the code from the email we sent you.</Text>
            <TextField label="Code" value={code} onChange={setCode} placeholder="e.g. 7KQ2-XH9M-…" autoCapitalize="characters" />
            <FormError message={error} />
            <Button variant="primary" label="Continue" onPress={() => void check(code)} disabled={!code.trim()} />
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
});
