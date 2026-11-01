/**
 * Store prep (docs/security/breaks/store-prep.md): store builds get the same
 * updates as the APKs, Play gets an app bundle, iPhone export compliance is
 * answered in the build, and every permission has its reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const app = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));

test('SP1: every update also goes to the store channel (opt-out SKIP_STORE)', () => {
  const s = read('scripts/publish-android-ota.sh');
  assert.match(s, /--channel preview --environment preview --platform android/);
  assert.match(s, /--channel production --environment production --platform android/);
  assert.match(s, /if \[ -z "\$\{SKIP_STORE:-\}" \]; then/);
});

test('SP2: one runtime for the APKs and the store build (the app version)', () => {
  assert.deepEqual(app.runtimeVersion, { policy: 'appVersion' });
  assert.equal(eas.build.production.channel, 'production');
  assert.equal(eas.build.preview.channel, 'preview');
});

test('Play gets an app bundle', () => assert.equal(eas.build.production.android.buildType, 'app-bundle'));

test('SP5: iPhone export compliance and every permission reason', () => {
  assert.equal(app.ios.config.usesNonExemptEncryption, false);
  for (const k of ['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription', 'NSContactsUsageDescription']) assert.ok(app.ios.infoPlist[k], k);
  const plugin = (name: string) => app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === name)?.[1];
  assert.ok(plugin('expo-camera').cameraPermission);
  assert.ok(plugin('expo-location').locationWhenInUsePermission);
  assert.equal(plugin('expo-location').isIosBackgroundLocationEnabled, false);
});

test('SP3 / SP4 / SP6 / SP7 / SP8: the founder guide covers the key, Firebase iOS, review sign-in, answers and listing', () => {
  const g = read('docs/launch/store-launch.md');
  for (const s of ['App signing', 'GoogleService-Info.plist', 'Phone numbers for testing', 'Data safety', 'Short description', 'Score a game now, no sign-up']) assert.ok(g.includes(s), s);
  const c = read('docs/launch/store-launch.md').match(/\*\*Short description \(Play, ≤ 80\):\*\* (.*)/)![1];
  assert.ok(c.length <= 80, `short description ${c.length} chars`);
  const sub = g.match(/\*\*Subtitle \(App Store, ≤ 30\):\*\* (.*)/)![1];
  assert.ok(sub.length <= 30, `subtitle ${sub.length}`);
  const kw = g.match(/\*\*Keywords \(App Store, ≤ 100\):\*\* (.*)/)![1];
  assert.ok(kw.length <= 100, `keywords ${kw.length}`);
});
