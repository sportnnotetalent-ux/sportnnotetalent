/** Pick the PEOPLE on an individual-sport side — one player (singles) or two
 *  partners (doubles) — the way people are picked everywhere (PersonPicker):
 *  search SportnNote by name or mobile number and pick the real person; a new
 *  number is added & invited (they claim it by signing up with that number);
 *  only as a last resort a typed name, marked "name only" (not linked to anyone).
 *  A one-tap "Me" when the caller passes `resolveMe`. Singles is added as soon
 *  as the player is picked; a pair once both partners are in (one more tap). */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, FormError, SelectChip, textStyles } from './ui';
import { PersonPicker } from './PersonPicker';
import { entrantProblem, takenIds, type EntrantPerson, type EntrantSlot } from '../data/participantEntry';
import type { SportId } from '../core/types';

export function EntrantPicker({ count, sport, inviteText, onSubmit, submitLabel = '＋ Create team', resolveMe, meName, initial }: {
  /** 1 = a singles player, 2 = a doubles pair */
  count: 1 | 2;
  sport: SportId;
  /** the WhatsApp / SMS text for someone added by a number that isn't on SportnNote */
  inviteText: (name?: string) => string;
  /** add the side; true when it worked (the picker then starts over) */
  onSubmit: (slots: EntrantSlot[]) => Promise<boolean>;
  /** the pair's add button */
  submitLabel?: string;
  /** one-tap "Me": the signed-in user's player (made if missing), or null */
  resolveMe?: () => Promise<EntrantPerson | null>;
  meName?: string;
  /** doubles: partner 1 already chosen (a person picked from the pair search,
   *  or "Me +") — the picker asks for partner 2 */
  initial?: EntrantPerson;
}) {
  const [slots, setSlots] = useState<(EntrantSlot | null)[]>(() =>
    Array.from({ length: count }, (_, i) => (i === 0 && initial && count === 2 ? { kind: 'person' as const, person: initial } : null)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const active = slots.findIndex((s) => !s);
  const taken = takenIds(slots);
  const meFirst = meName?.trim().split(/\s+/)[0] || 'Me';

  // Fill the next empty spot. Singles: that's the side — add it straight away
  // (a throw tells the PersonPicker to show "try again").
  const fill = async (slot: EntrantSlot) => {
    setError(null);
    if (count === 1) {
      if (!(await onSubmit([slot]))) throw new Error('Could not add the player');
      return;
    }
    setSlots((prev) => {
      const next = [...prev];
      const i = next.findIndex((s) => !s);
      if (i >= 0) next[i] = slot;
      return next;
    });
  };
  const clear = (i: number) => { setError(null); setSlots((prev) => prev.map((s, j) => (j === i ? null : s))); };

  const pickMe = async () => {
    if (!resolveMe || busy) return;
    setBusy(true);
    try {
      const me = await resolveMe();
      if (!me) { setError('Couldn’t add you — try again.'); return; }
      setMeId(me.id);
      if (taken.includes(me.id)) return;
      await fill({ kind: 'person', person: me });
    } catch {
      setError('Couldn’t add you — try again.');
    } finally { setBusy(false); }
  };

  const submit = async () => {
    const problem = entrantProblem(slots, count);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    const ok = await onSubmit(slots as EntrantSlot[]);
    setBusy(false);
    if (ok) setSlots(Array(count).fill(null));
  };

  return (
    <View style={{ gap: theme.spacing(2) }}>
      {slots.map((s, i) => s ? (
        <View key={i} style={st.filled}>
          <Text style={st.filledName} numberOfLines={1}>
            {count === 2 ? `Partner ${i + 1}: ` : ''}{s.kind === 'person' ? `✓ ${s.person.fullName}` : `✎ ${s.name} · name only`}
          </Text>
          <Text style={st.change} accessibilityRole="button" accessibilityLabel={`Change partner ${i + 1}`} onPress={() => clear(i)}>Change</Text>
        </View>
      ) : null)}

      {active >= 0 && (
        <View style={{ gap: theme.spacing(2) }}>
          {count === 2 && <Text style={st.slotLabel}>Partner {active + 1}</Text>}
          {resolveMe && !(meId && taken.includes(meId)) && (
            <View style={st.chips}><SelectChip label={`👤 ${meFirst} (me)`} active={false} onPress={() => void pickMe()} disabled={busy} /></View>
          )}
          {/* keyed by the spot so each partner starts with an empty box */}
          <PersonPicker
            key={active}
            role={count === 2 ? 'partner' : 'player'}
            sport={sport}
            excludeIds={taken}
            takenNote={(n) => `${n} is already on this side.`}
            inviteText={inviteText}
            onPick={(p) => fill({ kind: 'person', person: { id: p.id, fullName: p.fullName } })}
            onNameOnly={(name) => fill({ kind: 'name', name })}
          />
        </View>
      )}

      {slots.some((s) => s?.kind === 'name') && (
        <Text style={textStyles.muted}>
          A name only isn’t linked to anyone — the match won’t reach their SportnNote profile. Pick them by mobile number instead, or add their number later from their player page (Edit) so they can claim it.
        </Text>
      )}
      <FormError message={error} />
      {count === 2 && active < 0 && (
        <Button label={busy ? 'Adding…' : submitLabel} onPress={() => void submit()} disabled={busy} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  slotLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  filled: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(2),
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt,
  },
  filledName: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  change: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
