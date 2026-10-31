/**
 * Badminton plugin — archetype: set-game-point. Best of 3 games to 21 (win by
 * 2, cap 30). Each rally is logged to the play-by-play with the point-winner,
 * and game wins are highlighted. Points are attributed to players for profiles.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { Player } from '../../core/types';
import type { SportPlugin } from '../types';
import { courtFormation, makeCourt } from '../courts';
import { pointVoice } from '../voiceParsers';
import { MatchBoxScore } from '../../components/BoxScore';
import { badmintonBox } from '../boxSources';
import { useMask } from '../../core/disputeMask';
import { pointAction } from '../racketActions';
import { SetLineBoard } from '../SetLineBoard';
import { RallyPointEditor } from '../RallyPointEditor';
import { MatchStatsPanel } from '../MatchStatsPanel';
import { PointDetailRow } from '../PointDetailRow';
import { detailLiveSettings, trackFormatFields } from '../pointDetailSettings';
import { RacketCommentary } from '../RacketCommentary';
import { PointButtons, ServeFirstPicker } from '../PointButtons';
import { pointPressure, pressureText } from '../pointStatus';
import { init, reducer, serve, summary, scoreLine, lineScore, standingsUnits, badmintonCue, type BadmintonState } from './engine';
import { CueBanner } from '../CueBanner';
import { badmintonTotals } from '../racketTotals';
import { durationLine, stampDispatch, withDuration } from '../conduct';
import { makeRacketQuickOptions } from '../RacketQuickOptions';
import { badmintonDoublesTurn } from '../doublesOrder';
import { DoublesOrderPicker } from '../DoublesOrderPicker';
import { ServeCourtPanel } from '../ServeCourtPanel';
import { badmintonServeCourt } from '../serveCourt';
import { BADMINTON_META } from './meta';
import { badmintonMatchRecords } from './records';
export { serve, type BadmintonState } from './engine';

const ScoringControls: SportPlugin<BadmintonState>['ScoringControls'] = ({ state, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [] }) => {
  const s = state as BadmintonState;
  // SD-54 — scoring steps carry the scorer's clock (match / game durations)
  const dispatch = stampDispatch(rawDispatch);
  const point = (side: 'home' | 'away', p?: Player) =>
    // IDs-only scoring: the credit carries the player's id, never the name
    dispatch(pointAction(side, p));
  // Serve: chosen first server before any point, then the rally winner serves.
  const sv = serve(s);
  const serverSideName = sv.side === 'home' ? homeName : awayName;
  const serverRoster = sv.side === 'home' ? homeRoster : awayRoster;
  // Doubles server depends on the service court + who's there, so name the side;
  // singles has one player, so name them.
  const serverName = s.doubles ? serverSideName : serverRoster[0]?.fullName ?? serverSideName;
  const noPlayYet = s.current.home === 0 && s.current.away === 0 && s.games.length === 0;
  // SD-115: no silent default — the point buttons wait for the toss.
  const needsServer = noPlayYet && !s.serverPicked;
  // SD-74 — doubles (BWF Law 11): "A serves from the right to X", from the
  // game's serving / receiving pick (roster order until picked) + the rallies.
  const ids = { home: homeRoster.map((p) => p.id), away: awayRoster.map((p) => p.id) };
  const nameOfId = (id?: string) => [...homeRoster, ...awayRoster].find((p) => p.id === id)?.fullName ?? '';
  const dbl = s.doubles && !needsServer ? badmintonDoublesTurn(s, ids) : null;
  const atGameStart = s.current.home === 0 && s.current.away === 0;
  const start = s.doubles ? badmintonDoublesTurn({ ...s, current: { home: 0, away: 0 }, events: [] }, ids) : null;
  return (
    <View style={{ gap: theme.spacing(4) }}>
      {/* SD-115 (extends SD-61) — two big team-coloured buttons; singles
          auto-credits, doubles credit is optional (long-press / "credit a player") */}
      <PointButtons
        homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} icon="🏸"
        serving={needsServer ? null : sv.side}
        disabled={needsServer} disabledHint="Pick who serves first to start scoring."
        onPoint={point}
      />
      {/* SD-117c — derived interval / change-ends cue (BWF) */}
      <CueBanner cue={badmintonCue(s)} />
      {dbl ? (
        <Text style={ctrl.serveBanner}>🏸 {nameOfId(dbl.server)} serves from the {dbl.court} to {nameOfId(dbl.receiver)}</Text>
      ) : !noPlayYet && <Text style={ctrl.serveBanner}>🏸 Serving: {serverName}  ·  {sv.court} court</Text>}
      <ServeFirstPicker
        icon="🏸" homeName={homeName} awayName={awayName} started={!noPlayYet}
        picked={s.serverPicked || !noPlayYet ? s.firstServer : null}
        onPick={(side, fix) => dispatch({ type: 'SET_FIRST_SERVER', payload: fix ? { side, v: 2 } : { side } })}
      />
      {start && !needsServer && !s.ended ? (
        <DoublesOrderPicker
          icon="🏸" gameNo={s.games.length + 1} atGameStart={atGameStart} servingSide={start.serverSide}
          homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster}
          server={start.server} receiver={start.receiver} dispatch={dispatch}
        />
      ) : null}
      {/* SD-107 / deep wave — optional detail for the last rally: how, forehand /
          backhand + shot, error / service-fault type, rally length */}
      <PointDetailRow sport="badminton" state={s} dispatch={dispatch} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} />
      <RallyPointEditor
        events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce={false} pointIcon="🏸" detailSport="badminton"
        periodLabel={(e) => `Game ${e.game ?? 1}`}
      />
    </View>
  );
};

/** Match tabs (2026-10-22): the commentary on its own tab (the doubles serve
 *  diagram, `ServeCourt`, sits on top of it); the stats on Stats. The game
 *  scores are on the scoreboard header above every tab. */
type TabProps = Parameters<NonNullable<SportPlugin<BadmintonState>['LiveExtras']>>[0];
/** Deep wave — commentary by game, newest first (interval / change-ends cues inline). */
const BadmintonCommentary = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster }: TabProps) => (
  <RacketCommentary sport="badminton" icon="🏸" state={state as BadmintonState} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
);
const BadmintonStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const s = state as BadmintonState;
  // IDs-only scoring: box-score names by player id for this viewer
  const { nameOf } = useMask();
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {/* SD-22 / deep wave: key stats, serve, shots, rally length — replayed from the point log, per game */}
      <MatchStatsPanel sport="badminton" state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
      {/* SD-54 — match and game durations (from the scorer's tap times) */}
      {durationLine(s.events, 'G') ? <Text style={textStyles.muted}>{durationLine(s.events, 'G')}</Text> : null}
      <Text style={ctrl.label}>Player stats</Text>
      <MatchBoxScore sport="badminton" source={badmintonBox(s, { homeRoster, awayRoster, nameOf })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/** Broadcast-style board: GAMES won + a column of points per game, the live game
 *  highlighted — the layout badminton TV graphics use. */
const BadmintonScoreboard: NonNullable<SportPlugin<BadmintonState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as BadmintonState;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={`Game ${s.games.length + 1}`} bestOf={`best of ${s.gamesToWin * 2 - 1}`}
      // SD-104: serve dot on the serving side (the last rally winner / first server), while live.
      serving={s.ended || (!s.serverPicked && s.events.length === 0) ? null : serve(s).side} serveIcon="🏸"
      // SD-115 — GAME / MATCH POINT, derived by playing the next rally.
      alerts={pressureText(pointPressure(reducer, s, { unit: 'game' }), { home: homeName, away: awayName })}
      cue={badmintonCue(s)?.text}
    />
  );
};

/** Doubles serve diagram for the next point (BWF Law 11; replaces the Lineups court). */
const BADMINTON_COURT = makeCourt('badminton')!;
const BadmintonServeCourt: NonNullable<SportPlugin<BadmintonState>['ServeCourt']> = (p) => {
  const ids = (r: Player[]) => r.map((x) => x.id);
  const view = badmintonServeCourt(p.state as BadmintonState, { home: ids(p.homeRoster), away: ids(p.awayRoster) });
  return <ServeCourtPanel view={view} Court={BADMINTON_COURT} {...p} />;
};

export const badmintonPlugin: SportPlugin<BadmintonState> = {
  ...BADMINTON_META,
  matchRecords: badmintonMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => (s.ended ? { winner: s.gamesWon.home > s.gamesWon.away ? 'home' : s.gamesWon.away > s.gamesWon.home ? 'away' : 'draw', home: s.gamesWon.home, away: s.gamesWon.away } : null),
  // SD-17: rally points over every game (BWF points difference).
  standingsUnits,
  // SD-19: absolute games / sets / points / deciders per player (and the
  // doubles partner), synced at completion and on correction. Partial: any other live key stays on increments.
  statTotals: badmintonTotals,
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  Scoreboard: BadmintonScoreboard,
  // SD-01: once ended → games won + "21-18, 19-21, 21-15" (never the reset 0–0).
  // SD-54: + the match duration once it's over (stamped matches only)
  summary: (s) => withDuration(summary(s), s.events, s.ended),
  // SD-53 — BWF Law 16 misconduct (Quick options); badminton has no timeouts
  QuickOptions: makeRacketQuickOptions('badminton'),
  scoreLine,
  // SD-20: the line score + BWF result marks ("21-15, 8-3 ret.").
  lineScore,
  ScoringControls,
  matchTabs: { Commentary: BadmintonCommentary, Stats: BadmintonStats },
  // SD-107 / deep wave — "Stats to track": point detail, rally length (event mode: from the next rally)
  liveSettings: detailLiveSettings('badminton'),
  formation: () => courtFormation('badminton'),
  Court: makeCourt('badminton'),
  ServeCourt: BadmintonServeCourt,
  voice: { hints: ['point home', 'point away', '{name} scores'], parse: pointVoice },
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  serveBanner: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start',
  },
  gamesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  gameChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
