/**
 * Rugby league plugin (IRL Laws; NRL / Super League rules). Archetype: goal /
 * time, on the referee's running clock (2 halves counting up, play on after
 * the siren until the ball is dead). The pure rules live in ./engine.ts; the
 * field tracker and statTotals in ./totals.ts, the box score in ./box.ts, the
 * six-tackle set figures in ./sets.ts.
 *
 * The scorer's panel: the clock (start / stop / end the half / set it), then
 * per side Try (scorer + assist, then the conversion: good / missed / not
 * taken + the kicker), Kick at goal (penalty goal), Field goal (drop goal — 1,
 * or 2 from 40 m with the NRL option), Penalty try (4, then the conversion
 * from in front), Sin bin / send-off / on report, Interchange (HIA / blood
 * bin temporary, back on). A level match goes to golden point as the
 * organiser chose.
 *
 * Optional "Stats to track" (off by default): six-tackle sets — "Tackle n ·
 * <team> in possession" with a big one-tap Tackle and one-tap endings (kick,
 * error, penalty against, six again; the last tackle hands over by itself, a
 * score ends the set) — and player detail (tackles, runs, line breaks,
 * offloads, errors, penalties conceded) behind a Detail button. The live
 * views: Play-by-play · Match stats · Box score · Key moments.
 *
 * Corrections: "Correct the timeline" removes or re-enters a past moment
 * (REMOVE_EVENT with the reversed credits, then the same flow stamped at the
 * original time; Cancel keeps the event — SD-114).
 */
import React, { useEffect, useState, useMemo } from 'react';
import { closeSaves, closeLabel } from '../flowClose';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { withNames, nameFor } from '../invasion/names';
import { subAction, xiStamp } from '../invasion/actions';
import { Button, SelectChip, TextField } from '../../components/ui';
import { confirmMatchAction } from '../../components/ConfirmSheet';
import { LineScoreboard } from '../../components/LineScoreboard';
import { MatchBoxScore } from '../../components/BoxScore';
import { FieldBanner } from '../FieldBanner';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import {
  init, reducer, isComplete, result, levelAtEnd, matchSec, periodSec, periodLen, clockFace, clockAt, periodName, periodLong, periodStarted, running,
  eventCredits, creditAttribution, sinBinsOf, interchangesUsed, openTemps, totalPeriods, nextPlan, isGoldenPoint, pointsOf, leagueStandingsUnits,
  nominalOffset, trackedDetailKeys, currentSet,
  LEAGUE_PRESETS, LEAGUE_LIVE_SETTINGS, LIVE_KEYS, DETAIL_LABEL, FLAG_DETAILS, TRACK_FLAGS, TRACK_FIELDS, TEAM_DETAIL,
  type LeagueEvent, type LeagueState, type DetailKey, type Sanction, type Side, type SetEnd,
} from './engine';
import { ruledOutAction, RULED_OUT_REASONS, RULED_OUT_LABEL } from '../invasion/ruledOut';
import { restartAction, RESTART_LABEL, LEAGUE_RESTARTS } from '../invasion/restarts';
import { leagueTotals, leagueLiveField, leagueField, unavailable } from './totals';
import { leagueBox } from './box';
import { leagueCommentary, leagueScopeLabel, LEAGUE_FEED_TAGS } from './commentary';
import { leagueSheet } from './sheet';
import { setFigures, completionText } from './sets';
import { GroupedFeed } from '../GroupedFeed';
import { StatSheetView } from '../StatSheetView';
import { SubViews } from '../SubViews';
import { describeEvent, eventWhen, leagueUndoLabel } from './timeline';
import { leagueTickerDetail, leagueTickerFlash } from './ticker';
import { leagueFormation, LeaguePitch } from './pitch';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';
import { leagueVoice, leagueVoiceEnds, leagueLast } from './voice';
import { RUGBY_LEAGUE_META } from './meta';
import { leagueMatchRecords } from './records';
import { IconText } from '../../components/Icon';
import { MainAction } from '../MainAction';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** the keys this match tracks (the base set + the detail switched on) */
const trackedKeys = (s: LeagueState): string[] => [...LIVE_KEYS, ...trackedDetailKeys(s)];
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/* ------------------------------ player picker ------------------------------ */

function PlayerGrid({ players, onPick, skip }: { players: Player[]; onPick: (p: Player) => void; skip?: { label: string; onPress: () => void } }) {
  return (
    <View style={c.grid}>
      {players.map((p) => (
        <TouchableOpacity key={p.id} style={c.pchip} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={p.fullName} onPress={() => onPick(p)}>
          <Text style={c.pnum}>{p.jerseyNo ?? '–'}</Text>
          <Text style={c.pname} numberOfLines={1}>{p.fullName}</Text>
        </TouchableOpacity>
      ))}
      {players.length === 0 ? <Text style={c.meta}>No players listed — use the button below.</Text> : null}
      {skip ? (
        <TouchableOpacity style={[c.pchip, c.skip]} activeOpacity={0.75} accessibilityRole="button" onPress={skip.onPress}>
          <Text style={c.skipTxt}>{skip.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type SubKind = 'perm' | 'hia' | 'blood';
type Flow =
  | { mode: 'try'; side: Side; step: 'zone' | 'scorer' | 'assist'; scorer?: Player | null; bonus?: boolean }
  | { mode: 'conv'; side: Side; step: 'result' | 'kicker'; made?: boolean }
  | { mode: 'kick'; side: Side; kick: 'pen' | 'fg'; step: 'result' | 'points' | 'kicker'; made?: boolean; two?: boolean }
  /** `pt` (invasion batch 5): straight after a penalty try by `pt` — a sanction for the offender? (optional), then the conversion */
  | { mode: 'sanction'; side: Side; step: 'kind' | 'player'; sanction?: Sanction; pt?: Side }
  | { mode: 'sub'; side: Side; step: 'kind' | 'off' | 'on' | 'back'; kind?: SubKind; off?: Player | null }
  | { mode: 'detail'; side: Side; step: 'kind' | 'player'; detail?: DetailKey }
  /** six-tackle sets: an error / penalty against the side with the ball — who (with errors tracked) */
  /** invasion batch 5: 'penWon' — a penalty to the side with the ball; `side` = the defence (who conceded it) */
  | { mode: 'setEnd'; side: Side; how: 'error' | 'penalty' | 'penWon' }
  /** invasion batch 6: a try ruled out (only with the toggle on) — one tap logs it */
  | { mode: 'ruledout'; side: Side; review?: boolean };

/* -------------------------------- controls --------------------------------- */

const ScoringControls: SportPlugin<LeagueState>['ScoringControls'] = ({
  state: liveState, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [],
}) => {
  // SD-114: Edit holds the removal until the re-entry commits (Cancel keeps the event).
  const { view: s, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  // IDs-only scoring: the state keeps player ids; names are looked up when shown
  const { nameOf: playerNameOf } = useMask();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [editAt, setEditAt] = useState<{ sec: number; psec: number; period: number } | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [clockInput, setClockInput] = useState('');
  const [setting, setSetting] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (flow === null && editAt) { setEditAt(null); dropHeldRemoval(); } }, [flow]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const name = (sd: Side) => (sd === 'home' ? homeName : awayName);
  const color = (sd: Side) => (sd === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  const rosterOf = (sd: Side) => (sd === 'home' ? homeRoster : awayRoster);
  const lineupOf = (sd: Side) => (sd === 'home' ? homeLineup : awayLineup);
  const byId = (sd: Side, id?: string, nm?: string): Player | undefined =>
    rosterOf(sd).find((p) => (id && p.id === id) || (!id && nm && p.fullName === nm)) ?? (id ? { id, fullName: nameFor(playerNameOf, id, nm) ?? 'Player', sports: ['rugby_league'] } as Player : undefined);

  // stamp every event with its playing time (or the edited moment's)
  const fire = (a: ScoreAction) => {
    const at = Date.now();
    dispatch({ ...a, payload: { ...a.payload, uid: (a.payload?.uid as string | undefined) ?? uid(), at,
      sec: editAt?.sec ?? matchSec(s, at), psec: editAt?.psec ?? periodSec(s, at), period: editAt?.period ?? s.period, ...(editAt ? { edit: true } : {}) } });
  };

  /* ---- who is on the field ---- */
  const stampXi = () => {
    for (const sd of ['home', 'away'] as const) {
      // IDs-only scoring: the stamp carries player ids only (invasion/actions.ts)
      const players = xiStamp(lineupOf(sd), rosterOf(sd)).players ?? [];
      if (!players.length) continue;
      if (JSON.stringify(players) === JSON.stringify(s.xi?.[sd]?.players ?? [])) continue;
      dispatch({ type: 'XI', payload: { team: sd, players } });
    }
  };
  const out = unavailable(s, now);
  const gone = (sd: Side, p: Player) => out[sd].has(p.id) || out[sd].has(p.fullName);
  const onField = (sd: Side): Player[] => {
    if (s.xi?.[sd]?.players?.length) {
      return leagueField(s, matchSec(s, now) / 60).onField[sd].map((f) => byId(sd, f.id, f.name)).filter((p): p is Player => !!p);
    }
    const lu = lineupOf(sd).filter((sl) => sl.playerId).map((sl) => byId(sd, sl.playerId, sl.playerName)).filter((p): p is Player => !!p);
    return (lu.length ? lu : rosterOf(sd)).filter((p) => !gone(sd, p));
  };
  const tempOff = (sd: Side) => new Set(openTemps(s, sd).map((o) => o.off.id).filter((x): x is string => !!x));
  /** the interchange bench: anyone not on the field, not sent off / binned, not off for an HIA (an interchanged player may come back) */
  const bench = (sd: Side): Player[] => {
    const on = new Set(onField(sd).map((p) => p.id));
    const temp = tempOff(sd);
    return rosterOf(sd).filter((p) => !on.has(p.id) && !gone(sd, p) && !temp.has(p.id));
  };
  const sanctionable = (sd: Side): Player[] => {
    const seen = new Set<string>();
    return [...onField(sd), ...rosterOf(sd).filter((p) => !gone(sd, p))].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  };
  const kickers = (sd: Side): Player[] => onField(sd);

  /* ---- recorders ---- */
  const TRACKED = trackedKeys(s);
  const credit = (e: Parameters<typeof eventCredits>[0]) => {
    const cr = eventCredits(e);
    return { attribution: creditAttribution(cr.first, 1, TRACKED), attribution2: creditAttribution(cr.second, 1, TRACKED) };
  };
  const conversionNext = (sd: Side) => {
    // golden point: a try ends the match (no conversion); a re-entered try keeps its own conversion row
    if (editAt || isGoldenPoint(s, s.period)) setFlow(null);
    else setFlow({ mode: 'conv', side: sd, step: 'result' });
  };
  const scoreTry = (sd: Side, scorer: Player | null, assist: Player | null, bonus?: boolean) => {
    fire({ type: 'TRY', side: sd, payload: bonus ? { bonus: true } : {}, ...credit({ type: 'try', bonus, playerId: scorer?.id, secondId: assist?.id }) });
    conversionNext(sd);
  };
  // invasion batch 5: an optional sanction for the offender, then the conversion
  // (golden point: the try ends the match — no step; a re-entry keeps its rows)
  const penaltyTry = (sd: Side) => {
    fire({ type: 'PENALTY_TRY', side: sd });
    if (editAt || isGoldenPoint(s, s.period)) conversionNext(sd);
    else setFlow({ mode: 'sanction', side: other(sd), step: 'kind', pt: sd });
  };
  const kick = (sd: Side, k: 'conv' | 'pen' | 'fg', made: boolean, p: Player | null, two = false) => {
    fire({ type: 'KICK', side: sd, payload: { kick: k, made, ...(two ? { two: true } : {}) }, ...credit({ type: 'kick', kick: k, made, two, playerId: p?.id }) });
    setFlow(null);
  };
  const sanction = (sd: Side, k: Sanction, p: Player | null) => {
    fire({ type: 'SANCTION', side: sd, payload: { sanction: k }, ...credit({ type: 'sanction', sanction: k, playerId: p?.id }) });
    ptNext();
  };
  /** after a penalty try's sanction step (or "No sanction"): its conversion */
  const ptNext = () => { if (flow?.mode === 'sanction' && flow.pt) conversionNext(flow.pt); else setFlow(null); };
  const sub = (sd: Side, off: Player | null, on: Player, kind: SubKind = 'perm', back = false) => {
    fire(subAction(sd, off, on, { ...(kind !== 'perm' ? { temp: kind } : {}), ...(back ? { back: true } : {}) }));
    setFlow(null);
  };
  const detail = (sd: Side, d: DetailKey, p: Player | null) => {
    fire({ type: 'DETAIL', side: sd, payload: { detail: d }, ...credit({ type: 'detail', detail: d, playerId: p?.id }) });
    setFlow(null);
  };
  /* ---- six-tackle sets ---- */
  const open = currentSet(s);
  const errorsOn = s.trackErrors === true;
  const setEnd = (how: SetEnd, p?: Player | null) => {
    const named = (how === 'error' || how === 'penalty' || how === 'penWon') && errorsOn;
    const d: DetailKey = how === 'error' ? 'error' : 'penalty';
    fire({ type: 'SET_END', payload: { how, ...(named ? { detail: d } : {}) },
      ...(named && open ? credit({ type: 'detail', detail: d, playerId: p?.id }) : {}) });
    setFlow(null);
  };

  /* ---- correct the timeline ---- */
  const removalActions = (e: LeagueEvent): ScoreAction[] => {
    const cr = eventCredits(e);
    return [{ type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) }];
  };
  const remove = (e: LeagueEvent) => { for (const a of removalActions(e)) dispatch(a); };
  // invasion batch 6: the "Try ruled out" button (the toggle on)
  const ruledOutOn = s.trackRuledOut === true;
  const edit = (e: LeagueEvent) => {
    if (e.type === 'pentry' || e.type === 'ruledout' || e.type === 'restart') { remove(e); return; }
    holdRemoval(removalActions(e));
    setEditAt({ sec: e.sec, psec: e.psec, period: e.period });
    setShowEdit(false);
    if (e.type === 'try') setFlow({ mode: 'try', side: e.side, step: s.bonusTry ? 'zone' : 'scorer' });
    else if (e.type === 'kick') setFlow(e.kick === 'conv' ? { mode: 'conv', side: e.side, step: 'result' } : { mode: 'kick', side: e.side, kick: e.kick === 'fg' ? 'fg' : 'pen', step: 'result' });
    else if (e.type === 'sanction') setFlow({ mode: 'sanction', side: e.side, step: 'kind' });
    else if (e.type === 'sub') setFlow({ mode: 'sub', side: e.side, step: 'kind' });
    // a detail re-entry keeps its kind (an error from the set panel too) — only the player changes
    else if (e.type === 'detail') setFlow({ mode: 'detail', side: e.side, step: 'player', detail: e.detail });
  };

  /* ---- clock ---- */
  const startStop = () => {
    const at = Date.now();
    if (running(s)) { dispatch({ type: 'CLOCK', payload: { run: false, at } }); return; }
    if (s.period === 1 && !periodStarted(s)) stampXi();
    dispatch({ type: 'CLOCK', payload: { run: true, at } });
  };
  const level = levelAtEnd(s);
  const lastOfPlan = s.period >= totalPeriods(s);
  const toMore = lastOfPlan && level && nextPlan(s).length > 0;
  const last = leagueLast(s);
  const gpWord = s.goldenTry ? 'golden try' : 'golden point';
  // SD-106: ending a half / full time asks first (ConfirmSheet).
  const endPeriod = async () => {
    if (!periodStarted(s)) return;
    const score = `${s.home}-${s.away}`;
    const ok = last ? await confirmMatchAction('fullTime', { score }) : await confirmMatchAction('endPeriod', { period: periodName(s, s.period), score });
    if (!ok) return;
    if (last) stampXi();
    dispatch({ type: 'END_PERIOD', payload: { at: Date.now() } });
  };
  const applyClock = () => {
    const m = /^(\d{1,3})(?::(\d{1,2}))?$/.exec(clockInput.trim());
    if (!m) return;
    // the scoreboard time (league counts up over the match), within this period
    const want = Number(m[1]) * 60 + Number(m[2] ?? 0);
    dispatch({ type: 'SET_CLOCK', payload: { periodSec: Math.max(0, want - nominalOffset(s, s.period)), at: Date.now() } });
    setSetting(false); setClockInput('');
  };

  /* ---- after the final whistle ---- */
  if (s.ended) {
    return (
      <View style={c.wrap}>
        <View style={c.panel}>
          <Text style={c.h}>Full time · {s.home}–{s.away}{s.plan.length > 2 ? ` (after ${gpWord})` : ''}</Text>
          <Text style={c.meta}>{level ? 'Draw.' : `${name(s.home > s.away ? 'home' : 'away')} win.`} Use “Correct the timeline” below to fix a moment.</Text>
        </View>
        <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} homeName={homeName} awayName={awayName} />
      </View>
    );
  }

  /* ---- flows ---- */
  const flowPanel = (() => {
    if (!flow) return null;
    const sd = flow.side;
    // wave 0 (score-on-close SC6): closing the assist step keeps the try (and its bonus zone)
    const saveAsIs = closeSaves({ editing: !!editAt, describing: flow.mode === 'try' && flow.step === 'assist' })
      ? () => { if (flow.mode === 'try' && flow.step === 'assist') scoreTry(sd, flow.scorer ?? null, null, flow.bonus); } : null;
    const head = (t: string) => (
      <View style={c.flowHead}>
        <Text style={[c.h, { color: color(sd) }]} numberOfLines={1}>{t} · {name(sd)}</Text>
        {/* a penalty try's sanction step: Cancel still goes on to its conversion */}
        <Text style={c.cancel} accessibilityRole="button" onPress={saveAsIs ?? (() => (flow.mode === 'sanction' && flow.pt ? ptNext() : setFlow(null)))}>{closeLabel(!!saveAsIs)}</Text>
      </View>
    );
    switch (flow.mode) {
      case 'try':
        if (flow.step === 'zone') return (
          <View style={c.panel}>{head('Try')}
            <View style={c.row}>
              <Button variant="primary" label="🏉 Try (4)" color={color(sd)} style={c.flex} onPress={() => setFlow({ ...flow, bonus: false, step: 'scorer' })} />
              <Button label="⭐ Bonus zone (5)" accessibilityLabel="Try in the bonus zone, 5 points" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, bonus: true, step: 'scorer' })} />
            </View>
          </View>
        );
        if (flow.step === 'scorer') return (
          <View style={c.panel}>{head(flow.bonus ? 'Bonus-zone try (5)' : 'Try (4)')}
            <Text style={c.small}>Who scored?</Text>
            <PlayerGrid players={onField(sd)} onPick={(p) => setFlow({ ...flow, scorer: p, step: 'assist' })}
              skip={{ label: 'Team try (no scorer)', onPress: () => scoreTry(sd, null, null, flow.bonus) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head('Try assist')}
            <PlayerGrid players={onField(sd).filter((p) => p.id !== flow.scorer?.id)} onPick={(p) => scoreTry(sd, flow.scorer ?? null, p, flow.bonus)}
              skip={{ label: 'No assist', onPress: () => scoreTry(sd, flow.scorer ?? null, null, flow.bonus) }} />
          </View>
        );
      case 'conv':
        if (flow.step === 'result') return (
          <View style={c.panel}>{head('Conversion (2)')}
            <View style={c.row}>
              <Button variant="primary" label="✓ Good" color={color(sd)} style={c.flex} onPress={() => setFlow({ ...flow, made: true, step: 'kicker' })} />
              <Button label="✗ Missed" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, made: false, step: 'kicker' })} />
            </View>
            <Button label="Not taken" variant="ghost" onPress={() => setFlow(null)} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`Conversion ${flow.made ? 'good' : 'missed'} — kicker`)}
            <PlayerGrid players={kickers(sd)} onPick={(p) => kick(sd, 'conv', !!flow.made, p)} skip={{ label: 'Skip kicker', onPress: () => kick(sd, 'conv', !!flow.made, null) }} />
          </View>
        );
      case 'kick': {
        const what = flow.kick === 'fg' ? 'Field goal' : 'Penalty goal (2)';
        if (flow.step === 'result') return (
          <View style={c.panel}>{head(what)}
            <View style={c.row}>
              <Button variant="primary" label="✓ Good" color={color(sd)} style={c.flex} onPress={() => setFlow({ ...flow, made: true, step: flow.kick === 'fg' && s.fg2 ? 'points' : 'kicker' })} />
              <Button label="✗ Missed" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, made: false, step: 'kicker' })} />
            </View>
            {flow.kick === 'fg' ? <Text style={c.meta}>A field goal (drop goal) is worth 1{s.fg2 ? ' — 2 from 40 metres or more' : ''}.</Text> : null}
          </View>
        );
        if (flow.step === 'points') return (
          <View style={c.panel}>{head('Field goal good')}
            <View style={c.row}>
              <Button variant="primary" label="1 point" color={color(sd)} style={c.flex} onPress={() => setFlow({ ...flow, two: false, step: 'kicker' })} />
              <Button label="2 points (40 m+)" accessibilityLabel="2 points, kicked from 40 metres or more" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, two: true, step: 'kicker' })} />
            </View>
          </View>
        );
        return (
          <View style={c.panel}>{head(`${flow.kick === 'fg' ? (flow.two ? '2-point field goal' : 'Field goal') : 'Penalty goal'} ${flow.made ? 'good' : 'missed'} — kicker`)}
            <PlayerGrid players={kickers(sd)} onPick={(p) => kick(sd, flow.kick, !!flow.made, p, !!flow.two)}
              skip={{ label: 'Skip kicker', onPress: () => kick(sd, flow.kick, !!flow.made, null, !!flow.two) }} />
          </View>
        );
      }
      case 'sanction': {
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head(flow.pt ? 'Penalty try — sanction for the offender? (optional)' : 'Sin bin · send-off')}
            <View style={c.row}>
              <Button label="⏱ Sin bin" accessibilityLabel={`Sin bin, ${s.sinBinMinutes} minutes`} variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, sanction: 'sinBin', step: 'player' })} />
              <Button label="🟥 Send off" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, sanction: 'sendOff', step: 'player' })} />
            </View>
            <Button label="📝 Put on report" variant="ghost" onPress={() => setFlow({ ...flow, sanction: 'report', step: 'player' })} />
            {flow.pt ? <Button label="✓ No sanction — to the conversion" variant="ghost" onPress={ptNext} /> : null}
            <Text style={c.meta}>Sin bin: {s.sinBinMinutes} minutes of playing time, the team plays a player short. Send-off: off for the rest of the match, not replaced. On report: play goes on — the judiciary decides.</Text>
          </View>
        );
        const k = flow.sanction ?? 'sinBin';
        return (
          <View style={c.panel}>{head(k === 'sinBin' ? 'Sin bin' : k === 'sendOff' ? 'Send off' : 'On report')}
            <PlayerGrid players={sanctionable(sd)} onPick={(p) => sanction(sd, k, p)} />
            {k === 'sinBin' && sanctionable(sd).some((p) => sinBinsOf(s, sd, { id: p.id, name: p.fullName }) > 0)
              ? <Text style={c.meta}>A second sin bin isn’t a send-off by itself — record a send-off if the referee gives one.</Text> : null}
          </View>
        );
      }
      case 'sub': {
        if (flow.step === 'kind') {
          const temps = openTemps(s, sd);
          return (
            <View style={c.panel}>{head('Interchange')}
              <Button label="🔁 Interchange" variant="ghost" onPress={() => setFlow({ ...flow, kind: 'perm', step: 'off' })} />
              <View style={c.row}>
                <Button label="🩺 HIA (free)" accessibilityLabel="Head injury assessment: a free interchange" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, kind: 'hia', step: 'off' })} />
                <Button label="🩸 Blood bin (free)" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, kind: 'blood', step: 'off' })} />
              </View>
              {temps.length ? <Button label={`↩ Back on (${temps.length})`} variant="ghost" onPress={() => setFlow({ ...flow, step: 'back' })} /> : null}
              <Text style={c.meta}>{s.maxInterchanges > 0 ? `${interchangesUsed(s, sd)} of ${s.maxInterchanges} interchanges used` : 'Unlimited interchanges'}. HIA / blood bin interchanges don’t count. An interchanged player may come back on.</Text>
            </View>
          );
        }
        if (flow.step === 'back') return (
          <View style={c.panel}>{head('Back on')}
            {openTemps(s, sd).map((o) => {
              const offP = byId(sd, o.off.id, o.off.name);
              const onP = byId(sd, o.on.id, o.on.name);
              if (!offP || !onP) return null;
              return <Button key={o.id} label={`${offP.fullName} ⬆ · ${onP.fullName} ⬇ (${o.temp === 'hia' ? 'HIA' : 'blood bin'})`} variant="ghost" onPress={() => sub(sd, onP, offP, 'perm', true)} />;
            })}
          </View>
        );
        if (flow.step === 'off') {
          const live = leagueLiveField(s, now, playerNameOf);
          return (
            <View style={c.panel}>{head(`${flow.kind === 'hia' ? 'HIA' : flow.kind === 'blood' ? 'Blood bin' : 'Interchange'} — who comes off?`)}
              <PlayerGrid players={onField(sd)} onPick={(p) => setFlow({ ...flow, off: p, step: 'on' })}
                skip={live.short[sd] > 0 && !live.suspended.some((x) => x.side === sd) && !s.events.some((e) => e.type === 'sanction' && e.sanction === 'sendOff' && e.side === sd)
                  ? { label: 'No one — fill the empty place', onPress: () => setFlow({ ...flow, off: null, step: 'on' }) } : undefined} />
            </View>
          );
        }
        const full = (flow.kind ?? 'perm') === 'perm' && !!flow.off && s.maxInterchanges > 0 && interchangesUsed(s, sd) >= s.maxInterchanges;
        return (
          <View style={c.panel}>{head(flow.off ? `On for ${flow.off.fullName}` : 'Who comes on?')}
            {full ? <Text style={c.short}>All {s.maxInterchanges} interchanges used — only allowed if the rules say so.</Text> : null}
            <PlayerGrid players={bench(sd)} onPick={(p) => sub(sd, flow.off ?? null, p, flow.kind ?? 'perm')} />
          </View>
        );
      }
      case 'ruledout':
        return (
          <View style={c.panel}>{head('❎ Try ruled out')}
            <Text style={c.meta}>Why? (optional — one tap logs it; the score doesn’t move)</Text>
            <View style={c.chips}>
              <SelectChip label="After the Bunker" active={!!flow.review} onPress={() => setFlow({ ...flow, review: !flow.review })} />
            </View>
            <View style={c.chips}>
              {RULED_OUT_REASONS.rugby_league.map((r) => <SelectChip key={r} label={RULED_OUT_LABEL[r]} active={false} onPress={() => { fire(ruledOutAction('rugby_league', sd, { reason: r, review: flow.review })); setFlow(null); }} />)}
            </View>
            <Button label="Log it — no reason" variant="ghost" onPress={() => { fire(ruledOutAction('rugby_league', sd, { review: flow.review })); setFlow(null); }} />
            <Text style={c.meta}>Already on the board? Remove the try from the timeline too.</Text>
          </View>
        );
      case 'detail': {
        // with six-tackle sets on, the side in possession's errors go through the set's Error button
        const kinds = TRACK_FLAGS.filter((f) => s[f] === true).flatMap((f) => FLAG_DETAILS[f]).filter((d) => !(d === 'error' && s.trackSets));
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head('Detail')}
            <View style={c.grid}>
              {kinds.map((d) => <Button key={d} label={DETAIL_LABEL[d]} variant="ghost" style={c.typeBtn} onPress={() => setFlow({ ...flow, detail: d, step: 'player' })} />)}
            </View>
          </View>
        );
        const d = flow.detail ?? 'tackle';
        return (
          <View style={c.panel}>{head(DETAIL_LABEL[d])}
            <PlayerGrid players={onField(sd)} onPick={(p) => detail(sd, d, p)}
              skip={{ label: TEAM_DETAIL.includes(d) ? 'Team (no name)' : 'Skip player', onPress: () => detail(sd, d, null) }} />
          </View>
        );
      }
      case 'setEnd':
        return (
          <View style={c.panel}>{head(flow.how === 'error' ? 'Error' : flow.how === 'penWon' ? `Penalty to ${name(other(sd))} — conceded` : 'Penalty against')}
            <Text style={c.small}>Who? (optional — tapping records it)</Text>
            <PlayerGrid players={onField(sd)} onPick={(p) => setEnd(flow.how, p)} skip={{ label: 'Team (no name)', onPress: () => setEnd(flow.how, null) }} />
          </View>
        );
    }
  })();

  const live = leagueLiveField(s, now, playerNameOf);
  const detailOn = TRACK_FLAGS.some((f) => f !== 'trackSets' && s[f] === true);
  const sideCol = (sd: Side) => (
    <View key={sd} style={c.col}>
      <Text style={[c.team, { color: color(sd) }]} numberOfLines={1}>{name(sd)}</Text>
      <MainAction label="🏉 Try" color={color(sd)} onPress={() => setFlow({ mode: 'try', side: sd, step: s.bonusTry ? 'zone' : 'scorer' })} />
      <Button label="🎯 Kick at goal" accessibilityLabel="Penalty goal, 2 points" variant="ghost" onPress={() => setFlow({ mode: 'kick', side: sd, kick: 'pen', step: 'result' })} />
      <Button label="🥅 Field goal" accessibilityLabel={`Field goal (drop goal), ${s.fg2 ? '1 or 2 points' : '1 point'}`} variant="ghost" onPress={() => setFlow({ mode: 'kick', side: sd, kick: 'fg', step: 'result' })} />
      <Button label="🏉 Penalty try" accessibilityLabel="Penalty try, 4 points, then the conversion" variant="ghost" onPress={() => penaltyTry(sd)} />
      <Button label="⏱ Sin bin · off" accessibilityLabel="Sin bin, send-off or on report" variant="ghost" onPress={() => setFlow({ mode: 'sanction', side: sd, step: 'kind' })} />
      <Button label="🔁 Interchange" variant="ghost" onPress={() => setFlow({ mode: 'sub', side: sd, step: 'kind' })} />
      {detailOn ? <Button label="📋 Detail" accessibilityLabel="Player detail: tackles, runs, line breaks, offloads, errors, penalties" variant="ghost" onPress={() => setFlow({ mode: 'detail', side: sd, step: 'kind' })} /> : null}
      {/* invasion batch 6: a try ruled out (Bunker or not) — only with the toggle on */}
      {ruledOutOn ? <Button label="❎ Try ruled out" accessibilityLabel={`${name(sd)} try ruled out`} variant="ghost" onPress={() => setFlow({ mode: 'ruledout', side: sd })} /> : null}
      {/* invasion batch 6: 40/20, 20/40, drop-outs, a penalty to touch / tapped — one tap, the team */}
      {s.trackRestarts ? (
        <View style={c.chips} accessibilityLabel={`Kicks and restarts for ${name(sd)}`}>
          {LEAGUE_RESTARTS.map((k) => <SelectChip key={k} label={RESTART_LABEL[k]} active={false} onPress={() => fire(restartAction(sd, k))} />)}
        </View>
      ) : null}
      {live.short[sd] > 0 ? <Text style={c.short}>Playing {live.short[sd]} short</Text> : null}
    </View>
  );

  /* ---- six-tackle sets: the tackle count and the set endings ---- */
  const setsPanel = s.trackSets && periodStarted(s) ? (() => {
    if (!open) return (
      <View style={c.panel}>
        <Text style={c.small}>Six-tackle sets · who has the ball?</Text>
        <View style={c.row}>
          {(['home', 'away'] as const).map((sd) => (
            <Button variant="primary" key={sd} label={`Ball: ${name(sd)}`} color={color(sd)} style={c.flex} accessibilityLabel={`${name(sd)} have the ball`} onPress={() => fire({ type: 'SET_BALL', side: sd })} />
          ))}
        </View>
      </View>
    );
    const sd = open.side;
    const lastOne = open.tackles + 1 >= s.setTackles;
    const fh = setFigures(s, 'home'), fa = setFigures(s, 'away');
    return (
      <View style={[c.panel, { borderColor: color(sd) }]}>
        <Text style={[c.setLine, { color: color(sd) }]} accessibilityRole="header">Tackle {open.tackles} · {name(sd)} in possession</Text>
        <TouchableOpacity style={[c.bigTap, { backgroundColor: color(sd) }]} activeOpacity={0.8} accessibilityRole="button"
          accessibilityLabel={`Tackle ${open.tackles + 1}${lastOne ? ', the last: the ball goes over' : ''}, ${name(sd)} in possession`} onPress={() => fire({ type: 'TACKLE' })}>
          <Text style={c.bigTapTxt}>Tackle {open.tackles + 1}{lastOne ? ' · handover' : ''}</Text>
        </TouchableOpacity>
        <View style={c.row}>
          <Button label="🦶 Kick" accessibilityLabel={`${name(sd)} kick: ${name(other(sd))} ball`} variant="ghost" style={c.flex} onPress={() => setEnd('kick')} />
          <Button label="✋ Error" accessibilityLabel={`${name(sd)} error: ${name(other(sd))} ball`} variant="ghost" style={c.flex}
            onPress={() => (errorsOn ? setFlow({ mode: 'setEnd', side: sd, how: 'error' }) : setEnd('error'))} />
        </View>
        <View style={c.row}>
          <Button label="⚖ Penalty against" accessibilityLabel={`Penalty against ${name(sd)}: ${name(other(sd))} ball`} variant="ghost" style={c.flex}
            onPress={() => (errorsOn ? setFlow({ mode: 'setEnd', side: sd, how: 'penalty' }) : setEnd('penalty'))} />
          <Button label="🔂 Six again" accessibilityLabel={`Six again: a fresh set for ${name(sd)}`} variant="ghost" style={c.flex} onPress={() => setEnd('restart')} />
        </View>
        {/* invasion batch 5: a full penalty against the defence — a fresh set, the defence's penalty conceded (who: optional) */}
        <Button label={`📣 Penalty to ${name(sd)}`} accessibilityLabel={`Penalty to ${name(sd)}, against ${name(other(sd))}: a fresh set for ${name(sd)}`} variant="ghost"
          onPress={() => (errorsOn ? setFlow({ mode: 'setEnd', side: other(sd), how: 'penWon' }) : setEnd('penWon'))} />
        <Text style={c.link} accessibilityRole="button" accessibilityLabel={`Ball to ${name(other(sd))} (no ending)`} onPress={() => fire({ type: 'SET_BALL', side: other(sd) })}>↔ Ball to {name(other(sd))}</Text>
        <Text style={c.meta}>Completions {completionText(fh)} – {completionText(fa)}. The {s.setTackles}th tackle hands the ball over by itself; a score ends the set. Six again: a set restart. Penalty to {name(sd)}: a penalty against {name(other(sd))}.</Text>
      </View>
    );
  })() : null;

  const ps = periodSec(s, now);
  const len = periodLen(s, s.period);
  return (
    <View style={c.wrap}>
      {editAt ? <BackfillBar at={`${periodName(s, editAt.period)} ${clockAt(s, editAt.period, editAt.psec)}`} onLive={() => setFlow(null)} /> : null}
      <View style={c.panel}>
        <View style={c.clockRow}>
          <View style={{ flex: 1 }}>
            <Text style={c.small}>{periodLong(s, s.period)}</Text>
            <Text style={[c.clock, ps > len ? { color: theme.colors.danger } : null]}>{clockFace(s, now)}</Text>
          </View>
          <Button label={running(s) ? '⏸ Pause clock' : periodStarted(s) ? '▶ Resume' : s.period === 1 ? '▶ Kick-off' : `▶ Start ${periodName(s, s.period)}`} variant={running(s) ? 'ghost' : 'primary'} onPress={startStop} />
        </View>
        <View style={c.row}>
          {/* the final whistle's Full time sits at the bottom of the controls (SD-106) */}
          {!last ? <Button label={`End ${periodName(s, s.period)} →`} variant={periodStarted(s) && running(s) ? 'primary' : 'ghost'} style={c.flex} disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
          <Button label="⏱ Set clock" variant="ghost" style={c.flex} onPress={() => setSetting((v) => !v)} />
        </View>
        {toMore && periodStarted(s) ? <Text style={c.meta}>Level — ending this period goes on to {gpWord} ({s.gpMinutes} min{s.decider === 'gpFinal' ? ' periods until someone scores' : ' × 2, then the draw stands'}).</Text> : null}
        {setting ? (
          <View style={c.row}>
            <View style={c.flex}><TextField label="Match clock (mm:ss)" value={clockInput} onChange={setClockInput} placeholder={clockFace(s, now).split(' ')[0]} /></View>
            <Button variant="primary" label="Set" onPress={applyClock} />
          </View>
        ) : null}
        {ps >= len && running(s) ? <Text style={c.short}>Siren — play goes on until the ball is next dead.</Text> : null}
        {!running(s) && periodStarted(s) ? (
          <View style={c.stopped} accessibilityRole="alert">
            <IconText label={"⏸ Clock stopped"} style={c.stoppedTxt} />
            <Button variant="primary" label="▶ Resume" onPress={startStop} />
          </View>
        ) : null}
      </View>

      {flowPanel ?? (
        <>
          {setsPanel}
          <View style={c.cols}>{sideCol('home')}{sideCol('away')}</View>
        </>
      )}

      <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} onEdit={edit} homeName={homeName} awayName={awayName} />
      {last ? <Button label="🏁 Full time" variant="danger" disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
      {last && !periodStarted(s) ? <Text style={c.gk}>Start {periodName(s, s.period)} first — Full time unlocks once it’s under way.</Text> : null}
    </View>
  );
};

/** The scorer's "Correct the timeline" list: remove a moment, or re-enter it. */
function EditList({ s: s0, show, setShow, onRemove, onEdit, homeName, awayName }: {
  s: LeagueState; show: boolean; setShow: (v: boolean) => void; onRemove: (e: LeagueEvent) => void; onEdit?: (e: LeagueEvent) => void; homeName: string; awayName: string;
}) {
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(s0, nameOf), [s0, nameOf]); // IDs-only scoring: names by id
  if (!s.events.length) return null;
  return (
    <View style={c.panel}>
      <Text style={c.link} accessibilityRole="button" onPress={() => setShow(!show)}>{show ? 'Hide' : '✎ Correct the timeline'}</Text>
      {show ? [...s.events].reverse().slice(0, 40).map((e) => {
        const d = describeEvent(e);
        return (
          <View key={e.id} style={c.editRow}>
            <Text style={c.editWhen}>{eventWhen(s, e)}</Text>
            <Text style={c.editLabel} numberOfLines={2}>{d.icon} {d.label} · {e.side === 'home' ? homeName : awayName}{d.detail ? ` · ${d.detail}` : ''}</Text>
            {onEdit && e.type !== 'pentry' ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${d.label}`} onPress={() => onEdit(e)} /> : null}
            <RowAction label="✕" tone="remove" a11y={`Remove ${d.label}`} onPress={() => void confirmRemove(`${d.label} (${eventWhen(s, e)})`, () => onRemove(e),
              pointsOf(e) ? 'The score and player stats re-adjust.' : undefined)} />
          </View>
        );
      }) : null}
    </View>
  );
}

/* ------------------------------- live views -------------------------------- */

const LiveClock: NonNullable<SportPlugin<LeagueState>['LiveClock']> = ({ state }) => {
  const s = state as LeagueState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock?.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const label = s.ended ? (s.plan.length > 2 ? (s.goldenTry ? 'FT (golden try)' : 'FT (golden point)') : 'FT')
    : !periodStarted(s) ? (s.period === 1 ? '—' : `${periodName(s, s.period)} next`) : `${periodName(s, s.period)} ${clockFace(s, now)}`;
  const { nameOf } = useMask();
  const live = s.ended ? null : leagueLiveField(s, now, nameOf);
  const set = s.ended || !s.trackSets ? null : currentSet(s);
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing(1), flex: 1, minWidth: 0 }}>
      <View style={c.clockRow2}>
        <View style={[c.dot, { backgroundColor: running(s) ? theme.colors.danger : theme.colors.textMuted }]} />
        <Text style={c.clockSmall}>{label}</Text>
      </View>
      {set ? <Text style={c.meta}>Tackle {set.tackles}</Text> : null}
      {live ? (
        <View style={{ alignSelf: 'stretch' }}>
          <FieldBanner suspended={live.suspended} onField={live.short.home || live.short.away ? live.onField : null} />
        </View>
      ) : null}
    </View>
  );
};

/** Points per half (and golden point), the live half highlighted. */
const LeagueScoreboard: NonNullable<SportPlugin<LeagueState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as LeagueState;
  // a match won in the first golden-point period shows no empty second one
  const n = s.ended ? s.period : Math.max(totalPeriods(s), s.period);
  const columns = Array.from({ length: n }, (_, i) => ({ label: periodName(s, i + 1), highlight: !s.ended && i + 1 === s.period }));
  const pts = (sd: Side, p: number) => s.events.filter((e) => e.side === sd && e.period === p).reduce((a, e) => a + pointsOf(e), 0);
  const cells = (sd: Side) => Array.from({ length: n }, (_, i) => (i + 1 <= s.period || s.ended ? String(pts(sd, i + 1)) : ''));
  const r = result(s);
  return (
    <LineScoreboard
      live={live}
      clock={<LiveClock state={s} />}
      leadLabel="PTS"
      columns={columns}
      winner={r && r.winner !== 'draw' ? r.winner : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.home), cells: cells('home') }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.away), cells: cells('away') }}
    />
  );
};

/** Match tabs (2026-10-22) — the same composition as rugby union: the
 *  play-by-play on Commentary (its "Key moments" chip replaces the old
 *  separate Key-moments view); match stats (half / category filters) and the
 *  box score on Stats. The sin-bin banner stays on the scoreboard. */
const VIEWS = [{ key: 'stats', label: 'Match stats' }, { key: 'box', label: 'Box score' }] as const;
type TabProps = Parameters<NonNullable<SportPlugin<LeagueState>['LiveExtras']>>[0];

const LeagueCommentary = ({ state, homeName, awayName, homeColor, awayColor }: TabProps) => {
  // IDs-only scoring: names looked up by id for this viewer
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(state as LeagueState, nameOf), [state, nameOf]);
  return (
    <GroupedFeed groups={leagueCommentary(s, { home: homeName, away: awayName })} homeColor={homeColor} awayColor={awayColor} tags={LEAGUE_FEED_TAGS} scopeLabel={leagueScopeLabel(s)}
      emptyText="Nothing yet — the commentary fills in from the kick-off." />
  );
};

const LeagueStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  // IDs-only scoring: names looked up by id for this viewer
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(state as LeagueState, nameOf), [state, nameOf]);
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const scopes = n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
  return (
    <SubViews label="Stats view" views={VIEWS.map((v) => ({
      ...v,
      render: () => v.key === 'stats' ? (
        <StatSheetView build={(sc) => leagueSheet(s, sc, s.ended ? undefined : matchSec(s, Date.now()))} scopes={scopes}
          homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />
      ) : (
        <MatchBoxScore sport="rugby_league" source={leagueBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} show="box" />
      ),
    }))} />
  );
};

/* --------------------------------- plugin ---------------------------------- */

export const rugbyLeaguePlugin: SportPlugin<LeagueState> = {
  ...RUGBY_LEAGUE_META,
  matchRecords: leagueMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete,
  result,
  summary: (s) => ({
    homeScore: String(s.home),
    awayScore: String(s.away),
    statusLine: s.ended ? (s.plan.length > 2 ? `Full Time (${s.goldenTry ? 'golden try' : 'golden point'})` : 'Full Time')
      : !periodStarted(s) && s.period > 1 ? (s.period === 2 ? 'Half-time' : `End of ${periodName(s, s.period - 1)}`)
      : periodLong(s, s.period)[0].toUpperCase() + periodLong(s, s.period).slice(1),
    homeReds: s.events.filter((e) => e.type === 'sanction' && e.sanction === 'sendOff' && e.side === 'home').length,
    awayReds: s.events.filter((e) => e.type === 'sanction' && e.sanction === 'sendOff' && e.side === 'away').length,
  }),
  statTotals: leagueTotals,
  standingsUnits: leagueStandingsUnits as SportPlugin<LeagueState>['standingsUnits'],
  undoLabel: leagueUndoLabel,
  tickerDetail: leagueTickerDetail,
  tickerFlash: leagueTickerFlash,
  voice: { hints: ['try {name} assist {name}', 'conversion good {name}', 'penalty goal {name}', 'field goal {name}', 'sin bin {name}', 'penalty try home', 'tackle', 'six again', 'end half'], parse: leagueVoice, ends: leagueVoiceEnds },
  ScoringControls,
  LiveClock,
  Scoreboard: LeagueScoreboard,
  matchTabs: { Commentary: LeagueCommentary, Stats: LeagueStats },
  formation: (perSide) => leagueFormation(perSide),
  Court: LeaguePitch,
  liveSettings: LEAGUE_LIVE_SETTINGS,
};

const c = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  panel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' },
  flex: { flex: 1 },
  typeBtn: { flexBasis: '45%', flexGrow: 1 },
  cols: { flexDirection: 'row', gap: theme.spacing(2) },
  col: { flex: 1, gap: theme.spacing(2), minWidth: 0 },
  team: { fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  h: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flexShrink: 1 },
  small: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  clock: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900', fontVariant: ['tabular-nums'] },
  clockRow2: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  clockSmall: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  dot: { width: 9, height: 9, borderRadius: 5 },
  gk: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textAlign: 'center' },
  short: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', textAlign: 'center' },
  flowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  cancel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(2) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1) },
  pchip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, maxWidth: '100%' },
  pnum: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pname: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  skip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'transparent' },
  skipTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  setLine: { fontSize: theme.font.h3, fontWeight: '900', fontVariant: ['tabular-nums'] },
  bigTap: { minHeight: 72, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing(3) },
  bigTapTxt: { color: theme.colors.onFill, fontSize: theme.font.h3, fontWeight: '900' },
  stopped: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent },
  stoppedTxt: { flex: 1, color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800', paddingVertical: theme.spacing(3) },
  editRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editWhen: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', width: 72 },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});
