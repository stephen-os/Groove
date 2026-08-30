// Types for the plain-CommonJS build tooling in release-signing.js, so the
// Vitest suite that exercises it is type-checked like the rest of the project.

/**
 * Adds a release signing config to a Groovy `build.gradle` and points the
 * release build type at it. Idempotent. Throws if the file doesn't have the
 * expected structure or the result fails its post-conditions.
 */
export function applyReleaseSigning(contents: string): string;

/** Which signing config a given build type uses, or null if it declares none. */
export function signingConfigOf(gradle: string, buildType: string): string | null;
