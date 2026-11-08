/**
 * Invite a friend (2026-10-23): send your personal link straight to them on
 * WhatsApp or SMS — pick them from your contacts or type their number — or share
 * it any other way; in person, they scan the QR. They get the right steps for
 * their phone (Android app or the web app on iPhone) and, once they have an
 * account, follow you (GetApp screen + data/referral.ts).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { theme } from '../core/theme';
import { Button, Card, LoadingState, ScreenTitle, TextField, textStyles } from '../components/ui';
import { PhoneField } from '../components/PhoneField';
import { useAuth } from '../core/auth';
import { friendInviteLink, friendInviteText } from '../core/inviteText';
import { openSms, openWhatsApp } from '../core/connect';
import { intlDigits } from '../core/phone';
import { canPickContact, pickContact, ContactsDenied } from '../core/pickContact';
import { shareMessage } from '../core/share';
import { track } from '../core/telemetry';
import { notice } from '../core/confirm';
import { getMyPlayerId } from '../data/repos';

export default function InviteFriendScreen() {
  const { profile } = useAuth();
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  // remounts the number field when a contact fills it in
  const [picked, setPicked] = useState(0);

  useEffect(() => {
    let on = true;
    void getMyPlayerId(profile?.id).then((id) => { if (on) setMe(id); }).catch(() => { if (on) setMe(null); });
    return () => { on = false; };
  }, [profile?.id]);

  if (me === undefined) return <LoadingState />;
  if (!me) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.content}>
          <ScreenTitle title="Invite a friend" />
          <Text style={textStyles.body}>Finish setting up your profile first, so your friend knows who invited them.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const link = friendInviteLink(me);
  const text = friendInviteText({ link, inviterName: profile?.fullName, friendName: name });
  const reachable = intlDigits(phone).length >= 8;

  const fromContacts = async () => {
    try {
      const c = await pickContact();
      if (!c) return;
      if (c.name) setName(c.name);
      if (c.phones[0]) { setPhone(c.phones[0]); setPicked((n) => n + 1); }
      else notice('No mobile number', `${c.name ?? 'That contact'} has no number saved — type it below.`);
    } catch (e) {
      // PC2: access refused after picking — say so, not "no number saved"
      if (e instanceof ContactsDenied) notice('Contacts access needed', 'Allow contacts access to pick a friend, or type their number below.');
      else notice('Couldn’t open contacts', 'Type their number below instead.');
    }
  };
  const send = (via: 'whatsapp' | 'sms') => {
    track('share_link', { what: 'friend_invite', via });
    if (via === 'whatsapp') openWhatsApp(phone, text);
    else openSms(phone, text);
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Invite a friend" subtitle="They can join on Android or iPhone and will follow you once they’re in" />

        <Card style={{ gap: theme.spacing(3) }}>
          <Text style={textStyles.h3}>Send it to them</Text>
          {canPickContact() ? <Button label="📇 Pick from contacts" variant="ghost" onPress={() => void fromContacts()} /> : null}
          <PhoneField key={picked} label="Their mobile number" value={phone} onChange={setPhone} />
          <TextField label="Their name (optional)" value={name} onChange={setName} placeholder="So the message says hi to them" autoCapitalize="words" />
          <View style={st.row}>
            <View style={st.flex}><Button variant="primary" label="💬 WhatsApp" onPress={() => send('whatsapp')} disabled={!reachable} /></View>
            <View style={st.flex}><Button label="✉️ SMS" variant="ghost" onPress={() => send('sms')} disabled={!reachable} /></View>
          </View>
          <View style={st.preview}>
            <Text style={textStyles.muted} selectable>{text}</Text>
          </View>
        </Card>

        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>Or share it any other way</Text>
          <Button label="Share invite link…" variant="ghost" onPress={() => void shareMessage(text, 'invite')} />
        </Card>

        <Card style={{ gap: theme.spacing(2), alignItems: 'center' }}>
          <Text style={textStyles.h3}>Together in person?</Text>
          <View style={st.qr}><QRCode value={link} size={168} backgroundColor="#ffffff" color="#04150F" quietZone={8} /></View>
          <Text style={[textStyles.muted, { textAlign: 'center' }]}>They point their phone’s camera here — no typing.</Text>
        </Card>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4) },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  preview: { padding: theme.spacing(3), borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt },
  qr: { padding: theme.spacing(2), backgroundColor: '#ffffff', borderRadius: theme.radius.md },
});
