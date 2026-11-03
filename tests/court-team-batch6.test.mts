/**
 * Court and team sports, batch 6 — the P2 items (docs/sport-expert/court-team.md
 * fixes 11, 13, 14; breaks: docs/security/breaks/court-team-batch6.md):
 * handball "Not sure" position, passive-play warning, "7 m caused by";
 * volleyball video challenge; netball toss-up.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoreAction } from '../src/sports/types.ts';
// handball
import * as hb from '../src/sports/handball/engine.ts';
import { handballDepthFigures } from '../src/sports/handball/depth.ts';
import { handballTotals } from '../src/sports/handball/totals.ts';
import { handballFeed } from '../src/sports/handball/feed.ts';
import { describeEvent as hbDescribe } from '../src/sports/handball/timeline.ts';
import { handballTickerFlash } from '../src/sports/handball/ticker.ts';
import { handballStats, handballCentre } from '../src/sports/handball/stats.ts';
import { HANDBALL_TRACK_FIELDS } from '../src/sports/handball/meta.ts';
// volleyball
import * as vb from '../src/sports/volleyball/engine.ts';
import { challengeAction, sanctionAction } from '../src/sports/volleyball/actions.ts';
import { volleyballMatchStats } from '../src/sports/volleyball/matchStats.ts';
import { volleyballCommentary } from '../src/sports/volleyball/commentary.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
// netball
import * as nb from '../src/sports/netball/engine.ts';
import { netballPanel } from '../src/sports/netball/panel.ts';
import { nbTeamFigures, centreSplit } from '../src/sports/netball/deep.ts';
import { netballFeed } from '../src/sports/netball/commentary.ts';
import { describeEvent as nbDescribe } from '../src/sports/netball/timeline.ts';

type Side = 'home' | 'away';
const root = join(import.meta.dirname, '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');
const NAMES = { home: 'Home', away: 'Away' };
const nameOf = (id?: string | null, n?: string | null) => (id ? id.toUpperCase() : n ?? '');

/* =============================== handball =============================== */
let u = 0;
const A = (type: string, side: Side | undefined, payload: Record<string, unknown> = {}, extra: Partial<ScoreAction> = {}): ScoreAction =>
  ({ type, ...(side ? { side } : {}), payload: { uid: `u${++u}`, sec: 10 * u, period: 1, ...payload }, ...extra });
const hrun = (acts: ScoreAction[], cfg: Record<string, unknown> = {}) => acts.reduce(hb.reducer, hb.init(cfg));
const attr = (playerId: string, stat: string) => ({ attribution: { playerId, stat, by: 1 } });
const XI = (sd: Side) => ({ type: 'XI', payload: { team: sd, gk: { id: `${sd[0]}gk` }, players: [1, 2, 3, 4, 5, 6].map((k) => ({ id: `${sd[0]}${k}` })).concat({ id: `${sd[0]}gk` }) } }) as ScoreAction;

describe('handball · "Not sure" on the position grid', () => {
  test('HN1: an absent or hostile shot type still reads as 9 m (old logs)', () => {
    for (const st of [undefined, 'zzz', 7, null, 'Unknown']) {
      const s = hrun([A('GOAL', 'home', st === undefined ? {} : { shotType: st }, attr('h1', 'goals'))]);
      assert.equal(s.events[0].shotType, 'nineM', String(st));
      assert.equal(s.events[0].unsure, undefined);
      assert.equal(handballTotals(s).h1.stats.nineMGoals, 1);
    }
  });
  test('HN2: a "Not sure" goal is a goal and an attempt, no position', () => {
    const s = hrun([XI('home'), XI('away'), A('GOAL', 'home', { shotType: 'unknown' }, attr('h1', 'goals')), A('GOAL', 'home', { shotType: 'wing' }, attr('h2', 'goals'))]);
    const e = s.events[0];
    assert.equal(e.unsure, true);
    assert.equal(e.shotType, undefined);
    assert.deepEqual(hb.eventCredits(e).first?.stats, { goals: 1, shots: 1 });
    const t = handballTotals(s);
    assert.equal(t.h1.stats.goals, 1);
    assert.equal(t.h1.stats.shots, 1);
    assert.equal(t.h1.stats.nineMGoals, undefined, 'no 9 m guess');
    const f = hb.teamFigures(s, 'home');
    assert.equal(f.goals, 2);
    assert.equal(f.byType.nineM.goals, 0);
    assert.equal(f.unsureGoals, 1);
    assert.equal(f.unsureShots, 1);
    const d = handballDepthFigures(s, 'home');
    assert.equal(d.unsureGoals, 1);
    assert.equal(d.unsureShots, 1);
    // the keeper concedes it (save %), but no position conceded
    assert.equal(t.agk.stats.goalsConceded, 2);
    assert.equal(t.agk.stats.nineMConceded, 0);
    assert.equal(t.agk.stats.wingConceded, 1);
  });
  test('HN2: a match with no "Not sure" attempt has no such figure', () => {
    const s = hrun([A('GOAL', 'home', { shotType: 'sixM' })]);
    assert.equal(handballDepthFigures(s, 'home').unsureGoals, undefined);
    assert.equal(handballDepthFigures(s, 'home').unsureShots, undefined);
  });
  test('HN3: a "Not sure" save keeps the save and save %, no position save', () => {
    const s = hrun([XI('away'), A('MISS', 'home', { shotType: 'unknown', result: 'saved', uid: 'm1' }, attr('h1', 'shots')), A('SAVE', 'away', { shotType: 'unknown', ref: 'm1' }, attr('agk', 'saves'))]);
    assert.equal(s.events[0].unsure, true);
    assert.equal(s.events[1].unsure, true);
    const t = handballTotals(s);
    assert.equal(t.agk.stats.saves, 1);
    assert.equal(t.agk.stats.nineMSaves, 0);
    assert.equal(t.h1.stats.shots, 1);
    assert.equal(t.h1.stats.nineMShots, undefined);
    assert.equal(handballDepthFigures(s, 'away').savePct, 100);
    assert.equal(handballDepthFigures(s, 'away').nineMSavePct, undefined);
  });
  test('HN4: commentary, timeline and the goal flash don\'t say 9 m', () => {
    const s = hrun([A('GOAL', 'home', { shotType: 'unknown' }, attr('h1', 'goals')), A('MISS', 'away', { shotType: 'unknown', result: 'missed' })]);
    const feed = handballFeed(s, NAMES, nameOf);
    for (const f of feed) assert.doesNotMatch(f.text, /9 m|9 metres/, f.text);
    assert.match(feed[0].text, /H1 \(Home\) scores\./);
    assert.match(feed[1].text, /misses\./);
    for (const e of s.events) assert.doesNotMatch(hbDescribe(e).label, /9 m/);
    const flash = handballTickerFlash(hb.init({}), s.events.slice(0, 1).reduce((x) => x, { ...s, events: s.events.slice(0, 1) }), nameOf);
    assert.ok(flash && !/9 m/.test(flash.sub ?? ''));
  });
  test('HN5/U1: the grid offers "Not sure" for a goal and a shot, never on the 7 m flow', () => {
    const t = src('src/sports/handball/index.tsx');
    assert.match(t, /Not sure/);
    assert.match(t, /pick\(UNSURE_SHOT\)/);
    assert.equal(hb.UNSURE_SHOT, 'unknown');
    // the 7 m flow still logs 'sevenM' only
    assert.match(t, /miss\(sd, 'sevenM'/);
  });
});

describe('handball · passive-play warning', () => {
  test('HP1: no score, no credit, no clock stop, not a technical fault', () => {
    const base = [A('CLOCK', undefined, { run: true, at: 1000 })];
    const s = hrun([...base, A('PASSIVE', 'home', { at: 5000 })]);
    assert.equal(s.events.length, 1);
    assert.equal(s.events[0].type, 'passive');
    assert.equal(s.home + s.away, 0);
    assert.ok(s.clock.since, 'the clock keeps running');
    assert.deepEqual(hb.eventCredits(s.events[0]), {});
    assert.equal(hb.teamFigures(s, 'home').technicalFaults, 0);
    assert.equal(handballDepthFigures(s, 'home').passiveWarnings, 1);
    assert.equal(handballDepthFigures(s, 'away').passiveWarnings, 0);
    assert.match(handballFeed(s, NAMES, nameOf)[0].text, /[Pp]assive-play warning/);
    assert.match(hbDescribe(s.events[0]).label, /Passive-play warning/);
    assert.equal(handballDepthFigures(hrun([]), 'home').passiveWarnings, undefined, 'only once one is given');
  });
  test('HP2: no side → ignored; a removal takes it out', () => {
    assert.equal(hrun([A('PASSIVE', undefined)]).events.length, 0);
    const s = hrun([A('PASSIVE', 'away', { uid: 'p1' }), A('REMOVE_EVENT', undefined, { id: 'p1' })]);
    assert.equal(s.events.length, 0);
  });
  test('U1: it sits under Turnover (no new step)', () => {
    assert.match(src('src/sports/handball/index.tsx'), /type: 'PASSIVE'/);
  });
});

describe('handball · 7 m caused by', () => {
  test('HC1: the defender is credited, the score unchanged, a removal reverses it', () => {
    const s = hrun([A('CAUSED', 'away', { uid: 'c1' }, attr('a4', 'sevenMCaused')), A('GOAL', 'home', { shotType: 'sevenM' })], { trackSevenMDrawn: true });
    assert.equal(s.events[0].type, 'caused');
    assert.deepEqual(hb.eventCredits(s.events[0]).first?.stats, { sevenMCaused: 1 });
    assert.equal(s.home, 1);
    assert.equal(s.away, 0);
    const t = handballTotals(s);
    assert.equal(t.a4.side, 'away');
    assert.equal(t.a4.stats.sevenMCaused, 1);
    assert.match(handballFeed(s, NAMES, nameOf)[0].text, /A4 \(Away\)/);
    assert.ok(hb.LIVE_KEYS.includes('sevenMCaused' as never));
    assert.ok(handballStats.stats.some((x) => x.key === 'sevenMCaused'));
    assert.ok(handballCentre.some((c) => c.rows.some((r) => (typeof r === 'string' ? r : r.key) === 'sevenMCaused')));
    const r = hrun([...[A('CAUSED', 'away', { uid: 'c1' }, attr('a4', 'sevenMCaused'))], A('REMOVE_EVENT', undefined, { id: 'c1' })]);
    assert.equal(handballTotals(r).a4, undefined);
  });
  test('HC2: a match with "7 m won by" on but no caused-by keeps its totals (no zero filled)', () => {
    const s = hrun([A('DRAWN', 'home', {}, attr('h3', 'sevenMDrawn')), A('GOAL', 'home', { shotType: 'sevenM' }, attr('h3', 'goals'))], { trackSevenMDrawn: true });
    const t = handballTotals(s);
    assert.equal(t.h3.stats.sevenMDrawn, 1);
    assert.equal('sevenMCaused' in t.h3.stats, false);
  });
  test('HC3: the chip row is optional, under the 7 m toggle, not while correcting', () => {
    const t = src('src/sports/handball/index.tsx');
    assert.match(t, /Caused by/);
    assert.match(t, /type: 'CAUSED'/);
    assert.match(HANDBALL_TRACK_FIELDS.find((f) => f.key === 'trackSevenMDrawn')!.label, /caused/);
  });
});

/* =============================== volleyball =============================== */
const vrun = (acts: ScoreAction[], cfg: Record<string, unknown> = {}) => acts.reduce(vb.reducer, vb.init(cfg));
const pts = (sd: Side, n: number) => Array.from({ length: n }, () => vb.outcomeAction('attack', sd, { id: `${sd[0]}1` }));

describe('volleyball · video challenge', () => {
  test('VC1: a marker — no score, no serve, kind review; an ended match ignores it', () => {
    const before = vrun(pts('home', 3));
    const s = vb.reducer(before, challengeAction('away', true, 'inout'));
    assert.deepEqual(s.current, before.current);
    assert.equal(vb.servingSide(s), vb.servingSide(before));
    const e = s.events[s.events.length - 1];
    assert.equal(e.kind, 'review');
    assert.equal(e.rev, 'upheld');
    assert.equal(e.chw, 'inout');
    assert.equal(e.side, 'away');
    assert.equal(e.set, 1);
    const ended = vrun([...pts('home', 75)]);
    assert.equal(ended.ended, true);
    assert.equal(vb.reducer(ended, challengeAction('away', false)), ended);
  });
  test('VC2: a correction keeps the challenge after the same rally; no challenge → replay as before', () => {
    const s = vrun([...pts('home', 2), challengeAction('away', false, 'touch'), ...pts('away', 2)]);
    const list = pointInputs(s.events);
    const fixed = vb.reducer(s, { type: 'EDIT_LOG', payload: { points: list } });
    const kinds = fixed.events.map((e) => e.kind);
    assert.deepEqual(kinds, ['attack', 'attack', 'review', 'attack', 'attack']);
    // drop a rally: the challenge stays after the 2nd rally (anchored by
    // rally number, as a sanction is)
    const fewer = vb.reducer(s, { type: 'EDIT_LOG', payload: { points: list.slice(1) } });
    assert.deepEqual(fewer.events.map((e) => e.kind), ['attack', 'attack', 'review', 'attack']);
    assert.equal(fewer.events[2].chw, 'touch');
    assert.equal(fewer.events[2].rev, 'rejected');
    const plain = vrun([...pts('home', 2), ...pts('away', 2)]);
    const again = vb.reducer(plain, { type: 'EDIT_LOG', payload: { points: pointInputs(plain.events) } });
    assert.deepEqual(again.events, plain.events);
  });
  test('VC3: hostile challenges are ignored or trimmed', () => {
    const s0 = vrun(pts('home', 1));
    for (const bad of [{ upheld: 'yes' }, { upheld: 1 }, {}, { upheld: null }]) {
      assert.equal(vb.reducer(s0, { type: 'CHALLENGE', side: 'home', payload: bad }), s0);
    }
    assert.equal(vb.reducer(s0, { type: 'CHALLENGE', side: 'x' as never, payload: { upheld: true } }), s0);
    assert.equal(vb.reducer(s0, { type: 'CHALLENGE', payload: { upheld: true } }), s0);
    const odd = vb.reducer(s0, { type: 'CHALLENGE', side: 'home', payload: { upheld: true, what: 'x'.repeat(500) } });
    assert.equal(odd.events[odd.events.length - 1].chw, undefined, 'an unknown "what" is dropped');
  });
  test('VC4: 2 unsuccessful challenges per team per set', () => {
    let s = vrun(pts('home', 1));
    assert.equal(vb.challengesLeft(s, 'away'), 2);
    s = vb.reducer(s, challengeAction('away', false));
    s = vb.reducer(s, challengeAction('away', true));
    assert.equal(vb.challengesLeft(s, 'away'), 1, 'an upheld one is kept');
    s = vb.reducer(s, challengeAction('away', false));
    assert.equal(vb.challengesLeft(s, 'away'), 0);
    const n = s.events.length;
    assert.equal(vb.reducer(s, challengeAction('away', true)).events.length, n, 'none left: ignored');
    assert.equal(vb.challengesLeft(s, 'home'), 2);
    // a new set: 2 again
    const next = [...pts('home', 25)].reduce(vb.reducer, s);
    assert.equal(next.setsWon.home, 1);
    assert.equal(vb.challengesLeft(next, 'away'), 2);
  });
  test('VC5: Game flow › Video challenges and of which upheld, by set, only when any', () => {
    const s = vrun([...pts('home', 2), challengeAction('away', true, 'net'), challengeAction('home', false), ...pts('home', 23), challengeAction('home', true)]);
    const row = (sc: 'all' | number, k: string) => volleyballMatchStats(s, sc).cats.find((c) => c.id === 'flow')?.rows.find((r) => r.key === k);
    assert.deepEqual([row('all', 'challenges')?.h, row('all', 'challenges')?.a], [2, 1]);
    assert.deepEqual([row('all', 'challengesUpheld')?.h, row('all', 'challengesUpheld')?.a], [1, 1]);
    assert.deepEqual([row(2, 'challenges')?.h, row(2, 'challenges')?.a], [1, 0]);
    assert.equal(row('all', 'challenges') && volleyballMatchStats(vrun(pts('home', 3))).cats.find((c) => c.id === 'flow')?.rows.find((r) => r.key === 'challenges'), undefined);
  });
  test('VC6: commentary names the team, what and the outcome', () => {
    const s = vrun([...pts('home', 2), challengeAction('away', true, 'inout'), challengeAction('home', false)]);
    const texts = volleyballCommentary(s, { ...NAMES, nameOf } as never).flatMap((g) => g.entries.map((e) => e.text));
    assert.ok(texts.some((t) => /Video challenge by Away \(ball in \/ out\): upheld/.test(t)), texts.join('\n'));
    assert.ok(texts.some((t) => /Video challenge by Home: not upheld/.test(t)), texts.join('\n'));
  });
  test('U1: in Quick options, never next to the point buttons', () => {
    const t = src('src/sports/volleyball/SanctionOptions.tsx');
    assert.match(t, /challengeAction\(/);
    assert.match(t, /challengesLeft\(/);
    assert.doesNotMatch(src('src/sports/volleyball/index.tsx'), /challengeAction/);
  });
  test('the sanctions keep their place beside a challenge after a correction', () => {
    const s = vrun([...pts('home', 1), sanctionAction('away', 'warning'), ...pts('home', 1), challengeAction('away', true), ...pts('away', 1)]);
    const fixed = vb.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(fixed.events.map((e) => e.kind), ['attack', 'conduct', 'attack', 'review', 'attack']);
  });
});

/* ================================ netball ================================ */
const nrun = (acts: ScoreAction[]) => acts.reduce(nb.reducer, nb.init({}));

describe('netball · toss-up', () => {
  test('NT1: no score, no centre-pass change, no clock stop, no gain', () => {
    const base = [{ type: 'FIRST_CENTRE', side: 'home' } as ScoreAction, A('CLOCK', undefined, { run: true, at: 1000 }), A('GOAL', 'home', { pos: 'GS' })];
    const before = nrun(base);
    const s = nb.reducer(before, A('TOSS_UP', 'away', { at: 4000 }));
    assert.equal(s.events[s.events.length - 1].type, 'tossup');
    assert.deepEqual([s.home, s.away], [before.home, before.away]);
    assert.deepEqual(nb.centreInfo(s), nb.centreInfo(before));
    assert.ok(s.clock.since);
    const fa = nbTeamFigures(s, 'away', 'all', centreSplit(s));
    assert.equal(fa.tossUps, 1);
    assert.equal(fa.gains, nbTeamFigures(before, 'away', 'all', centreSplit(before)).gains);
    const row = netballPanel(s).categories.flatMap((c) => c.rows).find((r) => r.key === 'tossUps');
    assert.ok(row);
    assert.equal(netballPanel(before).categories.flatMap((c) => c.rows).find((r) => r.key === 'tossUps'), undefined);
  });
  test('NT2: no side → ignored; a removal takes it out; commentary and timeline have a line', () => {
    assert.equal(nrun([A('TOSS_UP', undefined)]).events.length, 0);
    const s = nrun([A('TOSS_UP', 'home', { uid: 't1' })]);
    assert.match(nbDescribe(s.events[0]).label, /Toss-up/);
    const texts = netballFeed(s, NAMES, nameOf).flatMap((g) => g.rows.map((e) => e.text));
    assert.ok(texts.some((t) => /toss-up/i.test(t)), texts.join('\n'));
    assert.equal(nb.reducer(s, A('REMOVE_EVENT', undefined, { id: 't1' })).events.length, 0);
  });
  test('U1: behind More (no new step)', () => {
    assert.match(src('src/sports/netball/index.tsx'), /type: 'TOSS_UP'/);
  });
});
