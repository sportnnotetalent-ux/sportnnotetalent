/** Organiser's choice: what every player's age needs for this tournament
 *  (verification fast lanes, Phase 3 — docs/verification/fast-lanes.md).
 *  Saves on tap; enforced where players are picked for its matches. */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { theme } from '../core/theme';
import { FieldLabel, FormError, SelectChip, textStyles } from './ui';
import { AGE_REQUIREMENT_LABEL, type AgeRequirement } from '../core/eligibility';
import { setTournamentAgeVerification } from '../data/repos';

const OPTIONS: AgeRequirement[] = ['none', 'confirmed', 'verified'];

export function AgeRequirementSetting({ tournamentId, value }: { tournamentId: string; value?: AgeRequirement }) {
  const [req, setReq] = useState<AgeRequirement>(value ?? 'none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setReq(value ?? 'none'), [value]);

  const pick = async (next: AgeRequirement) => {
    if (next === req || busy) return;
    const prev = req;
    setReq(next); setBusy(true); setError(null); setSaved(false);
    try { await setTournamentAgeVerification(tournamentId, next); setSaved(true); }
    catch (e) { setReq(prev); setError(e instanceof Error ? e.message : 'Couldn’t save — try again.'); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <FieldLabel>Players’ age</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) }}>
        {OPTIONS.map((o) => (
          <SelectChip key={o} label={o === 'none' ? 'Not required' : o === 'confirmed' ? 'Confirmed' : 'Verified'} active={req === o} onPress={() => void pick(o)} />
        ))}
      </View>
      <Text style={textStyles.muted}>
        {AGE_REQUIREMENT_LABEL[req]}.{req !== 'none' ? ' Players who don’t meet it can’t be picked for this tournament’s matches — schools can confirm a whole squad at once from their organisation page.' : ' Age groups still use the date of birth players entered.'}
        {saved ? ' ✓ Saved' : ''}
      </Text>
      <FormError message={error} />
    </View>
  );
}
