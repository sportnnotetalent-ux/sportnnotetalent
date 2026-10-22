/**
 * Deep wave — the live commentary / play-by-play feed (model: feedModel.ts).
 * Newest first, grouped by the sport's unit (Q1 … / set · game), each row
 * with its clock, the running score after it and a plain sentence. Chips
 * filter one unit and "Scoring plays"; long games show the newest plays
 * first with "Show more".
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import { filterFeed, groupHeading, type FeedGroup } from './feedModel';
import { playerLink, idByName } from './playerLink';

const PAGE = 40;

export function PlayFeed({
  groups, homeColor = theme.colors.home, awayColor = theme.colors.away, homeRoster, awayRoster, onPlayer,
  emptyText = 'No plays yet — the commentary builds as the game unfolds.', allLabel = 'All',
}: {
  groups: FeedGroup[];
  homeColor?: string;
  awayColor?: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** tap a row's player → their profile */
  onPlayer?: (playerId: string) => void;
  emptyText?: string;
  /** the "every unit" chip */
  allLabel?: string;
}) {
  const [group, setGroup] = useState<string | undefined>(undefined);
  const [scoringOnly, setScoringOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  if (!groups.some((g) => g.rows.length)) return <Text style={st.empty}>{emptyText}</Text>;
  const active = group && groups.some((g) => g.key === group) ? group : undefined;
  const shown = filterFeed(groups, { group: active, scoringOnly });
  // the newest `limit` rows across the groups
  let left = limit;
  const capped = shown.map((g) => { const rows = g.rows.slice(0, Math.max(0, left)); left -= rows.length; return { ...g, rows }; }).filter((g) => g.rows.length);
  const total = shown.reduce((n, g) => n + g.rows.length, 0);
  const units = [...groups].reverse(); // chips in playing order
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.chips}>
        {units.length >= 2 ? (
          <>
            <SelectChip label={allLabel} active={!active} onPress={() => { setGroup(undefined); setLimit(PAGE); }} />
            {units.map((g) => <SelectChip key={g.key} label={g.title} active={active === g.key} onPress={() => { setGroup(g.key); setLimit(PAGE); }} />)}
          </>
        ) : null}
        <SelectChip label="Scoring plays" active={scoringOnly} onPress={() => { setScoringOnly(!scoringOnly); setLimit(PAGE); }} />
      </View>
      {capped.length === 0 ? <Text style={st.empty}>No scoring plays here yet.</Text> : null}
      {capped.map((g) => (
        <View key={g.key} style={st.group}>
          <Text style={st.head} accessibilityRole="header">{groupHeading(g)}</Text>
          {g.rows.map((r) => {
            const color = r.side === 'home' ? homeColor : r.side === 'away' ? awayColor : theme.colors.border;
            const pid = r.playerId ?? idByName(r.playerName, ...(r.side === 'away' ? [awayRoster] : r.side === 'home' ? [homeRoster] : [homeRoster, awayRoster]));
            return (
              <View key={r.id} style={st.row} accessible={!(pid && onPlayer)} accessibilityLabel={`${r.clock ?? ''} ${r.text}. ${r.score.home}–${r.score.away}${r.tag ? `. ${r.tag}` : ''}`}>
                <View style={[st.bar, { backgroundColor: color }]} />
                <Text style={st.clock} numberOfLines={1}>{r.clock ?? ''}</Text>
                <Text style={st.icon}>{r.icon}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[st.text, r.scoring && st.textScore]} {...playerLink(pid, r.text, onPlayer)}>{r.text}</Text>
                  {r.tag ? <Text style={st.tag}>{r.tag}</Text> : null}
                </View>
                <Text style={[st.score, r.scoring && st.scoreOn]}>{r.score.home}–{r.score.away}</Text>
              </View>
            );
          })}
        </View>
      ))}
      {total > limit ? (
        <Text style={st.more} accessibilityRole="button" onPress={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, total - limit)} more ({total - limit} earlier)</Text>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  group: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', paddingVertical: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  clock: { width: 44, color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', fontVariant: ['tabular-nums'] },
  icon: { fontSize: 16, width: 22, textAlign: 'center' },
  text: { color: theme.colors.text, fontSize: theme.font.small },
  textScore: { fontWeight: '800' },
  tag: { alignSelf: 'flex-start', color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800' },
  score: { minWidth: 48, textAlign: 'right', color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', fontVariant: ['tabular-nums'] },
  scoreOn: { color: theme.colors.text, fontWeight: '900' },
  more: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800', paddingVertical: theme.spacing(2), minHeight: 44 },
});
