// A stand-in for expo-notifications, holding the OS's pending alerts in memory.
// Registered as an alias in vitest.config.ts.
//
// It exists so `src/lib/reminders.ts` can be tested at all. That module is the
// one place in the app with genuinely concurrent logic — an in-flight guard, a
// cancel-then-reschedule window, and a snooze that has to survive both — and
// every failure in it is silent: a reminder that does not arrive, or one that
// arrives about a habit already done. Nothing on screen reports either.
//
// The scheduler is deliberately faithful about the one thing that matters: an
// id is only cancellable while it is pending, and cancelling one that is gone
// succeeds quietly, exactly as the real one does. That is what makes a stale id
// look like a successful cancel — which is the shape of two of the three bugs.

interface Pending {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, unknown>;
  /** Epoch milliseconds. */
  readonly fireAt: number;
}

let nextId = 1;
const pending = new Map<string, Pending>();

/** Every alert the OS is currently holding, in the order it was given them. */
export const inspect = {
  pending: (): Pending[] => [...pending.values()],
  ids: (): string[] => [...pending.keys()],
  reset: (): void => {
    pending.clear();
    nextId = 1;
    permission = { granted: true, canAskAgain: true };
    refuseNext = 0;
    release?.();
    gate = null;
    release = null;
    isBlocked = false;
    waiting = [];
  },
  /** Makes the next `n` schedule calls fail, as a full OS queue would. */
  refuse: (n: number): void => {
    refuseNext = n;
  },
  setPermission: (next: { granted: boolean; canAskAgain: boolean }): void => {
    permission = next;
  },
  /**
   * Freezes scheduling until `release` is called.
   *
   * The races worth testing all live in the window a sync holds open between
   * cancelling every alert and recording the new ones. Without a way to stop
   * time inside that window the interleaving is down to how many microtasks
   * each step happens to take, and a test that passes for that reason is not
   * evidence of anything.
   */
  hold: (): void => {
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  },
  release: (): void => {
    release?.();
    gate = null;
    release = null;
  },
  /**
   * Resolves once a sync has actually reached the frozen point.
   *
   * Waiting a microtask or two instead is guesswork: a sync reads the profile,
   * the habits and the completions before it schedules anything, so a test that
   * ticks a habit too early is testing a sync that could already see the tick —
   * which is the opposite of the race it means to set up.
   */
  blocked: (): Promise<void> =>
    isBlocked ? Promise.resolve() : new Promise<void>((resolve) => waiting.push(resolve)),
};

let gate: Promise<void> | null = null;
let release: (() => void) | null = null;
let isBlocked = false;
let waiting: (() => void)[] = [];

let permission = { granted: true, canAskAgain: true };
let refuseNext = 0;

export const AndroidImportance = { DEFAULT: 3, HIGH: 4, MAX: 5 } as const;
export const SchedulableTriggerInputTypes = { DATE: 'date' } as const;

export function setNotificationHandler(): void {
  // Nothing to do: the handler only matters for a delivered notification.
}

export async function setNotificationChannelAsync(): Promise<void> {}
export async function setNotificationCategoryAsync(): Promise<void> {}

export async function getPermissionsAsync(): Promise<typeof permission> {
  return permission;
}

export async function requestPermissionsAsync(): Promise<typeof permission> {
  if (!permission.canAskAgain) return permission;
  return permission;
}

export async function scheduleNotificationAsync(request: {
  content: { title: string; body: string; data: Record<string, unknown> };
  trigger: { date: Date };
}): Promise<string> {
  if (gate) {
    isBlocked = true;
    for (const resolve of waiting) resolve();
    waiting = [];
    await gate;
    isBlocked = false;
  }
  if (refuseNext > 0) {
    refuseNext -= 1;
    throw new Error('Scheduling refused');
  }
  const id = String(nextId++);
  pending.set(id, {
    id,
    title: request.content.title,
    body: request.content.body,
    data: request.content.data,
    fireAt: request.trigger.date.getTime(),
  });
  return id;
}

export async function cancelScheduledNotificationAsync(id: string): Promise<void> {
  // Succeeds whether or not the id is still pending — the real one does too,
  // which is precisely why a stale id reads as a cancel that worked.
  pending.delete(id);
}

export async function cancelAllScheduledNotificationsAsync(): Promise<void> {
  pending.clear();
}
