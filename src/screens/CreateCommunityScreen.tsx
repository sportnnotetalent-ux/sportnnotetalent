/** Create a community — a school, company, housing society, hospital chain, etc.
 *  First: a registered organisation, or an informal group (friends,
 *  neighbourhood …) that needs no verification. Then a standard type or a custom
 *  one; a school / college can add its official ID here (one verified community
 *  per ID — docs/verification/org-verification.md). Once created, the community
 *  can host recurring sports events year after year (all tracked under it). */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView, KeyboardFooterLayout } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { PhoneField } from '../components/PhoneField';
import { useAuth } from '../core/auth';
import { getMyPlayerId, createOrganization } from '../data/repos';
import { isAcademicCommunity, suggestedGraduatingStandard } from '../core/org';
import {
  OFFICIAL_ID_RULES, OFFICIAL_ONLY_TYPES, REGISTERED_TYPES, REQUIRED_ID, UNREGISTERED_TYPES, validOfficialId,
} from '../core/orgVerification';
import { lookupOfficialId, setOfficialIds } from '../data/orgVerification';
import { MARKETS, MARKET_ORDER, marketForCountry, type MarketId } from '../core/markets';
import { useRegion } from '../core/region';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateCommunity'>;
const CUSTOM = 'Custom…';

export default function CreateCommunityScreen({ navigation }: Props) {
  const { profile } = useAuth();
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    getMyPlayerId(profile?.id).then((id) => on && setMyId(id));
    return () => { on = false; };
  }, [profile?.id]);

  const [name, setName] = useState('');
  // a registered organisation or an informal group — asked first
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [typeChoice, setTypeChoice] = useState<string>('');
  const [officialId, setOfficialId] = useState('');
  const [idCheck, setIdCheck] = useState<{ verified?: { orgId: string; name: string } | null; others?: number } | null>(null);
  const [customType, setCustomType] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // SD-153: the school system (market) starts from the creator's region; it
  // prefills the graduating class, which a school confirms here (no silent
  // "Grade 10" outside India).
  const region = useRegion();
  const [market, setMarket] = useState<MarketId>(() => marketForCountry(region.country));
  const [gradStd, setGradStd] = useState(() => suggestedGraduatingStandard(marketForCountry(region.country)));
  const [gradTouched, setGradTouched] = useState(false);
  const [showMarkets, setShowMarkets] = useState(false);
  const pickMarket = (m: MarketId) => { setMarket(m); if (!gradTouched) setGradStd(suggestedGraduatingStandard(m)); };

  const resolvedType = typeChoice === CUSTOM ? customType.trim() : typeChoice;
  const academic = registered === true && isAcademicCommunity(resolvedType);
  // Schools / colleges give their official code here (catches a verified duplicate
  // early); other registered types add theirs in "Get verified".
  const idType = registered && (resolvedType === 'School' || resolvedType === 'College') ? REQUIRED_ID[resolvedType] : null;
  const pickRegistered = (r: boolean) => { setRegistered(r); setTypeChoice(''); setOfficialId(''); setIdCheck(null); };

  // Is this official ID already a verified community?
  useEffect(() => {
    setIdCheck(null);
    if (!idType || !validOfficialId(idType, officialId)) return;
    let on = true;
    const t = setTimeout(() => { void lookupOfficialId(idType, officialId).then((r) => on && setIdCheck(r)).catch(() => undefined); }, 400);
    return () => { on = false; clearTimeout(t); };
  }, [idType, officialId]);

  async function submit() {
    if (!name.trim()) return setError('Give the community a name.');
    if (registered === null) return setError('Is it a registered organisation or an informal group?');
    if (!typeChoice) return setError('Pick the type of community.');
    if (typeChoice === CUSTOM && !customType.trim()) return setError('Describe the community type.');
    if (!registered && OFFICIAL_ONLY_TYPES.includes(resolvedType)) return setError('A school or college is a registered organisation — choose “Registered organisation”.');
    if (idType && officialId.trim() && !validOfficialId(idType, officialId)) return setError(`That ${OFFICIAL_ID_RULES[idType].label} doesn’t look right — ${OFFICIAL_ID_RULES[idType].hint}`);
    if (idCheck?.verified) return setError(`${idCheck.verified.name} is already verified on SportnNote — ask its admins to add you.`);
    if (academic && !gradStd.trim()) return setError('Which class do students graduate after? Type it, e.g. Year 13 or Grade 12.');
    setError(null);
    setBusy(true);
    try {
      const org = await createOrganization(
        {
          name: name.trim(), type: resolvedType || undefined, city: city.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined,
          market,
          graduatingStandard: academic ? gradStd.trim() : undefined,
          registered,
        },
        myId ?? undefined
      );
      // A school / college's official ID (it can also be added when verifying).
      if (idType && officialId.trim()) {
        try { await setOfficialIds(org.id, [{ type: idType, value: officialId }]); } catch { /* added later from Get verified */ }
      }
      // Replace this screen with the new community's page.
      navigation.replace('Organization', { orgId: org.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create community');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      {/* the create button stays pinned below the form and rides on the keyboard */}
      <KeyboardFooterLayout
        safeBottom={false}
        footer={(
          <>
            <FormError message={error} />
            <Button label={busy ? 'Creating…' : 'Create community'} onPress={submit} />
          </>
        )}
      >
        <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <ScreenTitle title="New community" subtitle="A school, club, company… that runs sports events" />

          <TextField label="Name" value={name} onChange={setName} placeholder="Greenwood High School" />

          <FieldLabel>Is it a registered organisation?</FieldLabel>
          <View style={st.chips}>
            <SelectChip label="🏛️ Registered organisation" active={registered === true} onPress={() => pickRegistered(true)} />
            <SelectChip label="👥 Informal group" active={registered === false} onPress={() => pickRegistered(false)} />
          </View>
          <Text style={textStyles.muted}>
            {registered === false
              ? 'Friends, a neighbourhood or an office team — no verification needed.'
              : 'A school, college, company, club or society with official registration. It can be verified by SportnNote.'}
          </Text>

          {registered !== null && (
            <>
              <FieldLabel>Type</FieldLabel>
              <View style={st.chips}>
                {(registered ? REGISTERED_TYPES : UNREGISTERED_TYPES).map((t) => (
                  <SelectChip key={t} label={t} active={typeChoice === t} onPress={() => setTypeChoice(t)} />
                ))}
                <SelectChip label={CUSTOM} active={typeChoice === CUSTOM} onPress={() => setTypeChoice(CUSTOM)} />
              </View>
            </>
          )}
          {typeChoice === CUSTOM && (
            <TextField label="Custom type" value={customType} onChange={setCustomType} placeholder={registered ? 'e.g. Gymkhana' : 'e.g. Weekend cricket group'} />
          )}

          {idType && (
            <>
              <TextField label={`${OFFICIAL_ID_RULES[idType].label} (recommended)`} value={officialId} onChange={setOfficialId} placeholder={OFFICIAL_ID_RULES[idType].placeholder} autoCapitalize="characters" />
              <Text style={textStyles.muted}>{OFFICIAL_ID_RULES[idType].hint} Use the name exactly as registered.</Text>
              {idCheck?.verified ? (
                <View style={st.warnBox}>
                  <Text style={textStyles.body}>{idCheck.verified.name} is already verified on SportnNote with this code.</Text>
                  <Button label={`Open ${idCheck.verified.name}`} variant="ghost" onPress={() => navigation.replace('Organization', { orgId: idCheck.verified!.orgId })} />
                </View>
              ) : idCheck?.others ? (
                <Text style={textStyles.muted}>Another community has entered this code but isn’t verified. Verification decides who represents the school.</Text>
              ) : null}
            </>
          )}

          {academic && (
            <>
              <FieldLabel>School system</FieldLabel>
              <View style={st.chips}>
                {(showMarkets ? MARKET_ORDER : [market]).map((m) => (
                  <SelectChip key={m} label={`${MARKETS[m].flag} ${MARKETS[m].name}`} active={market === m} onPress={() => pickMarket(m)} />
                ))}
                {!showMarkets && <SelectChip label="Change…" active={false} onPress={() => setShowMarkets(true)} />}
              </View>
              <Text style={textStyles.muted}>Sets class names, age groups and the age cut-off for your events. You can change it later.</Text>
              <TextField label="Graduating class (students leave after this)" value={gradStd} onChange={(v) => { setGradTouched(true); setGradStd(v); }} placeholder={suggestedGraduatingStandard(market)} autoCapitalize="words" />
              {MARKETS[market].graduating.length > 1 && (
                <View style={st.chips}>
                  {MARKETS[market].graduating.map((g) => (
                    <SelectChip key={g} label={g} active={gradStd.trim() === g} onPress={() => { setGradTouched(true); setGradStd(g); }} />
                  ))}
                </View>
              )}
            </>
          )}

          <TextField label="City" value={city} onChange={setCity} placeholder="Bengaluru" />
          <View style={st.wrapRow}>
            <View style={st.wrapCell}><TextField label="Email" value={email} onChange={setEmail} placeholder="sports@…" autoCapitalize="none" /></View>
            <View style={st.wrapCell}><PhoneField label="Phone" value={phone} onChange={setPhone} optional /></View>
          </View>
          <Text style={textStyles.muted}>You'll be its first admin. Add members, a logo, and organize events from the community page.</Text>
        </KeyboardAwareScrollView>
      </KeyboardFooterLayout>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  // Phone + email pairs: side by side when there's room, stacked on a phone.
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3) },
  wrapCell: { flexGrow: 1, flexBasis: 220, minWidth: 0 },
  flex: { flex: 1 },
  warnBox: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt },
});
