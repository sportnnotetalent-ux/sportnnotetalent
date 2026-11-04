/**
 * English billiards plugin — archetype: set-game-point (N-up frames, best of
 * N; a single N-up game; a timed game). The rules engine is ./engine.ts
 * (WPBSA 2022 billiards rules). This file is the screen: the scorer's
 * controls, the scoreboard and the match tabs.
 *
 * The logic lives in pure modules (node-tested): controls.ts (the strokes
 * and the actions they dispatch, stamped with the striker and the frame; the
 * TEN HAZARDS / SEVENTY CANNONS warnings), feed.ts, matchStats.ts,
 * totals.ts, records.ts, undo.ts. A tap that ends a frame or the match asks
 * first (cue/send.ts). IDs-only scoring: no name ever goes into an action.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import type { ScoreAction, SportPlugin } from '../types';
import { SetLineBoard } from '../SetLineBoard';
import { CommentaryFeed } from '../gcc/CommentaryFeed';
import { CompareTable } from '../gcc/CompareTable';
import {
  createInitialState, reducer, isComplete, result, summary, scoreLine, lineScore, standingsUnits, standingsScore, AWARD_REASONS, FOUL_KINDS, PARTS,
  type AwardReason, type BilliardsState, type FoulKind, type Part, type Side,
} from './engine';
import { BILLIARDS_META } from './meta';
import {
  billiardsPanel, billiardsBoard, strokeAction, strokeFoul, foulAction, frameScoreAction, frameScoreCheck, awardAction, limitWarnings, comboValue,
  PART_LABEL, FOUL_KIND_LABEL, AWARD_REASON_LABEL, type BilliardsPanel, type Parts,
} from './controls';
import { billiardsFeed } from './feed';
import { billiardsMatchStats, billiardsFrameNumbers, frameSheet, breakList, BREAK_LIST_MIN, BREAK_LIST_CHIPS } from './matchStats';
import { billiardsStatTotals, billiardsSideRecord, BILLIARDS_RECORD_KEYS } from './totals';
import { withDoubles, doublesStatTotals } from '../cue/doubles';
import { withCueDoubles } from '../cue/DoublesAtTable';
import { billiardsMatchRecords } from './records';
import { billiardsUndoLabel } from './undo';
import { useSideNames } from '../cue/useNames';
import { sendTap } from '../cue/send';
import { endingOf } from '../cue/ending';
import { TossRow, FrameScoreForm, FrameOptionsPanel, FrameSheet, BreakList, cue } from '../cue/parts';
import { FrameCorrections } from '../cue/FrameCorrections';
import { hasFinishedFrame, tossNote } from '../cue/uiState';

type Act = ScoreAction | null;
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const unitOf = (s: BilliardsState): 'frame' | 'game' => (s?.bestOf > 1 ? 'frame' : 'game');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "Frame 2 · best of 5 · 150-up" / "Game · 100-up" / "Timed game" */
function formatLine(p: BilliardsPanel): string {
  const game = p.format === 'timed' ? 'timed' : `${p.target}-up`;
  return p.unit === 'frame' ? `Frame ${p.frame} · best of ${p.bestOf} · ${game}` : p.format === 'timed' ? 'Timed game' : `Game · ${game}`;
}

const ScoringControls: SportPlugin<BilliardsState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as BilliardsState;
  const names = useSideNames(homeName, awayName, homeRoster, awayRoster);
  const [sheet, setSheet] = useState<'combo' | 'foul' | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [shotOverride, setShotOverride] = useState<number | null>(null);
  const [tossOpen, setTossOpen] = useState(false);
  const p = billiardsPanel(s);
  if (!p) return <Text style={textStyles.muted}>{s?.ended ? 'Match over.' : 'This match can\'t be scored here.'}</Text>;
  const unit = p.unit;
  const send = (a: Act, warn?: string) => {
    setSheet(null);
    void sendTap(reducer, s, a, dispatch, names, unit, warn);
  };
  const quickShown = p.frameScore && ((s.scoringMode === 'quick' && shotOverride !== p.frame) || quickOpen);
  const striker = names[p.striker];
  const warnings = limitWarnings(p);
  const callTime = async () => {
    if (!p.time) return;
    if (endingOf(reducer, s, p.time)) { send(p.time); return; }
    // level: sudden death (or a draw, which ends it and asks above)
    const ok = await askConfirm({
      title: 'Call time?', message: `Scores are level at ${p.score.home}–${p.score.away}: the next score or foul wins.`,
      yesLabel: 'Yes, call time', noLabel: 'No, keep scoring', tone: 'caution',
    });
    if (ok) dispatch(p.time);
  };

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={{ gap: theme.spacing(1) }}>
        <Text style={cue.meta}>{formatLine(p)}{p.sudden ? ' · sudden death: the next score or foul wins' : ''}</Text>
        <Text style={st.big} accessibilityLiveRegion="polite">{striker} at the table{p.breakPts > 0 ? ` · break ${p.breakPts}` : ''}</Text>
        {p.toGo ? <Text style={cue.meta}>To win: {names.home} needs {p.toGo.home} · {names.away} needs {p.toGo.away}</Text> : null}
      </View>

      {p.toss && (p.frame === 1 || tossOpen) ? (
        <TossRow names={names} breaker={p.breaker} toss={p.toss} first={p.frame === 1} recorded={p.tossed} onTap={(a) => { send(a); setTossOpen(false); }} />
      ) : p.toss ? (
        <Text style={st.link} accessibilityRole="button" accessibilityLabel={`${names[p.breaker]} breaks off. Change who breaks off`} onPress={() => setTossOpen(true)}>
          {names[p.breaker]} breaks off · Change
        </Text>
      ) : null}

      {quickShown ? (
        <View style={{ gap: theme.spacing(2) }}>
          {/* A-05 — the form belongs to its frame: a frame saved meanwhile clears it */}
          <FrameScoreForm key={`frame-${p.frame}`}
            title={`${cap(unit)} ${p.frame} final score`} names={names} saveLabel={`Save ${unit} ${p.frame}`}
            hint={p.format === 'points' ? `The winner reaches ${p.target}; a score past it is recorded at ${p.target}.` : 'The score when time was called.'}
            check={(h, a) => frameScoreCheck(s, h, a)}
            onSave={(h, a, warn) => sendTap(reducer, s, frameScoreAction(s, h, a), dispatch, names, unit, warn)}
          />
          <Text style={st.link} accessibilityRole="button" onPress={() => { setShotOverride(p.frame); setQuickOpen(false); }}>Score this {unit} shot by shot</Text>
        </View>
      ) : (
        <>
          {warnings.length ? (
            <View style={cue.banner} accessibilityLiveRegion="polite">
              {warnings.map((w) => <Text key={w} style={cue.label}>⚠️ {w}</Text>)}
            </View>
          ) : null}
          <View style={st.grid}>
            {p.strokes.map((x) => (
              <Button key={x.key} label={x.foul ? `${x.label} · foul now` : `${x.label} · ${x.pts}`} variant={x.foul ? 'danger' : 'primary'} style={st.cell}
                disabled={!x.action}
                accessibilityLabel={x.foul ? `${x.label}: over the limit, this stroke is a foul` : `${x.label}, ${x.pts} points`}
                onPress={() => send(x.action)} />
            ))}
          </View>
          <Button label="Combo…" variant={sheet === 'combo' ? 'primary' : 'ghost'} selected={sheet === 'combo'} accessibilityLabel="Score a stroke with several parts"
            onPress={() => setSheet(sheet === 'combo' ? null : 'combo')} />
          {sheet === 'combo' ? <ComboSheet key={s.seq} s={s} send={send} /> : null}
          <View style={cue.row}>
            <Button label="Missed" variant="ghost" style={cue.flex} disabled={!p.miss} accessibilityLabel={`${striker} missed: the turn passes`} onPress={() => send(p.miss)} />
            <Button label="Safety" variant="ghost" style={cue.flex} disabled={!p.safety} accessibilityLabel={`${striker} played safe: the turn passes`} onPress={() => send(p.safety)} />
            <Button label="Foul…" variant={sheet === 'foul' ? 'danger' : 'ghost'} style={cue.flex} selected={sheet === 'foul'} accessibilityLabel="Record a foul"
              onPress={() => setSheet(sheet === 'foul' ? null : 'foul')} />
          </View>
          {sheet === 'foul' ? <FoulSheet key={s.seq} s={s} p={p} names={names} send={send} /> : null}
          {p.time ? <Button label="⏱ Time called" variant="danger" accessibilityLabel="The referee called time" onPress={() => void callTime()} /> : null}
          {p.frameScore && s.scoringMode !== 'quick' ? (
            <Text style={st.link} accessibilityRole="button" onPress={() => setQuickOpen(true)}>Enter this {unit}'s final score only</Text>
          ) : null}
        </>
      )}

      <FrameOptionsPanel
        names={names} unit={unit} concede={p.concede} send={send}
        award={(sd, r) => awardAction(s, sd, r as AwardReason | undefined)}
        reasons={AWARD_REASONS.map((r) => ({ key: r, label: AWARD_REASON_LABEL[r] }))}
      />
    </View>
  );
};

/** Any combination of the five parts in one stroke (S3 R4(c)): the total, and
 *  whether it is over the hazard / cannon limit (the foul stroke). */
function ComboSheet({ s, send }: { s: BilliardsState; send: (a: Act) => void }) {
  const [parts, setParts] = useState<Parts>({});
  const toggle = (k: Part) => setParts((cur) => {
    const next = { ...cur, [k]: !cur[k] };
    // one cue ball: an in-off is off the red or off the white, not both (S3 R4(d))
    if (k === 'inOffRed' && next.inOffRed) next.inOffWhite = false;
    if (k === 'inOffWhite' && next.inOffWhite) next.inOffRed = false;
    return next;
  });
  const pts = comboValue(parts);
  const action = strokeAction(s, parts);
  const foul = strokeFoul(s, parts);
  return (
    <View style={cue.box}>
      <Text style={cue.label}>One stroke with several parts</Text>
      <View style={cue.chips}>
        {PARTS.map((k) => (
          <SelectChip key={k} label={`${PART_LABEL[k]} ${k === 'potRed' || k === 'inOffRed' ? 3 : 2}`} active={!!parts[k]} onPress={() => toggle(k)}
            accessibilityLabel={`${PART_LABEL[k]} in this stroke`} />
        ))}
      </View>
      {foul ? <Text style={cue.warn}>Over the {foul === 'hazards' ? 'hazard' : 'cannon'} limit: this stroke is a foul.</Text> : null}
      <Button label={pts ? `Record stroke · ${foul ? 'foul' : `${pts} points`}` : 'Pick the parts of the stroke'} disabled={!action} onPress={() => send(action)} />
    </View>
  );
}

function FoulSheet({ s, p, names, send }: { s: BilliardsState; p: BilliardsPanel; names: { home: string; away: string }; send: (a: Act) => void }) {
  const [kind, setKind] = useState<FoulKind | null>(null);
  const action = foulAction(s, kind ?? undefined);
  return (
    <View style={cue.box}>
      <Text style={cue.label}>Foul by {names[p.striker]} · {p.foulPoints} to {names[other(p.striker)]}</Text>
      <View style={cue.chips}>
        {FOUL_KINDS.filter((k) => k !== 'hazards' && k !== 'cannons').map((k) => (
          <SelectChip key={k} label={FOUL_KIND_LABEL[k]} active={kind === k} onPress={() => setKind(kind === k ? null : k)} accessibilityLabel={`Kind of foul: ${FOUL_KIND_LABEL[k]}`} />
        ))}
      </View>
      <Button label={`Record foul · ${p.foulPoints} to ${names[other(p.striker)]}`} variant="danger" disabled={!action} onPress={() => send(action)} />
    </View>
  );
}

const BilliardsScoreboard: NonNullable<SportPlugin<BilliardsState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as BilliardsState;
  // A-07 — the words come from the pure billiardsBoard(s), which never throws
  const b = billiardsBoard(s);
  return (
    <SetLineBoard
      ls={frameLineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={b.status} bestOf={b.bestOf} leadLabel={b.leadLabel} alerts={b.alerts} cue={b.cue}
    />
  );
};

/** A-01 — corrections a frame (game) at a time: later frames replay as played. */
const BilliardsCorrections: NonNullable<SportPlugin<BilliardsState>['CorrectionEditor']> = (props) => (
  <FrameCorrections {...props} eng={{ createInitialState, reducer: reducer as never }} unit={unitOf(createInitialState(props.config))}
    rule="A points game: the winner reaches the target and the loser doesn't. A timed game: level only when the organiser allows a draw." />
);

type TabProps = Parameters<NonNullable<SportPlugin<BilliardsState>['LiveExtras']>>[0];
const BilliardsCommentary = (p: TabProps) => {
  const names = useSideNames(p.homeName, p.awayName, p.homeRoster, p.awayRoster);
  const s = p.state as BilliardsState;
  return <CommentaryFeed title={null} groups={billiardsFeed(s, names, unitOf(s))} homeColor={p.homeColor} awayColor={p.awayColor} empty="No strokes yet." />;
};
function BilliardsStats(p: TabProps) {
  const s = p.state as BilliardsState;
  const names = useSideNames(p.homeName, p.awayName, p.homeRoster, p.awayRoster);
  const [unitKey, setUnitKey] = useState('all');
  const [min, setMin] = useState(BREAK_LIST_MIN);
  const frames = billiardsFrameNumbers(s);
  const unit = unitOf(s);
  if (!frames.length) return <Text style={textStyles.muted}>No {unit}s yet.</Text>;
  const frame = unitKey === 'all' || !frames.includes(Number(unitKey)) ? undefined : Number(unitKey);
  const sheet = frameSheet(s);
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <CompareTable title={null} homeName={names.home} awayName={names.away} homeColor={p.homeColor} awayColor={p.awayColor}
        categories={billiardsMatchStats(s, frame)} unit={frame == null ? 'all' : unitKey} onUnit={setUnitKey}
        units={frames.length > 1 ? [{ key: 'all', label: 'Match' }, ...frames.map((n) => ({ key: String(n), label: `${cap(unit)} ${n}` }))] : undefined}
        footnote={sheet.some((r) => r.quick) ? `${cap(unit)}s entered as a final score have no break, stroke or foul detail.` : undefined} />
      <BreakList list={breakList(s, min)} chips={BREAK_LIST_CHIPS} min={min} onMin={setMin} names={names} unit={unit} homeColor={p.homeColor} awayColor={p.awayColor} />
      <FrameSheet rows={sheet} names={names} unit={unit} homeColor={p.homeColor} awayColor={p.awayColor} note={tossNote(s, names)} />
    </View>
  );
}

/** The line score, counted in frames (the scoreboard says FRAMES; A-09). */
const frameLineScore = (s: BilliardsState) => {
  const ls = lineScore(s);
  return ls ? { ...ls, unit: (s?.bestOf === 1 ? 'game' : 'frame') as 'game' | 'frame' } : null;
};

// doubles: partners take alternate visits; each visit credited to who played it (cue/doubles.ts)
const doubles = withDoubles(createInitialState, reducer as never);

export const billiardsPlugin: SportPlugin<BilliardsState> = {
  ...BILLIARDS_META,
  // SD-51 — highest breaks, centuries, biggest frame wins
  matchRecords: billiardsMatchRecords,
  createInitialState: (c) => doubles.init(c) as never,
  reducer: (s, a) => doubles.reduce(s as never, a as never) as never,
  isComplete,
  result: (s) => result(s),
  summary,
  scoreLine,
  lineScore: frameLineScore,
  correctionLabel: '✎ Correct a finished frame',
  // the live link waits for a finished frame (a one-game match has none until it ends)
  liveCorrection: hasFinishedFrame,
  standingsUnits,
  // the league table counts points (founder 2026-10-28)
  standingsScore,
  // SD-19 — derived only (nothing is credited live); one player per side
  statTotals: doublesStatTotals(billiardsStatTotals as never, billiardsSideRecord as never, BILLIARDS_RECORD_KEYS, { potted: 'scored' }) as never,
  statTotalsNeedsPlayers: true,
  // SD-133 — "Undo: pot red + cannon · break 5"
  undoLabel: (step) => billiardsUndoLabel(step),
  Scoreboard: BilliardsScoreboard,
  // A-01 — "Correct this match": a frame's final score, later frames kept
  CorrectionEditor: BilliardsCorrections,
  ScoringControls: withCueDoubles(ScoringControls),
  matchTabs: { Commentary: BilliardsCommentary, Stats: BilliardsStats },
};

const st = StyleSheet.create({
  big: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingVertical: theme.spacing(1) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  cell: { flexBasis: '45%', flexGrow: 1, minHeight: 56 },
});
