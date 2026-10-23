/** "Your teams" quick-pick — surfaces the multi-sport Clubs a person belongs to
 *  when they're choosing sides for a game or tournament (spec §16). Picking a club
 *  resolves that club's per-sport team row (its captain + squad already live there),
 *  creating the sport profile on the fly if the club doesn't play the sport yet, so
 *  the organiser never has to rebuild a team they already manage. Renders nothing
 *  when the person has no clubs. */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, textStyles } from './ui';
import { getSportMeta } from '../sports/sportMeta';
import { useAuth } from '../core/auth';
import { getClubsForPlayer, getClubSports, getClubTeam, addClubSport, getMyPlayerId, getMyScope } from '../data/repos';
import type { Club, SportId, Team } from '../core/types';

export function ClubQuickPick({ sport, selectedTeamIds, onPicked }: {
  sport: SportId;
  /** team ids already chosen — a club whose sport row is picked shows as active. */
  selectedTeamIds: string[];
  /** called with the resolved (or freshly created) per-sport team row. */
  onPicked: (team: Team) => void;
}) {
  const { profile } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [sportsByClub, setSportsByClub] = useState<Record<string, SportId[]>>({});
  const [teamByClub, setTeamByClub] = useState<Record<string, Team | null>>({});
  // clubs I can add a sport to (club admin / creator) — a plain member can only
  // pick a club that already plays this sport
  const [canAdd, setCanAdd] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const myId = await getMyPlayerId(profile?.id);
    const [list, scope] = await Promise.all([getClubsForPlayer(myId, profile?.id), getMyScope(profile?.id)]);
    setCanAdd(scope.managedClubIds);
    const sportsPairs = await Promise.all(list.map(async (c) => [c.id, await getClubSports(c.id)] as const));
    const teamPairs = await Promise.all(list.map(async (c) => [c.id, await getClubTeam(c.id, sport)] as const));
    setClubs(list);
    setSportsByClub(Object.fromEntries(sportsPairs));
    setTeamByClub(Object.fromEntries(teamPairs));
  }, [profile?.id, sport]);

  useEffect(() => { load(); }, [load]);

  const shown = clubs.filter((c) => (sportsByClub[c.id] ?? []).includes(sport) || canAdd.has(c.id));
  if (!shown.length) return null;
  const sportName = getSportMeta(sport).name;

  async function pick(club: Club) {
    setBusy(true);
    try {
      const team = teamByClub[club.id] ?? (await addClubSport(club.id, sport));
      onPicked(team);
      // Refresh so a newly-minted sport row now shows as an active/known chip.
      if (!teamByClub[club.id]) await load();
    } catch (e) {
      Alert.alert('Couldn’t add the sport', e instanceof Error ? e.message : 'Only the team’s admins can add a sport to it.');
    } finally { setBusy(false); }
  }

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.muted}>Your teams</Text>
      <View style={st.chips}>
        {shown.map((c) => {
          const plays = (sportsByClub[c.id] ?? []).includes(sport);
          const team = teamByClub[c.id];
          const active = !!team && selectedTeamIds.includes(team.id);
          return (
            <SelectChip
              key={c.id}
              label={plays ? c.name : `＋ ${c.name} → ${sportName}`}
              active={active}
              disabled={busy}
              onPress={() => pick(c)}
            />
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
