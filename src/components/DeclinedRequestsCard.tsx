/**
 * Security Wave 3F — Settings → Your data & privacy: "Declined requests". The
 * "Not us" answers given for my side (me, my child, a player I added), each
 * with Undo: the group can ask again by adding the player back. Renders
 * nothing when there are none (and in demo mode).
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { Button, Card, textStyles } from './ui';
import { getMyPlayerId } from '../data/repos';
import { getDeclinedLinks, undoDecline } from '../data/requestsStore';
import { declinedLine, type DeclinedLink } from '../data/requests';

const keyOf = (d: DeclinedLink) => `${d.kind}:${d.groupId}:${d.playerId}`;

export function DeclinedRequestsCard() {
  const { profile, demo } = useAuth();
  const [list, setList] = useState<DeclinedLink[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (demo || !profile?.id) return;
      let on = true;
      void Promise.all([getDeclinedLinks(), getMyPlayerId(profile.id)])
        .then(([l, id]) => { if (on) { setList(l); setMe(id); } })
        .catch(() => {});
      return () => { on = false; };
    }, [profile?.id, demo])
  );

  if (list.length === 0) return null;

  const undo = async (d: DeclinedLink) => {
    const key = keyOf(d);
    setBusy(key);
    setMsg(null);
    try {
      await undoDecline(d);
      setList((xs) => xs.filter((x) => keyOf(x) !== key));
      setMsg(`Undone. If ${d.groupName} adds ${d.playerId === me ? 'you' : d.playerName} again, you'll be asked to confirm.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Couldn’t undo that — try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={st.card}>
      <Text style={textStyles.h3}>Declined requests</Text>
      <Text style={textStyles.muted}>You said “Not us” to these. Undo one if it was a mistake; the group can then add the player again.</Text>
      {list.map((d) => (
        <View key={keyOf(d)} style={st.row}>
          <Text style={[textStyles.body, st.flex]}>{declinedLine(d, d.playerId === me)}</Text>
          <Button label="Undo" variant="ghost" onPress={() => void undo(d)} disabled={busy !== null} accessibilityLabel={`Undo Not us for ${declinedLine(d, d.playerId === me)}`} />
        </View>
      ))}
      {msg ? <Text style={textStyles.muted} accessibilityLiveRegion="polite">{msg}</Text> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  flex: { flex: 1 },
});
