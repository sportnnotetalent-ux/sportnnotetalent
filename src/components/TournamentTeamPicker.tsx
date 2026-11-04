/** Pick a tournament's teams (founder 2026-11-06,
 *  docs/security/breaks/pick-tournament-teams.md): search the sport's real
 *  teams and tap to add; a team not on SportnNote is quick-created with its
 *  captain's mobile, and the captain is invited (WhatsApp / SMS) to add the
 *  players. Every team stays one record. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Button, FormError, SelectChip, TextField, textStyles } from './ui';
import { PhoneField } from './PhoneField';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { useTeams } from '../data/hooks';
import { createTeamWithCaptain, type CaptainInvite } from '../data/teamCaptain';
import { newTeamProblem, sameNameTeam, searchPickTeams } from '../core/teamPick';
import { inviteMessage } from '../core/invite';
import { openWhatsApp, openSms } from '../core/connect';
import type { SportId } from '../core/types';

export interface PickedTeam { id: string; name: string }

const PALETTE = ['#FF5C5C', '#4DA3FF', '#4CD964', '#FFD60A', '#BF5AF2', '#FF9F0A', '#5AC8FA', '#FF375F'];

export function TournamentTeamPicker({ sport, picked, onChange, context }: {
  sport: SportId;
  picked: PickedTeam[];
  onChange: (next: PickedTeam[]) => void;
  /** what the captain is invited to, e.g. "Winter Shield" */
  context?: string;
}) {
  const { profile } = useAuth();
  const [nonce, setNonce] = useState(0);
  const teams = useTeams(sport, nonce);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [capName, setCapName] = useState('');
  const [capPhone, setCapPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<CaptainInvite[]>([]);

  const ids = picked.map((p) => p.id);
  const hits = searchPickTeams(teams, q, sport, ids);
  const twin = adding ? sameNameTeam(teams, name, sport) : undefined;
  const add = (t: PickedTeam) => { if (!ids.includes(t.id)) onChange([...picked, { id: t.id, name: t.name }]); };

  async function createNew() {
    const why = newTeamProblem(name, capName, capPhone);
    if (why) return setError(why);
    setBusy(true); setError(null);
    try {
      const { team, invite } = await createTeamWithCaptain({ name, sport, captainName: capName, captainPhone: capPhone, colorHex: PALETTE[picked.length % PALETTE.length] });
      add(team);
      setInvites((v) => [...v, invite]);
      setName(''); setCapName(''); setCapPhone(''); setAdding(false); setNonce((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t create the team.');
    } finally { setBusy(false); }
  }

  const message = (iv: CaptainInvite) => inviteMessage({ name: iv.captainName, inviterName: profile?.fullName ?? 'The organiser', link: iv.link, context: context ? `${iv.teamName} at ${context}` : iv.teamName, role: 'manage' });

  return (
    <View style={st.box}>
      {picked.length ? (
        <View style={st.chips}>
          {picked.map((p) => (
            <SelectChip key={p.id} label={`${p.name}  ✕`} active accessibilityLabel={`Remove ${p.name}`}
              onPress={() => onChange(picked.filter((x) => x.id !== p.id))} />
          ))}
        </View>
      ) : null}
      <TextField label="Find a team" value={q} onChange={setQ} placeholder="Type 2+ letters of the team’s name" autoCapitalize="none" />
      {q.trim().length >= 2 ? (
        hits.length ? (
          <View style={st.chips}>
            {hits.map((t) => <SelectChip key={t.id} label={`＋ ${t.name}`} active={false} onPress={() => { add(t); setQ(''); }} />)}
          </View>
        ) : <Text style={textStyles.muted}>No team by that name yet — add it as a new team below.</Text>
      ) : null}

      {adding ? (
        <View style={st.newBox}>
          <TextField label="New team’s name" value={name} onChange={setName} placeholder="e.g. Falcons FC" autoCapitalize="words" />
          {twin && !ids.includes(twin.id) ? (
            <Text style={textStyles.muted}>
              A team called “{twin.name}” is already on SportnNote.{' '}
              <Text style={st.link} accessibilityRole="button" onPress={() => { add(twin); setAdding(false); setName(''); }}>Pick it instead</Text>
            </Text>
          ) : null}
          <TextField label="Captain’s name" value={capName} onChange={setCapName} autoCapitalize="words" />
          <PhoneField label="Captain’s mobile" value={capPhone} onChange={setCapPhone} hint="They get an invite to add the team’s players." />
          <FormError message={error} />
          <View style={st.row}>
            <View style={st.flex}><Button label="Cancel" variant="ghost" onPress={() => { setAdding(false); setError(null); }} /></View>
            <View style={st.flex}><Button label={busy ? 'Adding…' : 'Add team & invite captain'} disabled={busy} onPress={() => void createNew()} /></View>
          </View>
        </View>
      ) : (
        <TouchableOpacity accessibilityRole="button" onPress={() => { setAdding(true); setName(q.trim()); }}>
          <Text style={st.link}>+ New team (not on SportnNote yet)</Text>
        </TouchableOpacity>
      )}

      {invites.map((iv) => (
        <View key={iv.teamId} style={st.invite}>
          <Text style={textStyles.body}>Invite {iv.captainName} to captain {iv.teamName} and add the players:</Text>
          <View style={st.row}>
            <View style={st.flex}><Button label="💬 WhatsApp" variant="ghost" onPress={() => openWhatsApp(iv.phone, message(iv))} /></View>
            <View style={st.flex}><Button label="✉️ SMS" variant="ghost" onPress={() => openSms(iv.phone, message(iv))} /></View>
          </View>
          <Text style={textStyles.muted}>Team code {iv.code} — players can join with it too.</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  newBox: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt },
  invite: { gap: theme.spacing(1.5), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  link: { color: theme.colors.primary, fontWeight: '700' },
});
