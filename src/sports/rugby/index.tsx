/**
 * Rugby union plugin (World Rugby) — SD-143. Archetype: goal / time, on the
 * referee's running clock (2 halves, counting up, time added past 40:00). The
 * pure rules live in ./engine.ts; the field tracker and statTotals in
 * ./totals.ts, the box score in ./box.ts.
 *
 * The scorer's panel: the clock (start / stop / end the half / set it), then
 * per side Try (scorer + assist, then the conversion: good / missed / not
 * taken + the kicker), Kick at goal (penalty goal / drop goal, good or missed
 * + kicker), Penalty try (7, no conversion), Card (yellow = sin-bin on the
 * playing clock; red; a 20-minute red when the organiser turned the World
 * Rugby trial on; a second yellow becomes a red), Sub (replacement, HIA /
 * blood temporary replacement, back on), and — when the organiser tracks
 * detail — tackles, carries, line breaks, turnovers, penalties conceded,
 * lineouts and scrums. A level knockout match goes to extra time / sudden
 * death / a kicking competition as the organiser chose.
 *
 * Deep wave — optional "Stats to track" (off by default): penalties by
 * offence & free kicks, turnovers conceded, 22 entries, possession &
 * territory, offloads. Their chips show per side only when switched on (one
 * tap for 22 entries / free kicks; the offence / cause and the player are
 * optional). The live views: Play-by-play (grouped commentary) · Match stats
 * (the broadcast sheet) · Box score · Key moments (the timeline).
 *
 * Corrections: "Correct the timeline" removes or re-enters a past moment
 * (REMOVE_EVENT with the reversed credits, then the same flow stamped at the
 * original time; Cancel keeps the event — SD-114).
 */
import React, { useEffect, useState, useMemo } from 'react';
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
import { SubViews } from '../SubViews';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import {
  init, reducer, isComplete, result, levelAtEnd, aggLine, matchSec, periodSec, periodLen, clockFace, clockAt, periodName, periodLong, periodStarted, running,
  eventCredits, creditAttribution, soScore, nextKicker, needsSdPick, rugbyScoreLine, subsUsed, openTemps, totalPeriods, nextPlan, kicksAfter,
  isSuddenDeath, pointsOf, cardTapAction, rugbyStandingsUnits, nominalOffset, trackedTallyKeys, currentBall, ballTime, ballDead,
  RUGBY_PRESETS, RUGBY_LIVE_SETTINGS, LIVE_KEYS, DETAIL_KEYS, DETAIL_LABEL, KICK_LABEL,
  TALLY_LABEL, TRACK_FLAGS, TRACK_KINDS, TRACK_FIELDS, INFRINGEMENTS, INFRINGEMENT_LABEL, TURNOVER_CAUSES, CAUSE_LABEL,
  type RugbyEvent, type RugbyState, type KickKind, type CardKind, type DetailKey, type Side, type TallyKind,
} from './engine';
import { ruledOutAction, RULED_OUT_REASONS, RULED_OUT_LABEL } from '../invasion/ruledOut';
import { asksWho } from '../invasion/asksWho';
import { restartAction, RESTART_LABEL, UNION_RESTARTS } from '../invasion/restarts';
import { rugbyTotals, rugbyLiveField, rugbyField, unavailable } from './totals';
import { rugbyBox } from './box';
import { rugbyCommentary, rugbyScopeLabel, RUGBY_FEED_TAGS } from './commentary';
import { rugbySheet } from './sheet';
import { GroupedFeed } from '../GroupedFeed';
import { StatSheetView } from '../StatSheetView';
import { rugbyTimeline, describeEvent, eventWhen, rugbyUndoLabel } from './timeline';
import { rugbyTickerDetail, rugbyTickerFlash } from './ticker';
import { rugbyFormation, RugbyPitch } from './pitch';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';
import { rugbyVoice, rugbyVoiceEnds, rugbyLast } from './voice';
import { RUGBY_META } from './meta';
import { rugbyMatchRecords } from './records';
import { IconText } from '../../components/Icon';
import { MainAction } from '../MainAction';

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const BASE_TRACKED: string[] = LIVE_KEYS.filter((k) => k !== 'soTaken' && k !== 'soGoals');
/** the keys this match tracks (the base set + the "Stats to track" switched on) */
const trackedKeys = (s: RugbyState): string[] => [...BASE_TRACKED, ...trackedTallyKeys(s)];
/** deep wave: the per-side chips of the "Stats to track" */
const TALLY_CHIP: Record<TallyKind, string> = {
  penalty: '⚖ Penalty conceded', freeKick: '🏳 Free kick conceded', turnover: '🔄 Turnover conceded', entry: '⏩ 22 entry', offload: '🤲 Offload',
};
/** the tallies a one-tap chip records for the team (no player, no follow-up).
 *  Round 2: a free kick asks for the player (optional), like a penalty. */
const ONE_TAP: TallyKind[] = ['entry'];

function Chip({ label, on, onPress, a11y }: { label: string; on: boolean; onPress: () => void; a11y?: string }) {
  return (
    <TouchableOpacity style={[c.chip, on ? c.chipOn : null]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a11y ?? label}>
      <Text style={[c.chipTxt, on ? c.chipTxtOn : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

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
const other = (sd: Side): Side => (sd === 'home' ? 'away' : 'home');
type Flow =
  | { mode: 'try'; side: Side; step: 'scorer' | 'assist'; scorer?: Player | null }
  | { mode: 'conv'; side: Side; step: 'result' | 'kicker'; made?: boolean }
  | { mode: 'kick'; side: Side; step: 'kind' | 'result' | 'kicker'; kick?: KickKind; made?: boolean }
  /** `pt` (invasion batch 5): straight after a penalty try — a card for the offender? (optional) */
  | { mode: 'card'; side: Side; step: 'kind' | 'player'; card?: CardKind; red20?: boolean; pt?: boolean }
  | { mode: 'sub'; side: Side; step: 'kind' | 'off' | 'on' | 'back'; kind?: SubKind; off?: Player | null }
  | { mode: 'detail'; side: Side; step: 'kind' | 'player'; detail?: DetailKey }
  /** deep wave: a penalty (offence) / turnover (cause) / offload — the pick and the player optional */
  | { mode: 'tally'; side: Side; kind: TallyKind; pick?: string }
  /** invasion batch 6: a try ruled out (only with the toggle on) — one tap logs it */
  | { mode: 'ruledout'; side: Side; review?: boolean };

/* -------------------------------- controls --------------------------------- */

const ScoringControls: SportPlugin<RugbyState>['ScoringControls'] = ({
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
  const [official, setOfficial] = useState('');
  const [soTaker, setSoTaker] = useState<Player | null>(null);
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
    rosterOf(sd).find((p) => (id && p.id === id) || (!id && nm && p.fullName === nm)) ?? (id ? { id, fullName: nameFor(playerNameOf, id, nm) ?? 'Player', sports: ['rugby'] } as Player : undefined);

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
      return rugbyField(s, matchSec(s, now) / 60).onField[sd].map((f) => byId(sd, f.id, f.name)).filter((p): p is Player => !!p);
    }
    const lu = lineupOf(sd).filter((sl) => sl.playerId).map((sl) => byId(sd, sl.playerId, sl.playerName)).filter((p): p is Player => !!p);
    return (lu.length ? lu : rosterOf(sd)).filter((p) => !gone(sd, p));
  };
  /** replaced for good (not after a temporary replacement) — may come back only with rolling subs */
  const replaced = (sd: Side) => new Set(s.events.filter((e) => e.type === 'sub' && e.side === sd && !e.temp && !e.back && e.playerId).map((e) => e.playerId!));
  const tempOff = (sd: Side) => new Set(openTemps(s, sd).map((o) => o.off.id).filter((x): x is string => !!x));
  const bench = (sd: Side): Player[] => {
    const on = new Set(onField(sd).map((p) => p.id));
    const rep = replaced(sd);
    const temp = tempOff(sd);
    return rosterOf(sd).filter((p) => !on.has(p.id) && !gone(sd, p) && !temp.has(p.id) && (s.rolling || !rep.has(p.id)));
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
  /** deep wave: a "Stats to track" tally (the offence / cause and the player optional) */
  const tally = (sd: Side, kind: TallyKind, p: Player | null, pick?: string) => {
    const why = pick ? (kind === 'penalty' ? { infringement: pick } : kind === 'turnover' ? { cause: pick } : {}) : {};
    // round 2: a free kick says the player was asked (named or "Team"), so the match credits free kicks to players
    const asked = kind === 'freeKick' ? { asked: true } : {};
    fire({ type: 'TALLY', side: sd, payload: { kind, ...why, ...asked }, ...credit({ type: 'tally', tally: kind, playerId: p?.id }) });
    setFlow(null);
  };
  /** deep wave: possession / territory switch (a tap on the side already set does nothing — round 2: unless the ball is dead) */
  const ball = (type: 'POSSESSION' | 'TERRITORY', sd: Side) => {
    if (currentBall(s, type === 'POSSESSION' ? 'poss' : 'terr') === sd && !(type === 'POSSESSION' && ballDead(s))) return;
    fire({ type, side: sd });
  };
  const scoreTry = (sd: Side, scorer: Player | null, assist: Player | null) => {
    fire({ type: 'TRY', side: sd, ...credit({ type: 'try', playerId: scorer?.id, secondId: assist?.id }) });
    // a try in sudden death ends the match (no conversion); else the conversion follows
    // (a re-entered try keeps its own conversion row — no second conversion)
    if (editAt || isSuddenDeath(s, s.period)) setFlow(null);
    else setFlow({ mode: 'conv', side: sd, step: 'result' });
  };
  const kick = (sd: Side, k: KickKind, made: boolean, p: Player | null) => {
    fire({ type: 'KICK', side: sd, payload: { kick: k, made }, ...credit({ type: 'kick', kick: k, made, playerId: p?.id }) });
    setFlow(null);
  };
  // two yellows under the trial = a 20-minute red (World Rugby 2025);
  // screen sweep (S3): no player = an unnamed player's card, never an official's
  const card = (sd: Side, kind: CardKind, p: Player | null, red20?: boolean) => {
    fire(cardTapAction(s, sd, kind, p ? { id: p.id, name: p.fullName } : undefined, red20, TRACKED));
    setFlow(null);
  };
  // the card's player step — skipped (an unnamed player's card) after a
  // penalty try when the offending side lists nobody: one tap stays one tap
  const cardPick = (f: Extract<Flow, { mode: 'card' }>, kind: CardKind, red20?: boolean) =>
    (f.pt && !asksWho(sanctionable(f.side)) ? card(f.side, kind, null, red20) : setFlow({ ...f, card: kind, ...(kind === 'red' ? { red20: !!red20 } : {}), step: 'player' }));
  const officialCard = (sd: Side, kind: CardKind) => {
    fire({ type: 'CARD', side: sd, payload: { card: kind, official: official.trim() || 'Team official' } });
    setOfficial(''); setFlow(null);
  };
  const sub = (sd: Side, off: Player | null, on: Player, kind: SubKind = 'perm', back = false) => {
    fire(subAction(sd, off, on, { ...(kind !== 'perm' ? { temp: kind } : {}), ...(back ? { back: true } : {}) }));
    setFlow(null);
  };
  const detail = (sd: Side, d: DetailKey, p: Player | null) => {
    fire({ type: 'DETAIL', side: sd, payload: { detail: d }, ...credit({ type: 'detail', detail: d, playerId: p?.id }) });
    setFlow(null);
  };
  const setPiece = (sd: Side, piece: 'lineout' | 'scrum', won: boolean) => fire({ type: 'SET_PIECE', side: sd, payload: { piece, won } });

  /* ---- correct the timeline ---- */
  const removalActions = (e: RugbyEvent): ScoreAction[] => {
    const cr = eventCredits(e);
    return [{ type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: creditAttribution(cr.first, -1), attribution2: creditAttribution(cr.second, -1) }];
  };
  const remove = (e: RugbyEvent) => { for (const a of removalActions(e)) dispatch(a); };
  // invasion batch 6: the "Try ruled out" button (the toggle on)
  const ruledOutOn = s.trackRuledOut === true;
  const edit = (e: RugbyEvent) => {
    if (e.type === 'pentry' || e.type === 'setpiece' || e.type === 'ruledout' || e.type === 'restart' || (e.type === 'tally' && ONE_TAP.includes(e.tally ?? 'entry'))) { remove(e); return; }
    holdRemoval(removalActions(e));
    setEditAt({ sec: e.sec, psec: e.psec, period: e.period });
    setShowEdit(false);
    if (e.type === 'try') setFlow({ mode: 'try', side: e.side, step: 'scorer' });
    else if (e.type === 'kick') setFlow(e.kick === 'conv' ? { mode: 'conv', side: e.side, step: 'result' } : { mode: 'kick', side: e.side, step: 'kind' });
    else if (e.type === 'card') setFlow({ mode: 'card', side: e.side, step: 'kind' });
    else if (e.type === 'sub') setFlow({ mode: 'sub', side: e.side, step: 'kind' });
    else if (e.type === 'detail') setFlow({ mode: 'detail', side: e.side, step: 'kind' });
    else if (e.type === 'tally' && e.tally) setFlow({ mode: 'tally', side: e.side, kind: e.tally, pick: e.infringement ?? e.cause });
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
  const last = rugbyLast(s);
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
    // the scoreboard time (rugby counts up over the match), within this period
    const want = Number(m[1]) * 60 + Number(m[2] ?? 0);
    dispatch({ type: 'SET_CLOCK', payload: { periodSec: Math.max(0, want - nominalOffset(s, s.period)), at: Date.now() } });
    setSetting(false); setClockInput('');
  };

  /* ---- after the final whistle: the kicking competition ---- */
  if (s.ended) {
    if (s.shootout) {
      const sc = soScore(s);
      const nextSide = nextKicker(s.shootout);
      const n = s.shootout[nextSide].length + 1;
      return (
        <View style={c.wrap}>
          <View style={c.panel}>
            <Text style={c.h}>🎯 Kicking competition · {sc.home}–{sc.away}</Text>
            {(['home', 'away'] as const).map((sd) => (
              <View key={sd} style={c.soRow}>
                <Text style={c.soTeam} numberOfLines={1}>{name(sd)}</Text>
                <Text style={c.soDots}>{s.shootout![sd].map((k) => (k.scored ? '●' : '○')).join(' ') || '–'}</Text>
              </View>
            ))}
            {s.shootoutWinner ? (
              <Text style={c.done}>{name(s.shootoutWinner)} win the kicking competition {sc.home}–{sc.away}</Text>
            ) : needsSdPick(s) ? (
              <>
                <Text style={c.meta}>5 each and still level — one kick each until decided. Who kicks first?</Text>
                <View style={c.row}>
                  <Button variant="primary" label={`${homeName} first`} color={color('home')} style={c.flex} onPress={() => dispatch({ type: 'SO_ORDER', payload: { first: 'home' } })} />
                  <Button variant="primary" label={`${awayName} first`} color={color('away')} style={c.flex} onPress={() => dispatch({ type: 'SO_ORDER', payload: { first: 'away' } })} />
                </View>
              </>
            ) : (
              <>
                <Text style={c.meta}>Next: {name(nextSide)} · kick {n}{n > 5 ? ' (one each until decided)' : ''}</Text>
                <Text style={c.small}>Kicker (optional)</Text>
                <PlayerGrid players={sanctionable(nextSide).filter((p) => p.id !== soTaker?.id)} onPick={(p) => setSoTaker(p)} />
                {soTaker ? <Text style={c.meta}>Kicker: {soTaker.fullName}</Text> : null}
                <View style={c.row}>
                  <Button variant="primary" label="✓ Over" accessibilityLabel="Kick successful" color={color(nextSide)} style={c.flex} onPress={() => {
                    dispatch({ type: 'SO', side: nextSide, payload: { scored: true }, ...(soTaker ? { attribution: { playerId: soTaker.id, stat: 'soTaken', extra: { soGoals: 1 } } } : {}) });
                    setSoTaker(null);
                  }} />
                  <Button label="✗ Missed" variant="ghost" style={c.flex} onPress={() => {
                    dispatch({ type: 'SO', side: nextSide, payload: { scored: false }, ...(soTaker ? { attribution: { playerId: soTaker.id, stat: 'soTaken' } } : {}) });
                    setSoTaker(null);
                  }} />
                </View>
              </>
            )}
          </View>
        </View>
      );
    }
    return (
      <View style={c.wrap}>
        <View style={c.panel}>
          <Text style={c.h}>Full time · {s.home}–{s.away}{s.plan.length > 2 ? ' (after extra time)' : ''}</Text>
          {level && kicksAfter(s.decider) ? (
            <>
              <Text style={c.meta}>Level — the match goes to a kicking competition (5 kicks each, then one each until decided).</Text>
              <Text style={c.h}>🪙 Who kicks first?</Text>
              <Text style={c.meta}>After the referee’s toss (or however they decide) — pick the team going first.</Text>
              <View style={c.row}>
                <Button variant="primary" label={`${homeName} first`} color={color('home')} style={c.flex} onPress={() => dispatch({ type: 'START_SHOOTOUT', payload: { first: 'home' } })} />
                <Button variant="primary" label={`${awayName} first`} color={color('away')} style={c.flex} onPress={() => dispatch({ type: 'START_SHOOTOUT', payload: { first: 'away' } })} />
              </View>
            </>
          ) : (
            <Text style={c.meta}>{s.agg ? `${aggLine(s)}${level ? '.' : ` — ${name(s.home + s.agg.home > s.away + s.agg.away ? 'home' : 'away')} go through.`}` : level ? 'Draw.' : `${name(s.home > s.away ? 'home' : 'away')} win.`} Use “Correct the timeline” below to fix a moment.</Text>
          )}
        </View>
        <EditList s={s} show={showEdit} setShow={setShowEdit} onRemove={remove} homeName={homeName} awayName={awayName} />
      </View>
    );
  }

  /* ---- flows ---- */
  const flowPanel = (() => {
    if (!flow) return null;
    const sd = flow.side;
    const head = (t: string) => (
      <View style={c.flowHead}>
        <Text style={[c.h, { color: color(sd) }]} numberOfLines={1}>{t} · {name(sd)}</Text>
        <Text style={c.cancel} accessibilityRole="button" onPress={() => setFlow(null)}>Cancel</Text>
      </View>
    );
    switch (flow.mode) {
      case 'try':
        if (flow.step === 'scorer') return (
          <View style={c.panel}>{head('Try (5)')}
            <Text style={c.small}>Who scored?</Text>
            <PlayerGrid players={onField(sd)} onPick={(p) => setFlow({ ...flow, scorer: p, step: 'assist' })}
              skip={{ label: 'Team try (no scorer)', onPress: () => scoreTry(sd, null, null) }} />
          </View>
        );
        return (
          <View style={c.panel}>{head('Try assist')}
            <PlayerGrid players={onField(sd).filter((p) => p.id !== flow.scorer?.id)} onPick={(p) => scoreTry(sd, flow.scorer ?? null, p)}
              skip={{ label: 'No assist', onPress: () => scoreTry(sd, flow.scorer ?? null, null) }} />
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
      case 'kick':
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head('Kick at goal')}
            <View style={c.row}>
              <Button label="🎯 Penalty goal (3)" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, kick: 'pen', step: 'result' })} />
              <Button label="🦶 Drop goal (3)" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, kick: 'drop', step: 'result' })} />
            </View>
          </View>
        );
        if (flow.step === 'result') return (
          <View style={c.panel}>{head(KICK_LABEL[flow.kick ?? 'pen'])}
            <View style={c.row}>
              <Button variant="primary" label="✓ Good" color={color(sd)} style={c.flex} onPress={() => setFlow({ ...flow, made: true, step: 'kicker' })} />
              <Button label="✗ Missed" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, made: false, step: 'kicker' })} />
            </View>
          </View>
        );
        return (
          <View style={c.panel}>{head(`${KICK_LABEL[flow.kick ?? 'pen']} ${flow.made ? 'good' : 'missed'} — kicker`)}
            <PlayerGrid players={kickers(sd)} onPick={(p) => kick(sd, flow.kick ?? 'pen', !!flow.made, p)} skip={{ label: 'Skip kicker', onPress: () => kick(sd, flow.kick ?? 'pen', !!flow.made, null) }} />
          </View>
        );
      case 'card': {
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head(flow.pt ? 'Penalty try — card for the offender? (optional)' : 'Card')}
            <View style={c.row}>
              <Button label="🟨 Yellow" variant="ghost" style={c.flex} onPress={() => cardPick(flow, 'yellow')} />
              <Button label="🟥 Red" variant="ghost" style={c.flex} onPress={() => cardPick(flow, 'red', false)} />
            </View>
            {s.red20 ? <Button label="🟥 20-minute red" accessibilityLabel="20-minute red card: replaceable after 20 minutes" variant="ghost" onPress={() => cardPick(flow, 'red', true)} /> : null}
            {flow.pt ? <Button label="✓ No card" variant="ghost" onPress={() => setFlow(null)} /> : null}
            <Text style={c.meta}>Yellow: the sin-bin, {s.sinBinMinutes} minutes of playing time, the team plays a player short. Red: off for the rest of the match.{s.red20 ? ' 20-minute red (World Rugby trial): off for good, a replacement may come on after 20 minutes.' : ''} A second yellow is a red.</Text>
          </View>
        );
        const k = flow.card ?? 'yellow';
        return (
          <View style={c.panel}>{head(k === 'yellow' ? 'Yellow card' : flow.red20 ? '20-minute red card' : 'Red card')}
            <PlayerGrid players={sanctionable(sd)} onPick={(p) => card(sd, k, p, flow.red20)} skip={{ label: 'Player not listed', onPress: () => card(sd, k, null, flow.red20) }} />
            {k === 'yellow' ? <Text style={c.meta}>A player already on a yellow gets a red ({s.red20 ? '20-minute red under the trial' : 'second yellow'}).</Text> : null}
            <Text style={c.small}>Or a team official</Text>
            <View style={c.row}>
              <View style={c.flex}><TextField label="Official's role (optional)" value={official} onChange={setOfficial} placeholder="e.g. Coach" autoCapitalize="words" /></View>
              <Button label="Record" variant="ghost" onPress={() => officialCard(sd, k)} />
            </View>
          </View>
        );
      }
      case 'sub': {
        if (flow.step === 'kind') {
          const temps = openTemps(s, sd);
          return (
            <View style={c.panel}>{head('Replacement')}
              <Button label="🔁 Replacement" variant="ghost" onPress={() => setFlow({ ...flow, kind: 'perm', step: 'off' })} />
              <View style={c.row}>
                <Button label="🩺 HIA (temporary)" accessibilityLabel="Head injury assessment: temporary replacement" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, kind: 'hia', step: 'off' })} />
                <Button label="🩸 Blood (temporary)" variant="ghost" style={c.flex} onPress={() => setFlow({ ...flow, kind: 'blood', step: 'off' })} />
              </View>
              {temps.length ? <Button label={`↩ Back on (${temps.length})`} variant="ghost" onPress={() => setFlow({ ...flow, step: 'back' })} /> : null}
              <Text style={c.meta}>{s.maxSubs > 0 ? `${subsUsed(s, sd)} of ${s.maxSubs} replacements used` : 'No replacement limit'}{s.rolling ? ' · rolling: a replaced player may come back on' : ''}. HIA / blood replacements don’t count.</Text>
            </View>
          );
        }
        if (flow.step === 'back') return (
          <View style={c.panel}>{head('Back on')}
            {openTemps(s, sd).map((o) => {
              const offP = byId(sd, o.off.id, o.off.name);
              const onP = byId(sd, o.on.id, o.on.name);
              if (!offP || !onP) return null;
              return <Button key={o.id} label={`${offP.fullName} ⬆ · ${onP.fullName} ⬇ (${o.temp === 'hia' ? 'HIA' : 'blood'})`} variant="ghost" onPress={() => sub(sd, onP, offP, 'perm', true)} />;
            })}
          </View>
        );
        if (flow.step === 'off') {
          const live = rugbyLiveField(s, now, playerNameOf);
          return (
            <View style={c.panel}>{head(`${flow.kind === 'hia' ? 'HIA' : flow.kind === 'blood' ? 'Blood' : 'Replacement'} — who comes off?`)}
              <PlayerGrid players={onField(sd)} onPick={(p) => setFlow({ ...flow, off: p, step: 'on' })}
                skip={live.short[sd] > 0 && !live.suspended.some((x) => x.side === sd) ? { label: 'No one — fill the empty place', onPress: () => setFlow({ ...flow, off: null, step: 'on' }) } : undefined} />
            </View>
          );
        }
        const full = (flow.kind ?? 'perm') === 'perm' && !!flow.off && s.maxSubs > 0 && subsUsed(s, sd) >= s.maxSubs;
        return (
          <View style={c.panel}>{head(flow.off ? `On for ${flow.off.fullName}` : 'Who comes on?')}
            {full ? <Text style={c.short}>All {s.maxSubs} replacements used — only allowed if the laws say so (e.g. a front-row or injury replacement).</Text> : null}
            <PlayerGrid players={bench(sd)} onPick={(p) => sub(sd, flow.off ?? null, p, flow.kind ?? 'perm')} />
          </View>
        );
      }
      case 'ruledout':
        return (
          <View style={c.panel}>{head('❎ Try ruled out')}
            <Text style={c.meta}>Why? (optional — one tap logs it; the score doesn’t move)</Text>
            <View style={c.chips}>
              <Chip label="After the TMO" on={!!flow.review} onPress={() => setFlow({ ...flow, review: !flow.review })} />
            </View>
            <View style={c.chips}>
              {RULED_OUT_REASONS.rugby.map((r) => <Chip key={r} label={RULED_OUT_LABEL[r]} on={false} onPress={() => { fire(ruledOutAction('rugby', sd, { reason: r, review: flow.review })); setFlow(null); }} />)}
            </View>
            <Button label="Log it — no reason" variant="ghost" onPress={() => { fire(ruledOutAction('rugby', sd, { review: flow.review })); setFlow(null); }} />
            <Text style={c.meta}>Already on the board? Remove the try from the timeline too.</Text>
          </View>
        );
      case 'detail':
        if (flow.step === 'kind') return (
          <View style={c.panel}>{head('Detail')}
            <View style={c.grid}>
              {/* with "Penalties by offence" on, penalties go through its own button (offence + player) */}
              {DETAIL_KEYS.filter((d) => !(d === 'penaltyConceded' && s.trackPenalties)).map((d) => <Button key={d} label={DETAIL_LABEL[d]} variant="ghost" style={c.typeBtn} onPress={() => setFlow({ ...flow, detail: d, step: 'player' })} />)}
            </View>
            <Text style={c.small}>Set piece on {name(sd)}’s throw / feed</Text>
            <View style={c.row}>
              <Button label="🙌 Lineout won" variant="ghost" style={c.flex} onPress={() => { setPiece(sd, 'lineout', true); setFlow(null); }} />
              <Button label="Lineout lost" variant="ghost" style={c.flex} onPress={() => { setPiece(sd, 'lineout', false); setFlow(null); }} />
            </View>
            <View style={c.row}>
              <Button label="🤼 Scrum won" variant="ghost" style={c.flex} onPress={() => { setPiece(sd, 'scrum', true); setFlow(null); }} />
              <Button label="Scrum lost" variant="ghost" style={c.flex} onPress={() => { setPiece(sd, 'scrum', false); setFlow(null); }} />
            </View>
          </View>
        );
        return (
          <View style={c.panel}>{head(DETAIL_LABEL[flow.detail ?? 'tackle'])}
            <PlayerGrid players={onField(sd)} onPick={(p) => detail(sd, flow.detail ?? 'tackle', p)} skip={{ label: 'Skip player', onPress: () => detail(sd, flow.detail ?? 'tackle', null) }} />
          </View>
        );
      case 'tally': {
        // one panel: the offence / cause chips (optional, pick then the player), then who — the player tap records it
        const opts: [string, string][] = flow.kind === 'penalty' ? INFRINGEMENTS.map((k) => [k, INFRINGEMENT_LABEL[k]])
          : flow.kind === 'turnover' ? TURNOVER_CAUSES.map((k) => [k, CAUSE_LABEL[k]]) : [];
        return (
          <View style={c.panel}>{head(TALLY_LABEL[flow.kind])}
            {opts.length ? (
              <>
                <Text style={c.small}>{flow.kind === 'penalty' ? 'Offence (optional)' : 'How (optional)'}</Text>
                <View style={c.chips}>
                  {opts.map(([k, l]) => <Chip key={k} label={l} on={flow.pick === k} onPress={() => setFlow({ ...flow, pick: flow.pick === k ? undefined : k })} />)}
                </View>
              </>
            ) : null}
            <Text style={c.small}>Who? (optional — tapping records it)</Text>
            <PlayerGrid players={onField(sd)} onPick={(p) => tally(sd, flow.kind, p, flow.pick)}
              skip={{ label: 'Team (no name)', onPress: () => tally(sd, flow.kind, null, flow.pick) }} />
          </View>
        );
      }
    }
  })();

  const live = rugbyLiveField(s, now, playerNameOf);
  /** deep wave: the tallies switched on for this match (the toggle, not just past events) */
  const kindsOn: TallyKind[] = TRACK_FLAGS.filter((f) => s[f] === true).flatMap((f) => TRACK_KINDS[f]);
  const extras = (sd: Side) => (kindsOn.length && periodStarted(s) ? (
    <View style={c.chips} accessibilityLabel={`More stats for ${name(sd)}`}>
      {kindsOn.map((k) => (
        <Chip key={k} label={TALLY_CHIP[k]} on={false} a11y={`${TALLY_LABEL[k]}, ${name(sd)}`}
          onPress={() => (ONE_TAP.includes(k) ? tally(sd, k, null) : setFlow({ mode: 'tally', side: sd, kind: k }))} />
      ))}
    </View>
  ) : null);
  const sideCol = (sd: Side) => (
    <View key={sd} style={c.col}>
      <Text style={[c.team, { color: color(sd) }]} numberOfLines={1}>{name(sd)}</Text>
      <MainAction label="🏉 Try" color={color(sd)} onPress={() => setFlow({ mode: 'try', side: sd, step: 'scorer' })} />
      <Button label="🎯 Kick at goal" accessibilityLabel="Penalty goal or drop goal" variant="ghost" onPress={() => setFlow({ mode: 'kick', side: sd, step: 'kind' })} />
      {/* invasion batch 5 (Law 8): the offender is usually carded — an optional card step follows */}
      <Button label="🏉 Penalty try" accessibilityLabel="Penalty try, 7 points" variant="ghost" onPress={() => { fire({ type: 'PENALTY_TRY', side: sd }); if (!editAt && !isSuddenDeath(s, s.period)) setFlow({ mode: 'card', side: other(sd), step: 'kind', pt: true }); }} />
      <Button label="🟨 Card" variant="ghost" onPress={() => setFlow({ mode: 'card', side: sd, step: 'kind' })} />
      <Button label="🔁 Sub" accessibilityLabel="Replacement" variant="ghost" onPress={() => setFlow({ mode: 'sub', side: sd, step: 'kind' })} />
      {s.trackDetail ? <Button label="📋 Detail" accessibilityLabel="Tackles, carries, set pieces" variant="ghost" onPress={() => setFlow({ mode: 'detail', side: sd, step: 'kind' })} /> : null}
      {/* invasion batch 6: a try ruled out (TMO or not) — only with the toggle on */}
      {ruledOutOn ? <Button label="❎ Try ruled out" accessibilityLabel={`${name(sd)} try ruled out`} variant="ghost" onPress={() => setFlow({ mode: 'ruledout', side: sd })} /> : null}
      {extras(sd)}
      {/* invasion batch 6: what the penalty was used for, and the 50:22 — one tap, the team */}
      {s.trackRestarts ? (
        <View style={c.chips} accessibilityLabel={`Penalty options and kicks for ${name(sd)}`}>
          {UNION_RESTARTS.map((k) => <Chip key={k} label={RESTART_LABEL[k]} on={false} a11y={`${RESTART_LABEL[k]}, ${name(sd)}`} onPress={() => fire(restartAction(sd, k))} />)}
        </View>
      ) : null}
      {live.short[sd] > 0 ? <Text style={c.short}>Playing {live.short[sd]} short</Text> : null}
    </View>
  );

  /* ---- deep wave: possession & territory switches ---- */
  const ballPanel = s.trackPossession ? (() => {
    const at = matchSec(s, now);
    const pos = ballTime(s, 'poss', 'all', at), ter = ballTime(s, 'terr', 'all', at);
    const pct = (x: { home: number; away: number }) => (x.home + x.away > 0 ? `${Math.round((x.home / (x.home + x.away)) * 100)}% – ${100 - Math.round((x.home / (x.home + x.away)) * 100)}%` : '–');
    // round 2: "Ball dead" pauses both clocks until a team is tapped (or "Ball live")
    const dead = ballDead(s);
    const hasBall = dead ? undefined : currentBall(s, 'poss'), hasTerr = currentBall(s, 'terr');
    return (
      <View style={c.panel}>
        <Text style={c.small}>Possession {pct(pos)} · Territory {pct(ter)}{dead ? ' · ⏸ ball dead' : ''}</Text>
        <View style={c.row}>
          {(['home', 'away'] as const).map((sd) => (
            <Button key={sd} label={`${hasBall === sd ? '● ' : ''}Ball: ${name(sd)}`} variant={hasBall === sd ? sd : 'ghost'} color={color(sd)} style={c.flex}
              selected={hasBall === sd} accessibilityLabel={`${name(sd)} have the ball`} onPress={() => ball('POSSESSION', sd)} />
          ))}
        </View>
        <View style={c.row}>
          {(['home', 'away'] as const).map((sd) => (
            <Button key={sd} label={`${hasTerr === sd ? '● ' : ''}In ${name(sd === 'home' ? 'away' : 'home')} half`} variant={hasTerr === sd ? sd : 'ghost'} color={color(sd)} style={c.flex}
              selected={hasTerr === sd} accessibilityLabel={`Play in the ${name(sd === 'home' ? 'away' : 'home')} half: ${name(sd)} territory`} onPress={() => ball('TERRITORY', sd)} />
          ))}
        </View>
        <Button label={dead ? '▶ Ball live' : '⏸ Ball dead'} variant={dead ? 'primary' : 'ghost'} selected={dead} disabled={!currentBall(s, 'poss')}
          accessibilityLabel={dead ? 'Ball live: possession and territory clocks run again' : 'Ball dead: pause possession and territory at a stoppage'}
          onPress={() => fire({ type: 'BALL_DEAD', payload: { dead: !dead } })} />
        <Text style={c.meta}>Tap when the ball changes hands and when play crosses halfway — time on the playing clock drives the %. “Ball dead” at a stoppage (scrum, lineout, kick at goal, injury) pauses both; tap the team with the ball to restart.</Text>
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
        {toMore && periodStarted(s) ? <Text style={c.meta}>Level — ending this period goes on to {nextPlan(s)[0] === 'sd' ? `sudden death (${s.sdMinutes} min, first score wins)` : `extra time (2 × ${s.etMinutes} min)`}.</Text> : null}
        {setting ? (
          <View style={c.row}>
            <View style={c.flex}><TextField label="Match clock (mm:ss)" value={clockInput} onChange={setClockInput} placeholder={clockFace(s, now).split(' ')[0]} /></View>
            <Button variant="primary" label="Set" onPress={applyClock} />
          </View>
        ) : null}
        {ps >= len && running(s) ? <Text style={c.short}>Time is up — the half ends when the ball is next dead.</Text> : null}
        {!running(s) && periodStarted(s) ? (
          <View style={c.stopped} accessibilityRole="alert">
            <IconText label={"⏸ Clock stopped"} style={c.stoppedTxt} />
            <Button variant="primary" label="▶ Resume" onPress={startStop} />
          </View>
        ) : null}
      </View>

      {flowPanel ?? (
        <>
          {ballPanel}
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
  s: RugbyState; show: boolean; setShow: (v: boolean) => void; onRemove: (e: RugbyEvent) => void; onEdit?: (e: RugbyEvent) => void; homeName: string; awayName: string;
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
            {onEdit && e.type !== 'pentry' && e.type !== 'setpiece' && !(e.type === 'tally' && ONE_TAP.includes(e.tally ?? 'entry')) ? <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${d.label}`} onPress={() => onEdit(e)} /> : null}
            <RowAction label="✕" tone="remove" a11y={`Remove ${d.label}`} onPress={() => void confirmRemove(`${d.label} (${eventWhen(s, e)})`, () => onRemove(e),
              pointsOf(e) ? 'The score and player stats re-adjust.' : undefined)} />
          </View>
        );
      }) : null}
    </View>
  );
}

/* ------------------------------- live views -------------------------------- */

const LiveClock: NonNullable<SportPlugin<RugbyState>['LiveClock']> = ({ state }) => {
  const s = state as RugbyState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running(s)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.clock?.since, s.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now();
  const so = soScore(s);
  const label = s.ended ? (s.shootout ? `FT · kicks ${so.home}–${so.away}` : s.plan.length > 2 ? 'FT (AET)' : 'FT')
    : !periodStarted(s) ? (s.period === 1 ? '—' : `${periodName(s, s.period)} next`) : `${periodName(s, s.period)} ${clockFace(s, now)}`;
  const { nameOf } = useMask();
  const live = s.ended ? null : rugbyLiveField(s, now, nameOf);
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing(1), flex: 1, minWidth: 0 }}>
      <View style={c.clockRow2}>
        <View style={[c.dot, { backgroundColor: running(s) ? theme.colors.danger : theme.colors.textMuted }]} />
        <Text style={c.clockSmall}>{label}</Text>
      </View>
      {live ? (
        <View style={{ alignSelf: 'stretch' }}>
          <FieldBanner suspended={live.suspended} onField={live.short.home || live.short.away ? live.onField : null} />
        </View>
      ) : null}
    </View>
  );
};

/** Points per half (and extra time), the live half highlighted. */
const RugbyScoreboard: NonNullable<SportPlugin<RugbyState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as RugbyState;
  const n = Math.max(totalPeriods(s), s.period);
  const columns = [
    ...Array.from({ length: n }, (_, i) => ({ label: periodName(s, i + 1), highlight: !s.ended && i + 1 === s.period })),
    ...(s.shootout ? [{ label: 'K' }] : []),
  ];
  const pts = (sd: Side, p: number) => s.events.filter((e) => e.side === sd && e.period === p).reduce((a, e) => a + pointsOf(e), 0);
  const so = soScore(s);
  const cells = (sd: Side) => [
    ...Array.from({ length: n }, (_, i) => (i + 1 <= s.period || s.ended ? String(pts(sd, i + 1)) : '')),
    ...(s.shootout ? [String(so[sd])] : []),
  ];
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

/** The Stats tab's views — the broadcast match stats (half / category
 *  filters) and the box score. (The sin-bin banner stays on the scoreboard.) */
const VIEWS = [{ key: 'stats', label: 'Match stats' }, { key: 'box', label: 'Box score' }] as const;

/** Match tabs (2026-10-22): the play-by-play on Commentary (its "Key moments"
 *  chip replaces the old separate Key-moments view); match stats and the box
 *  score on Stats. */
type TabProps = Parameters<NonNullable<SportPlugin<RugbyState>['LiveExtras']>>[0];
const RugbyCommentary = ({ state, homeName, awayName, homeColor, awayColor }: TabProps) => {
  // IDs-only scoring: names looked up by id for this viewer
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(state as RugbyState, nameOf), [state, nameOf]);
  return (
    <GroupedFeed groups={rugbyCommentary(s, { home: homeName, away: awayName })} homeColor={homeColor} awayColor={awayColor} tags={RUGBY_FEED_TAGS} scopeLabel={rugbyScopeLabel(s)}
      emptyText="Nothing yet — the commentary fills in from the kick-off." />
  );
};
const RugbyStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  // IDs-only scoring: names looked up by id for this viewer
  const { nameOf } = useMask();
  const s = useMemo(() => withNames(state as RugbyState, nameOf), [state, nameOf]);
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const scopes = n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
  return (
    <SubViews label="Stats view" views={VIEWS.map((v) => ({
      ...v,
      render: () => v.key === 'stats' ? (
        <StatSheetView build={(sc) => rugbySheet(s, sc, s.ended ? undefined : matchSec(s, Date.now()))} scopes={scopes}
          homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />
      ) : (
        <MatchBoxScore sport="rugby" source={rugbyBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} show="box" />
      ),
    }))} />
  );
};

/* --------------------------------- plugin ---------------------------------- */

export const rugbyPlugin: SportPlugin<RugbyState> = {
  ...RUGBY_META,
  matchRecords: rugbyMatchRecords, // SD-51 (set by the registry before perf F-15)
  createInitialState: init,
  reducer,
  isComplete,
  result,
  summary: (s) => {
    const so = soScore(s);
    return {
      homeScore: String(s.home),
      awayScore: String(s.away),
      statusLine: s.shootoutWinner
        ? `${s.shootoutWinner === 'home' ? 'Home' : 'Away'} win ${so.home}–${so.away} on the kicking competition`
        : s.shootout ? `Kicking competition ${so.home}–${so.away}`
        : s.ended ? (s.plan.length > 2 ? 'Full Time (after extra time)' : 'Full Time')
        : !periodStarted(s) && s.period > 1 ? (s.period === 2 ? 'Half-time' : `End of ${periodName(s, s.period - 1)}`)
        : periodLong(s, s.period)[0].toUpperCase() + periodLong(s, s.period).slice(1),
      detailLine: [aggLine(s), s.shootout ? `Kicking competition · ${so.home}–${so.away}` : ''].filter(Boolean).join(' · ') || undefined,
      homeReds: s.events.filter((e) => e.type === 'card' && !e.official && e.card === 'red' && e.side === 'home').length,
      awayReds: s.events.filter((e) => e.type === 'card' && !e.official && e.card === 'red' && e.side === 'away').length,
    };
  },
  scoreLine: rugbyScoreLine,
  statTotals: rugbyTotals,
  standingsUnits: rugbyStandingsUnits as SportPlugin<RugbyState>['standingsUnits'],
  undoLabel: rugbyUndoLabel,
  tickerDetail: rugbyTickerDetail,
  tickerFlash: rugbyTickerFlash,
  voice: { hints: ['try {name} assist {name}', 'conversion good {name}', 'penalty goal {name}', 'drop goal missed {name}', 'yellow card {name}', 'penalty try home', 'end half'], parse: rugbyVoice, ends: rugbyVoiceEnds },
  ScoringControls,
  LiveClock,
  Scoreboard: RugbyScoreboard,
  matchTabs: { Commentary: RugbyCommentary, Stats: RugbyStats },
  formation: (perSide) => rugbyFormation(perSide),
  Court: RugbyPitch,
  liveSettings: RUGBY_LIVE_SETTINGS,
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
  done: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800' },
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
  chip: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.inputBorder, minHeight: 44, justifyContent: 'center' },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTxt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  chipTxtOn: { color: theme.colors.onFill },
  pchip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, maxWidth: '100%' },
  pnum: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  pname: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', flexShrink: 1 },
  skip: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'transparent' },
  skipTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  soRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  soTeam: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', width: 110 },
  soDots: { color: theme.colors.text, fontSize: theme.font.body, letterSpacing: 1, flex: 1 },
  stopped: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent },
  stoppedTxt: { flex: 1, color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800', paddingVertical: theme.spacing(3) },
  editRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editWhen: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', width: 72 },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});
