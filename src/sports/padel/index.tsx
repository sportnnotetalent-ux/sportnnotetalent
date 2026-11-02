/**
 * Padel plugin — archetype: set-game-point. Padel uses tennis scoring, with the
 * common club/tour variations all optional (defaults = classic tennis rules):
 *   • Deuce        — Advantage (classic, default), Golden point (sudden death
 *                    at 40-40, the World Padel Tour rule, great for fast games)
 *                    or Star Point (SD-64, FIP 2026: two advantages, then the
 *                    next point at the third deuce wins).
 *   • Games/set    — 6 (standard, default) or 4 (short sets).
 *   • Match length — best of 3 (default) / best of 5 / single set.
 *   • Deciding set — full set (default) or a Match tiebreak to 10 instead.
 *   • Format       — doubles (default) or singles.
 *
 * Points are attributed to players; games, sets and tiebreaks hit the timeline.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip, textStyles } from '../../components/ui';
import { FAULT_KIND_LABEL, PADEL_FAULT_KINDS } from '../pointDetail';
import { faultTyping } from '../serveFault';
import { MatchBoxScore } from '../../components/BoxScore';
import { padelBox } from '../boxSources';
import { useMask } from '../../core/disputeMask';
import { doubleFaultAction, pointAction } from '../racketActions';
import { RallyPointEditor } from '../RallyPointEditor';
import { MatchStatsPanel } from '../MatchStatsPanel';
import { ServeOrderPicker } from '../ServeOrderPicker';
import { PointDetailRow } from '../PointDetailRow';
import { detailLiveSettings, trackFormatFields } from '../pointDetailSettings';
import { RacketCommentary } from '../RacketCommentary';
import { PointButtons, SecondaryAction, ServeFirstPicker } from '../PointButtons';
import { CueBanner } from '../CueBanner';
import { pointPressure, pressureText } from '../pointStatus';
import type { Player } from '../../core/types';
import type { SportPlugin } from '../types';
import { pointVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { init, reducer, disp, inTiebreak, matchTbActive, serveInfo, gamesPlayed, summary, scoreLine, lineScore, standingsUnits, padelCue, other, decidingPoint, deuceNo, type PadelState } from './engine';
import { padelTotals } from '../racketTotals';
import { cellText } from '../scoreline';
import { durationLine, stampDispatch, withDuration } from '../conduct';
import { makeRacketQuickOptions } from '../RacketQuickOptions';
import { SetLineBoard } from '../SetLineBoard';
import { ServeCourtPanel } from '../ServeCourtPanel';
import { setServeCourt } from '../serveCourt';
import { PADEL_META } from './meta';
import { padelMatchRecords } from './records';
import { IconText } from '../../components/Icon';
export type { PadelState } from './engine';

const ScoringControls: SportPlugin<PadelState>['ScoringControls'] = ({ state, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [] }) => {
  const s = state as PadelState;
  // SD-54 — scoring steps carry the scorer's clock (match / set durations)
  const dispatch = stampDispatch(rawDispatch);
  const act = (side: 'home' | 'away', p?: Player) =>
    // IDs-only scoring: the credit carries the player's id, never the name
    dispatch(pointAction(side, p));
  const deucePoint = s.goldenPoint && !inTiebreak(s) && s.pts.home >= 3 && s.pts.away >= 3;
  // SD-64 — Star Point: which deuce we're at, and the deciding point at the 3rd
  const starDeuce = s.starPoint && !s.ended ? deuceNo(s) : 0;
  const starNow = decidingPoint(s) === 'star';
  // Serve: who serves first is set before the first point, then alternates each
  // game (and, in doubles, rotates through the pair).
  const serve = serveInfo(s);
  const serverSideName = serve.side === 'home' ? homeName : awayName;
  const serverRoster = serve.side === 'home' ? homeRoster : awayRoster;
  const serverName = s.doubles
    ? serverRoster[serve.slot]?.fullName ?? `Server ${serve.slot + 1}`
    : serverRoster[0]?.fullName ?? serverSideName;
  const noPlayYet = gamesPlayed(s) === 0 && s.pts.home === 0 && s.pts.away === 0;
  // SD-115: no silent default — the point buttons wait for the toss.
  const needsServer = noPlayYet && !s.serverPicked;
  // SD-117c — one-tap Ace / Double fault for the CURRENT server (as tennis
  // SD-104): an ace is the server's point with the "Ace" detail; a double
  // fault is the receivers' point marked with the faulting server.
  const serverP: Player | undefined = s.doubles ? serverRoster[serve.slot] : serverRoster[0];
  const by = serverP ? serverP.fullName : serverSideName;
  const receiverSideName = serve.side === 'home' ? awayName : homeName;
  const ace = () => dispatch(pointAction(serve.side, serverP, { payload: { pd: { how: 'ace' } } }));
  const doubleFault = () => dispatch(doubleFaultAction(serve.side, serverP));
  // padel-fault PF2 — the fault's type (the mesh too): the pending 1st-serve
  // fault, else a double fault that is the last point played (optional)
  const typing = faultTyping(s);
  return (
    <View style={{ gap: theme.spacing(4) }}>
      {/* SD-115 — two big team-coloured point buttons; doubles credit optional */}
      <PointButtons
        homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} icon="🟡"
        serving={needsServer ? null : serve.side}
        disabled={needsServer} disabledHint="Pick who serves first to start scoring."
        onPoint={act}
      />
      {/* SD-117c — Ace / Fault / Double fault: secondary, below the point buttons,
          server only. padel-fault PF1 (as tennis): Fault = the 1st serve missed (no
          point; the next point is a 2nd-serve point); on the 2nd serve a fault is
          the double fault. */}
      {!needsServer && <View style={[ctrl.row, ctrl.secGap]}>
        <SecondaryAction label={`🎯 Ace · ${by}`} color={serve.side === 'home' ? homeColor : awayColor} onPress={ace} />
        {!s.fault && !s.ended && (
          <SecondaryAction label={`✋ Fault (1st serve) · ${by}`} onPress={() => dispatch({ type: 'FAULT', side: serve.side })} />
        )}
        <SecondaryAction label={s.fault ? `⚠️ Fault again = double fault · ${by}` : `⚠️ Double fault · ${by} → point ${receiverSideName}`} onPress={doubleFault} />
      </View>}
      {typing && !s.ended && (
        <View style={ctrl.faultChips}>
          <Text style={ctrl.chipLead}>{typing.label}</Text>
          {PADEL_FAULT_KINDS.map((k) => (
            <SelectChip key={k} label={FAULT_KIND_LABEL[k]} active={typing.cur === k} accessibilityLabel={`${typing.label} ${FAULT_KIND_LABEL[k]}`}
              onPress={() => dispatch({ type: 'FAULT_TYPE', payload: { kind: typing.cur === k ? null : k } })} />
          ))}
        </View>
      )}
      {/* SD-117c — derived "Change ends" cue (FIP, as tennis) */}
      <CueBanner cue={padelCue(s)} />
      {(!noPlayYet || s.fault) && <Text style={ctrl.serve} accessibilityLiveRegion="polite">🟡 Serving: {serverName}{s.doubles ? `  ·  ${serverSideName}` : ''}{s.fault ? '  ·  2nd serve' : ''}</Text>}
      <ServeFirstPicker
        icon="🟡" homeName={homeName} awayName={awayName} started={!noPlayYet}
        picked={s.serverPicked || !noPlayYet ? s.firstServer : null}
        onPick={(side, fix) => dispatch({ type: 'SET_FIRST_SERVER', payload: fix ? { side, v: 2 } : { side } })}
      />
      {s.doubles && (
        <ServeOrderPicker state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} icon="🟡" />
      )}
      {matchTbActive(s) && <Text style={ctrl.serve}>🟡 Match tiebreak — first to 10 (win by 2).</Text>}
      {deucePoint && <IconText label={"⚡ Golden point — next point wins the game."} style={ctrl.serve} />}
      {starNow ? <IconText label={"⭐ Star point — 3rd deuce: the next point wins the game. The receiving pair chooses who receives."} style={ctrl.serve} />
        : starDeuce > 0 ? <Text style={ctrl.serve}>Deuce {starDeuce} of 3 · Star Point: {starDeuce === 1 ? 'two advantages' : 'one more advantage'} before the deciding point.</Text> : null}
      {/* SD-107 / deep wave — optional detail for the last point: how, forehand /
          backhand + shot, 2nd serve, net points, rally length */}
      <PointDetailRow sport="padel" state={s} dispatch={dispatch} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} />
      {/* SD-21 — edit / delete / insert a past point; the engine replays it (EDIT_LOG). */}
      <RallyPointEditor
        events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce={false} pointIcon="🟡" detailSport="padel" doubleFault
        periodLabel={(e) => (e.stamp === 'Match TB' ? 'Match TB' : `Set ${e.set ?? 1}`)}
      />
    </View>
  );
};

/** Match tabs (2026-10-22): the commentary on its own tab (the doubles serve
 *  diagram, `ServeCourt`, sits on top of it); the stats on Stats. The set
 *  scores are on the scoreboard header above every tab. */
type TabProps = Parameters<NonNullable<SportPlugin<PadelState>['LiveExtras']>>[0];
/** Deep wave — commentary by game, newest first (holds / breaks, golden / star
 *  points and the change-ends cues inline). */
const PadelCommentary = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster }: TabProps) => (
  <RacketCommentary sport="padel" icon="🟡" state={state as PadelState} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
);
const PadelStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const s = state as PadelState;
  // IDs-only scoring: box-score names by player id for this viewer
  const { nameOf } = useMask();
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {/* SD-22 / deep wave: key stats, serve, shots, rally length — replayed from the point log, per set */}
      <MatchStatsPanel sport="padel" state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
      {/* SD-54 — match and set durations (from the scorer's tap times) */}
      {durationLine(s.events, 'S') ? <Text style={textStyles.muted}>{durationLine(s.events, 'S')}</Text> : null}
      <Text style={ctrl.label}>Box score</Text>
      <MatchBoxScore sport="padel" source={padelBox(s, { homeRoster, awayRoster, nameOf })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/** SD-20 — broadcast board (as tennis): current-game POINTS + a column of games
 *  per set, the live set highlighted, 7 / 6⁴ for a set tiebreak and the match
 *  tiebreak as its own "TB" column (10 / 7). */
const PadelScoreboard: NonNullable<SportPlugin<PadelState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as PadelState;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={matchTbActive(s) ? 'Match tiebreak' : `Set ${setNo}${inTiebreak(s) ? ' · Tiebreak' : ''}${s.goldenPoint ? ' · golden pt' : decidingPoint(s) === 'star' ? ' · ⭐ STAR POINT' : s.starPoint ? ' · star pt' : ''}`}
      bestOf={s.setsToWin === 1 ? 'single set' : `best of ${s.setsToWin * 2 - 1}`}
      leadLabel="POINTS" lead={{ home: disp(s, 'home'), away: disp(s, 'away') }}
      serving={s.ended || (!s.serverPicked && s.events.length === 0) ? null : serveInfo(s).side} serveIcon="🟡"
      // SD-115 — MATCH / SET / BREAK POINT, derived by playing the next point.
      alerts={pressureText(pointPressure(reducer, s, { unit: 'set', server: serveInfo(s).side }), { home: homeName, away: awayName })}
      cue={padelCue(s)?.text}
    />
  );
};

/** Doubles serve diagram for the next point (replaces the Lineups court). */
const PADEL_COURT = makeCourt('padel')!;
const PadelServeCourt: NonNullable<SportPlugin<PadelState>['ServeCourt']> = (p) => {
  const s = p.state as PadelState;
  const ids = (r: Player[]) => r.map((x) => x.id);
  const view = setServeCourt('padel', s, { home: ids(p.homeRoster), away: ids(p.awayRoster) }, inTiebreak(s), !!decidingPoint(s) && !inTiebreak(s));
  return <ServeCourtPanel view={view} Court={PADEL_COURT} {...p} />;
};

export const padelPlugin: SportPlugin<PadelState> = {
  ...PADEL_META,
  matchRecords: padelMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => (s.ended ? { winner: s.setsWon.home > s.setsWon.away ? 'home' : s.setsWon.away > s.setsWon.home ? 'away' : 'draw', home: s.setsWon.home, away: s.setsWon.away } : null),
  // SD-17: games won (FIP games difference) — a match tiebreak counts as one game.
  standingsUnits,
  // SD-19: absolute games / sets / points / deciders / tiebreaks per player (and the
  // doubles partner), synced at completion and on correction. Partial: any other live key stays on increments.
  statTotals: padelTotals,
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  // SD-01: once ended → sets won + "6-4, 3-6, [10-7]" (never the reset 0–0).
  // SD-54: + the match duration once it's over (stamped matches only)
  summary: (s) => withDuration(summary(s), s.events, s.ended),
  scoreLine,
  // SD-53 — FIP code violations (Quick options)
  // racket-batch5 RB1 — time violations need the server (fault vs point)
  QuickOptions: makeRacketQuickOptions('padel', { serverOf: (st) => serveInfo(st as PadelState).side }),
  // SD-20: the line score (board grid, "6-4, 3-2 ret.", [10-7]) + FIP/ITF result marks.
  lineScore,
  Scoreboard: PadelScoreboard,
  ScoringControls,
  matchTabs: { Commentary: PadelCommentary, Stats: PadelStats },
  // SD-107 / deep wave — "Stats to track": point detail, 1st / 2nd serve, net
  // points, rally length (event mode: from the next point)
  liveSettings: detailLiveSettings('padel'),
  formation: () => courtFormation('padel'),
  Court: makeCourt('padel'),
  ServeCourt: PadelServeCourt,
  voice: { hints: ['point home', 'point away', '{name} scores'], parse: pointVoice },
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  faultChips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  chipLead: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  // MVP T4: a gap so a slip below the point buttons can't hit Ace / Double fault
  secGap: { marginTop: theme.spacing(3) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  serve: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  setChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
