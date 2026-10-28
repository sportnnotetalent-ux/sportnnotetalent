/** One checklist on your own profile: date of birth, parent (under 18) or your
 *  own contacts (18+), and how your age is verified — with the next step
 *  (verification fast lanes, Phase 3 — docs/verification/fast-lanes.md). The
 *  detailed cards below (contacts, verification) stay where the codes and the
 *  upload happen. */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { SquareCheck, Square, Hourglass } from 'lucide-react-native';
import { theme } from '../core/theme';
import { Button, Card, textStyles } from './ui';
import { ageOf } from '../core/age';
import { checklistItems, nextStep } from '../core/verificationChecklist';
import { getMyPrivacyStatus, requestGuardianConsent, type GuardianConsent } from '../data/privacy';
import type { Player } from '../core/types';

export function VerificationChecklist({ player, onEditProfile }: { player: Player; onEditProfile: () => void }) {
  const [consent, setConsent] = useState<GuardianConsent | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void getMyPrivacyStatus().then((s) => { if (on) setConsent(s?.guardianConsent ?? null); }).catch(() => on && setConsent(null));
    return () => { on = false; };
  }, [player.id]);

  const g = player.guardian;
  const items = useMemo(() => checklistItems({
    age: ageOf(player),
    hasDob: !!player.dob,
    phoneVerified: player.phoneVerified,
    emailVerified: player.emailVerified,
    guardian: { added: !!(g?.name && (g.phone || g.email)), phoneVerified: g?.phoneVerified, emailVerified: g?.emailVerified },
    consent,
    ageVerifiedBy: player.ageVerifiedBy ?? (player.verification?.status === 'approved' ? 'document' : undefined),
    documentStatus: player.verification?.status,
  }), [player, g, consent]);
  const next = nextStep(items);
  const done = items.filter((x) => x.done).length;

  const sendConsent = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await requestGuardianConsent();
      setNote(r.sent ? `Sent ✓ Ask your parent to check ${r.email ?? 'their email'} and open the link.` : r.reason ?? 'Couldn’t send it — try again later.');
    } finally { setBusy(false); }
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={textStyles.h3}>Ready to play</Text>
        <Text style={textStyles.muted}>{done} of {items.length} done</Text>
      </View>
      {items.map((x) => (
        <View key={x.key} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) }}
          accessibilityLabel={`${x.label}: ${x.done ? 'done' : x.waiting ? 'waiting' : 'to do'}`}>
          {x.done ? <SquareCheck color={theme.colors.primary} size={20} strokeWidth={2.2} />
            : x.waiting ? <Hourglass color={theme.colors.accent} size={20} strokeWidth={2.2} />
            : <Square color={theme.colors.inputBorder} size={20} strokeWidth={2} />}
          <Text style={[textStyles.body, !x.done && { color: x.waiting ? theme.colors.accent : theme.colors.textMuted }]}>{x.label}</Text>
        </View>
      ))}
      {next ? (
        <View style={{ gap: theme.spacing(1), marginTop: theme.spacing(1) }}>
          <Text style={textStyles.muted}>Next: {next.hint}</Text>
          {next.action === 'edit_profile' ? <Button label="✎ Edit profile" variant="ghost" onPress={onEditProfile} /> : null}
          {next.action === 'send_consent' ? <Button label={busy ? 'Sending…' : '✉️ Send my parent the link'} variant="ghost" onPress={() => void sendConsent()} disabled={busy} /> : null}
          {next.action === 'verify_below' ? <Text style={textStyles.muted}>↓ Use “Verify” on the contact card below.</Text> : null}
          {next.action === 'upload_document' ? <Text style={textStyles.muted}>↓ Use “Upload proof” on the verification card below.</Text> : null}
          {note ? <Text style={textStyles.body}>{note}</Text> : null}
        </View>
      ) : (
        <Text style={[textStyles.body, { color: theme.colors.primary }]}>All set — you can be picked for any team or tournament.</Text>
      )}
    </Card>
  );
}
