/**
 * Pin the Firebase Android BoM that React Native Firebase builds against
 * (its documented override: project.ext['react-native'].versions.firebase.bom
 * in android/build.gradle).
 *
 * Why: React Native 0.85 compiles Kotlin 2.1, which can't read libraries
 * compiled with Kotlin 2.3+. Firebase Android BoM 35.x (firebase-auth 25) is
 * Kotlin 2.4 and 34.13+ (firebase-auth 24.1+) is 2.3; BoM 34.12.0
 * (firebase-auth 24.0.1, firebase-common 22.0.1) is the newest that is Kotlin
 * 2.1 throughout. Revisit when the app moves to a React Native with a newer
 * Kotlin (tests/go-live-setup.test.mts keeps the reasoning honest).
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARK = '// @sportnnote firebase-bom';

module.exports = function withFirebaseAndroidBom(config, { bom } = {}) {
  if (!bom) throw new Error('withFirebaseAndroidBom: pass { bom: "34.12.0" }');
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withFirebaseAndroidBom: expected a Groovy android/build.gradle');
    if (!cfg.modResults.contents.includes(MARK)) {
      cfg.modResults.contents += `
${MARK}
project.ext {
  set('react-native', [
    versions: [
      firebase: [
        bom: "${bom}",
      ],
    ],
  ])
}
`;
    }
    return cfg;
  });
};
