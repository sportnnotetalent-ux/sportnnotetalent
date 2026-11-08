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
import { SideName } from './SideName';

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
          {/* LS2: each sport's clock keeps its own colours on a light pill */}
          {clockNode ? <View style={s.clockPill}>{clockNode}</View> : null}
        </View>
      ) : null}
      {due ? <Text style={s.due} accessibilityRole="alert">⏱ {due}</Text> : null}
      {rows.map((r) => (
        <View key={r.side} style={[s.row, r.active && s.rowActive]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.flash, { opacity: flash[r.side] }]} />
          <View style={[s.dot, { backgroundColor: r.side === 'home' ? homeColor : awayColor }]} />
          <View style={s.nameCol}>
            <SideName name={r.name} style={[s.name, r.active && s.nameActive]} />
            {r.who ? <Text style={s.who} numberOfLines={1}>{icon ? `${icon} ` : ''}{r.who}</Text> : null}
          </View>
          <Text style={[s.score, r.active && s.scoreActive]} numberOfLines={1} maxFontSizeMultiplier={1.5}>{r.score}</Text>
        </View>
      ))}
      {last ? (
        <View style={s.lastStrip}>
          <Text style={s.last} numberOfLines={1}><Text style={s.lastLabel}>LAST · </Text>{last}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Stitch pick 1 (stitch-live-scoring.md): the green score panel — cream names,
// white scores, the status in lime, the side in play on a lime band (LS1/LS3)
const s = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.primaryDark, borderBottomLeftRadius: theme.radius.md, borderBottomRightRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(4), paddingTop: theme.spacing(2), paddingBottom: theme.spacing(2), gap: theme.spacing(1), ...theme.shadow.card,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  status: { flexShrink: 1, color: theme.colors.lime, fontSize: theme.font.small, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  clockPill: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing(2), paddingVertical: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(1.5), overflow: 'hidden',
  },
  rowActive: { backgroundColor: theme.colors.lime },
  flash: { backgroundColor: theme.colors.lime, borderRadius: theme.radius.sm },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.heroText },
  nameCol: { flex: 1, minWidth: 0 },
  name: { color: theme.colors.heroText, fontWeight: '700' },
  nameActive: { color: theme.colors.onLime, fontWeight: '800' },
  who: { color: theme.colors.onLime, fontSize: theme.font.small, fontWeight: '700' },
  score: { color: '#FFFFFF', fontFamily: theme.fonts.numeral, fontSize: theme.font.h1, minWidth: 56, textAlign: 'right', fontVariant: ['tabular-nums'] },
  scoreActive: { color: theme.colors.onLime },
  due: {
    alignSelf: 'center', color: theme.colors.onFill, backgroundColor: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800',
    paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(1), borderRadius: theme.radius.pill, overflow: 'hidden',
  },
  lastStrip: { marginTop: theme.spacing(1), marginHorizontal: -theme.spacing(4), paddingHorizontal: theme.spacing(4), paddingTop: theme.spacing(1.5), borderTopWidth: 1, borderTopColor: 'rgba(243,240,232,0.18)' },
  last: { color: theme.colors.heroText, fontSize: theme.font.small },
  lastLabel: { color: theme.colors.lime, fontWeight: '800' },
});
