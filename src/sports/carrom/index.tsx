/**
 * Carrom plugin — archetype: set-game-point (boards → games → match). ICF rules:
 * the board winner scores the opponent's coins left (+3 for a covered Queen while
 * under 22); game to 25 or after 8 boards; best of 3 games (or a single game).
 * Scoring a board = pick the winner, tap coins left, toggle the Queen.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import { RowAction, confirmRemove } from '../TimelineControls';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { SetLineBoard } from '../SetLineBoard';
import { MatchBoxScore } from '../../components/BoxScore';
import { carromBox } from '../boxSources';
import {
  init, reducer, result, boardValue, boardCloses, boardCredit, creditedPoints, summary, scoreLine, lineScore, standingsUnits,
  nextBreaker, nextBreakerPlayer, boardBreakers, breakerPlayers, slamFor, boardInputs, boardCorrection, FOUL_TYPES, FOUL_CHIPS, FOUL_LABEL,
  type BoardDetail, type BoardInput, type CarromCredit, type CarromState, type EndFoul, type FoulType, type PlayerFouls, type QueenBy, type Side, type Slam,
} from './engine';
import { carromFeed } from './feed';
import { carromGames, carromMatchStats } from './matchStats';
import { CommentaryFeed } from '../gcc/CommentaryFeed';
import { CompareTable } from '../gcc/CompareTable';
import { carromStatTotals, creditedPlayers } from './totals';
import { ScoreSheet } from './ScoreSheet';
import { carromVoice, carromVoiceEnds } from '../voiceParsers';
import { CARROM_META } from './meta';
import { carromMatchRecords } from './records';
import { useMask } from '../../core/disputeMask';
import { withRosters, whoName } from '../racketNames';
import type { NameOf } from '../../core/playerNames';
import { IconText } from '../../components/Icon';

/** IDs-only scoring (docs/privacy/ids-only-scoring.md): the match state and
 *  events keep player ids only; a player is named for this viewer by id
 *  (players_view: the circle sees full names, others initials, an open
 *  dispute "X"). A singles side reads as its player, else the entry's name. */
const sideName = (who: NameOf, roster: Player[], team: string): string =>
  (roster.length === 1 ? who(roster[0].id, roster[0].fullName) : team);
/** A credited player's name (a breaker, …) — undefined when nobody resolves it. */
const creditName = (who: NameOf, c: CarromCredit | null | undefined): string | undefined =>
  (c ? whoName(who, c.id, c.name) : undefined);
/** The viewer's lookup, falling back to the match's rosters. */
function useCarromNames(homeRoster: Player[], awayRoster: Player[]): NameOf {
  const { nameOf } = useMask();
  return withRosters(nameOf, homeRoster, awayRoster);
}

const ScoringControls: SportPlugin<CarromState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const s = state as CarromState;
  const perSide = s.perSide ?? 1;
  // Singles: a person's name reads better than a team code ("AM").
  const pname = useCarromNames(homeRoster, awayRoster);
  const nameOf = (side: Side) => sideName(pname, side === 'home' ? homeRoster : awayRoster, side === 'home' ? homeName : awayName);
  const [winner, setWinner] = useState<Side | null>(null);
  const [coins, setCoins] = useState<number | null>(null); // SD-116: no default — the scorer picks
  // SD-117c — the three-way Queen chip (optional): winner / loser / not covered
  const [queenBy, setQueenBy] = useState<QueenBy | null>(null);
  const queen = queenBy === 'winner';
  const [slam, setSlam] = useState<Slam | null>(null);
  // SD-68 (CR-07) — a penalty board: 3 to the side picked, not a board won
  const [penalty, setPenalty] = useState(false);
  const [fixToss, setFixToss] = useState(false);
  // SD-134 — doubles: who breaks first for each side (A1 → B1 → A2 → B2)
  const [firstOf, setFirstOf] = useState<Record<Side, string | null>>({ home: null, away: null });
  // "Played by" (a roster bigger than the side) — kept from board to board
  const [picked, setPicked] = useState<Record<Side, string[]>>({ home: [], away: [] });
  // Deep wave — the optional "Stats to track" rows (fouls by type + dues, coins
  // on the break, missed Queen covers); cleared after each board
  const [fouls, setFouls] = useState<Record<Side, Partial<Record<FoulType, number>>>>({ home: {}, away: {} });
  const [dues, setDues] = useState<Record<Side, number>>({ home: 0, away: 0 });
  const [brk, setBrk] = useState<number | null>(null);
  const [qMiss, setQMiss] = useState<Record<Side, number>>({ home: 0, away: 0 });
  // Round 2 — doubles: who is fouling (the "who" chip, kept until changed)
  // and each player's own fouls / dues on this board
  const [who, setWho] = useState<Record<Side, string | null>>({ home: null, away: null });
  const [whoLog, setWhoLog] = useState<Record<Side, Record<string, PlayerFouls>>>({ home: {}, away: {} });
  // Round 2 — ICF r.102–112: the board-ending stroke's foul (with foulScore)
  const [endFoul, setEndFoul] = useState<EndFoul>({});
  const [endOpen, setEndOpen] = useState(false);
  if (s.ended) return <Text style={textStyles.muted}>Match over.</Text>;
  const track = s.track ?? {};
  // SD-117c (CR-04) — who breaks this board (toss, then alternating)
  const breaker = nextBreaker(s);
  const breakerP = nextBreakerPlayer(s);
  const breakerName = creditName(pname, breakerP);
  // SD-134 — a doubles break order needs both players of a side
  const pairOf = (side: Side) => creditedPlayers(side === 'home' ? homeRoster : awayRoster, 2, picked[side]);
  const doublesOrder = perSide === 2 && pairOf('home').length === 2 && pairOf('away').length === 2;
  const derivedSlam = winner ? slamFor(winner, breaker) : null;

  const roster = winner ? (winner === 'home' ? homeRoster : awayRoster) : [];
  const players = winner ? creditedPlayers(roster, perSide, picked[winner]) : [];
  // SD-37: the game score counts at most to 25, and so do the players' points
  const ready = penalty || coins != null;
  // Round 2 — every score rule in one place (ICF foul penalties with foulScore)
  const ef: EndFoul | undefined = s.foulScore && (endFoul.striker || endFoul.improper) ? endFoul : undefined;
  const value = winner && ready ? boardValue(s, s.current[winner], { coins: coins ?? 0, queen, penalty, endFoul: ef }) : 0;
  const penaltyValue = winner ? boardValue(s, s.current[winner], { penalty: true }) : 0;
  const credit = winner && ready ? Math.min(value, Math.max(0, s.target - s.current[winner])) : 0;
  // SD-116: say on the button when this board closes the game / the match
  const closes = winner && ready ? boardCloses(s, winner, coins ?? 0, queen, penalty, ef) : null;
  const loser: Side | null = winner ? (winner === 'home' ? 'away' : 'home') : null;
  const queenCounts = winner ? s.current[winner] < s.queenCutoff : true;
  const togglePick = (side: Side, id: string) => setPicked((cur) => {
    const now = creditedPlayers(roster, perSide, cur[side]).map((p) => p.id);
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id].slice(-perSide);
    return { ...cur, [side]: next.length ? next : now };
  });
  // Deep wave — the tracked detail of this board (a part only when tracked;
  // fouls / dues / missed covers default to none, coins on the break to "not
  // recorded" until a chip is tapped)
  const detail = (): BoardDetail | undefined => {
    if (penalty) return undefined;
    // Round 2 — the split foul chips (`split`) and, in doubles, who fouled
    const det: BoardDetail = {
      ...(track.fouls ? { fouls: { home: fouls.home, away: fouls.away }, dues: { home: dues.home, away: dues.away }, split: true as const,
        ...(perSide === 2 ? { who: { home: whoLog.home, away: whoLog.away } } : {}) } : {}),
      ...(track.brk && breaker && brk != null ? { brk } : {}),
      ...(track.qMiss ? { qMiss: { home: qMiss.home, away: qMiss.away } } : {}),
    };
    return Object.keys(det).length ? det : undefined;
  };
  const record = () => {
    if (!winner || !ready) return;
    // SD-68 — a penalty board credits its points, never a board won / Queen;
    // IDs-only scoring: by player id only (match events are public)
    const attr = (p: Player) => boardCredit(p, credit, { penalty, queen });
    const det = detail();
    dispatch({
      type: 'BOARD', side: winner,
      // Deep wave — `at` (the scorer's clock) for the commentary; `det` when tracked
      payload: penalty ? { coins: 0, queen: false, penalty: true, at: Date.now(), ...(ef ? { endFoul: ef } : {}) }
        : { coins, queen, ...(queenBy ? { queenBy } : {}), ...(slam ? { slam } : {}), ...(det ? { det } : {}), at: Date.now(), ...(ef ? { endFoul: ef } : {}) },
      // SD-37: a board is the side's — both doubles partners are credited
      attribution: players[0] ? attr(players[0]) : undefined,
      attribution2: players[1] ? attr(players[1]) : undefined,
    });
    setWinner(null); setCoins(null); setQueenBy(null); setSlam(null); setPenalty(false);
    setFouls({ home: {}, away: {} }); setDues({ home: 0, away: 0 }); setBrk(null); setQMiss({ home: 0, away: 0 });
    setWhoLog({ home: {}, away: {} }); setEndFoul({}); setEndOpen(false);
  };
  // Round 2 — doubles: a foul / due also goes to the player picked with the who chip
  const logWho = (sd: Side, f: (p: PlayerFouls) => PlayerFouls) => {
    const id = perSide === 2 ? who[sd] : null;
    if (!id) return;
    setWhoLog((w) => ({ ...w, [sd]: { ...w[sd], [id]: f(w[sd][id] ?? {}) } }));
  };
  const addFoul = (sd: Side, t: FoulType, by: 1 | -1 = 1) => {
    if (by < 0 && !(fouls[sd][t] ?? 0)) return;
    setFouls((f) => ({ ...f, [sd]: { ...f[sd], [t]: Math.max(0, Math.min(20, (f[sd][t] ?? 0) + by)) } }));
    if (by > 0) logWho(sd, (p) => ({ ...p, fouls: { ...p.fouls, [t]: Math.min(20, (p.fouls?.[t] ?? 0) + 1) } }));
  };
  const addDue = (sd: Side) => {
    setDues((d) => ({ ...d, [sd]: Math.min(20, d[sd] + 1) }));
    logWho(sd, (p) => ({ ...p, dues: Math.min(20, (p.dues ?? 0) + 1) }));
  };
  // Round 2 — the board-ending foul; the Striker pocketed is also a striker
  // foul in the foul log when fouls are tracked (one tap, not two)
  const toggleEnd = (k: keyof EndFoul) => {
    const on = !endFoul[k];
    setEndFoul((e) => { const n = { ...e }; if (on) n[k] = true; else delete n[k]; return n; });
    if (k === 'striker' && track.fouls && loser) addFoul(loser, 'striker', on ? 1 : -1);
  };
  // a different board winner: the slam and the board-ending foul (the old
  // loser's) are cleared — with its auto-logged striker foul
  const pickWinner = (sd: Side) => {
    if (winner !== sd) {
      setSlam(null);
      if (endFoul.striker && track.fouls && loser) addFoul(loser, 'striker', -1);
      setEndFoul({}); setEndOpen(false);
    }
    setWinner(sd);
  };
  const foulCount = (sd: Side) => FOUL_TYPES.reduce((n, t) => n + (fouls[sd][t] ?? 0), 0) + dues[sd];
  const orderOf = (side: Side) => {
    const pair = pairOf(side);
    const first = pair.find((p) => p.id === firstOf[side]) ?? pair.find((p) => p.id === s.breakOrder?.[side]?.[0]?.id) ?? pair[0];
    // IDs-only scoring: the break order keeps the players' ids only
    return [first, ...pair.filter((p) => p.id !== first.id)].map((p) => ({ id: p.id }));
  };
  const toss = (side: Side) => {
    dispatch({ type: 'FIRST_BREAK', payload: { side, ...(doublesOrder ? { order: { home: orderOf('home'), away: orderOf('away') } } : {}) } });
    setFixToss(false);
  };
  const tossPicker = (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={ctrl.label}>{s.boards.length ? 'Who broke the first board?' : 'Who breaks first?'} <Text style={ctrl.meta}>(the toss · then it alternates)</Text></Text>
      {/* SD-134 — doubles: each side's first breaker; partners then alternate */}
      {doublesOrder && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={ctrl.meta}>Doubles break order — pick who breaks first for each side (then A1 → B1 → A2 → B2), then tap who won the toss</Text>
          {(['home', 'away'] as Side[]).map((sd) => (
            <View key={sd} style={ctrl.chips}>
              {pairOf(sd).map((p) => (
                <SelectChip key={p.id} label={`${p.fullName}`} active={orderOf(sd)[0].id === p.id} onPress={() => setFirstOf((cur) => ({ ...cur, [sd]: p.id }))} />
              ))}
            </View>
          ))}
        </View>
      )}
      <View style={ctrl.row}>
        <Button label={nameOf('home')} variant={s.firstBreak === 'home' ? 'home' : 'ghost'} style={ctrl.flex} onPress={() => toss('home')} />
        <Button label={nameOf('away')} variant={s.firstBreak === 'away' ? 'away' : 'ghost'} style={ctrl.flex} onPress={() => toss('away')} />
      </View>
      {s.boards.length > 0 && <Text style={ctrl.meta}>Only who broke changes; the score stays.</Text>}
    </View>
  );

  return (
    <View style={{ gap: theme.spacing(4) }}>
      <Text style={ctrl.meta}>Game {s.games.length + 1} · board {s.boardsInGame + 1}{s.boardsInGame >= s.maxBoards ? ' (tie-break)' : ` of ${s.maxBoards}`} · to {s.target}</Text>
      {/* SD-117c (CR-04) — the toss before board 1, then "{name} to break" */}
      {(!s.firstBreak && s.boards.length === 0) || fixToss ? tossPicker : breaker ? (
        <Text style={ctrl.breakLine}>
          ⚪ {breakerName ? `${breakerName} (${nameOf(breaker)})` : nameOf(breaker)} to break{'  '}<Text style={ctrl.link} accessibilityRole="button" onPress={() => setFixToss(true)}>Fix the toss</Text>
        </Text>
      ) : (
        <Text style={ctrl.link} accessibilityRole="button" onPress={() => setFixToss(true)}>Record who broke the first board</Text>
      )}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>Board won by</Text>
        <View style={ctrl.row}>
          <Button label={nameOf('home')} variant={winner === 'home' ? 'home' : 'ghost'} style={ctrl.flex} onPress={() => pickWinner('home')} />
          <Button label={nameOf('away')} variant={winner === 'away' ? 'away' : 'ghost'} style={ctrl.flex} onPress={() => pickWinner('away')} />
        </View>
      </View>
      {winner && (
        <>
          {roster.length > perSide && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={ctrl.label}>Played by</Text>
              <View style={ctrl.chips}>
                {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={players.some((x) => x.id === p.id)} onPress={() => togglePick(winner, p.id)} />)}
              </View>
            </View>
          )}
          {/* SD-68 (CR-07) — a penalty board instead of a played-out one */}
          <View style={ctrl.chips}>
            <SelectChip label="Board played out" active={!penalty} onPress={() => setPenalty(false)} />
            <SelectChip label={`⚠️ Penalty board · +${penaltyValue} to ${nameOf(winner)}`} active={penalty} onPress={() => { setPenalty(true); setSlam(null); setQueenBy(null); }} />
          </View>
          {penalty ? (
            <Text style={ctrl.meta}>The opponent was penalised: {nameOf(winner)} get {penaltyValue} point{penaltyValue === 1 ? '' : 's'}{s.foulScore && penaltyValue < 3 ? ' (1, not 3, at 22 or more — ICF)' : ''}. It is not counted as a board won, a Queen or a slam.</Text>
          ) : (<>
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>Opponent's coins left{coins == null ? <Text style={ctrl.meta}> · tap one</Text> : null}</Text>
            <View style={ctrl.chips}>
              {Array.from({ length: 10 }, (_, n) => <SelectChip key={n} label={String(n)} active={coins === n} onPress={() => setCoins(n)} />)}
            </View>
            {/* Round 2 — ICF r.53 / r.55: a foul's penalty coin is back on the board (count it); a due still owed is written off */}
            {s.foulScore ? <Text style={ctrl.meta}>Count the penalty coins put back on the board. A due still owed when the board ends is written off (ICF).</Text> : null}
          </View>
          {/* SD-117c — who covered the Queen: winner (+3 under 22) / loser (no points) / nobody */}
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>👑 Queen covered by <Text style={ctrl.meta}>(optional)</Text></Text>
            <View style={ctrl.chips}>
              <SelectChip label={`Winner${queenCounts ? ' (+3)' : ' (no points at 22+)'}`} active={queenBy === 'winner'} onPress={() => setQueenBy(queenBy === 'winner' ? null : 'winner')} />
              <SelectChip label="Loser (no points)" active={queenBy === 'loser'} onPress={() => setQueenBy(queenBy === 'loser' ? null : 'loser')} />
              <SelectChip label="Not covered" active={queenBy === 'none'} onPress={() => setQueenBy(queenBy === 'none' ? null : 'none')} />
            </View>
          </View>
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>Slam? <Text style={ctrl.meta}>(finished in the first turn · optional)</Text></Text>
            <View style={ctrl.chips}>
              {derivedSlam ? (
                // SD-117c — the breaker is known, so White / Black follows from the winner
                <SelectChip label={`${derivedSlam === 'white' ? '⚪ White' : '⚫ Black'} slam · ${derivedSlam === 'white' ? 'broke' : "didn't break"}`} active={slam === derivedSlam} onPress={() => setSlam(slam ? null : derivedSlam)} />
              ) : (
                <>
                  <SelectChip label="⚪ White slam · broke" active={slam === 'white'} onPress={() => setSlam(slam === 'white' ? null : 'white')} />
                  <SelectChip label="⚫ Black slam · didn't break" active={slam === 'black'} onPress={() => setSlam(slam === 'black' ? null : 'black')} />
                </>
              )}
            </View>
          </View>
          {/* Deep wave — "Stats to track" rows (only when switched on) */}
          {track.brk ? (
            breaker ? (
              <View style={{ gap: theme.spacing(2) }}>
                <Text style={ctrl.label}>Break: coins {breakerName ?? nameOf(breaker)} pocketed <Text style={ctrl.meta}>(optional)</Text></Text>
                <View style={ctrl.chips}>
                  {[0, 1, 2, 3, 4, 5].map((n) => <SelectChip key={n} label={n === 5 ? '5+' : String(n)} active={brk === n} onPress={() => setBrk(brk === n ? null : n)} />)}
                </View>
              </View>
            ) : <Text style={ctrl.meta}>Record the toss to log coins on the break.</Text>
          ) : null}
          {track.fouls ? (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={ctrl.label}>Fouls this board <Text style={ctrl.meta}>(tap each foul · none = no fouls)</Text></Text>
              {(['home', 'away'] as Side[]).map((sd) => {
                // Round 2 — doubles: pick who fouled first (careers carry it)
                const pair = perSide === 2 ? pairOf(sd) : [];
                return (
                  <View key={sd} style={ctrl.chips}>
                    <Text style={[ctrl.meta, ctrl.foulName]} numberOfLines={1}>{nameOf(sd)}</Text>
                    {pair.length === 2 ? (
                      <View style={[ctrl.chips, ctrl.whoRow]}>
                        <Text style={ctrl.meta}>Who:</Text>
                        {pair.map((p) => {
                          const mine = whoLog[sd][p.id];
                          const n = FOUL_TYPES.reduce((t, k) => t + (mine?.fouls?.[k] ?? 0), 0) + (mine?.dues ?? 0);
                          return <SelectChip key={p.id} label={`${p.fullName.split(' ')[0]}${n ? ` ×${n}` : ''}`} active={who[sd] === p.id}
                            onPress={() => setWho((w) => ({ ...w, [sd]: w[sd] === p.id ? null : p.id }))} accessibilityLabel={`${p.fullName} committed the next foul`} />;
                        })}
                      </View>
                    ) : null}
                    {FOUL_CHIPS.map((t) => {
                      const n = fouls[sd][t] ?? 0;
                      return <SelectChip key={t} label={`${FOUL_LABEL[t]}${n ? ` ×${n}` : ''}`} active={n > 0} onPress={() => addFoul(sd, t)} accessibilityLabel={`${FOUL_LABEL[t]} foul by ${nameOf(sd)}, now ${n}`} />;
                    })}
                    <SelectChip label={`Due${dues[sd] ? ` ×${dues[sd]}` : ''}`} active={dues[sd] > 0} onPress={() => addDue(sd)} accessibilityLabel={`A due owed by ${nameOf(sd)}, now ${dues[sd]}`} />
                    {foulCount(sd) > 0 ? <SelectChip label="Clear" active={false} onPress={() => { setFouls((f) => ({ ...f, [sd]: {} })); setDues((d) => ({ ...d, [sd]: 0 })); setWhoLog((w) => ({ ...w, [sd]: {} })); }} accessibilityLabel={`Clear ${nameOf(sd)}'s fouls`} /> : null}
                  </View>
                );
              })}
              {perSide === 2 ? <Text style={ctrl.meta}>Doubles: tap who fouled before the foul so it goes on their own record (a foul without a who stays the pair's).</Text> : null}
            </View>
          ) : null}
          {track.qMiss ? (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={ctrl.label}>👑 Queen pocketed, cover missed <Text style={ctrl.meta}>(tap per miss)</Text></Text>
              <View style={ctrl.chips}>
                {(['home', 'away'] as Side[]).map((sd) => (
                  <SelectChip key={sd} label={`${nameOf(sd)}${qMiss[sd] ? ` ×${qMiss[sd]}` : ''}`} active={qMiss[sd] > 0} onPress={() => setQMiss((q) => ({ ...q, [sd]: Math.min(9, q[sd] + 1) }))} accessibilityLabel={`${nameOf(sd)} missed the Queen cover, now ${qMiss[sd]}`} />
                ))}
                {qMiss.home + qMiss.away > 0 ? <SelectChip label="Clear" active={false} onPress={() => setQMiss({ home: 0, away: 0 })} /> : null}
              </View>
            </View>
          ) : null}
          </>)}
          {/* Round 2 — ICF r.102–112: the board ended on the loser's foul
              (the Striker pocketed / an improper stroke) — extra points, if claimed */}
          {s.foulScore && loser ? (endOpen || endFoul.striker || endFoul.improper ? (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={ctrl.label}>Board ended on {nameOf(loser)}'s foul <Text style={ctrl.meta}>(claimed · ICF)</Text></Text>
              <View style={ctrl.chips}>
                <SelectChip label="Striker pocketed · +1" active={!!endFoul.striker} onPress={() => toggleEnd('striker')} accessibilityLabel={`${nameOf(loser)} pocketed the striker on the last stroke: one more point to ${nameOf(winner)}`} />
                <SelectChip label="Foul stroke · +1" active={!!endFoul.improper} onPress={() => toggleEnd('improper')} accessibilityLabel={`${nameOf(loser)}'s last stroke was a foul: one more point to ${nameOf(winner)}`} />
              </View>
            </View>
          ) : (
            <Text style={ctrl.link} accessibilityRole="button" onPress={() => setEndOpen(true)}>Board ended on {nameOf(loser)}'s foul?</Text>
          )) : null}
          <Button
            label={!ready ? '✓ Record board — pick the coins left'
              : `✓ Record ${penalty ? 'penalty board' : 'board'} · +${credit}${closes ? ` · ${closes.winner === winner ? '' : `${nameOf(closes.winner)} `}wins ${closes.kind === 'match' ? 'the match' : `Game ${closes.game}`}` : credit < value ? ` (game at ${s.target})` : ''}`}
            variant={closes ? 'primary' : winner} onPress={record} disabled={!ready} />
        </>
      )}
      {/* SD-117c — fix or remove any past board (the boards replay: EDIT_LOG) */}
      <BoardEditor state={s} dispatch={dispatch} nameOf={nameOf} who={pname} homeRoster={homeRoster} awayRoster={awayRoster} />
    </View>
  );
};

/** SD-117c — "✎ Correct a board": every recorded board, newest first, with ✎
 *  (winner / coins / Queen / slam) and ✕ (asks first). A change replays the
 *  corrected list (EDIT_LOG) so games, totals and the result re-derive, plus
 *  STAT_ADJUST deltas so the players' live lines follow. */
function BoardEditor({ state: s, dispatch, nameOf, who, homeRoster, awayRoster }: {
  state: CarromState;
  dispatch: (a: ScoreAction) => void;
  nameOf: (side: Side) => string;
  /** a player's name for this viewer by id */
  who: NameOf;
  homeRoster: Player[];
  awayRoster: Player[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ index: number; b: BoardInput } | null>(null);
  if (s.boards.length === 0) return null;
  const list = boardInputs(s);
  const breakers = boardBreakers(s);
  const breakBy = s.breakOrder ? breakerPlayers(s) : []; // SD-134
  const capped = creditedPoints(s);
  const commit = (edited: BoardInput[]) => {
    for (const a of boardCorrection(s, edited)) dispatch(a as never);
    setDraft(null);
  };
  const perSide = s.perSide ?? 1;
  // a board whose winner changes credits the new side's players (as live)
  const creditFor = (side: Side, prev?: BoardInput) => {
    if (prev?.side === side && prev.by?.length) return prev.by;
    const roster = side === 'home' ? homeRoster : awayRoster;
    return creditedPlayers(roster, perSide).map((p) => ({ side, id: p.id }));
  };
  const save = async () => {
    if (!draft) return;
    const prev = list[draft.index];
    const b: BoardInput = { ...draft.b, by: creditFor(draft.b.side, prev) };
    if (!b.by?.length) delete b.by;
    const ok = await askConfirm({
      title: `Save board ${draft.index + 1}?`,
      message: 'The boards after it are replayed: game scores, the games won and player points can change.',
      yesLabel: 'Yes, save board', noLabel: 'No, go back', tone: 'caution',
    });
    if (ok) commit(list.map((x, i) => (i === draft.index ? b : x)));
  };
  const label = (b: BoardInput, i: number) =>
    `G${s.boards[i].game} · ${nameOf(b.side)} +${capped[i]} ${b.penalty ? '(⚠️ penalty)' : `(${b.coins} coin${b.coins === 1 ? '' : 's'}${b.queen ? ' + 👑' : ''})`}${creditName(who, breakBy[i]) ? ` · ${creditName(who, breakBy[i])} broke` : breakers[i] ? ` · ${nameOf(breakers[i]!)} broke` : ''}`;

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={ctrl.head}>
        <Text style={ctrl.label}>Correct a board</Text>
        <Button label={open ? 'Done' : 'Edit'} variant="ghost" onPress={() => { setOpen((v) => !v); setDraft(null); }} />
      </View>
      {open && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={ctrl.meta}>Edit who won a board, the coins left or the Queen, or remove it. The games and player points re-adjust.</Text>
          {draft && (
            <View style={ctrl.draftBox}>
              <Text style={ctrl.label}>Board {draft.index + 1}</Text>
              <View style={ctrl.row}>
                {(['home', 'away'] as const).map((side) => (
                  <Button key={side} label={nameOf(side)} variant={draft.b.side === side ? side : 'ghost'} style={ctrl.flex}
                    onPress={() => setDraft({ ...draft, b: { ...draft.b, side, slam: undefined } })} />
                ))}
              </View>
              <View style={ctrl.chips}>
                <SelectChip label="Played out" active={!draft.b.penalty} onPress={() => setDraft({ ...draft, b: { ...draft.b, penalty: false } })} />
                <SelectChip label="⚠️ Penalty board" active={!!draft.b.penalty} onPress={() => setDraft({ ...draft, b: { ...draft.b, penalty: true, coins: 0, queen: false, queenBy: undefined, slam: undefined } })} />
              </View>
              {!draft.b.penalty && (<>
              <Text style={ctrl.meta}>Opponent's coins left</Text>
              <View style={ctrl.chips}>
                {Array.from({ length: 10 }, (_, n) => <SelectChip key={n} label={String(n)} active={draft.b.coins === n} onPress={() => setDraft({ ...draft, b: { ...draft.b, coins: n } })} />)}
              </View>
              <IconText label={"👑 Queen covered by"} style={ctrl.meta} />
              <View style={ctrl.chips}>
                {([['winner', 'Winner'], ['loser', 'Loser'], ['none', 'Not covered']] as const).map(([q, l]) => (
                  <SelectChip key={q} label={l} active={(draft.b.queenBy ?? (draft.b.queen ? 'winner' : undefined)) === q}
                    onPress={() => setDraft({ ...draft, b: { ...draft.b, queenBy: q, queen: q === 'winner' } })} />
                ))}
              </View>
              </>)}
              <View style={ctrl.row}>
                <Button label="Save…" variant={draft.b.side} style={ctrl.flex} onPress={() => void save()} />
                <Button label="Cancel" variant="ghost" onPress={() => setDraft(null)} />
              </View>
            </View>
          )}
          {list.map((b, i) => ({ b, i })).reverse().map(({ b, i }) => (
            <View key={i} style={ctrl.editRow}>
              <Text style={ctrl.rowLabel} numberOfLines={2}>{label(b, i)}</Text>
              {!draft && (
                <View style={ctrl.actions}>
                  <RowAction label="✎" tone="edit" a11y={`Edit board ${i + 1}`} onPress={() => setDraft({ index: i, b: { ...b } })} />
                  <RowAction label="✕" tone="remove" a11y={`Remove board ${i + 1}`}
                    onPress={() => void confirmRemove(`board ${i + 1} (${nameOf(b.side)} +${capped[i]})`, () => commit(list.filter((_, j) => j !== i)), 'The boards after it are replayed: game scores, games won and player points re-adjust.')} />
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Match tabs (2026-10-22): the board-by-board commentary (newest first, by
 *  game) on Commentary; the match stats panel (whole match or one game;
 *  scoring, Queen, break, fouls), the box score and the ICF score sheet on
 *  Stats. The games are on the scoreboard header above every tab. */
type TabProps = Parameters<NonNullable<SportPlugin<CarromState>['LiveExtras']>>[0];
/** A singles player's own name (by id for this viewer), else the side's —
 *  plus the lookup for a credited player (a doubles breaker). */
function useTabNames({ homeName, awayName, homeRoster = [], awayRoster = [] }: TabProps): { names: { home: string; away: string }; who: NameOf } {
  const who = useCarromNames(homeRoster, awayRoster);
  return { names: { home: sideName(who, homeRoster, homeName), away: sideName(who, awayRoster, awayName) }, who };
}
const CarromCommentary = (p: TabProps) => {
  const { names, who } = useTabNames(p);
  return <CommentaryFeed title={null} groups={carromFeed(p.state as CarromState, names, who)} homeColor={p.homeColor} awayColor={p.awayColor} empty="No boards yet." />;
};
function CarromStats(p: TabProps) {
  const s = p.state as CarromState;
  const { homeName, awayName, homeColor, awayColor } = p;
  const { names, who } = useTabNames(p);
  const [unit, setUnit] = useState('all');
  if (s.boards.length === 0) return <Text style={textStyles.muted}>No boards yet.</Text>;
  const games = carromGames(s);
  const g = unit === 'all' ? undefined : Number(unit);
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <CompareTable title={null} homeName={names.home} awayName={names.away} homeColor={homeColor} awayColor={awayColor}
        categories={carromMatchStats(s, g)} unit={unit} onUnit={setUnit}
        units={[{ key: 'all', label: 'Match' }, ...games.map((n) => ({ key: String(n), label: `Game ${n}` }))]}
        footnote={s.track ? undefined : 'More detail (fouls, coins on the break, missed covers): switch it on under ⚙️ Stats to track.'} />
      {/* SD-23: points / boards / queens per side, per game */}
      <MatchBoxScore sport="carrom" source={carromBox(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />
      {/* SD-68 (CR-03) — the ICF score sheet: board · breaker · winner · coins · Queen · running total */}
      <Text style={ctrl.label}>Score sheet</Text>
      <ScoreSheet state={s} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} nameOf={who} />
    </View>
  );
}

/** SD-20 — the LineScoreboard: GAMES won + a column of board points per game,
 *  the live game highlighted. */
const CarromScoreboard: NonNullable<SportPlugin<CarromState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as CarromState;
  return (
    <SetLineBoard
      ls={lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} live={live} closed={closed}
      status={`Game ${s.games.length + 1} · board ${s.boardsInGame + 1}`}
      bestOf={s.gamesToWin === 1 ? `single game to ${s.target}` : `best of ${s.gamesToWin * 2 - 1} · to ${s.target}`}
    />
  );
};

export const carromPlugin: SportPlugin<CarromState> = {
  ...CARROM_META,
  matchRecords: carromMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => result(s),
  // SD-17: board points over every game (points-difference tie-break).
  standingsUnits,
  // SD-01: once ended → games won + "25-18, 12-25, 25-20" (never the reset 0 : 0).
  summary,
  scoreLine,
  // SD-20: the line score (board grid, a game closed by hand).
  lineScore,
  // SD-37: absolute lines at completion — both partners, capped points, games,
  // boards played, slams, 25-0 games (src/sports/carrom/totals.ts)
  statTotals: carromStatTotals,
  statTotalsNeedsPlayers: true,
  statTotalsPartial: true,
  Scoreboard: CarromScoreboard,
  // SD-137a — voice scoring (period / match ends ask first)
  voice: { hints: ['board home 5', '{name} 3 queen', 'board away 9 slam', 'penalty home'], parse: carromVoice, ends: carromVoiceEnds },
  ScoringControls,
  matchTabs: { Commentary: CarromCommentary, Stats: CarromStats },
  // Deep wave — "Stats to track": optional detail on the board form (event
  // mode: the format before board 1, then SET_TRACK from the next board)
  liveSettings: {
    title: '⚙️ Stats to track',
    hint: 'Optional extra detail. Recording a board stays the same; the extra rows appear on the board form and feed the commentary, match stats and careers.',
    mode: 'event',
    actionType: 'SET_TRACK',
    fields: [
      { key: 'trackFouls', label: 'Fouls & dues', type: 'toggle', default: false, group: 'Stats to track', hint: 'Fouls by type (striker pocketed, touching, base line, arrow line, elbow crossing, thumbing) and dues, per board; doubles: who fouled' },
      { key: 'trackBreak', label: 'Coins on the break', type: 'toggle', default: false, group: 'Stats to track', hint: 'How many coins the breaker pocketed with the break stroke' },
      { key: 'trackQueenMiss', label: 'Missed Queen covers', type: 'toggle', default: false, group: 'Stats to track', hint: 'The Queen pocketed but the cover missed (she goes back)' },
    ],
    read: (st) => ({ trackFouls: !!st.track?.fouls, trackBreak: !!st.track?.brk, trackQueenMiss: !!st.track?.qMiss }),
    defaults: { trackFouls: false, trackBreak: false, trackQueenMiss: false },
  },
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  breakLine: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  foulName: { width: '100%', fontWeight: '800' },
  whoRow: { width: '100%', alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  draftBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  rowLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  actions: { flexDirection: 'row', gap: theme.spacing(2) },
  chip: {
    color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700',
    backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3),
  },
});
