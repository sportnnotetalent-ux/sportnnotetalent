/** Snooker / billiards doubles on the scoring screen (founder 2026-11-06,
 *  docs/security/breaks/cue-doubles.md): "Kabir at the table · Change" above the
 *  sport's own controls, and every stroke sent with that player's id, so each
 *  visit is credited to who played it. Singles: the controls as they are. */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SelectChip, textStyles } from '../../components/ui';
import { theme } from '../../core/theme';
import type { ScoreAction, SportPlugin } from '../types';
import { STROKES, atTable, perSideOf } from './doubles';

type Side = 'home' | 'away';
type Controls<S> = NonNullable<SportPlugin<S>['ScoringControls']>;

export function withCueDoubles<S>(Inner: Controls<S>): Controls<S> {
  const Wrapped: Controls<S> = (props) => {
    const s = props.state as unknown as { seq?: number; frame?: { striker?: Side } | null };
    const [picked, setPicked] = useState<Record<Side, string | null>>({ home: null, away: null });
    const [changing, setChanging] = useState(false);
    // the next stroke goes back to the rotation's pick
    useEffect(() => { setPicked({ home: null, away: null }); setChanging(false); }, [s?.seq]);
    const striker = s?.frame?.striker;
    if (perSideOf(props.state) !== 2 || !striker) return <Inner {...props} />;
    const roster = (striker === 'home' ? props.homeRoster : props.awayRoster) ?? [];
    const pick = atTable(props.state, striker, roster.map((p) => p.id));
    const cur = picked[striker] ?? pick.suggested;
    const nameOf = (id: string) => roster.find((p) => p.id === id)?.fullName ?? 'Player';
    const sideName = striker === 'home' ? props.homeName : props.awayName;
    const dispatch = (a: ScoreAction) =>
      props.dispatch(STROKES.has(a.type) && cur ? { ...a, payload: { ...(a.payload ?? {}), pid: cur } } : a);
    return (
      <View style={st.wrap}>
        {pick.ids.length < 2 ? (
          <Text style={textStyles.muted}>Add both players of {sideName} to credit who’s at the table.</Text>
        ) : changing ? (
          <View style={st.chips}>
            {pick.ids.map((id) => (
              <SelectChip key={id} label={nameOf(id)} active={cur === id} onPress={() => { setPicked((x) => ({ ...x, [striker]: id })); setChanging(false); }} />
            ))}
          </View>
        ) : cur ? (
          <Text style={textStyles.muted} accessibilityLiveRegion="polite">
            <Text style={st.name}>{nameOf(cur)} at the table</Text>
            {picked[striker] ? '' : pick.keeps ? ' (the visit goes on)' : ' (partners take turns)'}{' · '}
            <Text style={st.link} accessibilityRole="button" accessibilityLabel={`Change who is at the table for ${sideName}`} onPress={() => setChanging(true)}>Change</Text>
          </Text>
        ) : null}
        <Inner {...props} dispatch={dispatch} />
      </View>
    );
  };
  return Wrapped;
}

const st = StyleSheet.create({
  wrap: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  name: { color: theme.colors.text, fontWeight: '800' },
  link: { color: theme.colors.primary, fontWeight: '700' },
});
