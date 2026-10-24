/**
 * Deep wave (volleyball-kabaddi) — kabaddi at PKL match-centre depth.
 *  • "Stats to track": raid skill and defenders touched (format keys or
 *    SET_TRACK; off by default — older states keep their shape).
 *  • The raid replay's derived extras (defenders faced, super-tackle chance,
 *    players on the mat) leave the score exactly as before.
 *  • Named touched defenders: who is out by name, `touchedOut` (keyed).
 *  • Raid-by-raid commentary, the PKL match centre (+ top performers), the
 *    deep player box, the Stats-to-track live settings.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, raidActions, outPlayers, replayOf, type KabaddiState, type RaidForm } from '../src/sports/kabaddi/engine.ts';
import { replayRaids } from '../src/sports/kabaddi/rules.ts';
import { kabaddiTotals, KABADDI_COUNT_KEYS } from '../src/sports/kabaddi/totals.ts';
import { kabaddiCommentary, raidSentence } from '../src/sports/kabaddi/commentary.ts';
import { kabaddiMatchStats } from '../src/sports/kabaddi/matchStats.ts';
import { kabaddiDeepBox, kabaddiPlayerCounts, KABADDI_DEEP_BOX } from '../src/sports/kabaddi/deepBox.ts';
import { KABADDI_LIVE_SETTINGS } from '../src/sports/kabaddi/settings.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { planLiveApply } from '../src/sports/liveSettings.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { statSchema } from '../src/sports/statSchemas.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction, StatTotalsContext } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const P = (id: string, fullName: string) => ({ id, fullName });
const H = [P('h1', 'Pardeep'), P('h2', 'Rahul'), P('h3', 'Sunil'), P('h4', 'Manjeet'), P('h5', 'Neeraj'), P('h6', 'Sachin'), P('h7', 'Vikas')];
const A = [P('a1', 'Arjun'), P('a2', 'Bhanu'), P('a3', 'Chetan'), P('a4', 'Deepak'), P('a5', 'Eshan'), P('a6', 'Fazel'), P('a7', 'Girish')];
const CFG = { playersPerSide: 7, style: 'sanjeevani', superTackle: true, doOrDie: true, caughtTouches: 'void', substitutes: 2 };
const CTX: StatTotalsContext = { players: { home: H.map((p) => ({ id: p.id, name: p.fullName })), away: A.map((p) => ({ id: p.id, name: p.fullName })) } };
const NAMES = { home: 'Patna', away: 'Bengaluru' };
/** IDs-only scoring: the log keeps ids; the squads name them when shown. */
const NAMED = { ...NAMES, homeRoster: H, awayRoster: A };
const squadName = (id?: string | null, legacy?: string | null) => [...H, ...A].find((p) => p.id === id)?.fullName ?? legacy ?? 'Player';

class Scorer {
  s: KabaddiState;
  actions: ScoreAction[] = [];
  constructor(cfg: Record<string, unknown> = CFG) { this.s = init(cfg); }
  push(a: ScoreAction) { this.s = reducer(this.s, a); this.actions.push(a); return this; }
  raid(f: Partial<RaidForm> & { side: Side }, minute = 3, half = 1) {
    for (const a of raidActions(this.s, { touches: 0, bonus: false, tackled: false, ...f })) this.push(a.type === 'REMOVE_EVENT' ? a : { ...a, payload: { ...a.payload, minute, half } });
    return this;
  }
}

describe('deep wave · Stats to track', () => {
  test('off by default (no key); format keys stamp it; SET_TRACK toggles from the next raid', () => {
    assert.equal('track' in init(CFG), false);
    assert.deepEqual(init({ ...CFG, trackSkills: true }).track, { skills: true });
    assert.deepEqual(init({ ...CFG, trackSkills: true, trackTouched: true }).track, { skills: true, touched: true });
    let s = init(CFG);
    s = reducer(s, { type: 'SET_TRACK', payload: { trackTouched: true } });
    assert.deepEqual(s.track, { touched: true });
    assert.equal(reducer(s, { type: 'SET_TRACK', payload: { trackTouched: true } }), s);
    s = reducer(s, { type: 'SET_TRACK', payload: { trackTouched: false, trackSkills: true } });
    assert.deepEqual(s.track, { skills: true });
    assert.equal(reducer(s, { type: 'SET_TRACK', payload: {} }), s);
  });

  test('live settings: read / defaults; before play a format patch, after it SET_TRACK', () => {
    const ls = KABADDI_LIVE_SETTINGS;
    const fresh = init(CFG);
    assert.deepEqual(ls.read(fresh), { trackSkills: false, trackTouched: false });
    assert.deepEqual(planLiveApply(ls, fresh, 0, ls.read(fresh), { trackSkills: true, trackTouched: false }), { kind: 'format', patch: { trackSkills: true } });
    const m = new Scorer().push({ type: 'KICKOFF', payload: { at: 1 } }).raid({ side: 'home', raider: H[0], touches: 1 });
    const plan = planLiveApply(ls, m.s, m.actions.length, ls.read(m.s), { trackSkills: false, trackTouched: true });
    assert.deepEqual(plan, { kind: 'event', action: { type: 'SET_TRACK', payload: { trackTouched: true } } });
  });

  test('a raid carries its skill and the touched defenders (capped at the touches); skill only on a scoring raid or an escape', () => {
    const m = new Scorer({ ...CFG, trackSkills: true, trackTouched: true });
    m.push({ type: 'KICKOFF', payload: { at: 1 } });
    m.raid({ side: 'home', raider: H[0], touches: 2, skill: 'running', touched: [A[0], A[1], A[2]] });
    const r = m.s.raids[0];
    assert.equal(r.sk, 'running');
    assert.deepEqual(r.touched, [{ id: 'a1' }, { id: 'a2' }]); // IDs-only scoring
    m.raid({ side: 'away', raider: A[3], skill: 'toe' }); // empty raid: the skill is dropped
    assert.equal(m.s.raids[1].sk, undefined);
    m.raid({ side: 'home', raider: H[1], skill: 'escape' }); // an escape on an empty raid stays
    assert.equal(m.s.raids[2].sk, 'escape');
    // who is out, by id (named when shown)
    assert.deepEqual(outPlayers(m.s).away, ['a1', 'a2']);
  });
});

describe('deep wave · replay extras leave the score alone', () => {
  test('defenders faced, super-tackle chance, players on the mat', () => {
    const raids = [
      { side: 'home' as const, touches: 4, bonus: false, raiderOut: false, v: 2 as const },
      { side: 'away' as const, touches: 0, bonus: false, raiderOut: false, v: 2 as const },
      { side: 'home' as const, touches: 0, bonus: false, raiderOut: true, v: 2 as const },
    ];
    const d = replayRaids(raids, { teamSize: 7, style: 'sanjeevani', proRules: true });
    assert.equal(d.perRaid[0].defBefore, 7);
    assert.deepEqual(d.perRaid[0].matAfter, { home: 7, away: 3 });
    assert.equal(d.perRaid[2].defBefore, 3);
    assert.equal(d.perRaid[2].stChance, true);
    assert.equal(d.perRaid[2].superTackle, true);
    assert.equal(d.home, 4);
    assert.equal(d.away, 2);
    assert.equal(replayRaids(raids, { teamSize: 7, style: 'sanjeevani', proRules: true, superTackle: false }).perRaid[2].stChance, undefined);
  });
});

describe('deep wave · touchedOut (keyed)', () => {
  test('written only when tracked; the touches that counted; an unknown name drops the key', () => {
    const plain = new Scorer().push({ type: 'KICKOFF', payload: { at: 1 } }).raid({ side: 'home', raider: H[0], touches: 2 });
    assert.equal('touchedOut' in kabaddiTotals(plain.s, CTX).h1.stats, false);
    const m = new Scorer({ ...CFG, trackTouched: true }).push({ type: 'KICKOFF', payload: { at: 1 } });
    m.raid({ side: 'home', raider: H[0], touches: 2, touched: [A[0], A[1]] });
    m.raid({ side: 'away', raider: A[2], touches: 1, touched: [H[1]], tackled: true, tackler: H[2] }); // caught: void touch
    const t = kabaddiTotals(m.s, CTX);
    assert.equal(t.a1.stats.touchedOut, 1);
    assert.equal(t.a2.stats.touchedOut, 1);
    assert.equal(t.h2?.stats.touchedOut ?? 0, 0);
    assert.equal(t.h1.stats.touchedOut, 0);
    const ghost = new Scorer({ ...CFG, trackTouched: true }).push({ type: 'KICKOFF', payload: { at: 1 } });
    ghost.push({ type: 'RAID_OUTCOME', side: 'home', payload: { touches: 1, bonus: false, raiderOut: false, v: 2, raiderId: 'h1', raiderName: 'Pardeep', touched: [{ name: 'Nobody' }], minute: 2, half: 1 }, attribution: { playerId: 'h1', stat: 'raidPoints', by: 1, playerName: 'Pardeep' } });
    assert.equal('touchedOut' in kabaddiTotals(ghost.s, CTX).h1.stats, false);
  });

  test('contract: live raid / tackle points = credits on every prefix; counts + touchedOut derived ≥ 0', () => {
    const sp: TotalsSport<KabaddiState> = {
      name: 'kabaddi', init, reducer, statTotals: kabaddiTotals, partial: true, config: { ...CFG, trackTouched: true, trackSkills: true }, ctx: CTX,
      derived: [...KABADDI_COUNT_KEYS, 'touchedOut', 'unsuccessfulTackles'], // round 2: + unsuccessful tackles
    };
    const m = new Scorer({ ...CFG, trackTouched: true, trackSkills: true }).push({ type: 'KICKOFF', payload: { at: 1 } });
    m.raid({ side: 'home', raider: H[0], touches: 2, bonus: true, skill: 'hand', touched: [A[0], A[1]] });
    m.raid({ side: 'away', raider: A[2], tackled: true, tackler: H[3], tackleType: 'ankle' });
    m.raid({ side: 'home', raider: H[0], touches: 1, touched: [A[3]] });
    assertContract(sp, toRecords(m.actions), { every: 1 });
  });
});

/** A short match: a bonus + touch raid, an empty raid, a tackle, a super raid,
 *  then raids into a do-or-die and an all-out. */
function match(): Scorer {
  const m = new Scorer({ ...CFG, trackSkills: true, trackTouched: true });
  m.push({ type: 'KICKOFF', payload: { at: 1 } });
  m.raid({ side: 'home', raider: H[0], touches: 2, bonus: true, skill: 'running', touched: [A[0], A[1]] }, 1);
  m.raid({ side: 'away', raider: A[2] }, 2);
  m.raid({ side: 'home', raider: H[1], tackled: true, tackler: A[3], tackleType: 'ankle' }, 3);
  m.raid({ side: 'away', raider: A[4], touches: 3, skill: 'kick' }, 4);
  m.push({ type: 'TIMEOUT', side: 'home', payload: { minute: 5, half: 1 } });
  m.push({ type: 'TECH_POINT', side: 'away', payload: { reason: 'delay', minute: 6, half: 1 } });
  m.push({ type: 'NEXT_HALF' });
  m.push({ type: 'KICKOFF', payload: { at: 2 } });
  m.raid({ side: 'home', raider: H[0], touches: 4, skill: 'toe' }, 21, 2);
  m.raid({ side: 'away', raider: A[2], touches: 1 }, 22, 2);
  m.raid({ side: 'home', raider: H[0], touches: 3, bonus: false, skill: 'hand' }, 23, 2);
  m.raid({ side: 'away', raider: A[2] }, 24, 2);
  m.raid({ side: 'home', raider: H[1], touches: 1 }, 25, 2); // the last defender → all out
  return m;
}

describe('deep wave · commentary', () => {
  test('sentences: points + skill, empty, tackle, super tackle, do-or-die fail, line-out, all out', () => {
    const b = (x: Record<string, unknown>) => ({ side: 'home', raidPts: 0, touchPts: 0, bonusPts: 0, raiderOut: false, doOrDie: false, doOrDieFail: false, tacklePts: 0, superTackle: false, allOuts: [], ...x }) as never;
    const r = (x: Record<string, unknown> = {}) => ({ side: 'home', touches: 0, bonus: false, raiderOut: false, raider: 'Pardeep Narwal', ...x }) as never;
    assert.equal(raidSentence(r({ sk: 'running' }), b({ raidPts: 3, touchPts: 2, bonusPts: 1 }), 23, NAMES).text, 'Raid 23 — Pardeep Narwal (Patna): 2 touch points + bonus (running hand touch)');
    assert.deepEqual(raidSentence(r(), b({ raidPts: 3, touchPts: 2, bonusPts: 1 }), 23, NAMES).tags, ['SUPER RAID']);
    assert.equal(raidSentence(r(), b({}), 4, NAMES).text, 'Raid 4 — Pardeep Narwal (Patna): empty raid');
    assert.equal(raidSentence(r({ tackler: 'Saurabh', tt: 'ankle' }), b({ raiderOut: true, tacklePts: 1 }), 5, NAMES).text, 'Raid 5 — Pardeep Narwal (Patna): tackled by Saurabh (Bengaluru) with ankle hold');
    const st = raidSentence(r({ tackler: 'Saurabh' }), b({ raiderOut: true, tacklePts: 2, superTackle: true }), 6, NAMES);
    assert.equal(st.text, 'Raid 6 — Pardeep Narwal (Patna): SUPER TACKLE by Saurabh (Bengaluru) (+2)');
    assert.deepEqual(st.tags, ['SUPER TACKLE']);
    const dod = raidSentence(r(), b({ raiderOut: true, doOrDie: true, doOrDieFail: true, tacklePts: 1 }), 7, NAMES);
    assert.equal(dod.text, 'Raid 7 — Pardeep Narwal (Patna): do-or-die raid failed — out, +1 to Bengaluru');
    assert.deepEqual(dod.tags, ['DO-OR-DIE']);
    assert.equal(raidSentence(r({ raider: undefined }), b({ raiderOut: true, lineOut: true }), 8, NAMES).text, 'Raid 8 — Patna raider: stepped out of bounds — out, +1 to Bengaluru');
    const ao = raidSentence(r(), b({ raidPts: 2, touchPts: 2, allOuts: ['home'] }), 9, NAMES);
    assert.equal(ao.text, 'Raid 9 — Pardeep Narwal (Patna): 2 touch points; ALL OUT — +2 to Patna');
    assert.deepEqual(ao.tags, ['ALL OUT']);
  });

  test('the feed: halves newest first, raids numbered, running score, timeout / technical point, touched + mat detail', () => {
    const m = match();
    const g = kabaddiCommentary(m.s, NAMED);
    assert.deepEqual(g.map((x) => x.title), ['2nd Half', '1st Half']);
    const h1 = [...g[1].entries].reverse();
    assert.equal(h1[0].text, 'Raid 1 — Pardeep (Patna): 2 touch points + bonus (running hand touch)');
    assert.equal(h1[0].score, '3-0');
    assert.equal(h1[0].stamp, "1'");
    assert.equal(h1[0].detail, 'Touched: Arjun and Bhanu · On the mat: Patna 7 · Bengaluru 5');
    assert.equal(h1[1].text, 'Raid 2 — Chetan (Bengaluru): empty raid');
    assert.equal(h1[2].text, 'Raid 3 — Rahul (Patna): tackled by Deepak (Bengaluru) with ankle hold');
    assert.equal(h1[2].score, '3-1');
    assert.equal(h1[3].text, 'Raid 4 — Eshan (Bengaluru): 3 touch points (kick)');
    assert.deepEqual(h1[3].tags, ['SUPER RAID']);
    assert.equal(h1[4].text, 'Timeout Patna');
    assert.equal(h1[5].text, 'Technical point to Bengaluru (+1) — delay of game');
    assert.equal(h1[5].score, '3-5');
    assert.equal(g[1].sub, 'Patna 3-5 Bengaluru in the half');
    // the 2nd half: Pardeep's 10th raid point → SUPER 10; an all-out
    const h2 = [...g[0].entries].reverse();
    assert.ok(h2.some((e) => e.tags?.includes('ALL OUT')));
    assert.ok(h2.some((e) => e.tags?.some((t) => t.startsWith('SUPER 10 — PARDEEP'))));
    assert.equal(g[0].entries[0].score, `${m.s.home}-${m.s.away}`); // the newest entry carries the score now
  });

  test('an old one-tap log reads as points (no invented detail)', () => {
    let s = init(CFG);
    s = reducer(s, { type: 'KICKOFF', payload: { at: 1 } });
    s = reducer(s, { type: 'RAID', side: 'home', payload: { minute: 2, half: 1, points: 2 }, attribution: { playerId: 'h1', stat: 'raidPoints', by: 2, playerName: 'Pardeep' } });
    const g = kabaddiCommentary(s, NAMES);
    assert.equal(g[0].entries[0].text, 'Raid points (+2) Patna — Pardeep');
    assert.equal(g[0].entries[0].score, '2-0');
  });
});

describe('deep wave · match centre', () => {
  test('points split, raiding, defending (super-tackle chances), skills, leaders; per half', () => {
    const m = match();
    const st = kabaddiMatchStats(m.s, 'all', squadName);
    const row = (cat: string, key: string) => st.cats.find((c) => c.id === cat)!.rows.find((r) => r.key === key)!;
    assert.deepEqual([row('points', 'bonus').home, row('points', 'bonus').away], ['1', '0']);
    assert.equal(row('points', 'techPts').away, '1');
    assert.equal(row('raiding', 'raids').home, '5');
    assert.equal(row('raiding', 'success').home, '4/5 (80%)');
    assert.deepEqual([row('allouts', 'inflicted').home, row('allouts', 'conceded').away], ['1', '1']);
    assert.equal(row('raiding', 'out').better, 'lower');
    assert.ok(st.cats.some((c) => c.id === 'skills'));
    assert.equal(row('skills', 'sk_running').home, '3');
    assert.equal(row('skills', 'tt_ankle').away, '1');
    assert.equal(st.leaders.home.raider?.name, 'Pardeep');
    assert.equal(st.leaders.home.raider?.id, 'h1');
    assert.equal(st.leaders.home.raider?.note, 'Super 10');
    assert.equal(st.leaders.away.defender?.name, 'Deepak');
    assert.equal(st.leaders.away.defender?.id, 'a4');
    // per half
    const h1 = kabaddiMatchStats(m.s, 1);
    assert.equal(h1.cats.find((c) => c.id === 'raiding')!.rows.find((r) => r.key === 'raids')!.home, '2');
  });

  test('an old one-tap match: points only (no raid counts)', () => {
    let s = init(CFG);
    s = reducer(s, { type: 'KICKOFF', payload: { at: 1 } });
    s = reducer(s, { type: 'RAID', side: 'home', payload: { minute: 2, half: 1 }, attribution: { playerId: 'h1', stat: 'raidPoints', by: 1, playerName: 'Pardeep' } });
    const st = kabaddiMatchStats(s);
    assert.deepEqual(st.cats.map((c) => c.id), ['points', 'flow']);
    assert.equal(st.cats[0].rows.some((r) => r.key === 'touch'), false);
  });

  test('super-tackle chances taken', () => {
    const m = new Scorer().push({ type: 'KICKOFF', payload: { at: 1 } });
    m.raid({ side: 'home', raider: H[0], touches: 4 });
    m.raid({ side: 'away', raider: A[0] });
    m.raid({ side: 'home', raider: H[1], tackled: true, tackler: A[1] });
    const row = kabaddiMatchStats(m.s).cats.find((c) => c.id === 'defending')!.rows.find((r) => r.key === 'stChance')!;
    assert.equal(row.away, '1/1 (100%)');
  });
});

describe('deep wave · deep box, schema', () => {
  test('per-player counts by half; the deep box columns', () => {
    const m = match();
    const c = kabaddiPlayerCounts(m.s); // IDs-only scoring: "side|id"
    assert.equal(c.get('home|h1')!.raids, 3);
    assert.equal(c.get('home|h1')!.bonusPoints, 1);
    assert.equal(c.get('away|a1')!.touchedOut, 1);
    assert.equal(c.get('away|a4')!.tackles, 1);
    assert.equal(kabaddiPlayerCounts(m.s, 1).get('home|h1')!.raids, 1);
    const t = buildBoxTable(KABADDI_DEEP_BOX, kabaddiDeepBox(m.s, { homeRoster: H as never, awayRoster: A as never }).data('all'));
    assert.deepEqual(t.columns.map((x) => x.abbr), ['RAID', 'TKL', 'PTS', 'R', 'SUC', 'EMP', 'OUT', 'TCH', 'BNS', 'SPR', 'DDP', 'TKS', 'SPT', 'ROUT', 'UTK']); // round 2: UTK
    const arjun = t.away.rows.find((r) => r.name === 'Arjun')!;
    assert.equal(arjun.playerId, 'a1');
    // an untracked match keeps the old three columns
    const plain = new Scorer().push({ type: 'KICKOFF', payload: { at: 1 } });
    plain.push({ type: 'RAID', side: 'home', payload: { minute: 2, half: 1 }, attribution: { playerId: 'h1', stat: 'raidPoints', by: 1, playerName: 'Pardeep' } });
    const t0 = buildBoxTable(KABADDI_DEEP_BOX, kabaddiDeepBox(plain.s, {}).data('all'));
    assert.deepEqual(t0.columns.map((x) => x.abbr), ['RAID', 'TKL', 'PTS']);
  });

  test('schemas validate; the new key is labelled; strike rate ranks with a minimum of raids', () => {
    assert.deepEqual(validateSchema(KABADDI_DEEP_BOX), []);
    const sch = statSchema('kabaddi')!;
    assert.equal(sch.stats.find((d) => d.key === 'touchedOut')?.label, 'Times raided out');
    const sr = sch.stats.find((d) => d.key === 'raidStrikeRate')!;
    assert.equal(sr.agg?.kind === 'rate' && sr.agg.qualifier?.den, 10);
    assert.ok(replayOf(match().s).perRaid.every((b) => typeof b.defBefore === 'number'));
  });
});
