/**
 * SD-51 — The rally sports' (table tennis, squash, pickleball) `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ./matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { setSportRecords } from './matchRecords.ts';
import { rallyLineScore, type RallyState } from './rallyEngine.ts';

export const rallyMatchRecords = (s: RallyState) => setSportRecords(rallyLineScore(s), s?.events, { tiebreaks: false });
