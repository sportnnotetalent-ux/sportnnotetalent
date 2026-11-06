/**
 * Match setup's "Who's playing" (reference-video C3): the starters picked
 * before the match existed become each side's matchday squad right after it is
 * created. For pitch sports the positional lineup is filled too, as the
 * matchday-squad screen does, so the Lineups tab and clean sheets work.
 * Best effort: a failure here never undoes or blocks the match. The squad can
 * still be set from the live match.
 */
import { getLineup, setLineup, setMatchSquad } from './repos';
import { getSport } from '../sports/registry';
import { reconcilePositions } from '../core/lineupPlace';
import type { SportId } from '../core/types';

/** A side picked at setup: its starters, plus the match-day roles (C6). */
export type DraftSide = { starters: string[]; captainId?: string; keeperId?: string };
export type DraftSquads = Partial<Record<'home' | 'away', DraftSide>>;

export async function saveDraftSquads(o: {
  matchId: string;
  sport: SportId;
  playersPerSide: number;
  drafts: DraftSquads;
  nameOf: (id: string) => string | undefined;
}): Promise<boolean> {
  const sides = (['home', 'away'] as const).filter((sd) => (o.drafts[sd]?.starters.length ?? 0) > 0);
  if (!sides.length) return true;
  try {
    for (const sd of sides) {
      const d = o.drafts[sd]!;
      await setMatchSquad(o.matchId, sd, { starters: d.starters, subs: [], captainId: d.captainId, keeperId: d.keeperId });
    }
    const plugin = getSport(o.sport);
    if (plugin.Court) {
      const lineup = await getLineup(o.matchId, o.sport, o.playersPerSide);
      const fresh = plugin.formation?.(o.playersPerSide) ?? [];
      const next = { ...lineup };
      for (const sd of sides) next[sd] = reconcilePositions(o.drafts[sd]!.starters, lineup[sd], fresh, o.nameOf);
      await setLineup(o.matchId, next);
    }
    return true;
  } catch {
    return false;
  }
}
