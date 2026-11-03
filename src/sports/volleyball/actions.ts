/**
 * IDs-only scoring (docs/privacy/ids-only-scoring.md) — the volleyball actions
 * the scoring controls dispatch besides the points (`outcomeAction`,
 * engine.ts): the court stamp, the rotation, substitutions, the detail
 * entries and sanctions. Pure builders, so the controls and the tests build
 * them the same way. Match state and events are public, so each carries
 * player IDS only — never a name (names are looked up when shown). PURE.
 */
import type { ScoreAction } from '../types';
import type { CourtPlayer } from './engine';
import type { SubKind } from './rotation';
import type { ReceptionGrade, VbDetailKind } from './detail';
import type { VbSanctionLevel } from './sanctions';

type Side = 'home' | 'away';
type Who = { id: string };

/** A court player as the stamps store it: the id only. */
export const courtPlayer = (p: Who): CourtPlayer => ({ id: p.id });

/** SD-29 — who is on court at the start (stamped before the first point). */
export const lineupAction = (team: Side, players: Who[]): ScoreAction =>
  ({ type: 'LINEUP', payload: { team, players: players.map(courtPlayer) } });

/** SD-58 — a starting rotation (positions I–VI in order) and the liberos. */
export const rotationAction = (team: Side, set: number, players: Who[], liberos: Who[]): ScoreAction =>
  ({ type: 'SET_ROTATION', payload: { team, set, players: players.map(courtPlayer), liberos: liberos.map(courtPlayer) } });

/** SD-71 — a substitution / libero replacement. */
export const subAction = (side: Side, off: Who, on: Who, kind: SubKind): ScoreAction =>
  ({ type: 'SUB', side, payload: { off: courtPlayer(off), on: courtPlayer(on), kind } });

/** SD-81 — a detail entry (attack in play, blocked attacker, reception …). */
export const detailAction = (kind: VbDetailKind, side: Side, p: Who, q?: ReceptionGrade): ScoreAction =>
  ({ type: 'VB_DETAIL', side, payload: { kind, player: { playerId: p.id }, ...(q ? { q } : {}) } });

/** Court-team batch 6 — a video challenge by `side` (FIVB Video Challenge
 *  System): upheld or not, and optionally what was challenged
 *  (VB_CHALLENGE_WHAT). A marker: no score effect. */
export const challengeAction = (side: Side, upheld: boolean, what?: string | null): ScoreAction =>
  ({ type: 'CHALLENGE', side, payload: { upheld, ...(what ? { what } : {}) } });

/** SD-136 — a sanction against `by` (the offender by id, when named). */
export const sanctionAction = (by: Side, level: VbSanctionLevel, o: { reason?: string | null; player?: Who | null } = {}): ScoreAction =>
  ({ type: 'CONDUCT', side: by, payload: { vb: level, ...(o.reason ? { reason: o.reason } : {}), ...(o.player ? { playerId: o.player.id } : {}) } });
