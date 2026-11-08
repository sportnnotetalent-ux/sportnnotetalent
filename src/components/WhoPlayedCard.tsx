/** Teams for doubles, phase 4 (docs/security/breaks/team-who-played.md): a side
 *  that played as "{Team} Player 1 / 2" says who they really were — each stand-in
 *  gets a squad member, and every point and stat moves to them (one AMEND). */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, SelectChip, FormError, textStyles } from './ui';

export function WhoPlayedCard({ teamName, color, slots, squad, check, onSave }: {
  teamName: string;
  color?: string;
  /** the stand-ins, in order: id + "{Team} Player n" */
  slots: { id: string; fullName: string }[];
  squad: { id: string; fullName: string }[];
  /** phase 1 checkMapping: null = fine, else why not */
  check: (map: Record<string, string>) => string | null;
  onSave: (map: Record<string, string>) => Promise<void>;
}) {
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = slots.every((s) => !!map[s.id]);
  const why = complete ? check(map) : null;

  return (
    <View style={[st.box, color ? { borderLeftColor: color } : null]} accessibilityLabel={`Who played for ${teamName}?`}>
      <Text style={st.title}>Who played? · {teamName}</Text>
      <Text style={textStyles.muted}>{teamName} played as stand-ins. Say who they were and every point and stat moves to their profiles.</Text>
      {slots.map((slot) => (
        <View key={slot.id} style={st.slot}>
          <Text style={st.slotLabel}>{slot.fullName} was</Text>
          <View style={st.chips}>
            {squad.map((p) => (
              <SelectChip key={p.id} label={p.fullName} active={map[slot.id] === p.id}
                onPress={() => setMap((m) => ({ ...m, [slot.id]: m[slot.id] === p.id ? '' : p.id }))} />
            ))}
          </View>
        </View>
      ))}
      {why ? <Text style={textStyles.muted}>{why}</Text> : null}
      <FormError message={error ?? undefined} />
      <Button label={busy ? 'Moving the stats…' : 'Save who played'} variant="ghost" disabled={busy || !complete || !!why}
        onPress={async () => {
          setBusy(true); setError(null);
          try { await onSave(map); } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t save — try again.'); } finally { setBusy(false); }
        }} />
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt, borderLeftWidth: 4, borderLeftColor: theme.colors.border },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  slot: { gap: theme.spacing(1) },
  slotLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
