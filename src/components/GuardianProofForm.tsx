/**
 * CL-03 parental proof — the parent's form (from the consent link, or to resend
 * after a rejection): how they're related, their name as on the ID, the photo
 * ID, a document showing the relationship, and the child's date of birth.
 * Rules: src/core/guardianProof.ts; server: src/data/guardianProof.ts.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../core/theme';
import { Button, Card, FormError, SelectChip, TextField, textStyles } from './ui';
import { IconText } from './Icon';
import { pickDocument, type PickedDoc } from '../core/document';
import { readableDob } from '../core/verificationReview';
import {
  ID_DOC_EXAMPLES, RELATION_DOC_EXAMPLES, RELATIONSHIPS, REVIEW_PROMISE, validateProofForm, type Relationship,
} from '../core/guardianProof';
import { submitGuardianProof } from '../data/guardianProof';

export function GuardianProofForm({ code, childProfileId, childFirstName, dob, onDone }: {
  code: string | null;
  childProfileId: string;
  childFirstName: string;
  dob?: string | null;
  onDone: (proofId: string) => void;
}) {
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [name, setName] = useState('');
  const [idDoc, setIdDoc] = useState<PickedDoc | null>(null);
  const [relationDoc, setRelationDoc] = useState<PickedDoc | null>(null);
  const [dobOk, setDobOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (set: (d: PickedDoc) => void) => {
    setError(null);
    try { const d = await pickDocument(); if (d) set(d); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t open that file — try another.'); }
  };

  const send = async () => {
    const problem = validateProofForm({ relationship, name, idDoc, relationDoc });
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      onDone(await submitGuardianProof({
        code, childProfileId, relationship: relationship!, name, idDoc: idDoc!, relationDoc: relationDoc!, dobConfirmed: dobOk === true,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send — check your connection and try again.');
    } finally { setBusy(false); }
  };

  return (
    <View style={st.wrap}>
      <Card style={st.gap}>
        <Text style={textStyles.h3}>How are you related to {childFirstName}?</Text>
        <View style={st.chips}>
          {RELATIONSHIPS.map((r) => (
            <SelectChip key={r.id} label={r.label} active={relationship === r.id} onPress={() => setRelationship(r.id)} />
          ))}
        </View>
        <TextField label="Your name, exactly as on your photo ID" value={name} onChange={setName} placeholder="e.g. Meera Rao" autoCapitalize="words" />
      </Card>

      <Card style={st.gap}>
        <Text style={textStyles.h3}>1. Your photo ID</Text>
        <Text style={textStyles.muted}>{ID_DOC_EXAMPLES}. A clear photo of the side with your name and photo.</Text>
        <Button label={idDoc ? `📄 ${idDoc.name} — change` : '📤 Add your photo ID'} variant="ghost" onPress={() => void pick(setIdDoc)} />
      </Card>

      <Card style={st.gap}>
        <Text style={textStyles.h3}>2. A document showing you’re {childFirstName}’s parent or guardian</Text>
        <Text style={textStyles.muted}>For example {RELATION_DOC_EXAMPLES}.</Text>
        <Button label={relationDoc ? `📄 ${relationDoc.name} — change` : '📤 Add the document'} variant="ghost" onPress={() => void pick(setRelationDoc)} />
      </Card>

      {dob ? (
        <Card style={st.gap}>
          <Text style={[textStyles.body, { fontWeight: '700' }]}>Is {childFirstName}’s date of birth {readableDob(dob)}?</Text>
          <Text style={textStyles.muted}>It decides which age groups they can play in.</Text>
          <View style={st.chips}>
            <SelectChip label="✓ Yes, that’s right" active={dobOk === true} onPress={() => setDobOk(dobOk === true ? null : true)} />
            <SelectChip label="No, it’s wrong" active={dobOk === false} onPress={() => setDobOk(dobOk === false ? null : false)} />
          </View>
        </Card>
      ) : null}

      <IconText label="🔒 Only SportnNote’s reviewers see these documents. They’re deleted 30 days after the check, and we never keep ID numbers." style={textStyles.muted} />
      <FormError message={error} />
      <Button label={busy ? 'Sending…' : 'Send for checking'} onPress={() => void send()} disabled={busy} />
      <Text style={textStyles.muted}>{REVIEW_PROMISE} You and {childFirstName} will be told. By sending, you confirm you are {childFirstName}’s parent or legal guardian and agree to the Terms of Use and Privacy Policy on their behalf.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  gap: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
