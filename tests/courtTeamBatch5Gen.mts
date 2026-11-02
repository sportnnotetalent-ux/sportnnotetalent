/**
 * Court-team batch 5 — seeded match generators for the simulation
 * (tests/sim-court-team-batch5.test.mts). Pure: the sport modules are passed
 * in, so the same old-style logs can be fingerprinted on the code before the
 * batch (recorded in the sim) and on the code now.
 */
import { createHash } from 'node:crypto';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The seeded RNG (quality mandate). */
export function makeRnd(n: number) {
  let seed = n;
  const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
  return rnd;
}
const pick = <T,>(rnd: (k: number) => number, xs: readonly T[]): T => xs[rnd(xs.length)];
const SIDES: Side[] = ['home', 'away'];
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const pl = (side: Side, i: number) => ({ id: `${side[0]}${i}` });

/* ------------------------------ volleyball ------------------------------ */
export const VB_OLD_CFGS: Record<string, unknown>[] = [{}, { vbReception: true }, { vbAssist: true }, { vbAttack: true, vbReception: true }, { detail: true }];
export const VB_NEW_CFGS: Record<string, unknown>[] = [{ vbAssist: true, vbAced: true }, { vbAced: true }, { vbAced: true, vbReception: true }, { vbAced: 'x' }];
const VB_OLD_ERR = [undefined, 'net', 'rotation', 'hits', 'attackout', 'blockout'];
const VB_NEW_ERR = [...VB_OLD_ERR, 'foot', 'handling', 'backrow', 'zzz'];
const LEVELS = ['warning', 'penalty', 'expulsion', 'disqualification', 'delayWarning', 'delayPenalty'];

export function vbLog(seed: number, oldStyle: boolean): { cfg: Record<string, unknown>; acts: ScoreAction[] } {
  const rnd = makeRnd(seed);
  const cfg = pick(rnd, oldStyle ? VB_OLD_CFGS : [...VB_OLD_CFGS, ...VB_NEW_CFGS]);
  const acts: ScoreAction[] = [];
  const n = 40 + rnd(140);
  const m = (vb: Any) => vb; void m;
  for (let i = 0; i < n; i++) {
    const side = pick(rnd, SIDES);
    const p = pl(side, rnd(6));
    const r = rnd(22);
    if (r < 6) acts.push({ __o: ['attack', side, p] } as Any);
    else if (r < 8) acts.push({ __o: ['block', side, p] } as Any);
    else if (r < 11) {
      acts.push({ __o: ['ace', side, p] } as Any);
      if (rnd(2)) acts.push({ __d: ['aced', other(side), pl(other(side), rnd(6))] } as Any);
    } else if (r < 13) acts.push({ __o: ['opperror', side, undefined, { err: pick(rnd, oldStyle ? VB_OLD_ERR : VB_NEW_ERR), ...(rnd(2) ? { by: pl(other(side), rnd(6)) } : {}) }] } as Any);
    else if (r < 14) acts.push({ __o: ['serveerror', side, undefined] } as Any);
    else if (r < 15) acts.push({ __s: [side, pick(rnd, LEVELS), rnd(2) ? p : null] } as Any);
    else if (r < 16) acts.push({ __d: ['reception', side, p, pick(rnd, ['perfect', 'good', 'poor'])] } as Any);
    else if (r < 17) {
      const patches: Record<string, unknown>[] = oldStyle
        ? [{ vbReception: true }, { vbReception: false }, { vbAssist: true }, { detail: true }, { detail: false }, { vbAttack: true }]
        : [{ vbReception: true }, { vbReception: false }, { vbAced: true }, { vbAced: false }, { vbAced: 'yes' }, { vbAced: true, vbReception: false }, { detail: false }, { detail: true }];
      acts.push({ type: 'SET_DETAIL', payload: pick(rnd, patches) });
    } else if (r < 18) acts.push({ __d: ['assist', side, p] } as Any);
    else if (r < 19) acts.push({ __d: ['dig', side, p] } as Any);
    else if (r < 20) acts.push({ __d: ['inplay', side, p] } as Any);
    else acts.push({ __o: ['attack', side, p] } as Any);
  }
  return { cfg, acts };
}

/** Turn the generator's placeholders into real actions with the given modules. */
export function vbActions(mods: Any, acts: ScoreAction[]): ScoreAction[] {
  return acts.map((a: Any) => {
    if (a.__o) return mods.vb.outcomeAction(...a.__o);
    if (a.__d) return mods.actions.detailAction(...a.__d);
    if (a.__s) return mods.actions.sanctionAction(a.__s[0], a.__s[1], { player: a.__s[2] });
    return a;
  });
}

export function vbFingerprintOne(mods: Any, cfg: Record<string, unknown>, acts: ScoreAction[]) {
  const s = vbActions(mods, acts).reduce(mods.vb.reducer, mods.vb.init(cfg));
  const ms = mods.matchStats.volleyballMatchStats(s);
  return {
    state: s,
    totals: mods.totals.volleyballStatTotals(s),
    // numbers only, without the rows / categories this batch adds
    stats: ms.cats.filter((c: Any) => c.id !== 'discipline').map((c: Any) => [c.id, c.rows.filter((r: Any) => r.key !== 'acedNamed').map((r: Any) => [r.key, r.h, r.a])]),
    feed: mods.commentary.volleyballCommentary(s, { home: 'H', away: 'A' }),
  };
}

/* ------------------------------- kabaddi -------------------------------- */
const KB_CFG = { playersPerSide: 7, style: 'sanjeevani', proRules: true, halfMinutes: 20 };
const KB_OLD_REASONS = [undefined, 'cant', 'coaching', 'delay', 'twoRaiders', 'entry', 'other'];
const KB_NEW_REASONS = [...KB_OLD_REASONS, 'hacked', ''];

export function kbRun(mods: Any, seed: number, oldStyle: boolean) {
  const rnd = makeRnd(seed);
  const { kb, actions } = mods;
  let s = kb.init(KB_CFG);
  const n = 30 + rnd(60);
  let side: Side = 'home';
  for (let i = 0; i < n && !s.ended; i++) {
    const minute = Math.floor((i * 40) / n) + 1;
    const half = minute > 20 ? 2 : 1;
    const stamp = (a: ScoreAction): ScoreAction => ({ ...a, payload: { ...a.payload, minute, half } });
    const r = rnd(10);
    let acts: ScoreAction[];
    if (r < 7) {
      const tackled = rnd(4) === 0;
      acts = kb.raidActions(s, { side, touches: tackled ? 0 : rnd(3), bonus: false, tackled, ...(rnd(2) ? { raider: pl(side, rnd(7)) } : {}) });
      side = other(side);
    } else if (r < 9) {
      acts = [actions.techPointAction(pick(rnd, SIDES), { reason: pick(rnd, oldStyle ? KB_OLD_REASONS : KB_NEW_REASONS) })];
    } else {
      acts = [actions.cardAction(pick(rnd, SIDES), pick(rnd, ['green', 'yellow']), 'official', { tp: rnd(2) })];
    }
    s = acts.map(stamp).reduce(kb.reducer, s);
  }
  return s;
}

export function kbFingerprintOne(mods: Any, s: Any) {
  const ms = mods.matchStats.kabaddiMatchStats(s);
  return {
    state: s,
    totals: mods.totals.kabaddiTotals(s),
    stats: ms.cats.map((c: Any) => [c.id, c.rows.filter((r: Any) => !String(r.key).startsWith('tech_')).map((r: Any) => [r.key, r.h, r.a])]),
  };
}

/* ------------------------------- handball ------------------------------- */
/** A handball log. `mode`: 'old' (GK without `spell`), 'new' (the save
 *  screen's "Who's in goal?" via savedByActions, Set keeper via namedKeeperAction). */
export function hbLog(mods: Any, seed: number, mode: 'old' | 'new'): { acts: ScoreAction[]; picks: number } {
  const rnd = makeRnd(seed);
  const { hb, save } = mods;
  let s = hb.init({});
  const acts: ScoreAction[] = [];
  let u = 0;
  let picks = 0;
  const fire = (a: ScoreAction) => { acts.push(a); s = hb.reducer(s, a); };
  const n = 30 + rnd(60);
  for (let i = 0; i < n; i++) {
    const sec = 20 * (i + 1);
    const at = (a: ScoreAction): ScoreAction => ({ ...a, payload: { uid: `u${++u}`, sec, period: 1, ...a.payload } });
    const sd = pick(rnd, SIDES);
    const ks = other(sd);
    const r = rnd(10);
    const shotType = pick(rnd, ['sixM', 'nineM', 'wing', 'breakthrough', 'fastBreak', 'sevenM']);
    if (r < 4) fire(at({ type: 'GOAL', side: sd, payload: { shotType } }));
    else if (r < 8) {
      const id = `m${++u}`;
      let keeperId: string | undefined;
      if (mode === 'new') {
        const res = save.savedByActions(s, ks, rnd(2) ? pl(ks, 0 + rnd(2)) : undefined);
        if (res.pre.length) picks++;
        for (const a of res.pre) fire(at(a));
        keeperId = res.keeperId;
      } else keeperId = hb.currentKeeper(s, ks)?.id;
      fire(at({ type: 'MISS', side: sd, payload: { shotType, result: 'saved', uid: id } }));
      fire(at({ type: 'SAVE', side: ks, payload: { ref: id, shotType }, ...(keeperId ? { attribution: { playerId: keeperId, stat: 'saves' } } : {}) }));
    } else if (r < 9) {
      const p = pl(ks, rnd(3));
      fire(at(mode === 'new' ? save.namedKeeperAction(ks, p) : { type: 'GK', side: ks, payload: { id: p.id } }));
    } else fire(at({ type: 'MISS', side: sd, payload: { shotType, result: 'missed' } }));
  }
  return { acts, picks };
}

export function hbFingerprintOne(mods: Any, acts: ScoreAction[]) {
  const s = acts.reduce(mods.hb.reducer, mods.hb.init({}));
  return {
    state: s,
    totals: mods.totals.handballTotals(s),
    depth: SIDES.map((x) => mods.depth.handballDepthFigures(s, x)),
  };
}

export const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

/** The old-style fingerprint: 60 logs per sport, none using what this batch adds. */
export function oldFingerprint(mods: Any): { vb: string; kb: string; hb: string } {
  const v: unknown[] = [], k: unknown[] = [], h: unknown[] = [];
  for (let i = 1; i <= 60; i++) {
    const { cfg, acts } = vbLog(1000 + i, true);
    v.push(vbFingerprintOne(mods, cfg, acts));
    k.push(kbFingerprintOne(mods, kbRun(mods, 2000 + i, true)));
    h.push(hbFingerprintOne(mods, hbLog(mods, 3000 + i, 'old').acts));
  }
  return { vb: sha(v), kb: sha(k), hb: sha(h) };
}
