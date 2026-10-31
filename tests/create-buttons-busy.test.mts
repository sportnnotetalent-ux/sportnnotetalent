/**
 * Audit C item: five create / join buttons could be tapped twice while the
 * first save was still running, creating duplicates. Sibling forms (Feedback,
 * Verification review) disable the button while busy; these now do too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(import.meta.dirname, '..', 'src/screens', f), 'utf8');
const CASES: Array<[string, RegExp]> = [
  ['CreateTournamentScreen.tsx', /label=\{busy \? 'Creating…' : 'Create tournament'\}[^/]*disabled=\{busy\}/],
  ['CreateClubScreen.tsx', /label=\{busy \? 'Creating…' : 'Create team'\}[^/]*disabled=\{busy\}/],
  ['CreateCommunityScreen.tsx', /label=\{busy \? 'Creating…' : 'Create community'\}[^/]*disabled=\{busy\}/],
  ['CreateListingScreen.tsx', /label=\{busy \? 'Posting…' : 'Post listing'\}[^/]*disabled=\{busy\}/],
  ['JoinTeamScreen.tsx', /label=\{busy \? 'Checking…' : 'Find team'\}[^/]*disabled=\{busy\}/],
  ['JoinTeamScreen.tsx', /label=\{busy \? 'Claiming…' : `Claim as \$\{invite\.role\}`\}[^/]*disabled=\{busy\}/],
];
test('each create / join button is disabled while its save runs', () => {
  for (const [f, re] of CASES) assert.match(read(f), re, f);
});
