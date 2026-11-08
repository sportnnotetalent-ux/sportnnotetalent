/** The one "describe the last play" card for every sport (wave 2,
 *  docs/security/breaks/describe-card.md; the racket card, describe-done.md, is
 *  the model). The sport's chips go inside; under them the "✓ summary" line and
 *  a full-width Done (Skip when nothing is picked). Done greys it to
 *  "✓ Saved · … Edit"; Skip hides it; the next play (a new key) opens fresh.
 *  The marks live in the parent (`useDescribeMarks`), so a card that unmounts
 *  between plays still remembers (CD3). Done / Edit only change what is shown —
 *  each sport saves its taps as they happen (CD5). */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button } from './ui';
import { FadeInLine } from './pressFeedback';
import { panelMode, doneLabel, type PanelMark, type PanelMode, type PlayKey } from '../sports/describePanel';

export function useDescribeMarks<K extends PlayKey = PlayKey>() {
  const [marks, setMarks] = useState<Map<K, PanelMark>>(() => new Map());
  const mark = useCallback((key: K, m: PanelMark | null) => setMarks((prev) => {
    const next = new Map(prev);
    if (m) next.set(key, m); else next.delete(key);
    return next;
  }), []);
  return { modeOf: (key: K): PanelMode => panelMode(key, marks), mark };
}

export function DescribeCard({ title, summary, mode, onDone, onSkip, onEdit, children, right }: {
  /** "Last point · Ravi", "Last goal · Red House" … */
  title: string;
  /** what has been picked so far ('' = nothing) */
  summary: string;
  mode: PanelMode;
  onDone: () => void;
  onSkip: () => void;
  onEdit: () => void;
  children?: React.ReactNode;
  /** an optional link on the title row (e.g. "Choose" extra stats) */
  right?: React.ReactNode;
}) {
  if (mode === 'hidden') return null;
  if (mode === 'saved') {
    return (
      <View style={[st.box, st.saved]}>
        <View style={st.head}>
          <Text style={[st.meta, st.flex]} numberOfLines={2}>✓ Saved · {summary || 'nothing picked'}</Text>
          <Text style={st.link} onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit the description">Edit</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={st.box} accessibilityLabel="Describe the last play">
      <View style={st.head}>
        <Text style={st.label} numberOfLines={1}>{title}</Text>
        {right}
      </View>
      {children}
      {summary ? <FadeInLine id={summary}><Text style={st.meta}>✓ {summary}</Text></FadeInLine> : null}
      <Button label={doneLabel(summary)} variant="ghost" style={st.done}
        accessibilityLabel={summary ? 'Done describing' : 'Skip describing'} onPress={summary ? onDone : onSkip} />
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  saved: { opacity: 0.7 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  label: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small, flexShrink: 1 },
  flex: { flex: 1 },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(2) },
  done: { alignSelf: 'stretch' },
});
