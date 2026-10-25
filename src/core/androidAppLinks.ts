/**
 * Android App Links: a shared app.sportnnote.in link (a match, tournament,
 * certificate, invite …) opens straight in the installed app instead of the
 * browser. Two halves that must agree:
 *  - app.json `android.intentFilters` (autoVerify) lists these paths for the
 *    APK (a test keeps them equal to APP_LINK_PATHS);
 *  - https://app.sportnnote.in/.well-known/assetlinks.json says which signing
 *    key may open them. The website build writes it (scripts/build-website.mjs)
 *    and the sportnnote Worker serves it on the app host too
 *    (docs/international/go-live-checklist.md → App Links).
 * No imports: the website build loads this file with Node's type stripping.
 */

export const ANDROID_PACKAGE = 'in.sportnnote.app';

/** SHA-256 of the key that signs the APK (EAS keystore, APK 39 onwards). When
 *  the app goes on Google Play with Play App Signing, add Play's app-signing
 *  key from Play Console → Setup → App signing as a second entry. */
export const ANDROID_CERT_SHA256 = [
  'BA:A5:3A:E6:77:82:46:EA:D5:0C:56:4B:E7:1F:D1:F1:CE:BA:A5:3B:AC:BA:92:48:BD:5B:B3:E7:7F:96:7D:05',
] as const;

/** The public share-link paths the app handles (RootNavigator `linking`).
 *  Only these open the app — the rest of app.sportnnote.in (sign-in links,
 *  the home page) stays in the browser. */
export const APP_LINK_PATHS = [
  '/m/', '/t/', '/p/', '/g/', '/r/', '/c/', '/pp', '/h/', '/i/', '/get',
  '/join/', '/join-club/', '/join-tournament/', '/guardian-consent', '/org-confirm',
] as const;

export function assetLinks(): unknown[] {
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: [...ANDROID_CERT_SHA256] },
  }];
}
