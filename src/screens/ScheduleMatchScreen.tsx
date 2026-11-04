/** Schedule a match: choose sport → home & away teams (filtered to that sport)
 *  → kickoff time. Creates a 'scheduled' match in the demo store or Supabase.
 *  Sport is a compact picklist; teams lead with the ones you've played for and
 *  fall back to a search (type 3+ letters) so the list never sprawls. */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { uniqueShort } from '../core/teamShort';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView, KeyboardFooterLayout } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { safeWebUrl } from '../core/safeUrl';
import { theme } from '../core/theme';
import { EmptyState, Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { eventZone, useUserTimeZone } from '../core/time';
import { defaultKickoff } from '../data/fixtureSchedule';
import { DateTimeField } from '../components/DateTimeField';
import { SportFormatEditor, defaultsFor, type FormatVal } from '../components/FormatEditor';
import { VenueField } from '../components/VenueField';
import { ConflictNotice } from '../components/ConflictNotice';
import { ClubQuickPick } from '../components/ClubQuickPick';
import { SPORT_LIST, SPORT_META, getSportMeta, participantMode, type ParticipantMode } from '../sports/sportMeta';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAST_SPORT_KEY, quickSideName, quickSideShort, startSport, isQuickPlaceholder } from '../core/quickGame';
import { getMyPersonalisation } from '../data/personalise';
import { structureLabels } from '../sports/structureLabels';
import { useTeams, useMatches, usePlayers, useTournamentById, useTournamentCategories, useTournamentEntries } from '../data/hooks';
import { onePerEntrant, sidesForStructure, recentPairs, searchSides, searchPeople } from '../data/doublesPicker';
import { settlePairType, pairTypeFromDivisions } from '../sports/pairType';
import { venueOptions } from '../data/tournamentForm';
import { findScheduleConflicts, knownVenueNames } from '../data/scheduleConflicts';
import { createMatch, createTeam, getMyEntrant, getMyPlayerId, setMatchScorer, getMatch, getTournaments, getMatchSquads, setMatchSquad, getEntryTeamsWith } from '../data/repos';
import { pairKey, pairsFromTeams, type PairTeam } from '../core/pairs';
import { isPairSport } from '../data/pairSport';
import { cloneDraft } from '../data/matchHousekeeping';
import { useAuth } from '../core/auth';
import { KO_STAGES, KO_STAGE_LABEL, isKoStage, type KoStage } from '../data/bracket';
import { stageAwareFormat } from '../data/matchFormat';
import { EntrantPicker } from '../components/EntrantPicker';
import { sideForEntrants } from '../data/entrants';
import type { EntrantPerson, EntrantSlot } from '../data/participantEntry';
import { inviteLabel, playerInviteText } from '../core/inviteText';
import { SHARE_BASE, tournamentLink } from '../core/shareText';
import type { SportId, Team } from '../core/types';

// What phase of the tournament a match belongs to. 'league' = a plain
// table/round-robin game (no tag); 'group' = a group-stage game (needs a group
// letter); the rest are knockout stages. Drives the standings/bracket views.
type Phase = 'league' | 'group' | KoStage;
import type { RootStackParamList } from '../navigation/types';
import { Glyph } from '../components/Icon';
import { SportLine } from '../components/SportSymbol';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type PickTeam = Pick<Team, 'id' | 'name' | 'colorHex'> & { roster?: string[] };

// For teams created on the fly (a friendly between two ad-hoc sides): auto-derive a
// short code from the name and cycle a color so each new team looks distinct.
const TEAM_PALETTE = ['#FF5C5C', '#4DA3FF', '#4CD964', '#FFD60A', '#BF5AF2', '#FF9F0A', '#5AC8FA', '#FF375F'];

export default function ScheduleMatchScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'ScheduleMatch'>>();
  // No tournament → this is an ad-hoc friendly: kicks off now and jumps straight
  // into the live scorer once created.
  const tournamentId = route.params?.tournamentId;
  const isFriendly = !tournamentId;
  // Parity #13: "🔁 Clone match" pre-fills this form from another match. A clone
  // is always a friendly that kicks off now; the toss is re-done.
  const cloneOf = route.params?.cloneOf;
  const { profile } = useAuth();

  // No sport chosen yet → the picker reads "Select a sport" and the rest of the
  // form (teams, format) stays hidden until one is picked.
  // screen sweep: a link with a sport id we don't know (table_tennis …) opens the picker, never crashes
  const routeSport = route.params?.sport && Object.hasOwn(SPORT_META, route.params.sport) ? route.params.sport : null;
  const [sport, setSport] = useState<SportId | null>(routeSport);
  const [teamNonce, setTeamNonce] = useState(0); // bump to refetch after creating a team on the fly
  const teams = useTeams(sport ?? undefined, teamNonce);
  // Individual sports pick PEOPLE: everyone in the app is searchable, not just
  // those who already have an entry in this sport (a new sport has none).
  const allPlayers = usePlayers();
  const [home, setHome] = useState<string | null>(null);
  const [away, setAway] = useState<string | null>(null);

  // SD-154: a tournament match defaults to tomorrow 14:00 in the TOURNAMENT's zone
  // (its venue zone, else the app zone) — not the phone clock; a friendly kicks off now
  const appZone = useUserTimeZone();
  const [when, setWhen] = useState(() => (route.params?.tournamentId ? new Date(defaultKickoff(appZone, { time: '14:00' })) : new Date()));
  const whenTouched = useRef(false);
  const [venue, setVenue] = useState('');
  const [venueUrl, setVenueUrl] = useState('');
  const [stream, setStream] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  // Which phase this match belongs to (tournament matches only) — lets an
  // organizer hand-tag a group game or a specific knockout tie (e.g. a Final).
  const [phase, setPhase] = useState<Phase>('league');
  const [groupLabel, setGroupLabel] = useState('A');
  // Per-match rules — seeded from the sport's defaults so casual users can ignore it.
  const [format, setFormat] = useState<Record<string, FormatVal>>(
    () => (routeSport ? defaultsFor(getSportMeta(routeSport).formatFields ?? []) : {})
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Clone: teams, venue, stream and the EFFECTIVE rules (tournament merged with
  // the match's own), never officials / result / POTM. Squads copy after Save.
  const [cloneReady, setCloneReady] = useState(!cloneOf);
  const cloneNames = useRef<{ home?: string; away?: string }>({});
  useEffect(() => {
    if (!cloneOf) return;
    let on = true;
    (async () => {
      const src = await getMatch(cloneOf);
      if (!src || !on) { setCloneReady(true); return; }
      const tour = src.tournamentId ? (await getTournaments()).find((t) => t.id === src.tournamentId) : undefined;
      const d = cloneDraft(src, tour?.formats?.[src.sport] as Record<string, unknown> | undefined);
      if (!on) return;
      setSport(d.sport);
      setFormat({ ...defaultsFor(getSportMeta(d.sport).formatFields ?? []), ...((d.format as Record<string, FormatVal>) ?? {}) });
      setHome(d.homeTeamId);
      setAway(d.awayTeamId);
      cloneNames.current = { home: src.homeTeam.name, away: src.awayTeam.name };
      setVenue(d.venueName ?? '');
      setVenueUrl(d.venueMapsUrl ?? '');
      setStream(d.streamUrl ?? '');
      setWhen(new Date());
      setCloneReady(true);
    })();
    return () => { on = false; };
  }, [cloneOf]);

  // MVP 2026-10-31 (quick game): a new friendly opens on the last sport used on
  // this device, else the first sport from the first-run questions — unless
  // the person has already picked one.
  const sportNow = useRef(sport);
  sportNow.current = sport;
  useEffect(() => {
    if (!isFriendly || routeSport || cloneOf) return;
    let on = true;
    (async () => {
      const last = await AsyncStorage.getItem(LAST_SPORT_KEY).catch(() => null);
      const mine = last ? [] : ((await getMyPersonalisation().catch(() => null))?.sports ?? []);
      const s = startSport({ last, mine, known: SPORT_LIST.map((x) => x.id) });
      if (on && s && !sportNow.current) pickSport(s as SportId);
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A friendly kicking off ~now jumps straight into the scorer; one set for later
  // is just filed as scheduled (it shows under Upcoming, like any planned match).
  const isImmediate = isFriendly && when.getTime() <= Date.now() + 120_000;

  // Clash-detection + venue reuse draw on every other fixture. Grounds already
  // used in this tournament (or, for a friendly, anywhere) become reuse chips so
  // they're named consistently; the same fixtures feed conflict checks.
  const { matches: allMatches } = useMatches('all');
  // The tournament's own grounds lead the chips (parity #09).
  const tournament = useTournamentById(tournamentId);
  // SD-154: once the tournament (and its venue zone) loads, re-seed the default kickoff in it
  useEffect(() => {
    if (!tournament?.timeZone || whenTouched.current || cloneOf) return;
    setWhen(new Date(defaultKickoff(eventZone(tournament, appZone), { time: '14:00' })));
  }, [tournament?.timeZone]); // eslint-disable-line react-hooks/exhaustive-deps
  const knownVenues = useMemo(
    () => venueOptions(tournament?.grounds, knownVenueNames(tournamentId ? allMatches.filter((mm) => mm.tournamentId === tournamentId) : allMatches)),
    [allMatches, tournamentId, tournament?.grounds]
  );
  // Exactly one ground → it's the venue (once; the organiser can still change it).
  const venuePrefilled = useRef(false);
  useEffect(() => {
    if (venuePrefilled.current || tournament?.grounds?.length !== 1) return;
    venuePrefilled.current = true;
    setVenue((v) => v || tournament.grounds![0]);
  }, [tournament?.grounds]);
  // A cloned side whose id isn't in this sport's team list (e.g. a house team
  // listed under another id) is matched by name, so the picker shows it selected.
  useEffect(() => {
    if (!cloneOf || !teams.length) return;
    const fix = (id: string | null, name: string | undefined, set: (v: string) => void) => {
      if (!id || !name || teams.some((t) => t.id === id)) return;
      const byName = teams.find((t) => t.name === name);
      if (byName) set(byName.id);
    };
    fix(home, cloneNames.current.home, setHome);
    fix(away, cloneNames.current.away, setAway);
  }, [cloneOf, teams, home, away]);
  // MVP QG-01: untouched quick-game sides ("Team A", "Player B"…) stay out of
  // the pickers; one already picked for this match stays visible.
  const pickTeams = useMemo(() => teams.filter((t) => !isQuickPlaceholder(t) || t.id === home || t.id === away), [teams, home, away]);
  // doubles-picker DP1/DP2: a singles side picks only one-person entries, a
  // doubles side only real pairs (two different people) — never one for the other.
  // each person / pair once, whatever duplicate entries point at them (founder 2026-11-04)
  const singleTeams = useMemo(() => onePerEntrant(sidesForStructure(pickTeams, 'single'), [home, away]), [pickTeams, home, away]);
  const pairTeams = useMemo(() => onePerEntrant(sidesForStructure(pickTeams, 'pair'), [home, away]), [pickTeams, home, away]);
  // DP6: my player id, for the recent pairs I played in or hosted
  const [myPid, setMyPid] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    if (profile?.id) getMyPlayerId(profile.id).then((id) => on && setMyPid(id ?? null)).catch(() => {});
    return () => { on = false; };
  }, [profile?.id]);
  const recentFor = (other: string | null) => (sport ? recentPairs({ matches: allMatches, pairs: pairTeams, sport, me: myPid, exclude: other }) : []);
  const recentHome = useMemo(() => recentFor(away), [allMatches, pairTeams, sport, myPid, away]); // eslint-disable-line react-hooks/exhaustive-deps
  const recentAway = useMemo(() => recentFor(home), [allMatches, pairTeams, sport, myPid, home]); // eslint-disable-line react-hooks/exhaustive-deps
  // PT8: every pair I've played in, in ANY sport — one tap reuses this sport's
  // entry for them, or makes it (a pair is one team across sports, core/pairs).
  const [myPairs, setMyPairs] = useState<PairTeam[]>([]);
  useEffect(() => {
    let on = true;
    if (myPid) getEntryTeamsWith([myPid]).then((rows) => on && setMyPairs(pairsFromTeams(rows, myPid, isPairSport))).catch(() => {});
    return () => { on = false; };
  }, [myPid]);
  const otherPairsFor = (recent: PickTeam[], other: string | null) => {
    const shown = new Set(recent.map((t) => pairKey(t.roster)).filter(Boolean));
    const otherKey = pairKey(teams.find((t) => t.id === other)?.roster);
    const nameOf = (id: string) => allPlayers.find((p) => p.id === id)?.fullName;
    return myPairs
      .filter((p) => !shown.has(p.key) && p.key !== otherKey && nameOf(p.a) && nameOf(p.b))
      .slice(0, 8)
      .map((p) => ({ key: p.key, label: `${nameOf(p.a)} & ${nameOf(p.b)}`, a: { id: p.a, fullName: nameOf(p.a)! }, b: { id: p.b, fullName: nameOf(p.b)! } }));
  };
  // DP11: a tournament's divisions (boys / girls / mixed) give its doubles pair type
  const divisions = useTournamentCategories(tournamentId);
  const divisionEntries = useTournamentEntries(tournamentId);
  const divisionPairType = useMemo(
    () => (tournamentId ? pairTypeFromDivisions(divisions, divisionEntries, [home, away]) : undefined),
    [tournamentId, divisions, divisionEntries, home, away],
  );
  const homeTeam = teams.find((t) => t.id === home);
  const awayTeam = teams.find((t) => t.id === away);
  const conflicts = useMemo(
    () =>
      sport
        ? findScheduleConflicts(
            {
              sport,
              startsAt: when.toISOString(),
              venueName: venue,
              homeTeamId: home,
              awayTeamId: away,
              homeTeamName: homeTeam?.name,
              awayTeamName: awayTeam?.name,
            },
            allMatches
          )
        : [],
    [sport, when, venue, home, away, homeTeam?.name, awayTeam?.name, allMatches]
  );

  function pickSport(s: SportId) {
    setSport(s);
    setHome(null);
    setAway(null);
    setFormat(defaultsFor(getSportMeta(s).formatFields ?? []));
  }

  // Create a brand-new TEAM from a typed name and select it. (Singles players and
  // doubles pairs are people, not typed names — see makeEntrantHandler.)
  const makeCreateHandler = (side: 'home' | 'away') => async (name: string): Promise<boolean> => {
    if (!sport) return false;
    try {
      // MVP F9: a code and a colour the other side doesn't already have
      const other = teams.find((t) => t.id === (side === 'home' ? away : home));
      const cycled = [...TEAM_PALETTE.slice(teams.length % TEAM_PALETTE.length), ...TEAM_PALETTE.slice(0, teams.length % TEAM_PALETTE.length)];
      const colorHex = cycled.find((c) => c.toUpperCase() !== other?.colorHex?.toUpperCase()) ?? cycled[0];
      const team = await createTeam({ name, shortName: uniqueShort(name, other?.shortName ? [other.shortName] : []), sport, colorHex, adhoc: true });
      setTeamNonce((n) => n + 1); // refetch so it shows in both pickers
      (side === 'home' ? setHome : setAway)(team.id);
      return true;
    } catch {
      setError('Could not create the side.');
      return false;
    }
  };

  // Singles / doubles: the side is its PEOPLE — the real players picked (by name
  // or mobile number, a new number added & invited), so the match is "mine" for
  // each of them and the result lands on their one profile. The same person /
  // pair reuses their existing entry in this sport; a name-only spot (the marked
  // last resort) becomes a provisional player. Individuals and pairs ride on the
  // ad-hoc-team plumbing — the UI just calls them a "player" or "pair".
  // a second tap while an entry is being made does nothing (two entries for one person)
  const entrantBusy = useRef(false);
  const makeEntrantHandler = (side: 'home' | 'away') => async (slots: EntrantSlot[]): Promise<boolean> => {
    if (!sport || entrantBusy.current) return false;
    entrantBusy.current = true;
    try {
      const entry = await sideForEntrants(slots, { sport, teams, colorHex: TEAM_PALETTE[teams.length % TEAM_PALETTE.length], adhoc: true });
      if (entry.created) setTeamNonce((n) => n + 1); // refetch so it shows in both pickers
      (side === 'home' ? setHome : setAway)(entry.id);
      return true;
    } catch {
      setError(slots.length > 1 ? 'Could not create the pair.' : 'Could not add that player.');
      return false;
    } finally {
      entrantBusy.current = false;
    }
  };

  // The signed-in user as a person: my own player row (made now if I don't have
  // one) — never a same-named entry, which could be someone else's — named as
  // my player profile reads, never the account name (getMyEntrant).
  const resolveMe = async (): Promise<EntrantPerson | null> => {
    if (!profile?.fullName) return null;
    return getMyEntrant(profile);
  };

  // "Me" quick-pick for singles: a player scoring their own match taps once
  // instead of typing their name (their existing entry is reused).
  const pickMe = (side: 'home' | 'away') => async () => {
    if (!sport) return;
    const me = await resolveMe();
    if (!me) { setError('Could not add you.'); return; }
    await makeEntrantHandler(side)([{ kind: 'person', person: me }]);
  };

  // Pick an existing PERSON for singles: reuse their one-person entry in this
  // sport if they have one, else create it (roster = them).
  const pickPerson = (side: 'home' | 'away') => async (playerId: string) => {
    const p = allPlayers.find((x) => x.id === playerId);
    if (!p) return;
    await makeEntrantHandler(side)([{ kind: 'person', person: { id: p.id, fullName: p.fullName } }]);
  };

  // The WhatsApp / SMS invite for a player added by a number not on SportnNote:
  // signing up with that number makes the entry (and its results) theirs.
  const playerInvite = (name?: string) => playerInviteText({
    name, inviterName: profile?.fullName, sportName: sport ? getSportMeta(sport).name : undefined,
    context: tournament?.name ? inviteLabel('Tournament', tournament.name) : undefined,
    link: tournamentId ? tournamentLink(tournamentId) : SHARE_BASE,
  });
  const entrantPicker = (side: 'home' | 'away', count: 1 | 2) => (seed?: EntrantPerson) => (
    <EntrantPicker
      // a new seed (a person picked from the search, or "Me +") starts afresh
      key={seed?.id ?? 'new'}
      initial={seed}
      count={count}
      sport={sport ?? 'tennis'}
      inviteText={playerInvite}
      onSubmit={makeEntrantHandler(side)}
      // the first pair gets a one-tap "Me" (singles has it on the side itself)
      resolveMe={count === 2 && side === 'home' ? resolveMe : undefined}
      meName={profile?.fullName}
    />
  );
  // People already represented by a one-person entry in this sport (shown as
  // entries) — the people list skips them so nobody appears twice.
  const soloIds = new Set(teams.map((t) => (t as PickTeam).roster).filter((r): r is string[] => !!r && r.length === 1).map((r) => r[0]));
  const people = allPlayers.filter((p) => !soloIds.has(p.id) && !p.reported).map((p) => ({ id: p.id, name: p.fullName }));
  // DP4: in doubles everyone is pickable as a partner (a person with a singles
  // entry can still play doubles) — picking one starts a new pair with them.
  const pairPeople = allPlayers.filter((p) => !p.reported).map((p) => ({ id: p.id, name: p.fullName }));

  // Singles ⇄ Doubles for racket sports. Flipping the structure clears both sides
  // (a singles pick isn't a doubles pick) and updates playersPerSide.
  const setStructure = (playersPerSide: number) => {
    setFormat((f) => ({ ...f, playersPerSide }));
    setHome(null);
    setAway(null);
  };

  async function submit() {
    if (!sport) return setError('Pick a sport.');
    const noun = mode === 'individual' ? 'players' : mode === 'pairs' ? 'pairs' : 'teams';
    let h = home;
    let a = away;
    // Quick game (MVP 2026-10-31): a friendly never waits for names. An empty side
    // starts as "Team A" / "Player A" / "Pair A"; names and players can come later.
    if (isFriendly && (!h || !a)) {
      try {
        if (!h) h = (await createTeam({ name: quickSideName(mode, 'home'), shortName: quickSideShort('home'), sport, colorHex: TEAM_PALETTE[0], adhoc: true })).id;
        if (!a) a = (await createTeam({ name: quickSideName(mode, 'away'), shortName: quickSideShort('away'), sport, colorHex: TEAM_PALETTE[1], adhoc: true })).id;
      } catch {
        return setError('Could not start the match. Check your connection and try again.');
      }
    }
    if (!h || !a) return setError(`Pick both ${noun}.`);
    if (h === a) return setError(`The two ${noun} must differ.`);
    setError(null);
    setBusy(true);
    try {
      const myId = await getMyPlayerId(profile?.id);
      const created = await createMatch({
        tournamentId,
        sport,
        homeTeamId: h,
        awayTeamId: a,
        // Phase tags (tournament matches only): a group game carries its group +
        // stage:'group'; a knockout tie carries its stage; a league game neither.
        group: !isFriendly && phase === 'group' ? groupLabel.trim().toUpperCase() || 'A' : undefined,
        stage: isFriendly ? undefined : isKoStage(phase) ? phase : phase === 'group' ? 'group' : undefined,
        startsAt: when.toISOString(),
        venueName: venue.trim() || undefined,
        venueMapsUrl: venueUrl.trim() || undefined,
        hostIds: myId ? [myId] : [],
        // SD-120: a tournament match's decider is stage-aware (league / group:
        // the draw stands; knockout: always settled).
        // DP9: a singles match never keeps a doubles pair type
        format: (() => {
          const f = settlePairType(format, mode === 'pairs');
          return !isFriendly && tournamentId ? stageAwareFormat(f, sport, isKoStage(phase)) : f;
        })(),
        streamUrl: safeWebUrl(stream) ?? undefined,
      });
      // For a friendly, the creator is the scorer by default — whether they score
      // it now or scheduled it for later. Without this, a scheduled friendly opened
      // later has no scorer, so the Scoring tab (scorer-only) never appears and the
      // creator can't work out how to score their own match. They can hand off from
      // the Info tab anytime. (Tournament matches are left unassigned — the organizer
      // schedules many they won't personally score.)
      if (isFriendly && myId) await setMatchScorer(created.id, myId);
      if (isFriendly) void AsyncStorage.setItem(LAST_SPORT_KEY, sport).catch(() => {});
      // A clone copies the source match's matchday squads (each side that has one).
      if (cloneOf) {
        try {
          const sq = await getMatchSquads(cloneOf);
          for (const sd of ['home', 'away'] as const) {
            if (sq[sd].starters.length + sq[sd].subs.length > 0) await setMatchSquad(created.id, sd, sq[sd]);
          }
        } catch { /* squads are a convenience — the match itself is created */ }
      }
      // A "now" friendly jumps straight into scoring (replace so Back skips the
      // form); a friendly set for later just files as scheduled → Upcoming.
      if (isImmediate) {
        nav.replace('LiveScoring', {
          matchId: created.id, sport,
          homeName: created.homeTeam.shortName, awayName: created.awayTeam.shortName,
          homeTeamName: created.homeTeam.name, awayTeamName: created.awayTeam.name,
          homeColor: created.homeTeam.colorHex, awayColor: created.awayTeam.colorHex,
          canScore: true, startNow: true,
        });
      } else {
        nav.goBack();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not schedule match');
    } finally {
      setBusy(false);
    }
  }

  // How the two sides are picked for this sport + format: two teams, two
  // individuals (Singles), or two pairs (Doubles).
  const mode: ParticipantMode = sport ? participantMode(sport, format) : 'team';
  // DP11: a tournament doubles match takes its division's pair type (the
  // organiser can still change it); a friendly never checks (DP12).
  useEffect(() => {
    if (!divisionPairType || mode !== 'pairs') return;
    setFormat((f) => (f.category === divisionPairType || !('category' in f) ? f : { ...f, category: divisionPairType }));
  }, [divisionPairType, mode]);
  // Golf stroke play / Stableford is a FIELD event (a group on one leaderboard),
  // set up on its own screen; match play stays head-to-head here.
  const golfField = sport === 'golf' && String(format.competition ?? 'stroke') !== 'match';

  // the match form (not a results sport or golf, which link to their own setup)
  // pins its schedule / start button above the keyboard
  const matchForm = !golfField && !['athletics', 'swimming', 'cycling', 'rowing', 'canoe', 'archery', 'shooting', 'weightlifting'].includes(sport ?? '');
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardFooterLayout
        safeBottom={false}
        footer={matchForm ? (
          <>
            <FormError message={error} />
            <Button
              label={
                busy
                  ? isImmediate ? 'Starting…' : 'Scheduling…'
                  : isFriendly
                    ? isImmediate ? '▶ Create & score now' : '📅 Schedule friendly'
                    : 'Schedule match'
              }
              onPress={submit}
            />
          </>
        ) : null}
      >
        <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <ScreenTitle
            title={cloneOf ? 'Clone match' : isFriendly ? 'Start a friendly' : 'Schedule a match'}
            subtitle={cloneOf ? (cloneReady ? 'Same teams, squads, venue & rules — kicks off now. The toss is re-done.' : 'Loading the match to copy…') : isFriendly ? 'A quick game — no tournament needed' : 'Pick sport, teams & time'}
          />

          <SportPicker sport={sport} onPick={pickSport} />

          {sport === 'athletics' ? (
            <>
              <Text style={textStyles.muted}>
                🏃 Athletics isn’t a match: each race is an event with heats and a final. Add the event, its athletes (or relay teams), rounds and lanes, then enter times heat by heat.
              </Text>
              <Button label="🏃 Set up an athletics event →" onPress={() => nav.navigate('AthleticsEventSetup', { tournamentId })} />
            </>
          ) : sport === 'swimming' ? (
            <>
              <Text style={textStyles.muted}>
                🏊 Swimming isn’t a match: each race is an event — a timed final, or heats and a final. Add the event, its swimmers (or relay teams), rounds and lanes, then enter times heat by heat.
              </Text>
              <Button label="🏊 Set up a swimming event →" onPress={() => nav.navigate('AthleticsEventSetup', { tournamentId, sport: 'swimming' })} />
            </>
          ) : sport === 'cycling' ? (
            <>
              <Text style={textStyles.muted}>🚴 Cycling isn’t a match: each race (time trial, road race, stage race, pursuit, sprint, keirin, points race …) is an event. Add the race, the category and the riders, then enter times or the order on the line.</Text>
              <Button label="🚴 Set up a cycling race →" onPress={() => nav.navigate('AthleticsEventSetup', { tournamentId, sport: 'cycling' })} />
            </>
          ) : sport === 'rowing' || sport === 'canoe' ? (
            <>
              <Text style={textStyles.muted}>
                {sport === 'rowing' ? '🚣 Rowing isn’t a match: each race (1x, 2x, 4+, 8+ …) is an event with heats, a repechage and Finals A / B. Add the boat class, the crews seat by seat, the progression and lanes, then enter finish times race by race.' : '🛶 Canoe sprint isn’t a match: each race (K1 … C4, 200 / 500 / 1000 m) is an event with heats, semi-finals and Finals A / B. Add the boat, the paddlers, the progression and lanes, then enter finish times race by race.'}
              </Text>
              <Button label={sport === 'rowing' ? '🚣 Set up a rowing race →' : '🛶 Set up a canoe sprint race →'} onPress={() => nav.navigate('AthleticsEventSetup', { tournamentId, sport })} />
            </>
          ) : sport === 'archery' ? (
            <>
              <Text style={textStyles.muted}>
                🏹 Archery isn’t a single match: each event (Recurve 70 m, Compound 50 m …) is a ranking round of ends, then a seeded match-play bracket with a bronze medal match. Add the event and its archers, then enter each end as it is scored.
              </Text>
              <Button label="🏹 Set up an archery event →" onPress={() => nav.navigate('AthleticsEventSetup', { tournamentId, sport: 'archery' })} />
            </>
          ) : sport === 'shooting' ? (
            <>
              <Text style={textStyles.muted}>
                🎯 Shooting isn’t a match: each event (10 m Air Rifle, 10 m Air Pistol …) is a qualification of series, then a final for the best eight. Add the event and its shooters, then enter each series as it is scored.
              </Text>
              <Button label="🎯 Set up a shooting event →" onPress={() => nav.navigate('AthleticsEventSetup', { tournamentId, sport: 'shooting' })} />
            </>
          ) : sport === 'weightlifting' ? (
            <>
              <Text style={textStyles.muted}>
                🏋️ Weightlifting isn’t a match: each bodyweight category is an event — weigh-in, then three snatch and three clean & jerk attempts per lifter. Add the category and its lifters, then enter each attempt as it is lifted.
              </Text>
              <Button label="🏋️ Set up a weightlifting event →" onPress={() => nav.navigate('AthleticsEventSetup', { tournamentId, sport: 'weightlifting' })} />
            </>
          ) : golfField ? (
            <>
              <SportFormatEditor sport="golf" value={format} onChange={(k, v) => setFormat((f) => ({ ...f, [k]: v }))} omitKeys={['extraHoles']} />
              <Text style={textStyles.muted}>
                ⛳ Stroke play and Stableford put everyone on one leaderboard — pick the course, add your group (and Handicap Indexes), and score hole by hole. Choose “Match play” above for a head-to-head game.
              </Text>
              <Button label="⛳ Set up the round →" onPress={() => nav.navigate('GolfRoundSetup', { tournamentId, competition: String(format.competition ?? 'stroke'), holes: String(format.holes ?? '18') })} />
            </>
          ) : (
          <>
          {sport && (
            <>
              {/* Racket sports pick their structure first — Singles (one player a
                  side) or Doubles (a pair) — so the participant picker below adapts. */}
              {getSportMeta(sport).participantKind === 'both' && (
                <View style={{ gap: theme.spacing(2) }}>
                  <FieldLabel>Format</FieldLabel>
                  <View style={st.chips}>
                    <SelectChip label={`👤 ${structureLabels(getSportMeta(sport)).one}`} active={mode === 'individual'} onPress={() => setStructure(1)} />
                    <SelectChip label={`👥 ${structureLabels(getSportMeta(sport)).two}`} active={mode === 'pairs'} onPress={() => setStructure(2)} />
                  </View>
                </View>
              )}

              {mode === 'team' ? (
                <>
                  {sport && (
                    <ClubQuickPick
                      sport={sport}
                      selectedTeamIds={[home, away].filter(Boolean) as string[]}
                      onPicked={(team) => {
                        // Fill the first empty side; ignore a duplicate of the other side.
                        if (!home) setHome(team.id);
                        else if (!away && team.id !== home) setAway(team.id);
                        setTeamNonce((n) => n + 1);
                      }}
                    />
                  )}
                  <TeamPicker noun="team" label="Home team" teams={pickTeams} selected={home} onSelect={setHome} onClear={() => setHome(null)} onCreate={makeCreateHandler('home')} />
                  <TeamPicker noun="team" label="Away team" teams={pickTeams} selected={away} onSelect={setAway} onClear={() => setAway(null)} onCreate={makeCreateHandler('away')} />
                </>
              ) : mode === 'individual' ? (
                <>
                  <TeamPicker noun="player" label="Player 1" teams={singleTeams} selected={home} onSelect={setHome} onClear={() => setHome(null)} onCreate={makeCreateHandler('home')} newEntrant={entrantPicker('home', 1)} onPickMe={pickMe('home')} meName={profile?.fullName} people={people} onSelectPerson={pickPerson('home')} />
                  <TeamPicker noun="player" label="Player 2" teams={singleTeams} selected={away} onSelect={setAway} onClear={() => setAway(null)} onCreate={makeCreateHandler('away')} newEntrant={entrantPicker('away', 1)} people={people} onSelectPerson={pickPerson('away')} />
                </>
              ) : (
                <>
                  <Text style={textStyles.muted}>A doubles side is a pair of two players. Pick a pair, or pick a player to start a new pair — by name or mobile number, so the match lands on each partner’s profile.</Text>
                  <TeamPicker noun="pair" label="Pair 1" teams={pairTeams} selected={home} onSelect={setHome} onClear={() => setHome(null)} onCreate={makeCreateHandler('home')} newEntrant={entrantPicker('home', 2)} people={pairPeople} recent={recentHome} onStartWithMe={profile?.fullName ? resolveMe : undefined}
                    otherPairs={otherPairsFor(recentHome, away)} onPickPair={(x) => void makeEntrantHandler('home')([{ kind: 'person', person: x.a }, { kind: 'person', person: x.b }])} />
                  <TeamPicker noun="pair" label="Pair 2" teams={pairTeams} selected={away} onSelect={setAway} onClear={() => setAway(null)} onCreate={makeCreateHandler('away')} newEntrant={entrantPicker('away', 2)} people={pairPeople} recent={recentAway}
                    otherPairs={otherPairsFor(recentAway, home)} onPickPair={(x) => void makeEntrantHandler('away')([{ kind: 'person', person: x.a }, { kind: 'person', person: x.b }])} />
                </>
              )}

              {isFriendly && (!home || !away) && (
                <Text style={textStyles.muted}>
                  In a hurry? Leave {home || away ? 'it' : 'them'} empty and tap Create &amp; score now: {mode === 'team' ? 'Team A and Team B' : mode === 'pairs' ? 'Pair A and Pair B' : 'Player A and Player B'} start straight away. Add names and players any time.
                </Text>
              )}

              <DateTimeField label="Kickoff" value={when} onChange={(d) => { whenTouched.current = true; setWhen(d); }} timeZone={tournament?.timeZone} />

              {/* Phase tag — only for tournament matches. Lets an organizer place a
                  match precisely: a group game, or a specific knockout tie that then
                  shows in the right round of the bracket. */}
              {!isFriendly && (
                <View style={{ gap: theme.spacing(2) }}>
                  <FieldLabel>Stage</FieldLabel>
                  <View style={st.chips}>
                    <SelectChip label="League" active={phase === 'league'} onPress={() => setPhase('league')} />
                    <SelectChip label="👥 Group" active={phase === 'group'} onPress={() => setPhase('group')} />
                    {KO_STAGES.map((s) => (
                      <SelectChip key={s} label={KO_STAGE_LABEL[s]} active={phase === s} onPress={() => setPhase(s)} />
                    ))}
                  </View>
                  {phase === 'group' && (
                    <TextField label="Group" value={groupLabel} onChange={(t) => setGroupLabel(t.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase())} placeholder="A" autoCapitalize="characters" />
                  )}
                </View>
              )}

              {(getSportMeta(sport).formatFields ?? []).length > 0 && (!isFriendly || moreOpen) && (
                <SportFormatEditor
                  sport={sport}
                  value={format}
                  onChange={(k, v) => setFormat((f) => ({ ...f, [k]: v }))}
                  // Singles/Doubles is chosen up front for racket sports, so don't repeat it here.
                  omitKeys={getSportMeta(sport).participantKind === 'both' ? ['playersPerSide'] : undefined}
                />
              )}
            </>
          )}

          {/* UI audit step 6: a friendly shows sport, players and Create first; rules,
              venue and a stream link fold under More options (standard rules by default) */}
          {isFriendly && !moreOpen ? (
            <Text style={st.moreLink} accessibilityRole="button" accessibilityState={{ expanded: false }} onPress={() => setMoreOpen(true)}>
              More options — rules, venue, live stream ▾{venue.trim() ? ` · 📍 ${venue.trim()}` : ''}
            </Text>
          ) : (
            <>
              <VenueField venue={venue} onVenue={setVenue} venueUrl={venueUrl} onVenueUrl={setVenueUrl} knownVenues={knownVenues} />
              <TextField
                label="Live stream link (optional)"
                value={stream}
                onChange={setStream}
                placeholder="youtu.be/… · youtube.com/live/… · twitch.tv/…"
                autoCapitalize="none"
              />
              <Text style={textStyles.muted}>
                Add a YouTube or Twitch link and it shows at the top of the live match. You can also set or change it later from the match’s Info tab.
              </Text>
            </>
          )}

          <ConflictNotice conflicts={conflicts} />

          </>
          )}
        </KeyboardAwareScrollView>
      </KeyboardFooterLayout>
    </SafeAreaView>
  );
}

/** Compact sport picklist — a field that opens an inline list, instead of a
 *  10-chip wall. */
function SportPicker({ sport, onPick }: { sport: SportId | null; onPick: (s: SportId) => void }) {
  const [open, setOpen] = useState(false);
  const cur = sport ? getSportMeta(sport) : null;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <FieldLabel>Sport</FieldLabel>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={cur ? `Sport: ${cur.name}` : 'Select a sport'} accessibilityState={{ expanded: open }} activeOpacity={0.8} style={st.field} onPress={() => setOpen((o) => !o)}>
        <Text style={[st.fieldValue, !cur && st.fieldPlaceholder]}>{cur ? `${cur.icon}  ${cur.name}` : 'Select a sport'}</Text>
        <Text style={st.caret}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={st.dropdown}>
          {SPORT_LIST.map((s) => (
            <TouchableOpacity accessibilityRole="button"
              key={s.id}
              activeOpacity={0.7}
              style={[st.option, s.id === sport && st.optionActive]}
              onPress={() => { onPick(s.id); setOpen(false); }}
            >
              <SportLine sports={[s.id]} size={24} textStyle={st.optionText} />
              {s.id === sport && <Glyph emoji="✓" style={st.check} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

/** One side of a match. `noun` sets every user-facing word — a team, a pair
 *  (doubles) or a player (singles) — so an individual sport never says "team".
 *  All three still resolve to a side id under the hood. `onPickMe` adds a
 *  one-tap "Me" chip for individual sports. A team is created from a typed name;
 *  a player / pair is PEOPLE, picked with `newEntrant` (an EntrantPicker). */
function TeamPicker({
  label,
  noun = 'team',
  teams,
  selected,
  onSelect,
  onClear,
  onCreate,
  newEntrant,
  onPickMe,
  meName,
  people,
  onSelectPerson,
  recent,
  onStartWithMe,
  otherPairs,
  onPickPair,
}: {
  label: string;
  noun?: 'team' | 'pair' | 'player';
  teams: PickTeam[];
  selected: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  /** create a brand-new team from a typed name; returns true if it succeeded */
  onCreate: (name: string) => Promise<boolean>;
  /** singles / doubles: who's on a new side — the real people, picked by name or
   *  mobile number (never a free-typed name that links to no one) */
  newEntrant?: (seed?: EntrantPerson) => React.ReactNode;
  /** individual sports only: one-tap select the signed-in user */
  onPickMe?: () => void;
  meName?: string;
  /** individual sports: everyone in the app, searchable by name */
  people?: { id: string; name: string }[];
  onSelectPerson?: (playerId: string) => void;
  /** doubles (DP6): one-tap pairs this user recently played in or hosted */
  recent?: PickTeam[];
  /** doubles (DP5): "👤 Me +" — start a new pair with me as partner 1 */
  onStartWithMe?: () => Promise<EntrantPerson | null>;
  /** doubles (PT8): my other pairs, from any sport — picking one makes / reuses this sport's entry */
  otherPairs?: { key: string; label: string; a: EntrantPerson; b: EntrantPerson }[];
  onPickPair?: (p: { a: EntrantPerson; b: EntrantPerson }) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  // doubles: partner 1 of a new pair, picked from the search or "Me +"
  const [seed, setSeed] = useState<EntrantPerson | undefined>(undefined);
  const [meErr, setMeErr] = useState<string | null>(null);
  // Once a side is chosen the add panel closes, so "Change" starts afresh.
  useEffect(() => { if (selected) { setCreating(false); setQuery(''); setSeed(undefined); } }, [selected]);

  const selectedTeam = teams.find((t) => t.id === selected);
  const q = query.trim().toLowerCase();
  // Search kicks in at 3+ letters.
  const results = searchSides(teams, q);
  const personResults = people ? searchPeople(people, q, 25 - results.length) : [];

  const searchPlaceholder = noun === 'player' ? 'Search players (type 3+ letters)…' : noun === 'pair' ? 'Search pairs or players (type 3+ letters)…' : 'Search all teams (type 3+ letters)…';
  // DP4: in doubles a person is never a one-person "pair" — picking one starts
  // a new pair with them as partner 1 and asks for partner 2.
  const choosePerson = (p: { id: string; name: string }) => {
    if (noun === 'pair') { setSeed({ id: p.id, fullName: p.name }); setCreating(true); setQuery(''); return; }
    onSelectPerson?.(p.id);
  };
  const startWithMe = async () => {
    if (!onStartWithMe) return;
    setMeErr(null);
    const me = await onStartWithMe().catch(() => null);
    if (!me) { setMeErr('Couldn’t add you — try again.'); return; }
    setSeed(me); setCreating(true); setQuery('');
  };
  const meFirst = meName ? meName.trim().split(/\s+/)[0] : 'Me';
  // players and pairs are people (picked), only a team is a typed name
  const pickPeople = !!newEntrant && noun !== 'team';
  const newLabel = noun === 'player' ? '＋ Someone else (mobile or name)' : `＋ New ${noun}`;

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate(name.trim());
    setBusy(false);
    if (ok) { setName(''); setCreating(false); setQuery(''); }
  };

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.muted}>{label}</Text>

      {selectedTeam ? (
        <View style={st.selectedRow}>
          <SelectChip label={selectedTeam.name} dotColor={selectedTeam.colorHex} active onPress={onClear} />
          <Text style={st.changeLink} onPress={onClear}>Change</Text>
        </View>
      ) : (
        <>
          {onPickMe && (
            <SelectChip label={`＋ Me (${meFirst})`} accessibilityLabel={`Add me, ${meFirst}`} active={false} onPress={onPickMe} />
          )}
          {onStartWithMe && !creating && (
            <SelectChip label="👤 Me +" active={false} onPress={() => void startWithMe()} />
          )}
          <FormError message={meErr} />
          {!creating && q.length === 0 && !!recent?.length && (
            <>
              <Text style={st.tinyLabel}>Recent pairs</Text>
              <View style={st.chips}>
                {recent.map((t) => (
                  <SelectChip key={`r-${t.id}`} label={t.name} dotColor={t.colorHex} active={false} onPress={() => onSelect(t.id)} />
                ))}
              </View>
            </>
          )}
          {!creating && q.length === 0 && !!otherPairs?.length && onPickPair && (
            <>
              <Text style={st.tinyLabel}>Your pairs</Text>
              <View style={st.chips}>
                {otherPairs.map((p) => (
                  <SelectChip key={`p-${p.key}`} label={`🤝 ${p.label}`} active={false} onPress={() => onPickPair(p)} />
                ))}
              </View>
            </>
          )}
          {!creating && (
            <>
              <TextField label="" value={query} onChange={setQuery} placeholder={searchPlaceholder} autoCapitalize="none" />
              {q.length > 0 && q.length < 3 && <Text style={st.tinyLabel}>Keep typing…</Text>}
              {(results.length > 0 || personResults.length > 0) && (
                <View style={st.chips}>
                  {results.map((t) => (
                    <SelectChip key={t.id} label={t.name} dotColor={t.colorHex} active={false} onPress={() => onSelect(t.id)} />
                  ))}
                  {personResults.map((p) => (
                    <SelectChip key={`p-${p.id}`} label={`👤 ${p.name}`} active={false} onPress={() => choosePerson(p)} />
                  ))}
                </View>
              )}
              {q.length >= 3 && results.length === 0 && personResults.length === 0 && (
                <Text style={textStyles.muted}>
                  {pickPeople ? `No ${noun}s match “${query.trim()}”. Add them below — their mobile number links the real person.` : `No ${noun}s match “${query.trim()}”. Create one below.`}
                </Text>
              )}
            </>
          )}

          <SelectChip label={newLabel} active={creating} onPress={() => { setSeed(undefined); setCreating((c) => !c); }} />
          {creating && (pickPeople ? newEntrant?.(seed) : (
            <View style={{ gap: theme.spacing(2) }}>
              <TextField label={`New ${noun} name`} value={name} onChange={setName} placeholder="e.g. Sunday FC" />
              <Button label={busy ? 'Creating…' : '＋ Create & select'} onPress={create} disabled={busy || !name.trim()} />
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  moreLink: { color: theme.colors.primary, fontWeight: '700', paddingVertical: theme.spacing(2) },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  tinyLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  // compact select field + dropdown (sport picklist)
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3),
  },
  fieldValue: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  fieldPlaceholder: { color: theme.colors.textMuted, fontWeight: '400' },
  caret: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800' },
  dropdown: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  optionActive: { backgroundColor: theme.colors.surfaceAlt },
  optionText: { color: theme.colors.text, fontSize: theme.font.body },
  check: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900' },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  changeLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
