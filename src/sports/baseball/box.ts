/**
 * SD-144 — baseball box score sources (SD-23 shared box score). PURE.
 * Batting: every batter in the order (and anyone who came in), AB R H RBI BB
 * SO (+ 2B 3B HR SB when someone has one) and AVG for the game. Pitching (a
 * second table): IP H R ER BB SO HR NP ERA per pitcher who appeared. Both
 * come from the same absolute totals the stat lines get (./totals.ts). The
 * team comparison reads errors, left on base and pitches thrown.
 * Deep wave: with pitch by pitch on, P-S (pitches-strikes) replaces NP; both
 * tables carry MLB-style notes (team RISP, two-out RBI, double plays turned;
 * first-pitch strikes–batters faced, ground outs–fly outs, batters faced,
 * inherited runners–scored, the pitch mix when tracked).
 */
import type { Player } from '../../core/types';
import type { BoxRowInput, BoxSideInput, MatchBoxSource } from '../boxScore.ts';
import { batterStats, whoKey, PITCH_TYPE_CHIP, isPitchType, type BaseballState, type Side } from './engine.ts';
import { baseballTotals, teamFigures } from './totals.ts';
import { batterFigures, mixText, pitcherFigures, teamSplit } from './situational.ts';
import { withNames } from './names.ts';
import { withRosters, type NameOf } from '../racketNames.ts';

/** `names` (deep wave): the team names the box notes use ("RISP: Owls 2-for-9").
 *  `nameOf` (IDs-only scoring): a player's name for this viewer by id — the
 *  log keeps ids only; absent → an older log's stored name, else the roster's. */
export interface BaseballBoxContext { homeRoster?: Player[]; awayRoster?: Player[]; names?: { home: string; away: string }; nameOf?: NameOf }

/** The state with its players named for this viewer (names.ts), the rosters as the fallback. */
const named = (s: BaseballState, ctx: BaseballBoxContext): BaseballState =>
  withNames(s, withRosters(ctx.nameOf, ctx.homeRoster ?? [], ctx.awayRoster ?? []));

const teamName = (ctx: BaseballBoxContext, sd: Side) => ctx.names?.[sd] ?? (sd === 'home' ? 'Home' : 'Visitors');
/** "A 2 · B 1" — non-empty parts joined */
const joinParts = (xs: (string | false | undefined | null)[]) => xs.filter(Boolean).join(' · ');

/** Deep wave — the batting box notes (MLB / WBSC box-score style): team RISP
 *  "2-for-9", two-out RBI by batter, double plays turned. */
export function battingNotes(state: BaseballState, ctx: BaseballBoxContext = {}): string[] {
  const s = named(state, ctx);
  const out: string[] = [];
  const sides: Side[] = ['away', 'home'];
  const t = { away: teamSplit(s, 'away'), home: teamSplit(s, 'home') };
  if (t.away.rispAb + t.home.rispAb > 0) out.push(`With RISP: ${joinParts(sides.map((sd) => `${teamName(ctx, sd)} ${t[sd].rispHits}-for-${t[sd].rispAb}`))}`);
  const two = batterFigures(s).filter((b) => b.twoOutRbi > 0);
  if (two.length) out.push(`2-out RBI: ${joinParts(two.map((b) => `${nameIn(b.side === 'home' ? ctx.homeRoster : ctx.awayRoster, b.id, b.name)} ${b.twoOutRbi}`))}`);
  if (t.away.dp + t.home.dp > 0) out.push(`DP turned: ${joinParts(sides.map((sd) => t[sd].dp > 0 && `${teamName(ctx, sd)} ${t[sd].dp}`))}`);
  return out;
}

/** Deep wave — the pitching box notes: first-pitch strikes–batters faced
 *  (pitch by pitch), ground outs–fly outs, batters faced, inherited runners–
 *  scored, the pitch mix (when pitch types are tracked). */
export function pitchingNotes(state: BaseballState, ctx: BaseballBoxContext = {}): string[] {
  const s = named(state, ctx);
  const ps = pitcherFigures(s).filter((p) => p.bf > 0 || p.pitches > 0);
  if (!ps.length) return [];
  const nm = (p: (typeof ps)[number]) => nameIn(p.side === 'home' ? ctx.homeRoster : ctx.awayRoster, p.id, p.name);
  const out: string[] = [];
  if (s.cfg.pitches && ps.some((p) => p.firstPitches > 0)) out.push(`First-pitch strikes–batters faced: ${joinParts(ps.map((p) => `${nm(p)} ${p.firstStrikes}-${p.firstPitches}`))}`);
  out.push(`Ground outs–fly outs: ${joinParts(ps.map((p) => `${nm(p)} ${p.go}-${p.ao}`))}`);
  out.push(`Batters faced: ${joinParts(ps.map((p) => `${nm(p)} ${p.bf}`))}`);
  const ir = ps.filter((p) => p.ir > 0);
  if (ir.length) out.push(`Inherited runners–scored: ${joinParts(ir.map((p) => `${nm(p)} ${p.ir}-${p.irs}`))}`);
  for (const p of ps) if (Object.keys(p.mix).length) out.push(`Pitch mix · ${nm(p)}: ${mixText(p.mix, (t) => (isPitchType(t) ? PITCH_TYPE_CHIP[t] : t))}`);
  return out;
}

const BAT_KEYS = ['plateAppearances', 'atBats', 'runs', 'hits', 'twoB', 'threeB', 'homeRuns', 'rbi', 'baseOnBalls', 'hitByPitch', 'strikeouts', 'sacFlies', 'sacBunts', 'stolenBases'] as const;
const PITCH_KEYS = ['outsPitched', 'hitsAllowed', 'runsAllowed', 'earnedRuns', 'erN', 'bbAllowed', 'kPitched', 'hrAllowed', 'pitches'] as const;
const OCCASIONAL = new Set(['twoB', 'threeB', 'homeRuns', 'stolenBases', 'hrAllowed']);

const nameIn = (roster: Player[] | undefined, id?: string, name?: string) => name ?? roster?.find((p) => p.id === id)?.fullName ?? 'Player';

/** Per-batter figures straight from the log, keyed by id (else "name:…"),
 *  so a game scored without a roster ("Batter 3") still has a box. */
function battingLines(s: BaseballState): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  const add = (k: string | undefined, stats: Record<string, number>) => {
    if (!k) return;
    const l = out.get(k) ?? {};
    for (const [x, v] of Object.entries(stats)) l[x] = (l[x] ?? 0) + v;
    out.set(k, l);
  };
  for (const e of s.events) {
    if (e.type === 'pa' && e.outcome) add(whoKey(e.batter), batterStats(e.outcome, e.rbi ?? 0));
    if (e.type === 'runner' && e.kind === 'SB') add(whoKey(e.moves?.[0]), { stolenBases: 1 });
  }
  for (const r of s.g.runs) add(r.runnerId ?? (r.runnerName ? `name:${r.runnerName}` : undefined), { runs: 1 });
  return out;
}

/** The batting box (the shared one — the match Summary tab reads it too). */
export function baseballBox(state: BaseballState, ctx: BaseballBoxContext = {}): MatchBoxSource {
  const s = named(state, ctx);
  return {
    periods: [],
    emptyText: 'No batters yet.',
    notes: () => battingNotes(s, ctx),
    data: () => {
      const lines = battingLines(s);
      const side = (sd: Side): BoxSideInput => {
        const roster = sd === 'home' ? ctx.homeRoster : ctx.awayRoster;
        const rows = new Map<string, BoxRowInput>();
        const row = (id: string | undefined, name: string | undefined, starter: boolean) => {
          const k = id ?? `name:${name}`;
          if (rows.has(k)) return;
          const t = lines.get(k) ?? {};
          const stats: Record<string, number> = {};
          for (const key of BAT_KEYS) if (!OCCASIONAL.has(key) || (t[key] ?? 0) > 0) stats[key] = t[key] ?? 0;
          rows.set(k, { name: nameIn(roster, id, name), ...(id ? { playerId: id } : {}), stats, ...(starter ? { starter: true } : {}) });
        };
        const start = s.lineup[sd]?.length ? s.lineup[sd]! : s.g.order[sd];
        start.forEach((e) => row(e.id, e.name, true));
        for (const e of s.events) {
          if (e.side !== sd) continue;
          if (e.type === 'pa' && e.batter) row(e.batter.id, e.batter.name, false);
          if (e.type === 'sub' && e.kind !== 'p' && e.on) row(e.on.id, e.on.name, false);
        }
        for (const e of s.g.order[sd]) row(e.id, e.name, false);
        const f = teamFigures(s, sd);
        return { rows: [...rows.values()], teamStats: { teamErrors: f.errors, leftOnBase: f.lob, teamPitches: teamFigures(s, sd === 'home' ? 'away' : 'home').pitches } };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}

/** The pitching box: one row per pitcher who appeared, in order. */
export function baseballPitchingBox(state: BaseballState, ctx: BaseballBoxContext = {}): MatchBoxSource {
  const s = named(state, ctx);
  return {
    periods: [],
    emptyText: 'No pitchers yet.',
    notes: () => pitchingNotes(s, ctx),
    data: () => {
      const totals = baseballTotals(s);
      // deep wave: pitch by pitch → a P-S (pitches-strikes) column in place of NP
      const strikes = s.cfg.pitches ? new Map(pitcherFigures(s).map((p) => [p.key, p.strikes])) : undefined;
      const side = (sd: Side): BoxSideInput => {
        const roster = sd === 'home' ? ctx.homeRoster : ctx.awayRoster;
        const rows: BoxRowInput[] = [];
        const seen = new Set<string>();
        for (const sp of s.g.spells) {
          if (sp.side !== sd || seen.has(sp.key)) continue;
          seen.add(sp.key);
          const t = sp.id ? totals[sp.id]?.stats ?? {} : {};
          const stats: Record<string, number> = {};
          for (const k of PITCH_KEYS) if (!OCCASIONAL.has(k) || (t[k] ?? 0) > 0) stats[k] = t[k] ?? (k === 'pitches' ? s.g.pitches[sp.key] ?? 0 : 0);
          if (strikes) stats.strikesThrown = strikes.get(sp.key) ?? 0;
          const dec = s.g.decisions;
          const tag = dec?.w === sp.key ? ' (W)' : dec?.l === sp.key ? ' (L)' : dec?.sv === sp.key ? ' (SV)' : '';
          rows.push({ name: `${nameIn(roster, sp.id, sp.name)}${tag}`, ...(sp.id ? { playerId: sp.id } : {}), stats, ...(sp.first ? { starter: true } : {}) });
        }
        // a starter named before the first pitch
        const st = s.starters[sd];
        if (st && !seen.has(whoKey(st) ?? '')) rows.unshift({ name: nameIn(roster, st.id, st.name), ...(st.id ? { playerId: st.id } : {}), stats: Object.fromEntries([...PITCH_KEYS.filter((k) => !OCCASIONAL.has(k)), ...(strikes ? ['strikesThrown'] : [])].map((k) => [k, 0])), starter: true });
        return { rows };
      };
      return { home: side('home'), away: side('away'), ...(strikes ? { untracked: ['pitches'] } : {}) };
    },
  };
}
