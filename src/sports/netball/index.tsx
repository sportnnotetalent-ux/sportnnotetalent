/**
 * Netball plugin (World Netball) — SD-146. Archetype: goal / time, on a
 * stoppable game clock (4 quarters counting down, or 2 halves). The pure rules
 * live in ./engine.ts; the field tracker and statTotals in ./totals.ts, the
 * box score in ./box.ts.
 *
 * Built for ONE person scoring on a phone: each side has two big goal buttons
 * — the GS and the GA by name, straight from the line-up — so a goal is one
 * tap; "Miss" the same. The centre pass alternates by itself ("⚪ Centre:
 * Team" — the scorer can swap it if the umpire's order differs). Everything
 * else (intercepts, deflections, rebounds, turnovers, penalties, sanctions,
 * substitutions, position changes, held time) sits behind "More". With
 * "Feeds & rebounds" on (match settings), a goal / miss also asks who fed it
 * and who took the rebound.
 *
 * Corrections: "Correct the timeline" removes or re-enters a past moment
 * (REMOVE_EVENT with the reversed credits — a miss's rebound goes with it —
 * then the same flow stamped at the original time, SD-114).
 */
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { withNames, nameFor } from '../invasion/names';
import { subAction } from '../invasion/actions';
import { ensureContrast } from '../../core/contrast';
import { Button, SelectChip, TextField } from '../../components/ui';
import { confirmMatchAction } from '../../components/ConfirmSheet';
import { LineScoreboard } from '../../components/LineScoreboard';
import { MatchBoxScore } from '../../components/BoxScore';
import { FieldBanner } from '../FieldBanner';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import {
  init, reducer, isComplete, result, matchSec, periodLen, clockFace, periodName, periodLong, periodStarted, running, timeUp,
  eventCredits, creditAttribution, centreInfo, lineupAt, timeoutCheck, sanctionsOf, totalPeriods, isOpen, playOnLead, other,
  NETBALL_PRESETS, NETBALL_LIVE_SETTINGS, LIVE_KEYS, POSITIONS, POS_AREAS,
  superShotLive, superShotText, SUPER_SHOT_RULE_OPTIONS, goalPoints, TURNOVER_TYPES, TURNOVER_LABEL, tossUpBlocked,
  type NetballEvent, type NetballState, type Pos, type Sanction, type Side, type StatKind, type StopReason, type PenaltyKind, type TurnoverType,
} from './engine';
import { PlayFeed } from '../PlayFeed';
import { CategoryStatsPanel } from '../CategoryStatsPanel';
import { SubViews } from '../SubViews';
import { netballFeed } from './commentary';
import { netballPanel, nbPanelPeriods } from './panel';
import { netballTotals, netballLiveField, unavailable } from './totals';
import { netballBox } from './box';
import { describeEvent, eventWhen, timelineEvents } from './timeline';
import { netballTickerDetail, netballTickerFlash } from './ticker';
import { netballFormation, NetballCourt } from './court';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';
import { netballVoice, netballVoiceEnds, netballLast } from './voice';
import { NETBALL_META } from './meta';
import { netballMatchRecords } from './records';
import { IconText } from '../../components/Icon';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TRACKED: string[] = [...LIVE_KEYS];
const REBOUND: StatKind = 'rebound';
const isPos = (p?: string | null): p is Pos => !!p && (POSITIONS as readonly string[]).includes(p);
const STAT_BTN: { kind: StatKind; label: string; a11y: string }[] = [
  { kind: 'intercept', label: '✂️ Intercept', a11y: 'Intercept' },
  { kind: 'deflection', label: '☝️ Deflection', a11y: 'Deflection' },
  { kind: 'rebound', label: '⤴️ Rebound', a11y: 'Rebound' },
  { kind: 'turnover', label: '⚠️ Turnover', a11y: 'Turnover (lost the ball)' },
];
/** Deep wave — "Gains & pick-ups": a loose ball won (statTotals-only credit). */
const PICKUP_BTN: { kind: StatKind; label: string; a11y: string } = { kind: 'pickup', label: '🤲 Pick-up', a11y: 'Pick-up (loose ball won)' };
/** Deep wave — who can take a centre pass (the centre third, not the C). */
const CPR_POS: Pos[] = ['WA', 'GA', 'WD', 'GD'];

/* ------------------------------ player picker ------------------------------ */

function PlayerGrid({ players, onPick, skip, tag }: { players: Player[]; onPick: (p: Player) => void; skip?: { label: string; onPress: () => void }; tag?: (p: Player) => string | undefined }) {
  return (
    <View style={c.grid}>
      {players.map((p) => (
        <TouchableOpacity key={p.id} style={c.pchip} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${p.fullName}${tag?.(p) ? `, ${tag(p)}` : ''}`} onPress={() => onPick(p)}>
          <Text style={c.pnum}>{tag?.(p) ?? p.jerseyNo ?? '–'}</Text>
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

type Flow =
  | { mode: 'goal'; side: Side; pos: Pos; shooter: Player | null; step: 'feed' }
  | { mode: 'miss'; side: Side; pos: Pos; shooter: Player | null; step: 'feed' | 'rebound'; feeder?: Player | null }
  | { mode: 'shooter'; side: Side; pos: Pos; miss: boolean }
  // Deep wave: a deflection's outcome / a turnover's type follow the player (when tracked)
  | { mode: 'stat'; side: Side; kind: StatKind; player?: Player | null; step?: 'outcome' }
  | { mode: 'penalty'; side: Side; step: 'kind' | 'player'; kind?: PenaltyKind }
  | { mode: 'sanction'; side: Side; step: 'kind' | 'player'; kind?: Sanction }
  | { mode: 'sub'; side: Side; step: 'off' | 'on' | 'pos'; off?: Player | null; on?: Player }
  | { mode: 'pos'; side: Side; step: 'player' | 'pos'; player?: Player }
  | { mode: 'hold' };

/* -------------------------------- controls --------------------------------- */

const ScoringControls: SportPlugin<NetballState>['ScoringControls'] = ({
  state: liveState, dispatch: rawDispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeLineup = [], awayLineup = [],
}) => {
  const { view: s, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  // IDs-only scoring: the state keeps player ids; names are looked up when shown
  const { nameOf: playerNameOf } = useMask();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [editAt, setEditAt] = useState<{ sec: number; period: number } | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [more, setMore] = useState(false);
  const [clockInput, setClockInput] = useState('');
  const [setting, setSetting] = useState(false);
  const [official, setOfficial] = useState('');
  // Deep wave: "⭐ Super shot" armed for the next shot of this side (super-shot formats)
  const [armed, setArmed] = useState<Side | null>(null);
  const [tossWhy, setTossWhy] = useState<Side | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  // deep wave: a cancelled re-entry of a super shot doesn't leave the next shot armed
  useEffect(() => { if (flow === null && editAt) { setEditAt(null); dropHeldRemoval(); setArmed(null); } }, [flow]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const name = (sd: Side) => (sd === 'home' ? homeName : awayName);
  const color = (sd: Side) => (sd === 'home' ? homeColor ?? theme.colors.home : awayColor ?? theme.colors.away);
  /** team colour as TEXT on a panel: darkened / lightened to AA (SD-155) */
  const ink = (sd: Side) => ensureContrast(color(sd), theme.colors.surface);
  const rosterOf = (sd: Side) => (sd === 'home' ? homeRoster : awayRoster);
  const lineupSlots = (sd: Side) => (sd === 'home' ? homeLineup : awayLineup);
  // IDs-only scoring: a player off the squad is listed by id; an older log's
  // name-only player with no squad match is not pickable (a made-up
  // `name:<name>` id would put the name into the public log).
  const byId = (sd: Side, id?: string, nm?: string): Player | undefined =>
    rosterOf(sd).find((p) => (id && p.id === id) || (!id && nm && p.fullName === nm)) ?? (id ? { id, fullName: nameFor(playerNameOf, id, nm) ?? 'Player', sports: ['netball'] } as Player : undefined);

  const fire = (a: ScoreAction) => {
    const at = Date.now();
    dispatch({ ...a, payload: { ...a.payload, uid: (a.payload?.uid as string | undefined) ?? uid(), at, sec: editAt?.sec ?? matchSec(s, at), period: editAt?.period ?? s.period, ...(editAt ? { edit: true } : {}) } });
  };

  /* ---- who plays where ---- */
  const stampOf = (sd: Side) => {
    const pos: Partial<Record<Pos, { id: string; name?: string }>> = {};
    for (const sl of lineupSlots(sd)) {
      if (!sl.playerId || !isPos(sl.position)) continue;
      pos[sl.position] = { id: sl.playerId }; // IDs-only scoring: the id only
    }
    return pos;
  };
  const stampXi = () => {
    for (const sd of ['home', 'away'] as const) {
      if (s.xi?.[sd]) continue; // the scorer already set the positions here
      const pos = stampOf(sd);
      if (!Object.keys(pos).length) continue;
      if (JSON.stringify(pos) === JSON.stringify(s.xi?.[sd]?.pos ?? {})) continue;
      dispatch({ type: 'XI', payload: { team: sd, pos } });
    }
  };
  // before the first centre pass the line-up comes from the team sheet; after, from the log
  const lineup = (sd: Side): Partial<Record<Pos, Player>> => {
    const raw = s.xi?.[sd] || s.events.some((e) => e.side === sd && (e.type === 'pos' || e.type === 'sub')) ? lineupAt(s, sd) : Object.fromEntries(Object.entries(stampOf(sd)).map(([k, v]) => [k, { id: v.id, name: v.name }]));
    const out: Partial<Record<Pos, Player>> = {};
    for (const p of POSITIONS) { const w = raw[p]; if (w) { const pl = byId(sd, w.id, w.name); if (pl) out[p] = pl; } }
    return out;
  };
  const out = unavailable(s, now);
  const gone = (sd: Side, p?: Player) => !!p && (out[sd].has(p.id) || out[sd].has(p.fullName));
  const posOfPlayer = (sd: Side, p: Player): Pos | undefined => { const l = lineup(sd); return POSITIONS.find((x) => l[x]?.id === p.id); };
  const onCourt = (sd: Side): Player[] => {
    const l = lineup(sd);
    const placed = POSITIONS.map((p) => l[p]).filter((p): p is Player => !!p && !gone(sd, p));
    return placed.length ? placed : rosterOf(sd).filter((p) => !gone(sd, p));
  };
  const bench = (sd: Side): Player[] => {
    const on = new Set(POSITIONS.map((p) => lineup(sd)[p]?.id).filter(Boolean));
    return rosterOf(sd).filter((p) => !on.has(p.id) && !gone(sd, p));
  };
  /** court + bench, once each (no line-up yet: both are the roster) */
  const everyone = (sd: Side): Player[] => [...new Map([...onCourt(sd), ...bench(sd)].map((p) => [p.id, p])).values()];
  const tagOf = (sd: Side) => (p: Player) => posOfPlayer(sd, p);
  const live = netballLiveField(s, now, playerNameOf);

  /* ---- recorders ---- */
  const credit = (e: Parameters<typeof eventCredits>[0]) => {
    const cr = eventCredits(e);
    return { attribution: creditAttribution(cr.first, 1, TRACKED), attribution2: creditAttribution(cr.second, 1, TRACKED) };
  };
  // Deep wave: an armed super shot scores 2 / is a super-shot attempt (then disarms)
  const superArmed = (sd: Side) => armed === sd && !!s.superShot && (superShotLive(s, Date.now()) || !!editAt);
  // Round 2: "Super shot" / "2-point shot" and its zone, per the organiser's preset
  const ssText = superShotText(s);
  const goal = (sd: Side, pos: Pos, shooter: Player | null, feeder: Player | null) => {
    const two = superArmed(sd);
    setArmed(null);
    fire({ type: 'GOAL', side: sd, payload: { pos, ...(two ? { points: 2 } : {}) }, ...credit({ type: 'goal', playerId: shooter?.id, secondId: feeder?.id }) });
    setFlow(null);
  };
  const miss = (sd: Side, pos: Pos, shooter: Player | null, feeder: Player | null, rebound?: { side: Side; p: Player } | null) => {
    const id = uid();
    const ss = superArmed(sd);
    setArmed(null);
    fire({ type: 'MISS', side: sd, payload: { pos, uid: id, ...(ss ? { ss: true } : {}) }, ...credit({ type: 'miss', playerId: shooter?.id, secondId: feeder?.id }) });
    if (rebound) fire({ type: 'STAT', side: rebound.side, payload: { kind: 'rebound', ref: id }, ...credit({ type: 'stat', stat: REBOUND, playerId: rebound.p.id }) });
    setFlow(null);
  };
  /** the one-tap shot: GS / GA from the line-up (detail mode asks for the feed) */
  const shot = (sd: Side, pos: Pos, isMiss: boolean) => {
    const shooter = lineup(sd)[pos] ?? null;
    if (!shooter && rosterOf(sd).length && !s.xi?.[sd]) { setFlow({ mode: 'shooter', side: sd, pos, miss: isMiss }); return; }
    afterShooter(sd, pos, shooter, isMiss);
  };
  const afterShooter = (sd: Side, pos: Pos, shooter: Player | null, isMiss: boolean) => {
    if (!s.detail) { if (isMiss) miss(sd, pos, shooter, null); else goal(sd, pos, shooter, null); return; }
    setFlow(isMiss ? { mode: 'miss', side: sd, pos, shooter, step: 'feed' } : { mode: 'goal', side: sd, pos, shooter, step: 'feed' });
  };
  const stat = (sd: Side, kind: StatKind, p: Player | null, extra: { gain?: boolean; tt?: TurnoverType } = {}) => {
    // deep wave: a pick-up is a statTotals-only credit, so its player rides in the payload
    const who = kind === 'pickup' && p ? { playerId: p.id } : {};
    fire({ type: 'STAT', side: sd, payload: { kind, ...who, ...(typeof extra.gain === 'boolean' ? { gain: extra.gain } : {}), ...(extra.tt ? { tt: extra.tt } : {}) }, ...credit({ type: 'stat', stat: kind, playerId: p?.id }) });
    setFlow(null);
  };
  /** after the player: a deflection's outcome / a turnover's type when tracked */
  const statPicked = (sd: Side, kind: StatKind, p: Player | null) => {
    if ((kind === 'deflection' && s.trackGains) || (kind === 'turnover' && s.trackTurnovers)) setFlow({ mode: 'stat', side: sd, kind, player: p, step: 'outcome' });
    else stat(sd, kind, p);
  };
  const penalty = (sd: Side, kind: PenaltyKind, p: Player | null) => {
    fire({ type: 'PENALTY', side: sd, payload: { penalty: kind }, ...credit({ type: 'penalty', penalty: kind, playerId: p?.id }) });
    setFlow(null);
  };
  const sanction = (sd: Side, kind: Sanction, p: Player | null) => {
    fire({ type: 'SANCTION', side: sd, payload: { sanction: kind, ...(kind === 'suspension' ? { minutes: s.suspensionMinutes } : {}) }, ...credit({ type: 'sanction', sanction: kind, playerId: p?.id }) });
    setFlow(null);
  };
  const officialSanction = (sd: Side, kind: Sanction) => {
    fire({ type: 'SANCTION', side: sd, payload: { sanction: kind, official: official.trim() || 'Team official' } });
    setOfficial(''); setFlow(null);
  };
  const sub = (sd: Side, off: Player | null, on: Player, pos?: Pos) => {
    fire(subAction(sd, off, on, pos ? { pos } : {}));
    setFlow(null);
  };
  const move = (sd: Side, p: Player, pos: Pos) => {
    if (s.period === 1 && !periodStarted(s) && !s.events.some((e) => e.side === sd && (e.type === 'pos' || e.type === 'sub'))) {
      // before the first centre pass: this IS the starting line-up (the XI
      // stamp — minutes and quarters per position count from it)
      const cur = lineup(sd);
      const from = POSITIONS.find((x) => cur[x]?.id === p.id);
      const next: Partial<Record<Pos, { id: string; name?: string }>> = {};
      for (const x of POSITIONS) { const w = cur[x]; if (w && w.id !== p.id) next[x] = { id: w.id }; }
      const occupant = next[pos];
      if (occupant && from) next[from] = occupant;
      next[pos] = { id: p.id };
      dispatch({ type: 'XI', payload: { team: sd, pos: next } });
      setFlow({ mode: 'pos', side: sd, step: 'player' });
      return;
    }
    if (!s.xi?.[sd]) stampXi();
    fire({ type: 'POS', side: sd, payload: { id: p.id, pos } });
    setFlow({ mode: 'pos', side: sd, step: 'player' });
  };
  const hold = (reason: StopReason) => { fire({ type: 'STOP', payload: { reason } }); setFlow(null); };

  /* ---- correct the timeline ---- */
  const isAnswer = (e: NetballEvent) => e.type === 'stat' && e.stat === 'rebound' && !!e.ref;
  const removalActions = (e: NetballEvent): ScoreAction[] => {
    const cr = eventCredits(e);
    return [
      { type: 'REMOVE_EVENT', ...(e.side ? { side: e.side } : {}), payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) },
      ...s.events.filter((x) => isAnswer(x) && x.ref === e.id).flatMap(removalActions),
    ];
  };
  const remove = (e: NetballEvent) => { for (const a of removalActions(e)) dispatch(a); };
  const edit = (e: NetballEvent) => {
    if (!e.side || e.type === 'timeout' || e.type === 'stop' || e.type === 'centre' || e.type === 'cpr' || e.type === 'tossup' || isAnswer(e)) { remove(e); return; }
    holdRemoval(removalActions(e));
    setEditAt({ sec: e.sec, period: e.period });
    setShowEdit(false);
    const sd = e.side;
    if (e.type === 'goal' || e.type === 'miss') { setArmed(e.points === 2 || e.ss ? sd : null); setFlow({ mode: 'shooter', side: sd, pos: e.pos ?? 'GS', miss: e.type === 'miss' }); }
    else if (e.type === 'stat') setFlow({ mode: 'stat', side: sd, kind: e.stat ?? 'intercept' });
    else if (e.type === 'penalty') setFlow({ mode: 'penalty', side: sd, step: 'kind' });
    else if (e.type === 'sanction') setFlow({ mode: 'sanction', side: sd, step: 'kind' });
    else if (e.type === 'sub') setFlow({ mode: 'sub', side: sd, step: 'off' });
    else if (e.type === 'pos') setFlow({ mode: 'pos', side: sd, step: 'player' });
  };

  /* ---- clock ---- */
  const startStop = () => {
    const at = Date.now();
    if (running(s)) { dispatch({ type: 'CLOCK', payload: { run: false, at } }); return; }
    if (s.period === 1 && !periodStarted(s)) stampXi();
    dispatch({ type: 'CLOCK', payload: { run: true, at } });
  };
  const last = netballLast(s);
  const level = s.home === s.away;
  // SD-106: ending a quarter / full time asks first (ConfirmSheet)
  const endPeriod = async () => {
    if (!periodStarted(s)) return;
    const score = `${s.home}-${s.away}`;
    const ok = last ? await confirmMatchAction('fullTime', { score }) : await confirmMatchAction('endPeriod', { period: periodLong(s, s.period), score });
    if (!ok) return;
    dispatch({ type: 'END_PERIOD', payload: { at: Date.now() } });
  };
  const applyClock = () => {
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(clockInput.trim());
    if (!m) return;
    // the time LEFT on the quarter clock (netball counts down); the play-on counts up
    const want = Number(m[1]) * 60 + Number(m[2] ?? 0);
    const len = periodLen(s, s.period);
    dispatch({ type: 'SET_CLOCK', payload: { periodSec: len ? Math.max(0, Math.min(len, len - want)) : want, at: Date.now() } });
    setSetting(false); setClockInput('');
  };

  /* ---- after the final whistle ---- */
  if (s.ended) {
    const r = result(s);
    return (
      <View style={c.wrap}>
        <View style={c.panel}>
          <Text style={c.h}>Full time · {s.home}–{s.away}{s.playOn ? ' (after play-on)' : s.et ? ' (after extra time)' : ''}</Text>
          <Text style={c.meta}>{r ? (r.winner === 'draw' ? 'Draw.' : `${name(r.winner)} win.`) : 'Level — end it from Match controls.'} Use “Correct the timeline” below to fix a moment.</Text>
        </View>
        <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} homeName={homeName} awayName={awayName} />
      </View>
    );
  }

  const cp = centreInfo(s).now;
  // Deep wave: this centre pass already has its receiver (since the last goal / quarter start)
  const cprLogged = (() => {
    for (let i = s.events.length - 1; i >= 0; i--) {
      const e = s.events[i];
      if (e.period !== s.period || e.type === 'goal' || e.type === 'centre') return false;
      if (e.type === 'cpr') return true;
    }
    return false;
  })();
  const needToss = !s.firstCentre && s.period === 1 && !periodStarted(s) && !s.events.some((e) => e.type === 'goal');

  /* ---- flows ---- */
  const flowPanel = (() => {
    if (!flow) return null;
    const head = (t: string, sd?: Side) => (
      <View style={c.flowHead}>
        <Text style={[c.h, sd ? { color: ink(sd) } : null]} numberOfLines={1}>{t}{sd ? ` · ${name(sd)}` : ''}</Text>
        <Text style={c.cancel} accessibilityRole="button" onPress={() => setFlow(null)}>Cancel</Text>
      </View>
    );
    if (flow.mode === 'hold') return (
      <View style={c.panel}>{head('⏸ Hold time — why?')}
        <View style={c.grid}>
          <Button label="🩹 Injury / illness" variant="ghost" style={c.half} onPress={() => hold('injury')} />
          <Button label="🩸 Blood" variant="ghost" style={c.half} onPress={() => hold('blood')} />
          <Button label="⇄ Tactical change" variant="ghost" style={c.half} onPress={() => hold('tactical')} />
          <Button label="Other" variant="ghost" style={c.half} onPress={() => hold('other')} />
        </View>
        <Text style={c.meta}>The clock stops. Make any substitution or position change from “More”, then ▶ Resume.</Text>
      </View>
    );
    const sd = flow.side;
    switch (flow.mode) {
      case 'shooter':
        return (
          <View style={c.panel}>{head(`${flow.miss ? 'Missed shot' : 'Goal'} · ${flow.pos}`, sd)}
            <Text style={c.small}>Who shot?</Text>
            <PlayerGrid players={onCourt(sd)} tag={tagOf(sd)} onPick={(p) => afterShooter(sd, flow.pos, p, flow.miss)}
              skip={{ label: `${flow.pos} (no name)`, onPress: () => afterShooter(sd, flow.pos, null, flow.miss) }} />
            <View style={c.row}>
              {(['GS', 'GA'] as const).map((p) => <Button key={p} label={p} variant={flow.pos === p ? 'primary' : 'ghost'} style={c.flex} onPress={() => setFlow({ ...flow, pos: p })} />)}
            </View>
            <Text style={c.meta}>Only the GS and GA can score. Set positions (More → Positions) to make this one tap.</Text>
          </View>
        );
      case 'goal':
        return (
          <View style={c.panel}>{head(`Goal · ${flow.pos}${flow.shooter ? ` ${flow.shooter.fullName}` : ''}`, sd)}
            <Text style={c.small}>Goal assist — who fed the circle?</Text>
            <PlayerGrid players={onCourt(sd).filter((p) => p.id !== flow.shooter?.id)} tag={tagOf(sd)} onPick={(p) => goal(sd, flow.pos, flow.shooter, p)}
              skip={{ label: 'No feed / skip', onPress: () => goal(sd, flow.pos, flow.shooter, null) }} />
          </View>
        );
      case 'miss':
        if (flow.step === 'feed') return (
          <View style={c.panel}>{head(`Missed · ${flow.pos}${flow.shooter ? ` ${flow.shooter.fullName}` : ''}`, sd)}
            <Text style={c.small}>Feed — who passed into the circle?</Text>
            <PlayerGrid players={onCourt(sd).filter((p) => p.id !== flow.shooter?.id)} tag={tagOf(sd)} onPick={(p) => setFlow({ ...flow, feeder: p, step: 'rebound' })}
              skip={{ label: 'Skip', onPress: () => setFlow({ ...flow, feeder: null, step: 'rebound' }) }} />
          </View>
        );
        {
          const circle = (x: Side, ps: Pos[]) => ps.map((p) => lineup(x)[p]).filter((p): p is Player => !!p && !gone(x, p));
          return (
            <View style={c.panel}>{head('Rebound')}
              <Text style={[c.small, { color: ink(sd) }]}>{name(sd)} (attack)</Text>
              <PlayerGrid players={circle(sd, ['GS', 'GA'])} tag={tagOf(sd)} onPick={(p) => miss(sd, flow.pos, flow.shooter, flow.feeder ?? null, { side: sd, p })} />
              <Text style={[c.small, { color: ink(other(sd)) }]}>{name(other(sd))} (defence)</Text>
              <PlayerGrid players={circle(other(sd), ['GK', 'GD'])} tag={tagOf(other(sd))} onPick={(p) => miss(sd, flow.pos, flow.shooter, flow.feeder ?? null, { side: other(sd), p })}
                skip={{ label: 'No rebound / skip', onPress: () => miss(sd, flow.pos, flow.shooter, flow.feeder ?? null, null) }} />
            </View>
          );
        }
      case 'stat': {
        const b = [...STAT_BTN, PICKUP_BTN].find((x) => x.kind === flow.kind)!;
        if (flow.step === 'outcome') {
          const who = flow.player ? ` · ${flow.player.fullName}` : '';
          // Deep wave — "Gains & pick-ups": did the deflection win the ball?
          if (flow.kind === 'deflection') return (
            <View style={c.panel}>{head(`${b.label}${who}`, sd)}
              <View style={c.row}>
                <Button label="Gain — won it" variant="ghost" style={c.flex} onPress={() => stat(sd, flow.kind, flow.player ?? null, { gain: true })} />
                <Button label="No gain" variant="ghost" style={c.flex} onPress={() => stat(sd, flow.kind, flow.player ?? null, { gain: false })} />
              </View>
              <Text style={c.cancel} accessibilityRole="button" onPress={() => stat(sd, flow.kind, flow.player ?? null)}>Skip</Text>
            </View>
          );
          // Deep wave — "Turnover types"
          return (
            <View style={c.panel}>{head(`${b.label}${who}`, sd)}
              <View style={c.grid}>
                {TURNOVER_TYPES.map((t) => <SelectChip key={t} label={TURNOVER_LABEL[t]} active={false} onPress={() => stat(sd, flow.kind, flow.player ?? null, { tt: t })} />)}
                <SelectChip label="Skip" active={false} onPress={() => stat(sd, flow.kind, flow.player ?? null)} />
              </View>
            </View>
          );
        }
        return (
          <View style={c.panel}>{head(b.label, sd)}
            <PlayerGrid players={onCourt(sd)} tag={tagOf(sd)} onPick={(p) => statPicked(sd, flow.kind, p)} skip={{ label: 'Skip player', onPress: () => statPicked(sd, flow.kind, null) }} />
          </View>
        );
      }
      case 'penalty':
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head('✋ Penalty against', sd)}
            <View style={c.row}>
              <Button label="Contact" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, kind: 'contact', step: 'player' })} />
              <Button label="Obstruction" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, kind: 'obstruction', step: 'player' })} />
            </View>
            <Button label="Other penalty" variant="ghost" onPress={() => setFlow({ ...flow, kind: 'other', step: 'player' })} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`Penalty · ${flow.kind === 'contact' ? 'contact' : flow.kind === 'obstruction' ? 'obstruction' : 'other'}`, sd)}
            <PlayerGrid players={onCourt(sd)} tag={tagOf(sd)} onPick={(p) => penalty(sd, flow.kind ?? 'other', p)} skip={{ label: 'Skip player', onPress: () => penalty(sd, flow.kind ?? 'other', null) }} />
          </View>
        );
      case 'sanction': {
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head('Sanction', sd)}
            <View style={c.grid}>
              <Button label="🟨 Warning" variant="ghost" style={c.half} onPress={() => setFlow({ ...flow, kind: 'warning', step: 'player' })} />
              <Button label={`⏱ Suspend ${s.suspensionMinutes} min`} variant="ghost" style={c.half} onPress={() => setFlow({ ...flow, kind: 'suspension', step: 'player' })} />
              <Button label="🟥 Order off" variant="ghost" style={c.half} onPress={() => setFlow({ ...flow, kind: 'off', step: 'player' })} />
            </View>
            <Text style={c.meta}>Suspended: the team plays a player short for {s.suspensionMinutes} minutes of playing time, then she is back in her position. Ordered off: no further part, not replaced.</Text>
          </View>
        );
        const k = flow.kind ?? 'warning';
        return (
          <View style={c.panel}>{head(k === 'warning' ? 'Warning' : k === 'suspension' ? 'Suspension' : 'Ordering off', sd)}
            <PlayerGrid players={everyone(sd)} tag={(p) => {
              const n = sanctionsOf(s, sd, { id: p.id, name: p.fullName });
              return posOfPlayer(sd, p) ?? (n.warnings || n.suspensions ? `${n.warnings}W ${n.suspensions}S` : undefined);
            }} onPick={(p) => sanction(sd, k, p)} />
            <Text style={c.small}>Or a team official</Text>
            <View style={c.row}>
              <View style={c.flex}><TextField label="Official's role (optional)" value={official} onChange={setOfficial} placeholder="e.g. Coach" autoCapitalize="words" /></View>
              <Button label="Record" variant="ghost" onPress={() => officialSanction(sd, k)} />
            </View>
          </View>
        );
      }
      case 'sub': {
        if (flow.step === 'off') return (
          <View style={c.panel}>{head('Sub — who comes off?', sd)}
            <PlayerGrid players={onCourt(sd)} tag={tagOf(sd)} onPick={(p) => setFlow({ ...flow, off: p, step: 'on' })}
              skip={{ label: 'No one — fill an empty position', onPress: () => setFlow({ ...flow, off: null, step: 'on' }) }} />
            <Text style={c.meta}>World Netball (2024): substitutions at any time — the umpires hold time.</Text>
          </View>
        );
        if (flow.step === 'on') return (
          <View style={c.panel}>{head(flow.off ? `On for ${flow.off.fullName}${posOfPlayer(sd, flow.off) ? ` (${posOfPlayer(sd, flow.off)})` : ''}` : 'Who comes on?', sd)}
            <PlayerGrid players={bench(sd)} onPick={(p) => (flow.off && posOfPlayer(sd, flow.off) ? sub(sd, flow.off, p) : setFlow({ ...flow, on: p, step: 'pos' }))} />
          </View>
        );
        const taken = lineup(sd);
        return (
          <View style={c.panel}>{head(`${flow.on?.fullName ?? 'Sub'} plays…`, sd)}
            <View style={c.grid}>
              {POSITIONS.map((p) => <Button key={p} label={taken[p] ? `${p} · ${taken[p]!.fullName.split(' ')[0]}` : p} variant="ghost" style={c.third} onPress={() => sub(sd, flow.off ?? null, flow.on!, p)} />)}
            </View>
          </View>
        );
      }
      case 'pos': {
        const l = lineup(sd);
        if (flow.step === 'player') return (
          <View style={c.panel}>{head('⇄ Positions', sd)}
            {POSITIONS.map((p) => (
              <View key={p} style={c.posRow}>
                <Text style={c.posTag}>{p}</Text>
                <Text style={c.posName} numberOfLines={1}>{l[p]?.fullName ?? '—'}</Text>
                <Text style={c.posArea} numberOfLines={1}>{POS_AREAS[p]}</Text>
              </View>
            ))}
            <Text style={c.small}>Tap a player, then her new position</Text>
            <PlayerGrid players={Object.keys(l).length < 7 ? everyone(sd) : onCourt(sd)} tag={tagOf(sd)} onPick={(p) => setFlow({ ...flow, player: p, step: 'pos' })} />
            <Button label="Done" variant="ghost" onPress={() => setFlow(null)} />
          </View>
        );
        return (
          <View style={c.panel}>{head(`${flow.player?.fullName ?? ''} → which position?`, sd)}
            <View style={c.grid}>
              {POSITIONS.map((p) => <Button key={p} label={l[p] ? `${p} · ${l[p]!.fullName.split(' ')[0]}` : p} variant={posOfPlayer(sd, flow.player!) === p ? 'primary' : 'ghost'} style={c.third} onPress={() => move(sd, flow.player!, p)} />)}
            </View>
            <Text style={c.meta}>A taken position swaps the two players. Changes at a break are stamped at the start of the next quarter.</Text>
          </View>
        );
      }
    }
    return null;
  })();

  const shotBtn = (sd: Side, pos: Pos, isMiss: boolean) => {
    const p = lineup(sd)[pos];
    const off = gone(sd, p);
    const susp = off ? live.suspended.find((x) => x.side === sd && (x.id === p?.id || x.name === p?.fullName)) : undefined;
    const first = p?.fullName.split(' ')[0];
    const label = isMiss ? `↗ Miss ${pos}` : `🥅 ${pos}${first ? ` · ${first}` : ''}`;
    return (
      <Button key={`${pos}${isMiss}`} label={off ? `${pos} off${susp ? ` ${susp.left}` : ''}` : label}
        accessibilityLabel={`${isMiss ? 'Missed shot' : 'Goal'} ${pos}${p ? ` ${p.fullName}` : ''}, ${name(sd)}`}
        color={isMiss ? undefined : color(sd)} variant={isMiss ? 'ghost' : 'primary'} style={c.flex}
        disabled={off || !periodStarted(s)} onPress={() => shot(sd, pos, isMiss)} />
    );
  };
  const sideCol = (sd: Side) => {
    const to = timeoutCheck(s, sd);
    return (
      <View key={sd} style={c.col}>
        <Text style={[c.team, { color: ink(sd) }]} numberOfLines={1}>{name(sd)}</Text>
        {shotBtn(sd, 'GS', false)}
        {shotBtn(sd, 'GA', false)}
        <View style={c.row}>{shotBtn(sd, 'GS', true)}{shotBtn(sd, 'GA', true)}</View>
        {/* Deep wave — the super-shot window (a format that uses them): arm the next shot as a 2-pointer */}
        {s.superShot && superShotLive(s, now) && periodStarted(s) ? (
          <SelectChip label={armed === sd ? `⭐ ${ssText.name} — next shot` : `⭐ ${ssText.name}`} accessibilityLabel={`${ssText.name}: the next ${name(sd)} shot is from ${ssText.zone}`}
            active={armed === sd} onPress={() => setArmed(armed === sd ? null : sd)} />
        ) : null}
        {more ? (
          <>
            {[...STAT_BTN, ...(s.trackGains ? [PICKUP_BTN] : [])].map((b) => <Button key={b.kind} label={b.label} accessibilityLabel={`${b.a11y}, ${name(sd)}`} variant="ghost" onPress={() => setFlow({ mode: 'stat', side: sd, kind: b.kind })} />)}
            <Button label="✋ Penalty" accessibilityLabel={`Penalty against ${name(sd)}`} variant="ghost" onPress={() => setFlow({ mode: 'penalty', side: sd, step: 'kind' })} />
            <Button label="🟨 Sanction" accessibilityLabel={`Sanction, ${name(sd)}`} variant="ghost" onPress={() => setFlow({ mode: 'sanction', side: sd, step: 'kind' })} />
            <Button label="🔁 Sub" accessibilityLabel={`Substitution, ${name(sd)}`} variant="ghost" onPress={() => setFlow({ mode: 'sub', side: sd, step: 'off' })} />
            <Button label="⇄ Positions" accessibilityLabel={`Position changes, ${name(sd)}`} variant="ghost" onPress={() => setFlow({ mode: 'pos', side: sd, step: 'player' })} />
            {/* batch 6: a toss-up (World Netball 9.7) won by this side — one tap, no score effect */}
            {/* screen sweep N1: a toss-up happens in play (World Netball 9.7) — before play a tap says why instead of nothing */}
            <Button label="🙌 Toss-up won" accessibilityLabel={`Toss-up won by ${name(sd)}`} variant="ghost" onPress={() => (periodStarted(s) ? fire({ type: 'TOSS_UP', side: sd }) : setTossWhy(sd))} />
            {tossWhy === sd && !periodStarted(s) ? <Text style={c.meta} accessibilityLiveRegion="polite">{tossUpBlocked(s)}</Text> : null}
            {s.timeoutsPerHalf > 0 ? <Button label={`⏸ Time-out · ${to.left}`} accessibilityLabel={`Team time-out for ${name(sd)}, ${to.left} left`} variant="ghost" disabled={!to.ok || !periodStarted(s)} onPress={() => fire({ type: 'TIMEOUT', side: sd })} /> : null}
          </>
        ) : null}
        {live.short[sd] > 0 ? <Text style={c.short}>Playing {live.short[sd]} short</Text> : null}
      </View>
    );
  };

  const stoppedWhy = (() => {
    const lastEv = s.events[s.events.length - 1];
    if (lastEv?.type === 'timeout' && lastEv.side) return ` (time-out, ${name(lastEv.side)})`;
    if (lastEv?.type === 'stop') return lastEv.reason === 'injury' ? ' (injury)' : lastEv.reason === 'blood' ? ' (blood)' : lastEv.reason === 'tactical' ? ' (tactical change)' : '';
    if (lastEv?.type === 'sanction' && lastEv.sanction !== 'warning') return ' (sanction)';
    return '';
  })();
  const noPositions = !s.xi?.home && !s.xi?.away && !Object.keys(stampOf('home')).length && !Object.keys(stampOf('away')).length;

  return (
    <View style={c.wrap}>
      {editAt ? <BackfillBar at={`${periodName(s, editAt.period)} ${eventWhen(s, { sec: editAt.sec, period: editAt.period } as NetballEvent).split(' ')[1]}`} onLive={() => setFlow(null)} /> : null}
      {/* the game clock */}
      <View style={c.panel}>
        <View style={c.clockRow}>
          <View style={{ flex: 1 }}>
            <Text style={c.small}>{periodLong(s, s.period)}</Text>
            <Text style={c.clock} accessibilityLabel={`${periodLong(s, s.period)}, ${clockFace(s, now)} ${isOpen(s) ? 'played' : 'left'}`}>{clockFace(s, now)}</Text>
          </View>
          <Button label={running(s) ? '⏸ Stop' : periodStarted(s) ? '▶ Resume' : s.period === 1 ? '▶ Start' : `▶ Start ${periodName(s, s.period)}`}
            variant={running(s) ? 'ghost' : 'primary'} disabled={needToss} onPress={startStop} />
        </View>
        {needToss ? (
          <View style={c.toss}>
            <Text style={c.h}>🪙 Who has the first centre pass?</Text>
            <Text style={c.meta}>The captain who won the toss chooses. After that the centre pass alternates by itself.</Text>
            <View style={c.row}>
              <Button label={homeName} color={color('home')} style={c.flex} onPress={() => dispatch({ type: 'FIRST_CENTRE', side: 'home' })} />
              <Button label={awayName} color={color('away')} style={c.flex} onPress={() => dispatch({ type: 'FIRST_CENTRE', side: 'away' })} />
            </View>
          </View>
        ) : null}
        <View style={c.row}>
          {!last && !(s.playOn && level) ? <Button label={`⏭ End ${periodName(s, s.period)}`} variant="ghost" style={c.flex} disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
          <Button label="⏱ Set" accessibilityLabel="Set the clock" variant="ghost" style={c.flex} onPress={() => setSetting((v) => !v)} />
          <Button label="⏸ Hold" accessibilityLabel="Hold time (injury, blood, tactical change)" variant="ghost" style={c.flex} disabled={!running(s)} onPress={() => setFlow({ mode: 'hold' })} />
        </View>
        {setting ? (
          <View style={c.row}>
            <View style={c.flex}><TextField label={isOpen(s) ? 'Time played (mm:ss)' : 'Time left (mm:ss)'} value={clockInput} onChange={setClockInput} placeholder={clockFace(s, now).replace('+', '')} /></View>
            <Button label="Set" onPress={applyClock} />
          </View>
        ) : null}
        {s.playOn ? <Text style={c.short}>Level after extra time — play on until a team leads by {playOnLead(s)} goal{playOnLead(s) === 1 ? '' : 's'}. It ends by itself.</Text> : null}
        {!s.playOn && s.period === s.periods && !s.et && s.decider === 'et' && level && periodStarted(s) ? <Text style={c.meta}>Level — ending this {s.periods === 2 ? 'half' : 'quarter'} goes to extra time (2 × {s.etMinutes} min).</Text> : null}
        {timeUp(s, now) && running(s) ? <Text style={c.short}>Time is up — a shot in flight still counts. End {periodName(s, s.period)}.</Text> : null}
        {!running(s) && periodStarted(s) && !timeUp(s, now) ? (
          <View style={c.stopped} accessibilityRole="alert">
            <Text style={c.stoppedTxt}>⏸ Clock stopped{stoppedWhy}</Text>
            <Button label="▶ Resume" onPress={startStop} />
          </View>
        ) : null}
      </View>

      {cp && !needToss ? (
        <View style={[c.centre, { borderColor: color(cp) }]}>
          <Text style={[c.centreTxt, { color: ink(cp) }]} accessibilityLiveRegion="polite">⚪ Centre pass: {name(cp)}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Swap the centre pass to ${name(other(cp))}`} onPress={() => fire({ type: 'CENTRE', side: other(cp) })} style={c.swap}>
            <IconText label={"⇄ Swap"} style={c.swapTxt} />
          </TouchableOpacity>
        </View>
      ) : null}
      {/* Deep wave — "Centre pass receives": who caught this centre pass (one tap, optional) */}
      {cp && !needToss && s.trackCpr && periodStarted(s) && !flowPanel && !cprLogged ? (
        <View style={c.grid}>
          <Text style={c.small}>Received by</Text>
          {CPR_POS.map((pos) => {
            const p = lineup(cp)[pos];
            return p && !gone(cp, p) ? (
              <SelectChip key={pos} label={`${pos} · ${p.fullName.split(' ')[0]}`} accessibilityLabel={`Centre pass received by ${p.fullName}, ${pos}`} active={false}
                onPress={() => fire({ type: 'CPR', side: cp, payload: { playerId: p.id, pos } })} />
            ) : null;
          })}
        </View>
      ) : null}

      {flowPanel ?? (
        <>
          <View style={c.cols}>{sideCol('home')}{sideCol('away')}</View>
          <Button label={more ? 'Fewer buttons ▴' : 'More — intercepts, penalties, subs, positions ▾'} variant="ghost" onPress={() => setMore((v) => !v)} />
          {noPositions ? <Text style={c.meta}>Tip: set each team’s line-up (GS…GK) before the start and the GS / GA buttons show the shooters’ names — one tap per goal.</Text> : null}
          {!periodStarted(s) && s.period > 1 ? <Text style={c.meta}>Break — make substitutions and position changes from “More”, then start {periodName(s, s.period)}.</Text> : null}
        </>
      )}

      <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} onEdit={edit} homeName={homeName} awayName={awayName} />
      {/* SD-106: the final whistle sits at the bottom of the controls; SD-116: not live before the last period starts */}
      {last && !s.playOn ? <Button label="🏁 Full time" variant="danger" disabled={!periodStarted(s)} onPress={() => void endPeriod()} /> : null}
      {last && !s.playOn && !periodStarted(s) ? <Text style={c.gk}>Start {periodName(s, s.period)} first — Full time unlocks once it’s under way.</Text> : null}
    </View>
  );
};

/** The scorer's "Correct the timeline" list: remove a moment, or re-enter it. */
function EditList({ s: s0, show, setShow, onRemove, onEdit, homeName, awayName }: {
  s: NetballState; show: boolean; setShow: (v: boolean) => void; onRemove: (e: NetballEvent) => void; onEdit?: (e: NetballEvent) => void; homeName: string; awayName: string;
}) {
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(s0, nameOf), [s0, nameOf]); // IDs-only scoring: names by id
  if (!s.events.length) return null;
  return (
    <View style={c.panel}>
      <Text style={c.link} accessibilityRole="button" onPress={() => setShow(!show)}>{show ? 'Hide' : '✎ Correct the timeline'}</Text>
      {show ? [...timelineEvents(s)].reverse().slice(0, 40).map(({ e, answer, answers }) => {
        const d = describeEvent(e, answer);
        const editable = !!e.side && e.type !== 'timeout' && e.type !== 'stop' && e.type !== 'centre' && e.type !== 'cpr'; // deep wave: a CPR is remove-only
        return (
          <View key={e.id} style={c.editRow}>
            <Text style={c.editWhen}>{eventWhen(s, e)}</Text>
            <Text style={c.editLabel} numberOfLines={2}>{d.icon} {d.label}{e.side ? ` · ${e.side === 'home' ? homeName : awayName}` : ''}{d.detail ? ` · ${d.detail}` : ''}</Text>
            {onEdit && editable ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${d.label}`} onPress={() => onEdit(e)} /> : null}
            <RowAction label="✕" tone="remove" a11y={`Remove ${d.label}`} onPress={() => void confirmRemove(`${d.label} (${eventWhen(s, e)})`, () => onRemove(e),
              answers.length ? 'The linked rebound goes too. The score and player stats re-adjust.' : undefined)} />
          </View>
        );
      }) : null}
    </View>
  );
}

/* ------------------------------- live views -------------------------------- */

const LiveClock: NonNullable<SportPlugin<NetballState>['LiveClock']> = ({ state }) => {
  const s = state as NetballState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock?.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const label = s.ended ? (s.playOn ? 'FT (play-on)' : s.et ? 'FT (AET)' : 'FT')
    : !periodStarted(s) ? (s.period === 1 ? '—' : `${periodName(s, s.period)} next`) : `${periodName(s, s.period)} ${clockFace(s, now)}`;
  const { nameOf } = useMask();
  const live = s.ended ? null : netballLiveField(s, now, nameOf);
  const cp = s.ended ? undefined : centreInfo(s).now;
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing(1), flex: 1, minWidth: 0 }}>
      <View style={c.clockRow2}>
        <View style={[c.dot, { backgroundColor: running(s) ? theme.colors.danger : theme.colors.textMuted }]} />
        <Text style={c.clockSmall}>{label}</Text>
      </View>
      {cp ? <Text style={c.gk}>⚪ Centre: {cp === 'home' ? 'Home' : 'Away'}</Text> : null}
      {live && (live.short.home || live.short.away) ? (
        <View style={{ alignSelf: 'stretch' }}>
          <FieldBanner suspended={live.suspended} onField={live.onField} />
        </View>
      ) : null}
    </View>
  );
};

/** Goals per quarter (and extra time), the live quarter highlighted. */
const NetballScoreboard: NonNullable<SportPlugin<NetballState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as NetballState;
  const n = Math.max(totalPeriods(s), s.period);
  const columns = Array.from({ length: n }, (_, i) => ({ label: periodName(s, i + 1), highlight: !s.ended && i + 1 === s.period }));
  // deep wave: points per quarter (a super shot counts 2)
  const goals = (sd: Side, p: number) => s.events.filter((e) => e.type === 'goal' && e.side === sd && e.period === p).reduce((n, e) => n + goalPoints(e), 0);
  const cells = (sd: Side) => Array.from({ length: n }, (_, i) => (i + 1 <= s.period || s.ended ? String(goals(sd, i + 1)) : ''));
  const r = result(s);
  return (
    <LineScoreboard
      live={live}
      clock={<LiveClock state={s} />}
      leadLabel="GOALS"
      columns={columns}
      winner={r && r.winner !== 'draw' ? r.winner : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.home), cells: cells('home') }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.away), cells: cells('away') }}
    />
  );
};

/** Match tabs (2026-10-22): the play-by-play on Commentary; the broadcast
 *  team stats and the players' box on Stats. */
type TabProps = Parameters<NonNullable<SportPlugin<NetballState>['LiveExtras']>>[0];
const NetballCommentary = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const { nameOf } = useMask();
  return <PlayFeed groups={netballFeed(state as NetballState, { home: homeName, away: awayName }, nameOf)} homeColor={homeColor} awayColor={awayColor} homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} allLabel="Match" />;
};
const NetballStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  // IDs-only scoring: names looked up by id for this viewer
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(state as NetballState, nameOf), [state, nameOf]);
  return (
    <SubViews label="Stats view" views={[
      { key: 'team', label: 'Team stats', render: () => (
        <CategoryStatsPanel periods={nbPanelPeriods(s)} data={(scope) => netballPanel(s, scope)} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />
      ) },
      { key: 'box', label: 'Players', render: () => (
        <MatchBoxScore sport="netball" show="box" source={netballBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
      ) },
    ]} />
  );
};

/* --------------------------------- plugin ---------------------------------- */

export const netballPlugin: SportPlugin<NetballState> = {
  ...NETBALL_META,
  matchRecords: netballMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete,
  result,
  summary: (s) => ({
    homeScore: String(s.home),
    awayScore: String(s.away),
    statusLine: s.ended ? (s.playOn ? 'Full Time (after play-on)' : s.et ? 'Full Time (after extra time)' : 'Full Time')
      : !periodStarted(s) && s.period > 1 ? (s.periods === 4 && s.period === 3 ? 'Half-time' : `End of ${periodName(s, s.period - 1)}`)
      : periodLong(s, s.period)[0].toUpperCase() + periodLong(s, s.period).slice(1),
    homeReds: s.events.filter((e) => e.type === 'sanction' && e.sanction === 'off' && !e.official && e.side === 'home').length,
    awayReds: s.events.filter((e) => e.type === 'sanction' && e.sanction === 'off' && !e.official && e.side === 'away').length,
  }),
  // netball "goal percentage" for the table's tie-break (goals for ÷ against)
  standingsUnits: (s) => ({ points: { home: s.home, away: s.away } }),
  statTotals: netballTotals,
  // SD-115: what Undo removes — "Goal · GS · Asha Rao (12-10)"
  undoLabel: (step, nameOf) => {
    if (!step) return null;
    const prev = step.prev as NetballState | undefined;
    // IDs-only scoring: the players by id, for this viewer
    const next = step.next ? withNames(step.next as NetballState, nameOf) : undefined;
    if (!prev?.events || !next?.events) return null;
    if (step.type === 'FIRST_CENTRE') return 'first-centre pick';
    if (step.type === 'XI') return 'positions';
    if (next.events.length <= prev.events.length) return step.type === 'REMOVE_EVENT' ? 'timeline correction' : null;
    const d = describeEvent(next.events[prev.events.length]);
    return `${d.label}${d.detail ? ` · ${d.detail}` : ''} (${next.home}-${next.away})`;
  },
  tickerDetail: netballTickerDetail,
  tickerFlash: netballTickerFlash,
  voice: { hints: ['goal GS home', 'miss GA away', 'goal {name}', 'centre home', 'hold time injury', 'end quarter'], parse: netballVoice, ends: netballVoiceEnds },
  ScoringControls,
  LiveClock,
  Scoreboard: NetballScoreboard,
  matchTabs: { Commentary: NetballCommentary, Stats: NetballStats },
  formation: () => netballFormation(),
  Court: NetballCourt,
  liveSettings: NETBALL_LIVE_SETTINGS,
};

const c = StyleSheet.create({
  wrap: { gap: theme.spacing(3) },
  panel: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' },
  flex: { flex: 1 },
  half: { flexBasis: '46%', flexGrow: 1 },
  third: { flexBasis: '30%', flexGrow: 1 },
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
  toss: { gap: theme.spacing(2), paddingTop: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  centre: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1), paddingLeft: theme.spacing(3), paddingRight: theme.spacing(1), borderRadius: theme.radius.md, borderWidth: 2, backgroundColor: theme.colors.surface },
  centreTxt: { flex: 1, fontSize: theme.font.body, fontWeight: '900' },
  swap: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing(2) },
  swapTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  flowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  cancel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(3), minHeight: 44 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  pchip: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), minHeight: 44, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, maxWidth: '100%' },
  pnum: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pname: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  skip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'transparent' },
  skipTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  posRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  posTag: { width: 30, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900' },
  posName: { flex: 1, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  posArea: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.tiny },
  stopped: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent },
  stoppedTxt: { flex: 1, color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editWhen: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', width: 64 },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});

