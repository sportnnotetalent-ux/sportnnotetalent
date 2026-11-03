/**
 * Court-team batch 6 — seeded log generators (docs/security/breaks/court-team-batch6.md).
 * `oldFingerprint` replays old-style logs (nothing this batch adds, plus
 * hostile / absent values an older or tampered log may carry) for volleyball,
 * netball and handball; its hashes were recorded on the code before this
 * batch (26510a4), so a change in how any of them replays shows up.
 */
import { createHash } from 'node:crypto';
import type { ScoreAction } from '../src/sports/types.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { sanctionAction } from '../src/sports/volleyball/actions.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import { volleyballMatchStats } from '../src/sports/volleyball/matchStats.ts';
import { volleyballCommentary } from '../src/sports/volleyball/commentary.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import * as nb from '../src/sports/netball/engine.ts';
import { netballTotals } from '../src/sports/netball/totals.ts';
import { netballPanel } from '../src/sports/netball/panel.ts';
import { netballFeed } from '../src/sports/netball/commentary.ts';
import { netballTimeline } from '../src/sports/netball/timeline.ts';
import * as hb from '../src/sports/handball/engine.ts';
import { handballTotals } from '../src/sports/handball/totals.ts';
import { handballDepthFigures } from '../src/sports/handball/depth.ts';
import { handballFeed } from '../src/sports/handball/feed.ts';
import { handballTimeline } from '../src/sports/handball/timeline.ts';
import { handballBox } from '../src/sports/handball/box.ts';

export type Side = 'home' | 'away';
export const SIDES: Side[] = ['home', 'away'];
export const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
/** The mandate's RNG. */
export const makeRnd = (n: number) => {
  let seed = n;
  return (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
};
export const pick = <T,>(rnd: (k: number) => number, xs: readonly T[]): T => xs[rnd(xs.length)];
export const pid = (sd: Side, i: number) => `${sd[0]}${i}`;
export const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const NAMES = { home: 'Home', away: 'Away' };
const nameOf = (id?: string | null, n?: string | null) => (id ? id.toUpperCase() : n ?? '');

/* ------------------------------- volleyball ------------------------------- */

export function vbOldLog(seed: number): { cfg: Record<string, unknown>; acts: ScoreAction[] } {
  const rnd = makeRnd(seed);
  const cfg = rnd(2) ? {} : { setsToWin: 2, pointsPerSet: 15, deciderPoints: 9 };
  const acts: ScoreAction[] = [];
  let s = vb.init(cfg);
  const fire = (a: ScoreAction) => { acts.push(a); s = vb.reducer(s, a); };
  for (let i = 0; i < 160 && !s.ended; i++) {
    const sd = pick(rnd, SIDES);
    const r = rnd(20);
    const at = 1_700_000_000_000 + i * 20_000;
    const p = { id: pid(sd, 1 + rnd(6)) };
    const q = { id: pid(other(sd), 1 + rnd(6)) };
    let a: ScoreAction;
    if (r < 5) a = vb.outcomeAction('attack', sd, p);
    else if (r < 7) a = vb.outcomeAction('block', sd, p);
    else if (r < 9) a = vb.outcomeAction('ace', sd, p);
    else if (r < 12) a = vb.outcomeAction('opperror', sd, undefined, { err: pick(rnd, ['attackout', 'blockout', 'net', 'foot', 'rotation', 'hits', 'handling', 'backrow', 'zzz']), ...(rnd(2) ? { by: q } : {}) });
    else if (r < 14) a = vb.outcomeAction('serveerror', sd, undefined, rnd(2) ? { by: q } : undefined);
    else if (r < 15) a = { type: 'POINT', side: sd, ...(rnd(2) ? { attribution: { playerId: p.id, stat: 'points', by: 1 } } : {}) };
    else if (r < 16) a = { type: 'TIMEOUT', side: sd };
    else if (r < 17) a = sanctionAction(sd, pick(rnd, ['warning', 'penalty', 'delayWarning', 'delayPenalty'] as const), rnd(2) ? { player: p } : {});
    else if (r < 18 && s.events.length > 4) {
      // a timeline correction: drop one point and replay
      const pts = pointInputs(s.events);
      if (pts.length > 2) { const k = rnd(pts.length); fire({ type: 'EDIT_LOG', payload: { points: pts.filter((_, j) => j !== k) } }); }
      continue;
    } else a = { type: 'CHALLENGE', side: sd, payload: { upheld: 'yes' } }; // hostile (unknown to older code)
    fire({ ...a, payload: { ...(a.payload ?? {}), at } });
  }
  return { cfg, acts };
}

export function vbFingerprintOne(cfg: Record<string, unknown>, acts: ScoreAction[]) {
  const s = acts.reduce(vb.reducer, vb.init(cfg));
  const sets = s.sets.length + (s.ended ? 0 : 1);
  return {
    state: s,
    totals: volleyballStatTotals(s),
    stats: ['all' as const, ...Array.from({ length: sets }, (_, i) => i + 1)].map((sc) => volleyballMatchStats(s, sc)),
    commentary: volleyballCommentary(s, { ...NAMES, nameOf } as never),
  };
}

/* --------------------------------- netball -------------------------------- */

export function nbOldLog(seed: number): ScoreAction[] {
  const rnd = makeRnd(seed);
  const acts: ScoreAction[] = [];
  let u = 0;
  if (rnd(3)) acts.push({ type: 'FIRST_CENTRE', side: pick(rnd, SIDES) });
  const n = 40 + rnd(80);
  for (let i = 0; i < n; i++) {
    const sec = 10 * (i + 1);
    const period = 1 + Math.floor(i / Math.ceil(n / 4));
    const at = (a: ScoreAction): ScoreAction => ({ ...a, payload: { uid: `n${++u}`, sec, period, ...a.payload } });
    const sd = pick(rnd, SIDES);
    const r = rnd(22);
    const p = { playerId: pid(sd, 1 + rnd(7)), stat: 'goals', by: 1 };
    if (r < 6) acts.push(at({ type: 'GOAL', side: sd, payload: { pos: pick(rnd, ['GS', 'GA']) }, attribution: p }));
    else if (r < 9) acts.push(at({ type: 'MISS', side: sd, payload: { pos: pick(rnd, ['GS', 'GA']) } }));
    else if (r < 14) acts.push(at({ type: 'STAT', side: sd, payload: { kind: pick(rnd, ['intercept', 'deflection', 'rebound', 'turnover', 'pickup', 'zzz']) }, attribution: { playerId: pid(sd, 1 + rnd(7)), stat: 'intercepts', by: 1 } }));
    else if (r < 16) acts.push(at({ type: 'PENALTY', side: sd, payload: { penalty: pick(rnd, ['contact', 'obstruction', 'x']) } }));
    else if (r < 17) acts.push(at({ type: 'SANCTION', side: sd, payload: { sanction: pick(rnd, ['warning', 'suspension', 'off']) } }));
    else if (r < 18) acts.push(at({ type: 'TIMEOUT', side: sd }));
    else if (r < 19) acts.push(at({ type: 'CENTRE', side: sd }));
    else if (r < 20) acts.push(at({ type: 'STOP', payload: { reason: 'injury' } }));
    else if (r < 21) acts.push(at({ type: 'TOSS_UP', payload: { x: 1 } })); // hostile: no side
    else acts.push(at({ type: 'REMOVE_EVENT', payload: { id: `n${1 + rnd(u)}` } }));
  }
  return acts;
}

export function nbFingerprintOne(acts: ScoreAction[]) {
  const s = acts.reduce(nb.reducer, nb.init({}));
  return {
    state: s,
    totals: netballTotals(s),
    panel: netballPanel(s),
    feed: netballFeed(s, NAMES, nameOf as never),
    timeline: netballTimeline(s, NAMES, nameOf as never),
  };
}

/* -------------------------------- handball -------------------------------- */

export function hbOldLog(seed: number): { cfg: Record<string, unknown>; acts: ScoreAction[] } {
  const rnd = makeRnd(seed);
  const cfg = rnd(2) ? {} : { trackFaultTypes: true, trackSevenMDrawn: true };
  const acts: ScoreAction[] = [];
  let u = 0;
  const n = 40 + rnd(70);
  for (let i = 0; i < n; i++) {
    const sec = 20 * (i + 1);
    const period = i < n / 2 ? 1 : 2;
    const at = (a: ScoreAction): ScoreAction => ({ ...a, payload: { uid: `h${++u}`, sec, period, ...a.payload } });
    const sd = pick(rnd, SIDES);
    const ks = other(sd);
    const r = rnd(24);
    // older / tampered logs: an absent or hostile shot type reads as 9 m
    const shotType = pick(rnd, ['sixM', 'nineM', 'wing', 'breakthrough', 'fastBreak', 'sevenM', undefined, 'zzz', 7]);
    const st = shotType === undefined ? {} : { shotType };
    const p = pid(sd, 1 + rnd(7));
    if (r < 6) acts.push(at({ type: 'GOAL', side: sd, payload: st, attribution: { playerId: p, stat: 'goals', by: 1 }, ...(rnd(2) ? { attribution2: { playerId: pid(sd, 1 + rnd(7)), stat: 'assists', by: 1 } } : {}) }));
    else if (r < 10) {
      const id = `m${i}`;
      acts.push(at({ type: 'MISS', side: sd, payload: { ...st, result: 'saved', uid: id }, attribution: { playerId: p, stat: 'shots', by: 1 } }));
      acts.push(at({ type: 'SAVE', side: ks, payload: { ...st, ref: id }, ...(rnd(2) ? { attribution: { playerId: pid(ks, 1), stat: 'saves', by: 1 } } : {}) }));
    } else if (r < 12) acts.push(at({ type: 'MISS', side: sd, payload: { ...st, result: pick(rnd, ['missed', 'blocked']) } }));
    else if (r < 13) acts.push(at({ type: 'GK', side: ks, payload: { id: pid(ks, 1 + rnd(2)) } }));
    else if (r < 15) acts.push(at({ type: 'TURNOVER', side: sd, payload: { fault: pick(rnd, ['steps', 'passive', 'zzz', undefined]) }, attribution: { playerId: p, stat: 'technicalFaults', by: 1 } }));
    else if (r < 16) acts.push(at({ type: 'DRAWN', side: sd, attribution: { playerId: p, stat: 'sevenMDrawn', by: 1 } }));
    else if (r < 17) acts.push(at({ type: 'CARD', side: sd, payload: { card: pick(rnd, ['yellow', 'twoMin', 'red']) }, attribution: { playerId: p, stat: 'yellowCards', by: 1 } }));
    else if (r < 18) acts.push(at({ type: 'TIMEOUT', side: sd }));
    else if (r < 19) acts.push(at({ type: 'EMPTY_GOAL', side: sd, payload: { on: !!rnd(2) } }));
    else if (r < 20) acts.push(at({ type: 'XI', payload: { team: sd, gk: { id: pid(sd, 1) }, players: [1, 2, 3, 4, 5, 6, 7].map((k) => ({ id: pid(sd, k) })) } }));
    else if (r < 21) acts.push(at({ type: 'PASSIVE', payload: {} })); // hostile: no side
    else if (r < 22) acts.push(at({ type: 'CAUSED', payload: {} })); // hostile: no side
    else acts.push(at({ type: 'REMOVE_EVENT', payload: { id: `h${1 + rnd(u)}` } }));
  }
  return { cfg, acts };
}

export function hbFingerprintOne(cfg: Record<string, unknown>, acts: ScoreAction[]) {
  const s = acts.reduce(hb.reducer, hb.init(cfg));
  const box = handballBox(s, { nameOf } as never);
  return {
    state: s,
    totals: handballTotals(s),
    depth: SIDES.flatMap((x) => [handballDepthFigures(s, x), handballDepthFigures(s, x, 1), hb.teamFigures(s, x)]),
    feed: handballFeed(s, NAMES, nameOf as never),
    timeline: handballTimeline(s, NAMES, nameOf as never),
    box: box.data ? (box as { data: (sc: 'all') => unknown }).data('all') : null,
  };
}

/** 60 old-style logs per sport. */
export function oldFingerprint(): { vb: string; nb: string; hb: string } {
  const v: unknown[] = [], n: unknown[] = [], h: unknown[] = [];
  for (let i = 1; i <= 60; i++) {
    const a = vbOldLog(6100 + i);
    v.push(vbFingerprintOne(a.cfg, a.acts));
    n.push(nbFingerprintOne(nbOldLog(6200 + i)));
    const b = hbOldLog(6300 + i);
    h.push(hbFingerprintOne(b.cfg, b.acts));
  }
  return { vb: sha(v), nb: sha(n), hb: sha(h) };
}
