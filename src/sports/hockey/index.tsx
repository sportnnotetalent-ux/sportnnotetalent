/**
 * Hockey plugin (FIH) — SD-101. Archetype: goal / time, on a STOPPABLE game
 * clock (quarters by default). The pure rules live in ./engine.ts; the field
 * tracker, statTotals and box score in ./totals.ts / ./box.ts.
 *
 * The scorer's panel: the clock (start / stop / end the period / set it), then
 * per side Goal (field / PC / stroke, scorer + assist), Penalty corner, Shot,
 * Stroke, Card (green 2′ / yellow 5′ or 10′ / red) and Sub; the keeper is
 * picked from the line-up (GK slot) or changed by hand. Every event carries
 * its game-clock second, so a card's suspension counts down on playing time
 * and the player is back by himself. A level match with a shoot-out decider
 * goes to the FIH shoot-out (5 each, then sudden death, order reversed).
 *
 * Corrections: "Correct the timeline" removes or re-enters a past moment
 * (REMOVE_EVENT with the reversed credits, then the same flow stamped at the
 * original time); after the match the generic #05 list re-credits or removes
 * rows (the reducer reads the scorer from `attribution`, so totals follow).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DescribeCard, useDescribeMarks } from '../../components/DescribeCard';
import { assistPart } from '../invasion/goalDetail';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { withNames, nameFor } from '../invasion/names';
import { subAction, keeperAction, xiStamp } from '../invasion/actions';
import { Button, TextField, SelectChip } from '../../components/ui';
import { confirmMatchAction } from '../../components/ConfirmSheet';
import { LineScoreboard } from '../../components/LineScoreboard';
import { FieldBanner } from '../FieldBanner';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import {
  init, reducer, isComplete, result, levelAtEnd, aggLine, matchSec, periodSec, clockFace, periodName, periodLong, periodStarted, running,
  eventCredits, creditAttribution, currentKeeper, soScore, nextShooter, needsSdPick, hockeyScoreLine, HOCKEY_PRESETS, HOCKEY_LIVE_SETTINGS,
  HOCKEY_TRACK_FIELDS, openPc, strokeTapActions, shotTapActions, cardWarnIds, cardWarning, goalDetailAction, PC_RESULT_LABEL,
  type CardColour, type GoalType, type HockeyEvent, type HockeyState, type Side,
} from './engine';
import { ruledOutAction, RULED_OUT_REASONS, RULED_OUT_LABEL } from '../invasion/ruledOut';
import { asksWho } from '../invasion/asksWho';
import { hockeyPossession } from './depth';
import { hockeyFeed, hockeyFacts, hockeyFeedPeriods, hockeyPeriodLabel } from './feed';
import { hockeyCentre } from './stats';
import { Commentary, MatchFactsCard, resultFacts } from '../invasion/Commentary';
import { MatchCentre } from '../invasion/MatchCentre';
import { hockeyTotals, hockeyLiveField, hockeyField, unavailable, STAT_TOTALS_KEYS } from './totals';
import { hockeyBox } from './box';
import { describeEvent, eventWhen, timelineEvents, GOAL_LABEL } from './timeline';
import { hockeyTickerDetail, hockeyTickerFlash } from './ticker';
import { hockeyFormation, HockeyPitch } from './pitch';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';
import { hockeyVoice, hockeyVoiceEnds } from '../voiceParsers';
import { HOCKEY_META } from './meta';
import { hockeyMatchRecords } from './records';
import { IconText } from '../../components/Icon';
import { hockeyUndoLabel } from './undoLabel';
import { MainAction } from '../MainAction';

const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isKeeperPos = (p?: string | null) => !!p && /^\s*(gk|goal\s*-?\s*keeper|keeper)\s*$/i.test(p);
const TRACKED = ['goals', 'fieldGoals', 'pcGoals', 'strokeGoals', 'strokesMissed', 'assists', 'shots', 'shotsOnGoal', 'saves', 'greenCards', 'yellowCards', 'redCards', 'cleanSheets'];

/* ------------------------------ player picker ------------------------------ */

function PlayerGrid({ players, onPick, skip }: { players: Player[]; onPick: (p: Player) => void; skip?: { label: string; onPress: () => void } }) {
  return (
    <View style={c.grid}>
      {players.map((p) => (
        <TouchableOpacity key={p.id} style={c.pchip} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={p.fullName} onPress={() => onPick(p)}>
          <Text style={c.pnum}>{p.jerseyNo ?? '–'}</Text>
          <Text style={c.pname} numberOfLines={1}>{p.fullName}</Text>
        </TouchableOpacity>
      ))}
      {players.length === 0 ? <Text style={c.meta}>No players listed — use the button below.</Text> : null}
      {skip ? (
        <TouchableOpacity style={[c.pchip, c.skip]} activeOpacity={0.75} accessibilityRole="button" onPress={skip.onPress}>
          <Text style={c.skipTxt}>{skip.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// `pc` (SD-117, H6): the attempt comes from this penalty corner (its id).
// describe-invasion DI1: the goal is on the board at the scorer tap — the
// assist is described after, on the goal card. `carry` (DI9): a re-entered
// goal keeps its original assister.
type Flow =
  | { mode: 'goal'; side: Side; step: 'type' | 'scorer'; goalType?: GoalType; pc?: string; carry?: string }
  | { mode: 'shot'; side: Side; step: 'result' | 'player'; onGoal?: boolean; miss?: 'wide' | 'blocked'; pc?: string }
  | { mode: 'stroke'; side: Side; step: 'result' | 'player'; outcome?: 'saved' | 'missed'; pc?: string }
  | { mode: 'card'; side: Side; step: 'colour' | 'player'; card?: CardColour; minutes?: number }
  | { mode: 'sub'; side: Side; step: 'off' | 'on'; off?: Player }
  | { mode: 'gk'; side: Side }
  // deep wave: a video referral (only when tracked)
  | { mode: 'referral'; side: Side }
  // invasion batch 6: a goal ruled out (only with the toggle on) — one tap logs it
  | { mode: 'ruledout'; side: Side; review?: boolean };

/* -------------------------------- controls --------------------------------- */

const ScoringControls: SportPlugin<HockeyState>['ScoringControls'] = ({
  state: liveState, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [],
}) => {
  // SD-114: Edit holds the removal until the re-entry commits (Cancel keeps the
  // event); `s` is the view as if it were removed. See usePendingEdit.
  const { view: s, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  // IDs-only scoring: the state keeps player ids; names are looked up when shown
  const { nameOf: playerNameOf } = useMask();
  const [flow, setFlow] = useState<Flow | null>(null);
  // SD-117 (H6): the penalty corner awaiting its outcome (side + its event id)
  const [pcOpen, setPcOpen] = useState<{ side: Side; id: string } | null>(null);
  // describe-invasion: the goal just scored (its id) — its card describes the assist;
  // a newer goal replaces it (DI6). Done / Skip per goal, and per penalty corner (DI13).
  const [goalCard, setGoalCard] = useState<string | null>(null);
  const goalMarks = useDescribeMarks<string>();
  const pcMarks = useDescribeMarks<string>();
  const [editAt, setEditAt] = useState<{ sec: number; period: number } | null>(null);
  // SD-137a: ⏪ backfill — every tap is stamped at a past minute until "Back to live"
  const [backfill, setBackfill] = useState<{ sec: number; period: number } | null>(null);
  const [backfillText, setBackfillText] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [clockText, setClockText] = useState('');
  const [setting, setSetting] = useState(false);
  const [soTaker, setSoTaker] = useState<Player | null>(null);
  // invasion batch 5: a team official's role for a card (typed, optional)
  const [official, setOfficial] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (flow === null && editAt) { setEditAt(null); dropHeldRemoval(); } }, [flow]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const name = (sd: Side) => (sd === 'home' ? homeName : awayName);
  const color = (sd: Side) => (sd === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  const rosterOf = (sd: Side) => (sd === 'home' ? homeRoster : awayRoster);
  const lineupOf = (sd: Side) => (sd === 'home' ? homeLineup : awayLineup);
  const byId = (sd: Side, id?: string, nm?: string): Player | undefined =>
    rosterOf(sd).find((p) => (id && p.id === id) || (!id && nm && p.fullName === nm)) ?? (id ? { id, fullName: nameFor(playerNameOf, id, nm) ?? 'Player', sports: ['hockey'] } as Player : undefined);

  // stamp every event with its game-clock second (or the edited moment's)
  const pastAt = editAt ?? backfill;
  const fire = (a: ScoreAction) => {
    const at = Date.now();
    dispatch({ ...a, payload: { ...a.payload, uid: (a.payload?.uid as string | undefined) ?? uid(), at, sec: pastAt?.sec ?? matchSec(s, at), period: pastAt?.period ?? s.period, ...(pastAt ? { edit: true } : {}) } });
  };

  /* ---- who is on the field ---- */
  // IDs-only scoring: the stamp carries player ids only (invasion/actions.ts)
  const stampOf = (sd: Side) => xiStamp(lineupOf(sd), rosterOf(sd), { slot: (sl) => sl.position === 'GK', player: (p) => isKeeperPos(p.sportDetails?.hockey?.position) });
  const stampXi = () => {
    for (const sd of ['home', 'away'] as const) {
      const st = stampOf(sd);
      if (!st.players && !st.gk) continue;
      if (JSON.stringify(st) === JSON.stringify(s.xi?.[sd] ?? {})) continue;
      dispatch({ type: 'XI', payload: { team: sd, ...st } });
    }
  };
  const out = unavailable(s, now);
  const onField = (sd: Side): Player[] => {
    const roster = rosterOf(sd);
    const gone = (p: Player) => out[sd].has(p.id) || out[sd].has(p.fullName);
    if (s.xi?.[sd]?.players?.length) {
      return hockeyField(s, matchSec(s, now) / 60).onField[sd].map((f) => byId(sd, f.id, f.name)).filter((p): p is Player => !!p);
    }
    const lu = lineupOf(sd).filter((sl) => sl.playerId).map((sl) => byId(sd, sl.playerId, sl.playerName)).filter((p): p is Player => !!p);
    return (lu.length ? lu : roster).filter((p) => !gone(p));
  };
  const bench = (sd: Side): Player[] => {
    const on = new Set(onField(sd).map((p) => p.id));
    return rosterOf(sd).filter((p) => !on.has(p.id) && !out[sd].has(p.id) && !out[sd].has(p.fullName));
  };
  const keeper = (sd: Side) => {
    const k = currentKeeper(s, sd);
    return k?.id ? byId(sd, k.id, k.name) : undefined;
  };

  /* ---- recorders ---- */
  const credit = (e: Parameters<typeof eventCredits>[0]) => {
    const cr = eventCredits(e);
    return { attribution: creditAttribution(cr.first, 1, TRACKED), attribution2: creditAttribution(cr.second, 1, TRACKED) };
  };
  const pcLink = (pc?: string) => (pc ? { pcRef: pc } : {});
  // describe-invasion DI1: on the board at the scorer tap ("Team goal" too); the
  // assist is attached after (GOAL_DETAIL, by the goal's id). DI9: a re-entered
  // goal carries its original assister (not a stroke, not the new scorer).
  const goal = (sd: Side, goalType: GoalType, scorer: Player | null, pc?: string, carry?: string) => {
    const id = uid();
    const assist = carry && goalType !== 'stroke' && carry !== scorer?.id ? carry : undefined;
    fire({ type: 'GOAL', side: sd, payload: { uid: id, goalType, ...pcLink(pc) }, ...credit({ type: 'goal', goalType, playerId: scorer?.id, secondId: assist }) });
    setFlow(null); setPcOpen(null);
    // (a stroke takes no assist: no card — and the last goal's card closes, DI6)
    setGoalCard(goalType !== 'stroke' ? id : null);
  };
  /** the goal card's assist tap: attach (or change / clear) on that goal */
  const setAssist = (ref: string, p: Player, current?: string) => {
    const a = goalDetailAction(s, ref, { a1: current === p.id ? null : p.id }, TRACKED);
    if (a) dispatch(a);
  };
  // deep wave: a miss says wide or blocked (one tap either way)
  const shot = (sd: Side, onGoal: boolean, p: Player | null, pc?: string, miss?: 'wide' | 'blocked') => {
    // screen sweep (S1): the shot and its keeper's save, built in the engine
    for (const a of shotTapActions(sd, onGoal, p?.id, keeper(opp(sd))?.id, { uid: uid(), ...(miss ? { miss } : {}), ...pcLink(pc) }, TRACKED)) fire(a);
    // (describe-invasion DI13: the PC card stays, reading "✓ PC shot saved" until Done)
    setFlow(null);
  };
  const stroke = (sd: Side, outcome: 'saved' | 'missed', p: Player | null, pc?: string) => {
    // invasion batch 1: a stroke not scored is a shot too (saved = on goal);
    // screen sweep (S1): the stroke and its keeper's save, built in the engine
    for (const a of strokeTapActions(sd, outcome, p?.id, keeper(opp(sd))?.id, { uid: uid(), ...pcLink(pc) }, TRACKED)) fire(a);
    setFlow(null);
  };
  const card = (sd: Side, colour: CardColour, minutes: number | undefined, p: Player | null) => {
    fire({ type: 'CARD', side: sd, payload: { card: colour, ...(minutes ? { minutes } : {}) }, ...credit({ type: 'card', card: colour, playerId: p?.id }) });
    setFlow(null);
  };
  /** invasion batch 5 (FIH): a card for a team official — no player, nobody short */
  const officialCard = (sd: Side, colour: CardColour) => {
    fire({ type: 'CARD', side: sd, payload: { card: colour, official: official.trim() || 'Team official' } });
    setOfficial(''); setFlow(null);
  };
  const sub = (sd: Side, off: Player, on: Player) => {
    fire(subAction(sd, off, on));
    setFlow(null);
  };
  const setKeeper = (sd: Side, p: Player) => {
    fire(keeperAction(sd, p));
    setFlow(null);
  };

  /* ---- correct the timeline ---- */
  const removalActions = (e: HockeyEvent): ScoreAction[] => {
    const cr = eventCredits(e);
    return [
      { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) },
      // a shot / stroke takes its keeper's save with it (the save's own side)
      ...s.events.filter((x) => x.type === 'save' && x.ref === e.id).flatMap(removalActions),
    ];
  };
  const remove = (e: HockeyEvent) => { for (const a of removalActions(e)) dispatch(a); };
  // invasion batch 6: the "Goal ruled out" button (the toggle on)
  const ruledOutOn = s.track?.ruledOut === true;
  // SD-114: held until the re-entry commits — Cancel keeps the event as it was.
  const edit = (e: HockeyEvent) => {
    if (e.type === 'pc' || e.type === 'save' || e.type === 'referral' || e.type === 'ruledout') { remove(e); return; }
    holdRemoval(removalActions(e));
    setEditAt({ sec: e.sec, period: e.period });
    setShowEdit(false);
    const pc = e.pcRef ? { pc: e.pcRef } : {};
    if (e.type === 'goal') setFlow({ mode: 'goal', side: e.side, step: 'type', ...pc, ...(e.secondId ? { carry: e.secondId } : {}) });
    else if (e.type === 'shot') setFlow({ mode: 'shot', side: e.side, step: 'result', ...pc });
    else if (e.type === 'stroke') setFlow({ mode: 'stroke', side: e.side, step: 'result', ...pc });
    else if (e.type === 'card') setFlow({ mode: 'card', side: e.side, step: 'colour' });
    else if (e.type === 'sub') setFlow({ mode: 'sub', side: e.side, step: 'off' });
    else if (e.type === 'gk') setFlow({ mode: 'gk', side: e.side });
  };

  /* ---- clock ---- */
  const startStop = () => {
    const at = Date.now();
    if (running(s)) { dispatch({ type: 'CLOCK', payload: { run: false, at } }); return; }
    if (s.period === 1 && !periodStarted(s)) stampXi();
    dispatch({ type: 'CLOCK', payload: { run: true, at } });
  };
  const last = s.period >= s.periods;
  // SD-106: ending a quarter / full time asks first (ConfirmSheet).
  const endPeriod = async () => {
    if (!periodStarted(s)) return; // SD-116 (H1): a period that hasn't started can't end
    const score = `${s.home}-${s.away}`;
    const ok = last ? await confirmMatchAction('fullTime', { score }) : await confirmMatchAction('endPeriod', { period: periodName(s, s.period), score });
    if (!ok) return;
    if (last) stampXi();
    dispatch({ type: 'END_PERIOD', payload: { at: Date.now() } });
  };
  const applyClock = () => {
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(clockText.trim());
    if (!m) return;
    const left = Number(m[1]) * 60 + Number(m[2] ?? 0);
    dispatch({ type: 'SET_CLOCK', payload: { periodSec: s.periodMinutes * 60 - left, at: Date.now() } });
    setSetting(false); setClockText('');
  };

  /* ---- shoot-out ---- */
  // deep wave: saved vs missed (one tap either way) and the keeper facing it
  // (the other side's keeper) — the keeper's shoot-out saves come from these
  const soAttempt = (sd: Side, outcome: 'scored' | 'saved' | 'missed') => {
    const gk = keeper(opp(sd));
    dispatch({
      type: 'SO', side: sd,
      payload: { scored: outcome === 'scored', outcome, ...(gk ? { keeperId: gk.id } : {}) },
      ...(soTaker ? { attribution: { playerId: soTaker.id, stat: 'soTaken', ...(outcome === 'scored' ? { extra: { soGoals: 1 } } : {}) } } : {}),
    });
    setSoTaker(null);
  };
  // describe-invasion: the card for the goal just scored (DI6: only that one; gone
  // with its goal; hidden while a correction is open, which holds a removal)
  const cardGoal = goalCard && !editAt ? s.events.find((e) => e.id === goalCard && e.type === 'goal') : undefined;
  const goalCardView = cardGoal ? (
    <DescribeCard
      title={`Last goal · ${cardGoal.playerId ? nameFor(playerNameOf, cardGoal.playerId, cardGoal.playerName) ?? name(cardGoal.side) : name(cardGoal.side)}`}
      summary={assistPart(playerNameOf, cardGoal.secondId, cardGoal.secondName)}
      mode={goalMarks.modeOf(cardGoal.id)}
      onDone={() => goalMarks.mark(cardGoal.id, 'done')} onSkip={() => goalMarks.mark(cardGoal.id, 'skipped')} onEdit={() => goalMarks.mark(cardGoal.id, null)}>
      <Text style={c.small}>Assist (optional)</Text>
      <View style={c.grid}>
        {onField(cardGoal.side).filter((p) => p.id !== cardGoal.playerId).map((p) => (
          <SelectChip key={p.id} label={`${p.jerseyNo != null ? `${p.jerseyNo} ` : ''}${p.fullName}`} active={cardGoal.secondId === p.id} onPress={() => setAssist(cardGoal.id, p, cardGoal.secondId)} />
        ))}
      </View>
    </DescribeCard>
  ) : null;
  const level = levelAtEnd(s); // SD-120: on aggregate in a new leg 2
  if (s.ended) {
    if (s.shootout) {
      const sc = soScore(s);
      const nextSide = nextShooter(s.shootout);
      const n = s.shootout[nextSide].length + 1;
      return (
        <View style={c.wrap}>
          <View style={c.panel}>
            <Text style={c.h}>🏑 Shoot-out · {sc.home}–{sc.away}</Text>
            {(['home', 'away'] as const).map((sd) => (
              <View key={sd} style={c.soRow}>
                <Text style={c.soTeam} numberOfLines={1}>{name(sd)}</Text>
                <Text style={c.soDots}>{s.shootout![sd].map((k) => (k.scored ? '●' : '○')).join(' ') || '–'}</Text>
              </View>
            ))}
            {s.shootoutWinner ? (
              <Text style={c.done}>{name(s.shootoutWinner)} win the shoot-out {sc.home}–{sc.away}</Text>
            ) : needsSdPick(s) ? (
              // SD-139: the scorer picks who goes first in sudden death
              <>
                <Text style={c.meta}>5 each and still level — sudden death. Who shoots first?</Text>
                <Text style={c.meta}>FIH order: the team that shot second in the first five now goes first ({name(s.shootout.first === 'home' ? 'away' : 'home')}).</Text>
                <View style={c.row}>
                  <Button variant="primary" label={`${homeName} first`} color={color('home')} style={c.flex} onPress={() => dispatch({ type: 'SO_ORDER', payload: { first: 'home' } })} />
                  <Button variant="primary" label={`${awayName} first`} color={color('away')} style={c.flex} onPress={() => dispatch({ type: 'SO_ORDER', payload: { first: 'away' } })} />
                </View>
              </>
            ) : (
              <>
                <Text style={c.meta}>
                  Next: {name(nextSide)} · attempt {n}{n > 5 ? ' (sudden death)' : ''} · 8-second 1 v 1 against the keeper
                </Text>
                <Text style={c.small}>Taker (optional)</Text>
                <PlayerGrid players={onField(nextSide).filter((p) => p.id !== soTaker?.id)} onPick={(p) => setSoTaker(p)} />
                {soTaker ? <Text style={c.meta}>Taker: {soTaker.fullName}</Text> : null}
                {keeper(opp(nextSide)) ? <Text style={c.meta}>🧤 Keeper: {keeper(opp(nextSide))!.fullName}</Text> : null}
                <View style={c.row}>
                  <Button variant="primary" label="✓ Scored" color={color(nextSide)} style={c.flex} onPress={() => soAttempt(nextSide, 'scored')} />
                  <Button label="🧤 Saved" variant="ghost" style={c.flex} onPress={() => soAttempt(nextSide, 'saved')} />
                  <Button label="✗ Missed" variant="ghost" style={c.flex} onPress={() => soAttempt(nextSide, 'missed')} />
                </View>
              </>
            )}
          </View>
        </View>
      );
    }
    return (
      <View style={c.wrap}>
        <View style={c.panel}>
          <Text style={c.h}>Full time · {s.home}–{s.away}</Text>
          {level && s.decider === 'shootout' ? (
            <>
              <Text style={c.meta}>Level — the match goes to a shoot-out (5 each, then sudden death).</Text>
              <Text style={c.h}>🪙 Who shoots first?</Text>
              <Text style={c.meta}>After the umpires’ toss (or however they decide) — pick the team going first.</Text>
              <View style={c.row}>
                <Button variant="primary" label={`${homeName} first`} color={color('home')} style={c.flex} onPress={() => dispatch({ type: 'START_SHOOTOUT', payload: { first: 'home' } })} />
                <Button variant="primary" label={`${awayName} first`} color={color('away')} style={c.flex} onPress={() => dispatch({ type: 'START_SHOOTOUT', payload: { first: 'away' } })} />
              </View>
            </>
          ) : (
            <Text style={c.meta}>{s.agg ? `${aggLine(s)}${level ? '.' : ` — ${name(s.home + s.agg.home > s.away + s.agg.away ? 'home' : 'away')} go through.`}` : level ? 'Draw.' : `${name(s.home > s.away ? 'home' : 'away')} win.`} Use “Correct the timeline” below to fix a moment.</Text>
          )}
        </View>
        {goalCardView}
        <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} homeName={homeName} awayName={awayName} />
      </View>
    );
  }

  /* ---- flows ---- */
  const flowPanel = (() => {
    if (!flow) return null;
    const sd = flow.side;
    // describe-invasion DI1: every step left here DEFINES the play (Cancel backs
    // out); the goal's assist is described after, on the goal card
    const head = (t: string) => (
      <View style={c.flowHead}>
        <Text style={[c.h, { color: color(sd) }]} numberOfLines={1}>{t} · {name(sd)}{pastAt ? ` · ${Math.max(1, Math.ceil(pastAt.sec / 60))}'` : ''}</Text>
        <Text style={c.cancel} accessibilityRole="button" onPress={() => setFlow(null)}>Cancel</Text>
      </View>
    );
    switch (flow.mode) {
      case 'goal':
        if (flow.step === 'type') return (
          <View style={c.panel}>{head('Goal')}
            <View style={c.row}>
              {(['field', 'pc', 'stroke'] as const).filter((t) => t !== 'pc' || s.penaltyCorners).map((t) => (
                <Button key={t} label={t === 'field' ? 'Field goal' : t === 'pc' ? 'From PC' : 'Stroke'} variant="ghost" style={c.flex}
                  // deep wave: a PC goal settles the side's open corner (its outcome)
                  onPress={() => setFlow({ ...flow, goalType: t, step: 'scorer', ...(t === 'pc' && !flow.pc && openPc(s, sd) ? { pc: openPc(s, sd)!.id } : {}) })} />
              ))}
            </View>
          </View>
        );
        return (
          <View style={c.panel}>{head(GOAL_LABEL[flow.goalType ?? 'field'])}
            <Text style={c.small}>Who scored?</Text>
            <PlayerGrid players={onField(sd)} onPick={(p) => goal(sd, flow.goalType ?? 'field', p, flow.pc, flow.carry)}
              skip={{ label: 'Team goal (no scorer)', onPress: () => goal(sd, flow.goalType ?? 'field', null, flow.pc, flow.carry) }} />
          </View>
        );
      case 'shot':
        if (flow.step === 'result') return (
          <View style={c.panel}>{head('Shot')}
            <View style={c.row}>
              <Button label="On goal — saved" variant="ghost" style={c.flex} onPress={() => (asksWho(onField(sd)) ? setFlow({ ...flow, onGoal: true, step: 'player' }) : shot(sd, true, null, flow.pc))} />
            </View>
            {/* deep wave: wide vs blocked — still one tap */}
            <View style={c.row}>
              <Button label="↗ Wide" accessibilityLabel="Shot wide of the goal" variant="ghost" style={c.flex} onPress={() => (asksWho(onField(sd)) ? setFlow({ ...flow, onGoal: false, miss: 'wide', step: 'player' }) : shot(sd, false, null, flow.pc, 'wide'))} />
              <Button label="🛡 Blocked" accessibilityLabel="Shot blocked by a defender" variant="ghost" style={c.flex} onPress={() => (asksWho(onField(sd)) ? setFlow({ ...flow, onGoal: false, miss: 'blocked', step: 'player' }) : shot(sd, false, null, flow.pc, 'blocked'))} />
            </View>
            {keeper(opp(sd)) ? <Text style={c.meta}>A save goes to {keeper(opp(sd))!.fullName} (keeper).</Text> : null}
          </View>
        );
        return (
          <View style={c.panel}>{head(flow.onGoal ? 'Shot on goal' : flow.miss === 'blocked' ? 'Shot blocked' : 'Shot wide')}
            <PlayerGrid players={onField(sd)} onPick={(p) => shot(sd, !!flow.onGoal, p, flow.pc, flow.miss)} skip={{ label: 'Skip player', onPress: () => shot(sd, !!flow.onGoal, null, flow.pc, flow.miss) }} />
          </View>
        );
      case 'stroke':
        if (flow.step === 'result') return (
          <View style={c.panel}>{head('Penalty stroke')}
            <View style={c.row}>
              <Button variant="primary" label="Scored" color={color(sd)} style={c.flex} onPress={() => (asksWho(onField(sd)) ? setFlow({ mode: 'goal', side: sd, step: 'scorer', goalType: 'stroke', ...(flow.pc ? { pc: flow.pc } : {}) }) : goal(sd, 'stroke', null, flow.pc))} />
              <Button label="Saved" variant="ghost" style={c.flex} onPress={() => (asksWho(onField(sd)) ? setFlow({ ...flow, outcome: 'saved', step: 'player' }) : stroke(sd, 'saved', null, flow.pc))} />
              <Button label="Missed" variant="ghost" style={c.flex} onPress={() => (asksWho(onField(sd)) ? setFlow({ ...flow, outcome: 'missed', step: 'player' }) : stroke(sd, 'missed', null, flow.pc))} />
            </View>
          </View>
        );
        return (
          <View style={c.panel}>{head('Stroke taker')}
            <PlayerGrid players={onField(sd)} onPick={(p) => stroke(sd, flow.outcome ?? 'missed', p, flow.pc)} skip={{ label: 'Skip player', onPress: () => stroke(sd, flow.outcome ?? 'missed', null, flow.pc) }} />
          </View>
        );
      case 'card':
        if (flow.step === 'colour') return (
          <View style={c.panel}>{head('Card')}
            <View style={c.row}>
              <Button label="🟩 Green 2′" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'green', minutes: 2, step: 'player' })} />
              <Button label="🟥 Red" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'red', minutes: undefined, step: 'player' })} />
            </View>
            <View style={c.row}>
              <Button label="🟨 Yellow 5′" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'yellow', minutes: 5, step: 'player' })} />
              <Button label="🟨 Yellow 10′" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, card: 'yellow', minutes: 10, step: 'player' })} />
            </View>
            <Text style={c.meta}>Green and yellow: the player sits out that much playing time, then is back by himself. Red: off for good — the team plays a player short.</Text>
          </View>
        );
        {
          // invasion batch 5 (FIH): warn on a player's second green / second
          // yellow (warn only — record what the umpire shows)
          const col = flow.card ?? 'green';
          const warned = cardWarnIds(s, sd, col).map((id) => byId(sd, id, id)?.fullName ?? id);
          return (
            <View style={c.panel}>{head(`${col === 'green' ? 'Green' : col === 'yellow' ? 'Yellow' : 'Red'} card`)}
              {warned.length ? <Text style={c.short}>{warned.join(', ')}: {cardWarning(col)}</Text> : null}
              <PlayerGrid players={onField(sd)} onPick={(p) => card(sd, col, flow.minutes, p)} />
              <Text style={c.meta}>Or a team official</Text>
              <View style={c.row}>
                <View style={c.flex}><TextField label="Official's role (optional)" value={official} onChange={setOfficial} placeholder="e.g. Coach" autoCapitalize="words" /></View>
                <Button label="Record" variant="ghost" onPress={() => officialCard(sd, col)} />
              </View>
            </View>
          );
        }
      case 'sub':
        if (flow.step === 'off') return (
          <View style={c.panel}>{head('Sub — who comes off?')}
            <PlayerGrid players={onField(sd)} onPick={(p) => setFlow({ ...flow, off: p, step: 'on' })} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`Sub — on for ${flow.off?.fullName ?? ''}`)}
            <PlayerGrid players={bench(sd)} onPick={(p) => flow.off && sub(sd, flow.off, p)} />
            <Text style={c.meta}>Rolling substitutions — a player who comes off may go back on later.</Text>
          </View>
        );
      case 'gk':
        return (
          <View style={c.panel}>{head('Goalkeeper')}
            <PlayerGrid players={[...onField(sd), ...bench(sd)]} onPick={(p) => setKeeper(sd, p)} />
          </View>
        );
      case 'referral':
        return (
          <View style={c.panel}>{head('📺 Video referral')}
            <View style={c.row}>
              <Button label="✓ Upheld" variant="ghost" style={c.flex} onPress={() => { fire({ type: 'REFERRAL', side: sd, payload: { upheld: true } }); setFlow(null); }} />
              <Button label="✗ Not upheld" variant="ghost" style={c.flex} onPress={() => { fire({ type: 'REFERRAL', side: sd, payload: { upheld: false } }); setFlow(null); }} />
            </View>
            <Text style={c.meta}>Upheld: the team keeps its referral. Not upheld: it is lost.</Text>
          </View>
        );
      case 'ruledout':
        return (
          <View style={c.panel}>{head('❎ Goal ruled out')}
            <Text style={c.meta}>Why? (optional — one tap logs it; the score doesn’t move)</Text>
            <View style={c.row}>
              <SelectChip label="After a video referral" active={!!flow.review} onPress={() => setFlow({ ...flow, review: !flow.review })} />
            </View>
            <View style={c.row}>
              {RULED_OUT_REASONS.hockey.map((r) => <Button key={r} label={RULED_OUT_LABEL[r]} variant="ghost" style={c.flex} onPress={() => { fire(ruledOutAction('hockey', sd, { reason: r, review: flow.review })); setFlow(null); }} />)}
            </View>
            <Button label="Log it — no reason" variant="ghost" onPress={() => { fire(ruledOutAction('hockey', sd, { review: flow.review })); setFlow(null); }} />
            <Text style={c.meta}>Already on the board? Remove the goal from the timeline too.</Text>
          </View>
        );
    }
  })();

  const live = hockeyLiveField(s, now, playerNameOf);
  const sideCol = (sd: Side) => {
    const gk = keeper(sd);
    return (
      <View key={sd} style={c.col}>
        <Text style={[c.team, { color: color(sd) }]} numberOfLines={1}>{name(sd)}</Text>
        <MainAction label="🏑 Goal" plus="+1" color={color(sd)} onPress={() => setFlow({ mode: 'goal', side: sd, step: 'type' })} />
        {s.penaltyCorners ? (
          <Button label="🚩 PC" accessibilityLabel="Penalty corner" variant="ghost" onPress={() => { const id = uid(); fire({ type: 'PC', side: sd, payload: { uid: id } }); setPcOpen({ side: sd, id }); }} />
        ) : null}
        <Button label="🎯 Shot" variant="ghost" onPress={() => setFlow({ mode: 'shot', side: sd, step: 'result' })} />
        <Button label="⚪ Stroke" variant="ghost" onPress={() => setFlow({ mode: 'stroke', side: sd, step: 'result' })} />
        <Button label="🟨 Card" variant="ghost" onPress={() => setFlow({ mode: 'card', side: sd, step: 'colour' })} />
        <Button label="🔁 Sub" variant="ghost" onPress={() => setFlow({ mode: 'sub', side: sd, step: 'off' })} />
        {s.track?.referrals ? <Button label="📺 Referral" accessibilityLabel={`Video referral by ${name(sd)}`} variant="ghost" onPress={() => setFlow({ mode: 'referral', side: sd })} /> : null}
        {ruledOutOn ? <Button label="❎ Goal ruled out" accessibilityLabel={`${name(sd)} goal ruled out`} variant="ghost" onPress={() => setFlow({ mode: 'ruledout', side: sd })} /> : null}
        <Text style={c.gk} accessibilityRole="button" onPress={() => setFlow({ mode: 'gk', side: sd })} numberOfLines={2}>
          🧤 {gk ? gk.fullName : 'Set keeper'} ›
        </Text>
        {live.short[sd] > 0 ? <Text style={c.short}>Playing {live.short[sd]} short</Text> : null}
      </View>
    );
  };

  // SD-137a: the match minute typed → its second + period (never past now)
  const nowMin = Math.max(1, Math.ceil(matchSec(s, now) / 60));
  const startBackfill = () => {
    const min = Math.floor(Number(backfillText));
    if (!Number.isFinite(min) || min < 1) return;
    const m = Math.min(min, nowMin);
    const sec = m * 60 - 30;
    const period = Math.min(s.period, Math.max(1, Math.ceil(sec / (s.periodMinutes * 60))));
    setBackfill({ sec, period });
    setBackfillText('');
    setShowEdit(false);
  };
  const backToLive = () => { setBackfill(null); setFlow(null); };

  return (
    <View style={c.wrap}>
      {/* SD-114 / SD-137a: pinned first while backfilling (or re-entering) */}
      {pastAt ? <BackfillBar at={`${periodName(s, pastAt.period)} · ${Math.max(1, Math.ceil(pastAt.sec / 60))}′`} onLive={editAt ? () => setFlow(null) : backToLive} /> : null}
      {/* the game clock */}
      <View style={c.panel}>
        <View style={c.clockRow}>
          <View style={{ flex: 1 }}>
            <Text style={c.small}>{periodLong(s, s.period)}{s.stopClock ? ' · clock stops on goals & PCs' : ''}</Text>
            <Text style={c.clock}>{clockFace(s, now)}</Text>
          </View>
          <Button label={running(s) ? '⏸ Pause clock' : periodStarted(s) ? '▶ Resume' : s.period === 1 ? '▶ Push back' : `▶ Start ${periodName(s, s.period)}`} variant={running(s) ? 'ghost' : 'primary'} onPress={startStop} />
        </View>
        <View style={c.row}>
          {/* the last period's Full time sits at the bottom of the controls (SD-106) */}
          {!last ? <Button label={`End ${periodName(s, s.period)} →`} variant={periodStarted(s) && running(s) ? 'primary' : 'ghost'} style={c.flex}
            disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
          <Button label="⏱ Set clock" variant="ghost" style={c.flex} onPress={() => setSetting((v) => !v)} />
        </View>
        {setting ? (
          <View style={c.row}>
            <View style={c.flex}><TextField label="Time left (mm:ss)" value={clockText} onChange={setClockText} placeholder={clockFace(s, now)} /></View>
            <Button variant="primary" label="Set" onPress={applyClock} />
          </View>
        ) : null}
        {/* (the suspension banner sits in the board above, with the clock) */}
        {periodSec(s, now) >= s.periodMinutes * 60 && running(s) ? <Text style={c.short}>Time is up — finish any penalty corner, then end the {s.periods === 4 ? 'quarter' : 'period'}.</Text> : null}
        {/* SD-117 (H5): a stopped clock mid-period says so, with Resume right there */}
        {!running(s) && periodStarted(s) && periodSec(s, now) < s.periodMinutes * 60 ? (() => {
          const lastEv = s.events[s.events.length - 1];
          const why = lastEv?.type === 'goal' ? ' (goal) — restart at the centre pass' : lastEv?.type === 'pc' ? ' (penalty corner)' : '';
          return (
            <View style={c.stopped} accessibilityRole="alert">
              <Text style={c.stoppedTxt}>⏸ Clock stopped{why}</Text>
              <Button variant="primary" label="▶ Resume" onPress={startStop} />
            </View>
          );
        })() : null}
      </View>

      {/* SD-117 (H7): one tap per circle entry — the FIH attacking-entry stat */}
      {!flow ? (
        <View style={c.circlePanel}>
          <IconText label="⭕ Circle entries — tap on each one" style={c.small} />
          <View style={c.cols}>
            {(['home', 'away'] as const).map((sd) => {
              const n = (s.circles ?? []).filter((x) => x.side === sd).length;
              return (
                <View key={sd} style={[c.circleRow, { flex: 1 }]}>
                  <Button label={`${name(sd)} · ${n}`} accessibilityLabel={`Circle entry ${name(sd)}, ${n} so far`} variant="ghost" color={color(sd)} style={c.flex} onPress={() => fire({ type: 'CIRCLE', side: sd })} />
                  {n > 0 ? <Button label="−1" accessibilityLabel={`Take back a circle entry for ${name(sd)}`} variant="ghost" onPress={() => fire({ type: 'CIRCLE', side: sd, payload: { undo: true } })} /> : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* deep wave: possession on the game clock (only when tracked) */}
      {s.track?.possession && !flow && !pastAt ? (() => {
        const poss = hockeyPossession(s, 'all', now);
        const has = s.poss?.length ? s.poss[s.poss.length - 1].side : undefined;
        return (
          <View style={c.circlePanel}>
            <Text style={c.small}>⚽ Possession{poss ? ` · ${name('home')} ${poss.home}% – ${poss.away}% ${name('away')}` : ' — tap who has the ball'}</Text>
            <View style={c.cols}>
              {(['home', 'away'] as const).map((sd) => (
                <Button key={sd} label={`${has === sd ? '● ' : ''}Ball: ${name(sd)}`} accessibilityLabel={`${name(sd)} have the ball`} variant={has === sd ? 'primary' : 'ghost'} color={has === sd ? color(sd) : undefined} style={c.flex}
                  onPress={() => fire({ type: 'POSS', side: sd })} />
              ))}
            </View>
          </View>
        );
      })() : null}

      {pcOpen && !flow && s.events.some((e) => e.id === pcOpen.id && e.type === 'pc') ? (() => {
        // SD-117 (H6): how the corner ended — each outcome is linked to the PC.
        // describe-invasion DI13: a DescribeCard keyed by the PC — "✓ PC defended",
        // then Done (Skip while nothing is picked) and "✓ Saved · … Edit"
        const { side: sd, id } = pcOpen;
        const settle = (result: 'defended' | 'stroke') => fire({ type: 'PC_OUTCOME', side: sd, payload: { id, result } });
        const res = s.events.find((e) => e.id === id)?.pcResult;
        return (
          <DescribeCard title={`🚩 Penalty corner · ${name(sd)}`} summary={res ? `PC ${PC_RESULT_LABEL[res]}` : ''} mode={pcMarks.modeOf(id)}
            onDone={() => pcMarks.mark(id, 'done')} onSkip={() => pcMarks.mark(id, 'skipped')} onEdit={() => pcMarks.mark(id, null)}>
            <Text style={c.small}>How did it end?</Text>
            <View style={c.row}>
              <Button variant="primary" label="🏑 Goal" color={color(sd)} style={c.flex} onPress={() => setFlow({ mode: 'goal', side: sd, step: 'scorer', goalType: 'pc', pc: id })} />
              <Button label="🧤 Saved" variant="ghost" style={c.flex} onPress={() => (asksWho(onField(sd)) ? setFlow({ mode: 'shot', side: sd, step: 'player', onGoal: true, pc: id }) : shot(sd, true, null, id))} />
            </View>
            <View style={c.row}>
              <Button label="↗ Wide" variant="ghost" style={c.flex} onPress={() => (asksWho(onField(sd)) ? setFlow({ mode: 'shot', side: sd, step: 'player', onGoal: false, miss: 'wide', pc: id }) : shot(sd, false, null, id, 'wide'))} />
              <Button label="🛡 Defended" variant="ghost" style={c.flex} onPress={() => settle('defended')} />
            </View>
            <View style={c.row}>
              <Button label="⚪ Stroke awarded" variant="ghost" style={c.flex} onPress={() => { settle('stroke'); setPcOpen(null); setFlow({ mode: 'stroke', side: sd, step: 'result', pc: id }); }} />
              <Button label="♻️ Re-awarded" variant="ghost" style={c.flex} onPress={() => { const next = uid(); fire({ type: 'PC', side: sd, payload: { uid: next, reawardOf: id } }); setPcOpen({ side: sd, id: next }); }} />
            </View>
          </DescribeCard>
        );
      })() : null}

      {flowPanel ?? (
        <View style={c.cols}>{sideCol('home')}{sideCol('away')}</View>
      )}
      {/* describe-invasion: under the controls — scoring carries straight on */}
      {goalCardView}

      <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} onEdit={edit} homeName={homeName} awayName={awayName} />
      {/* SD-137a: ⏪ add a goal / card / shot the scorer missed, at its minute */}
      {periodStarted(s) || s.period > 1 ? (
        <View style={c.panel}>
          <IconText label={"⏪ Backfill a missed moment"} style={c.small} />
          {backfill ? (
            <Text style={c.meta}>Every tap now is stamped at {periodName(s, backfill.period)} · {Math.max(1, Math.ceil(backfill.sec / 60))}′. Log it above, then ▶ Back to live.</Text>
          ) : (
            <View style={c.row}>
              <View style={c.flex}><TextField label={`Match minute (1–${nowMin})`} value={backfillText} onChange={setBackfillText} placeholder="e.g. 12" /></View>
              <Button label="Backfill" variant="ghost" disabled={!backfillText.trim()} onPress={startBackfill} />
            </View>
          )}
        </View>
      ) : null}
      {/* SD-116 (H1): not live during the break before the last period — it
          would credit a whole unplayed half / quarter */}
      {last ? <Button label="🏁 Full time" variant="danger" disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
      {last && !periodStarted(s) ? <Text style={c.gk}>Start {periodName(s, s.period)} first — Full time unlocks once it’s under way.</Text> : null}
    </View>
  );
};

/** The scorer's "Correct the timeline" list: remove a moment, or re-enter it. */
function EditList({ s: s0, show, setShow, onRemove, onEdit, homeName, awayName }: {
  s: HockeyState; show: boolean; setShow: (v: boolean) => void; onRemove: (e: HockeyEvent) => void; onEdit?: (e: HockeyEvent) => void; homeName: string; awayName: string;
}) {
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(s0, nameOf), [s0, nameOf]); // IDs-only scoring: names by id
  if (!s.events.length) return null;
  return (
    <View style={c.panel}>
      <Text style={c.link} accessibilityRole="button" onPress={() => setShow(!show)}>{show ? 'Hide' : '✎ Correct the timeline'}</Text>
      {show ? [...timelineEvents(s)].reverse().slice(0, 40).map(({ e, saver }) => {
        const d = describeEvent(e, saver);
        return (
          <View key={e.id} style={c.editRow}>
            <Text style={c.editWhen}>{eventWhen(s, e)}</Text>
            <Text style={c.editLabel} numberOfLines={2}>{d.icon} {d.label} · {e.side === 'home' ? homeName : awayName}{d.detail ? ` · ${d.detail}` : ''}</Text>
            {onEdit && e.type !== 'pc' && e.type !== 'save' && e.type !== 'referral' && e.type !== 'ruledout' ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${d.label}`} onPress={() => onEdit(e)} /> : null}
            <RowAction label="✕" tone="remove" a11y={`Remove ${d.label}`} onPress={() => void confirmRemove(`${d.label} (${eventWhen(s, e)})`, () => onRemove(e),
              s.events.some((x) => x.type === 'save' && x.ref === e.id) ? 'The keeper\'s save on it goes too. The score and player stats re-adjust.' : undefined)} />
          </View>
        );
      }) : null}
    </View>
  );
}

/* ------------------------------- live views -------------------------------- */

const LiveClock: NonNullable<SportPlugin<HockeyState>['LiveClock']> = ({ state }) => {
  const s = state as HockeyState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock?.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const so = soScore(s);
  const label = s.ended ? (s.shootout ? `FT · SO ${so.home}–${so.away}` : 'FT') : !periodStarted(s) ? (s.period === 1 ? '—' : `${periodName(s, s.period)} next`) : `${periodName(s, s.period)} ${clockFace(s, now)}`;
  const { nameOf } = useMask();
  const live = s.ended ? null : hockeyLiveField(s, now, nameOf);
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing(1), flex: 1, minWidth: 0 }}>
      <View style={c.clockRow2}>
        <View style={[c.dot, { backgroundColor: running(s) ? theme.colors.danger : theme.colors.textMuted }]} />
        <Text style={c.clockSmall}>{label}</Text>
      </View>
      {live ? (
        <View style={{ alignSelf: 'stretch' }}>
          <FieldBanner suspended={live.suspended} onField={live.short.home || live.short.away ? live.onField : null} />
        </View>
      ) : null}
    </View>
  );
};

/** Goals per quarter / half, the live period highlighted. */
const HockeyScoreboard: NonNullable<SportPlugin<HockeyState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as HockeyState;
  const n = Math.max(s.periods, s.period);
  const columns = [
    ...Array.from({ length: n }, (_, i) => ({ label: periodName(s, i + 1), highlight: !s.ended && i + 1 === s.period })),
    ...(s.shootout ? [{ label: 'SO' }] : []),
  ];
  const goals = (sd: Side, p: number) => s.events.filter((e) => e.type === 'goal' && e.side === sd && e.period === p).length;
  const so = soScore(s);
  const cells = (sd: Side) => [
    ...Array.from({ length: n }, (_, i) => (i + 1 <= s.period || s.ended ? String(goals(sd, i + 1)) : '')),
    ...(s.shootout ? [String(so[sd])] : []),
  ];
  const r = result(s);
  return (
    <LineScoreboard
      live={live}
      clock={<LiveClock state={s} />}
      leadLabel="GOALS"
      columns={columns}
      winner={r && r.winner !== 'draw' ? r.winner : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.home), cells: cells('home') }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.away), cells: cells('away') }}
    />
  );
};

/** Match tabs (2026-10-22): the live text by quarter (Commentary), the match
 *  centre — team stats by category and period, then each side's player box
 *  (Stats) — and the match facts with the result (Summary). */
type TabProps = Parameters<NonNullable<SportPlugin<HockeyState>['LiveExtras']>>[0];
const HockeyCommentary = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(state as HockeyState, nameOf), [state, nameOf]);
  return (
    <Commentary items={hockeyFeed(s, { home: homeName, away: awayName })} labelOf={hockeyPeriodLabel(s)} periods={hockeyFeedPeriods(s)}
      homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer}
      emptyText="No goals, corners or cards yet — every moment you log appears here." />
  );
};
const HockeyStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const { nameOf } = useMask();
  return <MatchCentre sport="hockey" source={hockeyBox(state as HockeyState, { homeRoster, awayRoster, nameOf })} categories={hockeyCentre} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />;
};
const HockeyFacts = ({ state, homeName, awayName, homeColor, awayColor }: TabProps) => {
  const { nameOf } = useMask();
  return <MatchFactsCard facts={resultFacts(hockeyFacts(state as HockeyState, Date.now(), nameOf))} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />;
};

/* --------------------------------- plugin ---------------------------------- */

export const hockeyPlugin: SportPlugin<HockeyState> = {
  ...HOCKEY_META,
  matchRecords: hockeyMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete,
  result,
  summary: (s) => {
    const so = soScore(s);
    return {
      homeScore: String(s.home),
      awayScore: String(s.away),
      statusLine: s.shootoutWinner
        ? `${s.shootoutWinner === 'home' ? 'Home' : 'Away'} win ${so.home}–${so.away} in the shoot-out`
        : s.shootout ? `Shoot-out ${so.home}–${so.away}`
        : s.ended ? 'Full Time'
        : !periodStarted(s) && s.period > 1 ? `End of ${periodName(s, s.period - 1)}`
        : periodLong(s, s.period)[0].toUpperCase() + periodLong(s, s.period).slice(1),
      detailLine: [aggLine(s), s.shootout ? `Shoot-out · ${so.home}–${so.away}` : ''].filter(Boolean).join(' · ') || undefined,
      homeReds: s.events.filter((e) => e.type === 'card' && e.card === 'red' && !e.official && e.side === 'home').length,
      awayReds: s.events.filter((e) => e.type === 'card' && e.card === 'red' && !e.official && e.side === 'away').length,
    };
  },
  // the shoot-out result under the score ("SO 4–3"); '' for every other match
  scoreLine: hockeyScoreLine,
  // Undo labels batch — Undo names the step in the sport's own words
  undoLabel: hockeyUndoLabel,
  statTotals: hockeyTotals,
  statTotalsKeys: STAT_TOTALS_KEYS, // NZI15: the sync clears a key no player has any more
  tickerDetail: hockeyTickerDetail,
  tickerFlash: hockeyTickerFlash,
  // SD-137a — voice scoring (period / match ends ask first)
  voice: { hints: ['goal {name}', 'PC goal {name} assist {name}', 'penalty corner home', 'shot saved {name}', 'green card {name}', 'end quarter'], parse: hockeyVoice, ends: hockeyVoiceEnds },
  ScoringControls,
  LiveClock,
  Scoreboard: HockeyScoreboard,
  matchTabs: { Commentary: HockeyCommentary, Stats: HockeyStats, SummaryExtras: HockeyFacts },
  formation: (perSide) => hockeyFormation(perSide),
  Court: HockeyPitch,
  liveSettings: HOCKEY_LIVE_SETTINGS,
};

const c = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  panel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' },
  flex: { flex: 1 },
  cols: { flexDirection: 'row', gap: theme.spacing(2) },
  col: { flex: 1, gap: theme.spacing(2), minWidth: 0 },
  team: { fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  h: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flexShrink: 1 },
  small: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  done: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800' },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  clock: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900', fontVariant: ['tabular-nums'] },
  clockRow2: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  clockSmall: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  dot: { width: 9, height: 9, borderRadius: 5 },
  gk: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textAlign: 'center' },
  short: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', textAlign: 'center' },
  flowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  cancel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  pchip: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, maxWidth: '100%' },
  pnum: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pname: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  skip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'transparent' },
  skipTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  soRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  soTeam: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', width: 110 },
  soDots: { color: theme.colors.text, fontSize: theme.font.body, letterSpacing: 1, flex: 1 },
  stopped: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent },
  stoppedTxt: { flex: 1, color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  circlePanel: { gap: theme.spacing(1) },
  circleRow: { flexDirection: 'row', gap: theme.spacing(1), alignItems: 'center', minWidth: 0 },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editWhen: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', width: 56 },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});
