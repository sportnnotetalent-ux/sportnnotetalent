/** Reference-video A2: per-device switch for the launch voice
 *  (Settings → Preferences). On by default; stored on this device only. */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sportfolio.launchSoundOff';
let on = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function hydrateLaunchSoundPref(): Promise<void> {
  try { if ((await AsyncStorage.getItem(KEY)) === '1') { on = false; emit(); } } catch { /* keep default */ }
}

export const launchSoundPref = {
  get: () => on,
  set(v: boolean) {
    if (v === on) return;
    on = v;
    emit();
    void (v ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, '1')).catch(() => {});
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  getSnapshot: () => on,
};

export const useLaunchSoundOn = () => useSyncExternalStore(launchSoundPref.subscribe, launchSoundPref.getSnapshot, launchSoundPref.getSnapshot);
