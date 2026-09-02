// Component tests, which need a React Native renderer that Vitest cannot give.
//
// Two runners, split by file extension so neither can pick up the other's
// tests: Vitest takes `tests/**/*.test.ts` (the pure logic and the data layer,
// in plain Node, in under a second), Jest takes `tests/components/**/*.test.tsx`.
// The split is by capability, not preference — everything that *can* run under
// Vitest does, because it is an order of magnitude faster to run and to start.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/components/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // `setupFilesAfterEnv`, not `setupFiles`: the latter runs before the test
  // framework exists, so an `afterEach` registered there is never called and
  // each render piles on top of the last one's tree.
  setupFilesAfterEnv: ['<rootDir>/tests/components/setup.ts'],
  // No clearMocks: it wipes the implementations the setup file installs, so from
  // the second test onward the mocked module returns undefined.
  restoreMocks: true,
};
