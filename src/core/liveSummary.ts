/**
 * The live score link (MVP, founder 2026-10-31): a tiny public summary of a
 * match, saved with every save of it (matches.summary, migration
 * 20261031140000_share_match), so the link preview and the light spectator
 * page show the score without the app. Built from the sport's own score lines
 * (plugin.summary), which are team-level: never a player's name.
 * Tests: tests/live-summary.test.mts.
 */
import type { ScoreSummary } from '../sports/types.ts';

export type LiveSummary = { h: string; a: string; s: string; d?: string };

/** The database refuses a summary longer than this (as JSON text). */
export const SUMMARY_MAX_CHARS = 600;

// eslint-disable-next-line no-control-regex
const clean = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function compactSummary(x: ScoreSummary): LiveSummary {
  const out: LiveSummary = { h: clean(x.homeScore, 40), a: clean(x.awayScore, 40), s: clean(x.statusLine, 80) };
  const d = clean(x.detailLine, 120);
  if (d) out.d = d;
  // Quotes and backslashes double when written as JSON: shorten until it fits.
  while (JSON.stringify(out).length > SUMMARY_MAX_CHARS) {
    if (out.d) out.d = out.d.length > 10 ? out.d.slice(0, Math.floor(out.d.length / 2)) : undefined;
    else { out.s = out.s.slice(0, Math.floor(out.s.length / 2)); out.h = out.h.slice(0, 20); out.a = out.a.slice(0, 20); }
    if (out.d === undefined) delete out.d;
  }
  return out;
}

/** The summary for a sport's state; null when the sport can't describe it
 *  (a malformed state must never stop the match from saving). */
export function liveSummaryOf<S>(plugin: { summary: (s: S) => ScoreSummary }, state: S): LiveSummary | null {
  try { return compactSummary(plugin.summary(state)); } catch { return null; }
}
