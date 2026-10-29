/**
 * CL-03 parental proof — Settings → Parental approvals: what this parent has
 * sent for their children, where each stands, and "Send new documents" after a
 * rejection (no new link needed). The decision's notification opens here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { theme } from '../core/theme';
import { Button, Card, EmptyState, LoadingState, Pill, ScreenTitle, textStyles } from '../components/ui';
import { GuardianProofForm } from '../components/GuardianProofForm';
import { REVIEW_PROMISE } from '../core/guardianProof';
import { myGuardianProofs, type MyGuardianProof } from '../data/guardianProof';
import { formatDayShort } from '../core/dates';

const STATUS: Record<MyGuardianProof['status'], { label: string; color: string; text: string }> = {
  pending: { label: 'Being checked', color: theme.colors.surfaceAlt, text: theme.colors.text },
  approved: { label: '✓ Approved', color: theme.colors.primary + '22', text: theme.colors.primary },
  rejected: { label: 'Not accepted', color: theme.colors.danger + '18', text: theme.colors.danger },
};

export default function GuardianProofScreen() {
  const [list, setList] = useState<MyGuardianProof[] | null>(null);
  const [resend, setResend] = useState<MyGuardianProof | null>(null);
  const load = useCallback(() => { void myGuardianProofs().then(setList); }, []);
  useEffect(load, [load]);

  // The newest proof per child decides what to show.
  const latest = (list ?? []).filter((p, i, all) => all.findIndex((q) => q.childProfileId === p.childProfileId) === i);
  const first = (name: string) => name.split(' ')[0] || 'your child';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Parental approvals" subtitle="The documents you sent to approve your child’s account" />
        {resend ? (
          <>
            <Text style={textStyles.body}>Send new documents for {first(resend.childName)}{resend.reason ? ` — last time: ${resend.reason}` : ''}</Text>
            <GuardianProofForm code={null} childProfileId={resend.childProfileId} childFirstName={first(resend.childName)}
              onDone={() => { setResend(null); load(); }} />
            <Button label="Cancel" variant="ghost" onPress={() => setResend(null)} />
          </>
        ) : list === null ? (
          <LoadingState label="Loading…" />
        ) : latest.length === 0 ? (
          <EmptyState icon="👪" title="Nothing sent yet" hint="When your child sends you a link from SportnNote, open it to approve their account." />
        ) : latest.map((p) => (
          <Card key={p.id} style={st.gap}>
            <View style={st.row}>
              <Text style={[textStyles.h3, { flex: 1 }]} numberOfLines={1}>{p.childName || 'Your child'}</Text>
              <Pill label={STATUS[p.status].label} color={STATUS[p.status].color} textColor={STATUS[p.status].text} />
            </View>
            <Text style={textStyles.muted}>
              Sent {formatDayShort(p.submittedAt)}{p.reviewedAt ? ` · checked ${formatDayShort(p.reviewedAt)}` : ''}
            </Text>
            {p.status === 'pending' ? <Text style={textStyles.body}>{REVIEW_PROMISE} You’ll be told.</Text> : null}
            {p.status === 'approved' ? <Text style={textStyles.body}>You’re linked as {first(p.childName)}’s parent or guardian. Manage their data in Settings → Link as a parent/guardian.</Text> : null}
            {p.status === 'rejected' ? (
              <>
                {p.reason ? <Text style={textStyles.body}>{p.reason}</Text> : null}
                <Button label="Send new documents" onPress={() => setResend(p)} />
              </>
            ) : null}
          </Card>
        ))}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10), maxWidth: 720, width: '100%', alignSelf: 'center' },
  gap: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
});
