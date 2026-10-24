/** A community's verification card (docs/verification/org-verification.md).
 *  Registered or an informal group (asked once); a registered school / college
 *  gets verified in three steps (OrgVerify screen) and SportnNote support
 *  decides; other registered types keep the simple request for now (Phase 2).
 *  Once verified, Owners / Admins confirm members' dates of birth. */
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, textStyles } from './ui';
import { requestOrgVerification, reviewOrgVerification } from '../data/repos';
import { getOrgVerificationState, setOrgRegistered } from '../data/orgVerification';
import { verifiableType, verificationProgress, type OrgVerificationState } from '../core/orgVerification';
import { useAuth } from '../core/auth';
import { isSupport } from '../core/roles';
import type { Organization } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

export function OrgVerificationCard({ org, canManage, onChanged, onConfirmDobs }: {
  org: Organization;
  /** the viewer is an Owner / Admin */
  canManage: boolean;
  onChanged: () => void;
  onConfirmDobs: () => void;
}) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile } = useAuth();
  const support = isSupport(profile?.role);
  const [state, setState] = useState<OrgVerificationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!canManage && !support) return;
    void getOrgVerificationState(org.id).then(setState).catch(() => setState(null));
  }, [org.id, canManage, support, org.verifiedAt, org.registered, org.type, org.name]);
  useEffect(load, [load]);
  // back from the three steps (or the queue) → fresh status
  useFocusEffect(load);

  if (!canManage && !support && !org.verifiedAt) return null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    finally { setBusy(false); }
  };
  const registered = state ? state.registered : (org.registered ?? null);
  const v = state?.verification;
  const progress = state ? verificationProgress(state) : null;
  const kind = org.type?.toLowerCase() || 'organisation';

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>{org.verifiedAt ? '✓ Verified by SportnNote' : registered === false ? '👥 Informal group' : '🛡️ Verification'}</Text>

      {org.verifiedAt ? (
        canManage ? (
          <>
            <Text style={textStyles.muted}>You can confirm your members’ dates of birth from your own records — the fastest way to verify everyone’s age for age-group events.</Text>
            <Button label="📋 Confirm members’ dates of birth" onPress={onConfirmDobs} />
          </>
        ) : (
          <Text style={textStyles.muted}>SportnNote has checked this {kind} is genuine.</Text>
        )
      ) : canManage ? (
        registered === null ? (
          <>
            <Text style={textStyles.muted}>Is {org.name} a registered organisation (a school, college, company, club or society), or an informal group like friends or a neighbourhood?</Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing(2), flexWrap: 'wrap' }}>
              <Button label="🏛️ Registered" style={{ flexGrow: 1 }} onPress={() => void act(() => setOrgRegistered(org.id, true))} disabled={busy} />
              <Button label="👥 Informal group" variant="ghost" style={{ flexGrow: 1 }} onPress={() => void act(() => setOrgRegistered(org.id, false))} disabled={busy} />
            </View>
          </>
        ) : registered === false ? (
          <>
            <Text style={textStyles.muted}>An informal group doesn’t need verifying. Everything works as normal.</Text>
            <Text style={{ color: theme.colors.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => void act(() => setOrgRegistered(org.id, true))}>It’s actually a registered organisation</Text>
          </>
        ) : verifiableType(org.type) ? (
          v?.status === 'pending' ? (
            <>
              <Text style={textStyles.muted}>Sent on {day(v.submittedAt)}. SportnNote support is checking it — usually within a day — and will let you know.</Text>
              {v.authority === 'head' && !v.headConfirmedAt ? <Text style={textStyles.muted}>⏳ Waiting for the Head to confirm by email.</Text> : null}
              <Button label="View what you sent" variant="ghost" onPress={() => nav.navigate('OrgVerify', { orgId: org.id })} />
            </>
          ) : v?.status === 'rejected' ? (
            <>
              <Text style={[textStyles.body, { color: theme.colors.danger }]}>Sent back: {v.rejectReason || 'see the details'}</Text>
              <Button label="Fix it and send again" onPress={() => nav.navigate('OrgVerify', { orgId: org.id })} />
            </>
          ) : (
            <>
              <Text style={textStyles.muted}>Get the ✓ in three steps: your official ID, a recognition document, and proof you’re authorised by the {kind}. Then you can confirm all your members’ dates of birth from your records.</Text>
              {progress && progress.todo.length < 3 ? <Text style={textStyles.muted}>Still to do: {progress.todo.join(' · ') || 'send it'}</Text> : null}
              <Button label="🛡️ Get verified" onPress={() => nav.navigate('OrgVerify', { orgId: org.id })} />
            </>
          )
        ) : org.verificationRequestedAt ? (
          <Text style={textStyles.muted}>Requested on {day(org.verificationRequestedAt)}. SportnNote will check it’s genuine — usually within a day — and let you know.</Text>
        ) : (
          <>
            <Text style={textStyles.muted}>Get verified once, then confirm all your members’ dates of birth from your records in one go — no documents needed from each player.</Text>
            <Button label={busy ? 'Sending…' : 'Ask SportnNote to verify us'} variant="ghost" onPress={() => void act(() => requestOrgVerification(org.id))} disabled={busy} />
          </>
        )
      ) : null}

      {support ? (
        <View style={{ gap: theme.spacing(1) }}>
          {org.verifiedAt
            ? <Button label="Remove verification (support)" variant="ghost" onPress={() => void act(() => reviewOrgVerification(org.id, false))} disabled={busy} />
            : org.verificationRequestedAt
              ? <Button label="Review it in the queue (support)" variant="ghost" onPress={() => nav.navigate('VerificationReview')} />
              : null}
        </View>
      ) : null}
      <FormError message={error} />
    </Card>
  );
}
