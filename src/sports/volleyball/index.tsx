/**
 * Volleyball plugin — archetype: running-points. Rally scoring, set to 25
 * (win by 2), best of 3 sets. Each point is logged with HOW it was won (attack,
 * block, ace, opponent error) — see ./engine.ts for who that credits.
 */
import { servingInPlay } from '../inPlaySets';
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { readableOn } from '../../core/contrast';
import { SelectChip, Button, textStyles } from '../../components/ui';
import { scoreLine, finalSummary } from '../scoreline';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { volleyballVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { MatchBoxScore } from '../../components/BoxScore';
import { volleyballStatTotals } from './totals';
import { SetLineBoard } from '../SetLineBoard';
import { RallyPointEditor } from '../RallyPointEditor';
import {
  init, reducer, isDecider, setTarget, VB_OUTCOMES, vbErrorTypesFor, VB_BLOCK_HINT, volleyballCredits, outcomeAction, outcomeChip, standingsUnits, lineScore,
  servingSide, switchSidesDue, technicalTimeoutDue, timeoutsPerSet, stampAction, type VolleyballState, type VbOutcome,
} from './engine';
import { pointPressure, pressureText } from '../pointStatus';
import { trackCourt, liberoCue, setNoOf, type VbTrack } from './rotation';
import { ServePanel, asPlayer } from './ServePanel';
import { VolleyballDetailRow } from './DetailRow';
import { VolleyballQuickOptions } from './SanctionOptions';
import { barredPlayers } from './sanctions';
// deep wave — broadcast match stats, the FIVB VIS box, rally-by-rally commentary
import { VolleyballStatsPanel } from './StatsPanel';
import { volleyballDeepBox, VOLLEYBALL_DEEP_BOX } from './deepBox';
import { volleyballCommentary } from './commentary';
import { FeedView } from '../netraid/FeedView';
import { VOLLEYBALL_LIVE_SETTINGS } from './settings';
import { VOLLEYBALL_META } from './meta';
import { volleyballMatchRecords } from './records';
import { useMask } from '../../core/disputeMask';
import { lineupAction } from './actions';
import type { NameOf } from '../../core/playerNames';
import { IconText } from '../../components/Icon';

export { isDecider, setTarget } from './engine';
export type { VolleyballState } from './engine';

/** One side's point panel. Pick HOW the point was won, then (for a credited
 *  outcome) WHO — the outcome defaults to Attack and resets after every point, so
 *  a kill is one tap on the attacker, a missed serve is one tap, and a
 *  block/ace/fault is two. Without a roster every outcome is a single button.
 *
 *  SD-117b: the court six come first (the bench folds away), chips carry the
 *  team colour, Ace is offered only to the serving side (🏐) and a missed serve
 *  only to the receiving side, and an "Opp. fault" can say what went wrong and
 *  which opponent erred (both optional — "Not named" still scores it). */
function SidePoints({ side, name, color, court, bench, opponents, oppColor, serving, server, oppServer, icon, blocks, dispatch }: {
  side: 'home' | 'away'; name: string; color: string; court: Player[]; bench: Player[];
  opponents: Player[]; oppColor: string;
  /** true = this side serves, false = it receives, null = not known */
  serving: boolean | null;
  /** SD-58: this side's server (when it serves and the rotation is known) — pre-fills Ace */
  server?: Player | null;
  /** SD-58: the opponent's server (when they serve) — a missed serve is charged to them */
  oppServer?: Player | null;
  icon: string; blocks: boolean;
  dispatch: (a: ScoreAction) => void;
}) {
  const [how, setHow] = useState<VbOutcome>('attack');
  const [err, setErr] = useState<string | undefined>(undefined);
  const [showBench, setShowBench] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const outcomes = VB_OUTCOMES.filter((o) => (blocks || o.kind !== 'block')
    && !(o.kind === 'ace' && serving === false) // only the server can ace
    && !(o.kind === 'serveerror' && serving === true)); // your own missed serve isn't your point
  const roster = [...court, ...bench];
  const reset = () => { setHow('attack'); setErr(undefined); };
  const score = (kind: VbOutcome, p?: Player) => {
    const fault = kind === 'opperror' ? { err, by: p } : kind === 'serveerror' && oppServer ? { by: oppServer } : undefined;
    dispatch(outcomeAction(kind, side, kind === 'opperror' ? undefined : p, fault));
    reset();
  };
  // SD-58: with the server known, an ace is one tap on the server
  const aceTap = serving === true && server ? server : null;
  const modes = outcomes.filter((o) => (o.credited || o.kind === 'opperror') && !(aceTap && o.kind === 'ace'));
  const oneTap = outcomes.filter((o) => !o.credited && o.kind !== 'opperror');
  const tapLabel = (o: typeof VB_OUTCOMES[number]) => (o.kind === 'serveerror' && oppServer ? `${outcomeChip(o)} · ${oppServer.fullName}` : outcomeChip(o));
  const effHow = modes.some((o) => o.kind === how) ? how : 'attack';
  const chip = (p: Player, dot: string, onPress: () => void) => <SelectChip key={p.id} label={p.fullName} active={false} dotColor={dot} onPress={onPress} />;
  return (
    <View style={[ctrl.sideBox, { borderLeftColor: color }]}>
      <View style={ctrl.headRow}>
        <Text style={ctrl.label}>{icon} Point — {name}</Text>
        {serving === true && <Text style={[ctrl.serveBadge, { backgroundColor: color, color: readableOn(color) }]} accessibilityLabel={`${server ? server.fullName : name} serving`}>🏐 {server ? `${server.fullName} serves` : 'Serving'}</Text>}
      </View>
      {roster.length > 0 ? (
        <>
          <View style={ctrl.chips}>
            {modes.map((o) => <SelectChip key={o.kind} label={outcomeChip(o)} active={effHow === o.kind} onPress={() => { setHow(o.kind); if (o.kind !== 'opperror') setErr(undefined); }} />)}
          </View>
          {effHow === 'opperror' ? (
            <>
              <Text style={ctrl.hint}>What went wrong? (optional)</Text>
              <View style={ctrl.chips}>
                {vbErrorTypesFor(serving).map((t) => <SelectChip key={t.key} label={t.label} active={err === t.key} onPress={() => setErr(err === t.key ? undefined : t.key)} />)}
              </View>
              <Text style={ctrl.hint}>{VB_BLOCK_HINT}</Text>
              <Text style={ctrl.hint}>Who erred? (optional — tap to give {name} the point)</Text>
              <View style={ctrl.chips}>
                {opponents.map((p) => chip(p, oppColor, () => score('opperror', p)))}
                <SelectChip label="Not named" active={false} onPress={() => score('opperror')} />
              </View>
            </>
          ) : (
            <>
              <Text style={ctrl.hint}>{VB_OUTCOMES.find((o) => o.kind === effHow)!.label} by…</Text>
              <View style={ctrl.chips}>
                {court.map((p) => chip(p, color, () => score(effHow, p)))}
                <SelectChip label="No player" active={false} onPress={() => score(effHow)} />
                {bench.length > 0 && <SelectChip label={showBench ? `Hide bench ▴` : `Bench (${bench.length}) ▾`} active={false} onPress={() => setShowBench((v) => !v)} />}
              </View>
              {showBench && bench.length > 0 && (
                <View style={ctrl.chips}>
                  {bench.map((p) => chip(p, color, () => score(effHow, p)))}
                </View>
              )}
            </>
          )}
          <View style={ctrl.chips}>
            {aceTap && <SelectChip label={`🎯 Ace · ${aceTap.fullName}`} active={false} dotColor={color} onPress={() => score('ace', aceTap)} />}
            {oneTap.map((o) => <SelectChip key={o.kind} label={tapLabel(o)} active={false} onPress={() => score(o.kind)} />)}
          </View>
        </>
      ) : (
        <>
          <View style={ctrl.chips}>
            {outcomes.map((o) => <SelectChip key={o.kind} label={outcomeChip(o)} active={false} onPress={() => score(o.kind)} />)}
          </View>
          {/* screen sweep V1: without a roster "Opp. fault" stays one tap; what went wrong is an optional pick first (applies to the next Opp. fault only) */}
          {showErr ? (
            <>
              <Text style={ctrl.hint}>Opp. fault — what went wrong? (optional, then tap 🚩 Opp. fault)</Text>
              <View style={ctrl.chips}>
                {vbErrorTypesFor(serving).map((t) => <SelectChip key={t.key} label={t.label} active={err === t.key} onPress={() => setErr(err === t.key ? undefined : t.key)} />)}
              </View>
            </>
          ) : (
            <Text style={ctrl.link} accessibilityRole="button" onPress={() => setShowErr(true)}>Opp. fault type (optional)</Text>
          )}
        </>
      )}
    </View>
  );
}

/** SD-117b: the side's court (lineup slots with a player, else the stamped
 *  court when it's smaller than the squad) and the bench (the rest). With
 *  neither, everyone is "court" — nothing to fold. */
function splitCourt(roster: Player[], lineup: { playerId?: string }[], stamped?: { id: string }[]): { court: Player[]; bench: Player[] } {
  const ids = lineup.filter((sl) => sl.playerId).map((sl) => sl.playerId!);
  const pick = ids.length ? ids : stamped && stamped.length < roster.length ? stamped.map((p) => p.id) : [];
  if (!pick.length) return { court: roster, bench: [] };
  const byId = new Map(roster.map((p) => [p.id, p]));
  const court = pick.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const on = new Set(court.map((p) => p.id));
  return court.length ? { court, bench: roster.filter((p) => !on.has(p.id)) } : { court: roster, bench: [] };
}

/** Point / timeout controls — volleyball's, parameterised so a future set-based
 *  net sport without blocks can reuse them. `timeoutsPerSet` is the fallback
 *  when the state doesn't carry the format's (SD-117b). */
export function makeSetScoringControls(opts: { icon: string; blocks: boolean; timeoutsPerSet?: number; serve?: boolean; detail?: boolean }): SportPlugin<VolleyballState>['ScoringControls'] {
  const Controls: SportPlugin<VolleyballState>['ScoringControls'] = ({ state, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [] }) => {
    const s = state as VolleyballState;
    // IDs-only scoring: court stamps keep ids; names for the scorer by id
    const { nameOf } = useMask();
    // SD-29: before the first point, stamp who is on court (the lineup's court
    // players, else the matchday squad) — the base for sets played.
    const dispatch = (a: ScoreAction) => {
      if (!s.lineup && !s.events.length && a.type !== 'TIMEOUT') {
        for (const [side, roster, lineup] of [['home', homeRoster, homeLineup], ['away', awayRoster, awayLineup]] as const) {
          const players = courtPlayers(roster, lineup);
          if (players.length) rawDispatch(lineupAction(side, players));
        }
      }
      // deep wave — scoring steps carry the scorer's clock (commentary minute, set durations)
      rawDispatch(stampAction(a));
    };
    const editorKinds = VB_OUTCOMES
      .filter((o) => opts.blocks || o.kind !== 'block')
      .map((o) => ({ kind: o.kind, label: outcomeChip(o), credited: o.credited }));
    const hc = homeColor ?? theme.colors.home;
    const ac = awayColor ?? theme.colors.away;
    // SD-58 / SD-71: the six on court now (rotation + subs) when tracked
    const track = trackCourt(s);
    const home = trackedCourt(track, 'home', homeRoster, s, nameOf) ?? splitCourt(homeRoster, homeLineup, s.lineup?.home);
    const away = trackedCourt(track, 'away', awayRoster, s, nameOf) ?? splitCourt(awayRoster, awayLineup, s.lineup?.away);
    const server = servingSide(s);
    const servingOf = (side: 'home' | 'away') => (server ? server === side : null);
    const srvPlayer = track.server && track.serving ? asPlayer(track.server, track.serving === 'home' ? homeRoster : awayRoster, nameOf) : null;
    const serverOf = (side: 'home' | 'away') => (srvPlayer && track.serving === side ? srvPlayer : null);
    const libCues = (['home', 'away'] as const).map((sd) => liberoCue(s, sd, track, nameOf)).filter((x): x is string => !!x);
    // SD-136: an expelled / disqualified player still on court must be substituted (FIVB 15.8)
    for (const [sd, c] of [['home', home.court], ['away', away.court]] as const) {
      const on = new Set(c.map((p) => p.id));
      for (const b of barredPlayers(s.events, sd, setNoOf(s))) {
        if (on.has(b.id) && c.length < (sd === 'home' ? homeRoster : awayRoster).length) libCues.push(`${nameOf(b.id, b.name)} was ${b.why === 'expulsion' ? 'expelled for this set' : 'disqualified'} — substitute them (FIVB 15.8)`);
      }
    }
    const perSet = s.timeoutsPerSet ?? opts.timeoutsPerSet ?? timeoutsPerSet(s);
    const switchCue = switchSidesDue(s);
    const tto = technicalTimeoutDue(s);
    return (
      <View style={{ gap: theme.spacing(4) }}>
        {(switchCue || tto || libCues.length > 0) && (
          <View style={ctrl.cue} accessibilityLiveRegion="polite">
            {switchCue && <Text style={ctrl.cueText}>↔ {switchCue}</Text>}
            {tto && <IconText label={"⏱️ Technical timeout — 21 points played (sets 1–2)"} style={ctrl.cueText} />}
            {libCues.map((c) => <Text key={c} style={ctrl.cueText}>⚠ {c}</Text>)}
          </View>
        )}
        {opts.serve && (homeRoster.length > 0 || awayRoster.length > 0 || s.serve) && (
          <ServePanel s={s} track={track} dispatch={dispatch}
            home={{ side: 'home', name: homeName, color: hc, roster: homeRoster, lineup: homeLineup, court: subCourt(track, 'home', homeRoster, home.court, homeRoster.length, nameOf) }}
            away={{ side: 'away', name: awayName, color: ac, roster: awayRoster, lineup: awayLineup, court: subCourt(track, 'away', awayRoster, away.court, awayRoster.length, nameOf) }} />
        )}
        <SidePoints side="home" name={homeName} color={hc} court={home.court} bench={home.bench} opponents={away.court.length ? away.court : awayRoster} oppColor={ac} serving={servingOf('home')} server={serverOf('home')} oppServer={serverOf('away')} icon={opts.icon} blocks={opts.blocks} dispatch={dispatch} />
        <SidePoints side="away" name={awayName} color={ac} court={away.court} bench={away.bench} opponents={home.court.length ? home.court : homeRoster} oppColor={hc} serving={servingOf('away')} server={serverOf('away')} oppServer={serverOf('home')} icon={opts.icon} blocks={opts.blocks} dispatch={dispatch} />
        {/* SD-81 — optional "Detailed stats": attack attempts + reception */}
        {opts.detail && (homeRoster.length > 0 || awayRoster.length > 0) && (
          <VolleyballDetailRow state={s} dispatch={dispatch}
            home={{ side: 'home', name: homeName, color: hc, court: home.court }}
            away={{ side: 'away', name: awayName, color: ac, court: away.court }} />
        )}
        {perSet > 0 && (() => {
          const setNo = s.setsWon.home + s.setsWon.away + 1;
          const used = (side: 'home' | 'away') => s.events.filter((e) => e.kind === 'timeout' && e.side === side && e.set === setNo).length;
          const left = (side: 'home' | 'away') => Math.max(0, perSet - used(side));
          const label = (side: 'home' | 'away', nm: string) => `⏱️ Timeout — ${nm} (${left(side)} left)`;
          return (
            <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
              <Button label={label('home', homeName)} variant="ghost" style={{ flex: 1 }} disabled={left('home') === 0} onPress={() => dispatch({ type: 'TIMEOUT', side: 'home' })} />
              <Button label={label('away', awayName)} variant="ghost" style={{ flex: 1 }} disabled={left('away') === 0} onPress={() => dispatch({ type: 'TIMEOUT', side: 'away' })} />
            </View>
          );
        })()}
        <RallyPointEditor
          events={s.events} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
          homeRoster={homeRoster} awayRoster={awayRoster} dispatch={dispatch} hasAce pointIcon={opts.icon}
          periodLabel={(e) => `Set ${e.set ?? 1}`}
          kinds={editorKinds} defaultKind="attack" creditsOf={volleyballCredits}
        />
      </View>
    );
  };
  return Controls;
}

/** SD-58 / SD-71: the court from the tracker — when a rotation is stamped or a
 *  sub was made for this side (else null: the SD-117b split stands). */
function trackedCourt(t: VbTrack, side: 'home' | 'away', roster: Player[], s: VolleyballState, nameOf?: NameOf): { court: Player[]; bench: Player[] } | null {
  const c = t.court[side];
  if (!c || !c.length || !(t.ordered[side] || s.subs?.some((x) => x.side === side && x.set === setNoOf(s)))) return null;
  const court = c.map((p) => asPlayer(p, roster, nameOf));
  const on = new Set(court.map((p) => p.id));
  return { court, bench: roster.filter((p) => !on.has(p.id)) };
}

/** Who can be substituted: the tracked court, else the lineup's court when
 *  it's smaller than the squad (a real six). Null = not known. */
function subCourt(t: VbTrack, side: 'home' | 'away', roster: Player[], court: Player[], squad: number, nameOf?: NameOf): Player[] | null {
  if (t.court[side]?.length) {
    const list = t.court[side]!.map((p) => asPlayer(p, roster, nameOf));
    return list.length < squad ? list : null;
  }
  return court.length && court.length < squad ? court : null;
}

/** SD-29: the court at the start — lineup slots with a player, else the
 *  squad. IDs-only scoring: the LINEUP stamp carries ids only. */
function courtPlayers(roster: Player[], lineup: { playerId?: string }[]): { id: string }[] {
  const slots = lineup.filter((sl) => sl.playerId);
  if (slots.length) return slots.map((sl) => ({ id: sl.playerId! }));
  return roster.map((p) => ({ id: p.id }));
}

// Timeouts per set come from the format (2 indoor, 1 beach — SD-117b).
const ScoringControls = makeSetScoringControls({ icon: '🏐', blocks: true, serve: true, detail: true });

/** Match tabs (2026-10-22): the rally-by-rally commentary grouped by set
 *  (substitutions, timeouts and sanctions sit where they happened) on
 *  Commentary; the broadcast match stats (FIVB VIS categories, rotation
 *  analysis, by server) and the player box at VIS depth on Stats. The set
 *  scores are on the scoreboard header above every tab. */
type TabProps = Parameters<NonNullable<SportPlugin<VolleyballState>['LiveExtras']>>[0];
const VolleyballCommentary = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster }: TabProps) => {
  const s = state as VolleyballState;
  // IDs-only scoring: players named by id for this viewer
  const { nameOf } = useMask();
  const feed = useMemo(
    () => volleyballCommentary(s, { home: homeName, away: awayName, nameOf, homeRoster, awayRoster }),
    [s, homeName, awayName, nameOf, homeRoster, awayRoster],
  );
  return <FeedView groups={feed} homeColor={homeColor} awayColor={awayColor} emptyText="No points yet." title="Commentary · rally by rally" />;
};
const VolleyballStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const s = state as VolleyballState;
  // IDs-only scoring: box-score names by player id for this viewer
  const { nameOf } = useMask();
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <VolleyballStatsPanel state={s} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />
      <Text style={ctrl.label}>Player stats</Text>
      <MatchBoxScore sport="volleyball" schema={VOLLEYBALL_DEEP_BOX} show="box" source={volleyballDeepBox(s, { homeRoster, awayRoster, nameOf })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/** Broadcast-style board: SETS won + a column of points per set, the live set
 *  highlighted — the layout volleyball TV graphics use. */
const VolleyballScoreboard: NonNullable<SportPlugin<VolleyballState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as VolleyballState;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={`Set ${s.setsWon.home + s.setsWon.away + 1}${isDecider(s) ? ' · Decider' : ''}`} bestOf={`best of ${s.setsToWin * 2 - 1}`}
      // SD-117b: 🏐 after the serving side (derived from the rallies) and the
      // SET POINT / MATCH POINT chip (pointStatus.ts, the same as the racket sports)
      serving={servingSide(s)} serveIcon="🏐"
      alerts={pressureText(pointPressure(reducer, s, { unit: 'set' }), { home: homeName, away: awayName })}
    />
  );
};

export const volleyballPlugin: SportPlugin<VolleyballState> = {
  ...VOLLEYBALL_META,
  matchRecords: volleyballMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  // SD-29: sets played per player (court stamp + credited points), set
  // absolutely at completion — the per-set denominator (FIVB). Other stats
  // stay incremental.
  // SD-19: + the team's setsWon / setsLost on every player's line.
  // SD-32: + points / attackPoints / blocks / aces from the point log (left
  // out whole if a credited name can't be matched to an id). Partial: an old
  // line whose names don't resolve keeps moving by live increments.
  statTotals: volleyballStatTotals,
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  result: (s) => (s.ended ? { winner: s.setsWon.home > s.setsWon.away ? 'home' : s.setsWon.away > s.setsWon.home ? 'away' : 'draw', home: s.setsWon.home, away: s.setsWon.away } : null),
  // SD-17: rally points over every set (FIVB point ratio).
  standingsUnits,
  Scoreboard: VolleyballScoreboard,
  inPlay: (s, r) => servingInPlay(s, r, (x) => servingSide(x), reducer),
  // SD-01: once ended → sets won + "25-21, 23-25, 15-12" (never the reset 0–0).
  scoreLine: (s, perspective) => scoreLine(s?.sets, { perspective }),
  // SD-20: the line score (a match closed by hand: "25-21, 12-8 conceded").
  lineScore,
  summary: (s) => s.ended ? finalSummary(s.setsWon, scoreLine(s.sets)) : ({
    homeScore: String(s.current.home),
    awayScore: String(s.current.away),
    statusLine: s.ended ? 'Match Over' : `Set ${s.setsWon.home + s.setsWon.away + 1}${isDecider(s) ? ' · decider' : ''}`,
    detailLine: `Sets — ${s.setsWon.home}:${s.setsWon.away} · ${s.setsToWin === 1 ? 'single set' : `best of ${s.setsToWin * 2 - 1}`} · to ${setTarget(s)}${isDecider(s) ? ' (decider)' : ''}`,
  }),
  ScoringControls,
  matchTabs: { Commentary: VolleyballCommentary, Stats: VolleyballStats },
  // deep wave — "Stats to track": attack attempts (off), reception, digs, set assists, who was aced (on for a new match; VB_STATS_DEFAULTS)
  liveSettings: VOLLEYBALL_LIVE_SETTINGS,
  // SD-136 — FIVB sanctions (misconduct 21, delays 16.2) in Quick options
  QuickOptions: VolleyballQuickOptions,
  formation: () => courtFormation('volleyball'),
  Court: makeCourt('volleyball'),
  voice: { hints: ['attack {name}', 'ace {name}', 'block {name}', 'point home'], parse: volleyballVoice },
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  headRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing(2) },
  serveBadge: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '800', borderRadius: theme.radius.pill, paddingVertical: 2, paddingHorizontal: theme.spacing(2), overflow: 'hidden' },
  cue: { backgroundColor: theme.colors.accent + '22', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.accent, padding: theme.spacing(3), gap: theme.spacing(1) },
  cueText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  sideBox: { gap: theme.spacing(2), borderLeftWidth: 3, paddingLeft: theme.spacing(3) },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  setChip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
