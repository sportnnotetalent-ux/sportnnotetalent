/** Deep wave — a golf round's commentary and stats panel (the leaderboard
 *  tab's 🎙 Commentary / 📊 Round stats views, and the card drill-down).
 *  Display only: golf/feed.ts and golf/statSheet.ts derive everything from the
 *  cards, so a corrected hole re-derives both. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../ui';
import { CommentaryFeed } from '../../sports/gcc/CommentaryFeed';
import { CompareTable } from '../../sports/gcc/CompareTable';
import { golfRoundFeed, type FeedPlayer } from '../../sports/golf/feed';
import { golfStatSheet, type NinePart } from '../../sports/golf/statSheet';

const short = (name: string) => name.split(' ')[0] || name;

/** The field's hole-by-hole commentary, with a player filter. */
export function GolfRoundFeed({ players, scoring, net, only: fixed }: {
  players: FeedPlayer[];
  scoring: 'stroke' | 'stableford';
  net?: boolean;
  /** one player's feed only (no filter chips) */
  only?: string;
}) {
  const [who, setWho] = useState('all');
  const only = fixed ?? (who === 'all' ? undefined : who);
  const filters = fixed ? undefined : [{ key: 'all', label: 'Everyone' }, ...players.map((p) => ({ key: p.id, label: short(p.name) }))];
  return (
    <CommentaryFeed title={fixed ? null : '🎙 Hole by hole'} groups={golfRoundFeed(players, { scoring, net, only })}
      filters={players.length > 1 ? filters : undefined} filter={who} onFilter={setWho} empty="No holes scored yet." />
  );
}

/** One player's round stats beside the field average; whole round or a nine. */
export function GolfRoundStats({ players, initial, fixed }: {
  players: FeedPlayer[];
  /** the player shown first (e.g. me) */
  initial?: string;
  /** one player only (the card drill-down) */
  fixed?: string;
}) {
  const [pid, setPid] = useState<string>(fixed ?? initial ?? players[0]?.id ?? '');
  const [part, setPart] = useState<NinePart>('all');
  const me = players.find((p) => p.id === (fixed ?? pid)) ?? players[0];
  if (!me) return null;
  const field = players.filter((p) => p.id !== me.id);
  const nines = me.holes.length === 18;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {!fixed && players.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) }}>
          {players.map((p) => <SelectChip key={p.id} label={short(p.name)} active={p.id === me.id} onPress={() => setPid(p.id)} />)}
        </View>
      )}
      <CompareTable
        title={fixed ? null : '📊 Round stats'}
        homeName={me.name} awayName="Field avg" single={!field.length}
        categories={golfStatSheet(me, field, part)}
        units={nines ? [{ key: 'all', label: 'Round' }, { key: 'out', label: 'Out (1–9)' }, { key: 'in', label: 'In (10–18)' }] : undefined}
        unit={part} onUnit={(k) => setPart(k as NinePart)}
        empty="No holes scored yet."
        footnote={field.length ? 'Field avg: the other players in this round (rates pooled over the cards that tracked them).' : undefined}
      />
    </View>
  );
}
