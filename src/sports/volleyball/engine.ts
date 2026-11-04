/**
 * Volleyball scoring engine (pure) — rally scoring, set to 25 (win by 2), a
 * shorter deciding set to 15, best of 3/5. Kept RN-free so it's unit-testable.
 *
 * Point outcomes (SD-04 / VB-01, VB-02). Every rally is won by a side, and HOW
 * decides who (if anyone) gets the credit:
 *   ATTACK      a kill            → the attacker: points +1, attackPoints +1
 *   BLOCK       a winning block   → the blocker:  blocks +1, points +1
 *   ACE         a service ace     → the server:   aces +1,   points +1
 *   OPP_ERROR   the opponent erred (attack out, net, rotation…) → nobody
 *   SERVE_ERROR the opponent missed their serve                 → nobody
 *   POINT       legacy / outcome not recorded → the player picked, points +1
 * Old logs only contain POINT / ACE / BLOCK and replay exactly as before; their
 * stat lines (aces/blocks without the point) heal on the absolute re-sync (SD-32).
 */
import type { LiveEvent } from '../liveEvents';
import type { Attribution, ScoreAction } from '../types';
import { replayPoints, type PointCredits, type PointInput, type PointKind } from '../rallyEdit.ts';
import { pointsLineScore, type LineScore } from '../scoreline.ts';
import { serveReducer, serveTracked, firstServer, type VbSub } from './rotation.ts';
import { detailReducer, initDetail, type VbDetailEntry, type VbDetailToggle } from './detail.ts';
import { keepMarks, withStamps } from '../conduct.ts';
import { isPointKind } from '../rallyEdit.ts';
import { fromPen, isSanctionLevel, oppSide, sanctionDef, sanctionLabel, toPen, type VbSanction } from './sanctions.ts';
import type { PenMark } from '../conduct';
import { legacyNameOf, type NameOf } from '../../core/playerNames.ts';

const TARGET = 25;
const DECIDER_TARGET = 15; // the final set is a shorter race to 15 (real-world rule)
const SETS_TO_WIN = 2;

export interface VolleyballState {
  current: { home: number; away: number };
  setsWon: { home: number; away: number };
  sets: Array<[number, number]>;
  /** sets a side must win to take the match (format: setsToWin) */
  setsToWin: number;
  /** points to win a normal set, win by 2 (format: pointsPerSet — 25 indoor, 21 beach) */
  target: number;
  /** points to win the deciding set (shorter — 15) */
  deciderTarget: number;
  /** must a set be won by two clear points? off = first to target (casual) */
  winByTwo: boolean;
  events: LiveEvent[];
  seq: number;
  ended: boolean;
  /** SD-29: who was on court when the match started, per side (stamped from
   *  the lineup / matchday squad before the first point — `LINEUP`). Absent on
   *  older logs, which then write no sets played. */
  lineup?: { home?: CourtPlayer[]; away?: CourtPlayer[] };
  /** SD-117b: team timeouts per set (format: timeoutsPerSet). Absent = 2 (indoor);
   *  only stamped when the format sets it (Beach = 1), so older states are unchanged. */
  timeoutsPerSet?: number;
  /** SD-117b: beach rules (Beach preset / 2 a side) — court switch every 7 points
   *  (5 in the decider) and the technical timeout at 21. Only stamped when true. */
  beach?: true;
  /** SD-136: regular substitutions per team per set (format: substitutes).
   *  Absent = 6 (FIVB 15.6); only stamped when the format says otherwise
   *  (Beach 0, 9-a-side 3), so older states keep their shape. */
  subLimit?: number;
  /** SD-136: players on court per side when it isn't 6 (format:
   *  playersPerSide, e.g. 9-a-side). Absent = 6 (2 when `beach`). The rotation
   *  / serving order is this long; positions I–VI, the front row and the
   *  libero checks apply only to a court of 6. */
  courtSize?: number;
  /** SD-58: first server per set (the toss) — `SET_SERVE`. Absent on older
   *  logs: the serving side is then derived from the rallies (SD-117b). */
  serve?: Record<string, 'home' | 'away'>;
  /** SD-58: starting rotation per set, positions I–VI (I = server) — `SET_ROTATION`. */
  rotation?: Record<string, { home?: CourtPlayer[]; away?: CourtPlayer[]; homeAt?: number; awayAt?: number }>;
  /** SD-71: up to 2 liberos per side (FIVB 19.1.1) — stamped with the rotation. */
  liberos?: { home?: CourtPlayer[]; away?: CourtPlayer[] };
  /** SD-71: substitutions and libero replacements — `SUB` (see ./rotation.ts). */
  subs?: VbSub[];
  /** SD-81: the "Detailed stats" switches (attack attempts, reception) —
   *  `SET_DETAIL` (./detail.ts). Absent = never on (every older match). */
  detail?: VbDetailToggle[];
  /** SD-81: detail entries — attacks kept in play, blocked attackers,
   *  receptions (`VB_DETAIL`). State stamps; absent on older logs. */
  vd?: VbDetailEntry[];
}

/** A player on court (lineup / rotation / liberos / subs). IDs-only scoring:
 *  new stamps carry the id only; `name` is legacy, read-only (an older stamp
 *  stored it) — readers show `nameOf(id, name)`. */
export interface CourtPlayer { id: string; name?: string }

export const init = (config?: Record<string, unknown>): VolleyballState => ({
  current: { home: 0, away: 0 },
  setsWon: { home: 0, away: 0 },
  sets: [],
  setsToWin: Number(config?.setsToWin ?? SETS_TO_WIN),
  target: Number(config?.pointsPerSet ?? TARGET),
  deciderTarget: Number(config?.deciderPoints ?? DECIDER_TARGET),
  winByTwo: config?.winByTwo !== false, // default on (rally to 25, win by 2)
  events: [],
  seq: 0,
  ended: false,
  // SD-117b: format-only keys, added only when set (old states keep their shape)
  ...formatExtras(config),
  // SD-81: only when the format starts with detail on
  ...initDetail(config),
});

/** SD-117b — Beach is the Beach preset or a 2-a-side format. */
const isBeachFormat = (config?: Record<string, unknown>) => config?.preset === 'beach' || Number(config?.playersPerSide) === 2;
function formatExtras(config?: Record<string, unknown>): Pick<VolleyballState, 'timeoutsPerSet' | 'beach' | 'subLimit' | 'courtSize'> {
  const beach = isBeachFormat(config);
  const raw = config?.timeoutsPerSet;
  const tps = raw != null && Number.isFinite(Number(raw)) ? Math.max(0, Math.floor(Number(raw))) : beach ? 1 : undefined;
  // SD-136: the format's sub limit and court size (only when not the indoor 6)
  const subs = config?.substitutes != null && Number.isFinite(Number(config.substitutes)) ? Math.max(0, Math.floor(Number(config.substitutes))) : undefined;
  const pps = config?.playersPerSide != null && Number.isFinite(Number(config.playersPerSide)) ? Math.max(1, Math.floor(Number(config.playersPerSide))) : undefined;
  return {
    ...(tps != null ? { timeoutsPerSet: tps } : {}), ...(beach ? { beach: true as const } : {}),
    ...(subs != null && subs !== 6 ? { subLimit: subs } : {}),
    ...(pps != null && pps !== 6 && !beach ? { courtSize: pps } : {}),
  };
}

/** SD-136 — regular subs per team per set (6 indoor, or the format's). */
export const subsPerSet = (s: VolleyballState): number => s.subLimit ?? 6;
/** SD-136 — players on court per side (6, 2 on beach, or the format's). */
export const courtSizeOf = (s: VolleyballState): number => s.courtSize ?? (s.beach ? 2 : 6);

/** Timeouts each team gets per set (2 indoor, 1 beach, or the format's). */
export const timeoutsPerSet = (s: VolleyballState): number => s.timeoutsPerSet ?? 2;

/** Are we in the deciding set? (both sides one set from the match — e.g. 2-2 in
 *  a best-of-5, 1-1 in a best-of-3). The decider is a shorter race to 15. */
export const isDecider = (s: VolleyballState) =>
  s.setsToWin > 1 && s.setsWon.home === s.setsToWin - 1 && s.setsWon.away === s.setsToWin - 1;
/** Points needed to win the current set (15 in the decider, else the set target). */
export const setTarget = (s: VolleyballState) => (isDecider(s) ? s.deciderTarget : s.target);

/** Reset the match to 0-0 keeping its format (target/setsToWin/decider/win-by-2)
 *  — the clean slate an EDIT_LOG replay rebuilds the corrected point list onto. */
const clearMatch = (s: VolleyballState): VolleyballState => ({
  ...s, current: { home: 0, away: 0 }, setsWon: { home: 0, away: 0 }, sets: [], events: [], seq: 0, ended: false,
});

/** How a point was won — the outcomes the scorer picks from. */
export type VbOutcome = 'attack' | 'block' | 'ace' | 'opperror' | 'serveerror';

export interface OutcomeDef {
  kind: VbOutcome;
  /** the scoring action dispatched */
  type: string;
  icon: string;
  /** button / chip label */
  label: string;
  /** does a player of the scoring side get credit? (errors credit nobody) */
  credited: boolean;
  /** SD-117b: the scorer's chip, when it differs from the timeline icon/label
   *  (the two error chips must not look alike). The logged event keeps
   *  `icon` / `label`, so recorded matches replay to the same timeline. */
  chip?: string;
}

/** In the order the scorer sees them. Attack first — it's the commonest point. */
export const VB_OUTCOMES: OutcomeDef[] = [
  { kind: 'attack', type: 'ATTACK', icon: '⚡', label: 'Attack', credited: true },
  { kind: 'block', type: 'BLOCK', icon: '🧱', label: 'Block', credited: true },
  { kind: 'ace', type: 'ACE', icon: '🎯', label: 'Ace', credited: true },
  { kind: 'opperror', type: 'OPP_ERROR', icon: '🎁', label: 'Opp. error', credited: false, chip: '🚩 Opp. fault' },
  { kind: 'serveerror', type: 'SERVE_ERROR', icon: '🎁', label: 'Opp. serve error', credited: false, chip: '🥅 Opp. missed serve' },
];

/** The chip text for an outcome (SD-117b: distinct error chips). */
export const outcomeChip = (o: OutcomeDef) => o.chip ?? `${o.icon} ${o.label}`;

/** SD-117b — what the opponent did wrong on an "Opp. fault" (optional). */
export const VB_ERROR_TYPES: Array<{ key: string; label: string }> = [
  { key: 'net', label: 'Net touch' },
  // batch 5: the centre line (a serve foot fault is a missed serve); the key
  // stays `foot`, so older logs keep their meaning
  { key: 'foot', label: 'Centre line' },
  { key: 'rotation', label: 'Rotation' },
  { key: 'hits', label: 'Double / 4 hits' },
  // batch 5 (FIVB 9.2.2 / 13.2–13.3 / 19.3): new keys, additive
  { key: 'handling', label: 'Catch / lift' },
  { key: 'backrow', label: 'Back-row / libero fault' },
  { key: 'attackout', label: 'Attack out' },
  // court-team batch 1: a BLOCKING fault (net touch while blocking, reaching
  // over, blocking a serve). The key stays `blockout`, so older logs keep their
  // meaning (a block error); the ball off the block and out is the attacker's kill.
  { key: 'blockout', label: 'Block fault (net / over / blocked a serve)' },
];
/** FIVB Rules 2025–2028 (volleyball-rulebook.md VB-1): only the RECEIVING team
 *  can make a positional (rotation) fault at the serve. `winnerServing`: the
 *  point winner served (so the erring side was receiving); null = unknown. */
export const vbErrorTypesFor = (winnerServing: boolean | null) =>
  winnerServing === false ? VB_ERROR_TYPES.filter((t) => t.key !== 'rotation') : VB_ERROR_TYPES;
/** court-team batch 1 — shown under the fault chips (FIVB: a ball off the
 *  block and out is an attack kill, not a blocking error). */
export const VB_BLOCK_HINT = 'Ball off the block and out = ⚡ Attack point (the attacker’s kill), not a fault.';
const ERROR_LABEL = Object.fromEntries(VB_ERROR_TYPES.map((t) => [t.key, t.label]));
export const errorTypeLabel = (k?: string) => (k ? ERROR_LABEL[k] ?? k : undefined);

/** SD-117b — the player stat an erring opponent is charged with. */
export const VB_ERROR_STAT = 'errors';
/** SD-58 / SD-81 — the player stat the opponent's server is charged with on a missed serve. */
export const VB_SERVE_ERROR_STAT = 'serveErrors';

/** Timeline icon/label per scored kind (legacy 'point' keeps its 🏐 "Point"). */
const KIND_OF: Record<string, { kind: PointKind; icon: string; label: string }> = {
  POINT: { kind: 'point', icon: '🏐', label: 'Point' },
  ...Object.fromEntries(VB_OUTCOMES.map((o) => [o.type, { kind: o.kind, icon: o.icon, label: o.label }])),
};

/** Stats one point of `kind` credits to the player on it. An ace or block is also
 *  a point (VB-02), so profile/tournament "Points" match the live box score. */
export const volleyballCredits: PointCredits = (kind): Record<string, number> => {
  switch (kind) {
    case 'attack': return { points: 1, attackPoints: 1 };
    case 'block': return { blocks: 1, points: 1 };
    case 'ace': return { aces: 1, points: 1 };
    case 'point': return { points: 1 };
    default: return {}; // an opponent's error — nobody on the scoring side earned it
  }
};

/** The stat keys a volleyball stat line covers from SD-04 on (coverage flags). */
export const VB_TRACKED = ['points', 'attackPoints', 'aces', 'blocks'];

/** The attribution a credited outcome carries: primary stat + `extra` for the
 *  rest of `volleyballCredits`, so forward recording, undo (statReversals) and the
 *  editor's reconciliation all agree. */
export function outcomeAttribution(kind: VbOutcome | 'point', player?: { id: string; fullName?: string }): Attribution | undefined {
  if (!player) return undefined;
  const credits = volleyballCredits(kind);
  const keys = Object.keys(credits);
  if (keys.length === 0) return undefined;
  // primary = the outcome's own stat (aces / blocks), else points
  const stat = kind === 'ace' ? 'aces' : kind === 'block' ? 'blocks' : 'points';
  const extra = Object.fromEntries(keys.filter((k) => k !== stat).map((k) => [k, credits[k]]));
  // IDs-only scoring: the id only (match events are public)
  return {
    playerId: player.id, stat,
    ...(Object.keys(extra).length ? { extra } : {}),
    tracked: VB_TRACKED,
  };
}

/** The scoring action for one outcome (player optional; ignored for errors).
 *  SD-58: a missed serve may name the opponent's server (`fault.by`). 
 *  SD-117b: an "Opp. fault" may say what went wrong (`err`, VB_ERROR_TYPES)
 *  and who erred — an OPPONENT, charged one `errors` (attribution2: a stat
 *  line only, no follower alert). Both are new optional keys. */
export const outcomeAction = (
  kind: VbOutcome, side: 'home' | 'away', player?: { id: string; fullName?: string },
  fault?: { err?: string; by?: { id: string; fullName?: string } },
): ScoreAction => {
  const def = VB_OUTCOMES.find((o) => o.kind === kind)!;
  const a: ScoreAction = { type: def.type, side, attribution: def.credited ? outcomeAttribution(kind, player) : undefined };
  if (kind === 'opperror' && fault?.err) a.payload = { err: fault.err };
  // SD-119: the erring player is on the OTHER side from the point's winner
  const errSide = side === 'home' ? 'away' : 'home';
  if (kind === 'opperror' && fault?.by) a.attribution2 = { playerId: fault.by.id, stat: VB_ERROR_STAT, side: errSide };
  // SD-58 / SD-81: the opponent's server who missed (pre-filled from the rotation)
  if (kind === 'serveerror' && fault?.by) a.attribution2 = { playerId: fault.by.id, stat: VB_SERVE_ERROR_STAT, side: errSide };
  return a;
};

/** SD-117b — who serves next, derived from the log (no serve tracking yet —
 *  SD-58): the side that won the last rally of the set serves. At the start of
 *  a set it's the side that RECEIVED first in the previous set (FIVB), known
 *  only when that set's first serve is (its first point an ace or a serve
 *  error); the decider is a fresh toss. null = unknown. */
export function servingSide(s: VolleyballState): 'home' | 'away' | null {
  if (!s || s.ended) return null;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const pts = (n: number) => s.events.filter((e) => e.set === n && SCORED.has(e.kind ?? '') && (e.side === 'home' || e.side === 'away'));
  const cur = pts(setNo);
  if (cur.length) return cur[cur.length - 1].side!;
  // SD-58: the toss / FIVB 7.1 order when serve tracking is on
  const explicit = serveTracked(s) ? firstServer(s, setNo) : null;
  if (explicit) return explicit;
  if (isDecider(s)) return null;
  const first = (n: number): 'home' | 'away' | null => {
    if (n < 1) return null;
    const ex = s.serve?.[n];
    if (ex === 'home' || ex === 'away') return ex;
    const p = pts(n)[0];
    if (p?.kind === 'ace') return p.side!;
    if (p?.kind === 'serveerror') return p.side === 'home' ? 'away' : 'home';
    const prev = first(n - 1);
    return prev ? (prev === 'home' ? 'away' : 'home') : null;
  };
  const prev = first(setNo - 1);
  return prev ? (prev === 'home' ? 'away' : 'home') : null;
}
const SCORED = new Set(['point', 'attack', 'block', 'ace', 'opperror', 'serveerror']);

/** SD-117b — a non-blocking "Switch sides" cue at the current score: beach
 *  every 7 points (every 5 in the decider), indoor once in the decider when a
 *  side reaches 8. null = no switch now. */
export function switchSidesDue(s: VolleyballState): string | null {
  if (!s || s.ended) return null;
  const { home: h, away: a } = s.current;
  const total = h + a;
  if (!total) return null;
  const dec = isDecider(s);
  if (s.beach) {
    const every = dec ? 5 : 7;
    return total % every === 0 ? `Switch sides — ${total} points played` : null;
  }
  if (!dec) return null;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const last = [...s.events].reverse().find((e) => e.set === setNo && SCORED.has(e.kind ?? ''));
  const lead = h === 8 && a < 8 ? 'home' : a === 8 && h < 8 ? 'away' : null;
  return lead && last?.side === lead ? 'Switch sides — 8 points in the deciding set' : null;
}

/** SD-117b — beach technical timeout: sets 1–2 (not the decider) when the
 *  points played reach 21. */
export function technicalTimeoutDue(s: VolleyballState): boolean {
  if (!s?.beach || s.ended || isDecider(s)) return false;
  return s.current.home + s.current.away === 21;
}

/** Deep wave — every step's new timeline events carry its `payload.at` (the
 *  scorer's clock, sent by the controls): the commentary's elapsed minute and
 *  set durations. An older log's actions carry no `at`, so they replay to
 *  exactly the same state; an EDIT_LOG replays each point's stamp. */
export const reducer = (s: VolleyballState, a: ScoreAction): VolleyballState => stamped(s, a);

const core = (s: VolleyballState, a: ScoreAction): VolleyballState => {
  // Timeline correction: STAT_ADJUST only reconciles player profiles (no match
  // effect); EDIT_LOG replays a corrected point list so the score & sets re-derive.
  if (a.type === 'STAT_ADJUST') return s;
  if (a.type === 'EDIT_LOG') {
    const replayed = replayPoints(reducer, clearMatch(s), (a.payload?.points as PointInput[]) ?? []);
    // SD-136: sanction records (no score effect) go back where they were; a log
    // without any (every older match) is returned exactly as replayed.
    // Batch 6: video challenges (kind 'review') are kept the same way.
    return s.events.some((e) => e.kind === 'conduct' || e.kind === 'review')
      ? keepMarks(s.events.filter((e) => e.kind === 'conduct' || e.kind === 'review' || isPointKind(e.kind)), replayed)
      : replayed;
  }
  // Batch 6: a video challenge — a marker (no score effect)
  if (a.type === 'CHALLENGE') return challengeStep(s, a);
  // SD-136: sanctions (FIVB 16 / 21) — ./sanctions.ts
  if (a.type === 'CONDUCT' || a.type === 'PENALTY_POINT') return sanctionStep(s, a);
  if (a.type === 'TIMEOUT') {
    // A team timeout — a non-scoring timeline marker (2 per set in indoor).
    if (s.ended || !a.side) return s;
    const setNo = s.setsWon.home + s.setsWon.away + 1;
    return { ...s, seq: s.seq + 1, events: [...s.events, { id: s.seq + 1, stamp: `Set ${setNo}`, icon: '⏱️', label: 'Timeout', detail: undefined, side: a.side, kind: 'timeout', set: setNo }] };
  }
  // SD-58 / SD-71: toss, rotation, substitutions — state stamps (./rotation.ts)
  const stamped = serveReducer(s, a);
  if (stamped) return stamped;
  // SD-81: the detail switch and entries — state stamps (./detail.ts)
  const detailed = detailReducer(s, a);
  if (detailed) return detailed;
  if (a.type === 'LINEUP') {
    // SD-29: the court at the start (a state stamp, not a timeline event — it
    // survives an EDIT_LOG replay). The latest stamp for a side wins.
    const team = a.payload?.team;
    const players = a.payload?.players as CourtPlayer[] | undefined;
    if ((team !== 'home' && team !== 'away') || !Array.isArray(players)) return s;
    // IDs-only scoring: ids only; an older stamp's names are kept as they were
    const list = players.filter((p) => p?.id).map((p): CourtPlayer => (p.name != null ? { id: String(p.id), name: String(p.name) } : { id: String(p.id) }));
    return { ...s, lineup: { ...s.lineup, [team]: list } };
  }
  const def = KIND_OF[a.type];
  if (s.ended || !a.side || !def) return s;
  const { kind, icon, label } = def;
  // An opponent's error is nobody's point on the scoring side.
  const credit = kind === 'opperror' || kind === 'serveerror' ? undefined : a.attribution;
  // legacy, read-only: an older log's attribution named the player
  const who = credit?.playerName;
  const current = { ...s.current, [a.side]: s.current[a.side] + 1 };
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const tgt = setTarget(s); // 15 in the decider, else the set target
  let seq = s.seq;
  const events = [...s.events];
  // Structured fields (kind/playerName/set/points) let the per-set box score
  // aggregate points/aces/blocks per player, filtered by set — the timeline ignores them.
  // SD-29: an older (named) credit's id rides on the point only once a court
  // is stamped (older logs replay to exactly their old state). IDs-only
  // scoring: a credit that carries no name always keeps its id.
  const pid = credit?.playerId && (who ? s.lineup : true) ? { playerId: credit.playerId } : {};
  // SD-117b: an "Opp. fault" may carry what went wrong + the erring opponent
  // (new optional keys — older OPP_ERRORs carry neither and replay unchanged).
  // SD-58: a missed serve may name the opponent's server (charged `serveErrors`)
  const oe = kind === 'opperror' || kind === 'serveerror' ? faultOf(a) : undefined;
  const oeText = oe ? [errorTypeLabel(oe.type), oe.playerName].filter(Boolean).join(' · ') : '';
  events.push({ id: ++seq, stamp: `Set ${setNo}`, icon, label, detail: `${current.home}-${current.away}${who ? ` · ${who}` : ''}${oeText ? ` · ${oeText}` : ''}`, side: a.side, kind, playerName: who, ...pid, set: setNo, points: 1, ...(oe ? { oe } : {}) });

  const h = current.home;
  const v = current.away;
  const m = (s.winByTwo ?? true) ? 2 : 1; // win-by-2, or first-to-target (casual)
  const won = h >= tgt && h - v >= m ? 'home' : v >= tgt && v - h >= m ? 'away' : null;
  if (!won) return { ...s, current, events, seq };

  const sets = [...s.sets, [h, v] as [number, number]];
  const setsWon = { ...s.setsWon, [won]: s.setsWon[won] + 1 };
  const ended = setsWon[won] >= s.setsToWin;
  events.push({ id: ++seq, stamp: 'Set', icon: '🎉', label: `Set ${sets.length} won`, detail: `${h}-${v}`, side: won });
  if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${setsWon.home}-${setsWon.away} sets`, side: won });
  return { ...s, current: { home: 0, away: 0 }, setsWon, sets, events, seq, ended };
};
const stamped = withStamps(core);

/** Deep wave — the scoring steps the controls stamp with the scorer's clock. */
const STAMP_TYPES = new Set(['POINT', 'ATTACK', 'BLOCK', 'ACE', 'OPP_ERROR', 'SERVE_ERROR', 'TIMEOUT', 'CONDUCT', 'CHALLENGE']);

/* ------------------------- video challenge (batch 6) ------------------------- */

/** What a team may challenge (FIVB Video Challenge System). */
export const VB_CHALLENGE_WHAT = ['inout', 'touch', 'net', 'antenna', 'line'] as const;
export type VbChallengeWhat = (typeof VB_CHALLENGE_WHAT)[number];
export const VB_CHALLENGE_LABEL: Record<VbChallengeWhat, string> = {
  inout: 'Ball in / out', touch: 'Block touch', net: 'Net touch', antenna: 'Antenna', line: 'Foot fault / centre line',
};
/** FIVB: each team has 2 unsuccessful challenges per set. */
export const VB_CHALLENGES_PER_SET = 2;
/** Unsuccessful challenges `side` has left in the set in play. */
export function challengesLeft(s: VolleyballState, side: 'home' | 'away'): number {
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const used = s.events.filter((e) => e.kind === 'review' && e.side === side && e.set === setNo && e.rev === 'rejected').length;
  return Math.max(0, VB_CHALLENGES_PER_SET - used);
}
/** CHALLENGE {side = the challenging team, payload {upheld: boolean, what?}}:
 *  a timeline marker that a correction keeps. Anything else is ignored. */
function challengeStep(s: VolleyballState, a: ScoreAction): VolleyballState {
  const side = a.side;
  const upheld = a.payload?.upheld;
  if (s.ended || (side !== 'home' && side !== 'away') || typeof upheld !== 'boolean' || challengesLeft(s, side) === 0) return s;
  const w = a.payload?.what;
  const what = VB_CHALLENGE_WHAT.includes(w as VbChallengeWhat) ? (w as VbChallengeWhat) : undefined;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const seq = s.seq + 1;
  return {
    ...s, seq,
    events: [...s.events, {
      id: seq, stamp: `Set ${setNo}`, icon: '📺', label: `Video challenge · ${upheld ? 'upheld' : 'not upheld'}`,
      ...(what ? { detail: VB_CHALLENGE_LABEL[what] } : {}),
      side, kind: 'review', set: setNo, rev: upheld ? 'upheld' : 'rejected', ...(what ? { chw: what } : {}),
    }],
  };
}
/** The action with the scorer's clock (`payload.at`) when it's a scoring step. */
export const stampAction = (a: ScoreAction, now: number = Date.now()): ScoreAction =>
  STAMP_TYPES.has(a.type) && a.payload?.at == null ? { ...a, payload: { ...(a.payload ?? {}), at: now } } : a;

/** SD-136 — CONDUCT (a new sanction) / PENALTY_POINT (a penalty point
 *  replayed from a corrected list). A penalty scores like any rally won (the
 *  serve follows, the set / match may end); the rest are timeline records. */
function sanctionStep(s: VolleyballState, a: ScoreAction): VolleyballState {
  if (s.ended) return s;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const penaltyPoint = (x: VbSanction, pen: PenMark): VolleyballState => {
    const to = oppSide(x.by);
    const next = reducer(s, { type: 'POINT', side: to });
    const i = s.events.length;
    const e = next.events[i];
    if (!e) return next;
    const events = next.events.slice();
    const who = x.playerName;
    events[i] = { ...e, icon: sanctionDef(x.level)?.icon ?? '🟥', label: sanctionLabel(x), detail: [e.detail, x.reason, who].filter(Boolean).join(' · '), pen };
    return { ...next, events };
  };
  if (a.type === 'PENALTY_POINT') {
    const pen = a.payload?.pen as PenMark | undefined;
    if (!pen || (pen.by !== 'home' && pen.by !== 'away')) return s;
    return penaltyPoint(fromPen(pen, setNo), pen);
  }
  const by = a.side;
  const p = a.payload ?? {};
  if ((by !== 'home' && by !== 'away') || !isSanctionLevel(p.vb)) return s;
  const str = (v: unknown, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  const playerId = str(p.playerId);
  const playerName = str(p.playerName);
  const reason = str(p.reason);
  const x: VbSanction = { level: p.vb, by, set: setNo, ...(playerId ? { playerId } : {}), ...(playerName ? { playerName } : {}), ...(reason ? { reason } : {}) };
  const def = sanctionDef(x.level)!;
  if (def.effect === 'point') return penaltyPoint(x, toPen(x));
  const seq = s.seq + 1;
  return {
    ...s, seq,
    events: [...s.events, {
      id: seq, stamp: `Set ${setNo}`, icon: def.icon, label: sanctionLabel(x),
      detail: [reason, playerName].filter(Boolean).join(' · ') || undefined,
      side: by, kind: 'conduct', set: setNo, ...(playerName ? { playerName } : {}), ...(playerId ? { playerId } : {}), vs: x,
    }],
  };
}

/** SD-117b — the fault detail an OPP_ERROR carries (payload.err + attribution2,
 *  or the replayed `_attr2`). undefined when it carries none. */
function faultOf(a: ScoreAction): VbFault | undefined {
  const type = typeof a.payload?.err === 'string' && a.payload.err ? a.payload.err : undefined;
  const by = (a.attribution2 ?? (a.payload?._attr2 as ScoreAction['attribution2'])) || undefined;
  // IDs-only scoring: the erring player by id (an older log's by name + id)
  if (!type && !by?.playerName && !by?.playerId) return undefined;
  return {
    ...(type ? { type } : {}),
    ...(by?.playerName ? { playerName: by.playerName, ...(by.playerId ? { playerId: by.playerId } : {}) } : by?.playerId ? { playerId: by.playerId } : {}),
  };
}
export interface VbFault { type?: string; playerId?: string; /** legacy, read-only */ playerName?: string }

export interface BoxLine {
  /** the viewer's name (IDs-only scoring: `nameOf(playerId, legacy name)`) */
  name: string;
  /** IDs-only scoring — the row's key: the player's id, or "~Name" for an
   *  older log's credit that carried only a name */
  key: string;
  playerId?: string;
  points: number; aces: number; blocks: number;
  /** kills (Attack points) */
  attackPoints: number;
}

const BOX_KINDS = new Set(['point', 'attack', 'ace', 'block']);

/** IDs-only scoring — a volleyball credit's row key: the player's id; an
 *  older log's name-only credit resolves through `resolve` (a roster), else
 *  through the id the same name carries elsewhere in the log, else "~Name". */
export function vbCreditKeyer(events: LiveEvent[], resolve?: (name: string) => string | undefined): (c?: { playerId?: string; playerName?: string }) => string | undefined {
  const seen = new Map<string, string>();
  for (const e of events ?? []) {
    for (const c of [e, e.oe]) if (c?.playerId && c.playerName && !seen.has(c.playerName)) seen.set(c.playerName, c.playerId);
  }
  return (c) => c?.playerId || (c?.playerName ? resolve?.(c.playerName) ?? seen.get(c.playerName) ?? `~${c.playerName}` : undefined);
}

/** Box score: points, aces & blocks per player for one side (`scope` = one set).
 *  An ace or block is also a point, so it counts in both columns — the same credit
 *  the player's profile gets (`volleyballCredits`). IDs-only scoring: keyed by
 *  player id (`vbCreditKeyer`), named for the viewer by `nameOf` (the stored
 *  legacy name without one). */
export function tally(events: LiveEvent[], side: 'home' | 'away', scope: 'all' | number = 'all', opts: { nameOf?: NameOf; resolve?: (name: string) => string | undefined } = {}): BoxLine[] {
  const keyOf = vbCreditKeyer(events, opts.resolve);
  const lines = new Map<string, BoxLine & { legacy?: string }>();
  for (const e of events) {
    // Player-credited kinds only — an opponent's error (opperror/serveerror) is
    // the side's point but nobody's stat.
    if (e.side !== side || !BOX_KINDS.has(e.kind ?? '')) continue;
    const key = keyOf(e);
    if (!key) continue;
    if (scope !== 'all' && e.set !== scope) continue;
    let l = lines.get(key);
    if (!l) {
      l = { name: '', key, ...(key.startsWith('~') ? {} : { playerId: key }), points: 0, aces: 0, blocks: 0, attackPoints: 0, ...(e.playerName ? { legacy: e.playerName } : {}) };
      lines.set(key, l);
    }
    if (!l.legacy && e.playerName) l.legacy = e.playerName;
    l.points += 1;            // every scored point counts…
    if (e.kind === 'ace') l.aces += 1; // …an ace also lands in the ace column
    if (e.kind === 'block') l.blocks += 1; // …a winning block in the block column
    if (e.kind === 'attack') l.attackPoints += 1;
  }
  const nameOf = opts.nameOf ?? legacyNameOf;
  return [...lines.values()]
    .map(({ legacy, ...l }) => ({ ...l, name: l.playerId ? nameOf(l.playerId, legacy) : nameOf(undefined, l.key.slice(1)) }))
    .sort((a, b) => b.points - a.points || b.aces - a.aces);
}


/** SD-17 standings units: rally points won by each side over every set (plus
 *  an unfinished one) — the FIVB point ratio. Sets come from the match score. */
export function standingsUnits(s: VolleyballState): { points: { home: number; away: number } } | null {
  if (!s || !Array.isArray(s.sets)) return null;
  const points = s.sets.reduce((t, [h, a]) => ({ home: t.home + h, away: t.away + a }), { home: s.current?.home ?? 0, away: s.current?.away ?? 0 });
  return { points };
}

/** SD-20 — the line score: every set + the one in play. */
export const lineScore = (s: VolleyballState): LineScore | null =>
  pointsLineScore('set', s && { games: s.sets, current: s.current, won: s.setsWon, ended: s.ended, toWin: s.setsToWin });
