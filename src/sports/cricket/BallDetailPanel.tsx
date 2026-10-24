/**
 * Deep wave (cricket) — the scorer's OPTIONAL capture UI (only when switched on
 * under "Stats to track"):
 *   - BallDetailPanel: after a delivery, one tap each for the length, the line,
 *     a false shot (beaten / edged / mistimed), the speed from a speed gun, and
 *     where a catch was taken. Every tap is optional and goes away with the
 *     next ball — default scoring stays one tap per ball.
 *   - BowlTypeChips: the bowler's type (pace / spin) in one tap, once per
 *     bowler (free when the player's profile already says it).
 * Both send score-neutral `v: 2` actions (BALL_DETAIL / SET_BOWL_TYPE).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, TextField } from '../../components/ui';
import type { Player } from '../../core/types';
import type { ScoreAction } from '../types';
import type { BallRec, CricketState } from './engine';
import {
  LENGTH_LABEL, LINE_LABEL, CONTROL_LABEL, CONTROLS, BOWL_KINDS, BOWL_KIND_LABEL, BOWL_TYPE_LABEL,
  WIDE_WHY, NB_WHY, WIDE_WHY_LABEL, NB_WHY_LABEL, extraWhyOf,
  bowlTypeCode, bowlKindOf, isLeftArm, asKph, recStamp, deliveryOrdinals, fieldPosition,
  type Length, type Line, type BallDetailRec, type BowlType,
} from './detail';
import { bouncerNoteFor } from './bouncers';
import { WagonField } from './WagonWheel';
import { mirrorZone } from './wagon';

/** Chip order for a scorer: the common lengths first. */
const LEN_CHIPS: Length[] = ['yorker', 'full', 'good', 'short', 'bouncer', 'fulltoss'];
const LINE_CHIPS: Line[] = ['wideOff', 'off', 'stumps', 'leg', 'wideLeg'];

/** The last delivery the panel can tag, with its key, or null. */
export function detailTarget(s: CricketState): { rec: BallRec; d: number; at: string } | null {
  const log = s.log ?? [];
  const ords = deliveryOrdinals(log);
  for (let i = log.length - 1; i >= 0; i--) {
    if (!ords[i]) continue;
    return { rec: log[i], d: ords[i], at: recStamp(log[i], s.ballsPerOver) };
  }
  return null;
}

export function BallDetailPanel({ state, target, dispatch, lh, catchSpot, onDone }: {
  state: CricketState;
  target: { rec: BallRec; d: number; at: string };
  dispatch: (a: ScoreAction) => void;
  /** the striker bats left-handed (mirrors the catch field) */
  lh: boolean;
  /** offer "where was the catch taken?" (wagon wheel on + a catch) */
  catchSpot: boolean;
  onDone: () => void;
}) {
  const { rec, d, at } = target;
  const trk = rec.trk ?? {};
  const tag: BallDetailRec | undefined = (state.detail ?? []).find((x) => x.inn === rec.inn && x.side === rec.side && x.d === d && x.at === at);
  const send = (patch: Record<string, unknown>) => dispatch({
    type: 'BALL_DETAIL', side: rec.side,
    payload: { v: 2, inn: rec.inn, side: rec.side, d, at, ...(rec.strikerId ? { batterId: rec.strikerId } : {}), ...(rec.bowlerId ? { bowlerId: rec.bowlerId } : {}), ...patch },
  });
  const faced = rec.ext !== 'wd';
  const [kph, setKph] = useState(tag?.kph ? String(tag.kph) : '');
  useEffect(() => { setKph(tag?.kph ? String(tag.kph) : ''); }, [tag?.kph, d]);
  const n = asKph(kph);
  const any = !!(tag?.len || tag?.line || tag?.ctrl || tag?.kph || tag?.cz || tag?.why);
  const sel = tag?.cz ? { zone: lh ? mirrorZone(tag.cz) : tag.cz, deep: !!tag.cdeep } : null;
  // Round 2 — why the wide / no-ball was called (reason chips for that extra)
  const whyChips = trk.why && rec.ext ? (rec.ext === 'wd'
    ? WIDE_WHY.map((k) => ({ k: k as string, label: WIDE_WHY_LABEL[k] }))
    : NB_WHY.map((k) => ({ k: k as string, label: NB_WHY_LABEL[k] }))) : [];
  const why = extraWhyOf(rec.ext, tag?.why);
  // Round 2 — this bouncer reaches / passes the over's limit
  const bouncerNote = trk.pitch ? bouncerNoteFor(state, rec, tag?.len === 'bouncer') : null;
  return (
    <View style={st.panel}>
      <View style={st.head}>
        <Text style={st.title} numberOfLines={2}>📍 Ball {at} — detail <Text style={st.muted}>(optional)</Text></Text>
        <Button label={any ? 'Done' : 'Skip'} variant="ghost" style={st.btn} onPress={onDone} />
      </View>
      {whyChips.length ? (
        <>
          <Text style={st.muted}>Why was it {rec.ext === 'wd' ? 'a wide' : 'a no-ball'}?</Text>
          <View style={st.chips}>
            {whyChips.map(({ k, label }) => <SelectChip key={k} label={label} active={why === k} onPress={() => send({ why: why === k ? null : k })} />)}
          </View>
        </>
      ) : null}
      {trk.pitch ? (
        <>
          <Text style={st.muted}>Length</Text>
          <View style={st.chips}>
            {LEN_CHIPS.map((k) => <SelectChip key={k} label={LENGTH_LABEL[k]} active={tag?.len === k} onPress={() => send({ len: tag?.len === k ? null : k })} />)}
          </View>
          {bouncerNote ? <Text style={st.warn} accessibilityLiveRegion="polite">{bouncerNote}</Text> : null}
          <Text style={st.muted}>Line (to the batter)</Text>
          <View style={st.chips}>
            {LINE_CHIPS.map((k) => <SelectChip key={k} label={LINE_LABEL[k]} active={tag?.line === k} onPress={() => send({ line: tag?.line === k ? null : k })} />)}
          </View>
        </>
      ) : null}
      {trk.ctrl && faced ? (
        <>
          <Text style={st.muted}>False shot? (leave it if the batter was in control)</Text>
          <View style={st.chips}>
            {CONTROLS.map((k) => <SelectChip key={k} label={CONTROL_LABEL[k]} active={tag?.ctrl === k} onPress={() => send({ ctrl: tag?.ctrl === k ? null : k })} />)}
          </View>
        </>
      ) : null}
      {trk.speed ? (
        <View style={st.row}>
          <View style={{ flex: 1 }}>
            <TextField label="" value={kph} onChange={(t) => setKph(t.replace(/[^0-9]/g, '').slice(0, 3))} placeholder="Speed, km/h (40–180)" autoCapitalize="none" />
          </View>
          <Button label={tag?.kph && n === tag.kph ? `✓ ${tag.kph}` : 'Save'} variant="ghost" disabled={n === null || n === tag?.kph}
            onPress={() => { if (n !== null) send({ kph: n }); }} />
        </View>
      ) : null}
      {catchSpot ? (
        <>
          <Text style={st.muted}>Where was the catch taken?{tag?.cz ? ` ✓ ${fieldPosition(tag.cz, tag.cdeep)}` : ''}</Text>
          <WagonField lh={lh} selected={sel} onPick={(z, deep) => send({ cz: lh ? mirrorZone(z) : z, cdeep: deep ? true : null })} />
        </>
      ) : null}
    </View>
  );
}

/** One tap per bowler: Fast / Medium / Finger spin / Wrist spin (+ left-arm).
 *  Collapses to the type once set; "Change" reopens it. */
export function BowlTypeChips({ id, name, current, profileLeft, dispatch }: {
  id: string; name: string; current?: BowlType; profileLeft?: boolean;
  dispatch: (a: ScoreAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState<boolean>(current ? isLeftArm(current) : !!profileLeft);
  useEffect(() => { setOpen(false); setLeft(current ? isLeftArm(current) : !!profileLeft); }, [id, current, profileLeft]);
  if (current && !open) {
    return (
      <View style={[st.row, { alignItems: 'center' }]}>
        <Text style={[st.muted, { flex: 1 }]} numberOfLines={1}>{name}: {BOWL_TYPE_LABEL[current]}</Text>
        <Button label="Change" variant="ghost" style={st.btn} accessibilityLabel={`Change ${name}'s bowling type`} onPress={() => setOpen(true)} />
      </View>
    );
  }
  // IDs-only scoring: the bowler by id only (`name` is for this screen)
  const set = (t: BowlType | null) => { dispatch({ type: 'SET_BOWL_TYPE', payload: { v: 2, id, btype: t } }); setOpen(false); };
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Text style={st.muted}>{name}’s bowling type (optional)</Text>
      <View style={st.chips}>
        <SelectChip label="Left-arm" active={left} onPress={() => setLeft((v) => !v)} />
        {BOWL_KINDS.map((k) => (
          <SelectChip key={k} label={BOWL_KIND_LABEL[k]} active={!!current && bowlKindOf(current) === k && isLeftArm(current) === left}
            onPress={() => set(bowlTypeCode(k, left))} />
        ))}
        {current ? <SelectChip label="Clear" active={false} onPress={() => set(null)} /> : null}
      </View>
    </View>
  );
}

/** Is this roster player a left-arm bowler / left-handed batter per their profile? */
export const profileLeftArm = (p?: Player) => p?.sportDetails?.cricket?.sides?.bowl === 'Left-arm';

const st = StyleSheet.create({
  panel: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  title: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.small },
  warn: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'center' },
  btn: { paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3) },
});
