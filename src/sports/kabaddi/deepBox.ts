/**
 * Deep wave (volleyball-kabaddi) — the kabaddi player box at PKL match-centre
 * depth: the shared box (boxSources.kabaddiBox — raid / tackle / total
 * points) plus, per half or the match, each raider's raids, successful /
 * empty / unsuccessful raids, touch and bonus points, super raids, do-or-die
 * points, and each defender's successful tackles, super tackles and (when
 * named) times raided out and unsuccessful tackles (round 2) — from the raid
 * replay. An old one-tap match has no
 * counts, so those columns hide (D8). PURE.
 *
 * Drawn through MatchBoxScore's `schema` view, so the sport's own `box`
 * (pinned by the shared tests) is unchanged.
 *
 * IDs-only scoring: rows by player id (an older log's name-only player is
 * matched to a squad player by name, else keyed "~Name"); names are this
 * viewer's (`ctx.nameOf`).
 */
import type { Player } from '../../core/types';
import type { SportStatSchema } from '../statSchema.ts';
import type { BoxRowInput, MatchBoxSource } from '../boxScore.ts';
import { kabaddiBox, type BoxContext } from '../boxSources.ts';
import { withRosters } from './names.ts';
import { kabaddiStats } from './stats.ts';
import type { KabaddiState } from './engine.ts';
import { perRaidByIndex, replayOf } from './engine.ts';
import { kabaddiCountsTracked, kabaddiTouchedTracked, unsuccessfulTacklers } from './totals.ts';

type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export const KABADDI_DEEP_BOX: SportStatSchema<'kabaddi'> = {
  ...kabaddiStats,
  box: [{
    columns: [
      'raidPoints', 'tacklePoints', { key: 'totalPoints', abbr: 'PTS', label: 'Points', sum: ['raidPoints', 'tacklePoints'], emphasis: true },
      'raids', 'successfulRaids', 'emptyRaids', 'raidsOut', 'touchPoints', 'bonusPoints', 'superRaids', 'doOrDiePoints',
      'tackles', 'superTackles', 'touchedOut', 'unsuccessfulTackles',
    ],
  }],
};

const RAIDER_KEYS = ['raids', 'successfulRaids', 'emptyRaids', 'raidsOut', 'touchPoints', 'bonusPoints', 'superRaids', 'doOrDiePoints'] as const;
const DEFENDER_KEYS = ['tackles', 'superTackles'] as const;

/** Per player counts for the scope, from the raid replay. IDs-only scoring:
 *  keyed "side|id" — an older log's name-only player "side|~Name", unless
 *  `resolve` (the squads) finds his id. */
export function kabaddiPlayerCounts(s: KabaddiState, scope: 'all' | number = 'all', resolve?: (side: Side, name: string) => string | undefined): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  if (!s?.raids || !kabaddiCountsTracked(s)) return out;
  const touched = kabaddiTouchedTracked(s);
  const zero = (): Record<string, number> => Object.fromEntries([...RAIDER_KEYS, ...DEFENDER_KEYS, ...(touched ? ['touchedOut', 'unsuccessfulTackles'] : [])].map((k) => [k, 0]));
  const keyOf = (side: Side, id?: string, name?: string) => id || (name ? resolve?.(side, name) ?? `~${name}` : undefined);
  const line = (side: Side, id?: string, name?: string): Record<string, number> => {
    const k = `${side}|${keyOf(side, id, name)}`;
    return out.get(k) ?? out.set(k, zero()).get(k)!;
  };
  const per = perRaidByIndex(replayOf(s));
  s.raids.forEach((r, i) => {
    const b = per[i];
    if (!b || r.hidden || (scope !== 'all' && r.half !== scope)) return;
    if (r.raiderId || r.raider) {
      const l = line(r.side, r.raiderId, r.raider);
      l.raids += 1;
      if (b.raidPts > 0) l.successfulRaids += 1;
      if (b.raidPts === 0 && !b.raiderOut) l.emptyRaids += 1;
      if (b.raiderOut) l.raidsOut += 1;
      l.touchPoints += b.touchPts;
      l.bonusPoints += b.bonusPts;
      if (b.raidPts >= 3) l.superRaids += 1;
      if (b.doOrDie) l.doOrDiePoints += b.raidPts;
    }
    if ((r.tacklerId || r.tackler) && b.raiderOut && r.raiderOut && !b.lineOut && !b.doOrDieFail) {
      const l = line(other(r.side), r.tacklerId, r.tackler);
      l.tackles += 1;
      if (b.superTackle) l.superTackles += 1;
    }
    if (touched) for (const p of (r.touched ?? []).slice(0, b.touchPts)) if (p.id || p.name) line(other(r.side), p.id, p.name).touchedOut += 1;
    // round 2 — named defenders touched by a raider who got back
    if (touched) for (const p of unsuccessfulTacklers(r, b)) if (p.id || p.name) line(other(r.side), p.id, p.name).unsuccessfulTackles += 1;
  });
  return out;
}

const idIn = (name: string, roster: Player[]) => roster.find((p) => p.fullName === name)?.id;

/** An older log's stored names by player id (legacy, read-only): the name a
 *  row falls back to when the viewer's lookup has none. */
function legacyNames(s: KabaddiState): Map<string, string> {
  const out = new Map<string, string>();
  const put = (id?: string, name?: string) => { if (id && name && !out.has(id)) out.set(id, name); };
  for (const r of s.raids ?? []) {
    put(r.raiderId, r.raider);
    put(r.tacklerId, r.tackler);
    for (const p of r.touched ?? []) put(p.id, p.name);
  }
  return out;
}

/** The deep box source: the shared one + the counts per row. */
export function kabaddiDeepBox(s: KabaddiState, ctx: BoxContext = {}): MatchBoxSource {
  const base = kabaddiBox(s, ctx);
  const rosterFor = (sd: Side) => (sd === 'home' ? ctx.homeRoster : ctx.awayRoster) ?? [];
  return {
    ...base,
    data: (scope) => {
      const d = base.data(scope);
      const counts = kabaddiPlayerCounts(s, scope, (sd, name) => idIn(name, rosterFor(sd)));
      if (!counts.size) return d;
      const keys = Object.keys(counts.values().next().value ?? {});
      const legacy = legacyNames(s);
      const side = (sd: Side) => {
        const nm = withRosters(ctx.nameOf, rosterFor(sd));
        const rows: BoxRowInput[] = d[sd].rows.map((r) => ({ ...r, stats: { ...r.stats } }));
        for (const [k, v] of counts) {
          if (!k.startsWith(`${sd}|`)) continue;
          const key = k.slice(sd.length + 1);
          const old = key.startsWith('~') ? key.slice(1) : undefined;
          let r = old != null ? rows.find((x) => !x.playerId && x.name === nm(undefined, old)) : rows.find((x) => x.playerId === key);
          if (!r) {
            r = old != null
              ? { name: nm(undefined, old), stats: { raidPoints: 0, tacklePoints: 0 } }
              : { name: nm(key, legacy.get(key)), playerId: key, stats: { raidPoints: 0, tacklePoints: 0 } };
            rows.push(r);
          }
          Object.assign(r.stats, v);
        }
        for (const r of rows) for (const k of keys) if (typeof r.stats[k] !== 'number') r.stats[k] = 0;
        return { ...d[sd], rows };
      };
      return { ...d, home: side('home'), away: side('away') };
    },
  };
}
