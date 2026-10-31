/**
 * The guest match on this device (docs/security/breaks/guest-scoring.md). One at
 * a time, in device storage; never sent anywhere until the person has an
 * account and claims it. Storage can be off (private browsing): every call is
 * guarded, and the game still scores — it just can't be resumed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GuestMatch, GuestStore } from '../core/guestMatch';

const KEY = 'sn.guest.match.v1';
let memory: GuestMatch | null = null;
const listeners = new Set<() => void>();

export const guestStore: GuestStore & { subscribe(fn: () => void): () => void; peek(): GuestMatch | null } = {
  async get() {
    if (memory) return memory;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      memory = raw ? (JSON.parse(raw) as GuestMatch) : null;
    } catch { /* storage off: memory only */ }
    return memory;
  },
  async set(g) {
    memory = g;
    listeners.forEach((f) => f());
    try { await AsyncStorage.setItem(KEY, JSON.stringify(g)); } catch { /* storage off */ }
  },
  async clear() {
    memory = null;
    listeners.forEach((f) => f());
    try { await AsyncStorage.removeItem(KEY); } catch { /* storage off */ }
  },
  subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  peek() { return memory; },
};
