/**
 * Volleyball-kabaddi round 2 — the founder's answers to the deep wave's open
 * questions (docs/sport-depth/deep-wave/volleyball-kabaddi-round2.md):
 *  • Volleyball Best Setter stays on set assists per set; a Best Libero slot
 *    is added (FIVB: digs + perfect receptions per set, min sets on court) —
 *    a per-set figure over two keys (statSchema `perSet` with SignedKeys).
 *  • Volleyball's Best receiver / digger / setter / libero slots are offered
 *    only when some match of the tournament tracked their category
 *    (`onlyIfTracked`, `awardSlotTracked`, `tournamentAwardSlots`).
 *  • Kabaddi "unsuccessful tackles" per defender from "Defenders touched":
 *    a named defender touched by a raider who got back
 *    (`unsuccessfulTacklers`) — statTotals (keyed), the match centre, the
 *    deep box and careers (+ tackle success %), only when tracked.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Player, SportId, StatLine } from '../src/core/types.ts';
import {
  TOURNAMENT_AWARD_SLOTS, awardSlotTracked, tournamentAwardSlots, rankAwardCandidates, defaultAwards, awardFormula, awardIcon,
} from '../src/data/ratings.ts';
import { minimumRows } from '../src/data/leaderMinimums.ts';
import { careerSections } from '../src/data/career.ts';
import { aggregateValue, statDefIn, statInputs, validateSchema } from '../src/sports/statSchema.ts';
import { statSchema } from '../src/sports/statSchemas.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import { init, reducer, raidActions, type KabaddiState, type RaidForm } from '../src/sports/kabaddi/engine.ts';
import {
  kabaddiTotals, unsuccessfulTacklers, KABADDI_COUNT_KEYS, KABADDI_UNSUCCESSFUL_TACKLE_KEY,
} from '../src/sports/kabaddi/totals.ts';
import { kabaddiMatchStats } from '../src/sports/kabaddi/matchStats.ts';
import { kabaddiDeepBox, kabaddiPlayerCounts, KABADDI_DEEP_BOX } from '../src/sports/kabaddi/deepBox.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction, StatTotalsContext } from '../src/sports/types.ts';

type Side = 'home' | 'away';
let n = 0;
const L = (playerId: string, sport: SportId, stats: Record<string, number>, matchId: string): StatLine =>
  ({ id: `r2-${n++}`, matchId, playerId, sport, stats, won: false });
const PL = (id: string, fullName: string): Player => ({ id, fullName, sports: [] });
const players = [PL('a', 'Asha'), PL('b', 'Bala'), PL('c', 'Chitra'), PL('d', 'Diya')];
const vbSchema = statSchema('volleyball')!;
const slotKeys = (lines: StatLine[], opts = {}, keep: string[] = []) => tournamentAwardSlots(lines, 'volleyball', opts, keep).map((s) => s.slot);
const BASE = ['mvp', 'points', 'aces', 'blocks', 'attackPoints', 'attackKills'];

/* ------------------------------ volleyball: Best libero ------------------------------ */

describe('round 2 · volleyball Best libero (FIVB: digs + perfect receptions per set)', () => {
  test('the slot: after Best setter, ranks by its own per-set figure, tournament only; Best setter still by set assists per set', () => {
    assert.deepEqual(validateSchema(vbSchema), []);
    const lib = vbSchema.awards.find((a) => a.stat === 'digsReceptionsPerSet')!;
    assert.equal(lib.tournamentLabel, 'Best libero');
    assert.equal(lib.match, false);
    assert.equal(lib.rankBy, undefined);
    assert.equal(awardIcon('volleyball', 'digsReceptionsPerSet'), '🎽');
    assert.equal(vbSchema.awards.find((a) => a.stat === 'setAssists')?.rankBy, 'setAssistsPerSet');
    assert.deepEqual(TOURNAMENT_AWARD_SLOTS.volleyball.slice(-2).map((s) => [s.slot, s.label]), [['setAssists', 'Best setter'], ['digsReceptionsPerSet', 'Best libero']]);
    // not a leaderboard (the pinned leader list is unchanged), but its minimum is the organiser's
    assert.equal(vbSchema.leaders.includes('digsReceptionsPerSet'), false);
    assert.deepEqual(minimumRows('volleyball').find((r) => r.key === 'digsReceptionsPerSet')?.text, 'min 5 sets');
  });

  test('perSet over two keys: only lines that tracked both (and say their sets) count; nothing tracked = not tracked', () => {
    const def = statDefIn(vbSchema, 'digsReceptionsPerSet')!;
    assert.deepEqual(statInputs(def), ['digs', 'receptionsPerfect']);
    const v = aggregateValue(vbSchema, def, [
      L('a', 'volleyball', { digs: 6, receptionsPerfect: 4, receptions: 9, setsPlayed: 3 }, 'm1'),
      L('a', 'volleyball', { digs: 3, receptionsPerfect: 1, receptions: 2, setsPlayed: 2 }, 'm2'),
      L('a', 'volleyball', { digs: 9, setsPlayed: 3 }, 'm3'), // digs only: no false 0 receptions
      L('a', 'volleyball', { digs: 2, receptionsPerfect: 2, receptions: 3 }, 'm4'), // no sets played: out
    ]);
    assert.equal(v.text, '2.80'); // (6 + 4 + 3 + 1) ÷ 5
    assert.equal(v.den, 5);
    assert.equal(v.games, 2);
    const none = aggregateValue(vbSchema, def, [L('a', 'volleyball', { digs: 9, setsPlayed: 3 }, 'm3'), L('a', 'volleyball', { points: 4, setsPlayed: 3 }, 'm5')]);
    assert.equal(none.tracked, false);
    // a single-key perSet reads as before
    assert.equal(aggregateValue(vbSchema, statDefIn(vbSchema, 'digsPerSet')!, [L('a', 'volleyball', { digs: 9, setsPlayed: 3 }, 'm3')]).text, '3.00');
  });

  test('ranking: min 5 sets on court, ties → more digs; the organiser can change the minimum; the prose names both keys', () => {
    const lines = [
      L('a', 'volleyball', { digs: 10, receptionsPerfect: 5, receptions: 8, setsPlayed: 5 }, 'v1'), // 3.00
      L('b', 'volleyball', { digs: 6, receptionsPerfect: 9, receptions: 12, setsPlayed: 5 }, 'v1'), // 3.00, fewer digs
      L('c', 'volleyball', { digs: 8, receptionsPerfect: 4, receptions: 6, setsPlayed: 3 }, 'v1'), // 4.00 but 3 sets
      L('d', 'volleyball', { digs: 0, receptionsPerfect: 0, receptions: 1, setsPlayed: 5 }, 'v1'), // 0.00: no "best" on 0
    ];
    const ranked = rankAwardCandidates(lines, players, 'volleyball', 'digsReceptionsPerSet');
    assert.deepEqual(ranked.map((c) => [c.name, c.display]), [['Asha', '3.00'], ['Bala', '3.00']]);
    assert.equal(ranked[0].detail, '3.00 D+R/S · 10 digs · 5 perfect receptions · 1 m');
    assert.deepEqual(rankAwardCandidates(lines, players, 'volleyball', 'digsReceptionsPerSet', 10, { mins: { digsReceptionsPerSet: 3 } }).map((c) => c.name), ['Chitra', 'Asha', 'Bala']);
    assert.equal(awardFormula('volleyball', 'digsReceptionsPerSet'),
      'Digs + perfect receptions per set: total digs + perfect receptions, divided by the sets the player was on court for. Players need at least 5 sets to rank. Ties: more digs, then more perfect receptions, then by name. You choose the winner.');
    // the single-key per-set prose is unchanged
    assert.match(awardFormula('volleyball', 'digs'), /^Digs per set: total digs, divided by the sets the player was on court for\./);
  });

  test('end to end: a match tracking dig + reception writes the keys the slot ranks by; the career shows the figure', () => {
    const P = (id: string, fullName: string) => ({ id, fullName });
    const H = [P('h1', 'Asha'), P('h2', 'Bela'), P('h3', 'Chitra'), P('h4', 'Diya'), P('h5', 'Esha'), P('h6', 'Fara')];
    const A = [P('a1', 'Uma'), P('a2', 'Vani'), P('a3', 'Wren'), P('a4', 'Xia'), P('a5', 'Yami'), P('a6', 'Zoya')];
    const court = (ps: typeof H) => ps.map((p) => ({ id: p.id, name: p.fullName }));
    const det = (kind: string, side: Side, p: { id: string; fullName: string }, q?: string): ScoreAction =>
      ({ type: 'VB_DETAIL', side, payload: { kind, player: { playerId: p.id, playerName: p.fullName }, ...(q ? { q } : {}) } });
    const acts: ScoreAction[] = [
      { type: 'LINEUP', payload: { team: 'home', players: court(H) } },
      { type: 'LINEUP', payload: { team: 'away', players: court(A) } },
      { type: 'SET_DETAIL', payload: { vbReception: true, vbDig: true } },
      det('reception', 'home', H[4], 'perfect'), det('dig', 'home', H[4]),
      vb.outcomeAction('attack', 'home', H[1]),
      det('reception', 'away', A[0], 'good'), det('dig', 'home', H[4]),
      vb.outcomeAction('attack', 'away', A[1]),
    ];
    const s = acts.reduce(vb.reducer, vb.init());
    const t = volleyballStatTotals(s);
    assert.equal(t.h5.stats.digs, 2);
    assert.equal(t.h5.stats.receptionsPerfect, 1);
    const lines = Object.entries(t).map(([id, e]) => L(id, 'volleyball', e.stats, 'e2e'));
    assert.ok(lines.every((l) => typeof l.stats.setsPlayed === 'number'));
    const esha = [PL('h5', 'Esha')];
    const c = rankAwardCandidates(lines, esha, 'volleyball', 'digsReceptionsPerSet', 10, { mins: { digsReceptionsPerSet: 0 } });
    assert.equal(c[0]?.name, 'Esha');
    assert.ok(slotKeys(lines).includes('digsReceptionsPerSet'));
    const def = careerSections(vbSchema, lines.filter((l) => l.playerId === 'h5')).find((x) => x.id === 'defence')!;
    assert.deepEqual(def.rows.map((r) => r.key), ['digs', 'digsPerSet', 'digsReceptionsPerSet']);
    // a player whose lines never tracked digs: no Defence section (never a 0)
    assert.equal(careerSections(vbSchema, [L('x', 'volleyball', { points: 5, setsPlayed: 3 }, 'm9')]).some((x) => x.id === 'defence'), false);
  });
});

/* -------------------- volleyball: optional-category slots only when tracked -------------------- */

describe('round 2 · volleyball optional-category award slots appear only when tracked', () => {
  test('no match tracked a category: the four slots are not offered (Best attacker is, as before)', () => {
    const lines = [L('a', 'volleyball', { points: 12, aces: 2, blocks: 1, attackPoints: 9, setsPlayed: 3 }, 'v1')];
    assert.deepEqual(slotKeys(lines), BASE);
    assert.deepEqual(slotKeys([]), BASE);
  });

  test('each slot opens on its own category; the libero needs digs AND reception grades on one match', () => {
    assert.deepEqual(slotKeys([L('a', 'volleyball', { digs: 0, setsPlayed: 3 }, 'v1')]), [...BASE, 'digs']);
    assert.deepEqual(slotKeys([L('a', 'volleyball', { setAssists: 2, setsPlayed: 3 }, 'v1')]), [...BASE, 'setAssists']);
    // the reception category (aced receivers named): Best receiver
    const rec = { receptions: 4, receptionsPerfect: 1, receptionsPositive: 2, receptionErrors: 1, setsPlayed: 3 };
    assert.deepEqual(slotKeys([L('a', 'volleyball', rec, 'v1')]), [...BASE, 'receptions']);
    // digs on one match, receptions on another: no line can give the libero figure
    assert.deepEqual(slotKeys([L('a', 'volleyball', { digs: 3, setsPlayed: 3 }, 'v1'), L('a', 'volleyball', rec, 'v2')]), [...BASE, 'receptions', 'digs']);
    assert.deepEqual(slotKeys([L('a', 'volleyball', { ...rec, digs: 3 }, 'v1')]), [...BASE, 'receptions', 'digs', 'digsReceptionsPerSet']);
  });

  test('an SD-81 match that only graded receptions (no aced receiver) can rank no Best receiver — not offered', () => {
    const sd81 = L('a', 'volleyball', { receptions: 4, receptionsPerfect: 1, receptionsPositive: 2, attackAttempts: 3, attackKills: 1, attackErrors: 0, attacksBlocked: 0, setsPlayed: 3 }, 'v1');
    assert.equal(awardSlotTracked('volleyball', 'receptions', [sd81]), false);
    assert.deepEqual(slotKeys([sd81]), BASE);
  });

  test('scoped to the tournament: another tournament’s tracked match does not open a slot', () => {
    const lines = [L('a', 'volleyball', { points: 3, setsPlayed: 3 }, 'mine'), L('a', 'volleyball', { digs: 4, setsPlayed: 3 }, 'other')];
    assert.deepEqual(slotKeys(lines, { matchIds: ['mine'] }), BASE);
    assert.deepEqual(slotKeys(lines, { matchIds: ['mine', 'other'] }), [...BASE, 'digs']);
    // other sports' lines never open a volleyball slot
    assert.deepEqual(slotKeys([L('a', 'kabaddi', { digs: 4 } as Record<string, number>, 'mine')]), BASE);
  });

  test('a slot that already holds an award stays listed (to see / clear it), in its place', () => {
    assert.deepEqual(slotKeys([], {}, ['setAssists']), [...BASE, 'setAssists']);
    assert.deepEqual(slotKeys([L('a', 'volleyball', { digs: 1, setsPlayed: 3 }, 'v1')], {}, ['receptions']), [...BASE, 'receptions', 'digs']);
  });

  test('suggested awards leave the slots out; other sports keep every slot', () => {
    const lines = [L('a', 'volleyball', { points: 12, aces: 2, blocks: 1, attackPoints: 9, setsPlayed: 5 }, 'v1')];
    const slots = defaultAwards(lines, players, 'volleyball').map((a) => a.slot);
    assert.ok(!slots.some((s) => ['receptions', 'digs', 'setAssists', 'digsReceptionsPerSet'].includes(s)));
    for (const sp of ['football', 'cricket', 'kabaddi', 'basketball', 'tennis'] as SportId[]) {
      assert.deepEqual(tournamentAwardSlots([], sp), TOURNAMENT_AWARD_SLOTS[sp], sp);
    }
    // only the four volleyball slots carry the switch
    const gated = (Object.keys(TOURNAMENT_AWARD_SLOTS) as SportId[]).flatMap((sp) => (statSchema(sp)?.awards ?? []).filter((a) => a.onlyIfTracked).map((a) => `${sp}/${a.stat}`));
    assert.deepEqual(gated, ['volleyball/receptions', 'volleyball/digs', 'volleyball/setAssists', 'volleyball/digsReceptionsPerSet']);
  });
});

/* ------------------------------ kabaddi: unsuccessful tackles ------------------------------ */

const KP = (id: string, fullName: string) => ({ id, fullName });
const KH = [KP('h1', 'Pardeep'), KP('h2', 'Rahul'), KP('h3', 'Sunil'), KP('h4', 'Manjeet'), KP('h5', 'Neeraj'), KP('h6', 'Sachin'), KP('h7', 'Vikas')];
const KA = [KP('a1', 'Arjun'), KP('a2', 'Bhanu'), KP('a3', 'Chetan'), KP('a4', 'Deepak'), KP('a5', 'Eshan'), KP('a6', 'Fazel'), KP('a7', 'Girish')];
const KCFG = { playersPerSide: 7, style: 'sanjeevani', superTackle: true, doOrDie: true, caughtTouches: 'void', substitutes: 2, trackTouched: true };
const KCTX: StatTotalsContext = { players: { home: KH.map((p) => ({ id: p.id, name: p.fullName })), away: KA.map((p) => ({ id: p.id, name: p.fullName })) } };

class Scorer {
  s: KabaddiState;
  actions: ScoreAction[] = [];
  constructor(cfg: Record<string, unknown> = KCFG) { this.s = init(cfg); this.push({ type: 'KICKOFF', payload: { at: 1 } }); }
  push(a: ScoreAction) { this.s = reducer(this.s, a); this.actions.push(a); return this; }
  raid(f: Partial<RaidForm> & { side: Side }, minute = 3, half = 1) {
    for (const a of raidActions(this.s, { touches: 0, bonus: false, tackled: false, ...f })) this.push(a.type === 'REMOVE_EVENT' ? a : { ...a, payload: { ...a.payload, minute, half } });
    return this;
  }
}

describe('round 2 · kabaddi unsuccessful tackles (Defenders touched)', () => {
  test('the definition: named defenders, only when the raider got back and his touches counted', () => {
    const r = { touched: [{ id: 'a1', name: 'Arjun' }, { id: 'a2', name: 'Bhanu' }] };
    assert.deepEqual(unsuccessfulTacklers(r, { raiderOut: false, touchPts: 2 }).map((p) => p.name), ['Arjun', 'Bhanu']);
    assert.deepEqual(unsuccessfulTacklers(r, { raiderOut: false, touchPts: 1 }).map((p) => p.name), ['Arjun']); // the touches that counted
    assert.deepEqual(unsuccessfulTacklers(r, { raiderOut: true, touchPts: 2 }), []); // caught: a successful tackle
    assert.deepEqual(unsuccessfulTacklers(r, { raiderOut: false, touchPts: 0 }), []); // touches void / bonus only
    assert.deepEqual(unsuccessfulTacklers({}, { raiderOut: false, touchPts: 2 }), []); // nobody named
  });

  test('statTotals: per defender, keyed with touchedOut; a partly named raid charges only those named', () => {
    const m = new Scorer();
    m.raid({ side: 'home', raider: KH[0], touches: 2, bonus: true, touched: [KA[0], KA[1]] }); // got back: Arjun, Bhanu
    m.raid({ side: 'away', raider: KA[2], touches: 2, touched: [KH[1]] }); // 2 touches, 1 named: Rahul only
    m.raid({ side: 'home', raider: KH[2], touches: 1 }); // nobody named: nobody charged
    m.raid({ side: 'away', raider: KA[3], tackled: true, tackler: KH[3] }); // a successful tackle
    const t = kabaddiTotals(m.s, KCTX);
    assert.equal(t.a1.stats.unsuccessfulTackles, 1);
    assert.equal(t.a2.stats.unsuccessfulTackles, 1);
    assert.equal(t.h2.stats.unsuccessfulTackles, 1);
    assert.equal(t.h4.stats.unsuccessfulTackles, 0); // tracked → a real 0
    assert.equal(t.h4.stats.tackles, 1);
    assert.equal(t.h1.stats.unsuccessfulTackles, 0);
    // not tracked → no key (never a 0)
    const plain = new Scorer({ ...KCFG, trackTouched: false }).raid({ side: 'home', raider: KH[0], touches: 2 });
    assert.equal(KABADDI_UNSUCCESSFUL_TACKLE_KEY in kabaddiTotals(plain.s, KCTX).h1.stats, false);
  });

  test('where touches still count on a caught raider: out (touchedOut) but not an unsuccessful tackle', () => {
    const m = new Scorer({ ...KCFG, caughtTouches: 'count' });
    m.raid({ side: 'home', raider: KH[0], touches: 1, tackled: true, tackler: KA[1], touched: [KA[0]] });
    const t = kabaddiTotals(m.s, KCTX);
    assert.equal(t.a1.stats.touchedOut, 1);
    assert.equal(t.a1.stats.unsuccessfulTackles, 0);
    assert.equal(t.a2.stats.tackles, 1);
  });

  test('an unknown name drops only the key it touches (never a partial count)', () => {
    const ghost = (raiderOut: boolean) => {
      const s0 = init({ ...KCFG, caughtTouches: 'count' });
      return [
        { type: 'KICKOFF', payload: { at: 1 } },
        { type: 'RAID_OUTCOME', side: 'home', payload: { touches: 1, bonus: false, raiderOut, v: 2, raiderId: 'h1', raiderName: 'Pardeep', ...(raiderOut ? { tacklerId: 'a2', tacklerName: 'Bhanu' } : {}), touched: [{ name: 'Nobody' }], minute: 2, half: 1 }, attribution: { playerId: 'h1', stat: 'raidPoints', by: 1, playerName: 'Pardeep' } },
      ].reduce((s, a) => reducer(s, a as ScoreAction), s0);
    };
    const back = kabaddiTotals(ghost(false), KCTX);
    assert.equal(KABADDI_UNSUCCESSFUL_TACKLE_KEY in back.h1.stats, false);
    assert.equal('touchedOut' in back.h1.stats, false);
    // the raider was caught: the ghost is only in touchedOut
    const caught = kabaddiTotals(ghost(true), KCTX);
    assert.equal('touchedOut' in caught.h1.stats, false);
    assert.equal(caught.h1.stats.unsuccessfulTackles, 0);
  });

  test('contract: the new key is derived, ≥ 0, on every prefix', () => {
    const sp: TotalsSport<KabaddiState> = {
      name: 'kabaddi', init, reducer, statTotals: kabaddiTotals, partial: true, config: KCFG, ctx: KCTX,
      derived: [...KABADDI_COUNT_KEYS, 'touchedOut', KABADDI_UNSUCCESSFUL_TACKLE_KEY],
    };
    const m = new Scorer();
    m.raid({ side: 'home', raider: KH[0], touches: 2, touched: [KA[0], KA[1]] });
    m.raid({ side: 'away', raider: KA[2], tackled: true, tackler: KH[3] });
    m.raid({ side: 'away', raider: KA[3], touches: 1, touched: [KH[4]] });
    assertContract(sp, toRecords(m.actions), { every: 1 });
  });

  test('match centre: a Defending row + coverage note when tracked; untracked matches unchanged', () => {
    const m = new Scorer();
    m.raid({ side: 'home', raider: KH[0], touches: 2, touched: [KA[0], KA[1]] }, 2);
    m.raid({ side: 'away', raider: KA[2], touches: 1 }, 3); // got back, nobody named
    m.raid({ side: 'home', raider: KH[1], tackled: true, tackler: KA[3] }, 4);
    const def = kabaddiMatchStats(m.s).cats.find((c) => c.id === 'defending')!;
    const row = def.rows.find((r) => r.key === 'unsuccTkl')!;
    assert.deepEqual([row.label, row.home, row.away, row.better], ['Unsuccessful tackles (defenders named)', '0', '2', 'lower']);
    assert.match(def.note ?? '', /Unsuccessful tackles = defenders named as touched by a raider who got back \(1 of 2 such raids named them\)\.$/);
    const plain = new Scorer({ ...KCFG, trackTouched: false }).raid({ side: 'home', raider: KH[0], touches: 2 });
    const d0 = kabaddiMatchStats(plain.s).cats.find((c) => c.id === 'defending')!;
    assert.equal(d0.rows.some((r) => r.key === 'unsuccTkl'), false);
    assert.equal(d0.note, 'Tackle attempts = successful tackles + raids that touched and got back.');
  });

  test('deep box: UTK per defender, per half; hidden on an untracked match', () => {
    const m = new Scorer();
    m.raid({ side: 'home', raider: KH[0], touches: 1, touched: [KA[0]] }, 2, 1);
    m.push({ type: 'NEXT_HALF' });
    m.push({ type: 'KICKOFF', payload: { at: 2 } });
    m.raid({ side: 'home', raider: KH[0], touches: 1, touched: [KA[0]] }, 22, 2);
    assert.equal(kabaddiPlayerCounts(m.s).get('away|Arjun')!.unsuccessfulTackles, 2);
    assert.equal(kabaddiPlayerCounts(m.s, 2).get('away|Arjun')!.unsuccessfulTackles, 1);
    const t = buildBoxTable(KABADDI_DEEP_BOX, kabaddiDeepBox(m.s, { homeRoster: KH as never, awayRoster: KA as never }).data('all'));
    const col = t.columns.findIndex((c) => c.abbr === 'UTK');
    assert.ok(col >= 0);
    assert.equal(t.away.rows.find((r) => r.name === 'Arjun')!.cells[col], '2');
    const plain = new Scorer({ ...KCFG, trackTouched: false }).raid({ side: 'home', raider: KH[0], touches: 1 });
    const t0 = buildBoxTable(KABADDI_DEEP_BOX, kabaddiDeepBox(plain.s, {}).data('all'));
    assert.equal(t0.columns.some((c) => c.abbr === 'UTK'), false);
  });

  test('careers: Unsuccessful tackles + Tackle success % only over matches that named the touched', () => {
    const kb = statSchema('kabaddi')!;
    assert.deepEqual(validateSchema(kb), []);
    assert.equal(kb.leaders.includes('unsuccessfulTackles') || kb.leaders.includes('tackleSuccessRate'), false); // careers, not leaders
    const counts = Object.fromEntries(KABADDI_COUNT_KEYS.map((k) => [k, 0]));
    const tracked = L('a1', 'kabaddi', { ...counts, raidPoints: 0, tacklePoints: 3, tackles: 3, touchedOut: 1, unsuccessfulTackles: 1 }, 'k1');
    const older = L('a1', 'kabaddi', { ...counts, raidPoints: 0, tacklePoints: 4, tackles: 4 }, 'k2');
    const rows = (ls: StatLine[]) => careerSections(kb, ls).find((x) => x.id === 'defending')!.rows;
    const r = rows([tracked, older]);
    assert.equal(r.find((x) => x.key === 'unsuccessfulTackles')?.value, '1');
    assert.deepEqual(r.find((x) => x.key === 'unsuccessfulTackles')?.coverage, { tracked: 1, total: 2 });
    assert.equal(r.find((x) => x.key === 'tackleSuccessRate')?.value, '75%'); // 3 ÷ (3 + 1): the older match's 4 tackles stay out
    // never tracked: neither row (no false 0, no false 100%)
    const r0 = rows([older]);
    assert.equal(r0.some((x) => x.key === 'unsuccessfulTackles' || x.key === 'tackleSuccessRate'), false);
  });
});
