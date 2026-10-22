/**
 * Deep wave (cricket) — the Commentary tab: ESPNcricinfo-style ball-by-ball,
 * newest first, grouped by innings → over, each over closed by its summary
 * (runs, score, run rate, the batters, the bowler's figures, the chase). Filters:
 * all / wickets / 4s & 6s / over summaries only. Everything comes from the pure
 * `cricketCommentary` (commentary.ts) — derived from the replayed log, so a
 * correction shows straight away.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { Button, SelectChip } from '../../components/ui';
import type { CricketState } from './engine';
import { symbolTone } from './engine';
import {
  cricketCommentary, filterItems, overHeadline, clockText,
  type ComFilter, type ComInnings, type ComItem, type ComOver,
} from './commentary';

const FILTERS: { key: ComFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'wickets', label: 'Wickets' },
  { key: 'boundaries', label: '4s & 6s' },
  { key: 'overs', label: 'Overs' },
];
const PAGE = 6;

const TONE = {
  wicket: theme.colors.danger, boundary: theme.colors.primary, extra: theme.colors.accent, plain: theme.colors.surfaceAlt,
} as const;

function Chip({ sym }: { sym?: string }) {
  if (!sym) return <View style={st.chipBlank} />;
  const tone = symbolTone(sym);
  const bg = TONE[tone];
  const neutral = tone === 'plain';
  const main = sym === '0' ? '•' : sym.replace(/(ot|r)$/, '');
  return (
    <View style={[st.chip, { backgroundColor: bg }]}>
      <Text style={[st.chipText, neutral ? { color: theme.colors.text } : { color: theme.colors.onFill }]} numberOfLines={1}>{main}</Text>
    </View>
  );
}

function Item({ it }: { it: ComItem }) {
  const mask = useMask();
  if (it.kind === 'note') {
    const color = it.tone === 'wicket' ? theme.colors.danger : it.tone === 'milestone' ? theme.colors.accent : theme.colors.textMuted;
    return (
      <View style={st.noteRow}>
        <Text style={st.noteIcon}>{it.icon}</Text>
        <Text style={[st.noteText, { color }]}>{mask.text(it.text)}</Text>
      </View>
    );
  }
  const big = it.tone === 'wicket' || it.tone === 'four' || it.tone === 'six';
  const color = it.tone === 'wicket' ? theme.colors.danger : it.tone === 'four' || it.tone === 'six' ? theme.colors.primary : theme.colors.text;
  return (
    <View style={st.ballRow} accessibilityLabel={`${it.stamp}: ${it.text}. Score ${it.score}`}>
      <View style={st.ballLeft}>
        <Text style={st.stamp}>{it.stamp}</Text>
        <Chip sym={it.sym} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[st.ballText, big && { color, fontWeight: '700' }]}>{mask.text(it.text)}</Text>
        {it.wicketLine ? <Text style={st.wicketLine}>{mask.text(it.wicketLine)}</Text> : null}
        <Text style={st.ballMeta}>{it.score}{it.t ? ` · ${clockText(it.t)}` : ''}</Text>
      </View>
    </View>
  );
}

function OverBlock({ o, filter }: { o: ComOver; filter: ComFilter }) {
  const mask = useMask();
  const items = filterItems(o.items, filter);
  if ((filter === 'wickets' || filter === 'boundaries') && items.length === 0) return null;
  return (
    <View style={st.over}>
      <View style={st.overHead}>
        <Text style={st.overTitle}>{overHeadline(o)}{o.t ? `  ·  ${clockText(o.t)}` : ''}</Text>
        <Text style={st.overMeta} numberOfLines={3}>
          {[...o.batters, o.bowlerFigs].filter(Boolean).map((x) => mask.text(x)).join('  ·  ')}
        </Text>
        {o.chase ? <Text style={st.overChase}>{o.chase}</Text> : null}
        {o.powerplayEnd ? <Text style={st.overPp}>Powerplay over</Text> : null}
      </View>
      {items.map((it) => <Item key={it.id} it={it} />)}
    </View>
  );
}

function InningsBlock({ inn, filter }: { inn: ComInnings; filter: ComFilter }) {
  const [shown, setShown] = useState(PAGE);
  const overs = inn.overs.slice(0, shown);
  const more = inn.overs.length - overs.length;
  const mins = inn.start && inn.end ? Math.round((inn.end - inn.start) / 60000) : 0;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.innHead}>
        <Text style={st.innTitle} numberOfLines={1}>{inn.team} · {inn.total}</Text>
        {inn.start ? <Text style={st.innMeta}>{clockText(inn.start)}–{clockText(inn.end!)}{mins ? ` · ${mins} min` : ''}</Text> : null}
      </View>
      {inn.overs.length === 0 && inn.pre.length === 0 ? <Text style={st.empty}>No balls yet.</Text> : null}
      {overs.map((o) => <OverBlock key={o.id} o={o} filter={filter} />)}
      {more > 0 ? (
        <Button label={`Show earlier overs (${more} more)`} variant="ghost" onPress={() => setShown((n) => n + PAGE * 2)} />
      ) : filter === 'all' ? inn.pre.map((n) => <Item key={n.id} it={n} />) : null}
    </View>
  );
}

export function CricketCommentary({ state, homeName, awayName }: {
  state: CricketState; homeName: string; awayName: string;
}) {
  const com = useMemo(() => cricketCommentary(state, { home: homeName, away: awayName }), [state, homeName, awayName]);
  const [filter, setFilter] = useState<ComFilter>('all');
  // Which innings: the newest by default (the live one); 'so' = the Super Over.
  const [pick, setPick] = useState<string | null>(null);
  if (!com.hasLog) return <Text style={st.empty}>Ball-by-ball commentary appears once the match is replayed from its ball log.</Text>;
  const list: { key: string; label: string; inns: ComInnings[] }[] = [
    ...(com.superOver ? [{ key: 'so', label: `Super Over${com.superOver.round > 1 ? ` ${com.superOver.round}` : ''}`, inns: com.superOver.innings }] : []),
    ...com.innings.map((i) => ({ key: i.id, label: `${i.team}${com.innings.length > 1 ? ` · ${i.inn === 1 ? '1st' : '2nd'} inns` : ''}`, inns: [i] })),
  ];
  if (list.length === 0) return <Text style={st.empty}>No balls bowled yet — the commentary starts with the first ball.</Text>;
  const active = list.find((x) => x.key === pick) ?? list[0];
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {list.length > 1 ? (
        <View style={st.chips}>
          {list.map((x) => <SelectChip key={x.key} label={x.label} active={x.key === active.key} onPress={() => setPick(x.key)} />)}
        </View>
      ) : null}
      <View style={st.chips}>
        {FILTERS.map((f) => <SelectChip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />)}
      </View>
      {active.inns.map((inn) => <InningsBlock key={`${inn.id}:${filter}`} inn={inn} filter={filter} />)}
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  innHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: theme.spacing(2) },
  innTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flexShrink: 1 },
  innMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  over: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  overHead: { backgroundColor: theme.colors.surfaceAlt, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), gap: 2 },
  overTitle: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  overMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  overChase: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700' },
  overPp: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  ballRow: { flexDirection: 'row', gap: theme.spacing(3), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border },
  ballLeft: { width: 44, alignItems: 'center', gap: theme.spacing(1) },
  stamp: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  chip: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  chipBlank: { height: 26 },
  chipText: { fontSize: theme.font.tiny, fontWeight: '900' },
  ballText: { color: theme.colors.text, fontSize: theme.font.small, lineHeight: theme.font.small * 1.4 },
  wicketLine: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  ballMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  noteRow: { flexDirection: 'row', gap: theme.spacing(2), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border, alignItems: 'flex-start' },
  noteIcon: { width: 44, textAlign: 'center', fontSize: 16 },
  noteText: { flex: 1, fontSize: theme.font.small, fontStyle: 'italic' },
});
