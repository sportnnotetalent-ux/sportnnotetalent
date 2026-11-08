/** Teams for doubles, phase 3 (docs/security/breaks/team-whos-playing.md): before
 *  the first point, a side whose squad is bigger than the number playing picks
 *  its players — a team manager (or the host) taps them; anyone else asks the
 *  team. Until then the side plays as "{Team} Player 1…N" stand-ins, so scoring
 *  never waits (phase 4 maps them to the real players). */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, SelectChip, textStyles } from './ui';
import { canSavePick } from '../core/teamPlay';

export function WhoPlaysCard({ teamName, color, squad, needed, mode, captainName, onSave, onAsk, onAskMember }: {
  teamName: string;
  color?: string;
  squad: { id: string; fullName: string }[];
  needed: number;
  /** pickerFor: 'pick' = a team manager / the host; 'ask' = everyone else */
  mode: 'pick' | 'ask';
  /** who the reminder reaches ('' = nobody leads the team) */
  captainName: string;
  onSave: (ids: string[]) => Promise<void> | void;
  onAsk: () => void;
  onAskMember: (playerId: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [asked, setAsked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < needed ? [...p, id] : p));

  return (
    <View style={[st.box, color ? { borderLeftColor: color } : null]} accessibilityLabel={`Who’s playing for ${teamName}?`}>
      <Text style={st.title}>Who’s playing? · {teamName}</Text>
      {mode === 'pick' ? (
        <>
          <Text style={textStyles.muted}>Pick the {needed} playing for {teamName} ({picked.length} of {needed}).</Text>
          <View style={st.chips}>
            {squad.map((p) => <SelectChip key={p.id} label={p.fullName} active={picked.includes(p.id)} onPress={() => toggle(p.id)} />)}
          </View>
          <Button label={busy ? 'Saving…' : `Save the ${needed} playing`} variant="ghost" disabled={busy || !canSavePick(picked, needed)}
            onPress={async () => { setBusy(true); try { await onSave(picked); } finally { setBusy(false); } }} />
        </>
      ) : (
        <>
          <Text style={textStyles.muted}>Only {teamName}’s captain or admins can pick its {needed} players.</Text>
          {captainName ? (
            <Button label={asked.includes('__leaders') ? `✓ Asked ${captainName} · ask again` : `Ask ${teamName} to pick`} variant="ghost"
              onPress={() => { onAsk(); setAsked((a) => [...a, '__leaders']); }} />
          ) : null}
          <Text style={textStyles.muted}>{captainName ? 'Or ask someone in the squad:' : 'No captain yet — ask someone in the squad:'}</Text>
          <View style={st.chips}>
            {squad.map((p) => (
              <SelectChip key={p.id} label={asked.includes(p.id) ? `✓ ${p.fullName}` : p.fullName} active={asked.includes(p.id)}
                onPress={() => { onAskMember(p.id); setAsked((a) => (a.includes(p.id) ? a : [...a, p.id])); }} />
            ))}
          </View>
        </>
      )}
      <Text style={textStyles.muted}>You can start now — until they’re picked, {teamName} plays as “{teamName} Player 1 / 2”, and their stats move to the real players once picked.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt, borderLeftWidth: 4, borderLeftColor: theme.colors.border },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
