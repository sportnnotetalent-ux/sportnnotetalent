/**
 * The racket commentary feed (SD-158 tennis; deep wave: badminton, table
 * tennis, squash, padel, pickleball): blocks per game newest first, the game
 * in play on top and outlined; each block's rows — "<winner> wins the game"
 * with the score, every point (avatar, "Point to <name>", match time, the
 * sentence, a muted detail line, the score called after it), conduct /
 * timeout / let records, change-ends / interval cues and who served the game.
 * Renders the pure blocks of tennis/commentaryModel.ts and
 * racketCommentaryModel.ts; masks names where the viewer may not see them.
 * IDs-only scoring (docs/privacy/ids-only-scoring.md): the rows arrive with
 * names already resolved by player id for this viewer (the models take the
 * screen's `useMask().nameOf`, dispute mask included); `mask.text` still
 * masks a disputed name an older log stored in its text.
 */
import { ensureContrast } from '../core/contrast';
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { useMask } from '../core/disputeMask';
import { avatarInitials } from '../core/minorPrivacy';
import type { CommentaryBlock, CommentaryRow } from './tennis/commentaryModel';

/** Games shown before "Show all". */
const FIRST_BLOCKS = 8;

export function CommentaryFeed({
  blocks, icon, homeColor = theme.colors.home, awayColor = theme.colors.away, emptyText = 'No points yet.',
}: {
  blocks: CommentaryBlock[];
  /** the sport's ball, beside "who is serving" */
  icon: string;
  homeColor?: string;
  awayColor?: string;
  emptyText?: string;
}) {
  const mask = useMask();
  const [all, setAll] = useState(false);
  if (!blocks.length) return <Text style={st.empty}>{emptyText}</Text>;
  const shown = all ? blocks : blocks.slice(0, FIRST_BLOCKS);
  // DR2: a pale team colour is darkened just enough to read on the page
  const color = (side?: 'home' | 'away') => (side === 'home' ? ensureContrast(homeColor, theme.colors.bg) : side === 'away' ? ensureContrast(awayColor, theme.colors.bg) : theme.colors.textMuted);

  const avatar = (name: string, side?: 'home' | 'away') => (
    <View style={[st.avatar, { backgroundColor: color(side) }]} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={st.avatarText}>{avatarInitials(mask.text(name))}</Text>
    </View>
  );
  const row = (r: CommentaryRow, i: number) => {
    switch (r.kind) {
      case 'game':
        return (
          <View key={`g${i}`} style={[st.row, st.gameRow]} accessible accessibilityLabel={`${mask.text(r.text)}, ${r.score}${r.note ? `, ${mask.text(r.note)}` : ''}`}>
            {avatar(r.name, r.side)}
            <View style={st.body}>
              <Text style={st.gameText}>{mask.text(r.text)}</Text>
              {r.note ? <Text style={st.meta}>{mask.text(r.note)}</Text> : null}
            </View>
            <Text style={st.gameScore}>{r.score}</Text>
          </View>
        );
      case 'point':
        return (
          <View key={`p${r.id}`} style={st.row} accessible accessibilityLabel={`${mask.text(r.title)}${r.time ? ` at ${r.time}` : ''}${r.text ? `. ${mask.text(r.text)}` : ''}. ${r.score}`}>
            {avatar(r.name, r.side)}
            <View style={st.body}>
              <Text style={st.title}>{mask.text(r.title)}{r.time ? <Text style={st.time}>  {r.time}</Text> : null}</Text>
              {r.text ? <Text style={[st.text, r.penalty && st.penalty]}>{mask.text(r.text)}</Text> : null}
              {r.meta ? <Text style={st.meta}>{mask.text(r.meta)}</Text> : null}
            </View>
            <Text style={st.score}>{r.score}</Text>
          </View>
        );
      case 'mark':
        return (
          <View key={`m${r.id}`} style={st.row} accessible accessibilityLabel={`${r.text}${r.detail ? `, ${mask.text(r.detail)}` : ''}${r.time ? ` at ${r.time}` : ''}`}>
            <View style={[st.avatar, st.iconBox]}><Text style={st.icon}>{r.icon}</Text></View>
            <View style={st.body}>
              <Text style={[st.text, { color: color(r.side) }]}>{r.text}{r.time ? <Text style={st.time}>  {r.time}</Text> : null}</Text>
              {r.detail ? <Text style={st.meta}>{mask.text(r.detail)}</Text> : null}
            </View>
          </View>
        );
      case 'cue':
        return <Text key={`c${i}`} style={st.cue}>{r.text}</Text>;
      case 'serving':
        return (
          <View key={`s${i}`} style={[st.row, st.servingRow]} accessible accessibilityLabel={`${mask.text(r.text)}${r.time ? ` at ${r.time}` : ''}`}>
            <Text style={st.ball}>{icon}</Text>
            <Text style={st.serving}>{mask.text(r.text)}{r.time ? <Text style={st.time}>  {r.time}</Text> : null}</Text>
          </View>
        );
    }
  };

  return (
    <View style={{ gap: theme.spacing(3) }} accessibilityLabel="Commentary">
      {shown.map((b, bi) => (
        <View key={b.key} style={[st.block, bi === 0 && !b.done && st.live]}>
          <Text style={st.blockTitle}>{b.title}{bi === 0 && !b.done ? '  ·  in play' : ''}</Text>
          {b.rows.map(row)}
        </View>
      ))}
      {blocks.length > shown.length && (
        <Text style={st.more} accessibilityRole="button" onPress={() => setAll(true)}>
          Show all {blocks.length} games
        </Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  block: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2) },
  live: { borderColor: theme.colors.primary },
  blockTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', paddingVertical: theme.spacing(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  gameRow: { borderTopWidth: 0 },
  servingRow: { gap: theme.spacing(2) },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.colors.onFill, fontSize: theme.font.tiny, fontWeight: '900' },
  iconBox: { backgroundColor: theme.colors.surfaceAlt },
  icon: { fontSize: 16 },
  body: { flex: 1, gap: 2 },
  title: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  time: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '600' },
  text: { color: theme.colors.text, fontSize: theme.font.small },
  penalty: { color: theme.colors.danger },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  score: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'right' },
  gameText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  gameScore: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  cue: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', paddingVertical: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border },
  ball: { fontSize: 14, width: 32, textAlign: 'center' },
  serving: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600' },
  more: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingVertical: theme.spacing(3), minHeight: 44 },
});
