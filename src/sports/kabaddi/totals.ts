/**
 * SD-33 (KB-02) + SD-41 (KB-03) — kabaddi figures derived from the raid replay.
 * PURE (no React Native): node tests load it.
 *
 *  • `kabaddiTotals` — the ABSOLUTE per-player stat line of a match (the
 *    `statTotals` contract, src/sports/types.ts). Raid / tackle points are the
 *    live keys (owned, so the sync heals pre-SD-03 lines that credited +1 per
 *    raid); the rest are derived counts nobody credits live:
 *      raids, successfulRaids (scored ≥ 1), emptyRaids (0 and not out),
 *      raidsOut (the raider ended up out: tackled or a failed do-or-die),
 *      touchPoints, bonusPoints, superRaids (3+ raid points),
 *      doOrDieRaids, doOrDiePoints, tackles (raiders the player tackled),
 *      superTackles; with "Defenders touched" tracked, touchedOut and
 *      (round 2) unsuccessfulTackles (keyed — `unsuccessfulTacklers`).
 *    A failed do-or-die (no tackle made) gives the defence its point but
 *    credits no defender.
 *  • `kabaddiMatchCentre` — the PKL match-centre figures per team (points
 *    split, raid / tackle strike rates, super raids / tackles, do-or-die,
 *    all-outs), for the comparison panel.
 *
 * Coverage (D8): a match with old one-tap RAID / TACKLE points (no raid
 * outcome logged) has no raid counts — the count keys are left out for every
 * player (not 0) and the panel marks them untracked. A credited raider or
 * tackler we can't name an id for (an old snapshot) drops the raid / tackle
 * point keys from the totals, so their live lines are left as they are.
 *
 * IDs-only scoring: every player is counted by the id the log keeps; only an
 * older log's name-only player is matched by name to `ctx.players` (the
 * viewer's names — which fails for someone outside the circle, so those keys
 * are left to the live lines, as above).
 */
import type { StatTotalsContext, StatTotalsEntry } from '../types';
import { YELLOW_MINUTES, type RaidBreakdown, type Side } from './rules.ts';
import { isShootoutEvent, replayOf, perRaidByIndex, extrasOf, clockNow, type KabaddiState, type RaidEntry, type TouchedRef } from './engine.ts';
import { legacyNameOf, type NameOf } from '../../core/playerNames.ts';
import { trackField, timeLeft, suspensionEvent, FIELD_RULES, type FieldEvent, type FieldLog, type FieldResult } from '../onField.ts';

/** Keys credited live (attribution): raider / tackler points. */
export const KABADDI_LIVE_KEYS = ['raidPoints', 'tacklePoints'] as const;
/** Derived per-player count keys (never credited live). */
export const KABADDI_COUNT_KEYS = [
  'raids', 'successfulRaids', 'emptyRaids', 'raidsOut', 'touchPoints', 'bonusPoints',
  'superRaids', 'doOrDieRaids', 'doOrDiePoints', 'tackles', 'superTackles',
] as const;
/** SD-59 / SD-72 — discipline keys (keyed coverage: written only for a match
 *  that tracks them — a format with the SD-83 key, or any card / technical
 *  point logged). */
export const KABADDI_DISCIPLINE_KEYS = ['greenCards', 'yellowCards', 'redCards', 'techPointsConceded'] as const;

const other = (x: Side): Side => (x === 'home' ? 'away' : 'home');
const raidsOf = (s: KabaddiState): RaidEntry[] => s.raids ?? [];

/** Old one-tap RAID / TACKLE lines (not a guided raid, not a shootout raid). */
const plainLines = (s: KabaddiState) =>
  (s.events ?? []).filter((e) => e.group == null && (e.kind === 'raid' || e.kind === 'tackle') && !isShootoutEvent(e));

/** Each in-play raid with what the replay scored for it. */
function replayed(s: KabaddiState): { raid: RaidEntry; b: RaidBreakdown }[] {
  const raids = raidsOf(s);
  const per = perRaidByIndex(replayOf(s));
  return raids.flatMap((raid, i) => (per[i] ? [{ raid, b: per[i] }] : []));
}

/** Whether the match has only guided raids (the count keys are known). */
export const kabaddiCountsTracked = (s: KabaddiState): boolean => plainLines(s).length === 0;

/** SD-72: cards / technical points conceded are tracked on this match. */
export const kabaddiDisciplineTracked = (s: KabaddiState): boolean => s.caughtTouches != null || extrasOf(s).length > 0;

/** Deep wave — defenders touched are named on this match ("Defenders touched"
 *  tracking on, or a raid that named one): `touchedOut` is written then. */
export const kabaddiTouchedTracked = (s: KabaddiState): boolean => !!s?.track?.touched || raidsOf(s).some((r) => !!r.touched?.length);
/** Deep wave — a defender's times put out by a raider's touch (keyed). */
export const KABADDI_TOUCHED_KEY = 'touchedOut';
/** Round 2 — a defender's unsuccessful tackles (keyed, with `touchedOut`). */
export const KABADDI_UNSUCCESSFUL_TACKLE_KEY = 'unsuccessfulTackles';

/**
 * Round 2 (founder) — the defenders charged an UNSUCCESSFUL TACKLE on one
 * raid, from the "Defenders touched" capture:
 *   - the raider got back: not tackled, not stepped out (line-out), not a
 *     failed do-or-die (`b.raiderOut` false);
 *   - and his touch points counted (`b.touchPts` > 0);
 *   - then each defender the scorer NAMED under "Who was touched?" (the first
 *     `touchPts` names — the touches that scored) is charged one.
 * A raid that named nobody charges nobody; one that named some of its touches
 * charges only those named (never a guess). A raider caught after touching
 * (where the format still counts his touches) was tackled successfully — the
 * touched defenders are out (`touchedOut`) but not charged here. Defenders
 * who stepped out without a touch (line-outs) aren't touched, and a defender
 * who went for the raider without being touched can't be seen from this
 * capture — neither is counted.
 */
export function unsuccessfulTacklers(r: Pick<RaidEntry, 'touched'>, b: Pick<RaidBreakdown, 'raiderOut' | 'touchPts'>): TouchedRef[] {
  if (b.raiderOut || !(b.touchPts > 0)) return [];
  return (r.touched ?? []).slice(0, b.touchPts);
}

export function kabaddiTotals(s: KabaddiState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  // legacy only: an older log's name-only player, matched by name
  const byName = (side: Side, name?: string) =>
    name ? ctx?.players?.[side].find((p) => p.name && p.name.trim().toLowerCase() === name.trim().toLowerCase())?.id : undefined;
  const idOf = (side: Side, id?: string, name?: string) => id ?? byName(side, name);
  const counts = kabaddiCountsTracked(s);
  const disc = kabaddiDisciplineTracked(s);
  const touched = counts && kabaddiTouchedTracked(s);
  const out: Record<string, StatTotalsEntry> = {};
  let unknown = false;
  let touchedUnknown = false;
  let unsuccessfulUnknown = false;
  const entry = (id: string, side: Side) => {
    if (!out[id]) {
      const stats: Record<string, number> = { raidPoints: 0, tacklePoints: 0 };
      if (counts) for (const k of KABADDI_COUNT_KEYS) stats[k] = 0;
      if (disc) for (const k of KABADDI_DISCIPLINE_KEYS) stats[k] = 0;
      if (touched) { stats[KABADDI_TOUCHED_KEY] = 0; stats[KABADDI_UNSUCCESSFUL_TACKLE_KEY] = 0; }
      out[id] = { side, stats };
    }
    return out[id].stats;
  };
  const add = (st: Record<string, number>, k: string, by: number) => { if (k in st) st[k] += by; };

  for (const { raid: r, b } of replayed(s)) {
    const raider = idOf(r.side, r.raiderId, r.raider);
    if (raider) {
      const st = entry(raider, r.side);
      st.raidPoints += b.raidPts;
      add(st, 'raids', 1);
      add(st, 'successfulRaids', b.raidPts > 0 ? 1 : 0);
      add(st, 'emptyRaids', b.raidPts === 0 && !b.raiderOut ? 1 : 0);
      add(st, 'raidsOut', b.raiderOut ? 1 : 0);
      add(st, 'touchPoints', b.touchPts);
      add(st, 'bonusPoints', b.bonusPts);
      add(st, 'superRaids', b.raidPts >= 3 ? 1 : 0);
      add(st, 'doOrDieRaids', b.doOrDie ? 1 : 0);
      add(st, 'doOrDiePoints', b.doOrDie ? b.raidPts : 0);
    } else if (r.raider && b.raidPts) unknown = true;
    // the tackler: only a real tackle (a failed do-or-die credits no defender)
    if (b.raiderOut && r.raiderOut && !b.lineOut && (r.tacklerId || r.tackler)) {
      const d = other(r.side);
      const tackler = idOf(d, r.tacklerId, r.tackler);
      if (tackler) {
        const st = entry(tackler, d);
        st.tacklePoints += b.tacklePts;
        add(st, 'tackles', 1);
        add(st, 'superTackles', b.superTackle ? 1 : 0);
      } else unknown = true;
    }
    // deep wave: the defenders the raider touched out, by name (only the
    // touches that counted — a caught raider's void touches send nobody out)
    if (touched && b.touchPts > 0) {
      const d = other(r.side);
      for (const p of (r.touched ?? []).slice(0, b.touchPts)) {
        const id = idOf(d, p.id, p.name);
        if (id) add(entry(id, d), KABADDI_TOUCHED_KEY, 1);
        else touchedUnknown = true;
      }
    }
    // round 2: named defenders touched by a raider who got back
    if (touched) {
      const d = other(r.side);
      for (const p of unsuccessfulTacklers(r, b)) {
        const id = idOf(d, p.id, p.name);
        if (id) add(entry(id, d), KABADDI_UNSUCCESSFUL_TACKLE_KEY, 1);
        else unsuccessfulUnknown = true;
      }
    }
  }
  // SD-59 / SD-72: cards and technical points conceded (the player at fault
  // is on the other side from the point)
  for (const e of extrasOf(s)) {
    if (e.official || (!e.playerId && !e.playerName)) continue;
    const side = e.x === 'tech' ? other(e.side) : e.side;
    const id = idOf(side, e.playerId, e.playerName);
    if (!id) continue;
    const st = entry(id, side);
    if (e.x === 'card' && e.card) add(st, `${e.card}Cards`, 1);
    else if (e.x === 'tech') add(st, 'techPointsConceded', Math.max(1, e.n ?? 1));
  }
  // Old one-tap points: the line's points to the player on it.
  for (const e of plainLines(s)) {
    if (!e.side || !e.points || (!e.playerId && !e.playerName)) continue;
    const id = idOf(e.side, e.playerId, e.playerName);
    if (!id) { unknown = true; continue; }
    entry(id, e.side)[e.kind === 'raid' ? 'raidPoints' : 'tacklePoints'] += e.points;
  }
  if (unknown) for (const t of Object.values(out)) { delete t.stats.raidPoints; delete t.stats.tacklePoints; }
  // a touched name that can't be matched to a player: the key is left out
  // for everyone (never a partial count — the sync would zero real figures)
  if (touchedUnknown) for (const t of Object.values(out)) delete t.stats[KABADDI_TOUCHED_KEY];
  if (unsuccessfulUnknown) for (const t of Object.values(out)) delete t.stats[KABADDI_UNSUCCESSFUL_TACKLE_KEY];
  return out;
}

/* ------------------------------ match centre (SD-41) ------------------------------ */

/** One team's PKL match-centre figures. Rates are 0–100, absent with no
 *  denominator. */
export interface KabaddiTeamCentre {
  raidPoints: number;
  tacklePoints: number;
  allOutPoints: number;
  /** points not from a raid, a tackle or an all-out: a failed do-or-die raid
   *  (the defence's point, no tackle made) and any old score offset */
  extraPoints: number;
  raids: number;
  successfulRaids: number;
  emptyRaids: number;
  raidsOut: number;
  superRaids: number;
  /** successful tackles (the raider tackled out) */
  tackles: number;
  /** tackles + the opponent's raids that scored a touch and got back */
  tackleAttempts: number;
  superTackles: number;
  doOrDieRaids: number;
  /** do-or-die raids that scored */
  doOrDieWon: number;
  /** all-outs inflicted / conceded */
  allOuts: number;
  allOutsConceded: number;
  raidStrikeRate?: number;
  tackleStrikeRate?: number;
  doOrDieRate?: number;
}

export interface KabaddiMatchCentre {
  home: KabaddiTeamCentre;
  away: KabaddiTeamCentre;
  /** false when old one-tap points make the raid / tackle counts unknown */
  countsTracked: boolean;
}

const zero = (): KabaddiTeamCentre => ({
  raidPoints: 0, tacklePoints: 0, allOutPoints: 0, extraPoints: 0, raids: 0, successfulRaids: 0, emptyRaids: 0, raidsOut: 0,
  superRaids: 0, tackles: 0, tackleAttempts: 0, superTackles: 0, doOrDieRaids: 0, doOrDieWon: 0, allOuts: 0, allOutsConceded: 0,
});
const pct = (n: number, d: number) => (d > 0 ? (100 * n) / d : undefined);

/** The PKL match centre for the whole match (`'all'`) or one half. Points come
 *  from the timeline (they equal the scoreboard's half cells); counts from the
 *  raid replay. Shootout raids are not regulation and stay out. */
export function kabaddiMatchCentre(s: KabaddiState, scope: 'all' | number = 'all'): KabaddiMatchCentre {
  const t = { home: zero(), away: zero() };
  const inScope = (half?: number) => scope === 'all' || half === scope;
  const all = replayed(s);
  const byEid = new Map(all.filter((x) => x.raid.eid != null).map((x) => [x.raid.eid!, x.b]));
  for (const e of s.events ?? []) {
    if (!e.side || !inScope(e.half) || isShootoutEvent(e)) continue;
    const p = e.points ?? 0;
    if (e.kind === 'raid') t[e.side].raidPoints += p;
    // SD-59: technical points and line-outs are extras
    else if (e.kind === 'tech' || e.kind === 'lineout') t[e.side].extraPoints += p;
    else if (e.kind === 'allout') t[e.side].allOutPoints += p;
    else if (e.kind === 'tackle') {
      const b = e.group != null ? byEid.get(e.group) : undefined;
      if (b?.doOrDieFail) t[e.side].extraPoints += p;
      else t[e.side].tacklePoints += p;
    }
  }
  for (const { raid: r, b } of all) {
    if (r.hidden || !inScope(r.half)) continue;
    const a = t[r.side], d = t[other(r.side)];
    a.raids += 1;
    if (b.raidPts > 0) a.successfulRaids += 1;
    if (b.raidPts === 0 && !b.raiderOut) a.emptyRaids += 1;
    if (b.raiderOut) a.raidsOut += 1;
    if (b.raidPts >= 3) a.superRaids += 1;
    if (b.doOrDie) { a.doOrDieRaids += 1; if (b.raidPts > 0) a.doOrDieWon += 1; }
    if (b.raiderOut && !b.doOrDieFail && !b.lineOut) {
      d.tackles += 1;
      d.tackleAttempts += 1;
      if (b.superTackle) d.superTackles += 1;
    } else if (!b.raiderOut && b.touchPts > 0) d.tackleAttempts += 1;
    for (const side of b.allOuts) { t[side].allOuts += 1; t[other(side)].allOutsConceded += 1; }
  }
  const countsTracked = kabaddiCountsTracked(s);
  for (const side of ['home', 'away'] as Side[]) {
    const x = t[side];
    if (scope === 'all') {
      // anything the timeline doesn't explain (an old remove's offset)
      const rest = (s[side] ?? 0) - (x.raidPoints + x.tacklePoints + x.allOutPoints + x.extraPoints);
      if (rest > 0) x.extraPoints += rest;
    }
    if (countsTracked) {
      x.raidStrikeRate = pct(x.successfulRaids, x.raids);
      x.tackleStrikeRate = pct(x.tackles, x.tackleAttempts);
      x.doOrDieRate = pct(x.doOrDieWon, x.doOrDieRaids);
    }
  }
  return { ...t, countsTracked };
}

/* ------------------------- on the mat (SD-72 cards) ------------------------- */

/**
 * SD-72 — the on-field tracker's log for kabaddi cards (SD-29, onField.ts):
 * a yellow = a 2-minute `suspend` from when it actually started (a player
 * carded while out serves it from his revival — the raid replay decides
 * when), a red = `off` for the rest of the match (no substitute). Kabaddi has
 * no line-up stamp, so only the carded players appear; the live banner reads
 * who is suspended and the time left on the match clock.
 */
export function kabaddiFieldLog(s: KabaddiState, now: number = clockNow(s)): FieldLog {
  const events: FieldEvent[] = [];
  const per = replayOf(s).perExtra;
  extrasOf(s).forEach((e, j) => {
    if (e.x !== 'card' || !e.player || e.official) return;
    const who = { ...(e.playerId ? { id: e.playerId } : null), ...(e.playerName ? { name: e.playerName } : null) };
    const at = (t: number) => ({ t, side: e.side, who });
    if (e.card === 'red') {
      const ev = suspensionEvent({ permanent: true }, at(e.t ?? e.minute ?? 0)); // FIELD_RULES.kabaddi.red: the rest of the match
      if (ev) events.push(ev);
    } else if (e.card === 'yellow' && per[j]?.suspFrom != null) {
      const ev = suspensionEvent({ minutes: FIELD_RULES.kabaddi.yellow.minutes }, at(per[j].suspFrom!));
      if (ev) events.push(ev);
    }
  });
  return { starters: { home: [], away: [] }, events, end: now };
}

export const kabaddiField = (s: KabaddiState, now?: number): FieldResult => trackField(kabaddiFieldLog(s, now));

/** For the live banner: who is serving a yellow and the time left.
 *  IDs-only scoring: the player by id, named for this viewer by `nameOf`
 *  (an older log's stored name without one). */
export function kabaddiSuspended(s: KabaddiState, now: number = clockNow(s), nameOf: NameOf = legacyNameOf): { side: Side; id?: string; name: string; left: string }[] {
  if (s.ended) return [];
  return kabaddiField(s, now).suspended.map((x) => ({ side: x.side, ...(x.id ? { id: x.id } : null), name: nameOf(x.id, x.name), left: timeLeft(x.until, now) }));
}

export { YELLOW_MINUTES };
