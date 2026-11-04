/** The shared score bar (UI audit step 1, docs/security/breaks/score-bar.md):
 *  fixed above the scoring controls in every sport. The status line, each side
 *  in ink with a colour dot and its score, the side or player in play in a lime
 *  band, and the last thing scored. The row whose score changed flashes. */
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { useReducedMotion } from '../core/a11y';
import { changedSide, dueText, inPlayText, lastAction, scoreBarRows, type InPlay, type Side } from '../core/scoreBar';
import type { ScoreSummary } from '../sports/types';

export function LiveScoreBar({
  summary, homeName, awayName, homeColor, awayColor, inPlay, nameOf, undoText, clockNode, icon,
}: {
  summary: ScoreSummary;
  homeName: string;
  awayName: string;
  homeColor: string;
  awayColor: string;
  inPlay?: InPlay | null;
  nameOf: (id: string) => string | undefined;
  /** the undo label ("Undo: red · break 1") — shown as the last thing scored */
  undoText?: string | null;
  clockNode?: React.ReactNode;
  /** the sport's emoji, in front of who's in play */
  icon?: string;
}) {
  const rows = scoreBarRows(summary, { home: homeName, away: awayName }, inPlay, nameOf);
  const still = useReducedMotion();
  const prev = useRef<Record<Side, string> | null>(null);
  const flash = { home: useRef(new Animated.Value(0)).current, away: useRef(new Animated.Value(0)).current };
  useEffect(() => {
    const now = { home: summary.homeScore, away: summary.awayScore };
    const side = changedSide(prev.current, now);
    prev.current = now;
    if (!side || still) return;
    flash[side].setValue(1);
    Animated.timing(flash[side], { toValue: 0, duration: 700, useNativeDriver: false }).start();
  }, [summary.homeScore, summary.awayScore, still]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = lastAction(undoText);
  const status = [summary.statusLine, summary.detailLine].filter(Boolean).join(' · ');
  const who = inPlayText(inPlay, { home: homeName, away: awayName }, nameOf);
  const due = dueText(inPlay, { home: homeName, away: awayName });
  const label = [status, due, ...rows.map((r) => `${r.name} ${r.score}`), who, last ? `Last: ${last}` : null].filter(Boolean).join('. ');

  return (
    <View style={s.wrap} accessible accessibilityRole="summary" accessibilityLabel={label} accessibilityLiveRegion="polite">
      {status || clockNode ? (
        <View style={s.statusRow}>
          {status ? <Text style={s.status} numberOfLines={1}>{status}</Text> : null}
          {clockNode}
        </View>
      ) : null}
      {due ? <Text style={s.due} accessibilityRole="alert">⏱ {due}</Text> : null}
      {rows.map((r) => (
        <View key={r.side} style={[s.row, r.active && s.rowActive]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.flash, { opacity: flash[r.side] }]} />
          <View style={[s.dot, { backgroundColor: r.side === 'home' ? homeColor : awayColor }]} />
          <View style={s.nameCol}>
            <Text style={[s.name, r.active && s.nameActive]} numberOfLines={2}>{r.name}</Text>
            {r.who ? <Text style={s.who} numberOfLines={1}>{icon ? `${icon} ` : ''}{r.who}</Text> : null}
          </View>
          <Text style={[s.score, r.active && s.scoreActive]} numberOfLines={1} maxFontSizeMultiplier={1.5}>{r.score}</Text>
        </View>
      ))}
      {last ? <Text style={s.last} numberOfLines={1}>Last: {last}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing(4), paddingVertical: theme.spacing(2), gap: theme.spacing(1), ...theme.shadow.card,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2) },
  status: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(1.5), overflow: 'hidden',
  },
  rowActive: { backgroundColor: theme.colors.lime },
  flash: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.inputBorder },
  nameCol: { flex: 1, minWidth: 0 },
  name: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  nameActive: { color: theme.colors.onLime, fontWeight: '800' },
  who: { color: theme.colors.onLime, fontSize: theme.font.small, fontWeight: '700' },
  score: { color: theme.colors.text, fontFamily: theme.fonts.numeral, fontSize: 28, minWidth: 56, textAlign: 'right', fontVariant: ['tabular-nums'] },
  scoreActive: { color: theme.colors.onLime },
  due: {
    alignSelf: 'center', color: theme.colors.onFill, backgroundColor: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800',
    paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(1), borderRadius: theme.radius.pill, overflow: 'hidden',
  },
  last: { color: theme.colors.textMuted, fontSize: theme.font.small, textAlign: 'center' },
});
