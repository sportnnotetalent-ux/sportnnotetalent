/**
 * Deep wave (cricket) — the Stats tab: a match centre at broadcast depth.
 *   Compare  — team vs team (ATP-panel style bars), filter All / Powerplay /
 *              Middle / Death: runs, run rate, boundary %, dot-ball %,
 *              scoring-shot %, balls per boundary, economy, extras, fielding,
 *              and — only when tracked — shot control, speed, pace vs spin.
 *   Batting  — per batter: SR, dot %, boundary %, control, vs pace / spin, minutes.
 *   Bowling  — per bowler: economy by phase, dot %, boundaries, false shots, speed.
 *   Phases   — powerplay / middle / death for both innings.
 *   Matchups — batter vs bowler.
 *   Graphs   — worm and Manhattan for both innings.
 *   Pitch map / Shots — only when the scorer tagged them.
 * All from the pure selectors in matchStats.ts (derived from the replayed log).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line as SvgLine, Polyline, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { SelectChip } from '../../components/ui';
import { playerLink } from '../playerLink';
import type { CricketState } from './engine';
import {
  compareSections, phasePlan, battingRows, bowlingRows, matchups, worm, pitchDots, pitchGrid, teamBatting, trackedKinds,
  type PhaseFilter, type CompareRow, type Phase,
} from './matchStats';
import { LENGTHS, LINES, LENGTH_LABEL, LINE_LABEL } from './detail';
import { WagonWheelView } from './WagonWheel';

type Side = 'home' | 'away';
type Cat = 'compare' | 'batting' | 'bowling' | 'phases' | 'matchups' | 'graphs' | 'pitch' | 'shots';

export function CricketMatchStats({ state: s, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, onPlayer }: {
  state: CricketState; homeName: string; awayName: string; homeColor?: string; awayColor?: string;
  onPlayer?: (playerId: string) => void;
}) {
  const kinds = useMemo(() => trackedKinds(s), [s]);
  const [cat, setCat] = useState<Cat>('compare');
  const [phase, setPhase] = useState<PhaseFilter>('all');
  // the batting side shown by the per-innings views (default: the side batting now / last)
  const [side, setSide] = useState<Side>(s.battingSide);
  const nameOf = (sd: Side) => (sd === 'home' ? homeName : awayName);
  const colorOf = (sd: Side) => (sd === 'home' ? homeColor : awayColor);
  if (!Array.isArray(s.log)) return <Text style={st.empty}>Match stats appear once the match is replayed from its ball log.</Text>;
  if (!s.log.some((r) => !r.cross)) return <Text style={st.empty}>Match stats start with the first ball.</Text>;
  const batted = (sd: Side) => (s.log ?? []).some((r) => r.side === sd && !r.cross);
  const sides = (['home', 'away'] as Side[]).filter(batted);
  const cats: { key: Cat; label: string }[] = [
    { key: 'compare', label: 'Compare' }, { key: 'batting', label: 'Batting' }, { key: 'bowling', label: 'Bowling' },
    { key: 'phases', label: 'Phases' }, { key: 'matchups', label: 'Matchups' }, { key: 'graphs', label: 'Graphs' },
    ...(kinds.pitch ? [{ key: 'pitch' as Cat, label: 'Pitch map' }] : []),
    ...(kinds.shots ? [{ key: 'shots' as Cat, label: 'Shots' }] : []),
  ];
  const plan = phasePlan(s, 1) ?? phasePlan(s, 2);
  const sidePick = (
    <View style={st.chips}>
      {sides.map((sd) => <SelectChip key={sd} label={`${nameOf(sd)} batting`} dotColor={colorOf(sd)} active={side === sd} onPress={() => setSide(sd)} />)}
    </View>
  );
  const curSide: Side = sides.includes(side) ? side : sides[0];

  return (
    <View style={{ gap: theme.spacing(3) }}>
      <View style={st.chips}>
        {cats.map((c) => <SelectChip key={c.key} label={c.label} active={cat === c.key} onPress={() => setCat(c.key)} />)}
      </View>

      {cat === 'compare' && (
        <>
          {plan ? (
            <View style={st.chips}>
              {(['all', 'pp', 'middle', 'death'] as PhaseFilter[]).filter((p) => p !== 'pp' || plan.pp > 0).map((p) => (
                <SelectChip key={p} label={p === 'all' ? 'Match' : p === 'pp' ? 'Powerplay' : p === 'middle' ? 'Middle' : 'Death'} active={phase === p} onPress={() => setPhase(p)} />
              ))}
            </View>
          ) : null}
          {phase !== 'all' && plan ? <Text style={st.meta}>{plan.labels[phase as Phase]}</Text> : null}
          <Compare s={s} phase={phase} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />
        </>
      )}

      {cat === 'batting' && (<>{sidePick}<Batting s={s} side={curSide} onPlayer={onPlayer} /></>)}
      {cat === 'bowling' && (<>{sidePick}<Bowling s={s} side={curSide} onPlayer={onPlayer} /></>)}
      {cat === 'phases' && <Phases s={s} sides={sides} nameOf={nameOf} colorOf={colorOf} />}
      {cat === 'matchups' && (<>{sidePick}<Matchups s={s} side={curSide} /></>)}
      {cat === 'graphs' && <Graphs s={s} sides={sides} nameOf={nameOf} colorOf={colorOf} />}
      {cat === 'pitch' && (<>{sidePick}<PitchMap s={s} side={curSide} bowlingName={nameOf(curSide === 'home' ? 'away' : 'home')} /></>)}
      {cat === 'shots' && (<>{sidePick}<Shots s={s} side={curSide} /></>)}
    </View>
  );
}

/* ------------------------------- Compare ------------------------------- */

function Compare({ s, phase, homeName, awayName, homeColor, awayColor }: {
  s: CricketState; phase: PhaseFilter; homeName: string; awayName: string; homeColor: string; awayColor: string;
}) {
  const sections = useMemo(() => compareSections(s, phase), [s, phase]);
  return (
    <View style={st.card} accessibilityLabel="Team comparison">
      <View style={st.cmpHead}>
        <View style={st.cmpTeam}><View style={[st.dot, { backgroundColor: homeColor }]} /><Text style={st.team} numberOfLines={1}>{homeName}</Text></View>
        <View style={[st.cmpTeam, { justifyContent: 'flex-end' }]}><Text style={st.team} numberOfLines={1}>{awayName}</Text><View style={[st.dot, { backgroundColor: awayColor }]} /></View>
      </View>
      {sections.map((sec) => (
        <View key={sec.title} style={{ gap: theme.spacing(1) }}>
          <Text style={st.section}>{sec.title}</Text>
          {sec.rows.map((r) => <CompareLine key={r.label} r={r} homeColor={homeColor} awayColor={awayColor} />)}
        </View>
      ))}
    </View>
  );
}

function CompareLine({ r, homeColor, awayColor }: { r: CompareRow; homeColor: string; awayColor: string }) {
  const h = r.h ?? 0;
  const a = r.a ?? 0;
  const tot = h + a;
  const lead = r.better && h !== a && r.h !== undefined && r.a !== undefined ? ((r.better === 'higher') === h > a ? 'home' : 'away') : null;
  return (
    <View style={{ gap: 2 }} accessibilityLabel={`${r.label}: ${r.home} to ${r.away}`}>
      <View style={st.cmpRow}>
        <Text style={[st.cmpVal, lead === 'home' && st.cmpLead]}>{r.home}</Text>
        <Text style={st.cmpLabel} numberOfLines={1}>{r.label}</Text>
        <Text style={[st.cmpVal, { textAlign: 'right' }, lead === 'away' && st.cmpLead]}>{r.away}</Text>
      </View>
      {r.h !== undefined && r.a !== undefined && tot > 0 ? (
        <View style={st.bar}>
          <View style={{ flex: h, backgroundColor: homeColor, opacity: lead === 'away' ? 0.45 : 1 }} />
          <View style={{ width: 2 }} />
          <View style={{ flex: a, backgroundColor: awayColor, opacity: lead === 'home' ? 0.45 : 1 }} />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------- Batting / bowling ------------------------------- */

function Batting({ s, side, onPlayer }: { s: CricketState; side: Side; onPlayer?: (id: string) => void }) {
  const mask = useMask();
  const rows = useMemo(() => battingRows(s, side), [s, side]);
  if (!rows.length) return <Text style={st.empty}>Yet to bat.</Text>;
  return (
    <View style={st.card}>
      <View style={st.thead}>
        <Text style={[st.cName, st.th]}>Batter</Text>
        {['R', 'B', 'SR', 'Dot%', 'Bdry%'].map((h) => <Text key={h} style={[st.cNum, st.th]}>{h}</Text>)}
      </View>
      {rows.map((b) => {
        const extra = [
          `4s ${b.fours} · 6s ${b.sixes} · dots ${b.dots}`,
          b.control ? `control ${b.control}` : '',
          b.vsPace ? `v pace ${b.vsPace}` : '', b.vsSpin ? `v spin ${b.vsSpin}` : '',
          b.minutes !== undefined ? `${b.minutes} min` : '',
        ].filter(Boolean).join(' · ');
        return (
          <View key={b.id} style={st.trow}>
            <View style={st.rowMain}>
              <Text style={[st.cName, st.name]} numberOfLines={1} {...playerLink(b.id, mask.byId(b.id, b.name), onPlayer)}>{mask.byId(b.id, b.name)}{b.out ? '' : '*'}</Text>
              <Text style={[st.cNum, st.bold]}>{b.runs}</Text>
              <Text style={st.cNum}>{b.balls}</Text>
              <Text style={st.cNum}>{b.sr}</Text>
              <Text style={st.cNum}>{b.dotPct}</Text>
              <Text style={st.cNum}>{b.boundaryPct}</Text>
            </View>
            <Text style={st.sub}>{extra}</Text>
          </View>
        );
      })}
      <Text style={st.meta}>Dot% = balls faced with no run off the bat · Bdry% = share of runs in 4s and 6s.</Text>
    </View>
  );
}

function Bowling({ s, side, onPlayer }: { s: CricketState; side: Side; onPlayer?: (id: string) => void }) {
  const mask = useMask();
  const rows = useMemo(() => bowlingRows(s, side), [s, side]);
  const plan = phasePlan(s, (s.log ?? []).find((r) => r.side === side && !r.cross)?.inn ?? 1);
  if (!rows.length) return <Text style={st.empty}>No bowling yet.</Text>;
  return (
    <View style={st.card}>
      <View style={st.thead}>
        <Text style={[st.cName, st.th]}>Bowler</Text>
        {['O', 'R', 'W', 'Econ', 'Dot%'].map((h) => <Text key={h} style={[st.cNum, st.th]}>{h}</Text>)}
      </View>
      {rows.map((b) => {
        const ph = plan ? (['pp', 'middle', 'death'] as Phase[]).filter((p) => (p !== 'pp' || plan.pp > 0) && b.phaseEcon[p] !== '–')
          .map((p) => `${p === 'pp' ? 'PP' : p === 'middle' ? 'mid' : 'death'} ${b.phaseEcon[p]}`).join(' · ') : '';
        const extra = [
          b.type ?? '',
          `M ${b.maidens} · 4s ${b.fours} · 6s ${b.sixes}${b.wides ? ` · wd ${b.wides}` : ''}${b.noBalls ? ` · nb ${b.noBalls}` : ''}`,
          ph ? `econ ${ph}` : '',
          b.falseShotPct ? `false shots ${b.falseShotPct}` : '',
          b.speed ? `${b.speed.avg} km/h avg · max ${b.speed.max}` : '',
        ].filter(Boolean).join(' · ');
        return (
          <View key={b.id} style={st.trow}>
            <View style={st.rowMain}>
              <Text style={[st.cName, st.name]} numberOfLines={1} {...playerLink(b.id, mask.byId(b.id, b.name), onPlayer)}>{mask.byId(b.id, b.name)}</Text>
              <Text style={st.cNum}>{b.overs}</Text>
              <Text style={st.cNum}>{b.runs}</Text>
              <Text style={[st.cNum, st.bold]}>{b.wkts}</Text>
              <Text style={st.cNum}>{b.econ}</Text>
              <Text style={st.cNum}>{b.dotPct}</Text>
            </View>
            <Text style={st.sub}>{extra}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------- Phases ------------------------------- */

function Phases({ s, sides, nameOf, colorOf }: { s: CricketState; sides: Side[]; nameOf: (sd: Side) => string; colorOf: (sd: Side) => string }) {
  const bpo = s.ballsPerOver;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {sides.map((sd) => {
        const inn = (s.log ?? []).find((r) => r.side === sd && !r.cross)?.inn ?? 1;
        const plan = phasePlan(s, inn);
        if (!plan) return <Text key={sd} style={st.empty}>{nameOf(sd)}: no phases for an innings this long / short.</Text>;
        const phases = (['pp', 'middle', 'death'] as Phase[]).filter((p) => p !== 'pp' || plan.pp > 0);
        return (
          <View key={sd} style={st.card}>
            <View style={st.cmpTeam}><View style={[st.dot, { backgroundColor: colorOf(sd) }]} /><Text style={st.team}>{nameOf(sd)} batting</Text></View>
            <View style={st.thead}>
              <Text style={[st.cName, st.th]}>Phase</Text>
              {['Runs', 'RR', 'Dot%', '4s/6s'].map((h) => <Text key={h} style={[st.cNumW, st.th]}>{h}</Text>)}
            </View>
            {phases.map((p) => {
              const t = teamBatting(s, sd, p);
              return (
                <View key={p} style={st.rowMain}>
                  <Text style={[st.cName, st.name]} numberOfLines={2}>{plan.labels[p]}</Text>
                  <Text style={[st.cNumW, st.bold]}>{t.legal || t.runs ? `${t.runs}/${t.wkts}` : '–'}</Text>
                  <Text style={st.cNumW}>{t.legal ? ((t.runs / t.legal) * bpo).toFixed(2) : '–'}</Text>
                  <Text style={st.cNumW}>{t.legal ? `${Math.round((t.dots / t.legal) * 100)}%` : '–'}</Text>
                  <Text style={st.cNumW}>{t.legal ? `${t.fours}/${t.sixes}` : '–'}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------- Matchups ------------------------------- */

function Matchups({ s, side }: { s: CricketState; side: Side }) {
  const mask = useMask();
  const all = useMemo(() => matchups(s, side), [s, side]);
  const ids = Object.keys(all);
  const [pick, setPick] = useState<string | null>(null);
  if (!ids.length) return <Text style={st.empty}>No balls faced yet.</Text>;
  const id = pick && all[pick] ? pick : ids[0];
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.chips}>
        {ids.map((b) => <SelectChip key={b} label={mask.byId(b, s.batting[b]?.name || 'Batter')} active={b === id} onPress={() => setPick(b)} />)}
      </View>
      <View style={st.card}>
        <View style={st.thead}>
          <Text style={[st.cName, st.th]}>v Bowler</Text>
          {['R', 'B', 'SR', 'Out', '0s', '4/6'].map((h) => <Text key={h} style={[st.cNum, st.th]}>{h}</Text>)}
        </View>
        {all[id].map((m) => (
          <View key={m.bowlerId} style={st.rowMain}>
            <Text style={[st.cName, st.name]} numberOfLines={1}>{mask.byId(m.bowlerId, m.bowler)}</Text>
            <Text style={[st.cNum, st.bold]}>{m.runs}</Text>
            <Text style={st.cNum}>{m.balls}</Text>
            <Text style={st.cNum}>{m.balls ? ((m.runs / m.balls) * 100).toFixed(0) : '–'}</Text>
            <Text style={[st.cNum, m.outs ? { color: theme.colors.danger, fontWeight: '800' } : null]}>{m.outs}</Text>
            <Text style={st.cNum}>{m.dots}</Text>
            <Text style={st.cNum}>{m.fours}/{m.sixes}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------- Graphs ------------------------------- */

const W = 320;
const H = 160;
const PAD = 26;

function Graphs({ s, sides, nameOf, colorOf }: { s: CricketState; sides: Side[]; nameOf: (sd: Side) => string; colorOf: (sd: Side) => string }) {
  const data = sides.map((sd) => ({ sd, pts: worm(s, sd) }));
  const maxOver = Math.max(1, ...data.map((d) => d.pts.length));
  const maxRuns = Math.max(10, ...data.flatMap((d) => d.pts.map((p) => p.cum)));
  const maxOverRuns = Math.max(6, ...data.flatMap((d) => d.pts.map((p) => p.runs)));
  const x = (over: number) => PAD + ((W - PAD - 8) * over) / maxOver;
  const y = (runs: number) => H - PAD + 4 - ((H - PAD - 8) * runs) / maxRuns;
  const yb = (runs: number) => ((H - PAD - 8) * runs) / maxOverRuns;
  const slot = (W - PAD - 8) / maxOver;
  const bw = Math.max(2, Math.min(10, slot / (sides.length + 1)));
  const legend = (
    <View style={st.chips}>
      {sides.map((sd) => <View key={sd} style={st.cmpTeam}><View style={[st.dot, { backgroundColor: colorOf(sd) }]} /><Text style={st.meta}>{nameOf(sd)}</Text></View>)}
    </View>
  );
  const every = maxOver > 25 ? 10 : maxOver > 10 ? 5 : 1;
  const ticks = Array.from({ length: maxOver }, (_, i) => i + 1).filter((o) => o % every === 0 || o === 1);
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <View style={st.card} accessibilityLabel={`Worm: ${data.map((d) => `${nameOf(d.sd)} ${d.pts[d.pts.length - 1]?.cum ?? 0} after ${d.pts.length} overs`).join(', ')}`}>
        <Text style={st.section}>Worm — runs by over (● wicket)</Text>
        {legend}
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <SvgLine x1={PAD} y1={H - PAD + 4} x2={W - 8} y2={H - PAD + 4} stroke={theme.colors.border} strokeWidth={1} />
          <SvgLine x1={PAD} y1={4} x2={PAD} y2={H - PAD + 4} stroke={theme.colors.border} strokeWidth={1} />
          <SvgText x={PAD - 4} y={10} fontSize={9} fill={theme.colors.textMuted} textAnchor="end">{maxRuns}</SvgText>
          {ticks.map((o) => <SvgText key={o} x={x(o)} y={H - 8} fontSize={9} fill={theme.colors.textMuted} textAnchor="middle">{o}</SvgText>)}
          {data.map((d) => (
            <React.Fragment key={d.sd}>
              <Polyline points={[`${x(0)},${y(0)}`, ...d.pts.map((p) => `${x(p.over)},${y(p.cum)}`)].join(' ')} fill="none" stroke={colorOf(d.sd)} strokeWidth={2} />
              {d.pts.filter((p) => p.wktsInOver > 0).map((p) => (
                <Circle key={p.over} cx={x(p.over)} cy={y(p.cum)} r={3 + Math.min(3, p.wktsInOver - 1)} fill={theme.colors.danger} stroke={colorOf(d.sd)} strokeWidth={1} />
              ))}
            </React.Fragment>
          ))}
        </Svg>
      </View>
      <View style={st.card} accessibilityLabel="Manhattan: runs in each over">
        <Text style={st.section}>Manhattan — runs per over</Text>
        {legend}
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <SvgLine x1={PAD} y1={H - PAD + 4} x2={W - 8} y2={H - PAD + 4} stroke={theme.colors.border} strokeWidth={1} />
          <SvgText x={PAD - 4} y={10} fontSize={9} fill={theme.colors.textMuted} textAnchor="end">{maxOverRuns}</SvgText>
          {ticks.map((o) => <SvgText key={o} x={PAD + slot * (o - 0.5)} y={H - 8} fontSize={9} fill={theme.colors.textMuted} textAnchor="middle">{o}</SvgText>)}
          {data.map((d, k) => d.pts.map((p) => {
            const h = yb(p.runs);
            const bx = PAD + slot * (p.over - 1) + (slot - bw * sides.length) / 2 + bw * k;
            return (
              <React.Fragment key={`${d.sd}${p.over}`}>
                <Rect x={bx} y={H - PAD + 4 - h} width={bw} height={Math.max(1, h)} fill={colorOf(d.sd)} />
                {p.wktsInOver > 0 ? <Circle cx={bx + bw / 2} cy={H - PAD - h} r={2.5} fill={theme.colors.danger} /> : null}
              </React.Fragment>
            );
          }))}
        </Svg>
      </View>
    </View>
  );
}

/* ------------------------------- Pitch map ------------------------------- */

const DOT_TONE = { wicket: theme.colors.danger, boundary: theme.colors.primary, dot: theme.colors.textMuted, run: theme.colors.home, extra: theme.colors.accent } as const;

function PitchMap({ s, side, bowlingName }: { s: CricketState; side: Side; bowlingName: string }) {
  const [bowler, setBowler] = useState<string | null>(null);
  const all = useMemo(() => pitchDots(s, side), [s, side]);
  const ids = [...new Set(all.map((d) => d.bowlerId).filter((x): x is string => !!x))];
  const dots = bowler ? all.filter((d) => d.bowlerId === bowler) : all;
  const grid = pitchGrid(dots);
  const top = Math.max(1, ...Object.values(grid));
  const wk = (len: string, line: string) => dots.some((d) => d.len === len && d.line === line && d.tone === 'wicket');
  const lenOnly = dots.filter((d) => d.len);
  if (!all.length) return <Text style={st.empty}>No deliveries tagged with a line or length in this innings.</Text>;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={st.meta}>{bowlingName} bowling · {dots.length} deliveries tagged</Text>
      <View style={st.chips}>
        <SelectChip label="All bowlers" active={!bowler} onPress={() => setBowler(null)} />
        {ids.map((id) => <SelectChip key={id} label={s.bowling[id]?.name || 'Bowler'} active={bowler === id} onPress={() => setBowler(id)} />)}
      </View>
      <View style={st.card} accessibilityLabel={`Pitch map: ${Object.entries(grid).map(([k, n]) => `${k.replace(':', ' ')} ${n}`).join(', ')}`}>
        <Text style={st.meta}>Seen from behind the bowler: the batter at the top, the off side on the left</Text>
        <View style={st.pmHead}>
          <Text style={st.pmLenH} />
          {LINES.map((l) => <Text key={l} style={st.pmLineH} numberOfLines={1}>{LINE_LABEL[l]}</Text>)}
        </View>
        {[...LENGTHS].reverse().map((len) => (
          <View key={len} style={st.pmRow}>
            <Text style={st.pmLen} numberOfLines={1}>{LENGTH_LABEL[len]}</Text>
            {LINES.map((line) => {
              const n = grid[`${len}:${line}`] ?? 0;
              return (
                <View key={line} style={[st.pmCell, n > 0 && { backgroundColor: theme.colors.primary + Math.round(0x22 + (0xbb * n) / top).toString(16).padStart(2, '0') }]}>
                  <Text style={[st.pmN, n > 0 && { color: theme.colors.onFill }]}>{n || ''}</Text>
                  {wk(len, line) ? <View style={st.pmWkt} /> : null}
                </View>
              );
            })}
          </View>
        ))}
        <Text style={st.meta}>● red = a wicket fell to a ball there</Text>
      </View>
      {lenOnly.length > 0 ? (
        <View style={st.card}>
          <Text style={st.section}>Length mix</Text>
          {LENGTHS.map((len) => {
            const n = lenOnly.filter((d) => d.len === len).length;
            if (!n) return null;
            const toneN = (t: keyof typeof DOT_TONE) => lenOnly.filter((d) => d.len === len && d.tone === t).length;
            return (
              <View key={len} style={st.rowMain}>
                <Text style={[st.cName, st.name]}>{LENGTH_LABEL[len]}</Text>
                <Text style={st.cNumW}>{Math.round((n / lenOnly.length) * 100)}%</Text>
                <Text style={[st.cNumW, { color: DOT_TONE.dot }]}>{toneN('dot')} dots</Text>
                <Text style={[st.cNumW, { color: DOT_TONE.boundary }]}>{toneN('boundary')} bdry</Text>
                <Text style={[st.cNumW, { color: DOT_TONE.wicket }]}>{toneN('wicket')} wkt</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------- Shots ------------------------------- */

function Shots({ s, side }: { s: CricketState; side: Side }) {
  const shots = (s.shots ?? []).filter((x) => x.side === side);
  if (!shots.length) return <Text style={st.empty}>No shots tagged in this innings.</Text>;
  const kinds = new Map<string, { runs: number; n: number }>();
  for (const x of shots) if (x.shot) { const k = kinds.get(x.shot) ?? { runs: 0, n: 0 }; k.runs += x.runs; k.n += 1; kinds.set(x.shot, k); }
  const scoring = (s.log ?? []).filter((r) => r.side === side && !r.cross && r.bat > 0).length;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <WagonWheelView shots={shots} title="Team wagon wheel" note={`${shots.filter((x) => x.zone).length} of ${scoring} scoring shots tagged`} />
      {kinds.size > 0 ? (
        <View style={st.card}>
          <Text style={st.section}>Shot types</Text>
          {[...kinds.entries()].sort((a, b) => b[1].runs - a[1].runs).map(([k, v]) => (
            <View key={k} style={st.rowMain}>
              <Text style={[st.cName, st.name]}>{k}</Text>
              <Text style={[st.cNumW, st.bold]}>{v.runs} runs</Text>
              <Text style={st.cNumW}>{v.n} shot{v.n === 1 ? '' : 's'}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  section: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing(1) },
  cmpHead: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
  cmpTeam: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1), flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  team: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', flexShrink: 1 },
  cmpRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  cmpVal: { width: 92, color: theme.colors.text, fontSize: theme.font.small },
  cmpLead: { fontWeight: '900', color: theme.colors.text },
  cmpLabel: { flex: 1, textAlign: 'center', color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  bar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt },
  thead: { flexDirection: 'row', alignItems: 'center' },
  th: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase' },
  trow: { gap: 2, paddingVertical: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border },
  rowMain: { flexDirection: 'row', alignItems: 'center' },
  cName: { flex: 1 },
  name: { color: theme.colors.text, fontSize: theme.font.small },
  bold: { fontWeight: '800' },
  cNum: { width: 40, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  cNumW: { width: 56, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  pmHead: { flexDirection: 'row', alignItems: 'center' },
  pmLenH: { width: 74 },
  pmLineH: { flex: 1, textAlign: 'center', color: theme.colors.textMuted, fontSize: 10, fontWeight: '700' },
  pmRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 2 },
  pmLen: { width: 72, color: theme.colors.textMuted, fontSize: 11, fontWeight: '700' },
  pmCell: { flex: 1, height: 30, borderRadius: 4, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  pmN: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  pmWkt: { position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.danger },
});
