/**
 * "Near you" location (founder 2026-10-31): only while the app is in use (no
 * "Always", no background), approximate (Android gets coarse location only),
 * rounded to ~1 km before it leaves the device and never stored on the server.
 * Phones: `expo-location`, in builds from the store release on; an older APK
 * without its native module simply doesn't offer it and Home uses the city.
 * Web: the browser's own prompt.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { roundCoord } from './personalise';

export type LocationChoice = 'granted' | 'denied' | 'later';
export type Coords = { lat: number; lng: number };
const KEY = 'sn.location.choice';

type LocationApi = typeof import('expo-location');
let api: LocationApi | null | undefined;
function native(): LocationApi | null {
  if (api !== undefined) return api;
  api = null;
  try {
    // Look before requiring: the library throws while loading when its native side is missing.
    if (requireOptionalNativeModule('ExpoLocation')) api = require('expo-location') as LocationApi;
  } catch { api = null; }
  return api;
}

const webGeo = (): Geolocation | null =>
  Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation ? navigator.geolocation : null;

/** Can this device ask for location at all? */
export function canAskLocation(): boolean {
  return Platform.OS === 'web' ? !!webGeo() : !!native();
}

async function remember(choice: LocationChoice): Promise<LocationChoice> {
  try { await AsyncStorage.setItem(KEY, choice); } catch { /* non-fatal */ }
  return choice;
}

/** What the person chose last time on this device (null: never asked). */
export async function locationChoice(): Promise<LocationChoice | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' || v === 'later' ? v : null;
  } catch { return null; }
}

/** "Not now": remembered, so we don't ask again by ourselves. */
export const declineLocation = (): Promise<LocationChoice> => remember('later');

function webPosition(geo: Geolocation, timeoutMs: number): Promise<Coords | null> {
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (p) => resolve({ lat: roundCoord(p.coords.latitude), lng: roundCoord(p.coords.longitude) }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: timeoutMs },
    );
  });
}

/** Show the device's own location prompt (while using the app only). */
export async function askLocation(): Promise<LocationChoice> {
  const geo = webGeo();
  if (geo) return remember((await webPosition(geo, 15_000)) ? 'granted' : 'denied');
  const L = native();
  if (!L) return 'denied';
  try {
    const r = await L.requestForegroundPermissionsAsync();
    return remember(r.granted ? 'granted' : 'denied');
  } catch { return remember('denied'); }
}

/** Where the person is now, rounded to ~1 km — only when they've already
 *  allowed it (never prompts). Null otherwise; Home then uses their city. */
export async function currentLocation(): Promise<Coords | null> {
  if ((await locationChoice()) !== 'granted') return null;
  const geo = webGeo();
  if (geo) return webPosition(geo, 8_000);
  const L = native();
  if (!L) return null;
  try {
    const perm = await L.getForegroundPermissionsAsync();
    if (!perm.granted) { await remember('denied'); return null; }
    const p = (await L.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }))
      ?? (await L.getCurrentPositionAsync({ accuracy: L.Accuracy.Low }));
    return p ? { lat: roundCoord(p.coords.latitude), lng: roundCoord(p.coords.longitude) } : null;
  } catch { return null; }
}
