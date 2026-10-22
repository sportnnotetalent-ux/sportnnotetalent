/** Deep wave — one player's optional stats row on the hole card (only the
 *  stats being tracked): fairway (par 4 / 5: ◀ L · ✓ · R ▶), greenside bunker,
 *  penalty strokes, the first putt's length (once a putt is entered), the
 *  measured drive in yards, and the derived GIR. Every chip toggles; nothing
 *  is required, so a hole is still one tap on "Par" / − / +. */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip, textStyles } from '../ui';
import { derivedGir, driveYards, PUTT_BUCKETS, type FairwayDir, type GolfCard, type GolfTrackKey, type Hole } from '../../sports/golf/engine';
import { driveMeasuredOn } from '../../sports/golf/track';

export function GolfHoleStats({ card, hole, i, track, driveHoles, canMark, name, onFairway, onBunker, onPenalty, onFirstPutt, onDrive }: {
  card: GolfCard;
  hole: Hole;
  /** the hole's index in the round */
  i: number;
  track: GolfTrackKey[];
  driveHoles: number[];
  canMark: boolean;
  name: string;
  onFairway: (d: FairwayDir) => void;
  onBunker: () => void;
  onPenalty: (by: 1 | -1) => void;
  onFirstPutt: (bucket: number | null) => void;
  onDrive: (yards: number | null) => void;
}) {
  const v = card.strokes[i];
  const pv = card.putts?.[i];
  const has = (k: GolfTrackKey) => track.includes(k);
  const measured = has('drive') && driveMeasuredOn(hole, driveHoles);
  const stored = card.drive?.[i] ?? null;
  const [yd, setYd] = useState(stored != null ? String(stored) : '');
  useEffect(() => { setYd(stored != null ? String(stored) : ''); }, [stored, i]);
  if (typeof v !== 'number') return null;
  const gir = derivedGir(v, pv, hole.par);
  const pen = card.penalties?.[i] ?? 0;
  const fb = card.firstPutt?.[i] ?? null;
  const row = (children: React.ReactNode) => <View style={st.row}>{children}</View>;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {(has('fairway') && hole.par >= 4) || measured ? row(<>
        {has('fairway') && hole.par >= 4 && (<>
          <Text style={textStyles.muted}>FW</Text>
          {(['L', 'hit', 'R'] as FairwayDir[]).map((d) => (
            <SelectChip key={d} label={d === 'L' ? '◀ L' : d === 'R' ? 'R ▶' : '✓'} active={card.firDir?.[i] === d}
              accessibilityLabel={`${name}: fairway ${d === 'L' ? 'missed left' : d === 'R' ? 'missed right' : 'hit'}`}
              onPress={() => canMark && onFairway(d)} />
          ))}
        </>)}
        {measured && (
          <TextInput
            style={[st.input, yd && driveYards(yd) == null ? st.bad : null]}
            value={yd}
            editable={canMark}
            onChangeText={(t) => setYd(t.replace(/[^0-9]/g, '').slice(0, 3))}
            onEndEditing={() => { const n = yd ? driveYards(yd) : null; if (n !== stored && (n != null || !yd)) onDrive(n); }}
            onSubmitEditing={() => { const n = yd ? driveYards(yd) : null; if (n !== stored && (n != null || !yd)) onDrive(n); }}
            placeholder="Drive yd"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            accessibilityLabel={`${name}: measured drive in yards`}
          />
        )}
      </>) : null}
      {has('bunker') || has('penalties') || has('putts') ? row(<>
        {has('bunker') && <SelectChip label="⛱ Bunker" active={card.bunker?.[i] === true} onPress={() => canMark && onBunker()} accessibilityLabel={`${name}: in a greenside bunker`} />}
        {has('penalties') && (<>
          <SelectChip label={`Pen ${pen}`} active={pen > 0} onPress={() => canMark && onPenalty(1)} accessibilityLabel={`${name}: one more penalty stroke, now ${pen}`} />
          {pen > 0 && <SelectChip label="−" active={false} onPress={() => canMark && onPenalty(-1)} accessibilityLabel={`${name}: one penalty stroke fewer`} />}
        </>)}
        {has('putts') && <Text style={[textStyles.muted, gir && st.girHit]}>{gir == null ? 'GIR: add putts' : gir ? 'GIR ✓' : 'GIR ✗'}</Text>}
      </>) : null}
      {has('firstPutt') && typeof pv === 'number' && pv >= 1 ? row(<>
        <Text style={textStyles.muted}>1st putt</Text>
        {PUTT_BUCKETS.map((b, k) => (
          <SelectChip key={b.key} label={b.label} active={fb === k} accessibilityLabel={`${name}: first putt ${b.long}`}
            onPress={() => canMark && onFirstPutt(fb === k ? null : k)} />
        ))}
      </>) : null}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  girHit: { color: theme.colors.primary, fontWeight: '800' },
  input: {
    minWidth: 92, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.inputBorder, color: theme.colors.text,
    borderRadius: theme.radius.sm, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(2), fontSize: theme.font.small,
  },
  bad: { borderColor: theme.colors.danger },
});
