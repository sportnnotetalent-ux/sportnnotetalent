/**
 * Support console (2026-10-27) — the pure rules: claims ("✋ I'll check this",
 * fresh for 2 hours, migration 20261027170000_support_console), the queue
 * filters (waiting over a day, kind of organisation, claimed / mine, search)
 * and the keyboard shortcuts on a desktop browser.
 *
 * PURE (no React Native) — node tests load it.
 */
import { isEducation } from './orgVerification.ts';

export type ClaimKind = 'org' | 'age';

export interface SupportClaim { kind: ClaimKind; ref: string; by: string; byName: string; at: string }

/** A claim holds this long (the server's '2 hours'). */
export const CLAIM_MS = 2 * 3_600_000;
/** "Over a day" in the queues and on the tiles. */
export const OVER_DAY_MS = 24 * 3_600_000;

export type ClaimState =
  | { state: 'none' }
  | { state: 'mine'; at: string }
  | { state: 'theirs'; byName: string; at: string };

/** Who is checking this item right now (a stale claim counts as none). */
export function claimStateOf(claims: readonly SupportClaim[], kind: ClaimKind, ref: string, me: string | undefined, now: number): ClaimState {
  const c = claims.find((x) => x.kind === kind && x.ref === ref);
  if (!c || now - Date.parse(c.at) >= CLAIM_MS) return { state: 'none' };
  return c.by === me ? { state: 'mine', at: c.at } : { state: 'theirs', byName: c.byName, at: c.at };
}

/** "12 min ago" / "1 h 5 min ago" — how long a claim has been held. */
export function claimedAgo(at: string, now: number): string {
  const min = Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return `${h} h${min % 60 ? ` ${min % 60} min` : ''} ago`;
}

export type OrgGroup = 'education' | 'sports' | 'other';
const SPORTS_BODIES = ['Sports club', 'Sports academy', 'Sports association'];

/** Which filter group an organisation type falls in. */
export function orgGroup(type?: string): OrgGroup {
  if (isEducation(type)) return 'education';
  return SPORTS_BODIES.includes(type ?? '') ? 'sports' : 'other';
}

export const ORG_GROUP_LABEL: Record<OrgGroup, string> = {
  education: 'Schools & colleges', sports: 'Clubs & sports bodies', other: 'Other',
};

export interface QueueFilter { waiting: 'all' | 'day'; group: 'all' | OrgGroup; claimed: 'all' | 'unclaimed' | 'mine'; q: string }
export const NO_FILTER: QueueFilter = { waiting: 'all', group: 'all', claimed: 'all', q: '' };

/** What the filters read from a queue item. */
export interface QueueKey { ref: string; name: string; waitingSince?: number; type?: string; text?: string }

/** The queue as filtered, oldest first (an item with no time last). */
export function filterQueue<T>(items: readonly T[], key: (t: T) => QueueKey, f: QueueFilter, claims: readonly SupportClaim[], kind: ClaimKind, me: string | undefined, now: number): T[] {
  const q = f.q.trim().toLowerCase();
  return items
    .map((t) => ({ t, k: key(t) }))
    .filter(({ k }) => {
      if (f.waiting === 'day' && !(k.waitingSince != null && now - k.waitingSince >= OVER_DAY_MS)) return false;
      if (kind === 'org' && f.group !== 'all' && orgGroup(k.type) !== f.group) return false;
      if (f.claimed !== 'all') {
        const s = claimStateOf(claims, kind, k.ref, me, now).state;
        if (f.claimed === 'unclaimed' && s !== 'none') return false;
        if (f.claimed === 'mine' && s !== 'mine') return false;
      }
      return !q || `${k.name} ${k.text ?? ''}`.toLowerCase().includes(q);
    })
    .sort((a, b) => (a.k.waitingSince ?? Infinity) - (b.k.waitingSince ?? Infinity) || a.k.name.localeCompare(b.k.name))
    .map(({ t }) => t);
}

/** Keyboard on a desktop browser: J / K move, C claims, Esc closes. */
export type Shortcut = 'next' | 'prev' | 'claim' | 'close';
export function shortcutFor(key: string, opts: { typing: boolean; modified: boolean }): Shortcut | null {
  if (opts.typing || opts.modified) return null;
  switch (key) {
    case 'j': case 'J': return 'next';
    case 'k': case 'K': return 'prev';
    case 'c': case 'C': return 'claim';
    case 'Escape': return 'close';
    default: return null;
  }
}

/** The selection after a J / K press (stays inside the list; none selected → the first). */
export function moveSelection(index: number, length: number, dir: 'next' | 'prev'): number {
  if (length <= 0) return -1;
  if (index < 0) return 0;
  return dir === 'next' ? Math.min(length - 1, index + 1) : Math.max(0, index - 1);
}
