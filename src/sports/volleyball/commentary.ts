/**
 * Deep wave (volleyball-kabaddi) — volleyball's rally-by-rally commentary,
 * the VNL live-centre way: grouped by set (newest set first), every rally a
 * plain sentence with the running score after it ("Point Italy — kill by
 * Michieletto (set by Giannelli)", 5-3), the elapsed minute when the step was
 * stamped, and broadcast tags (SET POINT, set point saved, 4 in a row). PURE.
 *
 * Derived only from the state — the point log (`events`), the rotation /
 * serve tracker (SD-58: who served), substitutions (SD-71) and the optional
 * detail entries (SD-81 + deep wave: blocked attacker, setter, aced receiver,
 * receptions, digs, attacks kept in play) — so an undo or a timeline
 * correction re-derives it, and an old log reads exactly as it was scored
 * (fewer details, never invented ones).
 *
 * IDs-only scoring (docs/privacy/ids-only-scoring.md): the log names players
 * by id; `names.nameOf` gives this viewer's name (an older log's stored name
 * is the fallback, and without a lookup the text reads as before).
 */
import type { LiveEvent } from '../liveEvents';
import type { VolleyballState } from './engine.ts';
import { errorTypeLabel } from './engine.ts';
import { trackCourt, type RallyServe } from './rotation.ts';
import { RECEPTION_GRADES, type VbDetailEntry } from './detail.ts';
import { fromPen, sanctionDef, type VbSanction } from './sanctions.ts';
import { durations, fmtDuration } from '../conduct.ts';
import { elapsedStamp, type FeedEntry, type FeedGroup, type Side } from '../netraid/feed.ts';
import { whoName, withRosters, type NameOf, type RosterLike } from '../racketNames.ts';

const SCORED = new Set(['point', 'attack', 'block', 'ace', 'opperror', 'serveerror']);
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** What an "Opp. fault" type reads as in a sentence. */
const FAULT_TEXT: Record<string, string> = {
  net: 'net touch', foot: 'foot fault', rotation: 'rotation fault', hits: 'double contact / four hits', attackout: 'attack out', blockout: 'block fault',
};

export interface VbNames {
  home: string;
  away: string;
  /** IDs-only scoring: a player's name for this viewer by id */
  nameOf?: NameOf;
  /** the squads (names by id when no `nameOf` is given) */
  homeRoster?: RosterLike[];
  awayRoster?: RosterLike[];
}

/** The sentence for one scored rally (pure, unit-tested). */
export function rallySentence(e: LiveEvent, names: VbNames, ctx: { server?: string; blocked?: string; setter?: string; aced?: string } = {}): string {
  const side = e.side as Side;
  const T = names[side];
  const O = names[other(side)];
  const nm = withRosters(names.nameOf, names.homeRoster, names.awayRoster);
  const P = whoName(nm, e.playerId, e.playerName);
  if (e.pen) {
    const x: VbSanction = fromPen(e.pen, e.set ?? 1);
    const what = (sanctionDef(x.level)?.label ?? 'Penalty').toLowerCase();
    const who = whoName(nm, x.playerId, x.playerName);
    return `Point ${T} — ${what} against ${names[x.by]}${who ? ` (${who})` : ''}${x.reason ? `: ${x.reason.toLowerCase()}` : ''}`;
  }
  switch (e.kind) {
    case 'attack':
      return `Point ${T} — ${P ? `kill by ${P}` : 'attack kill'}${ctx.setter ? ` (set by ${ctx.setter})` : ''}`;
    case 'block':
      return `Point ${T} — ${P ? `block by ${P}` : 'block point'}${ctx.blocked ? `, stuffing ${ctx.blocked}` : ''}`;
    case 'ace': {
      const who = P ?? ctx.server;
      return `Point ${T} — ace${who ? ` by ${who}` : ''}${ctx.aced ? `; ${ctx.aced} couldn't receive it` : ''}`;
    }
    case 'opperror': {
      const t = e.oe?.type ? FAULT_TEXT[e.oe.type] ?? errorTypeLabel(e.oe.type)?.toLowerCase() : undefined;
      const by = whoName(nm, e.oe?.playerId, e.oe?.playerName);
      if (t) return `Point ${T} — ${t} by ${by ?? O}${by ? ` (${O})` : ''}`;
      return `Point ${T} — ${O} error${by ? ` by ${by}` : ''}`;
    }
    case 'serveerror': {
      const by = whoName(nm, e.oe?.playerId, e.oe?.playerName) ?? ctx.server;
      return `Point ${T} — service error by ${by ? `${by} (${O})` : O}`;
    }
    default:
      return `Point ${T}${P ? ` — ${P}` : ''}`;
  }
}

/** Who has set / match point at (h, a) in set `n` — one rally from the set. */
function pressure(s: VolleyballState, n: number, h: number, a: number, won: { home: number; away: number }): { side: Side; match: boolean } | null {
  const decider = s.setsToWin > 1 && n === s.setsToWin * 2 - 1;
  const t = decider ? s.deciderTarget : s.target;
  const m = (s.winByTwo ?? true) ? 2 : 1;
  for (const X of ['home', 'away'] as const) {
    const x = (X === 'home' ? h : a) + 1, y = X === 'home' ? a : h;
    if (x >= t && x - y >= m) return { side: X, match: won[X] + 1 >= s.setsToWin };
  }
  return null;
}

const RALLY_KINDS: Record<string, (x: VbDetailEntry, who: string) => string> = {
  reception: (x, who) => `reception ${RECEPTION_GRADES.find((g) => g.key === x.q)?.sign ?? ''} ${who}`.replace(/\s+/g, ' '),
  dig: (_x, who) => `dig ${who}`,
  inplay: (_x, who) => `attack kept in play ${who}`,
};

/**
 * The commentary, newest set first; inside a set, newest rally first. Each
 * scored rally: the sentence, the score after it, the server (when the
 * rotation is known), the rally detail (receptions, digs, attacks kept in
 * play) and its tags. Timeouts, sanctions and substitutions sit where they
 * happened; the set result heads the set.
 */
export function volleyballCommentary(s: VolleyballState, names: VbNames): FeedGroup[] {
  if (!s || !Array.isArray(s.events)) return [];
  const ev = s.events;
  // IDs-only scoring: every player by id (an older log's stored name as the fallback)
  const nm = withRosters(names.nameOf, names.homeRoster, names.awayRoster);
  const who = (p?: { id?: string; playerId?: string; name?: string; playerName?: string }) =>
    (p ? whoName(nm, p.playerId ?? p.id, p.playerName ?? p.name) : undefined) ?? '';
  const t0 = ev.reduce<number | null>((m, e) => (typeof e.at === 'number' ? (m == null ? e.at : Math.min(m, e.at)) : m), null);
  const rallies: RallyServe[] = trackCourt(s).rallies;
  const vd = s.vd ?? [];
  const subs = s.subs ?? [];
  const dur = durations(ev).periods;
  const groups = new Map<number, FeedEntry[]>();
  const add = (set: number, e: FeedEntry) => (groups.get(set) ?? groups.set(set, []).get(set)!).push(e);
  const result = new Map<number, { side: Side; score: string }>();
  const won = { home: 0, away: 0 };
  const cnt = new Map<number, number>();
  const score = new Map<number, { h: number; a: number }>();
  const run = { side: null as Side | null, n: 0, set: 0 };
  const subDone = new Set<number>();
  let ri = 0;
  let cur = 1;

  const flushSubs = (set: number, upTo: number) => {
    subs.forEach((x, i) => {
      if (subDone.has(i) || x.set !== set || x.at > upTo) return;
      subDone.add(i);
      const sc = score.get(set) ?? { h: 0, a: 0 };
      const how = x.kind === 'libero' ? 'Libero replacement' : x.kind === 'exceptional' ? 'Exceptional substitution' : 'Substitution';
      add(set, { id: `sub${i}`, icon: '🔁', side: x.side, score: `${sc.h}-${sc.a}`, text: `${how} ${names[x.side]}: ${who(x.on)} in for ${who(x.off)}` });
    });
  };

  for (const e of ev) {
    const set = typeof e.set === 'number' && e.set > 0 ? e.set : cur;
    if (SCORED.has(e.kind ?? '') && (e.side === 'home' || e.side === 'away')) {
      cur = set;
      const n = (cnt.get(set) ?? 0) + 1;
      cnt.set(set, n);
      flushSubs(set, n - 1);
      const sc = score.get(set) ?? { h: 0, a: 0 };
      const before = pressure(s, set, sc.h, sc.a, won);
      const next = { h: sc.h + (e.side === 'home' ? 1 : 0), a: sc.a + (e.side === 'away' ? 1 : 0) };
      score.set(set, next);
      if (run.set !== set || run.side !== e.side) { run.side = e.side; run.n = 0; run.set = set; }
      run.n += 1;
      const r = rallies[ri++];
      const server = r?.serverId || r?.serverName ? whoName(nm, r.serverId, r.serverName) : undefined;
      const of = (kind: string, at: number) => vd.find((x) => x.kind === kind && x.set === set && x.at === at);
      const named = (x?: VbDetailEntry) => (x ? who(x) || undefined : undefined);
      const blocked = e.kind === 'block' ? named(of('blocked', n)) : undefined;
      const setter = e.kind === 'attack' ? named(of('assist', n)) : undefined;
      const aced = e.kind === 'ace' ? named(of('aced', n)) : undefined;
      const text = rallySentence(e, { ...names, nameOf: nm }, { server, blocked, setter, aced });
      const rally = vd.filter((x) => x.set === set && x.at === n - 1 && RALLY_KINDS[x.kind]).map((x) => RALLY_KINDS[x.kind](x, who(x)));
      const detail = [server && !e.pen ? `🏐 ${server} serving` : null, rally.length ? rally.join(' · ') : null].filter(Boolean).join(' · ');
      const tags: string[] = [];
      const after = pressure(s, set, next.h, next.a, won);
      const setEnds = (e.side === 'home' ? next.h : next.a) >= ((s.setsToWin > 1 && set === s.setsToWin * 2 - 1) ? s.deciderTarget : s.target)
        && Math.abs(next.h - next.a) >= ((s.winByTwo ?? true) ? 2 : 1);
      if (before && before.side !== e.side) tags.push(before.match ? 'Match point saved' : 'Set point saved');
      if (!setEnds && after) tags.push(`${after.match ? 'MATCH' : 'SET'} POINT ${names[after.side].toUpperCase()}`);
      if (run.n >= 3) tags.push(`${run.n} in a row`);
      const big = e.kind === 'ace' || e.kind === 'block' || !!e.pen || tags.length > 0;
      add(set, {
        id: `p${e.id}`, stamp: elapsedStamp(e.at, t0), icon: e.icon, side: e.side, score: `${next.h}-${next.a}`, text,
        ...(detail ? { detail } : {}), ...(tags.length ? { tags } : {}), ...(big ? { key: true } : {}),
      });
      continue;
    }
    if (e.kind === 'timeout' && (e.side === 'home' || e.side === 'away')) {
      const sc = score.get(set) ?? { h: 0, a: 0 };
      add(set, { id: `t${e.id}`, stamp: elapsedStamp(e.at, t0), icon: '⏱️', side: e.side, score: `${sc.h}-${sc.a}`, text: `Timeout ${names[e.side]}` });
      continue;
    }
    if (e.kind === 'conduct' && e.vs) {
      const sc = score.get(set) ?? { h: 0, a: 0 };
      const d = sanctionDef(e.vs.level);
      add(set, {
        id: `c${e.id}`, stamp: elapsedStamp(e.at, t0), icon: e.icon, side: e.vs.by, score: `${sc.h}-${sc.a}`, key: true,
        text: `${d?.label ?? 'Sanction'} — ${who(e.vs) ? `${who(e.vs)} (${names[e.vs.by]})` : names[e.vs.by]}${e.vs.reason ? `: ${e.vs.reason.toLowerCase()}` : ''}`,
      });
      continue;
    }
    if (e.stamp === 'Set' && (e.side === 'home' || e.side === 'away')) {
      // "Set N won" — the set result (the points live on the line score)
      const n = Number(/(\d+)/.exec(e.label)?.[1]) || set;
      flushSubs(n, Infinity);
      won[e.side] += 1;
      result.set(n, { side: e.side, score: e.detail ?? '' });
      add(n, { id: `s${e.id}`, icon: '🎉', side: e.side, score: e.detail, key: true, text: `Set ${n} to ${names[e.side]}, ${e.detail ?? ''}`.trim() });
      cur = n + 1;
      continue;
    }
    if (e.stamp === 'Match' && (e.side === 'home' || e.side === 'away')) {
      add(cur - 1 >= 1 ? cur - 1 : 1, { id: `m${e.id}`, icon: '🏆', side: e.side, key: true, text: `${names[e.side]} win the match ${e.detail ?? ''}`.trim() });
    }
  }
  // subs after the last rally of a set (or before the first rally of the set in play)
  for (const x of subs) if (!groups.has(x.set)) groups.set(x.set, []);
  for (const set of groups.keys()) flushSubs(set, Infinity);

  const out: FeedGroup[] = [];
  for (const set of [...groups.keys()].sort((a, b) => b - a)) {
    const r = result.get(set);
    const d = fmtDuration(dur[set - 1]);
    const sc = score.get(set);
    const sub = r ? `${names[r.side]} won ${r.score}` : sc ? `In play · ${sc.h}-${sc.a}` : undefined;
    out.push({ id: `set${set}`, title: `Set ${set}`, sub: [sub, d].filter(Boolean).join(' · ') || undefined, entries: [...groups.get(set)!].reverse() });
  }
  return out;
}
