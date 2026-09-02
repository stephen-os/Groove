// The pure half of the release-signing config plugin: a string-to-string
// transformation over android/app/build.gradle, with no Expo or file-system
// dependency, so it can be tested directly.
//
// It is split out because the failure this guards against is silent. Every way
// of getting the edit wrong still produces a build.gradle that Gradle accepts
// and an APK that installs — it only bites later, when the update refuses to
// install over the previous one. `expo prebuild` printing "Finished prebuild"
// proves nothing, so the behaviour is asserted in tests instead.

// Declares the properties file and loads it, if present.
const LOADER = `
// Injected by plugins/with-release-signing.js
def keystorePropertiesFile = rootProject.file("../keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
`;

// The release signing config. Guarded in Groovy so a prebuild done without a
// keystore still produces a valid build.gradle.
//
// `rootProject.file`, not the bare `file`: this block lands in android/app, so
// a plain `file('../release.keystore')` resolves against the *app module* and
// looks for android/release.keystore. Using rootProject makes it resolve from
// android/ instead, which is the same base the loader above uses for
// keystore.properties -- the two paths in the generated file then mean the same
// thing, and `../` reaches the repository root as the documentation says.
const RELEASE_SIGNING_CONFIG = `
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }`;

const MARKER = 'with-release-signing.js';

/**
 * Reads which signing config a build type uses.
 *
 * Anchored at `buildTypes {` so it inspects the build type and not the
 * same-named block inside `signingConfigs { ... }` higher up the file.
 */
function signingConfigOf(gradle, buildType) {
  const match = gradle.match(
    new RegExp(
      `buildTypes \\{[\\s\\S]*?${buildType} \\{[\\s\\S]*?signingConfig signingConfigs\\.(\\w+)`
    )
  );
  return match ? match[1] : null;
}

/**
 * Adds a release signing config to a Groovy build.gradle and points the release
 * build type at it.
 *
 * Idempotent: returns the input unchanged if it has already been applied.
 * Throws if the file doesn't have the structure it expects, or if the result
 * fails its own post-conditions.
 */
function applyReleaseSigning(contents) {
  if (contents.includes(MARKER)) return contents;

  // 1. Declare and load keystore.properties.
  const withLoader = contents.replace(/^apply plugin: /m, `${LOADER}\napply plugin: `);
  if (withLoader === contents) {
    throw new Error('with-release-signing: could not find an "apply plugin:" line to anchor to.');
  }

  // 2. Repoint the release build type BEFORE adding anything to signingConfigs.
  //    Order matters: the block added in step 3 is also called `release {`, so
  //    doing this second matches that insertion instead — which rewrites the
  //    *debug* build type and leaves release on the debug key. Anchoring at
  //    `buildTypes {` is the second guard against the same mistake.
  const releaseBuildType = /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseBuildType.test(withLoader)) {
    throw new Error(
      'with-release-signing: could not find the release build type pointing at signingConfigs.debug.'
    );
  }
  const withRepointedBuildType = withLoader.replace(
    releaseBuildType,
    (_match, prefix) => `${prefix}signingConfig signingConfigs.release`
  );

  // 3. Add the release signing config.
  const signingAnchor = /signingConfigs \{/;
  if (!signingAnchor.test(withRepointedBuildType)) {
    throw new Error('with-release-signing: could not find the signingConfigs block.');
  }
  const result = withRepointedBuildType.replace(
    signingAnchor,
    `signingConfigs {${RELEASE_SIGNING_CONFIG}`
  );

  // 4. Assert the outcome, not just that the edits ran.
  const releaseUses = signingConfigOf(result, 'release');
  const debugUses = signingConfigOf(result, 'debug');
  if (releaseUses !== 'release') {
    throw new Error(
      `with-release-signing: release build type ended up using signingConfigs.${releaseUses}, expected release.`
    );
  }
  if (debugUses !== 'debug') {
    throw new Error(
      `with-release-signing: debug build type ended up using signingConfigs.${debugUses}, expected debug. The release block was matched in the wrong place.`
    );
  }

  return result;
}

module.exports = { applyReleaseSigning, signingConfigOf };
