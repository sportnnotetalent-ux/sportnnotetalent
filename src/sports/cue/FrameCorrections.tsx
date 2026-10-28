/**
 * Cue sports — "Correct this match", a frame at a time (break list A-01).
 * The sport's `CorrectionEditor`: every completed frame with its score; ✎
 * sets a frame's final score. The plan (cue/corrections.ts) voids the frame's
 * rows and turns the row that ended it into that score, so later frames
 * replay as played. Nothing is saved until the screen previews and publishes.
 * The change lines are public (they ride on the AMEND row): scores and frame
 * numbers only, never a name.
 */
import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { theme } from '../../core/theme';
import { Button } from '../../components/ui';
import { useKeyboardFocus } from '../../components/keyboard';
import type { MatchEventRecord, Player } from '../../core/types';
import { effectiveLog, AMEND_TYPE, type AmendOp } from '../amend';
import { frameCorrection, logFrames, type Engine } from './corrections';
import { useSideNames } from './useNames';
import { cue } from './parts';

export interface CorrectionProps {
  log: MatchEventRecord[];
  config?: Record<string, unknown>;
  ops: AmendOp[];
  onOps: (ops: AmendOp[], lines: string[]) => void;
  homeName: string;
  awayName: string;
  homeRoster: Player[];
  awayRoster: Player[];
}

export function FrameCorrections<S>({ log, config, ops, onOps, homeName, awayName, homeRoster, awayRoster, eng, unit, rule }: CorrectionProps & {
  eng: Engine<S>;
  unit: 'frame' | 'game';
  /** the sport's score rule, said when a score is refused */
  rule: string;
}) {
  const names = useSideNames(homeName, awayName, homeRoster, awayRoster);
  const [editing, setEditing] = useState<number | null>(null);
  const [h, setH] = useState('');
  const [a, setA] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<number, string>>({});
  const kbH = useKeyboardFocus();
  const kbA = useKeyboardFocus();
  // the frames as they read with the changes chosen so far
  const staged = ops.length ? effectiveLog([...log, { seq: Math.max(0, ...log.map((r) => r.seq)) + 1, type: AMEND_TYPE, side: null, payload: { ops, lines: [], byName: '', deltas: [] }, attribution: null }]) : log;
  const frames = logFrames(eng, config, staged);
  const Unit = unit === 'game' ? 'Game' : 'Frame';
  const open = (n: number, score: [number, number]) => { setEditing(n); setH(String(score[0])); setA(String(score[1])); setError(null); };
  const save = () => {
    if (editing == null) return;
    const home = Number(h), away = Number(a);
    const plan = /^\d{1,6}$/.test(h) && /^\d{1,6}$/.test(a) ? frameCorrection(eng, config, log, editing, home, away, ops, unit) : null;
    if (!plan) {
      setError(`That score can't be recorded for ${unit} ${editing}. ${rule}`);
      return;
    }
    const next = { ...lines, [editing]: plan.line };
    setLines(next);
    onOps(plan.ops, Object.keys(next).map(Number).sort((x, y) => x - y).map((k) => next[k]));
    setEditing(null);
  };
  if (!frames.length) return <Text style={cue.meta}>No {unit} has finished yet: nothing to correct.</Text>;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={cue.meta}>Set a {unit}'s final score. Its breaks and fouls are replaced by the score; the {unit}s after it stay as played.</Text>
      {frames.map((f) => {
        const won = f.winner === 'draw' ? 'drawn' : `${names[f.winner]} won`;
        return (
          <View key={f.n} style={cue.box}>
            <Text style={cue.label}>{Unit} {f.n} · {names.home} {f.score[0]}–{f.score[1]} {names.away} · {won}{f.quick ? ' · score only' : ''}</Text>
            {editing === f.n ? (
              <View style={{ gap: theme.spacing(2) }}>
                <View style={cue.row}>
                  {([['h', names.home, h, setH, kbH], ['a', names.away, a, setA, kbA]] as const).map(([k, n, v, set, kb]) => (
                    <View key={k} style={cue.flex}>
                      <Text style={cue.meta} numberOfLines={1}>{n}</Text>
                      <TextInput style={cue.input} value={v} onChangeText={(t) => set(t.replace(/[^0-9]/g, '').slice(0, 6))} keyboardType="number-pad"
                        accessibilityLabel={`${n}'s corrected score`} {...kb} />
                    </View>
                  ))}
                </View>
                {error ? <Text style={cue.bad} accessibilityLiveRegion="polite">{error}</Text> : null}
                <View style={cue.row}>
                  <Button label="Use this score" style={cue.flex} onPress={save} />
                  <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} />
                </View>
              </View>
            ) : (
              <Button label={`✎ Change ${unit} ${f.n}`} variant="ghost" accessibilityLabel={`Change the score of ${unit} ${f.n}`} onPress={() => open(f.n, f.score)} />
            )}
          </View>
        );
      })}
      {ops.length ? <Button label="Clear my changes" variant="ghost" onPress={() => { setLines({}); onOps([], []); }} /> : null}
    </View>
  );
}
