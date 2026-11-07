/** A2 voice + A3 native splash (docs/security/breaks/launch-voice-splash.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { shouldPlayVoice } from '../src/core/launchVoice.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const root = new URL('..', import.meta.url).pathname;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
});
const base = { web: false, reducedMotion: false, soundOn: true, moduleReady: true, clipReady: true };

test('LV1 (founder 2026-11-07): the voice plays on every launch — on a phone, switched on, with the module and the real clip', () => {
  assert.equal(shouldPlayVoice(base), true);
  for (const k of ['soundOn', 'moduleReady', 'clipReady'] as const) assert.equal(shouldPlayVoice({ ...base, [k]: false }), false, k);
  assert.equal(shouldPlayVoice({ ...base, web: true }), false, 'web');
  assert.equal(shouldPlayVoice({ ...base, reducedMotion: true }), false, 'reduced motion');
});

test('LV8 (founder): S:N shows first, then the voice says "Sport n Note" with the wordmark, finishing before the fade ends', async () => {
  const { VOICE_AT_MS, VOICE_MS } = await import('../src/core/launchVoice.ts');
  const { LAUNCH_FULL_MS } = await import('../src/core/launchPlan.ts');
  assert.ok(VOICE_AT_MS >= 500 && VOICE_AT_MS <= 960, 'starts as the wordmark comes in, after the mark has shown');
  assert.ok(VOICE_AT_MS + VOICE_MS <= LAUNCH_FULL_MS, 'done before the screen fades into Home');
  const anim = read("src/components/LaunchAnimation.tsx");
  const startEffect = anim.slice(anim.indexOf("if (!plan || !go) return;"));
  assert.match(startEffect, /setTimeout\(\(\) => void playLaunchVoice\(\), VOICE_AT_MS\)/, "timed from the animation start, not from the plan");
});

test('LV2: expo-audio is never imported at the top of any file (old builds lack it — an import would crash them)', () => {
  const bad = walk(join(root, 'src')).filter((f) => /^import [^;]*from 'expo-audio'/m.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, []);
  assert.match(read('App.tsx'), /^(?![\s\S]*from 'expo-audio')/);
  const v = read('src/data/launchVoice.ts');
  assert.match(v, /requireOptionalNativeModule\('ExpoAudio'\)/);
  const i = v.indexOf("require('expo-audio')");
  assert.ok(i > v.indexOf('if (!audioModuleReady()) return;'), 'loaded only after the check');
});

test('LV3: silent switch respected, music ducked not stopped, no background audio declared (App Review)', () => {
  const v = read('src/data/launchVoice.ts');
  assert.match(v, /playsInSilentMode: false/);
  assert.match(v, /interruptionMode: 'duckOthers'/);
  const app = JSON.parse(read('app.json'));
  const audio = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-audio');
  assert.equal(audio[1].enableBackgroundPlayback, false);
  assert.equal(audio[1].enableBackgroundRecording, false);
  assert.equal(audio[1].microphonePermission, app.expo.ios.infoPlist.NSMicrophoneUsageDescription, 'our own microphone wording kept');
});

test('LV4: the chosen AI voice (option 1, deep and slow) is in and switched on', () => {
  assert.match(read('src/data/launchVoice.ts'), /export const VOICE_CLIP_READY = true;/);
});

test('SP1: native splash = the animation\'s first frame (same green, same mark, same size)', () => {
  const app = JSON.parse(read('app.json'));
  const sp = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert.equal(sp[1].backgroundColor, '#0D5A3F');
  assert.equal(sp[1].image, './assets/splash-icon.png');
  const anim = read('src/components/LaunchAnimation.tsx');
  assert.match(anim, /const TILE = '#0D5A3F'/);
  assert.match(anim, new RegExp(`const MARK = ${sp[1].imageWidth};`));
});

test('SP2: the splash is never held open from code (it can never get stuck)', () => {
  const all = walk(join(root, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n') + read('App.tsx');
  assert.doesNotMatch(all, /preventAutoHideAsync/);
});

test('LV5: a Settings switch for the welcome sound (phones only)', () => {
  const s = read('src/screens/SettingsScreen.tsx');
  assert.match(s, /launchSoundPref\.set\(!launchSoundOn\)/);
  assert.match(s, /Platform\.OS !== 'web' && \(\s*<Row icon="🔊"/);
});

test('LV7: native packages that APK 41 already has stay at its versions (over-the-air JS must match the native code)', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.overrides['expo-asset'], '56.0.17');
  assert.equal(pkg.overrides['expo-constants'], '56.0.18');
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.packages['node_modules/expo-asset'].version, '56.0.17');
  assert.equal(lock.packages['node_modules/expo-constants'].version, '56.0.18');
});
