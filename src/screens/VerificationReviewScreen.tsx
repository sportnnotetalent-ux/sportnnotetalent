/** Review verifications — age & guardian proofs (docs/verification/fast-lanes.md).
 *  For SportnNote reviewers: support, plus the people support appoints here.
 *  Each submission shows the document beside what was entered, so a decision
 *  takes seconds: approve, or reject with a one-tap reason. The player (and
 *  their linked parent) is notified by the server straight away. New
 *  submissions push every reviewer; anything waiting 12 hours is re-alerted. */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, Image, Pressable, Platform } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../core/theme';
import { Button, Card, Pill, TextField, ScreenTitle, EmptyState, SelectChip, FormError, textStyles } from '../components/ui';
import { PhoneField } from '../components/PhoneField';
import {
  findPlayerByEmail, findPlayerByPhone, getPendingVerifications, getVerificationReviewers,
  reviewVerification, setVerificationReviewer, verificationDocUrl,
  type PendingVerification,
} from '../data/repos';
import { decideOrgVerification, getOrgVerificationQueue, type OrgQueueItem } from '../data/orgVerification';
import { LOCAL_ID_TYPES, OFFICIAL_ID_RULES, ORG_VERIFY, SEND_BACK_REASONS, authorityOptions, emailDomain, isEducation, isFreeMail, reviewChecks, verifiableType } from '../core/orgVerification';
import { useVerificationReviewer } from '../data/useVerificationReviewer';
import { canLookUp } from '../data/registerLookup';
import { RegisterCheck } from '../components/support/RegisterCheck';
import { ageFromDob } from '../core/age';
import { isSupport } from '../core/roles';
import { useAuth } from '../core/auth';
import { REJECT_REASONS, isImageDoc, isOverdue, priorRejections, readableDob, waitedLabel, docKindLabel } from '../core/verificationReview';
import { IconText } from '../components/Icon';
import { decideGuardianProof, pendingGuardianProofs, type PendingGuardianProof } from '../data/guardianProof';
import { REJECT_REASONS as GUARDIAN_REJECT_REASONS, RELATIONSHIPS } from '../core/guardianProof';

export default function VerificationReviewScreen() {
  const { profile } = useAuth();
  const reviewer = useVerificationReviewer();
  const [pending, setPending] = useState<PendingVerification[] | null>(null);
  const [orgs, setOrgs] = useState<OrgQueueItem[]>([]);
  const [guardians, setGuardians] = useState<PendingGuardianProof[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    if (!reviewer) return;
    setNow(Date.now());
    void getPendingVerifications().then(setPending).catch(() => setPending([]));
    // Schools / colleges: SportnNote support only (the queue is empty for others).
    void getOrgVerificationQueue().then(setOrgs).catch(() => setOrgs([]));
    // Parental proof (CL-03): a parent's photo ID + relationship document.
    void pendingGuardianProofs().then(setGuardians).catch(() => setGuardians([]));
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
          <Card><IconText label={"🔒 Reviewers only"} style={textStyles.body} /><Text style={textStyles.muted}>Ask SportnNote support to add you as a reviewer.</Text></Card>
        ) : reviewer === null || pending === null ? (
          <Card><Text style={textStyles.muted}>Loading…</Text></Card>
        ) : (
          <>
            <Text style={textStyles.muted}>
              Open each document and check the name and date of birth match what was entered, then approve or reject. The player and their parent/guardian are told straight away. Documents are deleted 30 days after your decision.
            </Text>
            {done ? <Text style={st.done} accessibilityRole="alert">{done}</Text> : null}
            {guardians.length > 0 ? (
              <>
                <IconText label={`👪 Parental proof · ${guardians.length}`} style={textStyles.h3} />
                <Text style={textStyles.muted}>Oldest first. A parent sent their photo ID and a document showing they’re the parent or legal guardian. Tick all three checks, then approve — or send it back with a reason. The parent and child are told either way.</Text>
                {guardians.map((g) => (
                  <GuardianProofReview key={g.id} g={g} now={now} onDone={(ok) => {
                    setGuardians((l) => l.filter((x) => x.id !== g.id));
                    setDone(ok ? `✓ Approved — ${g.nameOnId} is now ${g.childName}’s linked parent.` : `Sent back — ${g.nameOnId} has been told what to fix.`);
                  }} />
                ))}
              </>
            ) : null}
            {orgs.length > 0 ? (
              <>
                <Text style={textStyles.h3}>🏛️ Organisations · {orgs.length}</Text>
                <Text style={textStyles.muted}>Oldest first. Check each against the public register — tick all three, then approve. Or send it back with a reason; its admins are told either way.</Text>
                {orgs.map((o) => (
                  <OrgReview key={o.orgId} o={o} now={now} onDone={(ok) => { setOrgs((l) => l.filter((x) => x.orgId !== o.orgId)); setDone(ok ? `✓ ${o.name} verified — its admins have been told.` : `${o.name} sent back — its admins have been told.`); }} />
                ))}
              </>
            ) : null}
            {pending.length === 0 ? (
              <Card><EmptyState icon="🎉" title="No documents waiting" hint="You'll get a notification when someone uploads a proof." compact /></Card>
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

/** One age / guardian proof (also on the support console). */
export function Submission({ p, now, onDecided }: { p: PendingVerification; now: number; onDecided: (s: 'approved' | 'rejected') => void }) {
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

/** One organisation for support to check (docs/verification/org-verification.md).
 *  Everything on one card so a future support team can work through the queue
 *  without hunting: the official IDs with links to the public registers, any
 *  other community using the same ID, the document, the proof of authority, a
 *  three-tick checklist (all ticked before Approve), and one-tap reasons. */
export function OrgReview({ o, now, onDone }: { o: OrgQueueItem; now: number; onDone: (approved: boolean) => void }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const v = o.verification;
  const cfg = ORG_VERIFY[verifiableType(o.type) ? o.type : 'School'];
  const academic = isEducation(o.type);
  const head = academic ? 'Head' : cfg.head;
  const checks = reviewChecks(v?.authority, { type: o.type, idTypes: o.ids.map((i) => i.type) });
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allTicked = checks.every((c) => ticked[c.key]);
  // a local registrar's number can repeat in another state: a match there is a hint, not a block
  const clash = o.ids.find((i) => i.verifiedElsewhere && !LOCAL_ID_TYPES.includes(i.type));
  const waited = o.requestedAt ? new Date(o.requestedAt).getTime() : undefined;

  const decide = async (approve: boolean) => {
    if (!approve && !reason.trim()) { setError('Pick or type a reason, so they know what to fix.'); return; }
    setBusy(true); setError(null);
    try { await decideOrgVerification(o.orgId, approve, approve ? undefined : reason.trim(), ticked); onDone(approve); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t save the decision.'); }
    finally { setBusy(false); }
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <Text style={[textStyles.body, { fontWeight: '800', flex: 1 }]} onPress={() => nav.navigate('Organization', { orgId: o.orgId })}>{o.name} ›</Text>
        {waited ? <Pill label={`⏳ ${waitedLabel(waited, now)}`} color={theme.colors.surfaceAlt} textColor={isOverdue(waited, now) ? theme.colors.danger : theme.colors.accent} /> : null}
      </View>
      <Row label="Type" value={[o.type, o.city].filter(Boolean).join(' · ') || '—'} />
      <Row label="Sent by" value={v?.submitterName ?? '—'} />
      <Row label="Members" value={String(o.members)} />
      {v?.sentBackBefore ? <Row label="Sent back before" value={`${v.sentBackBefore}×`} /> : null}

      <Text style={st.sub}>1 · Official ID</Text>
      {o.ids.length ? o.ids.map((i) => {
        const rule = OFFICIAL_ID_RULES[i.type];
        const recordUrl = rule?.record?.(i.value);
        return (
          <View key={i.type} style={{ gap: 2 }}>
            <Row label={rule?.label ?? i.type} value={i.value} selectable />
            {/* register lookup: the exact record where the register allows it, else its search (copy the number first) */}
            <View style={st.linkRow}>
              {recordUrl ? <Text style={st.link} accessibilityRole="link" onPress={() => void Linking.openURL(recordUrl)}>Open the record on {rule?.lookup?.label ?? 'the register'} ↗</Text>
                : rule?.lookup ? <Text style={st.link} accessibilityRole="link" onPress={() => void Linking.openURL(rule.lookup!.url)}>Search it on {rule.lookup.label} ↗</Text> : null}
              {Platform.OS === 'web' ? <CopyText value={i.value} /> : null}
            </View>
            {canLookUp(i.type) ? <RegisterCheck value={i.value} orgName={o.name} head={v?.headConfirmedName ?? v?.headName} /> : null}
            {!rule?.lookup ? <Text style={textStyles.muted}>No public search for this register — compare the number, name and place with the certificate.</Text> : null}
            {i.verifiedElsewhere && LOCAL_ID_TYPES.includes(i.type) ? <Text style={st.warn}>⚠ {i.verifiedElsewhere} (verified) has the same number — check it’s a different registrar or state.</Text>
              : i.verifiedElsewhere ? <Text style={st.warn}>⚠ Already verified as {i.verifiedElsewhere} — send this back.</Text>
              : i.sameIdElsewhere ? <Text style={st.warn}>⚠ {i.sameIdElsewhere} other community{i.sameIdElsewhere === 1 ? '' : 'ies'} entered the same code (not verified).</Text> : null}
          </View>
        );
      }) : <Text style={st.warn}>No official ID given.</Text>}

      <Text style={st.sub}>2 · {academic ? 'Recognition' : 'Registration'} document{v?.docKind ? ` — ${v.docKind}` : ''}</Text>
      {v?.docPath === 'demo' ? <Text style={textStyles.muted}>📎 {docKindLabel(v.docName ?? undefined)} (demo)</Text> : <DocPreview docPath={v?.docPath ?? undefined} docName={v?.docName ?? undefined} />}

      <Text style={st.sub}>3 · Authority — {v?.authority ? authorityOptions(o.type)[v.authority].title : 'not given'}</Text>
      {v?.authority === 'email' ? (
        <>
          <Row label="Verified email" value={v.officialEmail ?? '—'} />
          <Text style={textStyles.muted}>{isFreeMail(v.officialEmail ?? '') ? 'A free mailbox — it must match the address in the register exactly.' : `Domain ${emailDomain(v.officialEmail ?? '')} — compare it with the ${cfg.noun}’s website / email in the register.`}</Text>
        </>
      ) : v?.authority === 'letter' ? (
        <>
          {v.letterPath === 'demo' ? <Text style={textStyles.muted}>📎 {docKindLabel(v.letterName ?? undefined)} (demo)</Text> : <DocPreview docPath={v.letterPath ?? undefined} docName={v.letterName ?? undefined} />}
          <Text style={textStyles.muted}>Call the {cfg.noun}’s office on the number in the public register or its official website (never a number from the applicant) and ask them to confirm the letter.</Text>
        </>
      ) : v?.authority === 'head' ? (
        <>
          <Row label={head} value={[v.headName, v.headEmail].filter(Boolean).join(' · ') || '—'} />
          <Text style={v.headConfirmedAt ? textStyles.body : st.warn}>
            {v.headConfirmedAt ? `✓ Confirmed by ${v.headConfirmedName ?? v.headName}` : v.headDeclinedAt ? `✗ ${v.headName ?? 'They'} said they don’t know this person` : `⏳ Waiting for ${v.headName ?? 'them'} to confirm`}
          </Text>
          <Text style={textStyles.muted}>Check their email is the one in the register or on the {cfg.noun}’s official website.</Text>
        </>
      ) : null}

      <Text style={st.sub}>Checklist</Text>
      {checks.map((c) => (
        <SelectChip key={c.key} label={`${ticked[c.key] ? '☑️' : '⬜'} ${c.label}`} active={!!ticked[c.key]} onPress={() => setTicked((t) => ({ ...t, [c.key]: !t[c.key] }))} />
      ))}

      <Text style={textStyles.muted}>If sending back, why?</Text>
      <View style={st.chips}>
        {SEND_BACK_REASONS.map((r) => <SelectChip key={r} label={r} active={reason === r} onPress={() => setReason(reason === r ? '' : r)} />)}
      </View>
      <TextField label="Or type a reason" value={(SEND_BACK_REASONS as readonly string[]).includes(reason) ? '' : reason} onChange={setReason} placeholder="e.g. Please upload the full registration certificate" />
      <FormError message={error} />
      <View style={st.actions}>
        <Button label="↩ Send back" variant="danger" style={st.flex} onPress={() => void decide(false)} disabled={busy} />
        <Button label={busy ? '…' : '✓ Approve'} style={st.flex} onPress={() => void decide(true)} disabled={busy || !allTicked || !!clash || (v?.authority === 'head' && !v.headConfirmedAt)} />
      </View>
      {!allTicked ? <Text style={textStyles.muted}>Approve unlocks when all three are ticked{v?.authority === 'head' && !v.headConfirmedAt ? ` and ${v.headName ?? 'they'} ha${v.headName ? 's' : 've'} confirmed` : ''}.</Text> : null}
    </Card>
  );
}

/** One parent's proof (CL-03): both documents beside what they entered, three
 *  checks, approve or send back with a reason. */
export function GuardianProofReview({ g, now, onDone }: { g: PendingGuardianProof; now: number; onDone: (approved: boolean) => void }) {
  const [checks, setChecks] = useState([false, false, false]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const age = ageFromDob(g.childDob ?? undefined);
  const rel = RELATIONSHIPS.find((r) => r.id === g.relationship)?.label ?? g.relationship;
  const fileName = (path: string | null) => (path ?? '').split('/').pop() ?? '';
  const CHECKS = [
    `The photo ID is readable and its name is “${g.nameOnId}”`,
    `The second document shows ${g.nameOnId} is ${g.childName}’s ${rel.toLowerCase()}`,
    `Any date of birth on it matches ${readableDob(g.childDob ?? undefined)}`,
  ];

  const decide = async (approve: boolean) => {
    if (approve && checks.some((c) => !c)) { setError('Tick all three checks first.'); return; }
    if (!approve && !reason.trim()) { setError('Pick or type a reason, so the parent knows what to fix.'); return; }
    setBusy(true); setError(null);
    try { await decideGuardianProof(g.id, approve, approve ? undefined : reason); onDone(approve); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t save the decision.'); }
    finally { setBusy(false); }
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <Text style={[textStyles.body, { fontWeight: '800', flex: 1 }]}>{g.childName}</Text>
        <Pill label={`⏳ ${waitedLabel(Date.parse(g.submittedAt), now)}`} color={theme.colors.surfaceAlt}
          textColor={isOverdue(Date.parse(g.submittedAt), now) ? theme.colors.danger : theme.colors.accent} />
      </View>
      <Row label="Child’s date of birth" value={`${readableDob(g.childDob ?? undefined)}${age !== undefined ? ` · ${age} yrs` : ''}`} />
      <Row label="Parent says they are" value={`${rel} · “${g.nameOnId}” on the ID`} />
      <Row label="Sent from the account" value={g.guardianAccountName || '—'} />
      <Row label="Date of birth confirmed by the parent" value={g.dobConfirmed ? 'Yes' : 'No'} />
      {g.claimedByName ? <Row label="Being checked by" value={g.claimedByName} /> : null}
      <Text style={[textStyles.body, { fontWeight: '700' }]}>Photo ID</Text>
      <DocPreview docPath={g.idPath ?? undefined} docName={fileName(g.idPath)} />
      <Text style={[textStyles.body, { fontWeight: '700' }]}>Relationship document</Text>
      <DocPreview docPath={g.relationPath ?? undefined} docName={fileName(g.relationPath)} />
      <View style={{ gap: theme.spacing(1) }}>
        {CHECKS.map((c, i) => (
          <SelectChip key={c} label={`${checks[i] ? '☑' : '☐'} ${c}`} active={checks[i]}
            onPress={() => setChecks((l) => l.map((v, j) => (j === i ? !v : v)))} />
        ))}
      </View>
      <View style={st.chips}>
        {GUARDIAN_REJECT_REASONS.map((r) => <SelectChip key={r} label={r} active={reason === r} onPress={() => setReason(reason === r ? '' : r)} />)}
      </View>
      <TextField label="Or type a reason (if sending back)" value={reason} onChange={setReason} />
      <FormError message={error} />
      <View style={st.head}>
        <Button label="Send back" variant="ghost" style={{ flex: 1 }} onPress={() => void decide(false)} disabled={busy} />
        <Button label={busy ? 'Saving…' : 'Approve'} style={{ flex: 1 }} onPress={() => void decide(true)} disabled={busy} />
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
      <Pressable onPress={() => void Linking.openURL(url)} accessibilityRole="imagebutton" accessibilityLabel="Document photo. Open full size">
        <Image source={{ uri: url }} style={st.doc} resizeMode="contain" />
        <Text style={st.docHint}>Tap to open full size</Text>
      </Pressable>
    );
  }
  return <Button label={docKindLabel(docName) === 'PDF' ? '📄 Open the PDF' : '📄 Open the file'} variant="ghost" onPress={() => void Linking.openURL(url)} />;
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
      <Text style={textStyles.h3}>Reviewers</Text>
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

function Row({ label, value, selectable }: { label: string; value: string; selectable?: boolean }) {
  return (
    <View style={st.row}>
      <Text style={textStyles.muted}>{label}</Text>
      <Text selectable={selectable} style={[textStyles.body, { flex: 1, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

/** Web: copy a number to paste into a register's search box. */
function CopyText({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator;
    void nav?.clipboard?.writeText?.(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return <Text style={st.link} accessibilityRole="button" accessibilityLabel={`Copy ${value}`} onPress={copy}>{copied ? '✓ Copied' : '⧉ Copy'}</Text>;
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
  sub: { color: theme.colors.text, fontWeight: '800', marginTop: theme.spacing(1) },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3) },
});
