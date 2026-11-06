/**
 * "Invite players" by link (reference-video C8): the team's one join link
 * (share, new link, turn off) and the requests waiting for the captain
 * (Accept / Decline). Sits next to "add by mobile or contacts" on the squad
 * page. Managers only. An under-18 shows as initials and "asked by their
 * parent" (docs/security/breaks/team-join-link.md).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, FormError, ListRow, textStyles } from './ui';
import { IconText } from './Icon';
import { theme } from '../core/theme';
import { APP_HOST } from '../core/hosts';
import { shareMessage } from '../core/share';
import { decideTeamJoin, getTeamJoinLink, getTeamJoinRequests, turnOffTeamJoinLink, type TeamJoinRequest } from '../data/repos';

export function TeamJoinCard({ teamId, teamName, onJoined }: { teamId: string; teamName: string; onJoined: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [requests, setRequests] = useState<TeamJoinRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => { void getTeamJoinRequests(teamId).then(setRequests).catch(() => {}); }, [teamId]);
  useEffect(reload, [reload]);
  const url = token ? `https://${APP_HOST}/tj/${token}` : '';

  const run = async (key: string, f: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await f(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const share = () => shareMessage(`Join ${teamName} on SportnNote — tap to ask the captain: ${url}`, 'invite');

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <IconText label="🔗 Join link" style={textStyles.body} />
      <Text style={textStyles.muted}>Players open it and ask to join; you accept who plays. Under-18s are asked for by their parent.</Text>
      {token ? (
        <>
          <Text style={{ color: theme.colors.primary, fontWeight: '700' }} selectable>{url}</Text>
          <Button variant="primary" label="💬 Share the link" onPress={() => void share()} />
          <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
            <Button label={busy === 'new' ? 'Making…' : 'New link'} style={{ flex: 1 }} onPress={() => void run('new', async () => setToken(await getTeamJoinLink(teamId, true)))} />
            <Button label={busy === 'off' ? 'Turning off…' : 'Turn off'} style={{ flex: 1 }} onPress={() => void run('off', async () => { await turnOffTeamJoinLink(teamId); setToken(null); })} />
          </View>
        </>
      ) : (
        <Button label={busy === 'get' ? 'Getting the link…' : 'Get the join link'} onPress={() => void run('get', async () => setToken(await getTeamJoinLink(teamId)))} />
      )}
      {requests.length > 0 && (
        <View style={{ gap: theme.spacing(2), marginTop: theme.spacing(2) }}>
          <Text style={textStyles.h3}>Asked to join ({requests.length})</Text>
          {requests.map((r) => (
            <View key={r.id} style={{ gap: theme.spacing(1) }}>
              <ListRow title={r.name} meta={r.byParent ? 'Under 18 · asked by their parent' : r.adult ? undefined : 'Under 18'} />
              <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
                <Button variant="primary" label={busy === r.id ? '…' : 'Accept'} style={{ flex: 1 }}
                  onPress={() => void run(r.id, async () => { await decideTeamJoin(r.id, true); reload(); onJoined(); })} />
                <Button label="Decline" style={{ flex: 1 }} onPress={() => void run(r.id, async () => { await decideTeamJoin(r.id, false); reload(); })} />
              </View>
            </View>
          ))}
        </View>
      )}
      <FormError message={error} />
    </Card>
  );
}
