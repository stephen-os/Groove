import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Vitest covers the pure logic in src/lib — schedule, stats, backup parsing,
// theme contrast — and, through the expo-sqlite alias below, the data layer as
// well. It deliberately does NOT render components: that needs a React Native
// renderer (jest-expo), which is a separate toolchain.
//
// `expo-sqlite` is aliased to a node:sqlite adapter so `src/lib/db` runs its
// real SQL against a real database here. The decisions above it are still pure
// functions; this reaches the layer underneath them, which was otherwise
// unreachable from the verify loop and is where the cascade bug hid. See
// tests/support/expo-sqlite.ts for the one fidelity detail that matters.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],

    // A map, deliberately not a gate. There is no threshold here because a
    // threshold is a number people make go up, and the cheapest way to do that
    // is a test that executes a line without asserting anything about it. What
    // this is for is the other question — which parts of the app no test has
    // ever run — and the answer to that used to be the whole of src/lib/db and
    // reminders.ts, which is precisely where the worst bugs were living.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**'],
      // Components need a renderer; they are covered by the jest-expo suite.
      exclude: ['src/lib/notifications.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve('src'),
      'expo-sqlite': path.resolve('tests/support/expo-sqlite.ts'),
      'expo-file-system': path.resolve('tests/support/expo-file-system.ts'),
      'expo-notifications': path.resolve('tests/support/expo-notifications.ts'),
      'react-native': path.resolve('tests/support/react-native.ts'),
      'expo-sharing': path.resolve('tests/support/expo-sharing.ts'),
    },
  },
});
