/**
 * Security W3 (CL-07): an offline queue (match taps, held results, field
 * cards) belongs to the account that made it. It's sent — and shown — only
 * while that account is signed in on this device; signed out, it's parked
 * until the same account signs back in. A queue saved before this (no owner)
 * behaves as before. PURE: core/auth.tsx keeps the current account here.
 */
let current: string | null = null;

export const setQueueAccount = (id: string | null): void => { current = id; };
export const queueAccount = (): string | null => current;

/** May a queue owned by `owner` be sent or shown to `cur`? */
export const ownsQueue = (owner: string | null | undefined, cur: string | null): boolean => !owner || owner === cur;
