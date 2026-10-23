/**
 * Timed races round 2 — "🏆 Records set" on an athlete's profile (athletics,
 * swimming, rowing, canoe, cycling careers): each meet / school record the
 * athlete broke, newest first, opening that final's results. Shown only once
 * one is on record (records from before round 2, without a holder id, don't
 * count).
 *
 * Follow-up — RECORDS HELD: given the athlete and the phases their lines came
 * from, the card reads the books of the meets where they set a record and
 * says which still stand ("· still held" / "· beaten since"; the line "… set ·
 * 1 still held"). A record whose book couldn't be read says neither.
 */
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Card, textStyles } from '../ui';
import { formatDay } from '../../core/dates';
import { recordHeldNote, recordsHeldText, recordsSetText, type CareerRecord, type PhaseInfo, type RecordsHeld } from '../../data/results';
import { getRecordsHeld } from '../../data/resultsStore';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function RecordsSetCard({ c, playerId, infos }: {
  c: { meetRecords: number; schoolRecords: number; records: CareerRecord[] };
  /** follow-up (records held): whose career this is, and its phases */
  playerId?: string;
  infos?: ReadonlyMap<string, PhaseInfo>;
}) {
  const nav = useNavigation<Nav>();
  const any = c.records.length > 0;
  const [held, setHeld] = useState<RecordsHeld | null>(null);
  useEffect(() => {
    let on = true;
    setHeld(null);
    if (!any || !playerId || !infos?.size) return;
    void getRecordsHeld(playerId, infos).then((h) => on && setHeld(h)).catch(() => {});
    return () => { on = false; };
  }, [any, playerId, infos]);
  if (!any) return null;
  const still = recordsHeldText(held, c.records);
  return (
    <Card style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.body}>🏆 {recordsSetText(c)} set{still ? ` · ${still}` : ''}</Text>
      {c.records.map((r, i) => (
        <TouchableOpacity key={`${r.eventId}:${r.scope}:${i}`} accessibilityRole="button" disabled={!r.eventId}
          onPress={() => nav.navigate('ResultsEvent', { phaseId: r.eventId, tab: 'sheet' })}>
          <Text style={textStyles.muted}>{r.scope === 'MR' ? 'Meet record' : 'School record'} — {r.title}{r.text ? `, ${r.text}` : ''}{r.date ? ` · ${formatDay(r.date)}` : ''}{recordHeldNote(held, r)} ›</Text>
        </TouchableOpacity>
      ))}
    </Card>
  );
}
