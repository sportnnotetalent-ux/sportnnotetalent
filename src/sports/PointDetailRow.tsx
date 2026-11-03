/**
 * SD-107 — the optional "How was it won?" card under a racket sport's
 * scoring buttons (badminton, table tennis, squash, padel, pickleball; tennis
 * has its own, tennis/PointCapture.tsx). The default stays one tap (who won
 * the rally); with any "Stats to track" option on, this card describes the
 * LAST rally, progressively and skippably:
 *   How (Winner / Forced error / Unforced error / Ace / Service winner /
 *   Service fault, as the sport has them and as the rally's server allows;
 *   squash Stroke / No let) → Forehand / Backhand → the sport's shot (smash,
 *   net kill, loop, chop, boast, nick, bandeja, víbora, dink, erne …) → for an
 *   unforced or forced error its type (into the net, out, tin, kitchen …), for
 *   a service fault its type (above 1.15 m, foot fault, illegal serve …) → by
 *   whom (doubles errors, and doubles winners: racket-depth RD4, new matches
 *   only); "Lost by rule" with the sport's own examples (RD2); plus padel's 2nd serve, who was at the net (padel)
 *   / the kitchen line (pickleball), the rally length, and pickleball's 3rd
 *   shot when those options are on.
 * Round 2: the Rally chips offer the match's bucket scheme (`rallyBuckets`,
 * an organiser option); pickleball's kitchen-line row adds "Nobody" (nobody
 * got to the kitchen line), which is what kitchen ARRIVAL % is read from.
 * Every tap dispatches POINT_DETAIL (annotates that rally; no score effect;
 * undo removes it). The options live in the Scoring settings card and in the
 * "Extra stats: Choose" chips here (SET_DETAIL: from the next rally).
 * See pointDetail.ts for the model and racketMatchStats.ts for the figures.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { FadeInLine } from '../components/pressFeedback';
import { SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import type { LiveEvent } from './liveEvents';
import type { ScoreAction } from './types';
import { pointRows, type EditRow } from './rallyEdit';
import { serveStats } from './serveStats';
import {
  DETAIL_HOWS, NET_WORDS, RALLY_LABEL, RACKET_SHOTS, STROKES, THIRD_LABEL, THIRD_SHOTS, TT_PHASE_LABEL, WINGS, WING_LABEL,
  errTypeOf, hasNobodyMark, howDef, pdText, rallyBucketsOf, shotOf, toggleNet, toggleNobody, winnerSide,
  type DepthSport, type How, type PointDetail, type Wing,
} from './pointDetail';
import { trackFields } from './pointDetailSettings';
import { useMask } from '../core/disputeMask';
import { whoName, withRosters } from './racketNames';
import { errOf } from './racketActions';

type Side = 'home' | 'away';
type Flags = { pointDetail?: boolean; serveDetail?: boolean; netDetail?: boolean; rallyDetail?: boolean; thirdDetail?: boolean; rallyBuckets?: string };

export function PointDetailRow({
  sport, state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [], rowsOf = pointRows,
}: {
  sport: DepthSport;
  state: { events: LiveEvent[]; ended?: boolean } & Flags;
  dispatch: (a: ScoreAction) => void;
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** the describable rows of the log (rally engine: side-out rallies too) */
  rowsOf?: (events: LiveEvent[]) => EditRow[];
}) {
  const fields = trackFields(sport);
  const on = Object.fromEntries(fields.map((f) => [f.key, state[f.key as keyof Flags] === true])) as Record<string, boolean>;
  const anyOn = fields.some((f) => on[f.key]);
  const [skipped, setSkipped] = useState<number | null>(null);
  const [choose, setChoose] = useState(false);
  const rows = rowsOf(state.events ?? []);
  const last = rows[rows.length - 1];
  // Who served the last rally: offers Ace / Service winner only to the
  // server, a service fault only to the receiver. Re-derived when a rally is added.
  const n = state.events?.length ?? 0;
  const server = useMemo(() => (on.pointDetail ? serveStats(sport, state)?.last?.server : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sport, n, on.pointDetail]);

  const nameOf = (side: Side) => (side === 'home' ? homeName : awayName);
  // IDs-only scoring: the rally's player by id for this viewer
  const mask = useMask();
  const tracking = fields.filter((f) => on[f.key]).map((f) => f.label);
  const options = (
    <View style={st.optRow}>
      <Text style={st.meta} numberOfLines={2}>📊 Extra stats: {tracking.length ? tracking.join(', ') : 'off'}</Text>
      <Text style={st.link} onPress={() => setChoose((x) => !x)} accessibilityRole="button" accessibilityLabel={choose ? 'Done choosing extra stats' : 'Choose extra stats to track'}>
        {choose ? 'Done' : 'Choose'}
      </Text>
    </View>
  );
  const chooser = choose ? (
    <View style={st.chips}>
      {fields.map((f) => (
        <SelectChip key={f.key} label={f.label} active={on[f.key]} onPress={() => dispatch({ type: 'SET_DETAIL', payload: { [f.key]: !on[f.key] } })} />
      ))}
    </View>
  ) : null;

  const e = last?.e;
  const W = e ? (winnerSide(e) as Side | undefined) : undefined;
  if (!e || !anyOn || e.df || e.pen || skipped === e.id || (W !== 'home' && W !== 'away')) {
    return <View style={st.bare}>{options}{chooser}</View>;
  }
  const L: Side = W === 'home' ? 'away' : 'home';
  const loserRoster = L === 'home' ? homeRoster : awayRoster;
  const winnerRoster = W === 'home' ? homeRoster : awayRoster;
  const pd = e.pd;
  const hows = on.pointDetail ? DETAIL_HOWS[sport].filter((h) => !h.serve || !server || (h.serve === 'server' ? server === W : server !== W)) : [];
  const sel = pd ? howDef(sport, pd.how) : undefined;
  const cur = shotOf(sport, pd);
  const et = errTypeOf(sport, pd);
  const send = (payload: Record<string, unknown>) => dispatch({ type: 'POINT_DETAIL', payload });
  // singles: the erring player is the opponent; doubles: pick (optional)
  // IDs-only scoring: the erring player by id (match state is public)
  const soloErr = loserRoster.length === 1 ? errOf(loserRoster[0]) : undefined;
  const pick = (how: How) => {
    if (pd?.how === how) return send({ pd: null });
    const d = howDef(sport, how);
    // keep the wing / shot already picked when switching between winner / errors
    const keep = d?.wingShot && sel?.wingShot ? { ...(cur.wing ? { wing: cur.wing } : {}), ...(cur.shot ? { shot: cur.shot } : {}) } : {};
    // racket-depth RD8: an error's type carries over between unforced / forced,
    // the hitter between the winner hows
    const keepType = et && d?.strokes?.includes(et) && (how === 'ue' || how === 'fe') ? { stroke: et } : {};
    const keepBy = d?.credit === 'winner' && pd?.by ? { by: pd.by } : {};
    send({ pd: { how, ...keep, ...keepType, ...keepBy, ...(d?.credit === 'loser' && soloErr ? { err: soloErr } : {}) } });
  };
  /** a new wing / shot on the detail (an older winner stroke id is normalised;
   *  an error's type is kept) */
  const setStroke = (patch: { wing?: Wing | null; shot?: string | null }) => {
    if (!pd) return;
    const { stroke: _legacy, wing: _w, shot: _s, ...rest } = pd;
    const wing = patch.wing === undefined ? cur.wing : patch.wing ?? undefined;
    const shot = patch.shot === undefined ? cur.shot : patch.shot ?? undefined;
    const next = { ...rest, ...(et ? { stroke: et } : {}), ...(wing ? { wing } : {}), ...(shot ? { shot } : {}) } as PointDetail;
    send({ pd: next });
  };
  const setType = (k: string) => {
    if (!pd) return;
    const { stroke: _s, ...rest } = pd;
    send({ pd: { ...rest, ...(et === k ? {} : { stroke: k }), ...(cur.wing ? { wing: cur.wing } : {}), ...(cur.shot ? { shot: cur.shot } : {}) } });
  };
  const serve2 = on.serveDetail && (e.serve === 1 || e.serve === 2);
  const nw = NET_WORDS[sport];
  const third = sport === 'pickleball' && on.thirdDetail;
  if (!hows.length && !pd && !serve2 && !(nw && on.netDetail) && !on.rallyDetail && !third) {
    return <View style={st.bare}>{options}{chooser}</View>;
  }
  const viewer = withRosters(mask.nameOf, homeRoster, awayRoster);
  // racket-depth RD4: a named hitter first (new matches), else the point's player
  const credited = (pd?.by ? whoName(viewer, pd.by) : undefined) || (e.kind !== 'rally' ? whoName(viewer, e.playerId, e.playerName) : undefined);
  const who = credited || (winnerRoster.length === 1 ? winnerRoster[0].fullName : nameOf(W));
  const bucketText = (b: keyof typeof RALLY_LABEL) => (sport === 'tabletennis' ? TT_PHASE_LABEL[b] ?? RALLY_LABEL[b] : RALLY_LABEL[b]);
  const summary = [
    pd ? pdText(pd, true, sport, viewer) : '',
    e.serve === 2 ? '2nd serve' : '',
    !nw || !e.atNet ? '' : e.atNet === 'none' ? `nobody ${nw.at.toLowerCase()}`
      : `${nw.at.toLowerCase()}: ${e.atNet === 'both' ? 'both' : nameOf(e.atNet)}`,
    e.rallyLen ? bucketText(e.rallyLen) : '',
    e.third ? THIRD_LABEL[e.third] : '',
  ].filter(Boolean).join(' · ');

  return (
    <View style={st.box} accessibilityLabel="Describe the last rally">
      {options}
      {chooser}
      <View style={st.head}>
        <Text style={st.label} numberOfLines={1}>Last {e.kind === 'rally' ? 'rally' : 'point'} · {who}</Text>
        <Text style={st.link} onPress={() => setSkipped(e.id)} accessibilityRole="button" accessibilityLabel="Skip describing this rally">Skip</Text>
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
              <SelectChip key={w} label={WING_LABEL[w]} active={cur.wing === w} onPress={() => setStroke({ wing: cur.wing === w ? null : w })} />
            ))}
          </View>
          <View style={st.chips}>
            {RACKET_SHOTS[sport].map((k) => (
              <SelectChip key={k.id} label={k.chip} active={cur.shot === k.id} onPress={() => setStroke({ shot: cur.shot === k.id ? null : k.id })} />
            ))}
          </View>
        </>
      )}
      {sel?.hint && pd ? <Text style={st.meta}>{sel.hint}</Text> : null}
      {sel?.strokes && pd && (pd.how === 'ue' || pd.how === 'fe' || pd.how === 'sf') && (
        <View style={st.chips}>
          <Text style={[st.meta, st.rowLabel]}>{pd.how === 'sf' ? 'Fault:' : 'Error:'}</Text>
          {/* racket-batch5 RB9: the types offered (an older type only on its own point) */}
          {(sel.offer ?? sel.strokes).concat(et && sel.offer && !sel.offer.includes(et) && sel.strokes.includes(et) ? [et] : []).map((k) => (
            <SelectChip key={k} label={STROKES[k]?.chip ?? k} active={et === k} onPress={() => setType(k)} />
          ))}
        </View>
      )}
      {sel?.credit === 'winner' && pd && winnerRoster.length >= 2 && (
        <View style={st.chips}>
          <Text style={[st.meta, st.rowLabel]}>By:</Text>
          {winnerRoster.map((p) => (
            <SelectChip key={p.id} label={p.fullName} active={pd.by === p.id} accessibilityLabel={`Hit by ${p.fullName}`}
              onPress={() => { const { by: _b, ...rest } = pd; send({ pd: pd.by === p.id ? rest : { ...rest, by: p.id } }); }} />
          ))}
        </View>
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
      {nw && on.netDetail && (
        <View style={st.chips}>
          <Text style={[st.meta, st.rowLabel]}>{nw.at}:</Text>
          {(['home', 'away'] as Side[]).map((side) => (
            <SelectChip key={side} label={nameOf(side)} active={e.atNet === side || e.atNet === 'both'}
              accessibilityLabel={`${nameOf(side)}: ${nw.at.toLowerCase()}`} onPress={() => send({ atNet: toggleNet(e.atNet, side) })} />
          ))}
          {hasNobodyMark(sport) && (
            <SelectChip label="Nobody" active={e.atNet === 'none'}
              accessibilityLabel={`Nobody got ${nw.at.toLowerCase().replace(/^at /, 'to ')}`} onPress={() => send({ atNet: toggleNobody(e.atNet) })} />
          )}
        </View>
      )}
      {on.rallyDetail && (
        <View style={st.chips}>
          <Text style={[st.meta, st.rowLabel]}>Rally:</Text>
          {rallyBucketsOf(sport, state.rallyBuckets).map((b) => (
            <SelectChip key={b} label={bucketText(b)} active={e.rallyLen === b} onPress={() => send({ rallyLen: e.rallyLen === b ? null : b })} />
          ))}
        </View>
      )}
      {third && (
        <View style={st.chips}>
          <Text style={[st.meta, st.rowLabel]}>3rd shot:</Text>
          {THIRD_SHOTS.map((k) => (
            <SelectChip key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} active={e.third === k}
              accessibilityLabel={THIRD_LABEL[k]} onPress={() => send({ third: e.third === k ? null : k })} />
          ))}
        </View>
      )}
      {summary ? <FadeInLine id={summary}><Text style={st.meta}>✓ {summary}</Text></FadeInLine> : null}
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
});
