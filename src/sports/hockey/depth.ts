/**
 * Deep wave — hockey (FIH) match-centre depth. PURE.
 *
 *  - possession % on the GAME clock (only when the scorer tracked it): the
 *    time between "ball: X" taps, so a stopped clock stops it too; per
 *    quarter as well as the whole match;
 *  - team figures the FIH match statistics publish beyond the SD-101 panel:
 *    shots wide / blocked (new logs only), team save % (saves ÷ shots on goal
 *    faced), minutes suspended, video referrals upheld / lost;
 *  - the shoot-out keeper's saves (`soSaves`, statTotals only — a derived key,
 *    never a live increment), from attempts that name the keeper.
 * A figure the match didn't track is left off (the panel lists it "not
 * tracked"), never written as 0.
 */
import { putIf, pct } from '../invasion/centre.ts';
import { matchSec, periodOffset, type HockeyState, type Side } from './engine.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Did the match track possession — any "ball" tap? NZI7 (no false zeros):
 *  the toggle alone only offers the bar. */
export const possessionTracked = (s: Pick<HockeyState, 'track' | 'poss'>): boolean => !!s.poss?.length;
/** Did the match split misses into wide / blocked (new logs)? */
export const missTracked = (s: Pick<HockeyState, 'events'>): boolean => s.events.some((e) => e.type === 'shot' && !!e.miss);
/** Did the match track video referrals — any logged? NZI7: switched on with
 *  none logged is no "Referrals won 0 v 0". */
export const referralsTracked = (s: Pick<HockeyState, 'track' | 'events'>): boolean => s.events.some((e) => e.type === 'referral');

/** Seconds of possession per side over [from, to) on the game clock. */
export function possessionSecs(s: HockeyState, from: number, to: number): { home: number; away: number } {
  const out = { home: 0, away: 0 };
  // in game-clock order (a mark logged late still sits at its own second)
  const marks = [...(s.poss ?? [])].sort((a, b) => a.sec - b.sec);
  for (let i = 0; i < marks.length; i++) {
    const a = Math.max(from, marks[i].sec);
    const b = Math.min(to, i + 1 < marks.length ? marks[i + 1].sec : to);
    if (b > a) out[marks[i].side] += b - a;
  }
  return out;
}

/** Possession % per side for a scope (whole match or one period) at `now`;
 *  undefined when not tracked or no time has run with a side on the ball. */
export function hockeyPossession(s: HockeyState, scope: 'all' | number = 'all', now = 0): { home: number; away: number } | undefined {
  if (!possessionTracked(s) || !s.poss?.length) return undefined;
  // the clock, or the latest moment logged when it wasn't run (as the field
  // tracker reads a match scored without the clock)
  const end = Math.max(matchSec(s, now), ...s.events.map((e) => e.sec), ...s.poss.map((m) => m.sec));
  const from = scope === 'all' ? 0 : periodOffset(s, scope);
  const len = scope === 'all' ? end : Math.min(end, periodOffset(s, scope) + (s.played[scope - 1] ?? s.periodMinutes * 60));
  const secs = possessionSecs(s, from, len);
  const total = secs.home + secs.away;
  if (total <= 0) return undefined;
  const home = Math.round((secs.home / total) * 100);
  return { home, away: 100 - home };
}

/** Team figures for the match centre beyond `teamFigures` (period scope). */
export function hockeyDepthFigures(s: HockeyState, side: Side, scope: 'all' | number = 'all', now = 0): Record<string, number> {
  const inScope = (p: number) => scope === 'all' || p === scope;
  const out: Record<string, number> = {};
  let saves = 0, against = 0, wide = 0, blocked = 0, susp = 0, refWon = 0, refLost = 0;
  for (const e of s.events) {
    if (!inScope(e.period)) continue;
    if (e.side === side) {
      if (e.type === 'save') saves++;
      else if (e.type === 'shot' && e.miss === 'wide') wide++;
      else if (e.type === 'shot' && e.miss === 'blocked') blocked++;
      else if (e.type === 'card' && e.minutes) susp += e.minutes;
      else if (e.type === 'referral') { if (e.upheld) refWon++; else refLost++; }
    } else if (e.type === 'goal') against++;
  }
  // team save %: the keeper's saves ÷ shots on goal faced (saves + goals let in)
  putIf(out, 'savePct', pct(saves, saves + against));
  out.suspensionMinutes = susp;
  if (missTracked(s)) { out.shotsWide = wide; out.blockedShots = blocked; }
  if (referralsTracked(s)) { out.referralsWon = refWon; out.referralsLost = refLost; }
  const poss = hockeyPossession(s, scope, now);
  if (poss) out.possession = poss[side];
  return out;
}

/** The depth keys the match didn't track (listed "not tracked" on the panel). */
export function hockeyUntracked(s: HockeyState): string[] {
  return [
    // NZI7: the note names an option that is off (on with no tap: no row)
    ...(s.track?.possession === true || possessionTracked(s) ? [] : ['possession']),
    ...(missTracked(s) ? [] : ['shotsWide', 'blockedShots']),
  ];
}

/** Shoot-out keepers' saves per keeper id (derived; only attempts that name
 *  the keeper — a keeper facing a kick gets the key, 0 included). */
export function hockeyShootoutKeepers(s: HockeyState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  for (const side of ['home', 'away'] as const) {
    for (const k of s.shootout?.[side] ?? []) {
      if (!k.keeperId) continue;
      const l = (out[k.keeperId] ??= { side: other(side), stats: {} });
      l.stats.soSaves = (l.stats.soSaves ?? 0) + (k.outcome === 'saved' ? 1 : 0);
    }
  }
  return out;
}
