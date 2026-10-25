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
  test('the APK build includes the Firebase plugins', () => {
    assert.ok(appJson.plugins.includes('@react-native-firebase/app'));
    assert.ok(appJson.plugins.includes('@react-native-firebase/auth'));
    assert.equal(appJson.android.googleServicesFile, './google-services.json');
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

describe('nightly database backup', () => {
  const wf = read('.github/workflows/db-backup.yml');
  const runbook = read('docs/ops/backups.md');
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
