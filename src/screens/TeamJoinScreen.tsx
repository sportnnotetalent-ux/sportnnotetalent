/**
 * A team's join link (reference-video C8, docs/security/breaks/team-join-link.md):
 * the person sees only the team's name and sport and asks to join, for
 * themselves (adults) or for their child (the parent asks for an under-18).
 * The team's managers accept or decline; nobody joins from the link alone.
 */
import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { Button, Card, EmptyState, FormError, textStyles } from '../components/ui';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { getMyPlayerId, getPlayer, previewTeamJoin, requestTeamJoin, type TeamJoinAsk } from '../data/repos';
import { getGuardianChildren } from '../data/privacy';
import { ageFromDob } from '../core/age';
import { getSportMeta } from '../sports/sportMeta';
import type { RootStackParamList } from '../navigation/types';
import type { SportId } from '../core/types';

const SAYS: Record<TeamJoinAsk, string> = {
  requested: 'Asked. The team’s captain will accept or decline — you’ll see the team on your profile once they accept.',
  already_member: 'Already in this team.',
  already_requested: 'Already asked — waiting for the captain.',
  ask_parent: 'Under 18? Ask your parent to open this link and ask for you.',
  link_off: 'This link isn’t active any more. Ask the captain for a new one.',
  team_busy: 'This team has a lot of requests waiting. Try again later.',
};

export default function TeamJoinScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'TeamJoin'>>();
  const token = params?.token ?? '';
  const { profile } = useAuth();
  const [team, setTeam] = useState<{ teamName: string; sport: SportId } | null | undefined>(undefined);
  const [who, setWho] = useState<{ id: string; name: string; me: boolean; adult: boolean }[]>([]);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    previewTeamJoin(token).then((t) => on && setTeam(t)).catch((e) => { if (on) { setTeam(null); setError((e as Error).message); } });
    (async () => {
      const out: { id: string; name: string; me: boolean; adult: boolean }[] = [];
      const myId = await getMyPlayerId(profile?.id).catch(() => null);
      if (myId) {
        const me = await getPlayer(myId).catch(() => null);
        const age = ageFromDob(me?.dob);
        out.push({ id: myId, name: me?.fullName ?? 'Me', me: true, adult: age !== undefined && age >= 18 });
      }
      for (const c of await getGuardianChildren().catch(() => [])) out.push({ id: c.playerId, name: c.fullName, me: false, adult: false });
      if (on) setWho(out);
    })();
    return () => { on = false; };
  }, [token, profile?.id]);

  const ask = async (playerId: string) => {
    setBusy(playerId);
    setError(null);
    try {
      const r = await requestTeamJoin(token, playerId);
      setSaid((s) => ({ ...s, [playerId]: SAYS[r] }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (team === undefined) return <SafeAreaView style={st.safe} edges={['bottom']}><Text style={[textStyles.muted, st.pad]}>Opening the link…</Text></SafeAreaView>;
  if (team === null) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <EmptyState icon="🔗" title="This link isn’t active" hint={error ?? 'Ask the team’s captain for a new link.'} />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <Card style={{ gap: theme.spacing(1) }}>
          <Text style={textStyles.h3}>{team.teamName}</Text>
          <Text style={textStyles.muted}>{getSportMeta(team.sport).name} · the captain approves who joins</Text>
        </Card>
        {who.length === 0 && <Text style={textStyles.muted}>Set up your player profile first, then open this link again.</Text>}
        {who.map((w) => (
          <View key={w.id} style={{ gap: theme.spacing(1) }}>
            {said[w.id] ? (
              <Text style={textStyles.body}>{w.me ? 'You' : w.name}: {said[w.id]}</Text>
            ) : w.me && !w.adult ? (
              <Text style={textStyles.muted}>{SAYS.ask_parent}</Text>
            ) : (
              <Button
                variant={w.me ? 'primary' : 'ghost'}
                label={busy === w.id ? 'Asking…' : w.me ? 'Ask to join' : `Ask to join for ${w.name}`}
                onPress={() => void ask(w.id)}
                disabled={!!busy}
              />
            )}
          </View>
        ))}
        <FormError message={error} />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  pad: { padding: theme.spacing(4) },
});
