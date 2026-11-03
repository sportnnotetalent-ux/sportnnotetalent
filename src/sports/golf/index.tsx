/**
 * Golf plugin. Two competition shapes (docs/sports/GOLF_DESIGN.md):
 *   • Match play (head-to-head) — THIS plugin's scoring: each hole is won, lost
 *     or halved; state reads "2 UP", "AS", "Dormie 2", "3&2". Runs on the normal
 *     match / bracket engine, so knockout match-play championships just work.
 *   • Stroke play / Stableford (a field of N players, one leaderboard) — scored
 *     on the Golf round screens (field events), not through LiveScoring.
 * The format fields below cover both; `competition` decides which flow is used.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import { confirmCopy } from '../../core/matchSafety';
import type { SportPlugin } from '../types';
import { concededLine, holeWinner, type HoleWinner } from './engine';
import { initGolfMatch, golfMatchReducer, golfMatchStateOf, holeAction, type GolfMatchState, type HoleHow } from './match';
import { matchHole, holeNumber, strokesLine } from './matchStrokes';
import { MatchStrokesSetup } from './MatchStrokesSetup';
import { golfMatchVoice } from '../voiceParsers';
import { golfMatchFeed } from './feed';
import { CommentaryFeed } from '../gcc/CommentaryFeed';
import { GOLF_META } from './meta';
import { golfMatchRecords } from './records';
import { useMask } from '../../core/disputeMask';
import type { NameOf } from '../../core/playerNames';
import type { Player } from '../../core/types';

/** IDs-only scoring (docs/privacy/ids-only-scoring.md): a match names each
 *  side by its player, looked up for this viewer by id (players_view: the
 *  circle sees the full name, others initials, an open dispute "X"); a side
 *  with no player falls back to the entry's name. */
const sideName = (who: NameOf, roster: Player[], team: string): string => {
  const p = roster[0];
  return p ? who(p.id, p.fullName) : team;
};

// The state + reducer live in ./match (pure, unit-tested); SD-87 adds the
// handicap strokes and per-hole gross strokes as optional keys.
export type { GolfMatchState };
const init = initGolfMatch;
const reducer = golfMatchReducer;
const stateOf = golfMatchStateOf;

const ScoringControls: SportPlugin<GolfMatchState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as GolfMatchState;
  const m = stateOf(s);
  const [conceding, setConceding] = useState(false);
  const [setup, setSetup] = useState(false);
  // batch 6 — how the next hole is won when not on strokes: the other side's penalty (loss of hole) or concession
  const [how, setHow] = useState<{ hole: number; how: HoleHow | null }>({ hole: -1, how: null });
  // SD-87 — this hole's gross strokes (null = start at par), reset per hole
  const [gross, setGross] = useState<{ hole: number; home: number | null; away: number | null }>({ hole: -1, home: null, away: null });
  const { nameOf: who } = useMask();
  const nm = (side: 'home' | 'away') => sideName(who, side === 'home' ? homeRoster : awayRoster, side === 'home' ? homeName : awayName);
  // SD-117c — a conceded match keeps its hole state ("conceded, 3 down thru 12")
  if (s.ended) return <Text style={textStyles.muted}>Match over{s.conceded ? ` · ${nm(s.conceded)} ${concededLine(s.holes, s.conceded, s.regulation, s.extraHoles)}` : ''}.</Text>;
  const concede = async (side: 'home' | 'away') => {
    const other = side === 'home' ? 'away' : 'home';
    const where = m.played ? ` (${m.status === 'AS' ? 'all square' : `${leaderName} ${m.status}`} thru ${m.played})` : '';
    const ok = await askConfirm(confirmCopy('concede', { what: nm(side), winner: nm(other), detail: `${nm(other)} wins the match${where} and it closes.` }));
    setConceding(false);
    if (ok) dispatch({ type: 'CONCEDE', side, payload: { at: Date.now() } });
  };
  // SD-87 — a back-nine match reads 10–18 (19 for the first extra hole)
  const holeNo = holeNumber(s.firstHole, m.played);
  const lastNo = holeNumber(s.firstHole, s.regulation - 1);
  const leaderName = m.leader ? nm(m.leader) : null;
  const ms = s.strokes;
  const here = ms ? matchHole(ms, m.played) : null;
  // the hole (credits by player id only — match events are public); deep
  // wave — `at` (the scorer's clock) for the commentary; SD-87 — with strokes
  // entered, each player's score on the hole is credited too
  const howNow = how.hole === m.played ? how.how : null;
  const hole = (winner: HoleWinner, strokes?: { home: number; away: number }) => {
    dispatch(holeAction(winner, { home: homeRoster[0], away: awayRoster[0] }, { ...(strokes && here ? { strokes, par: here.hole.par } : {}), at: Date.now(), ...(howNow && !strokes ? { how: howNow } : {}) }));
    setHow({ hole: -1, how: null });
  };
  const cur = gross.hole === m.played ? gross : { hole: m.played, home: null, away: null };
  const par = here?.hole.par ?? 4;
  const val = (side: 'home' | 'away') => cur[side] ?? par;
  const step = (side: 'home' | 'away', by: 1 | -1) => setGross({ ...cur, [side]: Math.max(1, Math.min(20, val(side) + by)) });
  const netWinner = here ? holeWinner(val('home'), val('away'), here.home, here.away) : null;
  const shots = (side: 'home' | 'away') => (here ? here[side] : 0);
  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={st.box}>
        <Text style={st.big}>{m.status === 'AS' ? 'All square' : `${leaderName} ${m.status}`}</Text>
        <Text style={st.meta}>
          {m.played >= s.regulation ? `Extra hole · ${holeNo}` : `Hole ${holeNo}${s.firstHole ? ` (${m.played + 1} of ${s.regulation})` : ` of ${s.regulation}`}`}{m.remaining ? ` · ${m.remaining} to play` : ''}
        </Text>
        {here ? <Text style={st.meta}>Par {here.hole.par} · SI {here.hole.si}{shots('home') || shots('away') ? ` · ${(['home', 'away'] as const).filter((x) => shots(x)).map((x) => `${'●'.repeat(Math.abs(shots(x)))} ${nm(x)} ${shots(x) > 0 ? 'gets a shot' : 'gives a shot'}`).join(' · ')}` : ' · no shots'}</Text> : null}
      </View>
      {ms && here && netWinner ? (
        // SD-87 — gross strokes for both sides; the hole goes on NET strokes
        <View style={st.strokeBox}>
          {(['home', 'away'] as const).map((side) => (
            <View key={side} style={st.strokeRow}>
              <Text style={[textStyles.body, st.flex]} numberOfLines={1}>{nm(side)}{shots(side) > 0 ? `  ${'●'.repeat(shots(side))}` : ''}</Text>
              <Button label="−" accessibilityLabel={`One stroke fewer for ${nm(side)}, now ${val(side)}`} variant="ghost" style={st.stepBtn} onPress={() => step(side, -1)} />
              <View style={st.strokeVal}>
                <Text style={st.strokeNum}>{val(side)}</Text>
                {shots(side) ? <Text style={st.meta}>net {val(side) - shots(side)}</Text> : null}
              </View>
              <Button label="+" accessibilityLabel={`One stroke more for ${nm(side)}, now ${val(side)}`} variant="ghost" style={st.stepBtn} onPress={() => step(side, 1)} />
            </View>
          ))}
          <Button
            label={`Record hole ${holeNo}: ${netWinner === 'halved' ? 'halved' : `${nm(netWinner)} wins`}`}
            variant={netWinner === 'halved' ? 'ghost' : netWinner}
            onPress={() => hole(netWinner, { home: val('home'), away: val('away') })}
          />
          <Text style={st.meta}>Or tap the result without strokes:</Text>
        </View>
      ) : null}
      <Button label={`${nm('home')} wins hole ${holeNo}`} variant="home" onPress={() => hole('home')} />
      <Button label={`Hole ${holeNo} halved`} variant="ghost" onPress={() => hole('halved')} />
      <Button label={`${nm('away')} wins hole ${holeNo}`} variant="away" onPress={() => hole('away')} />
      {/* batch 6 — optional: why the hole was lost (shown in the commentary); then tap the winner */}
      <View style={st.row}>
        <SelectChip label="Lost by penalty" active={howNow === 'penalty'} onPress={() => setHow({ hole: m.played, how: howNow === 'penalty' ? null : 'penalty' })} />
        <SelectChip label="Hole conceded" active={howNow === 'conceded'} onPress={() => setHow({ hole: m.played, how: howNow === 'conceded' ? null : 'conceded' })} />
      </View>
      {howNow ? <Text style={st.meta}>{howNow === 'penalty' ? 'The general penalty in match play is loss of hole' : 'The hole was conceded'} — now tap who wins hole {holeNo}.</Text> : null}
      {/* SD-87 — handicap strokes (WHS Appendix C: 100% of the difference) */}
      {setup ? (
        <MatchStrokesSetup
          regulation={s.regulation}
          firstHole={s.firstHole}
          homeName={nm('home')}
          awayName={nm('away')}
          homeIndex={s.strokes?.homeIndex ?? homeRoster[0]?.sportDetails?.golf?.handicapIndex}
          awayIndex={s.strokes?.awayIndex ?? awayRoster[0]?.sportDetails?.golf?.handicapIndex}
          onSave={(x) => { dispatch({ type: 'SET_STROKES', payload: x ? { strokes: x } : {} }); setSetup(false); }}
          onCancel={() => setSetup(false)}
          hasStrokes={!!ms}
        />
      ) : (
        <View style={{ gap: theme.spacing(1) }}>
          {ms ? <Text style={st.meta}>⛳ {strokesLine(ms, nm('home'), nm('away'))}{ms.course ? ` · ${ms.course}` : ''}</Text> : null}
          <Button label={ms ? '⚙ Change strokes / course' : '⛳ Enter strokes · handicap shots'} variant="ghost" onPress={() => setSetup(true)} />
        </View>
      )}
      {/* SD-116: conceding the MATCH (not a hole) — at the very end of the
          controls, behind a "who?" step and the confirm sheet. */}
      <View style={st.concede}>
        {!conceding ? (
          <Button label="🏳 Concede match…" variant="ghost" onPress={() => setConceding(true)} />
        ) : (
          <>
            <Text style={st.label}>Who concedes the match?</Text>
            <View style={st.row}>
              {(['home', 'away'] as const).map((side) => (
                <Button key={side} label={nm(side)} variant="ghost" style={st.flex} onPress={() => void concede(side)} />
              ))}
            </View>
            <Button label="Cancel" variant="ghost" onPress={() => setConceding(false)} />
          </>
        )}
      </View>
    </View>
  );
};

/** Match tabs (2026-10-22): the handicap strokes on Info (a match-setup fact),
 *  the hole-by-hole commentary on Commentary. Match play has no Stats tab. */
type TabProps = Parameters<NonNullable<SportPlugin<GolfMatchState>['LiveExtras']>>[0];
// a player's own name (a 1-v-1 match, by id for this viewer), else the side's
function useGolfName({ homeName, awayName, homeRoster = [], awayRoster = [] }: TabProps): (side: 'home' | 'away') => string {
  const { nameOf: who } = useMask();
  return (side: 'home' | 'away') => sideName(who, side === 'home' ? homeRoster : awayRoster, side === 'home' ? homeName : awayName);
}
const GolfStrokes = (p: TabProps) => {
  const s = p.state as GolfMatchState;
  const nm = useGolfName(p);
  return s.strokes ? <Text style={textStyles.muted}>⛳ {strokesLine(s.strokes, nm('home'), nm('away'))}</Text> : null;
};
// Deep wave — hole-by-hole commentary, newest first by nine, with the match
// state after each hole and the time it was recorded (golf/feed.ts)
const GolfCommentary = (p: TabProps) => {
  const nm = useGolfName(p);
  return <CommentaryFeed title="🎙 Hole by hole" groups={golfMatchFeed(p.state as GolfMatchState, { home: nm('home'), away: nm('away') })} homeColor={p.homeColor} awayColor={p.awayColor} empty="No holes played yet." />;
};

export const golfPlugin: SportPlugin<GolfMatchState> = {
  ...GOLF_META,
  matchRecords: golfMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => {
    if (!s.ended) return null;
    if (s.conceded) return { winner: s.conceded === 'home' ? 'away' : 'home', home: s.conceded === 'home' ? 0 : 1, away: s.conceded === 'away' ? 0 : 1 };
    const m = stateOf(s);
    if (!m.decided) return null;
    if (m.winner === 'halved') return { winner: 'draw', home: 0.5, away: 0.5 };
    return { winner: m.winner as 'home' | 'away', home: m.winner === 'home' ? 1 : 0, away: m.winner === 'away' ? 1 : 0 };
  },
  summary: (s) => {
    const m = stateOf(s);
    const lead = Math.abs(m.up);
    return {
      homeScore: m.up > 0 ? `${lead} UP` : m.up === 0 ? 'AS' : '',
      awayScore: m.up < 0 ? `${lead} UP` : m.up === 0 ? 'AS' : '',
      // SD-117c — the hole state at the concession, from the conceder's side
      statusLine: s.conceded ? `Final · ${concededLine(s.holes, s.conceded, s.regulation, s.extraHoles)}` : m.decided ? `Final · ${m.result}` : `Match play · thru ${m.played}`,
      detailLine: m.dormie ? 'Dormie' : `${s.regulation} holes${s.extraHoles ? ' · extra holes if level' : ''}`,
    };
  },
  // SD-137a — voice scoring (period / match ends ask first)
  voice: { hints: ['hole home', '{name} wins the hole', 'halved', 'strokes 4 5'], parse: golfMatchVoice },
  ScoringControls,
  matchTabs: { Info: GolfStrokes, Commentary: GolfCommentary },
};

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  concede: { gap: theme.spacing(2), marginTop: theme.spacing(4), paddingTop: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  box: { gap: theme.spacing(1), alignItems: 'center', padding: theme.spacing(4), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md },
  big: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small, textAlign: 'center' },
  strokeBox: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  strokeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  stepBtn: { minWidth: 48, paddingHorizontal: 0 },
  strokeVal: { width: 56, alignItems: 'center' },
  strokeNum: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
});
