/** "Mine" — on your own profile: one tap to your teams, tournaments, matches
 *  and calendar (2026-10-22). Each list uses the app-wide "mine" rule (repos
 *  getMyScope). */
import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Glyph } from './Icon';
import { Card, textStyles } from './ui';

export function MineCard({ onTeams, onTournaments, onMatches, onCalendar, onInvite }: {
  onTeams: () => void;
  onTournaments: () => void;
  onMatches: () => void;
  onCalendar: () => void;
  /** "Invite a friend" — your personal join link (2026-10-23) */
  onInvite?: () => void;
}) {
  const rows: { icon: string; label: string; hint: string; onPress: () => void }[] = [
    { icon: '🛡️', label: 'My teams', hint: 'Teams you’re part of, and your pairs', onPress: onTeams },
    { icon: '🏆', label: 'My tournaments', hint: 'Hosting, playing, officiating, following', onPress: onTournaments },
    { icon: '📋', label: 'My matches', hint: 'Games you play, organise or score', onPress: onMatches },
    { icon: '📅', label: 'My calendar', hint: 'Everything of yours by date', onPress: onCalendar },
    ...(onInvite ? [{ icon: '💌', label: 'Invite a friend', hint: 'WhatsApp or SMS them your link — Android or iPhone', onPress: onInvite }] : []),
  ];
  return (
    <Card style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.h3}>Mine</Text>
      {rows.map((r) => (
        <TouchableOpacity key={r.label} accessibilityRole="button" accessibilityLabel={`${r.label}. ${r.hint}`} onPress={r.onPress} style={st.row}>
          <Glyph emoji={r.icon} style={st.icon} color={theme.colors.primary} />
          <Text style={[textStyles.body, { flex: 1 }]}>{r.label}{'\n'}<Text style={textStyles.muted}>{r.hint}</Text></Text>
          <Text style={st.chev}>›</Text>
        </TouchableOpacity>
      ))}
    </Card>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), minHeight: 44 },
  icon: { fontSize: theme.font.h3, width: 28 },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '800' },
});
