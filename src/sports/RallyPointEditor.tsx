/**
 * "🗓 Correct the timeline" for rally / running-point sports (volleyball, tennis,
 * badminton). Lists every scored point newest-first and lets the scorer:
 *   • ✕ Remove a point that shouldn't have counted,
 *   • ✎ Edit who won it / which player / point-vs-ace,
 *   • ＋ Insert a point the scorer missed, at the right spot in the sequence.
 * Any change rebuilds the corrected point list and dispatches one `EDIT_LOG`
 * (the reducer replays it — score, sets and box score all re-derive) plus
 * `STAT_ADJUST` deltas so player-profile tallies add up. See `rallyEdit.ts`.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, SelectChip } from '../components/ui';
import type { Player } from '../core/types';
import type { LiveEvent } from './liveEvents';
import type { ScoreAction } from './types';
import { pointRows, correctionActions, defaultCredits, type EditRow, type PointCredits, type PointInput, type PointKind } from './rallyEdit';
import {
  DETAIL_HOWS, RACKET_SHOTS, SHOTS, SHOT_LABEL, STROKES, WINGS, WING_LABEL, errTypeOf, howDef, pdText, shotOf, strokeOf,
  type DetailSport, type How, type PointDetail, type Shot, type Wing,
} from './pointDetail';
import { RowAction, confirmRemove } from './TimelineControls';
import { useMask } from '../core/disputeMask';
import { eventWho, whoName, withRosters } from './racketNames';
import { errOf } from './racketActions';
import { IconText } from '../components/Icon';

/** One choosable point type in the editor. `credited: false` = nobody on the
 *  scoring side gets credit (an opponent's error) → no player picker. */
export interface EditorKind { kind: PointKind | 'df'; label: string; credited: boolean }

/** Timeline-row icon per kind (a sport's normal point uses its own `pointIcon`). */
const ROW_ICON: Partial<Record<PointKind, string>> = { ace: '🎯', block: '🧱', attack: '⚡', opperror: '🎁', serveerror: '🎁', rally: '🔁' };

interface Draft {
  mode: 'edit' | 'insert';
  index: number; // edit → the row; insert → splice AFTER this index (-1 = at start)
  /** who won it — SD-114: an insert starts with NO side, so a missed point is
   *  never silently given to Home */
  side?: 'home' | 'away';
  /** 'df' (SD-104, tennis) = the opponent's double fault; the player is the faulting server */
  kind: PointKind | 'df';
  playerId?: string;
  /** IDs-only scoring: an older point's stored name, kept only while no
   *  player is picked and its name can't be resolved to a roster id (the
   *  credit would be lost otherwise). Never set for a new pick. */
  legacyName?: string;
  /** SD-107 — how the point was won (optional) */
  pd?: PointDetail;
}

export function RallyPointEditor({
  events,
  homeName,
  awayName,
  homeColor = theme.colors.home,
  awayColor = theme.colors.away,
  homeRoster = [],
  awayRoster = [],
  dispatch,
  hasAce,
  pointIcon,
  periodLabel,
  kinds,
  defaultKind = 'point',
  creditsOf = defaultCredits,
  rowsOf = pointRows,
  normalize,
  doubleFault = false,
  detailSport,
}: {
  events: LiveEvent[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  dispatch: (a: ScoreAction) => void;
  /** does this sport distinguish aces? (volleyball/tennis yes, badminton no) */
  hasAce: boolean;
  /** icon for a normal point (🏐 / 🎾 / 🏸) — an ace always shows 🎯 */
  pointIcon: string;
  /** label for the period a point sits in, from its event (Set 2 / Game 1) */
  periodLabel: (e: LiveEvent) => string;
  /** the point types to choose from (volleyball: Attack/Block/Ace/Opp. error…).
   *  Default: Point + Ace when `hasAce`. */
  kinds?: EditorKind[];
  /** the type an inserted point starts as */
  defaultKind?: PointKind;
  /** the profile stats each kind credits — kept in step with how the sport
   *  dispatches, so a correction reconciles careers exactly (see rallyEdit). */
  creditsOf?: PointCredits;
  /** SD-21 — the editable rows of the log (default: every scored point). The
   *  rally engine also lists side-out rallies, inferring them on older logs. */
  rowsOf?: (events: LiveEvent[]) => EditRow[];
  /** SD-21 — what a corrected list actually replays to (side-out: a rally the
   *  server now loses becomes a hand-out and credits nobody). Dispatched as the
   *  EDIT_LOG and used for the STAT_ADJUST diff, so credits match the replay. */
  normalize?: (points: PointInput[]) => PointInput[];
  /** SD-104 (tennis) — offer "Double fault" as a point type: the point goes to
   *  the receiver and the faulting server's doubleFaults follow the correction. */
  doubleFault?: boolean;
  /** SD-107 — offer the sport's optional "How?" point detail on each point */
  detailSport?: DetailSport;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  // IDs-only scoring: the log keeps ids; names for the scorer by id
  const mask = useMask();

  const choices: EditorKind[] = [
    ...(kinds ?? (hasAce
      ? [{ kind: 'point', label: `${pointIcon} Point`, credited: true }, { kind: 'ace', label: '🎯 Ace', credited: true }] as EditorKind[]
      : [])),
    ...(doubleFault ? [{ kind: 'df', label: '⚠️ Double fault', credited: true } as EditorKind] : []),
  ];
  const isCredited = (k: PointKind | 'df') => choices.find((c) => c.kind === k)?.credited ?? true;
  const rows = rowsOf(events);
  const list = rows.map((r) => r.p); // forward order; index i ↔ rows[i]
  // an older name-only point → the roster player of that name (legacy only)
  const rosterId = (nm?: string) => (nm ? [...homeRoster, ...awayRoster].find((p) => p.fullName === nm)?.id : undefined);
  const viewer = withRosters(mask.nameOf, homeRoster, awayRoster);
  const rosterFor = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);

  // Commit a rewritten point list: replay it (EDIT_LOG) and reconcile profiles.
  const commit = (edited: PointInput[]) => {
    for (const a of correctionActions(list, edited, rosterId, creditsOf, normalize)) dispatch(a);
    setDraft(null);
  };

  const remove = (index: number) => commit(list.filter((_, i) => i !== index));

  const saveDraft = () => {
    if (!draft || !draft.side) return;
    const side = draft.side;
    // An uncredited kind (an opponent's error) never carries a player.
    const credited = isCredited(draft.kind);
    const item: PointInput = draft.kind === 'df' ? {
      // the receiver wins the point; the named player is the faulting server
      // IDs-only scoring: the player by id (an unresolved older name stays as it was)
      side, kind: 'point', df: draft.playerId ? { playerId: draft.playerId } : draft.legacyName ? { playerName: draft.legacyName } : {},
    } : {
      // no type choice → a plain "won the rally" point (the engine re-derives side-outs)
      side, kind: choices.length && draft.kind !== 'rally' ? draft.kind : 'point',
      ...(credited && draft.playerId ? { playerId: draft.playerId } : credited && draft.legacyName ? { playerName: draft.legacyName } : {}),
      ...(draft.pd ? { pd: draft.pd } : {}),
    };
    // SD-107 — an edited point keeps its 1st / 2nd serve (it was served the same way);
    // SD-157 — and who came to the net, the rally length and the serve speed
    const was = draft.mode === 'edit' ? list[draft.index] : undefined;
    if (was?.serve) item.serve = was.serve;
    if (was && draft.kind !== 'df') {
      if (was.atNet) item.atNet = was.atNet;
      if (was.rallyLen) item.rallyLen = was.rallyLen;
      if (typeof was.kmh === 'number') item.kmh = was.kmh;
      // round 2 — and pickleball's 3rd shot (it was lost on an edited rally)
      if (was.third) item.third = was.third;
    }
    if (draft.mode === 'edit') {
      commit(list.map((p, i) => (i === draft.index ? item : p)));
    } else {
      const next = [...list];
      next.splice(draft.index + 1, 0, item);
      commit(next);
    }
  };

  const beginEdit = (index: number) => {
    const p = list[index];
    const pick = (w: { playerId?: string; playerName?: string }) => {
      const id = w.playerId ?? rosterId(w.playerName);
      return id ? { playerId: id } : w.playerName ? { legacyName: w.playerName } : {};
    };
    if (p.df) setDraft({ mode: 'edit', index, side: p.side, kind: 'df', ...pick(p.df) });
    else setDraft({ mode: 'edit', index, side: p.side, kind: p.kind, ...pick(p), ...(p.pd ? { pd: p.pd } : {}) });
  };
  const beginInsert = (afterIndex: number) =>
    setDraft({ mode: 'insert', index: afterIndex, side: undefined, kind: defaultKind });

  if (rows.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <IconText label={"🗓 Correct the timeline"} style={st.label} />
        <Button label={open ? 'Done' : 'Edit'} variant="ghost" onPress={() => { setOpen((v) => !v); setDraft(null); }} />
      </View>

      {open && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.meta}>Remove a point that shouldn&apos;t have counted, Edit who won it, or Insert one you missed — the score, sets and player stats all re-adjust.</Text>

          {draft ? (
            <View style={st.draftBox}>
              <IconText label={draft.mode === 'edit' ? '✎ Edit this point' : '＋ Insert a missed point'} style={st.label} />
              <Text style={st.meta}>Who won the rally?</Text>
              {normalize && <Text style={st.meta}>Serve and side-outs are worked out again from the rallies.</Text>}
              <View style={st.chips}>
                <SelectChip label={homeName} active={draft.side === 'home'} onPress={() => setDraft({ ...draft, side: 'home', playerId: undefined, legacyName: undefined, pd: undefined })} />
                <SelectChip label={awayName} active={draft.side === 'away'} onPress={() => setDraft({ ...draft, side: 'away', playerId: undefined, legacyName: undefined, pd: undefined })} />
              </View>
              {choices.length > 0 && (
                <>
                  <Text style={st.meta}>Point type</Text>
                  <View style={st.chips}>
                    {/* a legacy "Point" (outcome not recorded) stays choosable on the point that has it */}
                    {draft.kind === 'point' && !choices.some((c) => c.kind === 'point') && (
                      <SelectChip label={`${pointIcon} Point`} active onPress={() => undefined} />
                    )}
                    {choices.map((c) => (
                      <SelectChip key={c.kind} label={c.label} active={draft.kind === c.kind} onPress={() => setDraft({ ...draft, kind: c.kind, ...((c.kind === 'df') !== (draft.kind === 'df') ? { playerId: undefined, legacyName: undefined } : {}) })} />
                    ))}
                  </View>
                </>
              )}
              {!draft.side ? (
                <Text style={st.meta}>Pick who won the rally first.</Text>
              ) : isCredited(draft.kind) ? (
                <>
                  <Text style={st.meta}>{draft.kind === 'df' ? 'Who double-faulted? (the server, optional)' : 'Which player? (optional)'}</Text>
                  <View style={st.chips}>
                    {rosterFor(draft.kind === 'df' ? (draft.side === 'home' ? 'away' : 'home') : draft.side).map((p) => (
                      <SelectChip key={p.id} label={p.fullName} active={draft.playerId === p.id}
                        onPress={() => setDraft({ ...draft, playerId: draft.playerId === p.id ? undefined : p.id, legacyName: undefined })} />
                    ))}
                    <SelectChip label="Team (no player)" active={!draft.playerId && !draft.legacyName} onPress={() => setDraft({ ...draft, playerId: undefined, legacyName: undefined })} />
                  </View>
                </>
              ) : (
                <Text style={st.meta}>An opponent&apos;s error — no player is credited.</Text>
              )}
              {detailSport && draft.side && draft.kind !== 'df' && (() => {
                // SD-107 — optional point detail (no serve filter here: the scorer knows)
                const pd = draft.pd;
                const sel = pd ? howDef(detailSport, pd.how) : undefined;
                const loser = rosterFor(draft.side === 'home' ? 'away' : 'home');
                const setPd = (next?: PointDetail) => setDraft({ ...draft, pd: next });
                const pick = (how: How) => {
                  if (pd?.how === how) return setPd(undefined);
                  const d = howDef(detailSport, how);
                  // IDs-only scoring: the erring player by id
                  setPd({ how, ...(d?.credit === 'loser' && loser.length === 1 ? { err: errOf(loser[0]) } : {}) });
                };
                return (
                  <>
                    <Text style={st.meta}>How was it won? (optional)</Text>
                    <View style={st.chips}>
                      {DETAIL_HOWS[detailSport].map((h) => <SelectChip key={h.how} label={h.chip} active={pd?.how === h.how} onPress={() => pick(h.how)} />)}
                    </View>
                    {sel?.strokes && pd && (
                      <View style={st.chips}>
                        {/* racket-batch5 RB9: the types offered, plus this point's older type */}
                        {(sel.offer ?? sel.strokes).concat(pd.stroke && sel.offer && !sel.offer.includes(pd.stroke) && sel.strokes.includes(pd.stroke) ? [pd.stroke] : []).map((k) => (
                          <SelectChip key={k} label={STROKES[k]?.chip ?? k} active={pd.stroke === k}
                            onPress={() => setPd({ ...pd, stroke: pd.stroke === k ? undefined : k })} />
                        ))}
                      </View>
                    )}
                    {/* SD-157 — tennis: forehand / backhand + shot (an older stroke id is normalised) */}
                    {sel?.wingShot && pd && detailSport === 'tennis' && (() => {
                      const cur = strokeOf(pd);
                      const set = (wing?: Wing, shot?: Shot) => {
                        const { stroke: _legacy, wing: _w, shot: _s, ...rest } = pd;
                        setPd({ ...rest, ...(wing ? { wing } : {}), ...(shot ? { shot } : {}) });
                      };
                      return (
                        <>
                          <View style={st.chips}>
                            {WINGS.map((w) => (
                              <SelectChip key={w} label={WING_LABEL[w]} active={cur.wing === w} onPress={() => set(cur.wing === w ? undefined : w, cur.shot)} />
                            ))}
                          </View>
                          <View style={st.chips}>
                            {SHOTS.map((k) => (
                              <SelectChip key={k} label={SHOT_LABEL[k].chip} active={cur.shot === k} onPress={() => set(cur.wing, cur.shot === k ? undefined : k)} />
                            ))}
                          </View>
                        </>
                      );
                    })()}
                    {/* deep wave — the other racket sports: forehand / backhand + the
                        sport's shot (an older winner id is normalised; an error's type is kept) */}
                    {sel?.wingShot && pd && detailSport !== 'tennis' && (() => {
                      const cur = shotOf(detailSport, pd);
                      const et = errTypeOf(detailSport, pd);
                      const set = (wing?: Wing, shot?: string) => {
                        const { stroke: _legacy, wing: _w, shot: _s, ...rest } = pd;
                        setPd({ ...rest, ...(et ? { stroke: et } : {}), ...(wing ? { wing } : {}), ...(shot ? { shot } : {}) } as PointDetail);
                      };
                      return (
                        <>
                          <View style={st.chips}>
                            {WINGS.map((w) => (
                              <SelectChip key={w} label={WING_LABEL[w]} active={cur.wing === w} onPress={() => set(cur.wing === w ? undefined : w, cur.shot)} />
                            ))}
                          </View>
                          <View style={st.chips}>
                            {RACKET_SHOTS[detailSport].map((k) => (
                              <SelectChip key={k.id} label={k.chip} active={cur.shot === k.id} onPress={() => set(cur.wing, cur.shot === k.id ? undefined : k.id)} />
                            ))}
                          </View>
                        </>
                      );
                    })()}
                    {sel?.credit === 'loser' && pd && loser.length >= 2 && (
                      <View style={st.chips}>
                        {loser.map((p) => (
                          <SelectChip key={p.id} label={`By ${p.fullName}`} active={pd.err?.playerId === p.id}
                            onPress={() => setPd({ ...pd, err: pd.err?.playerId === p.id ? undefined : errOf(p) })} />
                        ))}
                      </View>
                    )}
                  </>
                );
              })()}
              <View style={st.row}>
                <Button label="Save" variant={draft.side ?? 'ghost'} style={{ flex: 1 }} disabled={!draft.side} onPress={saveDraft} />
                <Button label="Cancel" variant="ghost" onPress={() => setDraft(null)} />
              </View>
            </View>
          ) : (
            <Text style={st.insertTop} accessibilityRole="button" onPress={() => beginInsert(-1)}>＋ Insert a point at the very start</Text>
          )}

          {rows
            .map((r, i) => ({ e: r.e, p: r.p, i }))
            .reverse()
            .map(({ e, p, i }) => {
              const side = p.side; // who won the rally (a legacy 2nd-server event's own `side` is the loser)
              const rally = p.kind === 'rally';
              // IDs-only scoring: names by id for the scorer (an older log's stored name as the fallback)
              const who = rally ? undefined : eventWho(e, viewer);
              const dfBy = p.df ? whoName(viewer, p.df.playerId, p.df.playerName) : undefined;
              return (
                <View key={e.id} style={st.editRow}>
                  <View style={[st.dot, { backgroundColor: side === 'home' ? homeColor : awayColor }]} />
                  <Text style={st.period}>{periodLabel(e)}</Text>
                  <Text style={st.rowLabel} numberOfLines={1}>
                    {p.df
                      ? `⚠️ Double fault${dfBy ? ` by ${dfBy}` : ''} → point ${side === 'home' ? homeName : awayName}`
                      : `${ROW_ICON[p.kind] ?? pointIcon} ${side === 'home' ? homeName : awayName}${rally ? ` won rally · ${e.label}` : who ? ` · ${who}` : e.kind === 'opperror' || e.kind === 'serveerror' ? ` · ${e.label}` : ''}${p.pd ? ` · ${pdText(p.pd, false, detailSport)}` : ''}`}
                  </Text>
                  {!draft && (
                    // SD-114: ≥44pt targets, spaced; ✕ asks first
                    <View style={st.actions}>
                      <RowAction label="＋" tone="insert" a11y="Insert a missed point after this one" onPress={() => beginInsert(i)} />
                      <RowAction label="✎" tone="edit" a11y="Edit this point" onPress={() => beginEdit(i)} />
                      <RowAction label="✕" tone="remove" a11y="Remove this point"
                        onPress={() => void confirmRemove(`this point (${periodLabel(e)} · ${side === 'home' ? homeName : awayName})`, () => remove(i), 'The score, sets and player stats re-adjust from the corrected points.')} />
                    </View>
                  )}
                </View>
              );
            })}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), marginTop: theme.spacing(1) },
  draftBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  insertTop: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingVertical: theme.spacing(3), minHeight: 44 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  period: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', width: 46 },
  rowLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  actions: { flexDirection: 'row', gap: theme.spacing(2) },
});
