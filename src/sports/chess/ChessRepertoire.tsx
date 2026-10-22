/** Round 2 — the opening repertoire on a chess profile: the record by opening
 *  family as White and as Black (games · W-D-L · score %), tap a family for
 *  its openings by ECO. Read from the player's games (chess/repertoire.ts);
 *  shown only once a game has an opening (typed, pasted or read from the
 *  moves). Follows the profile's split chips (the lines passed in). */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import type { Match, StatLine } from '../../core/types';
import { sideOf } from '../../data/lineContext';
import { repertoire, repertoireGames, recordText, halfText, type RepFamily } from './repertoire';
import type { ChessState } from './engine';

export function ChessRepertoire({ lines, matchById }: { lines: StatLine[]; matchById: Map<string, Match> }) {
  const [colour, setColour] = useState<'white' | 'black'>('white');
  const [open, setOpen] = useState<string | null>(null);
  const rep = useMemo(() => {
    const seen = new Set<string>();
    const games = lines.flatMap((l) => {
      if (l.sport !== 'chess' || !l.matchId || seen.has(l.matchId)) return [];
      seen.add(l.matchId);
      const m = matchById.get(l.matchId);
      const side = sideOf(l, m);
      return m && side ? repertoireGames(m.state as ChessState | undefined, side) : [];
    });
    return repertoire(games);
  }, [lines, matchById]);
  if (!rep.games) return null;
  const fams: RepFamily[] = rep[colour];
  return (
    <View style={st.card}>
      <Text style={st.title}>Opening repertoire</Text>
      <View style={st.chips}>
        <SelectChip label={`♔ As White (${rep.white.reduce((t, f) => t + f.games, 0)})`} active={colour === 'white'} onPress={() => { setColour('white'); setOpen(null); }} />
        <SelectChip label={`♚ As Black (${rep.black.reduce((t, f) => t + f.games, 0)})`} active={colour === 'black'} onPress={() => { setColour('black'); setOpen(null); }} />
      </View>
      {fams.length === 0 ? <Text style={st.muted}>No games with an opening as {colour === 'white' ? 'White' : 'Black'} yet.</Text> : fams.map((f) => (
        <View key={f.name}>
          <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={() => setOpen(open === f.name ? null : f.name)}
            accessibilityLabel={`${f.name}, ${f.games} games, ${recordText(f)}, ${f.pct}%`} style={st.row}>
            <Text style={st.name} numberOfLines={1}>{f.lines.length > 1 ? (open === f.name ? '▾ ' : '▸ ') : ''}{f.name} <Text style={st.muted}>{f.ecoRange}</Text></Text>
            <Text style={st.num}>{f.games}</Text>
            <Text style={st.rec}>{recordText(f)}</Text>
            <Text style={st.num}>{f.pct}%</Text>
          </TouchableOpacity>
          {open === f.name && f.lines.map((x) => (
            <View key={`${x.eco}${x.name}`} style={[st.row, st.sub]}>
              <Text style={[st.name, st.muted]} numberOfLines={1}>{x.eco} · {x.name}</Text>
              <Text style={st.num}>{x.games}</Text>
              <Text style={st.rec}>{recordText(x)}</Text>
              <Text style={st.num}>{halfText(x.score)}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={st.foot}>Games · W-D-L · score %. The opening is the one typed or pasted, else read from the move list (the longest ECO line followed).</Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  title: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  sub: { paddingLeft: theme.spacing(4) },
  name: { flex: 1, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '400' },
  num: { width: 40, textAlign: 'right', color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  rec: { width: 76, textAlign: 'right', color: theme.colors.textMuted, fontSize: theme.font.small },
  foot: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
