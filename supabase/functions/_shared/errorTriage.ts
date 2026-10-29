/**
 * The daily email's errors, labelled so a day of errors reads at a glance
 * (founder 2026-10-29). Each one is:
 *   new    — the live web build, the phone app, or anything we can't place: look at it;
 *   older  — a web build that has since been replaced (someone's tab wasn't reloaded);
 *   noise  — not an app bug: the host briefly answering a script request with a
 *            web page ("Unexpected token '<'"), or the browser's detail-less
 *            "Script error." from a script on another site.
 * Pure, so it's tested in node (tests/error-triage.test.mts).
 */

export type ErrorRow = { message: unknown; stack?: unknown; platform?: unknown; screen?: unknown; fatal?: unknown };
export type Label = 'new' | 'older' | 'noise';

// Exact messages only: "Unexpected token '<', "<!DOCTYPE"... is not valid JSON"
// is the app reading a web page as data, a real bug. The script-load hiccup
// has no stack (the script never ran), so one with a stack isn't noise either.
const HOST_HICCUP = /^(SyntaxError: )?Unexpected token '<'$/;
// The browser hides every detail of an error from another site's script; the
// stack recorded with it is our own reporter's, so it says nothing either.
const SCRIPT_ERROR = /^(Error: )?Script error\.?$/;

/** The web build an error came from: the first 8 characters of its bundle's hash. */
export function webBundleOf(text: unknown): string | null {
  const m = /index-([a-f0-9]{8})[a-f0-9]*\.js/.exec(typeof text === 'string' ? text : '');
  return m ? m[1] : null;
}

export function classifyError(e: ErrorRow, live: { web: string | null }): Label {
  const msg = String(e.message ?? '').trim();
  const bundle = webBundleOf(e.stack);
  if (SCRIPT_ERROR.test(msg) || (!bundle && HOST_HICCUP.test(msg))) return 'noise';
  if (bundle && live.web && bundle !== live.web) return 'older';
  return 'new';
}

const GROUPS: { label: Label; title: string; top: number }[] = [
  { label: 'new', title: 'New — look at these', top: 10 },
  { label: 'older', title: 'On an older version of the web app (replaced since; they only matter if they come back on the live one)', top: 5 },
  { label: 'noise', title: 'Noise, not app bugs (the host briefly refusing, or the browser\'s detail-less "Script error.")', top: 3 },
];

export function summariseErrors(rows: ErrorRow[], live: { web: string | null }) {
  const counts: Record<Label, number> = { new: 0, older: 0, noise: 0 };
  const byLabel: Record<Label, Map<string, { n: number; fatal: boolean; screen: unknown }>> = { new: new Map(), older: new Map(), noise: new Map() };
  for (const e of rows) {
    const label = classifyError(e, live);
    counts[label]++;
    const k = String(e.message).slice(0, 110);
    const cur = byLabel[label].get(k) ?? { n: 0, fatal: false, screen: e.screen };
    byLabel[label].set(k, { n: cur.n + 1, fatal: cur.fatal || !!e.fatal, screen: cur.screen });
  }
  const headline = `${counts.new} new · ${counts.older} on an older version · ${counts.noise} noise`;
  if (!rows.length) return { counts, headline, lines: ['  None 🎉'] };
  const lines: string[] = [];
  for (const g of GROUPS) {
    if (!counts[g.label]) continue;
    lines.push(`  ${g.title} (${counts[g.label]})`);
    for (const [m, v] of [...byLabel[g.label]].sort((a, b) => b[1].n - a[1].n).slice(0, g.top)) {
      lines.push(`    • ${v.n}×${v.fatal ? ' [CRASH]' : ''} ${m}${v.screen ? ` (on ${v.screen})` : ''}`);
    }
  }
  if (!live.web) lines.push('  (Couldn\'t read which web version is live, so none are marked older.)');
  return { counts, headline, lines };
}
