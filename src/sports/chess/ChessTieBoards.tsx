/** Deep wave — a chess team match board by board, on the team-tie page:
 *  "Board 1: Anand (W) 1-0 Carlsen (B) · Resignation · 41 moves · C60 Ruy
 *  Lopez", and each team's score with White and with Black. Display only
 *  (chess/tieBoards.ts). */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { chessTieBoards, colourLine, type TieBoardInput } from './tieBoards';
import type { Side } from './engine';

export function ChessTieBoards({ rubbers, label, name, teamA, teamB }: {
  rubbers: TieBoardInput[];
  label: (i: number) => string;
  name: (i: number, side: Side) => string;
  teamA: string;
  teamB: string;
}) {
  const { rows, a, b } = chessTieBoards(rubbers, label, name);
  if (!rows.some((r) => r.done)) return null;
  const ca = colourLine(a), cb = colourLine(b);
  return (
    <View style={st.card}>
      <Text style={st.title}>♟ Board by board</Text>
      {rows.map((r, i) => (
        <View key={i} style={st.row}>
          <Text style={[st.text, !r.done && st.muted]}>{r.text}</Text>
          {r.sub ? <Text style={st.muted}>{r.sub}</Text> : null}
        </View>
      ))}
      {ca || cb ? <Text style={st.muted}>{[ca ? `${teamA}: ${ca}` : '', cb ? `${teamB}: ${cb}` : ''].filter(Boolean).join('  ·  ')}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  row: { gap: 2 },
  text: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
});
