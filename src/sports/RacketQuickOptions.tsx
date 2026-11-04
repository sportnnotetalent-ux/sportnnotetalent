/**
 * SD-53 / SD-54 — the racket sports' Quick options tiles (never next to the
 * point buttons): conduct / cards / penalties (tennis + padel code violations,
 * table tennis cards, badminton misconduct, squash conduct, pickleball
 * technicals), tennis time violations, and timeouts (table tennis 1 per match,
 * pickleball 2 per game / 3 to 21 + medical, tennis medical / toilet markers;
 * badminton: a note — it has none).
 *
 * The schedule suggests the next level ("2nd code violation → point
 * penalty"); the scorer can pick another. A default / disqualification asks
 * first (askConfirm) and then ends the match by hand through the screen's
 * Match controls path (manual result "Default"). Everything else is one step
 * Undo takes back. Rules and reducer step: conduct.ts.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, SelectChip, textStyles } from '../components/ui';
import { Tile } from '../components/QuickOptionsSheet';
import { askConfirm } from '../components/ConfirmSheet';
import type { Player } from '../core/types';
import type { LiveEvent } from './liveEvents';
import type { QuickOptionsProps } from './types';
import { conductAction, timeoutAction } from './racketActions';
import {
  CONDUCT_RULES, INJURY_RULES, TIME_SPORTS, TIME_VIOLATION, TIMEOUT_ICON, TIMEOUT_LABEL, TIMEOUT_RULES,
  conductCount, conductLabel, levelDef, reviewsLeft, suggestLevel, suggestionText, timeRule, timeoutsLeft,
  type ConductLevel, type ConductTrack, type InjuryCat, type RacketSport, type TimeoutKind,
} from './conduct';
import { ttExpediteAllowed } from './tabletennis/serve';

/** racket-batch5 RB12 — the sports whose Let marker is a Quick options tile
 *  (squash has its Let buttons beside the point buttons). */
export const LET_TILE_SPORTS: readonly RacketSport[] = ['tabletennis', 'badminton'];
// racket-batch6 — + badminton shuttle change, squash injury, table tennis expedite
type Extra = 'let' | 'review' | 'shuttle' | 'injury' | 'expedite';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export interface RacketQuickHelpers {
  /** tennis / padel time violations: who is serving now (server → fault, receiver → point) */
  serverOf?: (state: unknown) => Side | null;
  /** per-game timeout allowances: the game in play and its target */
  gameOf?: (state: unknown) => { game?: number; target?: number };
}

export function makeRacketQuickOptions(sport: RacketSport, h: RacketQuickHelpers = {}): React.FC<QuickOptionsProps> {
  const rules = CONDUCT_RULES[sport];
  const tmo = TIMEOUT_RULES[sport];

  function RacketQuickOptions({ state, dispatch, homeRoster, awayRoster, homeName, awayName, onDone, onEndMatch }: QuickOptionsProps) {
    const s = state as { events?: LiveEvent[]; ended?: boolean };
    const events = s.events ?? [];
    const [open, setOpen] = useState<null | ConductTrack | TimeoutKind | Extra>(null);
    const [side, setSide] = useState<Side | null>(null);
    const [player, setPlayer] = useState<Player | null>(null);
    const [level, setLevel] = useState<ConductLevel | null>(null);
    const [reason, setReason] = useState<string | null>(null);
    const [cat, setCat] = useState<InjuryCat | null>(null);
    const [inRally, setInRally] = useState(false);
    if (s.ended) return null;

    const nameOf = (x: Side) => (x === 'home' ? homeName : awayName);
    const rosterOf = (x: Side) => (x === 'home' ? homeRoster : awayRoster);
    const toggle = (k: ConductTrack | TimeoutKind | Extra) => {
      setSide(null); setPlayer(null); setLevel(null); setReason(null); setCat(null); setInRally(false);
      setOpen((o) => (o === k ? null : k));
    };
    const pickSide = (x: Side) => {
      setSide(x); setLevel(null);
      const r = rosterOf(x);
      setPlayer(r.length === 1 ? r[0] : null); // singles: the only player
    };
    const sideChips = (
      <View style={st.chips}>
        {(['home', 'away'] as const).map((x) => <SelectChip key={x} label={nameOf(x)} active={side === x} onPress={() => pickSide(x)} />)}
      </View>
    );
    const playerChips = side && rosterOf(side).length > 1 ? (
      <View style={st.chips}>
        {rosterOf(side).map((p) => <SelectChip key={p.id} label={p.fullName} active={player?.id === p.id} onPress={() => setPlayer(player?.id === p.id ? null : p)} />)}
      </View>
    ) : null;

    // ------------------------------------------------ conduct panel --
    const conductPanel = (track: ConductTrack) => {
      const serving = track === 'time' && side ? h.serverOf?.(state) === side : undefined;
      const opts = { track, playerId: player?.id, serving };
      const suggested = side ? suggestLevel(sport, events, side, opts) : null;
      const chosen = level ?? suggested;
      const levels = track === 'time' ? TIME_VIOLATION.levels : rules.levels;
      const def = chosen ? levelDef(sport, chosen, track) : undefined;
      const offender = player?.fullName ?? (side ? nameOf(side) : '');
      const other = side ? nameOf(opp(side)) : '';
      const effect = !def || !side ? '' : def.effect === 'point' ? `Point to ${other}.`
        : def.effect === 'point2' ? `2 points to ${other}.`
        : def.effect === 'game' ? `${other} is awarded the game in play.`
        : def.effect === 'default' ? `The match ends — ${other} wins by default.`
        : chosen === 'fault' ? (side && h.serverOf?.(state) === side
          ? 'Loss of serve: a fault on the 1st serve; on the 2nd serve a double fault (the point is scored for you).'
          : 'Only the server loses a serve: for the receiver this is recorded only (pick Point penalty for a point).')
        : chosen === 'referee' ? 'Recorded — the referee decides (may disqualify).'
        : 'Recorded — no change to the score.';
      const n = side ? conductCount(sport, events, side, track, player?.id) : 0;

      const apply = async () => {
        if (!side || !chosen || !def) return;
        // IDs-only scoring: the offender by id (match events are public)
        const action = conductAction(side, { level: chosen, track, reason: reason ?? undefined }, player);
        const label = conductLabel(sport, { level: chosen, track });
        if (def.effect === 'default') {
          // Close the sheet first so the confirm isn't stacked on it (iOS).
          onDone();
          await new Promise((r) => setTimeout(r, 350));
          const ok = await askConfirm({
            title: `${def.label} — ${offender}?`,
            message: `${other} wins by default${reason ? ` (${reason})` : ''}. The match ends now and is saved as “Default”.`,
            yesLabel: 'Yes, end the match', noLabel: 'No, keep playing', tone: 'danger',
          });
          if (!ok) return;
          dispatch(action);
          onEndMatch?.({ kind: 'awarded', winner: opp(side), reason: `${label}${reason ? ` — ${reason}` : ''}` });
          return;
        }
        dispatch(action);
        onDone(`${label} · ${offender}`);
      };

      return (
        <View style={st.panel}>
          <Text style={textStyles.muted}>{track === 'time' ? timeRule(sport) : rules.rule}. Who?</Text>
          {sideChips}
          {playerChips}
          {side && (
            <>
              <Text style={st.suggest} accessibilityLiveRegion="polite">
                {suggestionText(sport, events, side, opts)}{n ? ` (${n} so far)` : ''}
              </Text>
              <View style={st.chips}>
                {levels.map((l) => <SelectChip key={l.level} label={`${l.icon} ${l.label}`} active={chosen === l.level} onPress={() => setLevel(l.level)} />)}
              </View>
              {track === 'code' && rules.note ? <Text style={textStyles.muted}>{rules.note}</Text> : null}
              {track === 'code' && (
                <View style={st.chips}>
                  {rules.reasons.map((r) => <SelectChip key={r} label={r} active={reason === r} onPress={() => setReason(reason === r ? null : r)} />)}
                </View>
              )}
              {effect ? <Text style={st.effect}>{effect}</Text> : null}
              <Button
                label={def ? `${def.effect === 'default' ? '⛔ ' : ''}Apply: ${def.label}` : 'Apply'}
                variant={def?.effect === 'default' ? 'danger' : 'primary'}
                disabled={!def} onPress={() => void apply()}
              />
            </>
          )}
        </View>
      );
    };

    // ------------------------------------------------ timeout panel --
    const timeoutPanel = (kind: TimeoutKind) => {
      const at = h.gameOf?.(state) ?? {};
      const left = (x: Side) => timeoutsLeft(sport, events, x, kind, at);
      const leftText = (x: Side) => { const l = left(x); return l == null ? '' : l === 0 ? ' · none left' : ` · ${l} left`; };
      const start = () => {
        if (!side || left(side) === 0) return;
        dispatch(timeoutAction(side, kind, player));
        onDone(`${TIMEOUT_ICON[kind]} ${TIMEOUT_LABEL[kind]} · ${player?.fullName ?? nameOf(side)}`);
      };
      return (
        <View style={st.panel}>
          <Text style={textStyles.muted}>{tmo.rule}{tmo.length ? ` · ${tmo.length}` : ''}{tmo.note ? `. ${tmo.note}` : ''}</Text>
          <View style={st.chips}>
            {(['home', 'away'] as const).map((x) => (
              <SelectChip key={x} label={`${nameOf(x)}${leftText(x)}`} active={side === x} disabled={left(x) === 0} onPress={() => pickSide(x)} />
            ))}
          </View>
          {kind !== 'timeout' ? playerChips : null}
          <Button label={`${TIMEOUT_ICON[kind]} Start ${TIMEOUT_LABEL[kind].toLowerCase()}`} disabled={!side || left(side) === 0} onPress={start} />
        </View>
      );
    };

    // ------------------------------- RB12 / RB14 · let, video review --
    const letPanel = () => (
      <View style={st.panel}>
        <Text style={textStyles.muted}>The rally is replayed: no point. Who asked (optional)?</Text>
        {sideChips}
        <Button label="🔁 Record a let" onPress={() => { dispatch({ type: 'LET', ...(side ? { side } : {}) }); onDone(`🔁 Let${side ? ` · ${nameOf(side)}` : ''}`); }} />
      </View>
    );
    const reviewPanel = () => {
      const review = (upheld: boolean) => {
        if (!side) return;
        dispatch({ type: 'REVIEW', side, payload: { upheld, ...(player ? { playerId: player.id } : {}) } });
        onDone(`📺 Video review ${upheld ? 'upheld' : 'not upheld'} · ${player?.fullName ?? nameOf(side)}`);
      };
      const game = h.gameOf?.(state).game;
      const out = side ? reviewsLeft(events, side, game) === 0 : false;
      return (
        <View style={st.panel}>
          <Text style={textStyles.muted}>PSA: one review per player per game, kept when upheld. Who asked?</Text>
          {sideChips}
          {playerChips}
          {out ? <Text style={st.effect}>Their review for this game is used.</Text> : null}
          <View style={st.chips}>
            <Button label="✅ Upheld" disabled={!side} onPress={() => review(true)} />
            <Button label="❌ Not upheld" disabled={!side || out} onPress={() => review(false)} />
          </View>
        </View>
      );
    };

    // ------------------- racket-batch6 · shuttle, injury, expedite --
    const shuttlePanel = () => (
      <View style={st.panel}>
        <Text style={textStyles.muted}>BWF Law 16.2.1: the shuttle is changed only with the umpire’s consent. No point. Who asked (optional)?</Text>
        {sideChips}
        <Button label="🏸 Record a shuttle change" onPress={() => { dispatch({ type: 'SHUTTLE', ...(side ? { side } : {}) }); onDone(`🏸 Shuttle change${side ? ` · ${nameOf(side)}` : ''}`); }} />
      </View>
    );
    const injuryPanel = () => {
      const c = cat ? INJURY_RULES.cats[cat] : null;
      const record = () => {
        if (!side || !cat) return;
        dispatch({ type: 'INJURY', side, payload: { cat, ...(player ? { playerId: player.id } : {}) } });
        onDone(`🩹 Injury · ${INJURY_RULES.cats[cat].label.toLowerCase()} · ${player?.fullName ?? nameOf(side)}`);
      };
      return (
        <View style={st.panel}>
          <Text style={textStyles.muted}>{INJURY_RULES.rule}. No score change. Who is injured?</Text>
          {sideChips}
          {playerChips}
          <View style={st.chips}>
            {(Object.keys(INJURY_RULES.cats) as InjuryCat[]).map((k) => (
              <SelectChip key={k} label={INJURY_RULES.cats[k].label} active={cat === k} onPress={() => setCat(cat === k ? null : k)} />
            ))}
          </View>
          {c ? <Text style={st.effect}>Up to {c.time}: {c.note}.</Text> : null}
          <Button label="🩹 Record the injury" disabled={!side || !cat} onPress={record} />
        </View>
      );
    };
    const expeditePanel = () => {
      const x = state as { current?: { home: number; away: number }; target?: number };
      const on = events.some((e) => e.kind === 'expedite');
      const ok = !on && !!x.current && ttExpediteAllowed(x.current.home, x.current.away, x.target ?? 11);
      return (
        <View style={st.panel}>
          <Text style={textStyles.muted}>ITTF 2.15: after 10 minutes in a game (not once 18 points have been played), or earlier if both ask. Service then alternates every point to the end of the match, and 13 good returns by the receiver win the point.</Text>
          {on ? <Text style={st.effect}>Expedite is already on.</Text> : !ok ? <Text style={st.effect}>Not in this game: 18 points have been played (ITTF 2.15.2).</Text> : (
            <>
              <View style={st.chips}>
                <SelectChip label="Between rallies" active={!inRally} onPress={() => setInRally(false)} />
                <SelectChip label="A rally was in progress" active={inRally} onPress={() => setInRally(true)} />
              </View>
              <Text style={st.effect}>{inRally ? 'The rally is replayed: the player who served it serves.' : 'The receiver of the last rally serves next.'}</Text>
            </>
          )}
          <Button label="⏩ Start expedite" disabled={!ok} onPress={() => { dispatch({ type: 'EXPEDITE', payload: inRally ? { rally: true } : {} }); onDone('⏩ Expedite system'); }} />
        </View>
      );
    };

    const tiles: Array<{ k: ConductTrack | TimeoutKind | Extra; icon: string; label: string; hint: string }> = [
      { k: 'code', icon: sport === 'tabletennis' || sport === 'badminton' ? '🟨' : '⚠️', label: rules.title === 'Card' ? 'Cards' : rules.title, hint: Array.from(new Set(rules.ladder.map((l) => levelDef(sport, l)?.label.split(' · ')[0]))).join(' → ') },
      ...(TIME_SPORTS.includes(sport) ? [{ k: 'time' as const, icon: '⏱️', label: 'Time violation', hint: 'Warning, then fault / point' }] : []),
      ...tmo.kinds.map((k) => ({ k, icon: TIMEOUT_ICON[k], label: TIMEOUT_LABEL[k], hint: k === 'timeout' && tmo.length ? tmo.length.split(' · ')[0] : 'No score change' })),
      ...(LET_TILE_SPORTS.includes(sport) ? [{ k: 'let' as const, icon: '🔁', label: 'Let', hint: 'Replayed · no point' }] : []),
      ...(sport === 'squash' ? [{ k: 'review' as const, icon: '📺', label: 'Video review', hint: '1 per game · kept if upheld' }] : []),
      ...(sport === 'badminton' ? [{ k: 'shuttle' as const, icon: '🏸', label: 'Shuttle change', hint: 'With consent · no point' }] : []),
      ...(sport === 'squash' ? [{ k: 'injury' as const, icon: '🩹', label: 'Injury', hint: 'Self / contributed / opponent' }] : []),
      ...(sport === 'tabletennis' ? [{ k: 'expedite' as const, icon: '⏩', label: 'Expedite', hint: 'One serve each to the end' }] : []),
    ];

    return (
      <View style={{ gap: theme.spacing(2) }}>
        <View style={st.grid}>
          {tiles.map((t) => <Tile key={t.k} icon={t.icon} label={t.label} hint={t.hint} active={open === t.k} onPress={() => toggle(t.k)} />)}
        </View>
        {tmo.note && tmo.kinds.length === 0 && sport === 'badminton' ? <Text style={textStyles.muted}>{tmo.note}</Text> : null}
        {open === 'code' && conductPanel('code')}
        {open === 'time' && conductPanel('time')}
        {open === 'let' && letPanel()}
        {open === 'review' && reviewPanel()}
        {open === 'shuttle' && shuttlePanel()}
        {open === 'injury' && injuryPanel()}
        {open === 'expedite' && expeditePanel()}
        {open && open !== 'code' && open !== 'time' && open !== 'let' && open !== 'review' && open !== 'shuttle' && open !== 'injury' && open !== 'expedite' && timeoutPanel(open)}
      </View>
    );
  }
  return RacketQuickOptions;
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  panel: { gap: theme.spacing(2) },
  suggest: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  effect: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
});
