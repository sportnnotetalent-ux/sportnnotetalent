/** SMS spend cap (2026-10-27): records each phone code this device asks for and
 *  refuses past the daily limits (rules: smsLimit.ts). If storage fails, the
 *  code is sent — Firebase's own limits still apply. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recentSends, smsRefusal, type SmsSend } from './smsLimit';

const KEY = 'sn.smsSends.v1';

async function readLog(): Promise<SmsSend[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const log = raw ? JSON.parse(raw) : [];
    return Array.isArray(log) ? log : [];
  } catch { return []; }
}

/** Call just before sending a code; throws with the reason when over a limit. */
export async function takeSms(to: string, fallback?: string): Promise<void> {
  const now = Date.now();
  const log = recentSends(await readLog(), now);
  const refusal = smsRefusal(log, to, now, fallback);
  if (refusal) throw new Error(refusal);
  try { await AsyncStorage.setItem(KEY, JSON.stringify([...log, { at: now, to }])); } catch { /* storage off: still send */ }
}
