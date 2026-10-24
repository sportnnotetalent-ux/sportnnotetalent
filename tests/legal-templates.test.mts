/** NDA / IP-assignment templates (docs/legal). Guards the clauses that make
 *  them work under Indian law, so a later edit can't quietly drop one. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'docs', 'legal', 'templates');
const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
const t = (prefix: string) => readFileSync(join(dir, files.find((f) => f.startsWith(prefix))!), 'utf8');

describe('the pack', () => {
  test('six templates, each with a Word copy and the "not legal advice" box', () => {
    assert.deepEqual(files.map((f) => f.slice(0, 2)), ['01', '02', '03', '04', '05', '06']);
    for (const f of files) {
      assert.ok(existsSync(join(root, 'docs', 'legal', 'docx', f.replace(/\.md$/, '.docx'))), `${f} has no .docx — run python3 scripts/legal-docx.py`);
      assert.match(readFileSync(join(dir, f), 'utf8'), /Template, not legal advice/);
    }
  });
});

describe('IP assignment (Copyright Act, 1957)', () => {
  for (const p of ['03', '04', '05', '06']) {
    test(`${p}: present assignment, worldwide, full term, no lapse under 19(4), not limited by 19(5)/(6), moral rights`, () => {
      const s = t(p);
      assert.match(s, /hereby assigns/);
      assert.match(s, /worldwide/);
      assert.match(s, /full term/);
      assert.match(s, /section 19\(4\)/);
      assert.match(s, /19\(5\)/);
      assert.match(s, /19\(6\)/);
      assert.match(s, /moral rights/i);
    });
  }
  test('future works (section 18) for contractors, employees and the founder', () => {
    for (const p of ['03', '04', '05']) assert.match(t(p), /section 18/);
  });
  test('the founder deed lists the past contributor and AI-assisted work', () => {
    const s = t('05');
    assert.match(s, /bec3655/);
    assert.match(s, /AI-assisted work/);
    assert.match(s, /Data Fiduciary/);
  });
});

describe('confidentiality and the founder’s AI concern', () => {
  for (const p of ['01', '02', '03', '04']) {
    test(`${p}: no unapproved AI tools; personal data / children`, () => {
      const s = t(p);
      assert.match(s, /AI tools/);
      assert.match(s, /not used to train or improve any model/);
      assert.match(s, /child/);
    });
  }
  test('NDAs and the contractor agreement ban reverse engineering and scraping', () => {
    for (const p of ['01', '02', '03']) assert.match(t(p), /reverse engineer[\s\S]*scrape/);
  });
});

describe('Indian Contract Act, section 27', () => {
  test('no post-exit non-compete: restrictions only during the engagement', () => {
    assert.match(t('03'), /Nothing in this Agreement restricts the Contractor from working in its trade after this Agreement ends/);
    assert.match(t('04'), /Nothing in this Agreement restricts the Employee from working in any trade or business after the engagement ends/);
  });
});

describe('pre-incorporation', () => {
  test('01–03 can be signed by the founder as promoter, passing to the company', () => {
    for (const p of ['01', '02', '03']) assert.match(t(p), /sections 15\(h\) and 19\(e\)/);
  });
});
