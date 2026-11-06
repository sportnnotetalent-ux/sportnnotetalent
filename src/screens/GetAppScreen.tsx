/**
 * app.sportnnote.in/get/<inviter> — "Join me on SportnNote" (2026-10-23). A friend
 * opens their personal invite (InviteFriend screen): the right next step for
 * their phone, and once they have an account they follow whoever invited them
 * (data/referral.ts — the inviter is remembered on this device until then).
 *   Android browser  "Open the SportnNote app" opens the installed app on this
 *                    same screen (the invite carries over); not installed → the
 *                    download page. Or sign up right here in the browser.
 *   iPhone           sign up here, then Add to Home Screen (opens like an app).
 *   Computer         a QR code for their phone's camera.
 *   In the app       sign up / sign in, then "you're in".
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, textStyles } from '../components/ui';
import { Logo } from '../components/Logo';
import { PhoneLoginCard } from '../components/PhoneLoginCard';
import { phoneLoginAvailable } from '../core/phoneLogin';
import { promptSignIn } from '../core/guest';
import { useAuth } from '../core/auth';
import { androidIntentUrl, friendInviteLink, INSTALL_PAGE_URL, webDevice } from '../core/inviteText';
import { isInviterId } from '../core/referralRules';
import { applyPendingReferral, savePendingReferral } from '../data/referral';
import { getPlayerNames } from '../data/repos';
import type { RootStackParamList } from '../navigation/types';

export default function GetAppScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'GetApp'>>();
  const from = isInviterId(params?.from) ? params!.from! : null;
  const { authed, profile } = useAuth();
  const [inviter, setInviter] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  // remember who invited this device, and show their name
  useEffect(() => {
    if (!from) return;
    void savePendingReferral(from);
    let on = true;
    void getPlayerNames([from]).then((m) => { if (on) setInviter(m.get(from) ?? null); }).catch(() => undefined);
    return () => { on = false; };
  }, [from]);

  // signed in (now, or after signing up from here): follow the inviter
  useEffect(() => {
    if (!authed || !profile?.id || !from) return;
    void applyPendingReferral(profile.id).then((done) => { if (done) setJoined(true); });
  }, [authed, profile?.id, from]);

  const first = inviter?.split(' ')[0];
  const device = Platform.OS === 'web' && typeof navigator !== 'undefined'
    ? webDevice(navigator.userAgent, (navigator as { maxTouchPoints?: number }).maxTouchPoints ?? 0)
    : null;
  const link = from ? friendInviteLink(from) : null;

  const signUp = phoneLoginAvailable()
    ? <PhoneLoginCard />
    : <Button variant="primary" label="Sign up — it takes a minute" onPress={() => promptSignIn('up')} />;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <View style={st.brand}><Logo size={56} /></View>
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={st.title}>{inviter ? `${inviter} invited you to SportnNote 🏆` : 'You’re invited to SportnNote 🏆'}</Text>
          <Text style={textStyles.body}>Score your games, run tournaments and keep everyone’s stats in one place. Free while it’s new.</Text>
        </View>

        {authed ? (
          <Card style={{ gap: theme.spacing(3) }}>
            <Text style={textStyles.h2}>You’re in</Text>
            <Text style={textStyles.body}>
              {from && (joined || inviter)
                ? `You now follow ${inviter ?? 'your friend'}: their matches and results show up for you. Next game, score it together.`
                : 'Your next game is a tap away: start a friendly and score it live.'}
            </Text>
            <Button label="🤝 Start a friendly" onPress={() => nav.replace('ScheduleMatch', undefined)} />
            <Button label="Go to SportnNote" variant="ghost" onPress={() => nav.replace('Tabs', { screen: 'Home' })} />
          </Card>
        ) : device === 'android' ? (
          <>
            <Card style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.h3}>On Android</Text>
              <Button label="📲 Open the SportnNote app" onPress={() => void Linking.openURL(androidIntentUrl(from ? `get/${from}` : 'get', INSTALL_PAGE_URL))} />
              <Text style={textStyles.muted}>Not installed yet? That takes you to the download. Once it’s installed, open this link again and tap the button.</Text>
            </Card>
            <Text style={st.or}>or use it right here in your browser</Text>
            {signUp}
          </>
        ) : device === 'ios' ? (
          <>
            {signUp}
            <Card style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.h3}>Then make it an app on your iPhone</Text>
              <Text style={textStyles.body}>1. In Safari, tap Share (the square with the arrow) at the bottom.</Text>
              <Text style={textStyles.body}>2. Tap “Add to Home Screen”, then Add.</Text>
              <Text style={textStyles.body}>3. Open SportnNote from your home screen and turn on notifications.</Text>
            </Card>
          </>
        ) : device === 'other' && link ? (
          <>
            <Card style={{ gap: theme.spacing(2), alignItems: 'center' }}>
              <Text style={textStyles.h3}>Best on your phone</Text>
              <View style={st.qr}><QRCode value={link} size={168} backgroundColor="#ffffff" color="#04150F" quietZone={8} /></View>
              <Text style={[textStyles.muted, { textAlign: 'center' }]}>Point your phone’s camera here to open this invite on it.</Text>
            </Card>
            <Text style={st.or}>or sign up on this computer</Text>
            {signUp}
          </>
        ) : (
          <Button label="Sign up — it takes a minute" onPress={() => promptSignIn('up')} />
        )}

        {!authed && first ? <Text style={st.note}>Once you’re in, you’ll follow {first} automatically.</Text> : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4), maxWidth: 520, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', marginTop: theme.spacing(2) },
  title: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900' },
  or: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center' },
  note: { color: theme.colors.textMuted, fontSize: theme.font.small, textAlign: 'center' },
  qr: { padding: theme.spacing(2), backgroundColor: '#ffffff', borderRadius: theme.radius.md },
});
