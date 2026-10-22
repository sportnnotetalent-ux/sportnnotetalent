/** Deep wave — the results commentary and the event stats for weightlifting,
 *  shooting and archery on the results screen (ResultsEventScreen):
 *   - "live" (Enter results): the newest few commentary lines under the live
 *     ranking, so the official sees what was just recorded;
 *   - "full" (Results sheet): the stats card at federation depth (make rates,
 *     referees' decisions, series / end breakdown, final progression, match
 *     play sets and averages) and the whole commentary, newest first.
 *  Everything is derived from the stored results (pure functions in
 *  data/results/*Insights.ts) — a correction rewrites it; nothing is stored. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Card, textStyles } from '../ui';
import {
  activeLift, liftFeed, liftSessionStats, liftStatsLine, winnerLine, lightsScore, LIFTS, LIFT_SHORT, taken,
  shootEvent, shotsOf, shootFeed, shootStats, scoreText, seriesTag, POSITION_LABEL,
  archRound, archFeed, archStats, ordinalOf,
  type DisciplineDef, type PhaseFormat, type ResultEntry, type FeedItem, type FeedTone,
  type ShootSeriesStats, type ShootFinalStats, type ArchRoundStats, type ArchBracketStats, type ShootEventDef,
} from '../../data/results';

type Mode = 'live' | 'full';

export function PrecisionInsights({ def, f, entries, mode }: { def: DisciplineDef; f: PhaseFormat; entries: ResultEntry[]; mode: Mode }) {
  const shoot = def.sport === 'shooting' ? shootEvent(def) : undefined;
  const arch = def.sport === 'archery' ? archRound(def) : undefined;
  const lifts = def.capture === 'lifts';
  const shots = shoot ? shotsOf(shoot, f.category) : 0;
  const feed = useMemo<FeedItem[]>(() => {
    if (lifts) return liftFeed(entries);
    if (shoot) return shootFeed(entries, def, shots);
    if (arch) return archFeed(entries, def);
    return [];
  }, [lifts, shoot, arch, entries, def, shots]);
  if (!lifts && !shoot && !arch) return null;
  return (
    <>
      {mode === 'full' && lifts ? <LiftStatsCard entries={entries} /> : null}
      {mode === 'full' && shoot ? <ShootStatsCard entries={entries} def={def} ev={shoot} shots={shots} /> : null}
      {mode === 'full' && arch ? <ArchStatsCard entries={entries} def={def} /> : null}
      <FeedCard items={feed} initial={mode === 'live' ? 3 : 12} />
    </>
  );
}

/* --------------------------------- the feed -------------------------------- */

const TONE: Record<FeedTone, string> = {
  good: theme.colors.primary, bad: theme.colors.danger, lead: theme.colors.accent, medal: theme.colors.accent, info: theme.colors.border,
};

export function FeedCard({ items, initial }: { items: FeedItem[]; initial: number }) {
  const [shown, setShown] = useState(initial);
  if (!items.length) return null;
  const more = Math.min(15, items.length - shown);
  return (
    <Card style={st.card}>
      <View style={st.headRow}>
        <Text style={[textStyles.h3, { flex: 1 }]}>📣 Commentary</Text>
        <Text style={textStyles.muted}>newest first</Text>
      </View>
      <View style={{ gap: theme.spacing(1.5) }}>
        {items.slice(0, shown).map((it) => <FeedRow key={it.key} item={it} />)}
      </View>
      {more > 0 ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Show ${more} more commentary lines`} onPress={() => setShown(shown + 15)} style={st.moreBtn}>
          <Text style={st.more}>Show {more} more</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const strong = item.tone === 'medal' || item.tone === 'lead';
  return (
    <View style={st.feedRow} accessible accessibilityLabel={`${item.tag ? `${item.tag}: ` : ''}${item.text}${item.detail ? `. ${item.detail}` : ''}`}>
      <View style={[st.dot, { backgroundColor: TONE[item.tone ?? 'info'] }]} />
      {item.tag ? <Text style={st.tag} numberOfLines={1}>{item.tag}</Text> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[st.feedTxt, strong && st.bold, item.tone === 'bad' && { color: theme.colors.danger }]}>{item.text}</Text>
        {item.detail ? <Text style={st.detail}>{item.detail}</Text> : null}
      </View>
    </View>
  );
}

/* ------------------------------- weightlifting ------------------------------ */

function LiftStatsCard({ entries }: { entries: ResultEntry[] }) {
  const s = useMemo(() => liftSessionStats(entries), [entries]);
  if (!s.lifters) return null;
  const done = activeLift(entries) == null;
  // the referees' decisions per lifter — only when the meet recorded lights / jury / changes
  const detailed = !!(s.lights || s.jury || s.changes);
  return (
    <Card style={st.card}>
      <Text style={textStyles.h3}>📊 Session stats</Text>
      {s.winner ? <Text style={[textStyles.body, st.bold]}>{winnerLine(s.winner, done)}</Text> : null}
      <Row label="Lifters" value={String(s.lifters)} />
      <Row label="Snatch" value={liftStatsLine(s.snatch) || '–'} />
      <Row label="Clean & jerk" value={liftStatsLine(s.cj) || '–'} />
      {s.lights ? <Row label="Referees" value={`${s.lights.unanimous} unanimous, ${s.lights.split} split (${s.lights.recorded} with lights)`} /> : null}
      {s.jury ? <Row label="Jury" value={`${s.jury} decision${s.jury === 1 ? '' : 's'} reversed`} /> : null}
      {s.changes ? <Row label="Weight changes" value={`${s.changes.total} on ${s.changes.attempts} attempt${s.changes.attempts === 1 ? '' : 's'}`} /> : null}
      {s.noTotal.length ? <Row label="No total" value={s.noTotal.map((n) => `${n.name} (${n.lift === 'snatch' ? 'snatch' : 'C&J'})`).join(', ')} bad /> : null}
      {detailed && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.head}>DECISIONS (white–red · J = jury · Δ = weight changes)</Text>
          {[...entries].filter((e) => LIFTS.some((l) => (e.result.lifts?.[l] ?? []).some(taken))).sort((a, b) => (a.result.order ?? 99) - (b.result.order ?? 99)).map((e) => (
            <View key={e.id}>
              <Text style={st.name} numberOfLines={1}>{e.name}</Text>
              <Text style={st.detail}>
                {LIFTS.map((l) => `${LIFT_SHORT[l]} ${(e.result.lifts?.[l] ?? []).filter(taken).map((a) => `${a.kg}${a.pass ? ' –' : a.good ? ' ✓' : ' ✗'}${lightsScore(a) ? ` ${lightsScore(a)}` : ''}${a.jury ? ' J' : ''}${a.chg?.length ? ` Δ${a.chg.length}` : ''}`).join(' · ') || '–'}`).join('   ')}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/* ---------------------------------- shooting --------------------------------- */

function ShootStatsCard({ entries, def, ev, shots }: { entries: ResultEntry[]; def: DisciplineDef; ev: ShootEventDef; shots: number }) {
  const s = useMemo(() => shootStats(entries, def, shots), [entries, def, shots]);
  if (!s) return null;
  return s.kind === 'final' ? <ShootFinalCard s={s} /> : <ShootSeriesCard s={s} ev={ev} shots={shots} />;
}

function ShootSeriesCard({ s, ev, shots }: { s: ShootSeriesStats; ev: ShootEventDef; shots: number }) {
  const sc = (v: number) => scoreText(v, ev.scoring);
  const int = ev.scoring === 'integer';
  return (
    <Card style={st.card}>
      <Text style={textStyles.h3}>📊 Match stats</Text>
      {s.bestSeries ? <Row label="Best series" value={`${s.bestSeries.names.join(', ')} ${sc(s.bestSeries.value)} (${seriesTag(ev, shots, s.bestSeries.index)})`} /> : null}
      {s.perfect ? <Row label="Perfect series" value={String(s.perfect)} /> : null}
      {s.penalties ? <Row label="Penalties" value={`−${s.penalties} points`} bad /> : null}
      <Row label="Lead changes" value={String(s.leadChanges)} />
      <View style={st.tableHead}>
        <Text style={[st.head, { flex: 1 }]}>SHOOTER</Text>
        <Text style={[st.head, st.num]}>BEST</Text>
        <Text style={[st.head, st.num]}>WORST</Text>
        <Text style={[st.head, st.num]}>AVG</Text>
        {int ? <Text style={[st.head, st.numS]}>X</Text> : null}
      </View>
      {s.shooters.map((x) => (
        <View key={x.id} style={{ gap: 2 }}>
          <View style={st.headRow}>
            <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{x.place ? `${x.place}. ` : ''}{x.name}</Text>
            <Text style={[st.val, st.num]}>{sc(x.best)}</Text>
            <Text style={[st.val, st.num]}>{sc(x.worst)}</Text>
            <Text style={[st.val, st.num]}>{x.avg.toFixed(1)}</Text>
            {int ? <Text style={[st.val, st.numS]}>{x.xs ?? 0}</Text> : null}
          </View>
          <Text style={st.detail}>
            {[
              x.byPos?.map((p) => `${POSITION_LABEL[p.pos]} ${sc(p.total)}`).join(' · ') ?? '',
              x.shots ? `shot by shot: avg ${x.shots.avg.toFixed(2)} · ${x.shots.dist.filter((d) => d.n).map((d) => `${d.label} ×${d.n}`).join(' ')} · low ${sc(x.shots.low)}` : '',
              x.perfect ? `${x.perfect} perfect` : '',
              x.pen ? `−${x.pen} penalty` : '',
              x.series.length > 1 ? `spread ${sc(x.spread)}` : '',
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function ShootFinalCard({ s }: { s: ShootFinalStats }) {
  return (
    <Card style={st.card}>
      <Text style={textStyles.h3}>📊 Final stats</Text>
      {s.bestShot ? <Row label="Best shot" value={`${s.bestShot.names.join(', ')} ${s.bestShot.value.toFixed(1)}`} /> : null}
      <Row label="Lead changes" value={String(s.leadChanges)} />
      <View style={st.tableHead}>
        <Text style={[st.head, { flex: 1 }]}>FINALIST</Text>
        <Text style={[st.head, st.numS]}>SHOTS</Text>
        <Text style={[st.head, st.num]}>AVG</Text>
        <Text style={[st.head, st.num]}>BEST</Text>
        <Text style={[st.head, st.numS]}>10+</Text>
      </View>
      {s.finalists.map((x) => (
        <View key={x.id} style={{ gap: 2 }}>
          <View style={st.headRow}>
            <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{x.place ? `${x.place}. ` : ''}{x.name}</Text>
            <Text style={[st.val, st.numS]}>{x.shots}</Text>
            <Text style={[st.val, st.num]}>{x.shots ? x.avg.toFixed(2) : '–'}</Text>
            <Text style={[st.val, st.num]}>{x.shots ? x.best.toFixed(1) : '–'}</Text>
            <Text style={[st.val, st.numS]}>{x.tens}</Text>
          </View>
          <Text style={st.detail}>Place after shot {s.checkpoints.join(' / ')}: {x.ranks.map((r) => (r == null ? '–' : r)).join(' · ')}</Text>
        </View>
      ))}
    </Card>
  );
}

/* ---------------------------------- archery ---------------------------------- */

function ArchStatsCard({ entries, def }: { entries: ResultEntry[]; def: DisciplineDef }) {
  const s = useMemo(() => archStats(entries, def), [entries, def]);
  if (!s) return null;
  return s.kind === 'bracket' ? <ArchBracketCard s={s} /> : <ArchRankingCard s={s} />;
}

function ArchRankingCard({ s }: { s: ArchRoundStats }) {
  return (
    <Card style={st.card}>
      <Text style={textStyles.h3}>📊 Ranking round stats</Text>
      {s.bestEnd ? <Row label="Best end" value={`${s.bestEnd.names.join(', ')} ${s.bestEnd.value}`} /> : null}
      {s.mostX && s.mostX.value > 0 ? <Row label="Most X" value={`${s.mostX.names.join(', ')} ${s.mostX.value}`} /> : null}
      <Row label="Lead changes" value={String(s.leadChanges)} />
      <View style={st.tableHead}>
        <Text style={[st.head, { flex: 1 }]}>ARCHER</Text>
        <Text style={[st.head, st.num]}>AVG</Text>
        <Text style={[st.head, st.num]}>X/END</Text>
        <Text style={[st.head, st.num]}>BEST END</Text>
      </View>
      {s.archers.map((a) => (
        <View key={a.id} style={{ gap: 2 }}>
          <View style={st.headRow}>
            <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{a.place ? `${a.place}. ` : ''}{a.name}</Text>
            <Text style={[st.val, st.num]}>{a.avgArrow.toFixed(2)}</Text>
            <Text style={[st.val, st.num]}>{a.xPerEnd.toFixed(2)}</Text>
            <Text style={[st.val, st.num]}>{a.bestEnd}</Text>
          </View>
          <Text style={st.detail}>
            {[`${a.total} in ${a.ends} end${a.ends === 1 ? '' : 's'}`, a.halves ? `halves ${a.halves[0]} + ${a.halves[1]}` : '', a.dist.map((d) => `${d.label} ×${d.n}`).join(' '), `worst end ${a.worstEnd}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function ArchBracketCard({ s }: { s: ArchBracketStats }) {
  return (
    <Card style={st.card}>
      <Text style={textStyles.h3}>📊 Match play stats</Text>
      {s.bestEnd ? <Row label="Best match end" value={`${s.bestEnd.names.join(', ')} ${s.bestEnd.value}`} /> : null}
      <Row label="Shoot-offs" value={String(s.shootOffs)} />
      <View style={st.tableHead}>
        <Text style={[st.head, { flex: 1 }]}>ARCHER</Text>
        <Text style={[st.head, st.num]}>W–L</Text>
        <Text style={[st.head, st.num]}>SETS</Text>
        <Text style={[st.head, st.num]}>AVG</Text>
      </View>
      {s.archers.map((a) => (
        <View key={a.id} style={{ gap: 2 }}>
          <View style={st.headRow}>
            <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{a.place ? `${ordinalOf(a.place)} ` : a.seed ? `(${a.seed}) ` : ''}{a.name}</Text>
            <Text style={[st.val, st.num]}>{a.won}–{a.lost}</Text>
            <Text style={[st.val, st.num]}>{a.sets ? `${a.sets.won}-${a.sets.tied}-${a.sets.lost}` : '–'}</Text>
            <Text style={[st.val, st.num]}>{a.arrows ? a.avgArrow.toFixed(2) : '–'}</Text>
          </View>
          <Text style={st.detail}>
            {[`${a.arrows} arrows, ${a.points} points`, `10s ${a.tens} · X ${a.xs}`, a.bestEnd ? `best end ${a.bestEnd}` : '', a.shootOffs.won + a.shootOffs.lost ? `shoot-offs ${a.shootOffs.won}-${a.shootOffs.lost}` : ''].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ))}
      <Text style={st.detail}>Sets = won-shared-lost (set system). Average arrow over the ends that counted.</Text>
    </Card>
  );
}

/* ----------------------------------- shared ---------------------------------- */

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <View style={st.row}>
      <Text style={st.rowLabel}>{label}</Text>
      <Text style={[st.rowVal, bad && { color: theme.colors.danger }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(2), padding: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: 4, marginTop: theme.spacing(1) },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  num: { width: 56, textAlign: 'right' },
  numS: { width: 40, textAlign: 'right' },
  name: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  val: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  bold: { fontWeight: '800' },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-start' },
  rowLabel: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', width: 110 },
  rowVal: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  feedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2) },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  tag: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', minWidth: 40, marginTop: 2 },
  feedTxt: { color: theme.colors.text, fontSize: theme.font.small, lineHeight: theme.font.small * 1.4 },
  moreBtn: { minHeight: 44, justifyContent: 'center' },
  more: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small },
});
