/**
 * Cue sports (snooker, English billiards) — the screen pieces both sports'
 * controls and Stats tab share: the toss row, the quick frame-score form,
 * the frame options (concede / award), the frame-by-frame sheet and the
 * break list. Display only: every number comes from the sport's pure
 * modules; every tap is an action its builders made (or null = disabled).
 * Plain words, big targets, accessibility labels, no sideways scroll at 375 px.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip } from '../../components/ui';
import { useKeyboardFocus } from '../../components/keyboard';
import type { ScoreAction } from '../types';

type Side = 'home' | 'away';
type Act = ScoreAction | null;
const SIDES: Side[] = ['home', 'away'];

/** Who breaks off: the current breaker is marked; the other dispatches. */
export function TossRow({ names, breaker, toss, first, onTap }: {
  names: { home: string; away: string };
  breaker: Side;
  toss: { home: Act; away: Act };
  /** frame 1: the toss (later frames alternate from it) */
  first: boolean;
  onTap: (a: Act) => void;
}) {
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={cue.label}>Who breaks off? <Text style={cue.meta}>{first ? '(the toss · then it alternates)' : '(this frame only)'}</Text></Text>
      <View style={cue.row}>
        {SIDES.map((sd) => (
          <Button key={sd} label={names[sd]} variant={breaker === sd ? sd : 'ghost'} style={cue.flex} selected={breaker === sd}
            accessibilityLabel={`${names[sd]} breaks off`} onPress={() => onTap(toss[sd])} />
        ))}
      </View>
    </View>
  );
}

export type ScoreCheck = { ok: true; home: number; away: number; warn?: string } | { ok: false; error: string };

/** Quick mode: the frame's final score in two number fields. */
export function FrameScoreForm({ title, names, check, onSave, saveLabel, hint }: {
  title: string;
  names: { home: string; away: string };
  check: (home: string, away: string) => ScoreCheck;
  onSave: (home: number, away: number, warn?: string) => Promise<boolean>;
  saveLabel: string;
  hint?: string;
}) {
  const [h, setH] = useState('');
  const [a, setA] = useState('');
  const kbH = useKeyboardFocus();
  const kbA = useKeyboardFocus();
  const touched = h !== '' || a !== '';
  const res = check(h, a);
  const save = async () => {
    if (!res.ok) return;
    if (await onSave(res.home, res.away, res.warn)) { setH(''); setA(''); }
  };
  return (
    <View style={cue.box}>
      <Text style={cue.label}>{title}</Text>
      {hint ? <Text style={cue.meta}>{hint}</Text> : null}
      <View style={cue.row}>
        {([['h', names.home, h, setH, kbH], ['a', names.away, a, setA, kbA]] as const).map(([k, n, v, set, kb]) => (
          <View key={k} style={cue.flex}>
            <Text style={cue.meta} numberOfLines={1}>{n}</Text>
            <TextInput style={cue.input} value={v} onChangeText={(t) => set(t.replace(/[^0-9]/g, '').slice(0, 6))} keyboardType="number-pad"
              placeholder="0" placeholderTextColor={theme.colors.textMuted} accessibilityLabel={`${n}'s score`} {...kb} />
          </View>
        ))}
      </View>
      {touched && !res.ok ? <Text style={cue.bad} accessibilityLiveRegion="polite">{res.error}</Text> : null}
      {res.ok && res.warn ? <Text style={cue.warn} accessibilityLiveRegion="polite">{res.warn}</Text> : null}
      <Button label={saveLabel} disabled={!res.ok} onPress={() => void save()} />
    </View>
  );
}

/** Concede / award (the referee), with the reasons the engine records. */
export function FrameOptionsPanel({ names, unit, concede, award, reasons, send, extra }: {
  names: { home: string; away: string };
  unit: 'frame' | 'game';
  concede: { home: Act; away: Act };
  award: (side: Side, reason?: string) => Act;
  reasons: Array<{ key: string; label: string }>;
  send: (a: Act) => void;
  /** more buttons (snooker's re-rack, billiards' TIME) */
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [winner, setWinner] = useState<Side | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Button label={open ? `Hide ${unit} options` : `${cap(unit)} options: concede, award${extra ? ', more' : ''}`} variant="ghost" onPress={() => setOpen((v) => !v)} />
      {open ? (
        <View style={cue.box}>
          <Text style={cue.label}>Concede the {unit}</Text>
          <View style={cue.row}>
            {SIDES.map((sd) => (
              <Button key={sd} label={`${names[sd]} concedes`} variant="ghost" style={cue.flex} disabled={!concede[sd]}
                accessibilityLabel={`${names[sd]} concedes the ${unit}`} onPress={() => send(concede[sd])} />
            ))}
          </View>
          <Text style={cue.label}>Award the {unit} <Text style={cue.meta}>(the referee)</Text></Text>
          <View style={cue.chips}>
            {SIDES.map((sd) => (
              <SelectChip key={sd} label={`To ${names[sd]}`} active={winner === sd} onPress={() => setWinner(winner === sd ? null : sd)}
                accessibilityLabel={`Award the ${unit} to ${names[sd]}`} />
            ))}
          </View>
          <View style={cue.chips}>
            {reasons.map((r) => (
              <SelectChip key={r.key} label={r.label} active={reason === r.key} onPress={() => setReason(reason === r.key ? null : r.key)} accessibilityLabel={`Reason: ${r.label}`} />
            ))}
          </View>
          <Button label={winner ? `Award the ${unit} to ${names[winner]}` : `Pick who gets the ${unit}`} variant="danger" disabled={!winner || !award(winner, reason ?? undefined)}
            onPress={() => { if (winner) send(award(winner, reason ?? undefined)); }} />
          {extra}
        </View>
      ) : null}
    </View>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export interface SheetRow {
  n: number;
  breaker: Side | null;
  score: [number, number];
  winner: Side | 'draw' | null;
  how: string;
  high: { home: number; away: number } | null;
  quick: boolean;
  live: boolean;
  reracks?: number;
  raw?: [number, number];
}

/** The frame-by-frame sheet: one card row per frame (reads at 375 px). */
export function FrameSheet({ rows, names, unit, homeColor, awayColor }: {
  rows: SheetRow[];
  names: { home: string; away: string };
  unit: 'frame' | 'game';
  homeColor?: string;
  awayColor?: string;
}) {
  const color = (sd: Side) => (sd === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  if (!rows.length) return null;
  return (
    <View style={cue.card}>
      <Text style={cue.cardTitle}>{cap(unit)} by {unit}</Text>
      {rows.map((r) => {
        const [h, a] = r.score;
        const won = r.winner === 'draw' ? 'Drawn' : r.winner ? `${names[r.winner]} won` : 'In play';
        const detail = [
          r.breaker ? `${names[r.breaker]} broke off` : '',
          r.high ? `best breaks ${r.high.home} / ${r.high.away}` : 'score only',
          r.raw ? `scored ${r.raw[0]}–${r.raw[1]}` : '',
          r.reracks ? `re-racked ×${r.reracks}` : '',
        ].filter(Boolean).join(' · ');
        return (
          <View key={r.n} style={cue.sheetRow} accessibilityLabel={`${cap(unit)} ${r.n}: ${names.home} ${h}, ${names.away} ${a}. ${won}${r.how ? `, ${r.how}` : ''}. ${detail}`}>
            <View style={cue.sheetHead}>
              <Text style={cue.sheetN}>{r.n}</Text>
              <Text style={cue.sheetScore} numberOfLines={1}>{h}–{a}</Text>
              <Text style={[cue.sheetWon, r.winner === 'home' || r.winner === 'away' ? { color: color(r.winner) } : null]} numberOfLines={1}>
                {won}{r.how && r.how !== 'in play' ? ` · ${r.how}` : ''}
              </Text>
            </View>
            <Text style={cue.meta} numberOfLines={2}>{detail}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** The break list: biggest first, with a floor chip (20+ / 50+ / 100+). */
export function BreakList({ list, chips, min, onMin, names, unit, homeColor, awayColor }: {
  list: Array<{ side: Side; frame: number; pts: number }>;
  chips: number[];
  min: number;
  onMin: (n: number) => void;
  names: { home: string; away: string };
  unit: 'frame' | 'game';
  homeColor?: string;
  awayColor?: string;
}) {
  const color = (sd: Side) => (sd === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  return (
    <View style={cue.card}>
      <Text style={cue.cardTitle}>Breaks</Text>
      <View style={[cue.chips, { paddingHorizontal: theme.spacing(2) }]}>
        {chips.map((c) => <SelectChip key={c} label={`${c}+`} active={min === c} onPress={() => onMin(c)} accessibilityLabel={`Breaks of ${c} or more`} />)}
      </View>
      {list.length === 0 ? <Text style={[cue.meta, { padding: theme.spacing(2) }]}>No breaks of {min} or more yet.</Text> : list.map((b, i) => (
        <View key={`${b.frame}-${b.side}-${b.pts}-${i}`} style={cue.breakRow} accessibilityLabel={`${b.pts} by ${names[b.side]}, ${unit} ${b.frame}`}>
          <Text style={cue.breakPts}>{b.pts}</Text>
          <View style={[cue.dot, { backgroundColor: color(b.side) }]} />
          <Text style={cue.breakWho} numberOfLines={1}>{names[b.side]}</Text>
          <Text style={cue.meta}>{unit} {b.frame}</Text>
        </View>
      ))}
    </View>
  );
}

export const cue = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  bad: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  warn: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  box: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  banner: { gap: theme.spacing(2), borderWidth: 2, borderColor: theme.colors.accent, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  input: {
    color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800', textAlign: 'center', minHeight: 48,
    borderWidth: 1, borderColor: theme.colors.inputBorder, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface,
  },
  card: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, overflow: 'hidden', gap: theme.spacing(1), paddingBottom: theme.spacing(2) },
  cardTitle: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', padding: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt },
  sheetRow: { paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border, gap: 2 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  sheetN: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', width: 20 },
  sheetScore: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', minWidth: 64 },
  sheetWon: { flex: 1, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(1) },
  breakPts: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '900', minWidth: 40, textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  breakWho: { flex: 1, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
});
