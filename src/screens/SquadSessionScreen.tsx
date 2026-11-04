/** A squad session (founder 2026-11-04, docs/product/squad-sessions.md): a
 *  club's game day. Who's here → rules → captains → captains pick teams →
 *  games in rotation with a session table. Any player present may change the
 *  rules; only the captain on turn picks. Games are ordinary friendlies.
 *  Opened with { clubId } to start one, or { sessionId } to carry on. */
import { SportPicker } from '../components/SportPicker';
import { useMySports } from '../data/useMySports';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { Button, Card, EmptyState, FieldLabel, FormError, LoadingState, ScreenTitle, SelectChip, TextField, textStyles } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { canScoreByRole } from '../core/roles';
import { SPORT_LIST, getSportMeta } from '../sports/sportMeta';
import {
  DEFAULT_RULES, MAX_TEAMS, asSessionGames, available, captainsDraw, cleanRules, nextGame, pickTurn,
  sessionTable, sittingOut, teamRosters, type SessionRules, type SquadSession,
} from '../core/squadSession';
import {
  createSquadSession, endSession, getSquadSession, makeTeams, pickPlayer, restartPicks, sessionErrorText,
  setSessionCaptains, setSessionFormat, setSessionPlayers, setSessionRules, shareRest, startNextGame,
} from '../data/squadSessions';
import { getClub, getClubMembers, getClubSports, getClubsForPlayer, getMyPlayerId, getPlayerNamesById, invitePerson } from '../data/repos';
import { PersonPicker } from '../components/PersonPicker';
import { SportFormatEditor, type FormatVal } from '../components/FormatEditor';
import { playerInviteText } from '../core/inviteText';
import { SHARE_BASE } from '../core/shareText';
import type { Club } from '../core/types';
import type { Match, SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function Stepper({ label, value, min, max, onChange, disabled }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <View style={st.stepRow}>
      <Text style={[textStyles.body, { flex: 1 }]}>{label}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Fewer: ${label}`} disabled={disabled || value <= min} onPress={() => onChange(value - 1)} style={st.stepBtn}>
        <Text style={st.stepTxt}>−</Text>
      </TouchableOpacity>
      <Text style={st.stepVal}>{value}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`More: ${label}`} disabled={disabled || value >= max} onPress={() => onChange(value + 1)} style={st.stepBtn}>
        <Text style={st.stepTxt}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function RulesCard({ rules, teamsLocked, onChange, busy }: { rules: SessionRules; teamsLocked: boolean; onChange: (r: SessionRules) => void; busy: boolean }) {
  const set = (p: Partial<SessionRules>) => onChange(cleanRules({ ...rules, ...p }));
  return (
    <Card style={st.gap}>
      <Text style={textStyles.h3}>Rules</Text>
      <Text style={textStyles.muted}>Anyone playing today can change these.</Text>
      <Stepper label={teamsLocked ? 'Teams (fixed once captains are chosen)' : 'Teams'} value={rules.teams} min={2} max={MAX_TEAMS} disabled={busy || teamsLocked} onChange={(teams) => set({ teams })} />
      <FieldLabel>Who plays next</FieldLabel>
      <View style={st.chips}>
        <SelectChip label="Round robin" active={rules.rotation === 'round_robin'} disabled={busy} onPress={() => set({ rotation: 'round_robin' })} />
        <SelectChip label="Winner stays" active={rules.rotation === 'winner_stays'} disabled={busy} onPress={() => set({ rotation: 'winner_stays' })} />
      </View>
      <Text style={textStyles.muted}>
        {rules.rotation === 'round_robin'
          ? 'Every team plays the same number of games, whoever wins (1 v 2, 2 v 3, 3 v 1 …).'
          : 'The winner stays on and the team that waited longest comes on.'}
      </Text>
      {rules.rotation === 'winner_stays' ? (
        <>
          <Stepper label="Wins in a row before the winner goes off" value={rules.maxWins} min={1} max={10} disabled={busy} onChange={(maxWins) => set({ maxWins })} />
          <FieldLabel>On a draw</FieldLabel>
          <View style={st.chips}>
            <SelectChip label="Team on longer goes off" active={rules.drawRule === 'longer_on_goes_off'} disabled={busy} onPress={() => set({ drawRule: 'longer_on_goes_off' })} />
            <SelectChip label="Both go off" active={rules.drawRule === 'both_off'} disabled={busy} onPress={() => set({ drawRule: 'both_off' })} />
          </View>
        </>
      ) : null}
      <FieldLabel>Picking</FieldLabel>
      <View style={st.chips}>
        <SelectChip label="Each captain on their phone" active={rules.pickOn === 'own'} disabled={busy} onPress={() => set({ pickOn: 'own' })} />
        <SelectChip label="One phone passed around" active={rules.pickOn === 'shared'} disabled={busy} onPress={() => set({ pickOn: 'shared' })} />
      </View>
      <FieldLabel hint="Snake: 1, 2, 3, then 3, 2, 1 — fairer teams.">Pick order</FieldLabel>
      <View style={st.chips}>
        <SelectChip label="Snake" active={rules.pickOrder === 'snake'} disabled={busy} onPress={() => set({ pickOrder: 'snake' })} />
        <SelectChip label="Straight" active={rules.pickOrder === 'straight'} disabled={busy} onPress={() => set({ pickOrder: 'straight' })} />
      </View>
      <FieldLabel>Points in the session table</FieldLabel>
      <Stepper label="Win" value={rules.points.win} min={0} max={10} disabled={busy} onChange={(win) => set({ points: { ...rules.points, win } })} />
      <Stepper label="Draw" value={rules.points.draw} min={0} max={10} disabled={busy} onChange={(draw) => set({ points: { ...rules.points, draw } })} />
      <Stepper label="Loss" value={rules.points.loss} min={0} max={10} disabled={busy} onChange={(loss) => set({ points: { ...rules.points, loss } })} />
    </Card>
  );
}

/** The sport's own game settings (length, points, sets…) for every NEW game (SS20–SS22). */
function GameSettingsCard({ sport, value, busy, onSave, onChange }: {
  sport: SportId; value: Record<string, unknown>; busy: boolean;
  /** saved session: a Save button applies them to the next games */
  onSave?: (f: Record<string, unknown>) => void;
  /** new session: changes go straight to the draft */
  onChange?: (f: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, FormatVal>>(value as Record<string, FormatVal>);
  const latest = useRef(draft);
  useEffect(() => { latest.current = value as Record<string, FormatVal>; setDraft(latest.current); }, [JSON.stringify(value)]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  return (
    <Card style={st.gap}>
      <Text style={textStyles.h3}>Game settings</Text>
      <Text style={textStyles.muted}>Every game in this session starts with these. A game already being played keeps its own.</Text>
      <SportFormatEditor sport={sport} value={draft} heading="game settings"
        onChange={(k, v) => {
          // a preset sends several keys in a row: build on the latest draft, then tell the parent
          const n = { ...latest.current, [k]: v };
          latest.current = n;
          setDraft(n);
          onChange?.(n);
        }} />
      {onSave ? <Button label={busy ? 'Saving…' : 'Save for the next games'} disabled={busy || !dirty} onPress={() => onSave(draft)} /> : null}
    </Card>
  );
}

export default function SquadSessionScreen() {
  const mySports = useMySports(); // UI audit step 4: your sports first
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SquadSession'>>();
  const { profile } = useAuth();
  const [sessionId, setSessionId] = useState<string | undefined>(params?.sessionId);
  const clubId = params?.clubId;

  const [session, setSession] = useState<SquadSession | null>(null);
  const [games, setGames] = useState<Match[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  // starting a new session
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [clubSports, setClubSports] = useState<SportId[]>([]);
  const [sport, setSport] = useState<SportId | null>(null);
  const [title, setTitle] = useState('');
  const [here, setHere] = useState<Set<string>>(new Set());
  const [draftRules, setDraftRules] = useState<SessionRules>(DEFAULT_RULES);
  const [capDraft, setCapDraft] = useState<string[]>([]);
  const [editHere, setEditHere] = useState<Set<string> | null>(null);
  const [draftFormat, setDraftFormat] = useState<Record<string, unknown>>({});
  // started from Organize: one of my teams, or none (SS23); guests found by name / number (SS17)
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [teamChoice, setTeamChoice] = useState<string | null>(clubId ?? null);
  const [guests, setGuests] = useState<{ id: string; name: string }[]>([]);
  const [addingGuest, setAddingGuest] = useState(false);
  const activeClub = clubId ?? teamChoice ?? undefined;

  const load = useCallback(async () => {
    const myId = await getMyPlayerId(profile?.id);
    setMe(myId);
    if (sessionId) {
      const r = await getSquadSession(sessionId);
      if (r) {
        setSession(r.session); setGames(r.games);
        setNames(await getPlayerNamesById(r.session.players));
        if (r.session.status === 'setup' && r.session.clubId) {
          const ms = await getClubMembers(r.session.clubId);
          setMembers(ms.map((m) => ({ id: m.playerId, name: m.player.fullName })));
        }
      }
    } else {
      if (!clubId) setMyClubs(await getClubsForPlayer(myId, profile?.id));
      if (activeClub) {
        const [club, ms, ss] = await Promise.all([getClub(activeClub), getClubMembers(activeClub), getClubSports(activeClub)]);
        setMembers(ms.map((m) => ({ id: m.playerId, name: m.player.fullName })));
        setClubSports(ss);
        setTitle(club?.name ?? '');
        setSport((s) => (s && ss.includes(s) ? s : ss[0] ?? s ?? null));
      } else {
        setMembers([]); setClubSports([]);
      }
      if (myId) setNames(await getPlayerNamesById([myId]));
      setHere((h) => (h.size || !myId ? h : new Set([myId])));
    }
    setLoading(false);
  }, [sessionId, clubId, activeClub, profile?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // Two phones: while picking or playing, refresh every few seconds.
  useEffect(() => {
    if (!session || (session.status !== 'picking' && session.status !== 'playing')) return;
    const t = setInterval(() => { if (!busyRef.current) void load(); }, 5000);
    return () => clearInterval(t);
  }, [session?.status, load]);

  async function act<T>(f: () => Promise<T>, after?: (v: T) => void) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const v = await f();
      if (after) after(v);
      else if (v && typeof v === 'object' && 'version' in (v as object)) setSession(v as unknown as SquadSession);
    } catch (e) {
      setError(sessionErrorText(e));
      if (sessionId) void load();
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }

  const nameOf = (id: string) => names.get(id) ?? members.find((m) => m.id === id)?.name ?? guests.find((g) => g.id === id)?.name ?? 'Player';
  const guestInvite = (who?: string) => playerInviteText({ name: who, inviterName: profile?.fullName, link: SHARE_BASE });
  // a guest is anyone found by name or mobile number, or a typed name (marked as not linked)
  const guestPicker = (onAdd: (id: string, name: string) => void, exclude: string[]) => (
    <PersonPicker role="player" excludeIds={exclude} inviteText={guestInvite} sport={(sport ?? session?.sport) as SportId | undefined}
      cta="Add to the session" onPick={(p) => { setGuests((g) => [...g.filter((x) => x.id !== p.id), { id: p.id, name: p.fullName }]); onAdd(p.id, p.fullName); }}
      onNameOnly={async (nm) => { const { player } = await invitePerson({ name: nm }); setGuests((g) => [...g, { id: player.id, name: player.fullName }]); onAdd(player.id, player.fullName); }} />
  );
  const ruleSet = session?.rules ?? draftRules;
  const sessionGames = useMemo(() => (session ? asSessionGames(session.teamIds, games) : []), [session, games]);
  const teamName = (i: number) => `${session?.name ?? ''} ${i + 1}`;
  const openGame = games.find((g) => g.status === 'scheduled' || g.status === 'live');

  const openMatch = (m: Match, scoring?: boolean) => nav.navigate('LiveScoring', {
    matchId: m.id, sport: m.sport, homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
    homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name, homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
    canScore: canScoreByRole(profile?.role), ...(scoring ? { tab: 'scoring' } : {}),
  });

  if (loading) return <SafeAreaView style={st.safe}><LoadingState /></SafeAreaView>;

  /* ------------------------------ start one ------------------------------ */
  if (!session) {
    if (sessionId) return <SafeAreaView style={st.safe}><EmptyState icon="🔎" title="Session not found" hint="It may have been removed." /></SafeAreaView>;
    const sports = clubSports.length ? SPORT_LIST.filter((s) => clubSports.includes(s.id)) : SPORT_LIST;
    const n = here.size;
    const toggle = (id: string) => setHere((h) => { const x = new Set(h); if (x.has(id)) x.delete(id); else x.add(id); return x; });
    const canStart = !!sport && title.trim().length > 0 && n >= draftRules.teams;
    // me, the team's members, then guests — each once
    const candidates = [...new Map([...(me ? [[me, names.get(me) ?? 'Me'] as const] : []), ...members.map((m) => [m.id, m.name] as const), ...guests.map((g) => [g.id, `${g.name} (guest)`] as const)])];
    const allIn = candidates.every(([id]) => here.has(id));
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <KeyboardAwareScrollView contentContainerStyle={st.content}>
          <ScreenTitle title="New session" subtitle="Who’s here, split into teams, play in turns" />
          {!clubId ? (
            <Card style={st.gap}>
              <FieldLabel hint="Its members are listed below; anyone else can be added as a guest.">Team</FieldLabel>
              <View style={st.chips}>
                {myClubs.map((c) => <SelectChip key={c.id} label={c.name} active={teamChoice === c.id} onPress={() => setTeamChoice(c.id)} />)}
                <SelectChip label="No team" active={!teamChoice} onPress={() => { setTeamChoice(null); setTitle(''); }} />
              </View>
            </Card>
          ) : null}
          <Card style={st.gap}>
            <FieldLabel>Sport</FieldLabel>
            <View style={st.chips}>
              <SportPicker mine={mySports} limitTo={clubSports} value={sport} onChange={setSport} />
            </View>
            <TextField label="Team name" value={title} onChange={(v) => setTitle(v.slice(0, 60))} placeholder="e.g. Fnatic" autoCapitalize="words" />
            <Text style={textStyles.muted}>Teams will be called “{title.trim() || 'Name'} 1”, “{title.trim() || 'Name'} 2” …</Text>
          </Card>
          <Card style={st.gap}>
            <View style={st.rowBetween}>
              <Text style={textStyles.h3}>Who’s here · {n}</Text>
              {candidates.length > 1 ? (
                <TouchableOpacity accessibilityRole="button" onPress={() => setHere(new Set(allIn ? (me ? [me] : []) : candidates.map(([id]) => id)))}>
                  <Text style={st.link}>{allIn ? 'Clear' : 'Everyone'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={st.chips}>
              {candidates.map(([id, nm]) => (
                <SelectChip key={id} label={nm} active={here.has(id)} onPress={() => toggle(id)} />
              ))}
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={() => setAddingGuest((v) => !v)}>
              <Text style={st.link}>{addingGuest ? 'Close' : '+ Add a guest'}</Text>
            </TouchableOpacity>
            {addingGuest ? guestPicker((id) => setHere((h) => new Set([...h, id])), [...here]) : null}
          </Card>
          <RulesCard rules={draftRules} teamsLocked={false} busy={busy} onChange={setDraftRules} />
          {sport ? <GameSettingsCard sport={sport} value={draftFormat} busy={busy} onChange={setDraftFormat} /> : null}
          {n < draftRules.teams ? <Text style={textStyles.muted}>Tick at least {draftRules.teams} players for {draftRules.teams} teams.</Text> : null}
          <FormError message={error} />
          <Button label={busy ? 'Starting…' : 'Start session'} disabled={!canStart || busy}
            onPress={() => act(() => createSquadSession({ sport: sport!, name: title, players: [...here], rules: draftRules, clubId: activeClub, format: draftFormat }), (s) => {
              setSession(s); setSessionId(s.id); nav.setParams({ sessionId: s.id, clubId: undefined });
            })} />
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  /* ---------------------------- a live session --------------------------- */
  const s = session;
  const sportName = getSportMeta(s.sport as SportId)?.name ?? s.sport;
  const turn = s.status === 'picking' ? pickTurn(s.captains, s.picks.length, s.rules.pickOrder) : null;
  const left = s.status === 'picking' ? available(s.players, s.captains, s.picks) : [];
  const rosters = teamRosters(s.captains, s.picks);
  const myTurn = !!turn && turn === me;
  const amInSession = !!me && s.players.includes(me);
  // one phone passed around: anyone in the session taps for the captain on turn (SS18)
  const sharedPick = s.rules.pickOn === 'shared' && amInSession;
  const canPick = myTurn || sharedPick;
  const next = s.status === 'playing' ? nextGame(s.teamIds.length, sessionGames, s.rules) : null;
  const table = s.teamIds.length ? sessionTable(s.teamIds.length, sessionGames, s.rules.points) : [];
  const amIn = !!me && s.players.includes(me);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <ScreenTitle title={s.name} subtitle={`${sportName} session · ${s.players.length} players · ${s.status === 'ended' ? 'ended' : s.status === 'playing' ? 'playing' : 'making teams'}`} />
        {!amIn ? <Card><Text style={textStyles.muted}>You’re watching. Only the players in this session can change it.</Text></Card> : null}
        <FormError message={error} />

        {s.status === 'setup' ? (
          <>
            <Card style={st.gap}>
              <Text style={textStyles.h3}>Who’s here · {s.players.length}</Text>
              <View style={st.chips}>
                {s.players.map((p) => (
                  <SelectChip key={p} label={nameOf(p)} active={capDraft.includes(p)} disabled={busy || !amIn}
                    onPress={() => setCapDraft((c) => (c.includes(p) ? c.filter((x) => x !== p) : c.length < s.rules.teams ? [...c, p] : c))} />
                ))}
              </View>
              <Text style={textStyles.muted}>Tap {s.rules.teams} players to make them captains ({capDraft.length}/{s.rules.teams}), or draw them at random.</Text>
              <View style={st.chips}>
                <Button label="🎲 Random draw" variant="ghost" disabled={busy || !amIn} onPress={() => setCapDraft(captainsDraw(s.players, s.rules.teams))} />
                <Button label="Confirm captains" disabled={busy || !amIn || capDraft.length !== s.rules.teams}
                  onPress={() => act(() => setSessionCaptains(s, capDraft))} />
              </View>
            </Card>
            {amIn ? (
              <Card style={st.gap}>
                <View style={st.rowBetween}>
                  <Text style={textStyles.h3}>Change who’s here</Text>
                  <TouchableOpacity accessibilityRole="button" onPress={() => setEditHere((v) => (v ? null : new Set(s.players)))}>
                    <Text style={st.link}>{editHere ? 'Close' : 'Edit'}</Text>
                  </TouchableOpacity>
                </View>
                {editHere ? (
                  <>
                    <View style={st.chips}>
                      {[...new Map([...members.map((m) => [m.id, m.name] as const), ...s.players.map((p) => [p, nameOf(p)] as const), ...guests.map((g) => [g.id, g.name] as const)])].map(([id, nm]) => (
                        <SelectChip key={id} label={nm} active={editHere.has(id)} disabled={busy}
                          onPress={() => setEditHere((h) => { const x = new Set(h); if (x.has(id)) x.delete(id); else x.add(id); return x; })} />
                      ))}
                    </View>
                    {guestPicker((id, nm) => { setNames((n) => new Map(n).set(id, nm)); setEditHere((h) => new Set([...(h ?? []), id])); }, [...editHere])}
                    <Button label="Save players" disabled={busy || editHere.size < s.rules.teams}
                      onPress={() => act(() => setSessionPlayers(s, [...editHere]), (x) => {
                        setSession(x); setEditHere(null); setCapDraft((c) => c.filter((p) => x.players.includes(p)));
                        void getPlayerNamesById(x.players).then(setNames);
                      })} />
                  </>
                ) : <Text style={st.linkMuted}>Players can change until captains are confirmed.</Text>}
              </Card>
            ) : null}
            {amIn ? <RulesCard rules={ruleSet} teamsLocked={false} busy={busy} onChange={(r) => act(() => setSessionRules(s, r))} /> : null}
            {amIn ? <GameSettingsCard sport={s.sport as SportId} value={s.format} busy={busy} onSave={(f) => act(() => setSessionFormat(s, f))} /> : null}
          </>
        ) : null}

        {s.status === 'picking' ? (
          <>
            <Card style={st.gap}>
              {left.length ? (
                <>
                  <Text style={textStyles.h3}>{myTurn ? 'Your pick' : `${nameOf(turn!)}’s pick`}</Text>
                  <Text style={textStyles.muted}>{myTurn ? 'Tap a player for your team.'
                    : sharedPick ? `Pass the phone to ${nameOf(turn!)} — they tap a player.` : `Waiting for ${nameOf(turn!)} to pick on their phone.`}</Text>
                  <View style={st.chips}>
                    {left.map((p) => <SelectChip key={p} label={nameOf(p)} active={false} disabled={busy || !canPick} onPress={() => act(() => pickPlayer(s, p))} />)}
                  </View>
                  {amIn ? <Button label="Share out the rest" variant="ghost" disabled={busy} onPress={() => act(() => shareRest(s))} /> : null}
                </>
              ) : (
                <>
                  <Text style={textStyles.h3}>Everyone’s picked</Text>
                  {amIn ? <Button label={busy ? 'Making teams…' : 'Make teams'} disabled={busy} onPress={() => act(() => makeTeams(s))} /> : null}
                </>
              )}
            </Card>
            {rosters.map((r, i) => (
              <Card key={s.captains[i]} style={st.gap}>
                <Text style={textStyles.h3}>{teamName(i)}</Text>
                <Text style={textStyles.body}>{r.map((p, k) => (k === 0 ? `${nameOf(p)} (C)` : nameOf(p))).join(', ')}</Text>
              </Card>
            ))}
            {amIn ? (
              <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => act(() => restartPicks(s), (x) => { setSession(x); setCapDraft(x.captains); })}>
                <Text style={st.link}>Start picks again</Text>
              </TouchableOpacity>
            ) : null}
            {amIn ? <RulesCard rules={ruleSet} teamsLocked busy={busy} onChange={(r) => act(() => setSessionRules(s, r))} /> : null}
            {amIn ? <GameSettingsCard sport={s.sport as SportId} value={s.format} busy={busy} onSave={(f) => act(() => setSessionFormat(s, f))} /> : null}
          </>
        ) : null}

        {s.status === 'playing' || s.status === 'ended' ? (
          <>
            {s.status === 'playing' ? (
              openGame ? (
                <Card style={st.gap}>
                  <Text style={textStyles.h3}>Game on</Text>
                  <MatchCard match={openGame} onPress={() => openMatch(openGame)} onStart={amIn ? () => openMatch(openGame, true) : undefined} />
                </Card>
              ) : next ? (
                <Card style={st.gap}>
                  <Text style={textStyles.h3}>Next game</Text>
                  <Text style={textStyles.body}>{teamName(next.home)} v {teamName(next.away)}</Text>
                  {sittingOut(s.teamIds.length, next).length ? (
                    <Text style={textStyles.muted}>Sitting out: {sittingOut(s.teamIds.length, next).map(teamName).join(', ')}</Text>
                  ) : null}
                  {amIn ? (
                    <Button label={busy ? 'Starting…' : '▶ Start game'} disabled={busy}
                      onPress={() => act(() => startNextGame(s, next.home, next.away), async () => {
                        const r = await getSquadSession(s.id);
                        if (r) { setSession(r.session); setGames(r.games); const g = r.games.find((x) => x.status === 'scheduled'); if (g) openMatch(g, true); }
                      })} />
                  ) : null}
                </Card>
              ) : null
            ) : null}

            <Card style={st.gap}>
              <Text style={textStyles.h3}>Session table</Text>
              <View style={st.tRow}>
                <Text style={[st.tCell, st.tTeam, st.tHead]}>Team</Text>
                {['P', 'W', 'D', 'L', 'Pts'].map((h) => <Text key={h} style={[st.tCell, st.tHead]}>{h}</Text>)}
              </View>
              {table.map((r) => (
                <View key={r.team} style={st.tRow}>
                  <Text style={[st.tCell, st.tTeam]} numberOfLines={1}>{teamName(r.team)}</Text>
                  {[r.played, r.won, r.drawn, r.lost, r.points].map((v, i) => <Text key={i} style={[st.tCell, i === 4 && st.tPts]}>{v}</Text>)}
                </View>
              ))}
            </Card>

            {rosters.map((r, i) => (
              <Card key={s.captains[i]} style={st.gap}>
                <Text style={textStyles.h3}>{teamName(i)}</Text>
                <Text style={textStyles.body}>{r.map((p, k) => (k === 0 ? `${nameOf(p)} (C)` : nameOf(p))).join(', ')}</Text>
              </Card>
            ))}

            {games.length ? <Text style={textStyles.h3}>Games · {games.length}</Text> : null}
            {[...games].reverse().map((m) => <MatchCard key={m.id} match={m} onPress={() => openMatch(m)} />)}

            {s.status === 'playing' && amIn ? (
              <>
                <RulesCard rules={ruleSet} teamsLocked busy={busy} onChange={(r) => act(() => setSessionRules(s, r))} />
                <GameSettingsCard sport={s.sport as SportId} value={s.format} busy={busy} onSave={(f) => act(() => setSessionFormat(s, f))} />
                <Button label="End session" variant="ghost" disabled={busy} onPress={() => act(() => endSession(s))} />
              </>
            ) : null}
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10) },
  gap: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: theme.colors.primary, fontWeight: '700' },
  linkMuted: { color: theme.colors.textMuted, fontSize: theme.font.small },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  stepBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt },
  stepTxt: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  stepVal: { minWidth: 28, textAlign: 'center', fontSize: theme.font.body, fontWeight: '800', color: theme.colors.text },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1) },
  tCell: { width: 36, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  tTeam: { flex: 1, textAlign: 'left' },
  tHead: { color: theme.colors.textMuted, fontWeight: '700' },
  tPts: { fontWeight: '800' },
});
