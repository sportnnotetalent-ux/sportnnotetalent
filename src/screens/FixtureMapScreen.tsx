/** The fixture map (founder 2026-11-07, Figma "Tournament Fixture Map";
 *  docs/security/breaks/fixture-map.md): a sport's whole format from day one —
 *  Group stage / Knockout stage, a round stepper, the tree with joining lines,
 *  the final's champion, third place — and an organiser fills each open slot
 *  right on the map. The picture comes from core/fixtureMap (the same seeding
 *  the app uses to make the real rounds). */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { theme } from '../core/theme';
import { Card, Button, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { SlotFillPanel } from '../components/SlotFillPanel';
import { DivisionTabs } from '../components/DivisionTabs';
import { useAuth } from '../core/auth';
import { useTournamentById, useLeagueData, useOrganizations, useTeams, useDivisions, useTournamentEntries } from '../data/hooks';
import { matchesInDivision } from '../data/groups';
import { getMyPlayerId, getTournamentSlotIds } from '../data/repos';
import { canManageTournament } from '../core/org';
import { structureFromFormat, describeStructure } from '../data/structureConfig';
import { buildFixtureMap, fixtureMapSheet, treeLayout, type MapSide, type MapTie, type MapRound } from '../core/fixtureMap';
import { getSportMeta } from '../sports/sportMeta';
import { formatShort, zoneShortName } from '../core/time';
import { printSheet } from '../core/printSheet';
import { inviteMessage, teamAtTournament } from '../core/invite';
import { openWhatsApp, openSms } from '../core/connect';
import type { CaptainInvite } from '../data/teamCaptain';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const CARD_H = 124;
const GAP = 16;
const COL_W = 230;
const JOIN_W = 36;

export default function FixtureMapScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'FixtureMap'>>();
  const { profile } = useAuth();
  const tournamentId = params.tournamentId;
  const tournament = useTournamentById(tournamentId);
  const sports = tournament?.sports ?? [];
  const [sportPick, setSport] = useState<SportId | undefined>(params.sport);
  const sport: SportId = sportPick && sports.includes(sportPick) ? sportPick : sports[0] ?? sportPick ?? 'football';
  const meta = getSportMeta(sport);

  const [nonce, setNonce] = useState(0);
  const { matches } = useLeagueData(tournamentId, nonce);
  // FM8: one division at a time, like the bracket
  const { categories: divisions, entries: allEntries, activeCat, setActiveCat } = useDivisions(tournamentId, nonce);
  const sportEntries = useTournamentEntries(tournamentId, sport, nonce);
  const divMatches = useMemo(() => matchesInDivision(matches, allEntries, activeCat).filter((m) => m.sport === sport), [matches, allEntries, activeCat, sport]);
  const allTeams = useTeams(sport, nonce);
  const [slotIds, setSlotIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let on = true;
    getTournamentSlotIds(tournamentId).then((ids) => on && setSlotIds(ids)).catch(() => {});
    return () => { on = false; };
  }, [tournamentId, nonce]);

  // FM2: only the tournament's organisers fill slots (the server checks too)
  const orgs = useOrganizations();
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    getMyPlayerId(profile?.id).then((id) => on && setMyId(id));
    return () => { on = false; };
  }, [profile?.id]);
  const canManage = tournament ? canManageTournament(tournament, orgs, myId, profile?.id) : false;

  useEffect(() => {
    if (tournament) nav.setOptions({ title: tournament.name });
  }, [nav, tournament?.name]);

  const cfg = structureFromFormat(tournament?.formats?.[sport] as Record<string, unknown> | undefined);
  const entries = useMemo(
    () => sportEntries
      .filter((e) => e.status === 'confirmed' && (!activeCat || (e.categoryId ?? null) === activeCat))
      .map((e) => ({ id: e.team.id, name: e.team.name, color: e.team.colorHex })),
    [sportEntries, activeCat],
  );
  const map = useMemo(
    () => buildFixtureMap({ cfg, structure: tournament?.structure, matches: divMatches, entries, slotIds }),
    [cfg?.shape, cfg?.groupCount, cfg?.advanceTopN, cfg?.advanceBest, cfg?.superPhase, cfg?.manualStandings, cfg?.bracket, tournament?.structure, divMatches, entries, slotIds],
  );
  const inFixtures = useMemo(() => new Set(matches.filter((m) => m.sport === sport).flatMap((m) => [m.homeTeam.id, m.awayTeam.id])), [matches, sport]);

  const hasRealKo = map.rounds.some((r) => !r.projected);
  const [stage, setStage] = useState<'groups' | 'knockout' | null>(null);
  const shownStage = map.kind !== 'groups' ? 'knockout' : stage ?? (hasRealKo ? 'knockout' : 'groups');
  const [start, setStart] = useState(0);
  const first = Math.min(start, Math.max(0, map.rounds.length - 1));

  const [filling, setFilling] = useState<{ id: string; name: string } | null>(null);
  const [invite, setInvite] = useState<CaptainInvite | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const openTeam = useCallback((teamId: string) => nav.navigate('TeamJourney', { tournamentId, teamId, sport }), [nav, tournamentId, sport]);
  const onSide = (s: MapSide) => {
    if (s.kind !== 'team') return;
    if (s.slot) { if (canManage) setFilling({ id: s.id, name: s.name }); return; }
    openTeam(s.id);
  };
  const nextOpen = useMemo(() => {
    const all: MapSide[] = [...map.groups.flatMap((g) => g.teams), ...map.unplaced, ...map.rounds.flatMap((r) => [...r.ties.flatMap((t) => [t.home, t.away]), ...r.byes])];
    const s = all.find((x) => x.kind === 'team' && x.slot);
    return s && s.kind === 'team' ? { id: s.id, name: s.name } : null;
  }, [map]);

  async function exportPdf() {
    setExportNote(null);
    const html = fixtureMapSheet(map, { name: tournament?.name ?? 'Tournament', sport: meta.name });
    const text = [`${tournament?.name ?? ''} — ${meta.name} fixture map`, ...map.rounds.map((r) => `${r.label}: ${r.ties.map((t) => `${sideName(t.home)} v ${sideName(t.away)}`).join('; ')}`)].join('\n');
    const out = await printSheet(html, { autoPrint: true, fallbackText: text });
    if (out === 'failed') setExportNote('Couldn’t open the print view here — try again from a computer.');
  }

  const played = divMatches.filter((m) => m.status === 'completed');
  const goals = meta.archetype === 'goal-time' ? played.reduce((n, m) => n + (m.score ? m.score.home + m.score.away : 0), 0) : null;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Fixture map" subtitle={cfg ? describeStructure(cfg) : `${meta.icon} ${meta.name}`} />

        {sports.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
            {sports.map((s) => (
              <SelectChip key={s} label={`${getSportMeta(s).icon} ${getSportMeta(s).name}`} active={sport === s} onPress={() => { setSport(s); setStart(0); setStage(null); }} />
            ))}
          </ScrollView>
        )}
        <DivisionTabs categories={divisions} activeCat={activeCat} onChange={setActiveCat} />

        {canManage && map.openSlots > 0 && (
          <Text style={st.slotsNote}>{map.openSlots} open slot{map.openSlots === 1 ? '' : 's'} — tap one on the map to put a team in it.</Text>
        )}
        {canManage && map.kind === 'groups' && map.openSlots > 0 && !divMatches.some((m) => m.group) && (
          <Text style={textStyles.muted}>Tip: make the group fixtures first — then a team you put in a slot keeps that slot’s group and games.</Text>
        )}
        {invite && <InviteCard invite={invite} tournamentName={tournament?.name} inviterName={profile?.fullName ?? 'The organizer'} onDismiss={() => setInvite(null)} />}

        {map.kind === 'empty' && (
          <Card style={st.gap}>
            <Text style={textStyles.h3}>No teams or format yet</Text>
            <Text style={textStyles.muted}>Once the teams (or slots for teams not known yet) and the format are in, the whole tournament shows here.</Text>
            {canManage && <Button label="Add teams or slots" onPress={() => nav.navigate('TournamentTeams', { tournamentId, sport })} />}
            {canManage && <Button label="Set the format" onPress={() => nav.navigate('GenerateFixtures', { tournamentId, sport })} />}
          </Card>
        )}

        {map.kind === 'other' && (
          <Card style={st.gap}>
            <Text style={textStyles.h3}>{map.otherFormat}</Text>
            <Text style={textStyles.muted}>This format has its own view.</Text>
            <Button label="Open the bracket" onPress={() => nav.navigate('Bracket', { tournamentId, sport })} />
            <Button label="Standings" onPress={() => nav.navigate('Standings', { tournamentId, sport })} />
          </Card>
        )}

        {map.kind === 'groups' && (
          <View style={st.segment} accessibilityRole="tablist">
            {(['groups', 'knockout'] as const).map((k) => (
              <Pressable key={k} onPress={() => setStage(k)} style={[st.segBtn, shownStage === k && st.segOn]} accessibilityRole="tab" accessibilityState={{ selected: shownStage === k }}>
                <Text style={[st.segText, shownStage === k && st.segTextOn]}>{k === 'groups' ? 'Group stage' : 'Knockout stage'}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {(map.kind === 'league' || (map.kind === 'groups' && shownStage === 'groups')) && (
          <View style={st.gap}>
            {map.groups.map((g) => (
              <Card key={g.name} style={st.groupCard}>
                <Text style={st.groupTitle}>{g.label}</Text>
                {g.teams.length ? g.teams.map((s, i) => <SideRow key={i} side={s} canFill={canManage} onPress={() => onSide(s)} />) : <Text style={textStyles.muted}>No teams yet</Text>}
              </Card>
            ))}
            {map.unplaced.length > 0 && (
              <Card style={st.groupCard}>
                <Text style={st.groupTitle}>Not in a group yet</Text>
                <Text style={textStyles.muted}>They are placed when the group fixtures are made.</Text>
                {map.unplaced.map((s, i) => <SideRow key={i} side={s} canFill={canManage} onPress={() => onSide(s)} />)}
                {canManage && <Button label="Make the group fixtures" onPress={() => nav.navigate('GenerateFixtures', { tournamentId, sport })} />}
              </Card>
            )}
            {map.kind === 'league' && <Text style={textStyles.muted}>Every team plays the others; the table decides the winner.</Text>}
          </View>
        )}

        {map.note && shownStage === 'knockout' && <Text style={textStyles.muted}>{map.note}</Text>}

        {(map.kind === 'knockout' || (map.kind === 'groups' && shownStage === 'knockout')) && map.rounds.length > 0 && (
          <>
            <View style={st.stepper}>
              <Pressable onPress={() => setStart(Math.max(0, first - 1))} disabled={first === 0} style={[st.stepBtn, first === 0 && st.stepOff]} accessibilityRole="button" accessibilityLabel="Previous round">
                <Text style={st.stepArrow}>‹</Text>
              </Pressable>
              <View style={st.flex1}>
                <Text style={st.stepTitle} numberOfLines={1}>{map.rounds[first].label}</Text>
                {map.rounds[first + 1] ? <Text style={st.stepNext} numberOfLines={1}>NEXT: {map.rounds[first + 1].label.toUpperCase()}</Text> : null}
              </View>
              <Pressable onPress={() => setStart(Math.min(map.rounds.length - 1, first + 1))} disabled={first >= map.rounds.length - 1} style={[st.stepBtn, first >= map.rounds.length - 1 && st.stepOff]} accessibilityRole="button" accessibilityLabel="Next round">
                <Text style={st.stepArrow}>›</Text>
              </Pressable>
            </View>
            <Tree rounds={map.rounds.slice(first)} championId={map.champion?.kind === 'team' ? map.champion.id : undefined} canFill={canManage} onSide={onSide} />
            <Text style={textStyles.muted}>Swipe sideways for the whole tree. Boxes without teams say where they come from.</Text>
          </>
        )}

        {map.kind === 'knockout' && !map.rounds.length && (
          <Card style={st.gap}>
            <Text style={textStyles.muted}>The draw shows here once two or more teams (or slots) are in.</Text>
            {canManage && <Button label="Add teams or slots" onPress={() => nav.navigate('TournamentTeams', { tournamentId, sport })} />}
          </Card>
        )}

        {map.third && shownStage === 'knockout' && (
          <View style={st.gap}>
            <Text style={st.sectionTitle}>Third place play-off</Text>
            <TieCard tie={map.third} canFill={canManage} onSide={onSide} />
          </View>
        )}

        {played.length > 0 && (
          <View style={st.stats}>
            <Stat label="Played" value={String(played.length)} />
            <Stat label="To play" value={String(divMatches.length - played.length)} />
            {goals !== null && <Stat label="Goals" value={String(goals)} />}
            {goals !== null && <Stat label="Per match" value={(goals / played.length).toFixed(1)} />}
          </View>
        )}
        {map.rounds.some((r) => r.ties.some((t) => t.startsAt)) && <Text style={[textStyles.muted, st.center]}>All times are {zoneShortName()}</Text>}

        {exportNote && <Text style={textStyles.muted}>{exportNote}</Text>}
        {map.kind !== 'empty' && map.kind !== 'other' && (
          canManage && nextOpen ? (
            <>
              <Button variant="primary" label={`Fill ${nextOpen.name}`} onPress={() => setFilling(nextOpen)} />
              <Button label="Export fixture map (PDF)" onPress={() => void exportPdf()} />
            </>
          ) : (
            <Button variant="primary" label="Export fixture map (PDF)" onPress={() => void exportPdf()} />
          )
        )}
      </KeyboardAwareScrollView>

      <Sheet visible={canManage && !!filling} onClose={() => setFilling(null)} title={filling ? `Fill ${filling.name}` : 'Fill a slot'}>
        {canManage && filling ? (
          <SlotFillPanel slot={filling} sport={sport} teams={allTeams} slotIds={slotIds} inFixtures={inFixtures}
            onFilled={(iv) => { setFilling(null); if (iv) setInvite(iv); setNonce((n) => n + 1); }} />
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

const sideName = (s: MapSide): string => (s.kind === 'team' ? s.name : s.kind === 'from' ? s.label : 'Bye');

/** One line of a box: a team (tap → their journey), an open slot (tap → fill),
 *  or where the team comes from. */
function SideRow({ side, score, state, canFill, onPress, champion }: {
  side: MapSide; score?: number; state?: 'won' | 'lost'; canFill: boolean; onPress: () => void; champion?: boolean;
}) {
  if (side.kind !== 'team') {
    return (
      <View style={st.row}>
        <View style={st.dotGap} />
        <Text style={st.fromText} numberOfLines={2}>{side.kind === 'from' ? side.label : 'Bye'}</Text>
      </View>
    );
  }
  if (side.slot) {
    return (
      <Pressable onPress={onPress} disabled={!canFill} style={st.slotRow} accessibilityRole={canFill ? 'button' : undefined}
        accessibilityLabel={canFill ? `Open slot ${side.name}, tap to fill` : `Open slot ${side.name}`}>
        <Text style={st.slotName} numberOfLines={1}>{side.name}</Text>
        <Text style={st.slotHint}>{canFill ? 'Open slot · tap to fill' : 'Open slot'}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={[st.row, state === 'won' && st.rowWon]} accessibilityRole="link" accessibilityHint="Opens their tournament journey">
      {side.color ? <View style={[st.dot, { backgroundColor: side.color }]} /> : <View style={st.dotGap} />}
      <View style={st.flex1}>
        <Text style={[st.teamName, state === 'won' && st.won, state === 'lost' && st.lost]} numberOfLines={1}>{side.name}</Text>
        {champion ? <Text style={st.champTag}>CHAMPION</Text> : null}
      </View>
      {score != null ? <Text style={[st.score, state === 'lost' && st.lost]}>{score}</Text> : null}
      {state === 'won' ? <Text style={st.arrow}>◂</Text> : null}
    </Pressable>
  );
}

function TieCard({ tie, canFill, onSide, championId }: { tie: MapTie; canFill: boolean; onSide: (s: MapSide) => void; championId?: string }) {
  const pill = tie.state === 'done' ? 'FT' : tie.state === 'live' ? 'LIVE' : tie.startsAt ? formatShort(tie.startsAt) : 'Planned';
  const st2 = (k: 'home' | 'away') => (tie.winner ? (tie.winner === k ? 'won' as const : 'lost' as const) : undefined);
  const isChamp = (s: MapSide) => !!championId && s.kind === 'team' && s.id === championId && tie.label === 'Final';
  return (
    <View style={[st.tie, tie.label === 'Final' && st.tieFinal]}>
      <View style={[st.tieHead, tie.label === 'Final' && st.tieHeadFinal]}>
        <Text style={[st.tieLabel, tie.label === 'Final' && st.tieLabelFinal]} numberOfLines={1}>{tie.label === 'Final' ? '🏆 Final' : tie.label}</Text>
        <Text style={[st.pill, tie.state === 'live' && st.pillLive]}>{pill}</Text>
      </View>
      <SideRow side={tie.home} score={tie.score?.home} state={st2('home')} canFill={canFill} onPress={() => onSide(tie.home)} champion={isChamp(tie.home)} />
      <SideRow side={tie.away} score={tie.score?.away} state={st2('away')} canFill={canFill} onPress={() => onSide(tie.away)} champion={isChamp(tie.away)} />
    </View>
  );
}

/** FM4: the tree — one column per round, boxes placed by treeLayout, joining lines between. */
function Tree({ rounds, canFill, onSide, championId }: { rounds: MapRound[]; canFill: boolean; onSide: (s: MapSide) => void; championId?: string }) {
  const l = treeLayout(rounds, CARD_H, GAP);
  const HEAD = 30;
  return (
    <View style={st.treeBox}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={st.treeRow}>
        {rounds.map((r, k) => (
          <React.Fragment key={r.stage + k}>
            <View style={{ width: COL_W, height: l.height + HEAD }}>
              <Text style={st.colTitle} numberOfLines={1}>{r.label.toUpperCase()} <Text style={st.colCount}>({r.ties.length})</Text></Text>
              {r.ties.map((t, i) => (
                <View key={t.key} style={{ position: 'absolute', top: HEAD + l.tops[k][i], left: 0, right: 0 }}>
                  <TieCard tie={t} canFill={canFill} onSide={onSide} championId={championId} />
                </View>
              ))}
              {r.byes.length > 0 && (
                <Text style={[st.byes, { top: HEAD + l.height + 4 }]} numberOfLines={2}>Straight through: {r.byes.map(sideName).join(', ')}</Text>
              )}
            </View>
            {k < rounds.length - 1 && (
              <View style={{ width: JOIN_W, height: l.height + HEAD }}>
                {l.joined[k] && rounds[k + 1].ties.map((_, i) => {
                  const y1 = HEAD + l.tops[k][2 * i] + CARD_H / 2;
                  const y2 = HEAD + l.tops[k][2 * i + 1] + CARD_H / 2;
                  const ym = HEAD + l.tops[k + 1][i] + CARD_H / 2;
                  return (
                    <React.Fragment key={i}>
                      <View style={[st.joinV, { top: y1, height: y2 - y1, width: JOIN_W / 2 }]} />
                      <View style={[st.joinH, { top: ym, left: JOIN_W / 2, width: JOIN_W / 2 }]} />
                    </React.Fragment>
                  );
                })}
              </View>
            )}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.stat}>
      <Text style={st.statLabel}>{label.toUpperCase()}</Text>
      <Text style={st.statValue}>{value}</Text>
    </View>
  );
}

/** After a new team goes in a slot: send its captain the invite (PK8). */
function InviteCard({ invite, tournamentName, inviterName, onDismiss }: { invite: CaptainInvite; tournamentName?: string; inviterName: string; onDismiss: () => void }) {
  const msg = inviteMessage({ name: invite.captainName, inviterName, link: invite.link, context: teamAtTournament(invite.teamName, tournamentName), role: 'manage' });
  return (
    <Card style={st.gap}>
      <Text style={textStyles.body}>✅ {invite.teamName} is in · invite {invite.captainName} to captain it and add the players:</Text>
      <View style={st.chips}>
        <Button label="💬 WhatsApp" onPress={() => openWhatsApp(invite.phone, msg)} />
        <Button label="✉️ SMS" onPress={() => openSms(invite.phone, msg)} />
      </View>
      <Text style={textStyles.muted} selectable>If they sign up with a different number or email, they can still take over the team: in the app, Settings → Join a team with a code → {invite.code}</Text>
      <Text style={st.link} onPress={onDismiss}>Dismiss</Text>
    </Card>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  gap: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  flex1: { flex: 1 },
  center: { textAlign: 'center' },
  link: { color: theme.colors.primary, fontWeight: '600' },
  slotsNote: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '600' },
  segment: { flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: 4 },
  segBtn: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.md - 4 },
  segOn: { backgroundColor: theme.colors.surface, ...theme.shadow.card },
  segText: { color: theme.colors.textMuted, fontWeight: '600', fontSize: theme.font.body },
  segTextOn: { color: theme.colors.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(2) },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.4 },
  stepArrow: { fontSize: theme.font.h2, color: theme.colors.text, marginTop: -2 },
  stepTitle: { fontFamily: theme.fonts.heading, fontSize: theme.font.h2, color: theme.colors.primary, textTransform: 'uppercase' },
  stepNext: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', letterSpacing: 0.4 },
  treeBox: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, paddingVertical: theme.spacing(3) },
  treeRow: { paddingHorizontal: theme.spacing(3), paddingBottom: theme.spacing(6) },
  colTitle: { fontFamily: theme.fonts.heading, fontSize: theme.font.h3, color: theme.colors.primary },
  colCount: { color: theme.colors.textMuted, fontSize: theme.font.small },
  byes: { position: 'absolute', left: 0, right: 0, color: theme.colors.textMuted, fontSize: theme.font.tiny },
  joinV: { position: 'absolute', left: 0, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderColor: theme.colors.primary, opacity: 0.55 },
  joinH: { position: 'absolute', height: 0, borderTopWidth: 1.5, borderColor: theme.colors.primary, opacity: 0.55 },
  tie: { height: CARD_H, backgroundColor: theme.colors.surface, borderRadius: theme.radius.sm + 2, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  tieFinal: { borderColor: theme.colors.primary, borderWidth: 1.5 },
  tieHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing(2), height: 30, backgroundColor: theme.colors.bg },
  tieHeadFinal: { backgroundColor: theme.colors.primary },
  tieLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '600', flexShrink: 1 },
  tieLabelFinal: { color: theme.colors.onFill },
  pill: { fontSize: theme.font.tiny, fontWeight: '700', color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  pillLive: { backgroundColor: theme.colors.dangerStrong, color: theme.colors.onFill },
  row: { height: 46, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingHorizontal: theme.spacing(2) },
  rowWon: { backgroundColor: '#F1F9D6' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotGap: { width: 10 },
  teamName: { color: theme.colors.text, fontSize: theme.font.body },
  won: { fontWeight: '700' },
  lost: { color: theme.colors.textMuted },
  champTag: { color: theme.colors.primary, fontSize: theme.font.tiny - 2, fontWeight: '800', letterSpacing: 0.6 },
  score: { fontFamily: theme.fonts.numeral, fontSize: theme.font.h2, color: theme.colors.text, minWidth: 18, textAlign: 'right' },
  arrow: { color: theme.colors.primary, fontSize: theme.font.tiny },
  fromText: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  slotRow: { height: 42, marginHorizontal: theme.spacing(2), marginVertical: 2, paddingHorizontal: theme.spacing(2), borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary, borderRadius: theme.radius.sm, justifyContent: 'center' },
  slotName: { color: theme.colors.text, fontWeight: '600', fontSize: theme.font.small },
  slotHint: { color: theme.colors.primary, fontSize: theme.font.tiny },
  groupCard: { gap: theme.spacing(1), padding: theme.spacing(3) },
  groupTitle: { fontFamily: theme.fonts.heading, fontSize: theme.font.h3 + 2, color: theme.colors.primary },
  sectionTitle: { fontFamily: theme.fonts.heading, fontSize: theme.font.h3 + 2, color: theme.colors.text, textTransform: 'uppercase' },
  stats: { flexDirection: 'row', gap: theme.spacing(2) },
  stat: { flex: 1, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3), alignItems: 'center' },
  statLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', letterSpacing: 0.4 },
  statValue: { fontFamily: theme.fonts.numeral, fontSize: theme.font.h2 + 4, color: theme.colors.primary },
});
