/**
 * Deep wave (timed races: athletics, swimming, rowing, canoe sprint, cycling)
 * — the federation-depth views around a results sheet and the optional
 * capture fields the meet's "Stats to track" switch on:
 *
 *  - EventDepthPanel: under an event's results sheet — the race analysis of
 *    the phase on screen (split / lap times with places at each split, the
 *    winner's race, the fastest finish, relay legs and swimming take-overs,
 *    reaction times, gaps to the winner), each athlete's path through the
 *    rounds, and the live commentary for the whole event (newest first).
 *  - MeetCommentaryCard: the hub's "Latest results" across the meet.
 *  - TakeoverField: a swimming relay's take-over readings (legs 2–4).
 *  - AthDqChips: World Athletics DQ reasons under the DQ status.
 *
 * Everything shown is derived from the stored results (data/results/raceDepth.ts,
 * raceCommentary.ts): what wasn't recorded isn't shown, never as a 0.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Card, SelectChip, textStyles } from '../ui';
import { getPhaseEntries } from '../../data/resultsStore';
import {
  athDqCodesFor, eventCommentary, formatMark, groupMeet, hasAnalysis, heatAnalysis, isTimedRaceSport, meetCommentary, parseTakeover,
  pathText, phaseOf, progressionPaths, raceGapText, takeoverEarly, takeoverText, toResultEntry,
  type CommentaryItem, type DisciplineDef, type EntryResult, type HeatAnalysis, type MeetEvent, type MeetPhase, type PhaseFormat, type RankedEntry, type ResultEntry, type ResultFlag,
} from '../../data/results';
import type { FieldEntry, FieldEvent } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/* ------------------------------ the event ------------------------------- */

/**
 * Under an event's results sheet: race analysis of this phase, the paths
 * through the rounds and the event's commentary. Loads the event's other
 * rounds itself (this phase's live entries come from the screen).
 */
export function EventDepthPanel({ phase, f, def, phases, entries, ranked, nameOf, heatLabel, yards }: {
  phase: FieldEvent;
  f: PhaseFormat;
  def: DisciplineDef;
  /** every round of the event (field_events rows) */
  phases: FieldEvent[];
  /** this phase's entries as on screen (unsaved edits included) */
  entries: ResultEntry[];
  /** this phase's ranking per heat, with Q / q and PB / SB / MR flags */
  ranked: Map<number, RankedEntry[]>;
  nameOf: (id: string) => string;
  heatLabel: (heat: number) => string;
  /** a 25-yard pool */
  yards?: boolean;
}) {
  const sport = def.sport;
  const others = useMemo(() => phases.filter((p) => p.id !== phase.id), [phases, phase.id]);
  const otherKey = others.map((p) => `${p.id}:${p.status}`).join(',');
  const [loaded, setLoaded] = useState<FieldEntry[]>([]);
  useEffect(() => {
    let on = true;
    if (!isTimedRaceSport(sport) || !others.length) { setLoaded([]); return; }
    void getPhaseEntries(others.map((p) => p.id)).then((x) => on && setLoaded(x)).catch(() => {});
    return () => { on = false; };
  }, [otherKey, sport]); // eslint-disable-line react-hooks/exhaustive-deps

  const event = useMemo((): MeetEvent | null => {
    const mp: MeetPhase[] = [];
    for (const p of phases) {
      const pf = p.id === phase.id ? f : phaseOf(p);
      if (!pf) continue;
      const list = p.id === phase.id ? entries : loaded.filter((e) => e.eventId === p.id).map((e) => toResultEntry(e, nameOf));
      mp.push({ id: p.id, format: pf, status: (p.id === phase.id ? phase.status : p.status) as MeetPhase['status'], date: p.startsAt, entries: list });
    }
    if (!mp.some((x) => x.id === phase.id)) mp.push({ id: phase.id, format: f, status: phase.status as MeetPhase['status'], date: phase.startsAt, entries });
    return groupMeet(mp).find((e) => e.eventKey === f.eventKey) ?? null;
  }, [phases, phase, f, entries, loaded, nameOf]);

  const flags = useMemo(() => {
    const m = new Map<string, ResultFlag[]>();
    for (const rows of ranked.values()) for (const r of rows) if (r.flags.length) m.set(r.id, r.flags);
    return new Map([[phase.id, m]]);
  }, [ranked, phase.id]);

  const analyses = useMemo(() => [...ranked].map(([h, rows]) => heatAnalysis(def, h, rows, yards)).filter(hasAnalysis), [ranked, def, yards]);
  const paths = useMemo(() => (event ? progressionPaths(event.phases, flags) : []), [event, flags]);
  const items = useMemo(() => (event ? eventCommentary(event, { flags }) : []), [event, flags]);

  if (!isTimedRaceSport(sport)) return null;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {analyses.map((a) => <RaceAnalysisCard key={a.heat} def={def} a={a} title={ranked.size > 1 ? heatLabel(a.heat) : undefined} rows={ranked.get(a.heat) ?? []} />)}
      {paths.length > 0 && <PathsCard paths={paths} />}
      {items.length > 0 && <CommentaryCard title="📣 Commentary" items={items} />}
    </View>
  );
}

/** Splits with places, the winner's race, relay legs / take-overs, reaction times and gaps for one heat. */
function RaceAnalysisCard({ def, a, title, rows }: { def: DisciplineDef; a: HeatAnalysis; title?: string; rows: RankedEntry[] }) {
  const fmt = (v?: number) => (v == null ? '–' : formatMark(v, def));
  const segFmt = (v?: number) => (v == null ? '' : formatMark(v, { unit: 'time', dp: def.dp }));
  const placeOf = (id: string) => rows.find((r) => r.id === id);
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>📈 Race analysis{title ? ` — ${title}` : ''}</Text>
      {a.story ? <Text style={textStyles.body}>Winner {a.story}.</Text> : null}
      {a.splits.length > 0 && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.label}>{def.sport === 'swimming' ? 'Splits (lap) · place at each split' : def.sport === 'athletics' ? 'Lap times (lap) · place at each split' : 'Intermediate times (section) · place'}</Text>
          {[...a.splits].sort((x, y) => (placeOf(x.id)?.position ?? 999) - (placeOf(y.id)?.position ?? 999)).map((s) => (
            <View key={s.id} style={st.splitRow}>
              <Text style={st.name} numberOfLines={1}>{placeOf(s.id)?.label ? `${placeOf(s.id)!.label}. ` : ''}{s.name}</Text>
              <Text style={st.detail}>
                {s.points.map((p, i) => `${p.label} ${fmt(p.time)}${p.seg != null && i > 0 ? ` (${segFmt(p.seg)})` : ''}${s.places[i] != null ? ` [${s.places[i]}]` : ''}`).join(' · ')}
              </Text>
            </View>
          ))}
          {a.fastestFinish ? <Text style={textStyles.muted}>Fastest last {a.fastestFinish.label}: {a.fastestFinish.name} {segFmt(a.fastestFinish.seg)}</Text> : null}
        </View>
      )}
      {a.legs.length > 0 && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.label}>{def.key.startsWith('cyc.') ? 'Each rider’s lap' : 'Legs'}{def.sport === 'swimming' ? ' · take-over' : ''}</Text>
          {a.legs.map((t) => (
            <View key={t.id} style={st.splitRow}>
              <Text style={st.name} numberOfLines={1}>{t.name}</Text>
              <Text style={st.detail}>
                {t.legs.map((l) => `${l.leg}. ${l.name?.split(' ')[0] ?? `Leg ${l.leg}`} ${l.time != null ? segFmt(l.time) : '–'}${l.takeover != null ? ` (${takeoverText(l.takeover)}${l.early ? ' ⚠' : ''})` : ''}`).join(' · ')}
              </Text>
              {t.legs.some((l) => l.early) ? <Text style={st.warn}>⚠ A take-over earlier than −0.03 s on the pads — the take-off judge confirms any disqualification (SW 10.13).</Text> : null}
            </View>
          ))}
          {a.fastestLeg ? <Text style={textStyles.muted}>Fastest {a.legs.length > 0 && a.legs[0].legs.length > 1 ? 'flying ' : ''}leg: {a.fastestLeg.name} ({a.fastestLeg.team}, leg {a.fastestLeg.leg}) {segFmt(a.fastestLeg.time)}</Text> : null}
        </View>
      )}
      {a.reaction ? (
        <Text style={textStyles.muted}>⚡ Reaction: fastest {a.reaction.fastest.name} {a.reaction.fastest.rt.toFixed(3)} s · average {a.reaction.mean.toFixed(3)} s ({a.reaction.n}){a.reaction.under100.length ? ` · under 0.100 s: ${a.reaction.under100.join(', ')} (TR 16.6)` : ''}</Text>
      ) : null}
      {a.gaps.size > 0 && (
        <Text style={textStyles.muted}>Behind the winner: {rows.filter((r) => a.gaps.has(r.id)).slice(0, 7).map((r) => `${r.label} ${r.entry.name.split(' ')[0]} ${raceGapText(a.gaps.get(r.id)!, def)}`).join(' · ')}</Text>
      )}
    </Card>
  );
}

/** "Priya Sharma — H1 12.48 (1) Q → F 12.31 (1)". */
function PathsCard({ paths }: { paths: ReturnType<typeof progressionPaths> }) {
  const [all, setAll] = useState(false);
  const shown = all ? paths : paths.slice(0, 10);
  return (
    <Card style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.h3}>Through the rounds</Text>
      {shown.map((p) => (
        <View key={p.key} style={st.splitRow}>
          <Text style={st.name} numberOfLines={1}>{p.name}{p.team && p.team !== p.name ? <Text style={st.detail}>  {p.team}</Text> : null}</Text>
          <Text style={st.detail}>{pathText(p)}</Text>
        </View>
      ))}
      {paths.length > shown.length || all ? <SelectChip label={all ? 'Show fewer' : `Show all ${paths.length}`} active={false} onPress={() => setAll(!all)} /> : null}
    </Card>
  );
}

/** A commentary feed, newest first. */
function CommentaryCard({ title, items, onOpen, first = 8 }: { title: string; items: CommentaryItem[]; onOpen?: (it: CommentaryItem) => void; first?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, first);
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>{title}</Text>
      {shown.map((it) => (
        <TouchableOpacity key={it.id} disabled={!onOpen} accessibilityRole={onOpen ? 'button' : undefined} onPress={() => onOpen?.(it)} style={st.item}>
          <Text style={st.icon}>{it.icon}</Text>
          <Text style={[st.itemTxt, it.kind === 'record' && st.recordTxt]}>{it.text}</Text>
        </TouchableOpacity>
      ))}
      {items.length > first ? <SelectChip label={all ? 'Show fewer' : `Show all ${items.length}`} active={false} onPress={() => setAll(!all)} /> : null}
    </Card>
  );
}

/* ------------------------------- the meet -------------------------------- */

/** The hub's "Latest results": the meet's commentary, newest first (timed-race sports). */
export function MeetCommentaryCard({ events, sport }: { events: MeetEvent[]; sport: string }) {
  const nav = useNavigation<Nav>();
  const items = useMemo(() => (isTimedRaceSport(sport) ? meetCommentary(events, { limit: 60 }) : []), [events, sport]);
  if (!items.length) return null;
  return <CommentaryCard title="📣 Latest results" items={items} first={6} onOpen={(it) => nav.navigate('ResultsEvent', { phaseId: it.phaseId, tab: 'sheet' })} />;
}

/* ---------------------------- capture fields ----------------------------- */

/** A swimming relay's take-over readings, legs 2–4 ("0.21", "-0.05", or "21"). */
export function TakeoverField({ r, onSave }: { r: EntryResult; onSave: (takeovers: (number | null)[] | undefined) => void }) {
  const init = [0, 1, 2].map((i) => (r.takeovers?.[i] != null ? (r.takeovers[i] as number).toFixed(2) : ''));
  const [t, setT] = useState(init);
  const vals = t.map(parseTakeover);
  const bad = vals.some((v) => v != null && Number.isNaN(v));
  const commit = () => {
    if (bad) return;
    const list: (number | null)[] = vals.map((v) => (v == null ? null : v));
    while (list.length && list[list.length - 1] == null) list.pop();
    const next = list.length ? list : undefined;
    if (JSON.stringify(next ?? null) !== JSON.stringify(r.takeovers?.length ? r.takeovers : null)) onSave(next);
  };
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <View style={st.wrap}>
        <Text style={st.label}>Take-overs</Text>
        {[2, 3, 4].map((leg, i) => (
          <View key={leg} style={{ gap: 2 }}>
            <Text style={st.small}>Leg {leg}</Text>
            <TextInput style={[st.input, takeoverEarly(vals[i]) && st.inputWarn]} value={t[i]} placeholder="0.21" placeholderTextColor={theme.colors.textMuted}
              keyboardType="numbers-and-punctuation" accessibilityLabel={`Take-over time, leg ${leg}`}
              onChangeText={(x) => setT((cur) => cur.map((y, j) => (j === i ? x : y)))} onBlur={commit} onSubmitEditing={commit} />
          </View>
        ))}
      </View>
      {bad ? <Text style={st.warn}>Can’t read a take-over — type seconds like 0.21 or −0.05.</Text> : null}
      {vals.some((v) => takeoverEarly(v)) ? <Text style={st.warn}>⚠ Earlier than −0.03 s on the pads — ask the take-off judge; disqualify with DQ → SW 10.13 if confirmed.</Text> : null}
    </View>
  );
}

/** World Athletics DQ reasons for a track race (sets the rule reference and the reason). */
export function AthDqChips({ def, r, onChange }: { def: DisciplineDef; r: EntryResult; onChange: (n: EntryResult) => void }) {
  if (def.sport !== 'athletics' || def.capture !== 'single') return null;
  const codes = athDqCodesFor(def);
  return (
    <View style={st.wrap}>
      {codes.map((c) => (
        <SelectChip key={c.ref} label={`${c.ref} · ${c.label}`} active={r.ruleRef === c.ref}
          onPress={() => onChange({ ...r, ruleRef: r.ruleRef === c.ref ? undefined : c.ref, reason: r.ruleRef === c.ref ? undefined : c.label })} />
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  label: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  small: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  splitRow: { gap: 2, paddingVertical: theme.spacing(1), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  name: { color: theme.colors.text, fontWeight: '700', fontSize: theme.font.body },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.small, fontVariant: ['tabular-nums'] },
  warn: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  item: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-start' },
  icon: { fontSize: theme.font.body, width: 22 },
  itemTxt: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  recordTxt: { color: theme.colors.accent, fontWeight: '800' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: theme.spacing(2) },
  input: { width: 72, minHeight: 44, borderWidth: 1, borderColor: theme.colors.inputBorder, borderRadius: theme.radius.sm, color: theme.colors.text, paddingHorizontal: theme.spacing(2), fontVariant: ['tabular-nums'] },
  inputWarn: { borderColor: theme.colors.accent },
});
