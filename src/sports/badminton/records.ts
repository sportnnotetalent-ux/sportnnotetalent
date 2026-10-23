/**
 * SD-51 — Badminton's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { setSportRecords } from '../matchRecords.ts';
import { lineScore as badmintonLine, type BadmintonState } from './engine.ts';

export const badmintonMatchRecords = (s: BadmintonState) => setSportRecords(badmintonLine(s), s?.events, { tiebreaks: false });
