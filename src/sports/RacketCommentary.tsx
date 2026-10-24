/**
 * Deep wave (racket) — the commentary on the Score tab of badminton, table
 * tennis, squash, padel and pickleball (replaces the rally / point log):
 * newest first, one block per game (padel: per game of each set), the game in
 * play on top. Derived from the log by replaying it (racketCommentaryModel.ts), so
 * it updates live and stays right after a correction. Rendered by the shared
 * CommentaryFeed (as tennis).
 */
import React, { useMemo } from 'react';
import { theme } from '../core/theme';
import type { Player } from '../core/types';
import { CommentaryFeed } from './CommentaryFeed';
import { useMask } from '../core/disputeMask';
import { racketCommentary } from './racketCommentaryModel';
import type { DepthSport } from './pointDetail';

export function RacketCommentary({
  sport, icon, state, homeName, awayName, homeRoster = [], awayRoster = [],
  homeColor = theme.colors.home, awayColor = theme.colors.away,
}: {
  sport: DepthSport;
  icon: string;
  state: unknown;
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  homeColor?: string;
  awayColor?: string;
}) {
  const hKey = homeRoster.map((p) => `${p.id}:${p.fullName}`).join('|');
  const aKey = awayRoster.map((p) => `${p.id}:${p.fullName}`).join('|');
  // IDs-only scoring: the log names players by id; this viewer's names
  const { nameOf } = useMask();
  const blocks = useMemo(
    () => racketCommentary(sport, state, {
      homeName, awayName,
      homeRoster: homeRoster.map((p) => ({ id: p.id, name: p.fullName })),
      awayRoster: awayRoster.map((p) => ({ id: p.id, name: p.fullName })),
      nameOf,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sport, state, homeName, awayName, hKey, aKey, nameOf],
  );
  return <CommentaryFeed blocks={blocks} icon={icon} homeColor={homeColor} awayColor={awayColor} emptyText={sport === 'padel' ? 'No points yet.' : 'No rallies yet.'} />;
}
