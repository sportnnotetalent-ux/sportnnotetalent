/** Run it again: the line at the top of an event setup that opened pre-filled
 *  from last edition's event ("Events from last time"). */
import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Card } from '../ui';

export function CarriedNote({ title, who }: { title?: string; who: string }) {
  if (!title) return null;
  return (
    <Card style={st.card}>
      <Text style={st.text}>🔁 Filled in from last time: <Text style={st.bold}>{title}</Text>. Check it, then pick the {who}.</Text>
    </Card>
  );
}

const st = StyleSheet.create({
  card: { borderColor: theme.colors.primary + '55' },
  text: { color: theme.colors.text, fontSize: theme.font.small, lineHeight: 20 },
  bold: { fontWeight: '800' },
});
