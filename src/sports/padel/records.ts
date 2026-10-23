/**
 * SD-51 — Padel's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { setSportRecords } from '../matchRecords.ts';
import { lineScore as padelLine, type PadelState } from './engine.ts';

export const padelMatchRecords = (s: PadelState) => setSportRecords(padelLine(s), s?.events, { tiebreaks: true });
