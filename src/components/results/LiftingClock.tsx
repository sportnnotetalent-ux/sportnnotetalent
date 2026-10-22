/** Round 2 (precision-strength) — the weightlifting competition clock on the
 *  entry screen (NextLiftCard): 1 minute an attempt, 2 minutes when the lifter
 *  follows themself, a warning at 30 s, "time" at 0. The official starts it
 *  when the lifter is called and stops it when the bar leaves the platform. A
 *  scorer aid only: nothing is saved and no decision follows from it (pure
 *  rules in data/results/liftingClock.ts). Resets when the next lifter is
 *  called (`callKey`). */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { clockView, clockText, type ClockPhase } from '../../data/results';

export function LiftingClock({ seconds, consecutive, callKey }: { seconds: number; consecutive: boolean; callKey: string }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stopped, setStopped] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // a new call (lifter / attempt / weight) resets the clock
  useEffect(() => { setStartedAt(null); setStopped(null); }, [callKey]);
  const v = clockView(seconds, startedAt, now, stopped);
  // ticks while running (and the warning) — not once time is up or stopped
  const running = startedAt != null && stopped == null && v.phase !== 'over';
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  const start = () => { const t = Date.now(); setStartedAt(t); setStopped(null); setNow(t); };
  const stop = () => { if (startedAt != null) setStopped(Math.max(0, seconds - (Date.now() - startedAt) / 1000)); };
  const reset = () => { setStartedAt(null); setStopped(null); };
  const tone: Record<ClockPhase, object> = { idle: st.idle, running: st.run, warn: st.warn, over: st.over, stopped: st.idle };
  return (
    <View style={st.wrap} accessibilityLiveRegion={v.phase === 'warn' || v.phase === 'over' ? 'polite' : 'none'}>
      <View style={[st.face, tone[v.phase]]} accessible accessibilityLabel={`Clock ${v.text}${v.note ? `. ${v.note}` : ''}`}>
        <Text style={[st.time, (v.phase === 'warn' || v.phase === 'over') && { color: theme.colors.onFill }]}>⏱ {v.text}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={st.label} numberOfLines={1}>{consecutive ? `${clockText(seconds)} — consecutive attempt` : `${clockText(seconds)} for this attempt`}</Text>
        {v.note ? <Text style={[st.note, v.phase === 'over' && { color: theme.colors.danger }]} numberOfLines={2}>{v.note}</Text> : null}
      </View>
      {v.phase === 'idle' ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Start the clock" onPress={start} style={st.btn}><Text style={st.btnTxt}>Start</Text></TouchableOpacity>
      ) : running ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Stop the clock (the bar left the platform)" onPress={stop} style={st.btn}><Text style={st.btnTxt}>Stop</Text></TouchableOpacity>
      ) : (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reset the clock" onPress={reset} style={st.btn}><Text style={st.btnTxt}>Reset</Text></TouchableOpacity>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  face: { minWidth: 92, minHeight: 44, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing(2), borderWidth: 1, borderColor: theme.colors.border },
  idle: { backgroundColor: theme.colors.surfaceAlt },
  run: { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary },
  warn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  over: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  time: { color: theme.colors.text, fontWeight: '900', fontSize: theme.font.h3, fontVariant: ['tabular-nums'] },
  label: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  note: { color: theme.colors.text, fontSize: theme.font.tiny, fontWeight: '800' },
  btn: { minHeight: 44, minWidth: 64, paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.primary },
  btnTxt: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.small },
});
