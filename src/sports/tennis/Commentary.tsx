/**
 * SD-158 — the tennis commentary on the Score tab (replaces the point log):
 * newest first, grouped by game ("Set 4 · Game 2"), the game in play on top.
 * Each block: "<winner> wins the game" + the set's games score, then every
 * point ("Point to <name>", match time, a sentence from the point detail, the
 * score after it with the server's score first), conduct / timeout records
 * where they happened, and "<server> is serving game N" at the bottom.
 * Derived from the log by replaying it (tennis/commentary.ts), so it updates
 * live and stays right after a correction.
 * The pure model is tennis/commentaryModel.ts; the feed itself is the shared
 * racket CommentaryFeed (deep wave: the other racket sports use it too).
 */
import React, { useMemo } from 'react';
import { theme } from '../../core/theme';
import type { Player } from '../../core/types';
import { CommentaryFeed } from '../CommentaryFeed';
import { tennisCommentary } from './commentaryModel';
import type { TennisState } from './engine';

export function TennisCommentary({
  state, homeName, awayName, homeRoster = [], awayRoster = [],
  homeColor = theme.colors.home, awayColor = theme.colors.away,
}: {
  state: TennisState;
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
  homeColor?: string;
  awayColor?: string;
}) {
  const hKey = homeRoster.map((p) => `${p.id}:${p.fullName}`).join('|');
  const aKey = awayRoster.map((p) => `${p.id}:${p.fullName}`).join('|');
  const blocks = useMemo(
    () => tennisCommentary(state, {
      homeName, awayName,
      homeRoster: homeRoster.map((p) => ({ id: p.id, name: p.fullName })),
      awayRoster: awayRoster.map((p) => ({ id: p.id, name: p.fullName })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, homeName, awayName, hKey, aKey],
  );
  return <CommentaryFeed blocks={blocks} icon="🎾" homeColor={homeColor} awayColor={awayColor} />;
}
