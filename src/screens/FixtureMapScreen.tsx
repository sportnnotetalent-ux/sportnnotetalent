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
import { SideName } from '../components/SideName';
import { DivisionTabs } from '../components/DivisionTabs';
import { useAuth } from '../core/auth';
import { useTournamentById, useLeagueData, useOrganizations, useTeams, useDivisions, useTournamentEntries } from '../data/hooks';
import { matchesInDivision } from '../data/groups';
import { getMyPlayerId, getTournamentSlotIds, patchTournamentFormat, createMatch, createTournamentSlots } from '../data/repos';
import { DateTimeField } from '../components/DateTimeField';
import { FormError } from '../components/ui';
import { nextSlotNames } from '../core/slots';
import { matchFormatFor } from '../data/matchFormat';
import { defaultsFor } from '../components/FormatEditor';
import { KO_SLOT_KEY } from '../data/bracket';
import { oddRuleOf, plannedTeamsOf, drawOf, drawToFormat, ODD_RULES, ODD_RULE_KEY, PLANNED_KEY, DRAW_KEY, type OddRule } from '../data/drawRules';
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

  // The organiser's plan (data/drawRules): saved on the sport's format; shown at once
  const [fmtPatch, setFmtPatch] = useState<Record<string, unknown>>({});
  // saved values stay shown when the tournament is re-read (they are in it by then)
  useEffect(() => { setFmtPatch({}); }, [sport]);
  const fmt = useMemo(() => ({ ...((tournament?.formats?.[sport] as Record<string, unknown> | undefined) ?? {}), ...fmtPatch }), [tournament, sport, fmtPatch]);
  const cfg = structureFromFormat(fmt);
  const rule = oddRuleOf(fmt);
  const planned = plannedTeamsOf(fmt) ?? (tournament?.maxTeams && tournament.maxTeams >= 2 ? Math.min(128, tournament.maxTeams) : undefined);
  const drawRaw = fmt[DRAW_KEY] as string | undefined;
  const draw = useMemo(() => drawOf({ [DRAW_KEY]: drawRaw }), [drawRaw]);
  const [planError, setPlanError] = useState<string | null>(null);
  async function savePlan(patch: Record<string, unknown>) {
    setPlanError(null);
    setFmtPatch((p) => ({ ...p, ...patch }));
    try { await patchTournamentFormat(tournamentId, sport, patch); }
    catch (e) { setPlanError(e instanceof Error ? e.message : 'Couldn’t save that.'); }
  }
  const entries = useMemo(
    () => sportEntries
      .filter((e) => e.status === 'confirmed' && (!activeCat || (e.categoryId ?? null) === activeCat))
      .map((e) => ({ id: e.team.id, name: e.team.name, color: e.team.colorHex })),
    [sportEntries, activeCat],
  );
  const map = useMemo(
    () => buildFixtureMap({ cfg, structure: tournament?.structure, matches: divMatches, entries, slotIds, plannedTeams: planned, oddRule: rule, draw }),
    [cfg?.shape, cfg?.groupCount, cfg?.advanceTopN, cfg?.advanceBest, cfg?.superPhase, cfg?.manualStandings, cfg?.bracket, tournament?.structure, divMatches, entries, slotIds, planned, rule, draw],
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
  // FM23: an open place becomes a slot (named for its group), then is filled like one
  async function openPlace(s: Extract<MapSide, { kind: 'open' }>) {
    setPlanError(null);
    try {
      const name = s.group ? s.label : nextSlotNames(entries.map((e) => e.name), 1)[0];
      const [id] = await createTournamentSlots(tournamentId, sport, [name]);
      if (id && draw?.order.includes(s.ref)) await savePlan({ [DRAW_KEY]: drawToFormat({ order: draw.order.map((x) => (x === s.ref ? id : x)) }) });
      setNonce((n) => n + 1);
      if (id) setFilling({ id, name });
    } catch (e) { setPlanError(e instanceof Error ? e.message : 'Couldn’t add the place.'); }
  }
  // Edit draw (FM25): tap two places in the opening round to swap them
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const opening = map.rounds[0];
  const canEditDraw = !!opening?.projected && !!opening.refs && map.rounds.every((r) => r.ties.every((t) => !t.matchId));
  function pickRef(idx: number) {
    if (!opening?.refs || opening.refs[idx] === null) return;
    if (pick === null) return setPick(idx);
    if (pick === idx) return setPick(null);
    const order = [...opening.refs];
    [order[pick], order[idx]] = [order[idx], order[pick]];
    setPick(null);
    void savePlan({ [DRAW_KEY]: drawToFormat({ order }) });
  }
  // Make this match (FM27/FM28): a free box → a real match in that box
  const [making, setMaking] = useState<{ stage: string; box: number; label: string; byes: string[]; homeId?: string; awayId?: string } | null>(null);
  const fieldTeams = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(e.id, e.name);
    for (const x of divMatches) { m.set(x.homeTeam.id, x.homeTeam.name); m.set(x.awayTeam.id, x.awayTeam.name); }
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [entries, divMatches]);
  const onMake = (r: MapRound, t: MapTie) => {
    const id = (x: MapSide) => (x.kind === 'team' ? x.id : undefined);
    setMaking({ stage: r.stage, box: t.box, label: t.label, byes: r.byes.flatMap((b) => (b.kind === 'team' ? [b.id] : [])), homeId: id(t.home), awayId: id(t.away) });
  };
  const onSide = (s: MapSide) => {
    if (s.kind === 'open') { if (canManage) void openPlace(s); return; }
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

        {canManage && <PlanCard show={map.kind !== 'empty' && map.kind !== 'other'} planned={map.planned ?? planned} field={fieldTeams.length} rule={rule}
          knockout={map.kind !== 'league'} editing={editing} canEditDraw={canEditDraw} edited={!!draw} stale={!!map.drawStale}
          onPlanned={(n) => void savePlan({ [PLANNED_KEY]: n })} onRule={(r) => void savePlan({ [ODD_RULE_KEY]: r })}
          onEdit={() => { setEditing((v) => !v); setPick(null); setStage('knockout'); setStart(0); }}
          onReset={() => { setEditing(false); setPick(null); void savePlan({ [DRAW_KEY]: undefined }); }} />}
        <FormError message={planError} />
        {canManage && editing && <Text style={st.slotsNote}>{pick === null ? 'Tap a team (or place) in the first round, then another to swap them.' : 'Now tap the one to swap with.'}</Text>}

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
            <Tree rounds={map.rounds.slice(first)} championId={map.champion?.kind === 'team' ? map.champion.id : undefined} canFill={canManage} onSide={onSide}
              edit={canManage && editing && first === 0 ? { pick, onPick: pickRef } : undefined}
              onMake={canManage && !editing ? onMake : undefined} />
            {canManage && editing && first === 0 && opening?.byes.length ? (
              <View style={st.chips}>
                <Text style={textStyles.muted}>Straight through:</Text>
                {opening.byes.map((b, j) => {
                  const idx = opening.ties.length * 2 + j * 2;
                  return <SelectChip key={idx} label={sideName(b)} active={pick === idx} onPress={() => pickRef(idx)} />;
                })}
              </View>
            ) : null}
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

      <Sheet visible={canManage && !!making} onClose={() => setMaking(null)} title={making ? `Make ${making.label}` : 'Make a match'}>
        {canManage && making ? (
          <MakeMatch box={making} teams={fieldTeams} onCancel={() => setMaking(null)}
            onCreate={async (homeId, awayId, when) => {
              const base = matchFormatFor(tournament, sport, true, defaultsFor(getSportMeta(sport).formatFields ?? [], 'tournament'));
              await createMatch({
                tournamentId, sport, stage: making.stage, homeTeamId: homeId, awayTeamId: awayId, startsAt: when.toISOString(),
                hostIds: myId ? [myId] : [], format: { ...(base ?? {}), [KO_SLOT_KEY]: making.box },
                ...(making.byes.length ? { byes: making.byes } : {}),
              });
              setMaking(null); setNonce((n) => n + 1);
            }} />
        ) : null}
      </Sheet>

      <Sheet visible={canManage && !!filling} onClose={() => setFilling(null)} title={filling ? `Fill ${filling.name}` : 'Fill a slot'}>
        {canManage && filling ? (
          <SlotFillPanel slot={filling} sport={sport} teams={allTeams} slotIds={slotIds} inFixtures={inFixtures}
            onFilled={(iv) => { setFilling(null); if (iv) setInvite(iv); setNonce((n) => n + 1); }} />
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

const sideName = (s: MapSide): string => (s.kind === 'team' ? s.name : s.kind === 'from' || s.kind === 'open' ? s.label : 'Bye');

/** One line of a box: a team (tap → their journey), an open slot (tap → fill),
 *  or where the team comes from. */
function SideRow({ side, score, state, canFill, onPress, champion, picked }: {
  side: MapSide; score?: number; state?: 'won' | 'lost'; canFill: boolean; onPress: () => void; champion?: boolean;
  /** Edit draw: tapping picks this place; true = picked */
  picked?: boolean | null;
}) {
  if (picked !== undefined && picked !== null) {
    return (
      <Pressable onPress={onPress} style={[st.row, picked && st.rowPicked]} accessibilityRole="button" accessibilityState={{ selected: picked }} accessibilityLabel={`Swap ${sideName(side)}`}>
        <Text style={st.swap}>⇅</Text>
        <Text style={st.teamName} numberOfLines={1}>{sideName(side)}</Text>
      </Pressable>
    );
  }
  if (side.kind === 'open') {
    return (
      <Pressable onPress={onPress} disabled={!canFill} style={st.slotRow} accessibilityRole={canFill ? 'button' : undefined}
        accessibilityLabel={canFill ? `Open place ${side.label}, tap to add a team` : `Open place ${side.label}`}>
        <Text style={st.slotName} numberOfLines={1}>{side.label}</Text>
        <Text style={st.slotHint}>{canFill ? 'Open place · tap to add a team' : 'Open place'}</Text>
      </Pressable>
    );
  }
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
        <SideName name={side.name} style={[st.teamName, state === 'won' && st.won, state === 'lost' && st.lost]} />
        {champion ? <Text style={st.champTag}>CHAMPION</Text> : null}
      </View>
      {score != null ? <Text style={[st.score, state === 'lost' && st.lost]}>{score}</Text> : null}
      {state === 'won' ? <Text style={st.arrow}>◂</Text> : null}
    </Pressable>
  );
}

type EditProps = { pick: number | null; onPick: (refIndex: number) => void };

function TieCard({ tie, canFill, onSide, championId, edit, onMake }: {
  tie: MapTie; canFill: boolean; onSide: (s: MapSide) => void; championId?: string;
  /** Edit draw: this box is in the opening round */
  edit?: EditProps;
  /** a free box: "Make this match" */
  onMake?: () => void;
}) {
  const pill = tie.state === 'done' ? 'FT' : tie.state === 'live' ? 'LIVE' : tie.startsAt ? formatShort(tie.startsAt) : 'Planned';
  const st2 = (k: 'home' | 'away') => (tie.winner ? (tie.winner === k ? 'won' as const : 'lost' as const) : undefined);
  const isChamp = (s: MapSide) => !!championId && s.kind === 'team' && s.id === championId && tie.label === 'Final';
  return (
    <View style={[st.tie, tie.label === 'Final' && st.tieFinal]}>
      <View style={[st.tieHead, tie.label === 'Final' && st.tieHeadFinal]}>
        <Text style={[st.tieLabel, tie.label === 'Final' && st.tieLabelFinal]} numberOfLines={1}>{tie.label === 'Final' ? '🏆 Final' : tie.label}</Text>
        {onMake && !tie.matchId ? (
          <Text style={[st.pill, st.pillMake]} onPress={onMake} accessibilityRole="button" accessibilityLabel={`Make ${tie.label}`}>＋ Make</Text>
        ) : (
          <Text style={[st.pill, tie.state === 'live' && st.pillLive]}>{pill}</Text>
        )}
      </View>
      <SideRow side={tie.home} score={tie.score?.home} state={st2('home')} canFill={canFill} champion={isChamp(tie.home)}
        picked={edit ? edit.pick === tie.box * 2 : undefined} onPress={() => (edit ? edit.onPick(tie.box * 2) : onSide(tie.home))} />
      <SideRow side={tie.away} score={tie.score?.away} state={st2('away')} canFill={canFill} champion={isChamp(tie.away)}
        picked={edit ? edit.pick === tie.box * 2 + 1 : undefined} onPress={() => (edit ? edit.onPick(tie.box * 2 + 1) : onSide(tie.away))} />
    </View>
  );
}

/** FM4: the tree — one column per round, boxes placed by treeLayout, joining lines between. */
function Tree({ rounds, canFill, onSide, championId, edit, onMake }: {
  rounds: MapRound[]; canFill: boolean; onSide: (s: MapSide) => void; championId?: string;
  /** set when the first shown round is the opening one and the draw is being edited */
  edit?: EditProps;
  onMake?: (r: MapRound, t: MapTie) => void;
}) {
  const l = treeLayout(rounds, CARD_H, GAP);
  const HEAD = 30;
  return (
    <View style={st.treeBox}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={st.treeRow}>
        {rounds.map((r, k) => (
          <React.Fragment key={r.stage + k}>
            <View style={{ width: COL_W, height: l.height + HEAD + (rounds.some((x) => x.byes.length) ? 36 : 0) }}>
              <Text style={st.colTitle} numberOfLines={1}>{r.label.toUpperCase()} <Text style={st.colCount}>({r.ties.length})</Text></Text>
              {r.ties.map((t, i) => (
                <View key={t.key} style={{ position: 'absolute', top: HEAD + l.tops[k][i], left: 0, right: 0 }}>
                  <TieCard tie={t} canFill={canFill} onSide={onSide} championId={championId}
                    edit={k === 0 ? edit : undefined} onMake={onMake ? () => onMake(r, t) : undefined} />
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

/** The organiser's plan (FM22, FM19, FM25): planned teams, the odd-team rule, Edit draw. */
function PlanCard({ show, planned, field, rule, knockout, editing, canEditDraw, edited, stale, onPlanned, onRule, onEdit, onReset }: {
  show: boolean; planned?: number; field: number; rule: OddRule; knockout: boolean; editing: boolean; canEditDraw: boolean; edited: boolean; stale: boolean;
  onPlanned: (n: number) => void; onRule: (r: OddRule) => void; onEdit: () => void; onReset: () => void;
}) {
  if (!show) return null;
  const n = Math.max(planned ?? 0, field, 2);
  return (
    <Card style={st.planCard}>
      <Text style={st.groupTitle}>Your plan</Text>
      <View style={st.planRow}>
        <Text style={[textStyles.body, st.flex1]}>Teams planned</Text>
        <Pressable onPress={() => onPlanned(Math.max(2, field, n - 1))} disabled={n <= Math.max(2, field)} style={[st.stepBtn, n <= Math.max(2, field) && st.stepOff]} accessibilityRole="button" accessibilityLabel="One team fewer">
          <Text style={st.stepArrow}>−</Text>
        </Pressable>
        <Text style={st.planNum}>{n}</Text>
        <Pressable onPress={() => onPlanned(Math.min(128, n + 1))} disabled={n >= 128} style={[st.stepBtn, n >= 128 && st.stepOff]} accessibilityRole="button" accessibilityLabel="One team more">
          <Text style={st.stepArrow}>+</Text>
        </Pressable>
      </View>
      <Text style={textStyles.muted}>{field} in so far{n > field ? ` · ${n - field} open place${n - field === 1 ? '' : 's'} on the map` : ''}.</Text>
      {knockout && (
        <>
          <Text style={[textStyles.body, st.planLabel]}>When the numbers are odd</Text>
          <View style={st.chips}>
            {ODD_RULES.map((r) => <SelectChip key={r.key} label={r.label} active={rule === r.key} onPress={() => onRule(r.key)} />)}
          </View>
          <Text style={textStyles.muted}>{ODD_RULES.find((r) => r.key === rule)?.hint}</Text>
          {stale && <Text style={st.staleNote}>Your edited draw no longer matches the teams, so the automatic draw shows — edit it again.</Text>}
          {canEditDraw ? (
            <View style={st.chips}>
              <Button label={editing ? 'Done editing the draw' : 'Edit draw'} onPress={onEdit} />
              {edited && <Button label="Back to the automatic draw" onPress={onReset} />}
            </View>
          ) : (
            <Text style={textStyles.muted}>The draw is fixed once its first matches are made; add or change matches box by box.</Text>
          )}
        </>
      )}
    </Card>
  );
}

/** Make a match in a free box (FM27/FM28): the box sets its stage and place. */
function MakeMatch({ box, teams, onCreate, onCancel }: {
  box: { label: string; homeId?: string; awayId?: string };
  teams: { id: string; name: string }[];
  onCreate: (homeId: string, awayId: string, when: Date) => Promise<void>;
  onCancel: () => void;
}) {
  const [home, setHome] = useState<string | undefined>(box.homeId);
  const [away, setAway] = useState<string | undefined>(box.awayId);
  // a sensible start the organiser can change: tomorrow at 10:00
  const [when, setWhen] = useState<Date | null>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickRow = (label: string, value: string | undefined, set: (id: string) => void, other?: string) => (
    <View style={st.gap}>
      <Text style={textStyles.body}>{label}</Text>
      <View style={st.chips}>
        {teams.filter((t) => t.id !== other).map((t) => <SelectChip key={t.id} label={t.name} active={value === t.id} onPress={() => set(t.id)} />)}
      </View>
    </View>
  );
  async function create() {
    if (!home || !away) return setError('Pick both teams.');
    if (home === away) return setError('Pick two different teams.');
    if (!when) return setError('Pick the date and time.');
    setBusy(true); setError(null);
    try { await onCreate(home, away, when); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t make the match.'); }
    finally { setBusy(false); }
  }
  return (
    <View style={st.gap}>
      <Text style={textStyles.muted}>This match goes in the {box.label} box on the map; its winner moves on from there.</Text>
      {pickRow('Home', home, setHome, away)}
      {pickRow('Away', away, setAway, home)}
      <DateTimeField label="When" value={when} onChange={setWhen} />
      <FormError message={error} />
      <Button variant="primary" label={busy ? 'Making…' : `Make ${box.label}`} disabled={busy} onPress={() => void create()} />
      <Button label="Cancel" onPress={onCancel} />
    </View>
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
  pillMake: { backgroundColor: theme.colors.lime, color: theme.colors.onLime },
  rowPicked: { backgroundColor: theme.colors.lime },
  swap: { color: theme.colors.primary, fontSize: theme.font.small, width: 14 },
  planCard: { gap: theme.spacing(2), padding: theme.spacing(3) },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  planNum: { fontFamily: theme.fonts.numeral, fontSize: theme.font.h2, color: theme.colors.text, minWidth: 32, textAlign: 'center' },
  planLabel: { marginTop: theme.spacing(2), fontWeight: '600' },
  staleNote: { color: theme.colors.accent, fontSize: theme.font.small },
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
