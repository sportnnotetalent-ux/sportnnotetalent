/**
 * Deep wave (volleyball-kabaddi) — the live commentary feed: grouped by the
 * sport's unit (set / half), newest first, each entry a sentence with the
 * running score, the elapsed minute and broadcast tags. The newest group is
 * open; older ones fold to their header (tap to open). "Key moments" keeps
 * only the big ones (aces, blocks, set points, all-outs, super raids …).
 * Pure data comes from the sport's commentary.ts (feed.ts shapes).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import { keyMoments, type FeedGroup } from './feed';

export function FeedView({
  groups, homeColor = theme.colors.home, awayColor = theme.colors.away, emptyText = 'Nothing yet — commentary appears here as play unfolds.', title = 'Commentary',
}: {
  groups: FeedGroup[];
  homeColor?: string;
  awayColor?: string;
  emptyText?: string;
  title?: string;
}) {
  const [keyOnly, setKeyOnly] = useState(false);
  // groups the viewer opened / closed (the newest is open by default)
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const shown = keyOnly ? keyMoments(groups) : groups;
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  return (
    <View style={st.wrap} accessibilityLabel={title}>
      <View style={st.head}>
        <Text style={st.title}>{title}</Text>
        {total > 0 && <SelectChip label="⭐ Key moments" active={keyOnly} onPress={() => setKeyOnly((v) => !v)} />}
      </View>
      {shown.length === 0 ? (
        <Text style={st.empty}>{keyOnly && total > 0 ? 'No key moments yet.' : emptyText}</Text>
      ) : shown.map((g, gi) => {
        const open = toggled[g.id] ?? gi === 0;
        return (
          <View key={g.id} style={st.group}>
            <Text style={st.groupHead} accessibilityRole="button" accessibilityState={{ expanded: open }}
              accessibilityLabel={`${g.title}${g.sub ? `, ${g.sub}` : ''}, ${g.entries.length} entries — ${open ? 'collapse' : 'expand'}`}
              onPress={() => setToggled((t) => ({ ...t, [g.id]: !open }))}>
              {open ? '▾' : '▸'} {g.title}{g.sub ? <Text style={st.groupSub}>  ·  {g.sub}</Text> : null}
            </Text>
            {open && g.entries.map((e) => {
              const color = e.side === 'home' ? homeColor : e.side === 'away' ? awayColor : theme.colors.textMuted;
              return (
                <View key={e.id} style={st.row} accessible accessibilityLabel={`${e.stamp ? `${e.stamp} ` : ''}${e.text}${e.score ? `, ${e.score}` : ''}${e.tags?.length ? `, ${e.tags.join(', ')}` : ''}`}>
                  <View style={[st.bar, { backgroundColor: color }]} />
                  <Text style={st.stamp} numberOfLines={1}>{e.stamp ?? ''}</Text>
                  <Text style={st.icon}>{e.icon}</Text>
                  <View style={st.body}>
                    <Text style={[st.text, e.key && st.textKey]}>{e.text}</Text>
                    {e.detail ? <Text style={st.detail}>{e.detail}</Text> : null}
                    {e.tags?.length ? (
                      <View style={st.tags}>
                        {e.tags.map((t) => <Text key={t} style={[st.tag, { borderColor: color }]}>{t}</Text>)}
                      </View>
                    ) : null}
                  </View>
                  {e.score ? <Text style={st.score}>{e.score}</Text> : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  group: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2) },
  groupHead: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', paddingVertical: theme.spacing(1) },
  groupSub: { color: theme.colors.textMuted, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2), paddingVertical: theme.spacing(1.5), borderTopWidth: 1, borderTopColor: theme.colors.border },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  stamp: { width: 30, color: theme.colors.textMuted, fontSize: theme.font.tiny, fontVariant: ['tabular-nums'], paddingTop: 2 },
  icon: { width: 20, fontSize: theme.font.small, textAlign: 'center' },
  body: { flex: 1, gap: 2, minWidth: 0 },
  text: { color: theme.colors.text, fontSize: theme.font.small },
  textKey: { fontWeight: '700' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1), marginTop: 2 },
  tag: { color: theme.colors.text, fontSize: 10, fontWeight: '800', letterSpacing: 0.4, borderWidth: 1, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing(1.5), paddingVertical: 1, overflow: 'hidden' },
  score: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 40, textAlign: 'right' },
});
