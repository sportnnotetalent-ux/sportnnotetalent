/**
 * Security W1-2b — Home card: "Did a coach add you by phone?". Someone a coach
 * added with their mobile number, who then signed up by email, couldn't get
 * that number on their own profile (it's on the coach-made one). Proving the
 * number with an SMS code links the coach-made profile — matches, teams,
 * stats — to their account on the server (verify-phone-firebase, 'claim').
 * Shows only when the sign-up number isn't on the profile and SMS works here.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { Button, Card, textStyles } from './ui';
import { getMyPlayerId } from '../data/repos';
import { beginPhoneClaim, confirmPhoneClaim, getClaimNumbers, phoneClaimAvailable } from '../data/requestsStore';
import { claimOutcomeText, maskPhone, showClaimCard } from '../data/requests';

export function LinkByPhoneCard() {
  const { profile, demo } = useAuth();
  const [phone, setPhone] = useState<string | null>(null);
  const [step, setStep] = useState<'ask' | 'code' | 'done'>('ask');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (demo || !profile?.id || !phoneClaimAvailable()) return;
      let on = true;
      void getMyPlayerId(profile.id)
        .then((id) => getClaimNumbers(id))
        .then((n) => { if (on) setPhone(showClaimCard({ ...n, smsAvailable: true }) ? n.signUpPhone : null); })
        .catch(() => {});
      return () => { on = false; };
    }, [profile?.id, demo])
  );

  if (hidden || !phone) return null;

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try { await beginPhoneClaim(phone); setStep('code'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Couldn’t send the SMS just now.'); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    setMsg(null);
    try { setMsg(claimOutcomeText(await confirmPhoneClaim(code.trim(), profile!.id))); setStep('done'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Couldn’t verify the number — try again.'); }
    finally { setBusy(false); }
  };

  return (
    <Card style={st.card}>
      <View style={st.head}>
        <Text style={[textStyles.h3, { flex: 1 }]}>📱 Did a coach add you by phone?</Text>
        {step !== 'code' && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setHidden(true)}>
            <Text style={st.close}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      {step === 'ask' && (
        <>
          <Text style={textStyles.muted}>
            A profile already uses your number {maskPhone(phone)}. If a coach or school added you, verify the number to bring those matches and teams to your account.
          </Text>
          <Button label={busy ? 'Sending…' : 'Text me a code'} onPress={() => void send()} disabled={busy} />
        </>
      )}
      {step === 'code' && (
        <>
          <Text style={textStyles.muted}>We sent a 6-digit code by SMS to {maskPhone(phone)}. Enter it below.</Text>
          <View style={st.otpRow}>
            <TextInput
              style={st.input}
              value={code}
              onChangeText={setCode}
              placeholder="######"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              accessibilityLabel="6-digit code"
              maxLength={6}
              editable={!busy}
            />
            <Button label={busy ? 'Checking…' : 'Confirm'} onPress={() => void confirm()} disabled={busy || code.trim().length !== 6} />
          </View>
        </>
      )}
      {msg ? <Text style={step === 'done' ? textStyles.body : st.error} accessibilityLiveRegion="polite">{msg}</Text> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), borderColor: theme.colors.accent, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  close: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800' },
  otpRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  input: {
    flex: 1, minWidth: 0, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3),
    color: theme.colors.text, fontSize: theme.font.body, letterSpacing: 4,
  },
  error: { color: theme.colors.danger, fontSize: theme.font.small },
});
