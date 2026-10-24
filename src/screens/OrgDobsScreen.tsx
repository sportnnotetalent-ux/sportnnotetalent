/** A verified school / club confirms its members' dates of birth against its own
 *  records, in bulk (docs/verification/fast-lanes.md, Phase 2). Owners / Admins
 *  only (server: org_member_dobs / org_confirm_dobs). A confirmation counts only
 *  for the date of birth shown — if a player changes it, it needs confirming again. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { KeyboardAwareScrollView, KeyboardFooterLayout } from '../components/keyboard';
import { theme } from '../core/theme';
import { Button, Card, EmptyState, FormError, LoadingState, ScreenTitle, textStyles } from '../components/ui';
import { confirmOrgDobs, getOrganization, getOrgMemberDobs, type OrgMemberDob } from '../data/repos';
import { readableDob } from '../core/verificationReview';
import type { RootStackParamList } from '../navigation/types';

const LEVEL: Record<string, string> = { document: 'verified by document', school: 'confirmed by a school', parent: 'confirmed by parent' };

export default function OrgDobsScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'OrgDobs'>>();
  const [orgName, setOrgName] = useState('');
  const [rows, setRows] = useState<OrgMemberDob[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    void getOrganization(params.orgId).then((o) => setOrgName(o?.name ?? ''));
    getOrgMemberDobs(params.orgId).then(setRows).catch((e) => { setRows([]); setError(e instanceof Error ? e.message : 'Couldn’t load the members.'); });
  }, [params.orgId]);
  useEffect(load, [load]);

  const open = useMemo(() => (rows ?? []).filter((r) => r.dob && !r.confirmed), [rows]);
  const noDob = useMemo(() => (rows ?? []).filter((r) => !r.dob), [rows]);
  const done = useMemo(() => (rows ?? []).filter((r) => r.dob && r.confirmed), [rows]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = open.length > 0 && open.every((r) => picked.has(r.playerId));

  const confirm = async () => {
    setBusy(true); setError(null); setNote(null);
    try {
      const n = await confirmOrgDobs(params.orgId, [...picked]);
      setNote(`☑️ ${n} date${n === 1 ? '' : 's'} of birth confirmed.`);
      setPicked(new Set());
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t confirm those — try again.');
    } finally {
      setBusy(false);
    }
  };

  if (rows === null) return <SafeAreaView style={st.safe}><LoadingState label="Loading members…" /></SafeAreaView>;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardFooterLayout
        footer={open.length ? (
          <>
            <FormError message={error} />
            <Button
              label={busy ? 'Confirming…' : picked.size ? `☑️ Confirm ${picked.size} date${picked.size === 1 ? '' : 's'} of birth` : 'Pick the ones that match your records'}
              onPress={() => void confirm()}
              disabled={busy || picked.size === 0}
            />
          </>
        ) : null}
      >
        <KeyboardAwareScrollView contentContainerStyle={st.content}>
          <ScreenTitle title="Confirm dates of birth" subtitle={orgName || 'Your members'} />
          <Text style={textStyles.muted}>
            Tick each member whose date of birth matches {orgName || 'your'} records (admission register or school ID). Confirming it verifies their age for age-group events — they don’t need to upload a document. If one is wrong, ask them to fix it in Edit profile first.
          </Text>
          {note ? <Text style={st.note} accessibilityRole="alert">{note}</Text> : null}
          {error && !open.length ? <FormError message={error} /> : null}

          {open.length > 0 ? (
            <>
              <View style={st.headRow}>
                <Text style={textStyles.h3}>To confirm · {open.length}</Text>
                <Text style={st.link} onPress={() => setPicked(allPicked ? new Set() : new Set(open.map((r) => r.playerId)))}>{allPicked ? 'Clear' : 'Select all'}</Text>
              </View>
              {open.map((r) => (
                <Pressable key={r.playerId} onPress={() => toggle(r.playerId)} accessibilityRole="checkbox" accessibilityState={{ checked: picked.has(r.playerId) }} accessibilityLabel={`${r.fullName}, born ${readableDob(r.dob)}`}>
                  <Card style={[st.row, picked.has(r.playerId) && st.rowOn]}>
                    <Text style={st.box}>{picked.has(r.playerId) ? '☑️' : '⬜'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body}>{r.fullName}</Text>
                      <Text style={textStyles.muted}>{readableDob(r.dob)}{r.age !== undefined ? ` · ${r.age} yrs` : ''}{r.verifiedBy ? ` · already ${LEVEL[r.verifiedBy]}` : ''}</Text>
                    </View>
                  </Card>
                </Pressable>
              ))}
            </>
          ) : rows.length > 0 ? (
            <Card><EmptyState icon="🎉" title="All confirmed" hint="Every member with a date of birth is confirmed." compact /></Card>
          ) : (
            <Card><EmptyState icon="👥" title="No members yet" hint="Add members to your organisation first." compact /></Card>
          )}

          {noDob.length > 0 && (
            <>
              <Text style={textStyles.h3}>No date of birth yet · {noDob.length}</Text>
              <Text style={textStyles.muted}>{noDob.map((r) => r.fullName).join(', ')}</Text>
            </>
          )}
          {done.length > 0 && (
            <>
              <Text style={textStyles.h3}>Confirmed by you · {done.length}</Text>
              <Text style={textStyles.muted}>{done.map((r) => r.fullName).join(', ')}</Text>
            </>
          )}
        </KeyboardAwareScrollView>
      </KeyboardFooterLayout>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  rowOn: { borderColor: theme.colors.primary },
  box: { fontSize: 18 },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  note: { color: theme.colors.primary, fontWeight: '700' },
});
