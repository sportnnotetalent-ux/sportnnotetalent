/** Run it again (2026-10-27): a tournament's editions on its page — "📅 Every
 *  edition: 2025 · 2026 · 2027" — and the ways to run it again or copy its
 *  set-up (screens/CopyTournamentScreen.tsx). */
import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, Card, Pill, textStyles } from './ui';
import { getEditions } from '../data/tournamentCopy';
import type { EditionRow } from '../data/tournamentCopyPlan';
import type { Tournament } from '../core/types';

export type Edition = EditionRow & { label: string };

/** The series this tournament belongs to (empty for a one-off). */
export function useEditions(t: Tournament | null | undefined): Edition[] {
  const [list, setList] = useState<Edition[]>([]);
  // re-read on focus: back from "Link an earlier edition" or a new edition
  useFocusEffect(useCallback(() => {
    let on = true;
    if (!t) { setList([]); return undefined; }
    void getEditions(t).then((l) => on && setList(l)).catch(() => on && setList([]));
    return () => { on = false; };
  }, [t?.id])); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}

/** The edition after this one, if it's been created. */
export const nextEditionOf = (editions: Edition[], id: string): Edition | undefined => {
  const i = editions.findIndex((e) => e.id === id);
  return i >= 0 ? editions[i + 1] : undefined;
};

export function EditionsCard({ editions, currentId, onOpen }: { editions: Edition[]; currentId: string; onOpen: (id: string) => void }) {
  if (editions.length < 2) return null;
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>📅 Every edition</Text>
      <View style={st.chips}>
        {editions.map((e) => (e.id === currentId ? (
          <Pill key={e.id} label={`${e.label} · this one`} color={theme.colors.primary + '22'} textColor={theme.colors.primary} />
        ) : (
          <TouchableOpacity key={e.id} accessibilityRole="link" accessibilityLabel={`Open ${e.name}`} activeOpacity={0.8} onPress={() => onOpen(e.id)}>
            <Pill label={`${e.label} ›`} />
          </TouchableOpacity>
        )))}
      </View>
    </Card>
  );
}

/** The foot of the tournament page: organisers of a finished tournament are
 *  offered the next edition; anyone can copy the set-up for their own event. */
export function RunAgainFooter({ tournament, canManage, next, onRunAgain, onCopy, onOpen }: {
  tournament: Tournament;
  canManage: boolean;
  next?: Edition;
  onRunAgain: () => void;
  onCopy: () => void;
  onOpen: (id: string) => void;
}) {
  if (tournament.deletedAt) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const over = tournament.endDate < `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {canManage && over && !next ? (
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>🏁 That’s a wrap. Run it again?</Text>
          <Text style={textStyles.muted}>The next edition keeps the same sports, formats, rules, age groups, venues and events — you just pick the dates.</Text>
          <Button label="🔁 Run it again" onPress={onRunAgain} />
        </Card>
      ) : null}
      {canManage && next ? (
        <Text style={st.link} accessibilityRole="link" onPress={() => onOpen(next.id)}>🔁 Next edition: {next.name} ›</Text>
      ) : null}
      <Text style={st.link} accessibilityRole="button" onPress={onCopy}>
        {canManage ? '📋 Copy this setup for another tournament ›' : '📋 Copy this setup to run your own tournament ›'}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
});
