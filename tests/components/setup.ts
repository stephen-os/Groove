import { cleanup } from '@testing-library/react-native';

// The database and the notification service are not what a component test is
// about, and dragging either in would make every render depend on a working
// native module. The screens that genuinely need them are covered by the Vitest
// suites against real SQLite; these tests are about what a component renders and
// what it announces.
jest.mock('@/lib/db/settings', () => ({
  getSetting: jest.fn().mockResolvedValue(null),
  setSetting: jest.fn().mockResolvedValue(undefined),
}));

// Explicit, rather than relying on the library registering its own. Without a
// teardown between tests the previous tree is still mounted and every query
// answers from it — which shows up as the fifth test onwards failing to find
// something the first four found, and reads like a broken query rather than a
// missing cleanup.
afterEach(cleanup);
