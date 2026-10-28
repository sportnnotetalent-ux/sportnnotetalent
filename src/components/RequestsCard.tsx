/**
 * Security Wave 2b — Home card: "Requests to confirm". Someone else added my
 * player (or my child, or a player I added) to their team, club, community or
 * event; or set up a friendly against a team I manage. Nothing is revealed
 * until we answer: Confirm / Not us, Accept / Decline. Wording: data/requests.ts.
 * Renders nothing when there's nothing to answer (and always in demo mode).
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { Button, Card, textStyles } from './ui';
import { askConfirm } from './ConfirmSheet';
import { getMyPlayerId } from '../data/repos';
import { answerFriendly, answerLink, getPendingFriendlies, getPendingLinks, reportLink } from '../data/requestsStore';
import {
  FRIENDLY_CONSEQUENCE, declineFriendlyCopy, friendlyTitle, linkConsequence, linkTitle, notUsCopy, reportCopy, requestsHeading,
  type PendingFriendly, type PendingLink,
} from '../data/requests';

const SHOWN = 3;
const linkKey = (l: PendingLink) => `${l.kind}:${l.groupId}:${l.playerId}`;
const friendlyKey = (f: PendingFriendly) => `f:${f.matchId}:${f.teamId}`;

export function RequestsCard() {
  const { profile, demo } = useAuth();
  const [links, setLinks] = useState<PendingLink[]>([]);
  const [friendlies, setFriendlies] = useState<PendingFriendly[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; msg: string } | null>(null);
  const [all, setAll] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (demo || !profile?.id) return;
      let on = true;
      void Promise.all([getPendingLinks(), getPendingFriendlies(), getMyPlayerId(profile.id)])
        .then(([l, f, id]) => { if (on) { setLinks(l); setFriendlies(f); setMe(id); } })
        .catch(() => {});
      return () => { on = false; };
    }, [profile?.id, demo])
  );

  const total = links.length + friendlies.length;
  if (total === 0) return null;

  const run = async (key: string, act: () => Promise<void>, drop: () => void) => {
    setBusy(key);
    setError(null);
    try { await act(); drop(); }
    catch (e) { setError({ key, msg: e instanceof Error ? e.message : 'Couldn’t save your answer — try again.' }); }
    finally { setBusy(null); }
  };
  const onLink = async (l: PendingLink, accept: boolean) => {
    if (!accept && !(await askConfirm(notUsCopy(l, l.playerId === me)))) return;
    const key = linkKey(l);
    await run(key, () => answerLink(l, accept), () => setLinks((xs) => xs.filter((x) => linkKey(x) !== key)));
  };
  // Wave 3F: report a request to support (it also counts as "Not us")
  const onReport = async (l: PendingLink) => {
    if (!(await askConfirm(reportCopy(l, l.playerId === me)))) return;
    const key = linkKey(l);
    await run(key, () => reportLink(l), () => setLinks((xs) => xs.filter((x) => linkKey(x) !== key)));
  };
  const onFriendly = async (f: PendingFriendly, accept: boolean) => {
    if (!accept && !(await askConfirm(declineFriendlyCopy(f)))) return;
    const key = friendlyKey(f);
    await run(key, () => answerFriendly(f, accept), () => setFriendlies((xs) => xs.filter((x) => friendlyKey(x) !== key)));
  };

  type Row = { key: string; title: string; note: string; yes: string; no: string; onYes: () => void; onNo: () => void; onReport?: () => void };
  const rows: Row[] = [
    ...friendlies.map((f): Row => ({
      key: friendlyKey(f), title: friendlyTitle(f), note: FRIENDLY_CONSEQUENCE, yes: 'Accept', no: 'Decline',
      onYes: () => void onFriendly(f, true), onNo: () => void onFriendly(f, false),
    })),
    ...links.map((l): Row => ({
      key: linkKey(l), title: linkTitle(l, l.playerId === me), note: linkConsequence(l, l.playerId === me), yes: 'Confirm', no: 'Not us',
      onYes: () => void onLink(l, true), onNo: () => void onLink(l, false), onReport: () => void onReport(l),
    })),
  ];
  const shown = all ? rows : rows.slice(0, SHOWN);

  return (
    <Card style={st.card}>
      <Text style={textStyles.h3} accessibilityRole="header">🤝 {requestsHeading(links.length, friendlies.length)}</Text>
      {shown.map((r) => (
        <View key={r.key} style={st.row}>
          <Text style={textStyles.body}>{r.title}</Text>
          <Text style={textStyles.muted}>{r.note}</Text>
          {error?.key === r.key ? <Text style={st.error} accessibilityLiveRegion="polite">{error.msg}</Text> : null}
          <View style={st.actions}>
            <Button label={r.yes} onPress={r.onYes} disabled={busy !== null} style={st.btn} />
            <Button label={r.no} variant="ghost" onPress={r.onNo} disabled={busy !== null} style={st.btn} />
          </View>
          {r.onReport ? (
            <Text style={st.report} accessibilityRole="button" accessibilityLabel={`Report: ${r.title}`} onPress={busy === null ? r.onReport : undefined}>
              Report this to SportnNote
            </Text>
          ) : null}
        </View>
      ))}
      {rows.length > SHOWN && (
        <Button label={all ? 'Show fewer' : `Show all ${rows.length}`} variant="ghost" onPress={() => setAll((v) => !v)} />
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(3), borderColor: theme.colors.accent, borderWidth: 1 },
  row: { gap: theme.spacing(1), paddingTop: theme.spacing(2), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), marginTop: theme.spacing(1) },
  btn: { flexGrow: 1, minWidth: 120 },
  error: { color: theme.colors.danger, fontSize: theme.font.small },
  report: { color: theme.colors.textMuted, fontSize: theme.font.small, textDecorationLine: 'underline', alignSelf: 'flex-start', paddingVertical: theme.spacing(1) },
});
