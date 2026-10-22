/**
 * Deep wave (golf · chess · carrom) — a broadcast-style live commentary list:
 * groups in the sport's natural unit (a hole, a move, a game of boards),
 * newest first, each line a plain sentence with the running score after it and
 * the time it was stamped. Display only: the sport's pure feed builder
 * (golf/feed.ts, chess/gameFeed.ts, carrom/feed.ts) derives every item from the
 * event log / card, so a correction re-derives the feed.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { formatTime } from '../../core/time';
import { SelectChip, textStyles } from '../../components/ui';
import type { FeedGroup } from './model';

export type { FeedGroup, FeedItem } from './model';

export function CommentaryFeed({ groups, homeColor, awayColor, empty = 'Nothing yet.', filters, filter, onFilter, title = '🎙 Commentary' }: {
  groups: FeedGroup[];
  homeColor?: string;
  awayColor?: string;
  empty?: string;
  /** optional filter chips (players, games…) */
  filters?: { key: string; label: string }[];
  filter?: string;
  onFilter?: (key: string) => void;
  title?: string | null;
}) {
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  const time = (ms?: number) => (ms ? formatTime(new Date(ms).toISOString()) : '');
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {title ? <Text style={st.title}>{title}</Text> : null}
      {filters && filters.length > 1 ? (
        <View style={st.chips}>
          {filters.map((f) => <SelectChip key={f.key} label={f.label} active={filter === f.key} onPress={() => onFilter?.(f.key)} />)}
        </View>
      ) : null}
      {!groups.some((g) => g.items.length) ? <Text style={textStyles.muted}>{empty}</Text> : groups.filter((g) => g.items.length).map((g) => (
        <View key={g.key} style={st.group}>
          <View style={st.groupHead}>
            <Text style={st.groupTitle}>{g.title}</Text>
            {g.subtitle ? <Text style={st.groupSub} numberOfLines={1}>{g.subtitle}</Text> : null}
          </View>
          {g.items.map((it) => (
            <View key={it.id} style={[st.item, { borderLeftColor: it.side === 'home' ? hc : it.side === 'away' ? ac : theme.colors.border }]}
              accessibilityLabel={`${it.text}${it.sub ? `. ${it.sub}` : ''}${it.score ? `. ${it.score}` : ''}`}>
              <View style={st.itemTop}>
                <Text style={[st.text, it.big && st.big]}>{it.icon ? `${it.icon} ` : ''}{it.text}</Text>
                {it.at ? <Text style={st.time}>{time(it.at)}</Text> : null}
              </View>
              {it.sub ? <Text style={st.sub}>{it.sub}</Text> : null}
              {it.score ? <Text style={st.score}>{it.score}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  group: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.surface },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt },
  groupTitle: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  groupSub: { flex: 1, textAlign: 'right', color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  item: { borderLeftWidth: 3, paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2), gap: 2, borderTopWidth: 1, borderTopColor: theme.colors.border },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2) },
  text: { flex: 1, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  big: { fontWeight: '900' },
  time: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  score: { color: theme.colors.text, fontSize: theme.font.tiny, fontWeight: '800' },
});
