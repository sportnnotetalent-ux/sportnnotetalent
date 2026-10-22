/**
 * The doubles serve diagram (2026-10-22) on the Score tab of tennis, padel,
 * badminton and pickleball: for the next point, a one-line call ("Rohan serves
 * from the deuce court to Likhi") over the court with all four players placed —
 * the server highlighted, the receiver diagonally opposite, the partners in
 * the other half. Derived from the score (serveCourt.ts), so undo and
 * corrections move everyone. Renders nothing in singles, after the match, or
 * before the toss. Tennis / padel: until a pair's receiving order is picked
 * for the set, the receiver shows as "?" and the scorer gets a one-tap pick.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, textStyles } from '../components/ui';
import type { LineupSlot, Player } from '../core/types';
import type { CourtProps } from '../components/CourtMap';
import type { ScoreAction } from './types';
import { halfName, spotXY, type ServeCourtView, type CourtPlayer } from './serveCourt';

const firstName = (n?: string) => (n ? n.split(' ')[0] : undefined);

export function ServeCourtPanel({
  view, Court, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, canScore, dispatch,
}: {
  view: ServeCourtView | null;
  Court: React.FC<CourtProps>;
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  homeRoster: Player[];
  awayRoster: Player[];
  canScore?: boolean;
  dispatch?: (a: ScoreAction) => void;
}) {
  if (!view) return null;
  const roster = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);
  const nameOf = (id?: string) => (id ? [...homeRoster, ...awayRoster].find((p) => p.id === id)?.fullName : undefined);
  const teamOf = (side: 'home' | 'away') => (side === 'home' ? homeName : awayName);
  const slot = (p: CourtPlayer): LineupSlot => {
    const { x, y } = spotXY(view.sport, p);
    const name = nameOf(p.playerId);
    const tag = p.role === 'server' ? '🎾 serves' : p.role === 'receiver' ? 'receives' : undefined;
    return {
      position: name ? '' : '?', x, y,
      ...(p.playerId ? { playerId: p.playerId } : {}),
      ...(name ? { playerName: name } : {}),
      ...(tag ? { tag } : {}),
      ...(p.role === 'server' ? { highlight: true } : {}),
    };
  };
  const home = view.players.filter((p) => p.side === 'home').map(slot);
  const away = view.players.filter((p) => p.side === 'away').map(slot);
  const server = view.players.find((p) => p.role === 'server');
  const receiver = view.players.find((p) => p.role === 'receiver');
  const recvSide = receiver?.side ?? (view.serverSide === 'home' ? 'away' : 'home');
  const court = halfName(view.sport, view.half);
  const to = receiver?.playerId ? nameOf(receiver.playerId) : `${teamOf(recvSide)}'s ${court} player`;
  const call = `${firstName(nameOf(server?.playerId)) ?? teamOf(view.serverSide)} serves from the ${court} to ${receiver?.playerId ? firstName(to) : to}`;
  // tennis / padel: the receiving order isn't known yet → one tap for the scorer
  const pickable = canScore && dispatch && !view.receiverKnown && (view.sport === 'tennis' || view.sport === 'padel');
  const pair = roster(recvSide).slice(0, 2);

  return (
    <View style={st.box} accessibilityLabel="Serve and receive, next point">
      <View style={st.head}>
        <Text style={textStyles.h3}>Next point</Text>
        {view.call ? <Text style={st.callChip}>{view.call}</Text> : null}
      </View>
      <Text style={st.call}>{call}.</Text>
      {view.deciding ? <Text style={st.note}>Deciding point — the receivers choose the court.</Text> : null}
      <Court homeLineup={home} awayLineup={away} homeColor={homeColor} awayColor={awayColor} />
      {pickable && pair.length === 2 ? (
        <View style={st.pick}>
          <Text style={st.note}>Who receives in the deuce court for {teamOf(recvSide)} this set?</Text>
          <View style={st.chips}>
            {pair.map((p, i) => (
              <SelectChip key={p.id} label={p.fullName} active={false}
                onPress={() => dispatch!({ type: 'SET_SERVE_ORDER', payload: { recvSide, recvSlot: i } })} />
            ))}
          </View>
        </View>
      ) : null}
      <Text style={st.note}>Updates after every point · {teamOf('home')} at the bottom</Text>
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  call: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  callChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'],
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
  note: { color: theme.colors.textMuted, fontSize: theme.font.small },
  pick: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
