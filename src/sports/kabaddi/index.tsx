/**
 * Kabaddi plugin — archetype: raid. Two timed halves with a running clock.
 * Raid and tackle points are attributed to players and logged to the timeline
 * with the match minute.
 *
 * IDs-only scoring (docs/privacy/ids-only-scoring.md): every action this
 * scorer dispatches names players by id only (raidActions, actions.ts); the
 * screens put names back by id for the viewer (useMask().nameOf, names.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, TextField, textStyles } from '../../components/ui';
import { askConfirm, confirmMatchAction } from '../../components/ConfirmSheet';
import { FieldBanner } from '../FieldBanner';
import { MatchBoxScore } from '../../components/BoxScore';
import type { LiveEvent } from '../liveEvents';
// deep wave — PKL match centre, the deep player box, raid-by-raid commentary, Stats to track
import { KabaddiStatsPanel } from './StatsPanel';
import { kabaddiDeepBox, KABADDI_DEEP_BOX } from './deepBox';
import { kabaddiCommentary } from './commentary';
import { FeedView } from '../netraid/FeedView';
import { KABADDI_LIVE_SETTINGS } from './settings';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { kabaddiVoice } from '../voiceParsers';
import { LineScoreboard } from '../../components/LineScoreboard';
import { courtFormation, makeCourt } from '../courts';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';
import { sum, doOrDieOn } from './rules';
import { kabaddiTotals, kabaddiSuspended } from './totals.ts';
import { useMask } from '../../core/disputeMask';
import { subAction, techPointAction, cardAction, pointAction, removeEventAction } from './actions';
import { kabaddiEventDetail, withRosters } from './names';

import {
  init, reducer, currentMinute, halfLabel, previewRaid, raidOfEvent, raidActions, isRaidHead, kabaddiWinner, halfPoints, defendersOnMat,
  expectedRaider, outPlayers, clockPaused, timeoutsUsed, TIMEOUTS_PER_HALF, TACKLE_TYPES,
  formOutcome, matNow, kabaddiCfg, touchChips, unavailable, unavailableOf, listHas, isSubbedOff, cardsOf, suggestedCard, TECH_REASONS, CARD_ICON, RAID_SKILLS,
  type KabaddiState, type KabaddiEvent, type CardColour,
} from './engine.ts';
import { KABADDI_META } from './meta';
import { kabaddiMatchRecords } from './records';

export { halfLabel, currentMinute };
export type { KabaddiState };


const Row = ({ label, roster, onPick, onTeam }: { label: string; roster: Player[]; onPick: (p: Player) => void; onTeam?: () => void }) => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={ctrl.label}>{label}</Text>
    <View style={ctrl.chips}>
      {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => onPick(p)} />)}
      {/* Team point — no named player (friendly whose players aren't on the app yet). */}
      {onTeam && <SelectChip label={roster.length ? '＋ Team' : '＋ Team point (no players yet)'} active={false} onPress={onTeam} />}
    </View>
  </View>
);

/** On-mat status (SD-72: suspended / sent-off players aren't on the mat) and
 *  the suspension banner — re-rendered every second while a yellow runs. */
const MatStatus = ({ state, homeName, awayName, homeRoster, awayRoster }: { state: KabaddiState; homeName: string; awayName: string; homeRoster: Player[]; awayRoster: Player[] }) => {
  const [, tick] = useState(0);
  // IDs-only scoring: a suspended player by id, named for this viewer
  const { nameOf } = useMask();
  const suspended = kabaddiSuspended(state, undefined, withRosters(nameOf, homeRoster, awayRoster));
  const running = suspended.length > 0 && !clockPaused(state) && !!state.startedAt;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const m = matNow(state);
  const size = state.teamSize ?? 7;
  const chip = (side: 'home' | 'away', nm: string) => {
    const bits = [m.short[side] - m.sentOff[side] > 0 ? `${m.short[side] - m.sentOff[side]} suspended` : null, m.sentOff[side] ? `${m.sentOff[side]} sent off` : null].filter(Boolean).join(', ');
    return <Text key={side} style={ctrl.matChip}>🟢 {nm} on mat: {m.onMat[side]}/{size}{bits ? ` (${bits})` : ''}</Text>;
  };
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <View style={ctrl.matRow}>{chip('home', homeName)}{chip('away', awayName)}</View>
      <FieldBanner suspended={suspended.map((x) => ({ ...x, name: `${x.name} (${x.side === 'home' ? homeName : awayName})` }))} />
    </View>
  );
};

const ScoringControls: SportPlugin<KabaddiState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  // IDs-only scoring: the log keeps ids; the scorer sees names by id
  const { nameOf } = useMask();
  const [sub, setSub] = useState<{ side: 'home' | 'away'; off?: Player } | null>(null);
  // Timeline correction: edit one past moment in place, or backfill a missed one.
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState<LiveEvent | null>(null); // a legacy raid/tackle point being re-entered
  const [backfillText, setBackfillText] = useState('');
  const [backfillMin, setBackfillMin] = useState<number | null>(null);
  // Guided raid capture: who raided, how many touched, bonus, was the raider caught.
  // `editOf` = re-entering a past guided raid (its id), stamped at its moment.
  const [raidFlow, setRaidFlow] = useState<{
    side: 'home' | 'away'; raider?: Player; touches: number; bonus: boolean; tackled: boolean; tackler?: Player;
    editOf?: number; at?: { minute: number; half: number }; tackleType?: string;
    /** SD-59: line-outs */
    defOut?: number; lineOut?: boolean;
    /** deep wave ("Stats to track"): raid skill, defenders touched */
    skill?: string; touched?: Player[];
  } | null>(null);
  // SD-59: a technical point (to `side`); SD-72: a card (to a player of `side`)
  const [tech, setTech] = useState<{ side?: 'home' | 'away'; reason?: string; by?: Player } | null>(null);
  const [card, setCard] = useState<{ side?: 'home' | 'away'; colour?: CardColour; who?: Player | 'official' | 'player'; tp: boolean; tpSet?: boolean } | null>(null);

  const hm = state.halfMinutes, et = state.extraTimeMinutes;
  const halfFromMin = (m: number): 1 | 2 | 3 | 4 => (m < hm ? 1 : m < 2 * hm ? 2 : m < 2 * hm + et ? 3 : 4);
  // While editing, stamp at the original moment; while backfilling, at the past
  // minute (its half derived); otherwise live.
  const stampFor = () =>
    raidFlow?.at ? raidFlow.at
    : edit ? { minute: edit.minute ?? 0, half: edit.half ?? state.half }
    : backfillMin != null ? { minute: backfillMin, half: halfFromMin(backfillMin) } : { minute: currentMinute(state), half: state.half };
  // SD-72: a live step also carries the time (suspensions run on the clock);
  // backfilled / edited steps keep their minute stamp only.
  const live = !raidFlow?.at && !edit && backfillMin == null;
  const fire = (action: ScoreAction) => dispatch({ ...action, payload: { ...action.payload, ...stampFor(), ...(live && state.startedAt ? { at: Date.now() } : null) } });
  // Pro-Kabaddi live figures, defensive against pre-upgrade state.
  const kEmpty = state.emptyRaids ?? { home: 0, away: 0 };

  // ----- Correct the timeline: remove / edit one specific past moment -----
  const allPlayers = [...homeRoster, ...awayRoster];
  // legacy only: an older log's name-only player → his id (the squads)
  const rosterId = (nm?: string) => (nm ? allPlayers.find((p) => p.fullName === nm)?.id : undefined);
  const byId = (id?: string, nm?: string) => allPlayers.find((p) => (id ? p.id === id : p.fullName === nm));
  // A guided raid (any of its lines) goes as a whole — raid, tackle, all-out.
  const removeEvent = (e: KabaddiEvent) => dispatch(removeEventAction(state, e, rosterId));
  // SD-114: what a ✕ takes with it — a guided raid goes with its tackle / all-out lines.
  const removeDetail = (e: KabaddiEvent): string | undefined => {
    if (e.group == null) return undefined;
    const lines = state.events.filter((x) => x.group === e.group).map((x) => x.label.replace(/ — .*$/, ''));
    return lines.length > 1 ? `Removes all of it: ${lines.join(', ')}. The score, players on the mat and stats re-derive.` : undefined;
  };
  // Edit a guided raid = re-open the raid form pre-filled; saving re-dispatches a
  // RAID_OUTCOME that replaces it in place (same id, same slot in the raid order).
  // Edit a legacy point = re-pick the player. Nothing changes until you save.
  const editEvent = (e: KabaddiEvent) => {
    setShowEdit(false);
    const r = raidOfEvent(state, e);
    if (r) {
      const { raid } = r;
      setRaidFlow({
        side: raid.side, touches: raid.touches, bonus: raid.bonus, tackled: raid.raiderOut,
        raider: byId(raid.raiderId, raid.raider), tackler: raid.raiderOut ? byId(raid.tacklerId, raid.tackler) : undefined,
        tackleType: raid.raiderOut ? raid.tt : undefined,
        ...(raid.defOut ? { defOut: raid.defOut } : null), ...(raid.lineOut ? { lineOut: true } : null),
        ...(raid.sk ? { skill: raid.sk } : null),
        ...(raid.touched?.length ? { touched: raid.touched.map((p) => byId(p.id, p.name)).filter((p): p is Player => !!p) } : null),
        editOf: raid.eid, at: { minute: raid.minute ?? 0, half: raid.half ?? state.half },
      });
      return;
    }
    setEdit(e);
  };
  const commitEdit = (p: Player) => {
    if (!edit || !edit.side || (edit.kind !== 'raid' && edit.kind !== 'tackle')) return;
    removeEvent(edit);
    fire(pointAction(edit.kind, edit.side, p, edit.points ?? 1));
    setEdit(null);
  };
  /** Log the guided raid (or its correction) — see raidActions. */
  const recordRaid = () => {
    if (!raidFlow) return;
    for (const action of raidActions(state, raidFlow, rosterId)) {
      if (action.type === 'REMOVE_EVENT') dispatch(action);
      else fire(action);
    }
    setRaidFlow(null);
  };

  // Players subbed off this match take no further part (by id; an older log by name).
  const onField = (side: 'home' | 'away', roster: Player[]) => roster.filter((p) => !isSubbedOff(state, side, p));
  // SD-72: sent off (red) / serving a yellow — can't raid, tackle or be substituted
  const unav = unavailable(state);
  const unavOf = (side: 'home' | 'away', p: Player) => unavailableOf(unav[side], p);
  const rosterFor = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);
  const subsLeft = (side: 'home' | 'away') => state.maxSubs - state.subsUsed[side];

  if (!state.startedAt && !state.ended && !state.goldenRaid && !edit && raidFlow?.editOf == null) {
    const startLabel = state.half === 1 ? '▶ Start match' : state.half === 2 ? '▶ Start 2nd half' : `▶ Start ${halfLabel(state.half)}`;
    const startHint = state.half === 1 ? 'Start the match to run the clock.' : state.half === 2 ? 'Half time.' : state.half === 3 ? 'Extra time — first half.' : 'Extra time — second half.';
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={ctrl.meta}>{startHint}</Text>
        <Button label={startLabel} onPress={() => dispatch({ type: 'KICKOFF', payload: { at: Date.now() } })} />
      </View>
    );
  }

  // Substitution flow (format: substitutes) — pick who comes off, then who comes on.
  // SD-114 (P0): pinned at the top of the controls while backfilling — every
  // raid is stamped at the past minute until the scorer goes back to live.
  const backToLive = () => { setBackfillMin(null); setBackfillText(''); };
  const backfillBar = backfillMin != null && !raidFlow?.at && !edit
    ? <BackfillBar at={`${backfillMin}′ (${halfLabel(halfFromMin(backfillMin))})`} onLive={backToLive} /> : null;

  if (sub) {
    const sideName = sub.side === 'home' ? homeName : awayName;
    const offOpts = onField(sub.side, rosterFor(sub.side)).filter((p) => !unavOf(sub.side, p));
    // SD-117b (format: subReturn): a player substituted earlier may come back on.
    const onOpts = rosterFor(sub.side).filter((p) => p.id !== sub.off?.id && !unavOf(sub.side, p) && (state.subReturn || !isSubbedOff(state, sub.side, p)));
    return (
      <View style={{ gap: theme.spacing(3) }}>
      {backfillBar}
      <View style={ctrl.subPanel}>
        <View style={ctrl.subHead}>
          <Text style={ctrl.label}>🔄 Substitution — {sideName}</Text>
          <Button label="Cancel" variant="ghost" onPress={() => setSub(null)} />
        </View>
        {!sub.off ? (
          <>
            <Text style={ctrl.meta}>{state.subReturn ? 'Who comes off? (may come back on later, within the limit)' : 'Who comes off? (takes no further part)'}</Text>
            <View style={ctrl.chips}>
              {offOpts.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => setSub({ ...sub, off: p })} />)}
            </View>
          </>
        ) : (
          <>
            <Text style={ctrl.meta}>Who comes on for {sub.off.fullName}?</Text>
            {onOpts.length > 0 ? (
              <View style={ctrl.chips}>
                {onOpts.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => {
                    fire(subAction(sub.side, sub.off!, p));
                    setSub(null);
                  }} />
                ))}
              </View>
            ) : <Text style={textStyles.muted}>No available substitute in the squad.</Text>}
          </>
        )}
      </View>
      </View>
    );
  }

  // In-place edit of one past raid/tackle: re-pick the player, stamped at the
  // original moment. The old point was already reversed on entry.
  if (edit) {
    const roster = onField(edit.side!, edit.side === 'home' ? homeRoster : awayRoster);
    const nm = edit.side === 'home' ? homeName : awayName;
    return (
      <View style={ctrl.subPanel}>
        <View style={ctrl.subHead}>
          <Text style={ctrl.label}>✎ Re-enter {edit.kind === 'tackle' ? 'Tackle' : 'Raid'} point — {nm}</Text>
          <Button label="Cancel" variant="ghost" onPress={() => setEdit(null)} />
        </View>
        <Text style={ctrl.editBanner}>Re-entering the {edit.minute}&apos; moment — your pick replaces the old one.</Text>
        <Text style={ctrl.meta}>Who got the point?</Text>
        <View style={ctrl.chips}>
          {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => commitEdit(p)} />)}
        </View>
      </View>
    );
  }

  const tied = state.home === state.away;
  const paused = clockPaused(state);
  const scorerNames = withRosters(nameOf, homeRoster, awayRoster);
  const expected = expectedRaider(state);
  const outNow = outPlayers(state);

  // 5-raid shootout tie-breaker: record each raid's points per side; the panel
  // decides the winner (best-of-5, then sudden death) and ends the match.
  if (state.shootout && !state.ended) {
    const so = state.shootout;
    const raidRow = (side: 'home' | 'away', label: string) => (
      <View key={side} style={{ gap: theme.spacing(1) }}>
        <Text style={ctrl.label}>🎯 {label} — {sum(so[side])} pts ({so[side].length}/5)</Text>
        <View style={ctrl.row}>
          {[0, 1, 2, 3].map((n) => (
            <Button key={n} label={n === 0 ? 'Empty' : `+${n}`} variant={n === 0 ? 'ghost' : side} style={ctrl.flex}
              onPress={() => fire({ type: 'SHOOTOUT_RAID', side, payload: { points: n } })} />
          ))}
        </View>
      </View>
    );
    return (
      <View style={{ gap: theme.spacing(4) }}>
        <View style={ctrl.grBanner}>
          <Text style={ctrl.grTitle}>🎯 5-RAID SHOOTOUT</Text>
          <Text style={ctrl.grMeta}>Level {state.home}–{state.away}. Each side takes five raids — most points wins (then sudden death). Tap the points each raid scores.</Text>
        </View>
        {raidRow('home', homeName)}
        {raidRow('away', awayName)}
        <Button label="End as a tie" variant="ghost" onPress={async () => { if (await confirmMatchAction('endTie', { drawWord: 'Tie', score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {backfillBar}
      {state.goldenRaid && (
        <View style={ctrl.grBanner}>
          <Text style={ctrl.grTitle}>⚡ GOLDEN RAID — SUDDEN DEATH</Text>
          <Text style={ctrl.grMeta}>Scores level {state.home}–{state.away}. The next point wins it — log the raid or tackle that decides the match.</Text>
        </View>
      )}
      {/* On-mat status: players in = teamSize − out − carded; suspensions count down. */}
      <MatStatus state={state} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} />

      {/* SD-117b: pause the clock for a timeout / injury / review; team timeouts */}
      {!state.goldenRaid && (
        <View style={{ gap: theme.spacing(2) }}>
          {paused && (
            <Text style={ctrl.pausedBanner} accessibilityLiveRegion="polite">⏸ Clock paused at {currentMinute(state)}′ — resume when play restarts.</Text>
          )}
          <View style={ctrl.row}>
            <Button label={paused ? '▶ Resume clock' : '⏸ Pause clock'} variant={paused ? 'primary' : 'ghost'} style={ctrl.flex}
              onPress={() => dispatch({ type: paused ? 'RESUME' : 'PAUSE', payload: { at: Date.now() } })} />
          </View>
          <View style={ctrl.row}>
            {(['home', 'away'] as const).map((side) => {
              const left = Math.max(0, TIMEOUTS_PER_HALF - timeoutsUsed(state, side));
              return (
                <Button key={side} label={`⏱️ Timeout — ${side === 'home' ? homeName : awayName} (${left} left)`} variant="ghost" style={ctrl.flex} disabled={left === 0}
                  onPress={() => {
                    fire({ type: 'TIMEOUT', side });
                    // the clock stops for a timeout
                    if (!paused && backfillMin == null) dispatch({ type: 'PAUSE', payload: { at: Date.now() } });
                  }} />
              );
            })}
          </View>
        </View>
      )}

      {!raidFlow ? (
        <View style={ctrl.row}>
          {(['home', 'away'] as const).map((side) => {
            // SD-117b: raids alternate — the side due to raid is highlighted, the
            // other is a quiet button; ⚠ DoD when its next raid is do-or-die.
            const dod = doOrDieOn(kabaddiCfg(state)) && kEmpty[side] >= 2;
            const due = expected === side;
            const nm = side === 'home' ? homeName : awayName;
            return (
              <Button key={side} label={`🤼 ${nm} raiding${dod ? ' · ⚠ DoD' : ''}${due ? ' ◀ next' : ''}`}
                variant={expected && !due ? 'ghost' : side} style={ctrl.flex}
                accessibilityHint={due ? 'Expected to raid next' : undefined}
                onPress={() => setRaidFlow({ side, touches: 0, bonus: false, tackled: false })} />
            );
          })}
        </View>
      ) : (
        <View style={ctrl.raidPanel}>
          <View style={ctrl.subHead}>
            <Text style={ctrl.label}>{raidFlow.editOf != null ? '✎' : '🤼'} {raidFlow.side === 'home' ? homeName : awayName} raiding</Text>
            <Button label="Cancel" variant="ghost" onPress={() => setRaidFlow(null)} />
          </View>
          {raidFlow.at && <Text style={ctrl.editBanner}>Editing the {raidFlow.at.minute}&apos; raid — saving replaces it in place.</Text>}
          {raidFlow.editOf == null && doOrDieOn(kabaddiCfg(state)) && kEmpty[raidFlow.side] >= 2 && (
            <Text style={ctrl.doOrDie}>⚠ DO-OR-DIE raid — the raider is out if this raid scores nothing.</Text>
          )}
          {onField(raidFlow.side, raidFlow.side === 'home' ? homeRoster : awayRoster).length > 0 && (
            <>
              <Text style={ctrl.meta}>Raider (optional)</Text>
              <View style={ctrl.chips}>
                {onField(raidFlow.side, raidFlow.side === 'home' ? homeRoster : awayRoster).map((p) => {
                  // SD-117b: tap again to clear; a player who's out can't raid (dimmed)
                  const un = raidFlow.editOf == null ? unavOf(raidFlow.side, p) : undefined;
                  const isOut = raidFlow.editOf == null && (listHas(outNow[raidFlow.side], p) || !!un);
                  const on = raidFlow.raider?.id === p.id;
                  return <SelectChip key={p.id} label={un ? `${p.fullName} · ${un.why === 'red' ? 'sent off' : 'suspended'}` : isOut ? `${p.fullName} · out` : p.fullName} active={on} disabled={isOut && !on}
                    onPress={() => setRaidFlow({ ...raidFlow, raider: on ? undefined : p })} />;
                })}
              </View>
            </>
          )}
          {(() => {
            // SD-114: you can't touch more defenders than are on the mat (the
            // engine caps v2 raids the same way).
            const onMat = defendersOnMat(state, raidFlow.side, raidFlow.editOf);
            // SD-83: a caught raider's touches don't score (AKFI / IKF / PKL) —
            // SD-59: nor do a raider's who stepped out
            const caughtVoid = state.caughtTouches === 'void' && raidFlow.tackled;
            const noTouches = caughtVoid || !!raidFlow.lineOut;
            return (
              <>
                <Text style={ctrl.meta}>Defenders touched (they go out) · {onMat} on the mat</Text>
                {!noTouches && (
                  <View style={ctrl.chips}>
                    {/* SD-136: one chip per defender who can be on the mat (a
                        6- or 7-touch raid is enterable); above the mat count is dimmed */}
                    {touchChips(state.teamSize ?? 7, onMat).map((n) => (
                      <SelectChip key={n} label={String(n)} active={raidFlow.touches === n} disabled={n > onMat} onPress={() => setRaidFlow({ ...raidFlow, touches: n })} />
                    ))}
                  </View>
                )}
                {noTouches
                  ? <Text style={ctrl.meta}>{raidFlow.lineOut ? 'Raider stepped out — his touches don’t count.' : 'Raider caught — touches don’t score and the touched defenders stay in (a bonus still counts).'}</Text>
                  : raidFlow.touches > onMat && <Text style={ctrl.doOrDie}>Only {onMat} defender{onMat === 1 ? '' : 's'} on the mat — this raid counts {onMat} touch{onMat === 1 ? '' : 'es'}.</Text>}
                {/* deep wave — "Defenders touched" (Stats to track): who goes out, by name */}
                {state.track?.touched && !noTouches && raidFlow.touches > 0 && (() => {
                  const defSide = raidFlow.side === 'home' ? 'away' : 'home';
                  const picked = raidFlow.touched ?? [];
                  const defenders = onField(defSide, rosterFor(defSide)).filter((p) => raidFlow.editOf != null || (!listHas(outNow[defSide], p) && !unavOf(defSide, p)));
                  if (!defenders.length) return null;
                  const max = Math.min(raidFlow.touches, onMat);
                  return (
                    <>
                      <Text style={ctrl.meta}>Who was touched? (optional · {picked.length}/{max})</Text>
                      <View style={ctrl.chips}>
                        {defenders.map((p) => {
                          const on = picked.some((x) => x.id === p.id);
                          return <SelectChip key={p.id} label={p.fullName} active={on} disabled={!on && picked.length >= max}
                            onPress={() => setRaidFlow({ ...raidFlow, touched: on ? picked.filter((x) => x.id !== p.id) : [...picked, p] })} />;
                        })}
                      </View>
                    </>
                  );
                })()}
                <Text style={ctrl.meta}>Line-out: defenders who stepped out (no struggle) — out, +1 each to the raiders</Text>
                <View style={ctrl.chips}>
                  {[0, 1, 2].map((n) => (
                    <SelectChip key={n} label={n === 0 ? 'None' : `${n} stepped out`} active={(raidFlow.defOut ?? 0) === n} disabled={n > Math.max(0, onMat - (noTouches ? 0 : raidFlow.touches))}
                      onPress={() => setRaidFlow({ ...raidFlow, defOut: n || undefined })} />
                  ))}
                </View>
              </>
            );
          })()}
          <View style={ctrl.chips}>
            <SelectChip label={`Bonus point: ${raidFlow.bonus ? 'Yes' : 'No'}`} active={raidFlow.bonus} onPress={() => setRaidFlow({ ...raidFlow, bonus: !raidFlow.bonus })} />
            <SelectChip label={`Raider tackled: ${raidFlow.tackled ? 'Yes' : 'No'}`} active={raidFlow.tackled} onPress={() => setRaidFlow({ ...raidFlow, tackled: !raidFlow.tackled, lineOut: raidFlow.tackled ? raidFlow.lineOut : undefined, tackler: raidFlow.tackled ? undefined : raidFlow.tackler, tackleType: raidFlow.tackled ? undefined : raidFlow.tackleType })} />
            {/* SD-59: the raider stepped out of bounds — out, +1 to the defence, no tackle */}
            <SelectChip label={`Raider stepped out: ${raidFlow.lineOut ? 'Yes' : 'No'}`} active={!!raidFlow.lineOut} onPress={() => setRaidFlow({ ...raidFlow, lineOut: !raidFlow.lineOut || undefined, ...(!raidFlow.lineOut ? { tackled: false, tackler: undefined, tackleType: undefined } : null) })} />
          </View>
          {/* deep wave — "Raid skill" (Stats to track): how the points were scored */}
          {state.track?.skills && !raidFlow.lineOut && (
            <>
              <Text style={ctrl.meta}>Raid skill (optional{raidFlow.touches > 0 || raidFlow.bonus ? '' : ' — Escape for an empty raid that broke a tackle'})</Text>
              <View style={ctrl.chips}>
                {RAID_SKILLS.map((k) => (
                  <SelectChip key={k.key} label={k.label} active={raidFlow.skill === k.key}
                    onPress={() => setRaidFlow({ ...raidFlow, skill: raidFlow.skill === k.key ? undefined : k.key })} />
                ))}
              </View>
            </>
          )}
          {/* Who made the tackle? Credits the defender their tackle (or super-tackle) point. */}
          {raidFlow.tackled && (() => {
            const defSide = raidFlow.side === 'home' ? 'away' : 'home';
            const defenders = onField(defSide, defSide === 'home' ? homeRoster : awayRoster);
            return defenders.length > 0 ? (
              <>
                <Text style={ctrl.meta}>Who made the tackle? (optional — credits the defender)</Text>
                <View style={ctrl.chips}>
                  {defenders.map((p) => {
                    const un = raidFlow.editOf == null ? unavOf(defSide, p) : undefined;
                    const isOut = raidFlow.editOf == null && (listHas(outNow[defSide], p) || !!un);
                    const on = raidFlow.tackler?.id === p.id;
                    return <SelectChip key={p.id} label={un ? `${p.fullName} · ${un.why === 'red' ? 'sent off' : 'suspended'}` : isOut ? `${p.fullName} · out` : p.fullName} active={on} disabled={isOut && !on}
                      onPress={() => setRaidFlow({ ...raidFlow, tackler: on ? undefined : p })} />;
                  })}
                </View>
              </>
            ) : null;
          })()}
          {raidFlow.tackled && (
            <>
              <Text style={ctrl.meta}>How was the raider stopped? (optional)</Text>
              <View style={ctrl.chips}>
                {TACKLE_TYPES.map((t) => (
                  <SelectChip key={t.key} label={t.label} active={raidFlow.tackleType === t.key}
                    onPress={() => setRaidFlow({ ...raidFlow, tackleType: raidFlow.tackleType === t.key ? undefined : t.key })} />
                ))}
              </View>
            </>
          )}
          {(() => {
            // What the engine will score for this raid — what the raider / tackler get.
            const b = previewRaid(state, formOutcome(raidFlow), raidFlow.editOf);
            if (!b) return null;
            const oppName = raidFlow.side === 'home' ? awayName : homeName;
            const bits = [
              `raid +${b.raidPts}${raidFlow.bonus && !b.bonusPts ? ' (bonus void: under 6 defenders)' : ''}`,
              b.defOutPts ? `line-out +${b.defOutPts}` : null,
              b.lineOut ? `line-out +1 to ${oppName}` : b.raiderOut ? `${b.superTackle ? 'super tackle' : b.doOrDieFail ? 'do-or-die stop' : 'tackle'} +${b.tacklePts} to ${oppName}` : null,
              b.allOuts.length ? `all out +2` : null,
            ].filter(Boolean).join(' · ');
            return <Text style={ctrl.meta}>Scores: {bits}</Text>;
          })()}
          <Button label={raidFlow.editOf != null ? '✓ Save raid' : '✓ Record raid'} onPress={recordRaid} />
        </View>
      )}

      {/* SD-59 technical point · SD-72 cards */}
      {!state.goldenRaid && !raidFlow && !tech && !card && (
        <View style={ctrl.row}>
          <Button label="⚖️ Technical point" variant="ghost" style={ctrl.flex} onPress={() => setTech({})} />
          <Button label="🟨 Card" variant="ghost" style={ctrl.flex} onPress={() => setCard({ tp: false })} />
        </View>
      )}
      {tech && (() => {
        const atFault = tech.side ? onField(tech.side === 'home' ? 'away' : 'home', rosterFor(tech.side === 'home' ? 'away' : 'home')) : [];
        return (
          <View style={ctrl.raidPanel}>
            <View style={ctrl.subHead}>
              <Text style={ctrl.label}>⚖️ Technical point</Text>
              <Button label="Cancel" variant="ghost" onPress={() => setTech(null)} />
            </View>
            <Text style={ctrl.meta}>Point to (nobody goes out — line-outs are logged on the raid)</Text>
            <View style={ctrl.chips}>
              {(['home', 'away'] as const).map((sd) => (
                <SelectChip key={sd} label={sd === 'home' ? homeName : awayName} active={tech.side === sd} onPress={() => setTech({ ...tech, side: sd, by: undefined })} />
              ))}
            </View>
            <Text style={ctrl.meta}>Why?</Text>
            <View style={ctrl.chips}>
              {TECH_REASONS.map((r) => (
                <SelectChip key={r.key} label={r.label} active={tech.reason === r.key} onPress={() => setTech({ ...tech, reason: tech.reason === r.key ? undefined : r.key })} />
              ))}
            </View>
            {atFault.length > 0 && (
              <>
                <Text style={ctrl.meta}>Who was at fault? (optional)</Text>
                <View style={ctrl.chips}>
                  {atFault.map((p) => (
                    <SelectChip key={p.id} label={p.fullName} active={tech.by?.id === p.id} onPress={() => setTech({ ...tech, by: tech.by?.id === p.id ? undefined : p })} />
                  ))}
                </View>
              </>
            )}
            <Button label={tech.side ? `✓ +1 to ${tech.side === 'home' ? homeName : awayName}` : 'Pick who gets the point'} disabled={!tech.side}
              onPress={() => {
                if (!tech.side) return;
                fire(techPointAction(tech.side, { reason: tech.reason, by: tech.by }));
                setTech(null);
              }} />
          </View>
        );
      })()}
      {card && (() => {
        const sd = card.side;
        const nm = (x?: 'home' | 'away') => (x === 'home' ? homeName : awayName);
        const opp = sd === 'home' ? 'away' : 'home';
        const players = sd ? onField(sd, rosterFor(sd)).filter((p) => unavOf(sd, p)?.why !== 'red') : [];
        const who = card.who;
        const person = typeof who === 'object' ? who : undefined;
        const counts = sd && person ? cardsOf(state, sd, person) : null;
        const hint = counts ? suggestedCard(counts) : null;
        const wasOut = !!(sd && person && listHas(outNow[sd], person));
        const tpDefault = (c?: CardColour) => c === 'red';
        const whoLabel = who === 'official' ? 'the team official' : person ? person.fullName : 'the player';
        const ready = !!sd && !!card.colour && !!who;
        const record = async () => {
          if (!ready || !sd || !card.colour) return;
          if (card.colour === 'red' && who !== 'official') {
            const ok = await askConfirm({
              title: `Red card for ${person ? person.fullName : 'this player'}?`,
              message: `Sent off for the rest of the match — no substitute; ${nm(sd)} plays a player short${card.tp ? `, and ${nm(opp)} get a technical point` : ''}. Undo can bring it back.`,
              yesLabel: 'Yes, red card', noLabel: 'No, go back', tone: 'danger',
            });
            if (!ok) return;
          }
          fire(cardAction(sd, card.colour, who === 'official' ? 'official' : person ?? 'player', { wasOut, tp: card.tp ? 1 : 0 }));
          setCard(null);
        };
        return (
          <View style={ctrl.raidPanel}>
            <View style={ctrl.subHead}>
              <Text style={ctrl.label}>{card.colour ? CARD_ICON[card.colour] : '🟨'} Card</Text>
              <Button label="Cancel" variant="ghost" onPress={() => setCard(null)} />
            </View>
            <Text style={ctrl.meta}>Team</Text>
            <View style={ctrl.chips}>
              {(['home', 'away'] as const).map((x) => (
                <SelectChip key={x} label={nm(x)} active={sd === x} onPress={() => setCard({ ...card, side: x, who: undefined })} />
              ))}
            </View>
            <Text style={ctrl.meta}>Card</Text>
            <View style={ctrl.chips}>
              {([['green', 'Green — warning'], ['yellow', 'Yellow — 2 min off'], ['red', 'Red — sent off']] as const).map(([c, l]) => (
                <SelectChip key={c} label={`${CARD_ICON[c]} ${l}`} active={card.colour === c} onPress={() => setCard({ ...card, colour: c, tp: card.tpSet ? card.tp : tpDefault(c) })} />
              ))}
            </View>
            {sd && (
              <>
                <Text style={ctrl.meta}>Who?</Text>
                <View style={ctrl.chips}>
                  {players.map((p) => {
                    const un = unavOf(sd, p);
                    return <SelectChip key={p.id} label={un ? `${p.fullName} · suspended` : listHas(outNow[sd], p) ? `${p.fullName} · out` : p.fullName} active={person?.id === p.id} onPress={() => setCard({ ...card, who: person?.id === p.id ? undefined : p })} />;
                  })}
                  {players.length === 0 && <SelectChip label="A player (not named)" active={who === 'player'} onPress={() => setCard({ ...card, who: who === 'player' ? undefined : 'player' })} />}
                  <SelectChip label="Coach / team official" active={who === 'official'} onPress={() => setCard({ ...card, who: who === 'official' ? undefined : 'official' })} />
                </View>
              </>
            )}
            {counts && (counts.green || counts.yellow) ? (
              <Text style={ctrl.meta}>{person!.fullName} has {[counts.green ? `${counts.green} green` : null, counts.yellow ? `${counts.yellow} yellow` : null].filter(Boolean).join(', ')}{hint ? ` — the next card is ${hint} (two of a colour step up)` : ''}.</Text>
            ) : null}
            {card.colour === 'yellow' && who !== 'official' && (
              <Text style={ctrl.meta}>{wasOut ? 'Out now — the 2 minutes start when he is revived; no one else is revived in his place.' : `Off the mat for 2 minutes of playing time — ${sd ? nm(sd) : 'the team'} plays a player short, then he comes back on.`}</Text>
            )}
            {card.colour === 'red' && who !== 'official' && <Text style={ctrl.doOrDie}>Off for the rest of the match — no substitute.</Text>}
            {sd && card.colour && card.colour !== 'green' || card.tp ? (
              <View style={ctrl.chips}>
                <SelectChip label={`Technical point to ${sd ? nm(opp) : 'the opponent'}: ${card.tp ? 'Yes' : 'No'}`} active={card.tp} onPress={() => setCard({ ...card, tp: !card.tp, tpSet: true })} />
              </View>
            ) : null}
            <Button label={ready ? `✓ ${card.colour === 'red' ? 'Red card' : card.colour === 'yellow' ? 'Yellow card' : 'Green card'} — ${whoLabel}` : 'Pick the team, card and who'} disabled={!ready} onPress={() => void record()} />
          </View>
        );
      })()}

      {state.maxSubs > 0 && !state.goldenRaid && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>🔄 Substitutions</Text>
          <View style={ctrl.chips}>
            <Button label={`${homeName} (${subsLeft('home')} left)`} variant="ghost" style={ctrl.flex} disabled={subsLeft('home') <= 0} onPress={() => setSub({ side: 'home' })} />
            <Button label={`${awayName} (${subsLeft('away')} left)`} variant="ghost" style={ctrl.flex} disabled={subsLeft('away') <= 0} onPress={() => setSub({ side: 'away' })} />
          </View>
        </View>
      )}

      {/* ⏪ Backfill a point the scorer missed earlier — stamp it at a past minute. */}
      {!state.goldenRaid && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>⏪ Backfill an earlier moment</Text>
          {backfillMin == null ? (
            <>
              <Text style={ctrl.meta}>Missed a raid or tackle? Enter a past minute — everything you log is stamped there until you go back to live.</Text>
              <View style={ctrl.chips}>
                <View style={ctrl.flex}><TextField label="" value={backfillText} onChange={setBackfillText} placeholder="minute, e.g. 12" autoCapitalize="none" /></View>
                <Button label="Backfill" variant="ghost" disabled={backfillText.trim() === ''} onPress={() => setBackfillMin(Math.max(0, Math.floor(Number(backfillText)) || 0))} />
              </View>
            </>
          ) : (
            <View style={ctrl.addedBox}>
              <Text style={ctrl.label}>⏪ Backfilling at {backfillMin}&apos; ({halfLabel(halfFromMin(backfillMin))})</Text>
              <Text style={ctrl.meta}>Every point you log now is stamped at {backfillMin}&apos;. Log it above, then go back to live.</Text>
              <Button label="Back to live scoring" variant="ghost" onPress={backToLive} />
            </View>
          )}
        </View>
      )}

      {/* 🗓 Correct the timeline — remove or edit one specific past moment. */}
      {!state.goldenRaid && state.events.length > 0 && (
        <View style={{ gap: theme.spacing(2) }}>
          <View style={ctrl.subHead}>
            <Text style={ctrl.label}>🗓 Correct the timeline</Text>
            <Button label={showEdit ? 'Done' : 'Edit'} variant="ghost" onPress={() => setShowEdit((v) => !v)} />
          </View>
          {showEdit && (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={ctrl.meta}>Tap Edit on a raid to re-enter it — raider, touches, bonus, tackle, line-outs — at the same minute (the score & tallies re-adjust), or ✕ to remove it along with its tackle / all-out points (asks first). Technical points and cards: ✕ to remove.</Text>
              {/* one row per moment: a guided raid's tackle / all-out lines go with it */}
              {[...state.events].filter((e) => e.group == null || isRaidHead(e)).sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0) || b.id - a.id).map((e) => (
                <View key={e.id} style={ctrl.editRow}>
                  <Text style={ctrl.editMin}>{e.stamp}</Text>
                  {(() => {
                    // IDs-only scoring: the line's player by id, for this scorer
                    const who = kabaddiEventDetail(state, e, scorerNames);
                    return <Text style={ctrl.editLabel} numberOfLines={1}>{e.icon} {e.label}{who ? ` — ${who}` : ''}</Text>;
                  })()}
                  {(e.kind === 'raid' || e.kind === 'tackle') && <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${e.label}`} onPress={() => editEvent(e)} />}
                  <RowAction label="✕" tone="remove" a11y={`Remove ${e.label}`} onPress={() => void confirmRemove(`${e.label.replace(/ — .*$/, '')} (${e.stamp})`, () => removeEvent(e), removeDetail(e))} />
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {state.goldenRaid ? (
        <Button label="End as a tie" variant="ghost" onPress={async () => { if (await confirmMatchAction('endTie', { drawWord: 'Tie', score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
      ) : state.half === 1 ? (
        <Button label="End 1st Half →" onPress={async () => { if (await confirmMatchAction('endPeriod', { period: '1st half', score: `${state.home}-${state.away}` })) dispatch({ type: 'NEXT_HALF' }); }} />
      ) : state.half === 3 ? (
        <Button label="End Extra Time · 1st half →" onPress={async () => { if (await confirmMatchAction('endPeriod', { period: 'extra-time 1st half', score: `${state.home}-${state.away}` })) dispatch({ type: 'NEXT_HALF' }); }} />
      ) : tied ? (
        // Level after the 2nd half or extra time → the tie-breaker the organizer
        // chose (draw stands / extra time then Golden Raid / Golden Raid direct).
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.meta}>Scores level ({state.home}–{state.away}) at the end of {halfLabel(state.half)}.
            {state.decider === 'none' ? ' This match can end level.' : ''}</Text>
          {state.decider !== 'none' && (
            <Button label="⚡ Golden Raid — sudden death" onPress={() => dispatch({ type: 'START_GOLDEN_RAID' })} />
          )}
          {state.decider === 'extra_time' && state.half === 2 && (
            <Button label={`Extra time (2 × ${state.extraTimeMinutes} min)`} variant="ghost" onPress={() => dispatch({ type: 'START_EXTRA_TIME' })} />
          )}
          {state.decider !== 'none' && (
            <Button label="🎯 5-Raid Shootout" variant="ghost" onPress={() => dispatch({ type: 'START_SHOOTOUT' })} />
          )}
          <Button label="End as a tie" variant="ghost" onPress={async () => { if (await confirmMatchAction('endTie', { drawWord: 'Tie', score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
        </View>
      ) : (
        <Button label="🏁 End Match" variant="danger" onPress={async () => { if (await confirmMatchAction('fullTime', { score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
      )}
    </View>
  );
};

const LiveClock: NonNullable<SportPlugin<KabaddiState>['LiveClock']> = ({ state }) => {
  const s = state as KabaddiState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.startedAt || s.ended || s.pausedAt != null) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.startedAt, s.ended, s.pausedAt]);
  const paused = clockPaused(s);
  const running = !!s.startedAt && !s.ended && !paused;
  const label = s.ended
    ? (s.goldenRaid ? 'FT · GR' : s.half > 2 ? 'FT · ET' : 'FT')
    : s.goldenRaid ? '⚡ GR'
    : !s.startedAt ? (s.half === 1 ? '—' : 'HT')
    : paused ? `${currentMinute(s)}' ⏸`
    : `${currentMinute(s)}'`;
  return (
    <View style={ctrl.clockRow}>
      <View style={[ctrl.liveDot, { backgroundColor: running ? theme.colors.danger : theme.colors.textMuted }]} />
      <Text style={ctrl.clockTime}>{label}</Text>
    </View>
  );
};

/** Match tabs (2026-10-22): the raid-by-raid commentary (grouped by half,
 *  running score, tags) on Commentary; the PKL match centre (categories + half
 *  filter + leaders per half) and the player box at PKL depth on Stats. */
type TabProps = Parameters<NonNullable<SportPlugin<KabaddiState>['LiveExtras']>>[0];
const KabaddiCommentary = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster }: TabProps) => {
  const s = state as KabaddiState;
  // IDs-only scoring: players named by id for this viewer
  const { nameOf } = useMask();
  const feed = useMemo(
    () => kabaddiCommentary(s, { home: homeName, away: awayName, nameOf, homeRoster, awayRoster }),
    [s, homeName, awayName, nameOf, homeRoster, awayRoster],
  );
  return <FeedView groups={feed} homeColor={homeColor} awayColor={awayColor} emptyText="No raids yet." title="Commentary · raid by raid" />;
};
const KabaddiStats = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }: TabProps) => {
  const s = state as KabaddiState;
  // IDs-only scoring: box-score names by player id for this viewer
  const { nameOf } = useMask();
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <KabaddiStatsPanel state={s} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} homeRoster={homeRoster} awayRoster={awayRoster} />
      <Text style={ctrl.label}>Player stats</Text>
      <MatchBoxScore sport="kabaddi" schema={KABADDI_DEEP_BOX} show="box" source={kabaddiDeepBox(s, { homeRoster, awayRoster, nameOf })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/** Broadcast-style board: the TOTAL score + a column of points per half, the live
 *  half highlighted. */
const KabaddiScoreboard: NonNullable<SportPlugin<KabaddiState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as KabaddiState;
  const nH = Math.max(1, s.half);
  const shortHalf = (h: number) => (h <= 2 ? `H${h}` : `ET${h - 2}`);
  const columns = Array.from({ length: nH }, (_, i) => ({ label: shortHalf(i + 1), highlight: !s.ended && i + 1 === s.half }));
  // Points per half from the timeline: raid, tackle and all-out lines each on the
  // side that scored them; shootout raids aren't regulation points.
  const pts = (side: 'home' | 'away', h: number) => halfPoints(s, side, h);
  const w = s.ended ? kabaddiWinner(s) : undefined;
  return (
    <LineScoreboard
      live={live}
      clock={<LiveClock state={s} />}
      leadLabel="TOTAL"
      columns={columns}
      winner={w && w !== 'draw' ? w : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.home), cells: columns.map((_, i) => String(pts('home', i + 1))) }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.away), cells: columns.map((_, i) => String(pts('away', i + 1))) }}
    />
  );
};

export const kabaddiPlugin: SportPlugin<KabaddiState> = {
  ...KABADDI_META,
  matchRecords: kabaddiMatchRecords, // SD-51 (set by the registry before perf F-15)
  Scoreboard: KabaddiScoreboard,
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => {
    if (!s.ended) return null;
    // A shootout decides the winner while the regulation score stays tied.
    if (s.shootout) {
      const hs = sum(s.shootout.home), as = sum(s.shootout.away);
      const winner = hs > as ? 'home' : as > hs ? 'away' : s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw';
      return { winner, home: s.home, away: s.away };
    }
    return { winner: s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw', home: s.home, away: s.away };
  },
  summary: (s) => ({
    homeScore: String(s.home),
    awayScore: String(s.away),
    statusLine: s.ended
      ? (s.goldenRaid ? 'Full Time · Golden Raid' : s.half > 2 ? 'Full Time · Extra Time' : 'Full Time')
      : s.goldenRaid ? '⚡ Golden Raid'
      : s.half <= 2 ? `Half ${s.half}` : halfLabel(s.half),
  }),
  // SD-33 (KB-02): absolute stat lines from the raid replay — heals the
  // pre-SD-03 +1-per-raid lines on completion / the D2 resync. Partial: when a
  // credited player can't be named (an old snapshot) the point keys are left
  // to the live increments.
  statTotals: kabaddiTotals,
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  ScoringControls,
  LiveClock,
  // its match centre has its own Game flow category (no shared card under it)
  matchTabs: { Commentary: KabaddiCommentary, Stats: KabaddiStats, ownGameFlow: true },
  // deep wave — "Stats to track": raid skill, defenders touched (both off by default)
  liveSettings: KABADDI_LIVE_SETTINGS,
  formation: () => courtFormation('kabaddi'),
  Court: makeCourt('kabaddi'),
  voice: { hints: ['raid {name}', 'tackle {name}', 'raid away'], parse: kabaddiVoice },
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  subPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  raidPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(4) },
  matRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  matChip: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  pausedBanner: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent, borderRadius: theme.radius.md, padding: theme.spacing(2) },
  doOrDie: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  subHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  clockTime: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1 },
  grBanner: { backgroundColor: theme.colors.primary + '1A', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(3), gap: theme.spacing(1) },
  grTitle: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900', letterSpacing: 0.5 },
  grMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  editBanner: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.accent + '22', padding: theme.spacing(2), borderRadius: theme.radius.sm },
  addedBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  editMin: { color: theme.colors.accent, fontWeight: '800', width: 40, fontSize: theme.font.small },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});
