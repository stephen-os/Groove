import { describe, expect, it } from 'vitest';
import { applyReleaseSigning, signingConfigOf } from '../../plugins/release-signing';

// Mirrors the structure of the build.gradle `expo prebuild` generates, including
// the two comment lines Expo puts between `release {` and its `signingConfig`.
// Those comments are load-bearing for this test: an earlier version of the
// plugin assumed the two lines were adjacent and failed against the real file.
const TEMPLATE_GRADLE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"

android {
    namespace 'com.example.app'

    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe('applyReleaseSigning', () => {
  const result = applyReleaseSigning(TEMPLATE_GRADLE);

  it('points the release build type at the release signing config', () => {
    expect(signingConfigOf(result, 'release')).toBe('release');
  });

  it('leaves the debug build type on the debug signing config', () => {
    // Regression guard for a bug that shipped a working-looking build.
    //
    // Adding the `release { ... }` block to signingConfigs BEFORE repointing the
    // build type makes the repoint regex match that new block instead, so it
    // rewrites the *debug* build type and leaves release on the debug key —
    // exactly inverted. Gradle accepts the result and the APK installs; the only
    // symptom is that a later update cannot be installed over it.
    expect(signingConfigOf(result, 'debug')).toBe('debug');
  });

  it('declares a release signing config that reads keystore.properties', () => {
    expect(result).toContain("storeFile file(keystoreProperties['storeFile'])");
    expect(result).toContain('def keystorePropertiesFile = rootProject.file("../keystore.properties")');
  });

  it('keeps the keystore itself out of the generated file', () => {
    // The whole point of the properties indirection: no password or path to a
    // key is ever written into a file that could be committed.
    expect(result).not.toMatch(/storePassword\s+'(?!android)/);
  });

  it('is idempotent, because prebuild runs repeatedly', () => {
    // A second application would add a duplicate signingConfig and fail the
    // Gradle sync.
    expect(applyReleaseSigning(result)).toBe(result);
  });
});

describe('applyReleaseSigning refuses to guess', () => {
  it('throws when there is no apply plugin line to anchor to', () => {
    expect(() => applyReleaseSigning('android {\n}\n')).toThrow(/apply plugin/);
  });

  it('throws when the release build type is not on the debug key', () => {
    // Either Expo changed the template or someone already edited it. Failing
    // loudly beats producing a release signed with an unknown key.
    const already = TEMPLATE_GRADLE.replace(
      'signingConfig signingConfigs.debug\n            minifyEnabled',
      'signingConfig signingConfigs.somethingElse\n            minifyEnabled'
    );
    expect(() => applyReleaseSigning(already)).toThrow(/release build type/);
  });

  it('throws when there is no signingConfigs block', () => {
    const noSigning = `apply plugin: "com.android.application"
android {
    buildTypes {
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`;
    expect(() => applyReleaseSigning(noSigning)).toThrow(/signingConfigs/);
  });
});

describe('signingConfigOf', () => {
  it('reads the build type, not the same-named signingConfigs block', () => {
    // `signingConfigs { release { ... } }` appears earlier in the file than
    // `buildTypes { release { ... } }`. A regex that is not anchored at
    // buildTypes reads the wrong one and reports success either way.
    const applied = applyReleaseSigning(TEMPLATE_GRADLE);
    expect(applied.indexOf('signingConfigs {')).toBeLessThan(applied.indexOf('buildTypes {'));
    expect(signingConfigOf(applied, 'release')).toBe('release');
  });

  it('returns null for a build type that declares no signing config', () => {
    expect(signingConfigOf(TEMPLATE_GRADLE, 'staging')).toBeNull();
  });
});
