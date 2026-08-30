import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Vitest covers the pure logic in src/lib — migration planning, backup parsing,
// theme contrast. It deliberately does NOT render components: that needs a
// React Native renderer (jest-expo), which is a separate toolchain.
//
// The data layer is shaped to make this a real boundary rather than a cop-out:
// every decision (which migrations to run, whether a backup file is valid) is a
// pure function, and the SQLite calls around them are thin. The logic worth
// testing is testable in plain Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve('src'),
    },
  },
});
