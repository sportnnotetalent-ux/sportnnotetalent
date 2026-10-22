/**
 * Deep wave — the grouped live commentary (GroupedFeed) (ice hockey, rugby, American
 * football, baseball / softball). Draws a `FeedGroup[]` from ./feedGroups
 * (already newest first): one card per period / half / drive / half-inning
 * with its summary line, each line "time · icon · sentence · running score",
 * the team's colour on the rail. Chips on top: scope (periods) and tags
 * (All / Key moments / Goals / Penalties …). Older groups fold away behind
 * "Show earlier".
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import { filterFeed, feedScopes, feedTags, type FeedGroup } from './feedGroups';

export function GroupedFeed({
  groups, homeColor = theme.colors.home, awayColor = theme.colors.away, emptyText = 'Nothing yet — the commentary fills in as play goes on.',
  tags = [], scopeLabel, initialGroups = 3,
}: {
  /** newest first (`newestFirst`) */
  groups: FeedGroup[];
  homeColor?: string;
  awayColor?: string;
  emptyText?: string;
  /** tag chips the sport offers; only tags some line carries are shown ('key' = key moments) */
  tags?: { key: string; label: string }[];
  /** label for a scope chip (period 2 → "P2"); absent = no scope chips */
  scopeLabel?: (scope: number) => string;
  initialGroups?: number;
}) {
  const [scope, setScope] = useState<number | 'all'>('all');
  const [tag, setTag] = useState<string>('all');
  const [more, setMore] = useState(false);
  if (!groups.length) return <Text style={st.empty}>{emptyText}</Text>;
  const scopes = scopeLabel ? feedScopes(groups, scopeLabel) : [];
  const tagChips = feedTags(groups, tags);
  const activeScope = scope !== 'all' && !scopes.some((x) => x.value === scope) ? 'all' : scope;
  const activeTag = tag !== 'all' && !tagChips.some((x) => x.key === tag) ? 'all' : tag;
  const shown = filterFeed(groups, { scope: activeScope, tag: activeTag });
  const visible = more ? shown : shown.slice(0, initialGroups);
  const sideColor = (s?: 'home' | 'away') => (s === 'home' ? homeColor : s === 'away' ? awayColor : theme.colors.border);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {scopes.length >= 2 ? (
        <View style={st.chips}>
          <SelectChip label="All" active={activeScope === 'all'} onPress={() => setScope('all')} />
          {scopes.map((x) => <SelectChip key={x.value} label={x.label} active={activeScope === x.value} onPress={() => setScope(x.value)} />)}
        </View>
      ) : null}
      {tagChips.length ? (
        <View style={st.chips}>
          <SelectChip label="Everything" active={activeTag === 'all'} onPress={() => setTag('all')} />
          {tagChips.map((x) => <SelectChip key={x.key} label={x.label} active={activeTag === x.key} onPress={() => setTag(x.key)} />)}
        </View>
      ) : null}
      {shown.length === 0 ? <Text style={st.empty}>Nothing matches these filters yet.</Text> : null}
      {visible.map((g) => (
        <View key={g.key} style={st.group}>
          <View style={[st.head, { borderLeftColor: sideColor(g.side) }]}>
            <Text style={st.title} accessibilityRole="header">{g.title}</Text>
            {g.sub ? <Text style={st.sub}>{g.sub}</Text> : null}
          </View>
          {g.lines.map((l) => (
            <View key={l.id} style={st.line} accessible accessibilityLabel={[l.when, l.text, l.score ? `score ${l.score}` : ''].filter(Boolean).join(', ')}>
              <View style={[st.rail, { backgroundColor: sideColor(l.side) }]} />
              {l.when ? <Text style={st.when} numberOfLines={1}>{l.when}</Text> : null}
              {l.icon ? <Text style={st.icon}>{l.icon}</Text> : null}
              <Text style={[st.text, l.key && st.textKey]}>{l.text}</Text>
              {l.score ? <Text style={st.score}>{l.score}</Text> : null}
            </View>
          ))}
        </View>
      ))}
      {shown.length > visible.length ? (
        <TouchableOpacity style={st.more} accessibilityRole="button" onPress={() => setMore(true)}>
          <Text style={st.moreTxt}>Show earlier ({shown.length - visible.length} more)</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1) },
  group: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  head: { paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderLeftWidth: 4, gap: 2 },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2), paddingVertical: theme.spacing(2), paddingRight: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border },
  rail: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  when: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', width: 48, paddingTop: 2, fontVariant: ['tabular-nums'] },
  icon: { fontSize: theme.font.small, width: 20, textAlign: 'center', paddingTop: 1 },
  text: { flex: 1, color: theme.colors.text, fontSize: theme.font.small, lineHeight: 20 },
  textKey: { fontWeight: '800' },
  score: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900', fontVariant: ['tabular-nums'], paddingTop: 1 },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  moreTxt: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
