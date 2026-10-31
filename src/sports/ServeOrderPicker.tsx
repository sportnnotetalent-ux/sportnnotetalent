/**
 * SD-104 — doubles serving order (tennis / padel). At the start of every set
 * each pair chooses which of its two players serves its first service game
 * (ITF Rules 5–6, FIP). Shown before the set's first point; a pick dispatches
 * SET_SERVE_ORDER { side, slot } and serve.ts rotates from it. Without a pick
 * the roster order applies (the chip shown as chosen).
 *
 * 2026-10-22 — and, optionally, who receives in the deuce court (ITF Rule 14:
 * kept for the set). Display only — it names the receiver in the Score tab's
 * serve diagram; SET_SERVE_ORDER { recvSide, recvSlot }. No pick → "?" there.
 *
 * MVP T3 — the receiving pair may pick until its first service game (game 2);
 * once a pair has served, "Fix serving order" sends a v:2 fix (the score stays;
 * that set's aces and double faults move to the right partner — serve.ts).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import type { ScoreAction } from './types';
import { serveOrderAction } from './racketActions';
import { serveOrderOpen, serveOrderOpenFor, setFirstSlot, deuceReceiverSlot, type ServeState } from './serve';

export function ServeOrderPicker({
  state, homeName, awayName, homeRoster, awayRoster, dispatch, icon,
}: {
  state: ServeState & { ended?: boolean; doubles?: boolean };
  homeName: string;
  awayName: string;
  homeRoster: Player[];
  awayRoster: Player[];
  dispatch: (a: ScoreAction) => void;
  icon: string;
}) {
  const [fixing, setFixing] = useState(false);
  const sides = (['home', 'away'] as const).filter((t) => (t === 'home' ? homeRoster : awayRoster).length >= 2);
  if (sides.length === 0 || !state.doubles || state.ended) return null;
  const setNo = state.sets.length + 1;
  // Pairs that have already served this set: their order can only be fixed.
  const late = sides.filter((t) => !serveOrderOpenFor(state, t));
  const fixBox = late.length ? (
    <View style={st.box}>
      <SelectChip label={`✎ Fix serving order — set ${setNo}`} active={fixing} onPress={() => setFixing(!fixing)} />
      {fixing ? (
        <>
          <Text style={st.meta}>Who served this pair’s first game of the set? The score stays the same; this set’s aces and double faults move to the right player.</Text>
          {late.map((t) => {
            const roster = (t === 'home' ? homeRoster : awayRoster).slice(0, 2);
            const cur = setFirstSlot(state, t);
            return (
              <View key={`f-${t}`} style={st.chips}>
                <Text style={[st.meta, st.team]}>{t === 'home' ? homeName : awayName}:</Text>
                {roster.map((p, slot) => (
                  <SelectChip key={p.id} label={p.fullName} active={cur === slot}
                    onPress={() => { if (cur !== slot) dispatch(serveOrderAction(t, slot, p, roster[1 - slot])); setFixing(false); }} />
                ))}
              </View>
            );
          })}
        </>
      ) : null}
    </View>
  ) : null;
  if (!serveOrderOpen(state)) return fixBox;
  const open = sides.filter((t) => serveOrderOpenFor(state, t));
  return (
    <View style={st.box}>
      <Text style={st.label}>{icon} Serving order — set {setNo}</Text>
      <Text style={st.meta}>Each pair picks who serves its first game of this set. Partners then take turns.</Text>
      {open.map((t) => {
        const roster = (t === 'home' ? homeRoster : awayRoster).slice(0, 2);
        const cur = setFirstSlot(state, t);
        return (
          <View key={t} style={st.chips}>
            <Text style={[st.meta, st.team]}>{t === 'home' ? homeName : awayName}:</Text>
            {roster.map((p, slot) => (
              <SelectChip key={p.id} label={p.fullName} active={cur === slot}
                onPress={() => dispatch(serveOrderAction(t, slot, p))} />
            ))}
          </View>
        );
      })}
      <Text style={st.meta}>Optional: who receives in the deuce court this set (names the receiver on the Score tab).</Text>
      {sides.map((t) => {
        const roster = (t === 'home' ? homeRoster : awayRoster).slice(0, 2);
        const cur = deuceReceiverSlot(state, t);
        return (
          <View key={`r-${t}`} style={st.chips}>
            <Text style={[st.meta, st.team]}>{t === 'home' ? homeName : awayName} · deuce court:</Text>
            {roster.map((p, slot) => (
              <SelectChip key={p.id} label={p.fullName} active={cur === slot}
                onPress={() => dispatch({ type: 'SET_SERVE_ORDER', payload: { recvSide: t, recvSlot: slot } })} />
            ))}
          </View>
        );
      })}
      {fixBox}
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  team: { alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
