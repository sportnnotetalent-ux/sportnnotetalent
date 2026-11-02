/**
 * Football plugin — archetype: goal/time.
 *
 * Captures the full set of in-game events an organizer logs live: goals (with
 * scorer + assist), yellow/red cards, substitutions and own goals — each
 * attributed to a player and stamped with the match minute. A running clock and
 * the commentary render on the live page (match tabs), visible to everyone.
 *
 * Clean sheets are NOT a live action (SD-09): the plugin's `statTotals` derives
 * them from the state — the goalkeeper on the pitch longest for a side that
 * conceded no open-play goal (shootouts excluded) — so completion, a shootout
 * and every later correction set them absolutely. The lineup is stamped into
 * the log (`XI`) at kickoff and at full time for that.
 *
 * The reducer is pure, so it can't read the clock — the controls compute the
 * current minute (via `currentMinute`) and pass it in `payload.minute`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { withNames, nameRow } from '../invasion/names';
import {
  goalAction, teamGoalAction, undoGoalAction, ownGoalAction, assistAction, cardActions, officialCardActions, sinBinAction, afterTeamPick, benchFor,
  statAction, foulAction, subAction, xiAction, xiOf, penKickAction, eventRemoval, statRemoval as statRemovalAction, type StatDetail,
  penaltyMissActions, gridSaveActions, cardChoices,
  stoppageAction, stoppageReasonAction, penaltyConcededActions, penaltyStepAfter, footballTrackedKeys, STOPPAGE_REASONS, STOPPAGE_LABEL,
} from './actions';
import { Button, TextField, SelectChip } from '../../components/ui';
import { askConfirm, confirmMatchAction } from '../../components/ConfirmSheet';
import { Pitch } from './Pitch';
import { LineupView } from './LineupView';
import { emptyFormation } from './formation';
import { isGoalkeeper } from './keepers';
import { footballLiveField, liveClockMinutes } from './fieldTime';
import { footballStatTotals } from './totals';
import { FieldBanner } from '../FieldBanner';
import { footballCentreSource } from './centre';
import { footballCentre } from './stats';
import { footballFeed, footballFacts, footballFeedPeriods, FOOTBALL_PERIOD_LABEL } from './feed';
import { Commentary, MatchFactsCard, resultFacts } from '../invasion/Commentary';
import { MatchCentre } from '../invasion/MatchCentre';
import {
  CARD_REASONS, CARD_REASON_LABEL, NO_GOAL_LABEL, ZONE_LABEL,
  type CardReason, type NoGoalReason, type ShotZone,
} from './events';
import { useSpeech } from '../../core/speech';
import { normalizeCommand as llmNormalize, enabled as llmEnabled } from '../../core/voiceLLM';
import { parseIntent, parseGoalType, matchPlayer, matchTeam, isNoAssist, isYes, isNo, deburr } from './voiceCommands';
import type { FootballEvent, GoalType, BodyPart } from './events';
import { type StatEvent, type StatKind, STAT_META, EVENT_META, GOAL_TYPE_LABEL, BODY_PART_LABEL } from './events';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { footballTickerDetail, footballTickerFlash } from './ticker';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';

/** How a level result at full time is settled. */
import {
  type Decider, type FootballState, type TrackConfig, type TeamStatTotals,
  init, reducer, decideShootout, penScore, HALF_NAME, currentMinute, halfBase, startOffset,
  clockLabel, clockTime, possessionPct, cardCount, FOOTBALL_LIVE_SETTINGS,
  minuteText, halfOfMinute, eventHalf, byMatchTimeDesc, fairPlayScore, pairedSecondYellowRed, type XiStamp,
  footballDetailLine, halfTimeText, kickText, isSubbedOff,
  needsDecision, footballComplete, footballResult,
  gcSec, gcRunning, gcTimeUp, halfLenSec, futsalTimeout, accumulatedFouls, FUTSAL_FOUL_LIMIT, DEEP_TRACK_FIELDS,
} from "./engine";
import { aggregateText } from "../aggregate";
import { FOOTBALL_META } from './meta';
import { footballMatchRecords } from './records';
import { footballUndoLabel } from './undoLabel';
import { IconText } from '../../components/Icon';

/* ------------------------------- Controls ---------------------------------- */

/** A tappable player list shown as a table — jersey number, name, position —
 *  so picking who did something while scoring live is fast and unambiguous. */
const PlayerTable = ({
  players,
  onPick,
  selectedId,
}: {
  players: Player[];
  onPick: (p: Player) => void;
  selectedId?: string;
}) => (
  <View style={ctrl.table}>
    {players.length === 0 ? (
      <Text style={ctrl.meta}>No players on the field.</Text>
    ) : (
      players.map((p) => (
        <TouchableOpacity accessibilityRole="button"
          key={p.id}
          style={[ctrl.prow, p.id === selectedId && ctrl.prowSel]}
          activeOpacity={0.7}
          onPress={() => onPick(p)}
        >
          <View style={ctrl.jersey}><Text style={ctrl.jerseyTxt}>{p.jerseyNo ?? '–'}</Text></View>
          <Text style={ctrl.pname} numberOfLines={1}>{p.fullName}</Text>
          {p.sportDetails?.football?.position ? <Text style={ctrl.ppos}>{p.sportDetails.football.position}</Text> : null}
        </TouchableOpacity>
      ))
    )}
  </View>
);

// How a goal was WON (its body part is a separate choice — see BodyPart).
const GOAL_TYPES: GoalType[] = ['open', 'penalty', 'freekick'];
const BODY_PARTS: BodyPart[] = ['left', 'right', 'head', 'chest'];

/** Flow state for the multi-step capture (goal, foul, or a generic stat/card). */
type Flow =
  | { mode: 'goal'; side: 'home' | 'away'; step: 'scorer' }
  | { mode: 'goal'; side: 'home' | 'away'; step: 'og' }
  | { mode: 'goal'; side: 'home' | 'away'; step: 'type'; scorer: Player } // voice path only
  | { mode: 'goal'; side: 'home' | 'away'; step: 'body'; scorer: Player; goalType: GoalType } // voice path only
  // Consolidated fast panel: open-play is the default; type/header & assist are
  // optional. `logged` = the goal is already on the board (voice path); otherwise
  // it's recorded when the scorer finishes (picks an assister or "no assist").
  // MVP F2: `fromSeq` = the log counter when the goal was recorded; `goalId` = that goal, once it is on the board
  | { mode: 'goal'; side: 'home' | 'away'; step: 'assist'; scorer: Player; goalType?: GoalType; bodyPart?: BodyPart; logged?: boolean; fromSeq?: number; goalId?: number }
  | { mode: 'foul'; step: 'team' }
  | { mode: 'foul'; step: 'by'; side: 'home' | 'away' }
  | { mode: 'foul'; step: 'victim'; side: 'home' | 'away'; fouler: Player }
  // SD-117 (F10): straight after a foul — a card for the fouler? (one tap, or Close)
  | { mode: 'foul'; step: 'card'; side: 'home' | 'away'; fouler: Player }
  // SD-117 (F13, Law 12): a card for a team official (coach / staff) — not a player
  | { mode: 'stat'; kind: 'card'; step: 'official'; side: 'home' | 'away' }
  | { mode: 'stat'; kind: StatKind | 'card'; step: 'team' }
  | { mode: 'stat'; kind: StatKind | 'card'; step: 'player'; side: 'home' | 'away' }
  | { mode: 'stat'; kind: StatKind | 'card'; step: 'detail'; side: 'home' | 'away'; player?: Player } // MVP F5: none = the team's
  // A shot on target branches into its outcome (saved / blocked / goal).
  | { mode: 'stat'; kind: 'shot'; step: 'outcome'; side: 'home' | 'away'; player?: Player }
  | { mode: 'stat'; kind: 'shot'; step: 'blocker'; side: 'home' | 'away'; player?: Player; shotId?: number }
  // Invasion batch 1: a grid save — who took the shot? (`player` = the keeper, if known)
  | { mode: 'stat'; kind: 'save'; step: 'shooter'; side: 'home' | 'away'; player?: Player }
  // Deep wave: who set up the shot just logged (key passes tracked)
  | { mode: 'keypass'; side: 'home' | 'away'; shooter: Player; shotId: number }
  // Deep wave: a goal ruled out — which team, then why (offside / foul / …)
  | { mode: 'nogoal'; step: 'team' }
  | { mode: 'nogoal'; step: 'reason'; side: 'home' | 'away' }
  // Penalty: won by → taken by → scored / saved / missed.
  | { mode: 'pen'; step: 'team' }
  | { mode: 'pen'; step: 'wonBy'; side: 'home' | 'away' }
  // Invasion batch 5: who gave the penalty away (optional) → the card step
  | { mode: 'pen'; step: 'concededBy'; side: 'home' | 'away'; wonBy?: Player }
  | { mode: 'pen'; step: 'card'; side: 'home' | 'away'; conceder: Player }
  | { mode: 'pen'; step: 'takenBy'; side: 'home' | 'away'; wonBy?: Player }
  | { mode: 'pen'; step: 'outcome'; side: 'home' | 'away'; taker?: Player; wonBy?: Player };

const ScoringControls: SportPlugin<FootballState>['ScoringControls'] = ({
  state: liveState,
  dispatch: rawDispatch,
  homeName,
  awayName,
  homeColor,
  awayColor,
  homeRoster = [],
  awayRoster = [],
  homeLineup = [],
  awayLineup = [],
}) => {
  // SD-114: ✎ Edit holds the removal until the re-entry commits (Cancel keeps
  // the event). `state` is the view as if it were removed; the first dispatch
  // sends the held removal first. See usePendingEdit.
  const { view: state, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  // IDs-only scoring (docs/privacy/ids-only-scoring.md): the state keeps
  // player ids; `named` is the display copy with the names looked up for this
  // viewer. Read names from it; never write one into an action.
  const { nameOf: playerNameOf } = useMask();
  const named = useMemo(() => withNames(state, playerNameOf), [state, playerNameOf]);
  // Team kit colours for the home/away controls (fall back to the app's accents).
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  const [sub, setSub] = useState<{ side: 'home' | 'away'; off?: Player } | null>(null);
  // Multi-step capture: tap an action → pick the player(s) from a jersey+name
  // table → any follow-up (goal type, assist, on/off target). One tap per step.
  const [flow, setFlow] = useState<Flow | null>(null);
  // Invasion batch 5 (audit fix 5): the stoppage just logged (its event id) —
  // an optional "Why?" chip row under the button until a reason is picked or
  // anything else is logged. Never a panel: scoring carries straight on.
  const [stopAsk, setStopAsk] = useState<number | null>(null);
  // MVP F2: the "Assist?" step finds its goal once it is on the board (the first
  // goal of that side logged after it opened), and closes if Undo removes it —
  // so a stale prompt can't move an assist onto an earlier goal.
  useEffect(() => {
    if (flow?.mode !== 'goal' || flow.step !== 'assist' || !flow.logged || flow.fromSeq == null) return;
    if (flow.goalId == null) {
      const g = state.events.find((e) => e.type === 'goal' && e.side === flow.side && e.id > flow.fromSeq!);
      if (g) setFlow({ ...flow, goalId: g.id });
    } else if (!state.events.some((e) => e.id === flow.goalId)) setFlow(null);
  }, [flow, state.events]);
  // Joining a game already in progress: the minute to kick the clock off at.
  const [koMin, setKoMin] = useState('');
  // Backfill mode: when set, everything logged is stamped at this past minute
  // (so the scorer can catch up on events that happened before they started).
  const [backfillMin, setBackfillMin] = useState<number | null>(null);
  // SD-08: the half a backfilled minute belongs to when typed as added time
  // ("45+2" → minute 47 of the FIRST half); null = derive it from the minute.
  const [backfillHalf, setBackfillHalf] = useState<1 | 2 | 3 | 4 | null>(null);
  const [backfillText, setBackfillText] = useState('');
  // Show the "correct the timeline" editor (remove/edit a specific past moment).
  const [showEdit, setShowEdit] = useState(false);
  // Editing a past moment: re-entered events are stamped at this original minute
  // (auto-clears when the re-entry flow closes).
  const [editMin, setEditMin] = useState<number | null>(null);
  // …and the half of that moment, so a 45+2 edit stays in the first half (SD-08).
  const [editHalf, setEditHalf] = useState<1 | 2 | 3 | 4 | null>(null);
  // Scorer-adjustable extra-time half length (knockout ties).
  const [etMins, setEtMins] = useState(state.etMinutes);
  // SD-117 (F12): the "Who kicks first?" step before a shootout starts.
  const [pickFirst, setPickFirst] = useState(false);
  // SD-117 (F7): reopen the +1…+8 added-time chips once a figure is set.
  const [changeAdded, setChangeAdded] = useState(false);
  // SD-117 (F13): the carded team official's name (optional).
  const [officialName, setOfficialName] = useState('');
  // SD-132 (futsal): the 6th-accumulated-foul alert
  const [afAlert, setAfAlert] = useState<{ side: 'home' | 'away'; n: number; half: number } | null>(null);
  // Deep wave: the optional detail chips picked on the open shot / goal panel
  // (zone, big chance), the card's reason, a ruled-out goal's VAR flag — all
  // pre-selections, so skipping them costs no tap. Cleared when a flow closes.
  const [mods, setMods] = useState<{ zone?: ShotZone; big?: boolean }>({});
  const [cardReason, setCardReason] = useState<CardReason | undefined>(undefined);
  const [noGoalReview, setNoGoalReview] = useState(false);
  useEffect(() => {
    if (flow === null) { setMods((m) => (m.zone || m.big ? {} : m)); setCardReason(undefined); setNoGoalReview(false); }
  }, [flow]);
  const opp = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');
  // Re-render every few seconds so time-based prompts (added time) keep up.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!state.startedAt || state.ended) return;
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [state.startedAt, state.ended]);

  // Stamp every event with the live minute — or, when backfilling / editing a past
  // moment, that past minute — plus the half it belongs to (a past minute derives
  // its half; live events use the current half).
  const pastMin = editMin ?? backfillMin;
  const pastHalf = editMin != null ? editHalf : backfillHalf;
  const fmt = { halfMinutes: state.halfMinutes, etMinutes: state.etMinutes };
  // SD-08: "45+2'" for a minute in a half's added time (display only).
  const minLabel = (m: number, h?: 1 | 2 | 3 | 4 | null) => minuteText(m, h ?? undefined, fmt);
  const fire = (action: ScoreAction) => {
    const half = pastMin != null ? (pastHalf ?? halfOfMinute(pastMin, fmt)) : state.half;
    dispatch({ ...action, payload: { ...action.payload, minute: pastMin ?? currentMinute(state), half } });
  };

  // When a re-entry flow finishes (or is cancelled), stop stamping at the edited
  // minute — and a cancelled one keeps the event (its held removal is dropped).
  useEffect(() => {
    if (flow === null && sub === null && editMin != null) { setEditMin(null); setEditHalf(null); dropHeldRemoval(); }
  }, [flow, sub]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = state.track;
  // Invasion batch 1: the Card button always offers a red; yellows follow "Cards"
  const cards = cardChoices(t.cards);
  // Deep wave: the optional depth this match tracks (absent = none)
  const deep = state.deep ?? {};
  // The player-attributed stat keys being tracked this match — stamped on each
  // stat line so a profile can show "this total spans N of M games".
  // Invasion batch 5: every captured stat (crosses, dribbles, offsides,
  // handballs, penalties won / missed too) — see actions.ts.
  const trackedKeys = (): string[] => footballTrackedKeys(t, deep);

  // IDs-only scoring: every action is built by ./actions.ts (ids only)

  // Record a card. A player's second yellow is also a red (sending off), flagged
  // so it shows as a red badge with a "2".
  // Deep wave: `reason` (card reasons tracked) rides on the card's payload.
  const recordCard = (side: 'home' | 'away', color: 'yellow' | 'red', p: Player, reason?: CardReason) => {
    for (const a of cardActions(state.events, side, color, p, { reason: reason && deep.cardReasons ? reason : undefined, tracked: trackedKeys() })) fire(a);
  };

  // SD-117 (F13, Law 12): a card for a team official — no player, no stat line,
  // nobody leaves the pitch. A second yellow is a red, as for a player.
  // IDs-only scoring: the typed text is the official's ROLE ("Head coach") —
  // an adult staff label, not a player — so it is stored as typed.
  const recordOfficialCard = (side: 'home' | 'away', color: 'yellow' | 'red', typed: string) => {
    for (const a of officialCardActions(state.events, side, color, typed)) fire(a);
  };

  // SD-29: a sin-bin (when the format has one) — off for the minutes, the side
  // a player down, back automatically. The exact clock second drives the
  // live countdown; a backfilled one is placed by its minute.
  const recordSinBin = (side: 'home' | 'away', p: Player) => {
    const sec = pastMin == null && state.startedAt ? Math.round(liveClockMinutes(state, Date.now()) * 60) : undefined;
    fire(sinBinAction(side, p, state.sinBinMinutes, { sec, tracked: trackedKeys() }));
  };

  // Which side the ball goes to after each kind of action.
  const handover = (kind: StatKind, side: 'home' | 'away'): 'home' | 'away' | undefined => {
    if (kind === 'foul' || kind === 'offside' || kind === 'handball') return side === 'home' ? 'away' : 'home';
    if (kind === 'tackle' || kind === 'interception' || kind === 'save' || kind === 'corner' || kind === 'defenceContribution' || kind === 'block'
      || kind === 'clearance' || kind === 'goalKick' || kind === 'throwIn') return side;
    return undefined; // shot / pass / cross / dribble / attacking play / key pass — possession unchanged
  };
  // Deep wave: a shot's zone / big chance / woodwork and a key pass's shot ride
  // in `detail` (the payload); none of them credits a player live — statTotals
  // derives the shot-detail keys at completion.
  const recordStat = (kind: StatKind, side: 'home' | 'away', player?: Player, detail?: StatDetail) => {
    fire(statAction(kind, side, player, detail, { possSide: handover(kind, side), at: Date.now(), tracked: trackedKeys() }));
    setFlow(null);
  };
  // Deep wave: a shot with the picked detail chips; with key passes tracked,
  // the next step asks who set it up (Skip = one tap).
  const shotDetail = (): StatDetail => (deep.shotDetail ? { ...(mods.zone ? { zone: mods.zone } : {}), ...(mods.big ? { bigChance: true } : {}) } : {});
  const recordShot = (side: 'home' | 'away', player: Player | undefined, detail: StatDetail, then?: () => void) => {
    const shotId = state.seq + 1;
    recordStat('shot', side, player, { ...detail, ...shotDetail() });
    then?.();
    if (deep.keyPasses && !detail.blocked && player) setFlow({ mode: 'keypass', side, shooter: player, shotId });
    return shotId;
  };
  const setPossession = (side: 'home' | 'away') => dispatch({ type: 'POSSESSION', payload: { side, at: Date.now() } });
  const playerNeeded = (kind: StatKind | 'card') => kind !== 'corner' && kind !== 'goalKick' && kind !== 'throwIn';
  const detailNeeded = (kind: StatKind | 'card') => kind === 'shot' || kind === 'pass' || kind === 'card';

  const rosterOf = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);
  const lineupOf = (side: 'home' | 'away') => (side === 'home' ? homeLineup : awayLineup);

  // An event's player as a squad id: the id (IDs-only / SD-30 logs), else an
  // older log's stored name matched to the squad.
  const squadId = (side: 'home' | 'away', id?: string, name?: string): string | undefined =>
    id || (name ? rosterOf(side).find((p) => p.fullName === name)?.id : undefined);
  // The 11 currently on the pitch: the starting XI from the lineup, with each
  // substitution applied — by player id. Falls back to the full squad if no
  // lineup is set.
  const xi = (side: 'home' | 'away'): Player[] => {
    const roster = rosterOf(side);
    const byId = new Map(roster.map((p) => [p.id, p]));
    let ids = lineupOf(side).filter((sl) => sl.playerId).map((sl) => sl.playerId!);
    if (ids.length === 0) return roster;
    for (const e of state.events) {
      if (e.type !== 'sub' || e.side !== side) continue;
      const off = squadId(side, e.playerId, e.playerName);
      const on = squadId(side, e.secondId, e.secondName);
      if (off && on) ids = ids.map((x) => (x === off ? on : x));
    }
    const off = sentOff(side);
    const binned = new Set(footballLiveField(state, Date.now()).suspended.filter((x) => x.side === side).map((x) => x.id ?? squadId(side, undefined, x.name)));
    return ids
      .filter((id) => !off.has(id) && !binned.has(id))
      .map((id) => byId.get(id))
      .filter((p): p is Player => !!p);
  };
  // Players shown a red card (their squad ids) — off the pitch for good
  // (can't score, can't be subbed on; a sending-off leaves the side a player down).
  const sentOff = (side: 'home' | 'away'): Set<string> => {
    const ids = new Set<string>();
    for (const e of state.events) {
      if (e.type !== 'red' || e.side !== side || e.official) continue;
      const id = squadId(side, e.playerId, e.playerName);
      if (id) ids.add(id);
    }
    return ids;
  };
  // The bench = squad members not currently on the pitch (and, for fixed subs,
  // not already withdrawn), never a player who's been sent off.
  // MVP F7: with no lineup, everyone in the squad except the player going off.
  const benchOf = (side: 'home' | 'away', offId?: string): Player[] => benchFor({
    squad: rosterOf(side),
    onIds: new Set(xi(side).map((p) => p.id)),
    hasLineup: lineupOf(side).some((sl) => sl.playerId),
    offId,
    sentOff: sentOff(side),
    withdrawn: new Set(state.subType === 'fixed' ? rosterOf(side).filter((p) => isSubbedOff(state, side, p)).map((p) => p.id) : []),
  });

  // Each goal credits the total (`goals`) and a type-specific tally so a profile
  // shows the open-play / penalty / free-kick split alongside the total.
  // The team's current goalkeeper (the GK in the on-field XI) — saves default to
  // them, so the scorer doesn't pick a player for every save.
  const gkOf = (side: 'home' | 'away'): Player | undefined => {
    const gkSlot = lineupOf(side).find((sl) => sl.position === 'GK' && sl.playerId);
    const onField = xi(side);
    return (gkSlot && onField.find((p) => p.id === gkSlot.playerId))
      ?? onField.find((p) => isGoalkeeper(p.sportDetails?.football?.position));
  };

  // Deep wave: the picked zone / big chance ride on the goal (shot detail on).
  const recordGoal = (side: 'home' | 'away', scorer: Player, goalType: GoalType, bodyPart?: BodyPart, detail = mods) =>
    fire(goalAction(side, scorer, goalType, { bodyPart, zone: deep.shotDetail ? detail.zone : undefined, bigChance: !!(deep.shotDetail && detail.big), tracked: trackedKeys() }));
  const recordOwnGoal = (side: 'home' | 'away', scorer: Player) => {
    // SD-30: the player's id rides along — `ownGoals` is credited to him by the
    // absolute totals at full time (not live: his line's opponent is this side).
    fire(ownGoalAction(side, scorer));
    setFlow(null);
  };
  // Team goal — no named scorer. Keeps the scoreline correct for a friendly whose
  // players aren't on the app yet; who scored can be filled in later via the
  // timeline editor once they register.
  const recordTeamGoal = (side: 'home' | 'away') => {
    fire(teamGoalAction(side));
    setFlow(null);
  };
  // MVP F2: `goalId` = the goal the prompt was opened for (it takes the assist only if still there)
  const recordAssist = (side: 'home' | 'away', p: Player | null, goalId?: number) => {
    if (p) fire(assistAction(side, p, trackedKeys(), goalId));
    setFlow(null);
  };

  // ----- Correct the timeline: remove one specific past moment (not undo-all) -----
  // The negative attribution reverses that action's stat line; the reducer reverses
  // its score/subs effect. Both are logged, so the correction replays cleanly.
  const rosterId = (nm?: string) => [...homeRoster, ...awayRoster].find((p) => p.fullName === nm)?.id;
  // SD-114 (F4): removing / editing a yellow also takes the second-yellow red it triggered.
  const pairedRed = (ev: FootballEvent) => pairedSecondYellowRed(state.events, ev);
  const removalActions = (ev: FootballEvent, withPair = true): ScoreAction[] => {
    // SD-30: the id on the event (new logs) wins over a name lookup; the
    // reversal names the player by id only (IDs-only scoring)
    const out = eventRemoval(ev, rosterId);
    const red = withPair ? pairedRed(ev) : undefined;
    if (red) out.push(...removalActions(red, false));
    return out;
  };
  const removeEvent = (ev: FootballEvent) => { for (const a of removalActions(ev)) dispatch(a); };
  const statRemoval = (st: StatEvent): ScoreAction => statRemovalAction(st);
  const removeStat = (st: StatEvent) => dispatch(statRemoval(st));
  // What else a ✕ takes with it, for the confirm sheet (`ev`: a named event).
  const removeDetail = (ev: FootballEvent): string | undefined => {
    const bits = [
      ev.type === 'goal' ? `The score goes back to ${ev.side === 'home' ? `${state.home - 1}-${state.away}` : `${state.home}-${state.away - 1}`}` : undefined,
      ev.type === 'goal' && ev.secondName ? `${ev.secondName}'s assist goes with it` : ev.type === 'goal' && ev.secondId ? 'the assist goes with it' : undefined,
      pairedRed(ev) ? 'the second-yellow red goes with it (he is back to one yellow)' : undefined,
    ].filter(Boolean);
    return bits.length ? `${bits.join('; ')}. Player stats re-adjust.` : undefined;
  };
  // Edit a moment in place = remove the old one, then re-enter it through its normal
  // flow stamped at the SAME minute (so all match/profile stats re-adjust to match).
  // SD-114: the removal is held until the re-entry commits — Cancel keeps it.
  const editEvent = (ev: FootballEvent) => {
    holdRemoval(removalActions(ev));
    setEditMin(ev.minute);
    setEditHalf(eventHalf(ev, fmt));
    setShowEdit(false);
    if (ev.type === 'goal') setFlow({ mode: 'goal', side: ev.side, step: 'scorer' });
    else if (ev.type === 'owngoal') setFlow({ mode: 'goal', side: ev.side, step: 'og' });
    else if (ev.official) { setOfficialName(ev.playerName ?? ''); setFlow({ mode: 'stat', kind: 'card', step: 'official', side: ev.side }); }
    else if (ev.type === 'yellow' || ev.type === 'red' || ev.type === 'sinbin') setFlow({ mode: 'stat', kind: 'card', step: 'player', side: ev.side });
    else if (ev.type === 'sub') setSub({ side: ev.side });
  };
  const editStat = (st: StatEvent) => {
    // deep wave: a key pass belongs to its shot — remove it, re-pick from the shot
    if (st.kind === 'keyPass') { removeStat(st); setShowEdit(false); return; }
    holdRemoval([statRemoval(st)]);
    setEditMin(st.minute);
    setEditHalf(eventHalf(st, fmt));
    setShowEdit(false);
    if (st.kind === 'foul') setFlow({ mode: 'foul', step: 'by', side: st.side });
    else if (playerNeeded(st.kind)) setFlow({ mode: 'stat', kind: st.kind, step: 'player', side: st.side });
    else setFlow({ mode: 'stat', kind: st.kind, step: 'team' });
  };
  // SD-117 (F10): the victim is optional ("Skip victim"), and when cards are
  // tracked the foul flows straight into "🟨 / 🟥 for {fouler}?".
  const recordFoul = (side: 'home' | 'away', fouler: Player, victim: Player | null) => {
    // SD-132 (Futsal Law 13): from the 6th accumulated foul of a half, the
    // other side gets a direct free kick from the 10 m mark (no wall).
    if (state.futsal && pastMin == null) {
      const n = accumulatedFouls(state, side) + 1;
      setAfAlert(n > FUTSAL_FOUL_LIMIT ? { side, n, half: state.half } : null);
    }
    // IDs-only scoring: the fouled player by id (`secondId`)
    fire(foulAction(side, fouler, victim, { at: Date.now(), tracked: trackedKeys() }));
    setFlow(t.cards ? { mode: 'foul', step: 'card', side, fouler } : null);
  };
  // MVP F5: a side with no players listed — the foul is the team's (no card step).
  const recordTeamFoul = (side: 'home' | 'away') => {
    if (state.futsal && pastMin == null) {
      const n = accumulatedFouls(state, side) + 1;
      setAfAlert(n > FUTSAL_FOUL_LIMIT ? { side, n, half: state.half } : null);
    }
    recordStat('foul', side);
  };

  // Penalty in open play: credit who won it, then the outcome — a scored goal, or
  // a miss (with the opponent GK's save when saved). Each is its own timeline row.
  // Invasion batch 5: which penalty steps have someone to pick
  const penHas = (side: 'home' | 'away') => ({ attackers: xi(side).length > 0, defenders: xi(opp(side)).length > 0 });
  const finishPenalty = (side: 'home' | 'away', outcome: 'scored' | 'saved' | 'missed', taker: Player | undefined, wonBy?: Player) => {
    if (wonBy) recordStat('penaltyWon', side, wonBy);
    if (outcome === 'scored') {
      // MVP F5: no players listed → the goal is the team's
      if (taker) recordGoal(side, taker, 'penalty'); else fire(teamGoalAction(side));
    } else {
      // invasion batch 1: the attempt is a shot too (saved = on target)
      for (const a of penaltyMissActions(side, outcome, taker, gkOf(opp(side)), { at: Date.now(), tracked: trackedKeys() })) fire(a);
    }
    setFlow(null);
  };

  // Invasion batch 1: the grid's 🧤 Save logs the shot it stopped (the other
  // side's, on target; shooter optional). Re-entering a save from the
  // timeline logs the save only — its shot is still on the log.
  const recordSave = (side: 'home' | 'away', keeper: Player | undefined, shooter: Player | null) => {
    for (const a of gridSaveActions(side, keeper, shooter, { at: Date.now(), tracked: trackedKeys(), edit: editMin != null })) fire(a);
    setFlow(null);
  };
  // After the keeper: who took the shot? (skipped with nobody listed, or when editing)
  const afterKeeper = (side: 'home' | 'away', keeper: Player | undefined) =>
    (editMin == null && xi(opp(side)).length ? setFlow({ mode: 'stat', kind: 'save', step: 'shooter', side, player: keeper }) : recordSave(side, keeper, null));

  // SD-09: who started for a side — the lineup's starters and keeper (the GK
  // slot, else a starter listed as a GK), or with no lineup the squad's keeper —
  // plus every squad keeper, so one coming off the bench is recognised.
  // IDs-only scoring: the stamp carries player ids only (./actions.ts).
  const xiStamp = (side: 'home' | 'away'): XiStamp =>
    xiOf(lineupOf(side), rosterOf(side).filter((p) => isGoalkeeper(p.sportDetails?.football?.position)).map((p) => p.id));
  // Log the stamp when it's new or the lineup changed since (latest wins).
  const stampXi = () => {
    for (const side of ['home', 'away'] as const) {
      const stamp = xiStamp(side);
      if (!stamp.gk && !stamp.players?.length) continue;
      if (JSON.stringify(stamp) === JSON.stringify(state.xi?.[side])) continue;
      dispatch(xiAction(side, stamp));
    }
  };
  // Kickoff: the opening one turns on FIFA ordinal minutes (SD-08) and stamps the XIs.
  const kickoffAt = (at: number) => {
    dispatch({ type: 'KICKOFF', payload: { at, ord: true } });
    if (state.half === 1) stampXi();
  };

  // Full time. Clean sheets are derived (SD-09), not dispatched — just make sure
  // the starting XIs are in the log.
  const endMatch = () => {
    stampXi();
    dispatch({ type: 'END' });
  };

  // ───────────────────────── Voice scoring ─────────────────────────
  // Spoken commands drive the very same flow the buttons do. The command is
  // interpreted in the context of the current step ("who scored?" → a name).
  const [feedback, setFeedback] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const cardColor = useRef<'yellow' | 'red' | null>(null);
  const homeTeams = [homeName, homeRoster[0]?.houseName].filter(Boolean) as string[];
  const awayTeams = [awayName, awayRoster[0]?.houseName].filter(Boolean) as string[];
  const teamName = (s: 'home' | 'away') => (s === 'home' ? homeName : awayName);

  const processCommand = (raw: string, fromLLM = false) => {
    const text = raw.trim();
    if (!text) return;
    const say = setFeedback;

    // ---- Mid-flow: the utterance answers the current question. ----
    if (flow) {
      if (parseIntent(text).kind === 'cancel') { setFlow(null); cardColor.current = null; say('Cancelled.'); return; }
      if (flow.mode === 'goal') {
        if (flow.step === 'scorer') {
          if (/own goal/.test(deburr(text))) { setFlow({ mode: 'goal', side: flow.side, step: 'og' }); say('Own goal — which opponent?'); return; }
          const p = matchPlayer(text, xi(flow.side));
          if (p) { setFlow({ mode: 'goal', side: flow.side, step: 'type', scorer: p }); say(`${p.fullName} — penalty, free kick, header or open play?`); }
          else say("Didn't catch the scorer — say a name.");
          return;
        }
        if (flow.step === 'og') { const p = matchPlayer(text, xi(opp(flow.side))); if (p) { recordOwnGoal(flow.side, p); say(`Own goal by ${p.fullName}.`); } else say("Didn't catch the player."); return; }
        if (flow.step === 'type') { const gt = parseGoalType(text) ?? 'open'; recordGoal(flow.side, flow.scorer, gt); setFlow({ mode: 'goal', side: flow.side, step: 'assist', scorer: flow.scorer, goalType: gt, logged: true, fromSeq: state.seq }); say(`${GOAL_TYPE_LABEL[gt]} — who assisted? (or say "no assist")`); return; }
        // assist
        if (isNoAssist(text)) { recordAssist(flow.side, null); say('Goal recorded — no assist.'); return; }
        const a = matchPlayer(text, xi(flow.side).filter((x) => x.id !== flow.scorer.id));
        if (a) { recordAssist(flow.side, a); say(`Assist: ${a.fullName}.`); } else say('Say the assister\'s name, or "no assist".');
        return;
      }
      if (flow.mode === 'foul') {
        if (flow.step === 'team') { const s = matchTeam(text, homeTeams, awayTeams); if (s) { setFlow({ mode: 'foul', step: 'by', side: s }); say('Who committed the foul?'); } else say('Which team committed it?'); return; }
        if (flow.step === 'by') { const p = matchPlayer(text, xi(flow.side)); if (p) { setFlow({ mode: 'foul', step: 'victim', side: flow.side, fouler: p }); say(`${p.fullName} fouled whom?`); } else say("Didn't catch the player."); return; }
        if (flow.step === 'card') {
          const col = /red/.test(deburr(text)) ? 'red' : /yellow/.test(deburr(text)) ? 'yellow' : null;
          if (col) { recordCard(flow.side, col, flow.fouler); setFlow(null); say(`${col} card: ${flow.fouler.fullName}.`); }
          else { setFlow(null); say('No card.'); }
          return;
        }
        if (/skip|no one|nobody|don.?t know/.test(deburr(text))) { recordFoul(flow.side, flow.fouler, null); say(`Foul: ${flow.fouler.fullName}. Card? (yellow / red / no)`); return; }
        const v = matchPlayer(text, xi(opp(flow.side))); if (v) { recordFoul(flow.side, flow.fouler, v); say(`Foul: ${flow.fouler.fullName} on ${v.fullName}.${t.cards ? ' Card? (yellow / red / no)' : ''}`); } else say("Didn't catch the player — or say \"skip\"."); return;
      }
      // generic stat (shot / corner / card / save / tackle / …)
      if (flow.mode === 'stat') {
        if (flow.step === 'team') {
          const s = matchTeam(text, homeTeams, awayTeams); if (!s) { say('Which team?'); return; }
          const kind = flow.kind;
          // invasion batch 1: a spoken save logs the other side's shot on target too (shooter not asked)
          if (kind === 'save') { const gk = gkOf(s); if (gk) { recordSave(s, gk, null); say(`Save by ${gk.fullName}.`); } else setFlow({ mode: 'stat', kind, step: 'player', side: s }); return; }
          if (!playerNeeded(kind)) { recordStat(kind as StatKind, s); say(`${STAT_META[kind].label} — ${teamName(s)}.`); return; }
          setFlow({ mode: 'stat', kind, step: 'player', side: s }); say('Which player?'); return;
        }
        if (flow.step === 'player') {
          const p = matchPlayer(text, xi(flow.side)); if (!p) { say("Didn't catch the player."); return; }
          if (flow.kind === 'card') {
            const col = cardColor.current;
            if (col) { recordCard(flow.side, col, p); cardColor.current = null; setFlow(null); say(`${col} card: ${p.fullName}.`); }
            else { setFlow({ mode: 'stat', kind: 'card', step: 'detail', side: flow.side, player: p }); say('Yellow or red?'); }
            return;
          }
          if (detailNeeded(flow.kind)) { setFlow({ mode: 'stat', kind: flow.kind, step: 'detail', side: flow.side, player: p }); say(flow.kind === 'shot' ? 'On target or off?' : 'Completed or misplaced?'); return; }
          if (flow.kind === 'save') { recordSave(flow.side, p, null); say(`Save by ${p.fullName}.`); return; }
          recordStat(flow.kind as StatKind, flow.side, p); say(`${STAT_META[flow.kind as StatKind].label}: ${p.fullName}.`); return;
        }
        // detail
        if (flow.step === 'official') { say('Use the Yellow / Red buttons for a team official.'); return; }
        if (flow.step === 'shooter') { const sh = matchPlayer(text, xi(opp(flow.side))); recordSave(flow.side, flow.player, sh ?? null); say(sh ? `Saved from ${sh.fullName}.` : 'Save recorded.'); return; }
        const { kind, side, player } = flow;
        const who = player?.fullName ?? (side === 'home' ? homeName : awayName);
        if (kind === 'card') { if (!player) { setFlow(null); return; } const col = /red/.test(deburr(text)) ? 'red' : /yellow/.test(deburr(text)) ? 'yellow' : null; if (!col) { say('Yellow or red?'); return; } recordCard(side, col, player); setFlow(null); say(`${col} card: ${player.fullName}.`); return; }
        if (kind === 'shot') { const on = isYes(text) ? true : isNo(text) ? false : undefined; if (on === undefined) { say('On target or off target?'); return; } recordStat('shot', side, player, { onTarget: on }); say(`Shot ${on ? 'on' : 'off'} target: ${who}.`); return; }
        if (kind === 'pass') { const c = /complete|accurate/.test(deburr(text)) ? true : /misplace|incomplete|miss/.test(deburr(text)) ? false : undefined; if (c === undefined) { say('Completed or misplaced?'); return; } recordStat('pass', side, player, { complete: c }); say(`Pass: ${who}.`); return; }
      }
      say("Didn't catch that — try again or say 'cancel'.");
      return;
    }

    // ---- No flow: a fresh command. ----
    const intent = parseIntent(text);
    const teamIn = matchTeam(text, homeTeams, awayTeams);
    const startStat = (kind: StatKind | 'card') => setFlow({ mode: 'stat', kind, step: 'team' });
    switch (intent.kind) {
      case 'kickoff': if (!state.startedAt) { kickoffAt(Date.now()); say('Kicked off ▶'); } else say('Already underway.'); return;
      // SD-137a: spoken "end half" / "full time" ask in the ConfirmSheet, exactly
      // like the buttons (they used to apply straight away).
      case 'endHalf': {
        if (state.half !== 1 && state.half !== 3) { say('Say "full time" to end the match.'); return; }
        const half = state.half;
        const ended = HALF_NAME[half];
        say(`End the ${ended}? Confirm on screen.`);
        void confirmMatchAction('endPeriod', { period: half === 1 ? '1st half' : 'ET 1st half', score: `${state.home}-${state.away}` }).then((ok) => {
          if (!ok) { say('Kept playing.'); return; }
          dispatch({ type: 'NEXT_HALF', payload: { at: Date.now() } }); say(`Ended the ${ended}.`);
        });
        return;
      }
      case 'fullTime': {
        const score = `${state.home}-${state.away}`;
        say('Full time? Confirm on screen.');
        // the button's own rule: a level knockout goes to its decision; full
        // time before the 2nd half says so in the sheet
        if ((state.half === 2 || state.half === 4) && needsDecision(state)) {
          void confirmMatchAction('endPeriod', { period: state.half === 2 ? '2nd half' : 'extra time', score, detail: `Level at ${score} — it goes to the knockout decision. Undo can bring it back.` }).then((ok) => {
            if (!ok) { say('Kept playing.'); return; }
            stampXi(); dispatch({ type: 'END', payload: { at: Date.now() } }); say('Full time — on to the knockout decision.');
          });
          return;
        }
        const early = state.half === 1 || state.half === 3;
        void confirmMatchAction('fullTime', { score, ...(early ? { detail: `It’s still the ${HALF_NAME[state.half]}. Final score ${score} will be saved and the match closes.` } : {}) }).then((ok) => {
          if (!ok) { say('Kept playing.'); return; }
          endMatch(); say('Full time — match ended.');
        });
        return;
      }
      case 'goal': { const side = teamIn ?? state.possession.side ?? 'home'; setFlow({ mode: 'goal', side, step: 'scorer' }); say(`Goal for ${teamName(side)} — who scored?`); return; }
      case 'ownGoal': { const side = teamIn ?? 'home'; setFlow({ mode: 'goal', side, step: 'og' }); say(`Own goal for ${teamName(side)} — which opponent?`); return; }
      case 'card': {
        cardColor.current = intent.color ?? null;
        if (teamIn) {
          const p = matchPlayer(text, xi(teamIn));
          if (p && intent.color) { recordCard(teamIn, intent.color, p); cardColor.current = null; say(`${intent.color} card: ${p.fullName}.`); return; }
          setFlow({ mode: 'stat', kind: 'card', step: 'player', side: teamIn }); say(`${intent.color ?? 'Card'} — who?`); return;
        }
        startStat('card'); say(`${intent.color ? intent.color + ' card' : 'Card'} — which team?`); return;
      }
      case 'foul': setFlow({ mode: 'foul', step: 'team' }); say('Foul — which team?'); return;
      case 'sub': { const side = teamIn ?? 'home'; setSub({ side }); say(`Substitution — ${teamName(side)}: pick who comes off.`); return; }
      case 'corner': { if (teamIn) { recordStat('corner', teamIn); say(`Corner — ${teamName(teamIn)}.`); } else { startStat('corner'); say('Corner — which team?'); } return; }
      case 'offside': { if (teamIn) { recordStat('offside', teamIn); say(`Offside — ${teamName(teamIn)}.`); } else { startStat('offside'); say('Offside — which team?'); } return; }
      case 'save': startStat('save'); say('Save — which team? (credited to their keeper)'); return;
      case 'tackle': startStat('tackle'); say('Tackle — which team?'); return;
      case 'interception': startStat('interception'); say('Interception — which team?'); return;
      case 'shot': startStat('shot'); say('Shot — which team?'); return;
      case 'attack': startStat('attackContribution'); say('Attacking play — which team?'); return;
      case 'defence': startStat('defenceContribution'); say('Defensive play — which team?'); return;
      default:
        // Free-form phrasing the grammar didn't catch → ask the optional LLM to
        // normalise it to a canonical command, then re-run that through the grammar.
        // `fromLLM` guards against a loop if the LLM echoes something unparseable.
        if (!fromLLM && llmEnabled()) {
          say('🤖 interpreting…');
          const players = [...xi('home'), ...xi('away')].map((p) => p.fullName);
          void llmNormalize(text, { teams: { home: homeName, away: awayName }, players }).then((cmd) => {
            if (cmd && deburr(cmd) !== deburr(text)) processCommand(cmd, true);
            else say(`Didn't recognise "${text}".`);
          });
          return;
        }
        say(`Didn't recognise "${text}". Try: goal, yellow card, corner, substitution, kick off.`);
        return;
    }
  };

  const speech = useSpeech((t) => processCommand(t)); // ignore the confidence arg here
  const sendTyped = () => { if (voiceText.trim()) { processCommand(voiceText); setVoiceText(''); } };
  // Use a real player from this match in the example, not a stock "Kane" no one
  // on the teamsheet recognises. Falls back to a name-free example if empty.
  const samplePlayer = (homeRoster[0] ?? awayRoster[0])?.fullName?.split(' ')[0];
  const cmdPlaceholder = samplePlayer
    ? `…or type a command (e.g. "goal", "${samplePlayer}", "penalty")`
    : '…or type a command (e.g. "goal", "penalty")';
  const voiceBar = (
    <View style={ctrl.voiceBar}>
      <View style={ctrl.row}>
        <Button
          label={speech.listening ? '🛑 Stop listening' : '🎤 Voice scoring'}
          variant={speech.listening ? 'danger' : 'ghost'}
          style={ctrl.flex}
          onPress={() => (speech.listening ? speech.stop() : speech.supported ? speech.start() : setFeedback('Voice needs Chrome/Edge on web — use the text box below.'))}
        />
      </View>
      {speech.interim ? (
        <Text style={ctrl.voiceHeard}>🎙 {speech.interim}</Text>
      ) : feedback ? (
        <Text style={ctrl.voiceFeedback}>🤖 {feedback}</Text>
      ) : (
        <Text style={ctrl.meta}>Say e.g. “goal”, “yellow card”, “corner”, “substitution”, “kick off”. Then answer its follow-ups by voice.</Text>
      )}
      <View style={ctrl.row}>
        <View style={ctrl.flex}><TextField label="" value={voiceText} onChange={setVoiceText} placeholder={cmdPlaceholder} /></View>
        <Button label="Send" variant="ghost" onPress={sendTyped} disabled={!voiceText.trim()} />
      </View>
    </View>
  );

  // Substitution UI — shared between the live controls and the half-time break.
  // Rolling subs are unlimited (players can return); only fixed subs hit a cap.
  const subsCapped = state.subType === 'fixed';
  const atCap = (side: 'home' | 'away') => subsCapped && state.subsUsed[side] >= state.maxSubs;
  const subsTally = (side: 'home' | 'away') =>
    subsCapped ? ` ${state.maxSubs - state.subsUsed[side]}/${state.maxSubs}` : ` ${state.subsUsed[side]} (rolling)`;
  const subSection = (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={ctrl.label}>Substitution · {state.subType} ·{subsTally('home')} {homeName}{atCap('home') ? ' (none left)' : ''},{subsTally('away')} {awayName}{atCap('away') ? ' (none left)' : ''}
      </Text>
      <View style={ctrl.row}>
        <Button label={atCap('home') ? `${homeName} · no subs left` : `Sub — ${homeName}`} variant="ghost" style={ctrl.flex}
          disabled={atCap('home')}
          onPress={() => setSub(sub?.side === 'home' ? null : { side: 'home' })} />
        <Button label={atCap('away') ? `${awayName} · no subs left` : `Sub — ${awayName}`} variant="ghost" style={ctrl.flex}
          disabled={atCap('away')}
          onPress={() => setSub(sub?.side === 'away' ? null : { side: 'away' })} />
      </View>
      {sub && (
        <View style={ctrl.subBox}>
          <Text style={ctrl.meta}>Player OFF (on the field):</Text>
          <PlayerTable players={xi(sub.side)} selectedId={sub.off?.id} onPick={(p) => setSub({ ...sub, off: p })} />
          {sub.off && (
            <>
              <Text style={ctrl.meta}>Player ON (from the bench){state.subType === 'fixed' ? ' — withdrawn players unavailable' : ''}:</Text>
              <PlayerTable players={benchOf(sub.side, sub.off.id)} onPick={(p) => { fire(subAction(sub.side, sub.off!, p)); setSub(null); }} />
            </>
          )}
        </View>
      )}
    </View>
  );

  // Pre-kickoff / half-time / extra-time breaks: show the clock-start control.
  if (!state.startedAt && !state.ended) {
    const base = startOffset(state);
    // Joining a game already in progress: start the clock at the current minute.
    const startAt = koMin.trim() === '' ? base : Math.max(base, Math.floor(Number(koMin)) || base);
    const kickoff = () => kickoffAt(Date.now() - Math.max(0, startAt - base) * 60000);
    const koLabel = state.half === 1 ? 'Kick off' : state.half === 2 ? 'Start 2nd half' : state.half === 3 ? 'Start extra time' : 'Start ET 2nd half';
    const breakMsg = state.half === 1 ? 'Set the lineup, then kick off to start the clock.'
      : state.half === 2 ? 'Half time — make any substitutions, then start the second half.'
      : state.half === 3 ? `Extra time (${state.etMinutes}′ halves) — make substitutions, then kick off.`
      : 'Extra-time break — then start the second ET half.';
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={ctrl.meta}>{breakMsg}</Text>
        {/* #7 / Phase C: substitutions during any break (HT and the extra-time breaks). */}
        {state.half >= 2 && subSection}
        {/* #6: joining a match already underway — start the clock at the live minute. */}
        <View style={{ gap: theme.spacing(1) }}>
          <IconText label={"⏱ Already underway? Enter the current match minute (optional)."} style={ctrl.meta} />
          <TextField label="" value={koMin} onChange={setKoMin} placeholder={`e.g. ${base + 25}`} autoCapitalize="none" />
        </View>
        <Button label={startAt > base ? `▶ ${koLabel} at ${startAt}'` : `▶ ${koLabel}`} onPress={kickoff} />
        {voiceBar}
      </View>
    );
  }

  // Level knockout tie: after full time offer extra time (following the 2nd half)
  // or penalties; once the shootout is under way, the shootout controls take over.
  if (state.ended) {
    if (state.shootout) {
      // SD-80 (FB-14, Law 10): takers = the players on the pitch at the end; the
      // keeper facing the kick defaults to the other side's goalkeeper.
      return <ShootoutControls state={state} dispatch={dispatch} homeName={homeName} awayName={awayName}
        takers={{ home: xi('home'), away: xi('away') }} keepers={{ home: gkOf('home'), away: gkOf('away') }} />;
    }
    // Extra time is only offered when it's the chosen decider and we're at the end
    // of normal time; "penalties straightaway" jumps direct to the shootout.
    const canET = state.half === 2 && state.decider === 'extra_time';
    const atFullTime = state.half === 2;
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <View style={ctrl.addedBox}>
          <Text style={ctrl.label}>⏱ {atFullTime ? (state.agg ? 'Full time — level on aggregate' : 'Full time — level') : (state.agg ? 'Extra time over — still level on aggregate' : 'Extra time over — still level')}</Text>
          <Text style={ctrl.meta}>{homeName} {state.home}–{state.away} {awayName}{state.agg ? ` (${aggregateText(state)})` : ''}. {canET ? 'Play extra time, or go straight to penalties.' : 'Decide it on penalties.'}</Text>
          {canET && (
            <>
              <View style={ctrl.row}>
                <Button label="−1'" accessibilityLabel="One minute less" variant="ghost" style={ctrl.flex} onPress={() => setEtMins((m) => Math.max(1, m - 1))} />
                <Text style={[ctrl.label, { alignSelf: 'center' }]}>{etMins}′ halves</Text>
                <Button label="+1'" accessibilityLabel="One minute more" variant="ghost" style={ctrl.flex} onPress={() => setEtMins((m) => m + 1)} />
              </View>
              <Button label={`▶ Extra time · 2×${etMins}′ · +${state.etExtraSubs} sub`} variant="home" onPress={() => dispatch({ type: 'START_EXTRA_TIME', payload: { etMinutes: etMins } })} />
            </>
          )}
          {pickFirst ? (
            // SD-117 (F12, Law 10): the referee's toss decides who kicks first.
            <FirstKicker homeName={homeName} awayName={awayName} homeColor={hc} awayColor={ac}
              onPick={(first) => { setPickFirst(false); dispatch({ type: 'START_SHOOTOUT', payload: { first } }); }}
              onCancel={() => setPickFirst(false)} />
          ) : (
            <Button label="Penalty shootout →" variant="danger" onPress={() => setPickFirst(true)} />
          )}
        </View>
      </View>
    );
  }

  // ----- Multi-step capture (goal / foul / generic stat) -----
  const backToLive = () => { setBackfillMin(null); setBackfillHalf(null); setBackfillText(''); };
  // SD-114: pinned at the top of the controls while backfilling (F5).
  const backfillBar = backfillMin != null && editMin == null
    ? <BackfillBar at={minLabel(backfillMin, backfillHalf)} onLive={backToLive} /> : null;
  const panel = (title: string, hint: string | undefined, body: React.ReactNode, closeLabel = 'Cancel') => (
    <View style={{ gap: theme.spacing(3) }}>
      {backfillBar}
      <View style={ctrl.flowPanel}>
        <View style={ctrl.extrasHeader}>
          <Text style={ctrl.label}>{title}</Text>
          <Button label={closeLabel} variant="ghost" onPress={() => setFlow(null)} />
        </View>
        {editMin != null ? <Text style={ctrl.editBanner}>✎ Re-entering the {minLabel(editMin, editHalf)} moment — your pick replaces the old one.</Text> : null}
        {hint ? <Text style={ctrl.meta}>{hint}</Text> : null}
        {body}
      </View>
      {voiceBar}
    </View>
  );
  const teamButtons = (onSide: (side: 'home' | 'away') => void) => (
    <View style={ctrl.row}>
      <Button label={homeName} variant="home" color={hc} style={ctrl.flex} onPress={() => onSide('home')} />
      <Button label={awayName} variant="away" color={ac} style={ctrl.flex} onPress={() => onSide('away')} />
    </View>
  );

  if (flow) {
    if (flow.mode === 'goal') {
      const sideName = flow.side === 'home' ? homeName : awayName;
      if (flow.step === 'scorer') {
        return panel(`⚽ Goal — ${sideName}`, 'Who scored?', (
          <>
            {/* SD-114 (F2): the goal is on the board on the scorer tap; the assist is attached after (Close keeps the goal). */}
            <PlayerTable players={xi(flow.side)} onPick={(p) => { recordGoal(flow.side, p, 'open'); setFlow({ mode: 'goal', side: flow.side, step: 'assist', scorer: p, goalType: 'open', logged: true, fromSeq: state.seq }); }} />
            <Button label={`⚽ Team goal — no scorer${xi(flow.side).length === 0 ? ' (no players yet)' : ''}`} variant="ghost" onPress={() => recordTeamGoal(flow.side)} />
            <Button label="🔃 Own goal instead" variant="ghost" onPress={() => setFlow({ mode: 'goal', side: flow.side, step: 'og' })} />
          </>
        ));
      }
      if (flow.step === 'og') {
        return panel(`🔃 Own goal → ${sideName}`, `Which ${flow.side === 'home' ? awayName : homeName} player put it into their own net?`, (
          <PlayerTable players={xi(opp(flow.side))} onPick={(p) => recordOwnGoal(flow.side, p)} />
        ));
      }
      if (flow.step === 'type') {
        return panel(`⚽ Goal — ${flow.scorer.fullName}`, 'How was it won?', (
          <View style={ctrl.chips}>
            {GOAL_TYPES.map((g) => (
              <Button key={g} label={GOAL_TYPE_LABEL[g]} variant="ghost" style={ctrl.actionBtn}
                onPress={() => setFlow({ mode: 'goal', side: flow.side, step: 'body', scorer: flow.scorer, goalType: g })} />
            ))}
          </View>
        ));
      }
      if (flow.step === 'body') {
        return panel(`⚽ Goal — ${flow.scorer.fullName}`, 'Struck with?', (
          <View style={ctrl.chips}>
            {BODY_PARTS.map((b) => (
              <Button key={b} label={BODY_PART_LABEL[b]} variant="ghost" style={ctrl.actionBtn}
                onPress={() => { recordGoal(flow.side, flow.scorer, flow.goalType, b); setFlow({ mode: 'goal', side: flow.side, step: 'assist', scorer: flow.scorer, goalType: flow.goalType, bodyPart: b, logged: true, fromSeq: state.seq }); }} />
            ))}
          </View>
        ));
      }
      {
        // Consolidated fast panel — the goal is open-play by default; type/header
        // and assist are optional. SD-114: every path now records the goal BEFORE
        // this step (`logged: true`) — the assist attaches to it, and Close just
        // closes. (Shot → Goal → type → body recorded it twice before: F1.)
        const gt = flow.goalType ?? 'open';
        const bp = flow.bodyPart;
        const finish = (assister: Player | null) => {
          if (!flow.logged) recordGoal(flow.side, flow.scorer, gt, bp);
          recordAssist(flow.side, assister, flow.logged ? flow.goalId : undefined); // attaches to the just-scored goal, then closes
        };
        // A goal-type/header refinement after the goal is already logged (voice
        // path) re-logs it with the corrected type so the score stays right.
        const refine = (nextType: GoalType, nextBody?: BodyPart) => {
          // (SD-30: the undone goal's credits are reversed, as a removal does)
          if (nextType === gt && nextBody === bp) return;
          if (flow.logged) { dispatch(undoGoalAction(flow.side, flow.scorer, flow.goalType ?? 'open')); recordGoal(flow.side, flow.scorer, nextType, nextBody); }
          setFlow({ mode: 'goal', side: flow.side, step: 'assist', scorer: flow.scorer, goalType: nextType, bodyPart: nextBody, logged: flow.logged, ...(flow.logged ? { fromSeq: state.seq } : {}) });
        };
        const typeChips: { label: string; t: GoalType; b?: BodyPart }[] = [
          { label: 'Open play', t: 'open' }, { label: 'Header', t: 'open', b: 'head' },
          // deep wave (shot detail on): which foot
          ...(deep.shotDetail ? [{ label: 'Left foot', t: 'open' as GoalType, b: 'left' as BodyPart }, { label: 'Right foot', t: 'open' as GoalType, b: 'right' as BodyPart }] : []),
          { label: 'Penalty', t: 'penalty' }, { label: 'Free kick', t: 'freekick' },
        ];
        // deep wave: zone / big chance on the goal already on the board
        const goalDetail = (next: { zone?: ShotZone; big?: boolean }) => {
          setMods(next);
          if (flow.logged) dispatch({ type: 'GOAL_DETAIL', side: flow.side, payload: { zone: next.zone ?? null, bigChance: !!next.big } });
        };
        return panel(`⚽ Goal — ${flow.scorer.fullName}`, flow.logged ? `✓ Goal recorded (${state.home}-${state.away}). Assist? (optional — pick one, or Close)` : 'Assist? (optional — type below)', (
          <>
            <PlayerTable players={xi(flow.side).filter((p) => p.id !== flow.scorer.id)} onPick={finish} />
            <Button label="✓ No assist" variant="ghost" onPress={() => finish(null)} />
            <Text style={ctrl.meta}>Goal type {bp === 'head' ? '· header' : ''}</Text>
            <View style={ctrl.chips}>
              {typeChips.map((c) => (
                <Button key={c.label} label={c.label} variant="ghost" style={ctrl.actionBtn}
                  color={(c.t === gt && (c.b ?? undefined) === (bp ?? undefined)) ? theme.colors.primary : undefined}
                  onPress={() => refine(c.t, c.b)} />
              ))}
            </View>
            {deep.shotDetail ? (
              <View style={ctrl.chips}>
                {(['box', 'out'] as ShotZone[]).map((z) => (
                  <SelectChip key={z} label={ZONE_LABEL[z]} active={mods.zone === z} onPress={() => goalDetail({ ...mods, zone: mods.zone === z ? undefined : z })} />
                ))}
                <SelectChip label="⭐ Big chance" active={!!mods.big} onPress={() => goalDetail({ ...mods, big: !mods.big })} />
              </View>
            ) : null}
          </>
        ), flow.logged ? 'Close' : 'Cancel');
      }
    }

    if (flow.mode === 'keypass') {
      // deep wave: who set up the shot just logged (a key pass) — or Skip
      const { side, shooter, shotId } = flow;
      return panel(`🔑 Key pass — ${shooter.fullName}'s shot`, 'Who set it up? (optional)', (
        <>
          <PlayerTable players={xi(side).filter((p) => p.id !== shooter.id)} onPick={(p) => recordStat('keyPass', side, p, { ref: shotId })} />
          <Button label="✓ Skip — no key pass" variant="ghost" onPress={() => setFlow(null)} />
        </>
      ), 'Close');
    }

    if (flow.mode === 'nogoal') {
      // deep wave: a goal ruled out — a timeline row; the score never moved
      if (flow.step === 'team') {
        return panel('❎ Goal ruled out', 'Whose goal was ruled out?', teamButtons((side) => setFlow({ mode: 'nogoal', step: 'reason', side })));
      }
      const { side } = flow;
      return panel(`❎ Goal ruled out — ${side === 'home' ? homeName : awayName}`, 'Why? (one tap logs it)', (
        <View style={{ gap: theme.spacing(2) }}>
          <SelectChip label="📺 After a VAR review" active={noGoalReview} onPress={() => setNoGoalReview(!noGoalReview)} />
          <View style={ctrl.chips}>
            {(Object.keys(NO_GOAL_LABEL) as NoGoalReason[]).map((r) => (
              <Button key={r} label={NO_GOAL_LABEL[r]} variant="ghost" style={ctrl.actionBtn}
                onPress={() => { fire({ type: 'NO_GOAL', side, payload: { reason: r, ...(noGoalReview ? { review: true } : {}) } }); setFlow(null); }} />
            ))}
          </View>
        </View>
      ));
    }

    if (flow.mode === 'foul') {
      if (flow.step === 'team') {
        return panel('🟫 Foul', 'Which team committed it?', teamButtons((side) => (xi(side).length === 0 ? recordTeamFoul(side) : setFlow({ mode: 'foul', step: 'by', side }))));
      }
      if (flow.step === 'by') {
        const sideName = flow.side === 'home' ? homeName : awayName;
        return panel(`🟫 Foul — ${sideName}`, 'Who committed the foul?', (
          <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'foul', step: 'victim', side: flow.side, fouler: p })} />
        ));
      }
      if (flow.step === 'card') {
        // SD-117 (F10): a card for the fouler, one tap — or Close (no card).
        const { side, fouler } = flow;
        return panel(`🟫 Foul logged — ${fouler.fullName}`, `Card for ${fouler.fullName}?`, (
          <View style={{ gap: theme.spacing(2) }}>
            {/* deep wave: a card straight after the foul is "for a foul" (card reasons on) */}
            <View style={ctrl.row}>
              <Button label={`🟨 Yellow for ${fouler.fullName}`} variant="home" style={[ctrl.flex, { backgroundColor: theme.colors.accent }]} onPress={() => { recordCard(side, 'yellow', fouler, 'foul'); setFlow(null); }} />
              <Button label="🟥 Red" variant="danger" style={ctrl.flex} onPress={() => { recordCard(side, 'red', fouler, 'foul'); setFlow(null); }} />
            </View>
            {(state.sinBinMinutes ?? 0) > 0 && (
              <Button label={`⏱️ Sin-bin ${state.sinBinMinutes}'`} variant="ghost" onPress={() => { recordSinBin(side, fouler); setFlow(null); }} />
            )}
            <Button label="✓ No card" variant="ghost" onPress={() => setFlow(null)} />
          </View>
        ), 'Close');
      }
      return panel(`🟫 ${flow.fouler.fullName} fouled…`, 'Who was fouled? (optional)', (
        <>
          <PlayerTable players={xi(opp(flow.side))} onPick={(v) => recordFoul(flow.side, flow.fouler, v)} />
          <Button label="Skip victim" variant="ghost" onPress={() => recordFoul(flow.side, flow.fouler, null)} />
        </>
      ));
    }

    if (flow.mode === 'pen') {
      if (flow.step === 'team') {
        return panel('⭕ Penalty', 'Which team has the penalty?', teamButtons((side) => setFlow({ mode: 'pen', step: penaltyStepAfter('team', penHas(side)), side })));
      }
      const sideName = flow.side === 'home' ? homeName : awayName;
      if (flow.step === 'wonBy') {
        return panel(`⭕ Penalty — ${sideName}`, 'Who won the penalty?', (
          <>
            <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'pen', step: penaltyStepAfter('wonBy', penHas(flow.side)) as 'concededBy' | 'takenBy', side: flow.side, wonBy: p })} />
            <Button label="Skip — not recorded" variant="ghost" onPress={() => setFlow({ mode: 'pen', step: penaltyStepAfter('wonBy', penHas(flow.side)) as 'concededBy' | 'takenBy', side: flow.side })} />
          </>
        ));
      }
      if (flow.step === 'concededBy') {
        // Invasion batch 5 (audit fix 6): the defender — his foul (fouls
        // tracked) and the card step; Skip goes straight on to the taker.
        const { side, wonBy } = flow;
        const after = (w?: Player) => setFlow(penaltyStepAfter('concededBy', penHas(side)) === 'takenBy'
          ? { mode: 'pen', step: 'takenBy', side, wonBy: w } : { mode: 'pen', step: 'outcome', side, wonBy: w });
        return panel(`⭕ Penalty — ${sideName}`, 'Who gave it away? (optional)', (
          <>
            <PlayerTable players={xi(opp(side))} onPick={(p) => {
              for (const a of penaltyConcededActions(side, p, wonBy, { fouls: t.fouls, at: Date.now(), tracked: trackedKeys() })) fire(a);
              setFlow({ mode: 'pen', step: 'card', side, conceder: p });
            }} />
            <Button label="Skip — not recorded" variant="ghost" onPress={() => after(wonBy)} />
          </>
        ));
      }
      if (flow.step === 'card') {
        // Invasion batch 5: a card for who gave it away (one tap, or No card);
        // who won it is already on the log.
        const { side, conceder } = flow;
        const on = () => setFlow(penaltyStepAfter('concededBy', penHas(side)) === 'takenBy' ? { mode: 'pen', step: 'takenBy', side } : { mode: 'pen', step: 'outcome', side });
        return panel(`⭕ Penalty — ${conceder.fullName} gave it away`, `Card for ${conceder.fullName}?`, (
          <View style={{ gap: theme.spacing(2) }}>
            <View style={ctrl.row}>
              {cards.colours.includes('yellow') && (
                <Button label={`🟨 Yellow for ${conceder.fullName}`} variant="home" style={[ctrl.flex, { backgroundColor: theme.colors.accent }]} onPress={() => { recordCard(opp(side), 'yellow', conceder, 'foul'); on(); }} />
              )}
              <Button label="🟥 Red" variant="danger" style={ctrl.flex} onPress={() => { recordCard(opp(side), 'red', conceder, 'foul'); on(); }} />
            </View>
            <Button label="✓ No card" variant="ghost" onPress={on} />
          </View>
        ));
      }
      if (flow.step === 'takenBy') {
        return panel(`⭕ Penalty — ${sideName}`, 'Who is taking it?', (
          <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'pen', step: 'outcome', side: flow.side, taker: p, wonBy: flow.wonBy })} />
        ));
      }
      return panel(`⭕ Penalty — ${flow.taker?.fullName ?? sideName}`, 'Outcome?', (
        <View style={ctrl.row}>
          <Button label="⚽ Scored" variant="home" style={ctrl.flex} onPress={() => finishPenalty(flow.side, 'scored', flow.taker, flow.wonBy)} />
          <Button label="🧤 Saved" variant="ghost" style={ctrl.flex} onPress={() => finishPenalty(flow.side, 'saved', flow.taker, flow.wonBy)} />
          <Button label="✗ Missed" variant="ghost" style={ctrl.flex} onPress={() => finishPenalty(flow.side, 'missed', flow.taker, flow.wonBy)} />
        </View>
      ));
    }

    // Generic stat (shot, corner, offside, tackle, interception, save, pass, card)
    const meta = flow.kind === 'card' ? cards : STAT_META[flow.kind];
    if (flow.step === 'team') {
      const kind = flow.kind;
      const hint = kind === 'save' ? 'Which team made the save? (credited to their goalkeeper)' : 'Which team?';
      return panel(`${meta.icon} ${meta.label}`, hint, teamButtons((side) => {
        // A save defaults to the team's current goalkeeper — no player pick needed.
        if (kind === 'save') {
          const gk = gkOf(side);
          return gk || !xi(side).length ? afterKeeper(side, gk) : setFlow({ mode: 'stat', kind, step: 'player', side });
        }
        // MVP F5: with no players listed, skip "who?" — the stat is the team's
        const next = afterTeamPick(kind, xi(side).length > 0);
        return next === 'player' ? setFlow({ mode: 'stat', kind, step: 'player', side })
          : next === 'detail' ? setFlow({ mode: 'stat', kind, step: 'detail', side })
          : recordStat(kind as StatKind, side);
      }));
    }
    if (flow.step === 'player') {
      const sideName = flow.side === 'home' ? homeName : awayName;
      return panel(`${meta.icon} ${meta.label} — ${sideName}`, 'Who?', (
        <>
          <PlayerTable players={xi(flow.side)} onPick={(p) => (
            flow.kind === 'save' ? afterKeeper(flow.side, p)
            : detailNeeded(flow.kind)
              ? setFlow({ mode: 'stat', kind: flow.kind, step: 'detail', side: flow.side, player: p })
              : recordStat(flow.kind as StatKind, flow.side, p)
          )} />
          {/* SD-117 (F13, Law 12): coaches and staff can be cautioned / sent off too. */}
          {flow.kind === 'card' && (
            <Button label="👔 Team official (coach / staff)" variant="ghost"
              onPress={() => { setOfficialName(''); setFlow({ mode: 'stat', kind: 'card', step: 'official', side: flow.side }); }} />
          )}
        </>
      ));
    }
    if (flow.step === 'shooter') {
      const { side, player: keeper } = flow;
      return panel(`🧤 Save — ${keeper?.fullName ?? (side === 'home' ? homeName : awayName)}`, `Who took the shot? (${opp(side) === 'home' ? homeName : awayName})`, (
        <>
          <PlayerTable players={xi(opp(side))} onPick={(p) => recordSave(side, keeper, p)} />
          <Button label="Not sure — skip" variant="ghost" onPress={() => recordSave(side, keeper, null)} />
        </>
      ));
    }
    if (flow.step === 'official') {
      const { side } = flow;
      const sideName = side === 'home' ? homeName : awayName;
      return panel(`👔 Card — ${sideName} team official`, 'Their role (optional, e.g. Head coach — public, so not a name), then the card. Not a player: no stat line, nobody leaves the pitch.', (
        <View style={{ gap: theme.spacing(2) }}>
          <TextField label="" value={officialName} onChange={setOfficialName} placeholder="e.g. Head coach" />
          <View style={ctrl.row}>
            {cards.colours.includes('yellow') && (
              <Button label="🟨 Yellow" variant="home" style={[ctrl.flex, { backgroundColor: theme.colors.accent }]} onPress={() => { recordOfficialCard(side, 'yellow', officialName); setFlow(null); }} />
            )}
            <Button label="🟥 Red" variant="danger" style={ctrl.flex} onPress={() => { recordOfficialCard(side, 'red', officialName); setFlow(null); }} />
          </View>
        </View>
      ));
    }
    const { kind, side, player } = flow;
    const who = player?.fullName ?? (side === 'home' ? homeName : awayName);
    if (kind === 'shot') {
      // Deep wave (shot detail on): zone + big chance as pre-selected chips —
      // they ride on whichever outcome is tapped next (skipping costs nothing).
      const detailChips = deep.shotDetail ? (
        <View style={ctrl.chips}>
          {(['box', 'out'] as ShotZone[]).map((z) => (
            <SelectChip key={z} label={ZONE_LABEL[z]} active={mods.zone === z} onPress={() => setMods({ ...mods, zone: mods.zone === z ? undefined : z })} />
          ))}
          <SelectChip label="⭐ Big chance" active={!!mods.big} onPress={() => setMods({ ...mods, big: !mods.big })} />
        </View>
      ) : null;
      // On-target shots branch into their outcome; a block is credited to the defender.
      if (flow.step === 'outcome') {
        return panel(`✅ On target — ${who}`, 'What happened?', (
          <View style={{ gap: theme.spacing(2) }}>
            {detailChips}
            <View style={ctrl.row}>
              <Button label="⚽ Goal" variant="home" style={ctrl.flex} onPress={() => (player ? setFlow({ mode: 'goal', side, step: 'type', scorer: player }) : recordTeamGoal(side))} />
              <Button label="🧤 Saved" variant="ghost" style={ctrl.flex}
                onPress={() => recordShot(side, player, { onTarget: true }, () => { const gk = gkOf(opp(side)); if (gk) recordStat('save', opp(side), gk); })} />
            </View>
            <Button label="On target only" variant="ghost" onPress={() => recordShot(side, player, { onTarget: true })} />
          </View>
        ));
      }
      if (flow.step === 'blocker') {
        // deep wave: then (key passes on) who set the shot up
        const next = () => (deep.keyPasses && flow.shotId && player ? setFlow({ mode: 'keypass', side, shooter: player, shotId: flow.shotId }) : setFlow(null));
        return panel('🧱 Blocked by…', `Which ${opp(side) === 'home' ? homeName : awayName} player blocked it?`, (
          <>
            <PlayerTable players={xi(opp(side))} onPick={(b) => { recordStat('block', opp(side), b); next(); }} />
            <Button label="Not sure — skip" variant="ghost" onPress={next} />
          </>
        ));
      }
      // SD-08: a blocked shot never reached goal, so it is not on target (Opta:
      // shots = on target + off target + blocked); the blocker gets a block.
      return panel(`🎯 Shot — ${who}`, 'Where did it go?', (
        <View style={{ gap: theme.spacing(2) }}>
          {detailChips}
          <View style={ctrl.row}>
            <Button label="✅ On target" variant="home" style={ctrl.flex} onPress={() => setFlow({ mode: 'stat', kind: 'shot', step: 'outcome', side, player })} />
            <Button label="💨 Off target" variant="ghost" style={ctrl.flex} onPress={() => recordShot(side, player, { onTarget: false })} />
          </View>
          <View style={ctrl.row}>
            <Button label="🧱 Blocked" variant="ghost" style={ctrl.flex}
              onPress={() => { const shotId = recordShot(side, player, { onTarget: false, blocked: true }); setFlow({ mode: 'stat', kind: 'shot', step: 'blocker', side, player, shotId }); }} />
            {/* deep wave: hit the post / bar — an off-target shot (Opta) */}
            {deep.shotDetail ? <Button label="🪵 Woodwork" accessibilityLabel="Hit the post or the bar" variant="ghost" style={ctrl.flex} onPress={() => recordShot(side, player, { onTarget: false, woodwork: true })} /> : null}
          </View>
        </View>
      ));
    }
    if (kind === 'pass') {
      return panel(`➡️ Pass — ${who}`, 'Pass outcome?', (
        <View style={ctrl.row}>
          <Button label="✓ Completed" variant="home" style={ctrl.flex} onPress={() => recordStat('pass', side, player, { complete: true })} />
          <Button label="✗ Misplaced" variant="ghost" style={ctrl.flex} onPress={() => recordStat('pass', side, player, { complete: false })} />
        </View>
      ));
    }
    if (!player) return null; // a card always names a person (afterTeamPick)
    return panel(`${cards.icon} ${cards.label} — ${player.fullName}`, 'Which card?', (
      <View style={{ gap: theme.spacing(2) }}>
        {/* deep wave: why (optional — pick before the colour; no extra tap) */}
        {deep.cardReasons ? (
          <View style={ctrl.chips}>
            {CARD_REASONS.map((r) => <SelectChip key={r} label={CARD_REASON_LABEL[r]} active={cardReason === r} onPress={() => setCardReason(cardReason === r ? undefined : r)} />)}
          </View>
        ) : null}
        <View style={ctrl.row}>
          {cards.colours.includes('yellow') && (
            <Button label="🟨 Yellow" variant="home" style={[ctrl.flex, { backgroundColor: theme.colors.accent }]} onPress={() => { recordCard(side, 'yellow', player, cardReason); setFlow(null); }} />
          )}
          <Button label="🟥 Red" variant="danger" style={ctrl.flex} onPress={() => { recordCard(side, 'red', player, cardReason); setFlow(null); }} />
          {(state.sinBinMinutes ?? 0) > 0 && (
            <Button label={`⏱️ Sin-bin ${state.sinBinMinutes}'`} variant="ghost" style={ctrl.flex} onPress={() => { recordSinBin(side, player); setFlow(null); }} />
          )}
        </View>
      </View>
    ));
  }

  // ----- Main controls -----
  // Actions grouped so the scorer scans by phase of play, not one long list.
  const trackFor: Record<string, boolean> = {
    shot: t.shots, cross: t.crosses, dribble: t.dribbles, corner: t.corners, pass: t.passes, attackContribution: t.attackContribution,
    tackle: t.tackles, interception: t.interceptions, save: t.saves, defenceContribution: t.defenceContribution,
    // invasion batch 1: a red card changes who is on the pitch — the Card
    // button stays; "Cards" off hides only the yellows (cardChoices)
    foul: t.fouls, offside: t.offsides, handball: t.handball, card: true,
    // deep wave (optional): clearances, goal kicks / throw-ins
    clearance: !!deep.clearances, goalKick: !!deep.setPieces, throwIn: !!deep.setPieces,
  };
  const ACTION_GROUPS: { title: string; kinds: (StatKind | 'card')[] }[] = [
    { title: 'Attacking', kinds: ['shot', 'cross', 'dribble', 'corner', 'pass', 'attackContribution'] },
    { title: 'Defensive', kinds: ['tackle', 'interception', 'clearance', 'save', 'defenceContribution'] },
    { title: 'Discipline', kinds: ['foul', 'offside', 'handball', 'card'] },
    { title: 'Restarts', kinds: ['goalKick', 'throwIn'] },
  ];
  const startAction = (kind: StatKind | 'card') =>
    setFlow(kind === 'foul' ? { mode: 'foul', step: 'team' } : { mode: 'stat', kind, step: 'team' });

  // SD-132: the stopped clock (futsal Law 7), the futsal time-outs and the
  // accumulated fouls — its own component, so only the clock ticks each second.
  const nameOf = (side: 'home' | 'away') => (side === 'home' ? homeName : awayName);
  const callTimeout = async (side: 'home' | 'away') => {
    const t = futsalTimeout(state, side);
    if (!t.ok && !(await askConfirm({ title: 'No time-out left', message: `${t.reason} Log one for ${nameOf(side)} anyway?`, yesLabel: 'Log anyway', noLabel: 'No, keep scoring', tone: 'caution' }))) return;
    fire({ type: 'TIMEOUT', side, payload: { at: Date.now() } });
  };
  const clockPanel = state.gc && backfillMin == null
    ? <StoppedClockPanel state={state} dispatch={dispatch} nameOf={nameOf} onTimeout={(side) => void callTimeout(side)} /> : null;
  const afBanner = afAlert && state.futsal && afAlert.half === state.half && !state.ended ? (
    <View style={ctrl.addedBox} accessibilityRole="alert">
      <Text style={ctrl.label}>⚠️ {nameOf(afAlert.side)} — accumulated foul {afAlert.n} this half</Text>
      <Text style={ctrl.meta}>{nameOf(opp(afAlert.side))} get a direct free kick from the 10 m mark, no wall (or from where the foul was, if nearer goal). A goal from it: log it with Goal → Free kick.</Text>
      <Button label="Got it" variant="ghost" onPress={() => setAfAlert(null)} />
    </View>
  ) : null;

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {backfillBar}
      {clockPanel}
      {afBanner}
      {/* MVP F8: Goal first — the one action every game needs, above the fold */}
      {/* Goal — one flow: scorer (or own goal) → goal type → assist. */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Goal</Text>
        <Text style={ctrl.meta}>Pick the scorer (or own goal), the goal type, then the assist.</Text>
        <View style={ctrl.row}>
          <Button label={`Goal — ${homeName}`} variant="home" color={hc} style={ctrl.flex} onPress={() => setFlow({ mode: 'goal', side: 'home', step: 'scorer' })} />
          <Button label={`Goal — ${awayName}`} variant="away" color={ac} style={ctrl.flex} onPress={() => setFlow({ mode: 'goal', side: 'away', step: 'scorer' })} />
        </View>
      </View>

      {voiceBar}
      {t.possession && <PossessionBar state={state} homeName={homeName} awayName={awayName} homeColor={hc} awayColor={ac} onSwitch={setPossession} />}

      {/* In-play stoppage marker (injury / cooling break / VAR check) — a timeline
          note; distinct from signalling ADDED time (which extends the clock). */}
      {/* Invasion batch 5: one tap logs it (at the backfilled minute too — fire);
          the reason (injury / VAR / cooling break / other) is optional, after. */}
      <Button label="⏸️ Stoppage / injury" variant="ghost" onPress={() => { setStopAsk(state.seq + 1); fire(stoppageAction(state.possession.side ?? 'home')); }} />
      {stopAsk != null && state.seq === stopAsk && state.events.some((e) => e.id === stopAsk && e.type === 'stoppage' && !e.playerName) ? (
        <View style={ctrl.chips} accessibilityLabel="Why did play stop? (optional)">
          <Text style={ctrl.meta}>Why? (optional)</Text>
          {STOPPAGE_REASONS.map((r) => (
            <Button key={r} label={STOPPAGE_LABEL[r]} variant="ghost" style={ctrl.actionBtn}
              onPress={() => { dispatch(stoppageReasonAction(stopAsk, r)); setStopAsk(null); }} />
          ))}
        </View>
      ) : null}

      {/* Penalty — won by → taken by → scored / saved / missed (credits the GK on a save). */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Penalty</Text>
        <Text style={ctrl.meta}>Who won it, who took it, and whether it was scored, saved or missed.</Text>
        <Button label="Award a penalty" variant="ghost" onPress={() => setFlow({ mode: 'pen', step: 'team' })} />
        {/* deep wave: a goal ruled out (offside / foul / VAR) — a timeline row, the score never moved.
            Round 2: only with the "Goals ruled out" toggle on (school matches have no VAR);
            one already logged stays in the commentary / match centre either way. */}
        {deep.ruledOut ? (
          <Button label="❎ Goal ruled out" accessibilityLabel="Log a goal ruled out (offside, foul, handball, VAR)" variant="ghost" onPress={() => setFlow({ mode: 'nogoal', step: 'team' })} />
        ) : null}
      </View>

      {ACTION_GROUPS.map((g) => {
        const kinds = g.kinds.filter((k) => trackFor[k]);
        if (kinds.length === 0) return null;
        return (
          <View key={g.title} style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>{g.title}</Text>
            <View style={ctrl.chips}>
              {kinds.map((k) => {
                const m = k === 'card' ? cards : STAT_META[k];
                return <Button key={k} label={`${m.icon} ${m.label}`} variant="ghost" style={ctrl.actionBtn} onPress={() => startAction(k)} />;
              })}
            </View>
          </View>
        );
      })}

      {subSection}

      {/* #6: backfill — catch up on events that happened before scoring started.
          While active, every logged action is stamped at the chosen past minute. */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Backfill an earlier moment</Text>
        {backfillMin == null ? (
          <>
            <Text style={ctrl.meta}>Started scoring late? Enter a past minute — everything you log is stamped there until you go back to live.</Text>
            <View style={ctrl.row}>
              <View style={ctrl.flex}><TextField label="" value={backfillText} onChange={setBackfillText} placeholder="minute, e.g. 12 or 45+2" autoCapitalize="none" /></View>
              <Button label="Backfill" variant="ghost" disabled={backfillText.trim() === ''} onPress={() => {
                // "45+2" = added time of the half ending at 45 (SD-08); "12" = the 12th minute.
                const m = /^\s*(\d+)\s*\+\s*(\d+)\s*'?\s*$/.exec(backfillText);
                const ends = [1, 2, 3, 4].map((h) => ({ h: h as 1 | 2 | 3 | 4, end: h === 1 ? fmt.halfMinutes : h === 2 ? 2 * fmt.halfMinutes : h === 3 ? 2 * fmt.halfMinutes + fmt.etMinutes : 2 * fmt.halfMinutes + 2 * fmt.etMinutes }));
                const at = m ? ends.find((x) => x.end === Number(m[1])) : undefined;
                if (m && at) { setBackfillMin(at.end + Number(m[2])); setBackfillHalf(at.h); }
                else { setBackfillMin(Math.max(0, Math.floor(Number(backfillText)) || 0)); setBackfillHalf(null); }
              }} />
            </View>
          </>
        ) : (
          <View style={ctrl.addedBox}>
            <Text style={ctrl.label}>Backfilling at {minLabel(backfillMin, backfillHalf)}</Text>
            <Text style={ctrl.meta}>Every action you log now is stamped at {minLabel(backfillMin, backfillHalf)}. Adjust the minute, or go back to live scoring.</Text>
            <View style={ctrl.row}>
              <Button label="−1'" accessibilityLabel={`One minute earlier, now ${backfillMin}`} variant="ghost" style={ctrl.flex} onPress={() => setBackfillMin(Math.max(0, backfillMin - 1))} />
              <Button label="+1'" accessibilityLabel={`One minute later, now ${backfillMin}`} variant="ghost" style={ctrl.flex} onPress={() => setBackfillMin(backfillMin + 1)} />
              <Button label="▶ Back to live" variant="home" style={ctrl.flex} onPress={backToLive} />
            </View>
          </View>
        )}
      </View>

      {/* B9: correct the timeline — remove one specific wrong moment (e.g. a mistaken
          decision at 10') without undoing everything back to it. */}
      <View style={{ gap: theme.spacing(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={ctrl.label}>Correct the timeline</Text>
          <Button label={showEdit ? 'Done' : 'Edit'} variant="ghost" onPress={() => setShowEdit((v) => !v)} />
        </View>
        {showEdit && (() => {
          const items = [
            ...named.events.map((e) => ({ key: `e${e.id}`, minute: e.minute, half: eventHalf(e, fmt), order: e.id, label: `${EVENT_META[e.type].icon} ${EVENT_META[e.type].label}${e.type === 'sub' ? ` — ${e.secondName ?? ''} for ${e.playerName ?? ''}` : e.type === 'timeout' || e.type === 'nogoal' ? ` — ${nameOf(e.side)}` : e.type === 'stoppage' ? (e.playerName && e.playerName in STOPPAGE_LABEL ? ` — ${STOPPAGE_LABEL[e.playerName as keyof typeof STOPPAGE_LABEL]}` : '') : e.playerName ? ` — ${e.playerName}` : ''}${e.official ? ' (team official)' : ''}`, onRemove: () => removeEvent(e), detail: removeDetail(e), onEdit: e.type === 'timeout' || e.type === 'nogoal' || e.type === 'stoppage' ? undefined : () => editEvent(e) })),
            ...named.stats.map((st) => ({ key: `s${st.id}`, minute: st.minute, half: eventHalf(st, fmt), order: st.id, label: `${STAT_META[st.kind].icon} ${STAT_META[st.kind].label}${st.playerName ? ` — ${st.playerName}` : ''}`, onRemove: () => removeStat(st), detail: undefined as string | undefined, onEdit: () => editStat(st) })),
          ].sort(byMatchTimeDesc);
          if (items.length === 0) return <Text style={ctrl.meta}>Nothing logged yet.</Text>;
          return (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={ctrl.meta}>Tap ✎ Edit to re-pick the player/type (stamped at the same minute — every stat re-adjusts; Cancel keeps it as it was), or ✕ to remove it (asks first).</Text>
              {items.map((it) => (
                <View key={it.key} style={ctrl.editRow}>
                  <Text style={ctrl.editMin}>{minLabel(it.minute, it.half)}</Text>
                  <Text style={ctrl.editLabel} numberOfLines={1}>{it.label}</Text>
                  {it.onEdit ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${it.label}`} onPress={it.onEdit} /> : null}
                  <RowAction label="✕" tone="remove" a11y={`Remove ${it.label}`} onPress={() => void confirmRemove(`${it.label} (${minLabel(it.minute, it.half)})`, it.onRemove, it.detail)} />
                </View>
              ))}
            </View>
          );
        })()}
      </View>

      {/* Added (injury) time: near the half's end, prompt for the minutes; then
          count up as 45+x / 90+x; once they're up, nudge to end. */}
      {!state.gc && (() => {
        const base = halfBase(state);
        const min = currentMinute(state);
        // `?? 0` covers matches saved before ET halves were keyed here.
        const stop = state.stoppage[state.half] ?? 0;
        if ((stop === 0 && min >= base - 2) || (stop > 0 && changeAdded)) {
          return (
            <View style={ctrl.addedBox}>
              <Text style={ctrl.label}>Added time</Text>
              <Text style={ctrl.meta}>{stop > 0 ? `Now +${stop}′ — pick the new figure the 4th official shows.` : `The ${HALF_NAME[state.half]} is nearly up — enter the minutes of added (injury) time.`}</Text>
              <View style={ctrl.chips}>
                {[1, 2, 3, 4, 5, 6, 7, 8, ...(stop > 8 ? [stop] : [])].map((m) => (
                  <Button key={m} label={`+${m}`} variant="ghost" style={ctrl.actionBtn} color={m === stop ? theme.colors.primary : undefined}
                    onPress={() => { dispatch({ type: 'SET_STOPPAGE', payload: { minutes: m } }); setChangeAdded(false); }} />
                ))}
              </View>
              {stop > 0 && <Button label="Keep it" variant="ghost" onPress={() => setChangeAdded(false)} />}
            </View>
          );
        }
        // SD-117 (F7): "Change" reopens the chips when the 4th official adds more.
        const change = <Button label="Change" variant="ghost" onPress={() => setChangeAdded(true)} />;
        if (stop > 0 && min >= base + stop) {
          return (
            <View style={ctrl.addedRow}>
              <Text style={[ctrl.endNudge, ctrl.flex]}>⏱ {stop}′ added time is up — {state.half === 1 || state.half === 3 ? `end the ${HALF_NAME[state.half]}` : 'end the match'}.</Text>
              {change}
            </View>
          );
        }
        if (stop > 0) return <View style={ctrl.addedRow}><Text style={[ctrl.meta, ctrl.flex]}>⏱ +{stop}′ added time signalled</Text>{change}</View>;
        return null;
      })()}

      {(() => {
        // SD-106: every end-of-half / full-time tap asks first (ConfirmSheet).
        const score = `${state.home}-${state.away}`;
        const nextHalf = async () => {
          if (await confirmMatchAction('endPeriod', { period: state.half === 1 ? '1st half' : 'ET 1st half', score })) dispatch({ type: 'NEXT_HALF', payload: { at: Date.now() } });
        };
        // MVP F4: a single-period game ends (or goes to its decision) from the period
        if (state.half === 1 && !state.onePeriod) return <Button label="End 1st Half →" onPress={nextHalf} />;
        if (state.half === 3) return <Button label="End ET 1st half →" onPress={nextHalf} />;
        // End of 2nd half (or 2nd ET half): a level knockout tie goes to the ET/penalty
        // decision (END without awarding clean sheets yet); otherwise it's full time.
        const toDecision = needsDecision(state);
        const regEndHalf = state.half === 2 || (state.onePeriod && state.half === 1);
        const label = toDecision ? (regEndHalf ? (state.onePeriod ? 'End the period →' : 'End 2nd Half →') : 'End extra time →') : 'End Match';
        // SD-09: a level knockout stamps the XIs here too — its clean sheets are
        // decided by the open-play score once the shootout completes it.
        const onEnd = async () => {
          if (toDecision) {
            if (await confirmMatchAction('endPeriod', { period: regEndHalf ? (state.onePeriod ? 'period' : '2nd half') : 'extra time', score, detail: `Level at ${score} — it goes to the knockout decision. Undo can bring it back.` })) { stampXi(); dispatch({ type: 'END', payload: { at: Date.now() } }); }
          } else if (await confirmMatchAction('fullTime', { score })) endMatch();
        };
        return <Button label={label} variant="danger" onPress={() => void onEnd()} />;
      })()}
    </View>
  );
};

/** Live possession bar — time-based split, ticking each second, with a one-tap
 *  switch for when the ball changes hands. */
function PossessionBar({
  state, homeName, awayName, homeColor, awayColor, onSwitch,
}: {
  state: FootballState; homeName: string; awayName: string; homeColor?: string; awayColor?: string; onSwitch: (side: 'home' | 'away') => void;
}) {
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!state.startedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state.startedAt]);
  const pct = possessionPct(state, Date.now());
  const side = state.possession.side;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={ctrl.label}>Possession — {homeName} {pct.home}% : {pct.away}% {awayName}</Text>
      <View style={[ctrl.possTrack, { backgroundColor: ac }]}>
        <View style={[ctrl.possFill, { width: `${pct.home}%`, backgroundColor: hc }]} />
      </View>
      <View style={ctrl.row}>
        <Button label={`${side === 'home' ? '● ' : ''}Ball: ${homeName}`} variant={side === 'home' ? 'home' : 'ghost'} color={hc} style={ctrl.flex} onPress={() => onSwitch('home')} />
        <Button label={`${side === 'away' ? '● ' : ''}Ball: ${awayName}`} variant={side === 'away' ? 'away' : 'ghost'} color={ac} style={ctrl.flex} onPress={() => onSwitch('away')} />
      </View>
      <Text style={ctrl.meta}>Tap to set who has the ball (after a throw-in, corner, foul…); time on the ball drives the %.</Text>
    </View>
  );
}

/** SD-132 — the stopped clock (Futsal Law 7): the match clock, ⏸ Stop clock /
 *  ▶ Start clock, ⏱ Set clock, the "time is up" line, and with futsal rules
 *  the accumulated fouls (Law 13) and each team's time-out (1 a half). Ticks
 *  on its own each second. */
function StoppedClockPanel({ state, dispatch, nameOf, onTimeout }: {
  state: FootballState; dispatch: (a: ScoreAction) => void; nameOf: (side: 'home' | 'away') => string; onTimeout: (side: 'home' | 'away') => void;
}) {
  const [, tick] = useState(0);
  const run = gcRunning(state);
  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [run]);
  const [setting, setSetting] = useState(false);
  const [clockInput, setClockInput] = useState('');
  const applyClock = () => {
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(clockInput.trim());
    if (!m) return;
    // the match clock (count-up) the scorer reads, within this half
    const want = Number(m[1]) * 60 + Number(m[2] ?? 0) - startOffset(state) * 60;
    dispatch({ type: 'SET_CLOCK', payload: { sec: Math.max(0, Math.min(halfLenSec(state), want)), at: Date.now() } });
    setSetting(false); setClockInput('');
  };
  const nowMs = Date.now();
  const up = gcTimeUp(state, nowMs);
  const halfName = state.half <= 2 ? HALF_NAME[state.half] : 'extra time (with the 2nd half)';
  return (
    <View style={ctrl.addedBox}>
      <View style={ctrl.addedRow}>
        <Text style={[ctrl.clockTime, ctrl.flex]} accessibilityLabel="Match clock">{clockTime(state)}</Text>
        <Button label={run && !up ? '⏸ Stop clock' : '▶ Start clock'} variant={run && !up ? 'ghost' : 'primary'} disabled={up}
          onPress={() => dispatch({ type: 'CLOCK', payload: { run: !run, at: Date.now() } })} />
      </View>
      {!run && !up && gcSec(state, nowMs) > 0
        ? <Text style={ctrl.endNudge} accessibilityRole="alert">⏸ Clock stopped — tap ▶ Start clock when play restarts.</Text> : null}
      {up ? <Text style={ctrl.endNudge} accessibilityRole="alert">⏱ {state.half <= 2 ? state.halfMinutes : state.etMinutes}:00 played — time is up. Finish any kick, then end the {HALF_NAME[state.half]} below.</Text> : null}
      <Text style={ctrl.editLink} accessibilityRole="button" onPress={() => setSetting((v) => !v)}>{setting ? 'Cancel' : '⏱ Set clock'}</Text>
      {setting ? (
        <View style={ctrl.row}>
          <View style={ctrl.flex}><TextField label="Match clock (mm:ss)" value={clockInput} onChange={setClockInput} placeholder={clockTime(state)} /></View>
          <Button label="Set" onPress={applyClock} />
        </View>
      ) : null}
      {state.futsal ? (
        <>
          <Text style={ctrl.meta}>Accumulated fouls · {halfName}: {nameOf('home')} {accumulatedFouls(state, 'home')} · {nameOf('away')} {accumulatedFouls(state, 'away')} — from the 6th, a direct free kick from the 10 m mark (no wall).</Text>
          <View style={ctrl.row}>
            {(['home', 'away'] as const).map((side) => (
              <Button key={side} label={`⏸️ Time-out — ${nameOf(side)} (${futsalTimeout(state, side).left})`} variant="ghost" style={ctrl.flex} onPress={() => onTimeout(side)} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** SD-117 (F12, Law 10): "Who kicks first?" — the referee tosses a coin and the
 *  winning captain chooses; the shootout then alternates from that side. */
function FirstKicker({ homeName, awayName, homeColor, awayColor, onPick, onCancel }: {
  homeName: string; awayName: string; homeColor?: string; awayColor?: string; onPick: (first: 'home' | 'away') => void; onCancel?: () => void;
}) {
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={ctrl.label}>Who kicks first?</Text>
      <Text style={ctrl.meta}>After the referee’s toss (or however they decide) — pick the team going first.</Text>
      <View style={ctrl.row}>
        <Button label={`${homeName} first`} variant="home" color={homeColor} style={ctrl.flex} onPress={() => onPick('home')} />
        <Button label={`${awayName} first`} variant="away" color={awayColor} style={ctrl.flex} onPress={() => onPick('away')} />
      </View>
      {onCancel && <Button label="Back" variant="ghost" onPress={onCancel} />}
    </View>
  );
}

/** Penalty shootout panel — shown when a knockout tie is level at full time.
 *  SD-80 (FB-14): each kick records who took it (optional), the outcome —
 *  scored / saved / missed — and the keeper facing it (defaults to the
 *  other side's goalkeeper), for the FIFA-style kick list and the stats. */
function ShootoutControls({
  state, dispatch, homeName, awayName, takers = { home: [], away: [] }, keepers = {},
}: {
  state: FootballState; dispatch: (a: ScoreAction) => void; homeName: string; awayName: string;
  takers?: { home: Player[]; away: Player[] }; keepers?: { home?: Player; away?: Player };
}) {
  const [taker, setTaker] = useState<Player | null>(null);
  const [keeper, setKeeper] = useState<Player | null>(null);
  const { nameOf: playerNameOf } = useMask();
  const [pickKeeper, setPickKeeper] = useState(false);
  const kicksSoFar = (state.shootout?.home.length ?? 0) + (state.shootout?.away.length ?? 0);
  // a new kick starts with nobody picked
  useEffect(() => { setTaker(null); setKeeper(null); setPickKeeper(false); }, [kicksSoFar]);
  if (!needsDecision(state)) {
    return <IconText label={"✅ Full time — final score saved."} style={ctrl.meta} />;
  }
  const pens = penScore(state);
  if (!state.shootout) {
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={ctrl.label}>⚖️ {state.agg ? `Level on aggregate · ${aggregateText(state)}` : `Level ${state.home}–${state.away} at full time`}</Text>
        <Text style={ctrl.meta}>Extra time settled nothing — it goes to a penalty shootout.</Text>
        <FirstKicker homeName={homeName} awayName={awayName} onPick={(first) => dispatch({ type: 'START_SHOOTOUT', payload: { first } })} />
      </View>
    );
  }
  // SD-117 (F12): the side that won the toss's choice kicks first (older logs: home).
  const first = state.shootout.first ?? 'home';
  const second = first === 'home' ? 'away' : 'home';
  const nextSide: 'home' | 'away' = state.shootout[first].length <= state.shootout[second].length ? first : second;
  const otherSide = nextSide === 'home' ? 'away' : 'home';
  const nextName = nextSide === 'home' ? homeName : awayName;
  const kicks = state.shootout.kicks ?? [];
  const dot = (scored: boolean, i: number) => (
    <Text key={i} style={[ctrl.penDot, { color: scored ? theme.colors.primary : theme.colors.textMuted }]}>{scored ? '●' : '○'}</Text>
  );
  // Law 10: nobody kicks twice until every eligible team-mate has — those with
  // the fewest kicks are listed first.
  const taken = new Map<string, number>();
  for (const k of kicks) if (k.side === nextSide && k.takerId) taken.set(k.takerId, (taken.get(k.takerId) ?? 0) + 1);
  const minTaken = Math.min(...takers[nextSide].map((p) => taken.get(p.id) ?? 0), Infinity);
  const takerList = [...takers[nextSide]].sort((a, b) => (taken.get(a.id) ?? 0) - (taken.get(b.id) ?? 0));
  const facing = keeper ?? keepers[otherSide] ?? null;
  // IDs-only scoring: the taker and keeper by id (./actions.ts)
  const kick = (outcome: 'scored' | 'saved' | 'missed') => dispatch(penKickAction(nextSide, outcome, taker, facing));
  const list = (side: 'home' | 'away') => kicks.filter((k) => k.side === side).map((k) => kickText(nameRow(k, playerNameOf))).join(' · ');
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Penalty shootout — {pens.home} : {pens.away}</Text>
      <View style={ctrl.penRow}><Text style={ctrl.penTeam}>{homeName}</Text><View style={ctrl.row}>{state.shootout.home.map(dot)}</View></View>
      {list('home') ? <Text style={ctrl.meta}>{list('home')}</Text> : null}
      <View style={ctrl.penRow}><Text style={ctrl.penTeam}>{awayName}</Text><View style={ctrl.row}>{state.shootout.away.map(dot)}</View></View>
      {list('away') ? <Text style={ctrl.meta}>{list('away')}</Text> : null}
      {state.shootoutWinner ? (
        <Text style={ctrl.label}>🏆 {state.shootoutWinner === 'home' ? homeName : awayName} win {Math.max(pens.home, pens.away)}–{Math.min(pens.home, pens.away)} on penalties</Text>
      ) : (<>
      <Text style={ctrl.label}>{nextName} — kick {state.shootout[nextSide].length + 1}</Text>
      {/* SD-139: Law 10 keeps the same order in sudden death — no new pick */}
      {state.shootout.home.length >= 5 && state.shootout.away.length >= 5 ? <Text style={ctrl.meta}>Sudden death — kicks continue in the same order ({(first === 'home' ? homeName : awayName)} first), Law 10.</Text> : null}
      {takerList.length > 0 && (
        <>
          <Text style={ctrl.meta}>Who takes it? (optional)</Text>
          <View style={ctrl.chips}>
            {takerList.map((p) => {
              const n = taken.get(p.id) ?? 0;
              return <SelectChip key={p.id} label={`${p.jerseyNo != null ? `${p.jerseyNo} ` : ''}${p.fullName}${n > minTaken ? ' · kicked' : ''}`} active={taker?.id === p.id} onPress={() => setTaker(taker?.id === p.id ? null : p)} />;
            })}
          </View>
        </>
      )}
      {(facing || takers[otherSide].length > 0) && (
        <View style={ctrl.addedRow}>
          <Text style={[ctrl.meta, ctrl.flex]}>🧤 Keeper: {facing?.fullName ?? 'not set'}</Text>
          {takers[otherSide].length > 0 && <Text style={ctrl.editLink} accessibilityRole="button" onPress={() => setPickKeeper((v) => !v)}>{pickKeeper ? 'Done' : 'Change'}</Text>}
        </View>
      )}
      {pickKeeper && (
        <View style={ctrl.chips}>
          {takers[otherSide].map((p) => <SelectChip key={p.id} label={p.fullName} active={facing?.id === p.id} onPress={() => { setKeeper(p); setPickKeeper(false); }} />)}
        </View>
      )}
      <View style={ctrl.row}>
        <Button label="✓ Scored" variant={nextSide} style={ctrl.flex} onPress={() => kick('scored')} />
        <Button label="🧤 Saved" variant="ghost" style={ctrl.flex} onPress={() => kick('saved')} />
        <Button label="✗ Missed" variant="ghost" style={ctrl.flex} onPress={() => kick('missed')} />
      </View>
      </>)}
    </View>
  );
}

/* ------------------------------ Live panel --------------------------------- */

/** Running match clock — rendered inside the scoreboard (between status & score). */
const LiveClock: NonNullable<SportPlugin<FootballState>['LiveClock']> = ({ state }) => {
  const s = state as FootballState;
  const [, tick] = useState(0);
  const gcRun = gcRunning(s);
  useEffect(() => {
    if (!s.startedAt || s.ended || (s.gc && !gcRun)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.startedAt, s.ended, gcRun, s.gc]);

  // SD-132: on the stopped clock (futsal) the dot is live only while it runs
  const running = s.gc ? gcRun && !!s.startedAt && !gcTimeUp(s, Date.now()) : !!s.startedAt && !s.ended;
  const label = s.ended ? 'FT' : !s.startedAt ? (s.half === 2 ? 'HT' : '—') : clockTime(s);
  // SD-29: sin-bins running now + players on the pitch when a side is short.
  const { nameOf } = useMask();
  const live = s.ended ? null : footballLiveField(s, Date.now(), nameOf);
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing(1) }}>
      <View style={ctrl.clockRow}>
        <View style={[ctrl.liveDot, { backgroundColor: running ? theme.colors.danger : theme.colors.textMuted }]} />
        <Text style={ctrl.clockTime}>{label}</Text>
      </View>
      {live && <FieldBanner suspended={live.suspended} onField={live.onPitch && (live.short.home || live.short.away) ? live.onPitch : null} unit="on the pitch" />}
    </View>
  );
};

/** Match tabs (2026-10-22): football's slots — Lineups on Info, the
 *  minute-by-minute commentary, the match centre on Stats and the match facts
 *  (scorers, sendings-off) with the result on Summary. */
type TabProps = Parameters<NonNullable<SportPlugin<FootballState>['LiveExtras']>>[0];

/** Info: both XIs on the pitch, benches, managers and formations. */
const FootballLineups = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, homeLineup, awayLineup, homeManager, awayManager, homeFormation, awayFormation, canEditHome, canEditAway, onEditLineup, onPlayer }: TabProps) => {
  const s = state as FootballState;
  return (
    <LineupView
      homeLineup={homeLineup} awayLineup={awayLineup} homeRoster={homeRoster} awayRoster={awayRoster}
      events={s.events} minuteFormat={{ halfMinutes: s.halfMinutes, etMinutes: s.etMinutes }} homeName={homeName} awayName={awayName}
      homeColor={homeColor ?? theme.colors.home} awayColor={awayColor ?? theme.colors.away}
      homeManager={homeManager} awayManager={awayManager}
      homeFormation={homeFormation} awayFormation={awayFormation}
      canEditHome={canEditHome} canEditAway={canEditAway} onEditLineup={onEditLineup} onPlayer={onPlayer}
    />
  );
};

/** Commentary: minute-by-minute by half with the running score ("Key events"
 *  keeps goals, cards, subs, penalties). */
const FootballCommentary = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(state as FootballState, nameOf), [state, nameOf]);
  return (
    <Commentary items={footballFeed(s, { home: homeName, away: awayName })} labelOf={FOOTBALL_PERIOD_LABEL} periods={footballFeedPeriods(s)}
      homeName={homeName} awayName={awayName} homeColor={homeColor ?? theme.colors.home} awayColor={awayColor ?? theme.colors.away}
      homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer}
      emptyText="No events yet — updates appear here as the match unfolds." />
  );
};

/** Stats: the match centre — team stats by category and half, then each
 *  side's player box score (SD-23 / FB-09). */
const FootballStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const s = state as FootballState;
  const { nameOf } = useMask();
  return <MatchCentre sport="football" source={footballCentreSource(s, { homeRoster, awayRoster, homeName, awayName, nameOf })} categories={footballCentre} homeName={homeName} awayName={awayName} homeColor={homeColor ?? theme.colors.home} awayColor={awayColor ?? theme.colors.away} onPlayer={onPlayer} />;
};

/** Summary: the scorers, sendings-off, half-time and shoot-out lines
 *  (possession is a stat — it stays on Stats). */
const FootballFacts = ({ state, homeName, awayName, homeColor, awayColor }: TabProps) => {
  const { nameOf } = useMask();
  return (
    <MatchFactsCard facts={resultFacts(footballFacts(state as FootballState, Date.now(), nameOf))}
      homeName={homeName} awayName={awayName} homeColor={homeColor ?? theme.colors.home} awayColor={awayColor ?? theme.colors.away} />
  );
};

/** Football's pitch as the generic Court (positions mirrored per side). */
const Court: NonNullable<SportPlugin<FootballState>['Court']> = ({ homeLineup, awayLineup, homeColor, awayColor }) => (
  <Pitch homeLineup={homeLineup} awayLineup={awayLineup} homeColor={homeColor} awayColor={awayColor} />
);

export const footballPlugin: SportPlugin<FootballState> = {
  ...FOOTBALL_META,
  matchRecords: footballMatchRecords, // SD-51 (set by the registry before perf F-15)
  // MVP F1: Undo names what it removes ("goal · Ravi (2-1)")
  undoLabel: (step, nameOf) => footballUndoLabel(step, nameOf),
  // Score overlay (parity #25): goal scorers per side; GOAL! flash.
  tickerDetail: footballTickerDetail,
  tickerFlash: footballTickerFlash,
  createInitialState: init,
  reducer,
  // SD-30 + SD-09 + SD-29: every credited stat (goals by type, assists, shots,
  // cards, saves, fouls…), own goals and headed goals, every player's minutes
  // and the keepers' clean sheets / goals conceded, set absolutely at
  // completion (incl. a shootout) and after every correction. Still partial:
  // an older log whose names don't resolve to ids leaves its goal / card keys
  // to the live increments / correction deltas (football/totals.ts).
  statTotals: footballStatTotals,
  // SD-30: the matchday squads resolve name-only events of older logs
  statTotalsNeedsPlayers: true,
  // SD-17: FIFA fair-play points from the cards (the fairPlay tie-breaker).
  standingsUnits: (s) => ({ fairPlay: fairPlayScore(s.events ?? []) }),
  statTotalsPartial: true,
  // A level knockout tie isn't complete until the shootout produces a winner.
  // SD-120: on leg 2 of a new two-legged tie, "level" means level on aggregate.
  isComplete: footballComplete,
  result: footballResult,
  summary: (s) => {
    const pens = penScore(s);
    // Cards are no longer a lumped tally on the scorecard — reds show as badges by
    // the team name (see homeReds/awayReds), so the scorer sees who's down to 10.
    return {
      homeScore: String(s.home),
      awayScore: String(s.away),
      statusLine: s.shootoutWinner
        ? `${s.shootoutWinner === 'home' ? 'Home' : 'Away'} win ${pens.home}–${pens.away} on pens`
        : s.shootout
        ? `Penalties ${pens.home}–${pens.away}`
        : s.ended
        ? 'Full Time'
        : s.half === 1 ? '1st Half' : s.half === 2 ? '2nd Half' : s.half === 3 ? 'Extra Time (1st)' : 'Extra Time (2nd)',
      // SD-56: "HT 1-0" once the 2nd half is reached (+ "FT 2-2" after extra time)
      detailLine: footballDetailLine(s),
      homeReds: s.events.filter((e) => e.type === 'red' && e.side === 'home' && !e.official).length,
      awayReds: s.events.filter((e) => e.type === 'red' && e.side === 'away' && !e.official).length,
    };
  },
  // SD-56: the match card's line under the score ("HT 1-0")
  cardLine: (s) => halfTimeText(s),
  ScoringControls,
  // Match tabs: its own lineups view replaces the generic court on Info.
  matchTabs: { Info: FootballLineups, Commentary: FootballCommentary, Stats: FootballStats, SummaryExtras: FootballFacts },
  LiveClock,
  formation: emptyFormation,
  Court,
  liveSettings: FOOTBALL_LIVE_SETTINGS,
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  editMin: { color: theme.colors.accent, fontWeight: '800', width: 48, fontSize: theme.font.small }, // fits "45+2'" (SD-08)
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  editBanner: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.accent + '22', padding: theme.spacing(2), borderRadius: theme.radius.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  subBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  extrasHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  clockTime: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1 },
  penRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  penTeam: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', width: 110 },
  penDot: { fontSize: 18, marginRight: 2 },
  flowPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  actionBtn: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3) },
  table: { borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  prow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  prowSel: { backgroundColor: theme.colors.surfaceAlt },
  jersey: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  jerseyTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  pname: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  ppos: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  addedBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  endNudge: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  addedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  voiceBar: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  voiceHeard: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', fontStyle: 'italic' },
  voiceFeedback: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  pickRow: { flexDirection: 'row', gap: theme.spacing(3) },
  pickCol: { flex: 1, gap: theme.spacing(2) },
  pickTeam: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  possTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.away, overflow: 'hidden' },
  possFill: { height: 8, borderRadius: 4 },
  extraTabs: { flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: 3 },
  extraTab: { flex: 1, textAlign: 'center', paddingVertical: theme.spacing(2), borderRadius: theme.radius.pill, color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', overflow: 'hidden' },
  extraTabActive: { backgroundColor: theme.colors.primary, color: theme.colors.onFill, fontWeight: '800' },
});
