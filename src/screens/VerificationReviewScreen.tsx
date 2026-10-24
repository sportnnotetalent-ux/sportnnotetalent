/** Review verifications — age & guardian proofs (docs/verification/fast-lanes.md).
 *  For SportnNote reviewers: support, plus the people support appoints here.
 *  Each submission shows the document beside what was entered, so a decision
 *  takes seconds: approve, or reject with a one-tap reason. The player (and
 *  their linked parent) is notified by the server straight away. New
 *  submissions push every reviewer; anything waiting 12 hours is re-alerted. */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, Image, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Button, Card, Pill, TextField, ScreenTitle, EmptyState, SelectChip, FormError, textStyles } from '../components/ui';
import { PhoneField } from '../components/PhoneField';
import {
  findPlayerByEmail, findPlayerByPhone, getPendingVerifications, getVerificationReviewers, reviewVerification,
  setVerificationReviewer, verificationDocUrl, type PendingVerification,
} from '../data/repos';
import { useVerificationReviewer } from '../data/useVerificationReviewer';
import { ageFromDob } from '../core/age';
import { isSupport } from '../core/roles';
import { useAuth } from '../core/auth';
import { REJECT_REASONS, isImageDoc, isOverdue, priorRejections, readableDob, waitedLabel } from '../core/verificationReview';

export default function VerificationReviewScreen() {
  const { profile } = useAuth();
  const reviewer = useVerificationReviewer();
  const [pending, setPending] = useState<PendingVerification[] | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    if (!reviewer) return;
    setNow(Date.now());
    void getPendingVerifications().then(setPending).catch(() => setPending([]));
  }, [reviewer]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const decided = (p: PendingVerification, status: 'approved' | 'rejected') => {
    setPending((list) => (list ?? []).filter((x) => x.playerId !== p.playerId));
    setDone(`${status === 'approved' ? '☑️ Approved' : '✗ Sent back'} — ${p.fullName} has been notified.`);
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="🛡️ Review verifications" subtitle="Age & guardian proofs · aim for the same day" />

        {reviewer === false ? (
          <Card><Text style={textStyles.body}>🔒 Reviewers only</Text><Text style={textStyles.muted}>Ask SportnNote support to add you as a reviewer.</Text></Card>
        ) : reviewer === null || pending === null ? (
          <Card><Text style={textStyles.muted}>Loading…</Text></Card>
        ) : (
          <>
            <Text style={textStyles.muted}>
              Open each document and check the name and date of birth match what was entered, then approve or reject. The player and their parent/guardian are told straight away. Documents are deleted 30 days after your decision.
            </Text>
            {done ? <Text style={st.done} accessibilityRole="alert">{done}</Text> : null}
            {pending.length === 0 ? (
              <Card><EmptyState icon="🎉" title="Nothing waiting" hint="You'll get a notification when someone uploads a proof." compact /></Card>
            ) : (
              pending.map((p) => <Submission key={p.playerId} p={p} now={now} onDecided={(s) => decided(p, s)} />)
            )}
            {isSupport(profile?.role) ? <Reviewers /> : null}
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Submission({ p, now, onDecided }: { p: PendingVerification; now: number; onDecided: (s: 'approved' | 'rejected') => void }) {
  const [reason, setReason] = useState(p.docPath ? '' : REJECT_REASONS[4]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const age = ageFromDob(p.dob);
  const overdue = isOverdue(p.submittedAt, now);
  const rejectedBefore = priorRejections(p.history);

  const decide = async (status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !reason.trim()) { setError('Pick or type a reason, so they know what to fix.'); return; }
    setBusy(true);
    setError(null);
    try {
      await reviewVerification(p.playerId, status, status === 'rejected' ? reason.trim() : undefined);
      onDecided(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the decision.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <Text style={[textStyles.body, { fontWeight: '800', flex: 1 }]}>{p.fullName}</Text>
        <Pill
          label={`⏳ ${waitedLabel(p.submittedAt, now)}`}
          color={theme.colors.surfaceAlt}
          textColor={overdue ? theme.colors.danger : theme.colors.accent}
        />
      </View>
      <Row label="Date of birth entered" value={`${readableDob(p.dob)}${age !== undefined ? ` · ${age} yrs${age < 18 ? ' (under 18)' : ''}` : ''}`} />
      {age !== undefined && age < 18 ? (
        <Row label="Parent / guardian" value={p.guardianName ? `${p.guardianName}${p.guardianLinked ? ' · linked ✓' : ''}` : 'Not added yet'} />
      ) : null}
      {rejectedBefore > 0 ? <Row label="Sent back before" value={`${rejectedBefore}×`} /> : null}

      <DocPreview docPath={p.docPath} docName={p.docName} />

      <Text style={textStyles.muted}>If rejecting, why?</Text>
      <View style={st.chips}>
        {REJECT_REASONS.map((r) => (
          <SelectChip key={r} label={r} active={reason === r} onPress={() => setReason(reason === r ? '' : r)} />
        ))}
      </View>
      <TextField label="Or type a reason" value={(REJECT_REASONS as readonly string[]).includes(reason) ? '' : reason} onChange={setReason} placeholder="e.g. Please upload the page with your photo" />
      <FormError message={error} />
      <View style={st.actions}>
        <Button label="✗ Reject" variant="danger" style={st.flex} onPress={() => decide('rejected')} disabled={busy} />
        <Button label={busy ? '…' : '☑️ Approve'} style={st.flex} onPress={() => decide('approved')} disabled={busy || !p.docPath} />
      </View>
    </Card>
  );
}

/** The document beside the details: an image inline (tap for full size), a PDF
 *  opened in the browser. Signed for one hour, only for reviewers. */
function DocPreview({ docPath, docName }: { docPath?: string; docName?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const image = isImageDoc(docName);
  useEffect(() => {
    let on = true;
    if (!docPath) return;
    void verificationDocUrl(docPath).then((u) => { if (on) { setUrl(u); setFailed(!u); } }).catch(() => on && setFailed(true));
    return () => { on = false; };
  }, [docPath]);

  if (!docPath) {
    return <Text style={st.warn}>No file was uploaded with this submission — reject it with “please upload again”.</Text>;
  }
  if (failed) return <Text style={st.warn}>Couldn’t open the document. Pull to refresh, or try again in a minute.</Text>;
  if (!url) return <Text style={textStyles.muted}>Loading document…</Text>;
  if (image) {
    return (
      <Pressable onPress={() => void Linking.openURL(url)} accessibilityRole="imagebutton" accessibilityLabel={`Document ${docName ?? ''}. Open full size`}>
        <Image source={{ uri: url }} style={st.doc} resizeMode="contain" />
        <Text style={st.docHint}>Tap to open full size · {docName}</Text>
      </Pressable>
    );
  }
  return <Button label={`📄 Open ${docName ?? 'document'}`} variant="ghost" onPress={() => void Linking.openURL(url)} />;
}

/** Support: who else can review. Added by their mobile or email (they need a
 *  SportnNote account). */
function Reviewers() {
  const [list, setList] = useState<{ profileId: string; fullName: string }[]>([]);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => { void getVerificationReviewers().then(setList); }, []);
  useEffect(reload, [reload]);

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const p = phone.trim() ? await findPlayerByPhone(phone) : email.trim() ? await findPlayerByEmail(email) : null;
      if (!p?.profileId) { setMsg('No SportnNote account found with that mobile or email.'); return; }
      await setVerificationReviewer(p.profileId, true);
      setMsg(`${p.fullName} can now review verifications.`);
      setPhone('');
      setEmail('');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Couldn’t add that reviewer.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try { await setVerificationReviewer(id, false); reload(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Couldn’t remove.'); }
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>👥 Reviewers</Text>
      <Text style={textStyles.muted}>People you trust to check documents. They get the alerts and can approve or reject — nothing else.</Text>
      {list.length === 0 ? <Text style={textStyles.muted}>Only support accounts so far.</Text> : list.map((r) => (
        <View key={r.profileId} style={st.head}>
          <Text style={[textStyles.body, { flex: 1 }]}>{r.fullName}</Text>
          <Button label="Remove" variant="ghost" onPress={() => void remove(r.profileId)} />
        </View>
      ))}
      <PhoneField label="Add by mobile" value={phone} onChange={setPhone} optional />
      <TextField label="…or by email" value={email} onChange={setEmail} placeholder="name@example.com" autoCapitalize="none" />
      {msg ? <Text style={textStyles.muted}>{msg}</Text> : null}
      <Button label={busy ? 'Adding…' : '＋ Add reviewer'} onPress={() => void add()} disabled={busy || (!phone.trim() && !email.trim())} />
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.row}>
      <Text style={textStyles.muted}>{label}</Text>
      <Text style={[textStyles.body, { flex: 1, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  actions: { flexDirection: 'row', gap: theme.spacing(3), marginTop: theme.spacing(1) },
  flex: { flex: 1 },
  doc: { width: '100%', height: 320, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt },
  docHint: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginTop: theme.spacing(1) },
  warn: { color: theme.colors.danger, fontSize: theme.font.small },
  done: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
});
