/** A school / club's verification (docs/verification/fast-lanes.md, Phase 2).
 *  SportnNote verifies an organisation once; its Owners / Admins can then
 *  confirm members' dates of birth from the organisation's own records (the
 *  fastest way to verify a whole school's ages). Reviewers verify it right here. */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { theme } from '../core/theme';
import { Button, Card, FormError, textStyles } from './ui';
import { requestOrgVerification, reviewOrgVerification } from '../data/repos';
import { useVerificationReviewer } from '../data/useVerificationReviewer';
import type { Organization } from '../core/types';

export function OrgVerificationCard({ org, canManage, onChanged, onConfirmDobs }: {
  org: Organization;
  /** the viewer is an Owner / Admin */
  canManage: boolean;
  onChanged: () => void;
  onConfirmDobs: () => void;
}) {
  const reviewer = useVerificationReviewer() === true;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canManage && !reviewer && !org.verifiedAt) return null;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    finally { setBusy(false); }
  };
  const requested = org.verificationRequestedAt ? new Date(org.verificationRequestedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>{org.verifiedAt ? '✓ Verified by SportnNote' : '🛡️ Verification'}</Text>
      {org.verifiedAt ? (
        canManage ? (
          <>
            <Text style={textStyles.muted}>You can confirm your members’ dates of birth from your own records — the fastest way to verify everyone’s age for age-group events.</Text>
            <Button label="📋 Confirm members’ dates of birth" onPress={onConfirmDobs} />
          </>
        ) : (
          <Text style={textStyles.muted}>SportnNote has checked this {org.type?.toLowerCase() || 'organisation'} is genuine.</Text>
        )
      ) : canManage ? (
        requested ? (
          <Text style={textStyles.muted}>Requested on {requested}. SportnNote will check it’s genuine — usually within a day — and let you know.</Text>
        ) : (
          <>
            <Text style={textStyles.muted}>Get verified once, then confirm all your members’ dates of birth from your records in one go — no documents needed from each player.</Text>
            <Button label={busy ? 'Sending…' : 'Ask SportnNote to verify us'} variant="ghost" onPress={() => void act(() => requestOrgVerification(org.id))} disabled={busy} />
          </>
        )
      ) : null}
      {reviewer ? (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={textStyles.muted}>Reviewer: check it’s a genuine {org.type?.toLowerCase() || 'organisation'} (official email, phone or website) before verifying.</Text>
          {org.verifiedAt
            ? <Button label="Remove verification" variant="ghost" onPress={() => void act(() => reviewOrgVerification(org.id, false))} disabled={busy} />
            : (
              <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
                {requested ? <Button label="Decline" variant="ghost" style={{ flex: 1 }} onPress={() => void act(() => reviewOrgVerification(org.id, false))} disabled={busy} /> : null}
                <Button label={busy ? '…' : '✓ Verify'} style={{ flex: 1 }} onPress={() => void act(() => reviewOrgVerification(org.id, true))} disabled={busy} />
              </View>
            )}
        </View>
      ) : null}
      <FormError message={error} />
    </Card>
  );
}
