/**
 * Court and team sports, batch 5 (docs/sport-expert/court-team.md: fixes 6
 * "Who was aced?", 9, 10, 12 + kabaddi technical-point reasons in Stats;
 * breaks: docs/security/breaks/court-team-batch5.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FormatField, ScoreAction } from '../src/sports/types.ts';
import { matchCaptures, liveOwnedKeys } from '../src/sports/matchRules.ts';
// volleyball
import * as vb from '../src/sports/volleyball/engine.ts';
import { VOLLEYBALL_META } from '../src/sports/volleyball/meta.ts';
import { VOLLEYBALL_LIVE_SETTINGS } from '../src/sports/volleyball/settings.ts';
import { detailCats, receptionTracked, acedTracked, detailTally } from '../src/sports/volleyball/detail.ts';
import { detailAction, sanctionAction } from '../src/sports/volleyball/actions.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import { volleyballMatchStats } from '../src/sports/volleyball/matchStats.ts';
import { volleyballDeepBox } from '../src/sports/volleyball/deepBox.ts';
import { volleyballCommentary, rallySentence } from '../src/sports/volleyball/commentary.ts';
// kabaddi
import * as kb from '../src/sports/kabaddi/engine.ts';
import { techPointAction, cardAction } from '../src/sports/kabaddi/actions.ts';
import { kabaddiMatchStats } from '../src/sports/kabaddi/matchStats.ts';
// handball
import * as hb from '../src/sports/handball/engine.ts';
import { handballDepthFigures } from '../src/sports/handball/depth.ts';
import { handballTotals } from '../src/sports/handball/totals.ts';
import { askKeeper, savedByActions } from '../src/sports/handball/savePrompt.ts';

type Side = 'home' | 'away';
const root = join(import.meta.dirname, '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');
const P = (id: string) => ({ id });
const NAMES = { home: 'Home', away: 'Away', nameOf: (id?: string | null, n?: string | null) => (id ? id.toUpperCase() : n ?? '') };

/** FormatEditor.defaultsFor (a new match's format), copied: the .tsx imports React Native. */
const defaultsFor = (fields: readonly FormatField[]): Record<string, unknown> => {
  const preset = fields.find((f) => f.type === 'preset');
  const out: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f.key, f.default]));
  const chosen = preset?.options?.find((o) => o.value === preset.default);
  if (chosen?.set) Object.assign(out, chosen.set);
  return out;
};
const vrun = (acts: ScoreAction[], cfg: Record<string, unknown> = {}) => acts.reduce(vb.reducer, vb.init(cfg));
const row = (st: ReturnType<typeof volleyballMatchStats>, cat: string, id: string) => st.cats.find((c) => c.id === cat)?.rows.find((r) => r.key === id);

/* ======================= volleyball: Who was aced? ======================= */
describe('volleyball · Who was aced? (its own category)', () => {
  const aceLog = (who = 'a1') => [vb.outcomeAction('ace', 'home', P('h1')), detailAction('aced', 'away', P(who))];

  test('V6: a new match starts with Set by and Who was aced on; attack attempts off', () => {
    const fmt = defaultsFor(VOLLEYBALL_META.formatFields ?? []);
    assert.equal(fmt.vbAced, true);
    // defaults-on DOC3 (wave 3): reception quality and digs are on for a new match too
    assert.deepEqual([...detailCats(vb.init(fmt))].sort(), ['aced', 'assist', 'dig', 'reception']);
    assert.equal(VOLLEYBALL_LIVE_SETTINGS.defaults.vbAced, true);
    assert.ok(liveOwnedKeys(VOLLEYBALL_LIVE_SETTINGS as never).includes('vbAced'), 'Edit format leaves it out');
    const caps = matchCaptures(VOLLEYBALL_LIVE_SETTINGS as never, vb.init(fmt)).captures;
    assert.equal(caps.find((c) => c.key === 'vbAced')?.on, true);
    // an old match (no key) lists it off
    assert.equal(matchCaptures(VOLLEYBALL_LIVE_SETTINGS as never, vb.init({})).captures.find((c) => c.key === 'vbAced')?.on, false);
  });

  test('V2/V3: aced alone credits a reception error, never a reception', () => {
    const s = vrun(aceLog(), { vbAced: true });
    assert.equal(receptionTracked(s), false);
    assert.equal(acedTracked(s), true);
    const t = volleyballStatTotals(s);
    assert.equal(t.a1.stats.receptionErrors, 1);
    assert.equal(t.a1.stats.receptions, undefined, 'no reception keys');
    assert.equal(t.a1.stats.receptionsPerfect, undefined);
    const l = [...detailTally(s).values()].find((x) => x.playerId === 'a1')!;
    assert.equal(l.receptions, 0);
    assert.equal(l.receptionErrors, 1);
    const ms = volleyballMatchStats(s);
    assert.equal(row(ms, 'reception', 'graded'), undefined, 'no reception % from errors alone');
    assert.equal(row(ms, 'reception', 'acedNamed')?.a, 1);
    const box = volleyballDeepBox(s, {}).data('all');
    const r = box.away.rows.find((x) => x.playerId === 'a1');
    assert.equal(r?.stats.receptionErrors, 1);
    assert.equal(r?.stats.receptions, undefined);
    const text = volleyballCommentary(s, NAMES).flatMap((g) => g.entries).map((e) => e.text).join(' | ');
    assert.match(text, /A1 couldn't receive it/);
  });

  test('V4: both on — one reception, one error', () => {
    const s = vrun(aceLog(), { vbAced: true, vbReception: true });
    const l = [...detailTally(s).values()].find((x) => x.playerId === 'a1')!;
    assert.equal(l.receptions, 1);
    assert.equal(l.receptionErrors, 1);
    assert.equal(volleyballStatTotals(s).a1.stats.receptions, 1);
  });

  test('V1: an old match (reception only, no aced key) counts exactly as before', () => {
    const s = vrun(aceLog(), { vbReception: true });
    const l = [...detailTally(s).values()].find((x) => x.playerId === 'a1')!;
    assert.equal(l.receptions, 1);
    assert.equal(l.receptionErrors, 1);
    assert.equal(receptionTracked(s), true);
    // a legacy toggle (no cats) too
    const s2 = vrun([{ type: 'SET_DETAIL', payload: { detail: true } }, ...aceLog()]);
    assert.equal([...detailTally(s2).values()][0].receptions, 1);
    assert.equal(receptionTracked(s2), true);
    // a deep-wave match with no aced category and an aced entry logged keeps counting it as reception
    const s3 = vrun([...aceLog()], { vbAssist: true });
    assert.equal(receptionTracked(s3), true);
    assert.equal([...detailTally(s3).values()][0].receptions, 1);
  });

  test('V1: aced switched on mid-match after reception was off — earlier rallies keep their meaning', () => {
    const s = vrun([
      ...aceLog('a1'),
      { type: 'SET_DETAIL', payload: { vbReception: true } },
      ...aceLog('a2'),
      { type: 'SET_DETAIL', payload: { vbReception: false, vbAced: true } },
      ...aceLog('a3'),
    ], { vbAssist: true });
    const by = (id: string) => [...detailTally(s).values()].find((x) => x.playerId === id)!;
    assert.equal(by('a2').receptions, 1, 'logged with reception on');
    assert.equal(by('a3').receptions, 0, 'logged with only aced on');
    assert.equal(by('a3').receptionErrors, 1);
  });

  test('V5: a non-boolean vbAced is ignored', () => {
    assert.deepEqual(detailCats(vb.init({ vbAced: 'yes' })), []);
    const s0 = vb.init({});
    assert.equal(vb.reducer(s0, { type: 'SET_DETAIL', payload: { vbAced: 1 } }), s0);
  });

  test('V7: the row is optional and asked only after an Ace', () => {
    const t = src('src/sports/volleyball/DetailRow.tsx');
    // describe-court-team DC14: the row is part of the one "Last point" card
    assert.match(t, /pt\.e\.kind === 'ace' && \(has\('aced'\) \|\| has\('reception'\)\) \? \{ kind: 'aced'/);
    // an aced entry with no Ace point is dropped
    const s = vrun([vb.outcomeAction('attack', 'home', P('h1')), detailAction('aced', 'away', P('a1'))], { vbAced: true });
    assert.equal((s.vd ?? []).length, 0);
  });
});

/* ======================= volleyball: discipline in Stats ======================= */
describe('volleyball · Discipline in Stats', () => {
  test('V8: every level counted once against the offender; penalties included', () => {
    const s = vrun([
      sanctionAction('home', 'warning', { player: P('h1') }),
      sanctionAction('home', 'penalty', { player: P('h1') }),
      sanctionAction('away', 'delayWarning'),
      sanctionAction('away', 'delayPenalty'),
      sanctionAction('home', 'expulsion', { player: P('h1') }),
      sanctionAction('away', 'disqualification', { player: P('a2') }),
    ]);
    const ms = volleyballMatchStats(s);
    const cat = ms.cats.find((c) => c.id === 'discipline');
    assert.ok(cat);
    const r = (id: string) => cat!.rows.find((x) => x.key === id);
    assert.deepEqual([r('warning')?.h, r('warning')?.a], [1, 0]);
    assert.deepEqual([r('penalty')?.h, r('penalty')?.a], [1, 0]);
    assert.deepEqual([r('expulsion')?.h, r('expulsion')?.a], [1, 0]);
    assert.deepEqual([r('disqualification')?.h, r('disqualification')?.a], [0, 1]);
    assert.deepEqual([r('delayWarning')?.h, r('delayWarning')?.a], [0, 1]);
    assert.deepEqual([r('delayPenalty')?.h, r('delayPenalty')?.a], [0, 1]);
  });
  test('V8: no sanctions, no category; set scope', () => {
    assert.equal(volleyballMatchStats(vrun([vb.outcomeAction('attack', 'home', P('h1'))])).cats.find((c) => c.id === 'discipline'), undefined);
    const s = vrun([sanctionAction('home', 'warning')]);
    assert.ok(volleyballMatchStats(s, 1).cats.find((c) => c.id === 'discipline'));
    assert.equal(volleyballMatchStats(s, 2).cats.find((c) => c.id === 'discipline'), undefined);
  });
});

/* ======================= volleyball: fault chips ======================= */
describe('volleyball · fault chips', () => {
  test('V10: Centre line, Catch / lift, Back-row / libero fault', () => {
    const labels = Object.fromEntries(vb.VB_ERROR_TYPES.map((t) => [t.key, t.label]));
    assert.equal(labels.foot, 'Centre line');
    assert.equal(labels.handling, 'Catch / lift');
    assert.equal(labels.backrow, 'Back-row / libero fault');
    const e = (err: string) => vrun([vb.outcomeAction('opperror', 'home', undefined, { err })]).events.at(-1)!;
    assert.match(rallySentence(e('handling'), NAMES), /catch \/ lift/);
    assert.match(rallySentence(e('backrow'), NAMES), /back-row \/ libero fault/);
    assert.match(rallySentence(e('foot'), NAMES), /centre-line fault/);
  });
  test('V9: foot, handling and backrow count as faults; an unknown type does not', () => {
    const s = vrun(['foot', 'handling', 'backrow', 'net', 'zzz'].map((err) => vb.outcomeAction('opperror', 'home', undefined, { err })));
    const r = row(volleyballMatchStats(s), 'scoring', 'oppFault');
    assert.equal(r?.h, 4);
  });
});

/* ======================= kabaddi: technical-point reasons ======================= */
describe('kabaddi · technical-point reasons in Stats', () => {
  const CFG = { playersPerSide: 7, style: 'sanjeevani', proRules: true, halfMinutes: 20 };
  const at = (a: ScoreAction, half = 1): ScoreAction => ({ ...a, payload: { ...a.payload, minute: 2, half } });
  const krun = (acts: ScoreAction[]) => acts.reduce(kb.reducer, kb.init(CFG));
  const disc = (s: kb.KabaddiState, scope: 'all' | number = 'all') => kabaddiMatchStats(s, scope).cats.find((c) => c.id === 'discipline');

  test('K1/K2/K4: rows by reason sum to the total', () => {
    const s = krun([
      at(techPointAction('home', { reason: 'coaching' })),
      at(techPointAction('home', { reason: 'coaching' })),
      at(techPointAction('home', { reason: 'cant' })), // an older log's reason
      at(techPointAction('away', { reason: 'delay' })),
      at(techPointAction('away', {})),
      at({ type: 'TECH_POINT', side: 'away', payload: { reason: 'hacked<script>' } }),
      at(cardAction('home', 'yellow', 'official', { tp: 1 })),
    ]);
    const d = disc(s)!;
    const r = (id: string) => d.rows.find((x) => x.key === id);
    const total = r('techAgainst')!;
    // conceded: away conceded the 3 home technical points; home conceded 3 + the card's 1
    assert.deepEqual([total.h, total.a], [4, 3]);
    assert.deepEqual([r('tech_coaching')?.h, r('tech_coaching')?.a], [0, 2]);
    assert.deepEqual([r('tech_cant')?.h, r('tech_cant')?.a], [0, 1]);
    assert.deepEqual([r('tech_delay')?.h, r('tech_delay')?.a], [1, 0]);
    assert.deepEqual([r('tech_card')?.h, r('tech_card')?.a], [1, 0]);
    assert.deepEqual([r('tech_none')?.h, r('tech_none')?.a], [2, 0]);
    assert.ok(!d.rows.some((x) => /hacked/.test(x.key + x.label)));
    const subs = d.rows.filter((x) => x.key.startsWith('tech_'));
    assert.equal(subs.reduce((t, x) => t + x.h, 0), total.h);
    assert.equal(subs.reduce((t, x) => t + x.a, 0), total.a);
  });
  test('K3: the half scope applies to the reason rows', () => {
    const s = krun([at(techPointAction('home', { reason: 'coaching' }), 1), at(techPointAction('home', { reason: 'delay' }), 2)]);
    const d1 = disc(s, 1)!;
    assert.equal(d1.rows.find((x) => x.key === 'tech_coaching')?.a, 1);
    assert.equal(d1.rows.find((x) => x.key === 'tech_delay'), undefined);
  });
});

/* ======================= handball: save with no keeper ======================= */
describe('handball · a save with no keeper set', () => {
  let u = 0;
  const A = (type: string, side: Side, payload: Record<string, unknown> = {}, extra: Partial<ScoreAction> = {}): ScoreAction =>
    ({ type, side, payload: { uid: `u${++u}`, sec: 10 * u, period: 1, ...payload }, ...extra });
  const missSaved = (shooter: Side, keeperId?: string): ScoreAction[] => {
    const id = `m${++u}`;
    const gk = shooter === 'home' ? 'away' : 'home';
    return [
      A('MISS', shooter, { shotType: 'nineM', result: 'saved', uid: id }),
      A('SAVE', gk, { ref: id, shotType: 'nineM' }, keeperId ? { attribution: { playerId: keeperId, stat: 'saves' } } : {}),
    ];
  };
  const hrun = (acts: ScoreAction[]) => acts.reduce(hb.reducer, hb.init({}));

  test('H1: the team keeps its save and save %', () => {
    const s = hrun([...missSaved('home'), A('GOAL', 'home', { shotType: 'nineM' })]);
    assert.equal(hb.teamFigures(s, 'away').saves, 1);
    assert.equal(handballDepthFigures(s, 'away').savePct, 50);
    assert.deepEqual(Object.keys(handballTotals(s)), []);
  });
  test('H2: naming the keeper logs the GK change, then the same shot, credited to him', () => {
    const s0 = hrun([]);
    assert.equal(askKeeper(s0, 'away', false), true);
    const r = savedByActions(s0, 'away', P('agk'));
    assert.equal(r.keeperId, 'agk');
    assert.equal(r.pre.length, 1);
    assert.equal(r.pre[0].type, 'GK');
    assert.equal(r.pre[0].payload?.spell, true);
    const s = hrun([...r.pre, ...missSaved('home', r.keeperId), A('GOAL', 'home', { shotType: 'sixM' })]);
    assert.equal(hb.currentKeeper(s, 'away')?.id, 'agk');
    const t = handballTotals(s);
    assert.equal(t.agk.stats.saves, 1);
    assert.equal(t.agk.stats.goalsConceded, 1);
    assert.equal(s.home, 1);
  });
  test('H2: an older log (GK with no spell, no line-up keeper) reads as before; a hostile spell is ignored', () => {
    for (const spell of [undefined, 'yes', 1]) {
      const s = hrun([{ type: 'GK', side: 'away', payload: { id: 'agk', ...(spell !== undefined ? { spell } : {}) } }, ...missSaved('home', 'agk'), A('GOAL', 'home', { shotType: 'sixM' })]);
      assert.equal(s.events[0].spell, undefined);
      const t = handballTotals(s);
      assert.equal(t.agk.stats.saves, 1);
      assert.equal(t.agk.stats.goalsConceded, undefined, 'unchanged: no keeper spell without a line-up keeper');
    }
  });
  test('H3: a keeper already set — no row, no extra event; editing — no row', () => {
    const s0 = hrun([{ type: 'GK', side: 'away', payload: { id: 'agk' } }]);
    assert.equal(askKeeper(s0, 'away', false), false);
    const r = savedByActions(s0, 'away', P('other'));
    assert.deepEqual(r, { pre: [], keeperId: 'agk' });
    assert.equal(askKeeper(hrun([]), 'away', true), false);
  });
  test('H4: no pick logs exactly what it does today', () => {
    assert.deepEqual(savedByActions(hrun([]), 'away', undefined), { pre: [] });
    const t = src('src/sports/handball/index.tsx');
    assert.match(t, /Who's in goal\?/);
    assert.match(t, /savedByActions\(/);
  });
});
