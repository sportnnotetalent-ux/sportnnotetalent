/** Low-cost go-live setup (2026-10-25): native phone sign-in on Android, PDF
 *  picking on phones, verification uploads that aren't empty on Android,
 *  Android App Links, and the nightly encrypted database backup. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { APP_LINK_PATHS, ANDROID_PACKAGE, ANDROID_CERT_SHA256, assetLinks } from '../src/core/androidAppLinks.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const appJson = JSON.parse(read('app.json')).expo;

describe('Android phone sign-in (React Native Firebase)', () => {
  const src = read('src/core/firebasePhone.native.ts');
  test('looks for the native side before loading the library (older APKs get the same update)', () => {
    const look = src.indexOf("TurboModuleRegistry.get('NativeRNFBTurboApp')");
    const load = src.indexOf("require('@react-native-firebase/app')");
    assert.ok(look > 0 && load > look, 'the TurboModuleRegistry check comes first');
    assert.match(src, /TurboModuleRegistry\.get\('NativeRNFBTurboAuth'\)/);
    assert.match(src, /export const firebasePhoneAvailable = \(\): boolean => native\(\) !== null;/);
  });
  test('the module names are the ones the installed library registers', () => {
    const appConst = read('node_modules/@react-native-firebase/app/dist/module/internal/constants.js');
    assert.match(appConst, /APP_NATIVE_MODULE = 'NativeRNFBTurboApp'/);
    const auth = read('node_modules/@react-native-firebase/auth/dist/module/index.js');
    assert.match(auth, /nativeModuleName = 'NativeRNFBTurboAuth'/);
  });
  test('sends the SMS, confirms the code, hands back the ID token and signs out of Firebase', () => {
    assert.match(src, /m\.auth\.signInWithPhoneNumber\(m\.auth\.getAuth\(\), e164\)/);
    assert.match(src, /confirmation\.confirm\(code\.trim\(\)\)/);
    assert.match(src, /const token = await m\.auth\.getIdToken\(current\);\s*await m\.auth\.signOut\(auth\);/);
    assert.match(src, /satisfies WebApi/);
  });
  test('the APK build includes the Firebase plugins', { todo: 'Talent: needs its own Firebase project (docs/talent/PLAN.md §1)' }, () => {
    // the app plugin carries options since 2026-11-01 (iOS: disableSPM), so accept either form
    const has = (n: string) => appJson.plugins.some((p: unknown) => p === n || (Array.isArray(p) && p[0] === n));
    assert.ok(has('@react-native-firebase/app'));
    assert.ok(appJson.plugins.includes('@react-native-firebase/auth'));
    assert.equal(appJson.android.googleServicesFile, './google-services.json');
  });
  test('Firebase Android stays readable by React Native 0.85’s Kotlin 2.1 (APK 40 first build failed on BoM 35)', () => {
    // RNFB 27 = Firebase Android BoM 35 (firebase-auth 25, Kotlin 2.4 metadata) → "incompatible version of Kotlin".
    const pkg = JSON.parse(read('package.json'));
    assert.match(pkg.dependencies['@react-native-firebase/app'], /^~26\./);
    assert.match(pkg.dependencies['@react-native-firebase/auth'], /^~26\./);
    // …and the BoM is pinned to 34.12.0 (firebase-auth 24.0.1 / common 22.0.1, Kotlin ≤ 2.1).
    assert.ok(appJson.plugins.some((p: unknown) => Array.isArray(p) && p[0] === './plugins/withFirebaseAndroidBom' && p[1]?.bom === '34.12.0'));
    const plugin = read('plugins/withFirebaseAndroidBom.js');
    assert.match(plugin, /withProjectBuildGradle/);
    assert.match(plugin, /set\('react-native', \[\s*versions: \[\s*firebase: \[\s*bom: "\$\{bom\}",/);
    const rn = JSON.parse(read('node_modules/react-native/package.json')).version as string;
    assert.match(rn, /^0\.85\./, 'React Native moved: re-check its Kotlin version before changing the Firebase pin');
  });
});

describe('documents on phones', () => {
  const doc = read('src/core/document.ts');
  test('PDF or image from the system file picker, only when the APK has it', () => {
    assert.match(doc, /requireOptionalNativeModule\('ExpoDocumentPicker'\)\) picker = require\('expo-document-picker'\)/);
    assert.match(doc, /type: \['image\/\*', 'application\/pdf'\], copyToCacheDirectory: true/);
    assert.match(doc, /\/\/ Older APK: a photo\/scan of the document\.\s*const uri = await pickPhoto\(\);/);
  });
  test('uploads send bytes, not a Blob (a Blob from fetch() uploads 0 bytes on Android)', () => {
    assert.match(doc, /const bytes = await res\.arrayBuffer\(\);/);
    for (const f of ['src/data/repos.ts', 'src/data/orgVerification.ts']) {
      const s = read(f);
      assert.doesNotMatch(s, /from\('verification-docs'\)\.upload\(path, blob/, f);
      assert.match(s, /from\('verification-docs'\)\.upload\(path, file\.bytes/, f);
      assert.match(s, /file\.bytes\.byteLength === 0/, f);
    }
  });
});

describe('Android App Links', () => {
  const filters = appJson.android.intentFilters as Array<{ action: string; autoVerify: boolean; data: Array<{ scheme: string; host: string; pathPrefix: string }>; category: string[] }>;
  test('one auto-verified filter for app.sportnnote.in with exactly the share-link paths', () => {
    assert.equal(filters.length, 1);
    const [f] = filters;
    assert.equal(f.action, 'VIEW');
    assert.equal(f.autoVerify, true);
    assert.deepEqual([...f.category].sort(), ['BROWSABLE', 'DEFAULT']);
    assert.ok(f.data.every((d) => d.scheme === 'https' && d.host === 'app.sportnnote.in'));
    assert.deepEqual(f.data.map((d) => d.pathPrefix), [...APP_LINK_PATHS]);
  });
  test('every path is a screen the app’s link config knows', () => {
    const nav = read('src/navigation/RootNavigator.tsx');
    const linked = [...nav.matchAll(/: '([a-z-]+)(?:\/:[a-zA-Z]+\??)?'/g)].map((m) => m[1]);
    for (const p of APP_LINK_PATHS) {
      const first = p.replace(/^\//, '').replace(/\/$/, '');
      assert.ok(linked.includes(first), `${p} has a route`);
    }
  });
  test('the sign-in links and the home page stay in the browser', () => {
    for (const p of APP_LINK_PATHS) assert.notEqual(p, '/');
    assert.ok(!APP_LINK_PATHS.some((p) => /reset|auth|login|callback/.test(p)));
  });
  test('assetlinks.json names our package and the EAS signing key', () => {
    const [entry] = assetLinks() as Array<{ relation: string[]; target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] } }>;
    assert.deepEqual(entry.relation, ['delegate_permission/common.handle_all_urls']);
    assert.equal(entry.target.namespace, 'android_app');
    assert.equal(entry.target.package_name, ANDROID_PACKAGE);
    assert.equal(ANDROID_PACKAGE, appJson.android.package);
    for (const fp of ANDROID_CERT_SHA256) assert.match(fp, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });
  test('the website build publishes it under /.well-known/', () => {
    const build = read('scripts/build-website.mjs');
    assert.match(build, /await import\(join\(ROOT, 'src\/core\/androidAppLinks\.ts'\)\)/);
    assert.match(build, /writeFileSync\(join\(OUT, '\.well-known\/assetlinks\.json'\), JSON\.stringify\(appLinks\.assetLinks\(\)/);
  });
});

describe('nightly database backup', { skip: 'Talent: backup workflow removed until Talent has its own database (docs/talent/PLAN.md §1)' }, () => {
  const wf = read('.github/workflows/db-backup.yml');
  const runbook = read('docs/ops/backups.md');
  test('current, Node 24 actions on a pinned runner; a pasted secret is tidied and checked', () => {
    assert.match(wf, /runs-on: ubuntu-24\.04/);
    assert.match(wf, /supabase\/setup-cli@v3/);
    assert.match(wf, /actions\/upload-artifact@v7/);
    assert.match(wf, /DB_URL="\$\(printf '%s' "\$DB_URL" \| tr -d '\[:space:\]'\)"/);
    assert.match(wf, /still contains \[ \]/);
  });
  test('runs nightly and on demand, read-only on the repo', () => {
    assert.match(wf, /- cron: '30 20 \* \* \*'/);
    assert.match(wf, /workflow_dispatch:/);
    assert.match(wf, /permissions:\s*\n\s*contents: read/);
  });
  test('Supabase’s documented dump: roles, schema, data', () => {
    assert.match(wf, /supabase db dump --db-url "\$DB_URL" -f out\/roles\.sql --role-only/);
    assert.match(wf, /supabase db dump --db-url "\$DB_URL" -f out\/schema\.sql\n/);
    assert.match(wf, /-f out\/data\.sql --use-copy --data-only/);
  });
  test('refuses an empty dump and records what it took', () => {
    assert.match(wf, /test -s "out\/\$f\.sql"/);
    assert.match(wf, /data\.sql has no players rows/);
    assert.match(wf, /MANIFEST\.txt/);
  });
  test('only the encrypted file is kept, after proving it decrypts', () => {
    assert.match(wf, /openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -salt -pass env:PASSPHRASE/);
    assert.match(wf, /openssl enc -d [^\n]*\| cmp - "\$name\.tar\.gz"/);
    assert.match(wf, /rm -rf out "\$name\.tar\.gz"/);
    assert.match(wf, /path: \$\{\{ env\.NAME \}\}\.tar\.gz\.enc/);
    assert.doesNotMatch(wf, /path: out/);
  });
  test('secrets come from GitHub, never the file', () => {
    assert.match(wf, /DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
    assert.match(wf, /PASSPHRASE: \$\{\{ secrets\.BACKUP_PASSPHRASE \}\}/);
    assert.doesNotMatch(wf, /postgresql:\/\/postgres\.[a-z]+:[^<\[]/);
  });
  test('the runbook decrypts with the same settings', () => {
    assert.match(runbook, /openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -in /);
    assert.match(runbook, /SET session_replication_role = replica/);
    assert.ok(existsSync(join(root, '.github/workflows/db-backup.yml')));
  });
});

describe('web: background screen warm-up is gentle', () => {
  const s = read('src/navigation/lazyScreens.ts');
  const reg = read('src/sports/registry.ts');
  test('two screens at a time with a pause (EAS Hosting refuses ~100 files in a few seconds)', () => {
    assert.match(s, /export const WARM_AT_ONCE = 2;/);
    assert.match(s, /export const WARM_GAP_MS = 250;/);
    assert.match(s, /Array\.from\(\{ length: Math\.min\(WARM_AT_ONCE, loaders\.length\) \}, \(\) => worker\(\)\)/);
    assert.match(s, /await pause\(WARM_GAP_MS\);/);
  });
  test('the first refusal stops the warm-up (screens and sports load when opened)', () => {
    assert.match(s, /while \(!backedOff && next < loaders\.length\)/);
    assert.match(s, /catch \{ backedOff = true; \/\* retried on open \*\/ \}/);
    assert.match(s, /if \(!backedOff\) void prefetchSports\(WARM_GAP_MS\)/);
    assert.match(reg, /try \{ await loadSport\(id\); \} catch \{ return; \}/);
    assert.match(reg, /if \(gapMs > 0\) await new Promise<void>/);
  });
  test('no warm-up on data saver or 2G', () => {
    assert.match(s, /if \(lowData\(\)\) return;/);
    assert.match(s, /c\.saveData === true \|\| \/\(\^\|-\)2g\$\/\.test/);
  });
});

describe('web: Metro\'s "not downloaded yet" step is not a crash', () => {
  const src = read('src/core/telemetry.ts');
  const body = src.slice(src.indexOf('export function isUnknownModuleProbe'), src.indexOf('export function startTelemetry'));
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const probe = new Function(body.replace('export function isUnknownModuleProbe(e: unknown): boolean', 'return function(e)').replace('e instanceof Error', '(e instanceof Error)'))() as (e: unknown) => boolean;
  test('the exact Metro message is recognised; anything else still counts', () => {
    assert.equal(probe(new Error('Requiring unknown module "1026".')), true);
    assert.equal(probe(new Error('Requiring unknown module "989"')), true);
    assert.equal(probe(new Error('Loading module /_expo/static/js/web/index-abc.js failed.')), false);
    assert.equal(probe(new Error("Unexpected token '<'")), false);
    assert.equal(probe(new TypeError("Cannot read properties of undefined (reading 'footballPlugin')")), false);
  });
  test('only skipped on the web, and the previous handler still runs (so loading carries on)', () => {
    assert.match(src, /if \(!\(Platform\.OS === 'web' && isUnknownModuleProbe\(e\)\)\) reportError\(e, \{ fatal: !!fatal \}\);\s*previous\(e, fatal\);/);
  });
});

describe('sign-in emails: say what went wrong', () => {
  const src = read('src/core/auth.tsx');
  const body = src.slice(src.indexOf('export function friendlyAuthError'), src.indexOf('/** Is this error the'));
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const friendly = new Function(body.replace('export function friendlyAuthError(raw?: string): string', 'return function(raw)'))() as (m?: string) => string;
  test('Supabase failing to send the email (SMTP) is not "Something went wrong"', () => {
    assert.match(friendly('Error sending recovery email'), /couldn’t send the email just now/);
    assert.match(friendly('Error sending confirmation email'), /couldn’t send the email/);
  });
  test('asking again too soon says to wait', () => {
    assert.equal(friendly('For security purposes, you can only request this after 47 seconds.'), 'Please wait a minute before asking for another code.');
  });
  test('the existing messages are unchanged', () => {
    assert.equal(friendly('Invalid login credentials'), 'Wrong email or password. Try again, or reset your password.');
    assert.equal(friendly('Email rate limit exceeded'), 'Too many attempts. Please wait a minute and try again.');
    assert.equal(friendly(''), 'Something went wrong. Please try again.');
  });
});
