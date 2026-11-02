/**
 * Tennis plugin (new) — archetype: set-game-point. Best of 3 sets; games to 6
 * (win by 2, a 7th game settles 6-6); points 0/15/30/40 with deuce & advantage.
 * Points and aces are attributed to players; games and sets hit the timeline.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../../components/ui';
import type { Player } from '../../core/types';
import type { SportPlugin } from '../types';
import { tennisVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { MatchBoxScore } from '../../components/BoxScore';
import { tennisBox } from '../boxSources';
import { useMask } from '../../core/disputeMask';
import { doubleFaultAction, pointAction } from '../racketActions';
import { SetLineBoard } from '../SetLineBoard';
import { RallyPointEditor } from '../RallyPointEditor';
import { ServeOrderPicker } from '../ServeOrderPicker';
import { detailLiveSettings, trackFormatFields } from '../pointDetailSettings';
import { TennisPointDetail } from './PointCapture';
import { TennisStatsPanel } from './StatsPanel';
import { TennisCommentary } from './Commentary';
import { PointButtons, SecondaryAction, ServeFirstPicker } from '../PointButtons';
import { pointPressure, pressureText } from '../pointStatus';
import { init, reducer, disp, inTiebreak, tennisStatus, other, serveInfo, gamesPlayed, summary, scoreLine, lineScore, standingsUnits, tennisCue, tiebreakBanner, type TennisState } from './engine';
import { CueBanner } from '../CueBanner';
import { tennisTotals } from '../racketTotals';
import { cellText } from '../scoreline';
import { durationLine, stampDispatch, withDuration } from '../conduct';
import { makeRacketQuickOptions } from '../RacketQuickOptions';
import { ServeCourtPanel } from '../ServeCourtPanel';
import { setServeCourt } from '../serveCourt';
import { TENNIS_META } from './meta';
import { tennisMatchRecords } from './records';


const ScoringControls: SportPlugin<TennisState>['ScoringControls'] = ({ state, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [] }) => {
  const s = state as TennisState;
  // SD-54 — scoring steps carry the scorer's clock (match / set durations)
  const dispatch = stampDispatch(rawDispatch);
  const act = (type: string, side: 'home' | 'away', stat: string, p?: Player) =>
    // IDs-only scoring: the credit carries the player's id, never the name
    dispatch(pointAction(side, p, { type: type as 'POINT' | 'ACE', stat }));
  // A double fault: the OPPONENT wins the point (a normal POINT, so the score &
  // replay stay correct); the faulting server is credited a doubleFault via the
  // 2nd-attribution channel (reversed on undo). SD-104: `payload.df` marks the
  // point in the log, so a later correction moves the doubleFaults with it.
  const doubleFault = (server: 'home' | 'away', p?: Player) =>
    dispatch(doubleFaultAction(server, p));

  // Serve tracking. Who serves first is set before the first point; from there
  // serve alternates each game (and, in doubles, rotates through the pair in the
  // serving order picked at the start of the set — SD-104).
  const serve = serveInfo(s);
  const serverSideName = serve.side === 'home' ? homeName : awayName;
  const receiverSideName = serve.side === 'home' ? awayName : homeName;
  const serverRoster = serve.side === 'home' ? homeRoster : awayRoster;
  const serverP: Player | undefined = s.doubles ? serverRoster[serve.slot] : serverRoster[0];
  const serverName = serverP?.fullName ?? (s.doubles ? `Server ${serve.slot + 1}` : serverSideName);
  const noPlayYet = gamesPlayed(s) === 0 && s.pts.home === 0 && s.pts.away === 0;
  // SD-115: no silent default — the point buttons wait for the toss.
  const needsServer = noPlayYet && !s.serverPicked;
  // SD-104: only the server can hit an ace or double-fault — offer both for the
  // serving side only, credited to the serving player.
  const by = serverP ? serverP.fullName : serverSideName;
  const serverColor = serve.side === 'home' ? homeColor : awayColor;

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {/* SD-115 — two big team-coloured point buttons; singles auto-credits */}
      <PointButtons
        homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} icon="🎾"
        serving={noPlayYet && !s.serverPicked ? null : serve.side}
        disabled={needsServer} disabledHint="Pick who serves first to start scoring."
        onPoint={(side, p) => act('POINT', side, 'points', p)}
      />
      {/* Ace / Fault / Double fault: secondary (outline, smaller), below the point
          buttons. Founder 2026-11-02: Fault = the 1st serve missed (no point; the
          next point is a 2nd-serve point); on the 2nd serve a fault is the double fault. */}
      {!needsServer && <View style={[ctrl.row, ctrl.secGap]}>
        <SecondaryAction label={`🎯 Ace · ${by}`} color={serverColor} onPress={() => act('ACE', serve.side, 'aces', serverP)} />
        {!s.fault && !s.ended && (
          <SecondaryAction label={`✋ Fault (1st serve) · ${by}`} onPress={() => dispatch({ type: 'FAULT', side: serve.side })} />
        )}
        <SecondaryAction label={s.fault ? `⚠️ Fault again = double fault · ${by}` : `⚠️ Double fault · ${by} → point ${receiverSideName}`} onPress={() => doubleFault(serve.side, serverP)} />
      </View>}
      {/* SD-117c — derived "Change ends" cue and the tiebreak rules */}
      <CueBanner cue={tennisCue(s)} />
      {(!noPlayYet || s.fault) && <Text style={ctrl.serveBanner} accessibilityLiveRegion="polite">🎾 Serving: {serverName}{s.doubles ? `  ·  ${serverSideName}` : ''}{s.fault ? '  ·  2nd serve' : ''}</Text>}
      {tiebreakBanner(s) && <Text style={ctrl.tbBanner}>🎾 {tiebreakBanner(s)}</Text>}
      <ServeFirstPicker
        icon="🎾" homeName={homeName} awayName={awayName} started={!noPlayYet}
        picked={s.serverPicked || !noPlayYet ? s.firstServer : null}
        onPick={(side, fix) => dispatch({ type: 'SET_FIRST_SERVER', payload: fix ? { side, v: 2 } : { side } })}
      />
      {s.doubles && (
        <ServeOrderPicker state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} icon="🎾" />
      )}
      {/* SD-107 / SD-157 — optional detail for the last point: how, forehand /
          backhand + shot, 2nd serve, net, rally length, serve speed */}
      <TennisPointDetail state={s} dispatch={dispatch} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} />
      <RallyPointEditor
        events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
        homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce pointIcon="🎾" doubleFault detailSport="tennis"
        periodLabel={(e) => `Set ${e.set ?? 1}`}
      />
    </View>
  );
};

/** Match tabs (2026-10-22): the commentary on its own tab (the doubles serve
 *  diagram, `ServeCourt`, sits on top of it); the stats on Stats. The set
 *  scores are on the scoreboard header above every tab. */
type TabProps = Parameters<NonNullable<SportPlugin<TennisState>['LiveExtras']>>[0];
/** SD-158 — commentary by game, newest first. */
const TennisCommentaryTab = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster }: TabProps) => (
  <TennisCommentary state={state as TennisState} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
);
const TennisStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const s = state as TennisState;
  // IDs-only scoring: box-score names by player id for this viewer
  const { nameOf } = useMask();
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {/* SD-22 / SD-157: key stats, serve & return, rally — replayed from the point log, per set */}
      <TennisStatsPanel state={s} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} />
      {/* SD-54 — match and set durations (from the scorer's tap times) */}
      {durationLine(s.events, 'S') ? <Text style={textStyles.muted}>{durationLine(s.events, 'S')}</Text> : null}
      <Text style={ctrl.label}>Player stats</Text>
      <MatchBoxScore sport="tennis" source={tennisBox(s, { homeRoster, awayRoster, nameOf })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/** Broadcast-style board: current-game POINTS + a column of games per set, the
 *  live set highlighted — the layout tennis TV graphics use. A set won in a
 *  tiebreak shows the loser's tiebreak points as a superscript (7 / 6⁴); a match
 *  tiebreak is its own "TB" column. SD-20: the shared SetLineBoard. */
const TennisScoreboard: NonNullable<SportPlugin<TennisState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as TennisState;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={`Set ${setNo}${inTiebreak(s) ? ' · Tiebreak' : tennisStatus(s) ? ` · ${tennisStatus(s)}` : ''}`} bestOf={s.setsToWin === 1 ? 'single set' : `best of ${s.setsToWin * 2 - 1}`}
      // After the match the current-game POINTS are meaningless (0-0), so the
      // headline becomes SETS won — the result a fan reads off a final board.
      leadLabel="POINTS" lead={{ home: disp(s, 'home'), away: disp(s, 'away') }}
      // Serve dot next to the serving side's name (broadcast standard), while live.
      serving={s.ended || (!s.serverPicked && s.events.length === 0) ? null : serveInfo(s).side} serveIcon="🎾"
      // SD-115 — MATCH / SET / BREAK POINT, derived by playing the next point.
      alerts={pressureText(pointPressure(reducer, s, { unit: 'set', server: serveInfo(s).side }), { home: homeName, away: awayName })}
      cue={tennisCue(s)?.text}
    />
  );
};

/** Doubles: who serves from which half to whom, for the next point (replaces
 *  the Lineups court; nothing in singles). */
const TENNIS_COURT = makeCourt('tennis')!;
const TennisServeCourt: NonNullable<SportPlugin<TennisState>['ServeCourt']> = (p) => {
  const s = p.state as TennisState;
  const ids = (r: Player[]) => r.map((x) => x.id);
  const deciding = !inTiebreak(s) && s.noAd && s.pts.home === 3 && s.pts.away === 3;
  const view = setServeCourt('tennis', s, { home: ids(p.homeRoster), away: ids(p.awayRoster) }, inTiebreak(s), deciding);
  return <ServeCourtPanel view={view} Court={TENNIS_COURT} {...p} />;
};

export const tennisPlugin: SportPlugin<TennisState> = {
  ...TENNIS_META,
  matchRecords: tennisMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => (s.ended ? { winner: s.setsWon.home > s.setsWon.away ? 'home' : s.setsWon.away > s.setsWon.home ? 'away' : 'draw', home: s.setsWon.home, away: s.setsWon.away } : null),
  // SD-17: games won (ATP % games) — a match tiebreak counts as one game.
  standingsUnits,
  // SD-19: absolute games / sets / points / deciders / tiebreaks per player (and the
  // doubles partner), synced at completion and on correction. Partial: double faults stay on increments.
  statTotals: tennisTotals,
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  Scoreboard: TennisScoreboard,
  // SD-01: once ended → sets won + "6-4, 3-6, 7-6(4)" (never the reset 0–0).
  // SD-54: + the match duration once it's over (stamped matches only)
  summary: (s) => withDuration(summary(s), s.events, s.ended),
  scoreLine,
  // SD-53 / SD-54 — code & time violations, medical / toilet (Quick options)
  QuickOptions: makeRacketQuickOptions('tennis', { serverOf: (st) => serveInfo(st as TennisState).side }),
  // SD-20: the line score (board grid, "6-4, 3-2 ret.") + ITF result marks.
  lineScore,
  ScoringControls,
  matchTabs: { Commentary: TennisCommentaryTab, Stats: TennisStats },
  // SD-107 — Point detail / 1st & 2nd serve (event mode: from the next point)
  liveSettings: detailLiveSettings('tennis'),
  formation: () => courtFormation('tennis'),
  Court: makeCourt('tennis'),
  ServeCourt: TennisServeCourt,
  voice: { hints: ['point home', 'ace {name}', 'double fault {name}'], parse: tennisVoice },
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  // MVP T4: a gap so a slip below the point buttons can't hit Ace / Double fault
  secGap: { marginTop: theme.spacing(3) },
  flex: { flexGrow: 1, flexBasis: 140 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  serveBanner: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start',
  },
  tbBanner: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  setChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
