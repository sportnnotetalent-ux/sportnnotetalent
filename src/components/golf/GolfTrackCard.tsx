/** Deep wave — golf "Stats to track" on the scorecard: strokes only by default;
 *  each optional stat adds a row on the hole card. The organiser sets it for
 *  every marker in the round (round format); without that, each marker's phone
 *  remembers its own. Collapsed to one line until "Change" is tapped. */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip, textStyles } from '../ui';
import { GOLF_TRACK_KEYS, type DistUnit, type GolfTrackKey, type Hole } from '../../sports/golf/engine';
import { GOLF_TRACK_LABEL, cleanTrack, trackHint } from '../../sports/golf/track';

export function GolfTrackCard({ track, roundTrack, isHost, holes, driveHoles, onRound, onPhone, unit = 'yd', onUnit }: {
  /** what this marker tracks now */
  track: GolfTrackKey[];
  /** the round's own setting (null = none: the phone decides) */
  roundTrack: GolfTrackKey[] | null;
  isHost: boolean;
  holes: Hole[];
  driveHoles: number[];
  /** organiser: save for the round (every marker) */
  onRound: (track: GolfTrackKey[], driveHoles: number[]) => void;
  /** a marker: save on this phone */
  onPhone: (track: GolfTrackKey[]) => void;
  /** Round 2 — the round's distance unit (yards by default) */
  unit?: DistUnit;
  /** Round 2 — organiser: switch the round to yards / metres */
  onUnit?: (unit: DistUnit) => void;
}) {
  const [open, setOpen] = useState(false);
  const editable = isHost || !roundTrack;
  const save = (next: GolfTrackKey[], dh = driveHoles) => (isHost ? onRound(cleanTrack(next), dh) : onPhone(cleanTrack(next)));
  const toggle = (k: GolfTrackKey) => {
    const on = track.includes(k);
    // first-putt length and up and downs need putts; switching putts off drops them too
    const next = on ? track.filter((x) => x !== k && !(k === 'putts' && (x === 'firstPutt' || x === 'upDown'))) : [...track, k];
    save(next);
  };
  const who = roundTrack ? (isHost ? 'for every marker in this round' : 'set by the organiser') : isHost ? 'for every marker in this round' : 'on this phone';
  const summary = track.length ? track.map((k) => GOLF_TRACK_LABEL[k].label).join(' · ') : 'strokes only (fastest)';
  const long = holes.filter((h) => h.par >= 4);
  return (
    <View style={st.card}>
      <View style={st.head}>
        <Text style={[textStyles.body, st.bold, { flex: 1 }]} numberOfLines={2}>⚙️ Stats to track: <Text style={st.sum}>{summary}</Text></Text>
        <Text style={st.link} accessibilityRole="button" onPress={() => setOpen(!open)}>{open ? 'Done' : editable ? 'Change' : 'Why?'}</Text>
      </View>
      {open && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.muted}>Strokes are always kept. Each stat adds one row on the hole card — {who}.</Text>
          <View style={st.chips}>
            {GOLF_TRACK_KEYS.map((k) => (
              <SelectChip key={k} label={GOLF_TRACK_LABEL[k].label} active={track.includes(k)} disabled={!editable} onPress={() => toggle(k)}
                accessibilityLabel={`${GOLF_TRACK_LABEL[k].label}: ${trackHint(k, unit)}`} />
            ))}
          </View>
          {track.map((k) => <Text key={k} style={st.hint}>• {GOLF_TRACK_LABEL[k].label}: {trackHint(k, unit)}</Text>)}
          {/* Round 2 — yards (default) or metres, for every marker in the round */}
          {(track.includes('drive') || track.includes('firstPutt')) && (isHost && onUnit ? (
            <View style={st.chips}>
              <Text style={st.hint}>Distances in</Text>
              <SelectChip label="Yards" active={unit === 'yd'} onPress={() => unit !== 'yd' && onUnit('yd')} accessibilityLabel="Distances in yards" />
              <SelectChip label="Metres" active={unit === 'm'} onPress={() => unit !== 'm' && onUnit('m')} accessibilityLabel="Distances in metres" />
            </View>
          ) : unit === 'm' ? <Text style={st.hint}>Distances are in metres (set by the organiser).</Text> : null)}
          {track.includes('drive') && isHost && long.length > 0 && (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={st.hint}>Measured holes (the PGA TOUR measures two, played in opposite directions). None picked = any par 4 / 5.</Text>
              <View style={st.chips}>
                {long.map((h) => {
                  const on = driveHoles.includes(h.n);
                  return <SelectChip key={h.n} label={`${h.n}`} active={on} accessibilityLabel={`Measure the drive on hole ${h.n}`}
                    onPress={() => save(track, on ? driveHoles.filter((x) => x !== h.n) : [...driveHoles, h.n].sort((a, b) => a - b))} />;
                })}
              </View>
            </View>
          )}
          {track.includes('drive') && !isHost && driveHoles.length > 0 && <Text style={st.hint}>Drives are measured on holes {driveHoles.join(' and ')}.</Text>}
          {!editable && <Text style={st.hint}>The organiser chose these for every marker, so every card in the round is kept the same way.</Text>}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  bold: { fontWeight: '800' },
  sum: { fontWeight: '600', color: theme.colors.textMuted },
  link: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small, paddingHorizontal: theme.spacing(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
