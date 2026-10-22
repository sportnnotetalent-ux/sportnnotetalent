/**
 * Timed races round 2 — "🏆 Records set" on an athlete's profile (athletics,
 * swimming, rowing, canoe, cycling careers): each meet / school record the
 * athlete broke, newest first, opening that final's results. Shown only once
 * one is on record (records from before round 2, without a holder id, don't
 * count).
 */
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Card, textStyles } from '../ui';
import { formatDay } from '../../core/dates';
import { recordsSetText, type CareerRecord } from '../../data/results';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function RecordsSetCard({ c }: { c: { meetRecords: number; schoolRecords: number; records: CareerRecord[] } }) {
  const nav = useNavigation<Nav>();
  if (!c.records.length) return null;
  return (
    <Card style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.body}>🏆 {recordsSetText(c)} set</Text>
      {c.records.map((r, i) => (
        <TouchableOpacity key={`${r.eventId}:${r.scope}:${i}`} accessibilityRole="button" disabled={!r.eventId}
          onPress={() => nav.navigate('ResultsEvent', { phaseId: r.eventId, tab: 'sheet' })}>
          <Text style={textStyles.muted}>{r.scope === 'MR' ? 'Meet record' : 'School record'} — {r.title}{r.text ? `, ${r.text}` : ''}{r.date ? ` · ${formatDay(r.date)}` : ''} ›</Text>
        </TouchableOpacity>
      ))}
    </Card>
  );
}
