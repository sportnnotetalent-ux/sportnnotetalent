/**
 * 2026-10-29 (founder: "have all these kinds of aspects looked into"): on a
 * sport's scoring pad, two DIFFERENT actions never show the same line icon —
 * a scorer tapping fast told Interception, Save and Handball apart only by the
 * word (all three were a hand). Emoji become line icons through one map
 * (components/Icon.tsx), so the check reads that map and every sport's labels.
 * Generic controls (start ▶, pause ⏸, edit ✎, confirm ✓, cancel ✕, the cards)
 * may repeat; so may the same action worded twice (SAME below).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const map = new Map<string, string>();
for (const m of read('src/components/Icon.tsx').matchAll(/'([^']+)':\s*(?:\{ Icon: (\w+)|card\('[^']+'\))/g)) map.set(m[1].replace(/️/g, ''), m[2] ?? 'card');
const keys = [...map.keys()].sort((a, b) => b.length - a.length);
const GENERIC = new Set(['Play', 'Pause', 'Pencil', 'Check', 'CircleCheck', 'X', 'CircleX', 'card', 'Undo2', 'Rewind', 'Info', 'TriangleAlert', 'Timer', 'Clock', 'Hourglass']);
/** The same action, worded differently in different steps. */
const SAME = [
  ['ejected', 'ejection', 'ejections'], ['possession over', 'turnover on downs'], ['and-one', 'and-one +'],
  ['quick sub', 'substitute', 'substitution', 'sub', 'replacement', 'interchange'], ['free throw', 'free throws'],
  ['scores level', 'super over', 'start'], ['penalty', 'penalty runs', 'penalty against'], ['match rules', 'rules'],
  ['block', 'blocked', 'blocked by', 'who was blocked?'], ['foul', 'foul logged'], ['save', 'saved', 'goalkeeper'],
  ['own goal', 'own goal instead', 'own goal →'], ['card', 'team official'], ['missed', 'missed shot', 'penalty shot missed'],
  ['goalie pulled', 'pull goalie'], ['goalie back', 'goalie back in net', 'goalie in'], ['golden raid', 'gr'],
  ['positions', 'swap', 'tactical change'], ['kick at goal', 'penalty goal'], ['placed on report', 'put on report'],
  ['reception', 'who was aced?'], ['attack', 'attack in play'], ['referral', 'video referral'], ['blocked', 'defended'],
  ['pc', 'penalty corner'], ['steal', 'ball stolen'], ['intercept', 'interception'], ['shot', 'shot at goal'],
  ['missed shot', 'miss'], ['opp. error', 'opp. serve error'],
];
const norm = (l: string) => l.replace(/\$\{.*$/, '').split(/ — | · |:|…|\(/)[0].trim().toLowerCase();
const sameAction = (labels: string[]) => labels.length < 2 || SAME.some((g) => labels.every((l) => g.includes(l)));

test('on each sport\'s scoring pad, different actions have different icons', () => {
  const clashes: string[] = [];
  for (const d of readdirSync(join(ROOT, 'src/sports'), { withFileTypes: true })) {
    if (!d.isDirectory() || !existsSync(join(ROOT, 'src/sports', d.name, 'meta.ts'))) continue;
    const byIcon = new Map<string, Set<string>>();
    const add = (icon: string | undefined, label: string) => { if (!icon || GENERIC.has(icon) || !norm(label)) return; (byIcon.get(icon) ?? byIcon.set(icon, new Set()).get(icon)!).add(norm(label)); };
    const files = readdirSync(join(ROOT, 'src/sports', d.name)).filter((f) => /\.tsx?$/.test(f) && !['meta.ts', 'stats.ts', 'awards.ts'].includes(basename(f)));
    for (const f of files) {
      const src = read(`src/sports/${d.name}/${f}`);
      for (const m of src.matchAll(/icon: '([^']+)',\s*(?:short: '[^']*',\s*)?label: '([^']+)'/g)) add(map.get(m[1].replace(/️/g, '')), m[2]);
      for (const m of src.matchAll(/['`"]((?:[^'`"\n]{1,3}) ?[A-Za-z][^'`"\n]{1,40})['`"]/g)) {
        const t = m[1].replace(/️/g, '');
        const k = keys.find((key) => t.startsWith(key));
        if (k && /^[A-Za-z]/.test(t.slice(k.length).trim())) add(map.get(k), t.slice(k.length));
      }
    }
    for (const [icon, labels] of byIcon) if (!sameAction([...labels])) clashes.push(`${d.name}: ${icon} = ${[...labels].join(' / ')}`);
  }
  assert.deepEqual(clashes, []);
});
