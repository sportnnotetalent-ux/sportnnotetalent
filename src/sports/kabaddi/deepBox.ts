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
 */
import type { Player } from '../../core/types';
import type { SportStatSchema } from '../statSchema.ts';
import type { BoxRowInput, MatchBoxSource } from '../boxScore.ts';
import { kabaddiBox, type BoxContext } from '../boxSources.ts';
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

/** Per player ("side|name") counts for the scope, from the raid replay. */
export function kabaddiPlayerCounts(s: KabaddiState, scope: 'all' | number = 'all'): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  if (!s?.raids || !kabaddiCountsTracked(s)) return out;
  const touched = kabaddiTouchedTracked(s);
  const zero = (): Record<string, number> => Object.fromEntries([...RAIDER_KEYS, ...DEFENDER_KEYS, ...(touched ? ['touchedOut', 'unsuccessfulTackles'] : [])].map((k) => [k, 0]));
  const line = (side: Side, name: string) => out.get(`${side}|${name}`) ?? out.set(`${side}|${name}`, zero()).get(`${side}|${name}`)!;
  const per = perRaidByIndex(replayOf(s));
  s.raids.forEach((r, i) => {
    const b = per[i];
    if (!b || r.hidden || (scope !== 'all' && r.half !== scope)) return;
    if (r.raider) {
      const l = line(r.side, r.raider);
      l.raids += 1;
      if (b.raidPts > 0) l.successfulRaids += 1;
      if (b.raidPts === 0 && !b.raiderOut) l.emptyRaids += 1;
      if (b.raiderOut) l.raidsOut += 1;
      l.touchPoints += b.touchPts;
      l.bonusPoints += b.bonusPts;
      if (b.raidPts >= 3) l.superRaids += 1;
      if (b.doOrDie) l.doOrDiePoints += b.raidPts;
    }
    if (r.tackler && b.raiderOut && r.raiderOut && !b.lineOut && !b.doOrDieFail) {
      const l = line(other(r.side), r.tackler);
      l.tackles += 1;
      if (b.superTackle) l.superTackles += 1;
    }
    if (touched) for (const p of (r.touched ?? []).slice(0, b.touchPts)) line(other(r.side), p.name).touchedOut += 1;
    // round 2 — named defenders touched by a raider who got back
    if (touched) for (const p of unsuccessfulTacklers(r, b)) line(other(r.side), p.name).unsuccessfulTackles += 1;
  });
  return out;
}

const idIn = (name: string, roster: Player[]) => roster.find((p) => p.fullName === name)?.id;

/** The deep box source: the shared one + the counts per row. */
export function kabaddiDeepBox(s: KabaddiState, ctx: BoxContext = {}): MatchBoxSource {
  const base = kabaddiBox(s, ctx);
  return {
    ...base,
    data: (scope) => {
      const d = base.data(scope);
      const counts = kabaddiPlayerCounts(s, scope);
      if (!counts.size) return d;
      const keys = Object.keys(counts.values().next().value ?? {});
      const side = (sd: Side) => {
        const roster = (sd === 'home' ? ctx.homeRoster : ctx.awayRoster) ?? [];
        const rows: BoxRowInput[] = d[sd].rows.map((r) => ({ ...r, stats: { ...r.stats } }));
        for (const [k, v] of counts) {
          if (!k.startsWith(`${sd}|`)) continue;
          const name = k.slice(sd.length + 1);
          let r = rows.find((x) => x.name === name);
          if (!r) {
            const id = idIn(name, roster);
            r = { name, ...(id ? { playerId: id } : {}), stats: { raidPoints: 0, tacklePoints: 0 } };
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
