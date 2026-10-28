/** Get a registered organisation verified — three steps, then SportnNote
 *  support checks it (docs/verification/org-verification.md; Phase 1 schools /
 *  colleges, Phase 2 every registered type — core/orgVerification ORG_VERIFY):
 *   1. official ID (UDISE+ / AISHE / CIN / NGO Darpan / registration number …),
 *   2. one registration or recognition document,
 *   3. proof the person is authorised: official email code, a letter signed by
 *      the head (support calls the published number), or the head confirming
 *      by email. */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { theme } from '../core/theme';
import { docKindLabel } from '../core/verificationReview';
import { Button, Card, EmptyState, FormError, LoadingState, ScreenTitle, SelectChip, TextField, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { pickDocument } from '../core/document';
import {
  BOARD_LABEL, ID_SHORT, OFFICIAL_ID_RULES, authorityOptions, isEducation, isFreeMail, orgVerifyConfig, validOfficialId,
  verifiableType, verificationProgress, type Authority, type OfficialIdType, type OrgVerificationState,
} from '../core/orgVerification';
import {
  askHeadToConfirm, getOrgVerificationState, printAuthorisationLetter, saveOrgVerification, sendOrgEmailCode,
  setOfficialIds, submitOrgVerification, uploadOrgFile, verifyOrgEmailCode,
} from '../data/orgVerification';
import { getOrganization } from '../data/repos';
import type { Organization } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

export default function OrgVerifyScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'OrgVerify'>>();
  const orgId = params?.orgId ?? '';
  const { profile } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [state, setState] = useState<OrgVerificationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // step 1: the required ID (one of the type's options) + an optional extra
  const [mainType, setMainType] = useState<OfficialIdType | null>(null);
  const [mainId, setMainId] = useState('');
  const [board, setBoard] = useState<OfficialIdType | null>(null);
  const [boardId, setBoardId] = useState('');
  // step 3
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [headName, setHeadName] = useState('');
  const [headEmail, setHeadEmail] = useState('');
  const [demoHeadCode, setDemoHeadCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([getOrganization(orgId), getOrgVerificationState(orgId)]);
      setOrg(o); setState(s);
      const type = verifiableType(s.type) ? s.type : undefined;
      if (type) {
        const cfg = orgVerifyConfig(type, o?.market); // Phase 3: the community's market's IDs
        const m = s.ids.find((i) => cfg.requiredAnyOf.includes(i.type));
        setMainType((cur) => cur ?? m?.type ?? cfg.requiredAnyOf[0]);
        setMainId((cur) => cur || m?.value || '');
        const b = s.ids.find((i) => cfg.optional.includes(i.type));
        if (b) { setBoard((cur) => cur ?? b.type); setBoardId((cur) => cur || b.value); }
      }
      setHeadName((cur) => cur || s.verification?.headName || '');
      setHeadEmail((cur) => cur || s.verification?.headEmail || '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t load it.'); }
  }, [orgId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (key: string, fn: () => Promise<OrgVerificationState | void>, done?: string) => {
    setBusy(key); setError(null); setNote(null);
    try {
      const next = await fn();
      if (next) setState(next);
      if (done) setNote(done);
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    finally { setBusy(null); }
  };

  if (!state || !org) return <SafeAreaView style={st.safe} edges={['bottom']}>{error ? <View style={st.content}><FormError message={error} /></View> : <LoadingState label="Loading…" />}</SafeAreaView>;
  const type = verifiableType(state.type) ? state.type : null;
  if (!type || state.registered !== true) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.content}><EmptyState icon="🏛️" title="Pick a standard type first" hint="Verification is for registered organisations — a school, college, club, academy, association, company, hospital, NGO or housing society. Choose one on the community page (Details → type), then come back." /></View>
      </SafeAreaView>
    );
  }

  const v = state.verification;
  const progress = verificationProgress(state);
  const locked = v?.status === 'pending' || state.verified;
  const cfg = orgVerifyConfig(type, org.market);
  const academic = isEducation(type);
  const reqType: OfficialIdType = mainType ?? cfg.requiredAnyOf[0];
  const authority = v?.authority ?? null;
  const options = authorityOptions(type);

  const saveIds = () => run('ids', async () => {
    const ids: { type: OfficialIdType; value: string }[] = [{ type: reqType, value: mainId }];
    if (board && boardId.trim()) ids.push({ type: board, value: boardId });
    if (!validOfficialId(reqType, mainId)) throw new Error(`That ${OFFICIAL_ID_RULES[reqType].label} doesn’t look right — ${OFFICIAL_ID_RULES[reqType].hint}`);
    if (board && boardId.trim() && !validOfficialId(board, boardId)) throw new Error(`That ${OFFICIAL_ID_RULES[board].label} doesn’t look right.`);
    return setOfficialIds(orgId, ids, org.market);
  }, '✓ Saved');

  const upload = (kind: 'doc' | 'letter', docKind?: string) => run(kind, async () => {
    const doc = await pickDocument();
    if (!doc) return;
    const path = await uploadOrgFile(orgId, doc, kind);
    return saveOrgVerification(orgId, kind === 'doc'
      ? { docKind: docKind ?? v?.docKind ?? cfg.docKinds[0], docPath: path, docName: doc.name }
      : { authority: 'letter', letterPath: path, letterName: doc.name });
  }, kind === 'doc' ? '✓ Document uploaded' : '✓ Letter uploaded');

  const chooseAuthority = (a: Authority) => run('authority', () => saveOrgVerification(orgId, { authority: a }));

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={`Verify ${org.name}`} subtitle="Checked by SportnNote support — usually within a day" />

        {state.verified ? (
          <Card style={st.good}><Text style={textStyles.h3}>Verified by SportnNote</Text></Card>
        ) : v?.status === 'pending' ? (
          <Card style={{ gap: theme.spacing(1) }}>
            <Text style={textStyles.h3}>With SportnNote support</Text>
            <Text style={textStyles.muted}>Sent{v.submittedAt ? ` on ${new Date(v.submittedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}. You’ll get a notification when it’s checked.</Text>
          </Card>
        ) : v?.status === 'rejected' ? (
          <Card style={st.bad}>
            <Text style={[textStyles.body, { fontWeight: '700' }]}>Sent back: {v.rejectReason}</Text>
            <Text style={textStyles.muted}>Fix what’s needed below and send it again.</Text>
          </Card>
        ) : (
          <Text style={textStyles.muted}>Three steps. Everything you upload is seen only by SportnNote support and deleted 30 days after the decision. Verification never stops you running events — it adds the ✓ and lets you confirm members’ dates of birth.</Text>
        )}

        {/* Step 1 */}
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>{progress.ids ? '✅' : '1.'} Official ID</Text>
          {cfg.requiredAnyOf.length > 1 ? (
            <>
              <Text style={textStyles.muted}>Which registration does the {cfg.noun} have? Pick one.</Text>
              <View style={st.chips}>
                {cfg.requiredAnyOf.map((t) => <SelectChip key={t} label={ID_SHORT[t]} active={reqType === t} onPress={() => { if (!locked && t !== reqType) { setMainType(t); setMainId(''); } }} />)}
              </View>
            </>
          ) : null}
          <TextField label={OFFICIAL_ID_RULES[reqType].label} value={mainId} onChange={setMainId} placeholder={OFFICIAL_ID_RULES[reqType].placeholder} autoCapitalize="characters" />
          <Text style={textStyles.muted}>{OFFICIAL_ID_RULES[reqType].hint}</Text>
          {cfg.optional.length > 0 ? (
            <>
              <Text style={textStyles.muted}>{cfg.optional.every((t) => t in BOARD_LABEL) ? 'Board (optional, helps support check faster)' : 'Also add (optional, helps support check faster)'}</Text>
              <View style={st.chips}>
                {cfg.optional.map((b) => <SelectChip key={b} label={BOARD_LABEL[b] ?? ID_SHORT[b]} active={board === b} onPress={() => setBoard(board === b ? null : b)} />)}
              </View>
              {board ? <TextField label={OFFICIAL_ID_RULES[board].label} value={boardId} onChange={setBoardId} placeholder={OFFICIAL_ID_RULES[board].placeholder} autoCapitalize="characters" /> : null}
            </>
          ) : null}
          {state.ids.some((i) => i.claimedBy) ? <Text style={[textStyles.body, { color: theme.colors.danger }]}>{state.ids.find((i) => i.claimedBy)!.claimedBy} is already verified with this code.</Text> : null}
          {!locked ? <Button label={busy === 'ids' ? 'Saving…' : 'Save'} variant="ghost" onPress={() => void saveIds()} disabled={!!busy || !mainId.trim()} /> : null}
        </Card>

        {/* Step 2 */}
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>{progress.doc ? '✅' : '2.'} {academic ? 'Recognition document' : 'Registration document'}</Text>
          <Text style={textStyles.muted}>A photo or PDF of one of these, showing the {cfg.noun}’s name:</Text>
          <View style={st.chips}>
            {cfg.docKinds.map((k) => (
              <SelectChip key={k} label={k} active={v?.docKind === k} onPress={() => { if (!locked) void run('kind', () => saveOrgVerification(orgId, { docKind: k })); }} />
            ))}
          </View>
          {v?.hasDoc ? <Text style={textStyles.body}>📎 {v.docKind ?? 'Document'} uploaded · {docKindLabel(v.docName ?? undefined)}</Text> : null}
          {!locked ? <Button label={busy === 'doc' ? 'Uploading…' : v?.hasDoc ? '📎 Replace the document' : '📎 Upload the document (image / PDF)'} variant="ghost" onPress={() => void upload('doc')} disabled={!!busy || !v?.docKind} /> : null}
          {!v?.docKind && !locked ? <Text style={textStyles.muted}>Pick the kind of document first.</Text> : null}
        </Card>

        {/* Step 3 */}
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>{progress.authority ? '✅' : '3.'} Show you’re authorised by the {cfg.noun}</Text>
          <Text style={textStyles.muted}>Documents prove the {cfg.noun} exists; this proves you speak for it. Choose one.</Text>
          {(Object.keys(options) as Authority[]).map((a) => (
            <View key={a} style={[st.option, authority === a && st.optionOn]}>
              <SelectChip label={options[a].title} active={authority === a} onPress={() => { if (!locked) void chooseAuthority(a); }} />
              <Text style={textStyles.muted}>{options[a].blurb}</Text>

              {authority === a && a === 'email' ? (
                v?.emailVerified ? (
                  <Text style={textStyles.body}>✓ {v.officialEmail} confirmed</Text>
                ) : !locked ? (
                  <>
                    <TextField label={`Official ${cfg.noun} email`} value={email} onChange={setEmail} placeholder={cfg.emailExample} autoCapitalize="none" />
                    {isFreeMail(email) ? <Text style={textStyles.muted}>This is a free email address. That’s fine if it’s the one the {cfg.noun} lists publicly — support will check it matches exactly.</Text> : null}
                    <Button label={busy === 'send' ? 'Sending…' : codeSent ? 'Send a new code' : 'Email me a code'} variant="ghost" disabled={!!busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
                      onPress={() => void run('send', async () => {
                        const r = await sendOrgEmailCode(orgId, email);
                        if (!r.sent) throw new Error(r.reason ?? 'Couldn’t send the code.');
                        setCodeSent(true);
                        if (r.reason) setNote(r.reason);
                      }, `Code sent to ${email.trim()}`)} />
                    {codeSent ? (
                      <>
                        <TextField label="6-digit code" value={code} onChange={setCode} placeholder="123456" />
                        <Button label={busy === 'code' ? 'Checking…' : 'Confirm the code'} onPress={() => void run('code', () => verifyOrgEmailCode(orgId, code, email.trim()), '✓ Email confirmed')} disabled={!!busy || code.replace(/\D/g, '').length !== 6} />
                      </>
                    ) : null}
                  </>
                ) : null
              ) : null}

              {authority === a && a === 'letter' ? (
                <>
                  <Button label="📄 Print the letter template" variant="ghost" onPress={() => void printAuthorisationLetter(orgId, profile?.fullName ?? 'Your name', state.ids)} />
                  <Text style={textStyles.muted}>Print it on the {cfg.noun}’s letterhead, get it signed (and stamped, if it has a seal) by the {cfg.head}, then upload a photo or scan.</Text>
                  {v?.hasLetter ? <Text style={textStyles.body}>📎 Signed letter uploaded · {docKindLabel(v.letterName ?? undefined)}</Text> : null}
                  {!locked ? <Button label={busy === 'letter' ? 'Uploading…' : v?.hasLetter ? '📎 Replace the signed letter' : '📎 Upload the signed letter'} variant="ghost" onPress={() => void upload('letter')} disabled={!!busy} /> : null}
                </>
              ) : null}

              {authority === a && a === 'head' ? (
                <>
                  {!locked ? (
                    <>
                      <TextField label={`${cfg.head}’s name`} value={headName} onChange={setHeadName} placeholder="e.g. Dr. A. Rao" autoCapitalize="words" />
                      <TextField label="Their official email" value={headEmail} onChange={setHeadEmail} placeholder={cfg.emailExample} autoCapitalize="none" />
                      <Text style={textStyles.muted}>Use the address in the {cfg.noun}’s public listing or website — support checks it.</Text>
                      <Button label={busy === 'head' ? 'Sending…' : v?.headRequestedAt ? 'Email them again' : 'Email them'} variant="ghost" disabled={!!busy || !headName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(headEmail.trim())}
                        onPress={() => void run('head', async () => {
                          await saveOrgVerification(orgId, { authority: 'head', headName: headName.trim(), headEmail: headEmail.trim() });
                          const r = await askHeadToConfirm(orgId);
                          if (!r.sent) throw new Error(r.reason ?? 'Couldn’t send the email.');
                          if (r.demoCode) setDemoHeadCode(r.demoCode);
                          return getOrgVerificationState(orgId);
                        }, `Sent to ${headEmail.trim()}. You can send it to support now — they’ll wait for the answer.`)} />
                    </>
                  ) : null}
                  {v?.headConfirmedAt ? <Text style={textStyles.body}>✓ Confirmed by {v.headConfirmedName ?? v.headName}</Text>
                    : v?.headDeclinedAt ? <Text style={[textStyles.body, { color: theme.colors.danger }]}>{v.headName ?? 'They'} said they don’t know you. Choose another way.</Text>
                      : v?.headRequestedAt ? <Text style={textStyles.muted}>⏳ Waiting for {v.headName ?? 'them'} to confirm ({v.headEmail}).</Text> : null}
                  {demoHeadCode ? <Text style={st.link} onPress={() => nav.navigate('OrgConfirm', { c: demoHeadCode })}>Demo: open their confirmation page ›</Text> : null}
                </>
              ) : null}
            </View>
          ))}
        </Card>

        {note ? <Text style={st.note} accessibilityRole="alert">{note}</Text> : null}
        <FormError message={error} />

        {!locked ? (
          <>
            {!progress.ready ? <Text style={textStyles.muted}>Still to do: {progress.todo.join(' · ')}</Text> : null}
            <Button label={busy === 'submit' ? 'Sending…' : 'Send to SportnNote'} disabled={!!busy || !progress.ready}
              onPress={() => void run('submit', () => submitOrgVerification(orgId), '📨 Sent. SportnNote support will check it — usually within a day.')} />
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), maxWidth: 720, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  option: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  optionOn: { borderColor: theme.colors.primary },
  good: { borderColor: theme.colors.primary },
  bad: { borderColor: theme.colors.danger, gap: theme.spacing(1) },
  note: { color: theme.colors.primary, fontWeight: '700' },
  link: { color: theme.colors.primary, fontWeight: '700' },
});
