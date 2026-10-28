/**
 * Security Wave 3F — support console: requests that a player's side reported
 * ("someone keeps adding my child"). Each shows the group, who made it and how
 * often groups they made were reported; Mark handled closes it. Renders
 * nothing when there are none.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Button, Card, textStyles } from './ui';
import { getLinkReports, handleLinkReport } from '../data/requestsStore';
import type { LinkReport } from '../data/requests';

const KIND: Record<LinkReport['kind'], string> = { team: 'team', club: 'club', org: 'community', field_event: 'event' };

export function LinkReportsCard() {
  const [list, setList] = useState<LinkReport[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      void getLinkReports().then((l) => on && setList(l)).catch(() => {});
      return () => { on = false; };
    }, [])
  );

  if (list.length === 0) return null;

  const handle = async (r: LinkReport) => {
    setBusy(r.id);
    try {
      await handleLinkReport(r.id);
      setList((xs) => xs.filter((x) => x.id !== r.id));
    } catch { /* stays listed */ } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={st.card}>
      <Text style={textStyles.h3}>🚩 Reported requests ({list.length})</Text>
      <Text style={textStyles.muted}>A player’s side said someone added them without asking. The player is already off the group.</Text>
      {list.map((r) => (
        <View key={r.id} style={st.row}>
          <View style={st.flex}>
            <Text style={textStyles.body}>{r.groupName} ({KIND[r.kind]}) · made by {r.creatorName}{r.creatorReports > 1 ? ` · reported ${r.creatorReports} times` : ''}</Text>
            {r.reason ? <Text style={textStyles.muted}>“{r.reason}”</Text> : null}
          </View>
          <Button label="Mark handled" variant="ghost" onPress={() => void handle(r)} disabled={busy !== null} />
        </View>
      ))}
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingTop: theme.spacing(2), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  flex: { flex: 1, gap: 2 },
});
