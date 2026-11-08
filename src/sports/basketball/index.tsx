/**
 * Basketball plugin — archetype: running-points, with the same live-event depth
 * as football: a per-quarter game clock, play-by-play timeline, player-attributed
 * baskets (1/2/3), rebounds, assists and fouls, and a live box score.
 *
 * The pure reducer can't read the clock, so the controls stamp each event's
 * quarter + minute via `payload`.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TextField } from '../../components/ui';
import { theme } from '../../core/theme';
import { Button, SelectChip } from '../../components/ui';
import { askConfirm, confirmMatchAction } from '../../components/ConfirmSheet';
import { IconText } from '../../components/Icon';
import { SubViews } from '../SubViews';
import { MatchBoxScore } from '../../components/BoxScore';
import { basketballBox } from '../boxSources';
import { basketballStatTotals, shotsTracked } from './totals';
import { isFieldGoal } from './credits';
import { blockAction, ejectAction, foulAction, freeThrowAction, jumpBallAction, lineupAction, missAction, reboundAction, removeAction, scoreAction, statAction, stealAction, subAction, teamReboundAction, turnoverAction, type StatPlay } from './actions';
import { hasPlayer, onPlayerOf, playId, playerOf } from './names';
import { useMask } from '../../core/disputeMask';
import { withRosters } from '../racketNames';
import { BB_META, DQ_LABEL, FOUL_LABEL, TO_LABEL, pointsOf, zoneBehindArc, type BBEvent, type BenchTech, type DqReason, type FoulType, type ReboundType, type ShotZone, type TurnoverType } from './events';
import { PlayFeed } from '../PlayFeed';
import { CategoryStatsPanel } from '../CategoryStatsPanel';
import { basketballFeed } from './commentary';
import { basketballPanel, bbPanelPeriods } from './panel';
import { ShotChart } from './ShotChart';
import type { Player } from '../../core/types';
import type { LiveSettings, ScoreAction, SportPlugin } from '../types';
import { basketballVoice } from '../voiceParsers';
import { aggregateText, levelForDecider } from '../aggregate';
import { courtFormation, makeCourt } from '../courts';
import { LineScoreboard } from '../../components/LineScoreboard';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';

import {
  type BasketballState, init, reducer, periodLabel, currentMinute,
  isFouledOut, isPlayerOut, isEjected, inBonus, timeoutStatus, onCourtRefs, courtSet, teamFoulsThisQuarter,
  disqualifyingFoul, freeThrowsFor, arrowSide, coachTechnicals, coachDisqualified,
  gameSec, clockLeft, clockRunning, timedPeriod, timeUp, clockText, possessionAfterFoul, ballAfterFoul,
  BB_TRACK_DEFAULTS, scoringLayout,
} from "./engine";
import { BASKETBALL_META } from './meta';
import { basketballUndoLabel } from './undoLabel';
import { basketballMatchRecords } from './records';
import { DescribeCard, useDescribeMarks } from '../../components/DescribeCard';
import { assistCard, assistOwn, blockCard, blockOwn, cardStale, describesDrawn, foulCard, foulDrawnAction, foulOwn, tagAction } from './describe';

/** SD-117 (B12): the foul-type chips, FIBA's U and D included. */
// FIBA 2026 (from 1 Oct 2026, basketball-rulebook.md BK-1/2): disruptive and flagrant
// replace unsportsmanlike; a technical is category 1 (behaviour, counts towards
// disqualification) or category 2 (delay / hanging on the ring, doesn't)
const FOUL_CHOICES: { key: string; type: FoulType; cat2?: boolean; label: string }[] = [
  { key: 'personal', type: 'personal', label: FOUL_LABEL.personal }, { key: 'shooting', type: 'shooting', label: FOUL_LABEL.shooting },
  { key: 'offensive', type: 'offensive', label: FOUL_LABEL.offensive },
  { key: 'technical', type: 'technical', label: 'Technical (behaviour)' }, { key: 'technical2', type: 'technical', cat2: true, label: 'Technical (delay / ring)' },
  { key: 'disruptive', type: 'disruptive', label: FOUL_LABEL.disruptive }, { key: 'flagrant', type: 'flagrant', label: FOUL_LABEL.flagrant },
  { key: 'disqualifying', type: 'disqualifying', label: FOUL_LABEL.disqualifying },
];
// MVP B7: a team foul (no player listed, or not known) — the types that don't eject a person
const TEAM_FOUL_TYPES: FoulType[] = ['personal', 'shooting', 'offensive', 'technical'];

/** US batch 5: the turnover kinds offered after a player (optional — the plain
 *  Turnover button stays one tap) and on the team row (no player). */
const PLAYER_TO_TYPES: TurnoverType[] = ['badPass', 'lostBall', 'travel', 'double', 'oob', 'backcourt', '3s', 'goaltend'];
const TEAM_TO_TYPES: TurnoverType[] = ['8s', '5s'];

/* ------------------------------- Controls ---------------------------------- */

const Row = ({ label, roster, onPick, disabledFor }: { label: string; roster: Player[]; onPick: (p: Player) => void; disabledFor?: (p: Player) => boolean }) => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={ctrl.label}>{label}</Text>
    {roster.length > 0 ? (
      <View style={ctrl.chips}>
        {roster.map((p) => (
          <SelectChip key={p.id} label={p.fullName} active={false} disabled={disabledFor?.(p)} onPress={() => onPick(p)} />
        ))}
      </View>
    ) : (
      <Text style={ctrl.meta}>No roster set.</Text>
    )}
  </View>
);

/** A multi-step capture in progress: free throws, foul-type pick, off/def rebound,
 *  a substitution, or setting the starting five. */
type Flow =
  // describe-us DU12: `foulTrip` = the free throws of the foul whose "who was fouled?" card is open
  | { kind: 'ft'; side: 'home' | 'away'; shooter?: Player; reason?: string; remaining?: number; total?: number; foulTrip?: true }
  // SD-117 (B3): a player picked first, then the action — no row of look-alike chips to mis-tap
  | { kind: 'act'; side: 'home' | 'away'; player: Player }
  // describe-us DU1: the type tap logs the foul — who was fouled is an optional card after
  | { kind: 'foul'; side: 'home' | 'away'; fouler?: Player; team?: true }
  | { kind: 'rebound'; side: 'home' | 'away'; player: Player }
  | { kind: 'sub'; side: 'home' | 'away'; off?: Player }
  // IDs-only scoring: the five by player id
  | { kind: 'setFive'; side: 'home' | 'away'; picked: string[] }
  | null;

const ScoringControls: SportPlugin<BasketballState>['ScoringControls'] = ({
  state: liveState,
  dispatch: rawDispatch,
  homeName,
  awayName,
  homeRoster = [],
  awayRoster = [],
}) => {
  // SD-114: ✎ Edit holds the removal until the re-entry commits (Cancel keeps
  // the play); `state` is the view as if it were removed. See usePendingEdit.
  const { view: state, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  const [sel, setSel] = useState<{ home?: Player; away?: Player }>({});
  // Timeline correction: edit one past play in place, or backfill a missed one.
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState<BBEvent | null>(null); // the play being re-entered
  const [editSel, setEditSel] = useState<Player | null>(null); // scorer chosen while editing a basket
  const [backfillQ, setBackfillQ] = useState<number | null>(null); // stamp new plays into this quarter
  // Multi-step captures (free throws, foul type, rebound off/def, sub, starting five).
  const [flow, setFlow] = useState<Flow>(null);
  const [showSubs, setShowSubs] = useState(false);
  // MVP B1: re-render once when the running clock reaches 0:00, so the bottom
  // button switches to "Start Overtime" (the clock panel ticks on its own).
  const [, setExpired] = useState(0);
  const leftMs = state.gc?.since && timedPeriod(state) ? clockLeft(state, Date.now()) * 1000 : 0;
  useEffect(() => {
    if (!leftMs) return;
    const id = setTimeout(() => setExpired((n) => n + 1), leftMs + 250);
    return () => clearTimeout(id);
  }, [leftMs]);
  // SD-117 (B6): right after a made basket — "Assist?" for the on-court teammates
  // Deep wave: the same box offers "⚡ Fast break" (tags the basket) and, with
  // Shot zones on, "🔗 And-one" (the bonus free throw).
  // MVP B6: `fromSeq` = the log counter when the basket was made; `ref` = that basket, once on the board
  const [assistFor, setAssistFor] = useState<{ side: 'home' | 'away'; scorer?: Player; points: number; fromSeq?: number; ref?: number } | null>(null);
  // MVP B6: the prompt finds its basket (the first of that side logged after it
  // opened) and closes if Undo removes it — no phantom assist.
  useEffect(() => {
    if (!assistFor || assistFor.fromSeq == null) return;
    if (assistFor.ref == null) {
      const b = state.events.find((e) => e.type === 'score' && e.side === assistFor.side && e.id > assistFor.fromSeq!);
      if (b) setAssistFor({ ...assistFor, ref: b.id });
    } else if (assistFor && assistFor.ref != null && !state.events.some((e) => e.id === assistFor.ref)) setAssistFor(null);
  }, [assistFor, state.events]);
  // US batch 5 — optional prompts after a play (any other play closes them):
  // "Rebound?" after a miss / a missed last free throw; "Who lost it?" after a
  // steal; "Whose shot?" after a block. `fromSeq` finds the steal / block once
  // it is on the board (`ref`); Undo removing it closes the prompt.
  const [reboundFor, setReboundFor] = useState<{ shotSide: 'home' | 'away' } | null>(null);
  const [stealFor, setStealFor] = useState<{ side: 'home' | 'away'; fromSeq: number; ref?: number } | null>(null);
  const [blockFor, setBlockFor] = useState<{ side: 'home' | 'away'; fromSeq: number; ref?: number; three?: boolean } | null>(null);
  useEffect(() => {
    const find = (type: 'steal' | 'block', p: { side: 'home' | 'away'; fromSeq: number; ref?: number }) =>
      (p.ref == null ? state.events.find((e) => e.type === type && e.side === p.side && e.id > p.fromSeq)?.id : state.events.some((e) => e.id === p.ref) ? p.ref : -1);
    if (stealFor) { const r = find('steal', stealFor); if (r === -1) setStealFor(null); else if (r != null && r !== stealFor.ref) setStealFor({ ...stealFor, ref: r }); }
    if (blockFor) { const r = find('block', blockFor); if (r === -1) setBlockFor(null); else if (r != null && r !== blockFor.ref) setBlockFor({ ...blockFor, ref: r }); }
  }, [stealFor, blockFor, state.events]);
  // describe-us DU1: "who was fouled?" after the foul is on the board (optional;
  // with "Fouls drawn" on). `fromSeq` finds the foul (`ref`); its own free
  // throws keep the card open (DU12).
  const [foulFor, setFoulFor] = useState<{ side: 'home' | 'away'; fromSeq: number; ref?: number } | null>(null);
  // describe-us: Done / Skip per play, held here so a card that closes still remembers and the next play opens fresh
  const marks = useDescribeMarks<string>();
  // describe-us DU3 / DU9: each card finds its play, and closes once the play
  // is gone (Undo / Remove) or a newer play — a tap or voice — is logged
  useEffect(() => {
    if (assistFor?.ref != null && cardStale(state, assistFor.ref, assistOwn(state, assistFor.ref))) setAssistFor(null);
    if (blockFor?.ref != null && cardStale(state, blockFor.ref, blockOwn(state, blockFor.ref))) setBlockFor(null);
    if (foulFor) {
      if (foulFor.ref == null) {
        const f = state.events.find((e) => e.type === 'foul' && e.side === foulFor.side && e.id > foulFor.fromSeq);
        if (f) setFoulFor({ ...foulFor, ref: f.id });
      } else if (cardStale(state, foulFor.ref, foulOwn(state, foulFor.ref))) setFoulFor(null);
    }
  }, [assistFor, blockFor, foulFor, state.events]);
  // IDs-only scoring: the log names players by id; this viewer's names (the
  // squads' as the fallback) are put in when shown.
  const { nameOf: viewerNameOf } = useMask();
  const pName = withRosters(viewerNameOf, homeRoster, awayRoster);

  // Half-court small-sided ball (3×3 / 2v2 / 1v1 — all first-to-N) scores 1s and
  // 2s only: a made shot is 1, from behind the arc it's 2. Full-court games keep
  // the 1/2/3 buttons (used as-is when re-entering an old play).
  const halfCourt = state.targetPoints > 0;
  const pointValues = halfCourt ? [1, 2] : [1, 2, 3];

  // While editing, stamp the re-entered play at the original moment; while
  // backfilling, at the chosen quarter; otherwise live.
  // SD-132: on the game clock a live play also carries the clock second (and
  // `at`, so a foul / time-out stops the clock); an edit keeps its own second.
  const stampFor = (): { quarter: number; minute: number; sec?: number; at?: number } => {
    if (edit) return { quarter: edit.quarter, minute: edit.minute, ...(typeof edit.sec === 'number' ? { sec: edit.sec } : {}) };
    if (backfillQ != null) return { quarter: backfillQ, minute: 0 };
    if (state.gc) { const now = Date.now(); const sec = gameSec(state, now); return { quarter: state.quarter, minute: Math.floor(sec / 60), sec, at: now }; }
    return { quarter: state.quarter, minute: currentMinute(state) };
  };
  // Any other play closes the "Assist?" prompt (a make re-opens it after).
  const fire = (action: ScoreAction) => {
    setAssistFor(null);
    setReboundFor(null); setStealFor(null); setBlockFor(null);
    // describe-us DU12: the foul's own free throws keep its card open
    if (!(action.type === 'FREE_THROW' && flow?.kind === 'ft' && flow.foulTrip)) setFoulFor(null);
    // SD-122: `v: 2` = foul-out / ejection are checked for this side (and id).
    dispatch(stamped(action));
  };
  // SD-122 stamps; describe-us: a card's own detail is stamped the same but
  // closes no card (it describes the play the card is about)
  const stamped = (action: ScoreAction): ScoreAction => ({ ...action, payload: { ...action.payload, ...stampFor(), v: 2 } });

  // SD-31: "Track missed shots" (live settings) — Miss buttons, and every make
  // counts as an attempt (`fga`) so FGA / FG% / EFF are complete.
  const tracking = state.trackMisses === true;
  // SD-116 (B1): the picked scorer is for ONE shot — cleared after each make /
  // miss, so the next basket isn't silently credited to the previous player.
  const clearSel = (side: 'home' | 'away') => setSel((cur) => (cur[side] ? { ...cur, [side]: undefined } : cur));
  // Deep wave: `zone` (Shot zones on), `fbt` (fast breaks being tagged —
  // an edit keeps the original's), `fb` (an edit keeps the original's tag).
  const score = (side: 'home' | 'away', pts: number, p: Player | undefined = sel[side], fga = tracking, opts: { zone?: ShotZone; fbt?: boolean; fb?: boolean } = {}) => {
    // IDs-only scoring: the player by id (actions.ts) — never a name
    clearSel(side);
    fire(scoreAction(side, pts, p, { halfCourt, fga, zone: opts.zone, fbt: opts.fbt ?? state.trackFastBreak === true, fb: opts.fb }));
    // SD-117 (B6): a made field goal asks "Assist?" (live plays only, not an edit)
    if (!edit && isFieldGoal(pts, halfCourt)) setAssistFor({ side, scorer: p, points: pts, fromSeq: state.seq });
  };
  const miss = (side: 'home' | 'away', pts: number, p: Player | undefined = sel[side], zone?: ShotZone) => {
    clearSel(side);
    fire(missAction(side, pts, p, zone));
    // US batch 5: "Rebound?" — optional, live plays only
    if (!edit) setReboundFor({ shotSide: side });
  };
  // Deep wave — "Shot zones": a made / missed shot from a zone is one tap
  // (inside the arc 2, behind it 3; half-court 1 and 2).
  const zoneValue = (z: ShotZone) => (zoneBehindArc(z) ? (halfCourt ? 2 : 3) : (halfCourt ? 1 : 2));
  const ZONE_BTN: { zone: ShotZone; short: string; long: string }[] = [
    { zone: 'paint', short: 'Paint', long: 'in the paint' }, { zone: 'mid', short: 'Mid', long: 'mid-range' },
    { zone: 'c3', short: 'Corner', long: 'from the corner' }, { zone: 'ab3', short: 'Top', long: 'above the break' },
  ];
  const stat = (side: 'home' | 'away', type: StatPlay, p: Player) => fire(statAction(side, type, p));

  // ----- Correct the timeline: remove / edit one specific past play -----
  const STAT_KEY: Record<string, string> = { rebound: 'rebounds', assist: 'assists', foul: 'fouls', steal: 'steals', block: 'blocks', turnover: 'turnovers' };
  // Which plays can be re-entered in place (single-player stat plays). Free
  // throws (made/miss), timeouts and subs are remove-only.
  // MVP B8: a team basket can be edited to name its scorer (points, zone, second kept)
  const canEdit = (e: BBEvent) => (hasPlayer(e) || e.type === 'score') && (e.type === 'score' || !!STAT_KEY[e.type]);
  // An older log's name-only play: its id from that log's map, else the
  // squads (read on this device only — the action carries the id).
  const rosterId = (nm?: string) => (nm ? [...homeRoster, ...awayRoster].find((p) => p.fullName === nm)?.id : undefined);
  const idOfPlay = (e: BBEvent) => playId(state, e) ?? rosterId(e.playerName);
  // Reverse exactly what the play credited (credits.ts — FG / 3P / misses /
  // OREB-DREB included), so the lines match the log again.
  const removal = (e: BBEvent): ScoreAction => removeAction(e, idOfPlay(e), { halfCourt, tracked: shotsTracked(state) });
  const removeEvent = (e: BBEvent) => dispatch(removal(e));
  // Edit = remove the old play, then re-enter it stamped at the same moment so
  // the score and every player tally re-adjust to match. SD-114: the removal is
  // held until the re-entry commits — Cancel keeps the play.
  const editEvent = (e: BBEvent) => { holdRemoval([removal(e)]); setShowEdit(false); setEditSel(null); setEdit(e); };
  const cancelEdit = () => { dropHeldRemoval(); setEdit(null); setEditSel(null); };
  const commitEdit = (p: Player, points?: number, zoneFor?: ShotZone) => {
    if (!edit) return;
    if (edit.type === 'score') {
      // Deep wave: the re-entered basket keeps its zone (same value) and fast-break detail
      const keepZone = edit.zone && zoneValue(edit.zone) === points ? edit.zone : undefined;
      score(edit.side, points ?? 0, p, shotsTracked(state), { zone: zoneFor ?? keepZone, fbt: edit.fbt === true, fb: edit.fb === true });
    } else if (edit.type === 'rebound') fire(reboundAction(edit.side, p, edit.reboundType));
    else if (edit.type === 'foul') {
      // the re-entered foul keeps who drew it — by id (an older log's name is resolved, never copied)
      const drawnId = edit.drawnPid ?? (edit.drawn ? state.ids?.[edit.drawn] ?? rosterId(edit.drawn) : undefined);
      fire(foulAction(edit.side, p, edit.foulType ?? 'personal', { fdt: edit.fdt === true, drawnBy: drawnId ? { id: drawnId } : undefined }));
    } else if (edit.type === 'steal') fire(stealAction(edit.side, p, edit.pair === true));
    else if (edit.type === 'block') fire(blockAction(edit.side, p, edit.pair === true));
    // US batch 5: a re-entered turnover keeps its kind and its steal
    else if (edit.type === 'turnover') fire(turnoverAction(edit.side, p, { toType: edit.toType, ref: edit.ref }));
    else stat(edit.side, edit.type.toUpperCase() as StatPlay, p);
    setEdit(null); setEditSel(null);
  };

  // ----- Multi-step captures -----
  const opp = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');
  const teamOf = (side: 'home' | 'away') => (side === 'home' ? homeName : awayName);
  const rosterOf = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);
  // The squad players on court now (by id; an older log's five by name), or
  // null while the side's five isn't set.
  const onCourtPlayers = (side: 'home' | 'away'): Player[] | null => {
    if (!courtSet(state, side)) return null;
    const refs = onCourtRefs(state, side);
    return rosterOf(side).filter((p) => refs.some((r) => (r.id ? r.id === p.id : r.name === p.fullName)));
  };
  // SD-117 (B9): once the on-court five is tracked, player rows list just them
  // (the bench can't score, rebound or foul) — no long scroll past the squad.
  const courtOf = (side: 'home' | 'away'): Player[] => {
    const roster = rosterOf(side);
    const on = onCourtPlayers(side);
    return on?.length ? on : roster;
  };

  // Free throw — one attempt; the panel stays open so 2- and 3-shot trips are quick.
  const freeThrow = (side: 'home' | 'away', made: boolean, shooter?: Player) => fire(freeThrowAction(side, made, shooter));

  // SD-116 (B2): ejection asks first (ConfirmSheet), then logs EJECT.
  const eject = async (side: 'home' | 'away', p: Player) => {
    if (!(await confirmMatchAction('eject', { what: p.fullName }))) return;
    fireEject(side, p);
    setFlow(null);
  };
  const fireEject = (side: 'home' | 'away', p: Player, reason?: DqReason) => fire(ejectAction(side, p, reason));

  // Foul — logged with its type. SD-117: it flows straight into the other
  // side's free throws with the count prefilled (B11: technical 1, shooting /
  // U / D / flagrant 2) — and a personal foul once the fouling side is over the
  // team-foul limit opens the bonus 2 (B8). A D foul, or a 2nd T / 2nd U / T + U,
  // disqualifies (B12): asked first in the ConfirmSheet, then logged + ejected.
  // MVP B7: `fouler` null = a team foul (no player): it counts toward the team-foul limit; no one is ejected.
  // US batch 6: `bench` = a coach (C) / bench (B) technical (no player; 1 free throw; not a team foul)
  const recordFoul = async (side: 'home' | 'away', fouler: Player | null, type: FoulType, drawnBy?: Player | null, bench?: BenchTech, cat2?: boolean) => {
    if (bench && !fouler && type === 'technical') {
      // US batch 6: the coach's technical — one free throw for the other side, then their ball as before
      fire(foulAction(side, null, 'technical', { bench }));
      setFlow({ kind: 'ft', side: opp(side), remaining: 1, total: 1, reason: `${bench === 'C' ? 'Coach' : 'Bench'} technical on ${teamOf(side)} — 1 free throw for ${teamOf(opp(side))}` });
      return;
    }
    const dq = fouler ? disqualifyingFoul(state, fouler.fullName, type, { side, pid: fouler.id }, cat2 ? { cat2: true } : undefined) : null;
    if (dq && fouler && !(await confirmMatchAction('eject', {
      what: fouler.fullName,
      detail: `${FOUL_LABEL[type]} — that's ${DQ_LABEL[dq]}, so the rules disqualify ${fouler.fullName}. The foul is logged and the player is ejected. Undo can bring it back.`,
    }))) return;
    const shots = freeThrowsFor(state, side, type);
    // SD-132 (FIBA 3×3 Art. 15): team foul 10+ → 2 free throws AND the ball
    const ball = possessionAfterFoul(state, side, type);
    // US batch 5 (FIBA Art. 37 / 38): U / D / flagrant / disruptive — the free throws and then the ball
    const keep = ballAfterFoul(type);
    const bonus = shots > 0 && (type === 'personal');
    const fromSeq = state.seq; // describe-us: finds the foul for its card
    // Deep wave: "Fouls drawn" — the foul says it was tracked, and who drew it (by id)
    const drawn = state.trackFoulsDrawn ? { fdt: true, drawnBy } : {};
    fire(foulAction(side, fouler, type, { ...drawn, ...(cat2 ? { cat2: true } : {}) }));
    if (dq && fouler) fireEject(side, fouler, dq);
    // describe-us DU1: the foul is on the board; "who was fouled?" is an
    // optional card after it (a player's foul, not a technical; live plays only)
    const ask = !!state.trackFoulsDrawn && !!fouler && !drawnBy && describesDrawn({ type: 'foul', foulType: type }) && !edit;
    if (ask) setFoulFor({ side, fromSeq });
    if (shots > 0) {
      const why = bonus ? `Bonus — ${teamOf(side)} are over the team-foul limit` : `${FOUL_LABEL[type]} foul on ${fouler?.fullName ?? teamOf(side)}`;
      setFlow({ kind: 'ft', side: opp(side), ...(ask ? { foulTrip: true as const } : {}), ...(drawnBy && type !== 'technical' ? { shooter: drawnBy } : {}), remaining: shots, total: shots, reason: `${why}${dq && fouler ? ` · ${fouler.fullName} disqualified` : ''} — ${shots} free throw${shots > 1 ? 's' : ''} for ${teamOf(opp(side))}${ball ? `, then ${teamOf(opp(side))} keep the ball (team foul ${teamFoulsThisQuarter(state, side) + 1})` : keep ? `, then ${teamOf(opp(side))} keep the ball (throw-in)` : ''}` });
    } else setFlow(null);
  };

  const recordRebound = (side: 'home' | 'away', player: Player, rt: ReboundType) => {
    fire(reboundAction(side, player, rt));
    setFlow(null);
  };

  // SD-29: by id, so minutes / +/- reach the right stat lines (IDs-only: no names)
  const recordSub = (side: 'home' | 'away', off: Player, on: Player) => {
    fire(subAction(side, off, on));
    setFlow(null);
  };

  const confirmFive = (side: 'home' | 'away', picked: string[]) => {
    dispatch(lineupAction(side, picked.map((id) => ({ id }))));
    setFlow(null);
  };

  // The active-flow panel (free throws / foul type / rebound off-def / sub / five).
  const renderFlow = () => {
    if (!flow) return null;
    const nm = teamOf(flow.side);
    const cancel = <Button label="Cancel" variant="ghost" onPress={() => setFlow(null)} />;
    if (flow.kind === 'ft') {
      const roster = courtOf(flow.side);
      // Count-aware mode: once the number of shots is known, each Made/Miss
      // auto-advances and the panel closes on the last shot — no "Done" tap.
      const counted = flow.remaining != null && flow.total != null;
      const shoot = (made: boolean) => {
        freeThrow(flow.side, made, flow.shooter);
        if (counted) {
          const left = (flow.remaining ?? 1) - 1;
          if (left <= 0) { setFlow(null); if (!made && !edit) setReboundFor({ shotSide: flow.side }); } // US batch 5: a missed last FT is live
          else setFlow({ ...flow, remaining: left });
        }
      };
      return (
        <View style={ctrl.editPanel}>
          <View style={ctrl.editHead}><Text style={ctrl.label}>Free throws — {nm}</Text>{cancel}</View>
          {flow.reason && <Text style={ctrl.editBanner}>{flow.reason}</Text>}
          {roster.length > 0 && (
            <>
              <Text style={ctrl.meta}>Shooter{flow.shooter ? `: ${flow.shooter.fullName}` : ' (optional)'}</Text>
              <View style={ctrl.chips}>
                {roster.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={flow.shooter?.id === p.id} disabled={fouledOut(p)}
                    onPress={() => setFlow({ ...flow, shooter: flow.shooter?.id === p.id ? undefined : p })} />
                ))}
              </View>
            </>
          )}
          {!counted ? (
            // Pick how many shots — then the panel counts them down for you.
            <>
              <Text style={ctrl.meta}>How many free throws?</Text>
              <View style={ctrl.row}>
                {[1, 2, 3].map((n) => (
                  <Button key={n} label={n === 1 ? '1 (and-one / tech)' : `${n} shots`} variant="ghost" style={ctrl.flex}
                    onPress={() => setFlow({ ...flow, remaining: n, total: n })} />
                ))}
              </View>
              <View style={ctrl.row}>
                <Button label="✅ Made +1" variant={flow.side} style={ctrl.flex} onPress={() => freeThrow(flow.side, true, flow.shooter)} />
                <Button label="❌ Miss" variant="ghost" style={ctrl.flex} onPress={() => freeThrow(flow.side, false, flow.shooter)} />
              </View>
              <Button variant="primary" label="Done" onPress={() => setFlow(null)} />
            </>
          ) : (
            <>
              {/* SD-117 (B11): the count is prefilled from the foul — change it before the first shot */}
              {flow.remaining === flow.total && (
                <View style={ctrl.chips}>
                  <Text style={ctrl.meta}>Shots:</Text>
                  {[1, 2, 3].map((n) => (
                    <SelectChip key={n} label={String(n)} active={flow.total === n} onPress={() => setFlow({ ...flow, remaining: n, total: n })} />
                  ))}
                </View>
              )}
              <Text style={ctrl.meta}>Shot {(flow.total ?? 1) - (flow.remaining ?? 1) + 1} of {flow.total} — tap the outcome</Text>
              <View style={ctrl.row}>
                <Button label="✅ Made +1" variant={flow.side} style={ctrl.flex} onPress={() => shoot(true)} />
                <Button label="❌ Miss" variant="ghost" style={ctrl.flex} onPress={() => shoot(false)} />
              </View>
            </>
          )}
        </View>
      );
    }
    if (flow.kind === 'foul') {
      const roster = courtOf(flow.side);
      return (
        <View style={ctrl.editPanel}>
          <View style={ctrl.editHead}><Text style={ctrl.label}>{flow.team ? 'Team foul' : 'Foul'} — {nm}</Text>{cancel}</View>
          {flow.team ? (
            <>
              <Text style={ctrl.meta}>What kind of foul? (no player — it counts toward {nm}’s team fouls)</Text>
              <View style={ctrl.chips}>
                {TEAM_FOUL_TYPES.map((t) => (
                  <SelectChip key={t} label={FOUL_LABEL[t]} active={false} onPress={() => void recordFoul(flow.side, null, t, null)} />
                ))}
              </View>
              {/* US batch 6 (FIBA Art. 36.3): technicals charged to the head coach — 1 free throw, not a team foul */}
              <Text style={ctrl.meta}>Coach / bench technical (charged to the head coach{(() => { const ct = coachTechnicals(state, flow.side); return ct.c + ct.b ? ` · so far C ${ct.c} · B ${ct.b}` : ''; })()}):</Text>
              <View style={ctrl.chips}>
                <SelectChip label="Coach tech (C)" accessibilityLabel={`Coach technical, ${nm}`} active={false} onPress={() => void recordFoul(flow.side, null, 'technical', null, 'C')} />
                <SelectChip label="Bench tech (B)" accessibilityLabel={`Bench technical, ${nm}`} active={false} onPress={() => void recordFoul(flow.side, null, 'technical', null, 'B')} />
              </View>
            </>
          ) : !flow.fouler ? (
            <>
              <Text style={ctrl.meta}>Who committed it?</Text>
              <View style={ctrl.chips}>
                {roster.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={false} disabled={fouledOut(p)} onPress={() => setFlow({ ...flow, fouler: p })} />
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={ctrl.meta}>{flow.fouler.fullName} — what kind of foul?</Text>
              <View style={ctrl.chips}>
                {FOUL_CHOICES.map((c) => (
                  <SelectChip key={c.key} label={c.label} active={false}
                    onPress={() => void recordFoul(flow.side, flow.fouler!, c.type, undefined, undefined, c.cat2)} />
                ))}
              </View>
              <Text style={ctrl.meta}>Free throws open next with the count filled in: technical 1; shooting, disruptive, flagrant, D 2; a personal foul in the bonus 2. A D foul, or any two of technical (behaviour) / flagrant, disqualifies (asks first). Disruptive fouls and delay / ring technicals never do (FIBA 2026).</Text>
              {/* SD-116 (B2): ejecting is a separate, confirmed step — set well
                  apart from the foul-type chips so a slip can't disqualify. */}
              <View style={ctrl.ejectZone}>
                <Text style={ctrl.meta}>Not a foul to log — sending the player off?</Text>
                <Button label={`🟥 Eject ${flow.fouler.fullName}…`} variant="ghost"
                  onPress={() => void eject(flow.side, flow.fouler!)} />
              </View>
            </>
          )}
        </View>
      );
    }
    if (flow.kind === 'act') {
      // SD-117 (B3): the player is already picked — one labelled tap logs the stat.
      const { side, player } = flow;
      const one = (type: StatPlay) => { stat(side, type, player); setFlow(null); };
      return (
        <View style={ctrl.editPanel}>
          <View style={ctrl.editHead}><Text style={ctrl.label} numberOfLines={1}>📋 {player.fullName} — {nm}</Text>{cancel}</View>
          <View style={ctrl.row}>
            <Button label="⏬ Def. rebound" variant={side} style={ctrl.flex} onPress={() => recordRebound(side, player, 'def')} />
            <Button label="⏫ Off. rebound" variant="ghost" style={ctrl.flex} onPress={() => recordRebound(side, player, 'off')} />
          </View>
          <View style={ctrl.row}>
            <Button label="🅰️ Assist" variant="ghost" style={ctrl.flex} onPress={() => one('ASSIST')} />
            {/* US batch 5: a steal is the other side's turnover; "Who lost it?" follows (optional) */}
            <Button label="✋ Steal" variant="ghost" style={ctrl.flex} onPress={() => { const from = state.seq; fire(stealAction(side, player)); setFlow(null); setStealFor({ side, fromSeq: from }); }} />
          </View>
          <View style={ctrl.row}>
            {/* US batch 5: a block is the other side's missed shot; "Whose shot?" follows (optional, misses tracked) */}
            <Button label="🛡️ Block" variant="ghost" style={ctrl.flex} onPress={() => { const from = state.seq; fire(blockAction(side, player)); setFlow(null); if (tracking) setBlockFor({ side, fromSeq: from }); }} />
            <Button label="🔄 Turnover" variant="ghost" style={ctrl.flex} onPress={() => one('TURNOVER')} />
          </View>
          {/* US batch 5: or the turnover's kind — still one tap */}
          <View style={ctrl.chips}>
            <Text style={ctrl.meta}>Turnover:</Text>
            {PLAYER_TO_TYPES.map((t) => (
              <SelectChip key={t} label={TO_LABEL[t]} active={false} accessibilityLabel={`Turnover, ${TO_LABEL[t]}`} onPress={() => { fire(turnoverAction(side, player, { toType: t })); setFlow(null); }} />
            ))}
          </View>
          <Button label="🟨 Foul…" variant="ghost" onPress={() => setFlow({ kind: 'foul', side, fouler: player })} />
        </View>
      );
    }
    if (flow.kind === 'rebound') {
      return (
        <View style={ctrl.editPanel}>
          <View style={ctrl.editHead}><Text style={ctrl.label}>Rebound — {flow.player.fullName}</Text>{cancel}</View>
          <View style={ctrl.row}>
            <Button label="Defensive" variant={flow.side} style={ctrl.flex} onPress={() => recordRebound(flow.side, flow.player, 'def')} />
            <Button label="Offensive" variant="ghost" style={ctrl.flex} onPress={() => recordRebound(flow.side, flow.player, 'off')} />
          </View>
        </View>
      );
    }
    if (flow.kind === 'sub') {
      const roster = rosterOf(flow.side);
      // IDs-only scoring: the players by id (the chips show the squad's names)
      const five = onCourtPlayers(flow.side);
      const offOptions = five ?? roster;
      const bench = five ? roster.filter((p) => !five.some((x) => x.id === p.id)) : roster.filter((p) => p.id !== flow.off?.id);
      return (
        <View style={ctrl.editPanel}>
          <View style={ctrl.editHead}><Text style={ctrl.label}>Substitution — {nm}</Text>{cancel}</View>
          {!flow.off ? (
            <>
              <Text style={ctrl.meta}>Who comes off?</Text>
              <View style={ctrl.chips}>
                {offOptions.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => setFlow({ ...flow, off: p })} />
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={ctrl.meta}>Who comes on for {flow.off.fullName}?</Text>
              <View style={ctrl.chips}>
                {bench.length > 0 ? bench.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => recordSub(flow.side, flow.off!, p)} />
                )) : <Text style={ctrl.meta}>No bench players available.</Text>}
              </View>
            </>
          )}
        </View>
      );
    }
    // setFive — pick who starts on court (by id)
    const roster = rosterOf(flow.side);
    const toggle = (id: string) => setFlow({ ...flow, picked: flow.picked.includes(id) ? flow.picked.filter((x) => x !== id) : [...flow.picked, id] });
    return (
      <View style={ctrl.editPanel}>
        <View style={ctrl.editHead}><Text style={ctrl.label}>On court — {nm}</Text>{cancel}</View>
        <Text style={ctrl.meta}>Tap the {state.regPeriods === 1 ? '' : 'five '}players starting on court.</Text>
        <View style={ctrl.chips}>
          {roster.map((p) => (
            <SelectChip key={p.id} label={p.fullName} active={flow.picked.includes(p.id)} onPress={() => toggle(p.id)} />
          ))}
        </View>
        <Button variant="primary" label={`Confirm (${flow.picked.length})`} disabled={flow.picked.length === 0} onPress={() => confirmFive(flow.side, flow.picked)} />
      </View>
    );
  };

  // Foul-out enforcement (format: foulsToFoulOut). A disqualified player is
  // greyed out everywhere and can't be credited further actions.
  // "Out" = fouled out OR ejected — both grey the player out and block credit.
  // SD-122: checked per side (and id), so a same-named opponent isn't greyed out.
  const whoOf = (p: Player) => ({ side: (homeRoster.some((h) => h.id === p.id) ? 'home' : 'away') as 'home' | 'away', pid: p.id });
  const fouledOut = (p: Player) => isPlayerOut(state, p.fullName, whoOf(p));
  const outNames = [...homeRoster, ...awayRoster].filter(fouledOut)
    .map((p) => `${p.fullName}${isEjected(state, p.fullName, whoOf(p)) ? ' (ejected)' : ''}`);
  // Team-foul bonus (format: foulsForBonus): once a side has committed that many
  // team fouls in a period, the opponent shoots free throws on every further foul
  // (FIBA: from the 5th). Under FIBA, overtime fouls count with the last quarter.
  const homeBonus = inBonus(state, 'home');
  const awayBonus = inBonus(state, 'away');
  const homeTF = teamFoulsThisQuarter(state, 'home');
  const awayTF = teamFoulsThisQuarter(state, 'away');
  const foulPeriod = state.quarter > state.regPeriods && state.otFoulsCarry
    ? `${periodLabel(state.quarter, state.regPeriods)} (carried from ${periodLabel(state.regPeriods, state.regPeriods)})`
    : periodLabel(state.quarter, state.regPeriods);

  // Shown while any overtime period is live (quarter 5+).
  const otBanner = state.quarter > state.regPeriods ? (
    <View style={ctrl.otBanner}>
      <Text style={ctrl.otTitle}>🏀 OVERTIME{state.quarter > 5 ? ` ${state.quarter - 4}` : ''}</Text>
      <Text style={ctrl.otMeta}>{state.otTarget ? `First to score ${state.otTarget} points in overtime wins (FIBA 3×3) · ${state.home}–${state.away}` : `${state.overtimeMinutes}-minute period · score carries over · still level ⇒ another OT`}</Text>
    </View>
  ) : null;

  if (!state.startedAt && !state.ended && !edit) {
    return (
      <View style={{ gap: theme.spacing(3) }}>
        {otBanner}
        <Text style={ctrl.meta}>Tip off {periodLabel(state.quarter, state.regPeriods)} to start the {timedPeriod(state) ? `game clock (${clockText(clockLeft(state))})` : 'clock'}.</Text>
        <Button variant="primary" label={`▶ Start ${periodLabel(state.quarter, state.regPeriods)}`} onPress={() => dispatch({ type: 'KICKOFF', payload: { at: Date.now() } })} />
      </View>
    );
  }

  // In-place edit of one past play: re-pick the player (and points, for a basket)
  // stamped at the original moment. The old play was already reversed on entry.
  if (edit) {
    const roster = edit.side === 'home' ? homeRoster : awayRoster;
    const nm = edit.side === 'home' ? homeName : awayName;
    return (
      <View style={ctrl.editPanel}>
        <View style={ctrl.editHead}>
          <Text style={ctrl.label}>Re-enter {BB_META[edit.type].label} — {nm}</Text>
          <Button label="Cancel" variant="ghost" onPress={cancelEdit} />
        </View>
        <Text style={ctrl.editBanner}>Re-entering the Q{edit.quarter} {edit.minute}&apos; moment — your pick replaces the old one.</Text>
        <Text style={ctrl.meta}>{edit.type === 'score' ? 'Who scored?' : 'Which player?'}</Text>
        <View style={ctrl.chips}>
          {roster.map((p) => (
            <SelectChip key={p.id} label={p.fullName} active={editSel?.id === p.id} disabled={fouledOut(p)}
              onPress={() => (edit.type === 'score' ? setEditSel(p) : commitEdit(p))} />
          ))}
        </View>
        {edit.type === 'score' && editSel && (
          <View style={ctrl.row}>
            {pointValues.map((n) => (
              <Button key={n} label={`+${n}`} variant={edit.side} style={ctrl.flex} onPress={() => commitEdit(editSel, n)} />
            ))}
          </View>
        )}
        {/* Deep wave: a charted basket can be re-entered with its zone */}
        {edit.type === 'score' && editSel && (scoringLayout(state) === 'zones' || edit.zone) && (
          <View style={ctrl.chips}>
            {ZONE_BTN.map((b) => (
              <SelectChip key={b.zone} label={`+${zoneValue(b.zone)} ${b.short}`} accessibilityLabel={`${zoneValue(b.zone)} points ${b.long}`} active={edit.zone === b.zone}
                onPress={() => commitEdit(editSel, zoneValue(b.zone), b.zone)} />
            ))}
          </View>
        )}
      </View>
    );
  }

  // SD-114: pinned at the top of the controls while backfilling.
  const backfillBar = backfillQ != null
    ? <BackfillBar at={periodLabel(backfillQ, state.regPeriods)} onLive={() => setBackfillQ(null)} /> : null;

  // describe-us DU1 / DU12: "who was fouled?" — the foul is already on the
  // board. Under the pads, and above its own free throws, where the pick also
  // names the shooter until the first shot (the one-step flow's pre-pick).
  const foulCardEl = (() => {
    if (!foulFor || foulFor.ref == null) return null;
    const { foul, drawnPid, drawn } = foulCard(state, foulFor.ref);
    if (!foul || !describesDrawn(foul)) return null;
    const key = `f${foulFor.fromSeq}`;
    const fouled = opp(foul.side);
    const summary = drawnPid || drawn ? `Fouled: ${pName(drawnPid, drawn)}` : '';
    const pickDrawn = (p: Player) => {
      if (drawnPid === p.id) { dispatch(foulDrawnAction(foul.side, foul.id, null)); return; }
      dispatch(foulDrawnAction(foul.side, foul.id, p));
      if (flow?.kind === 'ft' && flow.foulTrip && !flow.shooter && flow.remaining === flow.total) setFlow({ ...flow, shooter: p });
    };
    return (
      <DescribeCard title={`Last foul · ${FOUL_LABEL[foul.foulType ?? 'personal']} on ${pName(foul.pid, foul.playerName)} — who was fouled? (${teamOf(fouled)})`}
        summary={summary} mode={marks.modeOf(key)} onDone={() => marks.mark(key, 'done')} onSkip={() => marks.mark(key, 'skipped')} onEdit={() => marks.mark(key, null)}>
        <View style={ctrl.chips}>
          {/* DU11: a player who is out can't be named */}
          {courtOf(fouled).filter((p) => !fouledOut(p)).map((p) => (
            <SelectChip key={p.id} label={p.fullName} active={drawnPid === p.id} accessibilityLabel={`Fouled: ${p.fullName}`} onPress={() => pickDrawn(p)} />
          ))}
        </View>
      </DescribeCard>
    );
  })();

  // A capture is mid-flow (free throws, foul type, rebound off/def, sub, five).
  if (flow) {
    const panel = flow.kind === 'ft' && flow.foulTrip && foulCardEl ? <View style={{ gap: theme.spacing(3) }}>{foulCardEl}{renderFlow()}</View> : renderFlow();
    return backfillBar ? <View style={{ gap: theme.spacing(3) }}>{backfillBar}{panel}</View> : panel;
  }

  // SD-57: timeouts left in the current window (FIBA 2 / 3 / 1 per OT, NBA,
  // or a per-game count; null = not tracked), at the moment the play is stamped.
  const toStatus = (side: 'home' | 'away') => timeoutStatus(state, side, stampFor());
  const timeoutLabel = (side: 'home' | 'away') => {
    const left = toStatus(side).left;
    return left == null ? `⏱️ Timeout — ${teamOf(side)}` : `⏱️ Timeout — ${teamOf(side)} (${left})`;
  };
  // Over the allowance: asked first (the clock is the scorer's, so it's a
  // warning, not a block) — "No" keeps scoring.
  const callTimeout = async (side: 'home' | 'away') => {
    const t = toStatus(side);
    if (t.left != null && t.left <= 0) {
      const why = t.late
        ? `${teamOf(side)} have used the most allowed in the last minutes of ${periodLabel(state.regPeriods, state.regPeriods)}.`
        : t.window === 'game'
          ? `${teamOf(side)} have used all ${t.allowance} timeout${t.allowance === 1 ? '' : 's'}.`
          : `${teamOf(side)} have used their ${t.allowance} for the ${t.window} — unused timeouts don't carry over.`;
      if (!(await askConfirm({ title: 'No timeouts left', message: `${why} Log one anyway?`, yesLabel: 'Log anyway', noLabel: 'No, keep scoring', tone: 'caution' }))) return;
    }
    fire({ type: 'TIMEOUT', side });
  };
  const toLine = (['home', 'away'] as const).map((side) => ({ side, t: toStatus(side) }));
  const toTracked = toLine.some(({ t }) => t.left != null);

  // Court-team round 2: the zone buttons are the default layout for new
  // matches (BB_TRACK_DEFAULTS); a match whose format lacks the key — every
  // older one — keeps the plain +2 / +3 row it was scored with.
  const zones = scoringLayout(state) === 'zones';
  const ScoreSide = ({ side, name, variant }: { side: 'home' | 'away'; name: string; variant: 'home' | 'away' }) => {
    const roster = courtOf(side);
    const selected = sel[side];
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Basket — {name}{selected ? ` · for ${selected.fullName}` : ''}</Text>
        {roster.length > 0 && !selected ? <Text style={ctrl.meta}>Tap the scorer first — or the basket goes to the team.</Text> : null}
        {roster.length > 0 && (
          <View style={ctrl.chips}>
            {roster.map((p) => (
              <SelectChip key={p.id} label={fouledOut(p) ? `${p.fullName} 🚫` : p.fullName} active={selected?.id === p.id} disabled={fouledOut(p)}
                onPress={() => setSel((s) => ({ ...s, [side]: selected?.id === p.id ? undefined : p }))} />
            ))}
          </View>
        )}
        {zones ? (
          // Deep wave — "Shot zones": every make / miss is still ONE tap, on the
          // zone it came from (inside the arc 2, behind it 3; half-court 1 / 2).
          // The and-one moves to the box after the basket.
          <>
            <View style={ctrl.row}>
              {!halfCourt && <Button label="+1 FT" variant={variant} style={ctrl.flex} onPress={() => { clearSel(side); freeThrow(side, true, selected); }} />}
              {ZONE_BTN.slice(0, 2).map((b) => (
                <Button key={b.zone} label={`+${zoneValue(b.zone)} ${b.short}`} accessibilityLabel={`${zoneValue(b.zone)} points ${b.long}, ${name}`} variant={variant} style={ctrl.flex}
                  onPress={() => score(side, zoneValue(b.zone), selected, tracking, { zone: b.zone })} />
              ))}
            </View>
            <View style={ctrl.row}>
              {ZONE_BTN.slice(2).map((b) => (
                <Button key={b.zone} label={`+${zoneValue(b.zone)} ${b.short}`} accessibilityLabel={`${zoneValue(b.zone)} points ${b.long}, ${name}`} variant={variant} style={ctrl.flex}
                  onPress={() => score(side, zoneValue(b.zone), selected, tracking, { zone: b.zone })} />
              ))}
            </View>
            {tracking && (
              <View style={ctrl.row}>
                {ZONE_BTN.map((b) => (
                  <Button key={b.zone} label={`⭕ ${b.short}`} accessibilityLabel={`Missed ${zoneValue(b.zone)}-pointer ${b.long}, ${name}`} variant="ghost" style={ctrl.flex}
                    onPress={() => miss(side, zoneValue(b.zone), selected, b.zone)} />
                ))}
              </View>
            )}
          </>
        ) : (
          <>
        <View style={ctrl.row}>
          {/* SD-05: in a full-court game the only 1-point play is a free throw, so
              "+1 FT" logs a made free throw (FTM/FTA counted), not a 1-pt basket. */}
          {pointValues.map((n) => (
            !halfCourt && n === 1
              ? <Button key={n} label="+1 FT" variant={variant} style={ctrl.flex} onPress={() => { clearSel(side); freeThrow(side, true, selected); }} />
              : <Button key={n} label={`+${n}`} variant={variant} style={ctrl.flex} onPress={() => score(side, n)} />
          ))}
        </View>
        {/* SD-31: missed field goals — one tap, the selected player optional. */}
        {tracking && (
          <View style={ctrl.row}>
            {(halfCourt ? [1, 2] : [2, 3]).map((n) => (
              <Button key={n} label={`⭕ Miss ${n}`} variant="ghost" style={ctrl.flex} onPress={() => miss(side, n)} />
            ))}
          </View>
        )}
        {/* And-one: score the basket AND open the bonus free throw for the scorer.
            SD-117 (B10): a 3 + 1 too (half-court: 1 + 1 and 2 + 1). */}
        <View style={ctrl.row}>
          {(halfCourt ? [1, 2] : [2, 3]).map((n) => (
            <Button key={n} label={`🔗 And-one +${n}`} variant="ghost" style={ctrl.flex}
              onPress={() => { score(side, n); setFlow({ kind: 'ft', side, shooter: selected, remaining: 1, total: 1, reason: `And-one — +${n} and the bonus free throw` }); }} />
          ))}
        </View>
          </>
        )}
      </View>
    );
  };

  // SD-132: the stoppable game clock (FIBA Art. 49) — its own component, so
  // only the clock re-renders each second (the scoring buttons stay put).
  const endQuarter = async () => {
    if (await confirmMatchAction('endPeriod', { period: periodLabel(state.quarter, state.regPeriods), score: `${state.home}-${state.away}` })) dispatch({ type: 'NEXT_QUARTER' });
  };
  const clockPanel = timedPeriod(state) && backfillQ == null
    ? <GameClockPanel state={state} dispatch={dispatch} teamOf={teamOf} onEndQuarter={() => void endQuarter()} /> : null;

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {backfillBar}
      {clockPanel}
      {otBanner}
      {outNames.length > 0 && (
        <Text style={ctrl.fouledOut}>🚫 Out: {outNames.join(', ')}</Text>
      )}
      {state.foulsForBonus > 0 && (
        <Text style={ctrl.meta}>Team fouls {foulPeriod} · {homeName} {homeTF} · {awayName} {awayTF}{state.ladder3x3 ? ' · 3×3: fouls 7–9 give 2 free throws, 10+ give 2 free throws and the ball' : ''}</Text>
      )}
      {homeBonus && (
        <Text style={ctrl.bonus}>🎯 BONUS · {homeName} shoots free throws on every foul ({awayName}: {awayTF} team fouls)</Text>
      )}
      {awayBonus && (
        <Text style={ctrl.bonus}>🎯 BONUS · {awayName} shoots free throws on every foul ({homeName}: {homeTF} team fouls)</Text>
      )}
      <ScoreSide side="home" name={homeName} variant="home" />
      <ScoreSide side="away" name={awayName} variant="away" />
      {/* MVP B4: below the pads, so they never move when it opens or closes */}
      {/* SD-117 (B6): "Assist?" right after a make — the on-court teammates, or Skip */}
      {assistFor && (() => {
        const mates = courtOf(assistFor.side).filter((p) => p.id !== assistFor.scorer?.id && !fouledOut(p));
        // Deep wave: ⚡ Fast break (tags this basket) and, with Shot zones on, 🔗 And-one
        const fbOn = state.trackFastBreak === true;
        const andOne = zones;
        if (!mates.length && !fbOn && !andOne) return null;
        const who = assistFor.scorer ? assistFor.scorer.fullName : teamOf(assistFor.side);
        // describe-us (US-DON-3): the shared card — the detail read from the log,
        // each tap saved at once on THIS basket (by its id, DU8), Done / Skip under it
        const ref = assistFor.ref;
        const got = ref != null ? assistCard(state, ref) : { assist: undefined, fb: false };
        const key = `b${assistFor.fromSeq}`;
        const summary = [got.assist && `Assist: ${pName(got.assist.pid, got.assist.playerName)}`, got.fb && 'Fast break'].filter(Boolean).join(' · ');
        // DU13: one assist per basket — a re-tap clears it, another player replaces it
        const pickAssist = (p: Player) => {
          if (ref == null) return;
          if (got.assist) dispatch(removal(got.assist));
          if (got.assist?.pid !== p.id) dispatch(stamped(statAction(assistFor.side, 'ASSIST', p, ref)));
        };
        const toggleFb = () => { if (ref != null) dispatch(tagAction(assistFor.side, ref, !got.fb)); };
        return (
          <DescribeCard title={`Last basket · ${who} +${assistFor.points}${mates.length ? ' — assist?' : ''}`}
            summary={summary} mode={marks.modeOf(key)} onDone={() => marks.mark(key, 'done')} onSkip={() => marks.mark(key, 'skipped')} onEdit={() => marks.mark(key, null)}>
            {mates.length > 0 && (
              <View style={ctrl.chips}>
                {mates.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} accessibilityLabel={`Assist: ${p.fullName}`} active={got.assist?.pid === p.id} disabled={ref == null} onPress={() => pickAssist(p)} />
                ))}
              </View>
            )}
            {(fbOn || andOne) && (
              <View style={ctrl.chips}>
                {fbOn && (
                  <SelectChip label="⚡ Fast break" accessibilityLabel="Fast break: tag this basket" active={got.fb} disabled={ref == null} onPress={toggleFb} />
                )}
                {andOne && (
                  <SelectChip label="🔗 And-one" accessibilityLabel="And-one: log the bonus free throw" active={false}
                    onPress={() => { setAssistFor(null); setFlow({ kind: 'ft', side: assistFor.side, shooter: assistFor.scorer, remaining: 1, total: 1, reason: `And-one — +${assistFor.points} and the bonus free throw` }); }} />
                )}
              </View>
            )}
          </DescribeCard>
        );
      })()}

      {/* US batch 5: "Rebound?" after a miss — the defence (or a team rebound), else the offence; Skip keeps scoring */}
      {reboundFor && (() => {
        const def = opp(reboundFor.shotSide);
        const offSide = reboundFor.shotSide;
        return (
          <View style={ctrl.assistBox}>
            <View style={ctrl.editHead}>
              <IconText label="⏬ Rebound?" style={[ctrl.label, ctrl.flex]} />
              <Button label="Skip" variant="ghost" onPress={() => setReboundFor(null)} />
            </View>
            <View style={ctrl.chips}>
              <Text style={ctrl.meta}>Def. — {teamOf(def)}:</Text>
              {courtOf(def).filter((p) => !fouledOut(p)).map((p) => (
                <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => fire(reboundAction(def, p, 'def'))} />
              ))}
              <SelectChip label="Team" accessibilityLabel={`Defensive team rebound, ${teamOf(def)}`} active={false} onPress={() => fire(teamReboundAction(def, 'def'))} />
            </View>
            <View style={ctrl.chips}>
              <Text style={ctrl.meta}>Off. — {teamOf(offSide)}:</Text>
              {courtOf(offSide).filter((p) => !fouledOut(p)).map((p) => (
                <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => fire(reboundAction(offSide, p, 'off'))} />
              ))}
              <SelectChip label="Team" accessibilityLabel={`Offensive team rebound, ${teamOf(offSide)}`} active={false} onPress={() => fire(teamReboundAction(offSide, 'off'))} />
            </View>
          </View>
        );
      })()}
      {/* US batch 5: "Who lost it?" after a steal — names the other side's ball-handler (the turnover already counts) */}
      {stealFor && stealFor.ref != null && (
        <View style={ctrl.assistBox}>
          <View style={ctrl.editHead}>
            <Text style={[ctrl.label, ctrl.flex]}>✋ Steal — who lost it? ({teamOf(opp(stealFor.side))})</Text>
            <Button label="Skip" variant="ghost" onPress={() => setStealFor(null)} />
          </View>
          <View style={ctrl.chips}>
            {courtOf(opp(stealFor.side)).filter((p) => !fouledOut(p)).map((p) => (
              <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => fire(turnoverAction(opp(stealFor.side), p, { ref: stealFor.ref }))} />
            ))}
          </View>
        </View>
      )}
      {/* US batch 5: "Whose shot?" after a block — names the shooter (the missed shot already counts) */}
      {/* describe-us (US-DON-5): the shared card; a re-tap clears, another shooter (or the 3-pt toggle) replaces it */}
      {blockFor && blockFor.ref != null && (() => {
        const ref = blockFor.ref;
        const { block, shot } = blockCard(state, ref);
        if (!block) return null;
        const shooterSide = opp(blockFor.side);
        const key = `k${blockFor.fromSeq}`;
        const three = blockFor.three === true;
        const pts = (t: boolean) => (t ? 3 : halfCourt ? 1 : 2);
        const logShot = (p: { id: string }, t: boolean) => dispatch(stamped(missAction(shooterSide, pts(t), p, undefined, ref)));
        const pickShooter = (p: Player) => {
          if (shot) dispatch(removal(shot));
          if (shot?.pid !== p.id) logShot(p, three);
        };
        const toggleThree = () => {
          setBlockFor({ ...blockFor, three: !three });
          if (shot?.pid) { dispatch(removal(shot)); logShot({ id: shot.pid }, !three); }
        };
        const summary = shot ? `Shot by ${pName(shot.pid, shot.playerName)}${shot.points === 3 ? ' (3-pt try)' : ''}` : '';
        return (
          <DescribeCard title={`Last block · ${pName(block.pid, block.playerName)} — whose shot? (${teamOf(shooterSide)})`}
            summary={summary} mode={marks.modeOf(key)} onDone={() => marks.mark(key, 'done')} onSkip={() => marks.mark(key, 'skipped')} onEdit={() => marks.mark(key, null)}>
            <View style={ctrl.chips}>
              {!halfCourt && <SelectChip label="3-pt try" active={three} onPress={toggleThree} />}
              {courtOf(shooterSide).filter((p) => !fouledOut(p)).map((p) => (
                <SelectChip key={p.id} label={p.fullName} accessibilityLabel={`Shot by ${p.fullName}`} active={shot?.pid === p.id} onPress={() => pickShooter(p)} />
              ))}
            </View>
          </DescribeCard>
        );
      })()}
      {foulCardEl}

      {/* Free throws — always available: shooting foul, and-one, technical, bonus. */}
      <View style={ctrl.row}>
        <Button label={`🎯 Free throws — ${homeName}`} variant="home" style={ctrl.flex} onPress={() => setFlow({ kind: 'ft', side: 'home' })} />
        <Button label={`🎯 Free throws — ${awayName}`} variant="away" style={ctrl.flex} onPress={() => setFlow({ kind: 'ft', side: 'away' })} />
      </View>
      {/* US batch 6: jump ball / held ball — the opening tip, then the arrow (FIBA) or a jump (NBA) */}
      {(() => {
        const arrow = arrowSide(state);
        const tipped = state.events.some((e) => e.type === 'jump');
        if (state.possArrow === true && tipped && arrow) {
          return (
            <View style={ctrl.chips} accessibilityLabel="Held ball and the possession arrow">
              <Text style={ctrl.meta}>Possession arrow → {teamOf(arrow)}</Text>
              <SelectChip label={`Held ball → ${teamOf(arrow)}`} accessibilityLabel={`Held ball: ${teamOf(arrow)} ball by the arrow`} active={false} onPress={() => fire(jumpBallAction(arrow, true))} />
            </View>
          );
        }
        return (
          <View style={ctrl.chips} accessibilityLabel={tipped ? 'Held ball: who won the jump' : 'Opening tip: who won it'}>
            <Text style={ctrl.meta}>{tipped ? 'Held ball — jump won by:' : 'Jump ball (tip-off) won by:'}</Text>
            {(['home', 'away'] as const).map((sd) => (
              <SelectChip key={sd} label={teamOf(sd)} active={false} onPress={() => fire(jumpBallAction(sd, tipped))} />
            ))}
          </View>
        );
      })()}
      {(['home', 'away'] as const).map((sd) => { const dq = coachDisqualified(state, sd); return dq ? <Text key={`cdq-${sd}`} style={ctrl.fouledOut}>Coach disqualified — {teamOf(sd)} ({dq === '2C' ? '2 coach technicals' : '3 bench / coach technicals'})</Text> : null; })}
      {/* MVP B7: a foul with no player (pickup games, no roster) — team fouls and the bonus still work */}
      <View style={ctrl.row}>
        <Button label={`🟨 Team foul — ${homeName}`} variant="ghost" style={ctrl.flex} onPress={() => setFlow({ kind: 'foul', side: 'home', team: true })} />
        <Button label={`🟨 Team foul — ${awayName}`} variant="ghost" style={ctrl.flex} onPress={() => setFlow({ kind: 'foul', side: 'away', team: true })} />
      </View>

      {/* SD-117 (B3): one row per side — tap the player, then the action
          (rebound / assist / steal / block / turnover / foul) in a labelled panel. */}
      {(['home', 'away'] as const).map((side) => (
        <Row key={side} label={`📋 Rebound · assist · steal · block · TO · foul — ${teamOf(side)}`} roster={courtOf(side)}
          onPick={(p) => setFlow({ kind: 'act', side, player: p })} disabledFor={fouledOut} />
      ))}
      <Text style={ctrl.meta}>Tap the player first, then pick what they did.</Text>
      {/* US batch 5: plays with no player — FIBA team rebounds, team turnovers (shot clock 24 s, 8 s, 5 s) */}
      {(['home', 'away'] as const).map((side) => (
        <View key={`team-${side}`} style={ctrl.chips} accessibilityLabel={`Team plays, ${teamOf(side)}`}>
          <Text style={ctrl.meta}>Team — {teamOf(side)}:</Text>
          <SelectChip label="⏬ Team rebound" active={false} onPress={() => fire(teamReboundAction(side))} />
          <SelectChip label="⏱️ Shot clock" accessibilityLabel={`Shot-clock violation, ${teamOf(side)}`} active={false} onPress={() => fire(turnoverAction(side, null, { toType: '24s' }))} />
          {TEAM_TO_TYPES.map((t) => (
            <SelectChip key={t} label={TO_LABEL[t]} accessibilityLabel={`Team turnover, ${TO_LABEL[t]}, ${teamOf(side)}`} active={false} onPress={() => fire(turnoverAction(side, null, { toType: t }))} />
          ))}
          <SelectChip label="🔄 Team TO" active={false} onPress={() => fire(turnoverAction(side, null))} />
        </View>
      ))}

      {/* Timeouts — SD-57: what's left in this half / OT, per team */}
      {toTracked && (
        <Text style={ctrl.meta} accessibilityLabel="Timeouts left">
          ⏱️ Timeouts left{toLine[0].t.window !== 'game' ? ` (${toLine[0].t.window})` : ''}: {homeName} {toLine[0].t.left} · {awayName} {toLine[1].t.left}
          {toLine.some(({ t }) => t.late) ? ' · last-minutes limit' : ''}
        </Text>
      )}
      <View style={ctrl.row}>
        <Button label={timeoutLabel('home')} variant="ghost" style={ctrl.flex} onPress={() => void callTimeout('home')} />
        <Button label={timeoutLabel('away')} variant="ghost" style={ctrl.flex} onPress={() => void callTimeout('away')} />
      </View>

      {/* Substitutions — optional on-court tracking */}
      <View style={{ gap: theme.spacing(2) }}>
        <View style={ctrl.editHead}>
          <Text style={ctrl.label}>Substitutions</Text>
          <Button label={showSubs ? 'Done' : 'Manage'} variant="ghost" onPress={() => setShowSubs((v) => !v)} />
        </View>
        {showSubs && (['home', 'away'] as const).map((side) => {
          const five = onCourtPlayers(side);
          return (
            <View key={side} style={ctrl.addedBox}>
              <Text style={ctrl.label}>{teamOf(side)}</Text>
              {five ? (
                <>
                  <Text style={ctrl.meta}>On court: {five.map((p) => p.fullName).join(', ') || '—'}</Text>
                  <View style={ctrl.row}>
                    <Button label="🔀 Substitute" variant="ghost" style={ctrl.flex} onPress={() => setFlow({ kind: 'sub', side })} />
                    <Button label="Edit five" variant="ghost" style={ctrl.flex} onPress={() => setFlow({ kind: 'setFive', side, picked: five.map((p) => p.id) })} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={ctrl.meta}>Set who&apos;s on court to track subs live — or just log a quick sub.</Text>
                  <View style={ctrl.row}>
                    <Button label="Set five" variant="ghost" style={ctrl.flex} onPress={() => setFlow({ kind: 'setFive', side, picked: [] })} />
                    <Button label="🔀 Quick sub" variant="ghost" style={ctrl.flex} onPress={() => setFlow({ kind: 'sub', side })} />
                  </View>
                </>
              )}
            </View>
          );
        })}
      </View>

      {/* ⏪ Backfill a play the scorer missed earlier — stamp it into a past quarter. */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Backfill a missed play</Text>
        {backfillQ == null ? (
          <>
            <Text style={ctrl.meta}>Missed a basket or foul earlier? Pick the quarter — everything you log is stamped there until you go back to live.</Text>
            <View style={ctrl.chips}>
              {Array.from({ length: Math.min(state.quarter, 8) }, (_, i) => i + 1).map((q) => (
                <SelectChip key={q} label={periodLabel(q, state.regPeriods)} active={false} onPress={() => setBackfillQ(q)} />
              ))}
            </View>
          </>
        ) : (
          <View style={ctrl.addedBox}>
            <Text style={ctrl.label}>Backfilling into {periodLabel(backfillQ, state.regPeriods)}</Text>
            <Text style={ctrl.meta}>Every play you log now is stamped in {periodLabel(backfillQ, state.regPeriods)}. Log it above, then go back to live.</Text>
            <Button label="Back to live scoring" variant="ghost" onPress={() => setBackfillQ(null)} />
          </View>
        )}
      </View>

      {/* 🗓 Correct the timeline — remove or edit one specific past play. */}
      {state.events.length > 0 && (
        <View style={{ gap: theme.spacing(2) }}>
          <View style={ctrl.editHead}>
            <Text style={ctrl.label}>Correct the timeline</Text>
            <Button label={showEdit ? 'Done' : 'Edit'} variant="ghost" onPress={() => setShowEdit((v) => !v)} />
          </View>
          {showEdit && (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={ctrl.meta}>Tap ✎ Edit to re-pick the player/points (stamped at the same moment — every tally re-adjusts; Cancel keeps it as it was), or ✕ to remove it (asks first).</Text>
              {[...state.events].sort((a, b) => b.quarter - a.quarter || b.minute - a.minute || b.id - a.id).map((e) => (
                <View key={e.id} style={ctrl.editRow}>
                  <Text style={ctrl.editMin}>{periodLabel(e.quarter, state.regPeriods)}</Text>
                  <Text style={ctrl.editLabel} numberOfLines={1}>{BB_META[e.type].icon} {BB_META[e.type].label}{e.type === 'score' ? ` +${e.points}` : e.type === 'miss' ? ` ${e.points}` : ''}{e.type === 'freethrow' ? (e.made ? ' ✅' : ' ❌') : ''}{hasPlayer(e) ? ` — ${playerOf(state, e, pName)}` : ''}{e.type === 'sub' && onPlayerOf(state, e) ? ` ▸ ${onPlayerOf(state, e, pName)}` : ''}</Text>
                  {canEdit(e) && <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${BB_META[e.type].label}`} onPress={() => editEvent(e)} />}
                  <RowAction label="✕" tone="remove" a11y={`Remove ${BB_META[e.type].label}`}
                    onPress={() => void confirmRemove(`${BB_META[e.type].label}${e.type === 'score' ? ` +${e.points}` : ''}${hasPlayer(e) ? ` — ${playerOf(state, e, pName)}` : ''} (${periodLabel(e.quarter, state.regPeriods)})`, () => removeEvent(e))} />
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {state.quarter < state.regPeriods ? (
        <Button variant="primary" label={`End ${periodLabel(state.quarter, state.regPeriods)} →`} onPress={() => void endQuarter()} />
      ) : levelForDecider(state) && (!timedPeriod(state) || timeUp(state, Date.now())) ? (
        // Level at the end of Q4 or an OT period → play (another) overtime.
        // SD-57: a draw only where the format allows one (league / friendly
        // option); otherwise ending level asks first and offers overtime.
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.meta}>{state.agg ? `Level on aggregate (${aggregateText(state)}) at the end of ${periodLabel(state.quarter, state.regPeriods)} — overtime decides the tie.` : `Scores level (${state.home}–${state.away}) at the end of ${periodLabel(state.quarter, state.regPeriods)}${state.allowDraw ? ' — this format allows a draw.' : ' — basketball plays overtime until there is a winner.'}`}</Text>
          <Button variant="primary" label={`🏀 Start Overtime (${periodLabel(state.quarter + 1, state.regPeriods)})${state.otTarget ? ` · first to ${state.otTarget}` : ''}`} onPress={async () => {
            if (await askConfirm({
              title: 'Start overtime?',
              message: `It's ${state.home}-${state.away} at the end of ${periodLabel(state.quarter, state.regPeriods)}. Overtime${state.otTarget ? `: the first side to ${state.otTarget} points wins` : ' is played until there is a winner'}.`,
              yesLabel: 'Start overtime', noLabel: 'Not yet', tone: 'caution',
            })) dispatch({ type: 'START_OVERTIME', payload: { at: Date.now() } });
          }} />
          {state.agg ? null : state.allowDraw ? (
            <Button label="End as a draw" variant="ghost" onPress={async () => { if (await confirmMatchAction('endTie', { drawWord: 'Draw', score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
          ) : (
            <Button label="End level, no overtime…" variant="ghost" onPress={async () => {
              if (await askConfirm({
                title: 'End the game level?',
                message: `It's ${state.home}-${state.away}. This format plays overtime when level — end as a draw only if the organiser's rules allow it.`,
                yesLabel: 'Yes, end as a draw', noLabel: 'No, go back', tone: 'danger',
              })) dispatch({ type: 'END' });
            }} />
          )}
        </View>
      ) : (
        <>
        {state.agg && <Text style={ctrl.meta}>{aggregateText(state)} — {state.home === state.away ? 'the game is level but the tie is not, so no overtime.' : 'the tie is decided.'}</Text>}
        <Button label="🏁 End Match" variant="danger" onPress={async () => { if (await confirmMatchAction('fullTime', { score: `${state.home}-${state.away}` })) dispatch({ type: 'END', payload: { at: Date.now() } }); }} />
        </>
      )}
    </View>
  );
};

/** SD-132 — the basketball game clock panel: the count-down face, ▶ Start /
 *  ⏸ Stop, "Clock stopped" after a whistle, ⏱ Set clock (time left) and the
 *  0:00 end-of-period prompt. Ticks on its own each second. */
function GameClockPanel({ state, dispatch, teamOf, onEndQuarter }: {
  state: BasketballState; dispatch: (a: ScoreAction) => void; teamOf: (side: 'home' | 'away') => string; onEndQuarter: () => void;
}) {
  const [, tick] = useState(0);
  const run = clockRunning(state);
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
    dispatch({ type: 'SET_CLOCK', payload: { left: Number(m[1]) * 60 + Number(m[2] ?? 0), at: Date.now() } });
    setSetting(false); setClockInput('');
  };
  const nowMs = Date.now();
  const up = timeUp(state, nowMs);
  const lastWhistle = (() => {
    const e = [...state.events].reverse().find((x) => x.quarter === state.quarter);
    return e?.type === 'foul' ? ' (foul)' : e?.type === 'timeout' ? ` (time-out, ${teamOf(e.side)})` : '';
  })();
  const per = periodLabel(state.quarter, state.regPeriods);
  return (
    <View style={ctrl.clockPanel}>
      <View style={ctrl.editHead}>
        <Text style={ctrl.clockFace} accessibilityLabel="Game clock">{per} · {clockText(clockLeft(state, nowMs))}</Text>
        <Button label={run && !up ? '⏸ Stop' : '▶ Start'} variant={run && !up ? 'ghost' : 'primary'} disabled={up}
          onPress={() => dispatch({ type: 'CLOCK', payload: { run: !run, at: Date.now() } })} />
      </View>
      {!run && !up && gameSec(state, nowMs) > 0 ? (
        <Text style={ctrl.stopped} accessibilityRole="alert">⏸ Clock stopped{lastWhistle} — tap ▶ Start when play restarts.</Text>
      ) : null}
      {up ? (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.stopped} accessibilityRole="alert">⏰ 0:00 — end of {per}{state.targetPoints > 0 && state.quarter <= state.regPeriods ? ` · time is up: ${state.home === state.away ? `level, so overtime${state.otTarget ? ` (first to ${state.otTarget})` : ''}` : 'the higher score wins'}` : ''}.</Text>
          {state.quarter < state.regPeriods ? <Button variant="primary" label={`End ${per} →`} onPress={onEndQuarter} /> : <Text style={ctrl.meta}>Finish any free throws, then use the button at the bottom.</Text>}
        </View>
      ) : null}
      <Text style={ctrl.editLink} accessibilityRole="button" onPress={() => setSetting((v) => !v)}>{setting ? 'Cancel' : '⏱ Set clock'}</Text>
      {setting ? (
        <View style={ctrl.row}>
          <View style={ctrl.flex}><TextField label="Time left (mm:ss)" value={clockInput} onChange={setClockInput} placeholder={clockText(clockLeft(state, nowMs))} /></View>
          <Button variant="primary" label="Set" onPress={applyClock} />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------ Live panel --------------------------------- */

const LiveClock: NonNullable<SportPlugin<BasketballState>['LiveClock']> = ({ state }) => {
  const s = state as BasketballState;
  const [, tick] = useState(0);
  const gcRun = clockRunning(s);
  useEffect(() => {
    if (s.gc ? !gcRun : (!s.startedAt || s.ended)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.startedAt, s.ended, gcRun, s.gc]);

  // SD-132: the game clock counts down (FIBA); older matches show the wall-clock minute
  const running = s.gc ? gcRun && !timeUp(s, Date.now()) : !!s.startedAt && !s.ended;
  const per = periodLabel(s.quarter, s.regPeriods);
  const label = s.ended ? (s.quarter > s.regPeriods ? `Final · ${per}` : 'Final')
    : timedPeriod(s) ? `${per} · ${clockText(clockLeft(s, Date.now()))}`
    : !s.startedAt ? `${per} ·` : s.gc ? per : `${per} · ${currentMinute(s)}'`;
  return (
    <View style={ctrl.clockRow}>
      <View style={[ctrl.liveDot, { backgroundColor: running ? theme.colors.danger : theme.colors.textMuted }]} />
      <Text style={ctrl.clockTime}>{label}</Text>
    </View>
  );
};

/** Match tabs (2026-10-22): the play-by-play on Commentary; the broadcast
 *  team stats (with the shot chart) and the FIBA box score on Stats. The
 *  screen adds Game flow (SD-50) under Stats. */
type TabProps = Parameters<NonNullable<SportPlugin<BasketballState>['LiveExtras']>>[0];
// IDs-only scoring: players by id → this viewer's names (useMask), the squads' as the fallback
const BasketballCommentary = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const { nameOf } = useMask();
  return (
    <PlayFeed groups={basketballFeed(state as BasketballState, { home: homeName, away: awayName }, withRosters(nameOf, homeRoster, awayRoster))} homeColor={homeColor} awayColor={awayColor} homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} allLabel="Game" />
  );
};
const BasketballStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, homeLineup, awayLineup, onPlayer }: TabProps) => {
  const s = state as BasketballState;
  const { nameOf } = useMask();
  const starters = { home: startersOf(homeLineup), away: startersOf(awayLineup) };
  return (
    <SubViews label="Stats view" views={[
      { key: 'team', label: 'Team stats', render: () => (
        <CategoryStatsPanel periods={bbPanelPeriods(s)} data={(scope) => basketballPanel(s, scope, { starters, now: Date.now() })}
          homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} matchLabel="Game">
          {(scope) => <ShotChart state={s} scope={scope} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />}
        </CategoryStatsPanel>
      ) },
      { key: 'box', label: 'Box score', render: () => (
        <MatchBoxScore sport="basketball" show="box" source={basketballBox(s, { homeRoster, awayRoster, homeName, awayName, nameOf })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
      ) },
    ]} />
  );
};

/** The match lineup's starters (bench points when no five was set on court). */
const startersOf = (slots?: { playerId?: string; playerName?: string }[]) => {
  const placed = (slots ?? []).filter((x) => x.playerId || x.playerName);
  return placed.length
    ? { ids: placed.map((x) => x.playerId).filter((x): x is string => !!x), names: placed.map((x) => x.playerName).filter((x): x is string => !!x) }
    : undefined;
};

/** Broadcast-style board: the TOTAL score + a column of points per quarter, the
 *  live quarter highlighted — the line score TV graphics show. */
const BasketballScoreboard: NonNullable<SportPlugin<BasketballState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as BasketballState;
  const nQ = Math.max(1, s.quarter);
  const columns = Array.from({ length: nQ }, (_, i) => ({ label: periodLabel(i + 1, s.regPeriods), highlight: !s.ended && i + 1 === s.quarter }));
  const pts = (side: 'home' | 'away', q: number) =>
    s.events.filter((e) => e.side === side && e.quarter === q).reduce((a, e) => a + pointsOf(e), 0);
  return (
    <LineScoreboard
      live={live}
      clock={<LiveClock state={s} />}
      leadLabel="TOTAL"
      columns={columns}
      winner={s.ended && s.home !== s.away ? (s.home > s.away ? 'home' : 'away') : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.home), cells: columns.map((_, i) => String(pts('home', i + 1))) }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.away), cells: columns.map((_, i) => String(pts('away', i + 1))) }}
    />
  );
};

/** SD-31 — the scorer's coverage toggle (config mode: patches the match
 *  format; each make records its own `fga`, so past plays keep their credit).
 *  Round 2: "Standard" = BB_TRACK_DEFAULTS (shot zones on; batch 3: missed
 *  shots on; defaults-on wave 3: fast breaks and fouls drawn on too). */
const BASKETBALL_LIVE_SETTINGS: LiveSettings<BasketballState> = {
  title: '⚙️ Scoring settings',
  hint: 'Stats to track — capture only what this scorer can keep up with. A switch applies from the next play (earlier plays keep what they had); this match only.',
  mode: 'config',
  // Deep wave: each play stamps its own detail (`fga`, `zone`, `fbt`, `fdt`),
  // so a config patch + replay never rewrites what earlier plays captured.
  fields: [
    { key: 'trackMisses', label: 'Track missed shots', type: 'toggle', default: BB_TRACK_DEFAULTS.trackMisses, group: 'Stats to track', hint: 'Miss 2 / Miss 3 buttons — FG%, 3P% and full EFF' },
    { key: 'trackZones', label: 'Shot zones', type: 'toggle', default: BB_TRACK_DEFAULTS.trackZones, group: 'Stats to track', hint: 'On (standard): +2 Paint / +2 Mid / +3 Corner / +3 Top — shot chart, points in the paint. Off: plain +2 / +3' },
    { key: 'trackFastBreak', label: 'Fast-break points', type: 'toggle', default: BB_TRACK_DEFAULTS.trackFastBreak, group: 'Stats to track', hint: '⚡ Fast break after a basket — its points, the and-one free throw included' },
    { key: 'trackFoulsDrawn', label: 'Fouls drawn', type: 'toggle', default: BB_TRACK_DEFAULTS.trackFoulsDrawn, group: 'Stats to track', hint: 'Who was fouled (FD) — the free-throw shooter is then picked for you' },
  ],
  read: (s) => ({ trackMisses: s.trackMisses === true, trackZones: scoringLayout(s) === 'zones', trackFastBreak: s.trackFastBreak === true, trackFoulsDrawn: s.trackFoulsDrawn === true }),
  defaults: { ...BB_TRACK_DEFAULTS },
};

export const basketballPlugin: SportPlugin<BasketballState> = {
  ...BASKETBALL_META,
  matchRecords: basketballMatchRecords, // SD-51 (set by the registry before perf F-15)
  // MVP B5: Undo names what it removes ("+3 · Arjun (54-50)")
  undoLabel: (step, nameOf) => basketballUndoLabel(step, nameOf),
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  // SD-40 (BK-05): every box key from the log (credits.ts) + SD-29 MIN and
  // +/-, set absolutely at completion and after corrections. Partial: an older
  // log whose players can't all be resolved to ids keeps the box keys on live
  // increments (only MIN / +/- are synced).
  statTotals: basketballStatTotals,
  statTotalsPartial: true,
  liveSettings: BASKETBALL_LIVE_SETTINGS,
  result: (s) => (s.ended ? { winner: s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw', home: s.home, away: s.away } : null),
  Scoreboard: BasketballScoreboard,
  summary: (s) => ({
    homeScore: String(s.home),
    awayScore: String(s.away),
    statusLine: `${s.ended ? (s.quarter > s.regPeriods ? `Final · ${periodLabel(s.quarter, s.regPeriods)}` : 'Final') : periodLabel(s.quarter, s.regPeriods)}${s.agg ? ` · ${aggregateText(s)}` : ''}`,
  }),
  ScoringControls,
  LiveClock,
  matchTabs: { Commentary: BasketballCommentary, Stats: BasketballStats },
  formation: () => courtFormation('basketball'),
  Court: makeCourt('basketball'),
  voice: { hints: ['two {name}', 'three {name}', 'miss three {name}', 'free throw {name}', 'rebound {name}', 'steal {name}', 'block {name}', 'foul {name}'], parse: basketballVoice },
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  clockTime: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1 },
  fouledOut: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  bonus: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  otBanner: { backgroundColor: theme.colors.primary + '1A', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(3), gap: theme.spacing(1) },
  otTitle: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900', letterSpacing: 0.5 },
  otMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  ejectZone: { gap: theme.spacing(2), marginTop: theme.spacing(5), paddingTop: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  editHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editBanner: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.accent + '22', padding: theme.spacing(2), borderRadius: theme.radius.sm },
  assistBox: { gap: theme.spacing(2), backgroundColor: theme.colors.primary + '14', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(3) },
  addedBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  editMin: { color: theme.colors.accent, fontWeight: '800', width: 40, fontSize: theme.font.small },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  clockPanel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  clockFace: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1, flex: 1 },
  stopped: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  editLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
});
