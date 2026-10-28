/**
 * Text we relay to other people (pushes, emails). PURE (no Deno globals), so
 * the node test runner covers it: tests/security-wave4.test.mts.
 */

// Common top-level domains and link shorteners: a bare "evil-site.com/claim"
// is a link too (security W4, EF-13).
const TLDS = 'com|net|org|in|io|co|app|me|ly|gl|link|xyz|info|biz|site|online|top|ai|uk|ae|qa|sg|my|au|us|ca|club|shop|live|tv|gg|to|be|ws|cc';
const BARE_DOMAIN = new RegExp(`\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?:/\\S*)?`, 'gi');

/** Remove links from text we relay to someone else (anti-phishing). */
export const stripLinks = (s: string) =>
  s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(BARE_DOMAIN, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

/** Clamp + tidy a free-text field. */
export const clip = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
