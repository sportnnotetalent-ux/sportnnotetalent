/**
 * Snooker plugin — archetype: set-game-point (frames → match). The rules
 * engine is ./engine.ts (WPBSA 2022; 15 / 10 / 6 reds). This file is the
 * screen: the scorer's controls, the scoreboard and the match tabs.
 *
 * The logic lives in pure modules (node-tested): controls.ts (the taps the
 * screen offers and the actions they dispatch, stamped with the striker and
 * the frame), feed.ts (commentary), matchStats.ts (Stats tab), totals.ts
 * (career figures), records.ts, undo.ts. A tap that ends a frame or the
 * match asks first (cue/send.ts). IDs-only scoring: nothing here puts a name
 * into an action; names are looked up for this viewer when shown.
 */
import { cueInPlay } from '../cue/inPlay';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import type { ScoreAction, SportPlugin } from '../types';
import { SetLineBoard } from '../SetLineBoard';
import { CommentaryFeed } from '../gcc/CommentaryFeed';
import { CompareTable } from '../gcc/CompareTable';
import {
  createInitialState, reducer, isComplete, result, summary, scoreLine, lineScore, standingsUnits, AWARD_REASONS, FOUL_KINDS,
  type AwardReason, type Ball, type FoulKind, type Side, type SnookerState,
} from './engine';
import { SNOOKER_META } from './meta';
import {
  snookerPanel, snookerBoard, foulAction, frameScoreAction, frameScoreCheck, awardAction, missWarning, situationLine,
  BALL_COLOR, BALL_LABEL, FOUL_KIND_LABEL, AWARD_REASON_LABEL, FOUL_BALLS, foulValue, type BallTap, type SnookerPanel,
} from './controls';
import { snookerFeed } from './feed';
import { snookerMatchStats, snookerFrameNumbers, frameSheet, breakList, BREAK_LIST_MIN, BREAK_LIST_CHIPS } from './matchStats';
import { snookerStatTotals, snookerSideRecord, SNOOKER_RECORD_KEYS } from './totals';
import { withDoubles, doublesStatTotals } from '../cue/doubles';
import { withCueDoubles } from '../cue/DoublesAtTable';
import { snookerMatchRecords } from './records';
import { snookerUndoLabel } from './undo';
import { useSideNames } from '../cue/useNames';
import { sendTap } from '../cue/send';
import { TossRow, FrameScoreForm, FrameOptionsPanel, FrameSheet, BreakList, cue } from '../cue/parts';
import { FrameCorrections } from '../cue/FrameCorrections';
import { followHidden, hideBanner, hasFinishedFrame, tossNote, type Hidden } from '../cue/uiState';

type Act = ScoreAction | null;
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const ScoringControls: SportPlugin<SnookerState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as SnookerState;
  const names = useSideNames(homeName, awayName, homeRoster, awayRoster);
  const [foulOpen, setFoulOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [shotOverride, setShotOverride] = useState<number | null>(null);
  const [tossOpen, setTossOpen] = useState(false);
  // A-03 — "Play on" hides this foul's banner; an undo (the seq drops) forgets it
  const [hidden, setHidden] = useState<Hidden | null>(null);
  // cue batch 6 — optional tags for the next pot / missed pot (Stats to track: long pots, the rest)
  const [tags, setTags] = useState<{ long: boolean; rest: boolean }>({ long: false, rest: false });
  const seq = typeof s?.seq === 'number' ? s.seq : 0;
  const stillHidden = followHidden(hidden, seq);
  useEffect(() => { if (stillHidden !== hidden) setHidden(stillHidden); }, [stillHidden, hidden]);
  const p = snookerPanel(s);
  if (!p) return <Text style={textStyles.muted}>{s?.ended ? 'Match over.' : 'This match can\'t be scored here.'}</Text>;

  const send = (a: Act, warn?: string) => {
    setFoulOpen(false);
    void sendTap(reducer, s, a, dispatch, names, 'frame', warn);
  };
  // a pot or a missed pot carries the tags picked for it; then they clear
  const sendShot = (a: Act) => {
    const tagged = a && (a.type === 'POT' || a.type === 'MISS') && (tags.long || tags.rest)
      ? { ...a, payload: { ...(a.payload ?? {}), ...(tags.long ? { long: true } : {}), ...(tags.rest ? { rest: true } : {}) } } : a;
    setTags({ long: false, rest: false });
    send(tagged);
  };
  const quickShown = p.frameScore && ((p.quick && shotOverride !== p.frame) || quickOpen);
  const striker = names[p.striker];
  const foulKey = p.afterFoul ? `${p.frame}:${p.afterFoul.at}` : null;
  const rerack = async () => {
    if (!p.rerack) return;
    const ok = await askConfirm({
      title: `Re-rack frame ${p.frame}?`,
      message: p.respot
        ? 'Stalemate on the re-spotted black: the black is re-spotted again and the same player plays first. The scores stay.'
        : `Stalemate: every score of frame ${p.frame} is cancelled, the balls are set up again and ${names[p.breaker]} breaks off again.`,
      yesLabel: 'Yes, re-rack', noLabel: 'No, keep scoring', tone: 'caution',
    });
    if (ok) dispatch(p.rerack);
  };

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <View style={{ gap: theme.spacing(1) }}>
        <Text style={cue.meta}>Frame {p.frame} · best of {p.bestOf} · {p.reds} reds</Text>
        <Text style={st.big} accessibilityLiveRegion="polite">
          {striker} at the table{p.breakPts > 0 ? ` · break ${p.breakPts}` : ''}
        </Text>
        <Text style={cue.meta}>{situationLine(p, names)}</Text>
      </View>

      {/* who breaks off: the toss on frame 1, then "change" (S3 R3(d)) */}
      {p.toss && (p.frame === 1 || tossOpen) ? (
        <TossRow names={names} breaker={p.breaker} toss={p.toss} first={p.frame === 1} recorded={p.tossed} onTap={(a) => { send(a); setTossOpen(false); }} />
      ) : p.toss ? (
        <Text style={st.link} accessibilityRole="button" accessibilityLabel={`${names[p.breaker]} breaks off. Change who breaks off`} onPress={() => setTossOpen(true)}>
          {names[p.breaker]} breaks off · Change
        </Text>
      ) : null}

      {/* the re-spotted black: lots for who plays first (S3 R4(b)) */}
      {p.respotLots ? (
        <View style={cue.banner}>
          <Text style={cue.label}>Scores level: the black is re-spotted. Who plays first? <Text style={cue.meta}>(drawn by lots)</Text></Text>
          <View style={cue.row}>
            {(['home', 'away'] as Side[]).map((sd) => (
              <Button key={sd} label={names[sd]} variant={p.striker === sd ? sd : 'ghost'} style={cue.flex} selected={p.striker === sd}
                accessibilityLabel={`${names[sd]} plays the re-spotted black first`} onPress={() => send(p.respotLots![sd])} />
            ))}
          </View>
        </View>
      ) : null}

      {quickShown ? (
        <View style={{ gap: theme.spacing(2) }}>
          {/* A-05 — the form belongs to its frame: a frame saved meanwhile clears it */}
          <FrameScoreForm key={`frame-${p.frame}`}
            title={`Frame ${p.frame} final score`} names={names} saveLabel={`Save frame ${p.frame}`}
            hint={p.quick ? 'Frames are scored as the final score only (no breaks).' : undefined}
            check={(h, a) => frameScoreCheck(s, h, a)}
            onSave={(h, a, warn) => sendTap(reducer, s, frameScoreAction(s, h, a), dispatch, names, 'frame', warn)}
          />
          {p.quick ? (
            <Text style={st.link} accessibilityRole="button" onPress={() => setShotOverride(p.frame)}>Score this frame shot by shot instead</Text>
          ) : (
            <Text style={st.link} accessibilityRole="button" onPress={() => setQuickOpen(false)}>Score shot by shot</Text>
          )}
        </View>
      ) : null}

      {!quickShown ? (
        <>
          {p.afterFoul && foulKey && stillHidden?.key !== foulKey ? (
            <AfterFoulBanner p={p} names={names} send={send} onPlayOn={() => setHidden(hideBanner(foulKey, seq))} />
          ) : null}
          {p.missWarn ? (
            <View style={cue.banner} accessibilityLiveRegion="polite">
              <Text style={cue.label}>⚠️ {missWarning(p.missWarn, names)}</Text>
              {p.missWarn.award ? (
                <Button label={`Award frame ${p.frame} to ${names[other(p.missWarn.by)]}`} variant="danger" onPress={() => send(p.missWarn!.award)} />
              ) : null}
            </View>
          ) : null}

          {s.trackLR === true ? (
            <View style={st.redRow}>
              <SelectChip label="Long pot" active={tags.long} onPress={() => setTags((t) => ({ ...t, long: !t.long }))} accessibilityLabel="Tag the next pot or missed pot as a long pot" />
              <SelectChip label="With the rest" active={tags.rest} onPress={() => setTags((t) => ({ ...t, rest: !t.rest }))} accessibilityLabel="Tag the next pot or missed pot as played with the rest" />
            </View>
          ) : null}
          <BallPad p={p} send={sendShot} />

          <View style={cue.row}>
            <Button label="Missed" variant="ghost" style={cue.flex} disabled={!p.miss} accessibilityLabel={`${striker} missed a pot: the turn passes`} onPress={() => sendShot(p.miss)} />
            <Button label="Safety" variant="ghost" style={cue.flex} disabled={!p.safety} accessibilityLabel={`${striker} played a safety: the turn passes`} onPress={() => send(p.safety)} />
            <Button label="Foul…" variant={foulOpen ? 'danger' : 'ghost'} style={cue.flex} selected={foulOpen} accessibilityLabel="Record a foul" onPress={() => setFoulOpen((v) => !v)} />
          </View>
          {foulOpen ? <FoulSheet key={s.seq} s={s} p={p} names={names} send={send} /> : null}

          {p.frameScore && !p.quick ? (
            <Text style={st.link} accessibilityRole="button" onPress={() => setQuickOpen(true)}>Enter this frame's final score only</Text>
          ) : null}
        </>
      ) : null}

      <FrameOptionsPanel
        names={names} unit="frame" concede={p.concede} send={send}
        award={(sd, r) => awardAction(s, sd, r as AwardReason | undefined)}
        reasons={AWARD_REASONS.filter((r) => r !== 'miss').map((r) => ({ key: r, label: AWARD_REASON_LABEL[r] }))}
        extraLabel="re-rack"
        extra={p.rerack ? <Button label="Re-rack (stalemate)…" variant="ghost" accessibilityLabel={`Re-rack frame ${p.frame} after a stalemate`} onPress={() => void rerack()} /> : null}
      />
    </View>
  );
};

/** The balls: the ones on are lit (enabled), the rest dimmed; several reds
 *  in one stroke and the free ball as chips. */
function BallPad({ p, send }: { p: SnookerPanel; send: (a: Act) => void }) {
  const ball = (b: BallTap, wide = false) => (
    <Button key={b.ball} label={`${b.label} ${b.value}`} color={BALL_COLOR[b.ball]} disabled={!b.action}
      style={wide ? cue.flex : st.colour}
      accessibilityLabel={b.ball === 'free' ? `Pot the free ball, ${plural(b.value, 'point')}` : `Pot the ${b.label.toLowerCase()}, ${plural(b.value, 'point')}`}
      onPress={() => send(b.action)} />
  );
  const red = p.balls.find((b) => b.ball === 'red');
  const free = p.balls.find((b) => b.ball === 'free');
  const colours = p.balls.filter((b) => b.ball !== 'red' && b.ball !== 'free');
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {red ? (
        <View style={st.redRow}>
          {ball(red, true)}
          {p.redMulti.map((r) => (
            <SelectChip key={r.n} label={`${r.n} reds`} active={false} onPress={() => send(r.action)} accessibilityLabel={`Pot ${r.n} reds in one shot`} />
          ))}
        </View>
      ) : null}
      <View style={st.colours}>{colours.map((b) => ball(b, colours.length === 1))}</View>
      {free ? (
        <View style={st.redRow}>
          {ball(free, true)}
          {p.freeRed.map((r) => (
            <SelectChip key={r.n} label={`Free ball + ${plural(r.n, 'red')}`} active={false} onPress={() => send(r.action)}
              accessibilityLabel={`Pot the free ball and ${plural(r.n, 'red')} in one shot`} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Straight after a foul, the fouled player's choice (S3 R10(h), R12, R14). */
function AfterFoulBanner({ p, names, send, onPlayOn }: { p: SnookerPanel; names: { home: string; away: string }; send: (a: Act) => void; onPlayOn: () => void }) {
  const f = p.afterFoul!;
  const fouled = names[p.striker];
  return (
    <View style={cue.banner} accessibilityLiveRegion="polite">
      <Text style={cue.label}>{names[f.by]} fouled: {f.value} to {fouled}{f.miss ? ' · foul and a miss' : ''}. {fouled} chooses:</Text>
      <View style={cue.chips}>
        <Button label="Play on" variant="ghost" accessibilityLabel={`${fouled} plays on from where the balls are`} onPress={onPlayOn} />
        {f.playAgain ? <Button label="Make them play again" variant="ghost" accessibilityLabel={`${names[f.by]} must play again`} onPress={() => send(f.playAgain)} /> : null}
        {f.replace ? <Button label="Replace the balls" variant="ghost" accessibilityLabel={`Put the balls back and ${names[f.by]} plays again`} onPress={() => send(f.replace)} /> : null}
        {f.freeBall ? <Button label="Free ball" variant="ghost" accessibilityLabel={`The referee called a free ball for ${fouled}`} onPress={() => send(f.freeBall)} /> : null}
      </View>
      {f.freeBallGiven ? <Text style={cue.meta}>Free ball: {fouled} may nominate any ball; it counts as the ball on.</Text> : null}
      {f.replaceBlocked ? <Text style={cue.meta}>Five fouls and a miss in a row: the balls can't be replaced again (six-red rule).</Text> : null}
    </View>
  );
}

/** The foul sheet: the value (the minimum pre-selected; the ball involved
 *  raises it, S3 R11, and a value chip still overrides), the kind, foul and a
 *  miss, free ball, reds down, or a penalty on the player not at the table. */
function FoulSheet({ s, p, names, send }: { s: SnookerState; p: SnookerPanel; names: { home: string; away: string }; send: (a: Act) => void }) {
  const [value, setValue] = useState(p.foul.min);
  const [kind, setKind] = useState<FoulKind | null>(null);
  const [ball, setBall] = useState<Ball | null>(null);
  const pickBall = (b: Ball) => { const next = ball === b ? null : b; setBall(next); setValue(foulValue(p.foul.min, next)); };
  const [miss, setMiss] = useState(false);
  const [freeBall, setFreeBall] = useState(false);
  const [reds, setReds] = useState(0);
  const [byOther, setByOther] = useState(false);
  const offender = byOther ? other(p.striker) : p.striker;
  const action = foulAction(s, { value, ...(kind ? { kind } : {}), ...(byOther ? { byOther: true } : { miss, freeBall: freeBall && p.foul.canFreeBall, reds }) });
  return (
    <View style={cue.box}>
      <Text style={cue.label}>Foul by {names[offender]} · {value} to {names[other(offender)]}</Text>
      <View style={cue.chips}>
        {p.foul.values.map((v) => (
          <SelectChip key={v} label={String(v)} active={value === v} onPress={() => setValue(v)} accessibilityLabel={`${v} penalty points`} />
        ))}
      </View>
      <Text style={cue.meta}>The minimum now is {p.foul.min}: 4, or the value of the ball on if higher. Pick the ball involved to set it.</Text>
      <View style={cue.chips}>
        {FOUL_KINDS.map((k) => (
          <SelectChip key={k} label={FOUL_KIND_LABEL[k]} active={kind === k} onPress={() => setKind(kind === k ? null : k)} accessibilityLabel={`Kind of foul: ${FOUL_KIND_LABEL[k]}`} />
        ))}
      </View>
      <View style={{ gap: theme.spacing(1) }}>
        <Text style={cue.meta}>Ball involved (hit first, potted or forced off)</Text>
        <View style={cue.chips}>
          {FOUL_BALLS.map((b) => (
            <SelectChip key={b} label={BALL_LABEL[b]} active={ball === b} onPress={() => pickBall(b)}
              accessibilityLabel={`Ball involved: the ${BALL_LABEL[b].toLowerCase()}, foul worth ${foulValue(p.foul.min, b)}`} />
          ))}
        </View>
      </View>
      {!byOther ? (
        <View style={cue.chips}>
          <SelectChip label="Foul and a miss" active={miss} onPress={() => setMiss((v) => !v)} />
          {p.foul.canFreeBall ? <SelectChip label="Free ball" active={freeBall} onPress={() => setFreeBall((v) => !v)} accessibilityLabel="The referee called a free ball" /> : null}
        </View>
      ) : null}
      {!byOther && p.foul.maxRedsDown > 0 ? (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={cue.meta}>Reds potted or knocked off the table in the foul (they stay off)</Text>
          <View style={cue.chips}>
            {Array.from({ length: Math.min(p.foul.maxRedsDown, 4) + 1 }, (_, n) => (
              <SelectChip key={n} label={String(n)} active={reds === n} onPress={() => setReds(n)} accessibilityLabel={`${plural(n, 'red')} down in the foul`} />
            ))}
          </View>
        </View>
      ) : null}
      <SelectChip label={`Penalty on ${names[other(p.striker)]} (not at the table)`} active={byOther} onPress={() => setByOther((v) => !v)}
        accessibilityLabel={`The penalty is on ${names[other(p.striker)]}, the player not at the table; the turn goes on`} />
      <Button label={`Record ${byOther ? 'penalty' : 'foul'} · ${value} to ${names[other(offender)]}`} variant="danger" disabled={!action} onPress={() => send(action)} />
    </View>
  );
}

/** The scoreboard: frames won + a column of frame points per frame, the frame
 *  in play lit; the break, the snookers needed and the points left. */
const SnookerScoreboard: NonNullable<SportPlugin<SnookerState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as SnookerState;
  // A-07 — the words come from the pure snookerBoard(s), which never throws
  const b = snookerBoard(s);
  return (
    <SetLineBoard
      ls={frameLineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={b.status} bestOf={b.bestOf} leadLabel="FRAMES" alerts={b.alerts} cue={b.cue}
    />
  );
};

/** A-01 — corrections a frame at a time (a single row can't be voided from a
 *  shot log without unravelling every later frame). */
const SnookerCorrections: NonNullable<SportPlugin<SnookerState>['CorrectionEditor']> = (props) => (
  <FrameCorrections {...props} eng={{ createInitialState, reducer: reducer as never }} unit="frame" rule="A frame can't end level." />
);

/** Match tabs: visit-by-visit commentary (newest first, by frame) on
 *  Commentary; the match stats (whole match or one frame), the break list and
 *  the frame-by-frame sheet on Stats. */
type TabProps = Parameters<NonNullable<SportPlugin<SnookerState>['LiveExtras']>>[0];
const SnookerCommentary = (p: TabProps) => {
  const names = useSideNames(p.homeName, p.awayName, p.homeRoster, p.awayRoster);
  return <CommentaryFeed title={null} groups={snookerFeed(p.state as SnookerState, names)} homeColor={p.homeColor} awayColor={p.awayColor} empty="No shots yet." />;
};
function SnookerStats(p: TabProps) {
  const s = p.state as SnookerState;
  const names = useSideNames(p.homeName, p.awayName, p.homeRoster, p.awayRoster);
  const [unit, setUnit] = useState('all');
  const [min, setMin] = useState(BREAK_LIST_MIN);
  const frames = snookerFrameNumbers(s);
  if (!frames.length) return <Text style={textStyles.muted}>No frames yet.</Text>;
  const frame = unit === 'all' || !frames.includes(Number(unit)) ? undefined : Number(unit);
  const sheet = frameSheet(s);
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <CompareTable title={null} homeName={names.home} awayName={names.away} homeColor={p.homeColor} awayColor={p.awayColor}
        categories={snookerMatchStats(s, frame)} unit={frame == null ? 'all' : unit} onUnit={setUnit}
        units={[{ key: 'all', label: 'Match' }, ...frames.map((n) => ({ key: String(n), label: `Frame ${n}` }))]}
        footnote={sheet.some((r) => r.quick) ? 'Frames entered as a final score have no break, potting or foul detail.' : undefined} />
      <BreakList list={breakList(s, min)} chips={BREAK_LIST_CHIPS} min={min} onMin={setMin} names={names} unit="frame" homeColor={p.homeColor} awayColor={p.awayColor} />
      <FrameSheet rows={sheet} names={names} unit="frame" homeColor={p.homeColor} awayColor={p.awayColor} note={tossNote(s, names)} />
    </View>
  );
}

/** The line score, counted in frames (the scoreboard says FRAMES; A-09). */
const frameLineScore = (s: SnookerState) => {
  const ls = lineScore(s);
  return ls ? { ...ls, unit: 'frame' as const } : null;
};

// doubles: partners take alternate visits; each visit credited to who played it (cue/doubles.ts)
const doubles = withDoubles(createInitialState, reducer as never);

export const snookerPlugin: SportPlugin<SnookerState> = {
  ...SNOOKER_META,
  // SD-51 — highest breaks, centuries, maximums, biggest frame wins
  matchRecords: snookerMatchRecords,
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
  // SD-19 — derived only (nothing is credited live); one player per side
  statTotals: doublesStatTotals(snookerStatTotals as never, snookerSideRecord as never, SNOOKER_RECORD_KEYS, { potted: 'potted', pots: 'pots' }) as never,
  statTotalsNeedsPlayers: true,
  // SD-133 — "Undo: black · break 8"
  undoLabel: (step) => snookerUndoLabel(step),
  Scoreboard: SnookerScoreboard,
  inPlay: (s, r) => cueInPlay(s, r),
  // A-01 — "Correct this match": a frame's final score, later frames kept
  CorrectionEditor: SnookerCorrections,
  ScoringControls: withCueDoubles(ScoringControls),
  matchTabs: { Commentary: SnookerCommentary, Stats: SnookerStats },
};

const st = StyleSheet.create({
  big: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingVertical: theme.spacing(1) },
  redRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2) },
  colours: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  colour: { flexBasis: '30%', flexGrow: 1 },
});
