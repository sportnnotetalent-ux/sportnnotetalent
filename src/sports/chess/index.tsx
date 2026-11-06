/**
 * Chess plugin — archetype: result. One recorded result per game: who won (or a
 * draw) and how. Scoring is 1 / ½ / 0, so league tables read like a crosstable
 * and the Swiss pairing engine fits open tournaments directly. Each player is
 * credited a game (+ win/draw/loss) on their profile when the result is recorded.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import { confirmCopy } from '../../core/matchSafety';
import type { Attribution, ScoreAction, SportPlugin } from '../types';
import { Scoreboard } from '../../components/Scoreboard';
import {
  init, reducer, points, resultString, resultSentence, scoreFor, METHOD_LABEL, isForfeit, isDoubleForfeit, clockText, parseClock,
  DEFAULT_KO_PLAN, koPhases, koPoints, koStatus, koPhaseText, KO_PHASE_LABEL, arbiterAction, arbiterPreset, illegalCount, illegalSecs, timeControlText, presetPick, type ArbiterKind,
  type ChessMethod, type ChessState, type Side, type KoState,
} from './engine';
import { chessResultCredit } from './stats';
import { howChoices, sentHow } from './how';
import { listMoves, openingOf, boardResult } from './engine';
import { MovesPanel } from './MovesPanel';
import { chessFeed } from './gameFeed';
import { chessGameStats, phasesOf, type Phase } from './gameStats';
import { chessStatTotals } from './totals';
import { CommentaryFeed } from '../gcc/CommentaryFeed';
import { CompareTable } from '../gcc/CompareTable';
import { CHESS_META } from './meta';
import { chessMatchRecords } from './records';
import { useMask } from '../../core/disputeMask';
import type { NameOf } from '../../core/playerNames';
import type { Player } from '../../core/types';
import { chessUndoLabel } from './undoLabel';

/** IDs-only scoring (docs/privacy/ids-only-scoring.md): a 1-v-1 game names
 *  each side by its player, looked up for this viewer by id (players_view:
 *  the circle sees the full name, others initials, an open dispute "X");
 *  a side with no player falls back to the entry's name. */
const sideName = (who: NameOf, roster: Player[], team: string): string => {
  const p = roster[0];
  return p ? who(p.id, p.fullName) : team;
};

const half = (n: number) => String(n).replace('.5', '½').replace(/^0½$/, '½');

const TIME_CONTROL_LABEL: Record<string, string> = {
  classical: 'Classical', rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet', untimed: 'Untimed',
};

type Pick = 'white' | 'draw' | 'black' | 'dff';

/** SD-121 — the games of a knockout match so far: "Match: ½-½ · Rapid 1: 1-0 …" (home first). */
function KoGames({ ko, nameOf }: { ko: KoState; nameOf: (s: Side) => string }) {
  const phases = koPhases(ko.plan);
  const used = [...new Set(ko.games.map((g) => g.phase))];
  if (!used.length) return null;
  const h = (n: number) => String(n).replace('.5', '½').replace(/^0½$/, '½');
  return (
    <View style={{ gap: 2, alignItems: 'center' }}>
      {used.map((i) => {
        const p = koPoints(ko, i);
        const ph = phases[i];
        const label = ph.kind === 'main' ? (ph.games > 1 ? 'Mini-match' : 'Game') : ph.kind === 'armageddon' ? 'Armageddon' : `${KO_PHASE_LABEL[ph.kind]}${ph.n && ph.n > 1 ? ` ${ph.n}` : ''}`;
        return <Text key={i} style={textStyles.muted}>{label}: {nameOf('home')} {h(p.home)}-{h(p.away)} {nameOf('away')}</Text>;
      })}
    </View>
  );
}

const ScoringControls: SportPlugin<ChessState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [], knockout }) => {
  const s = state as ChessState;
  // SD-116: the result is picked the arbiter's way (1-0 / ½-½ / 0-1, White
  // first) and the colours are a draft until Record — a stray tap on the White
  // chips no longer overwrites the paired colour (config.white) in the log.
  const [pick, setPick] = useState<Pick | null>(null);
  const [whiteDraft, setWhiteDraft] = useState<Side | null>(null);
  const [unlockColour, setUnlockColour] = useState(false);
  const [method, setMethod] = useState<ChessMethod | null>(null);
  // batch 5: "How" is pre-set (no extra tap); "Not recorded" sends none; More… shows the rarer methods
  const [noHow, setNoHow] = useState(false);
  const [moreHow, setMoreHow] = useState(false);
  const [moves, setMoves] = useState('');
  // SD-117c — optional clock times left (typed "4:07", "1:05:30" or minutes)
  const [clockW, setClockW] = useState('');
  const [clockB, setClockB] = useState('');
  const [busy, setBusy] = useState(false);
  // cue batch 6 — ½-0 / 0-½ (the arbiter's decision / adjudication only), and the in-game arbiter row
  const [uneven, setUneven] = useState(false);
  const [arbOpen, setArbOpen] = useState(false);
  // Round 2 — a knockout game already recorded whose moves are being pasted
  // A person's name reads better than a team code ("AM") in a 1-v-1 game.
  const { nameOf: who } = useMask();
  const nameOf = (side: Side) => sideName(who, side === 'home' ? homeRoster : awayRoster, side === 'home' ? homeName : awayName);
  // Round 2 — mate / stalemate on the entered moves pre-selects the result
  // (and its method); the arbiter still confirms with Record. Taking the move
  // back clears a pre-selection the scorer didn't change.
  const onBoard = s.ended ? null : boardResult(s);
  const endKey = onBoard ? `${s.game?.san.length}:${onBoard.method}` : '';
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    if (onBoard) {
      if (pick == null || auto) { setPick(onBoard.pick); setMethod(onBoard.method); setAuto(true); }
    } else if (auto) { setPick(null); setMethod(null); setAuto(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endKey]);
  // cue batch 6 — Art. 7.5.5: a player's second illegal move loses; the loss is pre-selected (the arbiter confirms)
  const preset = arbiterPreset(s);
  const presetKey = preset ? `${preset.winner}:${illegalCount(s, 'home')}:${illegalCount(s, 'away')}` : '';
  useEffect(() => {
    // screen sweep: the pre-select overrides an earlier pick (the banner says so); the scorer can still change it after
    if (preset) { setPick(presetPick(preset, whiteDraft ?? s.white)); setMethod(preset.method); setNoHow(false); setAuto(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey]);

  if (s.ended && s.ko && s.ko.games.length > 1) {
    const st = koStatus(s.ko);
    const ph = koPhases(s.ko.plan)[st.phase];
    return (
      <View style={ctrl.box}>
        <Text style={ctrl.big}>{resultString(s)}</Text>
        <Text style={textStyles.body}>{nameOf(s.winner as Side)} goes through{ph && ph.kind !== 'main' ? ` · ${ph.kind === 'armageddon' ? 'Armageddon' : KO_PHASE_LABEL[ph.kind].toLowerCase()}` : ''}</Text>
        <KoGames ko={s.ko} nameOf={nameOf} />
      </View>
    );
  }
  if (s.ended) {
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <View style={ctrl.box}>
          <Text style={ctrl.big}>{resultString(s)}</Text>
          <Text style={textStyles.body}>
            {isDoubleForfeit(s.method) ? 'Neither player played — both lose' : s.winner === 'draw' ? 'Draw' : `${nameOf(s.winner as Side)} won`}{s.method ? ` · ${METHOD_LABEL[s.method]}` : ''}{s.moves ? ` · ${s.moves} moves` : ''}
          </Text>
          <Text style={textStyles.muted}>♔ {nameOf(s.white)} had White</Text>
          {s.clock && (s.clock.white != null || s.clock.black != null) ? (
            <Text style={textStyles.muted}>⏱ Time left · White {s.clock.white != null ? clockText(s.clock.white) : '–'} · Black {s.clock.black != null ? clockText(s.clock.black) : '–'}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  // SD-121 — a knockout: each result is one game of the match until it is decided.
  const koOn = !!s.ko || !!knockout;
  const koNow = s.ko ?? { plan: s.koPlan ?? DEFAULT_KO_PLAN, games: [] };
  const koAt = koOn ? koStatus(koNow) : null;
  const armageddon = !!koAt && koPhases(koNow.plan)[koAt.phase]?.kind === 'armageddon';
  const white: Side = whiteDraft ?? s.white;
  const black: Side = white === 'home' ? 'away' : 'home';
  const dff = pick === 'dff';
  const winner: Side | 'draw' | null = pick === 'draw' || dff ? 'draw' : pick === 'white' ? white : pick === 'black' ? black : null;
  const colourLocked = !unlockColour && !armageddon;
  const how = dff ? { common: [], more: [] } : howChoices(winner);
  // SD-67: a double forfeit carries its own method; batch 5: else the pick, or the default (resignation / agreement)
  const sentMethod: ChessMethod | undefined = sentHow({ winner, picked: method, none: noHow, dff });
  const methods = moreHow || (sentMethod && how.more.includes(sentMethod)) ? [...how.common, ...how.more] : how.common;
  const unevenOk = !koOn && !dff && winner != null && winner !== 'draw' && (sentMethod === 'arbiter' || sentMethod === 'adjudication');
  const unevenOn = uneven && unevenOk;
  const record = async () => {
    if (!winner || busy) return;
    const what = `${resultSentence(white, winner, nameOf(white), nameOf(black), sentMethod, unevenOn)}${koAt ? ` — ${koPhaseText(koNow, koAt.phase, koAt.game)}${armageddon && winner === 'draw' ? `: ${nameOf(black)} (Black) goes through` : ''}` : ''}`;
    setBusy(true);
    const ok = await askConfirm(confirmCopy('recordResult', { what }));
    setBusy(false);
    if (!ok) return;
    // Credit both players a game (+ the outcome) so it shows on their profiles.
    // SD-117c: a forfeit is no game played — it credits a forfeit win / loss
    // instead of `games` + `wins` / `losses` (FIDE: excluded from played games).
    // SD-119: each credit carries its player's side (the line's opponent is the other player).
    const credit = (side: Side): Attribution | undefined =>
      chessResultCredit(side, (side === 'home' ? homeRoster : awayRoster)[0], winner, sentMethod, dff, unevenOn);
    const w = dff ? null : parseClock(clockW); const b = dff ? null : parseClock(clockB);
    const clock = w != null || b != null ? { ...(w != null ? { white: w } : {}), ...(b != null ? { black: b } : {}) } : undefined;
    // the colour is committed only now, and only if it really changed
    if (white !== s.white) dispatch({ type: 'SET_WHITE', payload: { side: white } });
    dispatch({
      type: 'RESULT',
      side: winner === 'draw' ? undefined : winner,
      // Deep wave — the length from the move list when none was typed; `at` for the commentary
      // (round 2: in a knockout match s.game is the game in play's list)
      payload: { winner, method: sentMethod, moves: dff ? undefined : Number(moves) || listMoves(s.game) || undefined, ...(clock ? { clock } : {}), at: Date.now(), ...(unevenOn ? { uneven: true } : {}),
        // SD-121 — the first game of a knockout match carries the plan
        ...(knockout && !s.ko ? { ko: koNow.plan } : {}) },
      attribution: credit('home'),
      attribution2: credit('away'),
    });
    // SD-121 — a knockout goes on to its next game: a clean form
    setPick(null); setMethod(null); setNoHow(false); setMoreHow(false); setMoves(''); setClockW(''); setClockB(''); setWhiteDraft(null); setUnlockColour(false); setAuto(false); setUneven(false); setArbOpen(false);
  };
  const arbiter = (kind: ArbiterKind, side: Side) => { const a = arbiterAction(s, kind, side, Date.now()); if (a) dispatch(a as ScoreAction); };
  const choose = (p: Pick | null) => { setPick(p); setMethod(null); setNoHow(false); setAuto(false); };
  const tile = (p: Pick, score: string, caption: string, names: string) => (
    <TouchableOpacity key={p} onPress={() => choose(p)} activeOpacity={0.8} accessibilityRole="button"
      accessibilityLabel={`${score} ${caption} — ${names}`} accessibilityState={{ selected: pick === p }} aria-pressed={pick === p}
      style={[ctrl.tile, pick === p && ctrl.tileOn]}>
      <Text style={[ctrl.tileScore, pick === p && ctrl.tileOnText]}>{score}</Text>
      <Text style={[ctrl.tileCaption, pick === p && ctrl.tileOnText]}>{caption}</Text>
      <Text style={[ctrl.tileNames, pick === p && ctrl.tileOnText]} numberOfLines={2}>{names}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {/* Deep wave — the optional move list (Stats to track · Move list);
          round 2 — in a knockout match, one list per game (the game in play,
          or paste a game already recorded) */}
      {s.track?.moves ? <MovesPanel key={`now${s.ko?.games.length ?? 0}`} state={s} dispatch={dispatch} nameOf={nameOf} /> : null}
      {s.track?.moves ? <KoMovesPaste s={s} dispatch={dispatch} nameOf={nameOf} /> : null}
      {onBoard && auto ? (
        <Text style={ctrl.meta}>{onBoard.method === 'checkmate' ? '#️⃣ Checkmate' : '🤝 Stalemate'} on the board — {onBoard.pick === 'draw' ? '½-½' : onBoard.pick === 'white' ? '1-0' : '0-1'} is pre-selected. Check it, then record.</Text>
      ) : null}
      {/* cue batch 6 — in-game arbiter events (optional): an illegal move (time to the opponent; the second loses), a draw offer */}
      {arbOpen ? (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>Arbiter <Text style={ctrl.meta}>(during the game · optional)</Text></Text>
          {([white, black] as Side[]).map((sd) => (
            <View key={sd} style={ctrl.chips}>
              <SelectChip label={`Illegal move · ${nameOf(sd)}${illegalCount(s, sd) ? ` (${illegalCount(s, sd)})` : ''}`} active={false} onPress={() => arbiter('illegal', sd)}
                accessibilityLabel={`${nameOf(sd)} completed an illegal move: ${illegalSecs(s.timeControl) / 60} minute${illegalSecs(s.timeControl) === 60 ? '' : 's'} added for the opponent`} />
              <SelectChip label={`Draw offer · ${nameOf(sd)}`} active={false} onPress={() => arbiter('drawOffer', sd)} accessibilityLabel={`${nameOf(sd)} offered a draw`} />
            </View>
          ))}
          <Text style={ctrl.meta}>An illegal move gives the opponent {illegalSecs(s.timeControl) / 60} minute{illegalSecs(s.timeControl) === 60 ? '' : 's'}; the same player's second one loses (FIDE 7.5.5) and the result is pre-selected.</Text>
          <Text style={ctrl.link} accessibilityRole="button" onPress={() => setArbOpen(false)}>Hide</Text>
        </View>
      ) : !s.ended ? (
        <Text style={ctrl.link} accessibilityRole="button" onPress={() => setArbOpen(true)}>Arbiter: illegal move or draw offer{s.events?.length ? ` (${s.events.length} so far)` : ''}</Text>
      ) : null}
      {preset ? <Text style={ctrl.meta}>Second illegal move by {nameOf(preset.winner === 'home' ? 'away' : 'home')}: the loss is pre-selected. Check it, then record.</Text> : null}
      {koAt ? (
        <View style={ctrl.koBox}>
          <Text style={ctrl.label}>Knockout · {koPhaseText(koNow, koAt.phase, koAt.game)}</Text>
          <KoGames ko={koNow} nameOf={nameOf} />
          <Text style={ctrl.meta}>
            {armageddon
              ? 'One game. Colours by the arbiter or a draw of lots — set White below. A draw sends Black through.'
              : `A draw can’t end a knockout: if level after this stage, ${koAt.phase + 1 < koPhases(koNow.plan).length - 1 ? 'tie-break games follow' : 'an Armageddon game follows'}.`}
          </Text>
        </View>
      ) : null}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>White pieces: {nameOf(white)}</Text>
        {colourLocked ? (
          <Text style={textStyles.muted} accessibilityRole="button" onPress={() => setUnlockColour(true)}>
            ♚ {nameOf(black)} has Black · <Text style={ctrl.link}>Colours wrong? Change…</Text>
          </Text>
        ) : (
          <>
            <View style={ctrl.chips}>
              <SelectChip label={nameOf('home')} active={white === 'home'} onPress={() => setWhiteDraft('home')} />
              <SelectChip label={nameOf('away')} active={white === 'away'} onPress={() => setWhiteDraft('away')} />
            </View>
            <Text style={ctrl.meta}>{white !== s.white ? 'Saved with the result — this changes the paired colour.' : 'Saved with the result.'}</Text>
          </>
        )}
      </View>
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Result <Text style={ctrl.meta}>(White first)</Text></Text>
        <View style={ctrl.tiles}>
          {tile('white', '1-0', 'White wins', `${nameOf(white)} beat ${nameOf(black)}`)}
          {tile('draw', '½-½', 'Draw', armageddon ? `Black (${nameOf(black)}) goes through` : `${nameOf(white)} · ${nameOf(black)}`)}
          {tile('black', '0-1', 'Black wins', `${nameOf(black)} beat ${nameOf(white)}`)}
        </View>
        {/* SD-67 — neither player turned up (FIDE: 0-0, two unplayed losses) */}
        {!koOn ? (
          <View style={ctrl.chips}>
            <SelectChip label="0-0 Double forfeit" active={dff} onPress={() => choose(dff ? null : 'dff')} />
          </View>
        ) : null}
        {dff && <Text style={ctrl.meta}>Neither player played: 0 points each, no game credited. Both count as losses.</Text>}
      </View>
      {methods.length > 0 && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>How <Text style={ctrl.meta}>(pre-set · tap to change)</Text></Text>
          <View style={ctrl.chips}>
            {methods.map((m) => <SelectChip key={m} label={METHOD_LABEL[m]} active={sentMethod === m} onPress={() => { setMethod(m); setNoHow(false); }} />)}
            {!moreHow && how.more.length > 0 && !(sentMethod && how.more.includes(sentMethod)) ? <SelectChip label="More…" active={false} onPress={() => setMoreHow(true)} /> : null}
            <SelectChip label="Not recorded" active={noHow} onPress={() => { setNoHow(!noHow); if (!noHow) setMethod(null); }} />
          </View>
          <TextInput
            style={ctrl.input}
            value={moves}
            onChangeText={(v) => setMoves(v.replace(/[^0-9]/g, ''))}
            placeholder="Moves (optional)"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            accessibilityLabel="Number of moves"
          />
          {/* SD-117c — optional clock times left at the end */}
          {!isForfeit(sentMethod) && (
            <>
              <Text style={ctrl.meta}>Time left on the clocks (optional · 4:07, 1:05:30 or minutes)</Text>
              <View style={ctrl.tiles}>
                {([['White', clockW, setClockW], ['Black', clockB, setClockB]] as const).map(([c, v, set]) => (
                  <TextInput key={c} style={[ctrl.input, { flex: 1 }, v && parseClock(v) == null ? ctrl.bad : null]} value={v}
                    onChangeText={(t) => set(t.replace(/[^0-9:m]/gi, ''))}
                    placeholder={`${c} ⏱`} placeholderTextColor={theme.colors.textMuted}
                    accessibilityLabel={`${c}'s time left`} />
                ))}
              </View>
            </>
          )}
          {isForfeit(sentMethod) && <Text style={ctrl.meta}>A forfeit counts in the table, but no game is credited as played.</Text>}
          {/* cue batch 6 — Art. 11 / 12 penalties: ½ to one player, 0 to the other */}
          {unevenOk ? (
            <View style={ctrl.chips}>
              <SelectChip label={`${scoreFor(white, winner!, sentMethod, true)} instead (uneven score)`} active={unevenOn} onPress={() => setUneven(!uneven)}
                accessibilityLabel={`Record ${scoreFor(white, winner!, sentMethod, true)}: half a point to ${nameOf(winner as Side)}, none to the other`} />
            </View>
          ) : null}
        </View>
      )}
      <Button variant="primary" label={winner ? `✓ Record ${scoreFor(white, winner, sentMethod, unevenOn)}…` : '✓ Record result'} onPress={() => void record()} disabled={!winner || busy} />
    </View>
  );
};

export const chessPlugin: SportPlugin<ChessState> = {
  ...CHESS_META,
  matchRecords: chessMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => {
    if (!s.ended || !s.winner) return null;
    const p = points(s);
    return { winner: s.winner, home: p.home, away: p.away };
  },
  summary: (s) => {
    const p = points(s);
    return {
      homeScore: s.ended || s.ko?.games.length ? half(p.home) : '',
      awayScore: s.ended || s.ko?.games.length ? half(p.away) : '',
      statusLine: s.ko && (s.ko.games.length > 1 || !s.ended)
        ? s.ended
          ? `${resultString(s)} · ${s.winner === 'home' ? 'Home' : 'Away'} through${(() => { const k = koPhases(s.ko!.plan)[koStatus(s.ko!).phase]?.kind; return k && k !== 'main' ? ` (${k === 'armageddon' ? 'Armageddon' : KO_PHASE_LABEL[k].toLowerCase()})` : ''; })()}`
          : `${s.ko.games.length ? `${resultString(s)} · ` : ''}${(() => { const at = koStatus(s.ko!); return koPhaseText(s.ko!, at.phase, at.game); })()}`
        : s.ended
        ? `${resultString(s)}${s.method ? ` · ${METHOD_LABEL[s.method]}` : ''}`
        : `${TIME_CONTROL_LABEL[s.timeControl] ?? s.timeControl}${timeControlText(s) ? ` ${timeControlText(s)}` : ''} · in play`,
      // SD-117c — the clock times left, when recorded
      detailLine: `${s.white === 'home' ? 'Home' : 'Away'} has White${s.clock && (s.clock.white != null || s.clock.black != null) ? ` · ⏱ White ${s.clock.white != null ? clockText(s.clock.white) : '–'} · Black ${s.clock.black != null ? clockText(s.clock.black) : '–'}` : ''}`,
    };
  },
  ScoringControls,
  // SD-67 — the scoreboard names who has White ("♔ Anand has White")
  Scoreboard: ChessScoreboard,
  // Deep wave — commentary (move by move / the result) and the game stats
  matchTabs: { Commentary: ChessCommentary, Stats: ChessStats, AfterMatch: ChessAfterMatch },
  // Deep wave — Undo names the move(s) it takes back ("Undo move Nf3");
  // undo labels batch — and the result, arbiter, clock and colour steps
  undoLabel: chessUndoLabel,
  // Deep wave — the game-record figures from the move list (partial: the
  // result credit stays live)
  statTotals: chessStatTotals,
  statTotalsNeedsPlayers: true,
  statTotalsPartial: true,
  liveSettings: {
    title: '⚙️ Stats to track',
    hint: 'Optional. Recording the result stays the same; the move list can also be pasted after the game.',
    mode: 'event',
    actionType: 'SET_TRACK',
    fields: [
      { key: 'trackMoves', label: 'Move list (SAN / PGN)', type: 'toggle', default: false, group: 'Stats to track', hint: 'Type each move as it is played (checked for legality) — commentary, opening, game stats' },
      { key: 'trackClock', label: 'Clock after each move', type: 'toggle', default: false, group: 'Stats to track', hint: 'With the move list: the time left after each move → time used per move' },
    ],
    read: (st) => ({ trackMoves: !!st.track?.moves, trackClock: !!st.track?.clock }),
    defaults: { trackMoves: false, trackClock: false },
  },
};

/** Match tabs (2026-10-22): the commentary (moves newest first, or the
 *  result) on Commentary; the opening and the game stats panel (White vs
 *  Black; whole game or a phase) on Stats; attaching the moves after the game
 *  on Scoring (scorers). */
type TabProps = Parameters<NonNullable<SportPlugin<ChessState>['LiveExtras']>>[0];
/** Each side's player by id for this viewer (a hook: the dispute mask / name lookup). */
function useChessNames({ homeName, awayName, homeRoster = [], awayRoster = [] }: TabProps): (side: Side) => string {
  const { nameOf: who } = useMask();
  return (side: Side) => sideName(who, side === 'home' ? homeRoster : awayRoster, side === 'home' ? homeName : awayName);
}

function ChessCommentary(p: TabProps) {
  const s = p.state as ChessState;
  const nameOf = useChessNames(p);
  return (
    <CommentaryFeed title={null} groups={chessFeed(s, { home: nameOf('home'), away: nameOf('away') })}
      homeColor={p.homeColor} awayColor={p.awayColor} empty="No moves yet." />
  );
}

function ChessStats(p: TabProps) {
  const s = p.state as ChessState;
  const { homeColor, awayColor } = p;
  const [phase, setPhase] = useState<Phase | 'all'>('all');
  const nameOf = useChessNames(p);
  const black: Side = s.white === 'home' ? 'away' : 'home';
  const hasMoves = !!s.game?.san.length && !s.ko;
  const op = openingOf(s);
  const phases = phasesOf(s);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {op ? <Text style={textStyles.muted}>📖 {op.eco} · {op.name}</Text> : null}
      {hasMoves ? (
        <CompareTable title={null} homeName={`♔ ${nameOf(s.white)}`} awayName={`♚ ${nameOf(black)}`}
          homeColor={s.white === 'home' ? homeColor : awayColor} awayColor={s.white === 'home' ? awayColor : homeColor}
          categories={chessGameStats(s, phase)} unit={phase} onUnit={(k) => setPhase(k as Phase | 'all')}
          units={[{ key: 'all', label: 'Game' }, ...phases.map((ph) => ({ key: ph, label: ph[0].toUpperCase() + ph.slice(1) }))]}
          footnote="Opening = the first 10 moves; the endgame starts once both sides have 13 points of pieces or fewer besides pawns." />
      ) : (
        <Text style={textStyles.muted}>Game stats come from the move list — switch it on under ⚙️ Stats to track, or paste the moves (PGN) after the game.</Text>
      )}
    </View>
  );
}

/** Round 2 — a knockout match: paste the moves (PGN) of a game already
 *  played, one list per game (MOVES / OPENING `koGame`). A forfeited game has
 *  no moves to paste. */
function KoMovesPaste({ s, dispatch, nameOf }: { s: ChessState; dispatch: (a: { type: string; payload?: Record<string, unknown> }) => void; nameOf: (side: 'home' | 'away') => string }) {
  const [pick, setPick] = useState<number | null>(null);
  const games = (s.ko?.games ?? []).map((g, k) => ({ g, k })).filter(({ g }) => !isForfeit(g.method) && !isDoubleForfeit(g.method));
  if (!games.length) return null;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={ctrl.chips}>
        <Text style={ctrl.meta}>Moves of a game already played:</Text>
        {games.map(({ g, k }) => (
          <SelectChip key={k} label={`Game ${k + 1}${g.game?.san.length ? ' ✓' : ''}`} active={pick === k} onPress={() => setPick(pick === k ? null : k)} />
        ))}
      </View>
      {pick != null && s.ko?.games[pick] ? <MovesPanel key={`ko${pick}`} state={s} dispatch={dispatch} nameOf={nameOf} koGame={pick} after /> : null}
    </View>
  );
}

/** Scoring tab, after the game: a scorer can still attach the moves (PGN)
 *  and the opening — in a knockout match, each game's. */
function ChessAfterMatch(p: TabProps) {
  const s = p.state as ChessState;
  const nameOf = useChessNames(p);
  if (!s.ended || !p.canScore || !p.dispatch) return null;
  if (s.ko) return <KoMovesPaste s={s} dispatch={p.dispatch} nameOf={nameOf} />;
  if (isDoubleForfeit(s.method) || isForfeit(s.method)) return null;
  return <MovesPanel state={s} dispatch={p.dispatch} nameOf={nameOf} after />;
}

/** "♔ {name} has White" — the generic summary only knows home / away. */
export function whiteLine(s: ChessState, homeName: string, awayName: string): string {
  return `♔ ${s.white === 'home' ? homeName : awayName} has White`;
}

function ChessScoreboard({ state, homeName, awayName, homeColor, awayColor, live }: Parameters<NonNullable<SportPlugin<ChessState>['Scoreboard']>>[0]) {
  const s = state as ChessState;
  const sum = chessPlugin.summary(s);
  const rest = (sum.detailLine ?? '').replace(/^(Home|Away) has White/, '');
  return (
    <Scoreboard summary={{ ...sum, statusLine: sum.statusLine.replace(/ · (Home|Away) through/, (_m, w) => ` · ${w === 'Home' ? homeName : awayName} through`), detailLine: `${whiteLine(s, homeName, awayName)}${rest}` }}
      homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} />
  );
}

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '400' },
  link: { color: theme.colors.primary, fontWeight: '700' },
  tiles: { flexDirection: 'row', gap: theme.spacing(2) },
  tile: {
    flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 2, padding: theme.spacing(2),
    borderRadius: theme.radius.md, borderWidth: 2, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  tileOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '22' },
  tileOnText: { color: theme.colors.text },
  tileScore: { color: theme.colors.text, fontSize: 22, fontWeight: '900' },
  tileCaption: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  tileNames: { color: theme.colors.textMuted, fontSize: 11, textAlign: 'center' },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  koBox: { gap: theme.spacing(1), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  box: { gap: theme.spacing(1), alignItems: 'center', padding: theme.spacing(4), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md },
  big: { color: theme.colors.text, fontSize: 32, fontWeight: '800' },
  bad: { borderColor: theme.colors.danger },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.text,
    borderRadius: theme.radius.md, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), fontSize: theme.font.body,
  },
});
