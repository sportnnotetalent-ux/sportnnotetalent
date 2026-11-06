/**
 * Cricket round 2 — the WhatsApp share card UI (shareCard.ts builds the text).
 *   - CricketShareCard: for the SUMMARY tab — the end-of-innings card once the
 *     first innings is over, the result card once the match ends (a chip picks
 *     between them), a preview, and one Share button.
 *   - ShareOverButton: for the COMMENTARY tab's over blocks — "Share over"
 *     sends that over's card (optional).
 * Both share through core/share.ts `shareMessage` (the system sheet; WhatsApp
 * first on the desktop web). Not wired into a screen here — see
 * docs/sport-depth/deep-wave/cricket-round2.md, "Needs wiring".
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { shareMessage } from '../../core/share';
import { Button, SelectChip } from '../../components/ui';
import type { CricketState } from './engine';
import { shareStages, shareCardText, overShareText, previewText, type ShareStage, type ShareCardOpts, type OverRef } from './shareCard';

const STAGE_LABEL: Record<ShareStage, string> = { innings1: 'End of 1st innings', result: 'Result' };

export function CricketShareCard({ state, homeName, awayName, matchId, tournamentName, potmName, resultLine }: {
  state: unknown;
  homeName: string;
  awayName: string;
  matchId?: string;
  tournamentName?: string;
  potmName?: string;
  /** a match closed by hand: its final word */
  resultLine?: string;
}) {
  const s = state as CricketState;
  const mask = useMask();
  const [pick, setPick] = useState<ShareStage | null>(null);
  const stages = shareStages(s);
  if (!stages.length) return null;
  const stage = pick && stages.includes(pick) ? pick : stages[stages.length - 1];
  // IDs-only scoring: players named by id as this sharer may see them.
  const opts: ShareCardOpts = { homeName, awayName, matchId, tournamentName, potmName, resultLine, nameOf: mask.nameOf };
  const text = shareCardText(s, stage, opts);
  return (
    <View style={st.card} accessibilityLabel="Share card">
      <Text style={st.title}>📤 Share the {stage === 'result' ? 'result' : 'innings'}</Text>
      {stages.length > 1 ? (
        <View style={st.chips}>
          {stages.map((k) => <SelectChip key={k} label={STAGE_LABEL[k]} active={stage === k} onPress={() => setPick(k)} />)}
        </View>
      ) : null}
      <View style={st.preview}>
        <Text style={st.previewText} selectable>{previewText(text)}</Text>
      </View>
      <Button variant="primary" label="Share on WhatsApp / chat" onPress={() => void shareMessage(text, 'match')} />
    </View>
  );
}

/** "Share over" for one over block of the commentary (newest over first there). */
export function ShareOverButton({ state, over, homeName, awayName, matchId, tournamentName }: {
  state: unknown;
  over: OverRef;
  homeName: string;
  awayName: string;
  matchId?: string;
  tournamentName?: string;
}) {
  const s = state as CricketState;
  const mask = useMask();
  const share = () => {
    const text = overShareText(s, over, { homeName, awayName, matchId, tournamentName, nameOf: mask.nameOf });
    // (players by id through `nameOf`; a legacy log's stored names — a disputed one is masked)
    if (text) void shareMessage(mask.text(text), 'match');
  };
  return <Button label="Share over" variant="ghost" style={st.btn} accessibilityLabel={`Share over ${over.over}`} onPress={share} />;
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  preview: { padding: theme.spacing(3), borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt },
  previewText: { color: theme.colors.text, fontSize: theme.font.small, lineHeight: 20 },
  btn: { paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3) },
});
