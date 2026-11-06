/**
 * "Who's playing" at match setup (reference-video C3), optional. Pick a side's
 * starting players before the match exists: last match's players are first and
 * tagged, one tap copies them, a counter shows how many of the players-a-side
 * are picked, and new players can be added to the team here. Nothing is saved
 * until the match is created (data/draftSquad.ts). It never blocks
 * "Start now".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Sheet } from './Sheet';
import { Button, ListRow, SelectChip, textStyles } from './ui';
import { AddInvitePlayer } from './AddInvitePlayer';
import { theme } from '../core/theme';
import { getLastSquadForTeam, getRoster } from '../data/repos';
import { canFieldPlayer } from '../core/eligibility';
import { copyLast, togglePick } from '../core/whoPlays';
import { MatchRolesPicker } from './MatchRolesPicker';
import type { DraftSide } from '../data/draftSquad';
import type { Player, SportId } from '../core/types';

export function WhoPlaysSheet({
  visible, onClose, onDone, teamId, teamName, color, sport, playersPerSide, picked, taken,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (draft: DraftSide) => void;
  teamId: string;
  teamName: string;
  color?: string;
  sport: SportId;
  playersPerSide: number;
  picked: DraftSide;
  /** picked for the other side — one person plays for one side */
  taken: string[];
}) {
  const [roster, setRoster] = useState<Player[]>([]);
  const [last, setLast] = useState<string[]>([]);
  const [sel, setSel] = useState<string[]>(picked.starters);
  const [captainId, setCaptainId] = useState<string | undefined>(picked.captainId);
  const [keeperId, setKeeperId] = useState<string | undefined>(picked.keeperId);
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (visible) { setSel(picked.starters); setCaptainId(picked.captainId); setKeeperId(picked.keeperId); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!visible) return;
    let on = true;
    setLoading(true);
    Promise.all([
      getRoster(teamName, sport, teamId).catch(() => [] as Player[]),
      getLastSquadForTeam(teamName, sport, '', teamId).catch(() => null),
    ]).then(([rs, ls]) => {
      if (!on) return;
      setRoster(rs);
      setLast(ls ? [...ls.starters, ...ls.subs] : []);
      setLoading(false);
    });
    return () => { on = false; };
  }, [visible, teamId, teamName, sport, nonce]);

  const takenSet = useMemo(() => new Set(taken), [taken]);
  const byId = useMemo(() => new Map(roster.map((p) => [p.id, p] as const)), [roster]);
  // Friendlies have no tournament age rule; unverified players follow the app-wide testing switch.
  const ok = (id: string) => { const p = byId.get(id); return !!p && !takenSet.has(id) && canFieldPlayer(p); };
  const lastSet = new Set(last);
  // last match's players first, then everyone else by name
  const ordered = [...roster].sort((a, b) => Number(lastSet.has(b.id)) - Number(lastSet.has(a.id)) || a.fullName.localeCompare(b.fullName));
  const fromLast = copyLast(last, roster.map((p) => p.id), playersPerSide, ok);
  const why = (p: Player) => (takenSet.has(p.id) ? 'Picked for the other side' : !canFieldPlayer(p) ? 'Not verified yet' : lastSet.has(p.id) ? 'Played last match' : undefined);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Who's playing · ${teamName}`}
      footer={<Button variant="primary" label={sel.length ? `Done · ${sel.length} picked` : 'Done'} onPress={() => {
        // C6: a role only for someone still picked
        onDone({ starters: sel, captainId: captainId && sel.includes(captainId) ? captainId : undefined, keeperId: keeperId && sel.includes(keeperId) ? keeperId : undefined });
        onClose();
      }} />}
    >
      <Text style={textStyles.muted}>Optional. {sel.length} of {playersPerSide} picked. You can change this any time from the match.</Text>
      {fromLast.length > 0 && (
        <SelectChip label={`Same as last match (${fromLast.length})`} active={false} onPress={() => setSel(fromLast)} />
      )}
      {loading ? (
        <Text style={textStyles.muted}>Loading the team…</Text>
      ) : roster.length === 0 ? (
        <Text style={textStyles.muted}>No players in {teamName} yet. Add them below, or skip this and add them later.</Text>
      ) : (
        <View style={{ gap: theme.spacing(2) }}>
          {ordered.map((p) => (
            <ListRow
              key={p.id}
              title={p.fullName}
              meta={why(p)}
              color={color}
              selected={sel.includes(p.id)}
              disabled={!sel.includes(p.id) && (!ok(p.id) || sel.length >= playersPerSide)}
              onPress={() => setSel((s) => togglePick(s, p.id, playersPerSide, ok))}
            />
          ))}
        </View>
      )}
      <MatchRolesPicker
        sport={sport}
        players={sel.map((id) => ({ id, name: byId.get(id)?.fullName ?? 'Player' }))}
        captainId={captainId && sel.includes(captainId) ? captainId : undefined}
        keeperId={keeperId && sel.includes(keeperId) ? keeperId : undefined}
        onCaptain={setCaptainId}
        onKeeper={setKeeperId}
      />
      <AddInvitePlayer
        fixedSide="home"
        title="＋ Add a player to this team"
        homeTeamId={teamId} awayTeamId={teamId}
        homeTeamName={teamName} awayTeamName={teamName}
        sport={sport}
        invited={[]}
        existingIds={roster.map((p) => p.id)}
        onChanged={() => setNonce((n) => n + 1)}
      />
    </Sheet>
  );
}
