/**
 * SD-152 / CL-03 — Home card for an under-18 account waiting for a parent
 * (every country since 2026-10-29). The first time it's seen it sends the
 * parent the link by itself. It then follows the parent's documents: waiting →
 * being checked → approved (the card goes) or not accepted (with the reason).
 * Words: childCardState (src/core/guardianProof.ts). Renders nothing for
 * adults, approved accounts and demo.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, textStyles } from './ui';
import { useAuth } from '../core/auth';
import { getMyPrivacyStatus, requestGuardianConsent, type PrivacyStatus } from '../data/privacy';
import { myGuardianProofStatus, type ProofState } from '../data/guardianProof';
import { childCardState } from '../core/guardianProof';
import type { RootStackParamList } from '../navigation/types';
import { IconText } from './Icon';

const ICON = { waiting: '👪', in_review: '⏳', rejected: '⚠', locked: '🔒' } as const;

export function GuardianPendingCard() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile, demo } = useAuth();
  const [status, setStatus] = useState<PrivacyStatus | null>(null);
  const [proof, setProof] = useState<ProofState | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    if (demo || !profile) return;
    let on = true;
    void getMyPrivacyStatus().then(async (s) => {
      if (!on || !s?.limited) return;
      setStatus(s);
      const p = await myGuardianProofStatus();
      if (on) setProof(p);
      // First sight of a waiting account: send the parent the link right away.
      if (s.guardianConsent === 'pending' && !s.pendingRequestSentAt && !p && !autoSent.current) {
        autoSent.current = true;
        const r = await requestGuardianConsent();
        if (on && r.sent) setSentTo(r.email ?? s.guardianEmailHint ?? 'your parent/guardian');
      }
    }).catch(() => {});
    return () => { on = false; };
  }, [profile?.id, demo]);

  const card = childCardState({
    limited: !!status?.limited,
    consent: status?.guardianConsent ?? null,
    proof: proof ? { status: proof.status, reason: proof.reason } : null,
    emailedTo: sentTo ?? (status?.pendingRequestSentAt ? status.guardianEmailHint ?? null : null),
  });
  if (!card) return null;

  const resend = async () => {
    setSending(true); setNote(null);
    try {
      const r = await requestGuardianConsent();
      if (r.sent) { setSentTo(r.email ?? status?.guardianEmailHint ?? 'your parent/guardian'); setNote('Sent.'); }
      else setNote(r.reason ?? 'Couldn’t send — try again later.');
    } catch { setNote('Couldn’t send — try again later.'); }
    finally { setSending(false); }
  };

  return (
    <Card style={st.card}>
      <View style={{ gap: theme.spacing(1) }}>
        <IconText label={`${ICON[card.kind]} ${card.title}`} style={textStyles.h3} />
        <Text style={textStyles.muted}>{card.body}</Text>
        {note ? <Text style={textStyles.muted}>{note}</Text> : null}
      </View>
      <View style={st.row}>
        {card.kind === 'waiting' ? (
          <Button label={sending ? 'Sending…' : 'Send the link again'} variant="ghost" onPress={() => void resend()} disabled={sending} />
        ) : null}
        <Button label="Details" variant="ghost" onPress={() => nav.navigate('Privacy')} />
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), borderColor: theme.colors.accent },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
