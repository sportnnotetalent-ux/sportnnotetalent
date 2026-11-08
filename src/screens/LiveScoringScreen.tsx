/**
 * Generic live-scoring screen. It is sport-agnostic: it looks up the plugin for
 * the match's sport, holds match state in a reducer driven by `plugin.reducer`,
 * renders the universal <Scoreboard/> from `plugin.summary`, and mounts the
 * plugin's own <ScoringControls/>. Adding a sport never touches this file.
 *
 * Match tabs (2026-10-22): every match shows Info · Commentary · Stats ·
 * Summary · Scoring under the scoreboard header — one purpose per tab, and no
 * piece of information in two of them. The sport fills `plugin.matchTabs`
 * (docs/sport-depth/deep-wave/match-tabs.md).
 *
 * Where realtime fits later: every dispatched action would also be persisted to
 * Supabase (an `events` row) and broadcast on a realtime channel so viewers see
 * the score update instantly. The reducer being pure means the server can
 * replay the same events to authoritative state.
 */
import { notice, confirmAction } from '../core/confirm';
import { confirmMatchAction } from '../components/ConfirmSheet';
import { matchControls, showsControl } from '../core/matchSafety';
import { getDeviceId } from '../core/deviceId';
import { mergeMatchConfig, changedFormatKeys } from '../core/matchConfig';
import { boardName } from '../core/teamShort';
import { startStep, startActions, autoStartOnArrival } from '../core/startStep';
import { manualResultLine as baseResultLine, isNoResult } from '../core/matchResult';
import { timeUpLeader, timeUpRuleOf } from '../core/timeUp';
import { matchScoreLine, finalBoard, resultMark } from '../sports/scoreline';
import { isEliminationStage } from '../data/bracket';
import { completedAt, effectiveLog, type AmendOp } from '../sports/amend';
import { canCorrectMatch, correctionHoursLeft, formatTimeLeft } from '../core/roles';
import { standingsConfigFromFormat, noResultPoints } from '../data/standings';
import { lockStatus, type ScoringLock } from '../core/scoringLock';
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { shareMessage, shareMessageWithCard } from '../core/share';
import { PersonPicker } from '../components/PersonPicker';
import { useParamState } from '../navigation/useParamState';
import { matchShareText, matchLink, SHARE_BASE } from '../core/shareText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useKeepAwakeWhile } from '../core/keepAwake';
import { ResultHoldNote } from '../components/ResultHoldNote';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { safeWebUrl } from '../core/safeUrl';
import { SportBadge } from '../components/SportSymbol';
import { theme } from '../core/theme';
import { Glyph, IconText } from '../components/Icon';
import { getSport } from '../sports/registry';
import { entryDisplayName } from '../data/participantEntry';
import { placeholderParamsPatch } from '../core/quickGame';
import { distinctSideColors, ensureContrast } from '../core/contrast';
import { VoiceScorer } from '../sports/VoiceScorer';
import { completesMatch } from '../sports/voiceMatch';
import { Scoreboard } from '../components/Scoreboard';
import { LiveScoreBar } from '../components/LiveScoreBar';
import { Pill, textStyles } from '../components/ui';
import { undoLabel, resolveUndoLabel } from '../sports/undoLabel';
import { useLiveMatch } from '../data/useLiveMatch';
import { matchOutbox } from '../data/matchOutbox';
import { mergeLog, newestEvent } from '../data/eventLog';
import { formatChangePreview, canChangeLiveFormat, type FormatPreview } from '../data/formatChange';
import { FORMAT_TYPE } from '../sports/amend';
import { perSideFromRosters } from '../core/sideSize';
import { forfeitFor, forfeitNote } from '../data/walkover';
import { recordMatchView } from '../data/personalise';
import { cardModel, cardStar } from '../core/resultCard';
import { statsPushes, statsWhatsApps, type StatsMatch } from '../core/playerStatsMessage';
import { openWhatsApp } from '../core/connect';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cardPng } from '../core/resultCardImage';
import { viewsLabel } from '../core/personalise';
import { viewerDeviceId, track } from '../core/telemetry';
import { getRoster, getPlayers, getLineup, getMatch, getTournaments, getMatchSquads, setMatchSquad, getMatchStatLines, getMyPlayerId, setMatchScorers, setMatchHosts, setMatchLogo, setMatchFormat, setMatchStream, setMatchManagers, getOrganizations, getTeamLeaders, getMatchDisputes, raiseDispute, updateDispute, dismissDispute, resolveDispute, escalateDispute, createReplacementPlayer, retireMatch, walkoverMatch, rescheduleMatch, getMatchKickoffAt, getScoringLock, claimScoring, handoverScoring, setSharedScoring, endMatchManually, getScoreEdits, getMatchEvents, getTournamentOfficials, joinMatchAsScorer, getMatchOfficials, setMatchOfficials, deleteMatch, resetMatch, setMatchBreak, getMatchLastActivityAt, getMatchPotm, setMatchPotm, stampAggregatePrior, AWARDS_DB_MESSAGE } from '../data/repos';
import { matchRatings as genericRatings, type PotmProp } from '../data/ratings';
import { AwardPickerSheet, type PickerRow } from '../components/AwardPickerSheet';
import { deleteVerdict, breakLabel, type BreakKind, type MatchBreak } from '../data/matchHousekeeping';
import { QuickOptionsSheet } from '../components/QuickOptionsSheet';
import { LiveSettingsCard } from '../components/LiveSettingsCard';
import { matchRules, matchCaptures, liveOwnedKeys, settingsUnit, scoringRule, existingFormatShown, type CaptureLine, type RuleLine } from '../sports/matchRules';
import { OverlayPanel } from '../components/OverlayPanel';
import type { TickerMeta } from '../sports/ticker';
import { slotsFor, isCommentarySlot, type MatchOfficial } from '../data/matchOfficials';
import { LiveStream } from '../components/LiveStream';
import { DisputeMaskProvider } from '../core/disputeMask';
import { makeNameOf, peopleMap, publicName } from '../core/playerNames';
import { ageFromDob } from '../core/age';
import { SelectChip, TextField, Button } from '../components/ui';
import { DateTimeField } from '../components/DateTimeField';
import { VenueField } from '../components/VenueField';
import { SportFormatEditor, defaultsFor, type FormatVal } from '../components/FormatEditor';
import { AddInvitePlayer } from '../components/AddInvitePlayer';
import { tournamentHostPlayerIds } from '../core/org';
import { canScoreMatch, isListedScorer, isMatchHost } from '../core/scoringAccess';
import { canSwitchShared, staleMessage, undoByLabel, undoNeedsConfirm } from '../core/sharedScoring';
import { seriesMetaFromFormat } from '../data/series';
import { tieSpecFromFormat, TIE_KEYS } from '../data/teamTie';
import { announceTieResult } from '../data/tieAlerts';
import { canFieldPlayer } from '../core/eligibility';
import { useAgeRequirement } from '../data/useAgeRequirement';
import { useAuth } from '../core/auth';
import { promptSignIn } from '../core/guest';
import { guestStore } from '../data/guestStore';
import { claimThisDevicesGuestMatch } from '../data/guestClaim';
import { openVenue } from '../core/venue';
import { formatDateTime, formatTime, useUserTimeZone } from '../core/time';
import { exportToCalendar } from '../core/ics';
import { notify, scheduleNudge, cancelNudge } from '../core/notifications';
import { WhoPlaysCard } from '../components/WhoPlaysCard';
import { WhoPlayedCard } from '../components/WhoPlayedCard';
import { sidePlayers, isStandIn, pickerFor, remindTargets, checkMapping, standInAmendOps } from '../core/teamPlay';
import { replayNudge } from '../core/nudge';
import { playAgain } from '../data/playAgain';
import { MatchSummary } from '../components/MatchSummary';
import { HostsCard } from '../components/HostsCard';
import { LogoPicker } from '../components/LogoPicker';
import { MatchHeader } from '../components/MatchHeader';
import { MatchBoxScore } from '../components/BoxScore';
import { GameFlowCard } from '../components/GameFlowCard';
import { matchBoxSource } from '../sports/boxSources';
import type { MatchEventRecord, MatchResult, ResultKind, DisputeEvent, LineupSlot, Match, MatchDispute, MatchPotm, MatchSquads, Player, SportId, StatLine, TeamLeadership } from '../core/types';
import type { RootStackParamList } from '../navigation/types';
import type { LiveExtrasProps, MatchTabs } from '../sports/types';
import { RemindInstall } from '../components/RemindInstall';
import { captureBus, captureDispatch, shouldBuzz } from '../core/tapCapture';
import { tapFeedback } from '../core/haptics';
import { hapticsPref } from '../core/hapticsPref';
import { CapturedFlash } from '../components/pressFeedback';
import { LiveAnnouncer, scoreSentence } from '../components/LiveAnnouncer';
import { realName } from '../core/invite';
import { inviteLabel, matchRoleInviteText, playerInviteText } from '../core/inviteText';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveScoring'>;
/** once per match on this device: the stats push went out (growth plan #5) */
const STATS_PUSHED_KEY = 'sn.statsPushed.';

export default function LiveScoringScreen({ route, navigation }: Props) {
  const {
    sport,
    homeName,
    awayName,
    homeTeamName,
    awayTeamName,
    homeColor: homeColorIn,
    awayColor: awayColorIn,
    matchId,
    guestId: guestIdParam,
    canScore: routeCanScore = true,
  } = route.params;
  // Score first, sign up later (docs/security/breaks/guest-scoring.md): a guest
  // match lives on this device, with no matchId, until its scorer has an account.
  const guestId = matchId ? undefined : guestIdParam;
  const guestMode = !!guestId;
  // MVP B5: sides whose colours are too close get a clearly different away colour (this view only)
  const [homeColor, awayColor] = distinctSideColors(homeColorIn, awayColorIn);
  const plugin = getSport(sport);
  const { profile, authed } = useAuth();

  // Who am I (this device), and who did the organizer designate to score?
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    getMyPlayerId(profile?.id).then((id) => on && setMyPlayerId(id));
    return () => {
      on = false;
    };
  }, [profile?.id]);
  const [scorerIds, setScorerIds] = useState<string[]>([]);
  const [matchHostIds, setMatchHostIds] = useState<string[]>([]);
  const [homeLeaders, setHomeLeaders] = useState<TeamLeadership>({});
  const [awayLeaders, setAwayLeaders] = useState<TeamLeadership>({});

  // SD-48: the match's own format, internal `__*` keys included (the merged
  // `meta.config` drops them) — the series / tie keys live there.
  const [rawFormat, setRawFormat] = useState<Record<string, unknown> | undefined>(undefined);
  const [meta, setMeta] = useState<{
    homeTeamId?: string; awayTeamId?: string; tournamentId?: string; tournamentName?: string;
    /** SD-154: the tournament's venue zone — the "Date & time" edit is in it */
    tournamentZone?: string;
    config?: Record<string, unknown>; venueName?: string; venueMapsUrl?: string; streamUrl?: string; startsAt?: string;
    tournamentHostIds?: string[];
    status?: Match['status']; score?: { home: number; away: number }; winner?: Match['winner'];
    logoUrl?: string; managers?: { home?: string; away?: string };
    /** closed by hand (parity #04) */
    result?: MatchResult; stage?: string;
    /** decided without play (SD-20: "w/o" on the share / summary) */
    walkover?: boolean;
    /** play paused (parity #13) — `format.__break` */
    onBreak?: MatchBreak;
    /** team logos — the score overlay (parity #25) */
    homeLogo?: string; awayLogo?: string;
  }>({});
  const lastConfigJson = useRef<{ json: string; obj: Record<string, unknown> | undefined }>({ json: '', obj: undefined });
  // Parity #11: the tournament's scorer/referee pool + this match's officials.
  const [tourOfficials, setTourOfficials] = useState<{ playerId: string; role: string }[]>([]);
  const [officials, setOfficials] = useState<{ available: boolean; list: MatchOfficial[] }>({ available: false, list: [] });
  const [reloadTick, setReloadTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (matchId) {
        (async () => {
          const m0 = await getMatch(matchId);
          if (!m0) return;
          // SD-120: leg 2 of a two-legged tie learns the leg-1 score (stamped
          // on its format before kick-off) so its decider plays on aggregate.
          const m = await stampAggregatePrior(m0).catch(() => m0);
          const [tours, orgs, hl, al] = await Promise.all([
            getTournaments(), getOrganizations(), getTeamLeaders(m.homeTeam.id), getTeamLeaders(m.awayTeam.id),
          ]);
          const tour = tours.find((t) => t.id === m.tournamentId);
          // Officials are best-effort extras — never block the match loading.
          void (m.tournamentId ? getTournamentOfficials(m.tournamentId) : Promise.resolve([]))
            .then((o) => on && setTourOfficials(o), () => on && setTourOfficials([]));
          void getMatchOfficials(matchId).then((o) => on && setOfficials(o), () => on && setOfficials({ available: false, list: [] }));
          // The tournament's format for the sport, with per-match settings on top
          // (never instead of it) and internal `__*` keys dropped. Same JSON → same
          // object, so an unchanged format doesn't rebuild the live match.
          const merged = mergeMatchConfig(tour?.formats?.[sport] as Record<string, unknown> | undefined, m.format as Record<string, unknown> | undefined);
          const config = merged && JSON.stringify(merged) === lastConfigJson.current.json ? lastConfigJson.current.obj : merged;
          lastConfigJson.current = { json: JSON.stringify(merged ?? null), obj: config };
          if (on) {
            setScorerIds(m.scorerIds && m.scorerIds.length ? m.scorerIds : (m.scorerId ? [m.scorerId] : []));
            setMatchHostIds(m.hostIds ?? []);
            setRawFormat(m.format as Record<string, unknown> | undefined);
            setHomeLeaders(hl);
            setAwayLeaders(al);
            // A match opened from a link carries no names in the route — take
            // them from the loaded match (was "undefined vs undefined").
            if (!route.params.homeName || !route.params.awayName) {
              navigation.setParams({
                homeName: route.params.homeName || m.homeTeam.shortName || m.homeTeam.name,
                awayName: route.params.awayName || m.awayTeam.shortName || m.awayTeam.name,
                homeTeamName: route.params.homeTeamName || m.homeTeam.name,
                awayTeamName: route.params.awayTeamName || m.awayTeam.name,
                ...(!route.params.homeColor && m.homeTeam.colorHex ? { homeColor: m.homeTeam.colorHex } : {}),
                ...(!route.params.awayColor && m.awayTeam.colorHex ? { awayColor: m.awayTeam.colorHex } : {}),
              });
            } else {
              // A quick game's "Player B" side now has its real player / pair:
              // the title, result card, share text and notifications follow.
              const patch = placeholderParamsPatch(route.params, { home: m.homeTeam, away: m.awayTeam });
              if (Object.keys(patch).length) navigation.setParams(patch);
            }
            setMeta({
              homeTeamId: m.homeTeam.id, awayTeamId: m.awayTeam.id, tournamentId: m.tournamentId,
              tournamentName: tour?.name, tournamentZone: tour?.timeZone, config, venueName: m.venueName, venueMapsUrl: m.venueMapsUrl, streamUrl: m.streamUrl, startsAt: m.startsAt,
              // org-hosted tournaments → every org member is a tournament host
              tournamentHostIds: tour ? tournamentHostPlayerIds(tour, orgs) : [],
              status: m.status, score: m.score, winner: m.winner, logoUrl: m.logoUrl, managers: m.managers,
              result: m.result, walkover: m.walkover, stage: m.stage, onBreak: m.onBreak as MatchBreak | undefined,
              homeLogo: m.homeTeam.logoUrl, awayLogo: m.awayTeam.logoUrl,
            });
          }
        })();
      }
      return () => {
        on = false;
      };
    }, [matchId, sport, reloadTick])
  );

  // A real match is scored by its listed scorers OR its hosts (match / tournament
  // hosts score by default — core/scoringAccess mirrors can_manage_match). Ad-hoc
  // local games (no matchId) fall back to the caller's role-based capability.
  const hasMatch = !!matchId;
  // Personalised Home (founder 2026-10-31): count this view (once a day per
  // person or device; the server skips the match's scorers and hosts). The
  // count ranks "Near you" and shows here from 25.
  const [views, setViews] = useState<number | null>(null);
  useEffect(() => {
    if (!matchId) return;
    let on = true;
    viewerDeviceId().then((d) => recordMatchView(matchId, d)).then((n) => { if (on) setViews(n); }, () => undefined);
    return () => { on = false; };
  }, [matchId]);
  const iAmListedScorer = isListedScorer({ myPlayerId, scorerIds });
  const canScore = hasMatch
    ? canScoreMatch({ myPlayerId, scorerIds, hostIds: matchHostIds, tournamentHostIds: meta.tournamentHostIds })
    : routeCanScore;
  // The scorer taps "Start the match" before scoring begins; a match with events
  // is already underway. (Timer sports then expose their clock-start control.)
  const [localStarted, setLocalStarted] = useState(false);
  // Kickoff = first event's server time; drives the "started by mistake → restart"
  // window (allowed for the first RESTART_WINDOW_MS, then the game is committed).
  const [kickoffAt, setKickoffAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [retireOpen, setRetireOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false); // walkover: pick the winning side
  const [retiredLocally, setRetiredLocally] = useState<'home' | 'away' | null>(null);
  // "🏁 End match…" panel (parity #04): how it ended, who won, why.
  const [endKind, setEndKind] = useState<ResultKind | null>(null);
  const [endWinner, setEndWinner] = useState<'home' | 'away' | null>(null);
  const [endReason, setEndReason] = useState('');
  const [endNrr, setEndNrr] = useState(true);
  const [endBusy, setEndBusy] = useState(false);
  const [endWo, setEndWo] = useState(false); // End match → 🏳 Walkover (hosts)
  // Editable live-stream link (organizer/scorer); seeded from the saved value.
  const [streamInput, setStreamInput] = useState('');
  const [editingStream, setEditingStream] = useState(false);
  const [editingManager, setEditingManager] = useState<'home' | 'away' | null>(null);
  const [remindedSides, setRemindedSides] = useState<Record<'home' | 'away', boolean>>({ home: false, away: false });
  useEffect(() => { setStreamInput(meta.streamUrl ?? ''); }, [meta.streamUrl]);
  // Per-dispute "add a new name" inputs (reassign to someone not in the system).

  // One active scorer at a time (parity #03): the lock names who IS scoring;
  // scorerIds only says who MAY. Polled on focus and every 15 s while scoring.
  const [lock, setLock] = useState<ScoringLock | null>(null);
  const [deviceId, setDeviceId] = useState('');
  useEffect(() => { void getDeviceId().then(setDeviceId); }, []);
  const lockStat = hasMatch ? lockStatus(lock, myPlayerId, deviceId) : 'unsupported';
  const [lostTo, setLostTo] = useState<string | null>(null); // "Scoring moved to …"
  const prevLockStat = useRef(lockStat);
  useEffect(() => {
    if (prevLockStat.current === 'mine' && (lockStat === 'other' || lockStat === 'mine-other-device')) setLostTo(lock?.holderName ?? 'another device');
    if (lockStat === 'mine') setLostTo(null);
    prevLockStat.current = lockStat;
  }, [lockStat, lock?.holderName]);
  const lockAgo = (() => {
    const t = lock?.at ? Date.parse(lock.at) : NaN;
    if (!Number.isFinite(t)) return '';
    const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
    return min < 1 ? 'just now' : `${min} min ago`;
  })();
  const refreshLock = useCallback(async () => {
    if (!matchId) return;
    const l = await getScoringLock(matchId).catch(() => null);
    setLock(l);
  }, [matchId]);

  // Both sides' rosters (declared before useLiveMatch: SD-119 labels each
  // credited player's line with the side they are on).
  const [homeFull, setHomeFull] = useState<Player[]>([]);
  const [awayFull, setAwayFull] = useState<Player[]>([]);
  const sideRosters = useMemo(() => ({ home: homeFull.map((p) => p.id), away: awayFull.map((p) => p.id) }), [homeFull, awayFull]);
  // IDs-only scoring: the scorer's own alerts name players by id from the squads.
  const rosterNameOf = useMemo(() => makeNameOf(peopleMap(homeFull, awayFull)), [homeFull, awayFull]);
  // SD-48 — a rubber of a team tie (its spec rides on the format)
  const tieRubberMeta = useMemo(() => {
    if (!tieSpecFromFormat(rawFormat)) return undefined;
    return { first: Number(rawFormat?.__seriesLeg) === 1 };
  }, [rawFormat]);
  const { state, getState, dispatch, undo, reset, eventCount, live, syncing, rejectedCount, discardRejected, refresh, amend, lastStep, resultSendsAt, sendResultNow, settleStatWrites, staleBy, clearStale } = useLiveMatch({
    matchId,
    sport,
    canScore,
    lockStatus: lockStat,
    myPlayerId,
    homeTeamName,
    awayTeamName,
    rosters: sideRosters,
    nameOf: rosterNameOf,
    homeTeamId: meta.homeTeamId,
    awayTeamId: meta.awayTeamId,
    tournamentId: meta.tournamentId,
    config: meta.config,
    guestId,
    // MVP B6: a live format change (or its undo) — reload the match's format
    onFormatChange: () => setReloadTick((t) => t + 1),
    // SD-48: a team-tie rubber announces the TIE result once, not itself
    ...(tieRubberMeta ? {
      tieRubber: tieRubberMeta,
      onResultSent: () => { if (matchId) void announceTieResult(matchId, { homeTeamId: meta.homeTeamId, awayTeamId: meta.awayTeamId, tournamentId: meta.tournamentId, sportName: getSport(sport).name }); },
    } : {}),
  });
  // Tap feedback (2026-11-03, founder): every scoring step from any sport's
  // controls goes through here. Only a step that changed the state is
  // "captured": a light buzz on phones (preference on; never web), the Undo bar
  // pulses with a ✓ (captureBus — no screen re-render) and the changed score
  // pops. A refused / ignored tap confirms nothing. docs/security/breaks/tap-feedback.md
  const scoreDispatch = useMemo(() => captureDispatch(getState, dispatch, () => {
    if (shouldBuzz({ captured: true, hapticsOn: hapticsPref.get(), platform: Platform.OS, canScore })) tapFeedback();
    captureBus.emit();
  }), [getState, dispatch, canScore]) as typeof dispatch;

  const viewerTz = useUserTimeZone(); // show every time on this screen in the viewer's own zone
  // All players, only for resolving names of people outside the two rosters —
  // hosts, the scorer or a manager can be an organizer/referee who isn't a
  // squad member (otherwise their card would read a bare "Host").
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  // People added by phone as scorer/host who aren't in either squad — kept so
  // their name resolves in the scorer/host rows.
  const [extraPeople, setExtraPeople] = useState<Player[]>([]);
  useEffect(() => {
    let on = true;
    getPlayers().then((p) => on && setAllPlayers(p));
    return () => { on = false; };
  }, []);
  // Bumped after adding/inviting a player so the roster refetches.
  const [rosterNonce, setRosterNonce] = useState(0);
  useEffect(() => {
    let on = true;
    if (homeTeamName) getRoster(homeTeamName, sport, meta.homeTeamId).then((r) => on && setHomeFull(r));
    if (awayTeamName) getRoster(awayTeamName, sport, meta.awayTeamId).then((r) => on && setAwayFull(r));
    // Adding the first player auto-assigns a captain, so refresh leaders here too
    // — otherwise the card keeps showing "No captain set" until a reload.
    if (meta.homeTeamId) getTeamLeaders(meta.homeTeamId).then((l) => on && setHomeLeaders(l));
    if (meta.awayTeamId) getTeamLeaders(meta.awayTeamId).then((l) => on && setAwayLeaders(l));
    return () => {
      on = false;
    };
  }, [homeTeamName, awayTeamName, sport, rosterNonce, meta.homeTeamId, meta.awayTeamId]);
  // Organizer-invited players still pending registration (shown as "invited").
  const invitedPlayers = useMemo(() => [...homeFull, ...awayFull].filter((p) => p.invited), [homeFull, awayFull]);

  // Matchday squad (starting XI + subs). Refetch on focus so edits apply.
  const [squads, setSquads] = useState<MatchSquads | null>(null);
  const [disputes, setDisputes] = useState<MatchDispute[]>([]);
  const reloadDisputes = useCallback(() => {
    if (matchId) getMatchDisputes(matchId).then(setDisputes);
  }, [matchId]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (matchId) {
        getMatchSquads(matchId).then((s) => on && setSquads(s));
        getMatchDisputes(matchId).then((d) => on && setDisputes(d));
      }
      return () => {
        on = false;
      };
    }, [matchId])
  );
  const openDisputes = useMemo(() => disputes.filter((d) => d.status === 'open'), [disputes]);
  const reportedDisputes = useMemo(() => disputes.filter((d) => d.status === 'reported'), [disputes]);
  const settledDisputes = useMemo(() => disputes.filter((d) => d.status === 'resolved' || d.status === 'dismissed'), [disputes]);
  const disputedOpenIds = useMemo(() => new Set(openDisputes.map((d) => d.playerId)), [openDisputes]);
  // Already flagged (open OR reported) → don't offer object/report again.
  const flaggedIds = useMemo(() => new Set([...openDisputes, ...reportedDisputes].map((d) => d.playerId)), [openDisputes, reportedDisputes]);
  // IDs-only scoring (docs/privacy/ids-only-scoring.md): every player id on this
  // match → the name THIS viewer may see (players_view: full names for the
  // child's circle, initials for everyone else). The match's own squads first.
  const people = useMemo(() => peopleMap(homeFull, awayFull, extraPeople, allPlayers), [homeFull, awayFull, extraPeople, allPlayers]);
  const viewerNameOf = useMemo(() => makeNameOf(people), [people]);
  // What to hide as "X" on this match's live surfaces (only active/open disputes),
  // and the names every surface shows by id.
  const maskValue = useMemo(
    () => ({ ids: disputedOpenIds, names: new Set(openDisputes.map((d) => d.playerName)), people }),
    [disputedOpenIds, openDisputes, people]
  );

  // The scoring roster = the matchday squad (starters then subs) if one is set,
  // otherwise the whole team squad.
  // A side without a matchday squad plays from its full squad — minus anyone the
  // other side has picked today (friendlies can share one pool of players, but a
  // person plays for one side per match).
  const applySquad = (full: Player[], squad?: { starters: string[]; subs: string[] }, other?: { starters: string[]; subs: string[] }): Player[] => {
    if (!squad || squad.starters.length + squad.subs.length === 0) {
      const busy = new Set([...(other?.starters ?? []), ...(other?.subs ?? [])]);
      return full.filter((p) => !busy.has(p.id));
    }
    const ids = [...squad.starters, ...squad.subs];
    return ids.map((id) => full.find((p) => p.id === id)).filter((p): p is Player => !!p);
  };
  // team-whos-playing (teams for doubles, phase 3): in a doubles match a side whose
  // squad is bigger than the number playing plays its pick, else "{Team} Player n"
  // stand-ins — never its whole squad (WP2)
  const doublesN = (getSport(sport).participantKind ?? 'team') === 'both' && Number(meta.config?.playersPerSide ?? 1) >= 2 ? Number(meta.config!.playersPerSide) : 0;
  const teamSideOf = (sd: 'home' | 'away') => {
    const full = sd === 'home' ? homeFull : awayFull;
    if (!doublesN || full.length <= doublesN) return null;
    return sidePlayers({
      teamId: (sd === 'home' ? meta.homeTeamId : meta.awayTeamId) ?? sd,
      teamName: sd === 'home' ? homeTeamName ?? homeName : awayTeamName ?? awayName,
      squad: full, needed: doublesN, picked: (sd === 'home' ? squads?.home : squads?.away)?.starters,
    });
  };
  const homeSide = useMemo(() => teamSideOf('home'), [homeFull, squads, doublesN, meta.homeTeamId, homeTeamName, homeName]); // eslint-disable-line react-hooks/exhaustive-deps
  const awaySide = useMemo(() => teamSideOf('away'), [awayFull, squads, doublesN, meta.awayTeamId, awayTeamName, awayName]); // eslint-disable-line react-hooks/exhaustive-deps
  const homeRoster = useMemo(() => (homeSide ? (homeSide.players as Player[]) : applySquad(homeFull, squads?.home, squads?.away)), [homeSide, homeFull, squads]);
  const awayRoster = useMemo(() => (awaySide ? (awaySide.players as Player[]) : applySquad(awayFull, squads?.away, squads?.home)), [awaySide, awayFull, squads]);
  // Only verified players can take part in scoring (under-18 → verified guardian;
  // 18+ → own verified mobile & email). Ineligible players are kept out of the
  // scoring roster & lineups so they can't be fielded or credited stats.
  // Fast lanes Phase 3: the tournament's own age requirement (always enforced).
  const ageReq = useAgeRequirement({ tournamentId: meta.tournamentId });
  // WP3: a stand-in isn't a person, so it skips the eligibility check
  const homeScoreRoster = useMemo(() => homeRoster.filter((p) => isStandIn(p.id) || canFieldPlayer(p, ageReq)), [homeRoster, ageReq]);
  const awayScoreRoster = useMemo(() => awayRoster.filter((p) => isStandIn(p.id) || canFieldPlayer(p, ageReq)), [awayRoster, ageReq]);
  const excludedCount = (homeRoster.length - homeScoreRoster.length) + (awayRoster.length - awayScoreRoster.length);
  // MVP B3: singles / doubles sides show names on the controls and board, not
  // their short code ("Ravi / Arjun", not "RKAS"); team sports keep theirs.
  // Through the dispute mask, so a disputed player's name stays hidden.
  const individualSport = (getSport(sport).participantKind ?? 'team') !== 'team'; // omitted = a team sport
  const shownNameOf = useMemo(() => makeNameOf(people, maskValue), [people, maskValue]);
  // MVP F9: two team sides with the same code (both "KF") show their full names
  const sameCode = !individualSport && homeName === awayName && !!homeTeamName && !!awayTeamName && homeTeamName !== awayTeamName;
  // WP5: a side on stand-ins shows its team's name
  const homeShown = (homeSide?.kind === 'standin' ? homeTeamName ?? homeName : undefined) ?? (individualSport ? entryDisplayName(homeScoreRoster.map((p) => shownNameOf(p.id, p.fullName))) : undefined) ?? (sameCode ? homeTeamName! : homeName);
  const awayShown = (awaySide?.kind === 'standin' ? awayTeamName ?? awayName : undefined) ?? (individualSport ? entryDisplayName(awayScoreRoster.map((p) => shownNameOf(p.id, p.fullName))) : undefined) ?? (sameCode ? awayTeamName! : awayName);
  // MVP L9: the spectator board shows full team names when they fit the screen
  // (the Scoring tab keeps the codes, next to the buttons).
  const { width: boardW } = useWindowDimensions();
  const homeBoard = individualSport || sameCode ? homeShown : boardName(homeTeamName, homeShown, boardW);
  const awayBoard = individualSport || sameCode ? awayShown : boardName(awayTeamName, awayShown, boardW);

  // Lineup (for LiveExtras + clean sheets). Refetch on focus so edits show up.
  const [homeLineup, setHomeLineup] = useState<LineupSlot[]>([]);
  const [awayLineup, setAwayLineup] = useState<LineupSlot[]>([]);
  const [homeFormation, setHomeFormation] = useState<string | undefined>();
  const [awayFormation, setAwayFormation] = useState<string | undefined>();
  // Team size drives how many slots the blank lineup seeds (7-a-side → 7, etc.).
  // meta.config loads async, so keep it in the deps: the first focus runs before
  // the format arrives (perSide undefined → 11 slots); once it lands, re-seed.
  const lineupPerSide = meta.config?.playersPerSide ? Number(meta.config.playersPerSide) : undefined;
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (matchId) {
        getLineup(matchId, sport, lineupPerSide).then((l) => {
          if (on) {
            setHomeLineup(l.home);
            setAwayLineup(l.away);
            setHomeFormation(l.homeFormation);
            setAwayFormation(l.awayFormation);
          }
        });
      }
      return () => {
        on = false;
      };
    }, [matchId, sport, lineupPerSide])
  );

  const summary = useMemo(() => plugin.summary(state), [plugin, state]);
  // SD-20: a racket sport says "retired" / "by default" for Conceded / Awarded.
  const manualResultLine = (r: MatchResult, h: string, a: string) => baseResultLine(r, h, a, { retireTerms: !!plugin.retireTerms });
  // SD-20: the set/game line every result surface shows — "6-4, 3-2 ret." for a
  // match closed by hand, "w/o", else the completed sets.
  const resultOpts = { result: meta.result, walkover: meta.walkover };
  // (perf F-20: memoised on what they read, so a screen update that isn't a tap
  // doesn't recompute them or hand the boards new props)
  const fullLine = useMemo(
    () => (plugin.scoreLine ? matchScoreLine(plugin, state, { result: meta.result, walkover: meta.walkover }) : ''),
    [plugin, state, meta.result, meta.walkover],
  );
  // Closed by hand before the engine's own end → the board reads as final.
  const closedBoard = useMemo(() => ((meta.result || meta.walkover) && !plugin.isComplete(state)
    ? { mark: resultMark({ result: meta.result, walkover: meta.walkover }, plugin.retireTerms ? 'racket' : 'generic'), winner: meta.result?.winner ?? (meta.winner === 'home' || meta.winner === 'away' ? meta.winner : undefined) }
    : undefined), [plugin, state, meta.result, meta.walkover, meta.winner]);
  // …and the summary card reads sets/games won + the marked line, not the
  // points the match stopped at ("30 : 15").
  const closedFb = closedBoard ? finalBoard(plugin, state, resultOpts) : null;
  const shownSummary = closedFb ? { homeScore: closedFb.homeScore, awayScore: closedFb.awayScore, statusLine: 'Match Over' } : summary;
  // A match is complete if the live state says so, or it's an archived result.
  const complete = plugin.isComplete(state) || meta.status === 'completed';
  // Historical matches recorded only as a final result (no ball-by-ball log):
  // show the stored final score rather than an empty 0–0 scoreboard.
  const showFinalOnly = complete && eventCount === 0 && !!meta.score;
  // A match is underway once it has any recorded event, or the scorer hits start.
  const started = eventCount > 0 || localStarted;
  // Match-header status chip (Info tab): FINAL when done, LIVE while underway,
  // else UPCOMING. Distinct from `live` above, which means "synced to the backend".
  const matchLive = !complete && (meta.status === 'live' || started);
  // PD1–PD6 (docs/security/breaks/pairs-play-as-doubles.md): in a sport played as
  // singles or doubles the sides decide — both pairs → 2 a side, both one → 1.
  // Before the first shot it follows the sides at once; after, a banner offers it.
  const sizeFix = perSideFromRosters(getSport(sport).participantKind, homeScoreRoster.length, awayScoreRoster.length, meta.config?.playersPerSide);
  useEffect(() => {
    if (!sizeFix || !matchId || !canScore || started || complete) return;
    void setMatchFormat(matchId, { playersPerSide: sizeFix });
    setMeta((m) => ({ ...m, config: { ...((m.config as Record<string, unknown>) ?? {}), playersPerSide: sizeFix } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeFix, matchId, canScore, started, complete]);
  const switchPerSide = () => {
    if (!sizeFix || !matchId) return;
    const patch = { playersPerSide: sizeFix };
    const prev = { playersPerSide: Number(meta.config?.playersPerSide) === 2 ? 2 : 1 };
    void setMatchFormat(matchId, patch);
    // the log marker: viewers reload the format; every shot so far is replayed under it
    dispatch({ type: FORMAT_TYPE, payload: { patch, prev } });
    setMeta((m) => ({ ...m, config: { ...((m.config as Record<string, unknown>) ?? {}), ...patch } }));
  };
  const statusLabel = complete ? 'FINAL' : matchLive ? 'LIVE' : 'UPCOMING';

  // Header title reflects the match state: a completed game reads as match
  // details, a live one simply "Live", otherwise the default scoring title.
  // Perf F-20: Share reads the match through a ref kept current after every
  // render, so the header is set again only when its title changes — not on
  // every scoring tap (each setOptions re-rendered the navigator and header).
  const shareRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    const hName = homeTeamName ?? homeName;
    const aName = awayTeamName ?? awayName;
    shareRef.current = () => {
      const status = complete ? 'final' : matchLive ? 'live' : 'upcoming';
      const final = showFinalOnly && meta.score;
      // SD-20: a finished set/game match shares sets won + the marked line
      // ("2–0 · 6-4, 6-3", "1–0 · 6-4, 3-2 ret."), never the live points.
      const fb = complete && !final ? finalBoard(plugin, state, resultOpts) : null;
      const homeScore = final ? String(meta.score!.home) : fb ? fb.homeScore : summary.homeScore;
      const awayScore = final ? String(meta.score!.away) : fb ? fb.awayScore : summary.awayScore;
      const winner = complete ? (meta.winner ?? plugin.result?.(state)?.winner ?? undefined) : undefined;
      const resultLine = complete && meta.result ? manualResultLine(meta.result, hName, aName) : undefined;
      const when = meta.startsAt ? formatDateTime(meta.startsAt) : undefined;
      // Growth plan #4: Player of the match, by its public name (a possible minor by initials)
      const star = complete
        ? cardStar(storedPotm ? { id: storedPotm.playerId, name: storedPotm.name } : autoPotmNow(), [...homeFull, ...awayFull], disputedOpenIds)
        : undefined;
      // MVP 2026-10-31: on the web the same tap shares a score card picture with the text.
      void shareMessageWithCard(matchShareText({
        sportIcon: plugin.icon,
        status,
        home: hName,
        away: aName,
        homeScore,
        awayScore,
        statusLine: final ? undefined : fb ? 'Match Over' : summary.statusLine,
        detailLine: final ? undefined : fb ? fb.line : summary.detailLine,
        winner,
        resultLine,
        tournamentName: meta.tournamentName,
        when,
        venue: meta.venueName,
        matchId,
        star,
      }), 'match', () => cardPng(cardModel({
        sportName: plugin.name, status, home: hName, away: aName, homeScore, awayScore,
        statusLine: final ? undefined : fb ? 'Match Over' : summary.statusLine,
        winner, resultLine, tournamentName: meta.tournamentName, venue: meta.venueName, when, star,
      })));
    };
  });
  // ---- Growth plan #5: "Your stats from today's game" ----
  // Once the result is final (not during the ~60 s hold): a push to each player
  // with an account (once per match on this device), and a ready WhatsApp
  // message per player added by mobile number, for the scorer to send.
  const [statsMsgs, setStatsMsgs] = useState<ReturnType<typeof statsWhatsApps>>([]);
  useEffect(() => {
    if (!matchId || !complete || resultSendsAt != null || !canScore) return;
    let on = true;
    void (async () => {
      const lines = await getMatchStatLines(matchId).catch(() => [] as StatLine[]);
      const fb = finalBoard(plugin, state, resultOpts);
      const sm: StatsMatch = {
        matchId, sport, sportName: plugin.name, home: homeTeamName ?? homeName, away: awayTeamName ?? awayName,
        homeScore: fb ? fb.homeScore : String(summary.homeScore), awayScore: fb ? fb.awayScore : String(summary.awayScore),
      };
      const players = [...homeFull, ...awayFull];
      if (!on) return;
      setStatsMsgs(statsWhatsApps(sm, lines, players, { disputed: disputedOpenIds, link: matchLink(matchId) }));
      const key = `${STATS_PUSHED_KEY}${matchId}`;
      if (await AsyncStorage.getItem(key).catch(() => null)) return;
      await AsyncStorage.setItem(key, '1').catch(() => {});
      for (const push of statsPushes(sm, lines, players, { me: myPlayerId, disputed: disputedOpenIds })) void notify(push);
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, complete, resultSendsAt, canScore, homeFull, awayFull]);

  // ---- Growth plan #7: Play again + the 7-day nudge ----
  const [playingAgain, setPlayingAgain] = useState(false);
  const replay = async () => {
    if (playingAgain) return;
    if (!matchId || !profile?.id) return;
    setPlayingAgain(true);
    try {
      const next = await playAgain(matchId, profile.id);
      navigation.replace('LiveScoring', {
        matchId: next.id, sport: next.sport,
        homeName: next.homeTeam.shortName, awayName: next.awayTeam.shortName,
        homeTeamName: next.homeTeam.name, awayTeamName: next.awayTeam.name,
        homeColor: next.homeTeam.colorHex, awayColor: next.awayTeam.colorHex, canScore: true,
      });
    } catch (e) {
      notice('Couldn’t set up the next game', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPlayingAgain(false);
    }
  };
  // The nudge: set when a friendly's result is final; gone the moment they score again.
  useEffect(() => {
    if (!matchId || !canScore || meta.tournamentId) return;
    if (complete && resultSendsAt == null) {
      void scheduleNudge(replayNudge({ matchId, home: homeTeamName ?? homeName, away: awayTeamName ?? awayName, now: Date.now() }));
    } else if (!complete && eventCount > 0) {
      void cancelNudge();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, canScore, complete, resultSendsAt, eventCount > 0, meta.tournamentId]);

  // ---- Guest scoring: the format from the device, then "Save & share" (G1, G7) ----
  useEffect(() => {
    if (!guestId) return;
    let on = true;
    void guestStore.get().then((g) => {
      if (!on || !g || g.id !== guestId) return;
      setMeta((m) => ({ ...m, config: g.config, ...(g.result ? { status: 'completed' as const, result: g.result } : {}) }));
    });
    return () => { on = false; };
  }, [guestId]);
  const [guestSaving, setGuestSaving] = useState(false);
  const saveGuestGame = async () => {
    const g = await guestStore.get();
    if (!g || g.id !== guestId || guestSaving) return;
    // G4: only the person who asked has their sign-up claim it
    if (!g.claimRequested) await guestStore.set({ ...g, claimRequested: true });
    if (!authed || !profile?.id) { promptSignIn('up'); return; }
    setGuestSaving(true);
    try {
      const id = await claimThisDevicesGuestMatch(profile.id);
      if (id) {
        track('onboarding_step', { step: 'guest_game_saved' });
        navigation.replace('LiveScoring', {
          matchId: id, sport, homeName, awayName, homeTeamName, awayTeamName,
          homeColor: homeColorIn, awayColor: awayColorIn, canScore: true,
        });
      }
    } catch (e) {
      notice('Couldn’t save the game yet', `${e instanceof Error ? e.message : 'Check your connection.'} Your game is still on this phone; try again.`);
    } finally {
      setGuestSaving(false);
    }
  };
  const guestSaveRef = useRef(saveGuestGame);
  guestSaveRef.current = saveGuestGame;
  // Back from sign-up: the game they asked to save is saved straight away (G7).
  useEffect(() => {
    if (!guestId || !authed || !profile?.id) return;
    void guestStore.get().then((g) => { if (g?.id === guestId && g.claimRequested) void guestSaveRef.current(); });
  }, [guestId, authed, profile?.id]);
  const guestBar = guestMode ? (
    <View style={st.guestBar}>
      <Text style={st.guestText}>
        {authed
          ? 'This game is only on this phone. Save it to your account to share a live link.'
          : 'Not saved yet. Sign up (about a minute) to save this game and share a live link. The score so far is kept.'}
      </Text>
      <Button variant="primary" label={guestSaving ? 'Saving…' : authed ? 'Save to my account' : 'Save & share'} disabled={guestSaving} onPress={() => void saveGuestGame()} />
    </View>
  ) : null;

  const titleHome = homeTeamName ?? homeName;
  const titleAway = awayTeamName ?? awayName;
  useEffect(() => {
    const hName = titleHome;
    const aName = titleAway;
    navigation.setOptions({
      title: complete
        ? `${hName} vs ${aName} · Match Details`
        : meta.status === 'live'
        ? 'Live'
        : 'Live Scoring',
      headerRight: () => (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share this match" onPress={() => (guestMode ? guestSaveRef.current() : shareRef.current())} hitSlop={10} style={{ paddingHorizontal: theme.spacing(2) }}>
          <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.body }}>Share</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, complete, meta.status, titleHome, titleAway, guestMode]);

  // Any host of the match — or of its tournament — manages it: designates the
  // scorer and edits the XI. Per-match ownership, not a global role, and any of
  // several hosts will do (so a single point of contact never blocks things).
  // Post-match corrections (parity #05): the public log + when the match ended.
  const [scoreEdits, setScoreEdits] = useState<{ at: string; byName: string; lines: string[] }[]>([]);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!matchId) return;
    let on = true;
    void getScoreEdits(matchId).then((e) => on && setScoreEdits(e));
    // Back on this screen (e.g. from publishing a correction) → replay the log.
    if (focusedOnce.current) void refresh();
    focusedOnce.current = true;
    void getMatchEvents(matchId).then((ev) => on && setEndedAt(completedAt(ev, meta.result)));
    return () => { on = false; };
  }, [matchId, meta.result]));
  const allHostIds = useMemo(
    () => Array.from(new Set([...matchHostIds, ...(meta.tournamentHostIds ?? [])])),
    [matchHostIds, meta.tournamentHostIds]
  );
  const isHost = isMatchHost({ myPlayerId, hostIds: matchHostIds, tournamentHostIds: meta.tournamentHostIds });
  const canManage = isHost && hasMatch && !complete;
  // A team's captain / vice-captain can set their own matchday squad.
  const iLeadHome = !!myPlayerId && (homeLeaders.captainId === myPlayerId || homeLeaders.viceCaptainId === myPlayerId);
  const iLeadAway = !!myPlayerId && (awayLeaders.captainId === myPlayerId || awayLeaders.viceCaptainId === myPlayerId);
  // Who may edit a team's squad/lineup/formation. Match runners (host/organizer or
  // the scorer) can edit BOTH sides. A team's captain/vice-captain can edit ONLY
  // their own side — never the opponent's. (Coaches are stored as names with no
  // account link, so they can't be identified here; a coach who needs edit rights
  // is added as a host or made captain.)
  const canRunMatch = (canScore || canManage) && !complete;
  const canEditHome = (canRunMatch || iLeadHome) && !complete;
  const canEditAway = (canRunMatch || iLeadAway) && !complete;
  const canEditSide = (sd: 'home' | 'away') => (sd === 'home' ? canEditHome : canEditAway);
  const editableSides: ('home' | 'away')[] = [...(canEditHome ? ['home' as const] : []), ...(canEditAway ? ['away' as const] : [])];
  const canEditSquad = canEditHome || canEditAway;
  // Disputes can be reviewed/resolved by hosts, the scorer or either captain —
  // and unlike squad edits, even after full time (that's the whole point).
  const canResolveDisputes = !!myPlayerId && (isHost || canScore || iLeadHome || iLeadAway);
  // A participant (in either squad) can report another player on the field.
  const iAmInMatch = !!myPlayerId && [...homeRoster, ...awayRoster].some((p) => p.id === myPlayerId);

  // Candidate scorers = everyone in the two matchday squads (deduped).
  const scorerCandidates = useMemo(() => {
    const seen = new Set<string>();
    return [...homeRoster, ...awayRoster].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [homeRoster, awayRoster]);
  const nameOf = (id?: string) =>
    id ? [...homeFull, ...awayFull, ...scorerCandidates, ...allPlayers, ...extraPeople].find((p) => p.id === id)?.fullName : undefined;
  const personOf = (id?: string | null) =>
    id ? [...homeFull, ...awayFull, ...scorerCandidates, ...allPlayers, ...extraPeople].find((p) => p.id === id) : undefined;
  const scorerNames = scorerIds.map((id) => nameOf(id) ?? 'Scorer');
  const scorerName = scorerNames[0];
  const iAmScorer = iAmListedScorer;

  // Per-team captain/squad helpers for the matchday-squad reminders.
  const leadersFor = (sd: 'home' | 'away') => (sd === 'home' ? homeLeaders : awayLeaders);
  const squadSet = (sd: 'home' | 'away') => ((sd === 'home' ? squads?.home : squads?.away)?.starters.length ?? 0) > 0;
  const remindCaptain = (sd: 'home' | 'away') => {
    if (!matchId) return;
    const L = leadersFor(sd);
    const teamNm = sd === 'home' ? homeName : awayName;
    const label = `${homeName} vs ${awayName}`;
    [L.captainId, L.viceCaptainId]
      .filter((x): x is string => !!x)
      .forEach((pid) =>
        void notify({ title: `📋 Squad needed — ${teamNm}`, body: `Please set your matchday squad for ${label}.`, playerId: pid, matchId })
      );
    setRemindedSides((r) => ({ ...r, [sd]: true }));
  };

  // Kept in params so they survive the phone unloading the app (useParamState).
  const [pickScorer, setPickScorer] = useParamState<boolean>('addScorer', false);
  // Persist a new scorer list; revert + surface the error if the write is rejected
  // (e.g. RLS) instead of silently looking saved and reverting on reload.
  const saveScorers = useCallback(
    async (next: string[], notifyId?: string) => {
      if (!matchId) return;
      const prev = scorerIds;
      setScorerIds(next);
      try {
        await setMatchScorers(matchId, next);
      } catch (e) {
        setScorerIds(prev);
        notice('Couldn’t save scorer', e instanceof Error ? e.message : 'Please try again.');
        return;
      }
      // Tell a newly-added scorer they're on — prep reminders follow before kickoff.
      if (notifyId) {
        void notify({
          title: `🎯 You're scoring — ${homeName} vs ${awayName}`,
          body: 'You can run the live score from your device. We\'ll remind you before kickoff.',
          playerId: notifyId,
          matchId,
        });
      }
    },
    [matchId, scorerIds, homeName, awayName]
  );
  const addScorer = useCallback(
    async (id: string) => {
      if (scorerIds.includes(id)) { setPickScorer(false); return; }
      await saveScorers([...scorerIds, id], id !== myPlayerId ? id : undefined);
      setPickScorer(false);
    },
    [scorerIds, saveScorers, myPlayerId]
  );
  const removeScorer = useCallback(
    async (id: string) => saveScorers(scorerIds.filter((x) => x !== id)),
    [scorerIds, saveScorers]
  );

  // One-tap for a host who lands on a scorer-less match: jump straight to the
  // controls. Hosts score by default — opening Scoring takes the lock, which adds
  // them to the scorer list (claim_scoring), so there's nothing to set up first.
  const scoreThisMatch = useCallback(() => { setTab('scoring'); }, []);

  // Parity #11: a tournament scorer can take any of its open matches themself
  // (server-checked by join_match_as_scorer) — "a colleague's phone died".
  const tourScorerIds = useMemo(
    () => [...new Set(tourOfficials.filter((o) => o.role === 'scorer').map((o) => o.playerId))],
    [tourOfficials]
  );
  const tourRefereeIds = useMemo(
    () => [...new Set(tourOfficials.filter((o) => o.role === 'referee').map((o) => o.playerId))],
    [tourOfficials]
  );
  const [joining, setJoining] = useState(false);
  const joinAsScorer = useCallback(async () => {
    if (!matchId || joining) return;
    setJoining(true);
    try {
      const pid = await joinMatchAsScorer(matchId, myPlayerId);
      setScorerIds((ids) => (ids.includes(pid) ? ids : [...ids, pid]));
      setReloadTick((n) => n + 1);
      setTab('scoring');
    } catch (e) {
      notice('Can’t score this match yet', e instanceof Error ? e.message : 'Ask the organiser to add you as this match’s scorer');
    }
    setJoining(false);
  }, [matchId, myPlayerId, joining]);

  // Per-match officials — saved whole (small list), reverted if the write fails.
  const [officialSlot, setOfficialSlot] = useState<string | null>(null);
  const [officialName, setOfficialName] = useState('');
  const saveOfficials = useCallback(async (next: MatchOfficial[]) => {
    if (!matchId) return false;
    const prev = officials;
    setOfficials({ available: true, list: next });
    try {
      await setMatchOfficials(matchId, next);
      return true;
    } catch (e) {
      setOfficials(prev);
      notice('Couldn’t save officials', e instanceof Error ? e.message : 'Please try again.');
      return false;
    }
  }, [matchId, officials]);
  const setOfficial = useCallback(async (slot: string, o: { playerId?: string; name: string }) => {
    const name = o.name.trim();
    if (!name) return;
    const next = [...officials.list.filter((x) => x.slot !== slot), { slot, name, ...(o.playerId ? { playerId: o.playerId } : {}) }];
    if (await saveOfficials(next)) { setOfficialSlot(null); setOfficialName(''); }
  }, [officials.list, saveOfficials]);
  const removeOfficial = useCallback(
    (slot: string) => void saveOfficials(officials.list.filter((x) => x.slot !== slot)),
    [officials.list, saveOfficials]
  );

  const setHosts = useCallback(
    async (ids: string[]) => {
      if (!matchId) return;
      const prev = matchHostIds;
      setMatchHostIds(ids);
      try {
        await setMatchHosts(matchId, ids);
      } catch (e) {
        setMatchHostIds(prev);
        notice('Couldn’t save hosts', e instanceof Error ? e.message : 'Please try again.');
      }
    },
    [matchId, matchHostIds]
  );

  // Inline-editable match details (date/time · venue · format) for hosts.
  const [editInfo, setEditInfo] = useState(false);
  const [editWhen, setEditWhen] = useState<Date>(new Date());
  const [editVenue, setEditVenue] = useState('');
  const [editVenueUrl, setEditVenueUrl] = useState('');
  const [editFmt, setEditFmt] = useState<Record<string, FormatVal>>({});
  // What the form showed when opened (the match's format over today's defaults):
  // only keys the host CHANGES from this are saved, so re-saving an older match
  // never stamps it with newer defaults (e.g. basketball shot zones, netball CPR).
  const [editFmtShown, setEditFmtShown] = useState<Record<string, FormatVal>>({});
  // MVP B6 — the board under the edited format, replayed from this match's log.
  const [livePreview, setLivePreview] = useState<FormatPreview | null>(null);
  // Only from the device scoring now: its log row is what tells viewers (and
  // its own board replays under the new format at once).
  const scoringHere = canScore && (lockStat === 'mine' || lockStat === 'free' || lockStat === 'unsupported' || lockStat === 'shared');
  const liveFormatOk = canChangeLiveFormat({ canManage: canManage && scoringHere, tournamentId: meta.tournamentId, sport, live: matchLive, complete });
  useEffect(() => {
    if (!editInfo || !matchLive || !liveFormatOk || !matchId) { setLivePreview(null); return; }
    const changed = changedFormatKeys(editFmtShown, editFmt);
    if (!Object.keys(changed).length) { setLivePreview(null); return; }
    let on = true;
    void getMatchEvents(matchId).then((server) => {
      if (!on) return;
      const raw = mergeLog(server, matchOutbox.getPending(matchId));
      setLivePreview(formatChangePreview(plugin, { ...((meta.config as Record<string, unknown>) ?? {}), ...changed }, raw));
    }, () => on && setLivePreview(null));
    return () => { on = false; };
  }, [editInfo, matchLive, liveFormatOk, matchId, editFmt, editFmtShown, plugin, meta.config]);
  const openEditInfo = () => {
    setEditWhen(meta.startsAt ? new Date(meta.startsAt) : new Date());
    setEditVenue(meta.venueName ?? '');
    setEditVenueUrl(meta.venueMapsUrl ?? '');
    // defaults-on DOK4: a stats switch this match never stored shows Off (its engine reads it off)
    const shown = existingFormatShown(getSport(sport).formatFields ?? [], defaultsFor(getSport(sport).formatFields ?? [], meta.tournamentId ? 'tournament' : undefined), (meta.config as Record<string, FormatVal>) ?? {});
    setEditFmt(shown);
    setEditFmtShown(shown);
    setEditInfo(true);
  };
  const saveInfo = async () => {
    if (!matchId) return;
    const changed = changedFormatKeys(editFmtShown, editFmt);
    const fmtChanged = Object.keys(changed).length > 0;
    // MVP B6: a live friendly's format — only when the replay keeps the match going.
    if (fmtChanged && matchLive && !livePreview?.ok) return;
    await rescheduleMatch(matchId, { startsAt: editWhen.toISOString(), venueName: editVenue.trim() || null, venueMapsUrl: editVenueUrl.trim() || null });
    if (fmtChanged) await setMatchFormat(matchId, changed as Record<string, number | string | boolean>);
    if (fmtChanged && matchLive) {
      // The log marker: viewers reload the format; Undo restores `prev`.
      const prev = Object.fromEntries(Object.keys(changed).map((k) => [k, editFmtShown[k]]));
      dispatch({ type: FORMAT_TYPE, payload: { patch: changed, prev } });
    }
    setMeta((m) => ({ ...m, startsAt: editWhen.toISOString(), venueName: editVenue.trim() || undefined, venueMapsUrl: editVenueUrl.trim() || undefined, config: { ...((m.config as Record<string, unknown>) ?? {}), ...changed } }));
    setEditInfo(false);
  };

  // Keep names of people added from outside the squads (PersonPicker).
  const rememberPerson = useCallback((p: Player) => {
    setExtraPeople((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
  }, []);
  // The WhatsApp/SMS invite for someone not on SportnNote yet: what they've been
  // made, for which match, and the link — signing up with this number makes it theirs.
  const openPlayer = (playerId: string) => navigation.navigate('PlayerProfile', { playerId });
  // Tap a side's name → its team page; in singles (a "team" of one person whose
  // name is that person) → the player's own profile.
  const soloOf = (sd: 'home' | 'away') => {
    const full = sd === 'home' ? homeFull : awayFull;
    const name = sd === 'home' ? (homeTeamName ?? homeName) : (awayTeamName ?? awayName);
    return full.length === 1 && full[0].fullName === name ? full[0] : null;
  };
  const soloSides = !!soloOf('home') && !!soloOf('away');
  const openSide = (sd: 'home' | 'away') => {
    const solo = soloOf(sd);
    if (solo) { navigation.navigate('PlayerProfile', { playerId: solo.id }); return; }
    const id = sd === 'home' ? meta.homeTeamId : meta.awayTeamId;
    if (id) navigation.navigate('Team', { teamId: id });
  };

  const inviteTextFor = (role: 'scorer' | 'host' | 'official') => (name?: string) => matchRoleInviteText({
    role, name, inviterName: profile?.fullName,
    home: homeTeamName ?? homeName, away: awayTeamName ?? awayName,
    when: meta.startsAt ? formatDateTime(meta.startsAt) : undefined,
    link: matchId ? matchLink(matchId) : SHARE_BASE,
  });
  // …and for a PLAYER added by number (a dispute's "who actually played").
  const playerInvite = (name?: string) => playerInviteText({
    name, inviterName: profile?.fullName, sportName: getSport(sport).name,
    context: inviteLabel('Match', `${homeTeamName ?? homeName} vs ${awayTeamName ?? awayName}`),
    link: matchId ? matchLink(matchId) : SHARE_BASE,
  });

  // When did scoring actually begin? (first event's server time). Refetch when the
  // log changes so a fresh first-tap sets the kickoff for the restart window.
  useEffect(() => {
    let on = true;
    if (matchId && eventCount > 0) getMatchKickoffAt(matchId).then((t) => on && setKickoffAt(t));
    else setKickoffAt(null);
    return () => { on = false; };
  }, [matchId, eventCount]);
  // Tick while a live match is scoreable so the restart window closes on its own
  // even if nothing else re-renders.
  useEffect(() => {
    if (complete || !canScore) return;
    const id = setInterval(() => setNowTick(Date.now()), 20_000);
    return () => clearInterval(id);
  }, [complete, canScore]);
  const RESTART_WINDOW_MS = 5 * 60 * 1000;
  // Restart allowed while nothing is scored yet, or within 5 min of the first score.
  const canRestart = canScore && !complete && (eventCount === 0 || (kickoffAt != null && nowTick - kickoffAt < RESTART_WINDOW_MS));

  // Match stat lines feed the generic Summary (sports without their own). Refetch
  // on focus and whenever the score changes so the ratings stay current.
  const [matchStats, setMatchStats] = useState<StatLine[]>([]);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (matchId && !plugin.Summary) getMatchStatLines(matchId).then((s) => on && setMatchStats(s));
      return () => {
        on = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId, eventCount])
  );

  // Player of the Match override (parity #21): the stored matches.potm beats the
  // computed MVP (REVIEW Decision 10) and can be changed once (potm.by).
  const [storedPotm, setStoredPotm] = useState<MatchPotm | undefined>(undefined);
  const [potmOpen, setPotmOpen] = useState(false);
  useEffect(() => {
    let on = true;
    if (matchId) void getMatchPotm(matchId).then((p) => on && setStoredPotm(p));
    else setStoredPotm(undefined);
    return () => { on = false; };
  }, [matchId, reloadTick]);
  // the stored name is initials for a child (minor_names_misc) — show this viewer's name by id
  const potmProp: PotmProp | undefined = storedPotm ? { id: storedPotm.playerId, name: viewerNameOf(storedPotm.playerId, storedPotm.name), changed: !!storedPotm.by } : undefined;
  const canChangePotm = hasMatch && complete && (canScore || isHost) && !storedPotm?.by;
  // The POTM shown right now, before any override: a sport's own (cricket:
  // legacy pick, then its MVP), else the generic stat-line MVP.
  const autoPotmNow = (): { id?: string; name: string } | undefined => {
    // IDs-only scoring: a sport whose state keeps ids (cricket) names its pick by id.
    if (plugin.Summary) return plugin.autoPotm?.(state, rosterNameOf);
    const m = genericRatings(matchStats, sport, homeRoster, awayRoster).mvp;
    return m ? { id: m.id, name: m.name } : undefined;
  };
  const potmRows = (roster: Player[], color?: string): PickerRow[] =>
    roster.map((p) => ({ id: p.id, name: p.fullName, teamColor: color, detail: p.jerseyNo != null ? `#${p.jerseyNo}` : undefined }));
  const changePotm = async (row: PickerRow) => {
    if (!matchId) return;
    const cur = storedPotm ? { playerId: storedPotm.playerId, name: storedPotm.name } : (() => { const a = autoPotmNow(); return a ? { playerId: a.id, name: a.name } : undefined; })();
    if (cur?.playerId === row.id) { setPotmOpen(false); return; }
    setPotmOpen(false);
    const ok = await confirmAction('Change Player of the Match?', `From ${cur?.name ?? 'no one'} to ${row.name}. This can only be done once.`, 'Change');
    if (!ok) return;
    const next: MatchPotm = { playerId: row.id, name: row.name, ...(cur ? { auto: cur } : {}), by: myPlayerId ?? profile?.id ?? 'unknown', at: new Date().toISOString() };
    try {
      await setMatchPotm(matchId, next);
      setStoredPotm(next);
      setToast(`🏅 ${row.name} is Player of the Match`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Please try again.';
      notice(msg === AWARDS_DB_MESSAGE ? 'Needs a database update' : 'Couldn’t change Player of the Match', msg);
      if (matchId) void getMatchPotm(matchId).then(setStoredPotm);
    }
  };

  // The live screen splits into Info · Commentary · Stats · Summary · Scoring
  // for every sport (match tabs, below); old tab names map via LEGACY_TABS.
  const [tab, setTab] = useParamState<string>('tab', '');
  // null = untouched (an empty team you can fill starts open); 'closed' = user closed them.
  const [infoOpen, setInfoOpen] = useState<'home' | 'away' | 'closed' | null>(null);

  // Squad lock (parity #13): who has already taken part can't be benched — the
  // sport says who (cricket: batted/bowled/fielded), else a non-zero stat line.
  const involvedIds = async (): Promise<string[]> => {
    if (!started && eventCount === 0) return [];
    if (plugin.involvedPlayerIds) return plugin.involvedPlayerIds(state);
    if (!matchId) return [];
    const lines = await getMatchStatLines(matchId).catch(() => [] as StatLine[]);
    return [...new Set(lines.filter((l) => Object.values(l.stats ?? {}).some((v) => typeof v === 'number' && v !== 0)).map((l) => l.playerId))];
  };
  const editSquad = async (sd: 'home' | 'away') => {
    // A captain of one side must not be able to open the other side's editor.
    if (!canEditSide(sd)) return;
    const lockedIds = await involvedIds();
    const perSide = meta.config?.playersPerSide ? Number(meta.config.playersPerSide) : undefined;
    if (sport === 'cricket') {
      // Cricket's lineup is an ordered XI + wicket-keeper, not a positional court.
      return navigation.navigate('CricketLineup', {
        matchId: matchId!, sport,
        homeTeamName: homeTeamName ?? homeName, awayTeamName: awayTeamName ?? awayName, homeColor, awayColor,
        playersPerSide: perSide, editableSides, ...(lockedIds.length ? { lockedIds } : {}),
      });
    }
    // Every other sport picks who plays first (the simple Start/Bench list). For
    // sports with a pitch/court, that screen offers an optional "arrange on pitch"
    // hand-off — positions are a refinement, never the gate to picking the XI.
    return navigation.navigate('MatchSquad', {
      matchId: matchId!, side: sd, teamName: sd === 'home' ? homeTeamName ?? homeName : awayTeamName ?? awayName,
      sport, playersPerSide: perSide, teamId: sd === 'home' ? meta.homeTeamId : meta.awayTeamId,
      homeTeamName: homeTeamName ?? homeName, awayTeamName: awayTeamName ?? awayName, homeColor, awayColor,
      editableSides, ...(lockedIds.length ? { lockedIds } : {}),
    });
  };

  // ----- Match housekeeping (parity #13): breaks, quick options, uneven squads -----
  const onBreak = !complete ? meta.onBreak : undefined;
  const [quickOpen, setQuickOpen] = useState(false);
  // Undo labels batch (2026-11-03): an action applied from a Quick options tile
  // closes the sheet — even a tile that forgets its onDone. A tile that opens a
  // further step (its own panel) dispatches nothing, so the sheet stays open.
  const quickDispatch = useCallback((a: Parameters<typeof dispatch>[0]) => { scoreDispatch(a); setQuickOpen(false); }, [scoreDispatch]);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);
  const startBreak = async (kind: BreakKind, note?: string) => {
    const since = new Date().toISOString();
    setMeta((m) => ({ ...m, onBreak: { kind, ...(note ? { note } : {}), since } }));
    if (!matchId) return;
    try { await setMatchBreak(matchId, { kind, note }); } catch (e) {
      setMeta((m) => ({ ...m, onBreak: undefined }));
      notice('Couldn’t start the break', e instanceof Error ? e.message : 'Please try again.');
    }
  };
  const resumePlay = async () => {
    const prev = meta.onBreak;
    setMeta((m) => ({ ...m, onBreak: undefined }));
    if (!matchId) return;
    try { await setMatchBreak(matchId, null); } catch (e) {
      setMeta((m) => ({ ...m, onBreak: prev }));
      notice('Couldn’t resume', e instanceof Error ? e.message : 'Please try again.');
    }
  };
  const breakBanner = onBreak ? (
    <View style={st.breakBanner} accessibilityRole="text">
      <Text style={st.breakBannerText}>⏸ {breakLabel(onBreak)} · since {formatTime(onBreak.since, viewerTz)}</Text>
    </View>
  ) : null;
  // "Start the match" soft-warns when both squads are set but uneven or short.
  const [unevenAsk, setUnevenAsk] = useState<string | null>(null);
  // One-tap start (growth plan #2): the start button asks the sport's first
  // question itself — racket sports who serves, kabaddi runs the clock.
  const firstStep = startStep(sport);
  const [unevenSide, setUnevenSide] = useState<'home' | 'away' | undefined>(undefined);
  const beginMatch = (side?: 'home' | 'away') => {
    setLocalStarted(true);
    // pool: who breaks rack 1, through the sport's own stamped action
    if (firstStep === 'breaks' && side && plugin.startAction) { scoreDispatch(plugin.startAction(state, side)); return; }
    for (const a of startActions(firstStep, { side, now: Date.now() })) scoreDispatch(a);
  };
  const tryStart = (side?: 'home' | 'away') => {
    const h = squads?.home.starters.length ?? 0;
    const a = squads?.away.starters.length ?? 0;
    const need = meta.config?.playersPerSide ? Number(meta.config.playersPerSide) : 0;
    if (h > 0 && a > 0 && (h !== a || (need > 0 && (h < need || a < need)))) { setUnevenSide(side); setUnevenAsk(`${h} v ${a}`); return; }
    beginMatch(side);
  };

  // Danger zone (parity #13): delete a friendly while live / within 30 min of the
  // end, or reset a played tournament fixture. Hosts only; the server re-checks.
  const [dangerBusy, setDangerBusy] = useState(false);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [dangerTick, setDangerTick] = useState(Date.now());
  useFocusEffect(useCallback(() => {
    if (!matchId) return;
    let on = true;
    void getMatchLastActivityAt(matchId).then((t) => on && setLastActivityAt(t), () => {});
    setDangerTick(Date.now());
    return () => { on = false; };
  }, [matchId, eventCount, complete]));
  useEffect(() => {
    if (!complete || !isHost) return;
    const id = setInterval(() => setDangerTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [complete, isHost]);
  const effStatus: Match['status'] = complete ? 'completed' : meta.status === 'live' || eventCount > 0 ? 'live' : meta.status ?? 'scheduled';
  const verdict = deleteVerdict({ status: effStatus, tournamentId: meta.tournamentId, lastActivityAt }, Math.max(dangerTick, nowTick));
  const doDelete = async () => {
    if (!matchId) return;
    setDangerBusy(true);
    try {
      await deleteMatch(matchId, effStatus === 'live' || effStatus === 'completed' ? { played: true } : undefined);
      matchOutbox.clear(matchId);
      navigation.popToTop();
    } catch (e) {
      notice('Couldn’t delete', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setDangerBusy(false);
    }
  };
  const doReset = async () => {
    if (!matchId) return;
    setDangerBusy(true);
    try {
      matchOutbox.clear(matchId);
      await resetMatch(matchId);
      await refresh();
      setLocalStarted(false);
      setKickoffAt(null);
      setMeta((m) => ({ ...m, status: 'scheduled', result: undefined, winner: undefined, score: undefined, onBreak: undefined }));
      setReloadTick((n) => n + 1);
    } catch (e) {
      notice('Couldn’t reset', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setDangerBusy(false);
    }
  };

  const header = useMemo(() => (
    <View style={st.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        <SportBadge sport={plugin.id} size={26} />
        <Text style={st.sportName}>{plugin.name}</Text>
      </View>
      <Pill label={live ? 'Synced' : 'Demo'} color={live ? theme.colors.primary + '22' : theme.colors.surfaceAlt} textColor={live ? theme.colors.primary : theme.colors.textMuted} />
    </View>
  ), [plugin, live]);

  // SD-115 — name what Undo removes ("point to Federer (30-15)"), from the newest
  // logged step and the timeline events it added. A sport may name it its own
  // way (SD-133: cricket "FOUR — Rohit (4.3)"). IDs-only scoring: the step's
  // player by id, as this viewer may see them (logs keep ids, not names).
  const undoNameOf = useMemo(() => makeNameOf(maskValue.people ?? new Map(), maskValue), [maskValue]);
  // MVP B6: undoing a format change puts the old format back first (viewers
  // reload it when the row leaves the log), then pops the row.
  const sharedOn = lockStat === 'shared';
  const undoStep = useCallback(async () => {
    // Shared scoring: undoing another scorer's step asks first.
    if (undoNeedsConfirm({ shared: sharedOn, by: lastStep?.by, me: myPlayerId })) {
      const who = undoNameOf(lastStep!.by!) || 'another scorer';
      if (!(await confirmAction(`Undo ${who}’s step?`, `${who} recorded this step from their phone. Undo it for everyone?`, 'Undo'))) return;
    }
    if (lastStep?.type === FORMAT_TYPE && matchId) {
      const tail = newestEvent(mergeLog(await getMatchEvents(matchId), matchOutbox.getPending(matchId)));
      const prev = tail?.type === FORMAT_TYPE ? (tail.payload as { prev?: Record<string, number | string | boolean> } | null)?.prev : undefined;
      if (prev && Object.keys(prev).length) {
        await setMatchFormat(matchId, prev);
        setMeta((m) => ({ ...m, config: { ...((m.config as Record<string, unknown>) ?? {}), ...prev } }));
      }
    }
    await undo();
  }, [lastStep, matchId, undo, sharedOn, myPlayerId, undoNameOf]);
  // Undo labels batch (2026-11-03): a sport's own label that can't name the
  // step (null, junk, or a throw on an odd state) falls back to the shared one.
  const undoWhat = useMemo(() => (lastStep?.type === FORMAT_TYPE ? 'format change' : resolveUndoLabel(
    // DR3: the sides as the screen shows them ("Kabir / Dev"), not their codes ("KD")
    plugin.undoLabel ? () => plugin.undoLabel!(lastStep, undoNameOf, { home: homeShown, away: awayShown }) : null,
    () => undoLabel(lastStep, { home: homeShown, away: awayShown, player: undoNameOf }, (s) => {
      try { const m = plugin.summary(s as never); return m.homeScore != null && m.awayScore != null ? `${m.homeScore}-${m.awayScore}` : null; } catch { return null; }
    }),
  )), [plugin, lastStep, homeShown, awayShown, undoNameOf]);
  // Shared scoring: "Undo: pot · recorded by Ashok"
  const undoBy = undoByLabel({ shared: sharedOn, by: lastStep?.by, me: myPlayerId, nameOf: (id) => undoNameOf(id) });
  // Shared scoring: the "your tap wasn't added" note clears itself after a few seconds.
  useEffect(() => {
    if (!staleBy) return;
    const t = setTimeout(clearStale, 6000);
    return () => clearTimeout(t);
  }, [staleBy, clearStale]);
  // SD-110 — keep the phone awake while this scorer is on a match in progress.
  const focused = useIsFocused();
  useKeepAwakeWhile(focused && canScore && started && !complete && !retiredLocally);
  // SD-111 — the deciding tap's result is held ~60 s; Undo here cancels it.
  const resultHoldNote = canScore && resultSendsAt != null ? (
    <ResultHoldNote sendsAt={resultSendsAt} onUndo={undo} onSendNow={sendResultNow} />
  ) : null;
  // MVP B1: once the match has started the bar is always there (greyed out before
  // the first action), so it never appears later and pushes the controls down.
  const undoBar = canScore && (eventCount > 0 || started) ? eventCount === 0 ? (
    <View style={st.undoIdle} accessibilityLabel="Nothing to undo yet">
      <Text style={[st.undoText, { color: theme.colors.textMuted }]} numberOfLines={1}>Nothing to undo yet</Text>
    </View>
  ) : (
    // Stitch pick 2 (LS4): a box naming the last step, Undo its own pill on the right
    <View style={st.undoBox}>
      <View style={st.undoLast}>
        <Text style={st.undoLabel}>LAST STEP</Text>
        <Text style={[st.undoText, { flexShrink: 1 }]} numberOfLines={1}>{undoWhat ? `${undoWhat}${undoBy}` : `Rewind step by step${undoBy}`}</Text>
      </View>
      <TouchableOpacity style={st.undoBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Undo${undoWhat ? `: ${undoWhat}` : ` last ${sport === 'cricket' ? 'ball' : 'update'}`}${undoBy}`} accessibilityHint="Tap repeatedly to rewind to any earlier point" onPress={() => void undoStep()}>
        <IconText label="↶ Undo" style={st.undoPill} />
      </TouchableOpacity>
    </View>
  ) : null;

  // End a match by hand (parity #04): win / conceded / draw|tie / no result /
  // abandoned, with a required reason. Knockouts must produce a winner.
  const knockout = isEliminationStage(meta.stage);
  // Cricket: "Tie" in limited overs, "Draw" in a timed game (audit C1).
  const dl = plugin.manualEnd?.drawLabel;
  const drawLabel = (typeof dl === 'function' ? dl(state) : dl) ?? 'Draw';
  const endKinds: { kind: ResultKind; label: string }[] = [
    // "Awarded" — the result line reads "X awarded the match" (manualResultLine).
    // SD-20: racket sports use the ITF / BWF words — Retired (= conceded, "ret.")
    // and Default ("def.").
    ...(plugin.retireTerms
      ? [{ kind: 'conceded' as ResultKind, label: 'Retired' }, { kind: 'awarded' as ResultKind, label: 'Default' }]
      : [{ kind: 'awarded' as ResultKind, label: 'Awarded' }, { kind: 'conceded' as ResultKind, label: 'Conceded' }]),
    // MVP PD2: a racket match stopped on time — the leader wins, level is a draw.
    ...(plugin.retireTerms && plugin.lineScore ? [{ kind: 'time_up' as ResultKind, label: 'Time up' }] : []),
    ...(knockout ? [] : [
      { kind: (drawLabel === 'Tie' ? 'tie' : 'draw') as ResultKind, label: drawLabel },
      { kind: 'no_result' as ResultKind, label: 'No result' }, { kind: 'abandoned' as ResultKind, label: 'Abandoned' },
    ]),
  ];
  const needsWinner = endKind === 'awarded' || endKind === 'conceded';
  // Time up: the winner comes from the score (sets, then games), never a pick.
  const timeUpLs = endKind === 'time_up' ? plugin.lineScore?.(state) ?? null : null;
  // The organiser's tiebreak when the sets are level (a format option, founder 2026-10-31)
  const timeUpRule = timeUpRuleOf(meta.config as Record<string, unknown> | undefined);
  const timeUpWinner = timeUpLeader(timeUpLs, timeUpRule);
  const timeUpInner = timeUpLs?.unit === 'set' ? 'games' : 'points';
  const timeUpOn = !timeUpLs ? '' : timeUpLs.won.home !== timeUpLs.won.away ? `${timeUpLs.unit}s`
    : timeUpRule === 'set' ? `${timeUpInner} in the ${timeUpLs.unit} in play` : timeUpInner;
  const endReady = !!endKind && endReason.trim().length >= 3 && (!needsWinner || !!endWinner)
    && !(endKind === 'time_up' && knockout && !timeUpWinner);
  const draftResult: MatchResult | null = endKind ? {
    kind: endKind, ...(needsWinner && endWinner ? { winner: endWinner } : timeUpWinner ? { winner: timeUpWinner } : {}), reason: endReason.trim(),
    ...(plugin.manualEnd?.nrrToggle && (needsWinner || endKind === 'tie' || endKind === 'draw') ? { countNrr: endNrr } : {}),
    at: new Date().toISOString(),
  } : null;
  const fullHome = homeTeamName ?? homeName;
  const fullAway = awayTeamName ?? awayName;
  // The score overlay's preview (parity #25) — the same meta /o/<id> builds.
  const tickerMeta = useMemo<TickerMeta>(() => ({
    home: { name: fullHome, short: homeName, color: homeColor, logo: meta.homeLogo },
    away: { name: fullAway, short: awayName, color: awayColor, logo: meta.awayLogo },
    startsLabel: meta.startsAt ? formatTime(meta.startsAt, viewerTz) : undefined,
    resultLine: meta.result ? manualResultLine(meta.result, homeName, awayName) : undefined,
    result: meta.result ?? null,
    status: meta.status,
    breakLabel: meta.onBreak && !complete ? breakLabel(meta.onBreak) : undefined,
  }), [fullHome, fullAway, homeName, awayName, homeColor, awayColor, meta.homeLogo, meta.awayLogo, meta.startsAt, meta.result, meta.status, meta.onBreak, complete, viewerTz]);
  const endPreview = (() => {
    if (!draftResult || !endReady) return null;
    // SD-20: the scoreline it will be published with ("6-4, 3-2 ret.").
    const sl = plugin.scoreLine ? matchScoreLine(plugin, state, { result: draftResult }) : '';
    const line = `${manualResultLine(draftResult, fullHome, fullAway)}${sl ? ` · ${sl}` : ''}`;
    if (!meta.tournamentId) return line;
    const cfg = standingsConfigFromFormat(sport, meta.config);
    const nr = noResultPoints(sport, cfg);
    const table = isNoResult(draftResult)
      ? `both teams +${nr} (no result)`
      : endKind === 'draw' || endKind === 'tie' || (endKind === 'time_up' && !draftResult.winner)
      ? `both teams +${cfg.draw}`
      : `${draftResult.winner === 'home' ? fullHome : fullAway} +${cfg.win}`;
    // SD-126: a conceded / awarded match counts the federation forfeit score
    let ff: string | null = null;
    if (draftResult.winner && (endKind === 'conceded' || endKind === 'awarded')) {
      try {
        const won = plugin.lineScore?.(state)?.won;
        const sm = plugin.summary(state);
        const h = won ? won.home : parseInt(String(sm.homeScore), 10), a = won ? won.away : parseInt(String(sm.awayScore), 10);
        const f = forfeitFor({ sport, kind: endKind, winner: draftResult.winner, board: Number.isFinite(h) && Number.isFinite(a) ? { home: h, away: a } : null, state, format: meta.config as Record<string, unknown> | undefined });
        ff = forfeitNote({ forfeit: f }, fullHome, fullAway);
      } catch { ff = null; }
    }
    return `${line} · Points table: ${table}${ff ? ` · ${ff}` : ''}`;
  })();
  const closeEnd = () => { setRetireOpen(false); setEndKind(null); setEndWinner(null); setEndReason(''); setEndNrr(true); setEndWo(false); };
  const endMatch = async () => {
    if (!draftResult || !endReady) return;
    await endMatchWith(draftResult);
  };
  // SD-53 — also reached from a sport's Quick options (a racket default),
  // which has already asked (askConfirm); the same save as "End match".
  const endMatchWith = async (draftResult: MatchResult) => {
    const sm = plugin.summary(state);
    // SD-20: a set/game sport records the sets/games won (not the live "40"/"Ad").
    const won = plugin.lineScore?.(state)?.won;
    const h = won ? won.home : parseInt(String(sm.homeScore), 10), a = won ? won.away : parseInt(String(sm.awayScore), 10);
    const r: MatchResult = {
      ...draftResult,
      ...(Number.isFinite(h) && Number.isFinite(a) ? { score: { home: h, away: a } } : {}),
      byId: myPlayerId ?? undefined, byName: profile?.fullName ?? undefined, at: new Date().toISOString(),
    };
    if (!matchId) {
      setMeta((m) => ({ ...m, status: 'completed', result: r }));
      // G6: a guest game keeps its hand-ended result for the upload
      if (guestId) void guestStore.get().then((g) => (g && g.id === guestId ? guestStore.set({ ...g, result: r }) : undefined));
      closeEnd();
      return;
    }
    setEndBusy(true);
    try {
      // SD-133 — the hand-ended match gets the full stat sync from this state.
      await settleStatWrites().catch(() => undefined);
      const how = await endMatchManually(matchId, r, { state });
      setMeta((m) => ({ ...m, status: 'completed', result: how === 'full' ? r : undefined, winner: r.winner ?? (r.kind === 'draw' || r.kind === 'tie' || r.kind === 'time_up' ? 'draw' : undefined) }));
      if (how === 'legacy') notice('Match ended', 'Saved without the reason until the database update runs.');
      closeEnd();
    } catch (e) {
      notice('Couldn’t end the match', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setEndBusy(false);
    }
  };
  // Restart a match started/scored by mistake — only while nothing is scored yet, or
  // within the first 5 minutes of the first score. After that it's committed.
  const wipeMatch = async () => {
    await reset();
    setLocalStarted(false);
    setKickoffAt(null);
    // reset() clears the log + backend status to 'scheduled'; mirror it in the
    // screen's cached meta so the header stops showing LIVE.
    setMeta((m) => ({ ...m, status: 'scheduled' }));
  };
  // SD-106: which match-level controls show, and where (src/core/matchSafety.ts).
  // End / Restart sit in "Match controls" at the very bottom of the Scoring tab —
  // never under the scorecard — and each asks in a ConfirmSheet first.
  const safety = matchControls(sport, {
    started, complete, eventCount, canRestart, retired: retiredLocally != null, dangerVerdict: verdict.verdict, hasMatch,
  }, { canScore, isHost });
  const showCancelStart = showsControl(safety, 'cancelStart');
  const showRestart = showsControl(safety, 'restartMatch');
  const showEndEarly = showsControl(safety, 'endMatch');
  const giveWalkover = async (side: 'home' | 'away', after?: () => void) => {
    if (!matchId) return;
    if (!(await confirmMatchAction('walkover', { winner: side === 'home' ? fullHome : fullAway }))) return;
    await walkoverMatch(matchId, side);
    after?.();
    navigation.goBack();
  };
  const retireBar = showEndEarly ? (
    !retireOpen ? (
      <TouchableOpacity style={st.matchCtrlBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="End match early — asks before ending" onPress={() => setRetireOpen(true)}>
        <IconText label={"🏁 End match…"} style={st.matchCtrlText} />
        <Text style={st.matchCtrlHint}>rain, injury, retired, walkover…</Text>
      </TouchableOpacity>
    ) : (
      <View style={st.retirePanel}>
        <Text style={st.retirePrompt}>How did it end?</Text>
        <View style={st.endChips}>
          {endKinds.map((k) => <SelectChip key={k.kind} label={k.label} active={endKind === k.kind} onPress={() => { setEndKind(k.kind); setEndWo(false); if (k.kind === 'time_up' && !endReason.trim()) setEndReason('Time up'); }} />)}
          {/* Walkover (hosts): also kept on the Info tab's Match scorers card for before the start. */}
          {canManage && matchId ? <SelectChip label="🏳 Walkover" active={endWo} onPress={() => { setEndWo(true); setEndKind(null); setEndWinner(null); }} /> : null}
        </View>
        {knockout ? <Text style={textStyles.muted}>Knockout: pick who goes through.</Text> : null}
        {endWo && matchId && (
          <>
            <Text style={st.retirePrompt}>Who takes the walkover win?</Text>
            <Text style={textStyles.muted}>For a team that didn’t turn up or can’t play. No score is shown — if play had started, use Conceded instead.</Text>
            <View style={st.retireRow}>
              <Button label={homeName} style={{ flex: 1 }} onPress={() => void giveWalkover('home', closeEnd)} />
              <Button label={awayName} style={{ flex: 1 }} onPress={() => void giveWalkover('away', closeEnd)} />
            </View>
          </>
        )}
        {endKind === 'time_up' ? (
          <Text style={textStyles.muted}>
            {timeUpWinner
              ? `${timeUpWinner === 'home' ? homeName : awayName} leads on ${timeUpOn}, so wins on time.`
              : knockout ? 'Level — a knockout needs a winner, so play on.' : 'Level — it counts as a draw.'}
          </Text>
        ) : null}
        {needsWinner && (
          <>
            <Text style={st.retirePrompt}>{endKind === 'conceded' ? (plugin.retireTerms ? 'Who wins? (the other side retired)' : 'Who wins? (the other side conceded)') : plugin.retireTerms ? 'Who wins by default?' : 'Awarded to?'}</Text>
            <View style={st.retireRow}>
              <Button label={homeName} variant={endWinner === 'home' ? 'home' : 'ghost'} style={{ flex: 1 }} onPress={() => setEndWinner('home')} />
              <Button label={awayName} variant={endWinner === 'away' ? 'away' : 'ghost'} style={{ flex: 1 }} onPress={() => setEndWinner('away')} />
            </View>
          </>
        )}
        {endKind && (
          <>
            <TextField label="Reason" value={endReason} onChange={setEndReason} placeholder="e.g. heavy rain, ground unfit" />
            <View style={st.endChips}>
              {['Rain', 'Bad light', 'Ground unfit', 'Time up', 'Injury', 'Team left'].map((r) => (
                <SelectChip key={r} label={r} active={endReason === r} onPress={() => setEndReason(r)} />
              ))}
            </View>
          </>
        )}
        {plugin.manualEnd?.nrrToggle && endKind && (needsWinner || endKind === 'tie' || endKind === 'draw') ? (
          <SelectChip label="Count in NRR (all overs)" active={endNrr} onPress={() => setEndNrr(!endNrr)} />
        ) : null}
        {endPreview ? <Text style={textStyles.muted}>{endPreview}</Text> : null}
        <View style={st.retireRow}>
          <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={closeEnd} />
          {!endWo ? <Button label={endBusy ? 'Ending…' : 'End match'} variant="danger" style={{ flex: 1 }} disabled={!endReady || endBusy}
            onPress={async () => { if (await confirmMatchAction('endMatch', { detail: endPreview ? `${endPreview} — saved, and the match closes.` : undefined })) void endMatch(); }} /> : null}
        </View>
      </View>
    )
  ) : null;
  // The "Match controls" section — last thing on the Scoring tab, below every
  // scoring control and Quick options, styled unlike Undo (audit G1).
  const matchControlsNode = showCancelStart || showRestart || showEndEarly ? (
    <View style={st.matchCtrlCard} accessibilityLabel="Match controls">
      <Text style={st.matchCtrlTitle}>Match controls</Text>
      {showCancelStart ? (
        <TouchableOpacity style={st.matchCtrlBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Cancel the start — asks first"
          onPress={async () => { if (await confirmMatchAction('cancelStart')) void wipeMatch(); }}>
          <Text style={st.matchCtrlText}>↺ Not started? Cancel</Text>
          <Text style={st.matchCtrlHint}>nothing scored yet</Text>
        </TouchableOpacity>
      ) : null}
      {showRestart ? (
        <TouchableOpacity style={st.matchCtrlBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Restart match — asks first"
          onPress={async () => { if (await confirmMatchAction('restartMatch')) void wipeMatch(); }}>
          <Text style={st.matchCtrlText}>↺ Restart match</Text>
          <Text style={st.matchCtrlHint}>started by mistake · first 5 min only</Text>
        </TouchableOpacity>
      ) : null}
      {retireBar}
    </View>
  ) : null;
  // How a match closed by hand ended — saved, so it shows for everyone, every time.
  const retiredBanner = meta.result ? (
    <View style={st.retiredBanner}>
      <Text style={st.retiredText}>🏁 {manualResultLine(meta.result, fullHome, fullAway)}</Text>
    </View>
  ) : retiredLocally ? (
    <View style={st.retiredBanner}>
      <Text style={st.retiredText}>🏁 Match ended early — {retiredLocally === 'home' ? homeName : awayName} awarded the win.</Text>
    </View>
  ) : null;

  // ✎ Edit a past ball (parity #06): the sport's own correction editor, inline,
  // for the active scorer while the match is live. "Update score" = one AMEND.
  const [liveEditOpen, setLiveEditOpen] = useState(false);
  const [liveEditLog, setLiveEditLog] = useState<MatchEventRecord[]>([]);
  const [liveOps, setLiveOps] = useState<{ ops: AmendOp[]; lines: string[] }>({ ops: [], lines: [] });
  const [strikeAsk, setStrikeAsk] = useState<{ before?: string; ids: [string, string]; names: [string, string] } | null>(null);
  const liveCanWrite = canScore && (lockStat === 'mine' || lockStat === 'free' || lockStat === 'unsupported' || lockStat === 'shared');
  const pendingTaps = matchId ? matchOutbox.pendingCount(matchId) : 0;
  const openLiveEdit = async () => {
    if (!matchId) return;
    setLiveEditLog(effectiveLog(await getMatchEvents(matchId)));
    setLiveOps({ ops: [], lines: [] });
    setLiveEditOpen(true);
  };
  const crease = (st0: unknown) => {
    const c = st0 as { strikerId?: string; nonStrikerId?: string; strikerName?: string; nonStrikerName?: string } | null;
    return c?.strikerId && c.nonStrikerId ? { ids: [c.strikerId, c.nonStrikerId] as [string, string], names: [c.strikerName ?? 'Striker', c.nonStrikerName ?? 'Non-striker'] as [string, string] } : null;
  };
  const updateScore = async () => {
    const before = crease(state)?.ids[0];
    // stored in the match's public log: initials for a scorer under 18 / with no date of birth
    await amend(liveOps.ops, liveOps.lines, publicName({ fullName: profile?.fullName || 'Scorer', age: ageFromDob(profile?.dob) }));
    setLiveEditOpen(false);
    setLiveOps({ ops: [], lines: [] });
    // The rebuilt crease may differ (who faced changed) — ask who's on strike.
    setStrikeAsk({ before, ids: ['', ''], names: ['', ''] });
  };
  useEffect(() => {
    if (!strikeAsk || strikeAsk.ids[0]) return;
    const c = crease(state);
    if (!c || c.ids[0] === strikeAsk.before) { setStrikeAsk(null); return; }
    setStrikeAsk({ before: strikeAsk.before, ...c });
  }, [state, strikeAsk]);
  const liveEditBar = plugin.CorrectionEditor && matchId && liveCanWrite && !complete && eventCount > 0 && (plugin.liveCorrection?.(state) ?? true) ? (
    !liveEditOpen ? (
      <View>
        <Text style={[st.editLink, pendingTaps > 0 && { color: theme.colors.textMuted }]} accessibilityRole="button"
          accessibilityState={{ disabled: pendingTaps > 0 }}
          accessibilityHint={pendingTaps > 0 ? `Waiting for ${pendingTaps} tap${pendingTaps === 1 ? '' : 's'} to upload` : undefined}
          onPress={() => { if (pendingTaps === 0) void openLiveEdit(); }}>
          {plugin.correctionLabel ?? '✎ Edit a past ball'}
        </Text>
        {pendingTaps > 0 ? (
          <Text style={textStyles.muted}>Waiting for {pendingTaps} tap{pendingTaps === 1 ? '' : 's'} to upload… you can edit once they’re saved.</Text>
        ) : null}
      </View>
    ) : (
      <View style={st.retirePanel}>
        <plugin.CorrectionEditor log={liveEditLog} config={meta.config} ops={liveOps.ops}
          onOps={(ops, lines) => setLiveOps({ ops, lines })}
          homeName={fullHome} awayName={fullAway} homeRoster={homeScoreRoster} awayRoster={awayScoreRoster} />
        <View style={st.retireRow}>
          <Button variant="primary" label={`Update score (${liveOps.ops.length})`} style={{ flex: 1 }} disabled={liveOps.ops.length === 0} onPress={() => void updateScore()} />
          <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => { setLiveEditOpen(false); setLiveOps({ ops: [], lines: [] }); }} />
        </View>
      </View>
    )
  ) : null;
  const strikeCard = strikeAsk && strikeAsk.ids[0] ? (
    <View style={st.retirePanel}>
      <Text style={st.retirePrompt}>Who’s on strike now?</Text>
      <View style={st.retireRow}>
        {strikeAsk.ids.map((id, i) => (
          <Button key={id} label={strikeAsk.names[i]} variant="ghost" style={{ flex: 1 }}
            onPress={() => { if (i === 1) scoreDispatch({ type: 'SWAP_STRIKE' }); setStrikeAsk(null); }} />
        ))}
      </View>
    </View>
  ) : null;

  // ✏️ Correct this match (parity #05): scorers + match hosts for 24 h after the
  // end, tournament hosts anytime; never while taps are still uploading; cricket
  // waits for its own editor (#06). Plus the public Score edits log.
  const isTournamentHost = !!myPlayerId && (meta.tournamentHostIds ?? []).includes(myPlayerId);
  const mayCorrect = hasMatch && plugin.correctable !== false && canCorrectMatch({
    complete, isScorer: canScore, isMatchHost: !!myPlayerId && matchHostIds.includes(myPlayerId),
    isTournamentHost, completedAt: endedAt, now: Date.now(),
  });
  const unsynced = matchId ? matchOutbox.pendingCount(matchId) : 0;
  const timeLeft = !isTournamentHost && endedAt ? formatTimeLeft(correctionHoursLeft(endedAt, Date.now())) : '';
  const openCorrection = async () => {
    if (!matchId) return;
    if (!(await confirmAction('Fix a scoring mistake?', 'Use this only for genuine scoring mistakes. Every change you publish is listed publicly under Info → Score edits.', 'Continue'))) return;
    navigation.navigate('CorrectMatch', { matchId, sport });
  };
  const correctionCard = (mayCorrect || scoreEdits.length > 0) ? (
    <View style={st.infoCard}>
      {mayCorrect ? (
        <View style={{ gap: theme.spacing(1) }}>
          <Button label="✏️ Correct this match" variant="ghost" disabled={unsynced > 0} onPress={() => void openCorrection()} />
          <Text style={textStyles.muted}>
            {unsynced > 0 ? `Waiting for ${unsynced} tap${unsynced === 1 ? '' : 's'} to upload…` : timeLeft ? `Open for ${timeLeft} more` : 'Fix a wrongly credited player or an entry that never happened.'}
          </Text>
        </View>
      ) : null}
      {scoreEdits.length > 0 ? (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>Score edits</Text>
          {scoreEdits.map((e, i) => (
            <View key={`${e.at}${i}`} style={{ gap: 2 }}>
              <Text style={textStyles.muted}>{e.at ? formatDateTime(e.at, viewerTz) : 'Earlier'} · {e.byName}</Text>
              {e.lines.map((l) => <Text key={l} style={textStyles.body}>• {l}</Text>)}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  ) : null;

  // Perf F-20 — the sport's scorer controls (the biggest part of the Scoring
  // tab) re-render only when what they're given changes — a tap's new state —
  // not on every update of this screen (the sync status after each tap, the
  // lock poll, a toast). "End match" from the controls always runs the latest
  // endMatchWith (a ref, not a stale closure).
  const endMatchWithRef = useRef(endMatchWith);
  endMatchWithRef.current = endMatchWith;
  const endFromControls = useCallback((r: { kind: 'no_result' | 'abandoned'; reason: string }) => {
    void endMatchWithRef.current({ ...r, at: new Date().toISOString() });
  }, []);
  const controlsOnEnd = showEndEarly && !knockout ? endFromControls : undefined;
  const homeKeeperId = squads?.home.keeperId;
  const awayKeeperId = squads?.away.keeperId;
  const scoringControlsEl = useMemo(() => (
    <plugin.ScoringControls
      state={state} dispatch={scoreDispatch} homeName={homeShown} awayName={awayShown}
      homeColor={homeColor} awayColor={awayColor}
      homeRoster={homeScoreRoster} awayRoster={awayScoreRoster} homeLineup={homeLineup} awayLineup={awayLineup}
      homeKeeperId={homeKeeperId} awayKeeperId={awayKeeperId}
      knockout={knockout}
      onEndMatch={controlsOnEnd}
    />
  ), [plugin, state, scoreDispatch, homeShown, awayShown, homeColor, awayColor, homeScoreRoster, awayScoreRoster, homeLineup, awayLineup, homeKeeperId, awayKeeperId, knockout, controlsOnEnd]);
  const wouldComplete = useCallback((acts: Parameters<typeof completesMatch>[2]) => completesMatch(plugin, state, acts), [plugin, state]);
  const voiceEl = useMemo(() => (plugin.voice ? (
    <VoiceScorer
      voice={plugin.voice} state={state} dispatch={scoreDispatch}
      homeName={homeName} awayName={awayName}
      homeRoster={homeScoreRoster} awayRoster={awayScoreRoster}
      onUndo={() => void undoStep()}
      wouldComplete={wouldComplete}
    />
  ) : null), [plugin, state, scoreDispatch, homeName, awayName, homeScoreRoster, awayScoreRoster, undoStep, wouldComplete]);
  // A roster change can rename a quick game's placeholder side: reload the match too.
  const bumpRoster = useCallback(() => { setRosterNonce((n) => n + 1); setReloadTick((n) => n + 1); }, []);
  const addInviteEl = useMemo(() => (canScore && !retiredLocally && meta.homeTeamId && meta.awayTeamId ? (
    <AddInvitePlayer
      homeTeamId={meta.homeTeamId} awayTeamId={meta.awayTeamId}
      homeTeamName={homeTeamName} awayTeamName={awayTeamName}
      sport={sport} matchId={matchId} invited={invitedPlayers}
      onChanged={bumpRoster}
    />
  ) : null), [canScore, retiredLocally, meta.homeTeamId, meta.awayTeamId, homeTeamName, awayTeamName, sport, matchId, invitedPlayers, bumpRoster]);

  // team-whos-playing: before the first point, a bigger squad picks its players
  const whoPlaysEl = canScore && !complete && matchId ? (['home', 'away'] as const).map((sd) => {
            const side = sd === 'home' ? homeSide : awaySide;
            if (side?.kind !== 'standin') return null;
            const L = leadersFor(sd);
            const teamNm = sd === 'home' ? homeTeamName ?? homeName : awayTeamName ?? awayName;
            const label = `${homeName} vs ${awayName}`;
            const ask = (pid: string) => void notify({ title: `📋 Who's playing? — ${teamNm}`, body: `Please pick who plays for ${teamNm} in ${label}.`, playerId: pid, matchId });
            return (
              <WhoPlaysCard key={sd} teamName={teamNm} color={sd === 'home' ? homeColor : awayColor}
                squad={(sd === 'home' ? homeFull : awayFull).map((p) => ({ id: p.id, fullName: shownNameOf(p.id, p.fullName) }))}
                needed={doublesN} mode={pickerFor({ myPlayerId, leaders: L, role: profile?.role, isHost })}
                captainName={remindTargets(L).map((id) => nameOf(id)).filter(Boolean).slice(0, 2).join(' & ')}
                onSave={async (ids) => { await setMatchSquad(matchId, sd, { starters: ids, subs: [] }); setSquads(await getMatchSquads(matchId)); }}
                onAsk={() => remindTargets(L).forEach(ask)} onAskMember={ask} />
            );
          }) : null;

  // team-who-played (phase 4): a side that played as stand-ins says who they were —
  // one AMEND moves every point and stat to the real players (scorer / host only, WH8)
  const whoPlayedEl = canScore && matchId && eventCount > 0 ? (['home', 'away'] as const).map((sd) => {
    const side = sd === 'home' ? homeSide : awaySide;
    if (side?.kind !== 'standin') return null;
    const teamNm = sd === 'home' ? homeTeamName ?? homeName : awayTeamName ?? awayName;
    const full = sd === 'home' ? homeFull : awayFull;
    const other = (sd === 'home' ? awayRoster : homeRoster).map((p) => p.id);
    return (
      <WhoPlayedCard key={`wp-${sd}`} teamName={teamNm} color={sd === 'home' ? homeColor : awayColor}
        slots={side.players.map((p) => ({ id: p.id, fullName: p.fullName }))}
        squad={full.map((p) => ({ id: p.id, fullName: shownNameOf(p.id, p.fullName) }))}
        check={(map) => checkMapping(map, { squad: full.map((p) => p.id), alreadyPlaying: other })}
        onSave={async (map) => {
          const ops = standInAmendOps(effectiveLog(await getMatchEvents(matchId)), map);
          const names = side.players.map((p) => `${p.fullName} → ${shownNameOf(map[p.id], full.find((q) => q.id === map[p.id])?.fullName)}`).join(', ');
          if (ops.length) await amend(ops as AmendOp[], [`Who played for ${teamNm}: ${names}`], profile?.fullName ?? 'Scorer');
          await setMatchSquad(matchId, sd, { starters: side.players.map((p) => map[p.id]), subs: [] });
          setSquads(await getMatchSquads(matchId));
        }} />
    );
  }) : null;

  const controlsNode = (
    <View style={st.controls}>
      {whoPlayedEl}
      {syncing ? (
        <Text style={[textStyles.muted, { textAlign: 'center' }]}>Syncing live score…</Text>
      ) : complete && !guestMode ? (
        // Growth plan #4: the moment to share — the score card picture (web) and the link.
        <View style={{ gap: theme.spacing(3), alignItems: 'center' }}>
          <Text style={[textStyles.h3, { textAlign: 'center' }]}>Full time — final score saved</Text>
          <TouchableOpacity style={st.assignBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Share the result" onPress={() => shareRef.current()}>
            <Text style={st.assignBtnText}>Share the result</Text>
          </TouchableOpacity>
          {!meta.tournamentId && canScore && matchId ? (
            <Button label={playingAgain ? 'Setting up…' : 'Play again (same teams & rules)'} variant="ghost" disabled={playingAgain}
              accessibilityLabel="Play again" onPress={() => void replay()} />
          ) : null}
          {statsMsgs.length > 0 && (
            <View style={st.statsBox}>
              <Text style={st.retirePrompt}>Send players their stats</Text>
              <Text style={textStyles.muted}>From your WhatsApp. Players on SportnNote already got theirs.</Text>
              {statsMsgs.map((w) => (
                <View key={w.playerId} style={st.statsRow}>
                  <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{w.name}</Text>
                  <Button label="WhatsApp" variant="ghost" onPress={() => openWhatsApp(w.phone, w.text)} />
                </View>
              ))}
            </View>
          )}
        </View>
      ) : complete ? (
        <Text style={[textStyles.h3, { textAlign: 'center' }]}>Match complete — final score saved</Text>
      ) : !canScore ? (
        <View style={{ gap: theme.spacing(2), alignItems: 'center' }}>
          {scorerIds.length > 0 ? (
            <Text style={[textStyles.muted, { textAlign: 'center' }]}>👀 Viewing live — {scorerNames.join(', ')} {scorerIds.length > 1 ? 'are' : 'is'} scoring this match.</Text>
          ) : (
            <Text style={[textStyles.muted, { textAlign: 'center' }]}>
              👀 Viewing live — no scorer assigned yet.{canManage ? ' Assign one from the Info tab.' : ''}
            </Text>
          )}
        </View>
      ) : lockStat === 'other' || lockStat === 'mine-other-device' ? (
        <View style={st.lockCard}>
          <Text style={textStyles.body}>
            <Text style={{ fontWeight: '800' }}>{lockStat === 'mine-other-device' ? 'You' : lock?.holderName ?? 'Someone'}</Text>
            {lockStat === 'mine-other-device' ? ' are scoring on another device' : ' is scoring right now'}{lockAgo ? ` (last update ${lockAgo})` : ''}. One person scores at a time.
          </Text>
          <View style={st.lockBtns}>
            <TouchableOpacity style={st.assignBtn} activeOpacity={0.85} accessibilityRole="button" onPress={() => void takeOver()}>
              <Text style={st.assignBtnText}>Take over scoring</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.lockWatch} activeOpacity={0.85} accessibilityRole="button" onPress={() => setTab(watchTab)}>
              <Text style={st.lockWatchText}>Watch live</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : !started ? (
        <View style={{ gap: theme.spacing(3), alignItems: 'center' }}>
          <Text style={[textStyles.muted, { textAlign: 'center' }]}>{iAmListedScorer ? 'You’re a scorer for this match.' : 'You can score this match as a host.'}</Text>
          {whoPlaysEl ? <View style={{ alignSelf: 'stretch', gap: theme.spacing(2) }}>{whoPlaysEl}</View> : null}
          {unevenAsk ? (
            <View style={[st.retirePanel, { alignSelf: 'stretch' }]}>
              <Text style={st.retirePrompt}>Squads look uneven — {unevenAsk}. Start anyway?</Text>
              <View style={st.retireRow}>
                <Button label="Start anyway" style={{ flex: 1 }} onPress={() => { setUnevenAsk(null); beginMatch(unevenSide); }} />
                <Button label="Fix squads" variant="ghost" style={{ flex: 1 }} onPress={() => {
                  const h = squads?.home.starters.length ?? 0, a = squads?.away.starters.length ?? 0;
                  setUnevenAsk(null);
                  void editSquad(h <= a ? 'home' : 'away');
                }} />
              </View>
            </View>
          ) : firstStep === 'serve' || (firstStep === 'breaks' && plugin.startAction) ? (
            <View style={{ gap: theme.spacing(2), alignSelf: 'stretch' }}>
              <Text style={[st.retirePrompt, { textAlign: 'center' }]}>{firstStep === 'breaks' ? 'Who breaks rack 1? (the lag winner chooses)' : 'Who serves first?'}</Text>
              <View style={st.retireRow}>
                {(['home', 'away'] as const).map((side) => (
                  <TouchableOpacity key={side} style={[st.assignBtn, { flex: 1 }]} activeOpacity={0.85} accessibilityRole="button"
                    accessibilityLabel={`Start the match: ${side === 'home' ? homeShown : awayShown} ${firstStep === 'breaks' ? 'breaks' : 'serves'} first`} onPress={() => tryStart(side)}>
                    <Text style={[st.assignBtnText, { textAlign: 'center' }]} numberOfLines={2}>{`▶ ${side === 'home' ? homeShown : awayShown}`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <TouchableOpacity style={st.assignBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Start the match" onPress={() => tryStart()}>
              <IconText label={"▶ Start the match"} style={st.assignBtnText} />
            </TouchableOpacity>
          )}
        </View>
      ) : onBreak ? (
        <View style={{ gap: theme.spacing(3), alignItems: 'center' }}>
          <Text style={[textStyles.muted, { textAlign: 'center' }]}>Play is paused — {breakLabel(onBreak).toLowerCase()} since {formatTime(onBreak.since, viewerTz)}.</Text>
          <TouchableOpacity style={st.assignBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Resume play" onPress={() => void resumePlay()}>
            <IconText label={"▶ Resume play"} style={st.assignBtnText} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: theme.spacing(3) }}>
          {excludedCount > 0 && (
            <Text style={st.eligNote}>
              🔒 {excludedCount} player{excludedCount === 1 ? '' : 's'} hidden — {ageReq !== 'none'
                ? `this tournament needs every player's age ${ageReq === 'verified' ? 'verified by their school / club or a document' : 'confirmed by a parent, their school / club, or a document'}.`
                : 'only verified players can be scored (under-18 needs a verified guardian; 18+ needs verified mobile & email).'}
            </Text>
          )}
          {sizeFix && canScore && started && !complete ? (
            <View style={st.lockCard}>
              <Text style={textStyles.body}>
                {sizeFix === 2
                  ? 'Both sides have two players, but this game is being scored as singles — no one is credited with a shot.'
                  : 'Both sides have one player, but this game is being scored as doubles.'}
              </Text>
              <TouchableOpacity style={st.assignBtn} activeOpacity={0.85} accessibilityRole="button" onPress={switchPerSide}>
                <Text style={st.assignBtnText}>{sizeFix === 2 ? 'Score as doubles' : 'Score as singles'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {scoringControlsEl}
          {voiceEl}
        </View>
      )}
    </View>
  );

  // Archived result with no ball-by-ball log — a simple final-score card.
  const finalScoreNode = showFinalOnly ? (
    <View style={st.finalCard}>
      <Text style={st.finalLabel}>FINAL SCORE</Text>
      <View style={st.finalRow}>
        <Text style={[st.finalScore, { color: ensureContrast(homeColor ?? theme.colors.home, theme.colors.surface) }]}>{meta.score!.home}</Text>
        <Text style={st.finalVs}>{homeName}  ·  {awayName}</Text>
        <Text style={[st.finalScore, { color: ensureContrast(awayColor ?? theme.colors.away, theme.colors.surface) }]}>{meta.score!.away}</Text>
      </View>
      <Text style={st.finalResult}>
        {meta.winner === 'draw'
          ? 'Match drawn'
          : meta.winner
          ? `🏆 ${(meta.winner === 'home' ? homeName : awayName)} won`
          : 'Completed'}
      </Text>
    </View>
  ) : null;

  // The top scoreboard — a sport supplies its own, else the universal one. Cricket
  // hides it (its scorecard shows the score).
  const scoreboardNode = useMemo(() => (plugin.hideScoreboard ? null : plugin.Scoreboard ? (
    <plugin.Scoreboard state={state} homeName={homeBoard} awayName={awayBoard} homeColor={homeColor} awayColor={awayColor} live={matchLive} closed={closedBoard} />
  ) : (
    <Scoreboard
      summary={summary} homeName={homeBoard} awayName={awayBoard} homeColor={homeColor} awayColor={awayColor}
      live={matchLive} centerNode={plugin.LiveClock ? <plugin.LiveClock state={state} /> : undefined}
    />
  )), [plugin, state, summary, homeBoard, awayBoard, homeColor, awayColor, matchLive, closedBoard]);
  // The Scoring tab's running score (UI audit step 1, docs/security/breaks/score-bar.md):
  // one shared bar for every sport, fixed above the scroll area so it never
  // scrolls away while scoring; the side / player in play in a lime band.
  const inPlayNow = useMemo(() => {
    try { return plugin.inPlay?.(state as never, { home: homeScoreRoster.map((p) => p.id), away: awayScoreRoster.map((p) => p.id) }) ?? null; } catch { return null; }
  }, [plugin, state, homeScoreRoster, awayScoreRoster]);
  const barNameOf = useCallback((id: string) => {
    const p = [...homeScoreRoster, ...awayScoreRoster].find((x) => x.id === id);
    return p ? shownNameOf(p.id, p.fullName) : undefined;
  }, [homeScoreRoster, awayScoreRoster, shownNameOf]);
  // Pair / individual sports: the players' (mask-aware) names; teams: the full team name.
  const homeBar = individualSport && homeShown !== homeName ? homeShown : homeTeamName || homeShown;
  const awayBar = individualSport && awayShown !== awayName ? awayShown : awayTeamName || awayShown;
  const scoringBoardNode = (
    <LiveScoreBar
      summary={summary} homeName={homeBar} awayName={awayBar} homeColor={homeColor ?? theme.colors.home} awayColor={awayColor ?? theme.colors.away}
      inPlay={inPlayNow} nameOf={barNameOf} undoText={undoWhat ? `Undo: ${undoWhat}` : null} icon={plugin.icon}
      clockNode={plugin.LiveClock ? <plugin.LiveClock state={state} /> : undefined}
    />
  );

  // Match tabs (2026-10-22): the sport's slots — every one gets the same props
  // (the old LiveExtras props). docs/sport-depth/deep-wave/match-tabs.md
  const tabSlots: MatchTabs = plugin.matchTabs ?? {};
  const slotProps: LiveExtrasProps = {
    state, dispatch: scoreDispatch, canScore, matchId,
    homeName, awayName, homeColor, awayColor,
    homeRoster: homeScoreRoster, awayRoster: awayScoreRoster, homeLineup, awayLineup,
    homeManager: meta.managers?.home, awayManager: meta.managers?.away,
    homeFormation, awayFormation,
    canEditHome, canEditAway, onEditLineup: editSquad,
    onPlayer: openPlayer,
    tournamentName: meta.tournamentName, potmName: potmProp?.name,
    resultLine: meta.result ? manualResultLine(meta.result, fullHome, fullAway) : undefined,
  };
  const renderSlot = (Slot?: React.FC<LiveExtrasProps>) => (Slot ? <Slot {...slotProps} /> : null);
  // A plugin still on the single legacy widget shows it on the Stats tab.
  const LegacyExtras = !plugin.matchTabs ? plugin.LiveExtras : undefined;

  const homePlaced = homeLineup.filter((s) => s.playerId).length;
  const awayPlaced = awayLineup.filter((s) => s.playerId).length;
  // Racket sports (2026-10-22): a live doubles serve diagram — the "situation
  // now" on top of Commentary. It renders nothing in singles (one player a
  // side, changing halves every point), and a sport with it has no Lineups court.
  const serveCourtNode = plugin.ServeCourt ? (
    <plugin.ServeCourt
      state={state} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
      homeRoster={homeScoreRoster} awayRoster={awayScoreRoster} canScore={canScore} dispatch={scoreDispatch}
    />
  ) : null;
  // Info tab — squads & lineups: the sport's own lineups view (football), else
  // the generic Lineups court for a sport with a court and placed players.
  const lineupsNode = tabSlots.Info ? renderSlot(tabSlots.Info) : !plugin.ServeCourt && plugin.Court && (homeLineup.length > 0 || awayLineup.length > 0) ? (
    <View style={st.lineups}>
      <View style={st.lineupHeader}>
        <Text style={textStyles.h3}>Lineups</Text>
        <View style={st.lineupHeadRight}>
          <Text style={st.lineupCount}>{homePlaced} v {awayPlaced} placed</Text>
          {canEditHome && matchId && (
            <Text style={st.editLink} accessibilityRole="button" onPress={() => editSquad('home')}>Edit {homeName} ›</Text>
          )}
          {canEditAway && matchId && (
            <Text style={st.editLink} accessibilityRole="button" onPress={() => editSquad('away')}>Edit {awayName} ›</Text>
          )}
        </View>
      </View>
      <View style={st.legend}>
        <View style={st.legendChip}>
          <View style={[st.legendDot, { backgroundColor: homeColor ?? theme.colors.home }]} />
          <Text style={st.legendName} numberOfLines={1}>{homeName}</Text>
        </View>
        <View style={st.legendChip}>
          <View style={[st.legendDot, { backgroundColor: awayColor ?? theme.colors.away }]} />
          <Text style={st.legendName} numberOfLines={1}>{awayName}</Text>
        </View>
      </View>
      <plugin.Court homeLineup={homeLineup} awayLineup={awayLineup} homeColor={homeColor} awayColor={awayColor} />
    </View>
  ) : null;

  const noteNode = (
    <Text style={st.note}>
      {!canScore ? 'Viewer · updates arrive in realtime' : live ? (complete ? 'archived' : 'Scorer view · changes broadcast live to viewers') : 'Demo · local only — connect Supabase to broadcast'}
    </Text>
  );

  // Match tabs (2026-10-22) — every sport gets the same five, one purpose each
  // and nothing shown in two of them: Info · Commentary · Stats · Summary ·
  // Scoring. Commentary / Stats show when the sport has them (golf match play
  // has no Stats); Scoring is the scorer-only tab holding the live controls.
  // SD-23 fallback: a sport without a Stats slot still gets the shared box score.
  const fallbackBox = !tabSlots.Stats ? matchBoxSource(sport, state, { homeRoster: homeScoreRoster, awayRoster: awayScoreRoster }) : undefined;
  const hasCommentary = !!tabSlots.Commentary;
  const hasStats = !!tabSlots.Stats || !!LegacyExtras || !!fallbackBox;
  const TABS: { key: string; label: string }[] = [
    { key: 'info', label: 'Info' },
    ...(hasCommentary ? [{ key: 'commentary', label: 'Commentary' }] : []),
    ...(hasStats ? [{ key: 'stats', label: 'Stats' }] : []),
    { key: 'summary', label: 'Summary' },
    ...(canScore ? [{ key: 'scoring', label: 'Scoring' }] : []),
  ];
  // Where a viewer follows play: the feed, else the numbers, else the summary.
  const watchTab = hasCommentary ? 'commentary' : hasStats ? 'stats' : 'summary';
  // A viewer lands by the match's state — upcoming → Info, live → Commentary,
  // finished → Summary — fixed once the match has loaded, so a kick-off or the
  // final whistle never yanks them off the tab they are reading.
  const [landing, setLanding] = useState<string | null>(null);
  const loaded = !hasMatch || (!!meta.status && !syncing);
  // UI audit step 2: "Create & score now" lands already started when the sport's
  // start asks nothing (racket sports / pool keep their one-tap start question).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !loaded) return;
    if (!autoStartOnArrival(firstStep, { asked: !!route.params.startNow, canScore, started, complete })) return;
    autoStarted.current = true;
    beginMatch();
    navigation.setParams({ startNow: undefined });
  }, [loaded, firstStep, route.params.startNow, canScore, started, complete]); // eslint-disable-line react-hooks/exhaustive-deps
  const landingNow = complete ? 'summary' : started || meta.status === 'live' ? watchTab : 'info';
  useEffect(() => { if (loaded && landing == null) setLanding(landingNow); }, [loaded, landing, landingNow]);
  // Listed scorers land on Scoring; a host does too when nobody else is down to
  // score. Otherwise a host lands on the viewer's tab with Scoring one tap away.
  // A match already over when it opens lands everyone on Summary (one that ends
  // while scoring keeps the scorer on Scoring — its Undo hold is there).
  const defaultTab = canScore && (iAmListedScorer || scorerIds.length === 0) && landing !== 'summary' ? 'scoring' : (landing ?? landingNow);
  // Old tab names (saved params, links): Score / Scorecard / Box score → Stats,
  // football's Lineups → Info, Timeline / Play-by-play → Commentary.
  const legacyTab = LEGACY_TABS[tab];
  const wantedTab = legacyTab ? (TABS.some((tb) => tb.key === legacyTab) ? legacyTab : watchTab) : tab;
  const activeTab = TABS.some((tb) => tb.key === wantedTab) ? wantedTab : defaultTab;

  // Scoring lock: read it on focus and every 15 s on the Scoring tab; an allowed
  // scorer opening a match nobody is scoring takes it silently (resume = no dialog).
  useFocusEffect(useCallback(() => { void refreshLock(); }, [refreshLock]));
  // Taking the lock adds me to scorer_ids server-side (claim_scoring) — mirror it.
  const joinScorerList = useCallback(() => {
    if (myPlayerId) setScorerIds((ids) => (ids.includes(myPlayerId) ? ids : [...ids, myPlayerId]));
  }, [myPlayerId]);
  useEffect(() => {
    if (!matchId || activeTab !== 'scoring') return;
    const id = setInterval(() => { void refreshLock(); }, 15_000);
    return () => clearInterval(id);
  }, [matchId, activeTab, refreshLock]);
  useEffect(() => {
    // A host who isn't a listed scorer only takes the lock once they open Scoring
    // (just looking at their match shouldn't sign them up to score it).
    if (!matchId || !canScore || complete || lockStat !== 'free' || !deviceId) return;
    if (!iAmListedScorer && activeTab !== 'scoring') return;
    void claimScoring(matchId, { playerId: myPlayerId, playerName: profile?.fullName })
      .then((r) => { if (r.ok) joinScorerList(); return refreshLock(); })
      .catch(() => {});
  }, [matchId, canScore, iAmListedScorer, activeTab, complete, lockStat, deviceId, myPlayerId, profile?.fullName, refreshLock, joinScorerList]);
  const takeOver = async () => {
    if (!matchId) return;
    const who = lock?.holderName ?? 'the other scorer';
    if (!(await confirmAction(`Take over from ${who}?`, 'Their device will stop scoring; any taps they haven’t synced won’t be saved.', 'Take over'))) return;
    try {
      await claimScoring(matchId, { takeover: true, playerId: myPlayerId, playerName: profile?.fullName });
      joinScorerList();
      setLostTo(null);
      await refreshLock();
    } catch (e) {
      notice('Couldn’t take over', e instanceof Error ? e.message : 'Please try again.');
    }
  };
  // Shared scoring on / off (docs/security/breaks/shared-scoring.md).
  const switchShared = async (on: boolean) => {
    if (!matchId) return;
    const ok = await confirmAction(
      on ? 'Let every scorer score at once?' : 'Back to one scorer at a time?',
      on ? 'Every listed scorer can record from their own phone at the same time. If two phones tap at once, the second tap is refused and that phone is told who scored first.'
        : 'The next person to tap scores; everyone else follows along until scoring is handed over.',
      on ? 'Turn on' : 'Switch back');
    if (!ok) return;
    try {
      await setSharedScoring(matchId, on);
      await refreshLock();
    } catch (e) {
      notice('Couldn’t change how this match is scored', e instanceof Error ? e.message : 'Please try again.');
    }
  };
  const handOver = async (toId: string) => {
    if (!matchId) return;
    const toName = nameOf(toId) ?? 'them';
    if (!(await confirmAction(`Hand scoring to ${toName}?`, 'They’ll score from their next tap; this device stops scoring.', 'Hand over'))) return;
    try {
      await handoverScoring(matchId, toId, toName);
      void notify({ title: `🎯 You're scoring now — ${homeTeamName ?? homeName} vs ${awayTeamName ?? awayName}`, body: 'Open the match to keep scoring.', playerId: toId, matchId });
      await refreshLock();
    } catch (e) {
      notice('Couldn’t hand over', e instanceof Error ? e.message : 'Please try again.');
    }
  };
  // All five match tabs fit across a phone (a scrolling bar hid "Scoring" off
  // the right edge at 375 px): each tab is as wide as its label, the spare
  // width shared out; under 360 px the labels drop a size.
  const { width: winW } = useWindowDimensions();
  const scrollTabs = TABS.length > 5;
  const tightTabs = winW < 360;
  // Perf F-20 — the offline banner follows the outbox itself (no re-render from
  // this screen), and the tab bar keeps its rendered buttons until a tab, the
  // set of tabs or the width changes (not on every tap).
  const offlineBannerNode = useMemo(() => (matchId ? <OfflineSyncBanner matchId={matchId} /> : null), [matchId]);
  const tabsKey = TABS.map((t) => `${t.key}:${t.label}`).join('|');
  const tabBarNode = useMemo(() => (scrollTabs ? (
    <KeyboardAwareScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabScroll}>
      {TABS.map((t) => (
        <TouchableOpacity key={t.key} style={[st.tabChip, activeTab === t.key && st.tabActive]} activeOpacity={0.8} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: activeTab === t.key }} aria-selected={activeTab === t.key} onPress={() => setTab(t.key)}>
          <Text style={[st.tabText, activeTab === t.key && st.tabTextActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </KeyboardAwareScrollView>
  ) : (
    <View style={st.tabBar}>
      {TABS.map((t) => (
        <TouchableOpacity key={t.key} style={[st.tab, activeTab === t.key && st.tabActive]} activeOpacity={0.8} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: activeTab === t.key }} aria-selected={activeTab === t.key} onPress={() => setTab(t.key)}>
          <Text numberOfLines={1} style={[st.tabText, tightTabs && st.tabTextTight, activeTab === t.key && st.tabTextActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  )), [tabsKey, activeTab, scrollTabs, tightTabs, setTab]);
    const fmt = meta.config ?? {};
    const dateStr = meta.startsAt ? formatDateTime(meta.startsAt, viewerTz) : '—';
    // Countdown for an upcoming match — "adding to calendar" only makes sense before
    // kickoff, so the button (and this hint) show only while the match is scheduled.
    const untilStart = meta.startsAt && !started && !complete ? new Date(meta.startsAt).getTime() - Date.now() : -1;
    const startsIn = untilStart <= 0 ? null
      : untilStart < 3_600_000 ? `in ${Math.max(1, Math.round(untilStart / 60_000))} min`
      : untilStart < 86_400_000 ? `in ${Math.round(untilStart / 3_600_000)}h`
      : `in ${Math.round(untilStart / 86_400_000)} day${Math.round(untilStart / 86_400_000) === 1 ? '' : 's'}`;
    // Push this match into the viewer's own device calendar. The .ics DTSTART is
    // UTC, so every calendar shows it at the right local time automatically.
    const addToCalendar = () => {
      if (!meta.startsAt) return;
      void exportToCalendar(`${homeName}-vs-${awayName}`, [{
        uid: `match-${matchId ?? `${homeName}-${awayName}`}@sportnnote`,
        title: `${homeTeamName ?? homeName} vs ${awayTeamName ?? awayName}`,
        start: meta.startsAt,
        location: meta.venueName,
        description: [plugin.name, meta.tournamentName].filter(Boolean).join(' · '),
      }]);
    };
    const setManager = (sd: 'home' | 'away', v: string) => {
      if (!matchId) return;
      const value = v.trim() ? v : undefined;
      setMeta((m) => ({ ...m, managers: { ...(m.managers ?? {}), [sd]: value } }));
      void setMatchManagers(matchId, { [sd]: value ?? '' });
    };
    const squadCard = (sd: 'home' | 'away') => {
      const name = sd === 'home' ? homeName : awayName;
      const roster = sd === 'home' ? homeRoster : awayRoster;
      const color = (sd === 'home' ? homeColor : awayColor) ?? theme.colors.text;
      const open = infoOpen === sd || (infoOpen === null && roster.length === 0 && canEditSide(sd) && !!matchId);
      const L = leadersFor(sd);
      const set = squadSet(sd);
      const hasCaptain = !!(L.captainId || L.viceCaptainId);
      // Split the applied roster (ordered starters-then-subs) back into the two
      // groups so the sheet reads like a real team sheet; when no squad is set the
      // roster is the whole team, shown as one flat list.
      const sq = sd === 'home' ? squads?.home : squads?.away;
      const starterIds = new Set(sq?.starters ?? []);
      const starters = set ? roster.filter((p) => starterIds.has(p.id)) : roster;
      const subs = set ? roster.filter((p) => !starterIds.has(p.id)) : [];
      const count = (sq?.starters.length ?? 0) + (sq?.subs.length ?? 0);
      return (
        <View style={st.infoCard}>
          <TouchableOpacity activeOpacity={0.8} style={st.squadHead} accessibilityRole="button" accessibilityLabel={`${sd === 'home' ? homeTeamName ?? name : awayTeamName ?? name} squad — ${set ? 'set' : 'to be set'}`} accessibilityState={{ expanded: open }} aria-expanded={open} onPress={() => setInfoOpen(open ? 'closed' : sd)}>
            <View style={[st.legendDot, { backgroundColor: color }]} />
            <Text style={[textStyles.body, { flex: 1, fontWeight: '700' }]}>{sd === 'home' ? homeTeamName ?? name : awayTeamName ?? name}</Text>
            <Text style={[textStyles.muted, { color: set ? theme.colors.primary : theme.colors.textMuted }]}>
              {set ? `✓ Squad set · ${count}` : 'Squad to be set'}
            </Text>
            <Text style={st.caret}>{open ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {/* captain & the organizer's nudge to get the matchday squad in */}
          {hasCaptain && (
            <Text style={textStyles.muted}>
              {L.captainId ? `Captain: ${nameOf(L.captainId) ?? '—'}` : ''}
              {L.viceCaptainId ? `${L.captainId ? ' · ' : ''}Vice: ${nameOf(L.viceCaptainId) ?? '—'}` : ''}
              {/* C6: this match's own captain, when the squad names one */}
              {sq?.captainId && sq.captainId !== L.captainId ? `${L.captainId || L.viceCaptainId ? ' · ' : ''}This match: ${nameOf(sq.captainId) ?? '—'}` : ''}
            </Text>
          )}
          {/* Setting the XI is a pre-match task — don't nag once the match is live or done. */}
          {!set && canManage && matchId && meta.status !== 'live' && meta.status !== 'completed' && (
            hasCaptain ? (
              remindedSides[sd] ? (
                <View style={st.remindDone}>
                  <Text style={st.remindDoneText} numberOfLines={1}>✓ Reminder sent to {nameOf(L.captainId) ?? 'the captain'}{L.viceCaptainId ? ' & vice' : ''}</Text>
                  <Text style={st.remindAgain} accessibilityRole="button" onPress={() => remindCaptain(sd)}>Remind again</Text>
                </View>
              ) : (
                <TouchableOpacity style={st.remindBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Remind the captain to set the squad" onPress={() => remindCaptain(sd)}>
                  <Text style={st.remindText}>🔔 Remind {nameOf(L.captainId) ? `${nameOf(L.captainId)}` : 'captain'} to set the squad</Text>
                </TouchableOpacity>
              )
            ) : (
              <Text style={textStyles.muted}>No captain set — assign one from the team's squad page to remind them.</Text>
            )
          )}

          {open && (
            <View style={{ gap: theme.spacing(1), marginTop: theme.spacing(2) }}>
              {(() => {
                const playerRow = (p: Player) => {
                  const disputed = disputedOpenIds.has(p.id);
                  const reported = !disputed && flaggedIds.has(p.id);
                  const mine = p.id === myPlayerId;
                  // C6: this match's captain (from its squad) wins over the team's
                  const matchCap = sq?.captainId;
                  const role = p.id === (matchCap ?? L.captainId) ? 'C' : !matchCap && p.id === L.viceCaptainId ? 'V' : null;
                  const keeper = p.id === sq?.keeperId;
                  return (
                    <View key={p.id} style={st.partRow}>
                      {p.jerseyNo != null ? (
                        <View style={[st.jersey, { borderColor: color }]}><Text style={[st.jerseyNum, { color }]}>{p.jerseyNo}</Text></View>
                      ) : <View style={st.jersey} />}
                      <View style={{ flex: 1, gap: theme.spacing(1) }}>
                        <Text
                          style={[textStyles.body, disputed && st.disputedName]} numberOfLines={1}
                          {...(!disputed ? { accessibilityRole: 'link' as const, accessibilityLabel: `Open ${p.fullName}`, onPress: () => openPlayer(p.id) } : {})}
                        >
                          {disputed ? '❌ X — disputed' : p.fullName}
                          {!disputed && keeper ? '  🧤' : ''}
                          {reported ? '  ⚐ reported' : ''}
                          {p.invited && !disputed ? '  ⏳' : ''}
                        </Text>
                        {p.invited && !disputed && !reported && canEditSide(sd) ? (
                          <RemindInstall playerId={p.id} name={p.fullName} phone={p.phone} teamName={sd === 'home' ? (homeTeamName ?? homeName) : (awayTeamName ?? awayName)} />
                        ) : null}
                      </View>
                      {!disputed && role ? <View style={[st.roleTag, role === 'C' && st.roleCaptain]}><Text style={[st.roleTagText, role === 'C' && st.roleTagTextDark]}>{role}</Text></View> : null}
                      {mine && !disputed && !reported && matchId && (
                        <Text style={st.objectLink} accessibilityRole="button" accessibilityLabel="Object: I'm not in this match" onPress={() => objectToMatch(sd, p)}>🚩 Not me — object</Text>
                      )}
                      {!mine && iAmInMatch && !disputed && !reported && matchId && (
                        <Text style={st.objectLink} accessibilityRole="button" accessibilityLabel={`Report ${p.fullName}`} onPress={() => reportPlayer(sd, p)}>⚐ Report</Text>
                      )}
                    </View>
                  );
                };
                if (roster.length === 0) return <Text style={textStyles.muted}>Squad not set.</Text>;
                if (!set) return <>{roster.map(playerRow)}</>;
                return (
                  <>
                    <Text style={st.squadSection}>Starting {starters.length}</Text>
                    {starters.map(playerRow)}
                    {subs.length > 0 && <Text style={st.squadSection}>Substitutes {subs.length}</Text>}
                    {subs.map(playerRow)}
                  </>
                );
              })()}
              {/* Manager / coach — fully optional (local games often have none).
                  Set → a person row; managers can reveal the field to change it. */}
              {(() => {
                const mgr = meta.managers?.[sd];
                if (editingManager === sd && canManage && matchId) {
                  return (
                    <View style={{ marginTop: theme.spacing(2), gap: theme.spacing(1) }}>
                      <TextField label="Manager / coach (optional)" value={mgr ?? ''} onChange={(v) => setManager(sd, v)} placeholder="e.g. L. de la Fuente" autoCapitalize="words" />
                      <Text style={st.editLink} accessibilityRole="button" onPress={() => setEditingManager(null)}>Done</Text>
                    </View>
                  );
                }
                if (mgr) {
                  return (
                    <View style={st.mgrRow}>
                      <View style={st.mgrAvatar}><Text style={st.mgrAvatarText}>{scorerInitials(mgr)}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[textStyles.body, { fontWeight: '700' }]} numberOfLines={1}>{mgr}</Text>
                        <IconText label={"👤 Manager / coach"} style={textStyles.muted} />
                      </View>
                      {canManage && matchId && (
                        <Text style={st.editLink} accessibilityRole="button" onPress={() => setEditingManager(sd)}>Change</Text>
                      )}
                    </View>
                  );
                }
                if (canManage && matchId) {
                  return <Text style={[st.editLink, { marginTop: theme.spacing(2) }]} accessibilityRole="button" onPress={() => setEditingManager(sd)}>＋ Add manager / coach</Text>;
                }
                return null;
              })()}
              {canEditSide(sd) && matchId && (
                <TouchableOpacity style={st.editSquadBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={set ? 'Edit matchday squad' : 'Set matchday squad'} onPress={() => editSquad(sd)}>
                  <Text style={st.editSquadIcon}>{set ? '✎' : '＋'}</Text>
                  <Text style={st.editSquadLabel}>{set ? 'Edit matchday squad' : 'Set matchday squad'}</Text>
                  <Text style={st.editSquadChevron}>›</Text>
                </TouchableOpacity>
              )}
              {/* Populate this team right here — the natural place to look. Locked to
                  this side, so there's no Home/Away toggle to get wrong. */}
              {canEditSide(sd) && matchId && meta.homeTeamId && meta.awayTeamId && (
                <AddInvitePlayer
                  fixedSide={sd}
                  title={roster.length === 0 ? '＋ Add players to this team' : '＋ Add another player'}
                  homeTeamId={meta.homeTeamId} awayTeamId={meta.awayTeamId}
                  homeTeamName={homeTeamName} awayTeamName={awayTeamName}
                  sport={sport} matchId={matchId}
                  invited={(sd === 'home' ? homeFull : awayFull).filter((p) => p.invited)}
                  existingIds={(sd === 'home' ? homeFull : awayFull).map((p) => p.id)}
                  defaultOpen={(sd === 'home' ? homeFull : awayFull).length === 0}
                  // keep this card open after adding (it auto-opened while the team was empty)
                  onChanged={() => { setInfoOpen(sd); setRosterNonce((n) => n + 1); setReloadTick((n) => n + 1); }}
                />
              )}
            </View>
          )}
        </View>
      );
    };

    const myName = nameOf(myPlayerId ?? undefined) ?? profile?.fullName ?? 'this device';
    // Roster/known people who aren't already scorers — the "add" candidates.
    const addableScorers = scorerCandidates.filter((p) => !scorerIds.includes(p.id) && !tourScorerIds.includes(p.id));
    // Match officials (parity #11): scorers edit until full time, hosts after too.
    const canEditOfficials = hasMatch && (isHost || (canScore && !complete));
    const officialSlots = slotsFor(sport);
    const filledOfficials = officialSlots.filter((sl) => officials.list.some((o) => o.slot === sl.key));
    const officialsCard = !officials.available || (!canEditOfficials && filledOfficials.length === 0) ? null : (
      <View style={st.infoCard}>
        <Text style={textStyles.h3}>Match officials</Text>
        {(canEditOfficials ? officialSlots : filledOfficials).map((sl) => {
          const o = officials.list.find((x) => x.slot === sl.key);
          const open = officialSlot === sl.key;
          const refs = isCommentarySlot(sl.key) ? [] : tourRefereeIds.filter((id) => !officials.list.some((x) => x.playerId === id));
          return (
            <View key={sl.key} style={{ gap: theme.spacing(1) }}>
              <View style={st.officialRow}>
                <Text style={[textStyles.muted, st.officialLabel]}>{sl.label}</Text>
                <Text style={[textStyles.body, { flex: 1, fontWeight: o ? '700' : '400' }]} numberOfLines={1}>{o?.name ?? ''}</Text>
                {canEditOfficials && o && (
                  <Text style={[st.editLink, { color: theme.colors.danger }]} accessibilityRole="button" accessibilityLabel={`Remove ${o.name} as ${sl.label}`} onPress={() => removeOfficial(sl.key)}>Remove</Text>
                )}
                {canEditOfficials && !o && (
                  <Text style={st.editLink} accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open} accessibilityLabel={`Add ${sl.label}`} onPress={() => { setOfficialSlot(open ? null : sl.key); setOfficialName(''); }}>{open ? 'Close' : '＋ Add'}</Text>
                )}
              </View>
              {canEditOfficials && open && !o && (
                <View style={st.scorerPicker}>
                  {refs.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) }}>
                      {refs.map((id) => (
                        <SelectChip key={id} label={`+ ${nameOf(id) ?? 'Referee'}`} active={false} onPress={() => void setOfficial(sl.key, { playerId: id, name: nameOf(id) ?? 'Referee' })} />
                      ))}
                    </View>
                  )}
                  <PersonPicker role="official" excludeIds={officials.list.map((x) => x.playerId).filter((x): x is string => !!x)} onPick={async (p) => { rememberPerson(p); await setOfficial(sl.key, { playerId: p.id, name: p.fullName }); }} inviteText={inviteTextFor('official')} />
                  <Text style={textStyles.muted}>Or just a name:</Text>
                  <View style={{ flexDirection: 'row', gap: theme.spacing(2), alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <TextField label="" value={officialName} onChange={setOfficialName} placeholder="e.g. Mr Rao, PE teacher" autoCapitalize="words" />
                    </View>
                    <Button label="Save" onPress={() => void setOfficial(sl.key, { name: officialName })} disabled={!officialName.trim()} />
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
    const scorerCard = (
      <View style={st.infoCard}>
        <Text style={textStyles.h3}>Match scorers</Text>
        <Text style={textStyles.muted}>
          {lockStat === 'shared'
            ? 'Shared scoring is on: every scorer below can record from their own phone at the same time. If two tap at once, the second tap is refused and that phone is told.'
            : 'Several people can be allowed to score; one scores at a time, from their own device, and everyone else follows along. Add or change scorers anytime — even mid-match.'}
        </Text>
        {hasMatch && lock?.supported && !complete && canSwitchShared({ tournamentId: meta.tournamentId, isListedScorer: iAmListedScorer, isHost }) ? (
          <Text
            style={st.editLink}
            accessibilityRole="switch"
            accessibilityState={{ checked: lockStat === 'shared' }}
            accessibilityLabel="Shared scoring"
            onPress={() => void switchShared(lockStat !== 'shared')}
          >
            {lockStat === 'shared' ? '👥 Shared scoring: on · switch to one at a time' : '👥 Let several scorers score at once (shared scoring)'}
          </Text>
        ) : null}

        {/* Current scorers — each removable by a manager. */}
        {scorerIds.length === 0 ? (
          <View style={st.scorerRow}>
            <View style={st.scorerAvatar}><Glyph emoji="➕" style={st.scorerIcon} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[textStyles.body, { fontWeight: '700' }]}>No scorer yet</Text>
              <Text style={textStyles.muted} numberOfLines={1}>
                {canManage ? 'Add yourself or someone else below.' : 'Waiting for the organizer to assign a scorer.'}
              </Text>
            </View>
          </View>
        ) : (
          scorerIds.map((id) => {
            const mine = id === myPlayerId;
            return (
              <View key={id} style={st.scorerRow}>
                <View style={[st.scorerAvatar, mine && { backgroundColor: theme.colors.primary }]}>
                  <Text style={[st.scorerAvatarText, mine && { color: theme.colors.onFill }]}>{scorerInitials(nameOf(id) ?? '')}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[textStyles.body, { fontWeight: '700' }]} numberOfLines={1}>{nameOf(id) ?? 'Scorer'}{mine ? ' · you' : ''}</Text>
                  <Text style={textStyles.muted} numberOfLines={1}>{lockStat === 'shared' && !personOf(id)?.invited ? (mine ? '📱 Can score now — from this device' : 'Can score now — from their device') : mine ? (lock?.supported && lock.holderId && lock.holderId !== id ? 'Can score — someone else is scoring now' : '📱 Scoring from this device') : personOf(id)?.invited ? '⏳ Invited · hasn’t joined yet' : matchLive ? 'Scoring from their device' : 'Can score this match'}</Text>
                  {canManage && personOf(id)?.invited ? (
                    <RemindInstall playerId={id} name={nameOf(id) ?? 'Scorer'} phone={personOf(id)?.phone} message={inviteTextFor('scorer')(realName(nameOf(id)))} />
                  ) : null}
                </View>
                {lockStat === 'shared' && !complete && !personOf(id)?.invited ? (
                  <View style={st.scorerLive}><View style={st.scorerLiveDot} /><Text style={st.scorerLiveText}>CAN SCORE</Text></View>
                ) : lock?.holderId === id ? (
                  <View style={st.scorerLive}><View style={st.scorerLiveDot} /><Text style={st.scorerLiveText}>SCORING NOW</Text></View>
                ) : matchLive && lockStat === 'unsupported' ? (
                  <View style={st.scorerLive}><View style={st.scorerLiveDot} /><Text style={st.scorerLiveText}>LIVE</Text></View>
                ) : lockStat !== 'shared' && (canManage || lockStat === 'mine') && lock?.supported && !complete && !personOf(id)?.invited ? (
                  <Text style={st.editLink} accessibilityRole="button" accessibilityLabel={`Hand scoring to ${nameOf(id) ?? 'scorer'}`} onPress={() => void handOver(id)}>Hand over</Text>
                ) : null}
                {canManage && (
                  <Text style={[st.editLink, { color: theme.colors.danger }]} accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(id) ?? 'scorer'}`} onPress={() => removeScorer(id)}>Remove</Text>
                )}
              </View>
            );
          })
        )}

        {/* A tournament scorer who isn't on this match yet takes it in one tap. */}
        {!!myPlayerId && !canScore && !complete && meta.status !== 'cancelled' && tourScorerIds.includes(myPlayerId) && (
          <Button variant="primary" label={joining ? 'Joining…' : '🎯 Score this match'} onPress={() => void joinAsScorer()} disabled={joining} />
        )}

        {canManage && (
          <Text
            style={st.editLink}
            accessibilityRole="button"
            accessibilityState={{ expanded: pickScorer }} aria-expanded={pickScorer}
            onPress={() => setPickScorer(!pickScorer)}
          >
            {pickScorer ? 'Close' : '＋ Add scorer'}
          </Text>
        )}

        {canManage && pickScorer && (
          <View style={st.scorerPicker}>
            {/* The tournament's scorer pool first — one tap each. */}
            {tourScorerIds.some((id) => !scorerIds.includes(id)) && (
              <>
                <Text style={textStyles.muted}>Tournament scorers</Text>
                {tourScorerIds.filter((id) => !scorerIds.includes(id)).map((id) => (
                  <TouchableOpacity key={`t-${id}`} style={st.scorerOpt} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Add ${nameOf(id) ?? 'scorer'} as a scorer`} onPress={() => addScorer(id)}>
                    <Text style={st.scorerOptText}>🎽 {nameOf(id) ?? 'Scorer'}{id === myPlayerId ? ' · you' : ''}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            {myPlayerId && !iAmScorer && (
              <TouchableOpacity style={st.scorerOpt} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Score from this device as ${myName}`} onPress={() => addScorer(myPlayerId)}>
                <Text style={st.scorerOptText}>📱 This device — {myName}</Text>
              </TouchableOpacity>
            )}
            {addableScorers.map((p) => (
              <TouchableOpacity key={p.id} style={st.scorerOpt} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Add ${p.fullName} as a scorer`} onPress={() => addScorer(p.id)}>
                <Text style={st.scorerOptText}>＋ {p.fullName}</Text>
              </TouchableOpacity>
            ))}
            {/* Add anyone — by mobile number (invite if they're not on SportnNote) or name. */}
            <View style={{ gap: theme.spacing(2), marginTop: theme.spacing(1) }}>
              <Text style={textStyles.muted}>Or anyone — by mobile number or name:</Text>
              <PersonPicker role="scorer" excludeIds={scorerIds} onPick={(p) => { rememberPerson(p); return addScorer(p.id); }} inviteText={inviteTextFor('scorer')} />
            </View>
          </View>
        )}
        {/* Part-of-a-series banner — links back to the tie's standing. */}
        {(() => {
          const sm = seriesMetaFromFormat(rawFormat ?? meta.config);
          if (!sm) return null;
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="View the series this match belongs to"
              style={[st.reschedBanner, { backgroundColor: theme.colors.primary + '1A', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
              onPress={() => navigation.navigate('Series', { seriesId: sm.id })}
            >
              {tieRubberMeta ? (
                <Text style={[st.reschedBannerText, { flex: 1 }]}>👥 Rubber {sm.leg} of {sm.legs}{typeof rawFormat?.[TIE_KEYS.slot] === 'string' ? ` · ${rawFormat[TIE_KEYS.slot]}` : ''}</Text>
              ) : (
                <Text style={st.reschedBannerText}>🔁 {sm.name ? sm.name + ' · ' : ''}Leg {sm.leg} of {sm.legs}</Text>
              )}
              <Text style={[st.editLink, { marginTop: 0 }]}>{tieRubberMeta ? 'View tie ›' : 'View series ›'}</Text>
            </TouchableOpacity>
          );
        })()}
        {/* Postponed / cancelled banner (everyone) + reschedule entry (hosts). */}
        {(meta.status === 'postponed' || meta.status === 'cancelled') && (
          <View style={[st.reschedBanner, { backgroundColor: (meta.status === 'cancelled' ? theme.colors.danger : theme.colors.accent) + '22' }]}>
            <IconText label={meta.status === 'cancelled' ? '🚫 This match has been cancelled.' : '⏸️ This match has been postponed.'} style={st.reschedBannerText} />
          </View>
        )}
        {canManage && matchId && meta.status !== 'live' && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reschedule or postpone this match" onPress={() => navigation.navigate('EditMatch', { matchId })}>
            <Text style={[st.editLink, { marginTop: theme.spacing(2) }]}>Reschedule / postpone</Text>
          </TouchableOpacity>
        )}
        {/* Walkover — a team didn't turn up / doesn't field this sport, so the
            other side takes the win without playing. Host-only, pre-match. */}
        {canManage && matchId && meta.status !== 'live' && meta.status !== 'completed' && (
          !woOpen ? (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Record a walkover" onPress={() => setWoOpen(true)}>
              <Text style={[st.editLink, { marginTop: theme.spacing(2) }]}>Award a walkover</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ gap: theme.spacing(2), marginTop: theme.spacing(2) }}>
              <Text style={textStyles.muted}>Who takes the walkover win?</Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
                <Button label={homeName} style={{ flex: 1 }} onPress={() => void giveWalkover('home')} />
                <Button label={awayName} style={{ flex: 1 }} onPress={() => void giveWalkover('away')} />
              </View>
              <Text style={st.editLink} accessibilityRole="button" onPress={() => setWoOpen(false)}>Cancel</Text>
            </View>
          )
        )}
      </View>
    );

    // Per-match live settings (parity #14) — the sport's `liveSettings`, via the
    // generic card: football's stats-captured / half length (config mode, applies
    // at once and replays), cricket's local rules (event mode: a format patch
    // before ball 1, a SET_RULES event after it). The ⚙️ quick-options tile shows
    // the same card inside the sheet.
    const applyFormat = (patch: Record<string, number | string | boolean>) => {
      if (!matchId) return;
      void setMatchFormat(matchId, patch);
      setMeta((m) => ({ ...m, config: { ...(m.config ?? {}), ...patch } }));
    };
    const ls = plugin.liveSettings;
    // Config mode keeps the old card's audience (scorer / manager, not after the
    // match). Event mode is shown to everyone; only the allowed can edit.
    const showLiveSettings = !!ls && hasMatch && (ls.mode === 'event' || ((canScore || canManage) && !complete));
    const liveSettingsCard = (onApplied?: (msg: string) => void) => (showLiveSettings && ls ? (
      <LiveSettingsCard
        settings={ls} state={state} eventCount={eventCount}
        canScore={canScore} canManage={canManage} complete={complete}
        onPatchFormat={applyFormat} dispatch={dispatch} onApplied={onApplied} unit={settingsUnit(sport)}
      />
    ) : null);

    // Live-stream link — any host/scorer can add or change it before & during the
    // match; when set, the player pins to the top of the screen for everyone.
    const saveStream = (url: string | null) => {
      if (!matchId) return;
      void setMatchStream(matchId, url);
      setMeta((m) => ({ ...m, streamUrl: url ?? undefined }));
    };
    const streamUrl = meta.streamUrl;
    const streamPlatform = streamUrl
      ? (/(youtube\.com|youtu\.be)/i.test(streamUrl) ? '▶️ YouTube' : /twitch\.tv/i.test(streamUrl) ? '🟣 Twitch' : '🔗 Link')
      : null;
    const streamSettingsCard = hasMatch && (canScore || canManage) && !complete ? (
      <View style={st.infoCard}>
        <View style={st.streamHead}>
          <Text style={textStyles.h3}>Live stream</Text>
          {streamUrl && !editingStream ? <View style={st.streamPill}><View style={st.streamDot} /><Text style={st.streamPillText}>ON</Text></View> : null}
        </View>
        {streamUrl && !editingStream ? (
          <>
            <View style={st.streamRow}>
              <Text style={st.streamPlatform}>{streamPlatform}</Text>
              <Text style={[textStyles.muted, { flex: 1 }]} numberOfLines={1}>{streamUrl.replace(/^https?:\/\//, '')}</Text>
            </View>
            <Text style={textStyles.muted}>Pinned to the top of this match for everyone watching.</Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
              <Button label="Change" variant="ghost" style={{ flex: 1 }} onPress={() => setEditingStream(true)} />
              <Button label="Remove" variant="ghost" onPress={() => { saveStream(null); setStreamInput(''); }} />
            </View>
          </>
        ) : (
          <>
            <Text style={textStyles.muted}>Optional — paste a YouTube or Twitch link and it shows at the top of this match for everyone watching. Leave blank for none.</Text>
            <TextField
              label="Stream link"
              value={streamInput}
              onChange={setStreamInput}
              placeholder="youtu.be/… · youtube.com/live/… · twitch.tv/…"
              autoCapitalize="none"
            />
            <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
              <Button label="Save stream" style={{ flex: 1 }} onPress={() => { saveStream(safeWebUrl(streamInput)); setEditingStream(false); }} />
              {streamUrl && editingStream && <Button label="Cancel" variant="ghost" onPress={() => { setStreamInput(streamUrl); setEditingStream(false); }} />}
            </View>
          </>
        )}
      </View>
    ) : null;

    // ----- Participation disputes -----
    // Notify the people who can act on a dispute — organizers (match + tournament
    // hosts) and both captains — minus whoever raised it. In the single-device demo
    // these land in the local feed; a real backend routes each to that person.
    const notifyStakeholders = (title: string, body: string) => {
      const ids = new Set<string>(allHostIds);
      if (homeLeaders.captainId) ids.add(homeLeaders.captainId);
      if (awayLeaders.captainId) ids.add(awayLeaders.captainId);
      if (myPlayerId) ids.delete(myPlayerId);
      const recipients = [...ids];
      if (recipients.length === 0) { void notify({ title, body, matchId }); return; }
      recipients.forEach((id) => void notify({ title, body, matchId, playerId: id }));
    };
    // Who's performing dispute actions — stamped onto every audit-trail entry.
    const disputeActor = { id: myPlayerId ?? undefined, name: nameOf(myPlayerId ?? undefined) ?? profile?.fullName ?? undefined };
    const objectToMatch = (sd: 'home' | 'away', p: Player) => {
      if (!matchId || !myPlayerId) return;
      void raiseDispute({ matchId, side: sd, playerId: p.id, playerName: p.fullName, raisedBy: myPlayerId, kind: 'objection' }).then(() => {
        reloadDisputes();
        notifyStakeholders('🚩 Participation objection', `${p.fullName} says they aren't playing in ${homeName} vs ${awayName}. Their name is held as “X” — please confirm who actually played (match Info tab).`);
      });
    };
    // A peer reports someone else on the field → organizers & captains are notified.
    const reportPlayer = (sd: 'home' | 'away', p: Player) => {
      if (!matchId || !myPlayerId) return;
      const reporter = nameOf(myPlayerId) ?? profile?.fullName ?? 'A player';
      void raiseDispute({ matchId, side: sd, playerId: p.id, playerName: p.fullName, raisedBy: myPlayerId, raisedByName: reporter, kind: 'report' }).then(() => {
        reloadDisputes();
        notifyStakeholders('🚩 Participation reported', `${reporter} reported that ${p.fullName} may not have played in ${homeName} vs ${awayName}. Organizer to verify off-app, then escalate or dismiss (Info tab).`);
      });
    };
    const escalate = (d: MatchDispute) => {
      void escalateDispute(d.id, disputeActor).then(() => {
        afterResolve();
        notifyStakeholders('🚩 Reassignment needed', `A reported identity in ${homeName} vs ${awayName} was escalated — captains, please confirm who actually played.`);
      });
    };
    // Who actually played: a real person (picked by name or mobile number, so the
    // reassigned scores land on their profile), or — the marked last resort — a
    // typed name, which becomes a provisional player in that side's pool.
    const pickReplacement = (d: MatchDispute, p: Player) => {
      rememberPerson(p);
      return updateDispute(d.id, { replacementId: p.id, replacementName: p.fullName }, disputeActor).then(reloadDisputes);
    };
    const addNameReplacement = async (d: MatchDispute, nm: string) => {
      const house = d.side === 'home' ? (homeTeamName ?? homeName) : (awayTeamName ?? awayName);
      await pickReplacement(d, await createReplacementPlayer(nm, sport, house));
    };
    const afterResolve = () => {
      reloadDisputes();
      if (matchId) {
        getMatchSquads(matchId).then(setSquads);
        if (!plugin.Summary) getMatchStatLines(matchId).then(setMatchStats);
      }
    };
    const flaggedCount = openDisputes.length + reportedDisputes.length;
    const disputeBanner = flaggedCount > 0 ? (
      <TouchableOpacity style={st.disputeBanner} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Open match info to review disputes" onPress={() => setTab('info')}>
        <Text style={st.disputeBannerText}>
          {openDisputes.length > 0
            ? `🚩 ${openDisputes.length} participation ${openDisputes.length === 1 ? 'dispute' : 'disputes'} under review — affected names are held as “X”. `
            : ''}
          {reportedDisputes.length > 0 ? `⚐ ${reportedDisputes.length} ${reportedDisputes.length === 1 ? 'report' : 'reports'} awaiting organizer review. ` : ''}
          Tap to review.
        </Text>
      </TouchableOpacity>
    ) : null;
    const disputesCard = disputes.length > 0 ? (
      <View style={st.infoCard}>
        <View style={st.streamHead}>
          <Text style={textStyles.h3}>Participation disputes</Text>
          {flaggedCount > 0 ? <View style={st.disputeCount}><Text style={st.disputeCountText}>{flaggedCount} ACTIVE</Text></View> : null}
        </View>
        <Text style={textStyles.muted}>Objections (the player themselves) hide the name as “X” immediately. Reports (from a teammate or opponent) notify the organizer, who decides whether to escalate after a ground-level check. Reassigning moves the scores to whoever actually played, once both captains confirm.</Text>

        {/* Peer reports awaiting the organizer's call. */}
        {reportedDisputes.length > 0 && <Text style={st.squadSection}>Reported {reportedDisputes.length}</Text>}
        {reportedDisputes.map((d) => (
          <View key={d.id} style={st.disputeBox}>
            <View style={st.disputeTitleRow}>
              <Text style={[textStyles.body, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>{d.playerName} — {d.side === 'home' ? homeName : awayName}</Text>
              <DisputeTag kind="reported" />
            </View>
            <Text style={textStyles.muted}>Reported by {d.raisedByName ?? 'a player'}. Organizer to verify off-app, then escalate or dismiss.</Text>
            {canResolveDisputes ? (
              <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
                <Button label="Escalate (hold as X)" style={{ flex: 1 }} onPress={() => escalate(d)} />
                <Button label="Dismiss" variant="ghost" onPress={() => void dismissDispute(d.id, disputeActor).then(reloadDisputes)} />
              </View>
            ) : (
              <Text style={textStyles.muted}>Awaiting the organizer.</Text>
            )}
            <DisputeHistory events={d.history} />
          </View>
        ))}

        {openDisputes.length > 0 && <Text style={st.squadSection}>Under review {openDisputes.length}</Text>}
        {openDisputes.map((d) => {
          const sideRoster = (d.side === 'home' ? homeFull : awayFull).filter((p) => p.id !== d.playerId);
          const ready = !!d.replacementId && !!d.homeCaptainOk && !!d.awayCaptainOk;
          return (
            <View key={d.id} style={st.disputeBox}>
              <View style={st.disputeTitleRow}>
                <Text style={[textStyles.body, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>{d.playerName}’s spot — {d.side === 'home' ? homeName : awayName}</Text>
                <DisputeTag kind="open" />
              </View>
              {!canResolveDisputes ? (
                <Text style={textStyles.muted}>Awaiting both captains and the organizer to review.</Text>
              ) : (
                <>
                  <Text style={textStyles.muted}>Who actually played?</Text>
                  <View style={st.chipsWrap}>
                    {sideRoster.map((p) => (
                      <SelectChip key={p.id} label={p.fullName} active={d.replacementId === p.id}
                        onPress={() => void updateDispute(d.id, { replacementId: p.id, replacementName: p.fullName }, disputeActor).then(reloadDisputes)} />
                    ))}
                  </View>
                  <Text style={textStyles.muted}>…or someone not listed — by name or mobile number:</Text>
                  <PersonPicker
                    role="player"
                    sport={sport}
                    excludeIds={[d.playerId]}
                    cta="Played"
                    takenNote={(n) => `${n} is the player being replaced.`}
                    inviteText={playerInvite}
                    onPick={(p) => pickReplacement(d, p)}
                    onNameOnly={(nm) => addNameReplacement(d, nm)}
                  />
                  <Text style={textStyles.muted}>Both captains must confirm:</Text>
                  <View style={st.chipsWrap}>
                    <SelectChip label={`${d.homeCaptainOk ? '✓ ' : ''}${homeName} captain`} active={!!d.homeCaptainOk}
                      onPress={() => void updateDispute(d.id, { homeCaptainOk: !d.homeCaptainOk }, disputeActor).then(reloadDisputes)} />
                    <SelectChip label={`${d.awayCaptainOk ? '✓ ' : ''}${awayName} captain`} active={!!d.awayCaptainOk}
                      onPress={() => void updateDispute(d.id, { awayCaptainOk: !d.awayCaptainOk }, disputeActor).then(reloadDisputes)} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: theme.spacing(2) }}>
                    <Button label={d.replacementName ? `Reassign to ${d.replacementName}` : 'Reassign'} style={{ flex: 1 }} disabled={!ready}
                      onPress={() => void resolveDispute(d.id, disputeActor).then(afterResolve)} />
                    <Button label="Dismiss" variant="ghost" onPress={() => void dismissDispute(d.id, disputeActor).then(reloadDisputes)} />
                  </View>
                  {!ready && <Text style={textStyles.muted}>Pick who played and get both captains to confirm to enable reassignment.</Text>}
                </>
              )}
              <DisputeHistory events={d.history} />
            </View>
          );
        })}

        {settledDisputes.length > 0 && (
          <>
            <Text style={st.squadSection}>Resolved &amp; dismissed {settledDisputes.length}</Text>
            {settledDisputes.map((d) => (
              <View key={d.id} style={[st.disputeBox, { opacity: 0.85 }]}>
                <View style={st.disputeTitleRow}>
                  <Text style={[textStyles.body, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>
                    {d.playerName} — {d.side === 'home' ? homeName : awayName}
                    {d.status === 'resolved' && d.replacementName ? ` → ${d.replacementName}` : ''}
                  </Text>
                  <DisputeTag kind={d.status === 'resolved' ? 'resolved' : 'dismissed'} />
                </View>
                <DisputeHistory events={d.history} />
              </View>
            ))}
          </>
        )}
      </View>
    ) : null;

    const dangerZone = hasMatch && isHost && verdict.verdict !== 'none' ? (
      <View style={[st.infoCard, st.dangerCard]}>
        <Text style={[textStyles.h3, st.dangerTitle]}>Danger zone</Text>
        {verdict.verdict === 'delete' ? (
          <Text style={textStyles.muted}>
            {verdict.minutesLeft != null ? `Delete available for ${verdict.minutesLeft} more min.` : effStatus === 'live' ? 'Started by mistake or a test match? Delete it.' : 'Not played yet — you can delete it.'}
          </Text>
        ) : (
          <Text style={textStyles.muted}>
            A tournament fixture can’t be deleted (it would leave a hole in the fixtures). Reset it to not started instead{verdict.minutesLeft != null ? ` — available for ${verdict.minutesLeft} more min` : ''}.
          </Text>
        )}
        <Button label={dangerBusy ? 'Working…' : verdict.verdict === 'delete' ? '🗑 Delete match' : '↺ Reset fixture to not started'} variant="danger" disabled={dangerBusy}
          onPress={async () => {
            const del = verdict.verdict === 'delete';
            if (await confirmMatchAction(del ? 'deleteMatch' : 'resetFixture')) void (del ? doDelete() : doReset());
          }} />
      </View>
    ) : null;

    return (
      <SafeAreaView style={st.safe} edges={['top']}>
       <DisputeMaskProvider value={maskValue}>
        {activeTab === 'scoring' && started && !complete && !showFinalOnly ? scoringBoardNode : null}
        <KeyboardAwareScrollView contentContainerStyle={st.content}>
          {header}
          {/* SD-155: screen readers hear every score change (polite live region). */}
          <LiveAnnouncer message={scoreSentence(homeTeamName ?? homeName, shownSummary.homeScore, awayTeamName ?? awayName, shownSummary.awayScore, shownSummary.statusLine)} />
          {/* Optional live stream — pinned at the very top when the organizer set one. */}
          {!!meta.streamUrl && <LiveStream url={meta.streamUrl} live={meta.status === 'live'} />}
          {disputeBanner}
          {/* Score pinned above the tabs so it stays visible on every tab
              (cricket hides it — its scorecard shows the score). On the Scoring
              tab a compact MiniScore replaces it (rendered by the controls), so
              the score sits next to the buttons instead of being duplicated. */}
          {breakBanner}
          {showFinalOnly ? finalScoreNode : (activeTab === 'scoring' && started && !complete ? null : scoreboardNode)}
          {/* No scorer yet + I can manage → surface the primary action up front so a
              host isn't left wondering how to score their own match. One tap makes me
              the scorer and opens the controls; the scorer is still changeable in Info. */}
          {canManage && !complete && scorerIds.length === 0 && !!myPlayerId && activeTab !== 'scoring' && (
            <TouchableOpacity style={st.scoreCta} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Score this match from this device" onPress={scoreThisMatch}>
              <IconText label={"▶ Score this match"} style={st.scoreCtaText} />
              <Text style={st.scoreCtaHint}>No scorer assigned yet. Tap to score from this device — you can hand off to someone else anytime from Info.</Text>
            </TouchableOpacity>
          )}
          {tabBarNode}

          {/* Commentary — the live event-by-event feed only, with a small
              "situation now" on top (racket doubles' serve diagram, cricket's
              This over). Key moments are a filter inside the feed. */}
          {activeTab === 'commentary' && (
            <View style={{ gap: theme.spacing(3) }}>
              {serveCourtNode}
              {renderSlot(tabSlots.Situation)}
              {renderSlot(tabSlots.Commentary)}
            </View>
          )}

          {/* Stats — team comparison, box scores / scorecards, charts and their
              period / category filters; then the shared Game flow (SD-50). */}
          {activeTab === 'stats' && (
            <View style={{ gap: theme.spacing(3) }}>
              {tabSlots.Stats ? renderSlot(tabSlots.Stats) : LegacyExtras ? <LegacyExtras {...slotProps} /> : null}
              {/* SD-23 fallback: the shared box score (+ team comparison) for a
                  sport without a Stats slot of its own. */}
              {started && fallbackBox ? (
                <MatchBoxScore
                  sport={sport} source={fallbackBox} homeName={homeName} awayName={awayName}
                  homeColor={homeColor} awayColor={awayColor} onPlayer={openPlayer}
                />
              ) : null}
              {/* SD-50: game flow (lead changes, times tied, runs, bench points) —
                  running-score sports only; renders nothing otherwise. */}
              {started && !tabSlots.ownGameFlow ? (
                <GameFlowCard sport={sport} state={state} homeName={homeName} awayName={awayName}
                  homeColor={homeColor} awayColor={awayColor} homeLineup={homeLineup} awayLineup={awayLineup} />
              ) : null}
            </View>
          )}

          {/* Scoring — the scorer's controls only (the match identity, the
              result and the stats live on their own tabs). */}
          {activeTab === 'scoring' && (
            <>
              {matchId && canScore && (lostTo || rejectedCount > 0) ? (
                <View style={[st.syncBanner, st.syncOffline]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.syncTitle}>{lockStat === 'shared' ? 'Another scorer recorded steps while these taps waited' : `Scoring moved to ${lock?.holderName ?? lostTo ?? 'another device'}`}</Text>
                    {rejectedCount > 0 ? <Text style={st.syncSub}>{rejectedCount === 1 ? '1 unsynced tap from this device wasn’t saved.' : `${rejectedCount} unsynced taps from this device weren’t saved.`}</Text> : null}
                  </View>
                  {rejectedCount > 0 ? (
                    <TouchableOpacity style={st.syncBtn} activeOpacity={0.8} accessibilityRole="button" onPress={async () => { if (await confirmMatchAction('discardTaps', { count: rejectedCount })) void discardRejected(); }}>
                      <Text style={st.syncBtnText}>Discard</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={st.syncBtnText} accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setLostTo(null)}>✕</Text>
                  )}
                </View>
              ) : null}
              {matchId && canScore && rejectedCount === 0 ? offlineBannerNode : null}
              {/* Shared scoring: this phone's tap / Undo came after another scorer's step */}
              {matchId && canScore && staleBy ? (
                <View style={[st.syncBanner, st.syncOffline]} accessibilityLiveRegion="polite">
                  <View style={{ flex: 1 }}>
                    <Text style={st.syncTitle}>{staleMessage(staleBy.by ? nameOf(staleBy.by) ?? undoNameOf(staleBy.by) : null)}</Text>
                    <Text style={st.syncSub}>The board now shows their step. Tap again if yours still applies.</Text>
                  </View>
                  <Text style={st.syncBtnText} accessibilityRole="button" accessibilityLabel="Dismiss" onPress={clearStale}>✕</Text>
                </View>
              ) : null}
              {/* Running score, so the scorer never leaves this tab to check the
                  state. The big board above the tabs is suppressed here to avoid
                  duplication. Sports with a broadcast board (tennis/volleyball/
                  badminton/basketball/kabaddi) show the same line-score the viewer
                  sees; football/cricket keep the compact one-row MiniScore. */}
              {guestBar}
              {resultHoldNote}
              {undoBar ? <CapturedFlash>{undoBar}</CapturedFlash> : null}
              {liveEditBar}
              {strikeCard}
              {addInviteEl}
              {!retiredLocally && controlsNode}
              {/* After the match: a sport's tidy-up tools (chess: attach the moves). */}
              {complete && canScore ? renderSlot(tabSlots.AfterMatch) : null}
              {/* ☰ Quick options (parity #13): breaks, squad, scorer, scorecard, sport tiles. */}
              {canScore && started && !complete && !retiredLocally && (
                <TouchableOpacity style={st.quickBar} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Quick options" onPress={() => setQuickOpen(true)}>
                  <Text style={st.quickBarText}>☰ Quick options</Text>
                </TouchableOpacity>
              )}
              {/* SD-106: End / Restart live here, at the very bottom, behind a confirm. */}
              {matchControlsNode}
            </>
          )}

          {/* Info — when · where · format · hosts / officials · squads & lineups. */}
          {activeTab === 'info' && (
            <View style={{ gap: theme.spacing(3) }}>
              {correctionCard}
              <View style={st.infoCard}>
                <MatchHeader
                  sportIcon={plugin.icon} sportName={plugin.name}
                  statusLabel={statusLabel} matchLive={matchLive} complete={complete}
                  homeName={homeTeamName ?? homeName} awayName={awayTeamName ?? awayName}
                  homeColor={homeColor} awayColor={awayColor}
                  hasMatch={hasMatch} logoUrl={meta.logoUrl} canManage={canManage}
                  onPickLogo={async (url) => { if (matchId) { await setMatchLogo(matchId, url); setMeta((m) => ({ ...m, logoUrl: url })); } }}
                  onTeamPress={meta.homeTeamId && meta.awayTeamId ? openSide : undefined}
                  teamLinkLabel={soloSides ? 'Player profile ›' : 'Team profile ›'}
                />
                {!editInfo ? (
                  <>
                    <InfoRow icon="📋" label="Format" value={formatLine(sport, fmt)} />
                    {/* info-chain IC1 / IC2: every rule and every capture, for everyone, live and after */}
                    {(() => {
                      const formatFields = getSport(sport).formatFields ?? [];
                      const cap = matchCaptures(plugin.liveSettings as never, state, formatFields, fmt);
                      const rules = [...(hasMatch ? [scoringRule(lockStat === 'shared')] : []), ...matchRules(formatFields, fmt, { omit: liveOwnedKeys(plugin.liveSettings as never) }), ...cap.rules];
                      return rules.length || cap.captures.length ? <RulesCard rules={rules} captures={cap.captures} /> : null;
                    })()}
                    <InfoRow icon="📅" label="Date" value={dateStr} />
                    <InfoRow
                      icon="📍" label="Venue"
                      value={meta.venueName ?? '—'}
                      onPress={meta.venueName ? () => openVenue(meta.venueName, meta.venueMapsUrl) : undefined}
                      accessibilityLabel={meta.venueName ? `Open ${meta.venueName} in maps` : undefined}
                    />
                    {viewsLabel(views) ? <InfoRow icon="👁" label="Views" value={viewsLabel(views)!} /> : null}
                    {meta.tournamentName && meta.tournamentId && (
                      <InfoRow
                        icon="🏆" label="Tournament"
                        value={`${meta.tournamentName} ›`}
                        onPress={() => navigation.navigate('Tournament', { tournamentId: meta.tournamentId! })}
                        accessibilityLabel={`Open ${meta.tournamentName}`}
                      />
                    )}
                    {canManage && !complete && matchId && (
                      <Text style={[st.editLink, { marginTop: theme.spacing(2) }]} accessibilityRole="button" onPress={openEditInfo}>Edit date, venue &amp; format</Text>
                    )}
                    {meta.startsAt && !started && !complete && (
                      <View style={{ marginTop: theme.spacing(2), gap: theme.spacing(2) }}>
                        {startsIn ? <Text style={st.kickoffHint}>⏱ Starts {startsIn}</Text> : null}
                        <Button label="📅 Add to my calendar" variant="ghost" onPress={addToCalendar} />
                      </View>
                    )}
                    {/* SD-47 — head-to-head: singles = player vs player, else team vs team */}
                    {(() => {
                      const singles = getSport(sport).participantKind !== 'team' && homeRoster.length === 1 && awayRoster.length === 1;
                      const params = singles
                        ? { sport, a: homeRoster[0].id, b: awayRoster[0].id, aName: homeRoster[0].fullName, bName: awayRoster[0].fullName }
                        : meta.homeTeamId && meta.awayTeamId
                          ? { sport, teamA: meta.homeTeamId, teamB: meta.awayTeamId, aName: homeTeamName ?? homeName, bName: awayTeamName ?? awayName }
                          : null;
                      if (!params) return null;
                      return <Text style={[st.editLink, { marginTop: theme.spacing(2) }]} accessibilityRole="button" onPress={() => navigation.navigate('HeadToHead', params)}>⚔️ Head-to-head &amp; form ›</Text>;
                    })()}
                  </>
                ) : (
                  <View style={{ gap: theme.spacing(3), marginTop: theme.spacing(1) }}>
                    <DateTimeField label="Date & time" value={editWhen} onChange={setEditWhen} timeZone={meta.tournamentZone} />
                    <VenueField venue={editVenue} onVenue={setEditVenue} venueUrl={editVenueUrl} onVenueUrl={setEditVenueUrl} knownVenues={[]} />
                    {(getSport(sport).formatFields ?? []).length > 0 && (!matchLive || liveFormatOk) && (
                      <SportFormatEditor
                        sport={sport}
                        value={editFmt}
                        onChange={(k, v) => setEditFmt((f) => ({ ...f, [k]: v }))}
                        heading="format"
                        // The stat toggles live in ⚙️ Scoring settings (Info tab) — not here, so an
                        // older match (no track keys) is never shown as tracking less than it does.
                        omitKeys={[
                          ...(getSport(sport).participantKind === 'both' ? ['playersPerSide'] : []),
                          // info-chain IC3: every key Scoring settings owns lives there only
                          ...liveOwnedKeys(plugin.liveSettings as never),
                        ]}
                      />
                    )}
                    {matchLive && liveFormatOk && (() => {
                      // MVP B6: the new board, from the same taps, before saving.
                      if (!livePreview) return <Text style={textStyles.muted}>Change the format if it was set wrong: every point so far is replayed under the new format.</Text>;
                      if (!livePreview.ok) {
                        return <Text style={st.formatWarn}>{livePreview.dropped > 0
                          ? `Under this format the match would already be over, and the last ${livePreview.dropped} ${livePreview.dropped === 1 ? 'tap' : 'taps'} would be lost. Pick another format, or end the match.`
                          : 'Under this format the match would be over now. End the match instead.'}</Text>;
                      }
                      const sm = plugin.summary(livePreview.state as never);
                      const line = plugin.scoreLine ? matchScoreLine(plugin, livePreview.state, {}) : '';
                      return <Text style={textStyles.muted}>{`New score: ${sm.homeScore}-${sm.awayScore}${line ? ` (${line})` : ''}. Every point so far is kept; Undo puts the old format back.`}</Text>;
                    })()}
                    {matchLive && !liveFormatOk && (
                      <Text style={textStyles.muted}>
                        {canManage && !meta.tournamentId && sport !== 'cricket' && !scoringHere ? 'Change the format from the device that is scoring this match. ' : ''}Format is locked once the match is live{showLiveSettings && ls ? `…local rules can still be changed in ${ls.title.replace(/^[^A-Za-z]+/, '')} below.` : '.'}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', gap: theme.spacing(3) }}>
                      <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => setEditInfo(false)} />
                      <Button label="Save changes" style={{ flex: 1 }} onPress={saveInfo} />
                    </View>
                  </View>
                )}
              </View>
              {disputesCard}
              {hasMatch && scorerCard}
              {hasMatch && officialsCard}
              {hasMatch && streamSettingsCard}
              {hasMatch && isHost && matchId && (
                <OverlayPanel matchId={matchId} tournamentId={meta.tournamentId} plugin={plugin} state={state}
                  eventCount={eventCount} syncing={syncing} meta={tickerMeta} />
              )}
              {liveSettingsCard((msg) => setToast(msg))}
              {hasMatch && (
                <HostsCard
                  hostIds={matchHostIds}
                  nameOf={(id) => nameOf(id) ?? undefined}
                  renderExtra={(id) => canManage && personOf(id)?.invited ? (
                    <RemindInstall playerId={id} name={nameOf(id) ?? 'Host'} phone={personOf(id)?.phone} message={inviteTextFor('host')(realName(nameOf(id)))} />
                  ) : null}
                  candidates={scorerCandidates.map((p) => ({ id: p.id, name: p.fullName }))}
                  canManage={canManage}
                  onChange={setHosts}
                  addPicker={<PersonPicker role="host" excludeIds={matchHostIds} onPick={(p) => { rememberPerson(p); return setHosts([...new Set([...matchHostIds, p.id])]); }} inviteText={inviteTextFor('host')} />}
                  meId={myPlayerId ?? undefined}
                  subtitle="Hosts for this game (in addition to the tournament's hosts). Reminders to assign a scorer go to all of them."
                />
              )}
              <Text style={textStyles.h3}>Matchday squads</Text>
              {squadCard('home')}
              {squadCard('away')}
              {lineupsNode}
              {hasMatch && (isHost || canScore) && (
                <View style={st.infoCard}>
                  <InfoRow icon="🔁" label="Clone match" value="Same teams, squads & rules ›"
                    onPress={() => navigation.navigate('ScheduleMatch', { cloneOf: matchId })}
                    accessibilityLabel="Clone this match" />
                </View>
              )}
              {dangerZone}
            </View>
          )}

          {/* Summary — the result and the people: the result line, Player of
              the Match, awards / top performers and the ratings (provisional
              while live). No stats tables here — they are on Stats. */}
          {activeTab === 'summary' && (
            <View style={{ gap: theme.spacing(3) }}>
              {/* a match closed by hand: its result line (a sport's own Summary
                  shows it itself — manualResultLine) */}
              {plugin.Summary ? null : retiredBanner}
              {plugin.Summary ? (
              <plugin.Summary
                state={state} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
                onPlayer={(pid) => navigation.navigate('PlayerProfile', { playerId: pid })}
                manualResultLine={meta.result ? manualResultLine(meta.result, fullHome, fullAway) : undefined}
                potm={potmProp}
              />
            ) : (
              <MatchSummary
                statLines={matchStats} sport={sport} homeRoster={homeRoster} awayRoster={awayRoster}
                homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
                summary={shownSummary} scoreLine={fullLine || undefined} complete={complete} live={matchLive}
                onPlayer={(pid) => navigation.navigate('PlayerProfile', { playerId: pid })}
                potm={potmProp}
                afterResult={renderSlot(tabSlots.SummaryExtras)}
              />
              )}
              {/* a sport with its own Summary: its result detail below it */}
              {plugin.Summary ? renderSlot(tabSlots.SummaryExtras) : null}
              {canChangePotm && (homeRoster.length > 0 || awayRoster.length > 0) ? (
                <Button variant="ghost" label="Change Player of the Match" onPress={() => setPotmOpen(true)} />
              ) : null}
              <AwardPickerSheet
                visible={potmOpen} onClose={() => setPotmOpen(false)}
                title="🏅 Player of the Match" subtitle="Pick the officials’ choice. You can change it only once."
                ranked={false} selectedId={storedPotm?.playerId ?? autoPotmNow()?.id}
                tabs={[
                  { key: 'home', label: fullHome, color: homeColor, rows: potmRows(homeRoster, homeColor) },
                  { key: 'away', label: fullAway, color: awayColor, rows: potmRows(awayRoster, awayColor) },
                ]}
                onPick={(r) => void changePotm(r)}
              />
            </View>
          )}

          {noteNode}
        </KeyboardAwareScrollView>
        <QuickOptionsSheet
          visible={quickOpen} onClose={() => setQuickOpen(false)}
          homeName={fullHome} awayName={fullAway}
          onBreak={(kind, note) => void startBreak(kind, note)}
          onSquad={hasMatch && canEditSquad ? (sd) => void editSquad(sd) : undefined}
          onScorer={hasMatch ? () => setTab('info') : undefined}
          onScorecard={() => setTab(hasStats ? 'stats' : watchTab)}
          settingsPanel={showLiveSettings && !complete ? liveSettingsCard((msg) => { setQuickOpen(false); setToast(msg); }) : undefined}
          pluginTiles={plugin.QuickOptions ? (
            <plugin.QuickOptions
              state={state} dispatch={quickDispatch} homeRoster={homeScoreRoster} awayRoster={awayScoreRoster}
              homeName={fullHome} awayName={fullAway}
              onDone={(msg) => { setQuickOpen(false); if (msg) setToast(msg); }}
              onEndMatch={showEndEarly ? (r) => { setQuickOpen(false); void endMatchWith({ ...r, at: new Date().toISOString() }); } : undefined}
            />
          ) : undefined}
        />
        {toast ? (
          <View style={st.toast} pointerEvents="none" accessibilityLiveRegion="polite">
            <Text style={st.toastText}>{toast}</Text>
          </View>
        ) : null}
       </DisputeMaskProvider>
      </SafeAreaView>
    );
}

/** Match tabs (2026-10-22): the tab names before the five-tab layout, mapped to
 *  where their content lives now (saved `tab` params, old links). */
const LEGACY_TABS: Record<string, string> = {
  score: 'stats', scorecard: 'stats', box: 'stats',
  lineups: 'info',
  timeline: 'commentary', pbp: 'commentary', feed: 'commentary',
};

/** Up to two initials from a name, for the scorer avatar. */
function scorerInitials(name?: string): string {
  const parts = (name ?? '').split(' ').filter(Boolean);
  return parts.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '🎯';
}

/** Human-readable summary of a match's chosen format, per sport. */
function formatLine(sport: SportId, fmt: Record<string, unknown>): string {
  const parts: string[] = [];
  if (fmt.overs != null) parts.push(`${fmt.overs} overs`);
  if (fmt.playersPerSide != null) parts.push(`${fmt.playersPerSide}-a-side`);
  if (fmt.substitutes != null && Number(fmt.substitutes) > 0) {
    const n = Number(fmt.substitutes);
    parts.push(`${n} sub${n === 1 ? '' : 's'}`);
  }
  if (sport === 'cricket') {
    const bpo = Number(fmt.ballsPerOver ?? 6);
    if (bpo !== 6) parts.push(`${bpo} balls/over`);
    if (fmt.impactPlayer) parts.push('Impact Player');
    if (Number(fmt.powerplayOvers ?? 0) > 0) parts.push(`${fmt.powerplayOvers}-over powerplay`);
  }
  if (sport === 'basketball' && fmt.foulsToFoulOut != null) parts.push(`${fmt.foulsToFoulOut} fouls out`);
  // set/game-based sports — describe the match length
  const bestOf = (n: number, unit: string) => (n === 1 ? `single ${unit}` : `best of ${n * 2 - 1} ${unit}s`);
  if ((sport === 'volleyball' || sport === 'tennis') && fmt.setsToWin != null) parts.push(bestOf(Number(fmt.setsToWin), 'set'));
  if (sport === 'volleyball' && fmt.pointsPerSet != null) parts.push(`to ${fmt.pointsPerSet}`);
  if (sport === 'badminton') {
    if (fmt.pointsPerGame != null) parts.push(`to ${fmt.pointsPerGame}`);
    if (fmt.gamesToWin != null) parts.push(bestOf(Number(fmt.gamesToWin), 'game'));
  }
  if (sport === 'kabaddi' && fmt.halfMinutes != null) parts.push(`${fmt.halfMinutes}-min halves`);
  if (sport === 'hockey' && fmt.periodMinutes != null) parts.push(`${fmt.periods ?? 4} × ${fmt.periodMinutes} min`);
  if (sport === 'handball' && fmt.periodMinutes != null) parts.push(`2 × ${fmt.periodMinutes} min`);
  if (sport === 'ice_hockey' && fmt.periodMinutes != null) parts.push(`3 × ${fmt.periodMinutes} min`);
  if (sport === 'baseball' && fmt.innings != null) parts.push(`${fmt.innings} innings`);
  if (sport === 'netball' && fmt.periodMinutes != null) parts.push(`${fmt.periods ?? 4} × ${fmt.periodMinutes} min`);
  if (sport === 'american_football' && fmt.periodMinutes != null) parts.push(`${fmt.variant === 'tackle' ? 'Tackle' : 'Flag'} · ${fmt.periods ?? (fmt.variant === 'tackle' ? 4 : 2)} × ${fmt.periodMinutes} min`);
  if (sport === 'rugby' && fmt.periodMinutes != null) parts.push(`${fmt.variant === '7s' ? 'Sevens · ' : fmt.variant === '10s' ? 'Tens · ' : ''}2 × ${fmt.periodMinutes} min`);
  // (the "13-a-side" / "9-a-side" part above already names the variant)
  if (sport === 'rugby_league' && fmt.periodMinutes != null) parts.push(`2 × ${fmt.periodMinutes} min${fmt.decider === 'gp' ? ' · golden point' : fmt.decider === 'gpFinal' ? ' · golden point to a score' : ''}`);
  return parts.length ? parts.join(' · ') : '—';
}

function InfoRow({ icon, label, value, onPress, accessibilityLabel }: {
  icon?: string;
  label: string;
  value: string;
  /** when set, the value renders as a tappable link (venue, tournament) */
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <View style={st.infoRow}>
      <View style={st.infoLabelWrap}>
        {icon ? <Glyph emoji={icon} style={st.infoIcon} color={theme.colors.primary} /> : null}
        <Text style={textStyles.muted}>{label}</Text>
      </View>
      {onPress ? (
        <Text style={st.venueLink} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} numberOfLines={1}>{value}</Text>
      ) : (
        <Text style={[textStyles.body, st.infoValue]} numberOfLines={1}>{value}</Text>
      )}
    </View>
  );
}

/** info-chain IC1 / IC2 — the match's rules and what it captures, folded by
 *  default under the Format row ("Rules & stats captured ▸"). */
function RulesCard({ rules, captures }: { rules: RuleLine[]; captures: CaptureLine[] }) {
  const [open, setOpen] = useState(false);
  const on = captures.filter((c) => c.on);
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Text style={st.editLink} accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)}>
        {`Rules & stats captured${captures.length ? ` · ${on.length} of ${captures.length} stats on` : ''} ${open ? '▾' : '▸'}`}
      </Text>
      {open ? (
        <View style={st.rulesBox}>
          {rules.map((r) => (
            <View key={r.key} style={st.ruleRow}>
              <Text style={[textStyles.muted, st.ruleLabel]}>{r.label}</Text>
              <Text style={[textStyles.body, st.ruleValue]}>{r.value}</Text>
            </View>
          ))}
          {captures.length ? (
            <View style={{ gap: theme.spacing(1), marginTop: theme.spacing(2) }}>
              <Text style={st.rulesHead}>Stats captured</Text>
              {captures.map((c) => (
                <Text key={c.key} style={[textStyles.body, !c.on && { color: theme.colors.textMuted }]}>{c.on ? '✓' : '–'} {c.label}{c.on ? '' : ' (off)'}</Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Reassures the scorer that nothing is lost when the connection drops: shows how
 *  many taps are saved locally and waiting to sync, with a manual retry. Hidden
 *  when online and fully synced. */
function OfflineSyncBanner({ matchId }: { matchId: string }) {
  useSyncExternalStore(matchOutbox.subscribe, matchOutbox.getSnapshot);
  const pending = matchOutbox.pendingCount(matchId);
  const online = matchOutbox.isOnline();
  // Sync failing on a working connection is a different problem from being
  // offline: it won't fix itself, so promising "it'll sync when you reconnect"
  // would be false reassurance.
  const stuck = matchOutbox.isStuck(matchId);
  if (online && pending === 0 && !stuck) return null;
  const offline = !online;
  const n = `${pending} change${pending === 1 ? '' : 's'}`;
  const title = stuck ? "⚠️ Can't sync right now" : offline ? '⚠️ Offline — scoring saved on this device' : `↻ Syncing ${n}…`;
  return (
    <View style={[st.syncBanner, offline || stuck ? st.syncOffline : st.syncPending]}>
      <View style={{ flex: 1 }}>
        <Text style={st.syncTitle}>{title}</Text>
        <Text style={st.syncSub}>
          {stuck
            ? `${n} saved safely on this device. Keep scoring — then tap Retry. If it keeps failing, contact support and quote this match.`
            : pending > 0
            ? offline
              ? `${n} saved here — they'll sync automatically when you're back online.`
              : `${n} saved — syncing to the cloud now.`
            : "You're offline. Every tap is saved here and will sync when you reconnect."}
        </Text>
        {stuck && matchOutbox.syncError(matchId) ? (
          <Text style={st.syncErr} numberOfLines={2}>{matchOutbox.syncError(matchId)}</Text>
        ) : null}
      </View>
      {pending > 0 && (
        <TouchableOpacity style={st.syncBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={stuck ? 'Retry sync' : 'Sync now'} onPress={() => void matchOutbox.flush(matchId, true)}>
          <Text style={st.syncBtnText}>{stuck ? 'Retry' : 'Sync now'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Compact append-only audit trail for a dispute — every step with who & when. */
/** A coloured status pill for a dispute box header. */
function DisputeTag({ kind }: { kind: 'reported' | 'open' | 'resolved' | 'dismissed' }) {
  const map = {
    reported: { label: 'REPORTED', bg: theme.colors.accent, fg: theme.colors.onFill },
    open: { label: 'UNDER REVIEW', bg: theme.colors.dangerStrong, fg: '#fff' },
    resolved: { label: 'RESOLVED', bg: theme.colors.primary, fg: theme.colors.onFill },
    dismissed: { label: 'DISMISSED', bg: theme.colors.surface, fg: theme.colors.textMuted },
  }[kind];
  return <View style={[st.dtag, { backgroundColor: map.bg }]}><Text style={[st.dtagText, { color: map.fg }]}>{map.label}</Text></View>;
}

function DisputeHistory({ events }: { events?: DisputeEvent[] }) {
  if (!events?.length) return null;
  const icon = (a: DisputeEvent['action']) =>
    a === 'resolved' ? '✅' : a === 'dismissed' ? '✕' : a === 'escalated' ? '⏫'
    : a === 'confirmed' ? '☑️' : a === 'proposed' ? '✎' : '🚩';
  return (
    <View style={st.dispHist}>
      <Text style={st.dispHistTitle}>🧾 Audit trail</Text>
      {events.map((e, i) => (
        <View key={i} style={st.dispHistRow}>
          <Text style={st.dispHistIcon}>{icon(e.action)}</Text>
          <Text style={st.dispHistLine}>{e.note ?? e.action}{e.byName ? ` · ${e.byName}` : ''}</Text>
          <Text style={st.dispHistAt}>{new Date(e.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  dispHist: { marginTop: theme.spacing(1), paddingTop: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing(1) },
  dispHistTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  dispHistRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2) },
  dispHistIcon: { fontSize: 12, width: 18, textAlign: 'center' },
  dispHistLine: { color: theme.colors.text, fontSize: theme.font.small, flex: 1 },
  dispHistAt: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  syncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    borderRadius: theme.radius.md, borderWidth: 1,
    paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4),
    marginBottom: theme.spacing(3),
  },
  syncOffline: { backgroundColor: theme.colors.accent + '22', borderColor: theme.colors.accent },
  syncPending: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
  syncTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  syncErr: { color: theme.colors.danger, fontSize: theme.font.small, marginTop: theme.spacing(1) },
  syncSub: { color: theme.colors.textMuted, fontSize: theme.font.small, marginTop: 2 },
  syncBtn: {
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(4),
  },
  syncBtnText: { color: theme.colors.onFill, fontWeight: '800', fontSize: theme.font.small },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4) },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  tabBar: { flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: 3 },
  tab: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1.5), borderRadius: theme.radius.pill, alignItems: 'center' },
  tabScroll: { gap: theme.spacing(1), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: 3 },
  tabChip: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(4), borderRadius: theme.radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  tabTextTight: { fontSize: 11 },
  tabTextActive: { color: theme.colors.onFill, fontWeight: '800' },
  infoCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4), gap: theme.spacing(2), ...theme.shadow.card },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(3), paddingVertical: theme.spacing(1) },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  stepperVal: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', minWidth: 96, textAlign: 'center' },
  infoLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  infoIcon: { fontSize: 15, width: 18, textAlign: 'center' },
  infoValue: { flexShrink: 1, textAlign: 'right' },
  rulesBox: { gap: theme.spacing(1), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  ruleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(3) },
  ruleLabel: { flexShrink: 1 },
  ruleValue: { flexShrink: 1, textAlign: 'right', fontWeight: '700' },
  rulesHead: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  kickoffHint: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  squadHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  caret: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800', width: 18, textAlign: 'center' },
  venueLink: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  // Same box as undoBtn (same height), greyed: holds Undo's place before the first action.
  statsBox: { gap: theme.spacing(2), alignSelf: 'stretch' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  guestBar: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border },
  guestText: { color: theme.colors.text, fontSize: theme.font.small },
  formatWarn: { color: theme.colors.danger, fontSize: theme.font.small },
  undoIdle: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing(2.5), paddingHorizontal: theme.spacing(4), opacity: 0.55,
  },
  undoBox: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing(2), paddingLeft: theme.spacing(4), paddingRight: theme.spacing(2),
  },
  undoLast: { flex: 1, minWidth: 0 },
  undoLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  undoBtn: {
    minHeight: 44, justifyContent: 'center', alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.colors.inputBorder, paddingHorizontal: theme.spacing(4),
  },
  undoPill: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800' },
  undoText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  undoHint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  // SD-106 Match controls: a separate card at the bottom; centred, red-outlined,
  // transparent buttons so nothing destructive looks like Undo (audit G1).
  matchCtrlCard: {
    marginTop: theme.spacing(6), gap: theme.spacing(2), padding: theme.spacing(3),
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.danger + '55', backgroundColor: theme.colors.danger + '0D',
  },
  matchCtrlTitle: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  matchCtrlBtn: {
    alignItems: 'center', gap: 2, borderRadius: theme.radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.danger,
    paddingVertical: theme.spacing(2.5), paddingHorizontal: theme.spacing(4), backgroundColor: 'transparent',
  },
  matchCtrlText: { color: theme.colors.danger, fontSize: theme.font.body, fontWeight: '800' },
  matchCtrlHint: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  retirePanel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  retirePrompt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  retireRow: { flexDirection: 'row', gap: theme.spacing(2) },
  endChips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  retiredBanner: { backgroundColor: theme.colors.accent + '22', borderRadius: theme.radius.md, padding: theme.spacing(3) },
  retiredText: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  breakBanner: { backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent + '66', borderRadius: theme.radius.md, padding: theme.spacing(3) },
  breakBannerText: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  quickBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: theme.spacing(3) },
  quickBarText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  toast: { position: 'absolute', left: theme.spacing(4), right: theme.spacing(4), bottom: theme.spacing(6), backgroundColor: theme.colors.text, borderRadius: theme.radius.md, paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4), alignItems: 'center' },
  toastText: { color: theme.colors.bg, fontSize: theme.font.small, fontWeight: '800' },
  dangerCard: { borderColor: theme.colors.danger + '66' },
  dangerTitle: { color: theme.colors.danger },
  reschedBanner: { borderRadius: theme.radius.md, padding: theme.spacing(3), marginTop: theme.spacing(2) },
  reschedBannerText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  sportName: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800', flexShrink: 1 },
  squadRow: { gap: theme.spacing(2) },
  squadBtns: { flexDirection: 'row', gap: theme.spacing(2) },
  scorerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginTop: theme.spacing(1) },
  scorerIcon: { fontSize: 16 },
  mgrRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginTop: theme.spacing(2) },
  mgrAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  mgrAvatarText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900' },
  scorerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  scorerAvatarText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900' },
  lockCard: { gap: theme.spacing(3), padding: theme.spacing(4), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  lockBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3), alignItems: 'center' },
  lockWatch: { paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  lockWatchText: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body },
  scorerLive: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: 3, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, backgroundColor: theme.colors.dangerStrong },
  scorerLiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  scorerLiveText: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 1 },
  streamHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streamPill: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: 3, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, backgroundColor: theme.colors.primary },
  streamDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.onFill },
  streamPillText: { color: theme.colors.onFill, fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 1 },
  streamRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  streamPlatform: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  officialRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  officialLabel: { width: 130 },
  scorerPicker: { marginTop: theme.spacing(2), gap: theme.spacing(1) },
  scorerOpt: { paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  scorerOptText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  assignBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(5) },
  assignBtnText: { color: theme.colors.onFill, fontSize: theme.font.body, fontWeight: '800' },
  scoreCta: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4), gap: theme.spacing(1), ...theme.shadow.card },
  scoreCtaText: { color: theme.colors.onFill, fontSize: theme.font.body, fontWeight: '800' },
  scoreCtaHint: { color: theme.colors.onFill, opacity: 0.8, fontSize: theme.font.small, fontWeight: '600' },
  remindBtn: { backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.accent, borderRadius: theme.radius.md, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start' },
  remindText: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  remindDone: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), flexWrap: 'wrap' },
  remindDoneText: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  remindAgain: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  lineups: { gap: theme.spacing(3) },
  lineupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  editSquadBtn: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), marginTop: theme.spacing(1) },
  editSquadIcon: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800' },
  editSquadLabel: { flex: 1, color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  editSquadChevron: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800' },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: 1 },
  squadSection: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: theme.spacing(2), marginBottom: theme.spacing(1) },
  jersey: { width: 26, height: 26, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  jerseyNum: { fontSize: theme.font.small, fontWeight: '900' },
  roleTag: { minWidth: 18, minHeight: 18, borderRadius: 4, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  roleCaptain: { backgroundColor: theme.colors.accent },
  roleTagText: { color: theme.colors.text, fontSize: theme.font.tiny, fontWeight: '900' },
  roleTagTextDark: { color: theme.colors.onFill },
  disputedName: { color: theme.colors.danger, fontWeight: '800', textDecorationLine: 'line-through' },
  objectLink: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  disputeBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3), marginTop: theme.spacing(2) },
  disputeCount: { paddingVertical: 3, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, backgroundColor: theme.colors.dangerStrong },
  disputeCountText: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  disputeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dtag: { paddingVertical: 2, paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill },
  dtagText: { fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 0.5 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  disputeBanner: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.danger, padding: theme.spacing(3) },
  disputeBannerText: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  legendName: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  lineupHeadRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  lineupCount: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  controls: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(4),
    ...theme.shadow.card,
  },
  note: { color: theme.colors.textMuted, fontSize: theme.font.tiny, textAlign: 'center' },
  eligNote: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  finalCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(4), alignItems: 'center', gap: theme.spacing(2), ...theme.shadow.card,
  },
  finalLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', letterSpacing: 1 },
  finalRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  finalScore: { fontSize: theme.font.h1, fontWeight: '900' },
  finalVs: { color: theme.colors.textMuted, fontSize: theme.font.small },
  finalResult: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
});
