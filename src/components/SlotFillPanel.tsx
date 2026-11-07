/** Fill one team slot — shared by Participating teams and the fixture map
 *  (docs/security/breaks/fixture-map.md FM3, slot-fill-existing.md, DR4):
 *  a team already on SportnNote first, as rows that say where they go; or a
 *  brand-new team with its captain (name + mobile, compulsory — PK8), who is
 *  invited to add the players. The server refuses non-organisers (TS3) and a
 *  team that already plays here (SL1). */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, TextField, ListRow, FormError, textStyles } from './ui';
import { PhoneField } from './PhoneField';
import { slotCandidates } from '../core/slots';
import { newTeamProblem } from '../core/teamPick';
import { fillTournamentSlot, nameTournamentSlot } from '../data/repos';
import { inviteCaptain, type CaptainInvite } from '../data/teamCaptain';
import type { SportId, Team } from '../core/types';

export interface SlotFillPanelProps {
  slot: { id: string; name: string };
  sport: SportId;
  /** the sport's teams (candidates) */
  teams: readonly Team[];
  slotIds: ReadonlySet<string>;
  /** teams that already have a game in this tournament */
  inFixtures: ReadonlySet<string>;
  /** after a fill; `invite` when a new team's captain should be sent their link */
  onFilled: (invite?: CaptainInvite) => void;
}

export function SlotFillPanel({ slot, sport, teams, slotIds, inFixtures, onFilled }: SlotFillPanelProps) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [capName, setCapName] = useState('');
  const [capPhone, setCapPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim();
  // a named team from a friendly, or one already entered with no game yet, can take the slot
  const found = slotCandidates(teams, q, { slotIds, inFixtures });

  async function fill(how: { teamId: string } | { name: string }) {
    if (!('teamId' in how)) {
      const why = newTeamProblem(how.name, capName, capPhone);
      if (why) return setError(why);
    }
    setBusy(true); setError(null);
    try {
      if ('teamId' in how) {
        await fillTournamentSlot(slot.id, how.teamId);
        onFilled();
      } else {
        await nameTournamentSlot(slot.id, how.name);
        onFilled(await inviteCaptain(slot.id, how.name.trim(), capName, capPhone, sport));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t fill the slot.');
    } finally { setBusy(false); }
  }

  return (
    <View style={st.box}>
      {/* DR4: the usual case first — a team already on SportnNote */}
      <Text style={textStyles.h3}>Fill {slot.name}</Text>
      <TextField label="Or a team already on SportnNote" value={query} onChange={setQuery} placeholder="Search by name" autoCapitalize="none" />
      {q.length >= 2 && !found.length ? <Text style={textStyles.muted}>No team by that name in this sport.</Text> : null}
      <View style={{ gap: theme.spacing(2) }}>
        {found.map((t) => (
          <ListRow key={t.id} title={t.name} meta={`Put in ${slot.name}`} color={t.colorHex}
            disabled={busy} onPress={() => void fill({ teamId: t.id })}
            accessibilityLabel={`Put ${t.name} in ${slot.name}`} />
        ))}
      </View>
      <Text style={[textStyles.muted, st.or]}>— or a new team —</Text>
      <TextField label="A new team: its name" value={name} onChange={setName} placeholder="e.g. Falcons FC" autoCapitalize="words" />
      <TextField label="Its captain’s name" value={capName} onChange={setCapName} autoCapitalize="words" />
      <PhoneField label="Captain’s mobile" value={capPhone} onChange={setCapPhone} hint="They get an invite to add the team’s players." />
      <FormError message={error} />
      <Button label={busy ? 'Saving…' : `Put “${name.trim() || 'this team'}” in ${slot.name} & invite the captain`} disabled={busy || !name.trim()}
        onPress={() => void fill({ name })} />
    </View>
  );
}

const st = StyleSheet.create({
  box: {
    gap: theme.spacing(2), padding: theme.spacing(3), marginBottom: theme.spacing(3),
    borderWidth: 1.5, borderColor: theme.colors.primary, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface,
  },
  or: { textAlign: 'center', marginTop: theme.spacing(1) },
});
