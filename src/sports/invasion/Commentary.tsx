/**
 * Deep wave (invasion-goal family) — the live COMMENTARY view: a broadcast
 * live-text page built from the event log (./feed.ts). Newest first, grouped
 * by half / quarter / period with the score at the end of each, every row with
 * its time stamp, a plain sentence and the running score after it. A "Key
 * events" filter keeps goals, cards, substitutions, penalties and shoot-out
 * kicks. The match facts block (scorers, sendings-off, notes) is its own
 * `MatchFactsCard` — match tabs: on the Summary tab, with the result.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { SelectChip } from '../../components/ui';
import type { Player } from '../../core/types';
import { playerLink, playerIdOf } from '../playerLink';
import { feedSections, feedCounts, scoreText, type FeedItem, type MatchFacts } from './feed';

const PAGE = 60;

export function Commentary({
  items, labelOf, periods, facts, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away,
  homeRoster, awayRoster, onPlayer, emptyText = 'No commentary yet — every moment you log appears here.',
}: {
  items: FeedItem[];
  labelOf: (period: number) => string;
  /** units to head the feed even before anything happens in them (the one in play) */
  periods?: number[];
  facts?: MatchFacts;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  onPlayer?: (playerId: string) => void;
  emptyText?: string;
}) {
  const mask = useMask();
  const [keyOnly, setKeyOnly] = useState(false);
  const [all, setAll] = useState(false);
  const counts = feedCounts(items);
  const sections = useMemo(() => feedSections(items, labelOf, { majorOnly: keyOnly, periods }), [items, labelOf, keyOnly, periods]);
  const color = (sd?: 'home' | 'away') => (sd === 'home' ? homeColor : sd === 'away' ? awayColor : theme.colors.textMuted);
  let shown = 0;
  // Match tabs: the sports pass no facts here — they show on Summary (MatchFactsCard)
  const factsBlock = facts ? <MatchFactsCard facts={facts} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} /> : null;
  if (!items.length) {
    return (
      <View style={{ gap: theme.spacing(3) }}>
        {factsBlock}
        <Text style={st.empty}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {factsBlock}
      <View style={st.filters}>
        <SelectChip label={`All · ${counts.all}`} active={!keyOnly} onPress={() => setKeyOnly(false)} />
        <SelectChip label={`Key events · ${counts.major}`} active={keyOnly} onPress={() => setKeyOnly(true)} />
      </View>
      {sections.map((sec) => {
        if (!all && shown >= PAGE) return null;
        return (
          <View key={sec.period} style={st.section}>
            <View style={st.secHead} accessibilityRole="header">
              <Text style={st.secLabel}>{sec.label}</Text>
              <Text style={st.secScore}>{sec.scoreText ?? scoreText(sec.score)}</Text>
            </View>
            {sec.items.length === 0 ? <Text style={st.muted}>{keyOnly ? 'No key events.' : 'Nothing yet.'}</Text> : null}
            {sec.items.map((it) => {
              if (!all && shown >= PAGE) return null;
              shown += 1;
              // IDs-only scoring: the item's player by id (an older log's name → the roster)
              const pid = playerIdOf(it.playerId, it.playerName, ...(it.side === 'away' ? [awayRoster] : it.side === 'home' ? [homeRoster] : [homeRoster, awayRoster]));
              const toneColor = it.tone === 'goal' ? theme.colors.primary : it.tone === 'red' ? theme.colors.danger : it.tone === 'yellow' ? theme.colors.accent : undefined;
              const big = it.tone === 'goal';
              return (
                <View key={it.id} style={[st.row, big && st.rowGoal]} accessible accessibilityLabel={`${it.stamp} ${it.text} Score ${it.scoreText ?? scoreText(it.score, ' ')}`}>
                  <Text style={[st.stamp, { color: color(it.side) }]} numberOfLines={1}>{it.stamp}</Text>
                  <Text style={st.icon}>{it.icon}</Text>
                  <Text style={[st.text, toneColor && big ? { color: theme.colors.text, fontWeight: '700' } : null]} {...playerLink(pid, mask.text(it.text), onPlayer)}>
                    {mask.text(it.text)}
                  </Text>
                  {it.detail ? <Text style={st.detail} numberOfLines={1}>{it.detail}</Text> : null}
                  <Text style={[st.score, big && { color: toneColor, fontWeight: '900' }]}>{it.scoreText ?? scoreText(it.score)}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
      {!all && (keyOnly ? counts.major : counts.all) > PAGE ? (
        <SelectChip label={`Show all ${keyOnly ? counts.major : counts.all}`} active={false} onPress={() => setAll(true)} />
      ) : null}
    </View>
  );
}

/** The match facts block (scorers, sendings-off, notes) — match tabs: shown
 *  with the result on the Summary tab. Nothing to show → null. */
export function MatchFactsCard({ facts, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away }: {
  facts: MatchFacts;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
}) {
  const mask = useMask();
  if (!(facts.home.length || facts.away.length || facts.notes.length)) return null;
  const color = (sd: 'home' | 'away') => (sd === 'home' ? homeColor : awayColor);
  return (
    <View style={st.facts} accessibilityLabel="Match facts">
      <Text style={st.factsTitle}>MATCH FACTS</Text>
      <View style={st.factsCols}>
        {(['home', 'away'] as const).map((sd) => (
          <View key={sd} style={[st.factsCol, sd === 'away' && { alignItems: 'flex-end' }]}>
            <Text style={[st.factsTeam, { color: color(sd) }]} numberOfLines={1}>{sd === 'home' ? homeName : awayName}</Text>
            {facts[sd].length ? facts[sd].map((l, i) => (
              <Text key={i} style={[st.factsLine, sd === 'away' && { textAlign: 'right' }]}>{mask.text(l)}</Text>
            )) : <Text style={[st.factsLine, st.muted]}>—</Text>}
          </View>
        ))}
      </View>
      {facts.notes.map((n) => <Text key={n} style={st.factsNote}>{n}</Text>)}
    </View>
  );
}

/** Match tabs: the facts that belong with the result — possession is a stat
 *  (the Stats tab's match centre shows it), so it is left out. */
export function resultFacts(f: MatchFacts): MatchFacts {
  return { ...f, notes: f.notes.filter((n) => !/^Possession\b/.test(n)) };
}

const st = StyleSheet.create({
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.small },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  facts: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  factsTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  factsCols: { flexDirection: 'row', gap: theme.spacing(3) },
  factsCol: { flex: 1, minWidth: 0, gap: 2 },
  factsTeam: { fontSize: theme.font.small, fontWeight: '800' },
  factsLine: { color: theme.colors.text, fontSize: theme.font.small },
  factsNote: { color: theme.colors.textMuted, fontSize: theme.font.tiny, textAlign: 'center' },
  section: { gap: theme.spacing(1) },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing(1) },
  secLabel: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  secScore: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  rowGoal: { backgroundColor: theme.colors.primary + '14', borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(1) },
  // fits "90+10'" / "120+3'" / "31:15" at 375 px
  stamp: { width: 50, fontSize: theme.font.small, fontWeight: '800' },
  icon: { fontSize: 16, width: 22, textAlign: 'center' },
  text: { flex: 1, minWidth: 0, color: theme.colors.text, fontSize: theme.font.small, lineHeight: 19 },
  score: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.4, maxWidth: 110 },
});
