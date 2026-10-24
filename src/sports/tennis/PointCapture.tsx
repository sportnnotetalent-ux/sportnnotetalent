/**
 * SD-157 — tennis' optional point capture, under the point buttons. Scoring
 * stays ONE tap (who won the point); with any "Stats to track" option on,
 * this card describes the LAST point, progressively and skippably:
 *   How (Service winner / Winner / Forced error / Unforced error — Ace and
 *   Double fault keep their own one-tap buttons) → Forehand / Backhand →
 *   Shot (optional); plus 2nd serve, who came to the net, rally length and
 *   the serve's km/h when those options are on.
 * Every tap dispatches POINT_DETAIL (annotates that point; no score effect;
 * undo removes it). The options themselves live in the Scoring settings card
 * and in the "Extra stats" chips here (SET_DETAIL: from the next point).
 * Round 2: the serve speed is typed in the match's unit — km/h or mph, with a
 * one-tap switch beside the box (SET_DETAIL speedUnit) — and stored in km/h;
 * the Rally chips offer the match's bucket scheme (`rallyBuckets`).
 * See pointDetail.ts for the model and tennis/matchStats.ts for the figures.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import type { Player } from '../../core/types';
import type { ScoreAction } from '../types';
import { pointRows } from '../rallyEdit';
import { serveStats } from '../serveStats';
import {
  DETAIL_HOWS, RALLY_LABEL, SHOTS, SHOT_LABEL, SPEED_UNITS, SPEED_UNIT_LABEL, WINGS, WING_LABEL,
  howDef, pdText, rallyBucketsOf, speedIn, speedRange, speedText, speedUnitOf, strokeOf, toggleNet, validSpeed, winnerSide,
  type How, type PointDetail, type Shot, type SpeedUnit, type Wing,
} from '../pointDetail';
import { TENNIS_TRACK_FIELDS } from '../pointDetailSettings';
import { useMask } from '../../core/disputeMask';
import { whoName, withRosters } from '../racketNames';
import { errOf } from '../racketActions';
import type { TennisState } from './engine';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export function TennisPointDetail({
  state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [],
}: {
  state: TennisState;
  dispatch: (a: ScoreAction) => void;
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
}) {
  const s = state;
  const on = {
    pointDetail: s.pointDetail === true, serveDetail: s.serveDetail === true,
    netDetail: s.netDetail === true, rallyDetail: s.rallyDetail === true, speedDetail: s.speedDetail === true,
  };
  const anyOn = Object.values(on).some(Boolean);
  const [skipped, setSkipped] = useState<number | null>(null);
  const [choose, setChoose] = useState(false);
  const rows = pointRows(s.events ?? []);
  const last = rows[rows.length - 1];
  // Who served the last point: Service winner only for the server's side.
  const n = s.events?.length ?? 0;
  const server = useMemo(() => (on.pointDetail ? serveStats('tennis', s)?.last?.server : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, on.pointDetail]);

  const nameOf = (side: Side) => (side === 'home' ? homeName : awayName);
  // IDs-only scoring: the point's player by id for this viewer
  const mask = useMask();
  const tracking = TENNIS_TRACK_FIELDS.filter((f) => on[f.key]).map((f) => f.label);
  const options = (
    <View style={st.optRow}>
      <Text style={st.meta} numberOfLines={2}>📊 Extra stats: {tracking.length ? tracking.join(', ') : 'off'}</Text>
      <Text style={st.link} onPress={() => setChoose((v) => !v)} accessibilityRole="button" accessibilityLabel={choose ? 'Done choosing extra stats' : 'Choose extra stats to track'}>
        {choose ? 'Done' : 'Choose'}
      </Text>
    </View>
  );
  const chooser = choose ? (
    <View style={st.chips}>
      {TENNIS_TRACK_FIELDS.map((f) => (
        <SelectChip key={f.key} label={f.label} active={on[f.key]} onPress={() => dispatch({ type: 'SET_DETAIL', payload: { [f.key]: !on[f.key] } })} />
      ))}
    </View>
  ) : null;

  const e = last?.e;
  const W = e ? (winnerSide(e) as Side | undefined) : undefined;
  if (!e || !anyOn || e.df || e.pen || skipped === e.id || (W !== 'home' && W !== 'away')) {
    return <View style={st.bare}>{options}{chooser}</View>;
  }
  const L = opp(W);
  const loserRoster = L === 'home' ? homeRoster : awayRoster;
  const winnerRoster = W === 'home' ? homeRoster : awayRoster;
  const pd = e.pd;
  const isAce = e.kind === 'ace';
  const hows = on.pointDetail && !isAce ? DETAIL_HOWS.tennis.filter((h) => !h.serve || !server || (h.serve === 'server' ? server === W : server !== W)) : [];
  const sel = pd ? howDef('tennis', pd.how) : undefined;
  const stroke = strokeOf(pd);
  const send = (payload: Record<string, unknown>) => dispatch({ type: 'POINT_DETAIL', payload });
  // singles: the erring player is the opponent; doubles: pick (optional)
  // IDs-only scoring: the erring player by id (match state is public)
  const soloErr = loserRoster.length === 1 ? errOf(loserRoster[0]) : undefined;
  const pick = (how: How) => {
    if (pd?.how === how) return send({ pd: null });
    const d = howDef('tennis', how);
    // keep the wing / shot already picked when switching between winner / errors
    const keep = d?.wingShot && sel?.wingShot ? { ...(stroke.wing ? { wing: stroke.wing } : {}), ...(stroke.shot ? { shot: stroke.shot } : {}) } : {};
    send({ pd: { how, ...keep, ...(d?.credit === 'loser' && soloErr ? { err: soloErr } : {}) } });
  };
  /** a new wing / shot on the detail (a legacy stroke id is normalised first) */
  const setStroke = (patch: { wing?: Wing | null; shot?: Shot | null }) => {
    if (!pd) return;
    const { stroke: _legacy, wing: _w, shot: _s, ...rest } = pd;
    const wing = patch.wing === undefined ? stroke.wing : patch.wing ?? undefined;
    const shot = patch.shot === undefined ? stroke.shot : patch.shot ?? undefined;
    const next: PointDetail = { ...rest, ...(wing ? { wing } : {}), ...(shot ? { shot } : {}) };
    send({ pd: next });
  };
  const serve2 = on.serveDetail && (e.serve === 1 || e.serve === 2);
  const unit = speedUnitOf(s);
  // nothing to describe on this point (an ace with only point detail on …)
  if (!hows.length && !pd && !serve2 && !on.netDetail && !on.rallyDetail && !on.speedDetail) {
    return <View style={st.bare}>{options}{chooser}</View>;
  }
  const credited = e.kind !== 'rally' ? whoName(withRosters(mask.nameOf, homeRoster, awayRoster), e.playerId, e.playerName) : undefined;
  const who = credited || (winnerRoster.length === 1 ? winnerRoster[0].fullName : nameOf(W));
  const summary = [
    pd ? pdText(pd, true, undefined, withRosters(mask.nameOf, homeRoster, awayRoster)) : isAce ? 'Ace' : '',
    e.serve === 2 ? '2nd serve' : '',
    e.atNet === 'home' || e.atNet === 'away' ? `at the net: ${nameOf(e.atNet)}` : e.atNet === 'both' ? 'at the net: both' : '',
    e.rallyLen ? RALLY_LABEL[e.rallyLen] : '',
    typeof e.kmh === 'number' ? speedText(e.kmh, unit) : '',
  ].filter(Boolean).join(' · ');

  return (
    <View style={st.box} accessibilityLabel="Describe the last point">
      {options}
      {chooser}
      <View style={st.head}>
        <Text style={st.label} numberOfLines={1}>Last point · {who}{isAce ? ' · ace' : ''}</Text>
        <Text style={st.link} onPress={() => setSkipped(e.id)} accessibilityRole="button" accessibilityLabel="Skip describing this point">Skip</Text>
      </View>
      {hows.length > 0 && (
        <View style={st.chips}>
          {hows.map((h) => <SelectChip key={h.how} label={h.chip} active={pd?.how === h.how} onPress={() => pick(h.how)} />)}
        </View>
      )}
      {sel?.wingShot && pd && (
        <>
          <View style={st.chips}>
            {WINGS.map((w) => (
              <SelectChip key={w} label={WING_LABEL[w]} active={stroke.wing === w} onPress={() => setStroke({ wing: stroke.wing === w ? null : w })} />
            ))}
          </View>
          <View style={st.chips}>
            {SHOTS.map((k) => (
              <SelectChip key={k} label={SHOT_LABEL[k].chip} active={stroke.shot === k} onPress={() => setStroke({ shot: stroke.shot === k ? null : k })} />
            ))}
          </View>
        </>
      )}
      {sel?.credit === 'loser' && pd && loserRoster.length >= 2 && (
        <View style={st.chips}>
          <Text style={[st.meta, st.rowLabel]}>By:</Text>
          {loserRoster.map((p) => (
            <SelectChip key={p.id} label={p.fullName} active={pd.err?.playerId === p.id}
              onPress={() => send({ pd: { ...pd, err: pd.err?.playerId === p.id ? undefined : errOf(p) } })} />
          ))}
        </View>
      )}
      {serve2 && (
        <View style={st.chips}>
          <SelectChip label="2nd serve" active={e.serve === 2} onPress={() => send({ serve: e.serve === 2 ? 1 : 2 })} />
        </View>
      )}
      {on.netDetail && (
        <View style={st.chips}>
          <Text style={[st.meta, st.rowLabel]}>At the net:</Text>
          {(['home', 'away'] as Side[]).map((side) => (
            <SelectChip key={side} label={nameOf(side)} active={e.atNet === side || e.atNet === 'both'}
              accessibilityLabel={`${nameOf(side)} came to the net`} onPress={() => send({ atNet: toggleNet(e.atNet, side) })} />
          ))}
        </View>
      )}
      {on.rallyDetail && (
        <View style={st.chips}>
          <Text style={[st.meta, st.rowLabel]}>Rally:</Text>
          {rallyBucketsOf('tennis', (s as { rallyBuckets?: unknown }).rallyBuckets).map((b) => (
            <SelectChip key={b} label={RALLY_LABEL[b]} active={e.rallyLen === b} onPress={() => send({ rallyLen: e.rallyLen === b ? null : b })} />
          ))}
        </View>
      )}
      {on.speedDetail && (
        <SpeedInput key={`${e.id}:${unit}`} value={e.kmh} unit={unit} onValid={(kmh) => send({ kmh })} onClear={() => send({ kmh: null })}
          onUnit={(u) => dispatch({ type: 'SET_DETAIL', payload: { speedUnit: u } })} />
      )}
      {summary ? <Text style={st.meta}>✓ {summary}</Text> : null}
    </View>
  );
}

/** The serve's speed for the last point, typed in the match's unit (km/h or
 *  mph): dispatched in km/h as soon as the typed value is plausible (30–270
 *  km/h, 19–168 mph), so it always lands on this point. The unit chip
 *  switches the match's unit (the stored km/h is unchanged). */
function SpeedInput({ value, unit, onValid, onClear, onUnit }: {
  value?: number; unit: SpeedUnit; onValid: (kmh: number) => void; onClear: () => void; onUnit: (u: SpeedUnit) => void;
}) {
  const [txt, setTxt] = useState(typeof value === 'number' ? String(speedIn(value, unit)) : '');
  const bad = txt.trim() !== '' && validSpeed(txt, unit) === undefined;
  const [lo, hi] = speedRange(unit);
  const words = unit === 'mph' ? 'miles per hour' : 'kilometres per hour';
  return (
    <View style={st.chips}>
      <Text style={[st.meta, st.rowLabel]}>Serve speed:</Text>
      <TextInput
        value={txt}
        onChangeText={(t) => {
          const clean = t.replace(/[^0-9]/g, '').slice(0, 3);
          setTxt(clean);
          const ok = validSpeed(clean, unit);
          if (ok !== undefined && ok !== value) onValid(ok);
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={3}
        placeholder={SPEED_UNIT_LABEL[unit]}
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel={`Serve speed in ${words}`}
        style={[st.input, bad && st.inputBad]}
      />
      {SPEED_UNITS.map((u) => (
        <SelectChip key={u} label={SPEED_UNIT_LABEL[u]} active={unit === u}
          accessibilityLabel={`Type serve speeds in ${SPEED_UNIT_LABEL[u]}`} onPress={() => { if (u !== unit) onUnit(u); }} />
      ))}
      {typeof value === 'number' && (
        <SelectChip label="Clear" active={false} accessibilityLabel="Clear the serve speed" onPress={() => { setTxt(''); onClear(); }} />
      )}
      {bad ? <Text style={[st.err, st.rowLabel]}>Type {lo}–{hi}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  bare: { gap: theme.spacing(2) },
  box: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  optRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  label: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small, flexShrink: 1 },
  rowLabel: { alignSelf: 'center' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  input: {
    minWidth: 84, minHeight: 44, paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.sm, borderWidth: 1,
    borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.surface, color: theme.colors.text, fontSize: theme.font.body,
  },
  inputBad: { borderColor: theme.colors.danger },
  err: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
});
