/**
 * Wave 3, measured sports (docs/sport-expert/defaults-on/measured.md; breaks
 * docs/security/breaks/defaults-on-measured.md DOM1–DOM16): "Stats to track"
 * ON for NEW events and rounds only. Old events — nothing stored — read OFF,
 * a golf round already in play keeps its markers' phones, Reset keeps the new
 * defaults, nothing writes a zero nobody recorded, and the split story needs
 * at least two runners timed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ruleOf, phaseRules, changedRules, rulesFor, ruleDef, newEventRules, standardOf, MEASURED_NEW_DEFAULT_KEYS,
  disciplineOf, rankEntries, winnerSplitStory, fastestFinish, raceTracking, TRACK_KEYS,
  type DisciplineDef, type EntryResult, type ResultEntry,
} from '../src/data/results/index.ts';
import { PRECISION_RULES } from '../src/data/results/precisionRules.ts';
import { withNewTournamentPoints, newTournamentFormats } from '../src/data/standings.ts';
import { NEW_ROUND_TRACK, effectiveTrack, roundTrackOf, cleanTrack } from '../src/sports/golf/track.ts';
import { roundStats, standardPar72, type GolfCard } from '../src/sports/golf/engine.ts';
import { golfStatSheet } from '../src/sports/golf/statSheet.ts';
import { ATHLETICS_META } from '../src/sports/athletics/meta.ts';
import { SWIMMING_META } from '../src/sports/swimming/meta.ts';
import { CYCLING_META } from '../src/sports/cycling/meta.ts';
import { ROWING_META } from '../src/sports/rowing/meta.ts';
import { CANOE_META } from '../src/sports/canoe/meta.ts';

const src = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const run = (id: string, name: string, result: EntryResult, heat = 1): ResultEntry => ({ id, athleteId: `p_${id}`, name, heat, result });

/* ------------------------------ precision ------------------------------ */

describe('DOM1 · old events read OFF; new tournaments start ON', () => {
  test('the read fallback stays OFF for jury reversals and team arrows', () => {
    // defaults-on DOM1: `default` is the fallback for events that stored nothing
    assert.equal(ruleDef('wlJury')!.default, false);
    assert.equal(ruleDef('archTeamArrows')!.default, false);
    assert.equal(ruleOf({}, 'wlJury'), false);
    assert.equal(ruleOf(undefined, 'archTeamArrows'), false);
  });
  test('the new-event value is ON for jury reversals and team arrows only', () => {
    assert.equal(ruleDef('wlJury')!.newEvents, true);
    assert.equal(ruleDef('archTeamArrows')!.newEvents, true);
    for (const k of ['wlLights', 'shootPen']) assert.equal(ruleDef(k)!.newEvents, undefined, `${k} stays OFF`);
    assert.deepEqual(newEventRules('weightlifting'), { wlJury: true });
    assert.deepEqual(newEventRules('archery'), { archTeamArrows: true });
    assert.deepEqual(newEventRules('shooting'), {});
    assert.deepEqual(newEventRules('athletics'), {});
  });
  test('a new tournament stores them, and its phases carry them', () => {
    const wl = withNewTournamentPoints('weightlifting', {});
    assert.equal((wl as Record<string, unknown>).wlJury, true);
    assert.equal((wl as Record<string, unknown>).wlLights, undefined);
    assert.deepEqual(phaseRules('weightlifting', wl), { wlJury: true });
    const f = newTournamentFormats(['archery', 'shooting', 'football'], {});
    assert.equal((f.archery as Record<string, unknown>).archTeamArrows, true);
    assert.deepEqual(phaseRules('archery', f.archery), { archTeamArrows: true });
    assert.deepEqual(phaseRules('shooting', f.shooting ?? {}), {});
  });
  test('the organiser\'s own choice wins over the stamp', () => {
    const wl = withNewTournamentPoints('weightlifting', { wlJury: false } as Record<string, unknown>);
    assert.equal((wl as Record<string, unknown>).wlJury, false);
    assert.deepEqual(phaseRules('weightlifting', wl), {});
  });
});

describe('DOM2 · an old tournament stays OFF', () => {
  test('nothing stored → its new phases read OFF', () => {
    assert.deepEqual(phaseRules('weightlifting', {}), {});
    assert.deepEqual(phaseRules('archery', undefined), {});
    assert.equal(ruleOf(phaseRules('weightlifting', { wlClock: 'iwf' }), 'wlJury'), false);
  });
  test('editing a tournament stamps only a sport added now', () => {
    const edit = src('src/screens/EditTournamentScreen.tsx');
    assert.match(edit, /if \(prev\.includes\(s\)\) return prev\.filter/);
    assert.match(edit, /setFormats\(\(f\) => \(f\[s\] \? f : \{ \.\.\.f, \[s\]: seeded \}\)\)/);
  });
});

describe('DOM3 / DOM4 · standalone events and later rounds', () => {
  test('a standalone event (no tournament) starts on the new rules', () => {
    const s = src('src/data/resultsStore.ts');
    assert.match(s, /const fresh = newEventRules\(base\.sport\);/);
    assert.match(s, /input\.tournamentId \? await rulesForNewPhase\(input\.tournamentId, base\.sport\) : Object\.keys\(fresh\)\.length \? fresh : undefined/);
  });
  test('every advance copies the phase format (rules ride along)', () => {
    const s = src('src/data/resultsStore.ts');
    assert.ok((s.match(/const fmt: PhaseFormat = \{ \.\.\.f, phase: next\.phase/g) ?? []).length >= 3);
  });
});

describe('DOM7 / DOM8 · Reset, the standard mark and an explicit Off', () => {
  test('standardOf is the new-event value where there is one', () => {
    assert.equal(standardOf(ruleDef('wlJury')!), true);
    assert.equal(standardOf(ruleDef('wlLights')!), false);
    assert.equal(standardOf(ruleDef('wlClock')!), 'iwf');
  });
  test('the summary line: a new tournament on the new defaults has no changed rules; an explicit Off does', () => {
    const fresh = withNewTournamentPoints('weightlifting', {}) as Record<string, unknown>;
    assert.deepEqual(changedRules('weightlifting', fresh).map((r) => r.key), []);
    assert.deepEqual(changedRules('weightlifting', { ...fresh, wlJury: false }).map((r) => r.key), ['wlJury']);
    assert.deepEqual(changedRules('weightlifting', {}).map((r) => r.key), [], 'an old tournament lists nothing either');
  });
  test('the screen: Reset, the standard mark and Save use the new-event value', () => {
    const s = src('src/screens/CompetitionRulesScreen.tsx');
    assert.match(s, /d\[r\.key\] = standardOf\(r\)/);
    assert.match(s, /standard=\{c\.value === standardOf\(r\)\}/);
    assert.match(s, /v === r\.default && !r\.existing && r\.newEvents === undefined/);
  });
});

describe('DOM13 / DOM14 · what stays OFF, and the key lists', () => {
  test('timing extras stay OFF; swimming splits stay ON', () => {
    const metas = { athletics: ATHLETICS_META, swimming: SWIMMING_META, cycling: CYCLING_META, rowing: ROWING_META, canoe: CANOE_META };
    for (const [sp, meta] of Object.entries(metas)) {
      for (const f of meta.formatFields ?? []) {
        if (f.group !== 'Stats to track' || f.type !== 'toggle') continue;
        assert.equal(f.default, sp === 'swimming' && f.key === 'splits', `${sp}.${f.key}`);
      }
    }
    assert.equal(ruleDef('splits')!.default, true);
    const t = raceTracking('swimming', {});
    assert.equal(t.splits, true);
    for (const k of TRACK_KEYS) if (k !== 'splits') assert.equal(t[k], false, k);
  });
  test('every precision stats switch is in "Stats to track"; the new-default list', () => {
    for (const k of ['wlLights', 'wlJury', 'shootPen', 'archTeamArrows']) assert.equal(ruleDef(k)!.group, 'Stats to track', k);
    assert.deepEqual([...MEASURED_NEW_DEFAULT_KEYS].sort(), ['archTeamArrows', 'wlJury']);
    assert.deepEqual(PRECISION_RULES.filter((r) => r.newEvents !== undefined).map((r) => r.group), ['Stats to track', 'Stats to track']);
    assert.ok(rulesFor('weightlifting').some((r) => r.key === 'wlJury'));
  });
});

/* -------------------------------- golf -------------------------------- */

describe('DOM5 / DOM6 · golf: new rounds track six taps; rounds in play unchanged', () => {
  test('the new-round list: every tap stat, no driving distance', () => {
    assert.deepEqual(NEW_ROUND_TRACK, ['putts', 'fairway', 'bunker', 'upDown', 'penalties', 'firstPutt']);
    assert.deepEqual(cleanTrack(NEW_ROUND_TRACK), NEW_ROUND_TRACK);
  });
  test('setup starts on it; the phone fallback stays empty', () => {
    const setup = src('src/screens/GolfRoundSetupScreen.tsx');
    assert.match(setup, /useState<GolfTrackKey\[\] \| null>\(\(\) => \[\.\.\.NEW_ROUND_TRACK\]\)/);
    // DOM6: the next round / Run it again still take the previous round's setting
    assert.match(setup, /setTrack\(roundTrackOf\(last\.format as Record<string, unknown>\)\)/);
    assert.match(setup, /setTrack\(roundTrackOf\(planned\.format as Record<string, unknown>\)\)/);
    assert.match(src('src/screens/GolfRoundScreen.tsx'), /useState<GolfTrackKey\[\]>\(\[\]\)/);
  });
  test('an old round (no format.track) still reads the phone', () => {
    assert.equal(roundTrackOf({ courseId: 'c' }), null);
    assert.deepEqual(effectiveTrack(roundTrackOf({}), []), []);
  });
});

describe('DOM9 · golf: no fairway zeros', () => {
  const holes = standardPar72();
  const strokes = holes.map((h) => h.par);
  test('fairways tracked, none tapped → no missed left / right', () => {
    const card: GolfCard = { strokes, track: [...NEW_ROUND_TRACK], firDir: holes.map(() => null) };
    const s = roundStats(card, holes, holes.map(() => 0));
    assert.equal('firLeft' in s, false);
    assert.equal('firRight' in s, false);
    const rows = golfStatSheet({ card, holes, received: holes.map(() => 0) }, []).flatMap((c) => c.rows.map((r) => r.key));
    assert.ok(!rows.includes('firL') && !rows.includes('firR'));
  });
  test('one fairway tapped → the counts are real', () => {
    const firDir = holes.map(() => null) as GolfCard['firDir'];
    firDir![0] = 'hit';
    const s = roundStats({ strokes, track: ['fairway'], firDir }, holes, holes.map(() => 0));
    assert.equal(s.firLeft, 0);
    assert.equal(s.firRight, 0);
    assert.equal(s.firHoles, 1);
  });
});

/* -------------------------- the split story -------------------------- */

describe('DOM12 · the split story needs two runners timed', () => {
  const M1500 = D('ath.1500m');
  test('only the winner\'s splits → no story, no fastest finish', () => {
    const rows = rankEntries([run('a', 'Asha', { mark: 280, splits: [50, 120, 190] }), run('b', 'Bina', { mark: 285 }), run('c', 'Chitra', { mark: 290 })], M1500);
    assert.equal(winnerSplitStory(M1500, rows), null);
    assert.equal(fastestFinish(M1500, rows), null);
  });
  test('two timed at only the first split → the story is about that split', () => {
    const rows = rankEntries([run('a', 'Asha', { mark: 280, splits: [50, 120, 190] }), run('b', 'Bina', { mark: 285, splits: [51] })], M1500);
    assert.equal(winnerSplitStory(M1500, rows), 'led at 300 m');
  });
  test('two timed everywhere → as before', () => {
    const rows = rankEntries([run('a', 'Asha', { mark: 280, splits: [50, 120, 190] }), run('b', 'Bina', { mark: 285, splits: [51, 121, 191] })], M1500);
    assert.equal(winnerSplitStory(M1500, rows), 'led at every split');
    assert.equal(fastestFinish(M1500, rows)?.name, 'Asha');
  });
});
