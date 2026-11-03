/** The team dashboard (spec §12): one place that shows the whole team and lets an
 *  admin drill in. Header with member / admin / sport counts, the SPORTS the team
 *  plays (tap a sport → its sport profile; admins can add/remove sports), and the
 *  MEMBERS with their team-level role (admin | member). Team administration lives
 *  here; sport-specific leadership (captains) lives inside each sport's profile. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { SportBadge } from '../components/SportSymbol';
import { readableOn } from '../core/contrast';
import { Card, SelectChip, ScreenTitle, LoadingState, textStyles } from '../components/ui';
import { PersonPicker } from '../components/PersonPicker';
import { SPORT_LIST, getSportMeta } from '../sports/sportMeta';
import { useAuth } from '../core/auth';
import {
  getClub, getClubMembers, getClubSports, getMyPlayerId,
  addClubSport, removeClubSport, addClubMember, removeClubMember, setClubMemberRole, invitePerson, createClubInvite, updateClub,
} from '../data/repos';
import { LogoPicker } from '../components/LogoPicker';
import { clubInviteMessage } from '../core/invite';
import { inviteLabel, playerInviteText } from '../core/inviteText';
import { SHARE_BASE } from '../core/shareText';
import { InviteQrShare, type InviteQrShareHandle } from '../components/InviteQrShare';
import type { Club, ClubMemberView, SportId } from '../core/types';
import { getClubSessions } from '../data/squadSessions';
import type { SquadSession } from '../core/squadSession';
import type { RootStackParamList } from '../navigation/types';
import { Glyph } from '../components/Icon';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ClubHomeScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ClubHome'>>();
  const clubId = params.clubId;
  const { profile } = useAuth();

  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMemberView[]>([]);
  const [sports, setSports] = useState<SportId[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SquadSession[]>([]);

  const [editSports, setEditSports] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const qrShare = useRef<InviteQrShareHandle>(null);

  const load = useCallback(async () => {
    const [c, m, s, id, ss] = await Promise.all([
      getClub(clubId), getClubMembers(clubId), getClubSports(clubId), getMyPlayerId(profile?.id), getClubSessions(clubId, 5),
    ]);
    setClub(c); setMembers(m); setSports(s); setMyId(id); setSessions(ss); setLoading(false);
  }, [clubId, profile?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const amAdmin = members.some((m) => m.playerId === myId && m.role === 'admin') || (!!club && club.createdBy === profile?.id);
  const adminCount = members.filter((m) => m.role === 'admin').length;
  const amMember = amAdmin || members.some((m) => m.playerId === myId);

  async function toggleSport(s: SportId) {
    setBusy(true);
    try {
      if (sports.includes(s)) await removeClubSport(clubId, s);
      else await addClubSport(clubId, s);
      await load();
    } finally { setBusy(false); }
  }

  // Members are people (PersonPicker): someone on SportnNote by name or exact
  // mobile number, or a new number added & invited (they claim it by signing up
  // with it). A typed name only is the marked last resort — not linked to anyone.
  async function addMember(playerId: string) {
    setBusy(true);
    try { await addClubMember(clubId, playerId); await load(); }
    finally { setBusy(false); }
  }
  async function addNameOnly(name: string) {
    const { player } = await invitePerson({ name });
    await addMember(player.id);
  }
  const memberInvite = (who?: string) => playerInviteText({
    name: who, inviterName: profile?.fullName, context: club ? inviteLabel('Team', club.name) : undefined, link: SHARE_BASE,
  });

  async function removeMember(playerId: string) {
    setBusy(true);
    try { await removeClubMember(clubId, playerId); setConfirmRemove(null); await load(); }
    finally { setBusy(false); }
  }

  async function invite() {
    if (!club) return;
    setBusy(true);
    try {
      // Reuse the code already on screen; otherwise make one.
      const token = inviteCode ?? (await createClubInvite(clubId)).token;
      setInviteCode(token);
      // Share the QR image + message by default (SD-108) — once the QR has drawn.
      await new Promise((r) => setTimeout(r, 120));
      await qrShare.current?.share();
    } finally { setBusy(false); }
  }

  async function setRole(playerId: string, role: 'admin' | 'member') {
    // Guard against demoting the last admin — a team must keep at least one.
    if (role === 'member' && adminCount <= 1) return;
    setBusy(true);
    try { await setClubMemberRole(clubId, playerId, role); await load(); }
    finally { setBusy(false); }
  }

  if (loading) return <SafeAreaView style={st.safe}><LoadingState /></SafeAreaView>;
  if (!club) return <SafeAreaView style={st.safe}><ScreenTitle title="Team not found" /></SafeAreaView>;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        {/* Header */}
        <Card style={st.header}>
          {club.logoUrl || amAdmin ? (
            <LogoPicker
              logoUrl={club.logoUrl}
              canManage={amAdmin}
              size={56}
              placeholder={club.shortName?.slice(0, 3) || '🛡️'}
              label="Add logo"
              kind="club-logo"
              onPick={async (uri) => { await updateClub(clubId, { logoUrl: uri }); setClub((c) => (c ? { ...c, logoUrl: uri } : c)); }}
            />
          ) : (
            <View style={[st.badge, { backgroundColor: club.colorHex ?? theme.colors.primary }]}>
              <Text style={[st.badgeText, { color: readableOn(club.colorHex ?? theme.colors.primary) }]}>{club.shortName?.slice(0, 3) || club.name.slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={textStyles.h2}>{club.name}</Text>
            {!!club.city && <Text style={textStyles.muted}>{club.city}</Text>}
            <Text style={[textStyles.muted, { marginTop: theme.spacing(1) }]}>
              {members.length} member{members.length === 1 ? '' : 's'} · {adminCount} admin{adminCount === 1 ? '' : 's'} · {sports.length} sport{sports.length === 1 ? '' : 's'}
            </Text>
          </View>
        </Card>

        {/* Sports */}
        <View style={st.sectionHead}>
          <Text style={textStyles.h3}>Sports</Text>
          {amAdmin && (
            <TouchableOpacity onPress={() => setEditSports((v) => !v)} accessibilityRole="button">
              <Text style={st.link}>{editSports ? 'Done' : 'Edit'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {editSports ? (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.muted}>Tap to add or remove a sport this team plays.</Text>
            <View style={st.chips}>
              {SPORT_LIST.map((s) => (
                <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={sports.includes(s.id)} disabled={busy} onPress={() => toggleSport(s.id)} />
              ))}
            </View>
          </Card>
        ) : sports.length === 0 ? (
          <Card><Text style={textStyles.muted}>No sports yet. {amAdmin ? 'Tap Edit to add one.' : ''}</Text></Card>
        ) : (
          sports.map((s) => {
            const plugin = getSportMeta(s);
            return (
              <TouchableOpacity key={s} accessibilityRole="button" accessibilityLabel={`Open ${plugin.name}`}
                onPress={() => nav.navigate('ClubSport', { clubId, sport: s })}>
                <Card style={st.sportRow}>
                  <SportBadge sport={s} size={32} />
                  <Text style={[textStyles.body, { flex: 1 }]}>{plugin.name}</Text>
                  <Text style={st.chev}>›</Text>
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        {/* Game days — squad sessions (docs/product/squad-sessions.md) */}
        <View style={st.sectionHead}>
          <Text style={textStyles.h3}>Game days</Text>
          {amMember && (
            <TouchableOpacity onPress={() => nav.navigate('SquadSession', { clubId })} accessibilityRole="button">
              <Text style={st.link}>+ Start a session</Text>
            </TouchableOpacity>
          )}
        </View>
        {sessions.length === 0 ? (
          <Card><Text style={textStyles.muted}>Playing today? Start a session: pick who’s here, captains pick teams, and teams play in turns.</Text></Card>
        ) : (
          sessions.map((x) => (
            <TouchableOpacity key={x.id} accessibilityRole="button" accessibilityLabel={`Open session ${x.name}`}
              onPress={() => nav.navigate('SquadSession', { sessionId: x.id })}>
              <Card style={st.sportRow}>
                <SportBadge sport={x.sport as SportId} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={textStyles.body}>{new Date(x.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                  <Text style={textStyles.muted}>{x.players.length} players · {x.status === 'ended' ? 'ended' : x.status === 'playing' ? 'playing now' : 'making teams'}</Text>
                </View>
                <Text style={st.chev}>›</Text>
              </Card>
            </TouchableOpacity>
          ))
        )}

        {/* Members */}
        <View style={st.sectionHead}>
          <Text style={textStyles.h3}>Members</Text>
          {amAdmin && (
            <View style={st.memberActions}>
              <TouchableOpacity onPress={invite} accessibilityRole="button" disabled={busy}>
                <Text style={st.link}>Invite</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAddingMember((v) => !v)} accessibilityRole="button">
                <Text style={st.link}>{addingMember ? 'Close' : '+ Add'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {inviteCode && (
          <Card style={{ gap: theme.spacing(2), alignItems: 'center' }}>
            <Text style={[textStyles.muted, { textAlign: 'center' }]}>Scan to join, or share the code below.</Text>
            <InviteQrShare
              kind="club"
              name={club.name}
              token={inviteCode}
              shareRef={qrShare}
              message={clubInviteMessage({ clubName: club.name, inviterName: profile?.fullName ?? 'A teammate', token: inviteCode })}
              caption={[`Join ${inviteLabel('Team', club.name)}`, `SportnNote · code ${inviteCode}`]}
            />
            <Text style={st.code} selectable>{inviteCode}</Text>
            <Text style={[textStyles.muted, { textAlign: 'center', fontSize: theme.font.small }]}>Scan with the phone camera, or in the app open “Join a team” and enter this code.</Text>
            <TouchableOpacity onPress={() => setInviteCode(null)} accessibilityRole="button"><Text style={textStyles.muted}>Hide</Text></TouchableOpacity>
          </Card>
        )}

        {addingMember && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.muted}>Find a player by name or mobile number — or type a new number to add & invite them.</Text>
            <PersonPicker
              role="member"
              excludeIds={members.map((m) => m.playerId)}
              takenNote={(n) => `${n} is already a member.`}
              inviteText={memberInvite}
              onPick={(p) => addMember(p.id)}
              onNameOnly={addNameOnly}
            />
          </Card>
        )}

        {members.length === 0 && !addingMember && (
          <Card><Text style={textStyles.muted}>No members yet.{amAdmin ? ' Add your teammates above.' : ''}</Text></Card>
        )}

        {members.map((m) => (
          <Card key={m.playerId} style={st.memberRow}>
            <View style={{ flex: 1 }}>
              <Text style={textStyles.body}>{m.player.fullName}{m.playerId === myId ? ' (you)' : ''}</Text>
              {!!m.player.invited && <Text style={st.pending}>Invite pending</Text>}
            </View>
            <View style={[st.roleTag, m.role === 'admin' && st.roleTagAdmin]}>
              <Text style={[st.roleText, m.role === 'admin' && st.roleTextAdmin]}>{m.role === 'admin' ? 'Admin' : 'Member'}</Text>
            </View>
            {amAdmin && (
              confirmRemove === m.playerId ? (
                <View style={st.confirmRow}>
                  <TouchableOpacity onPress={() => removeMember(m.playerId)} accessibilityRole="button"><Text style={st.danger}>Remove</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmRemove(null)} accessibilityRole="button"><Text style={st.link}>Cancel</Text></TouchableOpacity>
                </View>
              ) : (
                <View style={st.memberActions}>
                  <TouchableOpacity onPress={() => setRole(m.playerId, m.role === 'admin' ? 'member' : 'admin')} accessibilityRole="button">
                    <Text style={st.link}>{m.role === 'admin' ? 'Demote' : 'Make admin'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmRemove(m.playerId)} accessibilityRole="button" accessibilityLabel="Remove member"><Glyph emoji="✕" style={st.danger} /></TouchableOpacity>
                </View>
              )
            )}
          </Card>
        ))}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  badge: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing(1) },
  link: { color: theme.colors.primary, fontWeight: '700' },
  danger: { color: theme.colors.danger, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  sportRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  sportIcon: { fontSize: 22 },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '800' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  pending: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
  code: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.h3, letterSpacing: 1 },
  roleTag: { paddingHorizontal: theme.spacing(2), paddingVertical: 2, borderRadius: 10, backgroundColor: theme.colors.surfaceAlt },
  roleTagAdmin: { backgroundColor: theme.colors.primary },
  roleText: { fontSize: theme.font.small, fontWeight: '700', color: theme.colors.textMuted },
  roleTextAdmin: { color: '#04150F' },
});
