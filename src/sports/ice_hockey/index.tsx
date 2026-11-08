/**
 * Ice hockey plugin (IIHF; NHL / US high-school / youth presets) — SD-145.
 * Archetype: goal / time on a stoppable game clock (3 periods, counting down).
 * The pure rules live in ./engine.ts; statTotals in ./totals.ts, the box score
 * in ./box.ts, the timeline in ./timeline.ts.
 *
 * The scorer's panel: the clock (start / stop at every whistle, end the period,
 * set it) with the penalty box under it (who is serving, time left, 5 v 4),
 * then per side Goal (scorer, up to two assists; power play / short-handed /
 * empty net pre-filled from the penalties and the net, changeable; optional
 * +/- on-ice picks), Shot (on goal — the other goalie's save), Penalty (kind,
 * infraction, player), Penalty shot, Pull goalie / Goalie back, Time-out, and
 * the goalie in net. A level game goes to overtime (sudden death) and / or a
 * shoot-out as the decider says; the scorer picks who shoots first.
 *
 * Corrections: "Correct the timeline" removes or re-enters a past moment
 * (REMOVE_EVENT with the reversed credits — a second assist's own reversal
 * rides on a STAT_ADJUST — then the same flow stamped at the original time,
 * SD-114: Cancel keeps the event).
 */
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DescribeCard, useDescribeMarks } from '../../components/DescribeCard';
import { assistPart } from '../invasion/goalDetail';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { withNames, nameFor, legacyNameOf, type NameOf } from '../invasion/names';
import { keeperAction, xiStamp } from '../invasion/actions';
import { ensureContrast } from '../../core/contrast';
import { Button, SelectChip, TextField } from '../../components/ui';
import { confirmMatchAction } from '../../components/ConfirmSheet';
import { LineScoreboard } from '../../components/LineScoreboard';
import { MatchBoxScore } from '../../components/BoxScore';
import { FieldBanner } from '../FieldBanner';
import { SubViews } from '../SubViews';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import {
  init, reducer, isComplete, result, levelAtEnd, aggLine, matchSec, periodSec, periodLen, clockFace, mmss, periodName, periodLong,
  periodStarted, running, eventCredits, creditAttribution, goalFlagsNow, goalieAt, goalieOf, netEmpty, penaltyBox, partEnd, skatersOn, baseSkaters,
  soScore, nextShooter, needsSdPick, iceHockeyScoreLine, timeoutLeft, totalPeriods, nextIsOvertime, eventWhen, standingsUnits, ejects,
  ICE_HOCKEY_PRESETS, ICE_HOCKEY_LIVE_SETTINGS, PEN_LABEL, INFRACTIONS, STRENGTH_LABEL, LIVE_KEYS,
  TALLY_LABEL, TRACK_FLAGS, TRACK_KINDS, TRACK_FIELDS, iceTrackedKeys, soAction, penaltyShotAction, goalDetailAction, foZoneAction, foZonePatch,
  type FoZone, type IceEvent, type IceHockeyState, type PenKind, type Side, type Strength, type TallyKind,
} from './engine';
import { iceHockeyCommentary, iceScopeLabel, ICE_FEED_TAGS } from './commentary';
import { ruledOutAction, RULED_OUT_REASONS, RULED_OUT_LABEL } from '../invasion/ruledOut';
import { asksWho } from '../invasion/asksWho';
import { iceHockeySheet } from './sheet';
import { GroupedFeed } from '../GroupedFeed';
import { StatSheetView } from '../StatSheetView';
import { iceHockeyTotals, STAT_TOTALS_KEYS } from './totals';
import { iceHockeyBox } from './box';
import { iceHockeyTimeline, describeEvent, goalTags } from './timeline';
import { iceHockeyTickerDetail, iceHockeyTickerFlash } from './ticker';
import { iceHockeyFormation, IceRink } from './rink';
import { iceHockeyVoice, iceHockeyVoiceEnds } from './voice';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';
import { ICE_HOCKEY_META } from './meta';
import { iceHockeyMatchRecords } from './records';
import { IconText } from '../../components/Icon';
import { MainAction } from '../MainAction';

const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isGoaliePos = (p?: string | null) => !!p && /^\s*(g|gk|goalie|goaltender|goal\s*-?\s*keeper|netminder)\s*$/i.test(p);
const BASE_TRACKED: string[] = LIVE_KEYS.filter((k) => k !== 'soTaken' && k !== 'soGoals');
/** the keys this match tracks (the base set + the optional tallies switched on + round 2's faceoff zones) */
// NZI8/NZI10 (no false zeros): the tallies already recorded, plus the event being recorded now
const trackedKeys = (s: IceHockeyState, add?: Parameters<typeof eventCredits>[0]): string[] => [...BASE_TRACKED, ...iceTrackedKeys(s, add)];
const TALLY_CHIP: Record<TallyKind, string> = { faceoff: '⚪ Faceoff won', hit: '💥 Hit', block: '🛡 Block', takeaway: '✂️ Takeaway', giveaway: '🎁 Giveaway', missed: '↗ Missed shot' };
const PEN_MENU: PenKind[] = ['minor', 'double', 'major', 'majorGm', 'misconduct', 'gm', 'match', 'bench'];

/* ------------------------------ player picker ------------------------------ */

function PlayerGrid({ players, onPick, skip, picked }: { players: Player[]; onPick: (p: Player) => void; skip?: { label: string; onPress: () => void }; picked?: Set<string> }) {
  return (
    <View style={c.grid}>
      {players.map((p) => {
        const on = picked?.has(p.id);
        return (
          <TouchableOpacity key={p.id} style={[c.pchip, on ? c.pchipOn : null]} activeOpacity={0.75} accessibilityRole="button"
            accessibilityState={picked ? { selected: !!on } : undefined} accessibilityLabel={p.fullName} onPress={() => onPick(p)}>
            <Text style={c.pnum}>{p.jerseyNo ?? '–'}</Text>
            <Text style={[c.pname, on ? c.pnameOn : null]} numberOfLines={1}>{p.fullName}</Text>
          </TouchableOpacity>
        );
      })}
      {players.length === 0 ? <Text style={c.meta}>No players listed — use the button below.</Text> : null}
      {skip ? (
        <TouchableOpacity style={[c.pchip, c.skip]} activeOpacity={0.75} accessibilityRole="button" onPress={skip.onPress}>
          <Text style={c.skipTxt}>{skip.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Chip({ label, on, onPress, a11y }: { label: string; on: boolean; onPress: () => void; a11y?: string }) {
  return (
    <TouchableOpacity style={[c.chip, on ? c.chipOn : null]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a11y ?? label}>
      <Text style={[c.chipTxt, on ? c.chipTxtOn : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

// describe-invasion DI1: strength / EN are picked before the scorer (pre-set
// from the penalties and the net); the goal is on the board at the scorer tap,
// and the assists, strength and on-ice players are described after, on the goal
// card. `carry` (DI9): a re-entered goal keeps its assists and on-ice players.
type GoalDraft = { strength: Strength; en: boolean };
type Carry = { a1?: string; a2?: string; onIce?: { home?: string[]; away?: string[] } };
type Flow =
  | { mode: 'goal'; side: Side; step: 'scorer'; d: GoalDraft; carry?: Carry }
  | { mode: 'shot'; side: Side }
  // invasion batch 6: 'served' — served by a team-mate (optional; bench minor, goalie's or match penalty)
  | { mode: 'pen'; side: Side; step: 'kind' | 'infraction' | 'player' | 'served'; pen?: PenKind; infraction?: string; who?: Player | null }
  // invasion batch 6: a goal ruled out (only with the toggle on) — one tap logs it
  | { mode: 'ruledout'; side: Side; review?: boolean }
  | { mode: 'ps'; side: Side; step: 'result' | 'player'; res?: 'saved' | 'missed' }
  | { mode: 'gk'; side: Side }
  | { mode: 'tally'; side: Side; kind: TallyKind }
  | { mode: 'centres'; side: Side };
// (wave 4, polish-invasion PI1: the faceoff zone is no longer a panel — it is
// attached after, on the faceoff card)

/* -------------------------------- controls --------------------------------- */

const ScoringControls: SportPlugin<IceHockeyState>['ScoringControls'] = ({
  state: liveState, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [],
}) => {
  const { view: s, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  // IDs-only scoring: the state keeps player ids; names are looked up when shown
  const { nameOf: playerNameOf } = useMask();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [editAt, setEditAt] = useState<{ sec: number; period: number } | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [clockInput, setClockInput] = useState('');
  const [setting, setSetting] = useState(false);
  const [soTaker, setSoTaker] = useState<Player | null>(null);
  const [onIce, setOnIce] = useState<{ home: Set<string>; away: Set<string> }>({ home: new Set(), away: new Set() });
  // describe-invasion: the goal just scored (its id) — its card describes it; a
  // newer goal replaces it (DI6); Done / Skip per goal
  const [goalCard, setGoalCard] = useState<string | null>(null);
  const goalMarks = useDescribeMarks<string>();
  // wave 4 (polish-invasion PI1, PI10): the faceoff just won (its id) — its card
  // takes the zone after the winner tap; a newer faceoff replaces it
  const [foCard, setFoCard] = useState<string | null>(null);
  const foMarks = useDescribeMarks<string>();
  /** deep wave: the centres taking the draws (one-tap faceoffs credit them) */
  const [centres, setCentres] = useState<{ home?: Player; away?: Player }>({});
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (flow === null && editAt) { setEditAt(null); dropHeldRemoval(); } }, [flow]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const nowSec = editAt?.sec ?? matchSec(s, now);
  const name = (sd: Side) => (sd === 'home' ? homeName : awayName);
  const color = (sd: Side) => (sd === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  /** a team colour as TEXT on the panel (SD-155: ≥ 4.5:1) */
  const ink = (sd: Side) => ensureContrast(color(sd), theme.colors.surface);
  const rosterOf = (sd: Side) => (sd === 'home' ? homeRoster : awayRoster);
  const lineupOf = (sd: Side) => (sd === 'home' ? homeLineup : awayLineup);
  const byId = (sd: Side, id?: string, nm?: string): Player | undefined =>
    rosterOf(sd).find((p) => (id && p.id === id) || (!id && nm && p.fullName === nm)) ?? (id ? { id, fullName: nameFor(playerNameOf, id, nm) ?? 'Player', sports: ['ice_hockey'] } as Player : undefined);

  // stamp every event with its game-clock second (or the edited moment's)
  const fire = (a: ScoreAction) => {
    const at = Date.now();
    dispatch({ ...a, payload: { ...a.payload, uid: (a.payload?.uid as string | undefined) ?? uid(), at, sec: editAt?.sec ?? matchSec(s, at), period: editAt?.period ?? s.period, ...(editAt ? { edit: true } : {}) } });
  };

  /* ---- who is dressed / in the box ---- */
  // IDs-only scoring: the stamp carries player ids only (invasion/actions.ts)
  const stampOf = (sd: Side) => xiStamp(lineupOf(sd), rosterOf(sd), { slot: (sl) => isGoaliePos(sl.position), player: (p) => isGoaliePos(p.sportDetails?.ice_hockey?.position) });
  const stampXi = () => {
    for (const sd of ['home', 'away'] as const) {
      const st = stampOf(sd);
      if (!st.players && !st.gk) continue;
      if (JSON.stringify(st) === JSON.stringify(s.xi?.[sd] ?? {})) continue;
      dispatch({ type: 'XI', payload: { team: sd, ...st } });
    }
  };
  const box = penaltyBox(s, nowSec);
  const out = (sd: Side) => new Set(box.ejected.filter((x) => x.side === sd).flatMap((x) => [x.who.id, x.who.name].filter(Boolean) as string[]));
  const inBox = (sd: Side) => new Set([...box.running[sd], ...box.waiting[sd]].flatMap((p) => [p.who.id, p.who.name].filter(Boolean) as string[])
    .concat(box.misconduct.filter((m) => m.side === sd).flatMap((m) => [m.who.id, m.who.name].filter(Boolean) as string[])));
  /** the dressed players still in the game (ejected out) */
  const dressed = (sd: Side): Player[] => {
    const gone = out(sd);
    const lu = (s.xi?.[sd]?.players?.length ? [] : lineupOf(sd).filter((sl) => sl.playerId).map((sl) => byId(sd, sl.playerId, sl.playerName)).filter((p): p is Player => !!p));
    const base = rosterOf(sd).length ? rosterOf(sd) : lu;
    return base.filter((p) => !gone.has(p.id) && !gone.has(p.fullName));
  };
  /** who can be on the ice now (not in the box) */
  const skatersOf = (sd: Side): Player[] => {
    const b = inBox(sd);
    const g = goalieOf(s, sd);
    // the side's goalie isn't offered as a scorer / shooter (a goalie goal: ✎ Edit afterwards)
    return dressed(sd).filter((p) => !b.has(p.id) && !b.has(p.fullName) && !(g?.id && p.id === g.id));
  };
  const goalie = (sd: Side) => { const g = goalieAt(s, sd); return g?.id ? byId(sd, g.id, g.name) : undefined; };
  const theGoalie = (sd: Side) => { const g = goalieOf(s, sd); return g?.id ? byId(sd, g.id, g.name) : undefined; };

  /* ---- recorders ---- */
  const TRACKED = trackedKeys(s);
  const credit = (e: Parameters<typeof eventCredits>[0]) => {
    const cr = eventCredits(e, s.pimScale);
    const tr = trackedKeys(s, e);
    return { attribution: creditAttribution(cr.first, 1, tr), attribution2: creditAttribution(cr.second, 1, tr), third: creditAttribution(cr.third, 1, tr) };
  };
  /** deep wave: an optional tally (a faceoff credits the winning centre and the loser).
   *  Wave 4 (polish-invasion PI1): a faceoff logs at the winner tap with no zone;
   *  with zones on, its card then takes the zone (FO_ZONE, by the faceoff's id). */
  const tally = (sd: Side, kind: TallyKind, p: Player | null | undefined, loser?: Player | null) => {
    const id = uid();
    const cr = credit({ type: 'tally', side: sd, tally: kind, playerId: p?.id, ...(kind === 'faceoff' && loser ? { secondId: loser.id } : {}) });
    fire({ type: 'TALLY', side: sd, payload: { uid: id, kind }, attribution: cr.attribution, attribution2: cr.attribution2 });
    if (kind === 'faceoff' && s.trackFaceoffZones) setFoCard(id);
    setFlow(null);
  };
  /** the faceoff card's zone (null clears), on that faceoff (its credits: the difference) */
  const foZone = (ref: string, z: FoZone | null) => {
    const e = s.events.find((x) => x.id === ref);
    const n = e ? foZonePatch(e, z) : null;
    const a = n ? foZoneAction(s, ref, z, trackedKeys(s, n)) : null;
    if (a) dispatch(a);
  };
  // describe-invasion DI1: on the board at the scorer tap ("Team goal" too); the
  // rest is attached after (GOAL_DETAIL, by the goal's id). DI9: a re-entered
  // goal carries its original assists (not the new scorer) and on-ice players.
  const goal = (sd: Side, d: GoalDraft, scorer: Player | null, carry: Carry = {}) => {
    const id = uid();
    const a1 = carry.a1 && carry.a1 !== scorer?.id ? carry.a1 : undefined;
    const a2 = a1 && carry.a2 && carry.a2 !== scorer?.id ? carry.a2 : undefined;
    const cr = credit({ type: 'goal', side: sd, playerId: scorer?.id, secondId: a1, strength: d.strength, en: d.en });
    fire({ type: 'GOAL', side: sd, payload: { uid: id, strength: d.strength, ...(d.en ? { en: true } : {}), ...(carry.onIce ? { onIce: carry.onIce } : {}) }, attribution: cr.attribution, attribution2: cr.attribution2 });
    if (a2) {
      const c3 = credit({ type: 'goal', side: sd, thirdId: a2 }).third;
      fire({ type: 'ASSIST2', side: sd, payload: { ref: id }, attribution: c3 });
    }
    setFlow(null);
    setGoalCard(id);
    if (s.plusMinus) {
      // prefill the on-ice picks from the last goal (lines change, so they're checked on the card)
      const lastIce = carry.onIce ?? [...s.events].reverse().find((e) => e.type === 'goal' && e.onIce)?.onIce;
      const keep = (side: Side) => new Set((lastIce?.[side] ?? []).filter((pid) => skatersOf(side).some((p) => p.id === pid)));
      const h = keep('home'), a = keep('away');
      for (const pid of [scorer?.id, a1, a2]) if (pid) (sd === 'home' ? h : a).add(pid);
      setOnIce({ home: h, away: a });
    }
  };
  /** one detail of the goal card, on that goal (its credits: the difference) */
  const detail = (ref: string, patch: Record<string, unknown>) => {
    const a = goalDetailAction(s, ref, patch, TRACKED);
    if (a) dispatch(a);
  };
  const shot = (sd: Side, p: Player | null) => {
    const gk = goalie(opp(sd));
    const cr = credit({ type: 'shot', side: sd, playerId: p?.id, gkId: gk?.id });
    fire({ type: 'SHOT', side: sd, payload: {}, attribution: cr.attribution, attribution2: cr.attribution2 });
    setFlow(null);
  };
  // screen sweep (S2): a penalty shot (scored / saved / missed), built in the engine
  const ps = (sd: Side, res: 'scored' | 'saved' | 'missed', p: Player | null) => {
    fire(penaltyShotAction(s, sd, res, p?.id, goalie(opp(sd))?.id, TRACKED));
    if (res === 'scored') setGoalCard(null); // (no assists on it; the last goal's card closes — DI6)
    setFlow(null);
  };
  const penalty = (sd: Side, pen: PenKind, infraction: string | undefined, p: Player | null, served?: Player | null) => {
    const cr = credit({ type: 'pen', side: sd, pen, playerId: p?.id });
    fire({ type: 'PEN', side: sd, payload: { pen, ...(infraction ? { infraction } : {}), ...(!cr.attribution && p ? { playerId: p.id } : {}), ...(served ? { servedId: served.id } : {}) }, attribution: cr.attribution });
    setFlow(null);
  };
  /** invasion batch 6: who serves it — asked (optional) for a bench minor, a
   *  goalie's penalty and a match / major + game misconduct (a team-mate sits
   *  the time); otherwise the penalty is logged at once, as before */
  const servedAsk = (sd: Side, pen: PenKind, p: Player | null) => pen === 'bench' || pen === 'match' || pen === 'majorGm' || (!!p && goalieOf(s, sd)?.id === p.id);
  const penOrServe = (sd: Side, pen: PenKind, infraction: string | undefined, p: Player | null) =>
    (servedAsk(sd, pen, p) ? setFlow({ mode: 'pen', side: sd, step: 'served', pen, infraction, who: p }) : penalty(sd, pen, infraction, p));
  const ruledOutOn = s.trackRuledOut === true;
  const setGoalie = (sd: Side, p: Player) => { fire(keeperAction(sd, p)); setFlow(null); };

  const startGoal = (sd: Side) => {
    const f = goalFlagsNow(s, sd, nowSec);
    setFlow({ mode: 'goal', side: sd, step: 'scorer', d: { strength: f.strength, en: f.en } });
  };

  /* ---- correct the timeline ---- */
  const removalActions = (e: IceEvent): ScoreAction[] => {
    const cr = eventCredits(e, s.pimScale);
    return [
      { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) },
      ...(cr.third ? [{ type: 'STAT_ADJUST', side: e.side, payload: { ref: e.id }, attribution: creditAttribution(cr.third, -1) } as ScoreAction] : []),
    ];
  };
  const remove = (e: IceEvent) => { for (const a of removalActions(e)) dispatch(a); };
  const edit = (e: IceEvent) => {
    if (e.type !== 'goal' && e.type !== 'shot' && e.type !== 'pen') { remove(e); return; }
    holdRemoval(removalActions(e));
    setEditAt({ sec: e.sec, period: e.period });
    setShowEdit(false);
    if (e.type === 'goal' && e.ps) setFlow({ mode: 'ps', side: e.side, step: 'result' });
    else if (e.type === 'goal') {
      const carry: Carry = { ...(e.secondId ? { a1: e.secondId } : {}), ...(e.thirdId ? { a2: e.thirdId } : {}), ...(e.onIce ? { onIce: e.onIce } : {}) };
      setFlow({ mode: 'goal', side: e.side, step: 'scorer', d: { strength: e.strength ?? 'ev', en: !!e.en }, carry });
    }
    else if (e.type === 'shot') setFlow(e.ps ? { mode: 'ps', side: e.side, step: 'result' } : { mode: 'shot', side: e.side });
    else setFlow({ mode: 'pen', side: e.side, step: 'kind' });
  };

  /* ---- clock ---- */
  const startStop = () => {
    const at = Date.now();
    if (running(s)) { dispatch({ type: 'CLOCK', payload: { run: false, at } }); return; }
    if (s.period === 1 && !periodStarted(s)) stampXi();
    dispatch({ type: 'CLOCK', payload: { run: true, at } });
  };
  const level = levelAtEnd(s);
  const toOt = s.period >= s.periods && nextIsOvertime(s);
  const last = s.period >= s.periods && !toOt;
  // SD-106: ending a period / the game asks first (ConfirmSheet)
  const endPeriod = async () => {
    if (!periodStarted(s)) return;
    const score = `${s.home}-${s.away}`;
    const ok = last ? await confirmMatchAction('fullTime', { score }) : await confirmMatchAction('endPeriod', { period: periodLong(s, s.period), score });
    if (!ok) return;
    if (last) stampXi();
    dispatch({ type: 'END_PERIOD', payload: { at: Date.now() } });
  };
  const applyClock = () => {
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(clockInput.trim());
    if (!m) return;
    // the time LEFT on the period clock (hockey counts down)
    const left = Number(m[1]) * 60 + Number(m[2] ?? 0);
    dispatch({ type: 'SET_CLOCK', payload: { periodSec: Math.max(0, Math.min(periodLen(s, s.period), periodLen(s, s.period) - left)), at: Date.now() } });
    setSetting(false); setClockInput('');
  };

  /* ---- describe-invasion: the card for the goal just scored ---- */
  // DI6: only that goal's; gone with it (Undo, a correction); hidden while a
  // correction is open (it holds a removal). DI11: an OT winner keeps it after the horn.
  const cardGoal = goalCard && !editAt ? s.events.find((e) => e.id === goalCard && e.type === 'goal' && !e.ps) : undefined;
  const goalCardView = cardGoal ? (() => {
    const g = cardGoal, ref = g.id, sd = g.side;
    const pname = (id?: string, nm?: string) => nameFor(playerNameOf, id, nm) ?? 'Player';
    const summary = [
      g.strength && g.strength !== 'ev' ? g.strength.toUpperCase() : '',
      g.en ? 'Empty net' : '',
      assistPart(playerNameOf, g.secondId, g.secondName),
      assistPart(playerNameOf, g.thirdId, g.thirdName, '2nd assist'),
      g.onIce ? `On ice: ${g.onIce.home?.length ?? 0} · ${g.onIce.away?.length ?? 0}` : '',
    ].filter(Boolean).join(' · ');
    const mates = skatersOf(sd).filter((p) => p.id !== g.playerId);
    const toggle = (side: Side, p: Player) => setOnIce((cur) => {
      const nx = new Set(cur[side]);
      if (nx.has(p.id)) nx.delete(p.id); else nx.add(p.id);
      return { ...cur, [side]: nx };
    });
    const gkIds = new Set([goalieOf(s, 'home')?.id, goalieOf(s, 'away')?.id].filter(Boolean) as string[]);
    return (
      <DescribeCard title={`Last goal · ${g.playerId ? pname(g.playerId, g.playerName) : name(sd)}`} summary={summary} mode={goalMarks.modeOf(ref)}
        onDone={() => goalMarks.mark(ref, 'done')} onSkip={() => goalMarks.mark(ref, 'skipped')} onEdit={() => goalMarks.mark(ref, null)}>
        <View style={c.chips}>
          {(['ev', 'pp', 'sh'] as const).map((k) => <Chip key={k} label={k.toUpperCase()} a11y={STRENGTH_LABEL[k]} on={(g.strength ?? 'ev') === k} onPress={() => detail(ref, { strength: k })} />)}
          <Chip label="EN" a11y="Empty net" on={!!g.en} onPress={() => detail(ref, { en: !g.en })} />
        </View>
        <Text style={c.small}>Assist (optional)</Text>
        <View style={c.chips}>
          {mates.filter((p) => p.id !== g.thirdId).map((p) => (
            <SelectChip key={p.id} label={`${p.jerseyNo != null ? `${p.jerseyNo} ` : ''}${p.fullName}`} active={g.secondId === p.id}
              // (the first assist can't be cleared under a second one)
              onPress={() => detail(ref, { a1: g.secondId === p.id ? (g.thirdId ? p.id : null) : p.id })} />
          ))}
        </View>
        {g.secondId ? (
          <>
            <Text style={c.small}>Second assist (optional)</Text>
            <View style={c.chips}>
              {mates.filter((p) => p.id !== g.secondId).map((p) => (
                <SelectChip key={p.id} label={`${p.jerseyNo != null ? `${p.jerseyNo} ` : ''}${p.fullName}`} active={g.thirdId === p.id} onPress={() => detail(ref, { a2: g.thirdId === p.id ? null : p.id })} />
              ))}
            </View>
          </>
        ) : null}
        {s.plusMinus ? (
          <>
            <Text style={c.small}>On the ice (+/-)</Text>
            <Text style={c.meta}>Tap the skaters on the ice when the goal went in (goalies don’t count). {g.strength === 'pp' ? 'A power-play goal doesn’t count for +/-.' : ''}</Text>
            {(['home', 'away'] as const).map((side) => (
              <View key={side} style={{ gap: theme.spacing(1) }}>
                <Text style={c.small}>{name(side)} · {onIce[side].size}</Text>
                <PlayerGrid players={skatersOf(side).filter((p) => !gkIds.has(p.id))} picked={onIce[side]} onPick={(p) => toggle(side, p)} />
              </View>
            ))}
            <Button label={`✓ Save on-ice (${onIce.home.size} · ${onIce.away.size})`} variant="ghost" onPress={() => detail(ref, { onIce: { home: [...onIce.home], away: [...onIce.away] } })} />
          </>
        ) : null}
      </DescribeCard>
    );
  })() : null;

  /* ---- wave 4 (polish-invasion PI1, PI10): the card for the faceoff just won ---- */
  // Only that faceoff's (a newer one replaces it); gone with it (Undo, a
  // correction); hidden while a correction is open. Named by the END the draw
  // was in, so it can't be read backwards; stored from the winner's view.
  const cardFo = foCard && !editAt && s.trackFaceoffZones ? s.events.find((e) => e.id === foCard && e.type === 'tally' && e.tally === 'faceoff') : undefined;
  const foCardView = cardFo ? (() => {
    const f = cardFo, ref = f.id, sd = f.side, o = opp(sd);
    const endOf: Record<FoZone, string> = { oz: `${name(o)} end`, nz: 'Neutral zone', dz: `${name(sd)} end` };
    const summary = f.zone ? endOf[f.zone] : '';
    const who = f.playerId ? nameFor(playerNameOf, f.playerId, f.playerName) ?? 'Player' : name(sd);
    return (
      <DescribeCard title={`Last faceoff · ${who} won it · where?`} summary={summary} mode={foMarks.modeOf(ref)}
        onDone={() => foMarks.mark(ref, 'done')} onSkip={() => foMarks.mark(ref, 'skipped')} onEdit={() => foMarks.mark(ref, null)}>
        <View style={c.chips}>
          <Chip label={endOf.oz} a11y={`In the ${name(o)} end: offensive zone for ${name(sd)}`} on={f.zone === 'oz'} onPress={() => foZone(ref, f.zone === 'oz' ? null : 'oz')} />
          <Chip label={endOf.nz} a11y="Neutral zone" on={f.zone === 'nz'} onPress={() => foZone(ref, f.zone === 'nz' ? null : 'nz')} />
          <Chip label={endOf.dz} a11y={`In the ${name(sd)} end: defensive zone for ${name(sd)}`} on={f.zone === 'dz'} onPress={() => foZone(ref, f.zone === 'dz' ? null : 'dz')} />
        </View>
      </DescribeCard>
    );
  })() : null;

  /* ---- after the final horn: the shoot-out ---- */
  if (s.ended) {
    if (s.shootout) {
      const sc = soScore(s);
      const nextSide = nextShooter(s.shootout, s.soRounds);
      const n = s.shootout[nextSide].length + 1;
      return (
        <View style={c.wrap}>
          <View style={c.panel}>
            <Text style={c.h}>🥅 Shoot-out · {sc.home}–{sc.away}</Text>
            {(['home', 'away'] as const).map((sd) => (
              <View key={sd} style={c.soRow}>
                <Text style={c.soTeam} numberOfLines={1}>{name(sd)}</Text>
                <Text style={c.soDots} accessibilityLabel={`${name(sd)}: ${s.shootout![sd].filter((k) => k.scored).length} of ${s.shootout![sd].length}`}>{s.shootout![sd].map((k) => (k.scored ? '●' : '○')).join(' ') || '–'}</Text>
              </View>
            ))}
            {s.shootoutWinner ? (
              <Text style={c.done}>{name(s.shootoutWinner)} win the shoot-out {sc.home}–{sc.away} (final {result(s)?.home}–{result(s)?.away})</Text>
            ) : needsSdPick(s) ? (
              <>
                <Text style={c.meta}>{s.soRounds} each and still level — one shooter each until decided. Who shoots first?</Text>
                <Text style={c.meta}>IIHF: the team that shot second goes first; NHL keeps the order. Pick what the referee says.</Text>
                <View style={c.row}>
                  <Button variant="primary" label={`${homeName} first`} color={color('home')} style={c.flex} onPress={() => dispatch({ type: 'SO_ORDER', payload: { first: 'home' } })} />
                  <Button variant="primary" label={`${awayName} first`} color={color('away')} style={c.flex} onPress={() => dispatch({ type: 'SO_ORDER', payload: { first: 'away' } })} />
                </View>
              </>
            ) : (
              <>
                <Text style={c.meta}>Next: {name(nextSide)} · shot {n}{n > s.soRounds ? ' (sudden death)' : ` of ${s.soRounds}`}</Text>
                <Text style={c.small}>Shooter (optional)</Text>
                <PlayerGrid players={dressed(nextSide).filter((p) => p.id !== soTaker?.id)} onPick={(p) => setSoTaker(p)} />
                {soTaker ? <Text style={c.meta}>Shooter: {soTaker.fullName}</Text> : null}
                {/* invasion batch 6 (audit fix 14): saved and missed apart, the goalie facing it by itself (shoot-out save figures) */}
                <View style={c.row}>
                  <Button variant="primary" label="✓ Scored" color={color(nextSide)} style={c.flex} onPress={() => { dispatch(soAction(nextSide, 'scored', soTaker, theGoalie(opp(nextSide)))); setSoTaker(null); }} />
                  <Button label="🧤 Saved" variant="ghost" style={c.flex} onPress={() => { dispatch(soAction(nextSide, 'saved', soTaker, theGoalie(opp(nextSide)))); setSoTaker(null); }} />
                  <Button label="↗ Missed" variant="ghost" style={c.flex} onPress={() => { dispatch(soAction(nextSide, 'missed', soTaker, theGoalie(opp(nextSide)))); setSoTaker(null); }} />
                </View>
                {theGoalie(opp(nextSide)) ? <Text style={c.meta}>Goalie: {theGoalie(opp(nextSide))!.fullName}</Text> : null}
              </>
            )}
          </View>
        </View>
      );
    }
    const canSo = level && s.decider !== 'none' && !(s.decider === 'playoff' && !s.poShootout);
    return (
      <View style={c.wrap}>
        <View style={c.panel}>
          <Text style={c.h}>Final · {s.home}–{s.away}{s.otPeriods && !level ? ' (OT)' : ''}</Text>
          {canSo ? (
            <>
              <Text style={c.meta}>Level — the game goes to a shoot-out ({s.soRounds} shooters each, then one each until decided).</Text>
              <Text style={c.h}>🪙 Who shoots first?</Text>
              <Text style={c.meta}>As the referee decides (often the home team chooses) — pick the team going first.</Text>
              <View style={c.row}>
                <Button variant="primary" label={`${homeName} first`} color={color('home')} style={c.flex} onPress={() => dispatch({ type: 'START_SHOOTOUT', payload: { first: 'home' } })} />
                <Button variant="primary" label={`${awayName} first`} color={color('away')} style={c.flex} onPress={() => dispatch({ type: 'START_SHOOTOUT', payload: { first: 'away' } })} />
              </View>
            </>
          ) : (
            <Text style={c.meta}>{s.agg ? `${aggLine(s)}${level ? '.' : ` — ${name(s.home + s.agg.home > s.away + s.agg.away ? 'home' : 'away')} go through.`}` : level ? 'Tie.' : `${name(s.home > s.away ? 'home' : 'away')} win.`} Use “Correct the timeline” below to fix a moment.</Text>
          )}
        </View>
        {goalCardView}
        {foCardView}
        <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} homeName={homeName} awayName={awayName} />
      </View>
    );
  }

  /* ---- flows ---- */
  const flowPanel = (() => {
    if (!flow) return null;
    const sd = flow.side;
    // describe-invasion DI1: every step left here DEFINES the play (Cancel backs
    // out); the goal's assists, strength and on-ice players are described after
    const head = (t: string) => (
      <View style={c.flowHead}>
        <Text style={[c.h, { color: ink(sd) }]} numberOfLines={1}>{t} · {name(sd)}</Text>
        <Text style={[c.cancel, c.tap]} accessibilityRole="button" onPress={() => setFlow(null)}>Cancel</Text>
      </View>
    );
    switch (flow.mode) {
      case 'goal': {
        const d = flow.d;
        const flags = (
          <View style={c.chips}>
            {(['ev', 'pp', 'sh'] as const).map((k) => <Chip key={k} label={k.toUpperCase()} a11y={STRENGTH_LABEL[k]} on={d.strength === k} onPress={() => setFlow({ ...flow, d: { ...d, strength: k } })} />)}
            <Chip label="EN" a11y="Empty net" on={d.en} onPress={() => setFlow({ ...flow, d: { ...d, en: !d.en } })} />
          </View>
        );
        return (
          <View style={c.panel}>{head('Goal')}
            {flags}
            <Text style={c.meta}>{STRENGTH_LABEL[d.strength]}{d.en ? ' · empty net' : ''} — set from the penalties and the net; tap to change.</Text>
            <Text style={c.small}>Who scored?</Text>
            <PlayerGrid players={skatersOf(sd)} onPick={(p) => goal(sd, d, p, flow.carry)}
              skip={{ label: 'Team goal (no scorer)', onPress: () => goal(sd, d, null, flow.carry) }} />
          </View>
        );
      }
      case 'shot':
        return (
          <View style={c.panel}>{head('Shot on goal')}
            <Text style={c.meta}>{goalie(opp(sd)) ? `The save goes to ${goalie(opp(sd))!.fullName}.` : 'No goalie set for the other side — the save is the team’s.'}</Text>
            <PlayerGrid players={skatersOf(sd)} onPick={(p) => shot(sd, p)} skip={{ label: 'Skip shooter', onPress: () => shot(sd, null) }} />
          </View>
        );
      case 'ps':
        if (flow.step === 'result') return (
          <View style={c.panel}>{head('Penalty shot')}
            <View style={c.row}>
              <Button variant="primary" label="✓ Scored" color={color(sd)} style={c.flex} onPress={() => (asksWho(skatersOf(sd)) ? setFlow({ mode: 'ps', side: sd, step: 'player' }) : ps(sd, 'scored', null))} />
              <Button label="🧤 Saved" variant="ghost" style={c.flex} onPress={() => (asksWho(skatersOf(sd)) ? setFlow({ ...flow, res: 'saved', step: 'player' }) : ps(sd, 'saved', null))} />
              <Button label="↗ Missed" variant="ghost" style={c.flex} onPress={() => (asksWho(skatersOf(sd)) ? setFlow({ ...flow, res: 'missed', step: 'player' }) : ps(sd, 'missed', null))} />
            </View>
          </View>
        );
        return (
          <View style={c.panel}>{head('Penalty shot · shooter')}
            <PlayerGrid players={skatersOf(sd)} onPick={(p) => ps(sd, flow.res ?? 'scored', p)}
              skip={{ label: 'Skip shooter', onPress: () => ps(sd, flow.res ?? 'scored', null) }} />
          </View>
        );
      case 'ruledout':
        return (
          <View style={c.panel}>{head('Goal ruled out')}
            <Text style={c.small}>Why? (optional — one tap logs it; the score doesn’t move)</Text>
            <View style={c.chips}>
              <Chip label="Coach's challenge / video review" on={!!flow.review} onPress={() => setFlow({ ...flow, review: !flow.review })} />
            </View>
            <View style={c.chips}>
              {RULED_OUT_REASONS.ice_hockey.map((r) => <Chip key={r} label={RULED_OUT_LABEL[r]} on={false} onPress={() => { fire(ruledOutAction('ice_hockey', sd, { reason: r, review: flow.review })); setFlow(null); }} />)}
            </View>
            <Button label="Log it — no reason" variant="ghost" onPress={() => { fire(ruledOutAction('ice_hockey', sd, { review: flow.review })); setFlow(null); }} />
            <Text style={c.meta}>Already on the board? Remove the goal from the timeline too.</Text>
          </View>
        );
      case 'pen':
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head('Penalty')}
            <View style={c.grid}>
              {PEN_MENU.map((k) => <Button key={k} label={PEN_LABEL[k]} variant="ghost" style={c.typeBtn} onPress={() => setFlow({ ...flow, pen: k, step: 'infraction' })} />)}
            </View>
            <Text style={c.meta}>Minor: the team is a skater short for 2 minutes (ends early if the other team scores). Major: 5 minutes in full. Misconduct: the player sits 10 minutes, the team isn’t short. Game misconduct / match penalty: the player is out of the game (a match penalty also leaves the team short 5 minutes).</Text>
          </View>
        );
        if (flow.step === 'infraction') return (
          <View style={c.panel}>{head(PEN_LABEL[flow.pen ?? 'minor'])}
            <Text style={c.small}>Infraction (optional)</Text>
            <View style={c.chips}>
              {INFRACTIONS.map((x) => <Chip key={x} label={x} on={false} onPress={() => (flow.pen === 'bench' ? penOrServe(sd, 'bench', x, null) : setFlow({ ...flow, infraction: x, step: 'player' }))} />)}
              <Chip label="Skip" on={false} onPress={() => (flow.pen === 'bench' ? penOrServe(sd, 'bench', undefined, null) : setFlow({ ...flow, step: 'player' }))} />
            </View>
          </View>
        );
        if (flow.step === 'served') return (
          <View style={c.panel}>{head(`${PEN_LABEL[flow.pen ?? 'minor']} · served by`)}
            <Text style={c.small}>Served by (optional) — the team-mate who sits in the box</Text>
            <PlayerGrid players={skatersOf(sd).filter((p) => p.id !== flow.who?.id)} onPick={(p) => penalty(sd, flow.pen ?? 'minor', flow.infraction, flow.who ?? null, p)}
              skip={{ label: 'Skip', onPress: () => penalty(sd, flow.pen ?? 'minor', flow.infraction, flow.who ?? null) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`${PEN_LABEL[flow.pen ?? 'minor']}${flow.infraction ? ` · ${flow.infraction.toLowerCase()}` : ''}`)}
            <Text style={c.small}>Who?</Text>
            <PlayerGrid players={dressed(sd)} onPick={(p) => penOrServe(sd, flow.pen ?? 'minor', flow.infraction, p)}
              skip={{ label: 'Bench / team', onPress: () => penOrServe(sd, flow.pen === 'minor' ? 'bench' : flow.pen ?? 'bench', flow.infraction, null) }} />
            {flow.pen === 'match' || flow.pen === 'majorGm' ? <Text style={c.meta}>A team-mate serves the 5 minutes; the player is out of the game.</Text> : null}
          </View>
        );
      case 'gk':
        return (
          <View style={c.panel}>{head('Goalie in net')}
            <PlayerGrid players={dressed(sd)} onPick={(p) => setGoalie(sd, p)} />
          </View>
        );
      case 'tally':
        return (
          <View style={c.panel}>{head(TALLY_LABEL[flow.kind])}
            <Text style={c.small}>Who? (optional)</Text>
            <PlayerGrid players={flow.kind === 'block' ? dressed(sd).filter((p) => !inBox(sd).has(p.id)) : skatersOf(sd)} onPick={(p) => tally(sd, flow.kind, p)}
              skip={{ label: 'Team (no name)', onPress: () => tally(sd, flow.kind, null) }} />
          </View>
        );
      case 'centres':
        return (
          <View style={c.panel}>{head('Centres on the draw')}
            <Text style={c.meta}>Faceoff won credits these two (the winner and the loser). Change them when the lines change.</Text>
            {(['home', 'away'] as const).map((side) => (
              <View key={side} style={{ gap: theme.spacing(1) }}>
                <Text style={c.small}>{name(side)}{centres[side] ? ` · ${centres[side]!.fullName}` : ''}</Text>
                <PlayerGrid players={skatersOf(side)} picked={new Set(centres[side] ? [centres[side]!.id] : [])} onPick={(p) => setCentres((cur) => ({ ...cur, [side]: p }))} />
              </View>
            ))}
            <View style={c.row}>
              <Button variant="primary" label="✓ Done" style={c.flex} onPress={() => setFlow(null)} />
              <Button label="Clear" variant="ghost" onPress={() => { setCentres({}); setFlow(null); }} />
            </View>
          </View>
        );
    }
  })();

  const on = skatersOn(s, box);
  const base = baseSkaters(s);
  const pulled = { home: netEmpty(s, 'home'), away: netEmpty(s, 'away') };
  /** deep wave: the tallies switched on for this match (the toggle, not just past events) */
  const kindsOn: TallyKind[] = TRACK_FLAGS.filter((f) => s[f] === true).flatMap((f) => TRACK_KINDS[f]);
  const extras = (sd: Side) => (kindsOn.length ? (
    <View style={c.chips} accessibilityLabel={`More stats for ${name(sd)}`}>
      {kindsOn.map((k) => (
        <Chip key={k} label={TALLY_CHIP[k]} on={false} a11y={`${TALLY_LABEL[k]}, ${name(sd)}`}
          onPress={() => (k === 'faceoff'
            // one tap logs it (wave 4: with zones on, the zone goes on the faceoff card after)
            ? tally(sd, 'faceoff', centres[sd], centres[opp(sd)])
            : setFlow({ mode: 'tally', side: sd, kind: k }))} />
      ))}
    </View>
  ) : null);
  const sideCol = (sd: Side) => {
    const gk = theGoalie(sd);
    const toLeft = timeoutLeft(s, sd);
    return (
      <View key={sd} style={c.col}>
        <Text style={[c.team, { color: ink(sd) }]} numberOfLines={1}>{name(sd)}</Text>
        <MainAction label="🚨 Goal" plus="+1" color={color(sd)} disabled={!periodStarted(s)} onPress={() => startGoal(sd)} />
        <Button label="🎯 Shot" accessibilityLabel={`Shot on goal by ${name(sd)}`} variant="ghost" disabled={!periodStarted(s)} onPress={() => setFlow({ mode: 'shot', side: sd })} />
        <Button label="⏱ Penalty" variant="ghost" onPress={() => setFlow({ mode: 'pen', side: sd, step: 'kind' })} />
        <Button label="⭕ Penalty shot" variant="ghost" disabled={!periodStarted(s)} onPress={() => setFlow({ mode: 'ps', side: sd, step: 'result' })} />
        {ruledOutOn ? <Button label="❎ Goal ruled out" accessibilityLabel={`${name(sd)} goal ruled out`} variant="ghost" disabled={!periodStarted(s)} onPress={() => setFlow({ mode: 'ruledout', side: sd })} /> : null}
        <Button label={pulled[sd] ? '🔙 Goalie back' : '🥅 Pull goalie'} accessibilityLabel={pulled[sd] ? `${name(sd)} goalie back in net` : `${name(sd)} pull the goalie for an extra skater`}
          variant="ghost" onPress={() => fire({ type: pulled[sd] ? 'BACK' : 'PULL', side: sd })} />
        <Button label={`⏸ Time-out · ${toLeft}`} accessibilityLabel={`Team time-out for ${name(sd)}, ${toLeft} left`} variant="ghost" disabled={toLeft === 0 || !periodStarted(s)} onPress={() => fire({ type: 'TIMEOUT', side: sd })} />
        {periodStarted(s) ? extras(sd) : null}
        <Text style={[c.gk, c.tap]} accessibilityRole="button" accessibilityLabel={`Goalie for ${name(sd)}: ${gk ? gk.fullName : 'not set'}. Change`} onPress={() => setFlow({ mode: 'gk', side: sd })} numberOfLines={2}>
          🧤 {gk ? `${gk.fullName}${pulled[sd] ? ' (pulled)' : ''}` : 'Set goalie'} ›
        </Text>
      </View>
    );
  };

  const boxRows = (['home', 'away'] as const).flatMap((sd) => [
    ...box.running[sd].map((p) => ({ sd, text: `${nameFor(playerNameOf, p.who.id, p.who.name) ?? 'Bench'} · ${mmss(partEnd(p) - nowSec)}${p.parts.length > 1 ? ` (+${mmss(p.parts.slice(p.part + 1).reduce((a, b) => a + b, 0))})` : ''}` })),
    ...box.waiting[sd].map((p) => ({ sd, text: `${nameFor(playerNameOf, p.who.id, p.who.name) ?? 'Bench'} · waits (${mmss(p.parts.reduce((a, b) => a + b, 0))})` })),
    ...box.misconduct.filter((m) => m.side === sd).map((m) => ({ sd, text: `${nameFor(playerNameOf, m.who.id, m.who.name) ?? 'Player'} · 10′ ${mmss(m.until - nowSec)}` })),
  ]);

  return (
    <View style={c.wrap}>
      {editAt ? <BackfillBar at={eventWhen(s, editAt)} onLive={() => setFlow(null)} /> : null}
      <View style={c.panel}>
        <View style={c.clockRow}>
          <View style={{ flex: 1 }}>
            <Text style={c.small}>{periodLong(s, s.period)}{s.period > s.periods ? ` · sudden death, ${base} on ${base}` : ''}</Text>
            <Text style={c.clock} accessibilityLabel={`${clockFace(s, now)} left in the ${periodLong(s, s.period)}`}>{clockFace(s, now)}</Text>
          </View>
          <Button label={running(s) ? '⏸ Pause clock' : periodStarted(s) ? '▶ Resume' : s.period === 1 ? '▶ Face-off' : `▶ Start ${periodName(s, s.period)}`} variant={running(s) ? 'ghost' : 'primary'} onPress={startStop} />
        </View>
        <View style={c.row}>
          {!last ? <Button label={`End ${periodName(s, s.period)} →`} variant={periodStarted(s) && running(s) ? 'primary' : 'ghost'} style={c.flex} disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
          <Button label="⏱ Set clock" variant="ghost" style={c.flex} onPress={() => setSetting((v) => !v)} />
        </View>
        {toOt && periodStarted(s) ? <Text style={c.meta}>Level — ending this period goes to overtime (sudden death).</Text> : null}
        {setting ? (
          <View style={c.row}>
            <View style={c.flex}><TextField label="Time left (mm:ss)" value={clockInput} onChange={setClockInput} placeholder={clockFace(s, now)} /></View>
            <Button variant="primary" label="Set" onPress={applyClock} />
          </View>
        ) : null}
        {periodSec(s, now) >= periodLen(s, s.period) && running(s) ? <Text style={c.short}>0:00 — end of the {periodLong(s, s.period)}.</Text> : null}
        {!running(s) && periodStarted(s) && periodSec(s, now) < periodLen(s, s.period) ? (
          <View style={c.stopped} accessibilityRole="alert">
            <IconText label={"⏸ Clock stopped (whistle)"} style={c.stoppedTxt} />
            <Button variant="primary" label="▶ Resume" onPress={startStop} />
          </View>
        ) : null}
        {on.home !== base || on.away !== base || pulled.home || pulled.away ? (
          <Text style={c.strength} accessibilityRole="text">
            {on.home + (pulled.home ? 1 : 0)} v {on.away + (pulled.away ? 1 : 0)}
            {on.home > on.away ? ` · ${name('home')} power play` : on.away > on.home ? ` · ${name('away')} power play` : ''}
            {pulled.home ? ` · ${name('home')} net empty` : ''}{pulled.away ? ` · ${name('away')} net empty` : ''}
          </Text>
        ) : null}
        {boxRows.length ? (
          <View style={c.boxList} accessibilityLabel="Penalty box">
            {boxRows.map((r, i) => <Text key={i} style={[c.boxRow, { color: ink(r.sd) }]} numberOfLines={1}>⏱ {name(r.sd)} · {r.text}</Text>)}
          </View>
        ) : null}
      </View>

      {flowPanel ?? <View style={c.cols}>{sideCol('home')}{sideCol('away')}</View>}
      {/* describe-invasion: under the controls — scoring carries straight on */}
      {goalCardView}
      {foCardView}
      {!flowPanel && s.trackFaceoffs ? (
        <Text style={[c.gk, c.tap]} accessibilityRole="button" onPress={() => setFlow({ mode: 'centres', side: 'home' })}>
          ⚪ Centres: {centres.home?.fullName ?? '—'} v {centres.away?.fullName ?? '—'} · change ›
        </Text>
      ) : null}

      <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} onEdit={edit} homeName={homeName} awayName={awayName} />
      {last ? <Button label="🏁 Final horn" accessibilityLabel="End the game (final horn)" variant="danger" disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
      {last && !periodStarted(s) ? <Text style={c.gk}>Start {periodName(s, s.period)} first — the final horn unlocks once it’s under way.</Text> : null}
    </View>
  );
};

/** The scorer's "Correct the timeline" list: remove a moment, or re-enter it. */
function EditList({ s: s0, show, setShow, onRemove, onEdit, homeName, awayName }: {
  s: IceHockeyState; show: boolean; setShow: (v: boolean) => void; onRemove: (e: IceEvent) => void; onEdit?: (e: IceEvent) => void; homeName: string; awayName: string;
}) {
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(s0, nameOf), [s0, nameOf]); // IDs-only scoring: names by id
  if (!s.events.length) return null;
  return (
    <View style={c.panel}>
      <Text style={[c.link, c.tap]} accessibilityRole="button" onPress={() => setShow(!show)}>{show ? 'Hide' : '✎ Correct the timeline'}</Text>
      {show ? [...s.events].reverse().slice(0, 40).map((e) => {
        const d = describeEvent(e);
        return (
          <View key={e.id} style={c.editRow}>
            <Text style={c.editWhen}>{eventWhen(s, e)}</Text>
            <Text style={c.editLabel} numberOfLines={2}>{d.icon} {d.label} · {e.side === 'home' ? homeName : awayName}{d.detail ? ` · ${d.detail}` : ''}</Text>
            {onEdit && (e.type === 'goal' || e.type === 'shot' || e.type === 'pen') ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${d.label}`} onPress={() => onEdit(e)} /> : null}
            <RowAction label="✕" tone="remove" a11y={`Remove ${d.label}`} onPress={() => void confirmRemove(`${d.label} (${eventWhen(s, e)})`, () => onRemove(e),
              e.type === 'goal' ? 'The score, the assists and the penalty box re-adjust.' : undefined)} />
          </View>
        );
      }) : null}
    </View>
  );
}

/* ------------------------------- live views -------------------------------- */

const LiveClock: NonNullable<SportPlugin<IceHockeyState>['LiveClock']> = ({ state }) => {
  const s = state as IceHockeyState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock?.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const so = soScore(s);
  const label = s.ended ? (s.shootout ? `Final · SO ${so.home}–${so.away}` : s.otPeriods && !levelAtEnd(s) ? 'Final (OT)' : 'Final')
    : !periodStarted(s) ? (s.period === 1 ? '—' : `${periodName(s, s.period)} next`) : `${periodName(s, s.period)} ${clockFace(s, now)}`;
  let banner: React.ReactNode = null;
  const { nameOf } = useMask();
  if (!s.ended) {
    const sec = matchSec(s, now);
    const box = penaltyBox(s, sec);
    const on = skatersOn(s, box);
    const base = baseSkaters(s);
    // IDs-only scoring: the player in the box by id, for this viewer
    const suspended = (['home', 'away'] as const).flatMap((sd) => box.running[sd].map((p) => ({ side: sd, ...(p.who.id ? { id: p.who.id } : {}), name: nameFor(nameOf, p.who.id, p.who.name) ?? 'Bench', left: mmss(partEnd(p) - sec) })));
    banner = <FieldBanner suspended={suspended} onField={on.home !== base || on.away !== base ? on : null} unit="skaters" />;
  }
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing(1), flex: 1, minWidth: 0 }}>
      <View style={c.clockRow2}>
        <View style={[c.dot, { backgroundColor: running(s) ? theme.colors.danger : theme.colors.textMuted }]} />
        <Text style={c.clockSmall}>{label}</Text>
      </View>
      {banner ? <View style={{ alignSelf: 'stretch' }}>{banner}</View> : null}
    </View>
  );
};

/** Goals per period (and OT, SO), the live period highlighted. */
const IceHockeyScoreboard: NonNullable<SportPlugin<IceHockeyState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as IceHockeyState;
  const n = Math.max(totalPeriods(s), s.period);
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
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(r?.home ?? s.home), cells: cells('home') }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(r?.away ?? s.away), cells: cells('away') }}
    />
  );
};

/** The Stats tab's views — the broadcast match stats (period / category
 *  filters) and the box score. */
const VIEWS = [{ key: 'stats', label: 'Match stats' }, { key: 'box', label: 'Box score' }] as const;

/** Match tabs (2026-10-22): the play-by-play on Commentary (its "Key moments"
 *  chip replaces the old separate Key-moments view); match stats and the box
 *  score on Stats. */
type TabProps = Parameters<NonNullable<SportPlugin<IceHockeyState>['LiveExtras']>>[0];
const IceHockeyCommentary = ({ state, homeName, awayName, homeColor, awayColor }: TabProps) => {
  // IDs-only scoring: names looked up by id for this viewer
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(state as IceHockeyState, nameOf), [state, nameOf]);
  return (
    <GroupedFeed groups={iceHockeyCommentary(s, { home: homeName, away: awayName })} homeColor={homeColor} awayColor={awayColor} tags={ICE_FEED_TAGS} scopeLabel={iceScopeLabel(s)}
      emptyText="No plays yet — the commentary fills in from the first face-off." />
  );
};
const IceHockeyStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  // IDs-only scoring: names looked up by id for this viewer
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(state as IceHockeyState, nameOf), [state, nameOf]);
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const scopes = n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
  return (
    <SubViews label="Stats view" views={VIEWS.map((v) => ({
      ...v,
      render: () => v.key === 'stats' ? (
        <StatSheetView build={(sc) => iceHockeySheet(s, sc, s.ended ? undefined : matchSec(s, Date.now()))} scopes={scopes}
          homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />
      ) : (
        <MatchBoxScore sport="ice_hockey" source={iceHockeyBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} show="box" />
      ),
    }))} />
  );
};

/* ------------------------------- named Undo -------------------------------- */

/** SD-115: "goal (PP) · Rao (2-1)", "minor 2′ tripping · Khan", "shot · Rao". */
export function iceHockeyUndoLabel(step: { type: string; prev: unknown; next: unknown } | null | undefined, nameOf: NameOf = legacyNameOf): string | null {
  if (!step) return null;
  // IDs-only scoring: the players by id, for this viewer
  const prev = step.prev as IceHockeyState | undefined, next = step.next ? withNames(step.next as IceHockeyState, nameOf) : undefined;
  if (!prev?.events || !next?.events) return null;
  if (step.type === 'ASSIST2') {
    const g = next.events.find((e, i) => e.type === 'goal' && (e.thirdId || e.thirdName) && !(prev.events[i]?.thirdId || prev.events[i]?.thirdName));
    return g?.thirdName ? `second assist · ${g.thirdName}` : 'second assist';
  }
  if (step.type === 'GOAL_DETAIL') {
    // describe-invasion DI4: one detail attached after the goal
    const differs = (e: IceEvent, o?: IceEvent) => !o || e.secondId !== o.secondId || e.thirdId !== o.thirdId || e.strength !== o.strength || !!e.en !== !!o.en || JSON.stringify(e.onIce ?? null) !== JSON.stringify(o.onIce ?? null);
    const i = next.events.findIndex((e, k) => e.type === 'goal' && differs(e, prev.events[k]));
    const g = next.events[i], o = prev.events[i];
    if (!g || !o) return 'goal detail';
    if (g.secondId !== o.secondId) return g.secondId ? `assist · ${g.secondName ?? 'player'}` : 'assist removal';
    if (g.thirdId !== o.thirdId) return g.thirdId ? `second assist · ${g.thirdName ?? 'player'}` : 'second assist removal';
    if (g.strength !== o.strength) return 'goal strength';
    if (!!g.en !== !!o.en) return 'empty net';
    return 'players on the ice';
  }
  if (step.type === 'FO_ZONE') {
    // wave 4 (polish-invasion PI11): a faceoff's zone attached after the winner tap
    const i = next.events.findIndex((e, k) => e.type === 'tally' && e.tally === 'faceoff' && e.zone !== prev.events[k]?.zone);
    return i >= 0 && !next.events[i].zone ? 'faceoff zone removal' : 'faceoff zone';
  }
  if (step.type === 'CLOCK') return 'clock start / stop';
  if (step.type === 'SET_CLOCK') return 'clock set';
  if (step.type === 'END_PERIOD') return 'period end';
  if (step.type === 'XI') return 'line-up';
  if (step.type === 'SO') return 'shoot-out shot';
  if (next.events.length <= prev.events.length) return null;
  const e = next.events[next.events.length - 1];
  const who = e.playerName ?? (e.side === 'home' ? 'Home' : 'Away');
  switch (e.type) {
    case 'goal': { const t = goalTags(e); return `goal${t.length ? ` (${t.join(', ')})` : ''} · ${who} (${next.home}-${next.away})`; }
    case 'shot': return `shot · ${who}`;
    case 'pen': return `${PEN_LABEL[e.pen ?? 'minor'].toLowerCase()}${e.infraction ? ` ${e.infraction.toLowerCase()}` : ''} · ${who}`;
    default: return describeEvent(e).label.toLowerCase();
  }
}

/* --------------------------------- plugin ---------------------------------- */

export const iceHockeyPlugin: SportPlugin<IceHockeyState> = {
  ...ICE_HOCKEY_META,
  matchRecords: iceHockeyMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete,
  result,
  summary: (s) => {
    const so = soScore(s);
    const r = result(s);
    return {
      homeScore: String(r?.home ?? s.home),
      awayScore: String(r?.away ?? s.away),
      statusLine: s.shootoutWinner
        ? `${s.shootoutWinner === 'home' ? 'Home' : 'Away'} win the shoot-out ${so.home}–${so.away}`
        : s.shootout ? `Shoot-out ${so.home}–${so.away}`
        : s.ended ? (s.otPeriods && !levelAtEnd(s) ? 'Final (OT)' : 'Final')
        : !periodStarted(s) && s.period > 1 ? `End of ${periodName(s, s.period - 1)}`
        : periodLong(s, s.period)[0].toUpperCase() + periodLong(s, s.period).slice(1),
      detailLine: [aggLine(s), s.shootout ? `Shoot-out · ${so.home}–${so.away}` : ''].filter(Boolean).join(' · ') || undefined,
      homeReds: s.events.filter((e) => e.type === 'pen' && ejects(e.pen) && e.side === 'home').length,
      awayReds: s.events.filter((e) => e.type === 'pen' && ejects(e.pen) && e.side === 'away').length,
    };
  },
  scoreLine: iceHockeyScoreLine,
  standingsUnits: (s) => standingsUnits(s),
  statTotals: iceHockeyTotals,
  statTotalsKeys: STAT_TOTALS_KEYS, // NZI15: the sync clears a key no player has any more
  tickerDetail: iceHockeyTickerDetail,
  tickerFlash: iceHockeyTickerFlash,
  undoLabel: iceHockeyUndoLabel,
  voice: { hints: ['goal {name} assist {name}', 'power play goal {name}', 'shot {name}', 'two minutes tripping {name}', 'time-out home', 'end period', 'faceoff {name} (when tracked)'], parse: iceHockeyVoice, ends: iceHockeyVoiceEnds },
  ScoringControls,
  LiveClock,
  Scoreboard: IceHockeyScoreboard,
  matchTabs: { Commentary: IceHockeyCommentary, Stats: IceHockeyStats },
  formation: (perSide) => iceHockeyFormation(perSide),
  Court: IceRink,
  liveSettings: ICE_HOCKEY_LIVE_SETTINGS,
};

const c = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  panel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' },
  flex: { flex: 1 },
  typeBtn: { flexBasis: '46%', flexGrow: 1 },
  third: { flexBasis: '30%', flexGrow: 1 },
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
  strength: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  boxList: { gap: 2 },
  boxRow: { fontSize: theme.font.small, fontWeight: '700' },
  flowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  cancel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1) },
  chip: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.inputBorder, minHeight: 44, justifyContent: 'center' },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTxt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  chipTxtOn: { color: theme.colors.onFill },
  pchip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, maxWidth: '100%' },
  pchipOn: { backgroundColor: theme.colors.primary },
  pnum: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pname: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  pnameOn: { color: theme.colors.onFill },
  skip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'transparent' },
  skipTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  soRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  soTeam: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', width: 110 },
  soDots: { color: theme.colors.text, fontSize: theme.font.body, letterSpacing: 1, flex: 1 },
  stopped: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent },
  stoppedTxt: { flex: 1, color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  /** SD-155: text links get a ≥ 44 pt tall target */
  tap: { minHeight: 44, paddingVertical: theme.spacing(3) },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editWhen: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', width: 64 },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});

