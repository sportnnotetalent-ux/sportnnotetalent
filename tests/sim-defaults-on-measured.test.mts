/**
 * Wave 3, measured sports — simulation (quality mandate step 6; breaks
 * docs/security/breaks/defaults-on-measured.md). 600 random users, 100 per
 * scenario: new and old tournaments, weightlifting sessions, archery team
 * events, new and old golf rounds, timed races with partial splits, and the
 * Competition rules screen's Reset / explicit Off. After every one:
 *   - new events read the new defaults; old events (nothing stored) read OFF;
 *   - no stat key or stat-sheet row exists for a kind nobody entered;
 *   - results (places, totals, strokes) are the same with and without the new rules;
 *   - the split story / fastest finish never rest on a single timed runner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ruleOf, phaseRules, newEventRules, standardOf, changedRules, rulesFor, eventRules, phaseDiscipline,
  disciplineOf, rankEntries, recordLift, liftingOrder, winnerSplitStory, fastestFinish, splitDistancesFor,
  type CompRules, type EntryResult, type ResultEntry, type RankedEntry, type DisciplineDef,
} from '../src/data/results/index.ts';
import { newTournamentFormats } from '../src/data/standings.ts';
import { NEW_ROUND_TRACK, effectiveTrack, roundTrackOf, cleanTrack, withTrack } from '../src/sports/golf/track.ts';
import { roundStats, summarize, standardPar72, type GolfCard } from '../src/sports/golf/engine.ts';
import { golfStatSheet } from '../src/sports/golf/statSheet.ts';
import type { SportId } from '../src/core/types';

let seed = 20261108;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(xs: T[]): T => xs[rnd(xs.length)];
const row = (i: number, result: EntryResult, heat = 1): ResultEntry => ({ id: `e${i}`, athleteId: `p${i}`, name: `Athlete ${i}`, heat, result: { order: i, ...result } });
const HOSTILE: unknown[] = ['yes', 1, 0, null, {}, 'true', -1];
const MEASURED: SportId[] = ['athletics', 'swimming', 'cycling', 'rowing', 'canoe', 'archery', 'shooting', 'weightlifting', 'golf'] as SportId[];
const NEW_ON: Record<string, string[]> = { weightlifting: ['wlJury'], archery: ['archTeamArrows'] };
const STAY_OFF = ['wlLights', 'shootPen'];

/* 1 — new tournaments start ON; old ones read OFF; the organiser's choice wins */
function tournaments() {
  const sports = MEASURED.filter(() => rnd(2) === 0).concat(rnd(2) ? ['football' as SportId] : []);
  const own: Record<string, Record<string, unknown>> = {};
  for (const sp of sports) if (rnd(4) === 0) own[sp] = { [pick(['wlJury', 'archTeamArrows', 'wlLights', 'shootPen'])]: pick([true, false]) };
  const created = newTournamentFormats(sports, own) as Record<string, Record<string, unknown>>;
  for (const sp of sports) {
    const fmt = created[sp] ?? {};
    const phase = phaseRules(sp, fmt);
    for (const k of NEW_ON[sp] ?? []) {
      const chosen = own[sp]?.[k];
      assert.equal(ruleOf(phase, k), typeof chosen === 'boolean' ? chosen : true, `${sp}.${k} on a new tournament`);
    }
    const mine = (k: string) => rulesFor(sp).some((r) => r.key === k);
    for (const k of STAY_OFF) assert.equal(ruleOf(phase, k), mine(k) && own[sp]?.[k] === true, `${sp}.${k} stays as chosen / OFF`);
    // an old tournament: whatever else it stored, never these keys
    const old: Record<string, unknown> = {};
    if (rnd(2)) old.wlClock = pick(['iwf', 'off']);
    if (rnd(2)) old.wlChanges = pick([0, 2]);
    const oldPhase = phaseRules(sp, old);
    for (const k of [...(NEW_ON[sp] ?? []), ...STAY_OFF]) assert.equal(ruleOf(oldPhase, k), false, `${sp}.${k} old tournament OFF`);
    assert.equal(ruleOf({}, 'wlJury'), false);
    assert.equal(ruleOf(undefined, 'archTeamArrows'), false);
  }
}

/* 2 — weightlifting: jury ON changes nothing in the results */
function lifting() {
  const base = disciplineOf('wl.total')!;
  const n = 2 + rnd(6);
  const start = Array.from({ length: n }, () => 50 + rnd(60));
  const decisions = Array.from({ length: 60 }, () => ({ good: rnd(3) > 0, pass: rnd(12) === 0 }));
  const session = (rules: CompRules | undefined) => {
    let seq = 0, d = 0;
    let es: ResultEntry[] = start.map((kg, i) => row(i + 1, { bw: 60 + i, lifts: { snatch: [{ kg }], cj: [{ kg: kg + 20 }] } }));
    for (const lift of ['snatch', 'cj'] as const) {
      for (let step = 0; step < 3 * n; step++) {
        const call = liftingOrder(es, lift)[0];
        if (!call) break;
        const dec = decisions[d++ % decisions.length];
        es = es.map((e) => (e.id !== call.entryId ? e : { ...e, result: { ...e.result, lifts: { ...e.result.lifts, [lift]: recordLift(e.result.lifts?.[lift], dec.pass ? { pass: true } : { good: dec.good }, ++seq, rules) } } }));
      }
    }
    const def = phaseDiscipline(base, { rules });
    return { es, ranked: rankEntries(es, def) };
  };
  const old = session(undefined), fresh = session(newEventRules('weightlifting'));
  assert.deepEqual(fresh.es, old.es, 'the same attempts');
  assert.deepEqual(fresh.ranked.map((r) => [r.id, r.position, r.status]), old.ranked.map((r) => [r.id, r.position, r.status]), 'the same places');
  assert.equal(ruleOf(newEventRules('weightlifting'), 'wlLights'), false, 'lights stay OFF');
}

/* 3 — archery: team arrows ON for a new team event; individual events and old events unaffected */
function archery() {
  const key = pick(['arch.r70', 'arch.r70.team', 'arch.r70.mixed', 'arch.c50', 'arch.c50.team']);
  const def = disciplineOf(key)!;
  assert.ok(def, key);
  const team = /team|mixed/.test(key);
  const track: Record<string, unknown> = rnd(3) === 0 ? { archTeamArrows: pick([true, false, ...HOSTILE]) } : {};
  const fresh = eventRules(def, { rules: newEventRules('archery'), track: track as never });
  const old = eventRules(def, { rules: {}, track: track as never });
  const over = typeof track.archTeamArrows === 'boolean' && team ? track.archTeamArrows : undefined;
  assert.equal(ruleOf(fresh, 'archTeamArrows') === true, over ?? true, `${key} new event`);
  assert.equal(ruleOf(old, 'archTeamArrows') === true, over ?? false, `${key} old event`);
}

/* 4 — golf: new rounds track the six taps; nothing un-entered shows; strokes unchanged; old rounds unchanged */
function golf() {
  const holes = standardPar72().slice(0, pick([9, 18]));
  const received = holes.map(() => 0);
  const strokes = holes.map((h) => (rnd(8) === 0 ? null : h.par - 1 + rnd(4)));
  // the marker taps each kind on some holes, or never (independently)
  const taps = { putts: rnd(2), fairway: rnd(2), bunker: rnd(3) === 0, upDown: rnd(3) === 0, penalties: rnd(3) === 0, firstPutt: rnd(2) };
  let card: GolfCard = withTrack({ strokes }, holes.length, [...NEW_ROUND_TRACK]);
  card = {
    ...card,
    putts: card.putts!.map((_, i) => (taps.putts && strokes[i] != null && rnd(2) ? 1 + rnd(3) : null)),
    firDir: card.firDir!.map((_, i) => (taps.fairway && holes[i].par >= 4 && rnd(2) ? pick(['L', 'hit', 'R'] as const) : null)),
    bunker: card.bunker!.map(() => (taps.bunker && rnd(4) === 0 ? true : null)),
    offGreen: card.offGreen!.map(() => (taps.upDown && rnd(3) === 0 ? 1 + rnd(3) : null)),
    penalties: card.penalties!.map(() => (taps.penalties && rnd(4) === 0 ? 1 + rnd(2) : null)),
    firstPutt: card.firstPutt!.map((_, i) => (taps.firstPutt && rnd(2) ? rnd(4) : null) as number | null),
  };
  assert.ok(!card.drive, 'driving distance is not tracked on a new round');
  const s = roundStats(card, holes, received);
  const anyOn = (a: unknown[] | undefined, ok: (v: unknown) => boolean) => holes.some((_, i) => ok(a?.[i]));
  if (!anyOn(card.firDir, (v) => v != null)) assert.ok(!('firLeft' in s) && !('firRight' in s), 'no fairway zeros');
  if (!anyOn(card.offGreen, (v) => typeof v === 'number')) assert.ok(!('udChances' in s) && !('chipIns' in s), 'no up-and-down zeros');
  if (!anyOn(card.bunker, (v) => v === true)) assert.ok(!('sandSaves' in s), 'no sand-save zeros');
  if (!anyOn(card.penalties, (v) => typeof v === 'number' && v > 0)) assert.ok(!('penalties' in s), 'no penalty zeros');
  if (!anyOn(card.putts, (v) => typeof v === 'number')) assert.equal(s.puttHoles, 0, 'putts: not tracked');
  assert.ok(!('drives' in s));
  const keys = golfStatSheet({ card, holes, received }, []).flatMap((c) => c.rows);
  for (const r of keys) {
    // a row with nothing behind it reads "–", or isn't there; a count row is only for an entered kind
    if (r.key === 'firL' || r.key === 'firR') assert.ok(anyOn(card.firDir, (v) => v != null));
    if (r.key === 'pen') assert.ok(anyOn(card.penalties, (v) => typeof v === 'number' && v > 0));
    if (r.key === 'ud' || r.key === 'chip') assert.ok(anyOn(card.offGreen, (v) => typeof v === 'number'));
    if (r.key === 'sand') assert.ok(anyOn(card.bunker, (v) => v === true));
  }
  // the score is the strokes alone
  assert.deepEqual(summarize(card, holes, received), summarize({ strokes }, holes, received));
  // an old round in play: no format.track → the phone's choice ([] unless the marker set one)
  const phone = rnd(3) === 0 ? cleanTrack(pick([['putts'], ['putts', 'fairway', 'bunker', 'penalties'], [], ['junk', 'drive']])) : [];
  assert.deepEqual(effectiveTrack(roundTrackOf({ courseId: 'c', holes: '18' }), phone), phone);
  assert.deepEqual(effectiveTrack(roundTrackOf({ track: NEW_ROUND_TRACK }), phone), NEW_ROUND_TRACK);
}

let stories = 0;
/* 5 — timed races: partial splits never make a one-runner story */
function races() {
  const key = pick(['ath.800m', 'ath.1500m', 'ath.3000m', 'swim.200free', 'swim.400free', 'row.4p.2000', 'cyc.tp.4000']);
  const def: DisciplineDef = disciplineOf(key)!;
  assert.ok(def, key);
  const n = 2 + rnd(7);
  const who = rnd(4); // 0: nobody timed, 1: winner only, 2: some, 3: everyone
  const es: ResultEntry[] = Array.from({ length: n }, (_, i) => {
    const mark = 200 + i * 2 + rnd(3);
    const pts = splitDistancesFor(def.key, {}).length;
    const timed = who === 3 || (who === 2 && rnd(2) === 0) || (who === 1 && i === 0);
    const splits = timed && pts ? Array.from({ length: pts }, (_, k) => (rnd(5) === 0 ? null : Math.round((mark * (k + 1)) / (pts + 1)) + rnd(3))) : undefined;
    return row(i + 1, { mark, ...(rnd(10) === 0 ? { status: 'DNF' as const } : {}), ...(splits ? { splits } : {}) });
  });
  const ranked: RankedEntry[] = rankEntries(es, def);
  const plain = rankEntries(es.map((e) => ({ ...e, result: { ...e.result, splits: undefined } })), def);
  assert.deepEqual(ranked.map((r) => [r.id, r.position]), plain.map((r) => [r.id, r.position]), 'splits never change places');
  const ok = ranked.filter((r) => r.status === 'ok');
  const timedAt = (d: number) => ok.filter((r) => { const k = splitDistancesFor(def.key, r.entry.result).indexOf(d); return k >= 0 && r.entry.result.splits?.[k] != null; }).length;
  const story = winnerSplitStory(def, ranked);
  if (story) stories++;
  if (story) {
    const ds = splitDistancesFor(def.key, ranked.find((r) => r.position === 1)!.entry.result);
    assert.ok(ds.some((d) => timedAt(d) >= 2), `${def.key}: "${story}" rests on two or more timed runners`);
  }
  if (ok.filter((r) => r.entry.result.splits?.some((x) => x != null)).length < 2) {
    assert.equal(story, null, 'one timed runner → no story');
    assert.equal(fastestFinish(def, ranked), null, 'one timed runner → no fastest finish');
  }
}

/* 6 — the Competition rules screen: Reset → the new standard; an explicit Off is kept */
function screen() {
  const sp = pick(['weightlifting', 'archery', 'shooting', 'athletics', 'swimming']);
  const defs = rulesFor(sp);
  const reset: Record<string, unknown> = {};
  for (const r of defs) if (r.kind === 'choice' || r.kind === 'text') reset[r.key] = standardOf(r);
  for (const k of NEW_ON[sp] ?? []) assert.equal(reset[k], true, `${sp}.${k} Reset keeps the new default`);
  for (const k of STAY_OFF) if (k in reset) assert.equal(reset[k], false);
  // Save stores a new-event rule's value as is (never "unset") — then phases read it
  const off = { ...reset };
  for (const k of NEW_ON[sp] ?? []) off[k] = false;
  const norm = (r: (typeof defs)[number], v: unknown) => (v === undefined || v === null || v === '' || (v === r.default && !r.existing && r.newEvents === undefined) ? undefined : v);
  const stored = Object.fromEntries(defs.map((r) => [r.key, norm(r, off[r.key])]).filter(([, v]) => v !== undefined));
  for (const k of NEW_ON[sp] ?? []) {
    assert.equal(stored[k], false, 'the Off is stored');
    assert.equal(ruleOf(phaseRules(sp, stored), k), false);
    // and a re-seed / copy keeps it
    const again = newTournamentFormats([sp as SportId], { [sp]: stored } as never) as Record<string, Record<string, unknown>>;
    assert.equal(ruleOf(phaseRules(sp, again[sp]), k), false);
  }
  assert.deepEqual(changedRules(sp, newTournamentFormats([sp as SportId], {})[sp as SportId] as Record<string, unknown> ?? {}).map((r) => r.key), []);
}

test('600 users: measured stats to track ON for new events, old events unchanged', () => {
  const scenarios = [tournaments, lifting, archery, golf, races, screen];
  for (let u = 0; u < 600; u++) scenarios[u % scenarios.length]();
  assert.ok(stories > 10, `the split story was told (${stories} races)`);
});
