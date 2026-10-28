/** Auth: email/password sign-in & sign-up, passwordless email-code (OTP) sign-in,
 *  and password reset. Only shown when Supabase is configured (live mode).
 *
 *  OTP + reset use the 6-digit CODE flow (`verifyOtp`), not magic links — so no
 *  deep-link redirect handling is needed. The Supabase email templates must
 *  expose `{{ .Token }}` (the defaults do) for the code to arrive.
 *
 *  NOTE: live-only — this screen never mounts in demo mode, so it can't be
 *  previewed against the demo build. Verify on a staging Supabase project. */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView, useKeyboardFocus } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../core/theme';
import { Button, Card, SelectChip, FormError, textStyles } from '../components/ui';
import { DateField } from '../components/DateTimeField';
import { useAuth } from '../core/auth';
import { ageFromDob } from '../core/age';
import { guardianConfirmRequired, privacyCountry, usUnder13Blocked, US_UNDER_13_MESSAGE } from '../core/privacyRegion';
import { isValidPhone, normalizePhone, formatPhone, phoneCountry } from '../core/phone';
import { PhoneField } from '../components/PhoneField';
import { phoneLoginAvailable, proveSignupPhone, sendPhoneCode } from '../core/phoneLogin';
import { PhoneLoginCard } from '../components/PhoneLoginCard';
import type { Role } from '../core/types';
import { Logo } from '../components/Logo';

const ROLES: Role[] = ['player', 'parent', 'scorer', 'organizer', 'fan'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// SMS login is coded (sendPhoneOtp/verifyPhoneOtp) but needs a Supabase SMS
// provider AND the phone to exist on auth.users — neither is set up yet, so the
// SMS code path can't actually deliver. Keep it OFF for the pilot: email code +
// password only. Flip to true once an SMS provider is configured on the live
// project. Kept behind a flag (not deleted) so re-enabling is one line.
const SMS_LOGIN_ENABLED = false;

type Mode = 'in' | 'up';
type Flow = 'password' | 'otp' | 'reset';

export default function AuthScreen() {
  const { signIn, signUp, resendConfirmation, sendSignInOtp, verifySignInOtp, sendPhoneOtp, verifyPhoneOtp, sendPasswordReset, confirmPasswordReset } = useAuth();
  // A guest prompt ("Sign up to follow…") opens straight on Create account.
  const route = useRoute<RouteProp<RootStackParamList, 'Auth'>>();
  const [mode, setMode] = useState<Mode>(route.params?.mode === 'up' ? 'up' : 'in');
  useEffect(() => { if (route.params?.mode) setMode(route.params.mode); }, [route.params?.mode]);
  const [flow, setFlow] = useState<Flow>('password'); // sign-in sub-flow
  const [sent, setSent] = useState(false);             // OTP/reset: has the code been requested?
  const [otpChannel, setOtpChannel] = useState<'email' | 'phone'>('email');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // When the last code went out: Supabase refuses another for the same address
  // within 60 s, so "Resend code" counts down instead of failing.
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sentAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentAt]);
  const resendIn = sentAt ? Math.max(0, RESEND_WAIT_S - Math.floor((now - sentAt) / 1000)) : 0;
  const [newPassword, setNewPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [dob, setDob] = useState('');
  const [gName, setGName] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [consent, setConsent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Sign-in blocked only because the email isn't confirmed → offer a resend link.
  const [showResend, setShowResend] = useState(false);

  const age = ageFromDob(dob.trim());
  const minor = age !== undefined && age < 18;
  // SD-152: under-18 rules by country (India unchanged — the checkbox below is the consent).
  // CL-04: the mobile's country first, as the server decides it (then the device).
  const country = phoneCountry(mobile) ?? privacyCountry();
  const usUnder13 = usUnder13Blocked(country, age);
  const guardianMustConfirm = minor && guardianConfirmRequired(country);

  // SMS required at sign-up (2026-10-29): the mobile is proven by a text
  // message first; the server swaps the proof for a one-time ticket, and the
  // account can't be made without it (migration 20261029100000_signup_sms).
  const canSms = phoneLoginAvailable();
  const [smsSent, setSmsSent] = useState(false);
  const [smsCode, setSmsCode] = useState('');
  const [phoneTicket, setPhoneTicket] = useState<string | null>(null);
  const [ticketPhone, setTicketPhone] = useState('');
  useEffect(() => {
    // a changed number needs its own code
    if (smsSent && normalizePhone(mobile) !== ticketPhone) { setPhoneTicket(null); setSmsSent(false); setSmsCode(''); }
  }, [mobile, smsSent, ticketPhone]);
  const textSignupCode = () => {
    if (!isValidPhone(mobile)) return setError('Enter your mobile number (check the country code) — we text it a code.');
    const number = normalizePhone(mobile);
    void run(async () => {
      try { await sendPhoneCode(number); return {}; } catch (e) { return { error: e instanceof Error ? e.message : 'Couldn’t send the code — try again.' }; }
    }, `We texted a code to ${formatPhone(mobile)}.`, () => { setSmsSent(true); setTicketPhone(number); setSmsCode(''); });
  };
  const verifySignupCode = () => {
    const c = smsCode.replace(/\D/g, '');
    if (c.length < 6) return setError('Type the 6-digit code from the text message.');
    void run(async () => {
      try {
        const r = await proveSignupPhone(c);
        if (r.status === 'ticket') { setPhoneTicket(r.ticket); return {}; }
        if (r.status === 'exists') return { error: 'This number already has an account — sign in with it instead (“Continue with your mobile number”).' };
        return { error: r.reason || 'This number can’t be used for a new account — contact support.' };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'That code didn’t work — try again.' };
      }
    }, 'Mobile verified.');
  };

  const clearFlow = () => { setSent(false); setSentAt(0); setCode(''); setNewPassword(''); setNote(null); setError(null); setOtpChannel('email'); setShowResend(false); };
  const switchMode = (m: Mode) => { setMode(m); setFlow('password'); clearFlow(); };
  const switchFlow = (f: Flow) => { setFlow(f); clearFlow(); };

  /** Run an auth call with busy/error/note handling; onOk fires only on success. */
  async function run<R extends { error?: string }>(fn: () => Promise<R>, okNote?: string, onOk?: (res: R) => void) {
    setBusy(true); setError(null); setNote(null);
    const res = await fn();
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (okNote) setNote(okNote);
    onOk?.(res);
  }

  // Password sign-up / sign-in — captures identity + guardian consent on sign-up.
  function submitPassword() {
    if (mode === 'up') {
      if (!isValidPhone(mobile)) return setError('Enter your mobile number (check the country code) — it’s your SportnNote identity.');
      if (!phoneTicket) return setError('Verify your mobile number first — tap “Text me a code”.');
      if (!dob.trim() || age === undefined) return setError('Enter a valid date of birth (YYYY-MM-DD).');
      if (usUnder13) return setError(US_UNDER_13_MESSAGE);
      if (guardianMustConfirm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gEmail.trim())) {
        return setError("Add your parent/guardian's email — we'll email them a link to confirm your account.");
      }
      if (minor) {
        if (!gName.trim()) return setError('A parent/guardian name is required to create an under-18 account.');
        if (!gPhone.trim() && !gEmail.trim()) return setError("Add the guardian's mobile or email — under-18 accounts need a guardian contact.");
        if (gPhone.trim() && !isValidPhone(gPhone)) return setError("The guardian's mobile doesn't look right — check the number and country code.");
        if (!consent) return setError('Parent/guardian consent is required for an under-18 account.');
      }
      if (!agreed) return setError('Please agree to the Terms of Use and Privacy Policy to create an account.');
    }
    const guardian = minor && gName.trim()
      ? { name: gName.trim(), phone: normalizePhone(gPhone) || undefined, email: gEmail.trim() || undefined, consentedAt: new Date().toISOString() }
      : undefined;
    if (mode === 'in') {
      setShowResend(false);
      return void run(
        () => signIn(email.trim(), password),
        undefined,
        (res) => { if (res.needsConfirm) setShowResend(true); } // offer the resend link
      );
    }
    // On sign-up: if email confirmation is on, there's no session yet — tell the
    // user to check their inbox instead of leaving them on a silent screen.
    void run(
      () => signUp(email.trim(), password, fullName.trim() || 'Player', role, dob.trim(), guardian, mobile.trim(), phoneTicket ?? undefined),
      undefined,
      (res) => {
        if (res.needsEmailConfirm) {
          switchMode('in'); // switch to the sign-in tab (also clears the note)…
          // …then set a clear, actionable confirm-your-email message.
          setNote(`📧 Account created! We've sent a confirmation link to ${email.trim()}. Open it to activate your account (check spam too), then sign in here.`);
        }
        // Otherwise a session fired and onAuthStateChange signs you straight in.
      }
    );
  }

  // Re-send the confirmation email when it never arrived / expired.
  const doResend = () => {
    if (!email.trim()) return setError('Enter your email first, then resend.');
    void run(
      () => resendConfirmation(email.trim()),
      `📧 Confirmation email re-sent to ${email.trim()}. Open the link (check spam), then sign in.`,
      () => setShowResend(false)
    );
  };

  // Passwordless OTP sign-in — email or SMS code.
  const otpRequest = () => {
    if (otpChannel === 'phone') {
      if (!isValidPhone(mobile)) return setError('Enter your mobile number (check the country code) to get an SMS code.');
      return void run(() => sendPhoneOtp(mobile.trim()), `We texted a sign-in code to ${formatPhone(mobile)}.`, () => { setSent(true); setSentAt(Date.now()); });
    }
    if (!email.trim()) return setError('Enter your email to get a code.');
    void run(() => sendSignInOtp(email.trim()), codeSentNote('a sign-in code', email.trim()), () => { setSent(true); setSentAt(Date.now()); setCode(''); });
  };
  const otpVerify = () => {
    const c = cleanCode(code);
    if (!c) return setError('Enter the code we sent you.');
    void run(() =>
      otpChannel === 'phone'
        ? verifyPhoneOtp(mobile.trim(), c)
        : verifySignInOtp(email.trim(), c)
    ); // success → onAuthStateChange signs you in
  };

  // Password reset (recovery code flow).
  const resetRequest = () => {
    if (!email.trim()) return setError('Enter your account email.');
    void run(() => sendPasswordReset(email.trim()), codeSentNote('a reset code', email.trim()), () => { setSent(true); setSentAt(Date.now()); setCode(''); });
  };
  const resetConfirm = () => {
    const c = cleanCode(code);
    if (!c) return setError('Enter the reset code from your email.');
    if (newPassword.length < 6) return setError('Choose a new password (at least 6 characters).');
    void run(() => confirmPasswordReset(email.trim(), c, newPassword)); // success → signed in
  };

  const showPassword = mode === 'up' || (mode === 'in' && flow === 'password');
  // keyboard "Next" on the email moves to the password; "Go" on a sign-in password signs in
  const passwordRef = useRef<TextInput>(null);
  const codeFlow = mode === 'in' && (flow === 'otp' || flow === 'reset');
  const otpPhone = mode === 'in' && flow === 'otp' && otpChannel === 'phone';

  return (
    <SafeAreaView style={st.safe}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <View style={st.brand}>
          <Logo size={72} />
          <Text style={st.logo}>Sport<Text style={st.logoAccent}>nNote</Text></Text>
          <Text style={[textStyles.muted, st.tagline]}>Play a Sport, Make a Note.</Text>
        </View>

        {/* Web: mobile number + SMS code is the main way in; email below. */}
        {phoneLoginAvailable() && (
          <>
            <PhoneLoginCard onUseEmail={() => switchMode('in')} onUseEmailCode={() => { setMode('in'); switchFlow('otp'); }} />
            <View style={st.orRow}>
              <View style={st.orLine} />
              <Text style={textStyles.muted}>or use email</Text>
              <View style={st.orLine} />
            </View>
          </>
        )}

        <Card style={st.formCard}>
          <View style={st.tabs}>
            <SelectChip label="Sign in" active={mode === 'in'} onPress={() => switchMode('in')} />
            <SelectChip label="Create account" active={mode === 'up'} onPress={() => switchMode('up')} />
          </View>

          {mode === 'up' && <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Aarav Mehta" />}
          {mode === 'up' && <PhoneField label="Mobile number" value={mobile} onChange={setMobile} labelStyle={textStyles.muted} />}
          {mode === 'up' && (
            <View style={{ gap: theme.spacing(1) }}>
              {!canSms ? (
                <Text style={st.ageHint}>Creating an account needs a text message to your mobile. Update SportnNote from sportnnote.in/download, or create your account at sportnnote.in.</Text>
              ) : phoneTicket ? (
                <Text style={st.ageHint} accessibilityLiveRegion="polite">✓ Mobile verified</Text>
              ) : !smsSent ? (
                <Button label="Text me a code" variant="ghost" onPress={textSignupCode} disabled={busy} accessibilityHint="We text your mobile a code to prove it’s yours" />
              ) : (
                <>
                  <Field label="Code from the text message" value={smsCode} onChange={setSmsCode} placeholder="6 digits" keyboardType="number-pad" autoComplete="one-time-code" />
                  <View style={st.linkRow}>
                    <Button label={busy ? 'Checking…' : 'Verify mobile'} onPress={verifySignupCode} disabled={busy} />
                    <Text style={st.link} accessibilityRole="button" onPress={textSignupCode}>Resend code</Text>
                  </View>
                </>
              )}
            </View>
          )}
          {mode === 'up' && (
            <>
              <DateField label="Date of birth" value={dob} onChange={setDob} />
              {age !== undefined && <Text style={st.ageHint}>Age: {age} yrs{minor ? ' — a parent/guardian is required' : ''}</Text>}
              {usUnder13 && <Text style={[st.ageHint, { color: theme.colors.danger }]}>{US_UNDER_13_MESSAGE}</Text>}
              {guardianMustConfirm && !usUnder13 && (
                <Text style={st.ageHint}>We’ll email your parent/guardian a link to confirm your account. Until they do, following and messages are off and only your teams see your profile.</Text>
              )}
            </>
          )}

          {SMS_LOGIN_ENABLED && mode === 'in' && flow === 'otp' && !sent && (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={textStyles.muted}>Send my code by…</Text>
              <View style={st.roles}>
                <SelectChip label="✉️ Email" active={otpChannel === 'email'} onPress={() => setOtpChannel('email')} />
                <SelectChip label="💬 SMS" active={otpChannel === 'phone'} onPress={() => setOtpChannel('phone')} />
              </View>
            </View>
          )}
          {!otpPhone && (
            <Field
              label="Email" value={email} onChange={setEmail} placeholder="you@school.edu" keyboardType="email-address" autoComplete="email"
              {...(showPassword ? { returnKeyType: 'next' as const, onSubmitEditing: () => passwordRef.current?.focus() } : {})}
            />
          )}
          {otpPhone && <PhoneField label="Mobile number" value={mobile} onChange={setMobile} labelStyle={textStyles.muted} />}
          {showPassword && (
            <Field
              label="Password" value={password} onChange={setPassword} placeholder="••••••••" secure autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              inputRef={passwordRef}
              {...(mode === 'in' ? { returnKeyType: 'go' as const, onSubmitEditing: () => { if (!busy) void submitPassword(); } } : {})}
            />
          )}

          {/* OTP / reset: the code from the email (Supabase sets its length — any
              length works here), plus a new password for reset. */}
          {codeFlow && sent && <Field label={otpChannel === 'phone' ? 'Code from the SMS' : 'Code from the email'} value={code} onChange={setCode} placeholder="Type every digit" keyboardType="number-pad" autoComplete="one-time-code" />}
          {mode === 'in' && flow === 'reset' && sent && <Field label="New password" value={newPassword} onChange={setNewPassword} placeholder="••••••••" secure autoComplete="new-password" />}

          {mode === 'up' && minor && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.muted}>👪 Parent / Guardian (required for under-18)</Text>
              <Field label="Guardian name" value={gName} onChange={setGName} placeholder="Priya Mehta" />
              <PhoneField label="Guardian mobile" value={gPhone} onChange={setGPhone} labelStyle={textStyles.muted} />
              <Field label={guardianMustConfirm ? 'Guardian email (we send the confirmation link here)' : 'Guardian email'} value={gEmail} onChange={setGEmail} placeholder="parent@email.com" keyboardType="email-address" />
              <TouchableOpacity
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent }} aria-checked={consent}
                activeOpacity={0.8}
                onPress={() => setConsent((c) => !c)}
                style={st.consentRow}
              >
                <Text style={[st.checkbox, consent && st.checkboxOn]}>{consent ? '☑' : '☐'}</Text>
                <Text style={st.consentText}>
                  I am {gName.trim() ? `${gName.trim()}’s ` : 'the '}parent/guardian and I consent to them creating and using a SportnNote account.
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === 'up' && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.muted}>I am a…</Text>
              <View style={st.roles}>
                {ROLES.map((r) => (
                  <SelectChip key={r} label={cap(r)} active={role === r} onPress={() => setRole(r)} />
                ))}
              </View>
            </View>
          )}

          {mode === 'up' && (
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }} aria-checked={agreed}
              activeOpacity={0.8}
              onPress={() => setAgreed((a) => !a)}
              style={st.consentRow}
            >
              <Text style={[st.checkbox, agreed && st.checkboxOn]}>{agreed ? '☑' : '☐'}</Text>
              <Text style={st.consentText}>
                I agree to the{' '}
                <Text style={st.legalLink} accessibilityRole="link" onPress={() => nav.navigate('Legal', { doc: 'terms' })}>Terms of Use</Text>
                {' '}and{' '}
                <Text style={st.legalLink} accessibilityRole="link" onPress={() => nav.navigate('Legal', { doc: 'privacy' })}>Privacy Policy</Text>
                {minor ? ', and my parent/guardian agrees on my behalf.' : '.'}
              </Text>
            </TouchableOpacity>
          )}

          {note ? (
            <View style={st.noteBox}>
              <Text style={st.noteText}>{note}</Text>
            </View>
          ) : null}
          <FormError message={error} />

          {/* Primary action + flow switches */}
          {mode === 'up' && <Button label={busy ? 'Please wait…' : 'Create account'} onPress={submitPassword} disabled={busy || !canSms} />}

          {mode === 'in' && flow === 'password' && (
            <>
              <Button label={busy ? 'Please wait…' : 'Sign in'} onPress={submitPassword} disabled={busy} />
              {showResend && (
                <Text style={st.link} accessibilityRole="button" onPress={doResend}>📧 Resend confirmation email</Text>
              )}
              <View style={st.linkRow}>
                <Text style={st.link} accessibilityRole="button" onPress={() => switchFlow('otp')}>Sign in with a code</Text>
                <Text style={st.link} accessibilityRole="button" onPress={() => switchFlow('reset')}>Forgot password?</Text>
              </View>
            </>
          )}

          {mode === 'in' && flow === 'otp' && (
            <>
              <Button label={busy ? 'Please wait…' : sent ? 'Verify & sign in' : otpChannel === 'phone' ? 'Text me a code' : 'Email me a code'} onPress={sent ? otpVerify : otpRequest} disabled={busy} />
              <View style={st.linkRow}>
                {sent && <ResendLink waitS={resendIn} onPress={otpRequest} />}
                <Text style={st.link} accessibilityRole="button" onPress={() => switchFlow('password')}>Use password instead</Text>
              </View>
            </>
          )}

          {mode === 'in' && flow === 'reset' && (
            <>
              <Button label={busy ? 'Please wait…' : sent ? 'Reset password & sign in' : 'Send reset code'} onPress={sent ? resetConfirm : resetRequest} disabled={busy} />
              <View style={st.linkRow}>
                {sent && <ResendLink waitS={resendIn} onPress={resetRequest} />}
                <Text style={st.link} accessibilityRole="button" onPress={() => switchFlow('password')}>Back to sign in</Text>
              </View>
            </>
          )}
        </Card>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

/** Supabase refuses a second code for the same address within this many seconds. */
const RESEND_WAIT_S = 60;

/** A typed or pasted code: digits only ("1234 5678", "1234-5678" → "12345678"). */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** What to say once a code is on its way. */
export function codeSentNote(what: string, email: string): string {
  return `We emailed ${what} to ${email}. It can take a minute — check spam too. Type every digit; a new code replaces the last one.`;
}

function ResendLink({ waitS, onPress }: { waitS: number; onPress: () => void }) {
  if (waitS > 0) return <Text style={[st.link, { opacity: 0.5 }]}>Resend code in {waitS}s</Text>;
  return <Text style={st.link} accessibilityRole="button" onPress={onPress}>Resend code</Text>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  keyboardType,
  autoComplete,
  inputRef,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: 'email-address' | 'number-pad';
  /** SD-155 (1.3.5): lets password managers / autofill identify the field. */
  autoComplete?: 'email' | 'current-password' | 'new-password' | 'one-time-code' | 'name';
  inputRef?: React.Ref<TextInput>;
  returnKeyType?: 'next' | 'go';
  onSubmitEditing?: () => void;
}) {
  // keeps the field above the keyboard
  const kbFocus = useKeyboardFocus();
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.muted}>{label}</Text>
      <TextInput
        style={st.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        secureTextEntry={secure}
        autoCapitalize="none"
        keyboardType={keyboardType}
        // SD-155: the <Text> above isn't tied to the input, so name it here too.
        accessibilityLabel={label}
        autoComplete={autoComplete}
        ref={inputRef}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        submitBehavior={returnKeyType === 'next' ? 'submit' : undefined}
        {...kbFocus}
      />
    </View>
  );
}

const st = StyleSheet.create({
  orRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  orLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(5), gap: theme.spacing(5), flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', gap: theme.spacing(1) },
  logo: { color: theme.colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  logoAccent: { color: theme.colors.primary },
  tagline: { textAlign: 'center' },
  formCard: { gap: theme.spacing(4) },
  tabs: { flexDirection: 'row', gap: theme.spacing(2) },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder, // SD-155: ≥3:1 field edge (1.4.11)
    minHeight: 44,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(3),
    color: theme.colors.text,
    fontSize: theme.font.body,
  },
  ageHint: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700' },
  consentRow: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-start' },
  checkbox: { fontSize: 20, color: theme.colors.textMuted, lineHeight: 22 },
  checkboxOn: { color: theme.colors.primary },
  consentText: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.small, lineHeight: 18 },
  legalLink: { color: theme.colors.accent, fontWeight: '700' },
  noteBox: {
    backgroundColor: theme.colors.primary + '1A', // ~10% tint
    borderWidth: 1, borderColor: theme.colors.primary + '55',
    borderRadius: theme.radius.md, padding: theme.spacing(3),
  },
  noteText: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', lineHeight: 20 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: theme.spacing(2) },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
});
