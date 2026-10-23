/**
 * SD-51 — Volleyball's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { setSportRecords } from '../matchRecords.ts';
import { lineScore as volleyballLine, type VolleyballState } from './engine.ts';

export const volleyballMatchRecords = (s: VolleyballState) => setSportRecords(volleyballLine(s), s?.events, { tiebreaks: false });
