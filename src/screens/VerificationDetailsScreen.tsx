/**
 * Age & guardian verification — the details behind the profile's compact card:
 * what it is, upload / re-submit, the latest support note and the complete
 * history. A support reviewer also opens the document and approves / rejects
 * here. Only the player themself (their own login) and support may open it
 * (docs/security/breaks/verification-card.md); documents are never shown to
 * anyone else.
 */
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { IconText } from '../components/Icon';
import { Button, Card, EmptyState, FormError, LoadingState, Pill, TextField, textStyles } from '../components/ui';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { isSupport } from '../core/roles';
import { canSeeVerification, historyRows, verificationSummary } from '../core/verificationReview';
import { usePlayerProfile } from '../data/hooks';
import { getMyPlayerId, reviewVerification, verificationDocUrl } from '../data/repos';
import { useVerificationUpload } from '../data/useVerificationUpload';
import type { IdVerification } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

const TONE = { ok: theme.colors.primary, wait: theme.colors.accent, bad: theme.colors.danger, none: theme.colors.textMuted } as const;

export default function VerificationDetailsScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'VerificationDetails'>>();
  const playerId = params?.playerId ?? '';
  const { profile: viewer } = useAuth();
  const viewerIsSupport = isSupport(viewer?.role);
  const { player, status: loadStatus } = usePlayerProfile(playerId || undefined);

  // P1: the route takes any playerId, so the screen checks who is looking.
  const [myPlayerId, setMyPlayerId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let on = true;
    getMyPlayerId(viewer?.id).then((id) => on && setMyPlayerId(id)).catch(() => on && setMyPlayerId(null));
    return () => { on = false; };
  }, [viewer?.id]);

  const [v, setV] = useState<IdVerification | undefined>(player?.verification);
  useEffect(() => setV(player?.verification), [player?.verification]);

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { upload, uploading, uploadError } = useVerificationUpload(player ?? { id: playerId }, setV);

  if (myPlayerId === undefined || (!player && loadStatus === 'loading')) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><LoadingState /></SafeAreaView>;
  }
  const owner = !!myPlayerId && myPlayerId === playerId;
  if (!player || !canSeeVerification({ playerId, myPlayerId, viewerIsSupport })) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.content}>
          <EmptyState icon="🔒" title="Only the player can see this" hint="Age & guardian verification is private to the player (and SportnNote support)." />
        </View>
      </SafeAreaView>
    );
  }
  // A support reviewer looking at someone else's record gets the reviewer tools.
  const reviewer = !owner && viewerIsSupport ? { id: viewer?.id, name: viewer?.fullName } : undefined;

  const status = v?.status;
  const confirmedBy = status !== 'approved' && (player.ageVerifiedBy === 'school' || player.ageVerifiedBy === 'parent') ? player.ageVerifiedBy : undefined;
  const summary = verificationSummary({ status, confirmedBy, viewer: owner ? 'owner' : 'reviewer' });
  const rows = historyRows(v?.history);

  const viewDoc = async () => {
    setOpening(true);
    try {
      const url = await verificationDocUrl(v?.docPath);
      if (url) await Linking.openURL(url);
    } finally {
      setOpening(false);
    }
  };

  // Reviewer: the server records the decision (reviewer identity from the
  // server) and notifies the player and their parent/guardian.
  const review = async (decision: 'approved' | 'rejected') => {
    const reason = decision === 'rejected' ? note.trim() || undefined : undefined;
    if (decision === 'rejected' && !reason) { setError('Add a reason, so they know what to fix.'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await reviewVerification(player.id, decision, reason, reviewer);
      setV((prev) => ({
        ...(prev ?? {}),
        status: decision,
        note: reason,
        reviewedAt: r.reviewedAt,
        reviewedById: reviewer?.id,
        reviewedByName: r.reviewedByName ?? reviewer?.name,
        history: [...(prev?.history ?? []), { action: decision, at: r.reviewedAt, byId: reviewer?.id, byName: r.reviewedByName ?? reviewer?.name, note: reason }],
      }));
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the decision.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <Card style={st.gap}>
          <View style={st.head}>
            <Text style={[textStyles.h3, st.headTitle]}>{owner ? 'Your verification' : player.fullName}</Text>
            <Pill label={summary.chip} color={theme.colors.surfaceAlt} textColor={TONE[summary.tone]} />
          </View>
          <Text style={textStyles.body}>{summary.next}</Text>
          <Text style={textStyles.muted}>
            Verify the player&apos;s date of birth by uploading a proof ID (image or PDF), e.g. a birth certificate, school ID or passport. For under-18 players this also confirms the parent/guardian. Our support team reviews and approves it, and only they ever see the document.
          </Text>
          {owner && status !== 'approved' && !confirmedBy && (
            <Button
              label={uploading ? 'Uploading…' : status === 'pending' || status === 'rejected' ? '📎 Re-submit proof (image / PDF)' : '📎 Upload proof of DOB (image / PDF)'}
              variant={summary.action ? 'primary' : 'ghost'}
              onPress={upload}
              disabled={uploading}
            />
          )}
          {status === 'pending' && owner && (
            <Text style={textStyles.muted}>Sent. A SportnNote reviewer will check it, usually within a few hours. You&apos;ll get a notification.</Text>
          )}
          <FormError message={uploadError ?? error} />
        </Card>

        {status === 'rejected' && v?.note ? (
          <Card style={[st.gap, st.noteCard]}>
            <Text style={st.sectionTitle}>Support note</Text>
            <Text style={textStyles.body}>{v.note}</Text>
          </Card>
        ) : null}

        {/* Support reviewer: open the doc + approve/reject. */}
        {reviewer && (
          <Card style={st.gap}>
            <Text style={st.sectionTitle}>Review</Text>
            {v?.docPath ? (
              <Button label={opening ? 'Opening…' : '📄 View document'} variant="ghost" onPress={viewDoc} disabled={opening} />
            ) : (
              <Text style={textStyles.muted}>No file was uploaded with this submission. Reject it so they can upload again.</Text>
            )}
            {status === 'pending' ? (
              <>
                <TextField label="Reason (if rejecting)" value={note} onChange={setNote} placeholder="e.g. Document unclear / DOB doesn’t match" />
                <View style={st.reviewRow}>
                  <Button label="✗ Reject" variant="danger" style={st.flex} onPress={() => review('rejected')} disabled={busy} />
                  <Button label={busy ? '…' : '☑️ Approve'} style={st.flex} onPress={() => review('approved')} disabled={busy} />
                </View>
              </>
            ) : (
              <IconText
                style={textStyles.muted}
                label={`${status === 'approved' ? '☑️ Approved' : status === 'rejected' ? '✗ Rejected' : 'Not submitted yet'}${status && v?.reviewedByName ? ` by ${v.reviewedByName}` : ''}.`}
              />
            )}
          </Card>
        )}

        {/* Immutable, append-only history (compliance trail). */}
        <Card style={st.gap}>
          <Text style={st.sectionTitle}>Verification history</Text>
          {rows.length === 0 ? <Text style={textStyles.muted}>Nothing submitted yet.</Text> : null}
          {rows.map((r, i) => (
            <View key={i} style={st.historyRow} accessible accessibilityLabel={`${r.line}, ${r.when}${r.note ? `. Reason: ${r.note}` : ''}`}>
              <IconText
                style={[st.historyLine, { color: r.action === 'approved' ? theme.colors.primary : r.action === 'rejected' ? theme.colors.danger : theme.colors.text }]}
                label={`${r.icon} ${r.line}`}
              />
              <Text style={st.historyAt}>{r.when}</Text>
              {r.note ? <Text style={st.historyNote}>Reason: {r.note}</Text> : null}
            </View>
          ))}
        </Card>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10), maxWidth: 720, width: '100%', alignSelf: 'center' },
  gap: { gap: theme.spacing(2) },
  // Wraps: on a narrow phone the status drops under the title instead of being cut off.
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  headTitle: { flexShrink: 1 },
  noteCard: { borderColor: theme.colors.danger },
  sectionTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  reviewRow: { flexDirection: 'row', gap: theme.spacing(3), marginTop: theme.spacing(1) },
  flex: { flex: 1 },
  historyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(1), paddingVertical: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border },
  historyLine: { fontSize: theme.font.small, flexShrink: 1 },
  historyAt: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  historyNote: { color: theme.colors.textMuted, fontSize: theme.font.small, width: '100%' },
});
