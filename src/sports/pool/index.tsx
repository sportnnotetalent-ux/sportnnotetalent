/**
 * Pool plugin (8-ball, 9-ball, 10-ball) — archetype: set-game-point (racks →
 * sets → match). WPA Rules of Play 2026 (docs/sports/POOL_DESIGN.md).
 *
 * This file only DRAWS. The rules are the engine (./engine.ts); the plugin's
 * match state (who shot, the game pin, the shot feed) is ./match.ts; what the
 * controls send, offer, say and ask is ./controls.ts; the totals, records,
 * undo label, commentary, stats panel and box are their own pure modules —
 * all collected in ./core.ts, which the node tests drive.
 *
 * IDs-only scoring (docs/privacy/ids-only-scoring.md): taps carry player ids
 * only (`payload.pid`); names are looked up when shown (`useMask().nameOf`,
 * with the match's rosters).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, textStyles } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { SetLineBoard } from '../SetLineBoard';
import { MatchBoxScore } from '../../components/BoxScore';
import { CommentaryFeed } from '../gcc/CommentaryFeed';
import { CompareTable } from '../gcc/CompareTable';
import { useMask } from '../../core/disputeMask';
import { withRosters } from '../racketNames';
import { entryDisplayName } from '../../data/participantEntry';
import type { NameOf } from '../../core/playerNames';
import type { FoulKind } from './engine';
import { other, type Side } from './balls';
import { perSideOf, poolReducer, type PoolMatch } from './match';
import {
  BREAK_FOULS, FOUL_LABEL, PLAY_FOULS, bestOfLine, boardStatus, breakAction, breakLine, chooseAction, choiceOptions, choiceQuestion,
  confirmFor, foulAction, lagAction, makeTapGuard, missAction, outcomeOf, poolPanel, potAction, pushAction, rackAction,
  otherGroupOnly, safetyAction, scotchTurns, setUnits, shooterPick, stalemateAction, type TapOpts,
} from './controls';
import { ballsText, poolFeed } from './feed';
import { poolCompare, poolRackList } from './compare';
import { poolBox } from './box';
import { POOL_CORE } from './core';
import { POOL_META } from './meta';

/** A singles side reads as its player (by id, for this viewer), else the entry's name. */
// a pair reads "Aarav / Rohan" as on the board, never its initials code (pool polish PP1)
const sideLabel = (who: NameOf, roster: Player[], team: string): string =>
  (roster.length === 1 ? who(roster[0].id, roster[0].fullName)
    : roster.length === 2 ? entryDisplayName(roster.map((p) => who(p.id, p.fullName))) ?? team : team);
function usePoolNames(homeRoster: Player[], awayRoster: Player[]): NameOf {
  const { nameOf } = useMask();
  return withRosters(nameOf, homeRoster, awayRoster);
}

const ScoringControls: SportPlugin<PoolMatch>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [], homeColor, awayColor }) => {
  const s = state as PoolMatch;
  const who = usePoolNames(homeRoster, awayRoster);
  const roster = (sd: Side) => (sd === 'home' ? homeRoster : awayRoster);
  const name = (sd: Side) => sideLabel(who, roster(sd), sd === 'home' ? homeName : awayName);
  const doubles = perSideOf(s) === 2;
  // the latest state (a confirm sheet may stay open while another device scores)
  const stateRef = useRef(s);
  stateRef.current = s;
  const guard = useRef(makeTapGuard(poolReducer)).current;
  const busy = useRef(false);
  // the screen's own picks, cleared whenever the match moves
  const [sel, setSel] = useState<number[]>([]);
  const [foulOpen, setFoulOpen] = useState(false);
  // a foul is picked, then recorded with its own button (a stray tap on a chip records nothing)
  const [foulKind, setFoulKind] = useState<FoulKind | null>(null);
  const [notCalled, setNotCalled] = useState(false);
  const [tenCalled, setTenCalled] = useState(false);
  const [breaker, setBreaker] = useState<Side | null>(null);
  const [shooter, setShooter] = useState<Record<Side, string | null>>({ home: null, away: null });
  // doubles: the order is known, so the next shooter is a line; "Change" shows the two (rotation SR2)
  const [changing, setChanging] = useState(false);
  const [flags, setFlags] = useState({ bnr: false, golden: false, runOut: false });
  const [more, setMore] = useState(false);
  const moved = `${s?.seq}:${s?.rack?.n}:${s?.rack?.reracks}`;
  useEffect(() => {
    setSel([]); setFoulOpen(false); setFoulKind(null); setNotCalled(false); setTenCalled(false); setShooter({ home: null, away: null }); setChanging(false);
    setFlags({ bnr: false, golden: false, runOut: false }); setMore(false);
  }, [moved]);

  const p = poolPanel(s);
  if (p.kind === 'over') return <Text style={textStyles.muted}>Match over.</Text>;

  /** Who shoots for a side: doubles = the picked partner, else the suggested one; singles = the side's one player. */
  const ids = (sd: Side) => roster(sd).map((x) => x.id);
  const pidFor = (sd: Side): string | undefined => {
    if (doubles) return shooter[sd] ?? shooterPick(s, sd, ids(sd)).suggested ?? undefined;
    return roster(sd).length === 1 ? roster(sd)[0].id : undefined;
  };
  const opts = (sd: Side | null): TapOpts => ({ pid: sd ? pidFor(sd) : undefined, at: Date.now() });

  /** Ask first when the tap ends a rack, a set or the match (or re-racks); then
   *  send it — unless the state moved meanwhile and the engine would ignore it,
   *  or it is a second tap before the screen redrew (the guard). */
  const send = async (a: ScoreAction) => {
    if (busy.current) return;
    const asked = stateRef.current;
    const q = confirmFor(asked, a, name);
    if (q) {
      busy.current = true;
      const end = outcomeOf(asked, a).ends;
      const ok = await askConfirm({ ...q, noLabel: 'No, go back', tone: end?.kind === 'match' ? 'danger' : 'caution' }).finally(() => { busy.current = false; });
      if (!ok) return;
    }
    // break #3: dropped if the match moved while the sheet was open; #4: never blocks for good
    if (!guard(stateRef.current, a, { asked, now: Date.now() })) return;
    dispatch(a);
  };
  const toggleBall = (b: number) => setSel((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]));

  /** Doubles: who shoots / breaks for `sd`. The rotation is known, so it is a
   *  line ("Likhi shoots next · Change"); Change shows both partners. */
  const shooterChips = (sd: Side, label: string, mode: 'break' | 'shot') => {
    if (!doubles) return null;
    const pick = shooterPick(s, sd, ids(sd));
    if (pick.ids.length < 2) return <Text style={ctrl.meta}>Add both players of {name(sd)} to credit who shot.</Text>;
    const cur = shooter[sd] ?? pick.suggested;
    const nm = (id: string) => who(id, roster(sd).find((x) => x.id === id)?.fullName);
    if (!changing && cur) {
      const keeps = pick.keeps && !shooter[sd];
      const line = mode === 'break' ? `${nm(cur)} breaks` : keeps ? `${nm(cur)} keeps shooting` : `${nm(cur)} shoots next`;
      const why = shooter[sd] ? '' : mode === 'break' ? ' (partners take turns to break)' : keeps ? ' (a ball went in)'
        : scotchTurns(s) === 'turn' ? ' (partners take turns at the table)' : ' (partners alternate shots)';
      return (
        <Text style={ctrl.meta} accessibilityLiveRegion="polite">
          <Text style={ctrl.next}>{line}</Text>{why}{' · '}
          <Text style={ctrl.link} accessibilityRole="button" accessibilityLabel={`Change who ${mode === 'break' ? 'breaks' : 'shoots'} for ${name(sd)}`}
            onPress={() => setChanging(true)}>Change</Text>
        </Text>
      );
    }
    return (
      <View style={ctrl.chips}>
        <Text style={[ctrl.meta, ctrl.chipLead]}>{label}</Text>
        {pick.ids.map((id) => (
          <SelectChip key={id} label={nm(id)} active={cur === id}
            onPress={() => { setShooter((x) => ({ ...x, [sd]: id })); setChanging(false); }} accessibilityLabel={`${nm(id)} is ${mode === 'break' ? 'breaking' : 'shooting'} for ${name(sd)}`} />
        ))}
      </View>
    );
  };

  /** Ball chips: the balls on the table (tap order kept: the first = the called ball). */
  const ballChips = (balls: number[], money: number) => (
    <View style={ctrl.chips}>
      {balls.map((b) => (
        <SelectChip key={b} label={b === money ? `${b} ★` : String(b)} active={sel.includes(b)} onPress={() => toggleBall(b)}
          accessibilityLabel={`Ball ${b}${b === money ? ', the game ball' : ''}${sel.includes(b) ? ', picked' : ''}`} />
      ))}
    </View>
  );

  /** Quick mode: the rack result only (with optional flags). Mid-rack it awards the rack. */
  const quickRow = (brk: Side | null, award: boolean) => (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={ctrl.label}>{award ? 'Award this rack' : 'Rack result only'} <Text style={ctrl.meta}>({award ? 'no more shots in it — asks first' : 'for scorers who don’t go shot by shot'})</Text></Text>
      {!award && (
        <View style={ctrl.chips}>
          <SelectChip label="Break-and-run" active={flags.bnr} onPress={() => setFlags((f) => ({ ...f, bnr: !f.bnr, runOut: false }))} />
          {s.game === 'nine' && <SelectChip label="Golden break" active={flags.golden} onPress={() => setFlags((f) => ({ ...f, golden: !f.golden, runOut: false }))} />}
          <SelectChip label="Run-out (not the breaker)" active={flags.runOut} onPress={() => setFlags((f) => ({ ...f, runOut: !f.runOut, bnr: false, golden: false }))} />
        </View>
      )}
      <View style={ctrl.row}>
        {(['home', 'away'] as Side[]).map((sd) => (
          <Button key={sd} label={`Rack to ${name(sd)}`} variant="ghost" style={ctrl.flex}
            accessibilityLabel={`${award ? 'Award' : 'Record'} rack ${s.rack?.n ?? ''} to ${name(sd)}`}
            onPress={() => void send(rackAction(s, sd, award ? {} : { ...flags, breaker: flags.runOut ? (brk && brk !== sd ? brk : other(sd)) : flags.bnr || flags.golden ? sd : brk }, opts(null)))} />
        ))}
      </View>
      {!award && (flags.bnr || flags.golden) ? <Text style={ctrl.meta}>A break-and-run or golden break goes to the player who broke.</Text> : null}
    </View>
  );

  // ---------------------------------------------------------------- lag --
  if (p.kind === 'lag') {
    return (
      <View style={ctrl.wrap}>
        <Text style={ctrl.label}>Who breaks rack 1? <Text style={ctrl.meta}>(the lag winner chooses)</Text></Text>
        <View style={ctrl.row}>
          <Button label={name('home')} variant="home" color={homeColor} style={ctrl.flex} onPress={() => void send(lagAction(s, 'home', opts(null)))} accessibilityLabel={`${name('home')} breaks rack 1`} />
          <Button label={name('away')} variant="away" color={awayColor} style={ctrl.flex} onPress={() => void send(lagAction(s, 'away', opts(null)))} accessibilityLabel={`${name('away')} breaks rack 1`} />
        </View>
        {quickRow(null, false)}
      </View>
    );
  }

  // -------------------------------------------------------------- break --
  if (p.kind === 'break') {
    const brk = p.breaker ?? breaker;
    const dry = sel.length === 0;
    const o = opts(brk);
    return (
      <View style={ctrl.wrap}>
        {p.breaker ? <Text style={ctrl.breakLine}>⚪ {breakLine(s, name)}</Text> : (
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>Who breaks rack {p.rack}?</Text>
            <View style={ctrl.row}>
              {(['home', 'away'] as Side[]).map((sd) => (
                <Button key={sd} label={name(sd)} variant={breaker === sd ? sd : 'ghost'} style={ctrl.flex} onPress={() => setBreaker(sd)} selected={breaker === sd} />
              ))}
            </View>
          </View>
        )}
        {brk ? shooterChips(brk, 'Breaking:', 'break') : null}
        <Text style={ctrl.label}>Balls in on the break <Text style={ctrl.meta}>(tap each · none = a dry break)</Text></Text>
        {ballChips(p.balls, s.game === 'eight' ? 8 : s.game === 'nine' ? 9 : 10)}
        <View style={ctrl.row}>
          <Button label={dry ? 'Dry break (nothing in)' : `✓ Break · ${ballsText(sel)} in`} style={ctrl.flex} disabled={!brk}
            onPress={() => brk && void send(breakAction(s, { pots: sel, side: brk }, o))} />
        </View>
        <View style={ctrl.row}>
          <Button label={foulOpen ? 'Foul on the break ▾' : 'Foul on the break ▸'} variant="ghost" style={ctrl.flex} disabled={!brk} onPress={() => { setFoulOpen((v) => !v); setFoulKind(null); }} />
          {dry ? <Button label="Illegal break" variant="ghost" style={ctrl.flex} disabled={!brk} accessibilityHint="Nothing went in and fewer than four balls hit a rail"
            onPress={() => brk && void send(breakAction(s, { illegal: true, side: brk }, o))} /> : null}
        </View>
        {foulOpen && brk ? (
          <View style={ctrl.box}>
            <Text style={ctrl.meta}>The balls you tapped went in on the foul (for “off the table”: they left the table).</Text>
            <View style={ctrl.chips}>
              {BREAK_FOULS.map((k) => (
                <SelectChip key={k} label={FOUL_LABEL[k]} active={foulKind === k} onPress={() => setFoulKind(foulKind === k ? null : k)} />
              ))}
            </View>
            <Button label={foulKind ? `Record foul on the break · ${FOUL_LABEL[foulKind]}` : 'Pick the foul'} variant="danger" disabled={!foulKind}
              onPress={() => foulKind && void send(breakAction(s, foulKind === 'offTable' ? { off: sel, foul: foulKind, side: brk } : { pots: sel, foul: foulKind, side: brk }, o))} />
          </View>
        ) : null}
        {p.shortRule && sel.length < 3 ? (
          <Button label="Short break (three-ball rule)" variant="ghost" disabled={!brk} accessibilityHint="Fewer than three balls went in or past the head string"
            onPress={() => brk && void send(breakAction(s, { pots: sel, short: true, side: brk }, o))} />
        ) : null}
        <Text style={ctrl.meta}>{p.illegalFoul ? 'An illegal break is a foul at this game: ball in hand to the other player.' : '8-ball: an illegal break is not a foul; the other player chooses next.'}</Text>
        {quickRow(brk, false)}
      </View>
    );
  }

  // ------------------------------------------------------------- choice --
  if (p.kind === 'choice') {
    return (
      <View style={ctrl.wrap}>
        <Text style={ctrl.label}>{choiceQuestion(s, name)}</Text>
        {choiceOptions(s, name).map((o) => (
          <Button key={`${o.choice}-${o.breaker ?? ''}`} label={o.label} variant={o.choice === 'play' ? p.by : 'ghost'} color={o.choice === 'play' ? (p.by === 'home' ? homeColor : awayColor) : undefined}
            onPress={() => void send(chooseAction(s, o.choice, o.breaker, opts(null)))} />
        ))}
      </View>
    );
  }

  // --------------------------------------------------------------- shot --
  const sh = p.shooter;
  const o = opts(sh);
  const picked = sel.filter((b) => p.table.includes(b));
  const tenFlag = p.tenCall && picked.includes(10) && tenCalled ? { calledBall: 10 } : {};
  // 8-ball: only the other group went in — what did the cue ball hit first? (rotation SR4)
  const theirs = otherGroupOnly(s, picked);
  const groups = s.game === 'eight'
    ? p.solids ? `${name(p.solids)}: solids (1–7) · ${name(other(p.solids))}: stripes (9–15)` : 'Open table · tap the called ball first'
    : null;
  return (
    <View style={ctrl.wrap}>
      <Text style={ctrl.breakLine}>{name(sh)} at the table{p.bih ? ' · ball in hand' : ''} <Text style={ctrl.meta}>· rack {p.rack}</Text></Text>
      {groups ? <Text style={ctrl.meta}>{groups}</Text> : null}
      {p.twoFouls ? (
        <Text style={ctrl.warn} accessibilityLiveRegion="assertive" accessibilityRole="alert">
          ⚠️ {name(sh)} is on two fouls. A third foul in a row loses the rack.
        </Text>
      ) : null}
      {shooterChips(sh, 'Shooting:', 'shot')}
      <Text style={ctrl.label}>Balls that went in <Text style={ctrl.meta}>(tap each, then the shot)</Text></Text>
      {ballChips(p.table, p.money)}
      {p.callShot && picked.length ? (
        <View style={ctrl.chips}>
          <SelectChip label="Called shot" active={!notCalled} onPress={() => setNotCalled(false)} />
          <SelectChip label="Not called (wrong pocket / ball)" active={notCalled} onPress={() => setNotCalled(true)} />
          {p.tenCall && picked.includes(10) ? <SelectChip label="The 10 was the called ball" active={tenCalled} onPress={() => setTenCalled((v) => !v)} /> : null}
        </View>
      ) : null}
      {theirs ? (
        <View style={ctrl.box}>
          <Text style={ctrl.label}>Only {theirs} went in. What did the cue ball hit first?</Text>
          <Button label={`A ${theirs === 'solids' ? 'stripe' : 'solid'} (own group) · turn passes`} variant="ghost"
            accessibilityHint="A legal shot: no foul, the other side comes to the table"
            onPress={() => void send(potAction(s, picked, { called: !notCalled, ...tenFlag }, o))} />
          <Button label={`A ${theirs === 'solids' ? 'solid' : 'stripe'} · foul, ball in hand`} variant="danger"
            accessibilityHint="Wrong ball hit first: the balls stay down, ball in hand to the other side"
            onPress={() => void send(foulAction(s, 'wrongBall', { balls: picked }, o))} />
        </View>
      ) : null}
      <View style={ctrl.row}>
        <Button label={picked.length ? `Pot · ${ballsText(picked)}` : 'Pot (tap balls)'} variant={sh} color={sh === 'home' ? homeColor : awayColor} style={ctrl.flex2}
          disabled={!picked.length || !!theirs} onPress={() => void send(potAction(s, picked, { called: !notCalled, ...tenFlag }, o))} />
        <Button label="Miss" variant="ghost" style={ctrl.flex} disabled={picked.length > 0} accessibilityHint="Nothing went in, no foul"
          onPress={() => void send(missAction(s, o))} />
      </View>
      <View style={ctrl.row}>
        <Button label={picked.length ? `Safety · ${ballsText(picked)} in` : 'Safety'} variant="ghost" style={ctrl.flex}
          accessibilityHint={p.safetyCall ? 'A called safety: the turn passes' : '10-ball has no safety call: a ball that goes in is a wrongly pocketed ball'}
          onPress={() => void send(safetyAction(s, picked, o))} />
        <Button label={foulOpen ? 'Foul ▾' : 'Foul ▸'} variant="ghost" style={ctrl.flex} onPress={() => { setFoulOpen((v) => !v); setFoulKind(null); }} accessibilityLabel="Foul: pick what kind" />
        {p.push ? <Button label="Push out" variant="ghost" style={ctrl.flex} accessibilityHint="The shot after the break: the other player then chooses who shoots"
          onPress={() => void send(pushAction(s, { pots: picked }, o))} /> : null}
      </View>
      {foulOpen ? (
        <View style={ctrl.box}>
          <Text style={ctrl.label}>Foul by {name(sh)}{doubles && pidFor(sh) ? ` (${who(pidFor(sh)!)})` : ''}</Text>
          <Text style={ctrl.meta}>The balls you tapped went in on the foul (for “object ball off the table”: they left the table).</Text>
          <View style={ctrl.chips}>
            {PLAY_FOULS.map((k: FoulKind) => (
              <SelectChip key={k} label={FOUL_LABEL[k]} active={foulKind === k} onPress={() => setFoulKind(foulKind === k ? null : k)}
                accessibilityLabel={`Kind of foul by ${name(sh)}: ${FOUL_LABEL[k]}`} />
            ))}
          </View>
          <Button label={foulKind ? `Record foul · ${FOUL_LABEL[foulKind]}` : 'Pick the foul'} variant="danger" disabled={!foulKind}
            onPress={() => foulKind && void send(foulAction(s, foulKind, { balls: picked }, o))} />
          <Button label={`${name(other(sh))} played out of turn`} variant="ghost"
            accessibilityHint={`A foul on ${name(other(sh))}; ${name(sh)} keeps the table with ball in hand`}
            onPress={() => void send(foulAction(s, 'outOfTurn', { by: other(sh) }, opts(other(sh))))} />
        </View>
      ) : null}
      <Text style={ctrl.link} accessibilityRole="button" onPress={() => setMore((v) => !v)}>{more ? 'Fewer options ▾' : 'More: stalemate, award the rack ▸'}</Text>
      {more ? (
        <View style={ctrl.box}>
          <Button label="Stalemate: re-rack (same breaker)" variant="ghost" onPress={() => void send(stalemateAction(s, opts(null)))} />
          {quickRow(s.rack?.breaker ?? null, true)}
        </View>
      ) : null}
    </View>
  );
};

/** Match tabs: names for this viewer. */
type TabProps = Parameters<NonNullable<NonNullable<SportPlugin<PoolMatch>['matchTabs']>['Stats']>>[0];
function useTabNames({ homeName, awayName, homeRoster = [], awayRoster = [] }: TabProps): { names: { home: string; away: string }; who: NameOf } {
  const who = usePoolNames(homeRoster, awayRoster);
  return { names: { home: sideLabel(who, homeRoster, homeName), away: sideLabel(who, awayRoster, awayName) }, who };
}

/** Commentary: rack by rack, newest first. */
const PoolCommentary = (p: TabProps) => {
  const { names, who } = useTabNames(p);
  return <CommentaryFeed title={null} groups={poolFeed(p.state as PoolMatch, names, who)} homeColor={p.homeColor} awayColor={p.awayColor} empty="No racks yet." />;
};

/** Stats: the comparison (match or one set), the per-player box (scotch doubles), the rack list. */
function PoolStats(p: TabProps) {
  const s = p.state as PoolMatch;
  const { names, who } = useTabNames(p);
  const [unit, setUnit] = useState('all');
  const racks = poolRackList(s, (sd) => names[sd]);
  if (!racks.length && !s?.seq) return <Text style={textStyles.muted}>No racks yet.</Text>;
  const set = unit === 'all' ? undefined : Number(unit);
  const cats = poolCompare(s, set);
  const detail = cats.some((c) => c.id === 'table');
  const doubles = perSideOf(s) === 2;
  const shown = set ? racks.filter((r) => r.set === set) : racks;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <CompareTable title={null} homeName={names.home} awayName={names.away} homeColor={p.homeColor} awayColor={p.awayColor}
        categories={cats} unit={unit} onUnit={setUnit} units={setUnits(s)}
        footnote={detail ? undefined : 'Score racks shot by shot to see the break, pots, safeties and fouls.'} />
      {doubles && detail ? (
        <MatchBoxScore sport="pool" source={poolBox(s, { homeRoster: p.homeRoster, awayRoster: p.awayRoster, nameOf: who })}
          homeName={names.home} awayName={names.away} homeColor={p.homeColor} awayColor={p.awayColor} show="box" onPlayer={p.onPlayer} />
      ) : null}
      {shown.length ? (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={ctrl.label}>Racks</Text>
          {shown.map((r) => (
            <Text key={r.n} style={[ctrl.rackRow, { borderLeftColor: r.winner === 'home' ? p.homeColor ?? theme.colors.home : p.awayColor ?? theme.colors.away }]}>{r.text}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The scoreboard: racks per set (the set in play highlighted), the engine's status line. */
const PoolScoreboard: NonNullable<SportPlugin<PoolMatch>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live, closed }) => {
  const s = state as PoolMatch;
  return (
    <SetLineBoard ls={POOL_CORE.lineScore(s)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
      live={live} closed={closed} status={boardStatus(s)} bestOf={bestOfLine(s)} />
  );
};

export const poolPlugin: SportPlugin<PoolMatch> = {
  ...POOL_META,
  ...POOL_CORE,
  Scoreboard: PoolScoreboard,
  ScoringControls,
  startAction: (state, side) => lagAction(state as PoolMatch, side, { at: Date.now() }),
  matchTabs: { Commentary: PoolCommentary, Stats: PoolStats },
  // break #14: the shooter is payload.pid — the correction list re-credits it
  creditInPayload: true,
};

const ctrl = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  flex: { flexGrow: 1, flexBasis: 96 },
  flex2: { flexGrow: 2, flexBasis: 140 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  chipLead: { fontWeight: '700' },
  next: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingVertical: theme.spacing(2) },
  breakLine: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  warn: { color: theme.colors.onFill, backgroundColor: theme.colors.accent, fontSize: theme.font.body, fontWeight: '800', borderRadius: theme.radius.sm, padding: theme.spacing(3) },
  box: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  rackRow: { color: theme.colors.text, fontSize: theme.font.small, borderLeftWidth: 3, paddingLeft: theme.spacing(2), paddingVertical: theme.spacing(1) },
});
